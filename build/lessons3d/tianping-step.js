/* 格物实验室 · 用托盘天平测量物体的质量（three.js 单文件课件）
   鲁教版 八年级上册 · 第四章 物质与材料 · 第一节 质量及其测量

   【严谨】平衡条件：左物右码 m物 = Σ(实际摆上右盘的砝码) + 游码示数；
           砝码由「对象数组里真正放到盘上的那些」逐个累加，游码由滑块位置读，
           全部每帧实时算出，无写死结果、无拟合映射。物体质量给真实设定：
           木块 62.4 g；烧杯+水 = m杯 + ρ水·V = 32.0 + 1.0×50 = 82.0 g。
           物码倒置反例：m物 = Σ砝码 − 游码，误按「+」读会偏大 2×游码 = 4.8 g。
   【真实感】天平本体在课件内重做（共享 P.balance 被密度课复用，不能改）：
           调平脚底座 / 后置立柱 + 刀口支座 / 等臂横梁 + 中央刀口 / 连在横梁上的
           指针 / 固定在立柱托架上的分度盘 / 独立游码标尺与骑式滑块 / 两端滚花
           平衡螺母 / 三吊丝 + 有厚度的浅托盘。其余器材逐件重做：分级砝码（顶钮 +
           刻字）、带凹孔的木砝码盒、六面木纹+端面年轮的木块、带刻度与厚口沿的
           烧杯、平放的钢镊子、车削纹待测物；备料位全部拉开间距消除互相穿模。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；正文与读数都引用这里算出的值）────── */
  var POOL = [100, 50, 20, 20, 10, 5];           // 砝码池 g：每个值一个真实对象
  var RIDER_MAX = 5, RIDER_DIV = 0.2;             // 游码量程 / 分度值（天平感量）
  var M_WOOD = 62.4;                              // 木块真实质量 g
  var M_CUP = 32.0;                               // 空烧杯真实质量 g
  var V_WATER = 50, RHO_WATER = 1.0;              // 杯中水体积 cm³ / 密度 g·cm⁻³
  var M_WATER = V_WATER * RHO_WATER;              // 水质量 50.0 g（差减法应得）
  var M_CUPWATER = M_CUP + M_WATER;               // 烧杯+水 82.0 g
  var CAP = POOL.reduce(function (a, b) { return a + b; }, 0) + RIDER_MAX;  // 量程 210 g

  function readMass(sum, rider, inv) { return inv ? sum - rider : sum + rider; }

  /* 由模型推出的操作组合：按钮只设置这些，正文数字与之一一对应 */
  var SUM_W = POOL[1] + POOL[4];                           // 50 + 10 = 60 g
  var RIDER_W = M_WOOD - SUM_W;                            // 游码 2.4 g
  var RIDER_C = M_CUP - (POOL[2] + POOL[4]);               // 空杯：20+10=30，游码 2.0 g
  var RIDER_CW = M_CUPWATER - (POOL[1] + POOL[2] + POOL[4]); // 杯+水：80，游码 2.0 g
  var M_INV = SUM_W - RIDER_W;                             // 倒置平衡条件推出的真值 57.6 g

  /* 连续量一律 _ 前缀，避开 K.boot 对数值字段的 0.55 s 补间 */
  var st = {
    _t: 0, _rider: 0, _tilt: 0,
    leveled: false, onPan: 'none', wet: false,
    inverted: false, wrongRead: true, judged: false,
    placed: POOL.map(function () { return false; })
  };
  var O = {};

  function sumPlaced(s) {
    var m = 0;
    for (var i = 0; i < O.weights.length; i++) if (s.placed[i]) m += O.weights[i].userData.v;
    return m;                                     // 由对象累加，不是常量
  }
  function trueMass(s) {
    if (s.onPan === 'wood') return M_WOOD;
    if (s.onPan === 'cup') return s.wet ? M_CUPWATER : M_CUP;
    if (s.onPan === 'sample') return M_INV;
    return 0;
  }
  /* 游码始终加在右盘侧；物码倒置时右盘放物体、左盘放砝码 */
  function loads(s) {
    var sum = sumPlaced(s), rider = s._rider, m = trueMass(s);
    return s.inverted ? { L: sum, R: m + rider } : { L: m, R: sum + rider };
  }

  /* ── 通用贴图 ─────────────────────────────────────────────── */
  function tex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  function riderScaleTex() {
    return tex(1024, 84, function (x, w, h) {
      /* 深底亮字：浅背景下白条不再被洗淡，刻度与数字一眼可读 */
      x.fillStyle = '#26333e'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#eaf2f8'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var n = RIDER_MAX / RIDER_DIV;              // 25 格
      for (var i = 0; i <= n; i++) {
        var px = 12 + i / n * (w - 24), major = i % 5 === 0;
        x.fillRect(px - 1.5, 0, 3, major ? 48 : 24);
        if (major) { x.font = 'bold 34px Consolas,monospace'; x.fillText((i * RIDER_DIV).toFixed(0), px, 64); }
      }
      x.textAlign = 'right'; x.font = 'bold 22px Consolas,monospace'; x.fillText('g', w - 6, 16);
    });
  }
  function dialTex() {
    return tex(512, 176, function (x, w, h) {
      x.fillStyle = '#d3dce2'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#16222c'; x.fillStyle = '#16222c';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (var i = -6; i <= 6; i++) {
        var px = w / 2 + i * 38, major = i === 0 || i % 3 === 0;
        x.lineWidth = i === 0 ? 5 : 3;
        x.beginPath(); x.moveTo(px, 8); x.lineTo(px, major ? 62 : 36); x.stroke();
      }
      x.font = 'bold 28px Consolas,monospace'; x.fillText('0', w / 2, 88);
      x.font = 'bold 24px "Microsoft YaHei",sans-serif';
      x.fillText('左偏', 58, 140); x.fillText('右偏', w - 58, 140);
    });
  }
  function weightLabel(v) {
    return tex(256, 96, function (x, w, h) {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#28323c'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 62px Consolas,monospace'; x.fillText(String(v), w / 2, h / 2);
    });
  }
  function woodSideTex() {
    return tex(256, 256, function (x, w, h) {
      x.fillStyle = '#c69a5e'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 26; i++) {
        var y = i * 10 + (i % 3) * 2;
        x.strokeStyle = 'rgba(110,72,30,' + (.10 + (i % 4) * .055).toFixed(3) + ')';
        x.lineWidth = 1 + (i % 3) * .7;
        x.beginPath(); x.moveTo(0, y);
        x.bezierCurveTo(w * .3, y + 5, w * .7, y - 5, w, y + 2); x.stroke();
      }
    });
  }
  function woodEndTex() {
    return tex(256, 256, function (x, w, h) {
      x.fillStyle = '#d0a870'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(120,80,34,.42)';
      for (var i = 1; i <= 9; i++) {
        x.lineWidth = 2 + (i % 2);
        x.beginPath(); x.ellipse(128, 128, i * 13, i * 11, .3, 0, 6.283); x.stroke();
      }
    });
  }

  /* 备料件 HOME → 工作位的真实位移：p 平滑推进，中段抬起像被镊子夹过去 */
  function glide(o, want, dt) {
    var u = o.userData;
    u.p += (want - u.p) * Math.min(1, dt * 4);
    if (Math.abs(want - u.p) < 1e-3) u.p = want;
    o.position.lerpVectors(u.home, u.work, u.p);
    o.position.y += Math.sin(Math.PI * u.p) * u.arc;
    return u.p;
  }
  function home(o, x, z, arc) {
    o.userData.home = new T.Vector3(x, 0, z);
    o.userData.work = o.userData.home.clone();
    o.userData.p = 0; o.userData.arc = arc || 3;
    o.position.copy(o.userData.home);
  }

  /* ══ 托盘天平（课件内重做）═════════════════════════════════
     立柱后置 → 刀口支座伸到横梁下方；指针长在横梁上、分度盘固定在
     立柱托架上；游码标尺是横梁前下方一条独立金属尺，不盖住横梁。 */
  function makeBalance() {
    var g = new T.Group();
    var STEEL = new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 });
    var FINE = new T.MeshStandardMaterial({ color: 0xc7ced6, roughness: .22, metalness: .95, envMapIntensity: 1.4 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9, envMapIntensity: 1.2 });
    var PAINT = new T.MeshStandardMaterial({ color: 0x2b323a, roughness: .55, metalness: .35, envMapIntensity: .5 });
    var RUBBER = new T.MeshStandardMaterial({ color: 0x1b2026, roughness: .8, metalness: .05 });
    var BEAM_Y = 12.6, PAN_Y = -6.2, ARM = 8.6;

    /* 底座：烤漆台体 + 金属包边 + 四只黄铜调平脚 + 铭牌 */
    var base = new T.Mesh(new T.BoxGeometry(15, 1.0, 8.6), PAINT);
    base.position.y = 1.25; g.add(base);
    /* 四周金属细边：不能做成一整块盖板，否则深色烤漆底座被盖成白板 */
    [[0, -4.42, 15.4, .18], [0, 4.42, 15.4, .18],
     [-7.62, 0, .18, 8.9], [7.62, 0, .18, 8.9]].forEach(function (p) {
      var e = new T.Mesh(new T.BoxGeometry(p[2], .14, p[3]), FINE);
      e.position.set(p[0], 1.78, p[1]); g.add(e);
    });
    [[-6.4, -3.5], [6.4, -3.5], [-6.4, 3.5], [6.4, 3.5]].forEach(function (p) {
      var foot = new T.Mesh(new T.CylinderGeometry(.52, .70, .78, 16), BRASS);
      foot.position.set(p[0], .39, p[1]); g.add(foot);
      var pad = new T.Mesh(new T.CylinderGeometry(.72, .72, .16, 16), RUBBER);
      pad.position.set(p[0], .08, p[1]); g.add(pad);
    });
    var nameTex = tex(512, 112, function (x, w, h) {
      x.fillStyle = '#d9dee3'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2b323a'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 44px Consolas,monospace';
      x.fillText('JPT-200  /  200 g · 0.2 g', w / 2, h / 2);
    });
    var namePlate = new T.Mesh(new T.PlaneGeometry(6.4, 1.0), new T.MeshBasicMaterial({ map: nameTex }));
    namePlate.position.set(0, 1.27, 4.31); g.add(namePlate);

    /* 立柱在横梁后方 z=-1.3，顶端支座伸到 z=0 托住横梁 */
    var col = new T.Mesh(new T.CylinderGeometry(.42, .58, 10.2, 20), STEEL);
    col.position.set(0, 6.95, -1.3); g.add(col);
    var collar = new T.Mesh(new T.CylinderGeometry(.72, .72, .5, 20), FINE);
    collar.position.set(0, 11.95, -1.3); g.add(collar);
    var bracket = new T.Mesh(new T.BoxGeometry(3.2, .5, 2.9), STEEL);
    bracket.position.set(0, 12.05, -.55); g.add(bracket);
    var knife = new T.Mesh(new T.CylinderGeometry(.26, .26, 1.8, 3), FINE);
    knife.rotation.x = Math.PI / 2; knife.position.set(0, 12.34, .25); g.add(knife);

    /* 横梁（等臂杠杆） */
    var piv = new T.Group(); piv.position.set(0, BEAM_Y, 0); g.add(piv);
    var beam = new T.Mesh(new T.BoxGeometry(17.6, .62, 1.0), FINE); piv.add(beam);
    var hub = new T.Mesh(new T.CylinderGeometry(.62, .62, 1.3, 20), STEEL);
    hub.rotation.x = Math.PI / 2; piv.add(hub);
    [-1, 1].forEach(function (s) {
      var arm = new T.Mesh(new T.BoxGeometry(2.0, .34, .72), STEEL);
      arm.position.set(s * 8.9, 0, 0); piv.add(arm);
      var eye = new T.Mesh(new T.TorusGeometry(.40, .12, 8, 18), BRASS);
      eye.position.set(s * ARM, -.30, 0); eye.rotation.y = Math.PI / 2; piv.add(eye);
    });

    /* 指针固定在横梁中央，随横梁一起转 */
    var ptr = new T.Mesh(new T.CylinderGeometry(.085, .13, 5.0, 10), FINE);
    ptr.position.set(0, -2.75, .46); piv.add(ptr);
    var tip = new T.Mesh(new T.ConeGeometry(.22, .72, 12), new T.MeshBasicMaterial({ color: 0xd83a2a }));
    tip.rotation.x = Math.PI; tip.position.set(0, -5.35, .46); piv.add(tip);

    /* 分度盘：立柱伸出的明显短托臂 + 托板固定，不再是一块悬空白板 */
    var DIALBR = new T.MeshStandardMaterial({ color: 0x37424c, roughness: .5, metalness: .5 });
    var dialArm = new T.Mesh(new T.BoxGeometry(1.5, .8, 3.0), DIALBR);
    dialArm.position.set(0, 6.9, -.62); g.add(dialArm);
    var dialShelf = new T.Mesh(new T.BoxGeometry(4.6, .3, 1.4), DIALBR);
    dialShelf.position.set(0, 5.78, -.05); g.add(dialShelf);
    var dial = new T.Group(); dial.position.set(0, 6.9, .12); g.add(dial);
    var dialBody = new T.Mesh(new T.BoxGeometry(6.2, 2.1, .3), PAINT); dial.add(dialBody);
    var dialFace = new T.Mesh(new T.PlaneGeometry(5.9, 1.85),
      new T.MeshBasicMaterial({ map: dialTex() }));
    dialFace.position.z = .17; dial.add(dialFace);
    O.dial = dial;

    /* 游码标尺：横梁前下方独立的金属尺 + 金属托条与挂耳真正连到横梁 */
    var SCALEBR = new T.MeshStandardMaterial({ color: 0x3a4652, roughness: .45, metalness: .6 });
    var scaleBar = new T.Mesh(new T.BoxGeometry(12.8, 1.06, .24), SCALEBR);
    scaleBar.position.set(0, -1.12, .74); piv.add(scaleBar);
    var scaleRail = new T.Mesh(new T.BoxGeometry(12.4, .22, .5), SCALEBR);
    scaleRail.position.set(0, -.18, .74); piv.add(scaleRail);
    [-5.6, 5.6].forEach(function (x) {
      var h = new T.Mesh(new T.BoxGeometry(.32, 1.25, .6), SCALEBR);
      h.position.set(x, -.52, .74); piv.add(h);
    });
    var scaleFace = new T.Mesh(new T.PlaneGeometry(12.4, 1.0),
      new T.MeshBasicMaterial({ map: riderScaleTex(), side: T.DoubleSide }));
    scaleFace.position.set(0, -1.12, .87); piv.add(scaleFace);
    O.riderScale = scaleFace;
    /* 骑式游码：上盖 + 两侧板 + 拨钮，卡在标尺上 */
    var rider = new T.Group(); rider.position.set(-6.2, -1.12, .87); piv.add(rider);
    var rTop = new T.Mesh(new T.BoxGeometry(.72, .16, 1.16), BRASS);
    rTop.position.y = .60; rider.add(rTop);
    [-1, 1].forEach(function (s) {
      var side = new T.Mesh(new T.BoxGeometry(.16, 1.16, 1.0), BRASS);
      side.position.set(s * .32, 0, 0); rider.add(side);
    });
    var rKnob = new T.Mesh(new T.SphereGeometry(.24, 12, 8), FINE);
    rKnob.position.set(0, .78, 0); rider.add(rKnob);
    O.rider = rider;

    /* 两端平衡螺母（滚花环），调平时真的拧动 */
    O.nuts = [];
    [-1, 1].forEach(function (s) {
      var n = new T.Group(); n.position.set(s * 8.95, 0, 0); piv.add(n);
      var body = new T.Mesh(new T.CylinderGeometry(.48, .48, 1.05, 20), BRASS);
      body.rotation.z = Math.PI / 2; n.add(body);
      for (var i = 0; i < 3; i++) {
        var ring = new T.Mesh(new T.TorusGeometry(.49, .05, 6, 20), FINE);
        ring.rotation.y = Math.PI / 2; ring.position.x = -.32 + i * .32; n.add(ring);
      }
      O.nuts.push(n);
    });

    /* 三根吊丝从横梁端吊架斜张到盘沿三挂耳，底端止于盘沿、不插进盘内；
       有厚度、有口沿的浅托盘随横梁倾斜时自动保持水平 */
    var carriers = [], UPW = new T.Vector3(0, 1, 0);
    [-1, 1].forEach(function (s) {
      var c = new T.Group(); c.position.set(s * ARM, 0, 0); piv.add(c);
      var lugY = PAN_Y + .56;                       // 盘沿 rim 高度
      var lugs = [[-2.55, 1.45], [2.55, 1.45], [0, -2.9]];
      var tops = [[-.34, .18], [.34, .18], [0, -.34]];
      lugs.forEach(function (p, i) {
        var top = new T.Vector3(tops[i][0], -.20, tops[i][1]);
        var end = new T.Vector3(p[0], lugY, p[1]);
        var d = new T.Vector3().subVectors(end, top);
        var wire = new T.Mesh(new T.CylinderGeometry(.055, .055, d.length(), 6), FINE);
        wire.position.copy(top).addScaledVector(d, .5);
        wire.quaternion.setFromUnitVectors(UPW, d.clone().normalize());
        c.add(wire);
        var bead = new T.Mesh(new T.SphereGeometry(.14, 10, 8), BRASS);
        bead.position.copy(top); c.add(bead);
        var lug = new T.Mesh(new T.TorusGeometry(.22, .07, 6, 12), BRASS);
        lug.rotation.x = Math.PI / 2; lug.position.copy(end); c.add(lug);
      });
      var pan = new T.Group(); pan.position.y = PAN_Y; c.add(pan);
    /* 盘壁单独一档暗钢：整只盘比横梁暗，浅背景下不读成「白瓷盘」*/
    var PANSTEEL = new T.MeshStandardMaterial({ color: 0x9fabb5, roughness: .36, metalness: .8, envMapIntensity: 1.0 });
    var wall = new T.Mesh(new T.CylinderGeometry(3.05, 2.72, .62, 32, 1, true), PANSTEEL);
      wall.position.y = .25; pan.add(wall);
      var bottom = new T.Mesh(new T.CylinderGeometry(2.74, 2.74, .14, 32),
        new T.MeshStandardMaterial({ color: 0x96a1ac, roughness: .32, metalness: .82 }));
      pan.add(bottom);
      /* 盘内比外壁暗一档，浅背景下才不会读成「白瓷盘」 */
      var inner = new T.Mesh(new T.CylinderGeometry(2.68, 2.68, .04, 32),
        new T.MeshStandardMaterial({ color: 0x7d8a95, roughness: .46, metalness: .55, side: T.DoubleSide }));
      inner.position.y = .10; pan.add(inner);
      var rim = new T.Mesh(new T.TorusGeometry(3.02, .10, 8, 32), FINE);
      rim.rotation.x = Math.PI / 2; rim.position.y = .56; pan.add(rim);
      carriers.push(c);
    });

    g.userData.setTilt = function (a) {
      piv.rotation.z = a;
      carriers.forEach(function (c) { c.rotation.z = -a; });
    };
    g.userData.carriers = carriers;
    g.userData.panLocalY = PAN_Y + .12;
    g.userData.piv = piv;
    g.userData.setTilt(0);
    return g;
  }

  /* ══ 分级砝码：质量越大个头越大，顶钮 + 刻字（无白底贴纸）══ */
  function makeWeight(v) {
    var g = new T.Group();
    var h = .62 + Math.log10(v + 1) * .46;
    var r = .72 + Math.log10(v + 1) * .21;
    var STEEL = new T.MeshStandardMaterial({ color: 0xccd5dc, roughness: .26, metalness: .88, envMapIntensity: 1.7 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9, envMapIntensity: 1.4 });
    var body = new T.Mesh(new T.CylinderGeometry(r * .92, r, h, 28), STEEL);
    body.position.y = h / 2; g.add(body);
    var shoulder = new T.Mesh(new T.CylinderGeometry(r * .72, r * .92, .16, 28), STEEL);
    shoulder.position.y = h + .08; g.add(shoulder);
    var knob = new T.Mesh(new T.CylinderGeometry(r * .28, r * .28, .44, 18), BRASS);
    knob.position.y = h + .38; g.add(knob);
    var ring = new T.Mesh(new T.TorusGeometry(r * .93, .045, 6, 28), BRASS);
    ring.rotation.x = Math.PI / 2; ring.position.y = h * .16; g.add(ring);
    var lab = new T.Mesh(new T.PlaneGeometry(r * 1.3, .5),
      new T.MeshBasicMaterial({ map: weightLabel(v), transparent: true, depthWrite: false }));
    lab.position.set(0, h * .55, r * .96); g.add(lab);
    g.userData.h = h; g.userData.v = v;
    return g;
  }

  /* ══ 砝码盒：木盒 + 六个黄铜口沿凹孔 + 数值 + 前沿铭牌 ══ */
  function makeWeightsBox() {
    var g = new T.Group();
    var WOOD = new T.MeshStandardMaterial({ color: 0x6b4b32, roughness: .72, metalness: .05 });
    var DARK = new T.MeshStandardMaterial({ color: 0x22282e, roughness: .8, metalness: .1 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9 });
    var shell = new T.Mesh(new T.BoxGeometry(11, 1.7, 5.2), WOOD);
    shell.position.y = .85; g.add(shell);
    var tray = new T.Mesh(new T.BoxGeometry(10.4, .12, 4.6), DARK);
    tray.position.y = 1.72; g.add(tray);
    var HOLE = new T.MeshStandardMaterial({ color: 0x0e1318, roughness: .92, metalness: .04, side: T.DoubleSide });
    POOL.forEach(function (v, i) {
      var cx = -3.7 + (i % 3) * 3.7, cz = (i < 3 ? -1.1 : 1.1);
      /* 凹孔：深色孔底略低于橙环 + 一圈深色孔壁，环内读得出是「孔」不是贴纸 */
      var hole = new T.Mesh(new T.CylinderGeometry(.97, .97, .1, 24), HOLE);
      hole.position.set(cx, 1.75, cz); g.add(hole);
      var bore = new T.Mesh(new T.CylinderGeometry(.97, .97, .16, 24, 1, true), HOLE);
      bore.position.set(cx, 1.82, cz); g.add(bore);
      var rim = new T.Mesh(new T.TorusGeometry(1.0, .06, 6, 24), BRASS);
      rim.rotation.x = Math.PI / 2; rim.position.set(cx, 1.84, cz); g.add(rim);
      var lab = new T.Mesh(new T.PlaneGeometry(1.3, .46),
        new T.MeshBasicMaterial({ map: weightLabel(v), transparent: true, depthWrite: false }));
      lab.rotation.x = -Math.PI / 2; lab.position.set(cx, 1.85, cz + 1.32); g.add(lab);
    });
    var nameM = new T.Mesh(new T.PlaneGeometry(5.0, .9),
      new T.MeshBasicMaterial({ map: tex(512, 96, function (x, w, h) {
        x.fillStyle = '#c8b79a'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#3a2b1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 46px "Microsoft YaHei",sans-serif';
        x.fillText('砝码盒  200 g', w / 2, h / 2);
      }) }));
    nameM.position.set(0, .9, 2.61); g.add(nameM);
    return g;
  }

  /* ══ 木块：六面木纹 + 端面年轮 + 棱线 ══ */
  function makeWood() {
    var g = new T.Group(), L = 5, W = 4, H = 3;
    var side = new T.MeshStandardMaterial({ color: 0xffffff, map: woodSideTex(), roughness: .82, metalness: 0 });
    var top = new T.MeshStandardMaterial({ color: 0xffffff, map: P.MAT.wood.map, roughness: .8, metalness: 0 });
    var end = new T.MeshStandardMaterial({ color: 0xffffff, map: woodEndTex(), roughness: .85, metalness: 0 });
    var b = new T.Mesh(new T.BoxGeometry(L, H, W), [side, side, top, side, end, end]);
    b.position.y = H / 2; g.add(b);
    var edges = new T.LineSegments(new T.EdgesGeometry(b.geometry),
      new T.LineBasicMaterial({ color: 0x6b4a28, transparent: true, opacity: .5 }));
    edges.position.copy(b.position); g.add(edges);
    return g;
  }

  /* ══ 烧杯：带刻度、厚口沿、压暗杯底；水体由 V/底面积 算液面高 ══ */
  function makeBeaker() {
    var cup = new T.Group();
    var glass = C.create('beaker', { liquid: 0, marks: true, scale: .72 });
    cup.add(glass);
    var rIn = 2.84 * .72;
    var H_WATER = V_WATER / (Math.PI * rIn * rIn);
    var waterGeo = new T.CylinderGeometry(rIn * .94, rIn * .91, H_WATER, 32, 1, true);
    waterGeo.translate(0, H_WATER / 2, 0);
    var water = new T.Mesh(waterGeo, new T.MeshPhysicalMaterial({
      color: 0x5fa8cf, roughness: .12, metalness: 0, transparent: true, opacity: .55,
      side: T.DoubleSide, depthWrite: false }));
    water.position.y = .12; water.scale.y = .001; cup.add(water); O.cupWater = water;
    var surf = new T.Mesh(new T.CircleGeometry(rIn * .94, 32),
      new T.MeshBasicMaterial({ color: 0x9fd6ee, transparent: true, opacity: 0, side: T.DoubleSide }));
    surf.rotation.x = -Math.PI / 2; cup.add(surf); O.cupSurf = surf;
    /* 杯底压暗，消除浅背景下烧成一圈白盘的玻璃底 */
    var foot = new T.Mesh(new T.CylinderGeometry(rIn * .90, rIn * .90, .06, 32),
      new T.MeshStandardMaterial({ color: 0x8fa8b5, roughness: .3, metalness: .1, transparent: true, opacity: .5 }));
    foot.position.y = .04; cup.add(foot);
    var rim = new T.Mesh(new T.TorusGeometry(rIn * 1.02, .09, 8, 32),
      new T.MeshPhysicalMaterial({ color: 0xdff0fa, roughness: .08, metalness: 0, transparent: true, opacity: .65 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 6 * .72; cup.add(rim);
    O.H_WATER = H_WATER;
    return cup;
  }

  /* ══ 镊子：平放台面的两片钢臂 + 黄铜尾帽与滚花 ══ */
  function makeTweezer() {
    var g = new T.Group();
    var STEEL = new T.MeshStandardMaterial({ color: 0xb7c0c8, roughness: .28, metalness: .92, envMapIntensity: 1.3 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9 });
    [-1, 1].forEach(function (s) {
      var arm = new T.Mesh(new T.BoxGeometry(6.2, .18, .26), STEEL);
      arm.position.set(.2, .22, s * .34); arm.rotation.y = -s * .032; g.add(arm);
      var tip = new T.Mesh(new T.BoxGeometry(.7, .16, .30), STEEL);
      tip.position.set(3.45, .22, s * .42); g.add(tip);
    });
    var cap = new T.Mesh(new T.BoxGeometry(.7, .30, .86), BRASS);
    cap.position.set(-3.0, .22, 0); g.add(cap);
    for (var i = 0; i < 4; i++) {
      var ring = new T.Mesh(new T.BoxGeometry(.08, .22, .86), BRASS);
      ring.position.set(-2.4 + i * .22, .22, 0); g.add(ring);
    }
    g.rotation.y = .16;
    return g;
  }

  /* ══ 待测金属块：车削环纹 + 黄铜顶盖 ══ */
  function makeSample() {
    var g = new T.Group();
    var STEEL = new T.MeshStandardMaterial({ color: 0xb7c0c8, roughness: .28, metalness: .92, envMapIntensity: 1.3 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9 });
    var body = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 2.8, 28), STEEL);
    body.position.y = 1.4; g.add(body);
    var cap = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, .28, 28), BRASS);
    cap.position.y = 2.94; g.add(cap);
    for (var i = 0; i < 3; i++) {
      var ring = new T.Mesh(new T.TorusGeometry(1.5, .04, 6, 28), BRASS);
      ring.rotation.x = Math.PI / 2; ring.position.y = .5 + i * .8; g.add(ring);
    }
    return g;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .76;
        else if (o.isDirectionalLight) o.intensity *= .80;
      });
      K.bench(58, 26);

      /* 天平本体 */
      var bal = makeBalance(); bal.position.set(-8, 0, 0); K.scene().add(bal); O.balance = bal;

      /* 砝码盒 + 分级砝码（HOME 排间距 2.35 > 最大直径，不再挤成一排字）*/
      var wb = makeWeightsBox(); wb.position.set(10, 0, 1.6); K.scene().add(wb); O.box = wb;
      O.weights = POOL.map(function (v, i) {
        var w = makeWeight(v); K.scene().add(w);
        home(w, .5 + i * 2.2, 5.6, 3.2);
        return w;
      });

      /* 备料件往台面中部收：既不互相重叠，也不会被画面下沿裁掉 */
      var tw = makeTweezer(); K.scene().add(tw); home(tw, 15, 4.5, .6); O.tweezer = tw;
      var wood = makeWood(); K.scene().add(wood); home(wood, -8.5, 7.2, 3); O.wood = wood;
      var cup = makeBeaker(); K.scene().add(cup); home(cup, -2.5, 7.2, 3); O.cup = cup;
      var sample = makeSample(); K.scene().add(sample); home(sample, 4, 9.5, 3); O.sample = sample;

      /* 接地阴影（深色台面用深色 blob）*/
      P.ground(-8, 0, 13); P.ground(10, 1.6, 7); P.ground(6, 5.6, 11);
      P.ground(-8.5, 7.2, 3); P.ground(-2.5, 7.2, 3); P.ground(4, 9.5, 3); P.ground(15, 4.5, 4);

      K.tag(bal, '托盘天平', '等臂杠杆：m物 = Σ砝码 + 游码（倒置则为 Σ − 游码）');
      K.tag(wb, '砝码盒', '100/50/20/20/10/5 g 共 ' + CAP + ' g 量程内含游码');
      K.tag(tw, '镊子', '取放砝码、拨游码必须用镊子，不能手抓');
      K.tag(O.riderScale, '游码标尺', '0~' + RIDER_MAX + ' g、分度 ' + RIDER_DIV + ' g，读左端');
      K.tag(O.dial, '分度盘与指针', '指针固定在横梁上，居中即平衡');
      K.tag(O.cup, '烧杯+水', '差减法：m水 = m(杯+水) − m空杯');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var sum = sumPlaced(s), rider = s._rider, m = trueMass(s), ld = loads(s);
      var diff = s.leveled ? (ld.L - ld.R) : 0;              // 左盘减右盘（g）
      var target = Math.max(-.16, Math.min(.16, diff * .0028));
      s._tilt += (target - s._tilt) * Math.min(1, dt * 6);
      O.balance.userData.setTilt(s._tilt);                   // 指针随横梁一起转
      O.rider.position.x = -6.2 + (rider / RIDER_MAX) * 12.4;
      O.nuts.forEach(function (n) {
        var want = s.leveled ? .9 : 0;
        n.rotation.x += (want - n.rotation.x) * Math.min(1, dt * 4);
      });

      var panL = O.balance.userData.carriers[0], panR = O.balance.userData.carriers[1];
      var panY = O.balance.userData.panLocalY;
      var wCarrier = s.inverted ? panL : panR;               // 倒置时砝码真的移到左盘
      var oCarrier = s.inverted ? panR : panL;               // 物体相应移到右盘

      var k = 0;
      for (var i = 0; i < O.weights.length; i++) {
        var w = O.weights[i], u = w.userData;
        var dx = ((k % 3) - 1) * 1.25, dz = (k % 2 ? .55 : -.55);
        var stack = Math.floor(k / 3) * .82;
        u.work = P.port(wCarrier, dx, panY + .06 + stack, dz);
        glide(w, s.placed[i] ? 1 : 0, dt);
        if (s.placed[i]) k++;
      }
      var objTarget = P.port(oCarrier, 0, panY + .06, 0);
      [O.wood, O.cup, O.sample].forEach(function (o, j) {
        o.userData.work = objTarget;
        var want = (s.onPan === ['wood', 'cup', 'sample'][j]) ? 1 : 0;
        glide(o, want, dt);
      });

      /* 镊子只在盒旁被「拿起」：抬起 + 倾斜，不再竖着飞到托盘上方 */
      O.tweezer.userData.work = O.tweezer.userData.home.clone().add(new T.Vector3(0, 1.3, -.5));
      var pick = (k > 0 || s.onPan !== 'none') ? 1 : 0;
      var p = glide(O.tweezer, pick, dt);
      O.tweezer.rotation.z = .20 * p;

      /* 杯中水：液面高度由 V_WATER / 底面积 算出 */
      var wy = O.cupWater.scale.y;
      wy += ((s.wet ? 1 : .001) - wy) * Math.min(1, dt * 4);
      O.cupWater.scale.y = wy;
      O.cupSurf.position.y = .12 + O.H_WATER * wy;
      O.cupSurf.material.opacity = Math.min(1, wy) * .8;
    }
  };

  function reset(s) {
    s._t = 0; s._rider = 0; s._tilt = 0;
    s.leveled = false; s.onPan = 'none'; s.wet = false;
    s.inverted = false; s.wrongRead = true; s.judged = false;
    s.placed = POOL.map(function () { return false; });
  }

  K.boot({
    title: '用托盘天平测量物体的质量',
    chip: '物理 · 鲁教版 · 八上 · 第四章 物质与材料 · 第一节 质量及其测量',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 13, dist: 48, tx: -2, tz: 0, yaw: .2, pitch: .22 },
    reads: [['state', '状态'], ['leftMass', '左盘'], ['rightMass', '右盘砝码'],
            ['rider', '游码'], ['result', '结果'], ['delta', '平衡偏差']],
    values: function (s) {
      var sum = sumPlaced(s), rider = s._rider, ld = loads(s);
      var diff = ld.L - ld.R;
      var balanced = s.leveled && Math.abs(diff) < RIDER_DIV / 2;
      var meas = readMass(sum, rider, s.inverted);
      var wrong = sum + rider;
      var obj = s.onPan === 'wood' ? ('木块（设定 ' + M_WOOD.toFixed(1) + ' g）')
              : s.onPan === 'cup' ? (s.wet ? ('烧杯+水（设定 ' + M_CUPWATER.toFixed(1) + ' g）')
                                            : ('空烧杯（设定 ' + M_CUP.toFixed(1) + ' g）'))
              : s.onPan === 'sample' ? '待测物（物码倒置）' : '空';
      return {
        state: !s.leveled ? '未调平' : (s.inverted ? '物码倒置' : (balanced ? '已平衡' : '称量中')),
        leftMass: obj,
        rightMass: sum.toFixed(1) + ' g（Σ 砝码）',
        rider: rider.toFixed(1) + ' g',
        result: s.inverted
          ? (s.wrongRead ? ('m = ' + wrong.toFixed(2) + ' g（误读·偏大 ' + (wrong - meas).toFixed(2) + ' g）')
                         : ('m = ' + meas.toFixed(2) + ' g（Σ−游码）'))
          : ((s.judged || balanced) ? ('m = ' + meas.toFixed(2) + ' g') : '—'),
        delta: (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' g' + (balanced ? '（平衡）' : (diff > 0 ? '（左倾）' : '（右倾）'))
      };
    },
    steps: [
      { name: '看结构', title: '托盘天平由哪些部分组成？',
        ask: '天平的哪一部分相当于一个“等臂杠杆”？',
        body: '<p><b>组成：</b>底座与调平脚、立柱与刀口支座、<b>横梁</b>（等臂杠杆）、左右<b>托盘</b>（三吊丝悬挂）、' +
          '<b>平衡螺母</b>、<b>指针与分度盘</b>、<b>游码标尺</b>与游码、<b>砝码盒</b>（' + POOL.join('/') + ' g）与<b>镊子</b>。</p>' +
          '<p><b>模型：</b>横梁为等臂杠杆，平衡时左盘总质量 = 右盘总质量。规定<b>左物右码</b>，' +
          '游码相当于加在右盘的小砝码，故 <b>m<sub>物</sub> = Σm<sub>砝码</sub> + m<sub>游码</sub></b>。' +
          '本课件右盘读数由「真正摆上托盘的砝码对象」逐个累加得到，不是常量。</p>' +
          '<p><b>参数与边界：</b>砝码池合计 ' + (CAP - RIDER_MAX) + ' g，游码 0~' + RIDER_MAX +
          ' g、分度 ' + RIDER_DIV + ' g，故量程约 <b>' + CAP + ' g</b>、感量 ' + RIDER_DIV +
          ' g。模型要求横梁水平、等臂、无气流与摩擦；且<b>游码以左端对齐刻度</b>读数。</p>' +
          '<p><b>易错点：</b>手抓砝码会锈蚀污染（必须镊子）；物码若放反，公式要变号（见最后一步反例）。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: -2, ty: 14, tz: 0, dist: 50, yaw: .26, pitch: .26 } },

      { name: '水平调节', title: '把天平调到水平平衡',
        ask: '调平时，应该调节哪个部件？称量过程中还能再调它吗？',
        body: '<p><b>操作：</b>① 天平放<b>水平</b>桌面，游码拨到 <b>0</b>；② 拧两端<b>平衡螺母</b>，' +
          '使指针指在分度盘 <b>0</b> 线（或左右摆幅相等）。画面里螺母真的转动、指针随横梁回到中线。</p>' +
          '<p><b>边界/假设：</b>调平前托盘必须<b>空</b>、游码必须<b>归零</b>，且此后<b>称量过程中不可再拧螺母</b>——' +
          '否则等于改动了天平零点，所有读数都带系统偏差。横梁只在水平附近小角度摆动，模型把倾角按力矩差线性化。</p>' +
          '<p><b>反例：</b>游码停在 ' + RIDER_DIV + ' g 处就调平，之后每个读数都会<b>偏小 ' + RIDER_DIV + ' g</b>——这是可避免的<b>错误</b>，不是误差。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '调节平衡螺母 → 指针回中', onClick: function (s) { s.leveled = true; } }],
        cam: { tx: -2, ty: 14, tz: 0, dist: 44, yaw: .2, pitch: .3 } },

      { name: '测木块', title: '测一个小木块的质量',
        ask: '“左物右码”是什么意思？砝码应该怎么加？',
        body: '<p><b>操作：</b>镊子夹木块放<b>左盘</b>，按“由大到小”往<b>右盘</b>加砝码，' +
          '接近平衡时再拨<b>游码</b>；每件砝码都从盒前 HOME 位真实移到托盘。</p>' +
          '<p><b>模型与参数：</b>等臂平衡 <b>m<sub>物</sub> = Σm<sub>砝码</sub> + m<sub>游码</sub></b>。' +
          '木块设定 <b>' + M_WOOD.toFixed(1) + ' g</b>。砝码 ' + POOL[1] + ' + ' + POOL[4] + ' = <b>' + SUM_W +
          ' g</b>，游码拨到 <b>' + RIDER_W.toFixed(1) + ' g</b>，' +
          '则 m = ' + SUM_W + ' + ' + RIDER_W.toFixed(1) + ' = <b>' + (SUM_W + RIDER_W).toFixed(1) + ' g</b>。' +
          '右侧「右盘砝码」是对象累加值、「结果」是 Σ+游码，每帧重算。</p>' +
          '<p><b>边界：</b>Σm<sub>砝码</sub> 与游码之和不得超过量程 ' + CAP + ' g；游码只能在 0~' + RIDER_MAX +
          ' g 内，超出部分必须换砝码而不是硬拨游码。</p>' +
          '<p><b>易错点：</b>砝码要“由大到小”试加；游码读<b>左端</b>；若误加一个 ' + POOL[2] +
          ' g 砝码，右侧会多 ' + POOL[2] + ' g、横梁右倾，读数立刻失配。</p>',
        apply: function (s) { reset(s); s.leveled = true; },
        cam: { tx: -5, ty: 12, tz: 0, dist: 38, yaw: .3, pitch: .24 },
        controls: [
          { type: 'btn', label: '① 镊子夹木块放上左盘', onClick: function (s) { s.onPan = 'wood'; } },
          { type: 'btn', label: '② 夹 ' + POOL[1] + 'g 砝码放到右盘', onClick: function (s) { s.placed[1] = true; } },
          { type: 'btn', label: '③ 再加 ' + POOL[4] + 'g 砝码', onClick: function (s) { s.placed[1] = true; s.placed[4] = true; } },
          { type: 'btn', label: '④ 拨游码到 ' + RIDER_W.toFixed(1) + ' g（判定）', onClick: function (s) { s._rider = RIDER_W; s.judged = true; } }
        ] },

      { name: '测液体', title: '测一杯水的质量（差减法）',
        ask: '为什么测液体质量要先称空烧杯，再称烧杯+水？',
        body: '<p><b>差减法：</b>液体不能直接放托盘。先称<b>空烧杯 m₁</b>，再称<b>烧杯+水 m₂</b>，' +
          '则 <b>m<sub>水</sub> = m₂ − m₁</b>。</p>' +
          '<p><b>模型与参数：</b>空烧杯设定 ' + M_CUP.toFixed(1) + ' g；水体积 V = ' + V_WATER +
          ' cm³、密度 ρ = ' + RHO_WATER.toFixed(1) + ' g/cm³，故 m<sub>水</sub> = ρV = <b>' + M_WATER.toFixed(1) +
          ' g</b>，烧杯+水应为 <b>' + M_CUPWATER.toFixed(1) + ' g</b>。两次称量都由砝码对象累加：' +
          'm₁ = ' + (POOL[2] + POOL[4]) + ' + ' + RIDER_C.toFixed(1) + ' = ' + M_CUP.toFixed(1) + ' g，' +
          'm₂ = ' + (POOL[1] + POOL[2] + POOL[4]) + ' + ' + RIDER_CW.toFixed(1) + ' = ' + M_CUPWATER.toFixed(1) +
          ' g，相减得 m<sub>水</sub> = <b>' + (M_CUPWATER - M_CUP).toFixed(1) + ' g</b>，与 ρV 一致。</p>' +
          '<p><b>边界：</b>水不得洒出、杯外壁要擦干，且天平须重新调平；杯+水总质量 ' + M_CUPWATER.toFixed(1) +
          ' g 远小于量程 ' + CAP + ' g。</p>' +
          '<p><b>反例：</b>若先称杯+水、倒出水后再称「空杯」，杯壁残水使 m₁ 偏大、' +
          'm<sub>水</sub> = m₂ − m₁ <b>偏小</b>；故顺序不能颠倒。</p>',
        apply: function (s) { reset(s); s.leveled = true; },
        cam: { tx: -5, ty: 12, tz: 0, dist: 38, yaw: .3, pitch: .24 },
        controls: [
          { type: 'btn', label: '① 空烧杯放左盘，称 m₁=' + M_CUP.toFixed(1) + 'g', onClick: function (s) {
              s.placed = POOL.map(function () { return false; });
              s.placed[2] = true; s.placed[4] = true; s._rider = RIDER_C; s.onPan = 'cup'; s.wet = false; } },
          { type: 'btn', label: '② 倒入 ' + V_WATER + 'cm³ 水，称 m₂=' + M_CUPWATER.toFixed(1) + 'g', onClick: function (s) {
              s.placed = POOL.map(function () { return false; });
              s.placed[1] = true; s.placed[2] = true; s.placed[4] = true;
              s._rider = RIDER_CW; s.onPan = 'cup'; s.wet = true; } },
          { type: 'btn', label: '③ 差减判定 m水=' + M_WATER.toFixed(1) + 'g', onClick: function (s) { s.judged = true; } }
        ] },

      { name: '注意事项', title: '物码倒置反例与使用红线',
        ask: '物码倒置时，还能用 m=Σ砝码+游码 吗？',
        body: '<p><b>反例（物码倒置）：</b>把待测物放<b>右盘</b>、砝码放<b>左盘</b>（画面里器材真的换了盘）。' +
          '此时游码仍加在右盘侧，平衡条件变为 <b>Σm<sub>砝码</sub> = m<sub>物</sub> + m<sub>游码</sub></b>，' +
          '即 <b>m<sub>物</sub> = Σm<sub>砝码</sub> − m<sub>游码</sub></b>。</p>' +
          '<p><b>由模型算：</b>Σ = ' + SUM_W + ' g、游码 ' + RIDER_W.toFixed(1) + ' g，' +
          '正确值 m = ' + SUM_W + ' − ' + RIDER_W.toFixed(1) + ' = <b>' + M_INV.toFixed(1) + ' g</b>；' +
          '若仍按「Σ+游码」误读会得 <b>' + (SUM_W + RIDER_W).toFixed(1) + ' g</b>，' +
          '偏大 <b>' + (2 * RIDER_W).toFixed(1) + ' g = 2×游码</b>。按下方按钮切换两种读法对照。</p>' +
          '<p><b>边界/假设：</b>该结论只在天平<b>已调平、等臂、游码归零起调</b>时成立；' +
          '若之前游码没归零，倒置偏差还会叠加零点误差。</p>' +
          '<p><b>红线：</b>① 被测质量不超量程 ' + CAP + ' g；② 潮湿/腐蚀性物体用容器；' +
          '③ 砝码与游码只用<b>镊子</b>；④ 游码看<b>左端</b>；⑤ 坚持<b>左物右码</b>。' +
          '质量是物体固有属性，不随形状、状态、位置改变。</p>',
        apply: function (s) {
          reset(s); s.leveled = true; s.inverted = true; s.wrongRead = true; s.judged = true;
          s.onPan = 'sample'; s.placed[1] = true; s.placed[4] = true; s._rider = RIDER_W;
        },
        cam: { tx: -2, ty: 13, tz: 0, dist: 46, yaw: .2, pitch: .26 },
        controls: [
          { type: 'btn', label: '误按 Σ+游码 读数（反例）', onClick: function (s) { s.wrongRead = true; } },
          { type: 'btn', label: '按 Σ−游码 正确读数', onClick: function (s) { s.wrongRead = false; } }
        ] }
    ],
    quiz: function () {
      var bank = [
        { q: '调节天平平衡时，应调节的部件是？', opts: ['平衡螺母', '游码', '托盘', '指针'], ans: '平衡螺母', why: '调平用平衡螺母；称量中不可再调，只能用游码微调。' },
        { q: '“左物右码”指的是？', opts: ['物体左盘、砝码右盘', '物体右盘、砝码左盘', '随便放', '都放左盘'], ans: '物体左盘、砝码右盘', why: '天平规定“左物右码”，配合游码读数 m物=Σ砝码+游码。' },
        { q: '测一杯水的质量应采用？', opts: ['直接称水', '差减法(空杯+杯水)', '只称杯子', '用秤'], ans: '差减法(空杯+杯水)', why: '液体要用容器，m水 = m(杯+水) − m空杯。' },
        { q: '物码倒置且天平平衡，物体质量是？', opts: ['Σ砝码+游码', 'Σ砝码−游码', '游码−Σ砝码', 'Σ砝码'], ans: 'Σ砝码−游码', why: '倒置时 Σ砝码 = m物 + 游码，故 m物 = Σ砝码 − 游码。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
