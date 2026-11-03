# 外部模型资产进单文件课件：减面、内嵌与安全加载

当课件需要"像真器材/真设备"而程序化几何不够用时，把分件 GLB 模型嵌入单文件离线 HTML。
本文是本项目实测跑通的工程路线；机器人机构专属的装配、IK、抓放细节见子技能 `robot-glb-sim/`。

## 一、素材要求

- **分件网格**：每个可动/可拆部件一个文件，才能按部件驱动动画、按需替换。
- **带结构描述文件**（URDF / 场景图 JSON）：关节原点、轴向、限位直接从描述抄，
  它们是精确事实，不目测调参。
- 下载偶发 0 字节文件，入库前必须校验大小与可解析性（GLTFLoader 试解析一遍）。

## 二、减面与量化：体积是单文件的第一约束

入库前一律过三步（工具为 @gltf-transform/cli，本地命令行调用）：

```bash
npx @gltf-transform/cli weld in.glb _w.glb
npx @gltf-transform/cli simplify _w.glb _s.glb --ratio 0.2 --error 0.01
npx @gltf-transform/cli quantize _s.glb out.glb    # 参数是 --quantize-position 家族，不是 --positions
```

本项目实测（9 件工业 CAD 网格）：**9.4MB → 3.1MB，减面 80% 肉眼无损；
整页 13.4MB → 4.97MB，真 GPU 加载 19s → 1.7s**。

体积预算参考：单文件课件（含 three 内联）控制在 **≤5MB、加载 ≤2s**；
超标先查未减面模型，再查重复内联。

## 三、内嵌与加载：整批消失的静默坑

构建脚本侧只注入纯 base64 字符串表：

```js
window.__GLB = { "part_name": "<base64...>", /* ... */ };
```

页面侧不要走 `loader.load("data:...")`——GLTFLoader 内部用 `fetch` 读取该 URI，
宿主内置预览的 CSP（`connect-src 'self'`）会拦下 `fetch(data:)`，
症状是**全部模型静默消失、控制台一个报错都没有**。改为零 fetch 的内存解析：

```js
const bin = atob(b64), bytes = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
loader.parse(bytes.buffer, '', gltf => {
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      (Array.isArray(o.material) ? o.material : [o.material])
        .forEach(m => { if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.65; });
    }
  });
}, err => console.error('glb parse fail', err));
```

回归方法：Playwright `page.route` 给页面注入同款 CSP 响应头再加载，模型仍应出现。

## 四、加载期必须有进度反馈

逐件更新进度文案（"解析模型 3/9 …"），全部就绪后隐藏。每件解析包一层
`setTimeout(..., 16)` 让文案先绘制一帧，否则死灰屏会被当成卡死。

## 五、多阶段过程：状态机，不是关键帧

抓放、装配、多步演示共用同一骨架——**谓词推进，不按固定时长**：

```js
const steps = [
  { run: () => open(),      until: () => opened,     max: 2 },  // 动作 + 完成谓词 + 超时兜底
  { run: () => approach(p), until: () => near(p,.4), max: 5 },
  // ...
];
// 每帧：本阶段未执行过则执行 run；elapsed 超过 0.6s 且 until() 为真，或超过 max，
// 才进入下一阶段。最短停留 0.6s 防"起点即满足"的跳步。
```

三条军规（都是实测踩出来的）：

1. **状态快照**：阶段开始的瞬间把要用到的位置存下来，后续阶段只读快照——
   引用会动的实时坐标会形成循环依赖。
2. **完成才推进**，`max` 只是兜底；靠时长推进必然出现"还没到位就走"。
3. **摆位先验可达**：目标点必须在机构可达范围内（如 J1 转角锥体内），
   超范围时解算器只会"原地收敛到大误差"，表现为末端悬空。

## 六、验证：外观回归之外加行为回归

多机位截图证明"看起来对"，行为回归证明"算得对、动得对"：页面暴露调试钩子
（如 `__tip()` / `__held()` / `__crate()`），Playwright 读数值做断言，
配合硬件 GPU（`channel:'chrome'` + `--use-angle=d3d11`，见 SKILL.md §6.0）。
通用模板：`scripts/behavior_probe.js`，改探针数组即用。
