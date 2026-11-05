# 参考实现与检索清单

## 参考：铜匠实验室（Tongjiang Lab）—— 可选，非必查

- 仓库：https://github.com/smithjohn78390/tongjiang-lab
- 站点：https://lab.tongjiang.app
- 规模：54 节（物理 10 / 化学 25 / 生物 5 / 地理 14），对齐中国高中课标与人教版 2019 教材
- 形态：**每节一个自包含 HTML（约 1MB）**，双击打开、断网可用、可投屏/白板
- 索引：`catalog.json`（每节课的教材位置与步骤数）
- 技术线索（读源码可得）：
  - `<canvas id="gl" data-engine="three.js r186">`
  - `WebGLRenderer` / `MeshStandardMaterial`（约 56 处）/ `MeshPhysicalMaterial`（约 6 处）
  - `RoomEnvironment` + `PMREMGenerator.fromScene`（影棚反射）
  - `LineLoop` / `LineSegments` / `EllipseCurve`（玻璃口沿靠线条）
  - `CanvasTexture` + `SpriteMaterial`（标注是 billboard）
  - 玻璃参数：`color #ffffff, metalness 0, roughness .15, ior 1, transmission 1, thickness 可变, attenuationColor/Distance`
  - 有 `R=8.314 / T=303.15 / Ea≈4e4` 的阿伦尼乌斯速率，但没有 pH 求解（`log10` 零次）
- **许可：CC BY-NC 4.0（禁止商用）**
  - 可以：学思路、学参数、学工程组织
  - 不可以：复制其代码/文案/素材用于商业产品；照搬其 UI 视觉做混淆
  - 合规动作：three.js 是 MIT（保留许可声明即可商用）；我们的实现独立编码，
    参数（ior/roughness/transmission）属于技术事实，不受著作权保护

## 其他参考

| 项目 | 可参考什么 |
|---|---|
| `Sherin-SEF-AI/molecular-lab` | 分子模型：CPK 配色、原子半径、键角/键长数据 |
| Codrops《Transparent Glass and Plastic in Three.js》 | `transmission` + `thickness` 产生折射的原理与边界 |
| three.js `MeshPhysicalMaterial` 官方文档 | `transmission` 非零时 `opacity` 必须为 1；`thickness` 用网格局部单位 |
| `anbeime/skill`（THREEJS_MATERIAL_REFERENCE） | 材质参数区间表（清漆塑料/磨砂玻璃/陶瓷等） |

## 检索命令模板

```
# 找同类课件
site:github.com three.js chemistry lab simulation MeshPhysicalMaterial transmission
github 铜匠实验室 tongjiang-lab 3d 课件

# 找材质参数
three.js MeshPhysicalMaterial glass transmission thickness attenuationColor
three.js RoomEnvironment PMREMGenerator fromScene example

# 找交互/拾取
three.js raycaster hover tooltip sprite canvas text label
```

## 抓取同类页面源码（用于学习，不用于复制）

```js
// scripts/grab.js 思路：用 playwright 打开页面，等渲染，保存 HTML 与 JS 资源清单
page.on('response', r => { if ((r.headers()['content-type']||'').includes('javascript')) urls.push(r.url()) })
await page.waitForTimeout(9000)
fs.writeFileSync('ref.html', await page.content())
```

抓到后 grep 关键字即可：`transmission:`、`ior:`、`thickness:`、`RoomEnvironment`、
`LineLoop`、`SpriteMaterial`、`InstancedMesh`、`intensity:`。
