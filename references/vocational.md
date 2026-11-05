# 职业教育线 · 轻量开源方案（不下载大部头）

## 定位
面向实训 / 工种 / 真实设备还原 / 精模 / 工业仿真（机械臂、产线、仪器）。
本技能主干是子技能 `robot-glb-sim/`：真实 CAD `.glb` 可操纵机械臂仿真，含 URDF 装配、数值 IK、
抓放状态机、CSP 安全加载、网格减面（已验证 9.4MB→3.1MB）。本文件补两条：
① 一条**不下载重型软件**的轻量资产工具链；② 当没有现成开源 `.glb` 时，**纯前端程序化精模**的替代路线。
两条线共用同一引擎 `assets/kit3d.js` 与 `scripts/` 验证脚本。

## 核心约束（用户硬要求）
**轻量、开源优先，不下载 Blender / Fusion 360 / SolidWorks / Rhino / Substance / ZBrush 等大部头。**
高仿真 + 单件精细 ≠ 重型 DCC；职教设备多为规则几何，程序化精模与开源资产即可达标。

## 轻量开源工具链

| 环节 | 方案 | 说明 |
|---|---|---|
| 主建模（精确设备） | **程序化精模**：`build/make_models.html` 的 `Extrude`+倒角/旋转/布尔 生成 `.glb` | 规则几何（管道/阀门/电机/齿轮/仪表/换热器）最精确、零体积膨胀、风格统一；仓库已验证 |
| 参数化辅助 | **OpenSCAD / SolveSpace / CadQuery(build123d)**（开源、数 MB~数十 MB） | 脚本化精确建模，导出 glTF 再转 .glb，避免手雕 |
| 现成资产 | **开源 CC0 / Apache**：TRLC-DK1 URDF 机械臂、Kenney、ambientCG 的 PBR 纹理 | 仅取带明确许可的；robot-glb-sim 已用 TRLC-DK1 |
| PBR 材质 | 程序化 PBR（three.js 内生成 metalness/roughness/法线噪声）+ CC0 纹理 | 不装 Substance |
| 减面/压缩 | **gltf-transform**（`weld → simplify --ratio 0.2 --error 0.01 → quantize`，注意是 `--quantize-position`） | robot-glb-sim 已验证：9.4MB→3.1MB，19s→1.5s |
| 单文件内嵌 | base64 内联 + CSP 安全加载：`atob → Uint8Array.buffer → loader.parse()`（**禁 `loader.load("data:")`**，会被预览 CSP 拦） | 见 robot-glb-sim 硬坑 1 |
| 压缩扩展 | **Draco**（几何）+ **KTX2**（纹理），three.js 生态开源 | 单文件离线控体积与首屏 |

## 工程红线（职业教育线）
1. **几何精度**：真实设备比例/尺寸/孔位/配合还原，非示意。
2. **PBR 真实**：金属/塑料/漆面/玻璃分材质；加载后 `_upMat` 按色号升级（橙壳清漆/钢件亮金属/石墨反光，emissive 保留），**保留导出 PBR 主体**，仅统一 envMap/曝光，勿整体覆盖冲掉高精材质。
3. **可拆解 / 可交互**：职教核心是结构认知与拆装——零件可分离、引线/标注零件名与原理；铰接按真实运动副驱动，关节节点命名对齐 IK/运动副（参考 robot-glb-sim 的 `rob/jShoulder/jElbow/jWrist/grip/fingerL/R`）。
4. **压缩与性能**：高精 `.glb` 必须 减面(gltf-transform) + Draco/KTX2 + LOD + 按需加载；单文件离线下控 HTML 体积与首屏。教室核显 ≤55 万三角形红线靠压缩+LOD 兜底，单件可适度放宽但须验证帧率（见根 SKILL.md §6）。
5. **一致性**：统一光照/曝光/后期，零件间亮度一致；金属反射统一用 `scene.environment`(PMREM)，非 PMREM 自制 envMap 会挡掉它。
6. **资产溯源**：引入外部资产须登记来源与许可（CC0/Apache 等），不破坏仓库开源可溯原则。

## 能力边界（诚实）
- 程序化精模 + 轻量开源资产能达到**高精度工程还原 + 扎实 PBR**，覆盖绝大多数规则设备。
- 强有机 / 复杂曲面 / 影视级照片资产能力有限；真需要时再评估轻量工具，仍优先开源。

## 与素质教育线的关系
素质教育线（根 SKILL.md 正文 + `references/detail-rules.md`）管自然场景红线（水面等值线裁剪、解析法线地形等）；
职业教育线管真实设备。两者共用引擎与验证脚本。分流判断见根 SKILL.md `## 0.0` 段。
