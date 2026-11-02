---
name: robot-glb-sim
description: 用 Three.js + 真实 CAD .glb 模型搭建可操纵的六轴机械臂仿真（单文件离线 HTML）。当用户要求"机械臂仿真 / 机器人仿真 / .glb 模型机械臂 / URDF 机械臂 / 操纵机械臂"等任务时使用。涵盖 URDF 运动学装配、数值 IK、抓取-放置状态机、内嵌资源的 CSP 安全加载、网格减面，以及本项目踩过的全部硬坑。
agent_created: true
---

# robot-glb-sim — Three.js + 真实 GLB 机械臂仿真

用真实 CAD `.glb` 网格（而非程序化几何）搭建**可操纵**的六轴机械臂：操纵杆 + 关节滑块 + IK 点选 + 抓取料箱 + 自动演示，输出单文件离线 HTML。本技能沉淀了完整跑通并验证过的一条流水线和六个致命坑。

## 什么时候用

- 用户要机械臂/机器人仿真，希望"有真实感/像真机"
- 用户提到 .glb / URDF / 六轴 / IK / 操纵杆
- 已有程序化机械臂想升级为真实模型

## 流水线（五步）

### 1. 素材：选带 URDF 的开源机械臂

优先选**URDF + 分连杆 GLB 网格**的开源臂（例：TRLC-DK1，Apache-2.0，
`github.com/andreaskoepf/trlc-dk1-follower-urdf`，meshes/visual/ 下每个 link 一个 .glb）。
有了 URDF 就有精确的关节原点/轴向/限位，不用目测调。下载用 raw.githubusercontent.com，
偶发 0 字节文件必须重试并校验。

### 2. 装配：按 URDF 运动学链建 Group 层级

- URDF 是 z-up、米制；three 是 y-up → `robotRoot.rotation.x = -Math.PI/2` 翻转，`scale = S`（米→场景单位，示例 5）
- 每个 link 一个 Group：`position = joint.origin`，绕 `axis`（注意 `(0,-1,0)` 之类的负轴要乘 sign）
- 夹爪若为 prismatic，双指沿 ±y 平移；TCP 按 URDF 的 tool0 偏移加一个 Object3D
- 详见 `references/pitfalls.md` 第 1 节的装配代码骨架

### 3. 控制：滑块/操纵杆 + 数值 IK

- 解析 2 连杆 IK 对真实限位**基本不可用**（真实臂关节限位奇形怪状）。直接上**数值 IK**：
  多起点坐标下降 + 关节限位 + "贴近当前位姿"正则项，纯矩阵 FK（不用场景图，不闪屏）
- 成本函数 = 位置误差² + 0.008·Σ(Δ角)²，**任何姿态偏好权重必须 ≤0.01**（见坑 4）
- 操纵杆与 J1/J2 滑块双向同步；速度用阻尼 `cur += (tgt-cur)*(1-exp(-speed*60*dt))`

### 4. 交付：单文件内嵌 + CSP 安全加载

- 构建脚本内联 `three.min.js(r147 UMD)` + postfx 各 js + `GLTFLoader.js` + 9 个 glb 的 base64
- **绝不用 `loader.load("data:URI")`** —— 内置预览的 CSP（connect-src 'self'）会拦 fetch(data:)，
  全部模型静默加载失败。必须 `atob → Uint8Array.buffer → loader.parse(buffer,'',cb)`（零 fetch）
- 减面压体积：`gltf-transform weld → simplify --ratio 0.2 --error 0.01 → quantize`（参数是
  `--quantize-position` 不是 `--positions`），9.4MB→3.1MB，加载 19s→1.5s

### 5. 验证：Playwright + 真 GPU

必须 `channel:'chrome'` + `--use-angle=d3d11`（SwiftShader 会误判材质与耗时）。
验证项：模型件数与控制台零错误、`__tip()` 世界坐标、IK err、`__held()` 抓取、
搬运跟随距离、放置落点、阶段截图。脚本模板见 `scripts/verify_template.js`。

## 硬坑速查（细节与代码在 references/pitfalls.md）

| # | 坑 | 一句话修法 |
|---|----|-----------|
| 1 | fetch(data:) 被 CSP 拦，模型全消失 | base64→ArrayBuffer→`loader.parse()` |
| 2 | SSAO 在浅色大平面留方块状"假墙" | 移除 SSAOPass，接地感用 blob 阴影 |
| 3 | IK 永远解不到某个方向 | 目标必须在 J1 转角锥体内（如 ±120°），先验算方位角 |
| 4 | IK 定位误差莫名 20cm | 姿态偏好权重 ≤0.01（局部米制下 d2 极小） |
| 5 | 抓住的物体乱甩/沉入台面/放下歪 45° | 入座局部坐标刚性跟随 + 落座吸附 + 松爪摆正到 90° |
| 6 | 单文件 13MB 加载 19 秒 | gltf-transform 减面+量化；加载进度逐件提示 |

## 参考文件

- `references/pitfalls.md` — 每个坑的完整原因、代码骨架（装配 / 数值IK / 抓放状态机 / 摆正）
- `scripts/verify_template.js` — Playwright 真 GPU 验证模板（改探针即用）
