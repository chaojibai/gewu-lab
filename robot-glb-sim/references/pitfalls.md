# 硬坑详解与代码骨架

全部来自真实项目（TRLC-DK1 六轴臂 + Three.js r147 UMD）的踩坑实录，按"现象 → 原因 → 修法"组织。

## 1. URDF 装配骨架

URDF（z-up、米制）→ three（y-up）。每个关节一个 Group，child link 的 glb 直接挂进该 Group
（URDF 里 child link 坐标系 = 关节坐标系，网格天生对位，无需额外偏移）。

```js
const robotRoot = new THREE.Group();
robotRoot.rotation.x = -Math.PI / 2;      // z-up -> y-up
robotRoot.scale.set(S, S, S);             // S=5: 米 -> 场景单位
scene.add(robotRoot);

const CHAIN = [   // 直接从 URDF 抄：<joint><origin xyz/><axis/>
  { link:'base_link', parent:null,        origin:[0,0,0],                axis:null },
  { link:'link1-2',   parent:'base_link', origin:[0,0,0.0615],           axis:'z', sign: 1 },
  { link:'link2-3',   parent:'link1-2',   origin:[0.02,0,0.0385],        axis:'y', sign: 1 },
  { link:'link3-4',   parent:'link2-3',   origin:[-0.264,0,0],           axis:'y', sign:-1 }, // (0,-1,0)!
  { link:'link4-5',   parent:'link3-4',   origin:[0.244004,0,0.059971],  axis:'y', sign:-1 },
  { link:'link5-6',   parent:'link4-5',   origin:[0.061868,0,0.0425],    axis:'z', sign:-1 }, // (0,0,-1)!
  { link:'link6-7',   parent:'link5-6',   origin:[0.032,0,-0.0425],      axis:'x', sign: 1 },
];
const linkG = {};
CHAIN.forEach(c => {
  const g = new THREE.Group();
  g.position.set(...c.origin);
  (c.parent ? linkG[c.parent] : robotRoot).add(g);
  linkG[c.link] = g;
  g.add(MESH[c.link]);                    // GLTFLoader.parse 出来的 gltf.scene
});
// 负轴处理：rotation[axis] = sign * physicalAngle
function applyJoint(j, ang) { const o = j.obj;
  if (j.axis==='z') o.rotation.z = j.sign*ang;
  else if (j.axis==='y') o.rotation.y = j.sign*ang;
  else if (j.axis==='x') o.rotation.x = j.sign*ang; }
// prismatic 夹爪：双指各挂一个 Group，position.y = ±fv（URDF 的 prismatic limit 直接给行程）
// TCP：tcp = new THREE.Object3D(); tcp.position.set(0.158,0,0); linkG['link6-7'].add(tcp);
```

真实臂的"零位"不等于"伸直位"。别用零位算连杆长度——**连杆长度 = 相邻两关节原点距离**，与关节角无关。

## 2. 数值 IK（解析解对真实限位基本不可用）

真实臂限位奇形怪状（如 J3 ∈ [0, 4.71] 禁止负角），解析 2 连杆的肘上/肘下解经常整个落禁区。
数值解 + 多起点 + 正则，稳：

```js
const AXES = [ /* 同 CHAIN，仅可动关节：{t:[关节原点], r:[单位轴]} × 5 */ ];
function fkTCP(a, off=0.158) {           // 纯矩阵 FK，不碰场景图
  _fkM.identity();
  for (let i=0;i<5;i++){ _fkT.makeTranslation(...AXES[i].t);
    _fkR.makeRotationAxis(_fkV.set(...AXES[i].r), a[i]);
    _fkM.multiply(_fkT).multiply(_fkR); }
  return new THREE.Vector3(off,0,0).applyMatrix4(_fkM);
}
function solveIK(lt, seed) {             // lt: robotRoot 局部坐标（米、z-up）
  const cur = joints.map(j=>j.target);
  const clampA = a => a.map((v,i)=>Math.min(JLIM[i][1],Math.max(JLIM[i][0],v)));
  const cost = a => {
    const p = fkTCP(a);
    const d2 = (p.x-lt.x)**2 + (p.y-lt.y)**2 + (p.z-lt.z)**2;
    let reg=0; for(let i=0;i<5;i++) reg += (a[i]-cur[i])**2;
    return d2 + 0.008*reg;               // 正则让运动连续、姿态偏好权重必须≤0.01(坑4)
  };
  const starts = [clampA(seed.slice(0,5)), /* 3-4 个手工散布起点 */];
  let best=null, bd=Infinity;
  for (const s0 of starts) {
    let a=s0.slice(), f=cost(a), step=0.4;
    for (let it=0; it<80 && step>0.003; it++) {
      let ok=false;
      for (let i=0;i<5;i++) for (const d of [step,-step]) {
        const t=a.slice(); t[i]+=d; clampA(t);
        const c=cost(t); if (c<f-1e-9){f=c;a=t;ok=true;}
      }
      if (!ok) step*=0.5;
    }
    if (f<bd){bd=f;best=a;}
  }
  return { angles:best, err: fkTCP(best).distanceTo(lt) };
}
// 世界目标转局部：robotRoot.worldToLocal(p.clone())
```

**坑 4 实录**：加"工具朝下"偏好 `0.1*(dirz+1)^2` 后，8cm 定位误差的成本(0.0064) 远小于偏好项
(最高0.4)，解算器宁可偏 20cm 也要垂直。任何姿态项权重必须 ≤0.01，或干脆删掉改用
"放置目标 = P + (tip−crate) 补偿"（见第 4 节）。

## 3. CSP 安全加载（坑 1，最隐蔽）

**现象**：内置预览里机器人整个消失，控制台一片 `Refused to connect ... Content-Security-Policy`。
**原因**：宿主预览 CSP `connect-src 'self'` 拦截 `fetch("data:...")`，GLTFLoader.load(data:URI) 内部走 fetch。
**修法**：零 fetch，内存解析：

```js
const bin = atob(b64), bytes = new Uint8Array(bin.length);
for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
loader.parse(bytes.buffer, '', gltf => { /* traverse 设置 shadow/envMapIntensity */ },
             err => console.error('parse fail', err));
```

构建脚本侧只注入纯 base64 字符串表 `window.__GLB = { name: "<b64>" }`。
复现/回归：Playwright `page.route` 注入同款 CSP 响应头再加载页面。

## 4. 抓取-放置：入座 / 落座 / 摆正（坑 5）

- **入座（抓取瞬间）**：把物体放到夹爪内固定局部坐标，之后 `localToWorld` 刚性跟随。
  千万不要 parent 挂载（robotRoot 缩放会把物体放大 S 倍），也不要用"TCP+偏移"世界跟随（随腕乱甩）。
  **夹住后绝不能再拿物体的世界坐标当下一步 IK 的参考**——它在跟着臂动，循环引用。
```js
heldLocal.set(0.165,0,0);                       // 指间座位（米，link6-7 系）
crate.position.copy(link6_7.localToWorld(tmp.copy(heldLocal)));
crate.quaternion.copy(link6_7.getWorldQuaternion(q));
```
- **落座（松爪瞬间）**：物体若在台面正上方 0.4 内，直接吸附到 `台面顶 + 物体半高`，
  杜绝下沉/悬空。水平落点靠"放置目标 = P + (tip−crate) 补偿工具朝向"保证。
- **摆正**：放置后姿态只保留 yaw 并吸附最近 90°，0.2s slerp 过渡：
```js
const e = new THREE.Euler().setFromQuaternion(crate.quaternion,'YXZ');
const yaw = Math.round(e.y/(Math.PI*0.5))*(Math.PI*0.5);
settleQ.setFromEuler(new THREE.Euler(0,yaw,0));   // animate 里 slerpQuaternions 过渡
```

## 5. 抓放自动演示 = 状态机，不是关键帧插值

9 阶段：张开→接近(上方)→下降→夹→提升→移位(上方)→下降放置→松爪→回位，循环。
**每阶段 until() 谓词到位才前进**（末端距目标 < 阈值 / held / !held），max 超时兜底，
另加 0.6s 最短停留防"起点即满足"的跳步。夹取瞬间记录 resting 位置（demoPick）和目的台
（demoDest），后续阶段只用这两个快照，不用实时物体坐标。

## 6. 工作空间与台面摆位（坑 3）

J1 限位 ±120° → **所有台面/目标点的方位角必须在锥体内**。摆位前先算：
`az = atan2(-worldZ/S, worldX/S)`，|az| ≤ J1max − 15° 余量。曾把 B 台放正后方（az≈180°），
解算器永远大误差收敛 → 末端悬空 0.5 → 高空松爪。

## 7. 体积与加载

```bash
npx @gltf-transform/cli weld in.glb _w.glb
npx @gltf-transform/cli simplify _w.glb _s.glb --ratio 0.2 --error 0.01
npx @gltf-transform/cli quantize _s.glb out.glb        # 注意参数是 --quantize-position
```
9.4MB→3.1MB（HTML 13.4MB→4.97MB），真实 GPU 加载 19s→1.5s，减面 80% 肉眼无损。
另：加载期逐件更新进度文案（"解析 CAD 模型 3/9 …"），避免死灰屏。

## 8. SSAO 假墙（坑 2）

SSAOPass 在大面积浅色平面（地面/墙）留**方块状暗斑**，疑似"多了一块板"。
排查法：traverse 全场景枚举 mesh 世界包围盒（按最大边排序）——场景里没有对应几何体即伪影。
修法：直接移除 SSAOPass（RenderPass+Bloom+ACES 保留），接地感由径向渐变 blob 阴影负责。
