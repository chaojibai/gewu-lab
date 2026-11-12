/* 格物实验室 · 物理仪器扩展库（window.PhysicsKit 的扩展）
   在 physics-kit.js 基础上新增 21 个实验所需的其余仪器。
   契约同 physics-kit：1 场景单位≈1 cm，每件仪器 base 落在 y=0，
   lesson 直接 obj.position.set(x,0,z) 摆上实验台；共享材质取自 window.ChemKit.MAT。 */
(function () {
  var T = window.THREE;
  function M() { return window.ChemKit.MAT; }
  function cmat(color, rough, metal, extra) {
    var o = { color: color, roughness: rough === undefined ? .4 : rough, metalness: metal === undefined ? .1 : metal };
    if (extra) for (var k in extra) o[k] = extra[k];
    return new T.MeshStandardMaterial(o);
  }
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  /* ══ 托盘天平 ══════════════════════════════════════════ */
  function balance(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var base = new T.Mesh(new T.BoxGeometry(11, 1.2, 8), cmat(0x3a4046, .6, .5));
    base.position.y = .6; g.add(base);
    var colH = 11;
    var col = new T.Mesh(new T.CylinderGeometry(.5, .65, colH, 16), MK.metal);
    col.position.y = 1.2 + colH / 2; g.add(col);
    var topY = 1.2 + colH;
    var piv = new T.Group(); piv.position.y = topY; g.add(piv);
    var beamLen = 15;
    var beam = new T.Mesh(new T.BoxGeometry(beamLen, .55, 1.3), MK.metal); piv.add(beam);
    [-3.2, 3.2].forEach(function (x) {
      var n = new T.Mesh(new T.CylinderGeometry(.62, .62, 1.3, 14), MK.metalD);
      n.position.set(x, 0, 1.5); piv.add(n);
    });
    var ptr = new T.Mesh(new T.BoxGeometry(.22, 4.2, .22), MK.metalD); ptr.position.y = -2.1; piv.add(ptr);
    var ptrTip = new T.Mesh(new T.ConeGeometry(.45, 1.0, 10), new T.MeshBasicMaterial({ color: 0xd83a2a }));
    ptrTip.position.y = -4.3; ptrTip.rotation.x = Math.PI; piv.add(ptrTip);
    var dial = new T.Mesh(new T.BoxGeometry(2.4, 1.0, .2), MK.metalD);
    dial.position.set(0, -5.6, 0); piv.add(dial);
    var carriers = [];
    [-1, 1].forEach(function (s) {
      var c = new T.Group(); c.position.set(s * beamLen / 2, 0, 0); piv.add(c);
      [-1.3, 1.3].forEach(function (dx) {
        var str = new T.Mesh(new T.CylinderGeometry(.05, .05, 3, 6), MK.rubber);
        str.position.set(dx, -1.6, 0); c.add(str);
      });
      var pan = new T.Mesh(new T.CylinderGeometry(2.7, 2.3, .4, 28), MK.metal);
      pan.position.y = -3.3; c.add(pan);
      carriers.push(c);
    });
    g.userData.setTilt = function (a) { piv.rotation.z = a; carriers.forEach(function (c) { c.rotation.z = -a; }); };
    g.userData.carriers = carriers;
    g.userData.panLocalY = -3.3;
    g.userData.setTilt(0);
    return g;
  }

  /* ══ 砝码（单个，可堆叠）════════════════════════════════ */
  function weight(value) {
    var MK = M(), g = new T.Group();
    var r = 1.05, h = .75;
    var body = new T.Mesh(new T.CylinderGeometry(r, r, h, 22), MK.metalD); body.position.y = h / 2; g.add(body);
    var knob = new T.Mesh(new T.CylinderGeometry(.32, .32, h * .7, 12), MK.metal);
    knob.position.y = h + .22; g.add(knob);
    if (value) {
      var tex = canvasTex(128, 128, function (x) {
        x.fillStyle = '#e9edf1'; x.fillRect(0, 0, 128, 128);
        x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 64px Consolas,monospace'; x.fillText(String(value), 64, 64);
      });
      var lab = new T.Mesh(new T.PlaneGeometry(1.6, 1.6), new T.MeshBasicMaterial({ map: tex }));
      lab.position.set(0, h / 2 + .01, r + .01); g.add(lab);
    }
    g.userData.h = h;
    return g;
  }
  function weightsBox() {
    var g = new T.Group();
    var box = new T.Mesh(new T.BoxGeometry(4, 2, 3), cmat(0x8a929a, .7, .3));
    box.position.y = 1; g.add(box);
    var tex = canvasTex(256, 192, function (x) {
      x.fillStyle = '#cdd5dc'; x.fillRect(0, 0, 256, 192);
      x.fillStyle = '#28323c'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 54px "Microsoft YaHei",sans-serif'; x.fillText('砝码盒', 128, 96);
    });
    var lab = new T.Mesh(new T.PlaneGeometry(3.2, 1.8), new T.MeshBasicMaterial({ map: tex }));
    lab.position.set(0, 1.5, 1.51); g.add(lab);
    return g;
  }

  /* ══ 停表 ══════════════════════════════════════════════ */
  function stopwatch(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var caseR = 3.0;
    var body = new T.Mesh(new T.CylinderGeometry(caseR, caseR, 1.4, 32), cmat(0x2f363c, .5, .4));
    body.rotation.x = Math.PI / 2; g.add(body);
    var face = canvasTex(512, 512, function (x, w, h) {
      /* 停表常平放在托架上、离机位又远：细刻度会糊成一枚「白饼」。
         粗主刻度 + 数字 + 内圈，缩小到 60px 也读得出是表。 */
      x.fillStyle = '#eef3f7'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 6, 0, 6.283); x.fill();
      x.strokeStyle = '#1b2733'; x.lineWidth = 9; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 10, 0, 6.283); x.stroke();
      x.strokeStyle = '#93a1ad'; x.lineWidth = 2; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 54, 0, 6.283); x.stroke();
      x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 40px Consolas,monospace'; x.fillText('s', w / 2, h * .32);
      x.font = 'bold 30px Consolas,monospace'; x.fillText('min', w / 2, h * .14);
      for (var i = 0; i < 60; i++) {
        var a = -Math.PI / 2 + i / 60 * 6.283;
        var major = i % 5 === 0;
        var r1 = w / 2 - 18, r2 = major ? w / 2 - 46 : w / 2 - 32;
        x.strokeStyle = major ? '#16232f' : '#4a5866';
        x.lineWidth = major ? 8 : 4;
        x.beginPath(); x.moveTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
        x.lineTo(w / 2 + Math.cos(a) * r2, h / 2 + Math.sin(a) * r2); x.stroke();
      }
      x.fillStyle = '#16232f'; x.font = 'bold 30px Consolas,monospace';
      for (var k = 0; k < 6; k++) {
        var ak = -Math.PI / 2 + k / 6 * 6.283, rk = w / 2 - 76;
        x.fillText(String(k * 10), w / 2 + Math.cos(ak) * rk, h / 2 + Math.sin(ak) * rk);
      }
    });
    var faceMesh = new T.Mesh(new T.CircleGeometry(caseR - .15, 40), new T.MeshBasicMaterial({ map: face }));
    faceMesh.position.z = .71; g.add(faceMesh);
    var secHand = new T.Mesh(new T.BoxGeometry(.18, caseR * 1.4, .04), new T.MeshBasicMaterial({ color: 0xd83a2a }));
    secHand.geometry.translate(0, caseR * .55, 0); secHand.position.z = .75; g.add(secHand);
    var minHand = new T.Mesh(new T.BoxGeometry(.26, caseR * .7, .04), new T.MeshBasicMaterial({ color: 0x222 }));
    minHand.geometry.translate(0, caseR * .25, 0); minHand.position.z = .78; g.add(minHand);
    var hub = new T.Mesh(new T.CircleGeometry(.3, 16), new T.MeshBasicMaterial({ color: 0xb01818 }));
    hub.position.z = .83; g.add(hub);
    var crown = new T.Mesh(new T.CylinderGeometry(.6, .6, 1.0, 16), MK.metal);
    crown.position.set(0, caseR + .3, 0); g.add(crown);
    var sideBtn = new T.Mesh(new T.CylinderGeometry(.4, .4, .8, 12), MK.metal);
    sideBtn.rotation.z = Math.PI / 2; sideBtn.position.set(caseR + .4, 0, 0); g.add(sideBtn);
    g.userData.setTime = function (tSec) {
      var s = tSec % 60, m = Math.floor(tSec / 60);
      secHand.rotation.z = -s / 60 * 6.283;
      minHand.rotation.z = -m / 30 * 6.283;
    };
    g.userData.setTime(0);
    return g;
  }

  /* ══ 小车 ══════════════════════════════════════════════ */
  function cart(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var L = opts.len || 6, W = opts.w || 3.2, H = 2.2;
    var body = new T.Mesh(new T.BoxGeometry(L, H, W), cmat(0xd9b34a, .5, .2));
    body.position.y = 1.5; g.add(body);
    var wr = 1.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      var w = new T.Mesh(new T.CylinderGeometry(wr, wr, 1.0, 18), MK.rubber);
      w.rotation.x = Math.PI / 2;
      w.position.set(p[0] * (L / 2 - 1), wr, p[1] * (W / 2));
      g.add(w);
    });
    return g;
  }

  /* ══ 斜面 ══════════════════════════════════════════════ */
  function ramp(opts) {
    opts = opts || {};
    var g = new T.Group();
    var len = opts.len || 22, w = opts.w || 6, th = .6;
    var ang = (opts.angle || 22) * Math.PI / 180;
    var board = new T.Mesh(new T.BoxGeometry(len, th, w), cmat(0xb98b4e, .7, .1));
    board.rotation.z = ang; board.position.set(0, Math.sin(ang) * len / 2, 0); g.add(board);
    g.userData.board = board;
    var highX = Math.cos(ang) * len / 2;
    var suppH = Math.sin(ang) * len;
    /* 高端垫木：与板同材质，读成「一整块木料把板垫高」而非悬空色块 */
    var supp = new T.Mesh(new T.BoxGeometry(8, suppH, w + 1), PMAT.wood);
    supp.position.set(highX, suppH / 2, 0); g.add(supp);
    var band = new T.Mesh(new T.BoxGeometry(8.2, .35, w + 1.2),
      cmat(0x6d4a22, .8, .1, { envMapIntensity: 0 }));
    band.position.set(highX, suppH - .18, 0); g.add(band);
    var lowSupp = new T.Mesh(new T.BoxGeometry(2, 1, w), cmat(0x9aa2aa, .6, .3));
    lowSupp.position.set(-highX, .5, 0); g.add(lowSupp);
    return g;
  }

  /* ══ 钩码 ══════════════════════════════════════════════ */
  function hookWeight(value) {
    var MK = M(), g = new T.Group();
    var r = 1.3, h = 1.5;
    var body = new T.Mesh(new T.CylinderGeometry(r, r, h, 20), cmat(0x4a525a, .5, .6));
    body.position.y = h / 2; g.add(body);
    var hook = new T.Mesh(new T.TorusGeometry(.45, .16, 8, 16), MK.metal);
    hook.position.y = h + .5; g.add(hook);
    if (value) {
      var tex = canvasTex(128, 128, function (x) {
        x.fillStyle = '#cfd6dd'; x.fillRect(0, 0, 128, 128);
        x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 70px Consolas,monospace'; x.fillText(String(value), 64, 64);
      });
      var lab = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: tex }));
      lab.position.set(0, h / 2 + .01, r + .01); g.add(lab);
    }
    g.userData.h = h;
    return g;
  }

  /* ══ 木块 / 表面垫 ═════════════════════════════════════ */
  function woodBlock(opts) {
    opts = opts || {};
    var L = opts.len || 7, W = opts.w || 4, H = opts.h || 3;
    var g = new T.Group();
    var b = new T.Mesh(new T.BoxGeometry(L, H, W), cmat(0xc89b5a, .75, .05));
    b.position.y = H / 2; g.add(b);
    var gra = canvasTex(256, 256, function (x) {
      x.fillStyle = '#c89b5a'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(120,80,30,.5)'; x.lineWidth = 2;
      for (var i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, i * 44); x.lineTo(256, i * 44 + 12); x.stroke(); }
    });
    var top = new T.Mesh(new T.PlaneGeometry(L, W), new T.MeshBasicMaterial({ map: gra }));
    top.rotation.x = -Math.PI / 2; top.position.y = H + .01; g.add(top);
    return g;
  }
  function surfaceMat(opts) {
    opts = opts || {};
    var w = opts.w || 10, d = opts.d || 8, color = opts.color || 0x6fa8dc;
    var g = new T.Group();
    var m = new T.Mesh(new T.BoxGeometry(w, .3, d), cmat(color, .9, 0));
    m.position.y = .15; g.add(m);
    return g;
  }
  function towel() { return surfaceMat({ w: 10, d: 8, color: 0xe8e2d0 }); }
  function cloth() { return surfaceMat({ w: 10, d: 8, color: 0x9fb89a }); }

  /* ══ 杠杆（支架 + 横杆）════════════════════════════════ */
  function leverStand(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var h = opts.h || 6;
    var base = new T.Mesh(new T.BoxGeometry(5, 1, 5), MK.metalD); base.position.y = .5; g.add(base);
    var tri = new T.Mesh(new T.CylinderGeometry(.3, 2.6, h, 4), MK.metal);
    tri.position.y = .5 + h / 2; tri.rotation.y = Math.PI / 4; g.add(tri);
    var knife = new T.Mesh(new T.BoxGeometry(2, .3, 2), MK.metalD); knife.position.y = .5 + h; g.add(knife);
    g.userData.topY = .5 + h + .15;
    return g;
  }
  function leverBeam(opts) {
    opts = opts || {};
    var len = opts.len || 24;
    var g = new T.Group();
    var beam = new T.Mesh(new T.BoxGeometry(len, .5, 1.4), cmat(0xb0b8c0, .5, .6));
    g.add(beam);
    var tex = canvasTex(1024, 64, function (x) {
      x.fillStyle = '#aeb6be'; x.fillRect(0, 0, 1024, 64);
      x.fillStyle = '#2a3138'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 30px Consolas,monospace';
      for (var i = -10; i <= 10; i++) {
        var px = 512 + i * 48;
        x.fillRect(px, 8, 2, i % 5 === 0 ? 30 : 18);
        if (i % 5 === 0) x.fillText(String(i), px, 52);
      }
    });
    var lab = new T.Mesh(new T.PlaneGeometry(len, 1.0), new T.MeshBasicMaterial({ map: tex }));
    lab.position.set(0, .3, .7); g.add(lab);
    g.userData.len = len;
    return g;
  }

  /* ══ 激光笔 ═══════════════════════════════════════════ */
  function laser(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var L = 5, r = .7;
    var body = new T.Mesh(new T.CylinderGeometry(r, r, L, 20), cmat(0xb01818, .4, .5));
    body.rotation.z = Math.PI / 2; g.add(body);
    var cap = new T.Mesh(new T.CylinderGeometry(r * .7, r * .7, .8, 16), MK.metal);
    cap.rotation.z = Math.PI / 2; cap.position.x = L / 2 + .3; g.add(cap);
    var beamLen = opts.len || 40;
    var beam = new T.Mesh(new T.CylinderGeometry(.12, .12, beamLen, 8),
      new T.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false }));
    beam.rotation.z = Math.PI / 2; beam.position.x = L / 2 + beamLen / 2; g.add(beam);
    var dot = new T.Mesh(new T.SphereGeometry(.4, 10, 8),
      new T.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: .8, blending: T.AdditiveBlending, depthWrite: false }));
    dot.position.x = L / 2 + beamLen; g.add(dot);
    g.userData.beam = beam; g.userData.dot = dot;
    g.userData.setOn = function (on) { beam.visible = on; dot.visible = on; };
    g.userData.setOn(false);
    return g;
  }

  /* ══ 平面镜 / 量角器 / 方格纸 ═════════════════════════ */
  function mirror(opts) {
    opts = opts || {};
    var w = opts.w || 10, h = opts.h || 8;
    var g = new T.Group();
    var back = new T.Mesh(new T.BoxGeometry(w, h, .5), cmat(0x2a2f35, .6, .4)); g.add(back);
    var glass = new T.Mesh(new T.PlaneGeometry(w - .6, h - .6),
      new T.MeshStandardMaterial({ color: 0x9fd0e6, roughness: .04, metalness: 1, envMapIntensity: 1.2 }));
    glass.position.z = .26; g.add(glass);
    return g;
  }
  function protractor(opts) {
    opts = opts || {};
    var r = opts.r || 7;
    var g = new T.Group();
    var disc = new T.Mesh(new T.CircleGeometry(r, 64),
      new T.MeshBasicMaterial({ map: canvasTex(512, 256, function (x, w, h) {
        x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath();
        x.moveTo(w / 2, h); x.arc(w / 2, h, w / 2 - 4, Math.PI, 2 * Math.PI); x.closePath(); x.fill();
        x.strokeStyle = '#222'; x.lineWidth = 3; x.beginPath();
        x.arc(w / 2, h, w / 2 - 4, Math.PI, 2 * Math.PI); x.stroke();
        x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 22px Consolas,monospace';
        for (var a = 0; a <= 180; a += 10) {
          var rad = Math.PI + a / 180 * Math.PI;
          var r1 = w / 2 - 6, r2 = a % 30 === 0 ? w / 2 - 30 : w / 2 - 18;
          x.beginPath();
          x.moveTo(w / 2 + Math.cos(rad) * r1, h + Math.sin(rad) * r1);
          x.lineTo(w / 2 + Math.cos(rad) * r2, h + Math.sin(rad) * r2); x.stroke();
          if (a % 30 === 0) x.fillText(String(a), w / 2 + Math.cos(rad) * (r2 - 16), h + Math.sin(rad) * (r2 - 16));
        }
      }), transparent: true, side: T.DoubleSide }));
    g.add(disc);
    return g;
  }
  function gridPaper(opts) {
    opts = opts || {};
    var w = opts.w || 24, d = opts.d || 18;
    var tex = canvasTex(512, 384, function (x, W, H) {
      x.fillStyle = '#fbfaf4'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#cfd8df'; x.lineWidth = 1;
      for (var i = 0; i <= 16; i++) { var px = i / 16 * W; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke(); }
      for (var j = 0; j <= 12; j++) { var py = j / 12 * H; x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke(); }
      x.strokeStyle = '#c0392b'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();       // 镜面/法线位置
      x.strokeStyle = '#1f6f8b'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
    });
    var g = new T.Group();
    var p = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: tex }));
    p.rotation.x = -Math.PI / 2; p.position.y = .06; g.add(p);
    return g;
  }

  /* ══ 平板玻璃（竖直）══════════════════════════════════ */
  function glassPlate(opts) {
    opts = opts || {};
    var w = opts.w || 12, h = opts.h || 12, th = .5;
    var MK = M();
    var g = new T.Group();
    g.add(new T.Mesh(new T.BoxGeometry(w, h, th), MK.glass));
    return g;
  }

  /* ══ 蜡烛 ═════════════════════════════════════════════ */
  function candle(opts) {
    opts = opts || {};
    var r = opts.r || 1.4, h = opts.h || 6;
    var g = new T.Group();
    var wax = new T.Mesh(new T.CylinderGeometry(r, r, h, 22), cmat(0xf3ead0, .55, 0));
    wax.position.y = h / 2; g.add(wax);
    var wick = new T.Mesh(new T.CylinderGeometry(.08, .08, .8, 8), new T.MeshStandardMaterial({ color: 0x222 }));
    wick.position.y = h + .4; g.add(wick);
    var flame = new T.Mesh(new T.ConeGeometry(r * .5, r * 1.6, 12),
      new T.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false }));
    flame.position.y = h + r * .8; g.add(flame);
    var flameCore = new T.Mesh(new T.ConeGeometry(r * .22, r * .9, 10),
      new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .95, depthWrite: false }));
    flameCore.position.y = h + r * .6; g.add(flameCore);
    g.userData.flame = flame; g.userData.flameCore = flameCore;
    g.userData.setLit = function (on) { flame.visible = on; flameCore.visible = on; };
    g.userData.setLit(false);
    return g;
  }

  /* ══ 凸透镜 / 光屏 / 光具座 / 支座 ═════════════════════ */
  function convexLens(opts) {
    opts = opts || {};
    /* 真双凸：前后两面都是球面，边缘留 Te 厚度（真透镜不是刀锋边）。
       旧版只画了半面（一面凸一面平）、再套一根 .25 粗的深色环，
       浅背景下玻璃隐形，就只剩一个「铁圈」。 */
    var R = opts.r || 3.2, Tc = opts.th || 1.9, Te = opts.edge || .2;
    var MK = M();
    var g = new T.Group();
    var sag = (Tc - Te) / 2;
    var Rc = (R * R + sag * sag) / (2 * sag);      // 球面曲率半径
    function halfZ(r) { return Tc / 2 - (Rc - Math.sqrt(Math.max(0, Rc * Rc - r * r))); }
    var pts = [], N = 14;
    for (var i = N; i >= 0; i--) pts.push(new T.Vector2(i / N * R, -halfZ(i / N * R)));  // 后表面
    for (var j = 1; j <= N; j++) pts.push(new T.Vector2(j / N * R, halfZ(j / N * R)));   // 前表面
    var lens = new T.Mesh(new T.LatheGeometry(pts, 48), new T.MeshPhysicalMaterial({
      color: 0xd6ecff, roughness: .01, metalness: 0,
      transparent: true, opacity: .34, side: T.DoubleSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: .01, envMapIntensity: 2.0
    }));
    lens.renderOrder = 2; g.add(lens);
    /* 轮廓：两条镜像母线 + 前后口沿。浅背景下玻璃靠线定形，不靠调白 */
    var lineMat = new T.LineBasicMaterial({ color: 0x5d86a8, transparent: true, opacity: .7 });
    [1, -1].forEach(function (sg) {
      var lp = [];
      for (var k = 0; k <= 24; k++) {
        var r = k / 24 * R;
        lp.push(new T.Vector3(r, sg * halfZ(r), 0));
      }
      g.add(new T.Line(new T.BufferGeometry().setFromPoints(lp), lineMat));
    });
    [halfZ(R), -halfZ(R)].forEach(function (yy) {
      var cp = [];
      for (var k = 0; k < 48; k++) {
        var a = k / 48 * Math.PI * 2;
        cp.push(new T.Vector3(Math.cos(a) * R, yy, Math.sin(a) * R));
      }
      g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(cp), lineMat));
    });
    /* 边缘磨砂厚度环（读作玻璃断面）+ 细金属夹框（只夹边，不遮镜面） */
    var edge = new T.Mesh(new T.TorusGeometry(R, Te * .62, 8, 48),
      new T.MeshPhysicalMaterial({ color: 0xcfe4f2, roughness: .35, metalness: 0,
        transparent: true, opacity: .42, depthWrite: false }));
    edge.rotation.x = Math.PI / 2; g.add(edge);
    var frame = new T.Mesh(new T.TorusGeometry(R + .07, .085, 8, 48),
      new T.MeshStandardMaterial({ color: 0x9aa6b2, roughness: .3, metalness: .85, envMapIntensity: 1.2 }));
    frame.rotation.x = Math.PI / 2; g.add(frame);
    /* 镜面反光：斜椭圆柔光（Sprite 始终朝相机），玻璃才有「反光」而不是一片灰雾 */
    var hc = document.createElement('canvas'); hc.width = hc.height = 128;
    var hx = hc.getContext('2d');
    var hg = hx.createRadialGradient(56, 58, 3, 64, 64, 60);
    hg.addColorStop(0, 'rgba(255,255,255,.9)');
    hg.addColorStop(.4, 'rgba(232,246,255,.38)');
    hg.addColorStop(1, 'rgba(220,240,255,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    var hl = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(hc),
      transparent: true, opacity: .42, depthWrite: false, blending: T.AdditiveBlending }));
    hl.scale.set(R * .95, R * .52, 1);
    hl.renderOrder = 3;
    g.add(hl);
    g.userData.lensBody = lens;
    g.userData.rim = frame;
    g.userData.setFocalHint = function () {};
    return g;
  }
  function screen(opts) {
    opts = opts || {};
    var w = opts.w || 9, h = opts.h || 11;
    var g = new T.Group();
    var card = new T.Mesh(new T.BoxGeometry(w, h, .3), cmat(0xf2f2ec, .9, 0));
    card.position.y = h / 2 + 1; g.add(card);
    var stand = new T.Mesh(new T.BoxGeometry(1.4, 1, 4), cmat(0x3a4046, .6, .4));
    stand.position.y = .5; g.add(stand);
    return g;
  }
  function holder() {
    var g = new T.Group();
    var post = new T.Mesh(new T.CylinderGeometry(.3, .3, 9, 12), cmat(0x3a4046, .6, .4));
    post.position.y = 4.5; g.add(post);
    var clip = new T.Mesh(new T.BoxGeometry(3, 1.2, 1.2), cmat(0x3a4046, .6, .4));
    clip.position.y = 9; g.add(clip);
    return g;
  }
  function opticalBench(opts) {
    opts = opts || {};
    var len = opts.len || 40, w = opts.w || 5;
    var g = new T.Group();
    var rail = new T.Mesh(new T.BoxGeometry(len, 1.2, w), cmat(0x8a929a, .6, .4));
    rail.position.y = .6; g.add(rail);
    var tex = canvasTex(1024, 32, function (x) {
      x.fillStyle = '#8a929a'; x.fillRect(0, 0, 1024, 32);
      x.fillStyle = '#1c2b39'; x.font = 'bold 22px Consolas,monospace';
      for (var i = 0; i <= 40; i++) { var px = i / 40 * 1024; x.fillRect(px, 4, 2, 12); x.fillText(String(i * 5), px + 3, 28); }
    });
    var lab = new T.Mesh(new T.PlaneGeometry(len, .8), new T.MeshBasicMaterial({ map: tex }));
    lab.position.set(0, 1.21, w / 2); g.add(lab);
    [-1, 1].forEach(function (s) {
      var end = new T.Mesh(new T.BoxGeometry(1.2, 1.4, w + 1), cmat(0x3a4046, .6, .5));
      end.position.set(s * len / 2, .7, 0); g.add(end);
    });
    g.userData.len = len;
    return g;
  }

  /* ══ 电源 / 导线 / 灯泡 / 开关 ═════════════════════════ */
  function battery(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var W = opts.w || 8, H = opts.h || 4, D = opts.d || 4;
    var box = new T.Mesh(new T.BoxGeometry(W, H, D), cmat(0x2f363c, .6, .3));
    box.position.y = H / 2; g.add(box);
    [-1, 1].forEach(function (s) {
      /* 负柱纯黑、半径收细：0x222 + 环境光会发蓝，像一颗电容 */
      var post = new T.Mesh(new T.CylinderGeometry(.34, .34, 1.0, 14), s < 0 ? cmat(0x141414, .5, .2) : cmat(0xc81e1e, .4, .5));
      post.position.set(s * W / 2, H + .4, 0); g.add(post);
    });
    var tex = canvasTex(256, 128, function (x) {
      x.fillStyle = '#2f363c'; x.fillRect(0, 0, 256, 128);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 46px "Microsoft YaHei",sans-serif'; x.fillText('电源', 128, 64);
    });
    var lab = new T.Mesh(new T.PlaneGeometry(W * .44, H * .28), new T.MeshBasicMaterial({ map: tex }));
    lab.position.set(0, H / 2 + .01, D / 2 + .01); g.add(lab);
    return g;
  }
  function wire(points, opts) {
    opts = opts || {};
    var pts = points.map(function (p) {
      return p instanceof T.Vector3 ? p : new T.Vector3(p[0], p[1], p[2]);
    });
    var curve = new T.CatmullRomCurve3(pts);
    var r = opts.r || .22;
    var color = opts.color || 0x2a2f35;
    return new T.Mesh(new T.TubeGeometry(curve, Math.max(16, pts.length * 8), r, 8, false),
      cmat(color, .5, .4));
  }
  function bulb(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var glassR = 1.8, glassY = 4.5;
    var glass = new T.Mesh(new T.SphereGeometry(glassR, 20, 16),
      new T.MeshPhysicalMaterial({ color: 0xdff2ff, roughness: .03, metalness: 0, transparent: true, opacity: .42, side: T.DoubleSide, envMapIntensity: 1.5 }));
    glass.position.y = glassY; g.add(glass);
    /* 内衬：极淡的乳白 BackSide 球面，给玻璃泡「体积」而不是只剩一圈轮廓 */
    var inner = new T.Mesh(new T.SphereGeometry(glassR * .94, 20, 16),
      new T.MeshPhysicalMaterial({ color: 0xf4f9ff, roughness: .35, metalness: 0,
        transparent: true, opacity: .15, side: T.BackSide, depthWrite: false, envMapIntensity: .35 }));
    inner.position.y = glassY; g.add(inner);
    /* 浅背景里低 opacity 的玻璃球会消失，只剩灯头。加不透明度到 .42 +
       两条正交经线/赤道环/颈环定形：玻璃靠轮廓线，不靠调白。 */
    var outline = new T.LineBasicMaterial({ color: 0x40708f, transparent: true, opacity: .9 });
    ['xy', 'zy', 'eq'].forEach(function (kind) {
      var pts = [];
      for (var i = 0; i < 64; i++) {
        var a = i / 64 * Math.PI * 2, c = Math.cos(a) * glassR, s = Math.sin(a) * glassR;
        pts.push(kind === 'xy' ? new T.Vector3(c, glassY + s, 0)
               : kind === 'zy' ? new T.Vector3(0, glassY + s, c)
               : new T.Vector3(c, glassY, s));
      }
      g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), outline));
    });
    /* 一道左上高光弧 + 顶部抽气嘴：不再读作「金色小蛋糕上的白球」 */
    var hl = [];
    for (var hi = 0; hi <= 22; hi++) {
      var ha = Math.PI * (.58 + hi / 22 * .42);
      hl.push(new T.Vector3(Math.cos(ha) * glassR * .97, glassY + Math.sin(ha) * glassR * .97, glassR * .30));
    }
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(hl),
      new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .65 })));
    var pip = new T.Mesh(new T.SphereGeometry(.22, 12, 10),
      new T.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: .12, transparent: true, opacity: .6 }));
    pip.position.y = glassY + glassR - .02; g.add(pip);
    var neck = new T.Mesh(new T.CylinderGeometry(1.05, 1.5, .85, 20),
      new T.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: .12, transparent: true, opacity: .5, side: T.DoubleSide }));
    neck.position.y = 3.15; g.add(neck);
    /* 灯头改铝镍色（原亮金 0x8a6a2f 在浅背景里就是「蛋糕托」），螺纹用暗黄铜 */
    var threadMat = new T.MeshStandardMaterial({ color: 0xa9833f, roughness: .42, metalness: .88, envMapIntensity: .9 });
    [1.95, 2.45, 2.95].forEach(function (y) {   /* 灯头螺口三道环 */
      var th = new T.Mesh(new T.TorusGeometry(1.63, .085, 8, 24), threadMat);
      th.rotation.x = Math.PI / 2; th.position.y = y; g.add(th);
    });
    /* 灯丝下方的玻璃支撑柱（真实灯泡里有一根芯柱） */
    var stem = new T.Mesh(new T.CylinderGeometry(.18, .24, 1.25, 12),
      new T.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: .1, transparent: true, opacity: .42 }));
    stem.position.y = 3.48; g.add(stem);
    /* 灯丝：细螺旋线圈 + 两根引线。原来的 TorusKnot 在球内读作「一坨金色麻花」 */
    var coil = [];
    for (var ci = 0; ci <= 96; ci++) {
      var ct = ci / 96, ca = ct * Math.PI * 2 * 5;
      coil.push(new T.Vector3(Math.cos(ca) * .2, 3.98 + ct * .9, Math.sin(ca) * .2));
    }
    var fil = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(coil), 96, .032, 5, false),
      new T.MeshStandardMaterial({ color: 0x8a7048, roughness: .35, metalness: .7,
        emissive: new T.Color(0xffaa33), emissiveIntensity: 0 }));
    g.add(fil);
    [1, -1].forEach(function (sg) {
      var lead = new T.Mesh(new T.CylinderGeometry(.024, .024, 1.05, 5),
        new T.MeshStandardMaterial({ color: 0x8a7350, roughness: .4, metalness: .6 }));
      lead.position.set(sg * .17, 3.52, 0); g.add(lead);
    });
    var base = new T.Mesh(new T.CylinderGeometry(1.8, 1.6, 2.2, 18),
      new T.MeshStandardMaterial({ color: 0x9ba4ad, roughness: .4, metalness: .85, envMapIntensity: .8 }));
    base.position.y = 2.6; g.add(base);
    /* 灯座用深棕胶木，不用 P.MAT.rubber（环境光下发粉，像塑料杯垫） */
    var socket = new T.Mesh(new T.CylinderGeometry(2.0, 2.0, 1.0, 18),
      new T.MeshStandardMaterial({ color: 0x3b2f2a, roughness: .85, metalness: .05 }));
    socket.position.y = 1.4; g.add(socket);
    var glow = new T.PointLight(0xffcc66, 0, 18); glow.position.y = 4.5; g.add(glow);
    g.userData.fil = fil; g.userData.glow = glow;
    g.userData.setLit = function (on) { fil.material.emissiveIntensity = on ? 2.2 : 0; glow.intensity = on ? 1.6 : 0; };
    g.userData.setLit(false);
    return g;
  }
  function switch_(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var brass = new T.MeshStandardMaterial({ color: 0xb08c46, roughness: .26, metalness: .95, envMapIntensity: 1.35 });
    /* 底座加厚 + 四角脚垫；原来 .8 厚像一块薄板 */
    var base = new T.Mesh(new T.BoxGeometry(5.2, 1.0, 3.2), cmat(0x30373e, .65, .28));
    base.position.y = .5; g.add(base);
    [[-2.2, -1.25], [2.2, -1.25], [-2.2, 1.25], [2.2, 1.25]].forEach(function (p) {
      var foot = new T.Mesh(new T.CylinderGeometry(.22, .22, .18, 10), MK.rubber);
      foot.position.set(p[0], .09, p[1]); g.add(foot);
    });
    /* 两根黄铜接线柱 + 红/黑塑料帽（不再整根亮银圆柱） */
    [-1.6, 1.6].forEach(function (x) {
      var post = new T.Mesh(new T.CylinderGeometry(.18, .22, 1.2, 14), brass);
      post.position.set(x, 1.6, 0); g.add(post);
      var cap = new T.Mesh(new T.CylinderGeometry(.2, .19, .18, 14),
        x > 0 ? cmat(0xb01818, .42, .15) : cmat(0x24282c, .5, .15));
      cap.position.set(x, 2.34, 0); g.add(cap);
    });
    /* 闸刀：转轴在左柱顶，刀片向右伸；断开时右端抬起，不再绕中心转、插进柱身 */
    var lever = new T.Group();
    var arm = new T.Mesh(new T.BoxGeometry(3.4, .1, .38), brass);
    arm.position.x = 1.7; lever.add(arm);
    lever.position.set(-1.6, 2.2, 0); g.add(lever);
    var axle = new T.Mesh(new T.CylinderGeometry(.13, .13, .66, 12), brass);
    axle.rotation.x = Math.PI / 2; axle.position.set(-1.6, 2.2, 0); g.add(axle);
    [-1, 1].forEach(function (s) {
      var jaw = new T.Mesh(new T.BoxGeometry(.22, .3, .1), brass);
      jaw.position.set(1.6, 2.26, s * .26); g.add(jaw);
    });
    /* 闸刀绕 z 轴在竖直平面内翻起：负角度会把刀片压到台面下（读作「掉下来的刀片」），
       断开时必须是右端向上抬起，闭合才落下压进刀口 */
    g.userData.setClosed = function (c) { lever.rotation.z = c ? 0 : .9; };
    g.userData.setClosed(true);
    return g;
  }

  /* ══ 灵敏电流计（检流计）══════════════════════════════ */
  function galvanometer(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var W = 6, H = 6, D = 2.6;
    var box = new T.Mesh(new T.BoxGeometry(W, H, D), cmat(0x1f6f4a, .5, .2));
    g.add(box);
    var tex = canvasTex(512, 512, function (x) {
      x.fillStyle = '#f3faf5'; x.beginPath(); x.arc(256, 256, 240, 0, 6.283); x.fill();
      x.strokeStyle = '#222'; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 232, 0, 6.283); x.stroke();
      x.fillStyle = '#0a4d2f'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 60px Georgia,serif'; x.fillText('G', 256, 150);
      var a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
      for (var i = 0; i <= 20; i++) {
        var a = a0 + (a1 - a0) * (i / 20);
        var r1 = 196, r2 = i % 2 === 0 ? 168 : 184;
        x.strokeStyle = '#222'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
        x.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2); x.stroke();
      }
      x.font = 'bold 40px Arial,sans-serif';
      x.fillText('−', 256 + Math.cos(a0) * 150, 256 + Math.sin(a0) * 150);
      x.fillText('0', 256, 208);
      x.fillText('+', 256 + Math.cos(a1) * 150, 256 + Math.sin(a1) * 150);
      x.font = 'bold 28px Arial,sans-serif'; x.fillText('μA', 256, 330);
    });
    var face = new T.Mesh(new T.CircleGeometry(2.0, 40), new T.MeshBasicMaterial({ map: tex }));
    face.position.z = D / 2 + .02; g.add(face);
    /* 指针是 face 的子对象，z 必须写局部坐标：旧值 D/2+.05 让针浮在表盘前 1.35 */
    var needle = new T.Mesh(new T.BoxGeometry(.10, 1.62, .04), new T.MeshBasicMaterial({ color: 0xc0392b }));
    needle.geometry.translate(0, -.81, 0); needle.position.z = .02; face.add(needle);
    var pivot = new T.Mesh(new T.CircleGeometry(.09, 16), new T.MeshBasicMaterial({ color: 0x222 }));
    pivot.position.z = .035; face.add(pivot);
    /* 背面同样是白色方盒 → 补深灰背盖与两只脚 */
    var back = new T.Mesh(new T.BoxGeometry(W - .28, H - .28, .12), cmat(0x39434d, .72, .18));
    back.position.z = -D / 2 - .06; g.add(back);
    [-1, 1].forEach(function (s) {
      var foot = new T.Mesh(new T.BoxGeometry(1.1, .4, 1.4), MK.rubber);
      foot.position.set(s * 2.1, -H / 2 - .15, 0); g.add(foot);
    });
    g.userData.setValue = function (v) {
      var a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
      var f = Math.max(-1, Math.min(1, v));
      needle.rotation.z = -(a0 + (a1 - a0) * (0.5 + f * 0.5)) + Math.PI / 2 + Math.PI;
    };
    g.userData.setValue(0);
    return g;
  }

  /* ══ 螺线管 ═══════════════════════════════════════════ */
  function solenoid(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var L = opts.len || 12, R = 1.8;
    var tube = new T.Mesh(new T.CylinderGeometry(R, R, L, 24, 1, true),
      cmat(0xcfa46a, .8, .05, { side: T.DoubleSide }));
    tube.rotation.z = Math.PI / 2; g.add(tube);
    var coil = (function () {
      var pts = [], n = 60;
      for (var i = 0; i <= n; i++) {
        var t = i / n, a = t * L / (R * .55) * Math.PI * 2;
        pts.push(new T.Vector3((t - .5) * L, Math.cos(a) * (R - .1), Math.sin(a) * (R - .1)));
      }
      return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, .14, 8, false),
        cmat(0xb87333, .35, .9));
    })();
    g.add(coil);
    [-1, 1].forEach(function (s) {
      var lead = new T.Mesh(new T.CylinderGeometry(.18, .18, 4, 8), cmat(0xb87333, .35, .9));
      lead.rotation.z = Math.PI / 2; lead.position.set(s * (L / 2 + 2), 0, 0); g.add(lead);
    });
    return g;
  }

  /* ══ 蹄形磁铁 ═════════════════════════════════════════ */
  function horseshoeMagnet(opts) {
    opts = opts || {};
    var g = new T.Group();
    var span = 8, legH = 7, w = 3, barH = 3;
    var bottom = new T.Mesh(new T.BoxGeometry(span + w, barH, w), cmat(0xc0392b, .5, .3));
    bottom.position.y = barH / 2; g.add(bottom);
    [-1, 1].forEach(function (s) {
      var leg = new T.Mesh(new T.BoxGeometry(w, legH, w), cmat(s < 0 ? 0xc0392b : 0x2f6fbf, .5, .3));
      leg.position.set(s * span / 2, barH + legH / 2, 0); g.add(leg);
      var pole = new T.Mesh(new T.BoxGeometry(w + .2, 1.2, w + .2), cmat(s < 0 ? 0xe74c3c : 0x4a90d9, .4, .3));
      pole.position.set(s * span / 2, barH + legH + .2, 0); g.add(pole);
      var tex = canvasTex(128, 96, function (x) {
        x.fillStyle = s < 0 ? '#e74c3c' : '#4a90d9'; x.fillRect(0, 0, 128, 96);
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 70px "Microsoft YaHei",sans-serif'; x.fillText(s < 0 ? 'N' : 'S', 64, 48);
      });
      var lab = new T.Mesh(new T.PlaneGeometry(w, 2), new T.MeshBasicMaterial({ map: tex }));
      lab.position.set(s * span / 2, barH + legH + 1.4, w / 2 + .01); g.add(lab);
    });
    return g;
  }

  /* ══ 导体棒 ═══════════════════════════════════════════ */
  function conductorRod(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var L = opts.len || 12, r = .5;
    var rod = new T.Mesh(new T.CylinderGeometry(r, r, L, 18), MK.metal);
    rod.rotation.z = Math.PI / 2; g.add(rod);
    [-1, 1].forEach(function (s) {
      var c = new T.Mesh(new T.CylinderGeometry(.7, .7, 1, 14), MK.metalD);
      c.rotation.z = Math.PI / 2; c.position.x = s * L / 2; g.add(c);
    });
    return g;
  }

  /* ══ 小磁针 / 指南针 ═══════════════════════════════════ */
  function compass(opts) {
    opts = opts || {};
    var g = new T.Group();
    var caseR = opts.r || 2.4;
    var base = new T.Mesh(new T.CylinderGeometry(caseR, caseR, .8, 28), cmat(0x2f363c, .5, .4));
    base.position.y = .4; g.add(base);
    var face = new T.Mesh(new T.CircleGeometry(caseR - .2, 28), new T.MeshBasicMaterial({ color: 0xfbfbf6 }));
    face.position.y = .81; g.add(face);
    var needleGrp = new T.Group(); needleGrp.position.y = .9; g.add(needleGrp);
    var nN = new T.Mesh(new T.BoxGeometry(.4, 3.2, .12), new T.MeshBasicMaterial({ color: 0xd83a2a }));
    nN.geometry.translate(0, 1.4, 0); needleGrp.add(nN);
    var nS = new T.Mesh(new T.BoxGeometry(.4, 3.2, .12), new T.MeshBasicMaterial({ color: 0xf2f2ec }));
    nS.geometry.translate(0, -1.4, 0); needleGrp.add(nS);
    var pivot = new T.Mesh(new T.CylinderGeometry(.15, .15, .3, 10), cmat(0x222, .5, .6));
    pivot.position.y = .9; g.add(pivot);
    g.userData.needle = needleGrp;
    g.userData.setNeedle = function (a) { needleGrp.rotation.y = a; };
    g.userData.setNeedle(0);
    return g;
  }

  /* ══ U 形管压强计 ═════════════════════════════════════ */
  function uTubeManometer(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var sep = 6, tubeR = 1.0, tubeH = 12, tubeX = sep / 2;
    var liquidMat = new T.MeshPhysicalMaterial({ color: 0x2f9e6f, roughness: .1, metalness: 0, transparent: true, opacity: .8, side: T.DoubleSide });
    var liq = [];
    [-1, 1].forEach(function (s) {
      var tube = new T.Mesh(new T.CylinderGeometry(tubeR, tubeR, tubeH, 20, 1, true),
        MK.glass);
      tube.position.set(s * tubeX, tubeH / 2, 0); g.add(tube);
      var col = new T.Mesh(new T.CylinderGeometry(tubeR * .9, tubeR * .9, tubeH, 18), liquidMat.clone());
      col.position.set(s * tubeX, tubeH / 2, 0); g.add(col);
      liq.push(col);
    });
    var bot = new T.Mesh(new T.CylinderGeometry(tubeR, tubeR, sep + tubeR * 2, 16, 1, true), MK.glass);
    bot.rotation.z = Math.PI / 2; bot.position.set(0, tubeH, 0); g.add(bot);
    var liqBot = new T.Mesh(new T.CylinderGeometry(tubeR * .9, tubeR * .9, sep + tubeR * 2, 14), liquidMat.clone());
    liqBot.rotation.z = Math.PI / 2; liqBot.position.set(0, tubeH, 0); g.add(liqBot);
    /* 探头（左侧上端接橡胶管 + 橡皮膜） */
    var hose = new T.Mesh(new T.TorusGeometry(2.2, .3, 10, 20, Math.PI), MK.rubber);
    hose.position.set(-tubeX - 2.0, tubeH, 0); hose.rotation.z = Math.PI / 2; g.add(hose);
    var probe = new T.Mesh(new T.CylinderGeometry(tubeR, tubeR, 3, 16), MK.glass);
    probe.position.set(-tubeX - 4.4, tubeH + 1.5, 0); g.add(probe);
    var membrane = new T.Mesh(new T.CircleGeometry(tubeR * .95, 16), new T.MeshStandardMaterial({ color: 0x222, roughness: .8, side: T.DoubleSide }));
    membrane.position.set(-tubeX - 5.9, tubeH + 1.5, 0); membrane.rotation.y = Math.PI / 2; g.add(membrane);
    g.userData.liq = liq;
    g.userData.setDelta = function (d) {
      /* d>0：左侧压强大→左降右升（单位场景单位） */
      var hL = tubeH / 2 - d, hR = tubeH / 2 + d;
      liq[0].scale.y = Math.max(.1, hL / tubeH); liq[0].position.y = hL / 2;
      liq[1].scale.y = Math.max(.1, hR / tubeH); liq[1].position.y = hR / 2;
    };
    g.userData.setDelta(0);
    return g;
  }

  /* ══ 溢水杯 ═══════════════════════════════════════════ */
  function overflowCup(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var R = 3.2, H = 9;
    var cup = new T.Mesh(new T.CylinderGeometry(R, R * .85, H, 28, 1, true), MK.glass);
    cup.position.y = H / 2; g.add(cup);
    var bottom = new T.Mesh(new T.CylinderGeometry(R * .85, R * .85, .4, 28), MK.glass);
    bottom.position.y = .2; g.add(bottom);
    var spout = new T.Mesh(new T.CylinderGeometry(.7, .7, 3, 12), MK.glass);
    spout.rotation.z = Math.PI / 2; spout.position.set(R + 1.2, H - 1.5, 0); g.add(spout);
    return g;
  }
  function smallBucket(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var R = 2.6, H = 5;
    var b = new T.Mesh(new T.CylinderGeometry(R, R * .8, H, 24, 1, true), MK.metalD);
    b.position.y = H / 2; g.add(b);
    var bottom = new T.Mesh(new T.CylinderGeometry(R * .8, R * .8, .4, 24), MK.metalD);
    bottom.position.y = .2; g.add(bottom);
    var handle = new T.Mesh(new T.TorusGeometry(1.4, .18, 8, 20), MK.metal);
    handle.position.y = H + .8; g.add(handle);
    return g;
  }

  /* ══ 组装进 PhysicsKit ═════════════════════════════════ */
  var P = window.PhysicsKit || (window.PhysicsKit = {});
  Object.assign(P, {
    balance: balance, weight: weight, weightsBox: weightsBox,
    stopwatch: stopwatch, cart: cart, ramp: ramp,
    hookWeight: hookWeight, woodBlock: woodBlock, surfaceMat: surfaceMat, towel: towel, cloth: cloth,
    leverStand: leverStand, leverBeam: leverBeam,
    laser: laser, mirror: mirror, protractor: protractor, gridPaper: gridPaper,
    glassPlate: glassPlate, candle: candle,
    convexLens: convexLens, screen: screen, holder: holder, opticalBench: opticalBench,
    battery: battery, wire: wire, bulb: bulb, 'switch': switch_, switch_: switch_, galvanometer: galvanometer,
    solenoid: solenoid, horseshoeMagnet: horseshoeMagnet, conductorRod: conductorRod, compass: compass,
    uTubeManometer: uTubeManometer, overflowCup: overflowCup, smallBucket: smallBucket
  });

  /* ══════════════════════════════════════════════════════════════
     真实感 / 严谨性 增强层
     · MAT    基准材质表（玻璃/钢/陶瓷/蜡/木/黄铜），与化学台面线同源
     · port   器材局部坐标 → 世界坐标，导线端点精确落在接线柱上
     · link   带自然松弛下垂的导线（端点贴合、中段不横跨画面）
     · ground 深色接触阴影（深色台面上白色 blob 会读成白斑，必须染深）
     · stand  通用支座（底座 + 立杆 + 夹持），消除器材悬空
     · model  物理模型公式集：所有读数必须由模型算，禁止拟合/硬编码
     ══════════════════════════════════════════════════════════════ */

  var MK = M();
  var woodTex = canvasTex(256, 256, function (x, w, h) {
    x.fillStyle = '#a9793f'; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 40; i++) {
      x.strokeStyle = 'rgba(62,36,12,' + (.16 + Math.random() * .24).toFixed(3) + ')';
      x.lineWidth = 1 + Math.random() * 2.5;
      x.beginPath(); var y = Math.random() * h;
      x.moveTo(0, y); x.bezierCurveTo(w * .3, y + 7, w * .7, y - 7, w, y + 4); x.stroke();
    }
    x.strokeStyle = 'rgba(226,190,140,.18)'; x.lineWidth = 2;
    for (var j = 0; j < 12; j++) {
      x.beginPath(); var yy = Math.random() * h;
      x.moveTo(0, yy); x.lineTo(w, yy + 3); x.stroke();
    }
  });
  woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(2, 2);

  var PMAT = {
    glass: MK.glass,
    steel: MK.metal,
    steelD: MK.metalD,
    rubber: MK.rubber,
    ceramic: new T.MeshStandardMaterial({ color: 0xf2f5f8, roughness: .5, metalness: .05 }),
    wax: new T.MeshPhysicalMaterial({ color: 0xfbf6ec, roughness: .42, metalness: 0, clearcoat: .55 }),
    wood: new T.MeshStandardMaterial({ color: 0xffffff, map: woodTex, roughness: .86, metalness: 0, envMapIntensity: 0 }),
    brass: new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9, envMapIntensity: 1.2 }),
    dark: new T.MeshStandardMaterial({ color: 0x2f363c, roughness: .6, metalness: .3 }),
    red: new T.MeshStandardMaterial({ color: 0xc0392b, roughness: .5, metalness: .2 }),
    blue: new T.MeshStandardMaterial({ color: 0x2f6fbf, roughness: .5, metalness: .2 })
  };

  /* 把器材局部坐标换算成世界坐标（导线端点用） */
  function port(obj, lx, ly, lz) {
    obj.updateWorldMatrix(true, false);
    return obj.localToWorld(new T.Vector3(lx || 0, ly || 0, lz || 0));
  }

  /* 真实导线：两端精确贴合，中段按长度自然下垂，颜色区分红（正）/黑（负）/蓝（表） */
  function link(p0, p1, opts) {
    opts = opts || {};
    var a = p0 instanceof T.Vector3 ? p0.clone() : new T.Vector3(p0[0], p0[1], p0[2]);
    var b = p1 instanceof T.Vector3 ? p1.clone() : new T.Vector3(p1[0], p1[1], p1[2]);
    var d = a.distanceTo(b);
    var sag = opts.sag === undefined ? Math.min(3.0, d * .16) : opts.sag;
    var mid = a.clone().add(b).multiplyScalar(.5); mid.y = Math.min(a.y, b.y) - sag;
    var q1 = a.clone().lerp(mid, .5); q1.y = a.y - sag * .6;
    var q2 = b.clone().lerp(mid, .5); q2.y = b.y - sag * .6;
    /* opts.lay：导线从接线柱垂下、贴着台面走、再爬上另一根柱。
       默认行为不变（旧课件的悬空弧线由各课自行决定是否启用）。 */
    if (opts.lay) {
      var floorY = opts.floorY === undefined ? .55 : opts.floorY;
      var lowY = Math.max(floorY, Math.min(a.y, b.y) - sag);
      q1.x = a.x + (mid.x - a.x) * .55; q1.z = a.z + (mid.z - a.z) * .55;
      q2.x = b.x + (mid.x - b.x) * .55; q2.z = b.z + (mid.z - b.z) * .55;
      q1.y = lowY + (a.y - lowY) * .10;
      q2.y = lowY + (b.y - lowY) * .10;
      mid.y = lowY;
    }
    var curve = new T.CatmullRomCurve3([a, q1, mid, q2, b]);
    return new T.Mesh(new T.TubeGeometry(curve, 30, opts.r || .17, 8, false),
      cmat(opts.color || 0x2a2f35, .55, .35));
  }

  /* 接地阴影：深色台面上必须用深色，白色会被读成白斑 */
  function ground(x, z, r) {
    var m = window.Lab.blob({ x: x || 0, z: z || 0, r: r || 5 });
    m.material = m.material.clone();
    m.material.color.setHex(0x101a16);
    m.material.opacity = .3;
    m.material.depthWrite = false;
    return m;
  }

  /* 通用支座：底座 + 立杆 + 夹持，让透镜/光屏/电表/蜡烛都有支撑 */
  function stand(h, opts) {
    opts = opts || {}; h = h || 9;
    var g = new T.Group();
    var bw = opts.baseW || 4, bd = opts.baseD || 3.4;
    var base = new T.Mesh(new T.BoxGeometry(bw, .7, bd), PMAT.steelD);
    base.position.y = .35; g.add(base);
    var post = new T.Mesh(new T.CylinderGeometry(.26, .3, h, 12), PMAT.steel);
    post.position.y = .7 + h / 2; g.add(post);
    var clamp = new T.Mesh(new T.BoxGeometry(opts.clampW || 2.2, .8, 1.0), PMAT.steelD);
    clamp.position.y = .7 + h; g.add(clamp);
    g.userData.topY = .7 + h + .4;
    return g;
  }

  /* 物理模型：读数一律由这些公式实时算出，不允许写死结果 */
  var GCM = 980;   // 重力加速度 cm/s²（1 场景单位 = 1 cm）
  var GN = 10;     // 重力场强 N/kg（力学题统一取 10）
  var model = {
    gCm: GCM, gN: GN,
    /* 斜面匀加速：a = g(sinθ − μcosθ)；由静止出发 x=½at², v=at, t=√(2s/a) */
    inclineA: function (thetaDeg, mu) {
      var t = thetaDeg * Math.PI / 180;
      return Math.max(1, GCM * (Math.sin(t) - (mu || 0) * Math.cos(t)));
    },
    inclineT: function (s, a) { return Math.sqrt(2 * s / a); },
    inclineX: function (t, a) { return .5 * a * t * t; },
    inclineV: function (t, a) { return a * t; },
    /* 摩擦：N 由重力算，f = μN */
    weightN: function (kg) { return kg * GN; },
    friction: function (mu, N) { return mu * N; },
    /* 液体：Δp = ρgh；U 管液面差 Δh = Δp/(ρ液柱 g) */
    hydroP: function (rho, hCm) { return rho * GN * (hCm / 100); },
    manometerCm: function (dp, rhoMan) { return dp / (rhoMan * GN) * 100; },
    /* 浮力：F浮 = ρ液 g V排 */
    buoyancy: function (rho, Vcm3) { return rho * GN * Vcm3 / 1e6; },
    /* 弹簧：x = F/k */
    springX: function (F, k) { return F / k; },
    /* 透镜：1/u + 1/v = 1/f */
    lensV: function (f, u) { return f * u / (u - f); },
    lensM: function (f, u) { return (f * u / (u - f)) / u; },
    /* 串联电路：E、内阻 r、串联电阻数组 → 总电流与各分压 */
    series: function (E, r, Rs) {
      var R = r; Rs.forEach(function (x) { R += x; });
      var I = E / R, drops = Rs.map(function (x) { return I * x; });
      return { I: I, U: E - I * r, drops: drops, R: R };
    },
    /* 并联电路：支路电阻数组 → 干路电流、端电压、各支路电流 */
    parallel: function (E, r, Rs) {
      var inv = 0; Rs.forEach(function (x) { inv += 1 / x; });
      var Req = 1 / inv, R = r + Req, I = E / R, U = I * Req;
      return { I: I, U: U, branches: Rs.map(function (x) { return U / x; }), Req: Req };
    },
    /* 伏安法：E、内阻、滑变阻值、待测电阻 → 两表读数 */
    divider: function (E, r, Rvar, Rx) {
      var I = E / (r + Rvar + Rx);
      return { I: I, Ux: I * Rx, Uvar: I * Rvar, Utotal: E - I * r };
    }
  };

  Object.assign(P, {
    MAT: PMAT, port: port, link: link, ground: ground, stand: stand, model: model
  });
})();
