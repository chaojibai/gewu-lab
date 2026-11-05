# threejs-lab-courseware

**把课本里看不见的过程，做成能动手、算得对、断网能放的 3D 实验课件。**

一个面向 WorkBuddy / AI Agent 的技能包（Skill）：给出「单文件、可离线、模型驱动」的
three.js 学科仿真课件制作方法 —— 从玻璃/液体的渲染配方，到缓动系统、多机位验证流程、
以及一份「凑近就露馅」的细节修改规则库。

> 适用于：初中/高中化学、物理实验课件；虚拟仿真实验；需要发给老师离线使用（单 HTML 文件）的场景。

---

## 它解决什么问题

做 3D 实验课件，真正的难点不是"建个模型"，而是这四件事：

| 难点 | 本项目的答案 |
|---|---|
| 玻璃在浅背景下看不见（像塑料） | 玻璃**靠轮廓线被读出来**，不是靠 transmission；配口沿/母线/竖向高光/贴壁薄壳 |
| 液体像一块色块（或"冰淇淋球"） | 片元着色器按**世界高度**做吸收渐变 + 贴壁暗化 + 平液面 + 小而紧的高光 |
| 数字是编的（"仿假"） | 所有读数**由公式算**：pH 精确解、pV=nRT、m=ρV、质量分数、误差评分 |
| 变化太生硬（一下子多/少） | dt 钳制 + 状态跳变自动补间 + 整件器材淡入淡出 + 火焰强度缓动 |

---

## 快速开始

> ⚠️ **本仓库自带引擎**（`assets/kit3d.js` + `assets/vendor/three.min.js`）。
> 只拷 `SKILL.md` 是不够的 —— `K.glassCyl` / `K.fadeShow` / `K.boot` 都在引擎里。
> 装完请跑 `node scripts/selftest.js` 自检。详见 **[INSTALL.md](INSTALL.md)**。

### 1. 安装（WorkBuddy / 兼容 Agent）

把整个目录复制到用户级技能目录（**目录名必须是 `threejs-lab-courseware`**）：

```bash
# macOS / Linux
cp -r threejs-lab-courseware ~/.workbuddy/skills/

# Windows (Git Bash)
cp -r threejs-lab-courseware "$HOME/.workbuddy/skills/"
```

之后在对话里说「用 threejs-lab-courseware 技能做一节 XX 实验」即可触发。

### 2. 依赖

```bash
node scripts/selftest.js    # 先自检（会告诉你缺什么）
npm i playwright            # 可选：只有跑截图/检查脚本才需要
```

- **three**：仓库已内置 r147 UMD（`assets/vendor/three.min.js`）。**不要**用 `npm i three`——
  新版移除了 UMD，内联会失败
- **playwright**：多机位截图、报错扫描、像素取样

### 3. 验证脚本

```bash
node scripts/views.js courses/x.html v1 0     # 六机位截图：front/hero/side/top/back/detail
node scripts/check.js courses/x.html          # pageerror / console.error 扫描
node scripts/pick.js courses/x.html "600,500" # 直读帧缓冲像素（别靠肉眼猜颜色）
python scripts/inline_build.py --template page.html --three three.min.js \
    --engine kit3d.js --lesson lessons/x.js --out courses/x.html
```

---

## 目录结构

```
threejs-lab-courseware/
├── SKILL.md                          # 主文件：技术骨架、玻璃/液体做法、过渡、验证、踩坑表
├── references/
│   ├── render-recipes.md             # 材质参数表、环境贴图、液体着色器全文、交互代码
│   ├── detail-rules.md               # 细节修改规则：小件三件套、刻度液面、断肢检查、反例库
│   └── github-references.md          # 必查的开源参考（含铜匠实验室）与检索命令
├── INSTALL.md                        # 接入指南（三种装法 + 六个"效果不好"的真实原因）
├── assets/                           # ★ 引擎资产（缺了它什么都跑不起来）
│   ├── kit3d.js                      # 引擎：玻璃/液体/器材/缓动/交互
│   ├── page.html                     # 单文件模板（7 个占位符）
│   ├── style.css                     # 面板样式
│   ├── sim.js                        # 模型层（pH/气体/溶解等）
│   └── vendor/three.min.js           # three r147 UMD（594KB，可内联）
│       └── postfx/*.js              # 可选：SSAO/Bloom 后期（11 个 r147 UMD 插件）
├── scripts/
│   ├── selftest.js                   # 安装自检（资产/API/占位符/端到端构建）
│   ├── views.js                      # 六机位截图
│   ├── check.js                      # 报错扫描
│   ├── pick.js                       # 帧缓冲像素取样
│   └── inline_build.py               # 多文件内联成单文件 HTML
├── vocational-3d/                    # ★ 子技能：职业教育设备 3D 课件线（独立技能）
│   ├── SKILL.md                      # 入口：五步流水线 / 三条不可妥协 / 性能预算
│   ├── references/                   # 01 管线 · 02 实训车间场景 · 03 整机剖切建模法
│   │                                 # 04 机构运动 · 05 交互与教学 · 06 验证 · 07 本线坑表
│   ├── templates/                    # lesson-scaffold.js（可改名开工）+ checklist.md（交付自检）
│   └── examples/                     # 样板索引：直列四缸汽油机
├── robot-glb-sim/                    # 子技能：真实 CAD .glb 可操纵机械臂仿真
└── examples/
    └── peizhi-step.js                # 完整示例：《配制一定溶质质量分数的溶液》
```

> **两条线已分流**：科普/素养类走本 README 与 `SKILL.md`；
> 实训/设备/拆装/精模类走 `vocational-3d/SKILL.md`（场景、剖切、验收标准完全不同，不要混用）。

---

## 核心结论速查（都是实测踩出来的）

1. **玻璃**：`opacity .3 + clearcoat .7 + envMapIntensity 1.8`，**不要**用 `transmission≈1`（会奶白）；
   口沿 `LineLoop` + 母线 `LineSegments` 必须画，`linewidth` 无效就用透明度补偿。
2. **液体**：`transmission` 在浅背景下会让有色液体**消失**（背后没东西可折射）→ 用片元着色器做高度渐变。
3. **不能靠叠几何做纵深**：有几何边界就一定有分层接缝。
4. **读数**：补间时存 `state[k+'T']` 目标值，面板读目标值，画面读缓动值（否则显示 92.4 mL 这种中间数）。
5. **液位**：`scale.y` 对"按世界高度算渐变"的着色器无效 → `setLiquidLevel(mesh, h, y0)` 同步 `uBot/uTop`。
6. **细节**：小件三件套（形体 + 内容 + 连接），缺一条就"只剩一个彩色块"；
   器材**不允许断成两截**（被亮背景或 BackSide 光晕吞掉也算断）。

更多见 `SKILL.md` 与 `references/detail-rules.md`。

---

## 内容预览

- **8 节 SKILL.md**：技术骨架 / 玻璃 / 液体 / 过渡 / 严谨性 / 验证流程 / 9 条踩坑 / 交付形态
- **detail-rules 九节**：小件三件套、放置朝向、刻度液面、特写自检清单、修法代码、
  反例→正解表、断肢检查（含采样判定法）、节奏建议、真实案例
- **示例课件**：8 步（计算→称量→量取→溶解→装瓶→评分→迁移→总结），
  读数全部由 `m = m溶液×w`、`V = (m溶液−m溶质)/ρ` 计算，6 g + 94 mL → 6.00%

---

## 许可

本仓库内容（文档、脚本、示例代码）采用 **MIT License**，见 `LICENSE`。

**第三方参考声明**见 `NOTICE.md`：文中提到的开源项目（如铜匠实验室 `tongjiang-lab`）
各有自己的许可，本项目仅参考其公开的做法与参数，**未复制其代码、文案或素材**。
其中 `tongjiang-lab` 为 **CC BY-NC 4.0（禁止商用）**，请勿将其内容用于商业产品。

---

## 致谢

- [three.js](https://threejs.org)（MIT）
- [Playwright](https://playwright.dev)（Apache-2.0）
