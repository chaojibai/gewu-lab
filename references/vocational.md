# 职业教育线 · 摘要（详规已独立成子技能）

> **本文件是入口摘要。完整规范见子技能 `vocational-3d/SKILL.md`。**
> 职教线已从本仓库主技能剥离，避免两条线（素养 / 职教）的美术基准、场景模板、验收标准互相污染。

## 什么时候去 `vocational-3d/`

需求出现 **实训 / 工种 / 设备还原 / 拆装 / 装配关系 / 剖切 / 精模 / 工业仿真 / PBR / 零部件认知** → 走职教线。

需求是 **初中小学 / 科普 / 自然 / 水循环 / 分子运动 / 示意 / low-poly** → 留在本仓库主技能（素养线）。

## 三句话记住职教线

1. **场景先定**：`K.envShop()`（实训车间：水泥地坪 + 工位黄线 + 压型钢板墙 + 卷帘门 + 工具柜 + 厂房顶灯）。
   素养线的 `K.envRoom()`（白墙 + 黑板 + 试剂窗）是实验室身份，对本线是错的。
2. **剖切要实心**：侧壁/后壁做实心铸件，只剖朝向默认机位那一面；每个孔都要有孔壁；腔体之间要有隔板。
   全透明壳体 = 零件看起来在飘，禁止。
3. **运动靠约束**：滑块-曲柄、凸轮相位、传动比全部解析计算；参数一改，画面必须自洽。

## 硬约束（用户要求，不变）

**不下载 Blender / Fusion 360 / SolidWorks / Rhino / Substance / ZBrush 等大部头。**
路线 = 程序化精模 + 轻量开源（OpenSCAD / SolveSpace / CadQuery）+ CC0 资产 + `gltf-transform` 减面 + Draco/KTX2。

## 去哪看什么

| 你需要的 | 文件 |
|---|---|
| 入口、五步流水线、红线、性能预算 | `vocational-3d/SKILL.md` |
| 管线、`K.boot` 契约、`K.*` 速查、资产工具链 | `vocational-3d/references/01-pipeline.md` |
| 实训车间场景 `K.envShop` 规格与三条硬规矩 | `vocational-3d/references/02-shop-scene.md` |
| **整机剖切建模法**（半剖/孔壁/隔板/燃烧室/铸件/亮边） | `vocational-3d/references/03-cutaway-modeling.md` |
| 机构运动（曲柄连杆/四冲程/凸轮接触） | `vocational-3d/references/04-mechanism-motion.md` |
| 交互与六步教学结构 | `vocational-3d/references/05-interaction.md` |
| 验证（硬 GPU / 多机位 / 行为探针） | `vocational-3d/references/06-validation.md` |
| 本线专属坑表 | `vocational-3d/references/07-pitfalls.md` |
| 可直接改名开工的课件骨架 | `vocational-3d/templates/lesson-scaffold.js` |
| 交付前自检清单 | `vocational-3d/templates/checklist.md` |
| 样板：直列四缸汽油机 | `courses/engine4-step.html` + `build/lessons3d/engine4-step.js` |

## 共用资产

职教线不自带引擎副本，与本仓库共用：`assets/kit3d.js`（含 `K.envShop` / `K.rbox` / `K.tag` / `K.boot`）、
`assets/vendor/`（three r147 UMD + 后期插件）、`scripts/`（`selftest` / `check` / `views` / `pick` / `behavior_probe`）。

真实 CAD `.glb` 可操纵仿真（机械臂、URDF、IK、抓放）仍走子技能 `robot-glb-sim/`，由职教线在需要时转接。
