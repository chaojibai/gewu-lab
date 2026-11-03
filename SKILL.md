---
name: threejs-lab-courseware
description: 制作"单文件、可离线、模型驱动"的 three.js 学科仿真课件（化学/物理实验动画）。当用户要做一个能拖拽旋转、参数可调、读数真实计算的 3D 实验课，或要求"像铜匠实验室那样"的效果，或需要修玻璃/液体质感、加动画过渡、多机位验证渲染结果时使用。关键词：three.js 课件、虚拟仿真、化学实验 3D、玻璃材质、液体渲染、单文件离线、铜匠实验室、lab.tongjiang.app。
---

# three.js 单文件仿真课件

做"能动手、算得对、断网能放"的 3D 实验课件。核心不是画出好看的模型，
而是**参数 → 模型 → 读数/现象**三者自洽。

## 0. 开局三件事（不做会白忙）

1. **确认引擎在**：`assets/kit3d.js` + `assets/vendor/three.min.js`（仓库自带）。
   本文件的 `K.xxx` 全部来自引擎；只拿文档去写，`K.glassCyl` 之类会直接报 undefined。
2. **跑一次自检**：`node scripts/selftest.js`（检查资产/API/模板占位符，并端到端构建一个示例）。
3. **看 INSTALL.md 的"六个真实原因"**：装了不生效、页面全白、玻璃发白，大多对得上号。

## 0.1 开工前：必须去 GitHub 找参考

不要凭空设计。先检索同类开源实现，把"别人怎么解决玻璃/液体/交互"这件事看明白。

**必查（用户点名要求）**

- **铜匠实验室（Tongjiang Lab）**：https://github.com/smithjohn78390/tongjiang-lab
  - 54 节高中理科课，**每节一个自包含 HTML（约 1MB）**，断网可放，`catalog.json` 索引
  - 技术特征：three.js + 单文件内联；Canvas 上直接带 `data-engine="three.js r186"`
  - **许可：CC BY-NC 4.0（禁止商用）** → 只能学思路与参数，**不可复制代码、文案、素材**到商业产品
  - 站点：https://lab.tongjiang.app
- 其他可参考：
  - `Sherin-SEF-AI/molecular-lab`（React + R3F + 分子模型，CPK 配色与原子半径数据可参考）
  - Codrops《Creating the Effect of Transparent Glass and Plastic in Three.js》（`transmission` + `thickness` 的折射原理）
  - three.js 官方 `MeshPhysicalMaterial` 文档（transmission/thickness/attenuation 语义）

**检索方式**（照抄即可）

```
WebSearch: site:github.com three.js chemistry lab simulation MeshPhysicalMaterial transmission
WebSearch: github 铜匠实验室 tongjiang-lab three.js 化学 仿真 课件
```

**判断参考价值的三条**：① 是否单文件自包含（决定能否离线发给老师）；② 是否参数驱动而非播放时间线；③ 玻璃/液体的处理路线（transmission 还是着色器）。

## 1. 技术骨架

| 项 | 选择 | 原因 |
|---|---|---|
| 库 | three **r147 UMD**（`build/three.min.js`） | 只有 UMD 版能**内联进单文件**；r160+ 移除 UMD |
| 打包 | Python 脚本把 `three.min.js` + 引擎 + 课件 JS 拼进一个 HTML | 单文件 ≈ 650–700KB，双击可开、断网可用 |
| 管线 | 关掉 `ColorManagement`（legacy），无 toneMapping，用经典管线 | r147 的色管会把 hex 颜色二次提亮，导致"全场发白"；经典管线所见即所得 |
| 光照 | HemisphereLight(.55) + 主平行光(1.5, castShadow, 2048) + 补光 + **轮廓光（背后 .85）** | 轮廓光是"产品感"的关键，玻璃和金属边缘会浮出来 |
| 环境 | **自己搭一个 RoomEnvironment**：房间盒 + 发光灯板 → `PMREMGenerator.fromScene` | 玻璃/金属的反射高光全部来自它；没有环境贴图玻璃就是一块塑料 |
| 阴影 | `PCFSoftShadowMap` + 每件器材脚下 `blob` 软阴影贴片 | 硬阴影会让器材"粘"在台面上 |
| UI | 右侧 HTML 面板（步骤/读数/控件/答题），3D 只负责画面 | 面板千万别画进 canvas，文字会糊 |

### 1.1 可选加成：HDR 后期（SSAO + Bloom）

默认不开。需要"产品感"的那几课，在 `K.boot({ ..., postfx: true })` 打开即可
（引擎内已有实现，`assets/vendor/postfx/*.js` 为 r147 UMD 插件，缺了会自动跳过、不报错）。

**顺序不能错**，否则就是"整屏发光、白背景也糊"：

```
renderer.toneMapping = NoToneMapping      // ① 先别做色调映射
  → HalfFloat 半浮点 RT                   // ② 让 >1 的高光有地方存
  → SSAOPass（它自己渲染场景，别再加 RenderPass）
  → UnrealBloomPass(strength .38, radius .25, threshold 1.1)
  → 终合 ShaderPass：ACES + pow(col, 1/2.2)
```

**关键点：只有真正的高光才该发光。** 想让某个物体发光，就把它的颜色乘到 1 以上：

```js
new T.MeshBasicMaterial({ color: new T.Color(0xfff6da).multiplyScalar(2.6) });  // HDR
```

LDR 的白背景（≈1.0）低于 threshold 1.1，不会糊成一片。**不要**靠调 threshold 去救——
`NoToneMapping + HalfFloat` 才是根。

`K.geoRoundBox(w,h,d,r,seg)` / `K.rbox(o)` 也在这个引擎里：把 Box 顶点推到内嵌球面上得到真圆角，
配合 `grainTex()` / `normalTex()` 程序化纹理，是"塑料感 → 实物感"的主要来源。

## 2. 玻璃怎么做（最容易翻车）

**一句话：浅背景下，玻璃能不能被认出来，取决于轮廓线，不取决于材质参数。**

```js
// 玻璃主体：不要用 transmission 去"造透明"
new MeshPhysicalMaterial({
  color: 0xf2f8fc, roughness: .05, metalness: 0,
  transparent: true, opacity: .3,        // 壳层
  side: DoubleSide, depthWrite: false,
  clearcoat: .7, clearcoatRoughness: .08,
  envMapIntensity: 1.8, specularIntensity: 1.2
})
```

必配的三件套：

1. **口沿/底沿 `LineLoop` + 两条母线 `LineSegments`**（颜色 `0x7f9fb8`，透明度 .4–.7）。
   `linewidth` 在多数平台无效，**用透明度/颜色深浅补偿**：小器皿更实更深（`lineTone(r)`）。
2. **瓶壁竖向高光条**：additive 白色渐变贴图贴在瓶身侧面，模拟窗户在玻璃上的镜面反射。
3. **小件三件套**（滴管/玻璃棒/温度计/细导管）：**形体**（不透明度 ≥.55 + 两条母线）、
   **内容**（管内液柱或亮芯线）、**连接**（橡胶头/金属环/夹口）。缺一条就会出现
   "只剩一个彩色胶头"或"玻璃棒隐形"。详规见 `references/detail-rules.md`。
4. **贴壁薄壳**：沿瓶壁一层更深的液体（`color×0.42`、`BackSide`、`renderOrder` 低于液体主体），
   填掉液体与玻璃之间的缝，读成"有厚度的液体"。**颜色必须跟着液体颜色一起更新**，否则会出现
   "溶液已无色、边缘还是红的"这类 bug。

## 3. 液体怎么做

**用片元着色器，不要用 transmission。**

```glsl
// 按世界高度做吸收渐变（Beer-Lambert 的等价），无接缝
float h = clamp((vW.y - uBot) / (uTop - uBot), 0., 1.);
vec3 base = mix(uDeep, uShallow, smoothstep(0., 1., h));
float fres = pow(1. - abs(dot(normalize(vN), V)), 3.);
base *= (1. - fres * 0.52);              // 贴壁处显著加深
base += uShallow * (1. - fres) * 0.10;   // 内部略亮 → 体积感
float up = smoothstep(.75, .98, normalize(vN).y);
if (up > .01) { /* 液面：略亮 + 110 次幂高光 + alpha 降到 0.74 */ }
```

关键结论（都是实测踩出来的）：

- **真透射在浅背景上会让有色液体几乎消失**——transmission 采的是背后画面，白台面前面没东西可折射，
  红色全丢。物理正确但视觉无用，**不要走这条路**。
- **不能靠"叠一层深色几何"做纵深**：只要有几何边界就一定有分层接缝。
- 液体半径要比瓶壁**收进 0.25–0.45**，留出可读的玻璃缝；收太多会像"悬在瓶里"。
- 液面是**平的**，一大片 clearcoat 高光会让它变成"冰淇淋球"，只留小而紧的高光。

## 4. 一切变化都要有过渡

用户会立刻指出"变化太生硬"。三层保险：

1. **`dt` 钳制 ≤50ms**：切步骤/切标签页时 dt 会飙到几百毫秒，任何缓动都被一步吃掉。
2. **状态补间**：`goStep()` 在 `apply()` 前后比对数值，跳变 >12% 的项自动生成 0.55s 缓入缓出补间。
   这样**所有课程不改一行代码就获得过渡**。
3. **整件器材淡入淡出**：`K.fadeShow(obj, on, dt)`，逐帧改 `material.opacity`，淡到 0 才隐藏。
   火焰单独走强度 `lv` 缓动（点燃是渐亮、熄灭是渐暗+变小）。

## 5. 严谨性（教学产品的底线）

- 读数必须**由模型算**，不是拟合曲线。`pH = 13 - 0.3×滴数` 这种就是"仿假"。
- **教材里的操作动词必须在画面上有对应物体与运动**：写"通入"就要有导管+气泡，
  写"罩上"就要有器材移过去的姿态。只演"前后两个状态"＝过程缺失，会被直接指出
  （详见 `references/detail-rules.md` 第十五节）。
- 强酸强碱滴定：物料守恒 + 水的自偶电离精确解；等当点由 `cB·vB = cA·vA` 推。
- 单位自洽：滴数 × 每滴体积 = 已滴加体积；体积 × 浓度 = 物质的量。
- 分子模型用真实几何：H₂O 键角 **104.5°**、O–H **0.96 Å**、共价半径 O 0.73 / H 0.37 Å（视觉比 ≈2:1）。
- 有条件的加**误差与评分**：`100 - |终点体积 - 等当点| × 400`，让"操作得准不准"变成可见反馈。

## 5.5 工作流军规（流程层，与上面内容层互补）

动工前三件事：**读材 → 契约 → 状态门**；每轮验证后自纠**五选一**：

1. **读材协议**：观察先于推断——物理清点 → 层次分解 → 操作动词表 → 盲区标注，不许扫一眼教材就写代码
2. **质量契约先行**：数学/视觉/行为/体积四条验收线写在建码之前，自纠对照契约，不凭感觉
3. **状态门**：进度权威是 `.courseware/state.json`（`scripts/state_gate.py`），每步带证据，修正有上限（步 3、全程 6，超限硬停）
4. **自纠五选一**：continue / refine-spec / refine-code / request-input / stop；**refine-spec 修规格，不许绕过坏规格给代码打补丁**
5. **全局指标会撒谎**：全局分数只做初筛，关键特征各有分量断言；小特征用放大机位/数值探针

详见 `references/workflow-rules.md`；针对技能自身的实验记录见根目录 `LAB-FINDINGS.md`。

## 6. 验证流程（不能只看一张正面图）

### 6.0 必须用**硬件 GPU** 截图（否则你会误判自己的作品）

软件渲染（SwiftShader）跑不出 `PMREMGenerator` 的环境贴图 → **玻璃/金属全部发灰发假**，
帧率只有 2–8 fps，动画看起来是"卡住的"。**在软件渲染下反复调材质 = 越调越假**，
本项目因此被用户判定为"虚拟仿假"。

```js
chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
})
```

上手先确认不是软件渲染：`chrome://gpu` 里应看到真实显卡型号（如 NVIDIA GTX 1650），
而不是 `SwiftShader`。

### 6.1 三件套

3D 必须**多机位 + 像素取样 + 报错扫描**三件套，脚本见 `scripts/`。

```bash
node scripts/views.js courses/x.html v1 0   # front/hero/side/top/back/detail 六机位
node scripts/check.js courses/x.html        # 抓 pageerror / console.error
node scripts/pick.js courses/x.html "600,500;500,600"  # 读帧缓冲像素，别凭肉眼猜颜色
```

多机位立刻能暴露正面看不到的问题：旋塞像两个大圆环、侧视标注压住瓶身、俯视时标注压在液面上。

### 6.2 行为回归：证明"算得对、动得对"

截图只证明"看起来对"。页面再暴露几个调试钩子（如 `__tip()` 焦点坐标、`__held()` 状态、
`__crate()` 被操作对象位置），用 `scripts/behavior_probe.js` 读数值做断言：
资产件数 ≥1、坐标无 NaN、零 pageerror。外观 + 行为双回归，改模板里
READY/PROBES 两处即可接入新页面。全局分数只做初筛——关键读数（如终点体积）
要有各自的分量断言（见 §5.5 与 workflow-rules 五）。

**`detail` 机位必须单独过一遍清单**（这份清单是"凑近就露馅"的问题库）：

```
[ ] 每个小件都能看出是什么（不是只剩一个彩色块）
[ ] 器材**不断成两截**（被背景/光晕吞掉也算断，见 detail-rules 第八节）
[ ] 火焰/发光体不是一团白雾（NormalBlending + 实色 alpha + 保持比例，见第十节）
[ ] 没有"凭空出现"的器材：都在备料区，用到时才移动（见第十一节）
[ ] 没有悬空件：底有支撑、口有对接、夹有咬合
[ ] 刻度/数字不被滴管、瓶口、标注遮挡
[ ] 液面落在刻度区间内，且有凹液面亮环
[ ] 透明件边缘有 1px 深色轮廓（不是一团白）
[ ] 金属件有高光（不是灰片）
[ ] 标注不压器材（侧视/俯视都要看）
```

**刻度贴图四周必须留 6–8px 透明边**，否则筒身上会显出一个"卡片矩形"；
`alphaTest` 取 0.1–0.2，`renderOrder` 高于液体，`z = r*0.96` 贴前壁。

### 6.3 夹具稳定性与渲染诊断

截图要**可复现**才有断言资格：冻结随机源、锁相机/视口/像素比、等语义就绪信号
（不用固定 sleep），pageerror / console.error / 网络失败三路一起收；
跨 GPU 不做逐像素相等断言。出问题按**症状树**排查（黑画布/发黑/闪烁/拾取偏移/
场景重复…），先用无光照诊断材质分离"几何问题"与"光照问题"；修后必须重演
原始失败动作并检查相邻状态。课件要保证**只开键盘能走完全流程**。详见 `references/qa-and-diagnostics.md`。

## 7. 常见坑（省你几轮返工）

| 现象 | 原因 | 解法 |
|---|---|---|
| 全场发白 | r147 `ColorManagement` 二次提亮 | 关色管，走经典管线 |
| 玻璃是奶白色 | `transmission≈1` + `ior 1` 采白背景 | 改 `opacity .3 + clearcoat`，靠轮廓线定形 |
| 液体"火山" | `thickness` 太大导致折射放大 | `thickness` 收到 <0.5，或改用着色器 |
| 玻璃里看不到液体 | 玻璃与液体都在透射通道（嵌套失效） | 玻璃退出透射，液体用不透明着色器 |
| 液面一圈黑星芒 | `liquidTop` 与液体顶盖共面 z-fighting | `polygonOffset(-2)` + 抬高 0.015 |
| 整件器材闪现 | `visible = boolean` | `fadeShow()` 淡入淡出 |
| 标注近看巨大 | Sprite 随距离线性放大 | 按距离补偿 `scale = base × clamp(d/38, .6, 2.4)` |
| `dt is not defined` | 在 `setup()` 里调了需要 dt 的工具 | setup 只做静态初始化，动态放 `update()` |
| 小器皿看不见边 | 1px 线在小物体上过细 | `lineTone(r)` 按半径加深加实 |
| 小件只剩一个彩色块 | 玻璃管身隐形（无母线/无内容物） | 三件套：母线 + 管内液柱 + 连接环 |
| 筒身上有一块矩形 | 刻度贴图无留白、alphaTest 太低 | 四周留 8px 透明边，alphaTest .15 |
| 读数显示 92.4 而目标 94 | 读数读了补间中间值 | 补间时存 `state[k+'T']`，面板读目标值 |
| 改了液位却不显示 | 液体渐变按世界高度算，`scale.y` 无效 | `K.setLiquidLevel(mesh,h,y0)` 同步 `uBot/uTop` |
| 质感发灰发假、帧率 2–8fps | 跑在 SwiftShader 软件渲染上，PMREM 环境没渲染出来 | 换硬件 GPU（`--use-angle=d3d11`），见 §6.0 |
| 液体里的气泡/颗粒一个都看不见 | 液体 `depthWrite:true`，内部物体被深度测试剔除 | 加 `depthTest:false`；且气泡靠亮边（`0xdcebf6` + DoubleSide + `envMapIntensity 2.2`）不要纯白 |
| 渐变"没有过渡"/一进步骤就是终态 | ① 分段纯色 + `visible` 逐段点亮；② 用"进步骤就带初值"的量驱动（如 `burnT=max(burnT,6)` 配 `burnT/8`） | CanvasTexture 每帧重绘连续渐变；改用器材到位后才累加的独立计时器 |
| 备料区器材被面板挡住 / 挡住主体 | 世界坐标靠估，没考虑透视与右侧面板 | `Box3` 投影实测屏幕占比，目标横 62%–77%（见 detail-rules 十八节） |
| 两件器材重叠（如烧杯和漏斗同占火焰上方） | 一步的 `apply()` 里同时开了占同一空间的两件 | 改成互斥按钮切换（见 detail-rules 十九节） |
| 只演结果没有过程（"水自己变白了"） | 没画承载操作的通路 | 教材里的操作动词必须有对应物体与运动（见 detail-rules 十五节） |
| 河与海之间有接缝/薄色片/"被隔开" | 两张水面相交 | 合成**一张**水面：水位函数 + 只在"地形低于水位"处铺（detail-rules 二十） |
| 岸线一级级马赛克 | 水面按格子"全水/全陆"取舍 | 等值线裁剪（marching squares）沿 `f=0` 收多边形 |
| 山坡像织物/拉丝 | 逐三角顶点 + `computeVertexNormals` 只有面法线；或色按格子给；或无 uv 挂 normalMap | 解析法线（中心差分）+ 逐顶点色 + 去掉 normalMap |
| 山体被切出一道深槽 | `Math.min(h,…)` 没带空间范围 | 加位置条件（如 `x > c-12`），只作用于该段 |
| 河口"一摊浅水"/滩面小水洼 | 滩面压平带给河道留了例外，噪声没压住 | 整片滩面压平 + 一条固定宽度通道穿过 |
| 剖面上一条条竖纹 | 每列 `Math.random()` 上色 | 剖面颜色不掺随机量 |
| 内嵌模型整批消失、控制台零报错 | `loader.load("data:")` 内部走 fetch，被宿主预览 CSP 拦截 | base64→ArrayBuffer→`loader.parse()` 零 fetch 解析（见 external-assets 三） |

## 8. 交付形态

- 每节课**一个 HTML**，双击可开，断网可用（three.js 已内联）
- 目录页提供**「下载 HTML」**按钮（`a[download]` + 临时 anchor click）；
  `file://` 下浏览器会拦截下载 → 降级为「打开课件」并提示 Ctrl+S
- 学习进度存 `localStorage`（`step / done / at`），目录页显示「上次看到第 N 步」
- 键盘：`←/→` 切步骤、`R` 重置视角、`Esc` 关提示

## 9. 文档索引

- `references/render-recipes.md`：材质参数表、环境贴图、液体着色器全文、缓动、交互代码
- `references/detail-rules.md`：**细节修改规则**（小件三件套、放置朝向、刻度与液面、
  特写自检清单、反例→正解对照表）
  - 十一 器材入场动线（不要淡入假装出现）· 十二 木头小件材质 · 十三 细杆辨识度
  - **十五 "过程"类实验必须画出通路**（通入/滴入/振荡：气源+支撑+连接+末端+现象+结果）
  - **十六 透明液体内部的物体会整颗消失**（`depthTest:false` + 亮边不靠白色）
  - **十七 连续渐变不要分段硬切**（CanvasTexture 每帧重绘 + 独立计时器 + 演完取出观察）
  - **十八 备料区坐标要实测屏幕占比**（`Box3` 投影量法 + 面板位置换算 + 先瘦身再挪位）
  - **十九 同一空间不许同时站两件器材**（互斥按钮 + 证据不随器材撤走清零）
  - **二十 水面与大地貌**（河海合成一张水面 + 等值线裁剪岸线 + 解析法线/逐顶点色 +
    `Math.min` 削平要带范围 + 河口=压平滩面+固定宽度通道）
  - **二十一 实验室环境与器材的美学基准**（桌子 38×12×.7 + 颗粒/法线/接触阴影/窗格/postfx；器材材质表 + 火焰 + 备料规则）
- `references/github-references.md`：必查仓库（含铜匠实验室）与检索命令
- `references/external-assets.md`：**外部模型资产进单文件**（分件素材要求、减面量化预算、
  CSP 安全加载、加载进度反馈、多阶段状态机骨架、行为回归）
- `references/workflow-rules.md`：**工作流军规**（读材协议、质量契约、状态门与证据、
  自纠五选一、全局指标会撒谎、结果透明）
- `scripts/behavior_probe.js`：行为回归通用模板（数值探针 + 断言 + 截图，改 READY/PROBES 两处即用）
- `scripts/state_gate.py`：轻量状态门（进度权威 + 证据标记 + 修正轮次上限 + 硬停）
- `references/qa-and-diagnostics.md`：**夹具稳定性与渲染诊断**（可复现截图、容差断言、
  症状树、无光照诊断材质、修后复验、可达性底线）
- 根目录 `LAB-FINDINGS.md`：针对技能自身的实验记录（含推翻预设的发现，新发现往里追加）
- 子技能 `robot-glb-sim/`：真实 CAD 网格可操纵机械臂仿真的完整成品与专属细节（URDF 装配、数值 IK、抓放）
