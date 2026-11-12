/* 格物实验室 · 探究水在沸腾前后温度变化的特点（three.js 单文件课件）
   鲁教版 九年级上册 · 第十一章 物态变化 · 第三节 汽化与液化
   装置：铁架台 + 石棉网 + 烧杯（水） + 酒精灯（下加热） + 温度计
   现象：加热→水温上升→底部小气泡→沸腾（大量气泡、温度不变）→继续加热温度不变 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  var st = {
    heat: 0,        /* 酒精灯是否点燃 0/1 */
    temp: 20,       /* 当前水温 ℃（与 HEAT.T0 同源） */
    tHeat: 0,       /* 累计加热时间 s（驱动温度-时间图） */
    boil: 0,        /* 是否沸腾 0/1 */
    rec: [],        /* 记录 (t, temp) 用于描点作图 */
    removed: 0,     /* 是否移走酒精灯 0/1 */
    steam: 0,       /* 白气强度 0..1 */
    judged: false,
    t: 0
  };

  var O = {};
  var RIG = {
    beakerX: 0, beakerZ: 0,
    ringY: 6.0, netY: 6.5, beakerY: 6.7,
    lampX: -0.2, lampZ: 3.2, lampS: 1.7, flameY: 5.0, flameH: 1.5,
    standX: -5.4, standZ: 0, postH: 15,
    thermoX: 0, thermoZ: 0, thermoBaseY: 6.6, thermoClampY: 12.5,
    waterLevel: 0.62
  };
  var BOIL_T = 100;

  /* ── 热学模型参数（唯一真源；温度-时间曲线由此生成，不再预置折线点）──
     升温段：Q = P·t = c·m·ΔT  →  T(t) = T0 + P·t /(c·m)（t 以秒计）
     沸腾段：达到沸点后温度恒定，继续吸热全部用于汽化 Q = m·L */
  var HEAT = {
    T0: 20,        // 初温 ℃
    Tb: BOIL_T,    // 标准大气压下沸点 ℃
    P: 140,        // 有效加热功率 W
    c: 4.2e3,      // 水的比热容 J/(kg·℃)
    m: 0.2,        // 水的质量 kg
    L: 2.26e6      // 水的汽化热 J/kg
  };
  var Q_HEAT = HEAT.c * HEAT.m * (HEAT.Tb - HEAT.T0);   // 升到沸点所需热量 J
  var T_BOIL_S = Q_HEAT / HEAT.P;                        // 升到沸点所需时间 s
  var Q_VAP = HEAT.m * HEAT.L;                           // 全部汽化所需热量 J
  var T_VAP_S = Q_VAP / HEAT.P;                          // 全部汽化所需时间 s
  /* 升温段按 T(t)=T0+P·t/(c·m)，到沸点后钳制为 Tb 恒定。
     演示加速：1 s 屏幕时间 = 30 s 实验时间；温度、曲线横轴、正文共用同一 tHeat，
     旧版 update 里另写了一条 dt*6 ℃/s 的升温，与本节解析式完全不是一条曲线。 */
  var TIME_SCALE = 30;
  function tempModel(tSec) {
    return Math.min(HEAT.Tb, HEAT.T0 + HEAT.P * tSec / (HEAT.c * HEAT.m));
  }
  function tForTemp(tC) { return (tC - HEAT.T0) * HEAT.c * HEAT.m / HEAT.P; }

  /* 内焰：半透明「尖头向上」的水滴，与体积火叠出火苗层次。
     旧版把 Lathe 火苗 depthTest:false + renderOrder 7 强制画在最前，
     近景里被压成一枚贴在石棉网上的橙色煎蛋，且会盖住烧杯与温度计。 */
  function makeInnerFlame() {
    var g = new T.Group();
    var prof = [[.02, 0], [.42, .18], [.70, .46], [.60, .80], [.28, 1.10], [.02, 1.32]];
    var pts = prof.map(function (p) { return new T.Vector2(p[0], p[1]); });
    var outer = new T.Mesh(new T.LatheGeometry(pts, 24),
      new T.MeshBasicMaterial({ color: 0xff7820, transparent: true, opacity: .72,
        side: T.DoubleSide, depthWrite: false }));
    outer.scale.set(1.15, 1.15, 1.15); g.add(outer);
    var inner = new T.Mesh(new T.LatheGeometry(pts, 20),
      new T.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: .9,
        side: T.DoubleSide, depthWrite: false }));
    inner.scale.set(.62, .86, .62); inner.position.y = .10; g.add(inner);
    g.userData = { outer: outer, inner: inner };
    return g;
  }

  /* 温度-时间曲线由热学模型逐点生成，不再预置折线点：
     0~8 min 按 T(t) = T0 + P·t/(c·m) 升温；达到沸点后 T≡Tb 恒定，
     继续吸热用于汽化 Q = m·L（L=2.26e6 J/kg），形成清晰水平段。
     drawGraph 的横轴以 min 为单位，故这里存 t/60。 */
  function seedBoilCurve() {
    var rec = [], tEnd = 12 * 60, dt = 30;   // 0~12 min，每 30 s 一点
    for (var t = 0; t <= tEnd + 1e-6; t += dt) rec.push([t / 60, tempModel(t)]);
    return rec;
  }
  /* 从 0 时刻补到当前实验时刻：进入「加热中 / 沸腾前」时图像已有完整升温段，
     而不是只从中间冒出一截线头（曲线仍由同一个解析式生成）。 */
  function seedUpTo(tSec) {
    var rec = [], dt = 15;
    for (var t = 0; t <= tSec; t += dt) rec.push([t / 60, tempModel(t)]);
    rec.push([tSec / 60, tempModel(tSec)]);
    return rec;
  }

  function ease(cur, tgt, dt, sp) {
    var k = Math.min(1, dt * (sp || 3));
    var v = cur + (tgt - cur) * k;
    if (Math.abs(tgt - v) < 1e-3) v = tgt;
    return v;
  }

  /* 真实酒精灯（与温度计课同款）：玻璃灯体 + 灯芯管 + 棉芯 + 旁置金属灯帽。
     灯芯顶端 ≈ y=5，与现有 K.shaderFlame 的火焰底对齐；玻璃靠轮廓线定形。 */
  function makeAlcoholLamp(o) {
    o = o || {};
    var g = new T.Group();
    var bodyH = 4.2, R = 2.2;
    var glass = new T.MeshPhysicalMaterial({ color: 0xeef6fb, roughness: .06, metalness: 0,
      transparent: true, opacity: .34, side: T.DoubleSide, depthWrite: false,
      clearcoat: .8, clearcoatRoughness: .08, envMapIntensity: 1.4 });
    var prof = [
      [0, 0], [R * .72, 0], [R * .86, .18], [R * .98, .55], [R, 1.25],
      [R * .96, 2.10], [R * .78, 2.85], [.62, 3.35], [.52, 3.75], [.52, bodyH]
    ].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var body = new T.Mesh(new T.LatheGeometry(prof, 40), glass);
    body.castShadow = false; body.renderOrder = 3; g.add(body);
    /* 酒精液面：半瓶淡蓝液体 + 一片可见液面，玻璃瓶才不是「空心白球」 */
    var alc = new T.Mesh(new T.CylinderGeometry(R * .80, R * .72, 1.9, 32),
      new T.MeshStandardMaterial({ color: 0x86b7d0, roughness: .25,
        transparent: true, opacity: .55, depthWrite: false }));
    alc.position.y = 1.05; g.add(alc);
    var alcTop = new T.Mesh(new T.CircleGeometry(R * .80, 32),
      new T.MeshStandardMaterial({ color: 0xb9d8e8, roughness: .2,
        transparent: true, opacity: .72, side: T.DoubleSide, depthWrite: false }));
    alcTop.rotation.x = -Math.PI / 2; alcTop.position.y = 2.0; g.add(alcTop);
    var collar = new T.Mesh(new T.CylinderGeometry(.55, .62, .8, 20),
      new T.MeshStandardMaterial({ color: 0x9aa3ad, metalness: .85, roughness: .3, envMapIntensity: 1.1 }));
    collar.position.y = bodyH + .3; g.add(collar);
    var wick = new T.Mesh(new T.CylinderGeometry(.2, .22, .55, 12),
      new T.MeshStandardMaterial({ color: 0x2b231c, roughness: .9 }));
    wick.position.y = bodyH + .65; g.add(wick);
    var lineCol = 0x3f6079;
    function ring(y, rr, op) {
      var pts = [], k;
      for (k = 0; k <= 48; k++) {
        var a = k / 48 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts.slice(0, 48)),
        new T.LineBasicMaterial({ color: lineCol, transparent: true, opacity: op })));
    }
    ring(.05, R * .72, .8);
    ring(1.25, R, .55);
    ring(3.75, .52, .85);
    ring(bodyH, .52, .9);
    /* 两侧母线：玻璃靠轮廓定形，浅墙前也读得出瓶身收肩 */
    [-1, 1].forEach(function (sg) {
      g.add(new T.Line(new T.BufferGeometry().setFromPoints([
        new T.Vector3(sg * R, 1.25, 0), new T.Vector3(sg * R * .96, 2.10, 0),
        new T.Vector3(sg * .62, 3.35, 0), new T.Vector3(sg * .52, bodyH, 0)]),
        new T.LineBasicMaterial({ color: lineCol, transparent: true, opacity: .7 })));
    });
    var capMat = new T.MeshStandardMaterial({ color: 0x707a84, metalness: .7, roughness: .4 });
    var cap = new T.Group();
    var capBody = new T.Mesh(new T.CylinderGeometry(.85, .9, 1.1, 24), capMat);
    capBody.position.y = .55; cap.add(capBody);
    var capTop = new T.Mesh(new T.CylinderGeometry(.8, .8, .12, 24), capMat);
    capTop.position.y = 1.15; cap.add(capTop);
    var knob = new T.Mesh(new T.SphereGeometry(.28, 14, 10), capMat);
    knob.position.y = 1.42; cap.add(knob);
    cap.position.set(3.6, 0, .8); g.add(cap);
    g.position.set(o.x || 0, 0, o.z || 0);
    return g;
  }

  /* 温度-时间图像板：CanvasTexture 贴在场景里的竖板上，逐帧重绘 */
  var graphCv = null, graphCtx = null, graphTex = null;
  function initGraph() {
    graphCv = document.createElement('canvas'); graphCv.width = 520; graphCv.height = 380;
    graphCtx = graphCv.getContext('2d');
    graphTex = new T.CanvasTexture(graphCv); graphTex.anisotropy = 4;
  }
  function drawGraph() {
    var x = graphCtx, W = 520, H = 380, m = 52;
    /* 深底亮线：旧版浅色板在浅墙前糊成一整块白板，只有几个淡数字 */
    x.fillStyle = '#15232e'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#e6f1f8'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(m, 16); x.lineTo(m, H - m); x.lineTo(W - 16, H - m); x.stroke();
    x.fillStyle = '#eaf4fa'; x.font = 'bold 21px "Microsoft YaHei",sans-serif';
    x.textAlign = 'center'; x.fillText('时间 t / min', (m + W - 16) / 2, H - 12);
    x.save(); x.translate(17, (16 + H - m) / 2); x.rotate(-Math.PI / 2);
    x.fillText('温度 T / ℃', 0, 0); x.restore();
    x.textAlign = 'right'; x.font = 'bold 21px Consolas,monospace';
    for (var t = 0; t <= 100; t += 20) {
      var yy = H - m - (t / 110) * (H - m - 16);
      x.fillStyle = '#e8f3fa'; x.fillText(String(t), m - 8, yy + 6);
      x.strokeStyle = '#3b5263'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(m, yy); x.lineTo(W - 16, yy); x.stroke();
    }
    x.textAlign = 'center'; x.font = 'bold 18px Consolas,monospace';
    for (var tm = 0; tm <= 12; tm += 2) {
      var xx = m + (tm / 12) * (W - 16 - m);
      x.fillStyle = '#bfd3e0'; x.fillText(String(tm), xx, H - m + 22);
    }
    x.fillStyle = '#ffd08a'; x.font = 'bold 21px "Microsoft YaHei",sans-serif';
    x.textAlign = 'left'; x.fillText('水的温度—时间图像', m + 10, 32);
    /* 描绘记录点 + 连线 */
    var rec = st.rec, n = rec.length;
    if (n > 1) {
      x.strokeStyle = '#ff7461'; x.lineWidth = 3.4; x.beginPath();
      for (var i = 0; i < n; i++) {
        var px = m + (rec[i][0] / 12) * (W - 16 - m);
        var py = H - m - (rec[i][1] / 110) * (H - m - 16);
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = '#9be2ff';
      for (var j = 0; j < n; j += Math.max(1, Math.floor(n / 24))) {
        var qx = m + (rec[j][0] / 12) * (W - 16 - m);
        var qy = H - m - (rec[j][1] / 110) * (H - m - 16);
        x.beginPath(); x.arc(qx, qy, 3.2, 0, 6.283); x.fill();
      }
    }
    if (graphTex) graphTex.needsUpdate = true;
  }

  var scene = {
    setup: function () {
      var MK = C.MAT;
      var MAT = {
        glass: MK.glass, steel: MK.metal, dark: MK.metalD, rubber: MK.rubber,
        water: new T.MeshPhysicalMaterial({ color: 0x79b6d4, roughness: .15, metalness: 0,
          transparent: true, opacity: .40, side: T.BackSide, transmission: .2,
          depthWrite: false, envMapIntensity: .6 }),
        ceramic: new T.MeshStandardMaterial({ color: 0xd8d2c4, roughness: .9 }),
        bulb: new T.MeshStandardMaterial({ color: 0x222428, roughness: .85 })
      };
      O.MAT = MAT;

      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .8;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(42, 16);
      /* 白台面配白墙会发白：台面压一档 */
      (function () {
        var top = null;
        K.scene().traverse(function (o) {
          if (!top && o.isMesh && o.material && o.material.color &&
              o.material.color.getHexString() === '171d21') top = o;
        });
        if (top) top.material = new T.MeshStandardMaterial({
          color: 0x171d21, map: top.material.map, roughness: .62, metalness: 0, envMapIntensity: 0 });
      })();

      /* ═══ 铁架台（物理专用）：底座 + 立杆 + 铁圈（托石棉网/烧杯）+ 温度计夹 ═══ */
      var stand = P.ringStand({ postX: RIG.standX, postZ: RIG.standZ, postH: RIG.postH,
        ringX: RIG.beakerX, ringZ: RIG.beakerZ, ringY: RIG.ringY, ringR: 3.4,
        clampY: RIG.thermoClampY });
      K.scene().add(stand); O.stand = stand;

      /* ═══ 石棉网（物理专用）：搁在铁圈上（铁圈之上约 0.25）═══ */
      var net = P.asbestosNet(); net.position.set(RIG.beakerX, RIG.netY, RIG.beakerZ);
      K.scene().add(net); O.net = net;

      /* ═══ 烧杯（化学高模，含水位环）：搁在石棉网上 ═══ */
      var beaker = C.create('beaker', { liquid: RIG.waterLevel });
      C.place(beaker, RIG.beakerX, RIG.beakerZ, RIG.beakerY);
      K.scene().add(beaker); O.beaker = beaker;
      /* 真实水柱（玻璃半透明，看得见）：在水位内补一截淡蓝水 */
      var wR = 2.9, wH = RIG.waterLevel * 5.0;
      var water = new T.Mesh(new T.CylinderGeometry(wR, wR * .96, wH, 28), MAT.water);
      water.position.set(RIG.beakerX, RIG.beakerY + wH / 2, RIG.beakerZ);
      water.renderOrder = 1;              /* 水先画、气泡后画，不会被水的前后两面冲淡 */
      K.scene().add(water); O.water = water;

      /* ═══ 酒精灯（玻璃灯体 + 灯芯管 + 灯帽）+ 外焰（舔石棉网下方）═══ */
      var lamp = makeAlcoholLamp({ x: RIG.lampX, z: RIG.lampZ });
      K.scene().add(lamp); O.lamp = lamp;
      O.flame = K.shaderFlame({ x: RIG.lampX, y: RIG.flameY, z: RIG.lampZ,
        r: 1.3, h: RIG.flameH, light: 1.9, dist: 13 });
      O.flame.mesh.traverse(function (m) { m.renderOrder = 5; });
      /* 暖色火苗（沿用蜡烛基准课的配色：橙黄主体 + 仅底部一点蓝） */
      if (O.flame.mat && O.flame.mat.uniforms) {
        O.flame.mat.uniforms.uHot.value.set(1.0, .88, .52);
        O.flame.mat.uniforms.uMid.value.set(1.0, .40, .06);
      }
      /* 内焰：更亮更白，叠在主体里增加层次 */
      O.flameInner = K.shaderFlame({ x: RIG.lampX, y: RIG.flameY + .15, z: RIG.lampZ,
        r: .7, h: RIG.flameH * .72, light: 0, dist: 13 });
      O.flameInner.mesh.traverse(function (m) { m.renderOrder = 6; });
      if (O.flameInner.mat && O.flameInner.mat.uniforms) {
        O.flameInner.mat.uniforms.uHot.value.set(1.0, 1.0, .96);
        O.flameInner.mat.uniforms.uMid.value.set(1.0, .88, .55);
        O.flameInner.mat.uniforms.uLow.value.set(1.0, .70, .30);
      }
      O.flameInner.light.visible = false;
      /* 半透明内焰：底部贴灯芯顶，尖端恰好舔到石棉网下方 */
      O.flameCore = makeInnerFlame();
      O.flameCore.position.set(RIG.lampX, RIG.flameY - .25, RIG.lampZ);
      K.scene().add(O.flameCore);

      /* ═══ 温度计（物理专用）：顶部由铁架台温度计夹固定，玻璃泡浸入水中 ═══ */
      var th = P.thermometer({ lo: 0, hi: 110, major: 10, minor: 5 });
      th.scale.y = .88;                 /* 顶端不冲出画面，夹子仍夹在管身中段 */
      th.position.set(RIG.thermoX, RIG.thermoBaseY, RIG.thermoZ);
      K.scene().add(th); O.thermo = th;
      O.thermo.userData.setTemp(st.temp);
      /* 液泡本来就是温度计的一部分：与红色液柱同色、略缩小，
         旧版缩成一颗暗红/粉小球又只在加热时显示，读作「水里浮着玻璃珠」。 */
      O.thBulb = null;
      th.traverse(function (m) {
        if (!m.isMesh || !m.material || !m.material.color || !m.geometry) return;
        if (m.geometry.type !== 'SphereGeometry') return;
        var c = m.material.color;
        if (c.r > .5 && c.g < .35 && c.b < .3) O.thBulb = m;
      });
      if (O.thBulb) {
        O.thBulb.scale.setScalar(.62);
        O.thBulb.material = new T.MeshBasicMaterial({ color: 0xc62d20, depthTest: false });
        O.thBulb.renderOrder = 7;
      }

      /* ═══ 气泡系统：沸腾时从杯底升起 ═══ */
      O.bubbles = [];
      var bgeo = new T.SphereGeometry(1, 12, 10);
      /* 气泡：杯内范围受限（r<2.35 < 杯内半径），关深度测试确保不被
         玻璃杯壁 / 水柱 / 透明排序吞掉；白球在浅蓝水里才读得出「大量气泡」。 */
      var bmat = new T.MeshBasicMaterial({ color: 0xf4fcff, transparent: true,
        opacity: .9, depthTest: false, depthWrite: false });
      for (var i = 0; i < 96; i++) {
        var b = new T.Mesh(bgeo, bmat.clone());
        b.renderOrder = 8;
        var rr = Math.random() * 2.35, ang = Math.random() * 6.283;
        b.userData = { x: Math.cos(ang) * rr, z: Math.sin(ang) * rr,
          y0: RIG.beakerY + .35, y1: RIG.beakerY + wH - .12, p: Math.random(),
          sp: .32 + Math.random() * .48, r: .28 + Math.random() * .45 };
        b.visible = false; K.scene().add(b); O.bubbles.push(b);
      }

      /* ═══ 白气（沸腾上方）：几团软精灵 ═══ */
      O.steam = [];
      var stex = (function () {
        var c = document.createElement('canvas'); c.width = c.height = 64;
        var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(228,238,246,.50)'); g.addColorStop(1, 'rgba(228,238,246,0)');
        x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
      })();
      for (var s = 0; s < 8; s++) {
        var sp = new T.Sprite(new T.SpriteMaterial({ map: stex, transparent: true,
          opacity: 0, depthTest: true, depthWrite: false }));
        sp.renderOrder = 3;
        sp.scale.set(3.2, 3.2, 1); sp.userData = { p: Math.random(), sp: .3 + Math.random() * .3 };
        K.scene().add(sp); O.steam.push(sp);
      }

      /* ═══ 温度-时间图像板（竖板，置于器材左后方，避开右侧信息栏）═══ */
      initGraph();
      var board = new T.Mesh(new T.PlaneGeometry(13, 9.5),
        new T.MeshBasicMaterial({ map: graphTex }));
      board.position.set(-13, 11, -5); board.rotation.y = 0.5; K.scene().add(board); O.board = board;
      /* 不透明深色底板：原来浅色框在浅墙前发白发虚，深色实底把板子「压住」 */
      var boardFrame = new T.Mesh(new T.BoxGeometry(13.6, 10.1, .5),
        new T.MeshStandardMaterial({ color: 0x2f3a44, roughness: .7 }));
      boardFrame.position.set(-13, 11, -5.35); boardFrame.rotation.y = 0.5; K.scene().add(boardFrame);
      /* 两根支撑立杆按板的旋转角摆放（旧版杆与斜放的板错开，像两根孤立的杆），
         底部各有一块小底座，板子才真的「站在桌上」 */
      var BR = 0.5, bx = -13, bz = -5.35;
      [-1, 1].forEach(function (sg) {
        var px = bx + sg * 5.2 * Math.cos(BR);
        var pz = bz - sg * 5.2 * Math.sin(BR);
        K.rod([px, 0, pz], [px, 6.0, pz], .18, { mat: P.MAT.steelD });
        var foot = new T.Mesh(new T.BoxGeometry(1.6, .28, 1.6), P.MAT.dark);
        foot.position.set(px, .14, pz); K.scene().add(foot);
      });

      /* ═══ 接地阴影（深色台面用深色 blob，白色会读成白斑）+ 标注 ═══ */
      P.ground(RIG.beakerX, RIG.beakerZ, 5);
      P.ground(RIG.lampX, RIG.lampZ, 2.2);
      K.tag(O.beaker, '烧杯', '盛水，置于石棉网上');
      K.tag(O.lamp, '酒精灯', '用外焰加热');
      K.tag(O.thermo, '温度计', '玻璃泡浸没，不碰杯底');
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      var wH = RIG.waterLevel * 5.0;

      /* 灯焰亮度跟随点燃状态：撤火后火焰、气泡、白气一起停 */
      var lv = (s.heat > .5 && s.removed < .5) ? 1 : 0;
      s.flameLv = (s.flameLv === undefined) ? 0 : s.flameLv;
      s.flameLv = ease(s.flameLv, lv, dt, 4);
      O.flame.setLit(s.flameLv); O.flame.tick(s.t);
      if (O.flameInner) { O.flameInner.setLit(s.flameLv); O.flameInner.tick(s.t); }
      if (O.flameCore) {
        var fl = Math.max(0, s.flameLv);
        O.flameCore.visible = fl > .02;
        var flick = 0.94 + 0.06 * Math.sin(s.t * 9) * Math.sin(s.t * 5.3);
        O.flameCore.scale.set(1.02 + .22 * fl, (1.02 + .22 * fl) * flick, 1.02 + .22 * fl);
        O.flameCore.rotation.y = s.t * 0.55;
        O.flameCore.userData.outer.material.opacity = .72 * fl;
        O.flameCore.userData.inner.material.opacity = .90 * fl;
      }

      /* 水温演化：与温度-时间图像共用同一解析式 T(t)=T0+P·t/(c·m)。
         tHeat 是「实验秒」，按 TIME_SCALE 加速；不再另写一条 dt*6 ℃/s。 */
      if (s.heat > .5 && s.removed < .5) {
        s.tHeat += dt * TIME_SCALE;
        s.temp = tempModel(s.tHeat);
        if (s.temp >= BOIL_T - .02) { s.temp = BOIL_T; s.boil = 1; }
      } else if (s.removed > .5) {
        s.boil = 0;                                   /* 撤火：沸腾立即停止 */
        if (s.temp > HEAT.T0) s.temp -= dt * 1.2;      /* 余温缓降 */
      }
      s.temp = Math.max(HEAT.T0, Math.min(BOIL_T, s.temp));

      /* 记录（每 ~0.4s 屏幕时间一点）；graphFrozen 时保留由热学模型生成的冻结曲线 */
      if (!s.graphFrozen && s.heat > .5 && s.removed < .5) {
        s._recT = (s._recT === undefined) ? 0 : s._recT + dt;
        if (s._recT > .4) { s._recT = 0; s.rec.push([s.tHeat / 60, s.temp]); if (s.rec.length > 400) s.rec.shift(); }
      }
      O.thermo.userData.setTemp(s.temp);
      drawGraph();

      /* 气泡：沸腾前「上升变小、消失」，沸腾时「上升变大、到水面破裂」。
         撤火后气泡与白气必须立刻停（旧版只按 s.boil 判断，移走酒精灯仍在翻腾）。 */
      var heating = s.heat > .5 && s.removed < .5;
      var boiling = s.boil > .5 && heating;
      var bubbleOn = boiling ? 1 : (heating && s.temp > 85 ? (s.temp - 85) / 15 * .7 : 0);
      for (var i = 0; i < O.bubbles.length; i++) {
        var b = O.bubbles[i], u = b.userData;
        var show = (i / O.bubbles.length) < bubbleOn && u.p < .94;
        b.visible = show;
        if (!show) continue;
        u.p += dt * u.sp * (0.5 + bubbleOn);
        if (u.p > 1) u.p -= 1;
        var yy = u.y0 + (u.y1 - u.y0) * u.p;
        b.position.set(RIG.beakerX + u.x, yy, RIG.beakerZ + u.z);
        var sc;
        if (boiling) {
          sc = u.r * (.42 + u.p * 1.05);
          if (u.p > .88) sc *= Math.max(.12, 1 - (u.p - .88) / .06);   /* 水面破裂 */
        } else {
          sc = u.r * (.85 - .72 * u.p);                                  /* 上升变小 */
        }
        b.scale.setScalar(Math.max(.03, sc));
      }

      /* 白气：沸腾时从杯口上升、飘散 */
      var stA = boiling ? .85 : 0;
      for (var k = 0; k < O.steam.length; k++) {
        var sp = O.steam[k], su = sp.userData;
        su.p += dt * su.sp; if (su.p > 1) su.p -= 1;
        /* 白气起点抬到杯口以上，不要落进杯里糊成一团白饼 */
        var yy2 = RIG.beakerY + wH + 1.6 + su.p * 5;
        sp.position.set(RIG.beakerX + Math.sin(s.t * .7 + k) * 1.2, yy2, RIG.beakerZ + Math.cos(s.t * .6 + k) * 1.0);
        sp.material.opacity = stA * Math.sin(su.p * Math.PI) * .42;
        sp.scale.setScalar(3.2 + su.p * 2.8);
      }
      s.steamV = stA;
    }
  };

  K.boot({
    title: '探究水在沸腾前后温度变化的特点',
    chip: '物理 · 鲁教版 · 九上 · 第十一章 物态变化 · 第三节 汽化与液化',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { ty: 11, dist: 38, tx: 2, tz: 0, yaw: .2, pitch: .18 },
    postfx: true,

    reads: [
      ['state', '状态'],
      ['temp', '水温'],
      ['boil', '沸腾'],
      ['concl', '结论']
    ],
    values: function (s) {
      return {
        state: s.removed > .5 ? '已撤去酒精灯'
              : (s.heat > .5 ? (s.boil > .5 ? '沸腾中' : '加热中') : '未加热'),
        temp: Math.round(s.temp) + ' ℃',
        boil: s.boil > .5 ? '是（100 ℃）' : '否',
        concl: s.judged ? '沸腾时继续吸热，温度保持不变' : '—'
      };
    },

    steps: [
      {
        name: '看装置',
        title: '这套装置由哪些器材组成？',
        ask: '为什么烧杯要放在石棉网上，而不是直接放在火焰上？',
        body: '<p><b>器材：</b>铁架台（带铁圈）、<b>石棉网</b>、<b>烧杯</b>（装水）、<b>酒精灯</b>（用外焰加热）、<b>温度计</b>。</p>' +
          '<p><b>装配要点：</b>烧杯不能直接放在火焰上——玻璃受热不均会炸裂，' +
          '石棉网能让热量<b>均匀</b>地传给烧杯底部。</p>' +
          '<p>温度计的<b>玻璃泡要浸没在水中，但不碰杯底、不碰杯壁</b>；读数时温度计留在水中。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 0, ty: 10, tz: 0, dist: 31, yaw: .34, pitch: .22 }
      },
      {
        name: '装水安放',
        title: '倒入适量温水，固定器材',
        ask: '烧杯里的水为什么要"适量"，而不是装满？',
        body: '<p><b>操作：</b>烧杯装<b>不超过容积 2/3</b>的温水，放在石棉网上；' +
          '铁圈托住石棉网，调整高度使酒精灯<b>外焰</b>恰好舔到石棉网下方。</p>' +
          '<p><b>为什么不全满：</b>水沸腾时翻滚、体积膨胀，装太满会溢出；' +
          '也不宜过少，否则升温快、不易观察稳定的沸腾。</p>',
        apply: function (s) { reset(s); s.temp = 30; s.tHeat = tForTemp(30); },
        cam: { tx: 1, ty: 10, tz: 1, dist: 30, yaw: .25, pitch: .2 }
      },
      {
        name: '点燃加热',
        title: '点燃酒精灯，开始加热',
        ask: '加热过程中，水温是一直上升，还是会停？',
        body: '<p><b>操作：</b>用火柴点燃酒精灯（<b>用灯帽盖灭</b>，不可用嘴吹）。' +
          '酒精灯用<b>外焰</b>加热——外焰与空气接触最充分，温度最高。</p>' +
          '<p><b>现象：</b>水温持续<b>上升</b>。右侧"温度—时间图像"会随加热一笔笔描出上升的曲线。</p>' +
          '<p>每隔一段时间记录一次温度（见右侧读数），这就是实验的数据采集。</p>' +
          '<p><b>热学模型（唯一真源）：</b>忽略热损失时，水吸热 Q = P·t = c·m·ΔT，故升温段 <b>T(t) = T0 + P·t /(c·m)</b>（t 以秒计）。取初温 T0 = ' + HEAT.T0 + ' ℃、水的比热容 c = 4.2×10³ J/(kg·℃)、水质量 m = ' + HEAT.m + ' kg、酒精灯有效加热功率 P = ' + HEAT.P + ' W。</p>' +
          '<p><b>由模型算：</b>升到沸点需热量 Q = c·m·(Tb−T0) = ' + (Q_HEAT / 1e4).toFixed(2) + '×10⁴ J，对应时间 t = Q/P = ' + T_BOIL_S.toFixed(0) + ' s = ' + (T_BOIL_S / 60).toFixed(0) + ' min；右侧曲线上升段逐点由此式生成，<b>不再是预置折线</b>。</p>' +
          '<p><b>演示时间：</b>屏幕 1 s 对应实验 ' + TIME_SCALE + ' s（加速 ' + TIME_SCALE + '×）；曲线横轴、水温读数、本节解析式共用同一个 t，因此升温段斜率与公式严格一致，不是另画的一条拟合折线。</p>' +
          '<p><b>边界：</b>① 气压降低时沸点降低（高山上低于 100 ℃），本模型取标准大气压；② 实际存在散热、烧杯与石棉网吸热，有效 P 偏小，故<b>实测升温比理论慢</b>、达到沸点用时更长。</p>',
        apply: function (s) { reset(s); s.heat = 1; s.temp = 40; s.tHeat = tForTemp(40); s.rec = seedUpTo(s.tHeat); },
        cam: { tx: 1, ty: 9, tz: 1, dist: 28, yaw: .22, pitch: .22 },
        controls: [
          { type: 'btn', label: '① 熄灭酒精灯（停止加热）', onClick: function (s) { s.removed = 1; s.heat = 0; } },
          { type: 'btn', label: '② 重新点燃加热', onClick: function (s) { s.removed = 0; s.heat = 1; } }
        ]
      },
      {
        name: '沸腾前',
        title: '沸腾前：底部冒小气泡',
        ask: '为什么杯底先出现小气泡，到水面又变小、消失？',
        body: '<p><b>现象：</b>加热一会儿，杯底和杯壁出现<b>少量小气泡</b>，上升过程中<b>变小、消失</b>；' +
          '水温不断升高。</p>' +
          '<p><b>原因：</b>这些气泡是杯底吸附的空气（或溶解的空气）受热析出；' +
          '上升时上层水温较低，气泡内气体遇冷收缩、液化而消失。</p>' +
          '<p>此时温度<b>仍在上升</b>，尚未达到沸点。</p>',
        apply: function (s) { reset(s); s.heat = 1; s.temp = 92; s.tHeat = tForTemp(92); s.rec = seedUpTo(s.tHeat); },
        cam: { tx: 0, ty: 9, tz: 1, dist: 26, yaw: .2, pitch: .24 }
      },
      {
        name: '沸腾',
        title: '水沸腾了：大量气泡，温度不变',
        ask: '水沸腾后继续加热，温度还会升高吗？',
        body: '<p><b>现象：</b>水温达到 <b>100 ℃</b> 后，杯底和内部出现<b>大量气泡</b>，' +
          '气泡上升、变大，到水面<b>破裂</b>，整杯水剧烈翻腾——这就是<b>沸腾</b>。</p>' +
          '<p><b>关键结论：</b>沸腾时<b>继续吸热，但温度保持不变</b>。' +
          '右侧图像在 100 ℃ 处变成一条水平线。</p>' +
          '<p>杯口上方出现"白气"，那是水蒸气遇冷<b>液化</b>成的小水滴，不是气体本身。</p>' +
          '<p><b>沸腾段模型：</b>达到沸点后 T ≡ ' + HEAT.Tb + ' ℃ 恒定，输入热量不再升温，而用于汽化 <b>Q = m·L</b>（汽化热 L = 2.26×10⁶ J/kg）；全部汽化需 Q = m·L = ' + (Q_VAP / 1e5).toFixed(2) + '×10⁵ J，按 P = ' + HEAT.P + ' W 约需 ' + (T_VAP_S / 60).toFixed(0) + ' min。本图 12 min 内只汽化少量水，故出现清晰<b>水平段</b>。</p>' +
          '<p><b>边界：</b>水平段前提是「持续吸热且仍有液态水」；撤去热源或水烧干后温度与曲线都会改变；气压降低时沸点降低、水平段高度随之下移。</p>',
        apply: function (s) { reset(s); s.heat = 1; s.temp = 100; s.boil = 1; s.tHeat = T_BOIL_S; s.steam = 1;
          s.rec = seedBoilCurve(); s.graphFrozen = 1; },
        cam: { tx: 0, ty: 9, tz: 1, dist: 24, yaw: .18, pitch: .26 },
        controls: [
          { type: 'btn', label: '重新演示沸腾', onClick: function (s) { s.boil = 1; s.temp = 100; s.steam = 1; } }
        ]
      },
      {
        name: '移走酒精灯',
        title: '撤去热源，沸腾立即停止',
        ask: '停止加热后，水还会继续沸腾吗？温度怎么变？',
        body: '<p><b>操作：</b>用灯帽盖灭酒精灯，撤去热源。</p>' +
          '<p><b>现象：</b>沸腾<b>立即停止</b>，水温开始<b>缓慢下降</b>。</p>' +
          '<p><b>结论印证：</b>沸腾的两个条件——① 达到<b>沸点</b>；② <b>继续吸热</b>。' +
          '缺少任一条件，沸腾都不能维持。</p>',
        apply: function (s) { reset(s); s.removed = 1; s.heat = 0; s.temp = 100; s.boil = 1; s.tHeat = T_BOIL_S;
          s.rec = seedBoilCurve(); s.graphFrozen = 1; },
        cam: { tx: 1, ty: 10, tz: 1, dist: 30, yaw: .22, pitch: .2 }
      },
      {
        name: '得出结论',
        title: '归纳沸腾的特点',
        ask: '沸腾和蒸发有什么不同？',
        body: '<p><b>证据链：</b>加热→水温上升→达到 100 ℃→剧烈翻腾、大量气泡→温度<b>不变</b>；' +
          '撤去热源→沸腾停止、温度下降。</p>' +
          '<p><b>沸腾定义：</b>液体<b>内部和表面同时</b>发生的剧烈汽化现象。</p>' +
          '<p><b>沸腾条件：</b>① 达到<b>沸点</b>；② <b>继续吸热</b>。二者缺一不可。</p>' +
          '<p><b>与蒸发的区别：</b>蒸发只在表面、任何温度都能发生、缓慢；沸腾在内部+表面、达到沸点才发生、剧烈。</p>' +
          '<p><b>模型边界：</b>全课曲线由升温段 T(t)=T0+P·t/(c·m) 与沸点恒定段（汽化 Q=m·L）两段生成，取标准大气压、忽略热损失；真实实验因散热升温更慢，且气压降低沸点随之降低。</p>',
        apply: function (s) { reset(s); s.heat = 1; s.temp = 100; s.boil = 1; s.tHeat = T_BOIL_S; s.judged = true;
          s.rec = seedBoilCurve(); s.graphFrozen = 1; },
        cam: { tx: 2, ty: 12, tz: 0, dist: 40, yaw: .2, pitch: .16 },
        controls: [
          { type: 'btn', label: '判定并给出结论', onClick: function (s) { s.judged = true; } }
        ]
      }
    ],

    quiz: function (s) {
      var bank = [
        { q: '水沸腾时，继续加热，温度会怎样？', opts: ['保持不变', '继续升高', '先升后降', '立即下降'],
          ans: '保持不变', why: '沸腾时液体继续吸热但温度保持在沸点不变（标准大气压下为 100 ℃）。' },
        { q: '水沸腾的必要条件是？', opts: ['只达到沸点', '只继续吸热', '达到沸点且继续吸热', '温度达到 50℃'],
          ans: '达到沸点且继续吸热', why: '沸腾必须同时满足：温度达到沸点、并且继续吸热，缺一不可。' },
        { q: '杯口上方的"白气"其实是？', opts: ['水蒸气', '小水滴', '空气', '二氧化碳'],
          ans: '小水滴', why: '白气是水蒸气遇冷液化形成的小水滴，水蒸气本身是无色透明的气体。' },
        { q: '为什么烧杯要垫石棉网加热？', opts: ['让受热均匀防炸裂', '为了好看', '升高火焰温度', '防止水溢出'],
          ans: '让受热均匀防炸裂', why: '石棉网使热量均匀传递到烧杯底，避免玻璃局部过热炸裂。' },
        { q: '在标准大气压下，水的沸点是？', opts: ['80℃', '90℃', '100℃', '120℃'],
          ans: '100℃', why: '标准大气压下水的沸点为 100 ℃；气压降低时沸点也会降低。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });

  function reset(s) {
    s.heat = 0; s.temp = HEAT.T0; s.tHeat = 0; s.boil = 0; s.rec = [];
    s.removed = 0; s.steam = 0; s.judged = false; s._recT = 0; s.t = 0;
    s.flameLv = 0; s.graphFrozen = 0;
  }
})();
