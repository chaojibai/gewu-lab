/* 格物实验室 · 氯化钠的形成（钠在氯气中燃烧 → 离子键 → 离子晶体）
   鲁教版九年级上册 · 第二单元 水和溶液 · 第三节 原子的结构
   主线：宏观燃烧（黄焰、白烟）→ 两种原子 → 失/得电子 → 阴、阳离子
        → 静电作用（离子化合物，整体电中性）→ 晶体 → 溶解导电 */
(function () {
  var T = window.THREE, K = window.Lab;

  /* ---------------- 尺度常量 ---------------- */
  var R1 = 1.30, R2 = 1.95, R3 = 2.60;      /* 三层电子层半径 */
  var E1 = .155, E2 = .195, E3 = .285;         /* 各层电子小球半径 */
  var AY = 5.35;                            /* 原子中心高度 */
  var FAR = 3.80, PAIR = 2.36;             /* 分居 / 成对时的横坐标 */
  var JARX = -9.6, ATX = 0.0, ATOMS = .62, JARS = .85;  /* 罐子位置、原子区中心、原子整体缩放 */
  var HOVER = new T.Vector3(ATX, 7.85, 0);    /* 电子悬停点：压低到原子正上方，近机位也进画面 */
  var LAT = 5.1, LATY = 6.62;               /* 晶格常数、晶体中心高度 */
  var D2R = Math.PI / 180;

  var st = {
    step: 0, t: 0, stepT: 0, fly: null, hover: false, naLost: false,
    latRot: 0, camT: 0, camWant: null, smokeAcc: 0, smoke: [],
    bridge: 0, cfg: 0, transfer: 0, neutral: 0,
    showVign: 0, vignA: 0, showBridge: 0, showCfg: 0, showTransfer: 0, showNeutral: 0
  };

  /* V = 当前显示值，TG = 目标值 */
  var V = { atomA: 0, atomB: 0, macro: 0, burn: 0, smoke: 0, lattice: 0, lines: 0, dissolve: 0, pair: 0, qNa: 0, qCl: 0, grain: 0 };
  var TG = { atomA: 0, atomB: 0, macro: 0, burn: 0, smoke: 0, lattice: 0, lines: 0, dissolve: 0, pair: 0, qNa: 0, qCl: 0, grain: 0 };

  var O = {};
  var root = null;

  /* ---------------- 贴图工具 ---------------- */
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

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
      d[o] = (nx / L * .5 + .5) * 255; d[o + 1] = (ny / L * .5 + .5) * 255;
      d[o + 2] = (nz / L * .5 + .5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep); t.encoding = T.LinearEncoding; return t;
  }

  var DOT_TEX = null;
  function dotTex() {
    if (DOT_TEX) return DOT_TEX;
    DOT_TEX = canvasTex(64, 64, function (x, w) {
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 31);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(.25, 'rgba(255,255,255,.94)');
      g.addColorStop(.55, 'rgba(246,250,255,.42)');
      g.addColorStop(1, 'rgba(226,238,250,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
    DOT_TEX.encoding = T.sRGBEncoding;
    return DOT_TEX;
  }

  var HOLE_TEX = null;
  function holeTex() {
    if (HOLE_TEX) return HOLE_TEX;
    HOLE_TEX = canvasTex(128, 128, function (x) {
      x.clearRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(112,178,120,.95)';
      x.lineWidth = 5; x.setLineDash([8, 9]);
      x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke();
      x.setLineDash([]);
      x.fillStyle = 'rgba(150,205,150,.14)';
      x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.fill();
    });
    HOLE_TEX.encoding = T.sRGBEncoding;
    return HOLE_TEX;
  }

  function badgeTex(sign) {
    return canvasTex(128, 128, function (x) {
      var g = x.createRadialGradient(52, 46, 6, 64, 64, 62);
      if (sign > 0) { g.addColorStop(0, '#ffc09c'); g.addColorStop(.55, '#dd5c34'); g.addColorStop(1, '#9c3416'); }
      else { g.addColorStop(0, '#c2eca0'); g.addColorStop(.55, '#5d9c36'); g.addColorStop(1, '#2d6318'); }
      x.fillStyle = g;
      x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 6;
      x.beginPath(); x.arc(64, 64, 55, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = '#ffffff'; x.lineWidth = 14; x.lineCap = 'round';
      x.beginPath(); x.moveTo(36, 64); x.lineTo(92, 64); x.stroke();
      if (sign > 0) { x.beginPath(); x.moveTo(64, 36); x.lineTo(64, 92); x.stroke(); }
    });
  }

  /* ---------------- 原子模型 ---------------- */
  var LAYER_ANG = {
    na: [[0, 180], [0, 45, 90, 135, 180, 225, 270, 315], [0]],
    cl: [[0, 180], [0, 45, 90, 135, 180, 225, 270, 315], [0, 45, 90, 135, 225, 270, 315]]
  };
  var LAYER_TILT = [
    { x: .11, z: -.05 },
    { x: -.05, z: .04 },
    { x: .07, z: -.06 }
  ];
  var LAYER_R = [R1, R2, R3];
  var LAYER_E = [E1, E2, E3];

  var SHELL_VS = [
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var SHELL_FS = [
    'varying vec3 vN; varying vec3 vV;',
    'uniform vec3 uColor; uniform float uOp;',
    'void main(){',
    '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
    '  float a = (0.075 + pow(f, 2.2) * 0.55) * uOp;',
    '  gl_FragColor = vec4(uColor, a);',
    '}'
  ].join('\n');

  function mkAtom(kind) {
    var g = new T.Group();
    var ang = LAYER_ANG[kind];
    var isNa = kind === 'na';
    var a = { grp: g, kind: kind, layers: [], core: null, halo: null, shell: null, ion: null, ringMat: [], hole: null };

    /* 原子核 */
    var coreColor = isNa ? 0xd85f38 : 0x5f9c3a;
    a.core = new T.Mesh(new T.SphereGeometry(.78, 30, 22), new T.MeshStandardMaterial({
      color: coreColor, roughness: .36, metalness: .2,
      emissive: new T.Color(coreColor).multiplyScalar(.26), envMapIntensity: 1.1
    }));
    a.core.castShadow = true;
    g.add(a.core);

    a.halo = new T.Sprite(new T.SpriteMaterial({
      map: dotTex(), color: isNa ? 0xffbb96 : 0xc0ea9a,
      transparent: true, opacity: .34, depthWrite: false, blending: T.AdditiveBlending
    }));
    a.halo.scale.setScalar(1.55);
    g.add(a.halo);

    /* 玻璃球壳：给原子"一颗球"的体积，但不挡住里面的电子层 */
    a.shell = new T.Mesh(new T.SphereGeometry(R3, 52, 34), new T.ShaderMaterial({
      uniforms: {
        uColor: { value: new T.Color(isNa ? 0xd79a70 : 0x8fb566) },
        uOp: { value: 1.0 }
      },
      vertexShader: SHELL_VS, fragmentShader: SHELL_FS,
      transparent: true, depthWrite: false, side: T.FrontSide
    }));
    a.shell.renderOrder = -2;
    /* 不加入场景：浅色背景下球壳会糊住电子层 */

    /* 三层电子层 */
    for (var l = 0; l < 3; l++) {
      var Lg = new T.Group();
      Lg.rotation.set(LAYER_TILT[l].x, 0, LAYER_TILT[l].z);
      var ringMat = new T.MeshBasicMaterial({
        color: 0x33608e, transparent: true, opacity: l === 2 ? .95 : .78, depthWrite: false
      });
      var ring = new T.Mesh(new T.TorusGeometry(LAYER_R[l], .055, 7, 128), ringMat);
      ring.rotation.x = Math.PI / 2;
      Lg.add(ring);
      a.ringMat.push(ringMat);

      var eMat = new T.MeshStandardMaterial({
        color: 0x2f74c8, roughness: .2, metalness: .3,
        emissive: new T.Color(0x2160b0).multiplyScalar(.85), envMapIntensity: 1.6
      });
      var list = [], angles = ang[l].slice();
      for (var i = 0; i < angles.length; i++) {
        var em = new T.Mesh(new T.SphereGeometry(LAYER_E[l], 14, 10), eMat);
        em.castShadow = false;
        Lg.add(em);
        list.push(em);
      }
      /* 氯的最外层留一个待补位（180°，朝钠的一侧） */
      if (kind === 'cl' && l === 2) {
        angles.push(180);
        var pend = new T.Mesh(new T.SphereGeometry(LAYER_E[l], 14, 10), eMat);
        pend.userData.pend = true;
        pend.scale.setScalar(.001);
        Lg.add(pend);
        list.push(pend);
      }
      g.add(Lg);
      a.layers.push({ grp: Lg, r: LAYER_R[l], angles: angles, electrons: list, mat: ringMat });
    }

    /* 离子实心球（半透明，长出来时仍能看见里面的电子层） */
    var ionColor = isNa ? 0xe8734a : 0x6fae44;
    a.ion = new T.Mesh(new T.SphereGeometry(1, 40, 28), new T.MeshPhysicalMaterial({
      color: ionColor, roughness: .30, metalness: .05,
      clearcoat: .6, clearcoatRoughness: .25, envMapIntensity: 1.2,
      transparent: true, opacity: .42, depthWrite: false,
      emissive: new T.Color(ionColor).multiplyScalar(.10)
    }));
    a.ion.castShadow = false;
    a.ion.scale.setScalar(.001);
    a.ion.renderOrder = 3;
    g.add(a.ion);
    a.ionR = isNa ? 1.40 : 2.50;

    if (!isNa) {
      a.hole = new T.Sprite(new T.SpriteMaterial({
        map: holeTex(), transparent: true, opacity: 0, depthWrite: false
      }));
      var ha = 180 * D2R;
      a.hole.position.set(Math.cos(ha) * R3, 0, Math.sin(ha) * R3);
      a.hole.scale.setScalar(1.15);
      g.add(a.hole);
    }

    a.badge = new T.Sprite(new T.SpriteMaterial({
      map: badgeTex(isNa ? 1 : -1), transparent: true, opacity: 0,
      depthWrite: false, depthTest: false
    }));
    a.badge.scale.setScalar(1.05);
    a.badge.renderOrder = 20;
    g.add(a.badge);

    /* 让电子层平面大致朝向常规视角，三层才数得清 */
    g.rotation.x = .36;

    return a;
  }

  function setAtomLook(a, q) {
    var k = q * q * (3 - 2 * q);
    a.core.scale.setScalar(Math.max(.001, 1 - q * .99));
    a.halo.material.opacity = 0;
    a.halo.scale.setScalar(.001);
    if (a.shell) a.shell.visible = false;
    a.shell.scale.setScalar(a.kind === 'na' ? (1 - .25 * k) : (1 + .03 * k));

    a.ion.scale.setScalar(a.ionR * Math.max(.001, k));
    a.ion.material.opacity = .42 * k;
    a.badge.material.opacity = q > .02 ? Math.min(1, (q - .02) * 3.4) : 0;
    a.badge.scale.setScalar(.8 + .55 * q);
    a.badge.position.set(0, (a.kind === 'na' ? 1.15 : 1.55) * (0.4 + 0.6 * q), 0);

    var outerFade = 1;
    if (a.kind === 'na') outerFade = Math.max(0, 1 - q * 1.3);
    a.layers[2].mat.opacity = (a.kind === 'na' ? .62 : .62) * outerFade;
    for (var i = 0; i < a.layers[2].electrons.length; i++) {
      var e = a.layers[2].electrons[i];
      var sc = e.userData.pend ? q : outerFade;
      e.visible = sc > .02;
      e.scale.setScalar(Math.max(.001, sc));
    }
    /* 内两层不随离子化淡出：Na⁺ 仍要清楚数出 2、8 两层共 10 个电子 */
    a.layers[0].mat.opacity = .84;
    a.layers[1].mat.opacity = .80;
    for (var ii = 0; ii < a.layers[0].electrons.length; ii++) {
      a.layers[0].electrons[ii].visible = true;
      a.layers[0].electrons[ii].scale.setScalar(1);
    }
    for (var jj = 0; jj < a.layers[1].electrons.length; jj++) {
      a.layers[1].electrons[jj].visible = true;
      a.layers[1].electrons[jj].scale.setScalar(1);
    }
  }

  function updateElectrons(a, t) {
    for (var l = 0; l < a.layers.length; l++) {
      var Ly = a.layers[l];
      for (var i = 0; i < Ly.electrons.length; i++) {
        var e = Ly.electrons[i];
        if (!e.visible) continue;
        var th = Ly.angles[i] * D2R + Math.sin(t * .6 + i * 1.7 + l * 2.1) * .045;
        e.position.set(Math.cos(th) * Ly.r, Math.sin(t * 1.2 + i) * .012, Math.sin(th) * Ly.r);
      }
    }
  }

  /* ---------------- 力线 ---------------- */
  function mkForceLines() {
    var g = new T.Group();
    var mat = new T.MeshBasicMaterial({ color: 0x3f86d8, transparent: true, opacity: 0, depthWrite: false });
    var matHot = new T.MeshBasicMaterial({ color: 0x9ccdff, transparent: true, opacity: 0, depthWrite: false });
    var curves = [];
    /* 起点、终点分别贴着 Na⁺ 与 Cl⁻ 的真实表面，弧线不再悬在半空：
       Na⁺ 中心 -PAIR、半径 1.4×ATOMS；Cl⁻ 中心 +PAIR、半径 2.5×ATOMS */
    var x0 = -PAIR + 1.4 * ATOMS + .06;
    var x1 = PAIR - 2.5 * ATOMS - .06;
    var mid = (x0 + x1) * .5;
    for (var i = -1; i <= 1; i++) {
      var cv = new T.QuadraticBezierCurve3(
        new T.Vector3(x0, i * .34, i * .55),
        new T.Vector3(mid, .95 + Math.abs(i) * .16, i * .95),
        new T.Vector3(x1, i * .34, i * .55)
      );
      curves.push(cv);
      g.add(new T.Mesh(new T.TubeGeometry(cv, 30, .058, 6, false), mat));
    }
    var dots = [], dgeo = new T.SphereGeometry(.16, 10, 8);
    for (var c = 0; c < curves.length; c++) {
      for (var dd = 0; dd < 2; dd++) {
        var s = new T.Mesh(dgeo, matHot);
        g.add(s);
        dots.push({ m: s, cv: curves[c], ph: Math.random(), dir: dd ? -1 : 1 });
      }
    }
    return { grp: g, mat: mat, matHot: matHot, dots: dots };
  }

  /* ---------------- 钠在氯气中燃烧 ---------------- */
  /* 火焰贴图：水滴形，内白外黄再外橙 */
  var FIRE_TEX = null;
  function fireTex() {
    if (FIRE_TEX) return FIRE_TEX;
    FIRE_TEX = canvasTex(160, 320, function (x, w, h) {
      var g = x.createRadialGradient(w * .5, h * .74, 2, w * .5, h * .70, h * .46);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(.16, 'rgba(255,248,196,.99)');
      g.addColorStop(.38, 'rgba(255,220,96,.92)');
      g.addColorStop(.64, 'rgba(255,172,34,.50)');
      g.addColorStop(.86, 'rgba(255,124,12,.14)');
      g.addColorStop(1, 'rgba(255,110,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(w * .5, h * .015);
      x.bezierCurveTo(w * .80, h * .32, w * .93, h * .64, w * .5, h * .975);
      x.bezierCurveTo(w * .07, h * .64, w * .20, h * .32, w * .5, h * .015);
      x.closePath();
      x.fill();
      var g2 = x.createRadialGradient(w * .5, h * .80, 1, w * .5, h * .76, h * .24);
      g2.addColorStop(0, 'rgba(255,255,255,1)');
      g2.addColorStop(.45, 'rgba(255,252,226,.8)');
      g2.addColorStop(1, 'rgba(255,240,180,0)');
      x.fillStyle = g2;
      x.beginPath();
      x.ellipse(w * .5, h * .78, w * .18, h * .15, 0, 0, Math.PI * 2);
      x.fill();
    });
    FIRE_TEX.encoding = T.sRGBEncoding;
    return FIRE_TEX;
  }

  /* ============ 氯气：沿瓶内壁的体积感，上下自然渐隐，没有"液面" ============ */
  var GAS_VS = [
    'varying vec3 vN; varying vec3 vV; varying float vY;',
    'void main(){',
    '  vY = position.y;',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var GAS_FS = [
    'varying vec3 vN; varying vec3 vV; varying float vY;',
    'uniform float uTime; uniform float uOp; uniform vec3 uColor;',
    'void main(){',
    '  float y = vY;',
    '  /* 瓶底必须留有底色：原来 y=0 处 alpha=0，会直接透出后面的白墙，'
      + '读成一块亮白盘；给一个柔和的下限，仍保持「瓶身最浓、瓶肩散尽」的渐变 */',
    '  float base = mix(0.72, 1.0, smoothstep(.05, 1.15, y)) * (1.0 - smoothstep(6.6, 9.5, y));',
    '  float wob = sin(y * 1.35 + uTime * .22) * .055 + sin(y * 3.7 - uTime * .16) * .035;',
    '  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
    '  float a = uOp * base * (0.94 + wob) * (1.0 - fres * .14);',
    '  vec3 col = uColor * (0.94 + 0.06 * sin(y * 1.8 + uTime * .18));',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '}'
  ].join('\n');

  /* ============ 体积火焰：水滴轮廓由几何给出，噪声只管内部明暗 ============ */
  var FIRE_VS = [
    'varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vH;',
    'uniform float uTime; uniform float uSeed; uniform float uStretch;',
    'void main(){',
    '  vec3 p = position;',
    '  float h = clamp(position.y * .5 + .5, 0.0, 1.0);',
    '  vH = h;',
    '  /* 底宽顶尖的水滴，顶部不是削平而是收成火舌 */',
    '  float w = mix(1.0, .045, pow(h, 1.15));',
    '  w *= 1.0 + sin(h * 7.2 + uTime * 3.6 + uSeed) * .075 * h;',
    '  p.xz *= w;',
    '  p.y *= uStretch;',
    '  p.x += sin(h * 3.4 + uTime * (2.2 + fract(uSeed * .13)) + uSeed) * .17 * h;',
    '  p.z += cos(h * 2.9 + uTime * (1.9 + fract(uSeed * .09)) + uSeed * 1.6) * .14 * h;',
    '  vP = p;',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var FIRE_FS = [
    'varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vH;',
    'uniform float uTime; uniform float uSeed; uniform float uOp;',
    'uniform vec3 uHot; uniform vec3 uMid;',
    'void main(){',
    '  float h = vH;',
    '  /* 边缘羽化：视线穿过球心最"厚"，掠过边缘最"薄" —— 正确的体积感 */',
    '  float thick = abs(dot(normalize(vN), normalize(vV)));',
    '  float edge = pow(thick, .85);',
    '  float vert = smoothstep(.0, .10, h) * (1.0 - smoothstep(.60, 1.0, h));',
    '  /* 噪声只做内部轻微翻卷，不参与轮廓，避免尖角星芒 */',
    '  float n = sin(vP.y * 3.1 - uTime * 3.4 + uSeed) * sin(vP.x * 4.2 + uTime * 1.7) * .5 + .5;',
    '  float a = uOp * vert * edge * (0.86 + .14 * n);',
    '  /* 色温随高度：根部亮黄白，火舌转橙 */',
    '  vec3 col = mix(uHot, uMid, smoothstep(.08, .82, h + (n - .5) * .12));',
    '  col *= 1.45;',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '}'
  ].join('\n');

  function mkFlame() {
    var fg = new T.Group();
    var shells = [];
    /* 三层火焰：外层宽而淡、内层小白核；拉高、收窄，读成"火舌"而不是灯泡 */
    var defs = [
      { sx: 1.46, sy: 2.30, op: .50, seed: 2.6, hot: [1.00, .78, .26], mid: [1.00, .42, .04] },
      { sx: 1.02, sy: 1.86, op: .74, seed: 6.4, hot: [1.00, .88, .44], mid: [1.00, .58, .08] },
      { sx: .56, sy: 1.30, op: .92, seed: 11.2, hot: [1.00, .97, .76], mid: [1.00, .80, .30] }
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var mat = new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSeed: { value: d.seed }, uOp: { value: d.op },
          uStretch: { value: d.sy },
          uHot: { value: new T.Vector3(d.hot[0], d.hot[1], d.hot[2]) },
          uMid: { value: new T.Vector3(d.mid[0], d.mid[1], d.mid[2]) }
        },
        vertexShader: FIRE_VS, fragmentShader: FIRE_FS,
        transparent: true, depthWrite: false, side: T.FrontSide
      });
      var m = new T.Mesh(new T.SphereGeometry(1, 40, 28), mat);
      m.position.y = d.sy * 1.0;        /* 火焰从钠块处向上长，不把钠吞掉 */
      m.scale.set(d.sx, 1, d.sx);
      m.renderOrder = 8 + i;
      fg.add(m);
      shells.push({ mesh: m, mat: mat, base: d, ph: i * 2.1 });
    }
    var light = new T.PointLight(0xffb450, 0, 16, 2);
    light.position.y = 1.5;
    fg.add(light);

    var api = {
      grp: fg, shells: shells, light: light, level: 0,
      setLit: function (v) {
        v = Math.max(0, Math.min(1, v));
        this.level = v;
        fg.visible = v > .01;
        for (var i = 0; i < shells.length; i++) shells[i].mat.uniforms.uOp.value = shells[i].base.op * v;
        light.intensity = v * 2.6;
      },
      tick: function (t) {
        var v = this.level;
        if (v <= .01) return;
        for (var i = 0; i < shells.length; i++) {
          var S = shells[i];
          S.mat.uniforms.uTime.value = t;
          var k = 1 + Math.sin(t * 5.8 + S.ph) * .045 + Math.sin(t * 10.1 + S.ph * 1.7) * .025;
          S.mesh.scale.set(S.base.sx * k * (.86 + .14 * v), (1 + (k - 1) * .55) * (.84 + .16 * v), S.base.sx * k * (.86 + .14 * v));
          S.mesh.rotation.y = Math.sin(t * .7 + S.ph) * .13;
          S.mesh.rotation.z = Math.sin(t * 1.9 + S.ph * 1.3) * .075;
          S.mesh.position.x = Math.sin(t * 2.3 + S.ph) * .16 * S.base.sx;
          S.mesh.position.z = Math.cos(t * 1.7 + S.ph * .8) * .13 * S.base.sx;
          S.mat.uniforms.uOp.value = S.base.op * v * (.90 + .10 * Math.sin(t * 8.3 + S.ph));
        }
        light.intensity = v * (2.6 + Math.sin(t * 8.0) * .28);
      }
    };
    api.setLit(0);
    return api;
  }

  /* ============ 烟：中心浓、边缘化开的软团块（不是硬边多边形） ============ */
  var SMOKE_VS = [
    'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'void main(){',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vV = -mv.xyz; vP = position;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var SMOKE_FS = [
    'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
    'uniform float uOp; uniform float uSeed; uniform float uTime; uniform vec3 uColor;',
    'void main(){',
    '  float thick = abs(dot(normalize(vN), normalize(vV)));',
    '  float soft = pow(thick, .78);',
    '  float n = sin(vP.x * 3.3 + uSeed + uTime * .35) * sin(vP.y * 2.9 - uSeed) * .5 + .5;',
    '  float a = uOp * soft * (0.80 + .20 * n);',
    '  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));',
    '}'
  ].join('\n');

  function smokeGeo(seed) {
    var g = new T.IcosahedronGeometry(1, 2);       /* 细分 2，边缘才圆润 */
    var p = g.attributes.position;
    var v = new T.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var n = Math.sin(v.x * 2.7 + seed) * Math.cos(v.y * 2.3 - seed * .7) * Math.sin(v.z * 2.9 + seed * 1.2);
      var k = 1 + n * .18;
      p.setXYZ(i, v.x * k, v.y * k * .94, v.z * k);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  /* ---------------- 钠在氯气中燃烧 ---------------- */
  function mkBurnScene() {
    var g = new T.Group();

    /* ---- 集气瓶：磨口广口瓶，瓶肩用多段圆滑过渡 ---- */
    var pts = [
      [0, 0], [2.82, 0], [2.98, .08], [3.10, .24], [3.16, .52], [3.19, 1.10],
      [3.20, 6.60], [3.19, 7.20], [3.15, 7.62], [3.07, 7.98],
      [2.92, 8.28], [2.70, 8.52], [2.42, 8.72], [2.14, 8.86],
      [2.02, 9.02], [2.00, 9.32], [2.12, 9.46], [1.96, 9.58]
    ].map(function (p) { return new T.Vector2(p[0], p[1]); });

    /* 瓶身玻璃原来 clearcoat 1 / envMapIntensity 1.8 / roughness .035，
       瓶底转折处会把浅色环境烧成一整块刺眼白盘（与烧杯底亮白环同源）。
       照已验证的哑光配方压一档：形体仍靠轮廓与瓶口厚唇读出。 */
    var glassMat = new T.MeshPhysicalMaterial({
      color: 0xdcecf5, metalness: 0, roughness: .28,
      transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false,
      envMapIntensity: .45, clearcoat: .18, clearcoatRoughness: .28,
      specularIntensity: .45, ior: 1.5, reflectivity: .5
    });
    var jar = new T.Mesh(new T.LatheGeometry(pts, 96), glassMat);
    g.add(jar);

    /* 瓶口厚唇：玻璃最容易辨认的地方 */
    var lip = new T.Mesh(new T.TorusGeometry(2.00, .095, 14, 72), new T.MeshPhysicalMaterial({
      color: 0xf0fbff, roughness: .05, metalness: 0, transparent: true, opacity: .72,
      clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2.8
    }));
    lip.rotation.x = Math.PI / 2; lip.position.y = 9.46;
    g.add(lip);
    /* 瓶口橡皮塞：燃烧匙从塞子中心的孔穿出。没有塞子，广口瓶敞着口灌满氯气
       是不成立的；有了塞子，勺子杆也才有"插在哪儿"的交代。 */
    var stopper = new T.Mesh(new T.CylinderGeometry(2.08, 1.80, .80, 48), new T.MeshStandardMaterial({
      color: 0x4a5057, roughness: .88, metalness: 0, envMapIntensity: .5
    }));
    stopper.position.y = 9.62;   /* 下段 1.80 塞进瓶口(内径≈1.9)，上沿 2.08 卡在磨口上 */
    g.add(stopper);
    var stopperTop = new T.Mesh(new T.CylinderGeometry(2.08, 2.08, .05, 48), new T.MeshStandardMaterial({
      color: 0x555c64, roughness: .82, metalness: 0
    }));
    stopperTop.position.y = 10.02;
    g.add(stopperTop);
    /* 塞子下沿与瓶口之间的磨砂颈 */
    var neck = new T.Mesh(new T.CylinderGeometry(2.005, 2.005, .30, 64, 1, true), new T.MeshPhysicalMaterial({
      color: 0xdceef8, roughness: .30, metalness: 0, transparent: true, opacity: .34,
      side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.6
    }));
    neck.position.y = 9.17;
    g.add(neck);

    /* 瓶底厚玻璃：只留一圈"厚边"，不做封顶圆盘 —— 圆盘正对主光会曝成一整块白，
       把瓶底沉积的白色氯化钠也一起吃掉。开口圆筒仍能读出玻璃厚度。 */
    var foot = new T.Mesh(new T.CylinderGeometry(2.98, 2.86, .22, 72, 1, true), new T.MeshPhysicalMaterial({
      color: 0x607681, roughness: .38, metalness: 0, transparent: true, opacity: .18,
      clearcoat: .18, clearcoatRoughness: .30, envMapIntensity: .35, side: T.DoubleSide
    }));
    foot.position.y = .11;
    g.add(foot);

    /* 瓶内底面：不加封顶圆盘（正对主光会曝成白盘，还会吃掉瓶底的氯化钠）。
       深色实验垫已去掉，现在透上来的是深绿台面 + 染深后的柔和接触阴影。 */

    /* ---- 氯气：只画远侧内壁（BackSide），一层染色就够，不会因前后叠加发浑 ---- */
    var gasPts = pts.map(function (v) { return new T.Vector2(Math.max(0, v.x - .085), v.y); });
    var gasMat = new T.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOp: { value: .60 },
        uColor: { value: new T.Color(0xa8c832) }
      },
      vertexShader: GAS_VS, fragmentShader: GAS_FS,
      transparent: true, depthWrite: false, side: T.BackSide
    });
    var gas = new T.Mesh(new T.LatheGeometry(gasPts, 72), gasMat);
    gas.renderOrder = 2;
    g.add(gas);

    /* ---- 燃烧匙：整组上移到瓶中部，钠块要露在火焰下方 ---- */
    var steel = new T.MeshStandardMaterial({ color: 0xc9d2da, roughness: .24, metalness: .95, envMapIntensity: 1.7 });
    var SPOON_Y = 4.55;
    var rod = new T.Mesh(new T.CylinderGeometry(.075, .075, 6.0, 16), steel);
    rod.position.set(0, 7.45, 0); rod.rotation.z = 0;
    g.add(rod);
    var handle = new T.Mesh(new T.TorusGeometry(.40, .07, 10, 28), steel);
    handle.position.set(0, 10.52, 0); handle.rotation.y = Math.PI / 2;
    g.add(handle);

    var spoon = new T.Mesh(new T.SphereGeometry(.70, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    spoon.rotation.x = Math.PI;
    spoon.position.set(0, SPOON_Y, 0);
    spoon.material = steel.clone(); spoon.material.side = T.DoubleSide;
    g.add(spoon);
    var spoonRim = new T.Mesh(new T.TorusGeometry(.685, .045, 8, 32), steel);
    spoonRim.rotation.x = Math.PI / 2; spoonRim.position.set(0, SPOON_Y, 0);
    g.add(spoonRim);

    /* ---- 钠块：新切开的银白金属。环境反射压一档、底色压深，
       否则整块金属会被浅色环境反射成"白塑料" ---- */
    var naMat = new T.MeshPhysicalMaterial({
      color: 0x8f9dab, roughness: .30, metalness: 1.0, envMapIntensity: 1.15,
      clearcoat: .18, clearcoatRoughness: .28
    });
    var na = new T.Mesh(K.geoRoundBox(1.18, .70, 1.02, .13, 3), naMat);
    na.position.set(0, SPOON_Y + .38, .34);
    na.rotation.y = .22;
    g.add(na);

    /* ---- 瓶底氯化钠固体：不是规整白盘，是一小堆不规则白色颗粒 ---- */
    var depMat = new T.MeshStandardMaterial({
      color: 0xb8c6cf, roughness: .92, metalness: 0, transparent: true, opacity: 0
    });
    /* NaCl 是立方晶体，但瓶底落的是烟里凝出来的微晶——细、薄、成片，
       不是十几个白砂糖块。压扁 + 缩小 + 加数量，才像一层沉积。 */
    var deposit = new T.Group();
    for (var li = 0; li < 42; li++) {
      var sz = K.rnd(.10, .20);
      var lm = new T.Mesh(K.geoRoundBox(sz, sz * .55, sz, .01, 1), depMat);
      var rr = Math.sqrt(Math.random()) * 1.95, th = Math.random() * 6.28;
      lm.position.set(Math.cos(th) * rr, .245 + K.rnd(0, .05), Math.sin(th) * rr);
      lm.rotation.set(K.rnd(-.14, .14), Math.random() * 6.28, K.rnd(-.14, .14));
      deposit.add(lm);
    }
    g.add(deposit);

    /* ---- 体积火焰：从钠块表面向上燃起 ---- */
    var flame = mkFlame();
    flame.grp.position.set(0, SPOON_Y + .32, 0);
    g.add(flame.grp);

    /* ---- 白烟中的氯化钠微晶：颗粒要小、要少，"像烟里的晶种"，不能像下雪 ---- */
    var specMat = new T.MeshStandardMaterial({
      color: 0xe4ecf3, roughness: .82, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false,
      emissive: new T.Color(0x8e9dab), emissiveIntensity: .10
    });
    var specGeo = K.geoRoundBox(.17, .17, .17, .03, 1);
    var specks = [];
    for (var si = 0; si < 20; si++) {
      var sm = new T.Mesh(specGeo, specMat);
      var rr = K.rnd(.30, 1.35), th = Math.random() * 6.28;
      var yy = K.rnd(6.2, 8.7);
      sm.position.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
      sm.scale.setScalar(K.rnd(.42, .82));
      sm.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      sm.renderOrder = 7;
      g.add(sm);
      specks.push({ m: sm, y0: yy, ph: Math.random() * 6.28, spd: K.rnd(.18, .52) });
    }

    /* ---- 烟：三维软团块池 ---- */
    var smoke = [];
    for (var i = 0; i < 46; i++) {
      var mat = new T.ShaderMaterial({
        uniforms: {
          uOp: { value: 0 }, uSeed: { value: 1.3 + i * .77 }, uTime: { value: 0 },
          uColor: { value: new T.Color(0xe4ebf2) }
        },
        vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS,
        transparent: true, depthWrite: false, side: T.FrontSide
      });
      var mesh = new T.Mesh(smokeGeo(1.3 + i * .77), mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      g.add(mesh);
      smoke.push({
        mesh: mesh, mat: mat, alive: false,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, max: 3, s: 1, rot: 0, spin: 0, axis: new T.Vector3(0, 1, 0)
      });
    }

    /* 瓶底接触阴影：K.blob 默认是白色贴图，原来靠深色垫板压住；
       垫板去掉后它会透过瓶底玻璃亮成一整块白盘。染成深绿黑并压透明度，
       只留一点柔和接地感。 */
    var blob = K.blob({ x: JARX, z: 0, y: .03, r: 3.6 });
    blob.material.color.setHex(0x16231d);
    blob.material.opacity = .22;

    return { grp: g, flame: flame, na: na, smoke: smoke, gasMat: gasMat, depMat: depMat, specMat: specMat, specks: specks };
  }

  function mkGrainCrystal() {
    var g = new T.Group();
    g.position.set(-6.8, 1.45, 1.6);
    var saltMat = new T.MeshPhysicalMaterial({
      color: 0xeaf3f9, roughness: .22, metalness: 0,
      clearcoat: .95, clearcoatRoughness: .10, envMapIntensity: 1.7,
      transparent: true, opacity: .92
    });
    var body = new T.Mesh(K.geoRoundBox(2.6, 2.6, 2.6, .1, 2), saltMat);
    body.castShadow = true;
    g.add(body);
    var edges = new T.LineSegments(
      new T.EdgesGeometry(new T.BoxGeometry(2.6, 2.6, 2.6)),
      new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5 })
    );
    g.add(edges);
    var smalls = [[-2.0, -.5, 1.4, 1.5, .5], [1.9, -.65, -1.5, 1.2, -.8], [-1.4, -.7, -2.0, 1.0, 1.2]];
    for (var i = 0; i < smalls.length; i++) {
      var s = smalls[i];
      var m = new T.Mesh(K.geoRoundBox(s[3], s[3], s[3], .08, 2), saltMat);
      m.position.set(s[0], s[1], s[2]);
      m.rotation.y = s[4];
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  /* ============ 教学可视化：把「原理」画出来，而不只是摆物体 ============ */
  /* 虚线弧：沿二次贝塞尔铺一串小珠，末端一个箭头，整体可调透明度 */
  function mkArc(p0, pc, p1, n, color, r, withArrow) {
    var grp = new T.Group();
    var mat = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0, depthWrite: false });
    var g = new T.SphereGeometry(r, 10, 8);
    var cv = new T.QuadraticBezierCurve3(p0, pc, p1);
    for (var i = 0; i < n; i++) {
      var m = new T.Mesh(g, mat);
      m.position.copy(cv.getPoint(i / (n - 1)));
      grp.add(m);
    }
    var arrow = null;
    if (withArrow) {
      arrow = new T.Mesh(new T.ConeGeometry(r * 2.6, r * 6.5, 10), mat);
      var tan = cv.getTangent(1).normalize();
      arrow.position.copy(p1);
      arrow.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tan);
      grp.add(arrow);
    }
    return { grp: grp, mat: mat, arrow: arrow };
  }

  function label(text, pos, w, fs, bg, color) {
    var l = K.spriteLabel(pos, text, { w: w, fs: fs, bg: bg, color: color });
    l.sprite.material.opacity = 0;
    return l;
  }

  /* ---------------- 离子晶体 ---------------- */
  /* 3×3×3 的 NaCl 点阵：格点按 (i+j+k) 的奇偶性交替 —— 沿 x、y、z 任一方向
     走一格，奇偶性必翻转，所以任何相邻格点都是"一钠一氯"，不会同种离子相邻。
     键线只在这些真实相邻格点之间连线，全部落在晶体内部。 */
  function mkLattice() {
    var g = new T.Group();
    g.position.set(ATX, LATY, 0);
    var gS = new T.SphereGeometry(1, 28, 20);
    var rNa = 1.45, rCl = 1.75;           /* 球棍模型：球大一些，离子堆成"晶体"而不是散开的球 */
    /* 按深度分三层材质：越靠后的层越压暗一点，透视里露出的后层一眼能看出"在后边"，
       不会和前排同色离子混成"相邻"。 */
    var matNa = [], matCl = [];
    for (var mi = 0; mi < 3; mi++) {
      var dim = mi === 2 ? 0 : (mi === 1 ? .18 : .32);
      var baseNa = new T.Color(0xe0663a).lerp(new T.Color(0x3a3f42), dim);
      var baseCl = new T.Color(0x5a9e46).lerp(new T.Color(0x3a3f42), dim);
      matNa.push(new T.MeshStandardMaterial({
        color: baseNa, roughness: .70, metalness: .02, envMapIntensity: .30,
        emissive: baseNa.clone().multiplyScalar(.06)
      }));
      matCl.push(new T.MeshStandardMaterial({
        color: baseCl, roughness: .70, metalness: .02, envMapIntensity: .30,
        emissive: baseCl.clone().multiplyScalar(.06)
      }));
    }
    var items = [], maxD = 1;
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) {
      var isNa = ((i + j + k) % 2) === 0;
      var m = new T.Mesh(gS, isNa ? matNa[k] : matCl[k]);
      var p = new T.Vector3((i - 1) * LAT, (j - 1) * LAT, (k - 1) * LAT);
      m.position.copy(p);
      m.castShadow = false;
      m.userData.base = p.clone();
      m.userData.r = isNa ? rNa : rCl;
      /* 溶解时沿"由晶体中心向外"的方向散开，保持离子间的相对次序 */
      var radial = p.clone();
      if (radial.length() < .01) radial.set(K.rnd(-1, 1), K.rnd(-.4, 1), K.rnd(-1, 1));
      m.userData.dir = radial.normalize();
      m.userData.d = p.length();
      if (p.length() > maxD) maxD = p.length();
      m.scale.setScalar(.001);
      g.add(m);
      items.push(m);
    }

    /* 键线：细圆柱代替 1px 线 —— 细线在浅色墙前几乎看不见，晶体就散成一团球。
       圆柱只连真实相邻（相差一格）的离子；颜色低对比、半径很细，不抢离子。 */
    var bondMat = new T.MeshBasicMaterial({
      color: 0x9db0bc, transparent: true, opacity: .55, depthWrite: false
    });
    var cylGeo = new T.CylinderGeometry(1, 1, 1, 7, 1, true);
    var upV = new T.Vector3(0, 1, 0), dirV = new T.Vector3(), qV = new T.Quaternion();
    function addBond(ax, ay, az, bx, by, bz) {
      var bm = new T.Mesh(cylGeo, bondMat);
      bm.position.set((ax + bx) * .5, (ay + by) * .5, (az + bz) * .5);
      dirV.set(bx - ax, by - ay, bz - az);
      var len = dirV.length();
      bm.scale.set(.050, len, .050);
      qV.setFromUnitVectors(upV, dirV.normalize());
      bm.quaternion.copy(qV);
      bm.renderOrder = 1;
      bonds.add(bm);
    }
    var bonds = new T.Group();
    for (var bi = 0; bi < 3; bi++) for (var bj = 0; bj < 3; bj++) for (var bk = 0; bk < 3; bk++) {
      var P = new T.Vector3((bi - 1) * LAT, (bj - 1) * LAT, (bk - 1) * LAT);
      if (bi < 2) addBond(P.x, P.y, P.z, P.x + LAT, P.y, P.z);
      if (bj < 2) addBond(P.x, P.y, P.z, P.x, P.y + LAT, P.z);
      if (bk < 2) addBond(P.x, P.y, P.z, P.x, P.y, P.z + LAT);
    }
    g.add(bonds);

    /* 晶胞外框：画在最外层离子"表面"之外，才读得出一整个立方体；
       若穿过最外层离子球心，线会被球吞掉，只剩碎片。低对比，不抢离子。 */
    var cellMat = new T.LineBasicMaterial({
      color: 0x5e7385, transparent: true, opacity: .42, depthWrite: false
    });
    var cell = new T.LineSegments(
      new T.EdgesGeometry(new T.BoxGeometry(LAT * 2 + 3.8, LAT * 2 + 3.8, LAT * 2 + 3.8)), cellMat);
    g.add(cell);

    return { grp: g, items: items, maxD: maxD, bonds: bonds, bondMat: bondMat, cellMat: cellMat };
  }

  /* ---------------- 缓动 ---------------- */
  function ez(v, target, dt, sp) {
    return v + (target - v) * Math.min(1, dt * (sp || 4.2));
  }

  function prepareFly(F) {
    if (F.kind === 'out') {
      var p0 = O.atomA.layers[2].electrons[0].getWorldPosition(new T.Vector3());
      F.from = p0.clone();
      F.ctrl = new T.Vector3(-2.6, 10.4, 0);
      F.to = HOVER.clone();
      st.naLost = true;
    } else {
      var ang = 180 * D2R;
      var p1 = O.atomB.layers[2].grp.localToWorld(new T.Vector3(Math.cos(ang) * R3, 0, Math.sin(ang) * R3));
      F.from = HOVER.clone();
      F.ctrl = new T.Vector3(2.6, 9.6, 0);
      F.to = p1;
    }
    O.flyE.position.copy(F.from);
    O.flyGlow.position.copy(F.from);
    O.flyGlow.material.opacity = .9;
    F.ready = true;
  }

  function startFly(kind, delay) {
    st.fly = { kind: kind, t: 0, dur: kind === 'out' ? 1.2 : 1.05, delay: delay || 0, ready: false };
    O.flyE.visible = false;
    O.flyGlow.material.opacity = 0;
    O.labE.sprite.material.opacity = 0;
  }

  /* ---------------- 场景 ---------------- */
  var scene = {
    setup: function () {
      root = new T.Group();
      K.scene().add(root);

      /* 关掉 SSAO 后全局光偏亮，本课件单独收一档，恢复明暗层次 */
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .60;
        else if (o.isDirectionalLight) o.intensity *= .72;
      });
      /* 远景里桌腿与地面原来糊成一片白、整张桌子像悬浮：默认场景的
         浅墙 + 亮地面在本课单独压一档（只改本课实例，不动引擎共享材质）。 */
      K.scene().traverse(function (o) {
        if (!o.isMesh || !o.geometry || !o.material) return;
        var g = o.geometry;
        if (g.type === 'CircleGeometry' && o.position.y < -10) {
          o.material = o.material.clone();
          o.material.color.setHex(0x8b98a2);
          if ('envMapIntensity' in o.material) o.material.envMapIntensity = 0;
        } else if (g.type === 'PlaneGeometry' && g.parameters &&
                   Math.abs(g.parameters.width - 150) < .01) {
          o.material = o.material.clone();
          o.material.color.setHex(0xa8b4be);
        }
      });

      var epGrain = grainTex(128, .72, .24, 8);
      var mtGrain = grainTex(128, .60, .20, 10);
      var nrm = normalTex(128, 1.0, 3);

      /* ===== 学生实验桌 ===== */
      var TW = 38, TD = 12, FLOOR = -15.0, TTH = .7;
      var deckMat = new T.MeshPhysicalMaterial({
        color: 0x223630, roughness: .66, metalness: .03,
        clearcoat: .10, clearcoatRoughness: .58, envMapIntensity: .5
      });
      /* 柜体/隔板原来近白 + 高 envMapIntensity，被 scene.environment 的亮白面板
         反成一片惨白，桌腿与地面完全没有层次。按台面基准改浅灰蓝并关掉 IBL。 */
      var frameMat = new T.MeshStandardMaterial({ color: 0x8f9aa3, roughness: .62, metalness: .08, envMapIntensity: 0 });
      var shelfMat = new T.MeshStandardMaterial({ color: 0x87939d, roughness: .68, metalness: .06, envMapIntensity: 0 });
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
      var SHY = -TTH - 5.4;
      K.rbox({ x: 0, y: SHY, z: 0, sx: TW - 1.4, sy: .4, sz: TD - 1.2, r: .08, mat: shelfMat }).receiveShadow = true;
      K.rbox({ x: 0, y: SHY + .6, z: -(TD - 1.2) / 2 + .12, sx: TW - 1.5, sy: 1.2, sz: .25, r: .05, mat: shelfMat });
      [-1, 1].forEach(function (sg) {
        K.rbox({ x: sg * (TW / 4), y: SHY + .6, z: 0, sx: .25, sy: 1.2, sz: TD - 1.2, r: .04, mat: shelfMat });
      });
      [-SPX, 0, SPX].forEach(function (fx) {
        [-1, 1].forEach(function (sz) {
          K.rbox({ x: fx, y: FLOOR + .25, z: sz * (TD / 2 - .7), sx: 1.0, sy: .5, sz: 1.0, r: .1, mat: feetMat }).castShadow = true;
        });
      });

      /* 不铺深色实验垫 / 集气瓶托盘：俯视时那一整块近黑矩形（0x0d1418）
         会被读成「桌面上的黑灰阴影」，与浅灰柜体、白墙拼起来像一块脏斑。
         台面本身已是深绿 0x223630，足够托住玻璃器皿与彩色离子；
         集气瓶的接地感交给燃烧装置里的 K.blob 软阴影。 */


      /* 暗场衬底：白烟/玻璃在浅色实验室里没有对比，宏观段给瓶后压一层柔和深色。
         跟随相机做 billboard，转到任何角度都仍在瓶子正后方；微观段淡出。 */
      /* 摄影棚式深色背景布：纯色 + alphaMap 羽化边缘（不用贴图的 alpha，避免色彩空间混淆） */
      var vignAlpha = canvasTex(256, 256, function (x, w, h) {
        var gg = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .72);
        gg.addColorStop(0, '#ffffff');
        gg.addColorStop(.58, '#ffffff');
        gg.addColorStop(1, '#000000');
        x.fillStyle = gg; x.fillRect(0, 0, w, h);
      });
      O.vignMat = new T.MeshBasicMaterial({
        color: 0x2f404c, alphaMap: vignAlpha,
        transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide
      });
      O.vign = new T.Mesh(new T.PlaneGeometry(27, 24), O.vignMat);
      O.vign.frustumCulled = false;
      O.vign.position.set(JARX, 5.2, -13);
      root.add(O.vign);
      /* 这块 27×24 的暗场背景布随步骤淡入到 .58，在浅灰墙 + 窗前就是一整块
         「巨大黑块」，边界还把窗框切断。老师要求去掉：保留对象与状态计算，
         但不渲染，避免微观段再出现同样的板。 */
      O.vign.visible = false;
      st.vignX = JARX; st.vignY = 5.2;

      /* ===== 宏观：燃烧装置 ===== */
      O.burn = mkBurnScene();
      O.burn.grp.position.set(JARX, 0, 0);
      O.burn.grp.scale.setScalar(JARS);
      root.add(O.burn.grp);
      st.smoke = O.burn.smoke;
      O.grain = mkGrainCrystal();

      /* ===== 微观：两个原子 ===== */
      O.atomA = mkAtom('na');
      O.atomB = mkAtom('cl');
      O.atomA.grp.position.set(-FAR, AY, 0);
      O.atomB.grp.position.set(FAR, AY, 0);
      root.add(O.atomA.grp);
      root.add(O.atomB.grp);

      O.labNaA = K.spriteLabel([0, R3 + .78, 0], 'Na', { w: 1.55, fs: 44, parent: O.atomA.grp, bg: 'rgba(255,252,248,.95)', color: '#8a3a1e' });
      O.labClA = K.spriteLabel([0, R3 + .78, 0], 'Cl', { w: 1.55, fs: 44, parent: O.atomB.grp, bg: 'rgba(250,255,246,.95)', color: '#356018' });
      O.labNaI = K.spriteLabel([0, R3 + .78, 0], 'Na⁺', { w: 1.75, fs: 44, parent: O.atomA.grp, bg: 'rgba(255,244,238,.96)', color: '#a8401c' });
      O.labClI = K.spriteLabel([0, R3 + .78, 0], 'Cl⁻', { w: 1.75, fs: 44, parent: O.atomB.grp, bg: 'rgba(244,255,238,.96)', color: '#2f5c14' });
      O.labNaA.sprite.material.opacity = 0;
      O.labClA.sprite.material.opacity = 0;
      O.labNaI.sprite.material.opacity = 0;
      O.labClI.sprite.material.opacity = 0;

      /* ===== 飞行电子 ===== */
      O.flyE = new T.Mesh(new T.SphereGeometry(.34, 16, 12), new T.MeshStandardMaterial({
        color: 0x5aa0f0, roughness: .16, metalness: .3,
        emissive: new T.Color(0x3d84e8).multiplyScalar(2.0)
      }));
      O.flyE.visible = false;
      root.add(O.flyE);

      O.flyGlow = new T.Sprite(new T.SpriteMaterial({
        map: dotTex(), color: 0xaed6ff, transparent: true, opacity: 0,
        depthWrite: false, blending: T.AdditiveBlending
      }));
      O.flyGlow.scale.setScalar(1.9);
      root.add(O.flyGlow);

      O.labE = K.spriteLabel([0, -99, 0], 'e⁻', { w: 1.15, fs: 38, bg: 'rgba(232,244,255,.96)', color: '#1d4c86' });
      O.labE.sprite.material.opacity = 0;

      /* ===== 静电作用 ===== */
      O.lines = mkForceLines();
      O.lines.grp.position.set(ATX, AY, 0);
      root.add(O.lines.grp);

      /* ===== 教学可视化层 ===== */
      /* ① 宏观 → 微观：这粒白烟被放大了，右侧不是凭空出现的另一张图 */
      O.bridge = mkArc(
        new T.Vector3(JARX + 2.5, 7.1, .9),
        new T.Vector3(-5.6, 10.4, .5),
        new T.Vector3(-3.5, 8.7, 0), 16, 0x4a84b8, .095, true);
      root.add(O.bridge.grp);
      O.labBridge = label('把白烟里的一粒放大 10⁹ 倍', [-5.2, 10.7, 0], 7.4, 34,
        'rgba(240,248,255,.96)', '#1d4f78');

      /* ② 相对稳定结构：这才是"为什么是 1 个电子"的原理 */
      O.labStable = label('最外层达到 8 个电子 ＝ 相对稳定结构', [ATX, AY + 4.9, 0], 10.2, 38,
        'rgba(255,250,230,.97)', '#7a5210');
      O.labNaCfg = label('Na   2 · 8 · 1    多 1 个 → 易失去', [-FAR, AY - 2.75, 0], 8.0, 34,
        'rgba(255,247,242,.96)', '#8a3a1e');
      O.labClCfg = label('Cl   2 · 8 · 7    差 1 个 → 易得到', [FAR, AY - 2.75, 0], 8.0, 34,
        'rgba(245,255,240,.96)', '#356018');

      /* ③ 电子转移的因果：从 Na 最外层 → Cl 的空位（弧顶与悬停电子同高，轨迹不脱节） */
      O.transfer = mkArc(
        new T.Vector3(-FAR + 1.7, AY + 1.25, 0),
        new T.Vector3(ATX, AY + 3.65, 0),
        new T.Vector3(FAR - 1.7, AY + 1.25, 0), 22, 0x3f86d8, .095, true);
      root.add(O.transfer.grp);
      O.labTransfer = label('e⁻  从 Na 转移给 Cl', [ATX, AY + 3.85, 0], 6.6, 34,
        'rgba(232,244,255,.97)', '#1d4c86');

      /* ④ 电中性：+1 与 −1 从两侧合拢，抵消成 0（结果放到离子下方，避开顶部拥挤） */
      O.labPlus = label('Na⁺   +1', [-FAR + 1.1, AY + 3.05, 0], 3.2, 34,
        'rgba(255,240,232,.97)', '#a8401c');
      O.labMinus = label('Cl⁻   −1', [FAR - 1.1, AY + 3.05, 0], 3.2, 34,
        'rgba(238,255,232,.97)', '#2f5c14');
      O.labZero = label('(+1) + (−1) = 0   整体不显电性', [ATX, AY - 2.70, 0], 8.8, 34,
        'rgba(255,253,240,.97)', '#4a3a10');

      /* ===== 晶体 ===== */
      O.lat = mkLattice();
      root.add(O.lat.grp);
      /* 晶体悬在垫板上方：加一团很淡的接触阴影，让它"落"在台面上而不是漂浮 */
      O.latGround = K.blob({ x: ATX, y: .015, z: 0, r: 4.4 });
      O.latGround.material.color.setHex(0x16231d);   /* 微观段同样不要白盘 */
      O.latGround.material.opacity = 0;

      O.labLat = K.spriteLabel([ATX - 4.2, LATY + LAT + 3.5, 0], '正、负电荷总量相等 · 整块不显电性', {
        w: 8.2, fs: 34, bg: 'rgba(255,255,255,.95)', color: '#20455f'
      });
      O.labLat.sprite.material.opacity = 0;

      applyStep(0, true);
    },

    update: function (dt, s) {
      st.t += dt;
      st.stepT += dt;
      var t = st.t, i;

      /* SSAO 在浅色台面上会落下一块固定方块状暗斑。
         SSAOPass 同时兼任主 RenderPass，所以必须先补一个真正的
         RenderPass，再把它禁掉 —— 否则整个场景会停止渲染。 */
      if (!st.ssaoFixed && t > .5 && window.__labDebug && window.__labDebug.composer) {
        st.ssaoFixed = true;
        var DBG = window.__labDebug, CP = DBG.composer;
        CP.passes.unshift(new T.RenderPass(DBG.scene, DBG.camera));
        CP.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
      }

      var keys = ['atomA', 'atomB', 'macro', 'burn', 'smoke', 'lattice', 'lines', 'dissolve', 'pair', 'qNa', 'qCl', 'grain'];
      for (i = 0; i < keys.length; i++) {
        var k = keys[i];
        V[k] = ez(V[k], TG[k], dt, (k === 'qNa' || k === 'qCl') ? 3.4 : 4.0);
      }

      /* ---- 暗场衬底跟随相机 ---- */
      if (window.__labDebug && window.__labDebug.camera) {
        O.vign.quaternion.copy(window.__labDebug.camera.quaternion);
      }
      st.vignA = ez(st.vignA || 0, st.showVign || 0, dt, 2.6);
      var macroOn = st.step <= 1;
      /* 衬底跟着主体走：宏观段在瓶子后，微观段移到原子/晶体后；微观段只用很淡的一层 */
      st.vignX = ez(st.vignX === undefined ? JARX : st.vignX, macroOn ? JARX : ATX + .4, dt, 2.6);
      st.vignY = ez(st.vignY === undefined ? 5.2 : st.vignY, macroOn ? 5.4 : 6.4, dt, 2.6);
      O.vign.position.set(st.vignX, st.vignY, -13);
      O.vignMat.opacity = 0;   /* 背景布已停用，不再随步骤淡入成黑块 */

      /* ---- 宏观装置 ---- */
      var mg = O.burn.grp;
      mg.visible = V.macro > .006;
      mg.scale.setScalar(Math.max(.001, V.macro * JARS));
      O.grain.visible = V.grain > .006;
      O.grain.scale.setScalar(Math.max(.001, V.grain));

      /* 点燃：进入步骤 1.2s 后起火，之后保持燃烧 */
      if (st.stepT > .65) st.litDone = true;
      var litTarget = (TG.burn > .5 && st.litDone) ? 1 : 0;
      var litNow = O.burn.flame.level;
      var lv = litNow + (litTarget - litNow) * Math.min(1, dt * 6.0);
      O.burn.flame.setLit(lv > .01 ? lv : 0);
      O.burn.flame.tick(t);
      /* 反应程度：烧过之后钠块被白色氯化钠覆盖，瓶底也积一层。
         先烧够 4 s 再开始沉积——否则一进第 1 步，瓶底就先浮出一层白晶，
         学生还没看清"银白色金属钠"这个关键特征。 */
      if (lv > .55 && st.stepT > 4) st.deposit = Math.min(1, (st.deposit || 0) + dt * .05);
      var dep = st.deposit || 0;
      O.burn.na.material.color.copy(new T.Color(0x8f9dab)).lerp(new T.Color(0xeaf1f7), dep * .62);
      O.burn.na.material.metalness = 1.0 * (1 - dep * .45);
      O.burn.na.material.roughness = .30 + .34 * dep;
      O.burn.depMat.opacity = dep * 1.0;
      O.burn.specMat.opacity = Math.min(.52, dep * 1.1) * (st.step <= 1 ? 1 : .28);

      /* 气体缓慢涌动 */
      O.burn.gasMat.uniforms.uTime.value = t;

      /* 白烟 */
      var smokeTarget = TG.smoke * ((lv > .3 || (st.deposit || 0) > .15) ? 1 : 0);
      genSmoke(dt, smokeTarget);
      updateSmoke(dt, t);

      /* ---- 原子 ---- */
      var naX = ATX - (FAR + (PAIR - FAR) * V.pair);
      var clX = ATX + (FAR + (PAIR - FAR) * V.pair);
      O.atomA.grp.position.set(naX, AY, 0);
      O.atomB.grp.position.set(clX, AY, 0);
      O.atomA.grp.scale.setScalar(Math.max(.0001, V.atomA * ATOMS));
      O.atomB.grp.scale.setScalar(Math.max(.0001, V.atomB * ATOMS));
      O.atomA.grp.visible = V.atomA > .004;
      O.atomB.grp.visible = V.atomB > .004;

      setAtomLook(O.atomA, V.qNa);
      setAtomLook(O.atomB, V.qCl);
      updateElectrons(O.atomA, t);
      updateElectrons(O.atomB, t);

      var holeOn = (V.atomB > .4 && V.qCl < .04 && !(st.fly && st.fly.kind === 'in')) ? .95 : 0;
      O.atomB.hole.material.opacity = Math.max(0, Math.min(.95, holeOn * (1 - V.qCl * 3)));

      if (st.naLost && O.atomA.layers[2].electrons[0]) {
        O.atomA.layers[2].electrons[0].visible = false;
      }

      var qa = V.qNa, qc = V.qCl;
      O.labNaA.sprite.material.opacity = V.atomA * (1 - Math.min(1, qa * 3));
      O.labClA.sprite.material.opacity = V.atomB * (1 - Math.min(1, qc * 3));
      O.labNaI.sprite.material.opacity = V.atomA * Math.min(1, Math.max(0, qa * 3 - .4));
      O.labClI.sprite.material.opacity = V.atomB * Math.min(1, Math.max(0, qc * 3 - .4));

      /* ---- 飞行电子 ---- */
      O.flyE.visible = false;
      var flyShown = false;
      if (st.fly) {
        var F = st.fly;
        if (F.delay > 0) {
          F.delay -= dt;
        } else {
          if (!F.ready) prepareFly(F);
          F.t = Math.min(1, F.t + dt / F.dur);
          var u = F.t, iu = 1 - u;
          var px = iu * iu * F.from.x + 2 * iu * u * F.ctrl.x + u * u * F.to.x;
          var py = iu * iu * F.from.y + 2 * iu * u * F.ctrl.y + u * u * F.to.y;
          var pz = iu * iu * F.from.z + 2 * iu * u * F.ctrl.z + u * u * F.to.z;
          O.flyE.visible = true;
          O.flyE.position.set(px, py, pz);
          O.flyGlow.position.set(px, py, pz);
          O.flyGlow.material.opacity = .9;
          O.flyGlow.scale.setScalar(2.2);
          O.labE.sprite.position.set(px, py + .66, pz);
          O.labE.sprite.material.opacity = .95;
          flyShown = true;
          if (F.t >= 1) {
            if (F.kind === 'out') {
              st.hover = true;
              TG.qNa = 1;
              O.flyE.position.copy(HOVER);
              O.flyGlow.position.copy(HOVER);
              O.labE.sprite.position.set(HOVER.x, HOVER.y + .72, HOVER.z);
            } else {
              st.hover = false;
              TG.qCl = 1;
              O.flyE.visible = false;
              O.flyGlow.material.opacity = 0;
              O.labE.sprite.material.opacity = 0;
            }
            st.fly = null;
          }
        }
      }
      if (st.hover && !flyShown) {
        var hy = HOVER.y + Math.sin(t * 1.9) * .13;
        O.flyE.visible = true;
        O.flyE.position.set(0, hy, 0);
        O.flyGlow.position.set(0, hy, 0);
        O.flyGlow.material.opacity = .95 + Math.sin(t * 3.1) * .05;
        O.flyGlow.scale.setScalar(2.2 + Math.sin(t * 3.1) * .14);
        O.labE.sprite.position.set(0, hy + .66, 0);
        O.labE.sprite.material.opacity = .95;
      } else if (!st.fly) {
        O.flyGlow.material.opacity = 0;
        O.flyGlow.position.set(0, -60, 0);
        if (!st.hover) {
          O.labE.sprite.material.opacity = 0;
          O.labE.sprite.position.set(0, -60, 0);
        }
      }

      /* ---- 力线 ---- */
      var lo = V.lines;
      O.lines.mat.opacity = lo * 1.0;
      O.lines.matHot.opacity = lo * 1.0;
      O.lines.grp.visible = lo > .01;
      O.lines.grp.scale.setScalar(.62 + .38 * V.pair);
      for (i = 0; i < O.lines.dots.length; i++) {
        var d = O.lines.dots[i];
        var tt = (t * .5 * d.dir + d.ph) % 1;
        if (tt < 0) tt += 1;
        d.m.position.copy(d.cv.getPoint(tt));
        d.m.scale.setScalar(.55 + Math.sin(tt * Math.PI) * .7);
      }

      /* ---- 晶体 ---- */
      O.lat.grp.visible = V.lattice > .003;
      var la = V.lattice, dd = V.dissolve;
      O.lat.bonds.visible = la > .06;
      O.lat.bonds.scale.setScalar(Math.max(.001, la));
      O.lat.bondMat.opacity = .55 * la * Math.max(0, 1 - dd * 1.5);
      O.lat.cellMat.opacity = .40 * la * Math.max(0, 1 - dd * 1.8);
      O.latGround.material.opacity = .20 * la * Math.max(0, 1 - dd * 1.2);
      for (i = 0; i < O.lat.items.length; i++) {
        var m = O.lat.items[i];
        var delay = (m.userData.d / (O.lat.maxD || 1)) * .5;
        var ap = Math.max(0, Math.min(1, (la * 1.7 - delay) / .55));
        var e = ap < .5 ? 2 * ap * ap : -1 + (4 - 2 * ap) * ap;
        var grow = ap <= 0 ? 0 : e;
        m.scale.setScalar(Math.max(.001, m.userData.r * grow));
        if (dd > .001) {
          /* 沿"由中心向外"的方向散开：保持点阵次序，杜绝同种离子叠在一起。
             位移控制在画面内，太散会让离子被屏幕边缘切掉。 */
          var b0 = m.userData.base, dr = m.userData.dir;
          var spread = 1 + .18 * dd;
          var mx = b0.x * spread + dr.x * dd * .32 + Math.sin(t * .55 + i) * dd * .16;
          var my = b0.y * (1 + .06 * dd) + dr.y * dd * .26 + Math.sin(t * .70 + i * 1.2) * dd * .12;
          var mz = b0.z * spread + dr.z * dd * .32 + Math.cos(t * .50 + i * 1.3) * dd * .16;
          /* 别让最下层离子穿过实验台垫板 */
          m.position.set(mx, Math.max(my, -LAT + 1.0), mz);
        } else {
          m.position.copy(m.userData.base);
        }
      }
      /* 只做小幅摆动；视角接近正对晶面：前层是干净的"一钠一氯"棋盘，
         后一层的异色离子只从缝里露一点，不会把同色离子混成一排。 */
      O.lat.grp.rotation.set(-.03, .03 + Math.sin(t * .22) * .025, .01);
      O.labLat.sprite.material.opacity = V.lattice * Math.max(0, 1 - dd * 1.6);

      /* ===== 教学可视化层的显隐与动画 ===== */
      st.bridge = ez(st.bridge, st.showBridge, dt, 3.2);
      st.cfg = ez(st.cfg, st.showCfg, dt, 3.2);
      st.transfer = ez(st.transfer, st.showTransfer, dt, 3.2);
      st.neutral = ez(st.neutral, st.showNeutral, dt, 3.2);

      O.bridge.mat.opacity = st.bridge * .85;
      O.labBridge.sprite.material.opacity = st.bridge * .95;

      O.labStable.sprite.material.opacity = st.cfg * .98;
      O.labNaCfg.sprite.material.opacity = st.cfg * .96 * V.atomA;
      O.labClCfg.sprite.material.opacity = st.cfg * .96 * V.atomB;
      O.labNaCfg.sprite.position.set(naX, AY - 2.75, 0);
      /* 氯侧说明往内收一点，避免贴到右侧讲解面板 */
      O.labClCfg.sprite.position.set(clX - .55, AY - 2.75, 0);

      O.transfer.mat.opacity = st.transfer * .80;
      O.labTransfer.sprite.material.opacity = st.transfer * .96;

      var nz = st.neutral * V.pair;
      O.labPlus.sprite.material.opacity = nz * (1 - Math.max(0, (V.pair - .82) / .18));
      O.labMinus.sprite.material.opacity = nz * (1 - Math.max(0, (V.pair - .82) / .18));
      O.labPlus.sprite.position.set(-FAR + 1.1 + (FAR - 2.45) * V.pair, AY + 3.05, 0);
      O.labMinus.sprite.position.set(FAR - 1.1 - (FAR - 2.45) * V.pair, AY + 3.05, 0);
      O.labZero.sprite.material.opacity = st.neutral * Math.max(0, Math.min(1, (V.pair - .70) / .28));
    }
  };

  /* ---------------- 白烟 ---------------- */
  function genSmoke(dt, target) {
    if (target <= .02) return;
    st.smokeAcc += dt * (3.0 + 4.2 * target);
    while (st.smokeAcc > 1) {
      st.smokeAcc -= 1;
      for (var i = 0; i < st.smoke.length; i++) {
        var p = st.smoke[i];
        if (p.alive) continue;
        p.alive = true;
        p.x = K.rnd(-1.25, 1.25);
        p.y = 6.15 + K.rnd(-.20, .80);
        p.z = K.rnd(-1.05, 1.05);
        p.escape = Math.random() < .30;
        p.vx = K.rnd(-.22, .22);
        p.vy = K.rnd(.45, .82);
        p.vz = K.rnd(-.18, .18);
        p.life = 0;
        p.max = K.rnd(2.8, 4.0);
        p.s = K.rnd(.38, .72);
        p.rot = Math.random() * 6.28;
        p.spin = K.rnd(-.8, .8);
        p.axis.set(K.rnd(-1, 1), K.rnd(-.4, 1), K.rnd(-1, 1)).normalize();
        p.mat.uniforms.uOp.value = 0;
        p.mesh.visible = true;
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.scale.setScalar(p.s);
        break;
      }
    }
  }

  function updateSmoke(dt, t) {
    for (var i = 0; i < st.smoke.length; i++) {
      var p = st.smoke[i];
      if (!p.alive) { p.mesh.visible = false; p.mat.uniforms.uOp.value = 0; continue; }
      p.life += dt;
      if (p.life > p.max) { p.alive = false; p.mesh.visible = false; p.mat.uniforms.uOp.value = 0; continue; }
      var k = p.life / p.max;
      p.vy *= (1 - dt * .30);
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * .8 + i) * .07) * dt;
      p.z += (p.vz + Math.cos(t * .7 + i * 1.3) * .07) * dt;
      /* 到瓶顶后向四周散开 */
      if (p.y > 9.05 && !p.escape) { p.vy *= (1 - dt * 2.6); p.x += p.vx * dt * 2.6; p.z += p.vz * dt * 2.6; }
      if (p.escape && p.y > 9.6) { p.vy *= (1 - dt * .5); p.x += p.vx * dt * 1.4; }
      var lim = p.escape ? 2.9 : (p.y > 8.85 ? 1.72 : 2.68);
      p.x = K.clamp(p.x, -lim, lim); p.z = K.clamp(p.z, -lim, lim);
      p.mesh.position.set(p.x, p.y, p.z);
      var sc = p.s * (.66 + k * 1.32);
      p.mesh.scale.setScalar(sc);
      p.rot += p.spin * dt;
      p.mesh.rotation.set(p.axis.x * p.rot, p.axis.y * p.rot, p.axis.z * p.rot);
      p.mat.uniforms.uTime.value = t;
      /* 单团透明度压到 0.3，靠少量半透团块叠出体积，避免糊成一片白雾 */
      p.mat.uniforms.uOp.value = Math.min(1, k * 5) * Math.max(0, 1 - Math.pow(k, 1.45)) * .34;
    }
  }

  /* ---------------- 步骤 ---------------- */
  function applyStep(i, hard) {
    st.step = i;
    st.stepT = 0;
    st.fly = null;
    st.hover = false;
    st.naLost = false;
    st.deposit = 0;   /* 换步就回到"还没燃烧"的状态，重新积累 */

    TG.atomA = 0; TG.atomB = 0; TG.macro = 0; TG.burn = 0; TG.smoke = 0;
    TG.lattice = 0; TG.lines = 0; TG.dissolve = 0; TG.pair = 0;
    TG.qNa = 0; TG.qCl = 0; TG.grain = 0;
    st.showVign = 1;
    st.showBridge = (i === 2) ? 1 : 0;
    st.showCfg = (i === 2) ? 1 : 0;
    st.showTransfer = (i === 3 || i === 4) ? 1 : 0;
    st.showNeutral = (i === 5) ? 1 : 0;

    if (i === 0) {
      TG.macro = 1; TG.burn = 1; TG.smoke = .8;
    } else if (i === 1) {
      TG.macro = 1; TG.burn = 1; TG.smoke = 1;
    } else if (i === 2) {
      TG.atomA = 1; TG.atomB = 1; TG.macro = 1; TG.smoke = .30;
    } else if (i === 3) {
      TG.atomA = 1; TG.atomB = 1;
      V.qNa = 0; V.qCl = 0;
      startFly('out', .6);
    } else if (i === 4) {
      TG.atomA = 1; TG.atomB = 1;
      V.qNa = 1; TG.qNa = 1;
      V.qCl = 0; TG.qCl = 0;
      st.naLost = true;
      st.hover = true;
      startFly('in', .6);
    } else if (i === 5) {
      TG.atomA = 1; TG.atomB = 1;
      V.qNa = 1; TG.qNa = 1;
      V.qCl = 1; TG.qCl = 1;
      st.naLost = true;
      TG.pair = 1; TG.lines = 1;
    } else if (i === 6) {
      TG.lattice = 1;
    } else if (i === 7) {
      TG.lattice = 1; TG.dissolve = 1;
    } else if (i === 8) {
      TG.atomA = 1; TG.atomB = 1;
      V.qNa = 1; TG.qNa = 1;
      V.qCl = 1; TG.qCl = 1;
      st.naLost = true;
      TG.pair = 1; TG.lines = 1;
    }
  }

  /* ---------------- 启动 ---------------- */
  K.boot({
    title: '氯化钠的形成',
    chip: '化学 · 鲁教版 · 九上 · 第二单元 认识物质的构成 · 第一节 原子',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    postfx: true,
    /* 浅色实验室 + 微观亮球：默认 bloom .38 / exposure .9 会把白墙、柜体、地面
       晕成一片白。单独压一档，恢复台面与背景的明暗层次（其它课保持默认）。 */
    bloom: .18, exposure: .78,
    cam: { ty: 4.9, dist: 16.5, tx: JARX + 3.38, tz: 0, yaw: -.10, pitch: .20 },

    reads: [['na', '钠最外层电子'], ['cl', '氯最外层电子'], ['ion', '带电情况']],
    values: function (s) {
      var i = st.step;
      if (i <= 1) return { na: '1 个', cl: '7 个', ion: '都不带电' };
      if (i === 2) return { na: '1 个', cl: '7 个', ion: '都不带电' };
      if (i === 3) return { na: '0 个', cl: '7 个', ion: 'Na⁺（+1）' };
      if (i === 4) return { na: '0 个', cl: '8 个', ion: 'Na⁺、Cl⁻' };
      return { na: '0 个', cl: '8 个', ion: 'Na⁺、Cl⁻（整体 0）' };
    },

    steps: [
      {
        name: '钠在氯气中燃烧',
        title: '黄绿色的氯气里，钠烧了起来',
        ask: '把银白色的钠放进黄绿色氯气，会发生什么？',
        body: '<p><b>装置：</b>集气瓶里充满<b>黄绿色</b>的氯气，燃烧匙上放一小块新切开的<b>钠</b>（银白色、有金属光泽）。</p>' +
          '<p><b>现象：</b>点燃后，钠在氯气中<b>剧烈燃烧</b>，发出<b>光亮的黄色火焰</b>，瓶内出现大量<b>白烟</b>。</p>' +
          '<p><b>反应：</b>2Na + Cl₂ <span style="opacity:.7">—点燃→</span> 2NaCl</p>',
        apply: function () { applyStep(0); },
        cam: { tz: 0, dist: 16.5, ty: 4.9, tx: JARX + 3.38, yaw: -.10, pitch: .20 }
      },
      {
        name: '白烟是氯化钠',
        title: '白烟不是气，是固体小颗粒',
        ask: '「烟」和「雾」有什么区别？',
        body: '<p><b>白烟的成分：</b>它是反应生成的<b>氯化钠固体小颗粒</b>，悬浮在瓶内，看起来像烟——' +
          '「烟」是<b>固体</b>小颗粒，「雾」是<b>液体</b>小液滴。</p>' +
          '<p><b>变化有多大：</b>银白色的金属钠 + 黄绿色的有毒气体氯气 → 白色的、能吃的食盐。' +
          '颜色、状态、性质<b>全变了</b>。</p>' +
          '<p><b>追问：</b>反应前后原子种类没变，为什么物质「面目全非」？要到<b>微粒</b>层面去找答案。</p>',
        apply: function () { applyStep(1); },
        cam: { tz: 0, dist: 17.0, ty: 5.0, tx: JARX + 3.47, yaw: -.12, pitch: .20 }
      },
      {
        name: '两种原子',
        title: '钠原子与氯原子，差在最外层',
        ask: '它们各自「差」几个电子？',
        body: '<p><b>钠原子（Na）：</b>核外 11 个电子，三层排布 <b>2、8、1</b>，最外层只有 <b>1 个</b>电子。</p>' +
          '<p><b>氯原子（Cl）：</b>核外 17 个电子，三层排布 <b>2、8、7</b>，最外层有 <b>7 个</b>电子。</p>' +
          '<p><b>共同的倾向：</b>最外层达到 <b>8 个电子</b>时最稳定。钠「多一个」，氯「少一个」——正好互补。</p>',
        apply: function () { applyStep(2); },
        cam: { tz: 0, dist: 20.0, ty: 5.3, tx: 1.60, yaw: .02, pitch: .20 }
      },
      {
        name: '钠失去电子',
        title: '钠原子甩掉了最外层的 1 个电子',
        ask: '少了一个电子，钠原子还是钠原子吗？',
        body: '<p><b>发生了什么：</b>钠原子最外层的那个电子被<b>氯原子</b>吸引，脱离钠原子飞走了。</p>' +
          '<p><b>结果：</b>质子 11 个（带 11 个正电荷），电子只剩 10 个（带 10 个负电荷）——' +
          '整个微粒<b>净带 1 个单位正电荷</b>，成为<b>钠离子 Na⁺</b>。</p>' +
          '<p><b>看结构：</b>电子层由三层变成两层，排布成为 <b>2、8</b>，与稀有气体氖原子的结构相同。</p>',
        controls: [{ type: 'btn', label: '重播：电子飞出去', onClick: function () { applyStep(3); } }],
        apply: function () { applyStep(3); },
        cam: { tz: 0, dist: 14.5, ty: 5.5, tx: 2.96, yaw: .02, pitch: .16 }
      },
      {
        name: '氯得到电子',
        title: '那个电子，正好补上氯的空位',
        ask: '氯原子为什么「愿意」接收它？',
        body: '<p><b>发生了什么：</b>氯原子最外层原有 7 个电子，还空着<b>一个位置</b>；' +
          '接收这个电子后，最外层凑成 <b>8 个</b>。</p>' +
          '<p><b>结果：</b>质子 17 个，电子 18 个——净带 <b>1 个单位负电荷</b>，成为<b>氯离子 Cl⁻</b>。</p>' +
          '<p><b>注意：</b>得失的只是<b>核外电子</b>，原子核没有变。所以钠还是钠、氯还是氯，' +
          '只是它们变成了<b>离子</b>。</p>',
        controls: [{ type: 'btn', label: '重播：电子飞进空位', onClick: function () { applyStep(4); } }],
        apply: function () { applyStep(4); },
        cam: { tz: 0, dist: 14.5, ty: 5.5, tx: 2.96, yaw: .02, pitch: .16 }
      },
      {
        name: '静电作用',
        title: '一正一负，靠静电抱在一起',
        ask: 'Na⁺ 和 Cl⁻ 之间，是什么把它们「粘」住的？',
        body: '<p><b>相互吸引：</b>带正电的 Na⁺ 与带负电的 Cl⁻ 之间存在<b>静电作用</b>，把两者牢牢吸在一起。</p>' +
          '<p><b>离子键：</b>这种<b>阴、阳离子之间的相互作用</b>就叫离子键。' +
          '<b>由阴、阳离子相互作用而构成的化合物，叫做离子化合物</b>，氯化钠就是其中之一。</p>' +
          '<p><b>整体不显电性：</b>Na⁺ 带 1 个正电荷、Cl⁻ 带 1 个负电荷，按 <b>1:1</b> 结合，' +
          '正负电荷恰好抵消——离子化合物里<b>有带电的离子，但整块物质呈电中性</b>。</p>',
        controls: [{ type: 'btn', label: '重播：靠拢过程', onClick: function () { applyStep(5); } }],
        apply: function () { applyStep(5); },
        cam: { tz: 0, dist: 14.0, ty: 5.6, tx: 2.86, yaw: .05, pitch: .14 }
      },
      {
        name: '长成晶体',
        title: '不是一对一，而是排成了方阵',
        ask: '为什么盐粒是小小的立方体？',
        body: '<p><b>规律排列：</b>Na⁺ 与 Cl⁻ 交替相间、整齐堆叠。每个 Na⁺ 周围紧挨着 <b>6 个 Cl⁻</b>，' +
          '每个 Cl⁻ 周围也紧挨着 <b>6 个 Na⁺</b>。</p>' +
          '<p><b>没有分子：</b>晶体里找不到「一个 NaCl 分子」，只有按 1:1 无限延伸的离子阵列，' +
          '正、负电荷总量始终相等，整体不显电性。</p>' +
          '<p><b>宏观形状：</b>正是这种立方排列，让食盐长成<b>小立方体</b>——晶体的外形，是内部微粒排列的「放大照片」。</p>',
        controls: [{ type: 'btn', label: '重播：晶体生长', onClick: function () { applyStep(6); } }],
        apply: function () { applyStep(6); },
        cam: { tz: 0, dist: 33.0, ty: 6.4, tx: 6.0, yaw: -.12, pitch: .26 }
      },
      {
        name: '溶于水',
        title: '离子松了绑，就能导电',
        ask: '干燥的食盐不导电，食盐水为什么导电？',
        body: '<p><b>固体时：</b>Na⁺ 和 Cl⁻ 被静电作用<b>固定在晶格上</b>，不能自由移动，所以干燥的氯化钠<b>不导电</b>。</p>' +
          '<p><b>溶于水：</b>水分子把离子从晶体上「拉」下来，Na⁺ 和 Cl⁻ 变成<b>自由移动</b>的离子，溶液就能<b>导电</b>。' +
          '熔融的氯化钠也能导电。</p>' +
          '<p><b>结论：</b>能导电的不是「氯化钠分子」，而是<b>自由移动的离子</b>。</p>',
        controls: [{ type: 'btn', label: '重播：溶解过程', onClick: function () { applyStep(7); } }],
        apply: function () { applyStep(7); },
        cam: { tz: 0, dist: 34.0, ty: 6.6, tx: 6.95, yaw: .30, pitch: .14 }
      },
      {
        name: '化学式',
        title: 'NaCl 这两个字母，说了三件事',
        ask: '化学式 NaCl 到底表示什么？',
        body: '<p><b>① 组成：</b>由钠元素和氯元素组成。</p>' +
          '<p><b>② 个数比：</b>钠离子与氯离子的个数比为 <b>1:1</b>——这是化学式里「看不见的 1」。</p>' +
          '<p><b>③ 构成：</b>氯化钠由<b>离子</b>构成，不是由分子构成。写化学式时，' +
          '离子所带电荷数相等、符号相反，所以不写电荷、也不写角标。</p>' +
          '<p><b>同类物质：</b>氯化钾 KCl、氯化镁 MgCl₂（Mg²⁺ 与 Cl⁻ 按 1:2 结合）、氧化镁 MgO。</p>',
        apply: function () { applyStep(8); },
        cam: { tz: 0, dist: 14.0, ty: 5.6, tx: 2.86, yaw: .05, pitch: .14 }
      },
      {
        name: '考核',
        title: '当一回「微粒翻译官」',
        ask: '下面每题都考这一节。',
        quiz: true,
        apply: function () { applyStep(8); },
        cam: { tz: 0, dist: 14.0, ty: 5.6, tx: 2.86, yaw: .05, pitch: .14 }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '钠在氯气中燃烧，观察到的现象是：',
          opts: ['剧烈燃烧，发出黄色火焰，产生白烟', '剧烈燃烧，发出蓝紫色火焰，产生白雾', '不燃烧，只是慢慢变黑', '燃烧并产生大量气泡'],
          ans: '剧烈燃烧，发出黄色火焰，产生白烟',
          why: '钠在氯气中剧烈燃烧，火焰呈黄色；生成的氯化钠是固体小颗粒，悬浮在瓶内形成白烟。'
        },
        {
          q: '钠原子失去 1 个电子后，变成：',
          opts: ['Na⁺', 'Na⁻', '仍是钠原子', '氯原子'],
          ans: 'Na⁺',
          why: '钠原子核内有 11 个质子，失去 1 个电子后核外只剩 10 个电子，整体带 1 个单位正电荷，成为钠离子 Na⁺。'
        },
        {
          q: '氯原子最外层有 7 个电子，它形成离子时：',
          opts: ['得到 1 个电子，带 1 个单位负电荷', '失去 1 个电子，带 1 个单位正电荷', '得到 7 个电子，带 7 个单位负电荷', '既不得也不失电子'],
          ans: '得到 1 个电子，带 1 个单位负电荷',
          why: '最外层 7 个电子，只需再得到 1 个就达到 8 电子稳定结构；多 1 个电子，整体就带 1 个单位负电荷。'
        },
        {
          q: '氯化钠属于离子化合物，它是由什么构成的？',
          opts: ['钠离子和氯离子', '氯化钠分子', '钠原子和氯原子', '钠元素和氯元素'],
          ans: '钠离子和氯离子',
          why: '离子化合物由阴、阳离子相互作用构成。氯化钠晶体中只有 Na⁺ 和 Cl⁻，不存在氯化钠分子。'
        },
        {
          q: 'NaCl 中 Na⁺ 与 Cl⁻ 的个数比是 1:1，原因是：',
          opts: ['正负电荷数要相等，使整体不显电性', '钠离子比氯离子大', '氯离子比钠离子多一个电子层', '钠和氯的相对原子质量接近'],
          ans: '正负电荷数要相等，使整体不显电性',
          why: 'Na⁺ 带 1 个单位正电荷、Cl⁻ 带 1 个单位负电荷，只有 1:1 结合，正负电荷才恰好抵消，整块物质呈电中性。'
        },
        {
          q: '干燥的氯化钠固体不导电，原因是：',
          opts: ['离子被固定在晶格上，不能自由移动', '氯化钠中不含离子', '氯化钠由分子构成', '离子所带电荷太少'],
          ans: '离子被固定在晶格上，不能自由移动',
          why: '导电需要自由移动的带电微粒。固体氯化钠中 Na⁺、Cl⁻ 被静电作用束缚在晶格上不能移动；溶于水或熔融后才导电。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
