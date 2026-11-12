/* 格物实验室 · 测量固体和液体的密度（three.js 单文件课件）
   鲁教版 八年级上册 · 第四章 物质与材料 · 第三节 测量物质的密度

   【严谨】量筒读数由液面高度换算 V = (h/H刻度)·V量程（含凹液面最低处），
           V石 = V₂ − V₁；质量 m 由「真正摆上右盘的砝码对象」累加，ρ = m/V。
           液面上升完全由排水体积 V排 = V石·浸入进度 推出，没有预置曲线点。
           石块半径由真实体积反算 R=(3V/4π)^(1/3)，视觉体积＝排水体积。
           反例：先测体积后测质量，附着水 m 偏大 → ρ 偏大。
   【真实感】同一块石块先在天平左盘称、再由细线提着经筒口缓慢浸没；
           量筒刻度贴图/凹液面、烧杯+盐水、砝码盒与镊子、P.stand 支架、
           每件 P.ground 接地阴影，新增部件材质取 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源）────────────────────────────── */
  var V_STONE = 20;                                   // 石块真实体积 cm³
  var RHO_STONE = 2.7;                                // 石块真实密度 g/cm³
  var M_STONE = RHO_STONE * V_STONE;                  // 54.0 g（应由天平称出）
  var STONE_R = Math.pow(3 * V_STONE / (4 * Math.PI), 1 / 3);  // 由体积反算半径 ≈1.68 cm

  var CYL_S = 1.5;                                    // 量筒缩放
  var R_IN = 1.32 * CYL_S;                            // 量筒内半径 1.98 cm
  var Y0 = 0.7 * CYL_S;                               // 量筒内底高度 1.05
  var V_MAX = 50, H_SCALE = 11.0;                     // 量程 50 mL / 有效刻度高 11 cm
  var K_V = V_MAX / H_SCALE;                          // 每 cm 液柱 = 4.545 cm³
  var V1 = 30;                                        // 初始水体积 cm³
  var V2 = V1 + V_STONE;                              // 浸没后 50 cm³（恰好满刻度）
  var POOL = [50, 20, 20, 10, 5, 2, 2, 1];           // 砝码池 g
  var SUM_M = POOL[0] + POOL[5] + POOL[6];            // 50+2+2 = 54 g
  var DM_WET = 2.0;                                   // 附着水质量 g（反例）
  var M_BRINE_1 = 92.0, M_BRINE_2 = 44.0, V_BRINE = 40; // 盐水差减法参数
  var RHO_BRINE = (M_BRINE_1 - M_BRINE_2) / V_BRINE;  // 1.20 g/cm³

  var CYL_X = 12, CYL_Z = 0;
  var SUB_Y = 6.0;                                    // 石块浸没时中心高度
  var MOUTH = new T.Vector3(CYL_X, 14.8, CYL_Z);      // 筒口上方（提移动线中点）
  var SUB = new T.Vector3(CYL_X, SUB_Y, CYL_Z);
  var HOME = new T.Vector3(-4, 0, 9);                 // 石块备料位（避开砝码 HOME 排）
  var LINE_LEN = MOUTH.y - (SUB_Y + STONE_R);         // 细线长度（浸没时刚好到筒口）

  /* 连续量一律 _ 前缀，避开 K.boot 的 0.55 s 数值补间 */
  var st = {
    _t: 0, _p: 0, _tilt: 0, _pour: 0,
    onPan: false, poured: false, submerge: false, wet: false, showWrong: false, judged: false,
    phase: 'mass', placed: POOL.map(function () { return false; })
  };
  var O = {};

  function sumPlaced(s) {
    var m = 0;
    for (var i = 0; i < O.weights.length; i++) if (s.placed[i]) m += O.weights[i].userData.v;
    return m;                                          // 由对象累加
  }
  /* 浸入进度：石块走过「筒口→浸没」段才算排水（截面均匀假设） */
  function immersion(p) { return Math.max(0, Math.min(1, (p - .6) / .4)); }
  function tex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  /* 量筒刻度贴图：0~50 mL，每 1 mL 一格、每 10 mL 标数（0 在底、50 在顶）。
     浅色刻度带托底 + 加深加粗主刻度/数字，浅背景下不再被玻璃洗淡；
     读数仍由 V = K_V·h 模型算出，贴图只负责刻度外观。 */
  function cylScaleTex() {
    return tex(200, 880, function (x, w, h) {
      x.clearRect(0, 0, w, h);
      x.fillStyle = 'rgba(240,246,250,.78)';
      x.fillRect(w - 108, 0, 108, h);
      x.fillStyle = '#0b1a26'; x.textAlign = 'right'; x.textBaseline = 'middle';
      for (var v = 0; v <= V_MAX; v++) {
        var yy = h - 12 - (v / V_MAX) * (h - 24);
        var major = v % 10 === 0, mid = v % 5 === 0;
        x.fillRect(w - (major ? 58 : (mid ? 40 : 22)), yy - (major ? 2.5 : 1.5),
                   major ? 56 : (mid ? 38 : 20), major ? 5 : 3);
        if (major) { x.font = 'bold 34px Consolas,monospace'; x.fillText(String(v), w - 62, yy); }
      }
      x.font = 'bold 22px "Microsoft YaHei",sans-serif'; x.textAlign = 'left';
      x.fillText('mL', 6, 14);
    });
  }
  /* 凹液面：中心低、边缘高的薄面（读数取最低处） */
  function makeMeniscus(r) {
    var pts = [new T.Vector2(0, -.16), new T.Vector2(r * .5, -.12),
               new T.Vector2(r * .85, -.03), new T.Vector2(r, .02)];
    return new T.Mesh(new T.LatheGeometry(pts, 28),
      new T.MeshStandardMaterial({ color: 0x4d92b8, roughness: .2, metalness: 0,
        transparent: true, opacity: .8, side: T.DoubleSide }));
  }
  /* 砝码 HOME → 右盘的真实位移（带抬起弧线） */
  function glide(o, want, dt) {
    var u = o.userData;
    u.p += (want - u.p) * Math.min(1, dt * 4);
    if (Math.abs(want - u.p) < 1e-3) u.p = want;
    o.position.lerpVectors(u.home, u.work, u.p);
    o.position.y += Math.sin(Math.PI * u.p) * u.arc;
  }
  function home(o, x, z, arc) {
    o.userData.home = new T.Vector3(x, 0, z);
    o.userData.work = o.userData.home.clone();
    o.userData.p = 0; o.userData.arc = arc || 3;
    o.position.copy(o.userData.home);
  }
  /* ══ 托盘天平（课件内重做，与天平课同款；共享 P.balance 不动）══ */
  function riderScaleTex() {
    return tex(1024, 84, function (x, w, h) {
      /* 深底亮字：浅背景下白条不再被洗淡，刻度与数字一眼可读 */
      x.fillStyle = '#26333e'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#eaf2f8'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var n = 25;
      for (var i = 0; i <= n; i++) {
        var px = 12 + i / n * (w - 24), major = i % 5 === 0;
        x.fillRect(px - 1.5, 0, 3, major ? 48 : 24);
        if (major) { x.font = 'bold 34px Consolas,monospace'; x.fillText((i * .2).toFixed(0), px, 64); }
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
  function makeBalance() {
    var g = new T.Group();
    var STEEL = new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 });
    var FINE = new T.MeshStandardMaterial({ color: 0xc7ced6, roughness: .22, metalness: .95, envMapIntensity: 1.4 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9, envMapIntensity: 1.2 });
    var PAINT = new T.MeshStandardMaterial({ color: 0x2b323a, roughness: .55, metalness: .35, envMapIntensity: .5 });
    var RUBBER = new T.MeshStandardMaterial({ color: 0x1b2026, roughness: .8, metalness: .05 });
    var BEAM_Y = 12.6, PAN_Y = -6.2, ARM = 8.6;

    var base = new T.Mesh(new T.BoxGeometry(15, 1.0, 8.6), PAINT);
    base.position.y = 1.25; g.add(base);
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

    var col = new T.Mesh(new T.CylinderGeometry(.42, .58, 10.2, 20), STEEL);
    col.position.set(0, 6.95, -1.3); g.add(col);
    var collar = new T.Mesh(new T.CylinderGeometry(.72, .72, .5, 20), FINE);
    collar.position.set(0, 11.95, -1.3); g.add(collar);
    var bracket = new T.Mesh(new T.BoxGeometry(3.2, .5, 2.9), STEEL);
    bracket.position.set(0, 12.05, -.55); g.add(bracket);
    var knife = new T.Mesh(new T.CylinderGeometry(.26, .26, 1.8, 3), FINE);
    knife.rotation.x = Math.PI / 2; knife.position.set(0, 12.34, .25); g.add(knife);

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

    /* 游码标尺：金属托条与挂耳真正连到横梁，不再是悬空白条 */
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
    var rider = new T.Group(); rider.position.set(-6.2, -1.12, .87); piv.add(rider);
    var rTop = new T.Mesh(new T.BoxGeometry(.72, .16, 1.16), BRASS);
    rTop.position.y = .60; rider.add(rTop);
    [-1, 1].forEach(function (s) {
      var side = new T.Mesh(new T.BoxGeometry(.16, 1.16, 1.0), BRASS);
      side.position.set(s * .32, 0, 0); rider.add(side);
    });
    var rKnob = new T.Mesh(new T.SphereGeometry(.24, 12, 8), FINE);
    rKnob.position.set(0, .78, 0); rider.add(rKnob);

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

    /* 三根吊丝从横梁端吊架斜张到盘沿三挂耳，底端止于盘沿、不插进盘内 */
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
      var PANSTEEL = new T.MeshStandardMaterial({ color: 0x9fabb5, roughness: .36, metalness: .8, envMapIntensity: 1.0 });
      var wall = new T.Mesh(new T.CylinderGeometry(3.05, 2.72, .62, 32, 1, true), PANSTEEL);
      wall.position.y = .25; pan.add(wall);
      var bottom = new T.Mesh(new T.CylinderGeometry(2.74, 2.74, .14, 32),
        new T.MeshStandardMaterial({ color: 0x96a1ac, roughness: .32, metalness: .82 }));
      pan.add(bottom);
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
    g.userData.setTilt(0);
    return g;
  }

  /* ══ 分级砝码：质量越大个头越大，顶钮 + 刻字 ══ */
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
    g.userData.h = h; g.userData.r = r; g.userData.v = v;
    return g;
  }

  /* ══ 砝码盒：木盒 + 黄铜口沿凹孔（本课 8 只砝码，4×2 排布）══ */
  function makeWeightsBox() {
    var g = new T.Group();
    var WOOD = new T.MeshStandardMaterial({ color: 0x6b4b32, roughness: .72, metalness: .05 });
    var DARK = new T.MeshStandardMaterial({ color: 0x22282e, roughness: .8, metalness: .1 });
    var BRASS = new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9 });
    var COLS = 4, BW = COLS * 3.0 + 1.6;
    var shell = new T.Mesh(new T.BoxGeometry(BW, 1.7, 5.4), WOOD);
    shell.position.y = .85; g.add(shell);
    var tray = new T.Mesh(new T.BoxGeometry(BW - .6, .12, 4.8), DARK);
    tray.position.y = 1.72; g.add(tray);
    POOL.forEach(function (v, i) {
      var cx = -((COLS - 1) * 3.0) / 2 + (i % COLS) * 3.0, cz = (i < COLS ? -1.15 : 1.15);
      var hole = new T.Mesh(new T.CylinderGeometry(1.15, 1.15, .1, 24), DARK);
      hole.position.set(cx, 1.79, cz); g.add(hole);
      var rim = new T.Mesh(new T.TorusGeometry(1.17, .06, 6, 24), BRASS);
      rim.rotation.x = Math.PI / 2; rim.position.set(cx, 1.84, cz); g.add(rim);
      var lab = new T.Mesh(new T.PlaneGeometry(1.3, .46),
        new T.MeshBasicMaterial({ map: weightLabel(v), transparent: true, depthWrite: false }));
      lab.rotation.x = -Math.PI / 2; lab.position.set(cx, 1.85, cz + 1.62); g.add(lab);
    });
    var nameM = new T.Mesh(new T.PlaneGeometry(5.0, .9),
      new T.MeshBasicMaterial({ map: tex(512, 96, function (x, w, h) {
        x.fillStyle = '#c8b79a'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#3a2b1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 46px "Microsoft YaHei",sans-serif';
        x.fillText('砝码盒  110 g', w / 2, h / 2);
      }) }));
    nameM.position.set(0, .9, 2.71); g.add(nameM);
    return g;
  }

  function stoneKey(p, pan) {
    var a, b, t;
    if (p < .25) { a = HOME; b = pan; t = p / .25; }
    else if (p < .6) { a = pan; b = MOUTH; t = (p - .25) / .35; }
    else { a = MOUTH; b = SUB; t = (p - .6) / .4; }
    var v = a.clone().lerp(b, Math.max(0, Math.min(1, t)));
    if (p > .3) v.y += Math.sin(Math.PI * (p - .3) / .7) * 1.2;   // 提起弧线
    return v;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(68, 30);

      /* ── 天平：测石块质量（课件内重做版）────────────────── */
      var bal = makeBalance(); bal.position.set(-14, 0, 0); K.scene().add(bal); O.balance = bal;
      var wb = makeWeightsBox(); wb.position.set(-20, 0, 10.5); K.scene().add(wb); O.box = wb;
      O.weights = POOL.map(function (v, i) {
        var w = makeWeight(v); K.scene().add(w);
        home(w, -24 + i * 2.5, 6, 3);
        return w;
      });

      /* ── 量筒（50 mL）：玻璃筒 + 刻度贴图 + 水柱 + 凹液面 ── */
      var cyl = C.create('cylinder', { liquid: 0, marks: false, scale: CYL_S });
      cyl.position.set(CYL_X, 0, CYL_Z); K.scene().add(cyl); O.cyl = cyl;
      /* 不透明底座圈：盖住玻璃底盘透明双面渲染的放射摩尔纹（真实量筒底座即此观感）*/
      var collar = new T.Mesh(new T.CylinderGeometry(2.02 * CYL_S, 2.1 * CYL_S, .42 * CYL_S, 48),
        new T.MeshStandardMaterial({ color: 0xdfe6ec, roughness: .42, metalness: .08 }));
      collar.position.y = .21 * CYL_S; cyl.add(collar);
      var ticks = new T.Mesh(new T.PlaneGeometry(2.6, H_SCALE),
        new T.MeshBasicMaterial({ map: cylScaleTex(), transparent: true, side: T.DoubleSide }));
      ticks.position.set(0, Y0 + H_SCALE / 2, 1.62 * CYL_S + .05);   // 移到玻璃壁外侧
      cyl.add(ticks); O.ticks = ticks;

      var waterGeo = new T.CylinderGeometry(R_IN, R_IN * .98, 1, 32);
      waterGeo.translate(0, .5, 0);                    // 原点在底面，scale.y 即液面高
      var water = new T.Mesh(waterGeo, new T.MeshPhysicalMaterial({
        color: 0x9fd0e6, roughness: .15, metalness: 0, transparent: true,
        opacity: .6, side: T.DoubleSide, depthWrite: false }));
      water.position.y = Y0; cyl.add(water); O.water = water;
      var men = makeMeniscus(R_IN); cyl.add(men); O.men = men;

      /* ── 支架 + 横杆：细线的挂点，消除「线凭空吊着」 ────── */
      var stand = P.stand(14, { baseW: 5, baseD: 4 });
      stand.position.set(17, 0, 0); K.scene().add(stand); O.stand = stand;
      var topY = stand.userData.topY;
      var arm = new T.Mesh(new T.BoxGeometry(5, .4, .4), P.MAT.steel);
      arm.position.set(14.5, topY, 0); K.scene().add(arm);
      var hook = new T.Mesh(new T.TorusGeometry(.3, .1, 8, 14), P.MAT.brass);
      hook.position.set(CYL_X, topY - .2, 0); K.scene().add(hook);

      /* ── 同一块石块：先上天平，再由细线提去量筒浸没 ────── */
      var stone = new T.Group(); K.scene().add(stone); O.stone = stone;
      var rockGeo = new T.IcosahedronGeometry(STONE_R, 2);
      /* 顶点扰动：低频噪声让石块不规则，但平均半径不变（体积≈排水体积） */
      (function () {
        var pos = rockGeo.attributes.position, seed = [1.7, .53, 2.9];
        for (var i = 0; i < pos.count; i++) {
          var vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
          var n = Math.sin(vx * seed[0] + vy * seed[1]) * Math.cos(vz * seed[2] - vy * 1.3);
          var k2 = 1 + n * .13;
          pos.setXYZ(i, vx * k2, vy * k2, vz * k2);
        }
        rockGeo.computeVertexNormals();
      })();
      var rock = new T.Mesh(rockGeo,
        new T.MeshStandardMaterial({ color: 0x6f6049, roughness: .92, metalness: .02, flatShading: true }));
      stone.add(rock);
      var lineGeo = new T.CylinderGeometry(.05, .05, LINE_LEN, 8);
      lineGeo.translate(0, STONE_R + LINE_LEN / 2, 0);  // 从石块顶向上
      var line = new T.Mesh(lineGeo, P.MAT.rubber); stone.add(line); O.line = line;
      stone.position.copy(HOME);
      /* 备料小托盘（石块 HOME 有支撑，不悬空；浅灰以免烧成白斑） */
      var pad = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, .3, 24),
        new T.MeshStandardMaterial({ color: 0xc4cdd4, roughness: .55, metalness: .06 }));
      pad.position.set(HOME.x, .15, HOME.z); K.scene().add(pad);

      /* ── 烧杯 + 盐水（差减法器材，后排中景不被面板挡住）──── */
      var brine = C.create('beaker', { liquid: .55 });
      C.place(brine, 6, -7.5, 0); K.scene().add(brine); O.brine = brine;

      /* ── 接地阴影（深色台面用深色 blob，每件落地器材一个）── */
      P.ground(-14, 0, 12);   // 天平（含托盘外缘）
      P.ground(-20, 10.5, 8); // 砝码盒
      P.ground(-15.5, 6, 11); // 砝码 HOME 排
      P.ground(CYL_X, CYL_Z, 6); // 量筒
      P.ground(17, 0, 4);     // 支架
      P.ground(HOME.x, HOME.z, 3.4); // 石块托盘
      P.ground(6, -7.5, 4);   // 盐水杯

      K.tag(bal, '托盘天平', '先测质量：m = Σ砝码 = ' + M_STONE.toFixed(1) + ' g');
      K.tag(cyl, '量筒 50 mL', '排水法：V石 = V₂ − V₁，平视凹液面最低处');
      K.tag(stone, '石块 + 细线', '细线提着，由天平经筒口缓慢浸没');
      K.tag(O.stand, '铁架台', '横杆作细线挂点');
      K.tag(brine, '烧杯+盐水', '差减法：ρ盐水 = (m₁ − m₂)/V');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var target = s.submerge ? 1 : (s.onPan ? .25 : 0);
      s._p += (target - s._p) * Math.min(1, dt * 2.5);
      if (Math.abs(target - s._p) < 1e-3) s._p = target;

      var sum = sumPlaced(s);
      /* 天平只在测质量阶段按力矩差倾斜；离开后回平 */
      var a = 0;
      if (s.phase === 'mass') {
        var mL = (s.onPan && s._p < .35) ? M_STONE : 0;
        a = Math.max(-.16, Math.min(.16, (mL - sum) * .0028));
      }
      s._tilt += (a - s._tilt) * Math.min(1, dt * 6);
      O.balance.userData.setTilt(s._tilt);

      var panL = O.balance.userData.carriers[0], panR = O.balance.userData.carriers[1];
      var panY = O.balance.userData.panLocalY;
      /* 砝码：从盒前 HOME 位移到右盘（底部贴盘面，不再垫 h/2 悬空）*/
      var k = 0;
      for (var i = 0; i < O.weights.length; i++) {
        var w = O.weights[i], u = w.userData;
        var dx = ((k % 3) - 1) * 1.25, dz = (k % 2 ? .55 : -.55);
        var stack = Math.floor(k / 3) * .82;
        u.work = P.port(panR, dx, panY + .06 + stack, dz);
        glide(w, s.placed[i] ? 1 : 0, dt);
        if (s.placed[i]) k++;
      }
      /* 石块：HOME → 天平左盘 → 筒口 → 浸没（同一对象真实位移） */
      var panPos = P.port(panL, 0, panY + .12 + STONE_R, 0);
      O.stone.position.copy(stoneKey(s._p, panPos));
      O.line.visible = s._p > .22;      // 细线只在提起去量筒时出现，称量时不竖在盘上

      /* 倒水进度 → 已注入水体积；液面 = 水 + 排水体积，h = V/K_V，凹液面随 h */
      var pourT = s.poured ? 1 : 0;
      s._pour += (pourT - s._pour) * Math.min(1, dt * 2.5);
      if (Math.abs(pourT - s._pour) < 1e-3) s._pour = pourT;
      var imm = immersion(s._p);
      var vNow = V1 * s._pour + V_STONE * imm;
      var h = vNow / K_V;
      O.water.scale.y = Math.max(.001, h);
      O.men.position.y = Y0 + h;
    }
  };

  function reset(s) {
    s._t = 0; s._p = 0; s._tilt = 0; s._pour = 0;
    s.onPan = false; s.poured = false; s.submerge = false;
    s.wet = false; s.showWrong = false;
    s.judged = false; s.phase = 'mass';
    s.placed = POOL.map(function () { return false; });
  }
  function setMass(s) {                 // 摆出 Σ = 50+2+2 = 54 g
    s.placed = POOL.map(function () { return false; });
    s.placed[0] = true; s.placed[5] = true; s.placed[6] = true;
  }

  K.boot({
    title: '测量固体和液体的密度',
    chip: '物理 · 鲁教版 · 八上 · 第四章 物质与材料 · 第三节 测量物质的密度',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 14, dist: 58, tx: 0, tz: 0, yaw: .2, pitch: .24 },
    reads: [['phase', '阶段'], ['mass', '质量 m'], ['vol', '体积 V'], ['rho', '密度 ρ'],
            ['v1', 'V₁ 初读'], ['v2', 'V₂ 末读'], ['level', '液面 h']],
    values: function (s) {
      var sum = sumPlaced(s);
      var m = sum + (s.wet ? DM_WET : 0);             // 附着水时称得质量偏大
      var imm = immersion(s._p);
      var vBase = V1 * s._pour;                       // 已倒入的水体积（倒水进度）
      var vNow = vBase + V_STONE * imm;               // 当前量筒内总体积 = 水 + 排水
      var h = vNow / K_V;                             // 液面高度（模型）
      var vStone = vNow - vBase;                      // 排水体积 = V₂ − V₁
      var rho = vStone > 1e-6 ? m / vStone : NaN;
      return {
        phase: s.phase === 'mass' ? '测质量' : (s.phase === 'volume' ? '测体积' : '计算密度'),
        mass: m.toFixed(1) + ' g' + (s.wet ? '（含附着水）' : ''),
        vol: s.phase === 'mass' ? '—' : vStone.toFixed(1) + ' cm³',
        rho: (s.judged && isFinite(rho)) ? rho.toFixed(2) + ' g/cm³' + (s.showWrong ? '（偏大）' : '') : '—',
        v1: (V1 * s._pour).toFixed(1) + ' cm³',
        v2: vNow.toFixed(1) + ' cm³',
        level: h.toFixed(2) + ' cm'
      };
    },
    steps: [
      { name: '测质量', title: '用天平测小石块的质量',
        ask: '为什么测密度要先测质量、后测体积？',
        body: '<p><b>操作：</b>镊子夹石块放天平<b>左盘</b>，按由大到小往右盘加砝码；' +
          '每件砝码都从盒前 HOME 位真实移到托盘。</p>' +
          '<p><b>模型与参数：</b>平衡时 <b>m = Σm<sub>砝码</sub></b>（右侧「质量 m」由真正摆上托盘的砝码对象累加）。' +
          '石块设定密度 ρ = ' + RHO_STONE.toFixed(1) + ' g/cm³、体积 V = ' + V_STONE +
          ' cm³，故真实质量应为 <b>m = ρV = ' + M_STONE.toFixed(1) + ' g</b>。' +
          '砝码 ' + POOL[0] + '+' + POOL[5] + '+' + POOL[6] + ' = <b>' + SUM_M.toFixed(1) + ' g</b>，与设定一致。</p>' +
          '<p><b>边界：</b>天平须水平、左物右码；细线质量与体积忽略不计；' +
          '石块此时<b>干燥</b>，这是「先质量后体积」的前提。</p>' +
          '<p><b>易错点/反例：</b>若先浸水再称，石块表面附着水使 m 偏大，密度随之偏大（见「算密度」步反例）。</p>',
        apply: function (s) { reset(s); s.phase = 'mass'; },
        cam: { tx: -12, ty: 13, tz: 0, dist: 50, yaw: .28, pitch: .27 },
        controls: [
          { type: 'btn', label: '① 镊子把石块放上天平左盘', onClick: function (s) { s.onPan = true; } },
          { type: 'btn', label: '② 夹 ' + POOL[0] + 'g 砝码放右盘', onClick: function (s) { s.placed[0] = true; } },
          { type: 'btn', label: '③ 加 ' + POOL[5] + 'g + ' + POOL[6] + 'g，称得 m=' + SUM_M.toFixed(1) + 'g', onClick: function (s) { setMass(s); } }
        ] },

      { name: '测体积', title: '用量筒（排水法）测石块体积',
        ask: '“排水法”测体积，量筒读数为什么必须平视凹液面最低处？',
        body: '<p><b>操作：</b>量筒倒入适量水，平视<b>凹液面最低处</b>读 V₁；' +
          '用细线把石块经筒口<b>缓慢浸没</b>，再读 V₂，则 <b>V<sub>石</sub> = V₂ − V₁</b>。' +
          '画面里是<b>同一块</b>石块从天平被细线提走，液面随排水体积实时上升。</p>' +
          '<p><b>模型（液面高度→刻度换算）：</b>量筒量程 V<sub>量程</sub> = ' + V_MAX +
          ' mL、有效刻度高 H = ' + H_SCALE.toFixed(1) + ' cm，故每 1 cm 液柱 = ' +
          '<b>K = V<sub>量程</sub>/H = ' + K_V.toFixed(3) + ' cm³/cm</b>，读数 <b>V = K·h</b>（h 取凹液面最低处高度）。' +
          '液面上升由排水体积算：<b>V(h) = V₁ + V<sub>石</sub>·浸入进度</b>，无预置曲线点。</p>' +
          '<p><b>由模型算：</b>V₁ = ' + V1 + ' cm³（h₁ = ' + (V1 / K_V).toFixed(2) + ' cm）；' +
          '完全浸没后 V₂ = ' + V2 + ' cm³（h₂ = ' + (V2 / K_V).toFixed(2) + ' cm）；' +
          '<b>V<sub>石</sub> = ' + V2 + ' − ' + V1 + ' = ' + V_STONE + ' cm³</b>。' +
          '石块半径由 R=(3V/4π)<sup>1/3</sup> 反算为 ' + STONE_R.toFixed(2) + ' cm，几何体积与排水体积一致。</p>' +
          '<p><b>边界：</b>量筒竖直、平视（仰视读数偏小、俯视偏大）；石块完全浸没、不吸水、不碰壁；' +
          'V₂ = ' + V2 + ' cm³ 恰等于量程 ' + V_MAX + ' mL，故「适量水」必须保证浸没后<b>不溢出</b>。</p>' +
          '<p><b>反例：</b>细线过粗会额外排水，使 V₂ 偏大、V<sub>石</sub> 偏大、ρ <b>偏小</b>；' +
          '仰视 V₂ 则使 V<sub>石</sub> 偏小、ρ 偏大。</p>',
        apply: function (s) { reset(s); s.phase = 'volume'; s._p = .25; s.onPan = true; setMass(s); },
        cam: { tx: 12, ty: 14, tz: 0, dist: 36, yaw: -.3, pitch: .26 },
        controls: [
          { type: 'btn', label: '① 量筒倒入适量水，平视读 V₁ = ' + V1 + ' cm³', onClick: function (s) { s.poured = true; } },
          { type: 'btn', label: '② 用细线把石块缓慢浸没', onClick: function (s) { s.poured = true; s.submerge = true; } },
          { type: 'btn', label: '③ 平视读 V₂ = ' + V2 + ' cm³', onClick: function (s) { s.poured = true; s.submerge = true; } }
        ] },

      { name: '算密度', title: '计算石块与盐水的密度',
        ask: '公式 ρ = m / V 里，各量的单位如何对应？',
        body: '<p><b>公式：</b><b>ρ = m / V</b>。由前两步模型值：m = ' + SUM_M.toFixed(1) +
          ' g、V = ' + V_STONE + ' cm³，故 <b>ρ = ' + SUM_M.toFixed(1) + ' / ' + V_STONE +
          ' = ' + (SUM_M / V_STONE).toFixed(2) + ' g/cm³</b>（= ' + (SUM_M / V_STONE * 1000).toFixed(0) + ' kg/m³）。' +
          '右侧 ρ 每帧由 m/V 实时算，不是写死结果。</p>' +
          '<p><b>盐水（差减法）：</b>先称烧杯+盐水 m₁ = ' + M_BRINE_1.toFixed(1) +
          ' g，倒出 V = ' + V_BRINE + ' cm³ 到量筒，再称剩余 m₂ = ' + M_BRINE_2.toFixed(1) +
          ' g，则 <b>ρ<sub>盐水</sub> = (m₁ − m₂)/V = (' + M_BRINE_1.toFixed(1) + ' − ' + M_BRINE_2.toFixed(1) +
          ')/' + V_BRINE + ' = ' + RHO_BRINE.toFixed(2) + ' g/cm³</b>。先测「杯+液」可避免倒液后杯壁残液带来的系统偏差。</p>' +
          '<p><b>单位与边界：</b>g/cm³ 对应 g 与 cm³，kg/m³ 对应 kg 与 m³，换算 1 g/cm³ = 1000 kg/m³；' +
          '模型假设石块不吸水、不溶于液、完全浸没，且天平与量筒均已调零/竖直。</p>' +
          '<p><b>反例（顺序颠倒）：</b>若先测体积再测质量，石块沾水设附着水 Δm = ' + DM_WET.toFixed(1) +
          ' g，则 m′ = ' + (SUM_M + DM_WET).toFixed(1) + ' g、' +
          'ρ′ = ' + (SUM_M + DM_WET).toFixed(1) + '/' + V_STONE + ' = <b>' + ((SUM_M + DM_WET) / V_STONE).toFixed(2) +
          ' g/cm³</b>，比真值偏大 ' + (DM_WET / V_STONE).toFixed(2) + ' g/cm³。按下方按钮切换对照。</p>',
        apply: function (s) { reset(s); s.phase = 'calc'; s._p = 1; s.submerge = true; s.onPan = true; s.poured = true; s._pour = 1; setMass(s); s.judged = true; },
        cam: { tx: 0, ty: 15, tz: 0, dist: 58, yaw: .2, pitch: .22 },
        controls: [
          { type: 'btn', label: '得出密度 ρ = ' + (SUM_M / V_STONE).toFixed(2) + ' g/cm³', onClick: function (s) { s.judged = true; } },
          { type: 'btn', label: '反例：先测体积后测质量（沾水）', onClick: function (s) { s.wet = true; s.showWrong = true; } },
          { type: 'btn', label: '恢复正常顺序', onClick: function (s) { s.wet = false; s.showWrong = false; } }
        ] },

      { name: '注意', title: '误差来源与易错点',
        ask: '石块必须“完全浸没且不吸水”，为什么？',
        body: '<p><b>注意：</b>①「适量水」= 能浸没石块且浸没后不溢出（本例 V₂ = ' + V2 +
          ' cm³ 恰为量程 ' + V_MAX + ' mL）；② 石块须完全浸没、不吸水；' +
          '③ 误差主要来自天平砝码累加、量筒凹液面读数与石块沾水。</p>' +
          '<p><b>模型边界：</b>V = K·h 只在量筒等截面、竖直时成立；' +
          'ρ = m/V 要求 m 与 V 来自<b>同一块</b>石块、且状态（干/湿）一致；' +
          '细线体积、水的蒸发、温度对密度的影响均未计入。</p>' +
          '<p><b>反例：</b>石块吸水会使 V₂ 偏小、V<sub>石</sub> 偏小、ρ 偏大；' +
          '石块碰底或露出水面会使排水体积不是真实体积；读数俯视/仰视各引入方向相反的系统偏差。</p>' +
          '<p><b>应用：</b>密度是物质特性，可鉴别物质、判断空心实心、盐水选种。</p>',
        apply: function (s) { reset(s); s.phase = 'calc'; s._p = 1; s.submerge = true; s.onPan = true; s.poured = true; s._pour = 1; setMass(s); s.judged = true; },
        cam: { tx: -2, ty: 14, tz: 0, dist: 62, yaw: .2, pitch: .24 } }
    ],
    quiz: function () {
      var bank = [
        { q: '测不规则固体体积常用？', opts: ['排水法', '称重法', '刻度尺', '天平'], ans: '排水法', why: '排水法：V物 = V2 − V1，适用于不吸水固体。' },
        { q: '测密度为什么要“先质量后体积”？', opts: ['防石块沾水增重', '习惯', '省时间', '仪器限制'], ans: '防石块沾水增重', why: '先浸水会使石块沾水，再称质量偏大，密度偏大。' },
        { q: '量筒读数应？', opts: ['平视凹液面最低处', '仰视', '俯视', '随便'], ans: '平视凹液面最低处', why: '平视才准确；仰视偏小、俯视偏大。' },
        { q: '石块ρ=2.7g/cm³，表示？', opts: ['每cm³质量2.7g', '重2.7g', '体积2.7', '密度可变'], ans: '每cm³质量2.7g', why: '密度是单位体积的质量，是物质特性。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
