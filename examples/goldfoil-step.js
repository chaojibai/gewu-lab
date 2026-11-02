/* 格物实验室 · α 粒子轰击金箔实验（卢瑟福散射，原子的核式结构）
   装置：学生实验桌(长而浅) + 水平散射腔（底座 + 玻璃荧光屏）+ 铅盒放射源 + 金箔支架。 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    beam: false, mode: 'most',
    showNucleus: false, showElectrons: false,
    t: 0, parts: [], flashes: []
  };

  var O = {};
  var R = 5.0;           /* 荧光屏半径 */
  var BY = 1.2;          /* α 射束高度 */
  var SRCX = -3.4;       /* 发射口 */
  var SPEED = 7;         /* α 粒子速度 */
  var D2R = Math.PI / 180;

  var DOT_TEX = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.3, 'rgba(255,255,255,.9)');
    g.addColorStop(.62, 'rgba(255,255,255,.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  })();

  var RING_TEX = (function () {
    var w = 96, c = document.createElement('canvas'); c.width = c.height = w;
    var x = c.getContext('2d'); var cx = w / 2, r = w * 0.36;
    x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 3.2;
    x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 7;
    x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.stroke();
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  })();

  function grainTex(w, avg, amp, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w;
    var x = c.getContext('2d'); var img = x.createImageData(w, w); var d = img.data;
    for (var i = 0; i < w * w; i++) {
      var v = (avg + (Math.random() - .5) * amp) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v; var o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep); t.encoding = T.LinearEncoding; return t;
  }

  function normalTex(w, strength, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w; var x = c.getContext('2d');
    var h = new Float32Array(w * w); var i;
    for (i = 0; i < w * w; i++) h[i] = Math.random();
    var img = x.createImageData(w, w); var d = img.data;
    for (var j = 0; j < w; j++) for (var k = 0; k < w; k++) {
      var hl = h[j * w + ((k - 1 + w) % w)], hr = h[j * w + ((k + 1) % w)];
      var hu = h[((j - 1 + w) % w) * w + k], hd = h[((j + 1) % w) * w + k];
      var nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
      var L = Math.sqrt(nx * nx + ny * ny + nz * nz); var o = (j * w + k) * 4;
      d[o] = (nx / L * .5 + .5) * 255; d[o + 1] = (ny / L * .5 + .5) * 255; d[o + 2] = (nz / L * .5 + .5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep); t.encoding = T.LinearEncoding; return t;
  }

  function ringLine(y, r, op) {
    var pts = [], n = 96, i, a;
    for (i = 0; i <= n; i++) { a = i / n * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
    var l = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color: 0x7f9fb8, transparent: true, opacity: op }));
    K.scene().add(l); return l;
  }

  function clearParts(s) {
    var i;
    for (i = 0; i < s.parts.length; i++) K.scene().remove(s.parts[i].sp);
    s.parts.length = 0;
    for (i = 0; i < s.flashes.length; i++) { K.scene().remove(s.flashes[i].core); K.scene().remove(s.flashes[i].shell); }
    s.flashes.length = 0;
    s._acc = 0;
  }

  function pickTheta(mode) {
    var r = Math.random(), sign = Math.random() < .5 ? -1 : 1;
    var pBack, pDef;
    if (mode === 'predict') { pBack = 0; pDef = .015; }
    else if (mode === 'deflect') { pBack = .02; pDef = .5; }
    else if (mode === 'back') { pBack = .22; pDef = .2; }
    else { pBack = .012; pDef = .14; }
    if (r < pBack) return Math.PI - sign * (8 + Math.random() * 55) * D2R;
    if (r < pBack + pDef) return sign * (4 + Math.random() * 32) * D2R;
    return (Math.random() - .5) * .02;
  }

  var PART_GEO = null, PART_MAT = null, RING_GEO = null;
  function spawnPart(s) {
    var sp = new T.Mesh(PART_GEO, PART_MAT);
    sp.position.set(SRCX, BY + K.rnd(-.06, .06), K.rnd(-.06, .06));
    K.scene().add(sp);
    s.parts.push({ x: SRCX, z: 0, vx: SPEED, vz: 0, th: pickTheta(s.mode), defl: false, life: 3.0, sp: sp });
  }

  function doFlash(s, phi) {
    var fx = Math.cos(phi) * R, fz = Math.sin(phi) * R;
    var core = new T.Mesh(PART_GEO, new T.MeshBasicMaterial({ color: new T.Color(0xfff6da).multiplyScalar(2.6), transparent: true }));
    core.position.set(fx * .99, BY, fz * .99); core.scale.setScalar(2.0);
    K.scene().add(core);
    var shell = new T.Mesh(PART_GEO, new T.MeshBasicMaterial({ color: new T.Color(0xbfefff).multiplyScalar(1.2), transparent: true, opacity: .4, depthWrite: false }));
    shell.position.copy(core.position); shell.scale.setScalar(2.5);
    K.scene().add(shell);
    s.flashes.push({ core: core, shell: shell, t: 0, life: .55 });
  }

  function reset(s, o) {
    s.beam = !!o.beam; s.mode = o.mode || 'most';
    s.showNucleus = !!o.nuc; s.showElectrons = !!o.elec;
    clearParts(s);
  }

  var scene = {
    setup: function () {
      var i;
      PART_GEO = new T.SphereGeometry(.13, 10, 8);
      RING_GEO = new T.RingGeometry(.3, .46, 28);
      PART_MAT = new T.MeshBasicMaterial({ color: new T.Color(0xff5124).multiplyScalar(2.4) });

      (function () {
        var bc = document.createElement('canvas'); bc.width = 4; bc.height = 256;
        var bx = bc.getContext('2d'); var bgg = bx.createLinearGradient(0, 0, 0, 256);
        bgg.addColorStop(0, '#ffffff'); bgg.addColorStop(.55, '#f5f7fa'); bgg.addColorStop(1, '#e9eef3');
        bx.fillStyle = bgg; bx.fillRect(0, 0, 4, 256);
        K.scene().background = new T.CanvasTexture(bc);
      })();

      var epGrain = grainTex(128, .70, .26, 7);
      var mtGrain = grainTex(128, .60, .20, 10);
      var nrm = normalTex(128, 1.0, 3);

      var MAT = {
        lead: new T.MeshStandardMaterial({ color: 0x4a535c, roughness: .42, metalness: .62, envMapIntensity: 1.0 }),
        plate: new T.MeshPhysicalMaterial({ color: 0x1b2027, roughness: .5, metalness: .25, clearcoat: .55, clearcoatRoughness: .22, envMapIntensity: 1.05, roughnessMap: mtGrain, normalMap: nrm, normalScale: new T.Vector2(.06, .06) }),
        steel: new T.MeshStandardMaterial({ color: 0xb4bcc4, roughness: .26, metalness: .95, envMapIntensity: 1.45 }),
        gold: new T.MeshStandardMaterial({ color: 0xffcb52, roughness: .26, metalness: 1.0, envMapIntensity: 1.4, side: T.DoubleSide }),
        screen: new T.MeshPhysicalMaterial({ color: 0xdff0e8, roughness: .14, metalness: 0, transparent: true, opacity: .4, side: T.DoubleSide, depthWrite: false, clearcoat: .7, clearcoatRoughness: .12, envMapIntensity: 1.8 })
      };

      /* ===== 学生实验桌（长而浅：约 38×12×15，贴近 240×60×76 的比例） ===== */
      var TW = 38, TD = 12, FLOOR = -15.0, TTH = .7;
      var deckMat = new T.MeshPhysicalMaterial({ color: 0x3f6a60, roughness: .4, metalness: .05, clearcoat: .55, clearcoatRoughness: .3, envMapIntensity: .85, roughnessMap: epGrain, normalMap: nrm, normalScale: new T.Vector2(.1, .1) });
      var frameMat = new T.MeshStandardMaterial({ color: 0xdfe4e9, roughness: .42, metalness: .35, envMapIntensity: .9 });
      var shelfMat = new T.MeshStandardMaterial({ color: 0xd2d8de, roughness: .48, metalness: .28, envMapIntensity: .75 });
      var feetMat = new T.MeshStandardMaterial({ color: 0x23282d, roughness: .55, metalness: .35, envMapIntensity: .6 });

      var tTop = K.rbox({ x: 0, y: -TTH / 2, z: 0, sx: TW, sy: TTH, sz: TD, r: .14, mat: deckMat });
      tTop.castShadow = true; tTop.receiveShadow = true;

      var PANB = FLOOR + .5, PANH = -TTH - PANB, PANY = -TTH - PANH / 2;
      var SPX = TW / 2 - .5;
      [-1, 1].forEach(function (sg) {
        K.rbox({ x: sg * SPX, y: PANY, z: 0, sx: .7, sy: PANH, sz: TD - 1.0, r: .16, mat: frameMat }).castShadow = true;
      });
      K.rbox({ x: 0, y: PANY, z: 0, sx: .5, sy: PANH, sz: TD - 1.0, r: .14, mat: frameMat }).castShadow = true;
      K.rbox({ x: 0, y: -TTH - .55, z: TD / 2 - .8, sx: TW - .8, sy: .9, sz: .5, r: .08, mat: frameMat });
      /* 下层隔板 + 后挡 + 每侧再分一格 */
      var SHY = -TTH - 5.4;
      K.rbox({ x: 0, y: SHY, z: 0, sx: TW - 1.4, sy: .4, sz: TD - 1.2, r: .08, mat: shelfMat }).receiveShadow = true;
      K.rbox({ x: 0, y: SHY + .6, z: -(TD - 1.2) / 2 + .12, sx: TW - 1.5, sy: 1.2, sz: .25, r: .05, mat: shelfMat });
      [-1, 1].forEach(function (sg) {
        K.rbox({ x: sg * (TW / 4), y: SHY + .6, z: 0, sx: .25, sy: 1.2, sz: TD - 1.2, r: .04, mat: shelfMat });
      });
      /* 脚垫 */
      [-SPX, 0, SPX].forEach(function (fx) {
        [-1, 1].forEach(function (sz) {
          K.rbox({ x: fx, y: FLOOR + .25, z: sz * (TD / 2 - .7), sx: 1.0, sy: .5, sz: 1.0, r: .1, mat: feetMat }).castShadow = true;
        });
      });

      /* ===== 散射腔 ===== */
      var plate = K.cyl({ r: R + .4, h: .35, y0: .02, x: 0, z: 0, mat: MAT.plate, seg: 64 });
      plate.castShadow = true; plate.receiveShadow = true;
      K.blob({ x: 0, y: .04, z: 0, r: R + 1.0 });

      var wall = new T.Mesh(new T.CylinderGeometry(R, R, 2.0, 96, 1, true), MAT.screen);
      wall.position.y = .37 + 1.0; wall.castShadow = true; K.scene().add(wall);
      ringLine(.37, R, .6); ringLine(2.37, R, .65);

      /* 金箔 + 支架 */
      O.foil = K.rbox({ x: 0, y: BY, z: 0, sx: .08, sy: 1.2, sz: .9, r: .03, mat: MAT.gold });
      O.foil.castShadow = true;
      var p1 = K.cyl({ r: .05, h: 1.5, y0: .37, x: 0, z: -.55, mat: MAT.steel, seg: 8 }); p1.castShadow = true;
      var p2 = K.cyl({ r: .05, h: 1.5, y0: .37, x: 0, z: .55, mat: MAT.steel, seg: 8 }); p2.castShadow = true;
      var topbar = K.rbox({ x: 0, y: 1.9, z: 0, sx: .16, sy: .1, sz: 1.1, r: .03, mat: MAT.steel }); topbar.castShadow = true;

      /* 铅盒放射源 + 准直口 + 镭源红点 */
      var src = K.rbox({ x: -4.3, y: 1.17, z: 0, sx: .95, sy: 1.6, sz: .95, r: .1, mat: MAT.lead }); src.castShadow = true;
      var noz = new T.Mesh(new T.CylinderGeometry(.16, .16, .8, 16), MAT.lead);
      noz.rotation.z = Math.PI / 2; noz.position.set(-3.7, BY, 0); K.scene().add(noz);
      O.radium = K.sphere({ x: -3.95, y: BY, z: 0, r: .12, color: 0xff5a3a });

      /* 原子核 + 核外电子 */
      O.nucleus = K.sphere({ x: 0, y: BY, z: 0, r: .2, color: 0xd63a20 });
      O.nucleus.visible = false;
      O.elecs = [];
      for (i = 0; i < 3; i++) {
        var em = K.sphere({ x: 0, y: BY, z: 0, r: .09, color: 0x4a90e8 });
        em.visible = false;
        O.elecs.push({ mesh: em, rad: .8 + i * .5, spd: .9 - i * .2, ph: i * 2.1 });
      }

      K.label([0, 2.4, 0], '金箔', 0, -16);
      K.label([-4.3, 1.9, 0], 'α 粒子源', 0, -14);
      K.label([R * .74, 1.9, R * .74], '荧光屏', 10, -10);
    },

    update: function (dt, s) {
      s.t += dt;
      var i;

      if (s.beam) {
        s._acc = (s._acc || 0) + dt;
        var iv = .07, guard = 0;
        while (s._acc > iv && guard++ < 6) { s._acc -= iv; spawnPart(s); }
      }

      for (i = s.parts.length - 1; i >= 0; i--) {
        var p = s.parts[i];
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.life -= dt;
        if (!p.defl && p.x >= 0) { p.defl = true; p.vx = Math.cos(p.th) * SPEED; p.vz = Math.sin(p.th) * SPEED; }
        p.sp.position.set(p.x, BY, p.z);
        var dead = false;
        if (p.defl && (p.x * p.x + p.z * p.z) >= R * R) { doFlash(s, Math.atan2(p.z, p.x)); dead = true; }
        if (p.life <= 0) dead = true;
        if (dead) { K.scene().remove(p.sp); s.parts.splice(i, 1); }
      }

      for (i = s.flashes.length - 1; i >= 0; i--) {
        var f = s.flashes[i]; f.t += dt;
        var k = f.t / f.life;
        f.core.scale.setScalar(2.0 + k * 1.8);
        f.core.material.opacity = Math.max(0, 1 - k * 1.15);
        f.shell.scale.setScalar(2.5 + k * 5.0);
        f.shell.material.opacity = Math.max(0, .4 * (1 - k));
        if (k >= 1) { K.scene().remove(f.core); K.scene().remove(f.shell); s.flashes.splice(i, 1); }
      }

      O.nucleus.visible = !!s.showNucleus;
      for (i = 0; i < O.elecs.length; i++) {
        var e = O.elecs[i];
        e.mesh.visible = !!s.showElectrons;
        if (s.showElectrons) {
          var a = s.t * e.spd + e.ph;
          e.mesh.position.set(Math.cos(a) * e.rad, BY, Math.sin(a) * e.rad);
        }
      }
    }
  };

  K.boot({
    title: 'α 粒子轰击金箔实验',
    chip: '化学 · 九上 · 第三单元 物质构成的奥秘 · 课题2 原子的结构',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    postfx: true,
    cam: { ty: 1.4, dist: 27, tx: 1, tz: 0, yaw: .12, pitch: .44 },

    reads: [['a', '直线穿过'], ['b', '明显偏转'], ['c', '反向弹回']],
    values: function (s) {
      if (!s.beam) return { a: '—', b: '—', c: '—' };
      if (s.mode === 'predict') return { a: '几乎所有', b: '几乎没有', c: '未观察到' };
      if (s.mode === 'deflect') return { a: '大多数', b: '少数可见', c: '未观察到' };
      if (s.mode === 'back') return { a: '大多数', b: '少数', c: '极少数可观察' };
      return { a: '绝大多数', b: '少数', c: '约 1/8000' };
    },

    steps: [
      {
        name: '认识装置', title: '一把「看不见的子弹」',
        ask: '凭什么能「看见」原子内部？',
        body: '<p><b>α 粒子是什么：</b>放射性物质（如镭）会放出 α 粒子，它就是<b>氦原子核</b>（He²⁺），带 2 个单位正电荷，质量约是氢原子的 4 倍，速度可达光速的 1/10。</p>' +
          '<p><b>三件装备：</b>① <b>α 粒子源</b>——封在铅盒里，只留一个小孔，射出一束细窄的 α 粒子流；② <b>金箔</b>——很薄，薄到只有几千层原子；③ <b>荧光屏</b>（ZnS）——α 粒子打上去会闪一下光，用它把「看不见的粒子」变成「看得见的闪光」。</p>' +
          '<p><b>思路：</b>用 α 粒子当「探针」去轰击金原子，看它们<b>飞向哪里</b>，就能反推原子内部长什么样。</p>',
        apply: function (s) { reset(s, { beam: false }); }
      },
      {
        name: '模型的预言', title: '按理，它们应该都直着穿过去',
        ask: '如果原子像一块「葡萄干布丁」……',
        body: '<p><b>当时的模型（汤姆孙）：</b>原子是一个均匀带正电的球，电子像葡萄干一样嵌在里面——正电荷<b>摊开分布</b>在整个原子里。</p>' +
          '<p><b>照此推理：</b>α 粒子穿过这样的原子时，受到的正电荷斥力来自四面八方、相互抵消，最多只会被推得<b>微微偏一下</b>。所以绝大多数 α 粒子应当<b>笔直地穿过去</b>。</p>' +
          '<p><b>看动画：</b>若真如预言，屏上的闪光应该几乎全集中在金箔<b>正后方</b>一点。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'predict' }); }
      },
      {
        name: '意外①', title: '有些子弹，拐了弯',
        ask: '是谁把它们推偏了？',
        body: '<p><b>现象：</b>屏上除了正后方，<b>周围也出现了闪光</b>——少数 α 粒子穿过金箔后发生了<b>明显偏转</b>，路径拐了个角。</p>' +
          '<p><b>说明什么：</b>原子内部一定存在<b>集中的正电荷</b>，当 α 粒子靠近时受到很强的库仑斥力，才会被推偏。如果正电荷均匀摊开，就不会有这种「集中推力」。</p>' +
          '<p><b>提示：</b>为便于观察，动画里把偏转的粒子比例放大了，真实情况是「少数」。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'deflect' }); }
      },
      {
        name: '意外②', title: '更有被「打回来」的',
        ask: '正面撞上了什么硬东西？',
        body: '<p><b>现象：</b>极少数 α 粒子几乎被<b>原路弹回</b>（偏转角接近 180°）。卢瑟福形容这「就像用炮弹去打一张纸，炮弹却被弹了回来」。</p>' +
          '<p><b>说明什么：</b>要能把高速的 α 粒子顶回来，原子内部必定有一个<b>质量大、带正电、体积很小</b>的核心。</p>' +
          '<p><b>数量：</b>大约每 <b>8000</b> 个 α 粒子里才有 1 个被弹回。动画为便于观察放大了这个比例。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'back' }); }
      },
      {
        name: '三条结论', title: '把现象翻译成模型',
        ask: '「大多数、少数、极少数」分别说明什么？',
        body: '<p><b>① 大多数直线穿过</b> → 原子内部<b>绝大部分是空的</b>。</p>' +
          '<p><b>② 少数发生偏转</b> → 原子内部存在<b>正电荷</b>，会对 α 粒子产生排斥。</p>' +
          '<p><b>③ 极少数大角度弹回</b> → 正电荷和质量<b>集中在一个极小的核</b>上。</p>' +
          '<p><b>合起来：</b>原子 = 中心一个很小、很重、带正电的<b>核</b> + 核外广阔空间里的电子。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'most' }); }
      },
      {
        name: '原子核', title: '核，小得难以置信',
        ask: '核到底有多小？',
        body: '<p><b>尺度：</b>原子直径约 <b>10⁻¹⁰ m</b>，原子核直径约 <b>10⁻¹⁵ m</b>，两者相差<b>十万倍</b>。</p>' +
          '<p><b>打个比方：</b>若把原子放大到一座<b>操场</b>那么大，原子核大约只有一只<b>蚂蚁</b>那么大——原子内部几乎全是空的。</p>' +
          '<p><b>质量：</b>原子的质量几乎全部集中在原子核上，电子的质量小到可以忽略。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'most', nuc: true }); }
      },
      {
        name: '核式结构', title: '卢瑟福的原子',
        ask: '电子在哪里？',
        body: '<p><b>核式结构模型：</b>原子中心是带正电的<b>原子核</b>（集中了几乎全部质量），<b>电子</b>在核外空间绕核运动；原子核与电子之间是广阔的「空」。</p>' +
          '<p><b>与旧模型的区别：</b>汤姆孙把正电荷摊满整个原子；卢瑟福把它<b>收缩到中心的核里</b>，这正是 α 散射实验逼出来的结论。</p>' +
          '<p><b>易错点：</b>就本实验而言，能确定的只是「有一个很小、很重、带正电的核」；「核由质子中子组成」是后来才完善的。</p>',
        apply: function (s) { reset(s, { beam: true, mode: 'most', nuc: true, elec: true }); }
      },
      {
        name: '考核', title: '当一回卢瑟福',
        ask: '下面每题都考这个实验。',
        quiz: true,
        apply: function (s) { reset(s, { beam: true, mode: 'most' }); }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: 'α 粒子轰击金箔实验中，绝大多数 α 粒子穿过金箔后：',
          opts: ['运动方向几乎不变', '被弹回原处', '发生大角度偏转', '被金箔吸收'],
          ans: '运动方向几乎不变',
          why: '原子内部绝大部分是空的，α 粒子几乎不受阻挡，所以绝大多数沿原方向直线穿过。'
        },
        {
          q: '少数 α 粒子发生明显偏转，说明原子内部存在：',
          opts: ['集中的正电荷', '均匀分布的正电荷', '不带电的空腔', '大量电子'],
          ans: '集中的正电荷',
          why: '均匀分布的正电荷斥力会相互抵消；只有正电荷集中，才会对靠近的 α 粒子产生明显排斥使其偏转。'
        },
        {
          q: '极少数 α 粒子被弹回，最合理的解释是：',
          opts: ['它们正面撞上了质量大、体积小、带正电的核', '金箔太厚挡住了它们', '它们与电子发生了碰撞', '它们自己发生了衰变'],
          ans: '它们正面撞上了质量大、体积小、带正电的核',
          why: '只有质量大、带正电且集中的核心，才能把高速 α 粒子几乎原路弹回；电子质量太小，挡不住 α 粒子。'
        },
        {
          q: '下列关于原子核式结构的说法，正确的是：',
          opts: ['原子核很小，却集中了原子的几乎全部质量', '正电荷均匀分布在整个原子中', '电子位于原子核内部', '原子内部是实心的'],
          ans: '原子核很小，却集中了原子的几乎全部质量',
          why: 'α 散射实验表明：核极小、很重、带正电，核外是广阔空间，电子在核外运动。'
        },
        {
          q: '卢瑟福提出核式结构模型，主要的实验依据是：',
          opts: ['α 粒子散射实验的现象', '电解水的实验', '测定空气成分的实验', '燃烧条件的实验'],
          ans: 'α 粒子散射实验的现象',
          why: '正是「大多数直穿、少数偏转、极少数弹回」这一散射现象，推翻了「葡萄干布丁」模型，建立了核式结构模型。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
