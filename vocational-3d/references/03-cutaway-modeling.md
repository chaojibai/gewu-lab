# 03 · 整机剖切建模法

设备课件 80% 的"像不像"由**剖切**决定。这一篇是核心方法论，全部来自跑通过的直列四缸机（`courses/engine4-step.html`）。

## 0. 先否掉三种偷懒做法

| 做法 | 结果 | 为什么不行 |
|---|---|---|
| 外壳用 `transparent + opacity .15` 全透明 | 活塞、连杆、曲轴像**浮在半空** | 透明壳不提供任何遮挡与接触线索，眼睛读不到"在腔里" |
| 外壳 `visible = false` 直接隐藏 | 整机变成**零件堆** | 失去装配关系，看不出谁装在谁上 |
| 按装配顺序把零件摊开（explode 当默认态） | 像**爆炸图**，不是设备 | 教学第一眼要看到"一台设备"，拆解是交互结果 |

正确做法只有一种：**实心剖切**——把壳体做成真实铸件，只切掉朝向默认机位的那一层壳。

## 1. 半剖原则

```
        默认机位（相机）
             ↓  +z
   ┌─────────────────────┐
   │  后壁（实心）        │   ← 保留
   │  ┌───┐  ┌───┐       │
   │  │孔 │  │孔 │       │   ← 腔体保留后半，正面剖开
   │  └───┘  └───┘       │
   │  侧壁（实心）        │   ← 保留
   └─────────────────────┘
        +z 面：去掉（剖开面）
```

- **保留**：左右侧壁、后壁、底板、顶板（顶板可用带孔板）。
- **去掉**：+z 那一整面（正对默认机位的那面）。
- 侧壁/后壁用**整块 Box**（有壁厚 0.5–0.6），不是薄片。

```js
var W = 16.4, Z = 4.9, th = .6, H = DECK - BLOCK_BOT, cy = (DECK + BLOCK_BOT) / 2;
[-1, 1].forEach(function (s) {                       // 左右侧壁
  var wall = RM(th, H, Z, .12, MAT.blockSolid);
  wall.position.set(s * (W / 2 - th / 2), cy, 0); g.add(wall);
});
var back = RM(W - 2 * th, H, th, .12, MAT.blockSolid);   // 后壁
back.position.set(0, cy, -Z / 2 + th / 2); g.add(back);
/* +z 面不加任何东西 = 剖切 */
```

## 2. 孔必须有孔壁（最容易漏的一步）

只在内腔画一个"孔口圆环"（Torus）不够：活塞走到行程中段时，四周什么都没有，看起来就是悬空。

```js
/* 缸套：保留后半圆 + 断口壁厚棱边 + 内壁深色层 */
var linH = DECK - 2.05;
for (var i = 0; i < 4; i++) {
  var outer = new T.Mesh(new T.CylinderGeometry(BORE_R + .14, BORE_R + .14, linH, 34, 1, true, Math.PI / 2, Math.PI), MAT.linerSolid);
  outer.position.set(XS[i], 2.05 + linH / 2, 0); g.add(outer);
  var inner = new T.Mesh(new T.CylinderGeometry(BORE_R + .02, BORE_R + .02, linH, 34, 1, true, Math.PI / 2, Math.PI), MAT.linerIn);
  inner.position.copy(outer.position); g.add(inner);
  [-1, 1].forEach(function (s) {                      // 剖切断面：壁厚棱边
    var edge = new T.Mesh(new T.BoxGeometry(.15, linH, .15), MAT.linerSolid);
    edge.position.set(XS[i] + s * (BORE_R + .08), outer.position.y, 0); g.add(edge);
  });
  var ring = new T.Mesh(new T.TorusGeometry(BORE_R + .07, .055, 8, 40), MAT.steelD);  // 孔口
  ring.rotation.x = Math.PI / 2; ring.position.set(XS[i], DECK - .04, 0); g.add(ring);
}
```

**`CylinderGeometry` 的 theta 换算**（记住这一个结论）：

| 想要的半圆 | thetaStart | thetaLength |
|---|---|---|
| z ≤ 0（后半个，最常用） | `Math.PI / 2` | `Math.PI` |
| z ≥ 0（前半个） | `-Math.PI / 2` | `Math.PI` |

因为 three 的圆柱顶点是 `x = r·sin(θ)`、`z = r·cos(θ)`：θ=π/2 得到 (r,0)，θ=π 得到 (0,−r)，θ=3π/2 得到 (−r,0)。半圆必须 `side: DoubleSide`，否则从内侧看是空的。

## 3. 腔体之间要有隔板（"空架子"的根因）

一整排气缸和曲轴之间如果什么都没有，整机会读成一个**铁丝笼子**。真实铸件在相邻缸之间有一道横壁（主轴承座上方那道壁）。

```js
/* 缸间隔板：5 道，落在主轴承座正上方 */
for (var i = 0; i < 5; i++) {
  var bw = RM(.6, DECK - 2.2, Z - 2 * th, .12, MAT.blockSolid);
  bw.position.set((i - 2) * SPACING * .98, (DECK + 2.2) / 2, 0);
  g.add(bw);
}
```

隔板高度要从"曲轴让位"处开始（本例 `y = 2.2`，曲拐最高点 1.92 + 余量），不能砍到轴。

## 4. 带孔板：`plateGeo` 撑起半个剖切模型

缸盖底板、法兰、带孔盖板全靠它（`ExtrudeGeometry` + `Path.absarc` 挖孔）。

```js
function plateGeo(w, d, thk, holes) {          // holes = [[x, y, r], ...]，坐标在 XZ 平面
  var s = new T.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
  holes.forEach(function (h) {
    var p = new T.Path(); p.absarc(h[0], h[1], h[2], 0, Math.PI * 2, true); s.holes.push(p);
  });
  var geo = new T.ExtrudeGeometry(s, { depth: thk, bevelEnabled: false, curveSegments: 20 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -thk, 0);        // 旋转后板占 [−thk, 0]，position.y 即板顶
  return geo;
}
```

用途与孔位：

- 缸盖**底面**：4 个缸孔通孔（`r = BORE_R + .02`）——没有它，缸盖只是一圈墙。
- 缸盖**顶面**：8 个气门导管孔（`r = .7`）+ 4 个火花塞孔（`r = .3`）——气门杆"穿"过去。
- 法兰盘：一圈螺栓孔。

## 5. 燃烧室必须有真实容积

新手常把气门座直接做在缸体上表面，于是活塞顶到缸盖只剩 0.2 的缝，气门盘**夹在缝里看不见**。

正确分层（自下而上）：

```
活塞上止点            y = 7.2
缸体上平面 DECK       y = 7.5   ← 缸垫 0.1
缸盖底面（带 4 缸孔）  y = 7.5 + .40   ← 厚 0.18
燃烧室（后半圆凹窝）    y = 7.5 + .40 ~ 1.05   ← 容积 ≈ 0.65
缸盖顶面（带 12 孔）    y = 7.5 + 1.05
气门盘坐在燃烧室里      y = 7.5 + .62
弹簧座在缸盖顶面上
```

```js
var hbase = new T.Mesh(plateGeo(W - 1.1, Z - 1.1, .18, boreHoles), MAT.headSolid);
hbase.position.y = DECK + .40; g.add(hbase);

for (i = 0; i < 4; i++) {                                   // 燃烧室：后半圆凹窝
  var ch = new T.Mesh(new T.CylinderGeometry(BORE_R + .02, BORE_R + .02, .65, 30, 1, true, Math.PI / 2, Math.PI), MAT.headSolid);
  ch.position.set(XS[i], DECK + .725, 0); g.add(ch);
}
var roof = new T.Mesh(plateGeo(W - 1.1, Z - 1.1, .2, valveAndPlugHoles), MAT.headSolid);
roof.position.y = DECK + 1.05; g.add(roof);
```

这样从正面看进去，能同时看到：气门盘坐在燃烧室里、气门杆穿过顶板、弹簧压在顶板上、凸轮压在弹簧上座。**四层关系全在**。

## 6. 曲面零件：极坐标 Shape + 挤出

凸轮桃形不能拿"圆盘 + 球"拼，必须用极坐标轮廓挤出：

```js
function lobeGeo() {
  var s = new T.Shape(), N = 56;
  for (var i = 0; i <= N; i++) {
    var th = i / N * Math.PI * 2;
    var d = Math.cos(th - Math.PI / 2);                        // 鼻尖朝 +y
    var r = .44 + MAXLIFT * Math.pow(Math.max(0, d), 3.4);     // 基圆 + 升程包络
    var px = Math.cos(th) * r, py = Math.sin(th) * r;
    i === 0 ? s.moveTo(px, py) : s.lineTo(px, py);
  }
  var geo = new T.ExtrudeGeometry(s, { depth: .5, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 1, curveSegments: 2 });
  geo.translate(0, 0, -.25);                                    // 厚度居中
  return geo;
}
// 用法：mesh.rotation.y = Math.PI / 2 → 挤出方向（局部 z）对齐到世界 x 轴
```

同法可做：齿轮轮廓、异形法兰、键槽截面、棘轮。

## 7. 盆形件（油底壳、机罩、箱体）

不要用一块平板加一个盒子，要做成**真正的盆**：底板 + 四壁 + 顶法兰 + 内部挡板 + 螺栓孔。

```js
var W = 12.4, D = 4.2, botY = -3.98, topY = -2.36, h = topY - botY, midY = (topY + botY) / 2;
var bot = RM(W + .2, .3, D + .2, .18, MAT.pan); bot.position.set(0, botY, 0); g.add(bot);
[-1, 1].forEach(function (s) {
  var lw = RM(W + .3, h, .3, .1, MAT.pan); lw.position.set(0, midY, s * (D / 2)); g.add(lw);     // 长壁
  var ew = RM(.3, h, D, .1, MAT.pan);      ew.position.set(s * (W / 2), midY, 0); g.add(ew);     // 端壁
  var fl = RM(W + .8, .22, .62, .08, MAT.pan); fl.position.set(0, topY, s * (D / 2 + .1)); g.add(fl);  // 法兰
});
```

## 8. 铸件质感：颗粒贴图 + 机加工亮边

**大平面无纹理 = 塑料**。铸件用 canvas 噪声当 `map` + `bumpMap`：

```js
function castTex(rep) {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var x = c.getContext('2d'), i;
  x.fillStyle = '#f2f4f6'; x.fillRect(0, 0, 128, 128);
  for (i = 0; i < 4200; i++) {                                // 铸铁麻点
    var g = 196 + Math.floor(Math.random() * 58);
    x.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',' + (.30 + Math.random() * .45).toFixed(2) + ')';
    x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, .3 + Math.random() * 1.5, 0, Math.PI * 2); x.fill();
  }
  var t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 4, rep || 4);
  return t;
}
MAT.blockSolid = new T.MeshStandardMaterial({ color: 0x8d99a6, metalness: .8, roughness: .44, map: t, bumpMap: t, bumpScale: .026 });
```

**剖切面要有机加工亮边**（剖切模型都有一圈亮边），单独一条高金属度薄板贴在剖开面上：

```js
var cut = new T.Mesh(new T.BoxGeometry(th + .05, H, .16), MAT.cutFace);   // 0xc3ccd6, metalness .88, roughness .24
cut.position.set(s * (W / 2 - th / 2), cy, Z / 2 - .08);
```

## 9. 分件与装配层级

```js
O.eng = new T.Group();                 // 整机
  ├─ O.block   (缸体，含缸套/隔板/轴承座/滤清器/油尺)
  ├─ O.pistons[0..3]  O.rods[0..3]
  ├─ O.crank   (主轴 + 4 曲拐 + 飞轮 + 皮带轮)
  ├─ O.headAsm (缸盖 + 底板 + 燃烧室 + 8 气门 + 弹簧 + 双凸轮 + 火花塞 + 气门室盖)
  └─ O.panAsm  (油底壳)
```

- **可拆总成**必须是独立 `Group`，拆解时整体位移（缸盖抬起、油底壳抽出）。
- 拆解时整组的孩子自动跟随 → 不要把孩子挂到整机根上。
- `K.tag()` 打在**零件网格**上（不是 Group），引擎会向上找父级，所以打在 Group 上也行，但打在具体 mesh 上描述更准。

## 10. 比例基准（直列四缸，可直接复用）

| 量 | 值 | 说明 |
|---|---|---|
| 缸径半径 `BORE_R` | 1.5 | 缸心距 `SPACING = 3.95`（缸径 + 壁厚） |
| 曲柄半径 `CRANK_R` | 1.5 | 行程 = 3，缸径:行程 ≈ 1:1（方机） |
| 连杆长 `ROD_L` | 5.0 | 连杆比 λ = r/L ≈ 0.3，接近乘用车 |
| 缸体上平面 `DECK` | 7.5 | |
| 缸体底 `BLOCK_BOT` | -2.4 | 曲轴中心 0 |
| 气门最大升程 | .55 | 升程/缸径 ≈ 0.18 |
| 凸轮基圆 | .44 | 鼻尖半径 = 基圆 + 升程 |
| 缸盖抬起距离 | 6.2 | 拆解用 |

## 11. 放大 5–8 倍后的自检表

```
[ ] 每个孔都有壁；中位活塞/轴不"悬空"
[ ] 腔体之间有隔板；不是空架子
[ ] 剖切面有壁厚、有亮边，不是零厚度纸片
[ ] 大平面有颗粒；不是纯色塑料
[ ] 旋转件有母线/端盖/倒角，不是一段光管
[ ] 螺栓/销/垫片这些小件在位（它们提供"装配"证据）
[ ] 所有零件都落在支撑面上（不悬空、不穿地）
[ ] 拆解方向物理可行（沿装配方向、不穿台面、不互插）
[ ] 相邻件不互穿（尤其曲轴平衡重 vs 缸体底板）
```
