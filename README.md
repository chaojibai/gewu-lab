# 格物实验室 · 鲁教版化学 / 物理 3D 交互课件

把课本里看不见的过程，做成**能动手、算得对、断网能放**的 3D 实验课件。

本仓库收录鲁教版初中 **化学 15 门 + 物理 21 门** 单文件 three.js 交互课件。
每一门都可旋转观察、分步演示、读数由模型实时计算；**所有页面均为单文件 HTML，
不依赖网络、不依赖服务器，双击即可打开**。

> ⚠️ **许可：CC BY-NC 4.0 —— 仅限教学 / 科研使用，禁止商用、禁止售卖。**
> 详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。

---

## 包含内容

| 学科 | 册次 | 门数 | 入口 |
|---|---|---|---|
| 化学 | 八年级全一册 / 九年级上册 / 九年级下册 | **15** | `courses/chem-exp/index.html` |
| 物理 | 八上 / 八下 / 九上 / 九下（五四制） | **21** | `courses/physics-exp/index.html` |

每门课件都是独立的 `*-step.html` 文件（例：`candle-step.html`、`ammeter-step.html`），
内联了 three.js 与全部材质/场景，**零外部依赖**。

---

## 怎么用

### ① 在线浏览 / 下载（部署到 GitHub Pages 后）
打开仓库的 Pages 地址，即可在浏览器里浏览目录、点击任意课件进入 3D 交互。
每个课件右下角都有 **「下载本课件」** 按钮；目录页每张卡片也有 **「下载」** 按钮，
一键把单文件 HTML 存到本地。

### ② 直接下载单个课件离线用
每个 `*-step.html` 本身就是完整课件。**下载后断网双击即可打开**，
适合发给学生、拷到机房、或嵌进自己的课件里。

### ③ 本地整体打开
直接双击 `courses/chem-exp/index.html` 或 `courses/physics-exp/index.html`
即可在本机浏览全部课件（目录页的图片封面需要同源目录下的 `thumbs/` 文件夹）。

---

## 许可与署名

- **本作品以 CC BY-NC 4.0 授权**：可教学、可分享、可署名后改编，**不可商用、不可售卖**。
- 版权：© 2026 格物实验室（GEWU LAB）。
- 第三方参考（仅参考思路，未复制代码/文案/素材）：
  - **three.js（r147）** — MIT License，© 2010–2023 three.js authors，内联于各课件（其 MIT 声明保留在文件内）。
  - **tongjiang-lab（铜匠实验室）** — CC BY-NC 4.0，本项目的单文件 3D 课件形式受其**其中一个课件**的形态启发。
  - 详见 [NOTICE.md](NOTICE.md)。

---

## 部署到 GitHub Pages（免费、静态托管）

课件是纯静态 HTML，天然适合 GitHub Pages：

```bash
# 1) 在 GitHub 新建仓库，名为 gewu-lab（或 格物实验室）
# 2) 关联并推送（本仓库已含全部文件，.gitignore 已排除依赖与产物）
git remote add github https://github.com/<你的用户名>/gewu-lab.git
git add -A
git commit -m "feat: 鲁教版化学/物理 3D 课件开源（CC BY-NC 4.0，仅教学）"
git push -u github master        # 若默认分支为 main，请相应改名

# 3) 仓库 Settings → Pages → Source 选 master（或 main）分支 /(root) → Save
# 4) 等待约 1 分钟，访问 https://<你的用户名>.github.io/gewu-lab/
```

> 国内访问 GitHub Pages 偶尔较慢，可改用 **Gitee Pages**（你已有 Gitee 账号）作国内镜像，步骤类似。

---

## 目录结构

```
courses/
  chem-exp/        # 化学 15 门课件 + 目录页 index.html + 封面 thumbs/
  physics-exp/     # 物理 21 门课件 + 目录页 index.html + style.css
LICENSE           # CC BY-NC 4.0 + 仅教学声明
NOTICE.md         # 第三方参考与署名
README.md         # 本文件
scripts/
  release_polish.py  # 发布后处理：注入「下载本课件」按钮与许可徽标（可重复运行）
```

> 课件由 `build/` 下的构建脚本从源码生成；如需修改课件内容，参见 `INSTALL.md` 与 `SKILL.md`。
> 想重新生成发布用的下载按钮与许可徽标，运行 `python scripts/release_polish.py` 即可（幂等）。

---

## 免责声明

课件依相关教材与课程标准编写，力求准确，但**不保证与任一特定版本教材逐字对应**，
亦不对因使用本课件产生的任何后果承担责任。内容仅供教学参考。
