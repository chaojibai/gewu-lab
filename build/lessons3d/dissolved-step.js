/* 格物实验室 · 氯化钠溶于水的微观过程
   鲁教版九年级上册 · 第三单元 溶液 · 第一节 溶液的形成
   主线：盐晶 + 水 → 水分子是"小磁针"（δ+ / δ-）→ 包围晶体表面（O 朝 Na⁺ · H 朝 Cl⁻）
        → 把表面离子"拽"下来、水分子裹上去（水合）→ 扩散成均一稳定的溶液
        → 通电：水合离子定向移动（导电） */
(function () {
  var T = window.THREE, K = window.Lab;

  /* ================= 尺度：按真实离子半径 / 原子半径换算（1 Å = S 场景单位） ================= */
  var S = 1.50;
  var R_NA = 1.02 * S;                 /* Na⁺ 离子半径 1.02 Å */
  var R_CL = 1.81 * S;                 /* Cl⁻ 离子半径 1.81 Å */
  /* 画的时候用"教学示意"的离子尺度：真实半径比 1.77:1，Cl⁻ 会把 Na⁺ 整个吞掉，
     看不出交替排列。这里压到 1.4:1，两者都能看清，仍保留"Cl⁻ 明显更大"的对比。 */
  var R_NA_V = 1.14, R_CL_V = 1.46;
  /* 水分子整体再缩一档：离子用了压缩尺度，水分子若按真实 Å 换算会比 Cl⁻ 还大，
     比例就反了。这里让水分子略小于 Cl⁻，读起来才像溶质被溶剂包住。 */
  var R_O = .82;
  var R_H = .55;                       /* O:H ≈ 1.5:1。H 画得太小，"哪一端朝离子"就彻底读不出来 */
  var BOND = 1.50;                     /* 键要够长，H 才能明显伸出 O 球之外、形成方向感 */
  var HALF = 104.5 / 2 * Math.PI / 180;/* 键角 104.5° */
  var HX = Math.sin(HALF) * BOND, HY = Math.cos(HALF) * BOND;
  var D = 4.35;                        /* 晶格间距：Na⁺–Cl⁻ 中心距 ≈ 2.82 Å */
  var C = new T.Vector3(0, 9.5, -2.0); /* 晶体中心 */
  var MAGX = -6.5, MAGY = 18.2;        /* 放大水分子特写的位置 */
  var NW = 68;                         /* 水分子个数 */

  /* 两个代表离子的四个"站位"：脱离晶体 → 并排展示水合壳 → 扩散开 */
  var P_NA_PEEL = new T.Vector3(8.8, 3.0, -0.4);
  var P_CL_PEEL = new T.Vector3(-9.8, 15.6, -0.4);
  var P_NA_SHELL = new T.Vector3(-6.2, 9.6, 3.6);
  var P_CL_SHELL = new T.Vector3(6.6, 9.2, 3.6);
  var P_NA_SPREAD = new T.Vector3(-11.5, 6.8, 0.8);
  var P_CL_SPREAD = new T.Vector3(10.5, 13.8, -1.2);

  var st = { t: 0 };

  /* V = 当前显示值，TG = 目标值（缓动，避免步骤切换时突跳） */
  var V = { att: 0, peel: 0, shell: 0, spread: 0, field: 0, mag: 0, polar: 0 };
  var TG = { att: 0, peel: 0, shell: 0, spread: 0, field: 0, mag: 0, polar: 0 };
  var SPD = { att: 1.6, peel: 1.35, shell: 1.6, spread: 1.0, field: 1.7, mag: 3.2, polar: 2.4 };

  var O = {};                          /* 对象引用 */
  var ions = [], waters = [], sites = [];
  var stat = { gone: 0, na: 0, cl: 0, done: 0 };

  /* 复用临时量，避免每帧新建 */
  var _m4 = new T.Matrix4(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion();
  var _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3();
  var _e1 = new T.Euler(), _ONE = new T.Vector3(1, 1, 1), _UP = new T.Vector3(0, 1, 0);
  var _H1L = new T.Vector3(-HX, -HY, 0), _H2L = new T.Vector3(HX, -HY, 0);
  var _ZERO = new T.Matrix4().makeScale(0, 0, 0);

  /* ================= 背景：换掉实验室，做成"水里"的淡青空间 ================= */
  function backdrop() {
    var sc = K.scene();
    sc.children.forEach(function (o) {
      if (o.isLight || o.isGroup) return;
      if (o.isMesh) o.visible = false;
    });
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    /* 径向：中心亮、四周沉，读作"一束光打进水里"。
       底色比原先压深一档：白色 H 原子在近白背景上会"化掉"，需要一点冷色衬底。 */
    var g = x.createRadialGradient(128, 92, 16, 132, 120, 220);
    g.addColorStop(0, '#f3fbff');
    g.addColorStop(.45, '#e1f0fa');
    g.addColorStop(.78, '#cbe1f1');
    g.addColorStop(1, '#b6d2e6');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    var tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    sc.background = tex;
    /* 远处水分子淡入背景，形成"深水"的层次 */
    sc.fog = new T.Fog(0xcbe1f1, 44, 108);
    /* 微观演示不需要投影，关掉省一半阴影开销，也避免球面上出现自阴影脏边 */
    sc.children.forEach(function (o) {
      if (o.isHemisphereLight) {
        o.intensity = .92; o.color.setHex(0xf2faff); o.groundColor.setHex(0x9dbfd9);
      } else if (o.isDirectionalLight) {
        o.castShadow = false;
        if (o.position.y > 60) { o.position.set(34, 62, 44); o.intensity = 1.22; o.color.setHex(0xfff6e8); }
        else { o.intensity = .52; o.color.setHex(0xd8eaff); }
      }
    });
  }

  /* ================= 实例化池 ================= */
  function inst(geo, mat, n) {
    var m = new T.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false;
    var i;
    for (i = 0; i < n; i++) m.setMatrixAt(i, _ZERO);
    m.instanceMatrix.needsUpdate = true;
    K.scene().add(m);
    return m;
  }

  function setInst(mesh, i, pos, quat, scale) {
    _m4.compose(pos, quat, scale);
    mesh.setMatrixAt(i, _m4);
  }

  /* 两点之间的圆柱（球棍模型的"棍"）：几何体是半径 1、高 1、沿 y 的圆柱。
     这里必须用独立的临时量——入参 a/b 很可能就是 _v1/_v2，共用会被覆盖。 */
  var _s1 = new T.Vector3(), _s2 = new T.Vector3(), _s3 = new T.Vector3();
  function setBond(mesh, i, a, b, r) {
    _s1.subVectors(b, a);
    var len = _s1.length();
    if (len < 1e-5) { mesh.setMatrixAt(i, _ZERO); return; }
    _q2.setFromUnitVectors(_UP, _s1.normalize());
    _s2.addVectors(a, b).multiplyScalar(.5);
    _s3.set(r, len, r);
    _m4.compose(_s2, _q2, _s3);
    mesh.setMatrixAt(i, _m4);
  }

  /* 往"静电吸引线"缓冲里写一段：两端分别着色，靠水果分子一端与离子端颜色呼应 */
  var _ac = new T.Color();
  function pushAttract(i, a, b, hexA, hexB) {
    var p = O.attractPos, c = O.attractCol, o = i * 6;
    p[o] = a.x; p[o + 1] = a.y; p[o + 2] = a.z;
    p[o + 3] = b.x; p[o + 4] = b.y; p[o + 5] = b.z;
    _ac.setHex(hexA); c[o] = _ac.r; c[o + 1] = _ac.g; c[o + 2] = _ac.b;
    _ac.setHex(hexB); c[o + 3] = _ac.r; c[o + 4] = _ac.g; c[o + 5] = _ac.b;
  }


  /* 一根"棍"：从 a 到 b（局部坐标，挂到 parent），用于放大特写里的球棍模型 */
  function stick(a, b, r, mat, parent) {
    var d = new T.Vector3().subVectors(b, a);
    var len = d.length();
    var m = new T.Mesh(new T.CylinderGeometry(r, r, len, 12), mat);
    m.position.copy(a).addScaledVector(d, .5);
    m.quaternion.setFromUnitVectors(_UP, d.clone().normalize());
    parent.add(m);
    return m;
  }

  /* ================= 晶体与离子 ================= */
  function buildLattice() {
    var i, j, k, sum;
    for (i = -1; i <= 1; i++) {
      for (j = -1; j <= 1; j++) {
        for (k = -1; k <= 1; k++) {
          sum = i + j + k;
          var isNa = (((sum % 2) + 2) % 2) === 0;
          ions.push({
            gx: i, gy: j, gz: k,
            isNa: isNa,
            home: new T.Vector3(C.x + i * D, C.y + j * D, C.z + k * D),
            p: new T.Vector3(C.x + i * D, C.y + j * D, C.z + k * D),
            orbit: new T.Vector3(),      /* 脱离后的落点 */
            surface: Math.abs(i) === 1 || Math.abs(j) === 1 || Math.abs(k) === 1,
            nx: i === 0 ? 0 : (i > 0 ? 1 : -1),
            ny: j === 0 ? 0 : (j > 0 ? 1 : -1),
            nz: k === 0 ? 0 : (k > 0 ? 1 : -1),
            role: 'bulk',
            a: 1,                        /* 可见度 */
            na: -1, cl: -1
          });
        }
      }
    }
    /* 两个"代表离子"：一个 Na⁺ 一个 Cl⁻，落在不同侧面，方便看清脱离过程 */
    ions.forEach(function (io) {
      if (io.gx === 1 && io.gy === -1 && io.gz === 0 && io.isNa) io.role = 'na';
      if (io.gx === -1 && io.gy === 1 && io.gz === 1 && !io.isNa) io.role = 'cl';
    });
    /* 分配实例下标 */
    var a = 0, b = 0;
    ions.forEach(function (io) {
      if (io.isNa) io.na = a++; else io.cl = b++;
    });
    O.nNa = a; O.nCl = b;
  }

  /* 表面位点：给每个表层离子配一个"贴面上来的水分子"位置。
     水分子要真正"趴"在离子表面（留一条极窄的缝），不能悬在半空——
     悬空时会挡住相邻离子，晶体看上去就是一堆被水糊住的糖球。 */
  function buildSites() {
    ions.forEach(function (io) {
      if (!io.surface) return;
      var n = new T.Vector3(io.nx, io.ny, io.nz);
      if (n.lengthSq() < .01) return;
      n.normalize();
      var r = io.isNa ? R_NA_V : R_CL_V;
      sites.push({
        ion: io,
        p: new T.Vector3().copy(io.home).addScaledVector(n, r + R_O + .40),
        n: n.clone(),
        isNa: io.isNa,
        /* 用格点坐标算固定延迟：随机数会让每次截图的"站队"进度都不一样 */
        delay: (((io.gx * 7 + io.gy * 11 + io.gz * 13 + 40) % 19) / 19) * .40
      });
    });
    /* 前排位点优先分到水分子（索引靠前的那几颗），保证画面上先看到的是正面 */
    sites.sort(function (p, q) { return q.p.z - p.p.z; });
  }

  /* ================= 水分子 ================= */
  function makeWaters() {
    var i;
    buildGrid();
    for (i = 0; i < NW; i++) {
      var w = {
        i: i,
        p: new T.Vector3(),
        home: new T.Vector3(),
        q: new T.Quaternion(),
        rx: Math.random() * 6.283, ry: Math.random() * 6.283, rz: Math.random() * 6.283,
        vx: K.rnd(.10, .34), vy: K.rnd(.10, .34), vz: K.rnd(.08, .26),
        sp: K.rnd(.55, 1.35),
        ph: Math.random() * 6.283,
        site: null,                      /* 表面位点 */
        shell: null,                     /* 水合壳：{ ion, k } */
        a: 1
      };
      placeFree(w);
      w.p.copy(w.home);
      w.q.setFromEuler(_e1.set(w.rx, w.ry, w.rz));
      waters.push(w);
    }
    /* 前 17 个分配给表面位点，接着 12 个给两个代表离子的水合壳 */
    var n = 0;
    sites.forEach(function (s) {
      /* 正对镜头（+z）的那一面不贴水：水分子会挡在晶面前，把交替排列糊掉。
         上表面与右侧面的"站队"已经足够说明问题。 */
      if (s.n.z > .5) return;
      if (n < NW) { waters[n].site = s; s.w = waters[n]; n++; }
    });
    var stars = ions.filter(function (io) { return io.role !== 'bulk'; });
    stars.forEach(function (io) {
      io.shellW = [];
      for (var k = 0; k < 6; k++) {
        if (n < NW) { waters[n].shell = { ion: io, k: k }; io.shellW.push(waters[n]); n++; }
      }
    });
  }

  /* 自由水分子的落点：用"网格 + 抖动"而不是纯随机。
     纯随机必然结块（左侧一堆、右侧空一片），溶液看起来就不均匀了。 */
  var gridPts = [], gridAt = 0;
  function buildGrid() {
    var i, j, k;
    for (i = 0; i < 6; i++) {
      for (j = 0; j < 5; j++) {
        for (k = 0; k < 4; k++) {
          gridPts.push(new T.Vector3(
            -21 + i * 8.4 + K.rnd(-2.2, 2.2),
            -3 + j * 5.4 + K.rnd(-1.4, 1.4),
            -16 + k * 4.5 + K.rnd(-1.2, 1.2)));
        }
      }
    }
    for (i = gridPts.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      var t = gridPts[i]; gridPts[i] = gridPts[j]; gridPts[j] = t;
    }
  }

  function placeFree(w) {
    var n = gridPts.length, i, p;
    for (i = 0; i < n; i++) {
      p = gridPts[(gridAt++) % n];
      /* 晶体周围留一圈干净的水带：自由水若贴着晶体轮廓，投影上就会"糊住"晶面。
         半径压在晶体外接球附近：既给晶体留出气口，溶解后中间也不会空出一个大洞。 */
      if (Math.hypot(p.x - C.x, p.y - C.y, p.z - C.z) < 9.6) continue;
      /* 给两个"代表离子"的水合壳留出空地，否则它们会被自由水分子淹掉 */
      if (Math.hypot(p.x - 8.6, p.y - 2.6, p.z + 1.0) < 5.0) continue;
      if (Math.hypot(p.x + 12.0, p.y - 16.5, p.z + 1.5) < 5.2) continue;
      w.home.copy(p);
      w.p.copy(p);
      return;
    }
    w.home.set(K.rnd(-20, 14), K.rnd(0, 20), K.rnd(-14, -1));
    w.p.copy(w.home);
  }

  /* 水分子局部坐标：O 在原点，两个 H 在下方（O 端朝 +y，H 端朝 -y） */
  function drawWater(w) {
    var i2 = w.i * 2;
    _v3.setScalar(w.a);
    setInst(O.oInst, w.i, w.p, w.q, _v1.copy(_v3).multiplyScalar(R_O));
    _v1.copy(_H1L).applyQuaternion(w.q).add(w.p);
    _v2.copy(_H2L).applyQuaternion(w.q).add(w.p);
    setInst(O.hInst, i2, _v1, w.q, _v3.setScalar(w.a * R_H));
    setInst(O.hInst, i2 + 1, _v2, w.q, _v3.setScalar(w.a * R_H));
    var br = .115 * w.a;
    setBond(O.bInst, i2, w.p, _v1, br);
    setBond(O.bInst, i2 + 1, w.p, _v2, br);
  }

  /* ================= 场景 ================= */
  var scene = {
    setup: function () {
      backdrop();
      buildLattice();
      buildSites();
      makeWaters();

      /* --- 材质的"水感"：离子用哑光实心球，不用 clearcoat（会在球顶留死白高光）。
             全部开 transparent，方便"小磁针"特写时把晶体/水背景淡出。 --- */
      var matNa = new T.MeshStandardMaterial({ color: 0x7b52c0, roughness: .55, metalness: .04, envMapIntensity: .38, transparent: true });
      var matCl = new T.MeshStandardMaterial({ color: 0x2f9c73, roughness: .55, metalness: .04, envMapIntensity: .38, transparent: true });
      var matO = new T.MeshStandardMaterial({ color: 0xd23b33, roughness: .38, metalness: .03, envMapIntensity: .62, transparent: true });
      var matH = new T.MeshStandardMaterial({ color: 0xf1f8ff, roughness: .40, metalness: .02, envMapIntensity: .55, transparent: true });
      var matB = new T.MeshStandardMaterial({ color: 0xc2d1df, roughness: .46, metalness: .10, envMapIntensity: .5, transparent: true });

      var sphS = new T.SphereGeometry(1, 16, 12);
      var sphL = new T.SphereGeometry(1, 22, 16);
      var cyl = new T.CylinderGeometry(1, 1, 1, 7, 1, false);

      O.naInst = inst(sphL, matNa, O.nNa);
      O.clInst = inst(sphL, matCl, O.nCl);
      O.oInst = inst(sphS, matO, NW);
      O.hInst = inst(sphS, matH, NW * 2);
      O.bInst = inst(cyl, matB, NW * 2);

      /* --- 水合作用的"静电吸引线"：光看球堆根本读不出哪一端朝离子，
             用一根细线把"带电的那一端 → 离子"连起来，δ⁻ 对 Na⁺、δ⁺ 对 Cl⁻ 才看得见。
             线的两端着色：靠水果分子一端与该离子颜色呼应，方向一眼可辨。 --- */
      O.attractPos = new Float32Array(20 * 2 * 3);
      O.attractCol = new Float32Array(20 * 2 * 3);
      var ag = new T.BufferGeometry();
      ag.setAttribute('position', new T.BufferAttribute(O.attractPos, 3));
      ag.setAttribute('color', new T.BufferAttribute(O.attractCol, 3));
      O.attract = new T.LineSegments(ag, new T.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: .55, depthWrite: false, depthTest: false
      }));
      O.attract.frustumCulled = false;
      K.scene().add(O.attract);

      /* 第 3 步的示范位点：右侧面中部的一对（Cl⁻ 用面心，Na⁺ 用上棱）。
         水分子挂在离子右外侧，O–H 轴在屏幕上近似水平，"红端朝内还是朝外"最直观。 */
      var naS = null, clS = null;
      sites.forEach(function (sd) {
        if (!sd.w) return;
        var g = sd.ion;
        if (g.gx === 1 && g.gy === 1 && g.gz === 0 && g.isNa) naS = naS || sd;
        if (g.gx === 1 && g.gy === 0 && g.gz === 0 && !g.isNa) clS = clS || sd;
      });
      O.demoSites = (naS && clS) ? [naS, clS] : [];
      O.demoSites.forEach(function (sd) { sd.isDemo = true; });
      O.labDemo = [
        O.demoSites[0] ? K.label([0, 0, 0], '氧端 δ⁻ 朝 Na⁺', 14, -62, 'on') : null,
        O.demoSites[1] ? K.label([0, 0, 0], '氢端 δ⁺ 朝 Cl⁻', 14, 62, 'on') : null
      ];
      O.labDemo.forEach(function (l) { if (l) l.el.style.opacity = 0; });

      /* --- 晶体轮廓：一圈极淡的棱线，把"立方体"读出来 --- */
      var BW = 2 * (D + R_CL_V);
      var edge = new T.LineSegments(
        new T.EdgesGeometry(new T.BoxGeometry(BW, BW, BW)),
        new T.LineBasicMaterial({ color: 0x5d8cad, transparent: true, opacity: .20 }));
      edge.position.copy(C);
      K.scene().add(edge);
      O.crystalEdge = edge;

      /* --- 水体里飘着的微尘：给出景深与"液体"的体积感 --- */
      O.dust = new T.Group();
      var dGeo = new T.SphereGeometry(.16, 6, 4);
      var dMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .18, depthWrite: false });
      var d = new T.InstancedMesh(dGeo, dMat, 160);
      d.frustumCulled = false;
      for (var q = 0; q < 160; q++) {
        _v1.set(K.rnd(-26, 26), K.rnd(-4, 24), K.rnd(-18, 1));
        _m4.compose(_v1, _q1.identity(), _v3.setScalar(K.rnd(.6, 1.6)));
        d.setMatrixAt(q, _m4);
      }
      d.instanceMatrix.needsUpdate = true;
      K.scene().add(d);
      O.dustMesh = d;

      /* --- 放大水分子（讲极性时用） --- */
      buildMag();

      /* --- 电极（导电那一节才出现） --- */
      buildElectrodes();

      /* --- 标注 --- */
      O.labCrystal = K.label([C.x - 3.2, C.y + 6.6, C.z], '食盐晶体（放大）', -40, -6, 'on');
      
      O.labNa = K.label([0, 0, 0], 'Na⁺', 0, -20, 'on');
      O.labCl = K.label([0, 0, 0], 'Cl⁻', 0, -20, 'on');
      O.labShell = K.label([0, 0, 0], '水合钠离子', 0, -46, 'on');
      O.labShell2 = K.label([0, 0, 0], '水合氯离子', 0, -52, 'on');
      [O.labNa, O.labCl, O.labShell, O.labShell2].forEach(function (l) {
        l.el.style.opacity = 0;
      });

      buildLegend();
    },

    update: function (dt, s) {
      s.t += dt;
      var t = s.t, i, k;

      /* 缓动到目标值 */
      for (k in V) {
        if (k === 'w') continue;
        V[k] += (TG[k] - V[k]) * Math.min(1, dt * SPD[k]);
      }

      /* ---------- 水分子 ---------- */
      var att = V.att, peel = V.peel, shell = V.shell, spread = V.spread;
      /* 指数缓动永远逼近不到 1，会留下一圈"没缩干净的小点"；最后 4% 直接判为溶尽 */
      var peelS = peel > .96 ? 1 : peel;
      stat.gone = 0; stat.na = 0; stat.cl = 0;

      /* "小磁针"特写时把背景里的水与晶体淡出，只留下那一个放大的水分子 */
      var mgFade = K.clamp(V.mag * 1.25, 0, 1);
      O.oInst.material.opacity = 1 - .88 * mgFade;
      O.hInst.material.opacity = 1 - .88 * mgFade;
      O.bInst.material.opacity = 1 - .88 * mgFade;
      O.naInst.material.opacity = 1 - .93 * mgFade;
      O.clInst.material.opacity = 1 - .93 * mgFade;
      /* 有"主角"时（站队 / 水合），背景自由水略缩一档，把视线让出来 */
      var dimFree = 1 - .08 * K.clamp(att * 1.2, 0, 1)
        - .52 * K.clamp(shell * 1.2, 0, 1) * (1 - K.clamp(spread, 0, 1));

      for (i = 0; i < waters.length; i++) {
        var w = waters[i];
        /* 自由漂移：轻微布朗运动 + 回到 home 的回复力（不会漂出画面） */
        w.p.x += Math.sin(t * w.sp * .9 + w.ph) * dt * .42;
        w.p.y += Math.cos(t * w.sp * .72 + w.ph * 1.7) * dt * .30;
        w.p.z += Math.sin(t * w.sp * .55 + w.ph * 2.3) * dt * .34;
        /* 溶解开始后，贴在晶体上的水要尽快回到自己的位置，否则整片水会一直糊在晶体原地 */
        w.p.lerp(w.home, dt * (.10 + .9 * peel + .5 * spread));

        /* 自转 */
        w.rx += dt * w.vx; w.ry += dt * w.vy; w.rz += dt * w.vz * .6;
        w.q.setFromEuler(_e1.set(w.rx, w.ry, w.rz));
        w.a = 1;
        w.docked = false;

        /* ① 表面位点：水分子贴到晶体表面，O 朝 Na⁺、H 朝 Cl⁻。
              一开始溶解（peel 略升）就散开，否则会把晶体糊成一团。 */
        if (w.site && att > .002 && peel < .72) {
          var sg = w.site;
          var k1 = K.clamp((att - sg.delay) / (1 - sg.delay), 0, 1);
          k1 = k1 * k1 * (3 - 2 * k1);
          var fade = K.clamp(1 - (peel - .02) / .38, 0, 1);
          var kk = k1 * fade;
          if (kk > .001) {
            _v1.copy(sg.p);
            /* 示范位点再往外挪一点：水分子离开离子表面，O/H 的朝向不会被离子挡住 */
            if (sg.isDemo) _v1.addScaledVector(sg.n, .34);
            w.p.lerp(_v1, kk);
            /* 取向：Na⁺ 端用 O（δ⁻）对着它；Cl⁻ 端用 H（δ⁺）对着它 */
            _v2.copy(sg.n).multiplyScalar(sg.isNa ? -1 : 1);
            _q1.setFromUnitVectors(_UP, _v2);
            w.q.slerp(_q1, Math.min(1, kk * 2.2));
            /* 示范的那两颗水分子放大、其余略缩：晶体表面不至于糊成一片，重点也跳得出来 */
            w.a = sg.isDemo ? 1.28 : .82;
            w.docked = true;
          }
        }

        /* ② 水合壳：代表离子周围六个水分子围成一圈。水分子朝向必须用 shell 进度驱动：
              上面每帧已把 q 重置成自转姿态，再按 dt 小步插值等于永远转不到位。 */
        if (w.shell && shell > .02) {
          var io = w.shell.ion;
          var rr = (io.isNa ? R_NA_V : R_CL_V) + R_O + .74;
          _v1.copy(SHELL_DIRS[w.shell.k]).multiplyScalar(rr).add(io.p);
          w.p.lerp(_v1, Math.min(1, dt * 3.8));
          _v2.subVectors(io.p, w.p).normalize();
          if (io.isNa) _q1.setFromUnitVectors(_UP, _v2);        /* O 端朝 Na⁺ */
          else _q1.setFromUnitVectors(_UP, _v2.negate());       /* H 端朝 Cl⁻ */
          var ksh = K.clamp(shell * 2.6, 0, 1);
          w.q.slerp(_q1, ksh);
          w.a = 1 + .16 * ksh;
        }

        /* 自由水在不抢戏的时候略收小：视觉上退到后景 */
        if (!w.docked && !w.shell) w.a = dimFree;

        drawWater(w);
      }

      /* ---------- 离子 ---------- */
      for (i = 0; i < ions.length; i++) {
        var io2 = ions[i];
        var sc1 = 1, vis = 1;

        if (io2.role === 'na' || io2.role === 'cl') {
          var isNa = io2.role === 'na';
          /* 代表离子：沿自己的外法线被"拽"出晶体，再随扩散漂走 */
          var pk = Math.min(1, peel * 2.6);
          pk = pk * pk * (3 - 2 * pk);     /* 代表离子前半程就走完全程，学生才看得出"已经出来了" */
          io2.p.copy(io2.home).lerp(isNa ? P_NA_PEEL : P_CL_PEEL, pk);
          /* 讲水合壳时把两颗离子并排收到画面中央，两个壳才能同框比较 */
          var gather = K.clamp((shell - .08) / .72, 0, 1) * K.clamp(peel * 1.6, 0, 1);
          io2.p.lerp(isNa ? P_NA_SHELL : P_CL_SHELL, gather);
          /* 扩散：飞向自己那一片水域 */
          io2.p.lerp(isNa ? P_NA_SPREAD : P_CL_SPREAD, spread);
          io2.p.y += Math.sin(t * .9 + (isNa ? 0 : 2)) * .28 * spread;
          /* 通电：离子定向移动（向各自电极，限位在电极板内侧） */
          if (V.field > .001) {
            io2.p.x += (isNa ? -1 : 1) * V.field * 5.2;
            io2.p.x = K.clamp(io2.p.x, -16.4, 16.2);
            io2.p.y += Math.sin(t * 2.1 + (isNa ? 1.1 : 2.4)) * .12 * V.field;
          }
          if (peel > .5) stat.gone++;
          io2.isNa = isNa;
          if (isNa) stat.na = V.shell > .5 ? 14 : 0;
          else stat.cl = V.shell > .5 ? 13 : 0;
        } else {
          /* 晶体里的小兵：外层的先被溶解（配位少、束缚弱） */
          var dist = Math.max(1, Math.abs(io2.gx) + Math.abs(io2.gy) + Math.abs(io2.gz));   /* 1..3 */
          /* 内层晚点动；再按格点错开一点点，让棱角是逐个掉而不是整层同时塌 */
          var delay = (3 - dist) * .30 + (Math.abs(io2.gx * 3 + io2.gy * 5 + io2.gz * 7)) * .006;
          var p1 = K.clamp((peelS - delay) / Math.max(.18, 1 - delay), 0, 1);  /* 归一化：peel=1 时必定全部溶完 */
          _v1.set(io2.nx, io2.ny, io2.nz);
          if (_v1.lengthSq() < .01) _v1.set(0, 1, 0);
          _v1.normalize();
          io2.p.copy(io2.home).addScaledVector(_v1, p1 * 2.2);
          var fadeB = K.clamp((p1 - .40) / .38, 0, 1);
          sc1 = 1 - fadeB * fadeB;                 /* 前段保持整颗，最后才收掉，免得出现一地小碎球 */
          if (p1 > .5) stat.gone++;
          if (sc1 < .02) vis = 0;
        }

        var mat = io2.isNa ? O.naInst : O.clInst;
        var idx = io2.isNa ? io2.na : io2.cl;
        var R = io2.isNa ? R_NA_V : R_CL_V;
        if (!vis) { mat.setMatrixAt(idx, _ZERO); continue; }
        _v3.setScalar(R * sc1);
        setInst(mat, idx, io2.p, _q1.identity(), _v3);
      }

      /* ---------- 水合吸引线：从"水分子带电的那一端"连到离子中心 ---------- */
      var shellOn = shell > .25, demoOn = att > .55 && peel < .28;
      O.attract.visible = shellOn || demoOn;
      O.labDemo.forEach(function (l) { if (l) l.el.style.opacity = demoOn ? K.clamp((att - .62) / .28, 0, 1) : 0; });
      if (O.attract.visible) {
        O.attract.material.opacity = .68 * Math.max(
          shellOn ? K.clamp((shell - .25) / .35, 0, 1) : 0,
          demoOn ? K.clamp((att - .55) / .3, 0, 1) : 0);
        var si = 0;
        if (shellOn) {
          for (i = 0; i < ions.length; i++) {
            var io3 = ions[i];
            if (!io3.shellW) continue;
            var hxA = io3.isNa ? 0xe0483d : 0x6fa9d8;      /* 靠水果分子一端：红=氧端，蓝白=氢端 */
            var hxB = io3.isNa ? 0x8a63c8 : 0x2f9c73;      /* 离子端：与离子颜色呼应 */
            for (var qi = 0; qi < io3.shellW.length; qi++) {
              var wq = io3.shellW[qi];
              if (io3.isNa) {
                _v1.copy(wq.p);                              /* Na⁺：氧端（δ⁻）对着它 */
              } else {
                _v1.copy(_H1L).applyQuaternion(wq.q).add(wq.p);
                _v2.copy(_H2L).applyQuaternion(wq.q).add(wq.p);
                if (_v2.distanceToSquared(io3.p) < _v1.distanceToSquared(io3.p)) _v1.copy(_v2);
              }
              pushAttract(si++, _v1, io3.p, hxA, hxB);
            }
          }
        }
        if (demoOn) {
          for (var di = 0; di < O.demoSites.length; di++) {
            var sd = O.demoSites[di], wd = sd.w;
            if (!wd) continue;
            if (sd.isNa) {
              _v1.copy(wd.p);
            } else {
              _v1.copy(_H1L).applyQuaternion(wd.q).add(wd.p);
              _v2.copy(_H2L).applyQuaternion(wd.q).add(wd.p);
              if (_v2.distanceToSquared(sd.ion.p) < _v1.distanceToSquared(sd.ion.p)) _v1.copy(_v2);
            }
            pushAttract(si++, _v1, sd.ion.p, sd.isNa ? 0xe0483d : 0x6fa9d8, sd.isNa ? 0x8a63c8 : 0x2f9c73);
            if (O.labDemo[di]) O.labDemo[di].p.copy(wd.p);
          }
        }
        O.attract.geometry.attributes.position.needsUpdate = true;
        O.attract.geometry.attributes.color.needsUpdate = true;
        O.attract.geometry.setDrawRange(0, si * 2);
      }

      O.naInst.instanceMatrix.needsUpdate = true;
      O.clInst.instanceMatrix.needsUpdate = true;
      O.oInst.instanceMatrix.needsUpdate = true;
      O.hInst.instanceMatrix.needsUpdate = true;
      O.bInst.instanceMatrix.needsUpdate = true;

      /* ---------- 微尘缓慢上浮 ---------- */
      if (O.dustMesh) {
        O.dust.rotation.y += dt * .012;
        O.dustMesh.position.y = Math.sin(t * .22) * .5;
      }

      /* ---------- 放大水分子 ---------- */
      var mg = V.mag;
      O.mag.visible = mg > .01;
      if (O.mag.visible) {
        O.mag.scale.setScalar(K.clamp(mg, 0, 1));
        O.mag.position.y = MAGY;
        O.magWater.rotation.y = Math.sin(t * .42) * .38;
        O.magWater.rotation.z = Math.sin(t * .4) * .07;
      }
      O.magDelta.forEach(function (l) { l.el.style.opacity = K.clamp((mg - .55) / .45, 0, 1); });

      /* ---------- 电极与闭合回路 ---------- */
      var f = V.field;
      O.electrodeL.visible = O.electrodeR.visible = f > .06;
      O.circuit.visible = f > .06;
      if (f > .06) {
        O.eMatL.emissiveIntensity = f * .16;
        O.eMatR.emissiveIntensity = f * .16;
        O.eMatL.opacity = K.clamp(f * 4, 0, 1);
        O.eMatR.opacity = K.clamp(f * 4, 0, 1);
        O.eGlowL.material.opacity = f * .24;
        O.eGlowR.material.opacity = f * .24;
        O.electrodeL.scale.setScalar(.55 + .45 * f);
        O.electrodeR.scale.setScalar(.55 + .45 * f);
        O.circuitMat.opacity = f * .95;
        O.circuitMatR.opacity = f * .95;
        O.wireMat.opacity = f;
        O.dotMat.opacity = K.clamp((f - .25) / .5, 0, 1);
        /* 电子沿导线跑：左线 电池 → 电极，右线 电极 → 电池 */
        var dotOn = f > .35;
        for (i = 0; i < O.dots.length; i++) {
          var dd = O.dots[i];
          dd.visible = dotOn;
          if (!dotOn) continue;
          var uu = (t * .17 + dd.userData.off) % 1;
          if (dd.userData.side < 0) uu = 1 - uu;
          dd.userData.curve.getPointAt(uu, _v1);
          dd.position.copy(_v1);
        }
        /* 离子定向迁移箭头 */
        var naF = null, clF = null;
        for (i = 0; i < ions.length; i++) {
          if (ions[i].role === 'na') naF = ions[i];
          else if (ions[i].role === 'cl') clF = ions[i];
        }
        var aShow = K.clamp((f - .30) / .45, 0, 1);
        O.arrowNa.visible = O.arrowCl.visible = aShow > .02;
        if (naF && clF) {
          var asc = .72 + .28 * aShow;
          O.arrowNa.scale.setScalar(asc);
          O.arrowCl.scale.setScalar(asc);
          O.arrowNa.position.set(naF.p.x + 1.5, naF.p.y + 3.3, naF.p.z + .3);
          O.arrowCl.position.set(clF.p.x - 1.5, clF.p.y + 3.3, clF.p.z + .3);
          O.arrowNa.userData.mat.opacity = aShow;
          O.arrowCl.userData.mat.opacity = aShow;
          O.arrowNa.userData.mat.emissiveIntensity = .35 + .5 * aShow;
          O.arrowCl.userData.mat.emissiveIntensity = .35 + .5 * aShow;
          O.labNaDir.p.set(naF.p.x + 2.4, naF.p.y + 4.2, naF.p.z + .3);
          O.labClDir.p.set(clF.p.x - 3.6, clF.p.y + 4.2, clF.p.z + .3);
        }
        O.labNaDir.el.style.opacity = aShow;
        O.labClDir.el.style.opacity = aShow;
        O.labElec.el.style.opacity = K.clamp((f - .55) / .3, 0, 1);
      } else {
        O.labNaDir.el.style.opacity = 0;
        O.labClDir.el.style.opacity = 0;
        O.labElec.el.style.opacity = 0;
      }
      [O.labNeg, O.labPos].forEach(function (l) { l.el.style.opacity = K.clamp((f - .14) / .2, 0, 1); });

      /* ---------- 标签跟随 ---------- */
      var naIon = null, clIon = null;
      for (i = 0; i < ions.length; i++) {
        if (ions[i].role === 'na') naIon = ions[i];
        if (ions[i].role === 'cl') clIon = ions[i];
      }
      if (naIon && clIon) {
        O.labNa.p.copy(naIon.p); O.labCl.p.copy(clIon.p);
        O.labShell.p.copy(naIon.p); O.labShell2.p.copy(clIon.p);
        var showNa = K.clamp((peel - .12) / .18, 0, 1);
        var showSh = K.clamp((shell - .25) / .4, 0, 1);
        var fieldHide = K.clamp(V.field * 1.5, 0, 1);   /* 导电一步腾出位置给方向标注 */
        O.labNa.el.style.opacity = showNa * (1 - showSh);
        O.labCl.el.style.opacity = showNa * (1 - showSh);
        O.labShell.el.style.opacity = showSh * (1 - fieldHide);
        O.labShell2.el.style.opacity = showSh * (1 - fieldHide);
      }
      O.labCrystal.el.style.opacity = K.clamp(1 - peel * 2.4, 0, 1) * (1 - K.clamp(mg * 1.6, 0, 1));
      O.crystalEdge.material.opacity = .20 * K.clamp(1 - peel * 1.15, 0, 1);
    }
  };

  /* 水合壳的六个方向：四个斜向 + 上下，正对相机的水平/竖直方向留空，
     离子本体不会被水分子整个挡住，壳上的水也数得清。 */
  var SHELL_DIRS = (function () {
    var dirs = [
      [.72, .72, .06], [-.72, .72, .06], [-.72, -.72, .06], [.72, -.72, .06],
      [0, 1, .12], [0, -1, .12]
    ];
    var q = new T.Quaternion().setFromEuler(new T.Euler(.16, .26, .10));
    return dirs.map(function (d) {
      return new T.Vector3(d[0], d[1], d[2]).normalize().applyQuaternion(q).normalize();
    });
  })();

  /* ================= 放大的水分子 + 极性标注 ================= */
  function buildMag() {
    var g = new T.Group();
    var RR = 5.0;
    var disc = new T.Mesh(new T.CircleGeometry(RR, 56),
      new T.MeshBasicMaterial({ color: 0xf8fcff, transparent: true, opacity: .96, depthWrite: false }));
    disc.position.z = -.5;
    g.add(disc);
    var rim = new T.Mesh(new T.TorusGeometry(RR, .10, 10, 64),
      new T.MeshStandardMaterial({ color: 0xa6c0d6, roughness: .38, metalness: .18 }));
    rim.position.z = -.5;
    g.add(rim);

    var mw = new T.Group();
    var K2 = 2.6;                        /* 特写放大倍数 */
    var oMat = new T.MeshStandardMaterial({ color: 0xd6443c, roughness: .38, metalness: .03, envMapIntensity: .6 });
    var hMat = new T.MeshStandardMaterial({ color: 0xdce8f4, roughness: .42, metalness: .02, envMapIntensity: .55 });
    var bMat = new T.MeshStandardMaterial({ color: 0xb9c8d8, roughness: .42, metalness: .12 });

    /* 球缩得比键短，才能露出"棍"：球心距 3.02，半径和 2.34 */
    var oS = new T.Mesh(new T.SphereGeometry(1, 34, 26), oMat);
    oS.scale.setScalar(1.32);
    mw.add(oS);
    var h1p = new T.Vector3(-HX * K2, -HY * K2, 0);
    var h2p = new T.Vector3(HX * K2, -HY * K2, 0);
    var h1 = new T.Mesh(new T.SphereGeometry(1, 26, 20), hMat);
    h1.scale.setScalar(.76);
    h1.position.copy(h1p);
    mw.add(h1);
    var h2 = h1.clone();
    h2.position.copy(h2p);
    mw.add(h2);
    stick(new T.Vector3(0, 0, 0), h1p, .16, bMat, mw);
    stick(new T.Vector3(0, 0, 0), h2p, .16, bMat, mw);
    g.add(mw);
    O.magWater = mw;

    /* δ⁻ / δ⁺ 标注：上标用 innerHTML 拼，DirectUnicode 的 ⁻ 在部分字体里缺字 */
    O.magDelta = [
      K.label([MAGX, MAGY + 2.35, .5], 'δ⁻', 0, -12, 'big'),
      K.label([MAGX - 3.0, MAGY - 1.95, .5], 'δ⁺', 0, 32, 'big blue'),
      K.label([MAGX + 3.0, MAGY - 1.95, .5], 'δ⁺', 0, 32, 'big blue')
    ];
    O.magDelta[0].el.innerHTML = '&delta;<sup>&minus;</sup>';
    O.magDelta[1].el.innerHTML = '&delta;<sup>+</sup>';
    O.magDelta[2].el.innerHTML = '&delta;<sup>+</sup>';
    O.magDelta.forEach(function (l) { l.el.style.opacity = 0; });

    /* 键角弧：半径要落在 O 球外面（1.48）与 H 球内缘（2.16）之间 */
    var arc = new T.Group();
    for (var i = 0; i <= 22; i++) {
      var a = -Math.PI / 2 - HALF + (2 * HALF) * i / 22;
      var p = new T.Vector3(Math.cos(a) * 1.94, Math.sin(a) * 1.94, .05);
      var dot = new T.Mesh(new T.SphereGeometry(.05, 6, 5), new T.MeshBasicMaterial({ color: 0x5f86a8 }));
      dot.position.copy(p);
      arc.add(dot);
    }
    g.add(arc);

    g.position.set(MAGX, MAGY, 0);
    K.scene().add(g);
    O.mag = g;
  }

  /* ================= 电极 + 电路 ================= */
  function buildElectrodes() {
    /* 电极板：扁平方板，正对彼此；顶部引出一根接线柱 */
    var plateGeo = new T.BoxGeometry(1.0, 20, 6.4);
    O.eMatL = new T.MeshStandardMaterial({ color: 0x39414e, roughness: .55, metalness: .22, envMapIntensity: .45, emissive: 0x7fb4ff, emissiveIntensity: 0, transparent: true });
    O.eMatR = new T.MeshStandardMaterial({ color: 0x39414e, roughness: .55, metalness: .22, envMapIntensity: .45, emissive: 0xffab84, emissiveIntensity: 0, transparent: true });
    var gl = new T.Group(), gr = new T.Group();
    var l = new T.Mesh(plateGeo, O.eMatL); gl.add(l);
    var r = new T.Mesh(plateGeo, O.eMatR); gr.add(r);
    var postGeo = new T.CylinderGeometry(.32, .32, 3.0, 12);
    var postL = new T.Mesh(postGeo, O.eMatL); postL.position.y = 11.4; gl.add(postL);
    var postR = new T.Mesh(postGeo, O.eMatR); postR.position.y = 11.4; gr.add(postR);
    gl.position.set(-19.5, 9, -2);
    gr.position.set(19.5, 9, -2);
    K.scene().add(gl); K.scene().add(gr);
    O.electrodeL = gl; O.electrodeR = gr;

    /* 直流电源 + 导线：把"闭合回路"补出来，导电一步才不像悬空的两块板 */
    var circuit = new T.Group();
    O.circuit = circuit;
    O.circuitMat = new T.MeshStandardMaterial({ color: 0x353e4b, roughness: .5, metalness: .28, transparent: true, opacity: 0 });
    O.circuitMatR = new T.MeshStandardMaterial({ color: 0xb8483f, roughness: .52, metalness: .15, transparent: true, opacity: 0 });
    var bat = new T.Mesh(new T.BoxGeometry(9.4, 4.0, 3.4), O.circuitMat);
    bat.position.set(0, 26, -12); circuit.add(bat);
    var capGeo = new T.CylinderGeometry(.55, .55, 1.3, 12);
    var capNeg = new T.Mesh(capGeo, O.circuitMat);
    capNeg.rotation.z = Math.PI / 2; capNeg.position.set(-5.0, 26, -12); circuit.add(capNeg);
    var capPos = new T.Mesh(capGeo, O.circuitMatR);
    capPos.rotation.z = Math.PI / 2; capPos.position.set(5.0, 26, -12); circuit.add(capPos);
    /* 电池极性：+ 在右（接正极板），− 在左（接负极板） */
    K.spriteLabel([-5.0, 26.1, -9.4], '−', { fs: 46, w: 2.4, color: '#ffffff', bg: 'rgba(31,79,122,.96)', parent: circuit });
    K.spriteLabel([5.0, 26.1, -9.4], '+', { fs: 46, w: 2.4, color: '#ffffff', bg: 'rgba(176,58,46,.96)', parent: circuit });

    O.wireMat = new T.MeshStandardMaterial({ color: 0x3a4452, roughness: .55, metalness: .2, transparent: true, opacity: 0 });
    O.wirePaths = [];
    [-1, 1].forEach(function (side) {
      var cu = new T.CatmullRomCurve3([
        new T.Vector3(side * 19.5, 20.4, -2),
        new T.Vector3(side * 19.5, 23.8, -3.2),
        new T.Vector3(side * 15.8, 26.6, -7.8),
        new T.Vector3(side * 9.2, 27.3, -10.8),
        new T.Vector3(side * 5.7, 26.2, -11.9)
      ]);
      cu.curveType = 'catmullrom';
      var tube = new T.Mesh(new T.TubeGeometry(cu, 44, .22, 6, false), O.wireMat);
      circuit.add(tube);
      O.wirePaths.push(cu);
    });

    /* 电子流：沿导线跑的小亮点，左线 电池→电极，右线 电极→电池 */
    O.dots = [];
    var dotMat = new T.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 1, toneMapped: false });
    O.dotMat = dotMat;
    var dotGeo = new T.SphereGeometry(.34, 8, 6);
    for (var wi = 0; wi < 2; wi++) {
      for (var dj = 0; dj < 7; dj++) {
        var dot = new T.Mesh(dotGeo, dotMat);
        dot.userData = { curve: O.wirePaths[wi], side: wi === 0 ? -1 : 1, off: dj / 7 };
        dot.visible = false;
        circuit.add(dot);
        O.dots.push(dot);
      }
    }

    /* 离子迁移方向箭头：挂在两颗代表离子上方，随 field 出现 */
    O.arrowNa = makeArrow(0x8a63c8);
    O.arrowNa.rotation.y = Math.PI;            /* 指向 -x（负极） */
    O.arrowCl = makeArrow(0x2f9c73);           /* 指向 +x（正极） */
    O.arrowNa.visible = O.arrowCl.visible = false;
    circuit.add(O.arrowNa); circuit.add(O.arrowCl);

    K.scene().add(circuit);

    var glowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d');
      var g2 = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      g2.addColorStop(0, 'rgba(255,255,255,.9)');
      g2.addColorStop(.4, 'rgba(150,190,255,.42)');
      g2.addColorStop(1, 'rgba(120,170,255,0)');
      x.fillStyle = g2; x.fillRect(0, 0, 128, 128);
      return new T.CanvasTexture(c);
    })();
    O.eGlowL = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0x8fc0ff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    O.eGlowL.scale.set(8, 26, 1);
    O.eGlowL.position.set(-19.5, 9, -2);
    O.eGlowR = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb08a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    O.eGlowR.scale.set(8, 26, 1);
    O.eGlowR.position.set(19.5, 9, -2);
    K.scene().add(O.eGlowL); K.scene().add(O.eGlowR);

    O.labNeg = K.label([-19.5, 21.6, -2], '负极 −（阴极）', 0, -10, 'on');
    O.labPos = K.label([19.5, 21.6, -2], '正极 +（阳极）', -8, -10, 'on');
    O.labNeg.el.style.opacity = 0;
    O.labPos.el.style.opacity = 0;

    /* 溶液里的方向提示：比在电极上写一句更直观 */
    O.labNaDir = K.label([0, 0, 0], 'Na⁺ → 负极', 0, -12, 'on');
    O.labClDir = K.label([0, 0, 0], 'Cl⁻ → 正极', 0, -12, 'on');
    O.labNaDir.el.style.opacity = 0;
    O.labClDir.el.style.opacity = 0;
    O.labElec = K.label([11.5, 28.2, -8], '电子流 e⁻', 0, -10, 'on');
    O.labElec.el.style.opacity = 0;
  }

  /* 一支小箭头（默认指向 +x）：杆 + 锥头，颜色自发光 */
  function makeArrow(hex) {
    var mat = new T.MeshStandardMaterial({
      color: hex, emissive: hex, emissiveIntensity: .5, roughness: .45, metalness: .05,
      transparent: true, opacity: 0
    });
    var g = new T.Group();
    var shaft = new T.Mesh(new T.CylinderGeometry(.16, .16, 2.2, 8), mat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = -1.1;
    g.add(shaft);
    var head = new T.Mesh(new T.ConeGeometry(.52, 1.15, 12), mat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = .55;
    g.add(head);
    g.userData.mat = mat;
    return g;
  }

  /* ================= 屏幕图例（HTML 覆盖层，不随视角转动） ================= */
  function buildLegend() {
    var css = document.createElement('style');
    css.textContent =
      '.micro-legend{position:fixed;left:18px;bottom:54px;z-index:8;display:flex;gap:13px;align-items:center;' +
      'padding:9px 15px;border-radius:11px;background:rgba(255,255,255,.86);' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'border:1px solid rgba(120,160,190,.30);box-shadow:0 3px 14px rgba(60,100,140,.10);' +
      'font:500 12.5px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#31506b}' +
      '.micro-legend em{font-size:10.5px;letter-spacing:.14em;color:#84a0b6;font-style:normal;font-weight:600}' +
      '.micro-legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}' +
      '.micro-legend i{width:11px;height:11px;border-radius:50%;display:inline-block;' +
      'box-shadow:inset -1.5px -2px 3px rgba(0,0,0,.22)}' +
      '.lab-label.big{font-size:19px;font-weight:700;color:#b3352e;text-shadow:none;' +
      'background:rgba(255,255,255,.94);padding:2px 9px 3px;border-radius:8px;' +
      'box-shadow:0 2px 9px rgba(20,60,100,.14)}' +
      '.lab-label.big.blue{color:#2f6ea8}' +
      '.lab-label.big sup{font-size:.66em;position:relative;top:-.46em;margin-left:1px;line-height:0}';
    document.head.appendChild(css);
    var el = document.createElement('div');
    el.className = 'micro-legend';
    el.innerHTML = '<em>图例</em>' +
      '<span><i style="background:#8f63c4"></i>Na⁺</span>' +
      '<span><i style="background:#3fae7c"></i>Cl⁻</span>' +
      '<span><i style="background:#c9483f"></i>O 原子</span>' +
      '<span><i style="background:#f7fafd;box-shadow:inset 0 0 0 1px #c3d2de"></i>H 原子</span>';
    document.body.appendChild(el);
    O.legend = el;
  }

  /* ================= 启动 ================= */
  K.boot({
    title: '氯化钠溶于水的微观过程',
    chip: '化学 · 鲁教版 · 九上 · 第三单元 探秘水世界 · 第三节 物质在水中的溶解',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 9.8, tx: .5, tz: -2, dist: 36, yaw: .24, pitch: .17 },

    reads: [['left', '晶体中剩余离子'], ['free', '溶液中的自由离子'], ['note', '溶液状态'], ['cond', '导电性']],
    values: function () {
      var total = ions.length, left = total - stat.gone;
      var note = '晶体尚未溶解';
      if (V.spread > .85 && V.shell > .6) note = '均一、稳定的溶液';
      else if (V.peel > .05) note = '离子正在脱离晶体';
      else if (V.att > .5) note = '水分子正在包围晶体';
      if (V.field > .4) note = '离子定向移动';
      var cond = V.shell > .6 ? '能导电' : '不导电';
      return {
        left: left + ' / ' + total + ' 个',
        free: V.shell > .5 ? 'Na⁺、Cl⁻ 自由移动' : '—',
        note: note,
        cond: cond
      };
    },

    steps: [
      {
        name: '一粒盐', title: '放进水里，它去哪儿了',
        ask: '一勺白色晶体沉到杯底，搅一搅就"不见"了——它真的消失了吗？',
        body: '<p>现象层：把一撮<b>氯化钠</b>放进水里，晶体在杯底慢慢变小，最后完全看不见，水依然清澈透明；尝一口，整杯水都是咸的。</p>' +
          '<p>微观层：画面里这块立方体就是放大的食盐晶体。它由<b>钠离子（Na⁺）</b>和<b>氯离子（Cl⁻）</b>交替排列、紧紧咬合而成——每个 Na⁺ 周围都是 Cl⁻，每个 Cl⁻ 周围都是 Na⁺，靠<b>静电作用</b>连成一体。</p>' +
          '<p>晶体周围那些"V 形小球"是<b>水分子</b>：一个氧原子（红）带两个氢原子（白），它们一刻不停地运动，不断撞上晶体表面。</p>' +
          '<p>易错层：盐没有"消失"，也没有"变成水"，它只是被拆散成肉眼看不见的离子，均匀地躲进了水分子之间。凡是"看不见"就以为"没有"，是这一章最常见的错误。</p>' +
          '<p>考点层：氯化钠由<b>离子</b>构成（不是分子）；溶液中的溶质以<b>离子或分子</b>的形式分散在溶剂中。</p>',
        apply: function () { reset(0, 0, 0, 0, 0, 0, 0); },
        cam: { tx: .5, ty: 9.8, tz: -2, dist: 36, yaw: .24, pitch: .17 }
      },
      {
        name: '小磁针', title: '水分子凭什么能把盐拆开',
        ask: '水分子看起来普普通通，它哪来的力气去拆一块晶体？',
        body: '<p>现象层：把镜头推近到一个水分子上——它是一个<b>V 形</b>的小家伙，中间的氧原子大、两端的氢原子小，夹角 104.5°。</p>' +
          '<p>微观层：氧原子"抢电子"的本领比氢强，共用电子对<b>偏向氧的一端</b>。于是氧那一头带上了部分负电（记作 <b>δ⁻</b>），两个氢那一头带上了部分正电（<b>δ⁺</b>）。一头正、一头负，水分子就成了一个<b>极性分子</b>——像一根小磁针，也像一块两头带磁的小磁铁。</p>' +
          '<p>类比：正因为水分子是"小磁针"，它才既能拉住带正电的 Na⁺（用 δ⁻ 那头），又能拉住带负电的 Cl⁻（用 δ⁺ 那头）。这就是水能溶解那么多物质的看家本领。</p>' +
          '<p>易错层：δ⁺、δ⁻ 是<b>部分</b>电荷，不是完整的 +1、−1。写成"水分子带一个正电荷"就错了；水分子整体仍然是<b>电中性</b>的。</p>',
        apply: function () { reset(0, 0, 0, 0, 0, 1, 1); },
        cam: { tx: -6.5, ty: 18.2, tz: 0, dist: 27, yaw: .10, pitch: .12 }
      },
      {
        name: '围上去', title: '水分子在晶体表面"站队"',
        ask: '到了晶体表面，水分子该怎么摆？',
        body: '<p>现象层：大量水分子涌向晶体表面，贴住表层的一个个离子，而且<b>摆的姿势很有讲究</b>：</p>' +
          '<p style="margin:8px 0 8px 6px">· 遇到 <b>Na⁺</b>（正电）——把带负电的<b>氧端（δ⁻）</b>转过去对着它；<br>' +
          '· 遇到 <b>Cl⁻</b>（负电）——把带正电的<b>氢端（δ⁺）</b>转过去对着它。</p>' +
          '<p>微观层：这不是水分子"聪明"，而是<b>异种电荷相吸</b>的必然结果。无数个水分子同时从四面八方拉扯同一个离子，合力就把晶体表面的离子"抠"松了。</p>' +
          '<p>关键一句：溶解的本质，是<b>水分子把构成晶体的离子一个个"抢"出来</b>，而不是水把晶体"泡软"了。搅拌只是加快水分子靠近的速度，真正干活的是水分子。</p>' +
          '<p>易错层：水分子只是<b>围着</b>离子，并没有和离子"结合成新物质"——所以溶解是<b>物理变化</b>，没有新物质生成。</p>',
        apply: function () { reset(1, 0, 0, 0, 0, 0, 0); },
        cam: { tx: 4.5, ty: 10.9, tz: .5, dist: 33, yaw: .30, pitch: .22 },
        controls: [
          { type: 'btn', label: '让水分子围上去', onClick: function () { TG.att = 1; } },
          { type: 'btn', label: '散开', onClick: function () { TG.att = 0; } }
        ]
      },
      {
        name: '拽下来', title: '第一个离子离开晶体',
        ask: '离子是怎么从晶体上"掉"下来的？',
        body: '<p>现象层：看那两个被标记的离子——<b>Na⁺</b> 和 <b>Cl⁻</b>。它们先被水分子拉得松动，然后<b>整个儿脱离晶体</b>，带着一身水分子飘进溶液里。</p>' +
          '<p>微观层：为什么先掉的是<b>棱和角</b>上的离子？因为那里的离子被"邻居"包围得最少（配位数小），受到的静电束缚最弱，水分子稍微一拉就能得手。晶体的棱角会先变圆、变小，就是这个道理。</p>' +
          '<p>重要区分：脱离晶体的是<b>离子</b>，不是"氯化钠分子"——氯化钠根本没有分子，它由离子直接构成。溶液中存在的是 Na⁺ 和 Cl⁻，而不是 NaCl。</p>' +
          '<p>易错层：<b>Na⁺ 和 Cl⁻ 的数目始终是 1:1</b>。整个溶液是电中性的，不会出现"钠离子比氯离子多"的情况。写"溶液中含 NaCl 分子"直接判错。</p>',
        apply: function () { reset(1, .40, .25, 0, 0, 0, 0); },
        cam: { tx: 4, ty: 10, tz: -1, dist: 38, yaw: .22, pitch: .16 },
        controls: [
          { type: 'btn', label: '继续溶解', onClick: function () { TG.peel = 1; } },
          { type: 'btn', label: '回到晶体状态', onClick: function () { TG.peel = 0; TG.shell = 0; } }
        ]
      },
      {
        name: '水合离子', title: '离子的"水外套"',
        ask: '被水包围的离子，还是离子吗？',
        body: '<p>现象层：脱离晶体的 Na⁺ 外面裹着一层水分子，氧端统统朝里（对着 Na⁺）；Cl⁻ 外面那层水分子则氢端朝里。这样一整套叫<b>水合离子</b>。</p>' +
          '<p>微观层：水分子用带相反电荷的那一头"抱住"离子，形成一层稳定的<b>水合壳</b>。所以溶液里的离子并不是"光秃秃"的，而是穿着水外套在游动。这也解释了为什么离子在水中能稳定存在、不会重新聚成晶体。</p>' +
          '<p>注意：水合壳里的水分子<b>仍然是水分子</b>，没有变成别的东西。水合是<b>物理</b>过程，撤掉水、把水蒸干，NaCl 晶体又会重新析出来——这正是海水晒盐的道理。</p>' +
          '<p>易错层：教材常写"离子分散到水分子中间"，这句话是对的，只是画得粗略；本画面把"水分子怎么围、围哪一头"画细了一些。答题时写"离子分散在水分子中间、形成均一稳定的溶液"即可。</p>',
        apply: function () { reset(1, 1, 1, .25, 0, 0, 0); },
        cam: { tx: 5.5, ty: 9.6, tz: 2, dist: 34, yaw: .12, pitch: .14 },
        controls: [
          { type: 'btn', label: '看清 Na⁺ 的水合壳', onClick: function () { TG.shell = 1; } },
          { type: 'btn', label: '剥掉水外套', onClick: function () { TG.shell = 0; } }
        ]
      },
      {
        name: '散开', title: '为什么整杯水一样咸',
        ask: '盐只沉在杯底，为什么上面的水也咸？',
        body: '<p>现象层：晶体越缩越小，最后完全消失；Na⁺ 和 Cl⁻ 带着各自的水外套游向四面八方，最终<b>均匀</b>地分布在整杯水里。此时任意取一滴，咸度都一样。</p>' +
          '<p>微观层：离子在水中做<b>无规则运动</b>，从浓度高的地方（晶体附近）向浓度低的地方扩散，直到处处均匀。这个过程不需要搅拌也会发生，只是慢；搅拌、升温能让它快一些。</p>' +
          '<p>溶液的两个关键词：<b>均一</b>——各部分组成、性质完全相同；<b>稳定</b>——静置多久也不会分层、不会析出沉淀（条件是温度不变、水量不变）。</p>' +
          '<p>概念层：溶液 = <b>溶质 + 溶剂</b>，是<b>混合物</b>。氯化钠溶液里，溶质是 Na⁺ 和 Cl⁻，溶剂是水。溶液的质量 = 溶质质量 + 溶剂质量，但体积<b>不等于</b>两者体积之和（分子、离子之间有间隔）。</p>',
        apply: function () { reset(1, 1, 1, 1, 0, 0, 0); },
        cam: { tx: 7, ty: 9.4, tz: -1, dist: 44, yaw: .24, pitch: .16 }
      },
      {
        name: '导电', title: '盐水为什么能导电',
        ask: '盐水能导电，糖水不能，差别究竟在哪？',
        body: '<p>现象层：给溶液接上直流电源，两只电极之间亮起电场；溶液里的 <b>Na⁺ 向负极</b>移动、<b>Cl⁻ 向正极</b>移动——电荷被搬着走，电路就通了。</p>' +
          '<p>微观层：导电的关键不是"有没有离子"，而是"离子<b>能不能自由移动</b>"。氯化钠固体里有大量离子，但它们被牢牢固定在晶格里，所以<b>固体食盐不导电</b>；一旦溶于水，离子自由了，溶液就导电。熔融的氯化钠也能导电，原因相同。</p>' +
          '<p>对照：蔗糖溶于水后，分散在水里的是<b>蔗糖分子</b>（不带电），没有自由移动的离子，所以糖水不导电。这就是"溶液导电性"判断题的通用思路——看溶质在水中是否以<b>自由离子</b>形式存在。</p>' +
          '<p>易错层：导电的不是水，也不是"电子在溶液里跑"，而是<b>离子定向移动</b>。还要注意：溶液不显电性，正负离子总数电荷相等。</p>',
        apply: function () { reset(1, 1, 1, 1, 1, 0, 0); },
        cam: { tx: 11, ty: 13, tz: -3, dist: 66, yaw: .08, pitch: .12 },
        controls: [
          { type: 'btn', label: '接通电源', onClick: function () { TG.field = 1; } },
          { type: 'btn', label: '断开电源', onClick: function () { TG.field = 0; } }
        ]
      },
      {
        name: '考核', title: '当一回化学家',
        ask: '下面每题都考溶解与溶液。',
        quiz: true,
        apply: function () { reset(1, 1, 1, 1, 0, 0, 0); },
        cam: { tx: 6.5, ty: 9.4, tz: -1, dist: 44, yaw: .24, pitch: .16 }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '氯化钠溶于水时，水分子在晶体表面的取向是：',
          opts: ['氧端朝向 Na⁺，氢端朝向 Cl⁻', '氧端朝向 Cl⁻，氢端朝向 Na⁺', '所有水分子朝向完全相同', '水分子与离子没有固定的相对取向'],
          ans: '氧端朝向 Na⁺，氢端朝向 Cl⁻',
          why: '水分子中氧端带部分负电（δ⁻）、氢端带部分正电（δ⁺），异种电荷相吸：δ⁻ 对着 Na⁺，δ⁺ 对着 Cl⁻。'
        },
        {
          q: '下列关于氯化钠溶液的说法，正确的是：',
          opts: ['溶液中存在自由移动的 Na⁺ 和 Cl⁻', '溶液中存在 NaCl 分子', '溶液中的 Na⁺ 比 Cl⁻ 多', '溶液能导电是因为水能导电'],
          ans: '溶液中存在自由移动的 Na⁺ 和 Cl⁻',
          why: '氯化钠由离子构成，没有 NaCl 分子；溶解后 Na⁺ 与 Cl⁻ 数目比为 1:1，整体电中性；导电靠的是自由移动的离子，不是水。'
        },
        {
          q: '食盐固体不导电，食盐水能导电，原因是：',
          opts: ['溶于水后离子能够自由移动', '溶于水后产生了新的离子', '水本身是导体', '溶于水后离子数目变多了'],
          ans: '溶于水后离子能够自由移动',
          why: '固体中离子被固定在晶格上不能移动；溶解后离子分散到水中可以自由移动，因而能导电——离子的种类和数目并没有改变。'
        },
        {
          q: '把食盐加入水中，充分搅拌后全部溶解。此过程中没有发生变化的是：',
          opts: ['Na⁺ 和 Cl⁻ 的数目', '离子的运动状态', '离子之间的间隔', '溶液的导电能力'],
          ans: 'Na⁺ 和 Cl⁻ 的数目',
          why: '溶解是物理变化，离子本身没有被破坏，数目不变；改变的是它们的分布、间隔和运动状态，导电能力则从无到有。'
        },
        {
          q: '溶液"均一、稳定"的含义是：',
          opts: ['各部分组成性质相同，静置不分层不沉淀', '颜色一定是透明的', '一定是无色液体', '溶质一定是固体'],
          ans: '各部分组成性质相同，静置不分层不沉淀',
          why: '均一指各处组成、性质一致；稳定指条件不变时长期静置不分层、不析出。溶液可以是有色的（如硫酸铜溶液），溶质也可以是液体或气体。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });

  /* 一次性把六个进度量推到指定值（步骤切换用，配合缓动平滑过渡） */
  function reset(att, peel, shell, spread, field, mag, polar) {
    TG.att = att; TG.peel = peel; TG.shell = shell;
    TG.spread = spread; TG.field = field; TG.mag = mag;
  }
})();
