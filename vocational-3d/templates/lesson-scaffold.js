/* ═══════════════════════════════════════════════════════════════════════
   vocational-3d · 课件骨架（复制到 build/lessons3d/<slug>.js 后改名开工）
   ─────────────────────────────────────────────────────────────────────
   已内置：实训车间场景 + 剖切设备占位 + 机构运动 + 拆解 + 悬停标注 + 6 步 + 测验
   你要改的：① 常量区的尺寸  ② buildDevice() 里的几何  ③ 各步的 title/body
   构建：    python build/build_chem.py <slug>
   验证：    node build/shot-page.js courses/<slug>.html <slug> 1800
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var T = window.THREE, K = window.Lab;
  var PI = Math.PI, TAU = PI * 2;

  /* ── ① 常量：真实尺寸按比例缩放成世界单位（1 单位 ≈ 40 mm） ── */
  var BORE_R = 1.5;            /* 缸径半径 */
  var SPACING = 3.95;          /* 缸心距 */
  var XS = [-5.925, -1.975, 1.975, 5.925];
  var CRANK_R = 1.5, ROD_L = 5.0;
  var DECK = 7.5, BLOCK_BOT = -2.4;
  var MAXLIFT = .55;
  var HEAD_LIFT = 6.2, PAN_DROP = 6.6;
  var GROUND = -15.5;          /* 地坪高度：与台架脚垫对齐 */
  var ENGINE_Y = 4.2;          /* 设备整体抬升（落到台面上） */

  var CYC = 4 * PI;                                   /* 四冲程 720° */
  var CYC_PHASE = [0, 3 * PI, PI, 2 * PI];            /* 点火顺序 1-3-4-2 */
  var THROW = [0, PI, PI, 0];                         /* 曲拐：1、4 同向 */

  var O = {};                 /* 场景对象注册表 */
  var G = null;               /* 可拾取根节点 */

  /* ── ② 材质（PBR；金属靠 scene.environment 反光） ── */
  var MAT = {
    block: new T.MeshStandardMaterial({ color: 0x8d99a6, metalness: .8, roughness: .44, envMapIntensity: 1.1 }),
    head: new T.MeshStandardMaterial({ color: 0x939fab, metalness: .8, roughness: .42, envMapIntensity: 1.05 }),
    steel: new T.MeshStandardMaterial({ color: 0xa8b2bc, metalness: .92, roughness: .28, envMapIntensity: 1.45 }),
    steelD: new T.MeshStandardMaterial({ color: 0x5c666f, metalness: .9, roughness: .4, envMapIntensity: 1.1 }),
    cut: new T.MeshStandardMaterial({ color: 0xc3ccd6, metalness: .88, roughness: .24, envMapIntensity: 1.4 }),
    piston: new T.MeshStandardMaterial({ color: 0xd4dce4, metalness: .82, roughness: .3, envMapIntensity: 1.35 }),
    gasket: new T.MeshStandardMaterial({ color: 0x31363d, metalness: .25, roughness: .78 }),
    pan: new T.MeshStandardMaterial({ color: 0x353c44, metalness: .55, roughness: .5, envMapIntensity: .8 }),
    benchTop: new T.MeshStandardMaterial({ color: 0x141d19, metalness: .34, roughness: .56, envMapIntensity: .5 }),
    bench: new T.MeshStandardMaterial({ color: 0x2b333b, metalness: .55, roughness: .52 }),
    warn: new T.MeshStandardMaterial({ color: 0xb08a1e, metalness: .1, roughness: .6 }),
    accent: new T.MeshStandardMaterial({ color: 0x2f6ea8, metalness: .3, roughness: .45 })
  };

  /* 铸件颗粒贴图：大平面没有纹理在近景一定糊成塑料 */
  function castTex(rep) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#f2f4f6'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 4200; i++) {
      var g = 196 + Math.floor(Math.random() * 58);
      x.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',' + (.30 + Math.random() * .45).toFixed(2) + ')';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, .3 + Math.random() * 1.5, 0, TAU); x.fill();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 5, rep || 5);
    return t;
  }
  (function () {
    var m = castTex(5);
    MAT.block.map = m; MAT.block.bumpMap = m; MAT.block.bumpScale = .026;
    MAT.head.map = m; MAT.head.bumpMap = m; MAT.head.bumpScale = .022;
  })();

  /* ── ③ 小工具 ── */
  function RM(w, h, d, r, mat) { return new T.Mesh(K.geoRoundBox(w, h, d, r == null ? .18 : r, 3), mat); }

  function plateGeo(w, d, thk, holes) {          /* 带孔板：缸盖底板/法兰/隔板 */
    var s = new T.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
    (holes || []).forEach(function (h) {
      var p = new T.Path(); p.absarc(h[0], h[1], h[2], 0, TAU, true); s.holes.push(p);
    });
    var geo = new T.ExtrudeGeometry(s, { depth: thk, bevelEnabled: false, curveSegments: 20 });
    geo.rotateX(-PI / 2); geo.translate(0, -thk, 0);
    return geo;
  }

  function helixGeo(r, tubeR, h, turns, seg) {   /* 螺旋弹簧 */
    var pts = [], n = seg || 64, i, t, a;
    for (i = 0; i <= n; i++) { t = i / n; a = turns * TAU * t; pts.push(new T.Vector3(Math.cos(a) * r, h * t, Math.sin(a) * r)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, tubeR, 6, false);
  }

  /* ── ④ 工位台架（脚垫落在地坪上，台下有柜，前缘黄警示条） ── */
  function buildBench() {
    var g = new T.Group(), W = 32, D = 19;
    var top = RM(W, 1.6, D, .28, MAT.benchTop); top.position.y = -.8; g.add(top);
    var band = RM(W + 1.2, .55, D + 1.2, .16, MAT.bench); band.position.y = -1.72; g.add(band);
    var warn = RM(W + .3, .22, .34, .06, MAT.warn); warn.position.set(0, -.06, D / 2 - .05); g.add(warn);
    [[W / 2 - 2.6, D / 2 - 2.6], [-(W / 2 - 2.6), D / 2 - 2.6], [W / 2 - 2.6, -(D / 2 - 2.6)], [-(W / 2 - 2.6), -(D / 2 - 2.6)]].forEach(function (p) {
      var leg = RM(1.5, 13.6, 1.5, .12, MAT.bench); leg.position.set(p[0], -8.4, p[1]); g.add(leg);
      var foot = RM(2.0, .34, 2.0, .1, MAT.steelD); foot.position.set(p[0], -15.3, p[1]); g.add(foot);
    });
    var cab = RM(11, 7.4, 11, .18, MAT.bench); cab.position.set(8.5, -6.0, -3.0); g.add(cab);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(g);
    K.blob({ x: 0, z: 0, r: 11, y: .02 });
    return g;
  }

  /* ── ⑤ 设备（★ 这里换成你的设备：实心半剖 + 孔壁 + 隔板 + 分件） ── */
  function buildDevice() {
    var g = new T.Group(); O.dev = g;
    var W = 16.4, Z = 4.9, th = .6, H = DECK - BLOCK_BOT, cy = (DECK + BLOCK_BOT) / 2, i;

    /* 侧壁 + 后壁（实心铸件）；+z 面留空 = 剖切 */
    [-1, 1].forEach(function (s) {
      var wall = RM(th, H, Z, .12, MAT.block); wall.position.set(s * (W / 2 - th / 2), cy, 0); g.add(wall);
      var cut = new T.Mesh(new T.BoxGeometry(th + .05, H, .16), MAT.cut);      /* 剖切机加工亮边 */
      cut.position.set(s * (W / 2 - th / 2), cy, Z / 2 - .08); g.add(cut);
    });
    var back = RM(W - 2 * th, H, th, .12, MAT.block); back.position.set(0, cy, -Z / 2 + th / 2); g.add(back);

    /* 曲轴箱底板 + 主轴承座（曲轴必须有支承，否则悬空） */
    var bot = RM(W - 2 * th, 1.0, Z - 2 * th, .14, MAT.block);
    bot.position.set(0, BLOCK_BOT + .5, 0); g.add(bot);
    for (i = 0; i < 5; i++) {
      var cap = RM(1.0, 1.0, Z - 1.4, .16, MAT.block);
      cap.position.set((i - 2) * SPACING * .98, -.82, 0); g.add(cap);
    }

    /* 缸间隔板（缺了整机读成空架子） */
    for (i = 0; i < 5; i++) {
      var bw = RM(.6, DECK - 2.2, Z - 2 * th, .12, MAT.block);
      bw.position.set((i - 2) * SPACING * .98, (DECK + 2.2) / 2, 0); g.add(bw);
    }

    /* 缸套：保留后半圆 + 断口壁厚棱边 */
    var linH = DECK - 2.05;
    for (i = 0; i < 4; i++) {
      var lo = new T.Mesh(new T.CylinderGeometry(BORE_R + .14, BORE_R + .14, linH, 34, 1, true, PI / 2, PI), MAT.steel);
      lo.position.set(XS[i], 2.05 + linH / 2, 0); g.add(lo);
      [-1, 1].forEach(function (s) {
        var e = new T.Mesh(new T.BoxGeometry(.15, linH, .15), MAT.steel);
        e.position.set(XS[i] + s * (BORE_R + .08), lo.position.y, 0); g.add(e);
      });
      var ring = new T.Mesh(new T.TorusGeometry(BORE_R + .07, .055, 8, 40), MAT.steelD);
      ring.rotation.x = PI / 2; ring.position.set(XS[i], DECK - .04, 0); g.add(ring);
    }

    /* 缸垫 + 缸盖底面（带 4 个缸孔通孔） */
    var gk = new T.Mesh(new T.BoxGeometry(W - 1.2, .1, Z - 1.2), MAT.gasket); gk.position.y = DECK + .16; g.add(gk);
    var boreHoles = XS.map(function (x) { return [x, 0, BORE_R + .02]; });
    var hbase = new T.Mesh(plateGeo(W - 1.1, Z - 1.1, .18, boreHoles), MAT.head);
    hbase.position.y = DECK + .40; g.add(hbase);

    /* 燃烧室：后半圆凹窝（正面剖开，能看见里面的零件） */
    for (i = 0; i < 4; i++) {
      var ch = new T.Mesh(new T.CylinderGeometry(BORE_R + .02, BORE_R + .02, .65, 30, 1, true, PI / 2, PI), MAT.head);
      ch.position.set(XS[i], DECK + .725, 0); g.add(ch);
    }
    /* 缸盖侧壁 + 后壁：从缸盖底面砌到顶板下方（顶板不能凭空浮着） */
    [-1, 1].forEach(function (s2) {
      var hw = RM(th, 1.05, Z, .1, MAT.head);
      hw.position.set(s2 * (W / 2 - th / 2), DECK + .55, 0); g.add(hw);
      var hc = new T.Mesh(new T.BoxGeometry(th + .05, 1.05, .14), MAT.cut);
      hc.position.set(s2 * (W / 2 - th / 2), DECK + .55, Z / 2 - .07); g.add(hc);
    });
    var hb = RM(W - 2 * th, 1.05, th, .1, MAT.head);
    hb.position.set(0, DECK + .55, -Z / 2 + th / 2); g.add(hb);

    var roof = new T.Mesh(plateGeo(W - 1.1, Z - 1.1, .2, []), MAT.head);
    roof.position.y = DECK + 1.05; g.add(roof);

    /* 活塞 ×4（分件：可单独位移，可单独 tag） */
    O.pistons = [];
    for (i = 0; i < 4; i++) {
      var pg = new T.Group(); pg.position.set(XS[i], 0, 0);
      var body = new T.Mesh(new T.CylinderGeometry(BORE_R * .97, BORE_R * .97, 1.1, 32), MAT.piston); body.position.y = .05; pg.add(body);
      var crown = new T.Mesh(new T.CylinderGeometry(BORE_R * .97, BORE_R * .95, .14, 32), MAT.piston); crown.position.y = .63; pg.add(crown);
      [.46, .32, .18].forEach(function (yy) {   /* 气环槽 */
        var rg = new T.Mesh(new T.CylinderGeometry(BORE_R * .985, BORE_R * .985, .05, 32, 1, true), MAT.steelD);
        rg.position.y = yy; pg.add(rg);
      });
      var pin = new T.Mesh(new T.CylinderGeometry(.17, .17, BORE_R * 1.8, 16), MAT.steel); pin.rotation.z = PI / 2; pg.add(pin);
      pg.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      K.tag(pg, '活塞', '承受气体压力，沿缸孔往复运动');
      g.add(pg); O.pistons.push(pg);
    }

    /* 曲轴（分件：曲拐按 THROW 相位） */
    O.crank = new T.Group();
    var main = new T.Mesh(new T.CylinderGeometry(.5, .5, 18.2, 24), MAT.steel); main.rotation.z = PI / 2; O.crank.add(main);
    for (i = 0; i < 4; i++) {
      var tg = new T.Group(); tg.position.x = XS[i]; tg.rotation.x = THROW[i];
      var pin2 = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.02, 20), MAT.steel); pin2.rotation.z = PI / 2; pin2.position.y = CRANK_R; tg.add(pin2);
      [-.62, .62].forEach(function (dx) {
        var web = RM(.46, CRANK_R + .9, 1.05, .18, MAT.steel); web.position.set(dx, CRANK_R / 2 - .1, 0); tg.add(web);
        var cw = new T.Mesh(new T.CylinderGeometry(1.18, 1.18, .46, 30, 1, false, PI, PI), MAT.steel);
        cw.rotation.z = PI / 2; cw.position.set(dx, -.15, 0); tg.add(cw);      /* 半圆盘平衡重 */
      });
      O.crank.add(tg);
    }
    K.tag(O.crank, '曲轴', '把往复运动汇总为旋转输出');
    g.add(O.crank);

    /* 连杆 ×4（每帧用两端点定姿态） */
    O.rods = [];
    for (i = 0; i < 4; i++) {
      var rg = new T.Group();
      var beam = RM(.34, ROD_L - 1.1, .62, .12, MAT.steel); rg.add(beam);
      var big = new T.Mesh(new T.CylinderGeometry(.62, .62, .74, 22), MAT.steel); big.rotation.z = PI / 2; big.position.y = -ROD_L / 2; rg.add(big);
      var small = new T.Mesh(new T.CylinderGeometry(.34, .34, .6, 18), MAT.steel); small.rotation.z = PI / 2; small.position.y = ROD_L / 2; rg.add(small);
      K.tag(rg, '连杆', '连接活塞与曲轴，把往复转成旋转');
      g.add(rg); O.rods.push(rg);
    }

    /* 油底壳（盆形：底板 + 四壁 + 法兰；拆解读取 O.panAsm） */
    O.panAsm = new T.Group();
    var botY = -3.98, topY = -2.36, ph = topY - botY, midY = (topY + botY) / 2;
    var pb = RM(12.6, .3, 4.4, .18, MAT.pan); pb.position.set(0, botY, 0); O.panAsm.add(pb);
    [-1, 1].forEach(function (s) {
      var lw = RM(12.9, ph, .3, .1, MAT.pan); lw.position.set(0, midY, s * 2.1); O.panAsm.add(lw);
      var ew = RM(.3, ph, 4.2, .1, MAT.pan); ew.position.set(s * 6.2, midY, 0); O.panAsm.add(ew);
    });
    K.tag(pb, '油底壳', '储存机油并封闭曲轴箱');
    g.add(O.panAsm);

    return g;
  }

  /* ── ⑥ 运动学（纯函数，参数一改全部自洽） ── */
  function betaOf(th, i) { var b = (th - CYC_PHASE[i]) % CYC; return b < 0 ? b + CYC : b; }
  function pistonY(b) {
    var s = CRANK_R * Math.sin(b);
    return CRANK_R * Math.cos(b) + Math.sqrt(ROD_L * ROD_L - s * s);
  }
  function strokeOf(b) {
    b = b % CYC;
    if (b < PI) return '做功';
    if (b < 2 * PI) return '排气';
    if (b < 3 * PI) return '进气';
    return '压缩';
  }

  /* ── ⑦ 状态 ── */
  var st = { theta: 0, spin: 1, speed: 1, explPct: 0, t: 0, _labSet: 'all' };

  /* ── ⑧ 场景 ── */
  var scene = {
    setup: function () {
      G = K.world();
      K.envShop({ groundY: GROUND });                       /* ① 先给设备一个"家" */
      K.scene().traverse(function (o) {                     /* 车间比实验室暗 */
        if (o.isHemisphereLight) o.intensity *= .58;
        else if (o.isDirectionalLight) o.intensity *= .86;
      });
      /* 剖切内部补光：否则腔内死黑，看着像缺件 */
      var f1 = new T.DirectionalLight(0xffffff, .62); f1.position.set(6, 12, 22); K.scene().add(f1);
      var f2 = new T.DirectionalLight(0xdfe8ff, .28); f2.position.set(-12, 6, 18); K.scene().add(f2);

      buildBench();
      var dev = buildDevice();
      dev.position.y = ENGINE_Y; G.add(dev); O.dev = dev;
      O.ex = 0;
    },

    update: function (dt, s) {
      s.t += dt;
      if (s.spin > 0) s.theta += dt * 2.1 * s.speed;
      s.theta = ((s.theta % CYC) + CYC) % CYC;
      var th = s.theta, i;

      /* 拆解缓动（自己算，别让引擎补间去驱动 transform） */
      O.ex += ((s.explPct / 100) - O.ex) * Math.min(1, dt * 6);
      var ex = O.ex * O.ex * (3 - 2 * O.ex);
      if (O.dev) O.dev.position.y = ENGINE_Y;
      if (O.panAsm) O.panAsm.position.set(0, -.06 * ex, PAN_DROP * ex);   /* 沿 +z 抽出，不穿台面 */

      if (O.crank) O.crank.rotation.x = th;
      for (i = 0; i < 4; i++) {
        var b = betaOf(th, i), py = pistonY(b);
        if (O.pistons[i]) O.pistons[i].position.y = py;
        var rod = O.rods[i];
        if (rod) {
          var kx = XS[i], ky = CRANK_R * Math.cos(b), kz = CRANK_R * Math.sin(b);
          rod.position.set(kx, (ky + py) / 2, kz / 2);
          var dir = new T.Vector3(0, py - ky, -kz).normalize();
          rod.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
        }
      }
    }
  };

  /* ── ⑨ 课件 ── */
  K.boot({
    title: '设备名称 · 结构与原理',
    chip: '职业教育 · 工种 · 设备',
    hint: '拖空白处旋转视角 · 滚轮缩放 · 悬停零件看名称 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .58, pitch: .32 },

    reads: [['ang', '曲轴转角'], ['c1', '1 缸'], ['c2', '2 缸'], ['c3', '3 缸'], ['c4', '4 缸']],
    values: function (s) {
      var deg = (s.theta * 180 / PI) % 720; if (deg < 0) deg += 720;
      return {
        ang: deg.toFixed(0) + '°',
        c1: strokeOf(betaOf(s.theta, 0)), c2: strokeOf(betaOf(s.theta, 1)),
        c3: strokeOf(betaOf(s.theta, 2)), c4: strokeOf(betaOf(s.theta, 3))
      };
    },

    steps: [
      {
        name: '整机总览',
        cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .58, pitch: .32 },
        title: '这台设备由哪几部分组成？',
        ask: '（写一个能难住学生、但模型上能验证的问题）',
        body: '<p>（三大块分工 + 一句话说清它怎么工作）</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'all'; },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' }
        ]
      },
      {
        name: '核心机构',
        cam: { tx: 4.0, ty: 4.6, tz: 0, dist: 36, yaw: .34, pitch: .16 },
        title: '往复怎么变成旋转？',
        ask: '上止点时为什么扭矩为零？',
        body: '<p>滑块-曲柄：<code>y = r·cosβ + √(L² − r²sin²β)</code></p>',
        apply: function (s) { s.spin = 0; s.explPct = 0; s._labSet = 'crank'; s.theta = 0; s.setAng = 0; },
        controls: [
          { type: 'range', key: 'setAng', min: 0, max: 720, step: 2, label: '曲轴转角（°）',
            onChange: function (s) { s.theta = s.setAng * PI / 180; s.spin = 0; } },
          { type: 'btn', label: '自动运转', onClick: function (s) { s.spin = 1; } }
        ]
      },
      {
        name: '工作循环',
        cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .60, pitch: .32 },
        title: '四个缸各处在哪个冲程？',
        ask: '为什么点火顺序不是 1-2-3-4？',
        body: '<p>看右侧读数：任何时刻总有一个缸在做功。</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'none'; },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' }
        ]
      },
      {
        name: '拆解总览',
        cam: { tx: 3.6, ty: 9.0, tz: 0, dist: 48, yaw: .56, pitch: .27 },
        title: '拆开看装配关系',
        ask: '缸体与油底壳靠什么密封？',
        body: '<p>拖动"拆解程度"，观察零件如何分离。</p>',
        apply: function (s) { s.spin = 0; s._labSet = 'none'; s.explPct = 0; },
        controls: [
          { type: 'range', key: 'explPct', min: 0, max: 100, step: 2, label: '拆解程度（%）' },
          { type: 'btn', label: '展开 / 合拢', onClick: function (s) { s.explPct = s.explPct > 5 ? 0 : 90; } }
        ]
      },
      {
        name: '小测验',
        cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .58, pitch: .32 },
        title: '检验一下',
        ask: '先想清楚，再选答案。',
        body: '<p>（一句话点出这题考什么）</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'none'; },
        quiz: true
      }
    ],

    quiz: function () {
      var bank = [
        { q: '（题干）', opts: ['A', 'B', 'C', 'D'], ans: 'A', why: '（为什么）' },
        { q: '（题干）', opts: ['A', 'B', 'C', 'D'], ans: 'C', why: '（为什么）' },
        { q: '（题干）', opts: ['A', 'B', 'C', 'D'], ans: 'B', why: '（为什么）' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
