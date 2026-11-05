# 06 · 验证与交付

## 0. 铁律：必须用硬件 GPU 截图

```js
chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
})
```

软件渲染（SwiftShader）跑不出 `PMREMGenerator` 的环境贴图 → **金属全部发灰、玻璃发白、帧率 2–8 fps**。
在软渲染下调材质 = 越调越假。本线所有的"金属像搪瓷/塑料"事故都源于此。

## 1. 三步验证

```bash
# ① 构建（顺带校验 lesson 语法与 META 注册）
python build/build_chem.py engine4-step
# → built engine4-step  841404 bytes

# ② 逐步截图 + 报错扫描（每步停 1.8s 让相机 tween 与补间收敛）
node build/shot-page.js courses/engine4-step.html engine4 1800
# → {"steps":6,"calls":967,"tris":80974,"geos":496,"tex":18,"cam":{...}}
# → NO-ERRORS

# ③ 九步遍历（抓 pageerror / console.error）
node build/check-quick.js courses/engine4-step.html
```

判读指标：

| 指标 | 期望 | 超了怎么办 |
|---|---|---|
| `steps` | 与 lesson 的 steps 数一致 | META 里 `steps` 写错 |
| `calls` | ≤ 1200 | 合并重复件、共享材质、减少独立 mesh |
| `tris` | ≤ 550000（本线通常 8–12 万） | 降细分段数、去掉不可见面 |
| `tex` | ≤ 24 | 合并 canvas 贴图 |
| 报错 | NO-ERRORS | 逐条修，别放过 |

## 2. 不能只看正面一张图

多机位才能暴露问题：

```bash
node build/wc-views.js courses/engine4-step.html engine4 0     # 7 机位
```

必看的四个角度：

1. **默认机位**（学生第一眼）
2. **正面平视**（剖切面是否成立、内部有没有空洞）
3. **俯视**（孔位对齐、活塞是否在孔里、腔体有没有漏）
4. **侧视**（壁厚、悬空、接地）

曾经只有俯视才发现的三个问题：活塞周围没有缸套、凸轮悬在气门上方 0.28、曲轴平衡重插进曲轴箱底板。

## 3. 行为探针（证明"真的能点、真的会动"）

```js
/* 网格扫一遍画面，统计能弹出零件名的点位 */
for (var y = 180; y <= 520; y += 40)
  for (var x = 300; x <= 700; x += 40) {
    await page.mouse.move(x, y);
    var t = await page.evaluate(() => {
      var el = document.querySelector('.lab-tip');
      return el && el.style.display === 'block' ? el.textContent.trim() : '';
    });
    if (t) found.push(t);
  }
// 期望：hits > 20，且覆盖核心零件（缸盖/凸轮轴/气门室盖/活塞/连杆/曲轴/油底壳）
```

拆解验证：

```js
await page.click('#next'); // 到第 5 步
await page.click('#sCtrls button:last-child');   // 展开/合拢
var v = await page.evaluate(() => document.querySelector('#sCtrls input[type=range]').value);
// 期望 "90"，且截图里缸盖抬起、油底壳在台面上
```

## 4. 像素取样（别凭肉眼猜颜色）

```bash
node build/pick.js courses/engine4-step.html "600,500;500,600"
```

用来验证关键面的亮度/色相：剖切内部是否死黑（< 0.05）、台面是否被 gamma 抬成惨白（> 0.8）。

## 5. 交付清单

见 `templates/checklist.md`。打印出来逐条打勾，**任何一条不勾都不算交付**。

## 6. 已知的模型简化（必须在页面上如实声明）

职教课件不等于工程图纸。以下简化要写进页面（面板脚注或"说明"步骤），别让学生误以为是实测数据：

- 截面形状简化（真实铸件有拔模斜度、圆角半径不等）
- 未建模的零件（水套、油道、线束、传感器）
- 材料近似（单一钢/铝，未区分牌号）
- 运动学理想化（无摩擦、无间隙、无弹性变形）
