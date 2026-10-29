# 第三方参考声明

本仓库的文档与脚本为原创，写作过程中参考了以下公开资料。
**仅参考做法与参数，未复制其代码、文案或美术素材。**

| 项目 / 资料 | 许可 | 参考内容 |
|---|---|---|
| [tongjiang-lab](https://github.com/smithjohn78390/tongjiang-lab)（铜匠实验室） | **CC BY-NC 4.0（禁止商用）** | 单文件 3D 课件的形态、`RoomEnvironment` 环境贴图、`LineLoop` 画玻璃口沿、玻璃材质参数（ior/roughness/transmission 的取值思路） |
| [three.js](https://threejs.org) | MIT | `MeshPhysicalMaterial` 的 transmission/thickness/attenuation 语义、`PMREMGenerator` |
| [Codrops: Transparent Glass and Plastic in Three.js](https://tympanus.net/codrops/2021/10/27/creating-the-effect-of-transparent-glass-and-plastic-in-three-js/) | 文章（引用观点） | `thickness` 产生折射的原理与边界 |
| [molecular-lab](https://github.com/Sherin-SEF-AI/molecular-lab) | 见仓库 | 分子模型：CPK 配色、原子半径、键长键角数据 |

## 使用边界

- 本仓库的 **MIT 许可不覆盖** 上述第三方内容。
- `tongjiang-lab` 为 **CC BY-NC 4.0**：可以学习其思路，**不可**将其代码、文案、素材用于商业产品，
  也不建议照搬其页面视觉做产品混淆。
- 文中出现的材质参数（如 `ior: 1`、`roughness: .15`）属于技术事实，不构成对第三方表达的复制。
