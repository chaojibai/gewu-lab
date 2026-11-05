# 01 · 单文件管线与引擎契约

## 1. 一次构建的全貌

```
build/lessons3d/<slug>.js      你的课件（唯一要写的文件）
build/kit3d.js                 引擎（Lab 框架 + K.* 库）
build/_page.html               页面骨架（面板/步骤条/画布）
build/style.css  build/sim.js  样式与交互层
build/vendor/three.min.js      three r147 UMD（必须 UMD，r160+ 无 UMD 就无法内联）
        │
        │  python build/build_chem.py <slug>
        ▼
courses/<slug>.html            单文件交付物（≈700 KB 基线 + 你的代码）
```

构建器不做任何"理解"，只做三件事：读 `META[slug]`、注入 lesson JS、内联 three。所以**几何错、材质错、报错都发生在你的 lesson 里**，不要怀疑构建器。

## 2. 先注册 slug

`build/build_chem.py` 有两处要加：

```python
META = {
  ...
  'engine4-step': dict(
      title='直列四缸四冲程汽油机 · 组件示意',
      chip='职业教育 · 汽车发动机 · 曲柄连杆 + 配气机构',
      steps=6,                       # 必须与 lesson 里 steps 数组等长
      q='四个气缸为什么按 1-3-4-2 顺序、每隔 180° 依次点火？',   # 目录页展示的问题
      tb='职业教育 · 汽车运用与维修 · 发动机构造与原理',          # 教材定位
      postfx=True,                   # 开 SSAO+Bloom+ACES（金属/玻璃必备）
      catalog=False),                # 职教课件不进化学目录
}
ORDER = [..., 'engine4-step']        # 顺序即在目录里的顺序
ART = {..., 'engine4-step': 'engine'}  # 目录卡片配图键
```

`catalog=False` 很重要：否则职教课会被塞进化学目录，标成"化学·探究实验"。

## 3. `K.boot` 字段全表

```js
var T = window.THREE, K = window.Lab;

K.boot({
  /* ── 外壳 ── */
  title: '直列四缸四冲程汽油机 · 组件示意',   // 页面标题（+ ' · 格物实验室'）
  chip:  '职业教育 · 汽车发动机 · …',        // 左上角身份条
  hint:  '拖空白处旋转 · 滚轮缩放 · 悬停零件看名称 · ←/→ 换步',

  /* ── 状态 ── */
  state: { theta: 0, spin: 1, speed: 1, explPct: 0, t: 0 },
  // 约定：*T 结尾的键由引擎写入补间目标值（面板读数要读 *T，别读中间值）

  /* ── 场景 ── */
  scene: {
    setup: function () {        // 只做静态初始化（建几何、摆位置、加灯）
      var G = K.world();        // ← 可拾取根节点：K.tag / 拾取只认 world.children
      K.envShop();
      ...
    },
    update: function (dt, s) {  // 每帧：推进状态、改 transform、缓动量
      s.t += dt;
      ...
    }
  },

  /* ── 相机 ── */
  cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .58, pitch: .32 },
  // tx/ty/tz = 看向的点（不是相机位置）。想让模型在画面里偏左，就把 tx 调大。

  /* ── 读数 ── */
  reads: [['ang', '曲轴转角'], ['c1', '1 缸'], ...],
  values: function (s) { return { ang: deg.toFixed(0) + '°', c1: strokeOf(...) }; },

  /* ── 步骤 ── */
  steps: [{
    name: '整机总览',
    cam: { ... },                        // 本步机位（引擎 tween 过去）
    title: '一台直列四缸发动机，由哪些部分组成？',
    ask: '四个气缸为什么不是同时点火？',   // 目录/步骤条的引导问题
    body: '<p>…</p>',                     // 右侧面板 HTML
    apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'all'; },
    controls: [
      { type: 'btn',   label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin ? 0 : 1; } },
      { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' },
      { type: 'range', key: 'setAng', min: 0, max: 720, step: 2, label: '曲轴转角（°）',
        onChange: function (s) { s.theta = s.setAng * Math.PI / 180; s.spin = 0; } }
    ],
    quiz: true                            // 可选：本步末尾出题
  }, ...],

  quiz: function (s) { return bank[Math.floor(Math.random() * bank.length)]; }
});
```

### 状态补间的坑

`goStep()` 会比对 `apply()` 前后的数值，跳变 >12% 的键自动生成 0.55s 补间，并把目标值写进 `s[key + 'T']`。

- 面板读数一律读 `*T`，否则会显示补间中间值（"显示 92.4 而目标 94"）。
- 滑块的值来自 `s[key]`，如果你只改了补间目标，滑块会停在上一步的旧值 → 变成"滑块 0 但模型在 600°"的错位。
  解法：滑块控制的量**同时**写死初值（例：`s.theta = 0; s.setAng = 0;`），别让它跟补间打架。

## 4. `K.*` API 速查（本线常用）

| 分类 | API | 说明 |
|---|---|---|
| 框架 | `K.boot(cfg)` / `K.world()` / `K.scene()` / `K.T()` / `K.M()` | M = 引擎材质表 |
| 环境 | `K.envShop({groundY})` / `K.envRoom()` | **职教一律 envShop**，envRoom 是实验室 |
| 基本体 | `K.box({x,y,z,sx,sy,sz,mat})` / `K.rbox(o)` / `K.cyl({x,z,y0,rt,rb,r,h,seg,mat})` / `K.sphere({r,x,y,z,mat})` | `cyl` 的 `y0` 是底面高度，省去算中心 |
| 倒角盒 | `K.geoRoundBox(w,h,d,r,seg)` | 真圆角（顶点推到内嵌球面），铸件必备 |
| 接触阴影 | `K.blob({x,z,r,y})` | 设备/器材脚下的软阴影，没有它物件像"贴"在上面 |
| 标注 | `K.spriteLabel(pos, text, {w, fs, onTop})` | `onTop:true` → 不参与深度测试，实心墙切不掉文字 |
| 拾取 | `K.tag(obj, name, desc)` | 设 `userData.tag`；拾取只遍历 `world.children` |
| 过渡 | `K.fadeShow(obj, on, dt)` / `K.ez(state, key, dt, speed)` | 逐帧缓动，替代 `visible = bool` |
| 工具 | `K.clamp` / `K.lerp` / `K.rnd` | |

## 5. 一定要自己写的三个小工具

```js
/* 倒角盒：铸件/钣金件 90% 都是它 */
function RM(w, h, d, r, mat) { return new T.Mesh(K.geoRoundBox(w, h, d, r == null ? .18 : r, 3), mat); }

/* 螺旋弹簧：TubeGeometry + 螺旋线（气门弹簧、减震弹簧） */
function helixGeo(r, tubeR, h, turns, seg) {
  var pts = [], n = seg || 72;
  for (var i = 0; i <= n; i++) {
    var t = i / n, a = turns * Math.PI * 2 * t;
    pts.push(new T.Vector3(Math.cos(a) * r, h * t, Math.sin(a) * r));
  }
  return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, tubeR, 6, false);
}

/* 带孔的板：ExtrudeGeometry + Path.absarc 挖孔（缸盖底板、法兰、隔板） */
function plateGeo(w, d, thk, holes) {
  var s = new T.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
  (holes || []).forEach(function (h) {           // h = [x, y, r]
    var p = new T.Path(); p.absarc(h[0], h[1], h[2], 0, Math.PI * 2, true); s.holes.push(p);
  });
  var geo = new T.ExtrudeGeometry(s, { depth: thk, bevelEnabled: false, curveSegments: 20 });
  geo.rotateX(-Math.PI / 2);          // XY 平面 → 水平面
  geo.translate(0, -thk, 0);          // 让 position.y 表示板顶
  return geo;
}
```

`plateGeo` 是剖切建模范式里最值钱的工具：缸盖底板、缸体隔板、法兰、带孔盖板全靠它。

## 6. 构建与自检命令

```bash
# 构建（工作区路径：带 postfx 后处理）
python build/build_chem.py engine4-step

# 构建（通用路径：只有 assets 时用，无后处理）
python scripts/inline_build.py \
  --template assets/page.html --three assets/vendor/three.min.js \
  --engine assets/kit3d.js --lesson build/lessons3d/engine4-step.js \
  --sim assets/sim.js --out courses/engine4-step.html \
  --title "直列四缸四冲程汽油机" --chip "职业教育 · 发动机"

# 验证
node build/shot-page.js courses/engine4-step.html engine4 1800   # 逐步骤截图 + 报错
node build/check-quick.js courses/engine4-step.html              # 九步遍历，抓 pageerror
node build/wc-views.js courses/engine4-step.html engine4 0       # 七机位（近景/俯视/侧视）
```

两条构建路径的差别只有后处理：`build_chem.py` 按 META 的 `postfx=True` 注入 SSAO/Bloom/ACES；
`inline_build.py` 不注入（`kit3d.js` 的 `setupPostfx()` 有 `if (!T.EffectComposer) return;` 兜底，不会报错，只是画面更平）。
交付前请用**工作区路径**构建，截图与调色都以它为准。

> 后处理（SSAO/Bloom/ACES）的文件取自 `node_modules/three/examples/js`。**新机器先 `npm i three@0.147.0`**，
> 否则 `build_chem.py` 会静默跳过 postfx（`POSTFX=''`）——不报错，但画面明显偏平，别以为是材质没调好。
> `assets/vendor/` 里只有 three 本体（UMD），不含 addons。

截图脚本必须带 `channel: 'chrome'` 与 `--use-angle=d3d11`。SwiftShader 软渲染下 PMREM 环境贴图出不来，金属全发灰——**你会据此把好材质改坏**。

## 7. 资产来源与轻量工具链（不下载大部头）

职教设备的**默认路线是程序化精模**（本文件 §4–§6 的写法），只在必要处引入外部资产。
硬约束：**不装 Blender / Fusion 360 / SolidWorks / Rhino / Substance / ZBrush**。

| 环节 | 方案 | 说明 |
|---|---|---|
| 主建模（规则设备） | 程序化几何：`Extrude` + 倒角 + 旋转 + 拉伸 | 管道/阀门/电机/齿轮/仪表/换热器/铸件最精确，零体积膨胀，风格统一 |
| 参数化辅助 | OpenSCAD / SolveSpace / CadQuery（开源，数 MB 级） | 脚本化精确建模，导出 glTF 再转 .glb，避免手雕 |
| 现成资产 | 开源 CC0 / Apache（TRLC-DK1 URDF 机械臂、Kenney、ambientCG PBR 纹理） | 只取带明确许可的，并登记来源 |
| PBR 材质 | 程序化 PBR（canvas 噪声生成 metalness/roughness/normal）+ CC0 纹理 | 不装 Substance |
| 减面/压缩 | `gltf-transform`：`weld → simplify --ratio 0.2 --error 0.01 → quantize --quantize-position` | 已验证 9.4MB→3.1MB、19s→1.5s |
| 单文件内嵌 | base64 → `atob` → `Uint8Array.buffer` → `loader.parse()` | **禁用 `loader.load("data:")`**，预览宿主 CSP 会拦 |
| 压缩扩展 | Draco（几何）+ KTX2（纹理） | 控体积与首屏 |

**能力边界（诚实）**：程序化精模 + 轻量开源资产能覆盖绝大多数规则设备，达到高精度工程还原 + 扎实 PBR；
强有机曲面、影视级照片资产做不到，真需要时再评估轻量工具，仍优先开源。
