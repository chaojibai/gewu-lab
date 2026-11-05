---
name: vocational-3d
description: 职业教育设备 3D 课件线（独立技能）。把真实设备——发动机、变速箱、机床、夹具、产线、检测仪器——做成可拆解、可交互、参数驱动的单文件离线 three.js 课件。当需求出现"实训 / 工种 / 设备还原 / 拆装 / 装配关系 / 剖切 / 精模 / 工业仿真 / PBR / 零部件认知"时使用。内含程序化精模规范、整机剖切建模法、机构运动学（曲柄连杆/凸轮/相位）、实训车间场景 K.envShop、性能与验证红线、本线专属坑表。
agent_created: true
---

# vocational-3d — 职业教育设备 3D 课件

这条线只做一件事：**把一台真实设备讲清楚**。学生要能从这台模型上认出零件、看懂装配、看懂运动、敢动手拆。

它不是"好看的动画"。判断标准只有三条：

1. **拆得开**：零件能分离，分离后能看出谁套谁、谁压谁、靠什么密封/定位。
2. **动得对**：运动由几何约束算出来（曲柄连杆、凸轮相位、齿轮比），不是摆时间线。
3. **站得住**：设备在实训车间/工位上，有地面、有台架、有尺度参照——不是飘在化学实验室的桌子上。

## 0. 先分流：这条线还是素养线

| 需求里出现 | 走哪条 |
|---|---|
| 实训、工种、设备、拆装、装配、剖切、精模、工业、产线、PBR、真实还原 | **本技能** |
| 初中/小学、科普、自然、水循环、分子运动、示意、low-poly | 主技能 `threejs-lab-courseware` |

两条线共用同一个引擎（`assets/kit3d.js`）和同一套验证脚本（`scripts/`），但**美术基准、场景模板、交付标准完全不同**。不要混用：素养线的 `K.envRoom()`（实验室：白墙+黑板+试剂窗）对本线是错误身份。

## 1. 五步流水线（顺序不能换）

```
① 定场景 ──→ ② 建装配体 ──→ ③ 通机构 ──→ ④ 做交互 ──→ ⑤ 验证
 K.envShop    剖切 + 分件     运动学约束     拆装/标注     截图+探针
```

### ① 定场景（先给设备一个"家"）

第一件事不是画齿轮，是**定工位**：地面高度、台架/翻转架、周边物（工具柜、油桶、管线）。

```js
K.envShop({ groundY: -15.5 });     // 实训车间：水泥地坪+工位黄线+压型钢板墙+卷帘门+工具柜+厂房顶灯
```

- 台架脚垫必须落在地坪上，设备必须落在台架上。
- **相机俯角 ≥ .30 rad**，否则台面会把整条地面裁掉，车间感当场消失。
- 详见 `references/02-shop-scene.md`。

### ② 建装配体（剖切建模法，本技能的核心）

一台设备 = 若干**分件**，每件独立成组、可单独移动、可 `K.tag()` 命名。整机展示一律**剖切**：

- 侧壁/后壁做**实心铸件**，只把朝向默认机位的那一面剖开（不是全透明壳）。
- 每个孔都要有**孔壁**（缸套保留后半圆 + 断口壁厚棱边），否则轴/活塞看起来悬空。
- 相邻腔体之间要有**隔板/简支壁**，否则整机读成"空架子"。
- 被剖掉的应该是"遮挡视线的壳"，不能是"要展示的内部结构"。

完整方法论 + 代码片段：`references/03-cutaway-modeling.md`。

### ③ 通机构（运动由约束算，不由动画给）

```js
// 滑块-曲柄：活塞位置由曲轴转角解析给出，连杆姿态由两端点定
var py = CRANK_R * Math.cos(b) + Math.sqrt(ROD_L * ROD_L - Math.pow(CRANK_R * Math.sin(b), 2));
rod.quaternion.setFromUnitVectors(UP, dir);      // dir = 活塞销 - 曲柄销
```

- 多缸相位、点火顺序、凸轮半速、气门升程包络——全部写成常数 + 纯函数，`apply()` 只改状态量。
- 运动副接触要真的接触：凸轮基圆半径 = 升程零点位置（否则凸轮悬在气门上方）。
- 详见 `references/04-mechanism-motion.md`。

### ④ 做交互（职教的核心是"拆"和"认"）

必备四件：

| 交互 | 实现 | 教学作用 |
|---|---|---|
| 悬停认零件 | `K.tag(obj, '名称', '作用')` + 引擎的 `.lab-tip` | 零部件认知 |
| 单击聚焦 | 引擎 `focusOn()`（自动 tween 相机） | 看清该件 |
| 拆解滑块 | `s.explPct` → 各总成 `position` 缓动 | 装配关系、密封/定位 |
| 运动控制 | 暂停/继续、速度、转角滑块 | 运动规律 |

拆解方向必须**物理可行**：螺栓连接件沿装配方向抽出，别让它穿过台面或穿过别的零件（油底壳往下沉 = 穿台面，改成沿 +z 抽出来放台面上）。

详见 `references/05-interaction.md`。

### ⑤ 验证（不截图不许交付）

```bash
python build/build_chem.py <slug>                       # 组装单文件
node build/shot-page.js courses/<slug>.html <out> 1800  # 逐步截图 + 报错扫描（必须 channel:'chrome' + d3d11）
node build/check-quick.js courses/<slug>.html           # 九步遍历
```

红线：**≤55 万三角、≥55 fps（教室核显）**、0 pageerror、悬停能命中、拆解全程不穿模。

详见 `references/06-validation.md` 与 `templates/checklist.md`。

## 2. 引擎与目录（依赖解析）

本技能**不自带引擎副本**，与主技能共用同一份：

```
<repo>/assets/kit3d.js        Lab 框架 + K.* 几何/材质/环境库（K.boot / K.envShop / K.rbox / K.tag ...）
<repo>/assets/vendor/         three r147 UMD + 后期插件
<repo>/assets/page.html       单文件模板
<repo>/scripts/               验证脚本（selftest / check / views / pick / behavior_probe）
```

课件源码与产物：

```
build/lessons3d/<slug>.js     ← 你写的课件（几何 + 运动 + 步骤）
build/build_chem.py           ← 组装器（META 注册 slug → 注入 → 内联 three + 可选后处理）
courses/<slug>.html           ← 交付物（单文件，断网可用）
```

**两条构建路径**，按场合选：

```bash
# A. 工作区构建（推荐）：自动注入 postfx（SSAO+Bloom+ACES）、目录页、META 注册
#    先在 build/build_chem.py 的 META / ORDER / ART 里注册 slug
python build/build_chem.py <slug>

# B. 通用内联（换机器/只拿到 assets 时）：不注入后处理，页面更平，但零依赖
python scripts/inline_build.py \
  --template assets/page.html --three assets/vendor/three.min.js \
  --engine assets/kit3d.js --lesson build/lessons3d/<slug>.js \
  --sim assets/sim.js --out courses/<slug>.html \
  --title "标题" --chip "职业教育 · 工种 · 设备"
```

> `assets/` 与 `build/` 各有一份 `kit3d.js / page.html / style.css / sim.js`：
> `assets/` 是**分发源**（用户 `cp -r assets ~/.workbuddy/skills/...`），`build/` 是**工作副本**。
> 改引擎先改 `build/` 验证，**改完必须 `cp` 回 `assets/`**，否则装到别处的人拿不到新 API
> （典型事故：文档写了 `K.envShop()`，`assets/kit3d.js` 里没有）。

课件与引擎的唯一契约：

```js
K.boot({
  title, chip, hint, state,
  scene: { setup(), update(dt, s) },   // setup 只做静态初始化，动态一律放 update
  cam: { tx, ty, tz, dist, yaw, pitch },
  reads: [[key, '读数名']], values(s),
  steps: [{ name, title, ask, body, apply(s), controls: [...], cam, quiz }],
  quiz(s)
});
```

`setup()` 里调 `dt` 必炸（`dt is not defined`）——这是本线最常见的低级错。

## 3. 三条不可妥协

**精度**：真实设备的比例、壁厚、孔位、配合关系按实际还原。发动机缸径:行程、连杆长度比、气门升程这些数字要能对上教科书。示意化可以省细节，不能省比例。

**剖切可信**：剖切面要有"材料被切开"的样子——铸件有壁厚、断面有机加工亮边、内部有加强筋/隔板。半透明壳体是最省事也最假的做法，禁止。

**场景身份**：职教设备必须在职教场景里。车间 vs 实验室的区别不是配色，是**地面材质、墙面构造、周边物件、照明方式**四件事，四件都得对。

## 4. 性能预算（教室核显）

| 项 | 预算 | 备注 |
|---|---|---|
| 三角面 | ≤ 55 万（整机课件通常 8–12 万足够） | 程序化几何很便宜，真正的开销在细分与阴影 |
| draw call | ≤ 1200 | 大量重复件（螺栓/齿/棱）优先用克隆 + 共享材质 |
| 单文件 | ≤ 1.2 MB | three 内联占 600 KB，其余是你的代码与贴图 |
| 帧率 | ≥ 55 fps | 实测：80k 三角 / 970 call 在本机稳定 60 |

环境元素（车间）≤ 3 千三角，别让它抢预算。

## 5. 文档索引

| 文件 | 内容 |
|---|---|
| `references/01-pipeline.md` | 单文件管线、`K.boot` 全字段、`K.*` API 速查、构建与注册 |
| `references/02-shop-scene.md` | **实训车间场景基准**：`K.envShop()` 元素表、地面/墙/顶/门/工位物、光照曝光、三条硬规矩 |
| `references/03-cutaway-modeling.md` | **整机剖切建模法**：半剖原则、孔壁、隔板、燃烧室、剖切亮边、铸件纹理、分件与装配层级 |
| `references/04-mechanism-motion.md` | 机构运动：滑块-曲柄、四冲程相位与点火顺序、凸轮/气门、接触约束、多缸错相 |
| `references/05-interaction.md` | 交互与教学：`K.tag` 拾取、聚焦、拆解状态机、控件设计、六步教学结构 |
| `references/06-validation.md` | 验证：硬 GPU 截图、多机位、像素/行为探针、性能探针、交付清单 |
| `references/07-pitfalls.md` | 本线专属坑表（症状 → 原因 → 解法），全部是踩过的 |
| `templates/lesson-scaffold.js` | 可直接改名开工的课件骨架（车间 + 设备占位 + 6 步 + 控件 + 测验） |
| `templates/checklist.md` | 交付前自检清单（打印出来逐条打勾） |
| `examples/` | 参考实现：直列四缸汽油机（`courses/engine4-step.html`） |

## 6. 什么时候该转 `robot-glb-sim`

本技能走**程序化精模**（代码生成几何），优势是精确、零体积膨胀、风格统一、可参数化。
以下情况转子技能 `robot-glb-sim/`（真实 CAD `.glb` 管线）：

- 甲方给了真实 CAD 模型（.step/.stl/.glb），要求"就用这个模型"
- 曲面是强有机形态（流线罩壳、人体工学手柄、复杂铸件过渡圆角），代码建不动
- 需要照片级外观验收

两条线可以混用：**外观件用 .glb，内部结构件用程序化几何**。
