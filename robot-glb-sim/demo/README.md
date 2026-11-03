# robot-glb-sim · 可运行演示（demo）

本目录是 `robot-glb-sim` 技能的**完整可运行成品**：真实 CAD 网格六轴机械臂仿真，
单文件离线 HTML，双击即可打开，无需服务器、无需联网、无需任何依赖。

## 立即运行

| 文件 | 说明 | 大小 |
|---|---|---|
| `robot-arm-glb.html` | **主成品**：真实 .glb CAD 模型版（内嵌全部资源） | ~4.9 MB |
| `robot-arm.html` | 对照版：程序化几何机械臂（无模型依赖，更轻量） | ~0.7 MB |

直接用 Chrome / Edge 打开 `robot-arm-glb.html` 即可。

## 功能

- **操纵杆**：控制 J1 基座回转 / J2 大臂俯仰（与滑块双向同步）
- **六个关节滑块**：全部带软限位，实时角度读数
- **IK 点选**：开启后点击地面/料箱，末端数值 IK 直达目标
- **抓取**：夹爪移到蓝色料箱上方 → 夹紧即抓起，移走再张开即放下（自动落座吸附 + 摆正）
- **自动演示**：九阶段抓-放状态机（张开→接近→下降→夹→提升→移位→下降→松爪→回位）
- **末端坐标实时读数**：正向运动学解算 TCP 世界坐标
- **后期特效开关**：Bloom + ACES（注意：刻意不用 SSAOPass，见坑 2）

预览截图见 `preview/`（home / grab / ik / carry / shot 五个阶段）。

## 目录结构

```
demo/
├── robot-arm-glb.html      # 构建成品：单文件离线 HTML（内嵌 three + postfx + GLTFLoader + 9 个 glb base64）
├── robot-arm-glb.src.html  # 构建源码（占位符 /*THREEJS*/ /*POSTFX*/ /*GLTFLOADER*/ /*GLB_ASSETS*/）
├── robot-arm.html          # 程序化对照版（构建成品）
├── robot-arm.src.html      # 程序化对照版源码
├── build_robot_glb.py      # GLB 版构建脚本（python3 标准库，无依赖）
├── build_robot.py          # 程序化版构建脚本
├── dk1.urdf                # TRLC-DK1 六轴臂 URDF 运动学描述（关节原点/轴向/限位的唯一事实来源）
├── vendor/                 # three.min.js (r147 UMD) + postfx 全套 + GLTFLoader.js
├── assets/glb/             # 9 个减面+量化后的分连杆网格（gltf-transform 处理，9.4MB→3.1MB）
└── preview/                # Playwright 真 GPU 验证截图
```

## 重新构建（改动源码后）

```bash
cd demo
python build_robot_glb.py    # 产出 robot-arm-glb.html（会先做 node --check 语法自检）
python build_robot.py        # 产出 robot-arm.html
```

只改 `assets/glb/` 或 `vendor/` 后重跑脚本即可；`/*GLB_ASSETS*/` 占位符由脚本按
`base_link, link1-2 … finger_left, finger_right` 顺序注入 base64 表。

## 验证结果（Chrome + D3D11 真 GPU）

- 模型加载：9/9 件，1.7s 完成，控制台零报错
- `window.__tip()` TCP 世界坐标、`window.__ik(x,y,z)` 数值 IK、`window.__held()` 抓持状态
  均可通过 DevTools 控制台直接调用
- 回归脚本模板见上级目录 `scripts/verify_template.js`

## 素材许可

机械臂网格与 URDF 来自 TRLC-DK1 开源项目（Apache-2.0）。
本仓库其余代码按仓库根目录 LICENSE 分发。
