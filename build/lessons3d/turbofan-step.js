/* 格物实验室 · 高涵道比涡扇发动机 · 结构与气流（职业教育线 · 混合管线样板）
   ----------------------------------------------------------------------------
   混合分工：
     · 外观曲面件 = build/assets/turbofan-shell.glb（GLTFExporter 导出的真实网格），
       含「完整」与「半剖」两套节点 + 机加工剖切断面，按节点名升级 PBR 材质。
     · 内部核心机 = 程序化几何：低压/高压双转子、19 级轴流叶片 + 静子、
       环形燃烧室、同心套轴、气流粒子、火焰。可按教学步骤拆分、按约束运动。
   运动学：
     · 双转子差速：N2 / N1 = 2.6（LP 驱动风扇+增压级+低压涡轮，HP 驱动高压压气机+高压涡轮）
     · 气流由流道半径函数 coreR(x) / 外涵环道给出，颜色沿程由冷到热，不是贴图动画。
   剖切：
     · 只把 +z 半面壳体剖掉，内部转子保持完整（真机剖切模型的标准做法），
       断面是有厚度的实体材料截面 + 亮金属机加工边，绝不用全透明壳。
   注意：K.boot 必须传 postfx:true 才会真正启用 SSAO/Bloom/ACES（构建器只注入 addons 源码）。
*/
(function () {
  var T = window.THREE, K = window.Lab;
  var PI = Math.PI, TAU = PI * 2;

  /* ── 状态 ── */
  var st = {
    spin: 1, speed: 1, cut: 0, flow: 0, explode: 0,
    /* 点火 / 油门：ignited=0 冷转（无火、无推力），=1 点火；
       throttle 0~100 联动火焰、羽流长度、喷流速度与推力读数 */
    ignited: 0, throttle: 0, _glow: 0, _thr: 0,
    t: 0, lp: 0, hp: 0, _labSet: 'outer'
  };
  var O = {
    eng: null, glb: null, glbReady: false,
    full: [], half: [], shells: {}, core: null,
    lpRotor: null, hpRotor: null, flame: null, flameLight: null,
    pts: null, pdata: [], labels: {},
    plume: null, plumeCore: null, arrows: null, gauge: null, hotParticles: null,
    mach: null, yellowLines: []
  };

  /* ── 推力物理（示意但按真实量级：涵道比 10:1，起飞推力 ≈ 120 kN） ──
     F = ṁ·(V出 − V进)；外涵质量流量大、增速小，反而贡献 ≈ 78% 推力。
     油门按 1.35 次幂给推力（近似转速—推力非线性），读数随油门实时联动。 */
  var F_MAX = 120;
  function thrustOf(s) {
    if (s.ignited < .5) return 0;
    var q = K.clamp(s.throttle / 100, 0, 1);
    return F_MAX * Math.pow(q, 1.35) * s._glow;
  }
  function egtOf(s) {
    if (s.ignited < .5) return 0;
    var q = K.clamp(s.throttle / 100, 0, 1);
    return Math.round((320 + 620 * q) * s._glow);
  }
  function fuelOf(s) {
    if (s.ignited < .5) return 0;
    var q = K.clamp(s.throttle / 100, 0, 1);
    return (0.12 + 1.22 * Math.pow(q, 1.5)) * s._glow;
  }

  /* ── 材质（PBR；金属靠 scene.environment 的 PMREM 反射，不挂自制 envMap） ── */
  var MAT = {
    /* 整体压暗：车间是浅色环境，金属/白涂装在 ACES 终合下容易冲成一片白。
       降基色 + 收 envMapIntensity，保留少量亮边与自发光件做层次。 */
    paint:   new T.MeshPhysicalMaterial({ color: 0x9eaab6, metalness: .22, roughness: .58, clearcoat: .22, clearcoatRoughness: .44, envMapIntensity: .50, side: T.DoubleSide }),
    /* 半剖壳的内壁不能与外壁同亮度：逆光下会冲成一整片白板 */
    paintHalf: new T.MeshStandardMaterial({ color: 0x65727f, metalness: .38, roughness: .78, envMapIntensity: .34, side: T.DoubleSide }),
    metal:   new T.MeshStandardMaterial({ color: 0x73808d, metalness: .86, roughness: .46, envMapIntensity: .70, side: T.DoubleSide }),
    cutFace: new T.MeshStandardMaterial({ color: 0xaab7c4, metalness: .88, roughness: .30, envMapIntensity: .82, side: T.DoubleSide }),
    titan:   new T.MeshStandardMaterial({ color: 0x8d99a6, metalness: .88, roughness: .38, envMapIntensity: .74, side: T.DoubleSide }),
    dark:    new T.MeshStandardMaterial({ color: 0x323a43, metalness: .82, roughness: .52, envMapIntensity: .62, side: T.DoubleSide }),
    hot:     new T.MeshStandardMaterial({ color: 0x4a525b, metalness: .78, roughness: .54, envMapIntensity: .70, side: T.DoubleSide }),
    rotor:   new T.MeshStandardMaterial({ color: 0x84919f, metalness: .86, roughness: .44, envMapIntensity: .72 }),
    stator:  new T.MeshStandardMaterial({ color: 0x56626e, metalness: .84, roughness: .54, envMapIntensity: .66 }),
    bladeHot:new T.MeshStandardMaterial({ color: 0x836b57, metalness: .80, roughness: .48, envMapIntensity: .72 }),
    disk:    new T.MeshStandardMaterial({ color: 0x66727e, metalness: .88, roughness: .48, envMapIntensity: .72 }),
    shaft:   new T.MeshStandardMaterial({ color: 0x4e5863, metalness: .92, roughness: .42, envMapIntensity: .78 }),
    shaftHp: new T.MeshStandardMaterial({ color: 0x7c8895, metalness: .90, roughness: .40, envMapIntensity: .82 }),
    bench:   new T.MeshStandardMaterial({ color: 0x242b32, metalness: .55, roughness: .56, envMapIntensity: .42 }),
    benchTop:new T.MeshStandardMaterial({ color: 0x161f1a, metalness: .34, roughness: .60, envMapIntensity: .38 }),
    warn:    new T.MeshStandardMaterial({ color: 0x9a7918, metalness: .12, roughness: .64 }),
    steel:   new T.MeshStandardMaterial({ color: 0x8b96a2, metalness: .92, roughness: .32, envMapIntensity: 1.1 })
  };

  function RM(w, h, d, r, mat) {
    return new T.Mesh(K.geoRoundBox(w, h, d, r === undefined ? .16 : r, 3), mat);
  }

  /* 蒙皮颗粒：短舱是画面里最大的一片曲面，纯色近景必糊成塑料 */
  function castTex(rep) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#f2f4f6'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 3600; i++) {
      var v = 198 + Math.floor(Math.random() * 54);
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',' + (.16 + Math.random() * .30).toFixed(2) + ')';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, .3 + Math.random() * 1.3, 0, TAU); x.fill();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 6, rep || 3);
    return t;
  }
  (function () {
    var t = castTex();
    MAT.paint.map = t; MAT.paint.bumpMap = t; MAT.paint.bumpScale = .018;
    MAT.paint.needsUpdate = true;
  })();

  /* ── 绕 X 轴的回转体（与 .glb 生成器同一套解析法线） ──
     a∈[PI,2PI] → z<=0，用于半剖件；全圈用 [0,TAU]。 */
  function lathe(profile, phiStart, phiLen, seg) {
    var n = profile.length, rows = (seg || 48) + 1;
    var pos = [], nrm = [], uv = [], idx = [], i, j;
    for (i = 0; i < rows; i++) {
      var a = phiStart + phiLen * (i / rows), ca = Math.cos(a), sa = Math.sin(a);
      for (j = 0; j < n; j++) {
        var x = profile[j][0], r = profile[j][1];
        pos.push(x, r * ca, r * sa);
        var pp = profile[(j - 1 + n) % n], pn = profile[(j + 1) % n];
        var dx = pn[0] - pp[0], dr = pn[1] - pp[1];
        var L = Math.sqrt(dx * dx + dr * dr) || 1;
        nrm.push(-dr / L, (dx / L) * ca, (dx / L) * sa);
        uv.push(i / rows, j / n);
      }
    }
    for (i = 0; i < rows - 1; i++) {
      for (j = 0; j < n; j++) {
        var j2 = (j + 1) % n;
        var A = i * n + j, B = i * n + j2, C = (i + 1) * n + j, D = (i + 1) * n + j2;
        idx.push(A, B, D, A, D, C);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /* 剖切断面：闭合 profile 在 z=0 平面挤出的实体材料截面 */
  function capGeo(profile, depth) {
    var s = new T.Shape(), i;
    s.moveTo(profile[0][0], profile[0][1]);
    for (i = 1; i < profile.length; i++) s.lineTo(profile[i][0], profile[i][1]);
    s.closePath();
    var d = depth || .12;
    var g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 2, steps: 1 });
    g.translate(0, 0, -d / 2);
    return g;
  }

  /* ── GLB 兜底：若构建器未注入 glb 表，至少还能有一台可剖切的短舱 ── */
  var NACELLE = [
    [-19.00, 7.50], [-18.85, 7.86], [-18.50, 8.10], [-17.80, 8.28],
    [-16.50, 8.34], [-13.00, 8.34], [-8.00, 8.26], [-3.00, 8.10],
    [ 1.00, 7.86], [ 3.20, 7.62],
    [ 3.20, 7.20], [ 1.00, 7.30], [-3.00, 7.36], [-8.00, 7.30],
    [-13.00, 7.16], [-16.00, 7.10], [-17.60, 7.16], [-18.60, 7.28]
  ];
  function fallbackShell() {
    var root = new T.Group();
    function pair(name, prof, mat) {
      var f = new T.Group(); f.name = name + '_FULL';
      var fm = new T.Mesh(lathe(prof, 0, TAU, 72), mat); fm.name = name + '_FULL__shell'; f.add(fm);
      var h = new T.Group(); h.name = name + '_HALF';
      var hm = new T.Mesh(lathe(prof, PI, PI, 72), mat); hm.name = name + '_HALF__shell'; h.add(hm);
      var cg = capGeo(prof);
      var ct = new T.Mesh(cg, MAT.cutFace); ct.name = name + '_HALF__CAP_T';
      var cb = new T.Mesh(cg, MAT.cutFace); cb.name = name + '_HALF__CAP_B'; cb.scale.y = -1;
      h.add(ct, cb); root.add(f, h);
    }
    pair('NACELLE', NACELLE, MAT.paint);
    pair('CORECOWL', [
      [-12, 3.30], [-6, 2.70], [0, 2.60], [7, 2.80], [14, 2.35], [18, 2.00],
      [18, 1.82], [14, 2.15], [7, 2.62], [0, 2.42], [-6, 2.52], [-10, 2.87]
    ], MAT.metal);
    var sp = new T.Group(); sp.name = 'SPINNER';
    sp.add(new T.Mesh(lathe([
      [-21, 0], [-20.6, .35], [-20, .78], [-19.2, 1.14], [-18.2, 1.44],
      [-17.2, 1.58], [-17, 1.58], [-17, 0]
    ], 0, TAU, 48), MAT.titan)); root.add(sp);
    var tc = new T.Group(); tc.name = 'TAILCONE';
    tc.add(new T.Mesh(lathe([
      [14, 0], [15, 1.30], [18, 1.25], [21, .90], [24, .30], [24.6, 0]
    ], 0, TAU, 48), MAT.hot)); root.add(tc);
    return root;
  }

  /* ── GLB 加载：base64 → ArrayBuffer → loader.parse（零 fetch，CSP 安全） ── */
  function b64ToArr(str) {
    var bin = atob(str), n = bin.length, u = new Uint8Array(n), i;
    for (i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function upMatFor(groupName, meshName) {
    if (meshName.indexOf('__CAP') >= 0) return MAT.cutFace;
    if (groupName.indexOf('NACELLE') === 0) return MAT.paint;
    if (groupName.indexOf('NOZZLE') === 0 || groupName === 'TAILCONE') return MAT.hot;
    if (groupName === 'SPINNER' || groupName === 'FANBLADE' || groupName === 'LIPRING') return MAT.titan;
    if (groupName.indexOf('SEAM') === 0 || groupName.indexOf('FANBOLT') === 0) return MAT.dark;
    if (groupName === 'PYLON') return MAT.metal;
    return MAT.metal;                       // FANCASE / CORECOWL
  }
  var TAG_DESC = {
    NACELLE: ['短舱 / 进气罩壳', '包容风扇并形成外涵道，进气唇口把气流平顺引入'],
    FANCASE: ['风扇机匣', '高强度包容环，风扇叶片一旦断裂须把碎片兜住'],
    CORECOWL:['核心机机匣', '包裹压气机、燃烧室与涡轮，形成内涵流道外壁'],
    NOZZLE:  ['尾喷管', '收敛喷口把燃气加速排出，产生反作用推力'],
    SPINNER: ['整流锥', '与风扇同转，把进气平顺分向外涵与核心'],
    TAILCONE:['排气中心锥', '与喷管构成收敛通道，抑制排气分离损失'],
    LIPRING: ['进气唇口', '圆润唇缘，大迎角/侧风时避免进气畸变'],
    PYLON:   ['发动机挂架', '把发动机连到机翼，传递推力、重量与载荷'],
    FANBOLTS:['风扇机匣法兰螺栓', '前后机匣与安装边的紧固连接'],
    FANBLADE:['宽弦风扇叶片', '钛合金宽弦、带扭转与后掠，是外涵推力的主要来源']
  };
  function tagFor(name) {
    var k = name.replace(/_FULL$|_HALF$/, '');
    if (TAG_DESC[k]) return TAG_DESC[k];
    if (k.indexOf('SEAM') === 0) return ['短舱蒙皮接缝', '分段蒙皮与反推罩的对缝，便于大修分解'];
    return [k, ''];
  }

  function mountShell(root) {
    O.glb = root;
    O.full = []; O.half = []; O.shells = {};
    /* GLTFLoader 会在导出根节点外再包一层 scene，必须递归按名字收集，
       只遍历一层 children 会把所有外观件当成"共享件"，FULL/HALF 同时显示，
       完整壳把内部核心机全挡住 —— 剖切静默失效，还会共面闪烁。 */
    var SINGLE = ['SPINNER', 'TAILCONE', 'LIPRING', 'PYLON', 'FANBLADE'];
    var groups = [];
    root.traverse(function (o) {
      var n = o.name || '';
      if (/_FULL$/.test(n) || /_HALF$/.test(n) ||
          SINGLE.indexOf(n) >= 0 || /^SEAM_|^FANBOLTS$/.test(n)) groups.push(o);
    });
    groups.forEach(function (g) {
      var name = g.name;
      var base = name.replace(/_FULL$|_HALF$/, '');
      var isFull = /_FULL$/.test(name), isHalf = /_HALF$/.test(name);
      g.traverse(function (m) {
        if (!m.isMesh) return;
        /* 短舱半剖壳单独压暗：剖开后看到的是内壁，不能与外壁一样亮 */
        m.material = (isHalf && base === 'NACELLE') ? MAT.paintHalf : upMatFor(base, m.name || '');
        m.castShadow = true; m.receiveShadow = true;
      });
      var d = tagFor(name);
      K.tag(g, d[0], d[1]);
      O.shells[name] = g;
      if (isFull) O.full.push(g);
      else if (isHalf) O.half.push(g);
      O.eng.add(g);                        /* 从 gltf.scene 移到发动机根组，两组才可控 */
    });
    /* FANBLADE 节点只提供一片叶片几何，课件里实例化成 22 片 */
    var fb = O.shells['FANBLADE'];
    if (fb) {
      var bladeGeo = null;
      fb.traverse(function (m) { if (!bladeGeo && m.isMesh) bladeGeo = m.geometry; });
      if (bladeGeo) buildFan(bladeGeo);
      fb.visible = false;
    }
    O.glbReady = true;
  }

  function loadShell() {
    var b64 = (window.__GLB || {})['turbofan-shell'] || '';
    if (b64.length < 200 || !T.GLTFLoader) {
      mountShell(fallbackShell());
      return;
    }
    try {
      new T.GLTFLoader().parse(b64ToArr(b64), '', function (gltf) {
        mountShell(gltf.scene);
      }, function (e) {
        console.error('turbofan GLB parse failed', e);
        mountShell(fallbackShell());
      });
    } catch (e) {
      console.error('turbofan GLB load exception', e);
      mountShell(fallbackShell());
    }
  }

  /* ── 车间工装：V 形鞍座托架（不是化学实验台） ── */
  function buildStand(G) {
    var g = new T.Group(), i;
    var GY = -15.5;
    /* 底座纵梁 + 横梁 + 四只脚垫 */
    [-2.4, 2.4].forEach(function (z) {
      var beam = RM(40, .8, 1.5, .14, MAT.bench); beam.position.set(1, GY + .55, z); g.add(beam);
    });
    [-16, 16].forEach(function (x) {
      var cross = RM(1.5, .7, 6.2, .12, MAT.bench); cross.position.set(x, GY + .55, 0); g.add(cross);
    });
    [[-16, -2.4], [16, -2.4], [-16, 2.4], [16, 2.4]].forEach(function (p) {
      var foot = RM(2.6, .42, 2.6, .10, MAT.dark); foot.position.set(p[0], GY + .21, p[1]); g.add(foot);
    });
    /* 两处 V 形鞍座：斜撑落在短舱下缘（半径 8.34 的圆上） */
    [-9, 7].forEach(function (x) {
      [-1, 1].forEach(function (s) {
        var a = new T.Group();
        var strut = RM(1.15, 8.2, 1.5, .14, MAT.bench);
        strut.position.set(s * 4.9, GY + 4.6, 0);
        strut.rotation.z = -s * .245;
        a.add(strut);
        var pad = RM(2.5, .42, 3.0, .10, MAT.benchTop);
        pad.position.set(s * 3.85, -7.55, 0); pad.rotation.z = -s * .30; a.add(pad);
        a.position.x = x; g.add(a);
      });
      var yoke = RM(1.4, .55, 8.6, .12, MAT.bench); yoke.position.set(x, GY + 1.05, 0); g.add(yoke);
    });
    /* 前缘黄警示条 + 接触阴影 */
    var warn = RM(38, .22, .30, .06, MAT.warn); warn.position.set(1, GY + 1.02, 3.25); g.add(warn);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(g);
    K.blob({ x: 0, z: 0, r: 12, y: GY + .05 });
  }

  /* ── 剖切背景布 ──
     半剖后 +z 窗口会直接透出车间工具柜/卷帘门，那块规整的深色柜体读成"挡板"。
     放一块纯色 + alphaMap 径向羽化的柔和深布在发动机后方（正常深度，不用 depthTest:false），
     既压住杂乱背景，又给亮金属一个对比底色。地面与黄线仍在下方入画。 */
  function buildBackdrop(G) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(128, 128, 18, 128, 128, 205);   /* 外半径 = w*.8 */
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(.62, 'rgba(255,255,255,.88)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    var am = new T.CanvasTexture(c);
    var m = new T.MeshBasicMaterial({
      color: 0x1b2731, alphaMap: am, transparent: true,
      depthWrite: false, opacity: .94
    });
    var p = new T.Mesh(new T.PlaneGeometry(62, 30), m);
    p.position.set(2, 2.2, -12.5);
    G.add(p);
    O.backdrop = p;
    return p;
  }

  /* ── 程序化内部核心机 ── */
  /* 单级叶片几何：带展向扭转的封闭小翼型（不是薄板） */
  function bladeGeo(r0, r1, chord, tw0, tw1, sweep, thick) {
    var NR = 5, NC = 7, P = (NR + 1) * (NC + 1), pos = [], idx = [], s, i, j;
    function off(s, i, j) { return s * P + i * (NC + 1) + j; }
    for (s = 0; s < 2; s++) {
      for (i = 0; i <= NR; i++) {
        var t = i / NR, r = r0 + (r1 - r0) * t;
        var tw = (tw0 + (tw1 - tw0) * t) * PI / 180;
        var ct = Math.cos(tw), sT = Math.sin(tw);
        var sw = sweep * t * t;
        for (j = 0; j <= NC; j++) {
          var c = j / NC;
          var yt = 5 * thick * (0.2969 * Math.sqrt(c) - 0.1260 * c
                   - 0.3516 * c * c + 0.2843 * c * c * c - 0.1036 * c * c * c * c);
          var th = yt * chord * (s === 0 ? 1 : -1);
          var cam = .07 * Math.sin(PI * c) * chord;
          var xc = (c - .5) * chord, zc = th + cam;
          pos.push(xc * ct - zc * sT + sw, r, xc * sT + zc * ct);
        }
      }
    }
    for (s = 0; s < 2; s++) {
      for (i = 0; i < NR; i++) for (j = 0; j < NC; j++) {
        var A = off(s, i, j), B = off(s, i, j + 1), C = off(s, i + 1, j), D = off(s, i + 1, j + 1);
        if (s === 0) idx.push(A, B, D, A, D, C); else idx.push(A, D, B, A, C, D);
      }
    }
    for (i = 0; i < NR; i++) {
      [0, NC].forEach(function (jj) {
        var u0 = off(0, i, jj), u1 = off(0, i + 1, jj),
            l0 = off(1, i, jj), l1 = off(1, i + 1, jj);
        idx.push(u0, l0, l1, u0, l1, u1);
      });
    }
    [0, NR].forEach(function (ii) {
      for (j = 0; j < NC; j++) {
        var a = off(0, ii, j), b = off(0, ii, j + 1),
            c = off(1, ii, j), d = off(1, ii, j + 1);
        idx.push(a, b, d, a, d, c);
      }
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /* 一圈叶片（InstancedMesh，1 个 draw call） */
  function bladeRow(geo, mat, n, x, grp, phase) {
    var im = new T.InstancedMesh(geo, mat, n);
    var m = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(1, 1, 1);
    var AX = new T.Vector3(1, 0, 0), i;
    for (i = 0; i < n; i++) {
      q.setFromAxisAngle(AX, (i / n) * TAU + (phase || 0));
      m.compose(v.set(0, 0, 0), q, sc);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.position.x = x;
    im.castShadow = true; im.receiveShadow = true;
    grp.add(im);
    return im;
  }

  /* 沿 X 轴的圆盘 / 轴 */
  function diskX(r, thick, mat, seg) {
    var g = new T.CylinderGeometry(r, r, thick, seg || 28);
    g.rotateZ(PI / 2);
    return new T.Mesh(g, mat);
  }

  function buildFan(fanBladeGeo) {
    var g = new T.Group(); g.position.x = -16.65;
    /* 22 片宽弦风扇叶片（真实 .glb 翼型，略缩 0.985 留叶尖间隙） */
    var fg = fanBladeGeo.clone();
    fg.scale(.985, .985, .985);
    var im = bladeRow(fg, MAT.titan, 22, 0, g, 0);
    K.tag(im, '宽弦风扇叶片 ×22', '钛合金宽弦、带扭转与后掠；外涵推力的主要来源');
    var hub = diskX(1.62, 1.75, MAT.disk, 32); hub.castShadow = true; g.add(hub);
    var hubCap = diskX(.85, 1.95, MAT.titan, 24); g.add(hubCap);
    /* 风扇挂在发动机根组而非 core：整机外观态也要能从进气口看到它 */
    O.eng.add(g);
    O.fanRotor = g;
  }

  function buildStators(parent) {
    /* 静子（不转）：转子级之间的导流叶片，颜色更暗、相位错开 */
    var defs = [
      [-11.5, 2.55, 26], [-10.2, 2.48, 26], [-8.9, 2.40, 26],
      [-7.1, 2.30, 30], [-6.05, 2.24, 30], [-5.0, 2.18, 30],
      [-3.95, 2.11, 30], [-2.9, 2.04, 30], [-2.0, 1.98, 30],
      [-1.2, 1.93, 30], [-0.55, 1.88, 30],
      [4.55, 2.30, 28], [6.9, 2.34, 28], [8.1, 2.40, 28],
      [9.3, 2.45, 28], [10.5, 2.50, 28]
    ];
    defs.forEach(function (d) {
      var geo = bladeGeo(.72, d[1], .52, 22, 10, .16, .10);
      bladeRow(geo, MAT.stator, d[2], d[0], parent, PI / d[2]);
    });
  }

  function buildCore() {
    var core = new T.Group(); O.core = core;
    var lp = new T.Group(), hp = new T.Group(), fixed = new T.Group();
    O.lpRotor = lp; O.hpRotor = hp;
    core.add(lp, hp, fixed);

    /* 同心双转子：LP 细长贯穿，HP 套筒只在中段 —— 两端露出 LP 轴，读出套轴关系 */
    var shaftLp = diskX(.42, 31, MAT.shaft, 20); shaftLp.position.x = -2; lp.add(shaftLp);
    var shaftHp = diskX(.95, 14.2, MAT.shaftHp, 24); shaftHp.position.x = -1; hp.add(shaftHp);
    [ -8.2, 6.0 ].forEach(function (x) {
      var col = diskX(1.15, .55, MAT.disk, 24); col.position.x = x; hp.add(col);
    });

    /* 低压压气机（增压级）3 级 + 高压压气机 9 级：逐级缩径 */
    var compStages = [
      [-11.9, 2.72], [-10.6, 2.62], [-9.3, 2.52],
      [-7.5, 2.38], [-6.45, 2.31], [-5.4, 2.24], [-4.35, 2.17],
      [-3.3, 2.10], [-2.4, 2.03], [-1.65, 1.96], [-0.95, 1.90], [-0.30, 1.84]
    ];
    compStages.forEach(function (d, k) {
      var target = k < 3 ? lp : hp;
      var geo = bladeGeo(.72, d[1], .62, 34, 12, .22, .115);
      bladeRow(geo, MAT.rotor, 28, d[0], target, 0);
      var dk = diskX(.74, .28, MAT.disk, 24); dk.position.x = d[0]; target.add(dk);
    });

    /* 环形燃烧室：半剖壳体 + 断面 + 燃油喷嘴 + 火焰 */
    var COMB = [
      [.20, 2.30], [.45, 2.46], [1.6, 2.50], [2.9, 2.40], [3.25, 2.20],
      [3.25, 1.48], [2.9, 1.52], [1.6, 1.56], [.45, 1.50], [.20, 1.62]
    ];
    var cw = new T.Mesh(lathe(COMB, PI, PI, 44), MAT.hot);
    cw.castShadow = true; cw.receiveShadow = true; fixed.add(cw);
    K.tag(cw, '环形燃烧室', '燃油与高压空气混合燃烧，环形火焰筒缩短发动机长度');
    var cg = capGeo(COMB, .13);
    var ct = new T.Mesh(cg, MAT.cutFace), cb = new T.Mesh(cg, MAT.cutFace);
    cb.scale.y = -1; fixed.add(ct, cb);
    /* 燃油喷嘴：沿半圈布置 12 个 */
    for (var nz = 0; nz < 12; nz++) {
      var a = PI + (nz + .5) / 12 * PI;
      var noz = diskX(.13, .62, MAT.dark, 10);
      noz.position.set(.30, 1.98 * Math.cos(a), 1.98 * Math.sin(a));
      fixed.add(noz);
    }

    /* 高压涡轮 2 级 + 低压涡轮 5 级：叶片带热障涂层色 */
    var turb = [
      [3.95, 2.28, hp], [5.05, 2.32, hp],
      [6.35, 2.34, lp], [7.55, 2.40, lp], [8.75, 2.45, lp],
      [9.95, 2.50, lp], [11.15, 2.54, lp]
    ];
    turb.forEach(function (d) {
      var geo = bladeGeo(.85, d[1], .78, 30, 16, .26, .14);
      bladeRow(geo, MAT.bladeHot, 32, d[0], d[2], 0);
      var dk = diskX(.88, .34, MAT.disk, 24); dk.position.x = d[0]; d[2].add(dk);
    });

    buildStators(fixed);
    buildFlame(fixed);

    /* 涡轮后支撑 / 混合段加强环 */
    [13.0, 15.2].forEach(function (x) {
      var ring = new T.Mesh(new T.TorusGeometry(1.85, .10, 8, 40), MAT.dark);
      ring.rotation.y = PI / 2; ring.position.x = x; fixed.add(ring);
    });

    core.traverse(function (o) {
      if (o.isMesh || o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    /* 认件标签打在总成组上 */
    K.tag(lp, '低压转子 N1', '风扇 + 增压级 + 低压涡轮共轴，转速低、驱动外涵风扇');
    K.tag(hp, '高压转子 N2', '高压压气机 + 高压涡轮共轴，套在 LP 轴外，转速约为 N1 的 2.6 倍');
    K.tag(fixed, '静子与燃烧室', '不随转子转动：导流叶片、火焰筒、喷嘴与机匣支撑');

    O.eng.add(core);
  }

  /* ── 火焰：多层软 sprite（径向羽化，不是实体环，放大后不会读成一块亮板） ──
     基准：氯化钠课踩过"实体火环近景像贴片/亮板"，改成 sprite + alphaMap 羽化。 */
  function flameTex() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(.35, 'rgba(255,255,255,.72)');
    g.addColorStop(.72, 'rgba(255,255,255,.22)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }
  function buildFlame(parent) {
    var tex = flameTex(), i, a;
    var sprites = [];
    /* 只在 +z 剖开侧排布，沿燃烧室环形截面分上下两带 */
    for (i = 0; i < 22; i++) {
      a = (i / 22) * TAU;
      var x = .75 + (i % 5) * .43;
      var yy = 1.95 * Math.cos(a), zz = 1.95 * Math.sin(a);
      if (zz < .05) continue;                    /* 只留剖开侧 */
      for (var L = 0; L < 2; L++) {
        var mat = new T.SpriteMaterial({
          map: tex, color: L === 0 ? 0xff6a18 : 0xffc44e,
          transparent: true, depthWrite: false,
          blending: T.AdditiveBlending, opacity: L === 0 ? .52 : .38
        });
        var sp = new T.Sprite(mat);
        var sz = (1.75 + Math.random() * .85) * (L === 0 ? 1 : .66);
        sp.scale.set(sz, sz, 1);
        sp.position.set(x + (Math.random() - .5) * .3, yy, zz);
        sp.renderOrder = 5 + L;
        sp.userData.op0 = mat.opacity;         /* 点火渐亮时的基准不透明度 */
        parent.add(sp); sprites.push({ sp: sp, ph: Math.random() * TAU, base: sz });
      }
    }
    O.flame = { sprites: sprites };
    O.flameLight = new T.PointLight(0xff8a34, .95, 18);
    O.flameLight.position.set(1.7, 0, 1.0); parent.add(O.flameLight);
  }

  /* ── 气流粒子：外涵冷流 + 核心热流，颜色沿程由冷到热 ── */
  function coreR(x) {
    if (x < -12) return 2.75;
    if (x < -2) return 2.75 - (x + 12) / 10 * .95;
    if (x < 3) return 1.80 + (x + 2) / 5 * .42;
    if (x < 12) return 2.22 - (x - 3) / 9 * .40;
    return 1.82 - Math.min(1, (x - 12) / 12) * .95;
  }
  function mix(a, b, t) { return a + (b - a) * t; }
  function coreColor(x, out) {
    /* 进气蓝青 → 压气机青绿 → 燃烧室橙红 → 涡轮橙 → 喷口亮橙 */
    var stops = [
      [-19, .30, .82, 1.00], [-3, .42, .95, .92], [.4, 1.55, .62, .16],
      [3.2, 1.70, .72, .20], [12, 1.45, .48, .12], [24, 1.75, .88, .38]
    ], i;
    for (i = 0; i < stops.length - 1; i++) {
      if (x <= stops[i + 1][0]) {
        var a = stops[i], b = stops[i + 1];
        var t = K.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
        out[0] = mix(a[1], b[1], t); out[1] = mix(a[2], b[2], t); out[2] = mix(a[3], b[3], t);
        return;
      }
    }
    out[0] = 1.75; out[1] = .88; out[2] = .38;
  }
  function buildFlow() {
    /* 数量压到 190：近景放大时不会糊成满屏圆点，仍够读出两条流路 */
    var N = 190, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), i;
    for (i = 0; i < N; i++) {
      var bypass = i < 90;
      var xMin = bypass ? -18.6 : -18.0;
      var xMax = bypass ? 4.2 : 23.4;
      var d = {
        bypass: bypass,
        x: xMin + Math.random() * (xMax - xMin),
        xMin: xMin, xMax: xMax,
        a: Math.random() * PI,                  /* z>=0 剖开侧，能看见 */
        zf: .10 + Math.random() * .34,          /* 压扁到剖开面附近，不飘出机体轮廓 */
        q: .24 + Math.random() * .72,           /* 流道内的径向比例 */
        v: (bypass ? 7.5 : 6.0) * (.75 + Math.random() * .5)
      };
      O.pdata.push(d);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    var mat = new T.ShaderMaterial({
      uniforms: { uSize: { value: 12.0 }, uAlpha: { value: .90 } },
      vertexShader:
        'attribute vec3 color; varying vec3 vC; uniform float uSize;' +
        'void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);' +
        /* 按距离透视缩放 + 硬上限：标准机位看得见，近景不会胀成满屏气泡 */
        ' gl_PointSize=clamp(uSize*(52.0/max(1.0,-mv.z)), 1.0, 9.0);' +
        ' gl_Position=projectionMatrix*mv; }',
      fragmentShader:
        'varying vec3 vC; uniform float uAlpha;' +
        'void main(){ float d=length(gl_PointCoord-vec2(.5));' +
        ' float a=smoothstep(.5,.16,d)*uAlpha; if(a<.01) discard; gl_FragColor=vec4(vC,a); }',
      /* 剖开面上的气流是示意层，允许压在机匣之上；实体零件本身不透明，不影响立体感 */
      transparent: true, depthWrite: false, depthTest: false
    });
    O.pts = new T.Points(geo, mat);
    O.pts.frustumCulled = false;
    O.pts.renderOrder = 8;
    O.eng.add(O.pts);
  }
  function updateFlow(dt, s) {
    if (!O.pts) return;
    var pos = O.pts.geometry.attributes.position.array;
    var col = O.pts.geometry.attributes.color.array;
    var tmp = [0, 0, 0], i, sp = s.speed * (s.spin > 0 ? 1 : .18);
    for (i = 0; i < O.pdata.length; i++) {
      var d = O.pdata[i];
      d.x += dt * d.v * sp * (d.x > 3 ? 1.55 : 1);
      if (d.x > d.xMax) d.x = d.xMin + (d.x - d.xMax) * .2;
      var r;
      if (d.bypass) {
        r = 4.05 + d.q * 2.65;
        tmp[0] = mix(.26, .40, d.q); tmp[1] = mix(.68, .84, d.q); tmp[2] = 1.0;
      } else {
        r = coreR(d.x) * (.30 + .66 * d.q);
        coreColor(d.x, tmp);
      }
      pos[i * 3] = d.x;
      pos[i * 3 + 1] = r * Math.cos(d.a);
      pos[i * 3 + 2] = r * d.zf;              /* 贴近剖开面，形成清晰的流线带 */
      col[i * 3] = tmp[0]; col[i * 3 + 1] = tmp[1]; col[i * 3 + 2] = tmp[2];
    }
    O.pts.geometry.attributes.position.needsUpdate = true;
    O.pts.geometry.attributes.color.needsUpdate = true;
  }

  /* ── 点火与推力可视化 ────────────────────────────────────────────
     教学因果链要点火前后能"看出来"：冷转时无火、无羽流、推力 0；
     点火后火焰渐亮、尾喷拉出橙红射流、两条推力矢量按 78:22 伸出、
     试车台测力计从 "--" 跳到实际 kN。油门滑块全程实时联动。     */
  function buildThrustRig(G) {
    var rig = new T.Group(); O.thrustRig = rig; G.add(rig);
    var tex = flameTex(), i;

    /* ① 尾喷羽流：多层软 sprite 沿 +x 拉长，越远越淡越小 */
    O.plume = [];
    for (i = 0; i < 24; i++) {
      var t = i / 23;
      var col = i < 8 ? 0xffd06a : (i < 16 ? 0xff8734 : 0xd8562a);
      var m = new T.SpriteMaterial({
        map: tex, color: col, transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, opacity: 0
      });
      var sp = new T.Sprite(m); sp.renderOrder = 10;
      rig.add(sp);
      O.plume.push({ sp: sp, t: t, op: (.46 - .30 * t), base: 1.0 });
    }
    /* 羽流中更亮的高速核心（细窄一条） */
    O.plumeCore = [];
    for (i = 0; i < 10; i++) {
      var mc = new T.SpriteMaterial({
        map: tex, color: 0xfff0b0, transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, opacity: 0
      });
      var sc = new T.Sprite(mc); sc.renderOrder = 11;
      rig.add(sc); O.plumeCore.push({ sp: sc, t: i / 9 });
    }

    /* ①b 马赫环 —— 连续射流内的驻波激波场（不是一串独立发光球）
       真实形态：整条气柱从喷口连出来，斜激波从管壁向轴线汇聚成 X 形、
       在轴上形成马赫盘，再发散到管壁反射，周而复始；越往下游越暗、
       胞格被湍流抹平、最后消散。所以只用一个连续管状几何，
       在 fragment shader 里按「轴向相位 × 归一化径向」算出激波花纹。
       慢车压比不够时只有柔和连续羽流（uShock=0），没有激波串。   */
    function jetGeo(len, r0, r1, nx, na) {
      var pos = [], nrm = [], uv = [], idx = [], ii, jj;
      for (ii = 0; ii <= nx; ii++) {
        var t = ii / nx, r = r0 + (r1 - r0) * t;
        for (jj = 0; jj <= na; jj++) {
          var a = jj / na * TAU, ca = Math.cos(a), sa = Math.sin(a);
          pos.push(t * len, r * ca, r * sa);
          nrm.push(0, ca, sa);
          uv.push(t, jj / na);
        }
      }
      for (ii = 0; ii < nx; ii++) for (jj = 0; jj < na; jj++) {
        var A = ii * (na + 1) + jj, B = A + 1,
            C = (ii + 1) * (na + 1) + jj, D = C + 1;
        idx.push(A, B, D, A, D, C);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeBoundingSphere();
      return g;
    }
    O.mach = [];
    var jetMat = new T.ShaderMaterial({
      uniforms: {
        uT:     { value: 0 },
        uOp:    { value: 0 },     /* 连续羽流基础亮度 */
        uShock: { value: 0 },     /* 激波结构强度 = 压比门控 */
        uCells: { value: 5.5 },   /* 胞格数，压比越高间距越宽、个数越少 */
        uR:     { value: 1.55 }
      },
      vertexShader:
        'uniform float uT; uniform float uCells;' +
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
        'void main(){ vUv=uv;' +
        /* 外轮廓随胞格轻微起伏：欠膨胀射流本身就是一胀一缩的（幅度别大，否则像波浪管） */
        ' float pulse=1.0+.030*sin(uv.x*uCells*6.2831853+uT*.9);' +
        ' vec3 p=position; p.yz*=pulse; vP=p;' +
        ' vec4 mv=modelViewMatrix*vec4(p,1.0);' +
        ' vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);' +
        ' gl_Position=projectionMatrix*mv; }',
      fragmentShader:
        'uniform float uT; uniform float uOp; uniform float uShock;' +
        'uniform float uCells; uniform float uR;' +
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
        'void main(){' +
        ' float t=vUv.x; float ang=vUv.y;' +
        /* 视线与柱面夹角决定光程：中心光程长（白热）、掠射边缘光程短（暗且淡）。
           这一项是"像气体"还是"像管子"的关键，不能用硬轮廓。 */
        ' float ndv=abs(dot(normalize(vN),normalize(vV)));' +
        ' float path=pow(ndv,1.05);' +
        ' float rho=clamp(abs(vP.y)/uR,0.0,1.0);' +
        /* 径向羽化：发光气体没有"皮"，靠近管壁必须淡到看不见 */
        ' float radial=1.0-smoothstep(.62,1.0,rho);' +
        /* 湍流扰动：真实射流边缘有卷吸，相位不可能完全规整 */
        ' float wob=.075*sin(t*19.0+ang*11.0+uT*1.3)+.045*sin(t*43.0-ang*7.0-uT*2.1);' +
        ' float ph=t*uCells+wob;' +
        /* 胞格包络：一个胞格是一个整体亮团，不是无限延伸的细网格 */
        ' float cellEnv=pow(.5+.5*cos(ph*6.2831853),2.0);' +
        /* 斜激波：宽而柔的 X 形亮带（细锐线会读成光纤编织） */
        ' float w1=abs(fract(ph-rho*.62)-.5)*2.0;' +
        ' float w2=abs(fract(ph+rho*.62)-.5)*2.0;' +
        ' float shock=pow(1.0-min(w1,w2),5.0);' +
        /* 轴上马赫盘：正激波亮盘 */
        ' float dsk=pow(1.0-abs(fract(ph)-.5)*2.0,6.0)*(1.0-smoothstep(.02,.46,rho));' +
        /* 下游湍流把胞格抹平、边缘先破碎 */
        ' float turb=sin(t*41.0+ang*17.0+uT*3.1)*.5+sin(t*79.0-ang*29.0-uT*4.3)*.5;' +
        ' float mixT=smoothstep(.42,1.0,t);' +
        ' float detail=mix(1.0,.42+.58*turb,mixT);' +
        /* 沿程衰减放缓：默认机位（dist≈100）也要能读出前 3~4 个胞格 */
        ' float decay=exp(-t*1.55)*(1.0-smoothstep(.70,1.0,t));' +
        /* 胞格之间必须留出暗隙，否则整条只是均匀橙雾 */
        ' float base=.10+.16*cellEnv;' +
        ' float bright=(shock*1.25+dsk*.92)*uShock*detail*(.30+.70*cellEnv);' +
        ' float a=(base*uOp+bright)*decay*path*radial;' +
        /* 核心白热、外围橙红；激波亮带偏黄白但不刺眼 */
        ' vec3 warm=vec3(1.22,.40,.09); vec3 hot=vec3(2.02,1.62,.98);' +
        ' float heat=clamp(path*.40+(shock*.72+dsk*.62)*uShock*cellEnv,0.0,1.0);' +
        ' vec3 c=mix(warm,hot,heat);' +
        ' if(a<.008) discard; gl_FragColor=vec4(c,a); }',
      transparent: true, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending, side: T.DoubleSide
    });
    var jet = new T.Mesh(jetGeo(1, 1.55, 1.18, 120, 36), jetMat);
    jet.position.set(22.9, 0, .55);
    jet.renderOrder = 13;
    jet.userData.__machCell = 1;   /* 验证脚本据此判断激波场是否出现 */
    rig.add(jet);
    /* 外围剪切层：更宽、更淡的一层连续雾，把主气柱的边界吃掉，
       否则一条有"皮"的管子怎么看都像固体。 */
    var shearMat = new T.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uOp: { value: 0 } },
      vertexShader:
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
        'void main(){ vUv=uv; vP=position;' +
        ' vec4 mv=modelViewMatrix*vec4(position,1.0);' +
        ' vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz);' +
        ' gl_Position=projectionMatrix*mv; }',
      fragmentShader:
        'uniform float uT; uniform float uOp; varying vec2 vUv;' +
        'varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
        'void main(){ float t=vUv.x;' +
        ' float path=pow(abs(dot(normalize(vN),normalize(vV))),1.5);' +
        /* 剪切层也要径向羽化，否则自己又形成一条硬边 */
        ' float rad=1.0-smoothstep(.35,1.0,abs(vP.y)/2.25);' +
        ' float turb=.62+.38*sin(t*29.0+vUv.y*21.0+uT*2.4);' +
        ' float a=.17*uOp*exp(-t*1.55)*(1.0-smoothstep(.50,1.0,t))*path*rad*turb;' +
        ' if(a<.006) discard;' +
        ' gl_FragColor=vec4(1.20,.42,.11,a); }',
      transparent: true, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending, side: T.DoubleSide
    });
    var shear = new T.Mesh(jetGeo(1, 2.25, 2.05, 72, 28), shearMat);
    shear.position.set(22.9, 0, .55);
    shear.renderOrder = 12;
    rig.add(shear);
    O.mach.push({ g: jet, mat: jetMat, shear: shear, shearMat: shearMat });

    /* ② 热射流粒子：只在点火后出现，从尾喷口向 +x 高速喷出 */
    var N = 110, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var hd = [];
    for (i = 0; i < N; i++) {
      hd.push({
        u: Math.random(), a: Math.random() * TAU,
        q: .15 + Math.random() * .85,
        v: 17 + Math.random() * 13
      });
      col[i * 3] = 1.45; col[i * 3 + 1] = .66; col[i * 3 + 2] = .22;
    }
    var hg = new T.BufferGeometry();
    hg.setAttribute('position', new T.BufferAttribute(pos, 3));
    hg.setAttribute('color', new T.BufferAttribute(col, 3));
    var hm = new T.ShaderMaterial({
      uniforms: { uSize: { value: 11.0 }, uFade: { value: 1.0 } },
      vertexShader:
        'attribute vec3 color; varying vec3 vC; uniform float uSize;' +
        'void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);' +
        ' gl_PointSize=clamp(uSize*(52.0/max(1.0,-mv.z)),1.0,8.0);' +
        ' gl_Position=projectionMatrix*mv; }',
      fragmentShader:
        'varying vec3 vC; uniform float uFade; void main(){ float d=length(gl_PointCoord-vec2(.5));' +
        ' float a=smoothstep(.5,.14,d)*.85*uFade; if(a<.01) discard; gl_FragColor=vec4(vC,a); }',
      transparent: true, depthWrite: false, depthTest: false
    });
    O.hotParticles = new T.Points(hg, hm);
    O.hotParticles.frustumCulled = false;
    O.hotParticles.renderOrder = 12;
    O.hotParticles.userData.data = hd;
    rig.add(O.hotParticles);

    /* ③ 推力矢量：向 -x（飞机前进方向），外涵 78% / 核心 22% */
    function makeArrow(hex) {
      var mat = new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: .92 });
      var g2 = new T.Group();
      var shaft = new T.Mesh(new T.CylinderGeometry(.17, .17, 1, 10), mat);
      shaft.rotation.z = PI / 2;                 /* 局部 +y → 世界 -x */
      g2.add(shaft);
      var head = new T.Mesh(new T.ConeGeometry(.58, 1.5, 14), mat);
      head.rotation.z = PI / 2;                 /* 锥尖指向 -x */
      g2.add(head);
      rig.add(g2);
      return { g: g2, shaft: shaft, head: head, mat: mat };
    }
    O.arrows = {
      bypass: makeArrow(0x3fa8e0),
      core:   makeArrow(0xff9638)
    };
    O.arrows.bypass.g.position.set(2, -9.6, 5.2);
    O.arrows.core.g.position.set(2, -12.2, 5.2);

    /* ④ 试车台测力计：深色仪表箱 + 数显屏（屏面法线朝默认机位 +z） */
    var bx = -23.5, by = -4.4, bz = 5.0;
    var box = RM(7.2, 4.8, 1.8, .22, MAT.bench);
    box.position.set(bx, by, bz); box.castShadow = true; rig.add(box);
    var panel = RM(6.5, 4.1, .22, .12, MAT.dark);
    panel.position.set(bx, by, bz + .90 + .02); rig.add(panel);
    /* 落地支撑：不能悬空 */
    [-2.4, 2.4].forEach(function (dx) {
      var leg = RM(.8, 8.6, .8, .10, MAT.bench);
      leg.position.set(bx + dx, -15.5 + 4.3, bz); rig.add(leg);
      var foot = RM(1.5, .36, 1.5, .08, MAT.dark);
      foot.position.set(bx + dx, -15.3, bz); rig.add(foot);
    });
    /* 测力拉杆：把仪表箱与短舱前端连起来，读数才有"测到推力"的依据 */
    var rod = new T.Mesh(new T.CylinderGeometry(.13, .13, 5.0, 12), MAT.steel);
    rod.rotation.z = PI / 2; rod.position.set(-19.8, -3.1, 2.2); rig.add(rod);

    var c = document.createElement('canvas'); c.width = 320; c.height = 184;
    var texG = new T.CanvasTexture(c);
    texG.minFilter = T.LinearFilter;
    var scr = new T.Mesh(new T.PlaneGeometry(5.9, 3.4),
      new T.MeshBasicMaterial({ map: texG }));
    /* 比面板突出 0.035，避免 z-fighting 把数字吃掉 */
    scr.position.set(bx, by, bz + .90 + .02 + .11 + .035);
    rig.add(scr);
    O.gauge = { canvas: c, ctx: c.getContext('2d'), tex: texG, last: null };
    drawGauge(null);

    /* 点火步骤专用标注（onTop，避免被机匣切半截字） */
    O.labelsThrust = {
      /* 标注压在羽流正上方、靠左，避开右侧面板 */
      plume:  K.spriteLabel([26.5, 5.6, 3.4], '高速燃气射流 →', { w: 4.8, fs: 38, onTop: true }),
      mach:   K.spriteLabel([27.0, -4.8, 3.4], '马赫环 · 激波菱形', { w: 5.2, fs: 38, onTop: true }),
      fb:     K.spriteLabel([-8, -8.2, 5.2], '外涵推力 ≈78%', { w: 5.2, fs: 38, onTop: true }),
      fc:     K.spriteLabel([-4, -13.8, 5.2], '核心推力 ≈22%', { w: 5.2, fs: 38, onTop: true }),
      fwd:    K.spriteLabel([-16, -15.0, 5.2], '← 推力 / 飞机前进方向', { w: 6.2, fs: 38, onTop: true }),
      gauge:  K.spriteLabel([-23.5, -.6, 5.2], '试车台测力计', { w: 4.6, fs: 38, onTop: true })
    };
  }

  /* 数显：深底亮字 + kN，待机 "--"，只在数值变化时重绘（CanvasTexture 别每帧重画） */
  function drawGauge(v) {
    var g = O.gauge; if (!g) return;
    var txt = (v === null || v === undefined) ? '--' : v.toFixed(1);
    if (g.last === txt) return;
    g.last = txt;
    var x = g.ctx, W = g.canvas.width, H = g.canvas.height;
    x.fillStyle = '#0d1a16'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(60,160,110,.35)'; x.lineWidth = 2;
    x.strokeRect(7, 7, W - 14, H - 14);
    x.fillStyle = '#6f9a86'; x.font = '600 22px ui-monospace,Consolas,monospace';
    x.fillText('THRUST / 推力', 22, 40);
    x.fillStyle = (txt === '--') ? '#4a6b5b' : '#42ffa0';
    x.font = '700 76px ui-monospace,Consolas,monospace';
    x.fillText(txt, 22, 122);
    x.fillStyle = '#6f9a86'; x.font = '600 26px ui-monospace,Consolas,monospace';
    x.fillText('kN', 240, 122);
    x.fillStyle = (txt === '--') ? '#3c5a4a' : '#2fbf7a';
    x.fillRect(22, 146, (txt === '--' ? 40 : 210), 8);
    g.tex.needsUpdate = true;
  }

  /* 推力矢量长度：外涵 : 核心 = 78 : 22 */
  function setArrow(a, L) {
    var l = Math.max(.01, L);
    a.shaft.scale.y = l;
    a.shaft.position.x = -l / 2;
    a.head.position.x = -l - .75;
  }

  /* ── 标注（onTop 避免被实心机匣切掉半截字） ── */
  function buildLabels() {
    /* 上下交错 + 高度分层，避免沿 x 排成一串后透视投影挤成一团 */
    var OUT = {
      lip:    K.spriteLabel([-18.2, 10.4, 3.4], '进气唇口', { w: 3.6, fs: 38, onTop: true }),
      fan:    K.spriteLabel([-17.4, 1.6, 8.2], '宽弦风扇 ×22', { w: 4.6, fs: 38, onTop: true }),
      nac:    K.spriteLabel([-8.0, 10.6, 2.6], '短舱 / 外涵道', { w: 4.8, fs: 38, onTop: true }),
      pylon:  K.spriteLabel([0.5, 15.6, 1.0], '发动机挂架', { w: 4.2, fs: 38, onTop: true }),
      noz:    K.spriteLabel([19.0, 7.4, 3.0], '尾喷管', { w: 3.4, fs: 38, onTop: true }),
      cone:   K.spriteLabel([21.5, -5.4, 3.0], '排气中心锥', { w: 4.4, fs: 38, onTop: true })
    };
    var IN = {
      lpc:    K.spriteLabel([-12.5, 6.4, 3.4], '低压压气机 3 级', { w: 4.4, fs: 36, onTop: true }),
      hpc:    K.spriteLabel([-5.2, -6.2, 3.4], '高压压气机 9 级', { w: 4.4, fs: 36, onTop: true }),
      comb:   K.spriteLabel([1.8, 7.6, 3.4], '环形燃烧室', { w: 3.8, fs: 36, onTop: true }),
      hpt:    K.spriteLabel([5.2, -6.2, 3.4], '高压涡轮 2 级', { w: 4.2, fs: 36, onTop: true }),
      lpt:    K.spriteLabel([10.6, 6.4, 3.4], '低压涡轮 5 级', { w: 4.2, fs: 36, onTop: true }),
      shaft:  K.spriteLabel([-0.8, -9.4, 3.4], '同心双转子 N1 / N2', { w: 4.8, fs: 36, onTop: true }),
      bypass: K.spriteLabel([-7.4, 11.4, 3.4], '外涵冷气流', { w: 4.0, fs: 36, onTop: true }),
      coref:  K.spriteLabel([16.4, -3.0, 3.4], '核心热气流', { w: 4.0, fs: 36, onTop: true })
    };
    O.labels = { outer: OUT, inner: IN };
  }

  /* ── 场景 ── */
  var scene = {
    setup: function () {
      var G = (K.world ? K.world() : K.scene());
      /* 车间压暗一档：背景渐变给深冷灰，环境光/主光再收，避免白涂装冲爆 */
      K.envShop({ groundY: -15.5, top: '#7d8893', mid: '#66717c', bot: '#4e5964' });
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .42;
        else if (o.isDirectionalLight) o.intensity *= .66;
        /* 车间两条黄色横带会从羽流下方穿过，被马赫环暗隙切成一排
           "黄色贴片"，放大后像模型穿帮：工位安全黄线 0xd9b33e +
           后墙墙裙分界压条 0xc8b23f。点火步骤收起，前两步保留车间身份。 */
        if (o.isMesh && o.material && o.material.color) {
          var hx = o.material.color.getHex();
          if (hx === 0xd9b33e || hx === 0xc8b23f) O.yellowLines.push(o);
        }
      });
      /* 台面/鞍座颗粒贴图（复用引擎程序化贴图，纯色大平面近景必糊） */
      try {
        var kitM = K.M && K.M();
        if (kitM && kitM.benchTop && kitM.benchTop.map) {
          MAT.benchTop.map = kitM.benchTop.map; MAT.benchTop.needsUpdate = true;
        }
      } catch (e) { }
      buildStand(G);
      /* 剖切内部补光：从 +z 前方斜打进来，否则核心机发黑 */
      var f1 = new T.DirectionalLight(0xffffff, .34); f1.position.set(6, 12, 22); K.scene().add(f1);
      var f2 = new T.DirectionalLight(0xdfe8ff, .14); f2.position.set(-12, 6, 18); K.scene().add(f2);

      buildBackdrop(G);
      var eng = new T.Group(); G.add(eng); O.eng = eng;
      buildCore();          /* 内部核心机（程序化，同步完成） */
      loadShell();          /* 外观件（GLB，异步 parse 后挂载） */
      buildFlow();
      buildThrustRig(G);
      buildLabels();
    },

    update: function (dt, s) {
      s.t += dt;

      /* 后处理终合：SSAO 兼主渲染通道，先补 RenderPass 再关掉它；
         并把车间曝光压到 .74（.9 会把深色台面冲成浅绿） */
      if (!s._pf && s.t > .6 && window.__labDebug && window.__labDebug.composer) {
        s._pf = 1;
        var DBG = window.__labDebug, CP = DBG.composer;
        CP.passes.unshift(new T.RenderPass(DBG.scene, DBG.camera));
        CP.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
        CP.passes.forEach(function (p) {
          if (p.uniforms && p.uniforms.uExposure) p.uniforms.uExposure.value = .52;
        });
      }

      /* 点火缓动：_glow 是"燃烧建立"的 0→1 过程，不是瞬间开关 */
      var glowTarget = s.ignited > .5 ? 1 : 0;
      s._glow += (glowTarget - s._glow) * Math.min(1, dt * 1.5);
      if (Math.abs(glowTarget - s._glow) < .004) s._glow = glowTarget;
      var glow = s._glow, q = K.clamp(s.throttle / 100, 0, 1);
      /* 推力缓慢跟随（发动机有惯性，读数不会瞬跳） */
      var fTarget = thrustOf(s);
      s._thr += (fTarget - s._thr) * Math.min(1, dt * 2.0);
      var F = s._thr, fN = K.clamp(F / F_MAX, 0, 1);

      /* 双转子差速：N2 / N1 = 2.6；点火后转速随油门上升 */
      var spinQ = (s._labSet === 'thrust')
        ? (.35 + .65 * q * (.4 + .6 * glow)) * (s.ignited > .5 ? 1 : .55)
        : s.speed;
      if (s.spin > 0) {
        s.lp += dt * 1.05 * spinQ;
        s.hp += dt * 1.05 * spinQ * 2.6;
      }
      if (O.lpRotor) O.lpRotor.rotation.x = s.lp;
      if (O.hpRotor) O.hpRotor.rotation.x = s.hp;

      /* 火焰：冷转全灭；点火后随 _glow 渐亮，油门越大越旺 */
      if (O.flame && O.flame.sprites) {
        for (var fi = 0; fi < O.flame.sprites.length; fi++) {
          var FL = O.flame.sprites[fi];
          var pulse = 1 + .13 * Math.sin(s.t * 6.2 + FL.ph) + .06 * Math.sin(s.t * 13 + FL.ph);
          var sz = FL.base * pulse * (.55 + .65 * q) * (.35 + .65 * glow);
          FL.sp.scale.set(sz, sz, 1);
          FL.sp.visible = glow > .02;
          FL.sp.material.opacity = FL.sp.userData.op0 * glow * (.5 + .5 * q);
        }
        if (O.flameLight) O.flameLight.intensity = (0.25 + 1.15 * q) * glow * (1 + .12 * Math.sin(s.t * 8.4));
      }

      /* 推力可视化只在点火步骤出现 */
      var thrustStep = (s._labSet === 'thrust');
      O.yellowLines.forEach(function (m) { m.visible = !thrustStep; });
      if (O.thrustRig) {
        O.thrustRig.visible = thrustStep;
        /* 羽流：长度随推力，颜色与透明度随油门 */
        var len = 2 + 17 * fN * q;
        /* 马赫环门控：喷口压比够（油门>42%）且真有推力才出现 */
        var gate = K.clamp((q - .42) / .26, 0, 1) * glow * (F > 8 ? 1 : 0);
        /* 喷口根部的一层柔光：只覆盖射流前段，远处让位给连续激波场，
           否则连续橙雾会把菱形暗隙糊平。 */
        O.plume.forEach(function (P) {
          var px = 22.6 + P.t * len * .55;
          var rad = (2.5 - 1.5 * P.t) * (.55 + .45 * q);
          var fade = gate > .05 ? 1 - .72 * P.t : 1;
          P.sp.position.set(px, 0, 1.2 + .8 * P.t);
          P.sp.scale.set(rad, rad, 1);
          P.sp.material.opacity = P.op * glow * q * fade * .72 * (1 + .12 * Math.sin(s.t * 9 + P.t * 12));
          P.sp.visible = glow > .02 && q > .01;
        });
        O.plumeCore.forEach(function (P) {
          var px = 22.6 + P.t * len * .45;
          var rad = (1.25 - .8 * P.t) * (.5 + .5 * q);
          var fade2 = gate > .05 ? 1 - .80 * P.t : 1;
          P.sp.position.set(px, 0, 1.0);
          P.sp.scale.set(rad, rad, 1);
          P.sp.material.opacity = .30 * glow * q * (1 - P.t * .7) * fade2;
          P.sp.visible = glow > .02 && q > .01;
        });
        /* 连续射流：一条气柱从喷口连出来，长度/胞格间距随压比变化。
           慢车 uShock=0 → 只有均匀羽流、没有激波串；压比够才浮出 X 形驻波。 */
        if (O.mach.length) {
          var J = O.mach[0], u = J.mat.uniforms;
          var jetLen = 8 + 16 * q * (.55 + .45 * fN);
          J.g.visible = glow > .10 && q > .01;
          J.g.scale.set(jetLen, 1 + .22 * q, 1 + .22 * q);
          J.g.position.set(22.9, 0, .55);
          if (J.shear) {
            J.shear.visible = J.g.visible;
            J.shear.scale.set(jetLen * .92, 1 + .18 * q, 1 + .18 * q);
            J.shearMat.uniforms.uT.value = s.t;
            J.shearMat.uniforms.uOp.value = glow * q;
          }
          u.uT.value = s.t;
          u.uOp.value = glow * q;
          u.uShock.value = gate;
          /* 射流变长 + 胞格数变少 = 间距随压比变宽，与真机一致 */
          u.uCells.value = 6.3 - 1.9 * q;
          u.uR.value = 1.55 * (1 + .22 * q);
        }
        /* 热射流粒子：点火后从尾喷口高速喷出 */
        var hp = O.hotParticles;
        hp.visible = glow > .05 && q > .01;
        /* 马赫环出现时把热粒子压暗到 35%，避免橙点糊掉激波菱形 */
        hp.material.uniforms.uFade.value = gate > .05 ? .35 : 1.0;
        if (hp.visible) {
          var pa = hp.geometry.attributes.position.array, hd = hp.userData.data;
          for (var hi = 0; hi < hd.length; hi++) {
            var D = hd[hi];
            D.u += dt * D.v * q / (10 + 16 * q);
            if (D.u > 1) D.u -= 1;
            var hx = 22.6 + D.u * (10 + 20 * q);
            var rr = (.4 + 1.5 * D.q) * (1 - .45 * D.u);
            pa[hi * 3] = hx;
            pa[hi * 3 + 1] = rr * Math.cos(D.a);
            pa[hi * 3 + 2] = rr * Math.sin(D.a) + 1.1;
          }
          hp.geometry.attributes.position.needsUpdate = true;
        }
        /* 两条推力矢量：78 : 22；冷转（F≈0）时整组收起，避免"没推力却有箭头" */
        var hasF = F > .5;
        O.arrows.bypass.g.visible = hasF;
        O.arrows.core.g.visible = hasF;
        setArrow(O.arrows.bypass, 1.5 + 15 * fN);
        setArrow(O.arrows.core, 1.0 + 4.2 * fN);
        O.arrows.bypass.mat.opacity = .25 + .7 * fN;
        O.arrows.core.mat.opacity = .25 + .7 * fN;
        /* 测力计数显：冷转 "--"，点火后跳实际 kN */
        drawGauge(s.ignited > .5 && q > .01 ? F : null);
      }
      if (O.labelsThrust) {
        Object.keys(O.labelsThrust).forEach(function (k) {
          var L = O.labelsThrust[k];
          if (!L || !L.sprite) return;
          /* 推力相关标注只在真有推力时出现；测力计与前进方向标注常驻 */
          var needF = (k === 'fb' || k === 'fc' || k === 'plume');
          /* 马赫环标注只在真的出现马赫环时显示（油门 >42% 且有推力） */
          if (k === 'mach') {
            L.sprite.visible = thrustStep && q > .5 && F > 8 && glow > .1;
          } else {
            L.sprite.visible = thrustStep && (!needF || F > .5);
          }
        });
      }

      /* 外观 / 剖切切换（两套真实几何硬切，不用全透明壳） */
      var cut = s.cut > .5;
      if (O.glbReady) {
        O.full.forEach(function (g) { g.visible = !cut; });
        O.half.forEach(function (g) { g.visible = cut; });
        /* 挂架与整圈装饰件在剖切态收起：整圈环会浮在剖开的半壳前，读成悬空零件 */
        if (O.shells['PYLON']) O.shells['PYLON'].visible = !cut;
        ['LIPRING', 'SEAM_0', 'SEAM_1', 'SEAM_2', 'FANBOLTS'].forEach(function (n) {
          var o = O.shells[n]; if (o) o.visible = !cut;
        });
        /* 机匣分离：核心机机匣与尾喷沿 +x 抽出（真实大修分解方向，不穿台面） */
        var ex = K.clamp(s.explode / 100, 0, 1);
        ['CORECOWL_HALF', 'NOZZLE_HALF'].forEach(function (n) {
          var o = O.shells[n]; if (o) o.position.x = 8.5 * ex;
        });
        var cc = O.shells['CORECOWL_FULL']; if (cc) cc.position.x = 0;
      }
      if (O.core) O.core.visible = cut;
      if (O.backdrop) O.backdrop.visible = cut;
      if (O.pts) O.pts.visible = cut && s.flow > .5;
      if (cut && s.flow > .5) updateFlow(dt, s);

      /* 标注按步骤取舍，拆解展开时收起避免飘 */
      var LS = s._labSet || 'outer', vis = s.explode < 6;
      Object.keys(O.labels).forEach(function (set) {
        Object.keys(O.labels[set]).forEach(function (k) {
          var L = O.labels[set][k];
          if (L && L.sprite) L.sprite.visible = vis && (set === LS);
        });
      });
    }
  };

  K.boot({
    title: '高涵道比涡扇发动机 · 结构与气流',
    chip: '职业教育 · 航空发动机 · 外观 GLB 精模 + 程序化核心机',
    hint: '拖空白处旋转视角 · 滚轮缩放 · 悬停零件看名称 · 单击聚焦该零件 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    postfx: true,
    /* 斜前方机位：能看到进气口内 22 片风扇叶片与整流锥；整机缩小偏左避开右侧面板 */
    cam: { tx: 17, ty: 1.5, tz: 0, dist: 88, yaw: -.88, pitch: .26 },

    reads: [
      ['n1', '低压转子 N1'],
      ['n2', '高压转子 N2'],
      ['thr', '推力 F'],
      ['egt', '排气温度 EGT'],
      ['ff', '燃油流量'],
      ['view', '当前工况']
    ],
    values: function (s) {
      var q = K.clamp(s.throttle / 100, 0, 1);
      var on = s.ignited > .5, glow = s._glow;
      var n1 = on ? Math.round(4800 * (.35 + .65 * q * (.4 + .6 * glow)) * (s.spin > 0 ? 1 : 0))
                  : Math.round(4800 * s.speed * .35 * (s.spin > 0 ? 1 : 0));
      return {
        n1: n1 + ' r/min',
        n2: Math.round(n1 * 2.6) + ' r/min',
        thr: on && q > .01 ? (s._thr).toFixed(1) + ' kN' : '0.0 kN',
        egt: on && q > .01 ? egtOf(s) + ' °C' : '—',
        ff: on && q > .01 ? fuelOf(s).toFixed(2) + ' kg/s' : '0.00 kg/s',
        view: on ? '点火 · 油门 ' + Math.round(q * 100) + '%'
                 : (s._labSet === 'thrust' ? '冷转（未点火）' : (s.cut > .5 ? '剖切透视' : '整机外观'))
      };
    },

    steps: [
      {
        name: '整机外观',
        /* 斜前方机位：能看到进气口风扇叶片，也看到短舱外廓 */
        cam: { tx: 17, ty: 1.5, tz: 0, dist: 88, yaw: -.88, pitch: .26 },
        title: '一台涡扇发动机，外部能看到什么？',
        ask: '外涵道那股「不燃烧」的冷空气，为什么反而贡献了大部分推力？',
        body: '<p><b>先认外形：</b>最前面是<b>进气唇口</b>与<b>整流锥</b>，后面是 <b>22 片宽弦风扇</b>；' +
          '包住它们的白色<b>短舱</b>与内部的<b>核心机机匣</b>之间，就是<b>外涵道</b>。</p>' +
          '<p>本课件的外观曲面件来自程序化精模导出的 <b>.glb 真实网格</b>（带壁厚、翼型扭转、法兰螺栓与蒙皮接缝），' +
          '内部核心机则由代码按级参数化生成 —— 这是「外观精模 + 内部结构」的混合建模。</p>' +
          '<p>拖动鼠标可环绕查看；悬停任一零件会显示名称与作用，单击可聚焦。点「剖切透视」把机匣揭开。</p>',
        apply: function (s) {
          s.spin = 1; s.speed = 1; s.cut = 0; s.flow = 0; s.explode = 0;
          s.ignited = 0; s.throttle = 0; s._labSet = 'outer';
        },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 2.5, step: .1, label: '转子转速' },
          { type: 'btn', label: '剖切透视 →', onClick: function (s) { s.cut = 1; s.flow = 1; s._labSet = 'inner'; } }
        ]
      },
      {
        name: '剖切透视',
        /* 剖切态接近正对 +z 剖开面，内部结构展开得最清楚 */
        cam: { tx: 12, ty: 1.0, tz: 0, dist: 80, yaw: -.16, pitch: .30 },
        title: '剖开机匣，气流在发动机里走了哪两条路？',
        ask: '高压压气机有 9 级、涡轮只有 7 级，为什么燃气还能把压气机带得动？',
        body: '<p><b>两条流路：</b>空气经风扇后分成两股 —— ' +
          '<b>外涵冷流</b>（蓝）绕过核心机直接排出，<b>核心热流</b>（青→橙）依次经过' +
          '<b>增压级 → 高压压气机 9 级 → 环形燃烧室 → 高压涡轮 2 级 → 低压涡轮 5 级 → 尾喷管</b>。</p>' +
          '<p><b>双转子差速：</b>低压转子 N1 把风扇、增压级与低压涡轮连在一根细长轴上；' +
          '高压转子 N2 是套在它外面的空心轴，只驱动高压压气机与高压涡轮，转速约为 N1 的 <b>2.6 倍</b>。' +
          '两根轴各自工作在最佳转速，互不牵制。</p>' +
          '<p><b>为什么外涵推力占大头：</b>高涵道比涡扇把同样多的能量交给<b>更大质量、更低速度</b>的空气，' +
          '推进效率更高、也更省油、更安静 —— 现代客机几乎全用这种布局。</p>' +
          '<p>用「机匣分离」把核心机机匣沿轴向抽出，观察内部各级；悬停零件可读名称与作用。</p>',
        apply: function (s) {
          s.spin = 1; s.speed = 1; s.cut = 1; s.flow = 1; s.explode = 0;
          s.ignited = 0; s.throttle = 0; s._labSet = 'inner';
        },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 2.5, step: .1, label: '转子转速' },
          { type: 'btn', label: '气流 开 / 关', onClick: function (s) { s.flow = s.flow > .5 ? 0 : 1; } },
          { type: 'range', key: 'explode', min: 0, max: 100, step: 2, label: '机匣分离（%）' },
          { type: 'btn', label: '点火 · 看推力 →', onClick: function (s) { s.ignited = 1; s.throttle = 70; s._labSet = 'thrust'; } },
          { type: 'btn', label: '← 整机外观', onClick: function (s) { s.cut = 0; s.flow = 0; s.explode = 0; s._labSet = 'outer'; } }
        ]
      },
      {
        name: '点火 · 推力',
        /* 拉远并略偏右：尾喷羽流（x≈40）与左前方测力计（x≈-23）都要入画 */
        /* 整体左移：尾喷马赫环整串要避开右侧面板，测力计仍在左边缘内 */
        cam: { tx: 22, ty: 1.0, tz: 0, dist: 100, yaw: -.10, pitch: .26 },
        title: '点火之后，推力到底从哪来？',
        ask: '为什么外涵道那股不燃烧的冷空气，贡献了近八成推力？',
        body: '<p><b>先看点「点火」：</b>燃烧室火焰亮起、排气温度 EGT 上升、尾喷拉出橙红的高速燃气射流，' +
          '试车台测力计从 <code>--</code> 跳到实际 <b>kN</b> 读数 —— 这就是<b>反作用推力</b>。</p>' +
          '<p><b>推油门：</b>燃油流量、转子转速、EGT、羽流长度与推力读数一起上升；' +
          '熄火则全部归零，只剩冷转。发动机不会瞬间到满推力，读数有惯性、是缓变上去的。</p>' +
          '<p><b>两条推力矢量：</b>外涵冷流量大、增速小，核心热流量小、增速大。' +
          '按 <code>F = ṁ · (V出 − V进)</code>，涵道比 10:1 的涡扇里外涵仍贡献 <b>≈78%</b> 推力，' +
          '而且推进效率更高、更省油、更安静。</p>' +
          '<p><b>把油门推过 50%，看尾喷：</b>会出现一串明暗相间的菱形 —— <b>马赫环</b>（激波胞格）。' +
          '喷口内外压差让超声速射流里的斜激波在轴线上反复交汇、反射，形成正激波「马赫盘」；' +
          '油门越大、压差越大，环的间距越宽、个数越多。慢车时压比不够，一串都不会出现，' +
          '这跟真机试车时看到的现象一致。</p>' +
          '<p>试着把油门从 0 推到 100，观察测力计读数、两条箭头长度与马赫环的变化。</p>',
        apply: function (s) {
          /* 进入点火步骤先保持冷转，让学生亲手点火、亲手推油门 */
          s.spin = 1; s.speed = 1; s.cut = 1; s.flow = 1; s.explode = 0;
          s.ignited = 0; s.throttle = 0; s._labSet = 'thrust';
        },
        controls: [
          { type: 'btn', label: '点火 / 熄火', onClick: function (s) {
              s.ignited = s.ignited > .5 ? 0 : 1;
              if (s.ignited > .5 && s.throttle < 25) s.throttle = 25;   /* 点火给慢车油门 */
            } },
          { type: 'range', key: 'throttle', min: 0, max: 100, step: 1, label: '油门（%）',
            onChange: function (s) { if (s.ignited < .5 && s.throttle > 0) s.ignited = 1; } },
          { type: 'btn', label: '满推力 / 慢车', onClick: function (s) {
              s.ignited = 1; s.throttle = s.throttle > 85 ? 25 : 100;
            } },
          { type: 'btn', label: '气流 开 / 关', onClick: function (s) { s.flow = s.flow > .5 ? 0 : 1; } },
          { type: 'btn', label: '← 剖切透视', onClick: function (s) {
              s.ignited = 0; s.throttle = 0; s._labSet = 'inner';
            } }
        ]
      }
    ],

    quiz: function (s) {
      var bank = [
        {
          q: '高涵道比涡扇发动机里，大部分推力来自哪一股气流？',
          opts: ['外涵道冷气流', '核心机燃气', '尾喷管内壁', '挂架反作用力'],
          ans: '外涵道冷气流',
          why: '风扇把大量空气以较低速度从外涵道排出，推进效率高于少量高速燃气；现代客机涡扇的外涵推力约占总推力 80%。'
        },
        {
          q: '双转子涡扇中，高压转子 N2 的转速与低压转子 N1 相比？',
          opts: ['更高（约 2.6 倍）', '相同', '只有一半', '完全无关'],
          ans: '更高（约 2.6 倍）',
          why: '高压压气机叶轮直径小、需要更高线速度才能达到设计压比；N2 是套在 LP 轴外的空心轴，独立以更高转速运转。'
        },
        {
          q: '剖切模型里只把 +z 半面壳体去掉、内部转子保持完整，是为了什么？',
          opts: ['看清内部结构又不破坏装配关系', '省三角面', '让模型变透明', '方便上色'],
          ans: '看清内部结构又不破坏装配关系',
          why: '全透明壳会让转子像浮在空中，直接隐藏壳体又变成零件堆；实心半剖 + 有壁厚的断面才能同时给出遮挡、接触与装配线索。'
        },
        {
          q: '核心机机匣分解时沿 +x（轴向）抽出，而不是往下沉，原因是？',
          opts: ['装配方向如此，且不会穿过托架', '轴向颜色更好看', '往下更快', '没有区别'],
          ans: '装配方向如此，且不会穿过托架',
          why: '拆解方向必须物理可行：真实大修是沿发动机轴线把核心机从短舱里抽出，往下沉会穿进 V 形托架与台面。'
        },
        {
          q: '冷转（未点火）时，发动机有推力吗？',
          opts: ['没有，测力计读数为零', '有，等于慢车推力', '有，来自风扇', '取决于油门'],
          ans: '没有，测力计读数为零',
          why: '冷转只有起动机带转，燃烧室不供油不燃烧，尾喷没有能量加入，ṁ·ΔV≈0，测力计读数为零。点火后才有净推力。'
        },
        {
          q: '涵道比 10:1 的涡扇，外涵冷流为什么贡献约 78% 推力？',
          opts: ['质量流量大，推进效率更高', '冷空气密度大', '外涵有燃烧室', '核心机不产生推力'],
          ans: '质量流量大，推进效率更高',
          why: 'F=ṁ·ΔV。外涵质量流量约 10 倍于核心机，用较小的增速就能获得大推力；把能量交给更多空气、更低喷速，推进效率最高。'
        },
        {
          q: '尾喷后出现的一串菱形亮斑（马赫环），成因是什么？',
          opts: ['超声速射流中斜激波反复交汇反射', '燃油燃烧不均匀', '风扇叶片的反光', '尾喷管被烧红'],
          ans: '超声速射流中斜激波反复交汇反射',
          why: '喷口内外压差使射流欠膨胀，斜激波在轴线上交汇形成正激波马赫盘并再次反射，沿程重复就成一串菱形胞格；压比不够（慢车）时不会出现。'
        }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
