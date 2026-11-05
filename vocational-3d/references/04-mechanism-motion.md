# 04 · 机构运动（由约束算，不由时间线摆）

设备课件的"动"，必须是**几何约束的结果**。凡是"看起来在动"但和参数无关的，都是假的，学生一问就穿。

## 1. 滑块-曲柄（曲柄连杆机构）

```
       活塞（只有 y 方向自由度）
          │
          │ 连杆 L
          │
       曲柄销（绕曲轴中心画圆，半径 r）
          │
        曲轴中心（原点）
```

活塞销高度（曲轴中心为 0，向上为正），β 从"上止点"起算：

```js
function pistonY(beta) {
  var s = CRANK_R * Math.sin(beta);
  return CRANK_R * Math.cos(beta) + Math.sqrt(ROD_L * ROD_L - s * s);
}
// beta = 0   → y = r + L  = 上止点（TDC）
// beta = π   → y = L - r  = 下止点（BDC）
```

曲柄销位置：`(x = 缸心, y = r·cosβ, z = r·sinβ)`。

连杆姿态不要算欧拉角，**用两端点定**：

```js
var pinWorld = new T.Vector3(0, CRANK_R * Math.cos(b), CRANK_R * Math.sin(b));  // 曲柄销
var pisWorld = new T.Vector3(0, pistonY(b), 0);                                  // 活塞销
var dir = pisWorld.clone().sub(pinWorld).normalize();
rod.position.copy(pinWorld.clone().add(pisWorld).multiplyScalar(.5));            // 摆在中点
rod.quaternion.setFromUnitVectors(UP, dir);                                      // 连杆局部 +y 对齐
```

要求：连杆模型的**局部原点在几何中心、局部 +y 指向小头**，否则中点/朝向都会错。

## 2. 四冲程相位（多缸错相与点火顺序）

一个完整循环 720°（曲轴两圈）。四缸按 **1-3-4-2** 点火，相位与曲拐布置必须自洽：

```js
var CYC = 4 * Math.PI;                       // 720°
var CYC_PHASE = [0, 3 * Math.PI, Math.PI, 2 * Math.PI];   // 1/2/3/4 缸的循环起点
var THROW     = [0, Math.PI, Math.PI, 0];                 // 曲拐相位：1、4 同向，2、3 反向

function betaOf(theta, i) {                  // 该缸从"做功上止点"起的角
  var b = (theta - CYC_PHASE[i]) % CYC;
  return b < 0 ? b + CYC : b;
}
function strokeOf(b) {                      // 冲程名（给读数面板）
  b = b % CYC;
  if (b < Math.PI) return '做功';
  if (b < 2 * Math.PI) return '排气';
  if (b < 3 * Math.PI) return '进气';
  return '压缩';
}
```

验证：θ 从 0 扫到 720，做功缸的顺序应是 1 → 3 → 4 → 2，每 180° 换一个。

## 3. 凸轮与气门

### 3.1 转速关系

四冲程里气门每 720° 开关一次 → **凸轮轴转速 = 曲轴的一半**：

```js
camIn.rotation.x = theta * .5;
camEx.rotation.x = theta * .5;
```

### 3.2 升程包络

```js
function valveLift(b, center, half) {        // 余弦包络：0 → 满升程 → 0
  var d = b - center;
  if (Math.abs(d) >= half) return 0;
  return .5 * (1 + Math.cos(Math.PI * d / half));
}
var IN_C = 2.5 * Math.PI, EX_C = 1.5 * Math.PI, VHALF = .62 * Math.PI;   // 进气在压缩上止点前开
```

- 进气门中心定在 `2.5π`（进气行程中点），排气门 `1.5π`（排气行程中点）。
- 半宽 `.62π` > `.5π` 才产生"气门重叠"（排气末 + 进气初同时微开），这是可以讲的真实现象。

### 3.3 接触约束（一条铁律）

> **凸轮鼻尖半径 = 基圆半径 + 最大升程**，且气门杆顶端恰好落在基圆下缘。

否则凸轮会悬在气门上方（留 0.2–0.3 的缝），放大就露馅。

```js
var CAM_R = .44;                                  // 基圆
var noseR = CAM_R + MAXLIFT;                      // 鼻尖 = .44 + .55 = .99
// 气门组：baseY 使 弹簧上座 y = camY - CAM_R
var baseY = camY - CAM_R - 1.6;                   // 1.6 = 上座相对 baseY 的高度
```

### 3.4 弹簧压缩

```js
var dy = lift01 * MAXLIFT;
valve.position.y = baseY - dy;
var topY = (baseY - dy) + RETAINER_H;
spring.scale.y = Math.max(.35, topY - springBase) / springRestH;   // 沿 y 缩，底端不动
```

螺旋弹簧几何用 `helixGeo(r, tubeR, h, turns, seg)`，**底端对齐 y=0**，这样 `scale.y` 才不会把弹簧拉离座面。

## 4. 齿轮/带轮（扩展）

- 传动比 = 半径反比：`w2 = w1 * (r1 / r2)`，相位差 = `∫w dt`，直接按角度推。
- 齿不要用布尔切，用"圆环阵列"：`for (i=0;i<N;i++)` 放倒角小盒，绕轴旋转 `i/N * 2π`。

## 5. 推进函数的写法

```js
update: function (dt, s) {
  s.t += dt;
  if (s.spin > 0) s.theta += dt * 2.1 * s.speed;      // 2.1 rad/s ≈ 20 rpm，看得清
  s.theta = ((s.theta % CYC) + CYC) % CYC;            // 卷绕到 0..720，防浮点越界
  var th = s.theta;

  for (var i = 0; i < 4; i++) {
    var b = betaOf(th, i), py = pistonY(b);
    pistons[i].position.y = py;
    /* 连杆 … */
  }
  crank.rotation.x = th;
  camIn.rotation.x = th * .5;
  /* 气门 … */
}
```

三条规矩：

1. **角度永远卷绕**（`% CYC`，负数要补），否则跑十分钟后精度崩。
2. **速度可调**（`s.speed`），默认 1 档；职教课件必须能慢放到"看清一个冲程"。
3. **暂停 = `s.spin = 0`**，此时用滑块直接写 `s.theta`，两套输入不能同时驱动（会打架）。

## 6. 参数化旋钮（做成控件让学生自己调）

有教学价值的量都该能调，并用读数面板同步显示：

| 控件 | 键 | 作用 |
|---|---|---|
| 运转速度 | `speed` 0–3 | 慢放看冲程 |
| 曲轴转角 | `setAng` 0–720 | 逐度观察相位 |
| 拆解程度 | `explPct` 0–100 | 装配关系 |

连杆比 λ、缸径、行程这类"设计参数"也做成滑块，能演示"λ 越大侧压力越小"这类知识点——这是职教课件比视频强的地方。
