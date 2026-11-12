/* 格物实验室 · 物理专用仪器库（窗口对象 window.PhysicsKit）
   设计契约与 chem-kit 对齐：1 场景单位 ≈ 1 cm（display_gain 1.8, unit_m 0.02）；
   每件仪器构建后 base 落在 y=0，lesson 直接 obj.position.set(x,0,z) 摆上实验台。
   共享材质优先取自 window.ChemKit.MAT（玻璃/金属/橡胶），与化学课件同一套配方。 */
(function () {
  var T = window.THREE;

  function mat() {
    var C = window.ChemKit;
    if (C && C.MAT) return C.MAT;
    return {
      glass: new T.MeshPhysicalMaterial({ color: 0xf2f8fc, roughness: .06, metalness: 0,
        transparent: true, opacity: .30, side: T.DoubleSide, depthWrite: false,
        clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: 1.4 }),
      metal: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 }),
      metalD: new T.MeshStandardMaterial({ color: 0x6c747c, roughness: .4, metalness: .85, envMapIntensity: 1.1 }),
      rubber: new T.MeshStandardMaterial({ color: 0x222428, roughness: .85, metalness: 0 })
    };
  }
  function M() { return mat(); }

  /* 螺旋（弹簧 / 电阻丝）：沿圆柱螺旋布线，返回 TubeGeometry 网格 */
  function helix(radius, len, turns, wire, mat, axis) {
    axis = axis || 'y';
    var pts = [], n = Math.max(24, turns * 18), i;
    for (i = 0; i <= n; i++) {
      var t = i / n, a = t * turns * Math.PI * 2;
      var x = Math.cos(a) * radius, y = t * len, z = Math.sin(a) * radius;
      if (axis === 'y') pts.push(new T.Vector3(x, y, z));
      else pts.push(new T.Vector3(len * (t - .5), x, z));
    }
    var curve = new T.CatmullRomCurve3(pts);
    return new T.Mesh(new T.TubeGeometry(curve, n, wire, 8, false), mat);
  }

  /* ── 温度计 ─────────────────────────────────────────────
     玻璃管 + 底部液泡 + 红色液柱（高度随温度变）+ 刻度贴纸。 */
  function thermometer(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group(), g2 = new T.Group();
    var R = 0.42, bodyBot = 1.8, bodyTop = 11.2, bulbY = 0.95, bulbR = 0.82;
    var glassMat = new T.MeshPhysicalMaterial({ color: 0xeef6fb, roughness: .05, metalness: 0,
      transparent: true, opacity: .26, side: T.DoubleSide, depthWrite: false, clearcoat: .8, envMapIntensity: 1.2 });
    var tube = new T.Mesh(new T.CylinderGeometry(R, R, bodyTop - bodyBot, 18, 1, true), glassMat);
    tube.position.y = (bodyBot + bodyTop) / 2; g2.add(tube);
    var cap = new T.Mesh(new T.SphereGeometry(R, 16, 12), glassMat);
    cap.position.y = bodyTop; g2.add(cap);
    var bulb = new T.Mesh(new T.SphereGeometry(bulbR, 18, 14), glassMat);
    bulb.position.y = bulbY; g2.add(bulb);
    /* 红色液柱：液泡里一坨 + 管中一段（高度可调） */
    var red = new T.MeshStandardMaterial({ color: 0xd8392a, roughness: .5, emissive: new T.Color(0x5a0d06), emissiveIntensity: .35 });
    var bulbFill = new T.Mesh(new T.SphereGeometry(bulbR * .78, 16, 12), red);
    bulbFill.position.y = bulbY; g2.add(bulbFill);
    var colH = bodyTop - bodyBot - 0.4;
    var col = new T.Mesh(new T.CylinderGeometry(R * .46, R * .46, 1, 12), red);
    col.position.y = bodyBot + .2; g2.add(col);
    /* 白色刻度板：真实温度计是「玻璃管嵌在乳白刻度板前」。
       原来只有一张透明贴纸浮在管前，数字与红液柱横向错开，放大后读成
       「一列悬空数字」；改成不透明白板 + 贴在板上的刻度条 + 玻璃母线。 */
    var boardY = (bodyBot + bodyTop) / 2;
    var backboard = new T.Mesh(new T.BoxGeometry(2.6, colH + 1.0, .16),
      new T.MeshStandardMaterial({ color: 0xece9dd, roughness: .84, metalness: 0, envMapIntensity: .15 }));
    backboard.position.set(0, boardY, -R - .18); g2.add(backboard);
    var tex = (function () {
      var c = document.createElement('canvas'); c.width = 160; c.height = 512;
      var x = c.getContext('2d');
      x.fillStyle = '#f6f4ec'; x.fillRect(0, 0, 160, 512);
      x.fillStyle = '#1c3346'; x.textAlign = 'right'; x.textBaseline = 'middle';
      var lo = opts.lo || 0, hi = opts.hi || 100, major = opts.major || 10, minor = opts.minor || 5;
      for (var v = lo; v <= hi; v += major) {
        var f = (v - lo) / (hi - lo);
        var yy = (1 - f) * (512 - 24) + 12;
        x.fillRect(0, yy - 2, 46, 4);
        x.font = 'bold 32px Arial,sans-serif'; x.fillText(String(v), 150, yy);
        for (var k = 1; k < (major / minor); k++) {
          var vv = v + k * minor;
          if (vv > hi) break;
          var ff = (vv - lo) / (hi - lo), yyy = (1 - ff) * (512 - 24) + 12;
          x.fillRect(0, yyy - 1, 26, 2);
        }
      }
      var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
    })();
    var sticker = new T.Mesh(new T.PlaneGeometry(1.25, colH + .7),
      new T.MeshBasicMaterial({ map: tex, transparent: false }));
    sticker.position.set(.72, boardY, -R - .06); g2.add(sticker);
    /* 玻璃管母线 + 上下口沿：浅背景下靠轮廓线定形，不靠调白 */
    var lineMat = new T.LineBasicMaterial({ color: 0x5c7f99, transparent: true, opacity: .78 });
    [-1, 1].forEach(function (sg) {
      g2.add(new T.Line(new T.BufferGeometry().setFromPoints([
        new T.Vector3(sg * R, bodyBot, .02), new T.Vector3(sg * R, bodyTop, .02)]), lineMat));
    });
    [bodyBot, bodyTop].forEach(function (yy) {
      var r = new T.Mesh(new T.TorusGeometry(R, .035, 6, 20), MK.metalD);
      r.rotation.x = Math.PI / 2; r.position.y = yy; g2.add(r);
    });

    g2.userData = { col: col, colBot: bodyBot + .2, colTop: bodyTop - .2, colMax: colH };
    g.add(g2);
    g.userData.setReading = function (frac) {
      frac = Math.max(0, Math.min(1, frac));
      var h = Math.max(0.02, frac * g2.userData.colMax);
      col.scale.y = h; col.position.y = g2.userData.colBot + h / 2;
    };
    g.userData.setTemp = function (t) {
      var lo = opts.lo || 0, hi = opts.hi || 100;
      g.userData.setReading((t - lo) / (hi - lo));
    };
    g.userData.setReading(opts.frac !== undefined ? opts.frac : 0.1);
    return g;
  }

  /* ── 石棉网 ─────────────────────────────────────────────
     金属边框 + 细铁丝网 + 中央圆形石棉片，架在烧杯与酒精灯之间。
     旧版是一整块白色方板加 7×7 粗白条，读作「白色棋盘 / 烧烤架」。 */
  function asbestosNet(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var S = 8;
    var frameMat = new T.MeshStandardMaterial({ color: 0x59636d, roughness: .5, metalness: .7, envMapIntensity: .5 });
    var wireMat = new T.MeshStandardMaterial({ color: 0x7b858e, roughness: .55, metalness: .72, envMapIntensity: .35 });
    /* 四条边框条（不是一整块实心板） */
    [-1, 1].forEach(function (s) {
      var a = new T.Mesh(new T.BoxGeometry(S + 1.4, .3, .42), frameMat);
      a.position.set(0, 0, s * (S / 2 + .5)); g.add(a);
      var b = new T.Mesh(new T.BoxGeometry(.42, .3, S + 1.4), frameMat);
      b.position.set(s * (S / 2 + .5), 0, 0); g.add(b);
      /* 两只伸出挂耳：网是真的搁在铁圈上 */
      var ear = new T.Mesh(new T.BoxGeometry(1.7, .22, .5), frameMat);
      ear.position.set(s * (S / 2 + 1.15), 0, 0); g.add(ear);
    });
    /* 细铁丝网：15×15 根细丝，压暗压细 */
    for (var i = -7; i <= 7; i++) {
      var off = i * (S / 14);
      var a = new T.Mesh(new T.BoxGeometry(S, .055, .055), wireMat);
      a.position.set(0, .10, off); g.add(a);
      var b = new T.Mesh(new T.BoxGeometry(.055, .055, S), wireMat);
      b.position.set(off, .10, 0); g.add(b);
    }
    /* 中央圆形石棉片 + 压边：烧杯正坐在白圆片上 */
    var ceramic = new T.Mesh(new T.CylinderGeometry(S * .30, S * .30, .16, 40),
      new T.MeshStandardMaterial({ color: 0xe4ded0, roughness: .95, metalness: 0, envMapIntensity: .1 }));
    ceramic.position.y = .16; g.add(ceramic);
    var rim = new T.Mesh(new T.TorusGeometry(S * .30, .09, 8, 40), frameMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = .24; g.add(rim);
    g.userData.size = S;
    return g;
  }

  /* ── 刻度尺 ─────────────────────────────────────────────
     长条尺身 + 刻度贴纸（含数字），单位 cm。 */
  function ruler(opts) {
    opts = opts || {};
    var g = new T.Group();
    var L = opts.len || 20, W = 2.6, TH = 0.5;
    var body = new T.Mesh(new T.BoxGeometry(L, TH, W),
      new T.MeshStandardMaterial({ color: 0xf3ead2, roughness: .6, metalness: 0 }));
    g.add(body);
    var tex = (function () {
      var c = document.createElement('canvas'); c.width = 1024; c.height = 128;
      var x = c.getContext('2d'); x.fillStyle = '#3a2f1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var cm = opts.cm || 20;
      for (var v = 0; v <= cm; v++) {
        var px = (v / cm) * 1024;
        x.fillRect(px - 1, 0, 2, v % 10 === 0 ? 60 : (v % 5 === 0 ? 44 : 28));
        if (v % 5 === 0) { x.font = 'bold 30px Consolas,monospace'; x.fillText(String(v), px, 86); }
      }
      var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
    })();
    var sticker = new T.Mesh(new T.PlaneGeometry(L, W),
      new T.MeshBasicMaterial({ map: tex, transparent: true }));
    sticker.rotation.x = -Math.PI / 2; sticker.position.y = TH / 2 + 0.02; g.add(sticker);
    /* 左端起点标记 */
    var zero = new T.Mesh(new T.BoxGeometry(0.5, TH + .02, W + .02),
      new T.MeshStandardMaterial({ color: 0xd64b3a, roughness: .5 }));
    zero.position.x = -L / 2; g.add(zero);
    g.userData.len = L; g.userData.cm = opts.cm || 20;
    return g;
  }

  /* ── 弹簧测力计 ─────────────────────────────────────────
     圆筒外壳（半透明窗）+ 内部弹簧 + 可动指针/拉杆 + 底部挂钩。 */
  function springScale(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var r = 1.3, H = 7.2, top = H;
    var shell = new T.Mesh(new T.CylinderGeometry(r, r, H, 24, 1, true),
      new T.MeshPhysicalMaterial({ color: 0xdfe7ee, roughness: .25, metalness: 0,
        transparent: true, opacity: .22, side: T.DoubleSide, clearcoat: .6, envMapIntensity: 1 }));
    g.add(shell);
    var capTop = new T.Mesh(new T.CylinderGeometry(r, r, .4, 24), MK.metal);
    capTop.position.y = top; g.add(capTop);
    var ringTop = new T.Mesh(new T.TorusGeometry(.5, .18, 8, 16), MK.metal);
    ringTop.rotation.x = Math.PI / 2; ringTop.position.y = top + .5; g.add(ringTop);
    /* 内部弹簧：顶端锚定，底端连动子（随拉力下移） */
    var springMat = new T.MeshStandardMaterial({ color: 0x9aa6b0, roughness: .35, metalness: .85 });
    var spring = helix(0.7, 4.6, 9, 0.12, springMat, 'y');
    spring.position.y = 1.4; g.add(spring);
    var collar = new T.Mesh(new T.CylinderGeometry(r * .7, r * .7, .4, 18), MK.metalD);
    collar.position.y = 1.6; g.add(collar);
    var rod = new T.Mesh(new T.CylinderGeometry(.18, .18, 3.4, 10), MK.metal);
    rod.position.y = -0.4; g.add(rod);
    var hook = new T.Mesh(new T.TorusGeometry(.5, .16, 8, 16), MK.metal);
    hook.position.y = -2.2; g.add(hook);
    /* 前面板刻度（CanvasTexture）+ 指针 */
    var tex = (function () {
      var c = document.createElement('canvas'); c.width = 256; c.height = 256;
      var x = c.getContext('2d'); x.fillStyle = '#0e2437'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = '#cfe6f2'; x.lineWidth = 3; x.fillStyle = '#cfe6f2';
      x.textAlign = 'center'; x.font = 'bold 22px Consolas,monospace';
      var N = opts.max || 5;
      x.fillText('N', 128, 30);
      for (var v = 0; v <= N; v++) {
        var yy = 230 - (v / N) * 180;
        x.beginPath(); x.moveTo(70, yy); x.lineTo(v % 1 === 0 ? 120 : 95, yy); x.stroke();
        if (v % 1 === 0) x.fillText(String(v), 40, yy + 1);
      }
      var t = new T.CanvasTexture(c); return t;
    })();
    var panel = new T.Mesh(new T.PlaneGeometry(2.4, 5.2), new T.MeshBasicMaterial({ map: tex }));
    panel.position.set(0, H / 2, r + 0.01); g.add(panel);
    var pointer = new T.Mesh(new T.BoxGeometry(1.8, .12, .05),
      new T.MeshBasicMaterial({ color: 0xff5a3c }));
    pointer.position.set(0, 1.6, r + .05); g.add(pointer);
    g.userData.setForce = function (N) {
      var Nmax = opts.max || 5, f = Math.max(0, Math.min(1, N / Nmax));
      var y = 1.6 - f * 2.2;
      collar.position.y = y; rod.position.y = y - 2.0; hook.position.y = y - 3.8;
      pointer.position.y = y;
      pointer.rotation.z = 0;
    };
    g.userData.setForce(0);
    return g;
  }

  /* ── 电表（电流表 / 电压表）─────────────────────────────
     矩形表壳 + 圆形表盘（CanvasTexture，指针随读数转）。 */
  function meter(kind, opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var W = 6, H = 6, D = 2.6;
    var box = new T.Mesh(new T.BoxGeometry(W, H, D),
      new T.MeshStandardMaterial({ color: 0xe9e4d8, roughness: .55, metalness: .05 }));
    g.add(box);
    /* 背面机位：原来只有一块纯白方盒。补深灰背盖 + 四颗螺钉 + 铭牌条 + 橡胶脚，
       360° 转到背后仍是一台有装配细节的仪器。 */
    var back = new T.Mesh(new T.BoxGeometry(W - .28, H - .28, .12),
      new T.MeshStandardMaterial({ color: 0x39434d, roughness: .72, metalness: .18 }));
    back.position.z = -D / 2 - .06; g.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var sc = new T.Mesh(new T.CylinderGeometry(.12, .12, .08, 10), MK.metalD);
      sc.rotation.x = Math.PI / 2;
      sc.position.set(s[0] * 2.5, s[1] * 2.5, -D / 2 - .14); g.add(sc);
    });
    var plate = new T.Mesh(new T.BoxGeometry(3.8, 1.15, .06),
      new T.MeshStandardMaterial({ color: 0xb9c2ca, roughness: .45, metalness: .55 }));
    plate.position.set(0, .5, -D / 2 - .15); g.add(plate);
    [-1, 1].forEach(function (s) {
      var foot = new T.Mesh(new T.BoxGeometry(1.1, .42, 1.5), MK.rubber);
      foot.position.set(s * 2.1, -H / 2 - .16, 0); g.add(foot);
    });
    /* 深色表盘面板几乎铺满正面（原来 4.7 见方，四周留一圈白边 → 白纸盒感） */
    var bezel = new T.Mesh(new T.BoxGeometry(5.55, 5.55, .1),
      new T.MeshStandardMaterial({ color: 0x242b33, roughness: .55, metalness: .25 }));
    bezel.position.z = D / 2 + .01; g.add(bezel);
    /* 四角螺丝 + 底部深色垫条：机身有装配细节，不再是一块白方盒 */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var sc = new T.Mesh(new T.CylinderGeometry(.13, .13, .09, 10), MK.metalD);
      sc.rotation.x = Math.PI / 2;
      sc.position.set(s[0] * 2.42, s[1] * 2.42, D / 2 + .08); g.add(sc);
    });
    var footStrip = new T.Mesh(new T.BoxGeometry(5.7, .16, 2.2), MK.rubber);
    footStrip.position.set(0, -H / 2 + .06, .1); g.add(footStrip);
    var rim = new T.Mesh(new T.TorusGeometry(2.0, .22, 10, 32), MK.metalD);
    rim.position.z = D / 2 + .13; g.add(rim);
    var max = opts.max || (kind === 'A' ? 3 : 15);
    var label = kind === 'A' ? 'A' : 'V';
    var tex = (function () {
      var c = document.createElement('canvas'); c.width = 512; c.height = 512;
      var x = c.getContext('2d');
      x.fillStyle = '#fbfbf6'; x.beginPath(); x.arc(256, 256, 240, 0, 6.283); x.fill();
      x.strokeStyle = '#222'; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 232, 0, 6.283); x.stroke();
      x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 64px Georgia,serif'; x.fillText(label, 256, 150);
      var a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
      for (var i = 0; i <= 10; i++) {
        var a = a0 + (a1 - a0) * (i / 10);
        var r1 = 208, r2 = i % 5 === 0 ? 160 : 184;
        x.strokeStyle = '#111'; x.lineWidth = i % 5 === 0 ? 8 : 4;
        x.beginPath(); x.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
        x.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2); x.stroke();
      }
      /* 0 / 0.2 / 0.4 / 0.6 四档数字；Arial 比 Consolas 更不容易回退成衬线 */
      x.font = 'bold 46px Arial,sans-serif';
      [0, 1 / 3, 2 / 3, 1].forEach(function (f) {
        var adv = a0 + (a1 - a0) * f;
        x.fillText(f === 0 ? '0' : (max * f).toFixed(1),
          256 + Math.cos(adv) * 152, 256 + Math.sin(adv) * 152);
      });
      var t = new T.CanvasTexture(c); return t;
    })();
    var face = new T.Mesh(new T.CircleGeometry(2.0, 40), new T.MeshBasicMaterial({ map: tex }));
    face.position.z = D / 2 + .14; g.add(face);
    /* 针要够长（够到刻度）、根部在圆心；中心轴帽缩小，别像表盘破了个洞 */
    /* 针长 1.62（表盘半径 2.0，尖端贴住刻度线 r1≈1.63 内侧）；
       **z 必须写在 face 的局部坐标（≈.02，贴住表盘面）**——曾误写成 D/2+.05，
       指针悬空在表盘前方 0.5，近景广角下根部与轴心错开一截，读成「指针悬空」*/
    var needle = new T.Mesh(new T.BoxGeometry(.07, 1.62, .04),
      new T.MeshBasicMaterial({ color: 0xd83a2a }));
    needle.geometry.translate(0, -0.81, 0);
    needle.position.set(0, 0, .02);
    face.add(needle);
    var pivot = new T.Mesh(new T.CircleGeometry(.08, 16), new T.MeshBasicMaterial({ color: 0x222 }));
    pivot.position.z = .035; face.add(pivot);
    /* 接线柱 */
    [-1, 1].forEach(function (s) {
      var post = new T.Mesh(new T.CylinderGeometry(.28, .28, 1.0, 14), MK.metalD);
      post.rotation.z = Math.PI / 2; post.position.set(s * 3.6, -H / 2 - .3, 0); g.add(post);
    });
    var a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    g.userData.setValue = function (v) {
      var f = Math.max(-0.05, Math.min(1.05, v / max));
      /* 针的几何朝 -y：f=0 指左下 0 位、f=1 指右下满偏；旧公式正好反了 180° */
      needle.rotation.z = -Math.PI / 4 + f * Math.PI / 2;
    };
    g.userData.setValue(0);
    g.userData.max = max;
    return g;
  }
  function ammeter(opts) { return meter('A', opts); }
  function voltmeter(opts) { return meter('V', opts); }

  /* ── 滑动变阻器 ─────────────────────────────────────────
     陶瓷棒 + 表面电阻丝（螺旋）+ 可滑动滑片 + 两端接线柱。 */
  function rheostat(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var L = opts.len || 9, R = 1.4;
    /* 浅背景下浅灰瓷棒 + 细铜丝会糊成一根「白色波纹管」：压暗瓷管、
       加粗电阻丝、补支架与滑片，从 45° 机位也能一眼认出滑动变阻器。 */
    var ceramic = new T.Mesh(new T.CylinderGeometry(R, R, L, 22),
      new T.MeshStandardMaterial({ color: 0x8e9aa5, roughness: .72, metalness: .05, envMapIntensity: .5 }));
    ceramic.rotation.z = Math.PI / 2; ceramic.position.y = R + .6; g.add(ceramic);
    var wire = helix(R - .02, L - 1, 18, .13,
      new T.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .4, metalness: .75 }), 'x');
    wire.position.y = R + .6; g.add(wire);
    /* 两端支架：瓷棒离台面有腿，不再像一根管子直接躺在桌上 */
    [-1, 1].forEach(function (s) {
      var foot = new T.Mesh(new T.BoxGeometry(1.1, R + .6, 3.2),
        new T.MeshStandardMaterial({ color: 0x39424b, roughness: .7, metalness: .2 }));
      foot.position.set(s * (L / 2 - .45), (R + .6) / 2, 0); g.add(foot);
    });
    /* 滑片：深色滑板 + 金属臂 + 碳刷 + 顶部旋钮 */
    /* 滑片：跨在瓷管上的深色滑板 + 短立柱 + 胶木旋钮；
       原来一块悬空方板 + 金属圆罐，读作「管子上放了个小罐」 */
    var slider = new T.Group();
    var shoe = new T.Mesh(new T.BoxGeometry(2.2, .22, 3.2),
      new T.MeshStandardMaterial({ color: 0x2b343c, roughness: .55, metalness: .3 }));
    shoe.position.y = .16; slider.add(shoe);
    var arm = new T.Mesh(new T.BoxGeometry(.34, 1.05, .34), MK.metal);
    arm.position.y = .8; slider.add(arm);
    var brush = new T.Mesh(new T.BoxGeometry(.5, .5, .5),
      new T.MeshStandardMaterial({ color: 0x1f1f1f, roughness: .8 }));
    brush.position.y = -.1; slider.add(brush);
    var knob = new T.Mesh(new T.CylinderGeometry(.34, .38, .62, 14),
      new T.MeshStandardMaterial({ color: 0x3b2f2a, roughness: .8, metalness: .05 }));
    knob.position.y = 1.55; slider.add(knob);
    /* 滑板要跨在瓷管顶（顶面 = (R+.6)+R = 3.4），原来 2.8 整块陷进瓷管里 */
    slider.position.y = R + 1.9; g.add(slider);
    /* 两端接线柱（原柱坐标不动，导线 P.port 仍精确落柱）；另补一对副柱 */
    [-1, 1].forEach(function (s) {
      /* 柱缩细：.3 半径在近景里像「管端竖了个金圆筒」 */
      var post = new T.Mesh(new T.CylinderGeometry(.16, .16, .9, 12), MK.metalD);
      post.position.set(s * L / 2, R + 1.0, 0); g.add(post);
      var post2 = new T.Mesh(new T.CylinderGeometry(.14, .14, .8, 12), MK.metal);
      post2.position.set(s * (L / 2 - 1.1), 1.1, 1.9); g.add(post2);
    });
    g.userData.setSlider = function (frac) {
      frac = Math.max(0, Math.min(1, frac));
      slider.position.x = (frac - .5) * (L - 1);
    };
    g.userData.setSlider(0.5);
    return g;
  }

  /* ── 铁架台（带铁圈 + 可选温度计夹）──────────────────────
     底座 + 立杆 + 铁圈（托石棉网/烧杯）+ 可选温度计夹。
     铁圈中心在 (ringX, ringY, ringZ)，横杆从立杆连到铁圈中心，
     铁圈清晰托住石棉网与烧杯，消除“悬空”观感；温度计夹把温度计
     真正固定在立杆上（不再悬空）。 */
  function ringStand(opts) {
    opts = opts || {};
    var MK = M(), g = new T.Group();
    var postX = opts.postX || 0, postZ = opts.postZ || 0;
    var postH = opts.postH || 16;
    var ringX = opts.ringX !== undefined ? opts.ringX : postX + 6;
    var ringZ = opts.ringZ !== undefined ? opts.ringZ : postZ;
    var ringY = opts.ringY || 6.2;
    var ringR = opts.ringR || 3.4;
    /* 底座（双层，稳重） */
    var base = new T.Mesh(new T.BoxGeometry(6.5, .7, 6.5), MK.metalD);
    base.position.set(postX, .35, postZ); g.add(base);
    var foot = new T.Mesh(new T.BoxGeometry(4.6, .25, 4.6), MK.metalD);
    foot.position.set(postX, .72, postZ); g.add(foot);
    /* 立杆（底插进底座） */
    var post = new T.Mesh(new T.CylinderGeometry(.5, .55, postH, 18), MK.metal);
    post.position.set(postX, postH / 2 + .35, postZ); g.add(post);
    /* 铁圈：粗一点、深灰，易见；托住石棉网与烧杯 */
    var ring = new T.Mesh(new T.TorusGeometry(ringR, .32, 14, 44), MK.metalD);
    ring.rotation.x = Math.PI / 2; ring.position.set(ringX, ringY, ringZ); g.add(ring);
    /* 横杆：从立杆连到铁圈中心 */
    var dx = ringX - postX, dz = ringZ - postZ, len = Math.sqrt(dx * dx + dz * dz);
    var rod = new T.Mesh(new T.BoxGeometry(len, .55, .55), MK.metal);
    rod.position.set((postX + ringX) / 2, ringY, (postZ + ringZ) / 2);
    rod.rotation.y = -Math.atan2(dz, dx); g.add(rod);
    /* 立杆 ↔ 横杆连接卡箍 */
    var collar = new T.Mesh(new T.CylinderGeometry(.64, .64, 1.5, 16), MK.metalD);
    collar.position.set(postX, ringY, postZ); g.add(collar);
    g.userData = { ring: ring, ringX: ringX, ringY: ringY, ringZ: ringZ,
      postX: postX, postZ: postZ, postH: postH };
    /* 可选温度计夹：立杆上的卡箍 + 横杆伸到铁圈中心上方，末端“环形夹”套住温度计 */
    if (opts.clampY !== undefined) {
      var cY = opts.clampY;
      var ccollar = new T.Mesh(new T.CylinderGeometry(.64, .64, 1.5, 16), MK.metalD);
      ccollar.position.set(postX, cY, postZ); g.add(ccollar);
      var carm = new T.Mesh(new T.BoxGeometry(len, .5, .5), MK.metal);
      carm.position.set((postX + ringX) / 2, cY, (postZ + ringZ) / 2);
      carm.rotation.y = -Math.atan2(dz, dx); g.add(carm);
      /* 环形夹必须水平（法线朝 y）才套得住竖直温度计；旧版竖环读作
         「横杆末端挂了个金属球」。夹唇 + 连接块补出夹持关系。 */
      var jaw = new T.Mesh(new T.TorusGeometry(.66, .16, 10, 28), MK.metalD);
      jaw.rotation.x = Math.PI / 2; jaw.position.set(ringX, cY, ringZ); g.add(jaw);
      var jawBox = new T.Mesh(new T.BoxGeometry(1.25, .42, .46), MK.metalD);
      jawBox.position.set(ringX - .85, cY, ringZ); g.add(jawBox);
      [-1, 1].forEach(function (s) {
        var lip = new T.Mesh(new T.BoxGeometry(.34, .42, .22), MK.metal);
        lip.position.set(ringX + s * .6, cY, ringZ - .32); g.add(lip);
      });
      g.userData.clampX = ringX; g.userData.clampY = cY; g.userData.clampZ = ringZ;
    }
    return g;
  }

  window.PhysicsKit = {
    version: '0.1.0',
    thermometer: thermometer, asbestosNet: asbestosNet, ruler: ruler,
    springScale: springScale, ammeter: ammeter, voltmeter: voltmeter, rheostat: rheostat,
    helix: helix, ringStand: ringStand
  };
})();
