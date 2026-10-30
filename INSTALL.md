# 接入指南（其他设备 / 其他人的机器）

> **一句话**：这个技能不只是一份文档，它带了一套引擎（`assets/kit3d.js`）。
> 少了 `assets/`，`SKILL.md` 里写的 `K.glassCyl`、`K.fadeShow`、`K.boot` 全都不存在 —— 这就是"照文档做却不对"的头号原因。

---

## 一、三种装法（选一种）

### A. 直接复制目录（最简单）

```bash
git clone https://gitee.com/zhang-xinrui1/skill-virtue.git /tmp/skill-src
mkdir -p ~/.workbuddy/skills
cp -r /tmp/skill-src ~/.workbuddy/skills/threejs-lab-courseware
```

> **目录名必须是 `threejs-lab-courseware`**（与 `SKILL.md` 里的 `name` 一致）。
> 仓库叫 `skill-virtue` 没关系，装进去要改名，否则技能可能不被识别。

### B. 只装方法、引擎手动拷（已有自己的项目骨架）

```bash
mkdir -p ~/.workbuddy/skills/threejs-lab-courseware
cp SKILL.md LICENSE NOTICE.md README.md ~/.workbuddy/skills/threejs-lab-courseware/
cp -r references scripts examples assets ~/.workbuddy/skills/threejs-lab-courseware/
```

### C. 项目内引用（不改全局）

把仓库放在项目里，对话时直接给路径：
「参考 `<项目>/skill-virtue/SKILL.md` 和 `assets/kit3d.js` 做一节 XX 实验」。

---

## 二、依赖（只有跑脚本才需要）

| 依赖 | 是否需要 | 说明 |
|---|---|---|
| `assets/vendor/three.min.js`（r147 UMD） | **仓库已内置** | 千万别改成 `npm i three`：新版移除了 UMD，`inline_build.py` 内联会失败 |
| `playwright` | 只在跑 `views.js` / `check.js` / `pick.js` 时需要 | `npm i playwright`，用系统 Chrome（`channel: 'chrome'`） |
| Python 3 | 只在跑 `inline_build.py` 时需要 | 无第三方包 |

```bash
npm i playwright          # 可选；不装也能只写课件
```

---

## 三、装完先自检

```bash
node scripts/selftest.js
```

它会逐项检查并给出**具体缺什么、怎么补**：

- `assets/` 五个文件是否齐全（kit3d.js / style.css / page.html / sim.js / vendor/three.min.js）
- three 是否为 UMD 版（`!function(t,e){"object"==typeof exports` 开头）
- 引擎是否暴露了 `K.boot / K.glassCyl / K.fadeShow / K.setLiquidLevel / K.spriteLabel`
- 模板占位符是否是 `{{THREE}} {{SIM}} {{KIT}} {{LESSON}} {{TITLE}} {{CHIP}} {{CSS}}`
- 是否能用 assets + examples 构建出一个可跑的课件（无 playwright 时跳过这一步）

---

## 四、"效果不好"的六个真实原因（按概率排序）

| # | 现象 | 原因 | 修法 |
|---|---|---|---|
| 1 | 代码里 `K.glassCyl is not a function` | 只装了文档，没装 `assets/kit3d.js` | 按上面 A 重新装；或确认 `assets/kit3d.js` 被一起拷进去了 |
| 2 | 页面全白 / 控制台报 `THREE is not defined` | 用了 npm 的 three（r160+ 无 UMD），或模板占位符没替换 | 用仓库自带 `assets/vendor/three.min.js`；构建必须走 `inline_build.py` |
| 3 | 技能压根没触发 | 目录名不是 `threejs-lab-courseware`，或 `SKILL.md` 的 frontmatter 被改过 | 目录改名；`name:` 与目录名一致 |
| 4 | 玻璃发白/液体像塑料 | 没按 `references/render-recipes.md` 的参数，自己改了 `transmission` | 玻璃 `opacity .3 + clearcoat`；液体用片元着色器（见 SKILL.md 第 2、3 节） |
| 5 | 中文全变方块 / 标注是乱码 | 窄体 Windows 缺字体，或 canvas 里没写 fallback 字体栈 | canvas 字体写 `-apple-system,"PingFang SC","Microsoft YaHei",sans-serif` |
| 6 | 脚本报 `Cannot find module 'playwright'` | 脚本在技能目录里，`node_modules` 在项目里 | 在**项目目录**下执行（脚本已内置从 `process.cwd()` 解析的兜底） |

---

## 五、最小可用流程（复制粘贴）

```bash
# 1) 造一节新课件
node scripts/selftest.js                       # 先确认环境
python scripts/inline_build.py \
  --template assets/page.html \
  --three    assets/vendor/three.min.js \
  --engine   assets/kit3d.js \
  --sim      assets/sim.js \
  --lesson   examples/peizhi-step.js \
  --out      dist/demo.html \
  --title    "配制一定溶质质量分数的溶液" \
  --chip     "化学 · 九上 · 第三单元"

# 2) 验证（三件套）
node scripts/check.js  dist/demo.html
node scripts/views.js  dist/demo.html dist/v1 0
node scripts/pick.js   dist/demo.html "600,500"
```

打开 `dist/demo.html` 应该看到：实验台 + 天平 + 量筒 + 烧杯 + 试剂瓶，右侧 8 步讲解面板，
读数 6.0 g / 94.0 mL / 6.00%。

---

## 六、跨平台差异

| 项 | Windows | macOS / Linux |
|---|---|---|
| 路径分隔 | 脚本内部已 `replace(/\\/g,'/')` | 无需处理 |
| 字体 | `"Microsoft YaHei"` | `"PingFang SC"` / `"Noto Sans CJK SC"` |
| 浏览器 | `channel: 'chrome'` 需装 Chrome | 同上，或改 `channel: 'chromium'` |
| 终端 | 用 Git Bash 执行上面命令 | 直接 bash |

---

## 七、仍然不对怎么报障

把这三样发出来，基本能立刻定位：

```bash
node scripts/selftest.js            # 环境与资产
node scripts/check.js <你的课件>     # 页面报错
浏览器控制台的前 3 条红字
```
