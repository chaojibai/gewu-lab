/* 格物实验室 · 探究通电螺线管外部磁场的方向（three.js 单文件课件）
   鲁教版 九年级下册 · 第十八章 电与磁 · 第二节 电生磁

   【严谨】I = E/(r + R线圈)；有限长空心螺线管轴线上
           B(x) = μ₀NI/(2L)·[(x+L/2)/√(R²+(x+L/2)²) − (x−L/2)/√(R²+(x−L/2)²)]。
           管外磁场由「等效双磁荷」场给出，强度以管口 B 标定；磁感线沿该场
           数值积分得到（不是随手画椭圆），小磁针偏角 θ = atan2(Bx, Bz+Be)
           逐只求解并叠加地磁水平分量。N/S 由电流方向符号 sgn 推出，
           「匝数加倍」只改 B 不改方向——无写死极性、无预设偏转角。
   【真实感】硬纸板 + 四边压条 + 细铁屑棒（沿局部磁场转动、链长随 |B|）、
           6 只水平小磁针（阻尼转动）、绝缘支座托起螺线管、
           电源—开关—螺线管两套真实接线（对调正负极即整体换一组导线）、
           每件 P.ground 接地阴影、探测器材从 HOME 备料位推到工作位。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 模型参数（唯一真源，所有读数由此推出）────────────── */
  var U = 0.01;                 // 1 场景单位 = 1 cm
  var E = 6.0, RINT = 0.5, RCOIL = 5.5;   // V / Ω / Ω → I = 1.00 A
  var N0 = 200;                 // 基础匝数
  var LEN = 14, RAD = 1.8;      // 螺线管长 / 半径（场景单位）
  var LM = LEN * U, RM = RAD * U;
  var BE = 3.0e-5;              // 地磁水平分量 T（+z 为「北」）
  var MU0 = 4 * Math.PI * 1e-7;
  var FIELD_Y = 1.05;           // 磁感线画在纸板上方
  var SOL_Y = 3.2;              // 螺线管中心高度
  var RED = 0xb01818, BLK = 0x222222;

  /* 双磁荷场：+q 在 +a（N 端）、−q 在 −a（S 端），叠加地磁后用于一切方向判定 */
  var A_POLE = LEN * .85 / 2;
  var X_PROBE = LEN / 2 + 3;
  var AXIS_REF = (function () {
    function one(x, cx, sign) {
      var dx = x - cx, r2 = dx * dx + .8, r3 = Math.pow(r2, 1.5);
      return sign * dx / r3;
    }
    return one(X_PROBE, A_POLE, 1) + one(X_PROBE, -A_POLE, -1);
  })();

  var MODEL = {
    current: function (closed) { return closed ? E / (RINT + RCOIL) : 0; },
    /* 有限长空心螺线管轴线上磁感应强度（SI，T） */
    axisB: function (I, N, xm) {
      var h = LM / 2, u = xm + h, v = xm - h;
      var a = u / Math.sqrt(RM * RM + u * u), b = v / Math.sqrt(RM * RM + v * v);
      return MU0 * N * I / (2 * LM) * (a - b);
    },
    /* 管外平面场（场景坐标 → T），k 由管口场标定，sgn 决定 N 极在哪端 */
    field: function (k, sgn, x, z) {
      var out = { x: 0, z: 0 };
      [[A_POLE, 1], [-A_POLE, -1]].forEach(function (p) {
        var dx = x - p[0], r2 = dx * dx + z * z + .8, r3 = Math.pow(r2, 1.5);
        var f = k * sgn * p[1] / r3;
        out.x += f * dx; out.z += f * z;
      });
      out.z += BE;                       // 地磁水平分量始终存在
      return out;
    }
  };

  function solve(s) {
    var I = MODEL.current(s.closed), N = N0 * (s.more ? 2 : 1);
    var sgn = s.rev ? -1 : 1;
    var bc = MODEL.axisB(I, N, 0), be = MODEL.axisB(I, N, LM / 2);
    var k = be / AXIS_REF;             // 用管口场标定等效双磁荷强度
    return {
      on: s.closed, I: I, N: N, sgn: sgn, k: k, bc: bc, be: be,
      pole: !s.closed ? '未通电' : (sgn > 0 ? '右端 N / 左端 S' : '左端 N / 右端 S'),
      right: !s.closed ? '—' : (sgn > 0 ? 'N 极' : 'S 极')
    };
  }
  function fieldAt(q, x, z) { return MODEL.field(q.k, q.sgn, x, z); }
  function rnd(i) { var v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

  var st = { closed: false, rev: false, more: false, assembled: false, wrong: false,
             _t: 0, _place: 0 };   /* 连续量用 _ 前缀，避开 K.boot 的步骤补间 */
  var O = {};

  /* ── 水平小磁针：表盘朝上、红半针为 N 极，angle=0 指北(+z) ── */
  function makeCompass(r) {
    var g = new T.Group(), dark = new T.MeshStandardMaterial({ color: 0x39434b, roughness: .5, metalness: .4 });
    var base = new T.Mesh(new T.CylinderGeometry(r, r, .6, 30), dark);
    base.position.y = .3; g.add(base);
    var dial = new T.Mesh(new T.CircleGeometry(r - .15, 32),
      new T.MeshBasicMaterial({ color: 0xf7f5ec, side: T.DoubleSide }));
    dial.rotation.x = -Math.PI / 2; dial.position.y = .62; g.add(dial);
    var ring = new T.Mesh(new T.TorusGeometry(r - .18, .07, 8, 32), dark);
    ring.rotation.x = Math.PI / 2; ring.position.y = .65; g.add(ring);
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var tick = new T.Mesh(new T.BoxGeometry(.1, .04, .34), dark);
      tick.position.set(Math.sin(a) * (r - .42), .66, Math.cos(a) * (r - .42));
      tick.rotation.y = a; g.add(tick);
    }
    var ng = new T.Group(); ng.position.y = .72; g.add(ng);
    [1, -1].forEach(function (sg) {
      var half = new T.Mesh(new T.BoxGeometry(.34, .1, r - .55),
        new T.MeshBasicMaterial({ color: sg > 0 ? 0xc0392b : 0x3a6ea5 }));
      half.geometry.translate(0, 0, sg * (r - .55) / 2); ng.add(half);
    });
    var pivot = new T.Mesh(new T.CylinderGeometry(.18, .18, .3, 12), P.MAT.brass);
    pivot.position.y = .76; g.add(pivot);
    g.userData.needle = ng;
    g.userData.setAngle = function (a) { ng.rotation.y = a; };
    return g;
  }

  /* 极性牌：深底圆角铭牌，不再画成彩色圆形气球 */
  function poleTex(letter, bg) {
    var cv = document.createElement('canvas'); cv.width = 192; cv.height = 128;
    var x = cv.getContext('2d');
    x.fillStyle = '#1b2732'; x.fillRect(0, 0, 192, 128);
    x.strokeStyle = bg; x.lineWidth = 8; x.strokeRect(6, 6, 180, 116);
    x.fillStyle = bg; x.fillRect(0, 0, 18, 128);
    x.fillStyle = '#f4f8fb'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 78px Georgia,serif'; x.fillText(letter, 110, 66);
    return new T.CanvasTexture(cv);
  }

  /* 磁感线：沿双磁荷场做 RK2 数值积分，起点在 N 极面外，终点回到 S 极 */
  function buildFieldLines(q) {
    var g = new T.Group();
    /* 连续细管代替 1px Line：WebGL 线宽恒为 1，浅纸板上读不出连续场线 */
    var mat = new T.MeshBasicMaterial({ color: 0x3d9b7d, transparent: true, opacity: .68 });
    var arrowMat = new T.MeshBasicMaterial({ color: 0x3d9b7d });
    /* 发射角收窄 + 边界限在纸板内：旧版场线一路跑出画面、穿过小磁针 */
    [0.30, 0.58, 0.86, 1.14, 1.42].forEach(function (phi, pi) {
      [1, -1].forEach(function (zs, zi) {
        var x = q.sgn * (A_POLE + 1.05 * Math.cos(phi)), z = zs * 1.05 * Math.sin(phi), pts = [];
        for (var i = 0; i < 460; i++) {
          pts.push(new T.Vector3(x, FIELD_Y, z));
          var b = MODEL.field(q.k, q.sgn, x, z); b.z -= BE;   // 场线只跟螺线管场走
          var m = Math.hypot(b.x, b.z) || 1e-12, h = .55;
          var mx = x + b.x / m * h, mz = z + b.z / m * h;
          var b2 = MODEL.field(q.k, q.sgn, mx, mz); b2.z -= BE;
          var m2 = Math.hypot(b2.x, b2.z) || 1e-12;
          x += b2.x / m2 * h; z += b2.z / m2 * h;
          var dx = x + q.sgn * A_POLE;                        // 到达 S 极（−sgn·a）
          if (i > 8 && dx * dx + z * z < 2.6 * 2.6) break;
          if (Math.abs(x) > 20.5 || Math.abs(z) > 8.2 || !isFinite(x) || !isFinite(z)) break;
        }
        if (pts.length > 12) {
          /* RK2 积分路径一字未改，仅把散点等距抽稀后平滑成一根连续细管 */
          var step = Math.max(1, Math.floor(pts.length / 44));
          var sparse = [];
          for (var k = 0; k < pts.length; k += step) sparse.push(pts[k]);
          if (sparse[sparse.length - 1] !== pts[pts.length - 1]) sparse.push(pts[pts.length - 1]);
          g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(sparse), 44, .085, 4, false), mat));
          /* 少量方向箭头：隔一条场线放一个，且只放在纸板范围内 */
          var j = Math.floor(pts.length * .55), p = pts[j], p2 = pts[Math.min(j + 2, pts.length - 1)];
          if ((pi + zi) % 2 === 0 && Math.abs(p.x) < 19 && Math.abs(p.z) < 7.8) {
            var ar = new T.Mesh(new T.ConeGeometry(.34, .95, 8), arrowMat);
            ar.position.copy(p);
            ar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), p2.clone().sub(p).normalize());
            g.add(ar);
          }
        }
      });
    });
    return g;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(76, 32);

      /* ── 螺线管：两个绝缘支座托起，不悬空 ────────────── */
      var sol = P.solenoid({ len: LEN }); sol.position.set(0, SOL_Y, 0);
      K.scene().add(sol); O.sol = sol;
      /* 仪器库的绕线半径比管半径小 0.1，整根螺旋埋在管壁内，画面只剩零星点；
         改成沿管排布的铜环阵列，一眼读出「导线一圈圈绕在管上」 */
      sol.traverse(function (o) {
        if (o.geometry && o.geometry.type === 'TubeGeometry') o.visible = false;
      });
      for (var ci = 0; ci < 22; ci++) {
        var turn = new T.Mesh(new T.TorusGeometry(RAD + .16, .11, 8, 28), P.MAT.brass);
        turn.rotation.y = Math.PI / 2;                  // 环面法线沿管轴 x
        turn.position.x = -LEN / 2 + .4 + ci * (LEN - .8) / 21;
        sol.add(turn);
      }
      /* 两端绝缘端板 + 引线接线柱：线圈不再像一段裸弹簧 */
      [-1, 1].forEach(function (s) {
        var ep = new T.Mesh(new T.CylinderGeometry(RAD + .35, RAD + .35, .34, 28), P.MAT.dark);
        ep.rotation.z = Math.PI / 2; ep.position.x = s * (LEN / 2 + .1); sol.add(ep);
        var term = new T.Mesh(new T.CylinderGeometry(.28, .28, .7, 12), P.MAT.brass.clone());
        term.rotation.z = Math.PI / 2; term.position.x = s * (LEN / 2 + 2); sol.add(term);
      });
      [-5.2, 5.2].forEach(function (x) {
        var ped = new T.Mesh(new T.BoxGeometry(2.6, 1.0, 4.4), P.MAT.dark);
        ped.position.set(x, .9, 0); K.scene().add(ped);
        P.ground(x, 0, 2.2);
      });

      /* ── 电源、开关（一字排在后排，导线沿台面贴体走）── */
      var bat = P.battery({ w: 8 }); bat.position.set(-22, 0, -9); K.scene().add(bat); O.bat = bat;
      var sw = P.switch_(); sw.position.set(-11, 0, -9); K.scene().add(sw); O.sw = sw;
      P.ground(-22, -9, 5); P.ground(-11, -9, 3.2);

      /* ── 两套真实接线：rev=false / true，切换电源正负极即换一组 ── */
      function wire(pts, color) { var m = P.wire(pts, { color: color, r: .2 }); K.scene().add(m); return m; }
      function link(a, b, color, sag) { var m = P.link(a, b, { color: color, sag: sag }); K.scene().add(m); return m; }
      var batP = P.port(bat, 4, 4.4, 0), batN = P.port(bat, -4, 4.4, 0);
      var swL = P.port(sw, -1.6, 1.2, 0), swR = P.port(sw, 1.6, 1.2, 0);
      var solL = P.port(sol, -(LEN / 2 + 2), 0, 0), solR = P.port(sol, LEN / 2 + 2, 0, 0);
      O.wFwd = new T.Group(); O.wRev = new T.Group(); K.scene().add(O.wFwd); K.scene().add(O.wRev);
      /* 公共：电源正极 → 开关 */
      [O.wFwd, O.wRev].forEach(function (grp) {
        var m = link(batP, swL, RED, .6); K.scene().remove(m); grp.add(m);
      });
      /* 正向：开关 → 左引线；右引线 → 沿台面回电源负极 */
      (function () {
        var a = link(swR, solL, RED, .9); K.scene().remove(a); O.wFwd.add(a);
        var b = wire([solR, [9, 1.4, 0], [9, 1.4, -12], [-26, 1.4, -12], batN], BLK);
        K.scene().remove(b); O.wFwd.add(b);
      })();
      /* 反向：开关 → 绕到右侧接右引线；左引线 → 回电源负极 */
      (function () {
        var a = wire([swR, [-9.4, 1.4, -9], [12, 1.4, -14], [12, 1.4, 0], solR], RED);
        K.scene().remove(a); O.wRev.add(a);
        var b = wire([solL, [-9, 1.4, 0], [-9, 1.4, -14], [-26, 1.4, -14], batN], BLK);
        K.scene().remove(b); O.wRev.add(b);
      })();

      /* ── 探测器材组：HOME 备料位 → 工作位 ─────────────── */
      var probe = new T.Group(); K.scene().add(probe); O.probe = probe;
      /* 硬纸板：原米白大平面被环境顶灯刷成刺眼白板。
         压成灰蓝 + envMapIntensity 0，再铺细网格，读成「坐标实验纸板」。 */
      var boardTex = (function () {
        var cv = document.createElement('canvas'); cv.width = 920; cv.height = 380;
        var x = cv.getContext('2d');
        x.fillStyle = '#aeb9c2'; x.fillRect(0, 0, 920, 380);
        x.strokeStyle = 'rgba(52,72,90,.20)'; x.lineWidth = 1;
        for (var gx = 0; gx <= 920; gx += 20) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, 380); x.stroke(); }
        for (var gy = 0; gy <= 380; gy += 20) { x.beginPath(); x.moveTo(0, gy); x.lineTo(920, gy); x.stroke(); }
        x.strokeStyle = 'rgba(38,58,76,.48)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(460, 0); x.lineTo(460, 380); x.stroke();
        x.beginPath(); x.moveTo(0, 190); x.lineTo(920, 190); x.stroke();
        return new T.CanvasTexture(cv);
      })();
      var board = new T.Mesh(new T.BoxGeometry(46, .35, 19),
        new T.MeshStandardMaterial({ color: 0xaeb9c2, map: boardTex,
          roughness: .94, metalness: 0, envMapIntensity: 0 }));
      board.position.y = .2; probe.add(board); O.board = board;
      var frameMat = new T.MeshStandardMaterial({ color: 0x5d6a76, roughness: .7,
        metalness: .25, envMapIntensity: .2 });
      [[0, 9.3], [0, -9.3]].forEach(function (p) {
        var rail = new T.Mesh(new T.BoxGeometry(46, .45, .5), frameMat);
        rail.position.set(p[0], .42, p[1]); probe.add(rail);
      });
      [[-23, 0], [23, 0]].forEach(function (p) {
        var rail = new T.Mesh(new T.BoxGeometry(.5, .45, 19), frameMat);
        rail.position.set(p[0], .42, p[1]); probe.add(rail);
      });

      /* 细铁屑棒：沿局部磁场转动，链长随 |B| */
      O.filings = [];
      /* 铁屑只作点缀：数量/尺寸收小、颜色调淡，不再像一堆散落的黑色短划线盖过场线 */
      var filMat = new T.MeshStandardMaterial({ color: 0x9aa6ae, roughness: .6, metalness: .5,
        envMapIntensity: .2 });
      for (var i = 0; i < 60; i++) {
        var m = new T.Mesh(new T.BoxGeometry(.11, .08, .72), filMat);
        m.position.set(-21 + rnd(i) * 42, .48, -8.4 + rnd(i + 197) * 16.8);
        m.userData.x = m.position.x; m.userData.z = m.position.z;
        m.userData.seed = (rnd(i + 611) - .5) * Math.PI;
        probe.add(m); O.filings.push(m);
      }

      /* 6 只小磁针：端部 / 侧面 / 斜角，位置不同 → 偏角不同 */
      O.needles = [];
      [[16, 0], [-16, 0], [0, 7], [0, -7], [10, 5.5], [-10, -5.5]].forEach(function (p) {
        var cp = makeCompass(2.2); cp.position.set(p[0], .05, p[1]);
        cp.userData._a = 0; probe.add(cp); O.needles.push(cp);
        P.ground(p[0], p[1], 2.1);
      });

      /* ── 磁感线两组（正/反），按电流方向显隐 ─────────── */
      O.lf = buildFieldLines({ k: 1, sgn: 1 });
      O.lr = buildFieldLines({ k: 1, sgn: -1 });
      K.scene().add(O.lf); K.scene().add(O.lr);

      /* ── 极性牌 ─────────────────────────────────────── */
      O.texN = poleTex('N', '#c0392b'); O.texS = poleTex('S', '#2f6fbf');
      /* 极性牌贴着管端上方，旧版浮在半空 4.2 单位，像两个彩色气球 */
      function plate(x) {
        var m = new T.Mesh(new T.PlaneGeometry(2.4, 1.6),
          new T.MeshBasicMaterial({ map: O.texS, transparent: true,
            side: T.DoubleSide, depthTest: true }));
        m.position.set(x, SOL_Y + RAD + .55, 0); K.scene().add(m); return m;
      }
      O.plR = plate(LEN / 2 - 1.0); O.plL = plate(-(LEN / 2 - 1.0));

      P.ground(0, 0, 20);
      K.tag(O.sol, '螺线管（空心）', 'N = 200 匝（可加倍）；轴线沿 x');
      K.tag(O.sw, '开关 + 电源', '对调正负极即整体换一组导线，电流方向反向');
      K.tag(O.needles[0], '小磁针', 'N 极指向该点合磁场方向（含地磁）');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var q = solve(s);

      /* 备料动线：器材一直摆在桌上，用到才推到工作位 */
      var target = s.assembled ? 1 : 0;
      s._place += (target - s._place) * Math.min(1, dt * 3.6);
      O.probe.position.x = 26 * (1 - s._place);

      O.sw.userData.setClosed(s.closed);
      O.wFwd.visible = !s.rev; O.wRev.visible = s.rev;

      /* 磁感线：通电才出现，亮度随管中心 B 增强；反向换另一组场线 */
      var lit = q.on ? .24 + .40 * Math.min(1, Math.abs(q.bc) / 2.0e-3) : 0;
      [O.lf, O.lr].forEach(function (g) {
        g.visible = q.on;
        g.traverse(function (o) { if (o.material) { o.material.opacity = lit; o.material.transparent = true; } });
      });
      O.lf.visible = q.on && !s.rev; O.lr.visible = q.on && s.rev;

      /* 极性牌：N 极在哪端由 sgn 推出（不是写死） */
      O.plR.material.map = q.sgn > 0 ? O.texN : O.texS;
      O.plL.material.map = q.sgn > 0 ? O.texS : O.texN;
      O.plR.visible = O.plL.visible = q.on;

      /* 铁屑：轻敲后沿局部磁场排列；场强处链更长 */
      O.filings.forEach(function (m) {
        var b = fieldAt(q, m.userData.x, m.userData.z);
        var pure = Math.hypot(b.x, b.z - BE);
        var aim = q.on ? Math.atan2(b.x, b.z) : m.userData.seed;
        m.rotation.y += (aim - m.rotation.y) * Math.min(1, dt * 4.2);
        var strength = q.bc ? Math.min(1, pure / Math.abs(q.bc) * 1.6) : 0;
        var sc = .55 + (q.on ? 1.05 * strength : .18);
        m.scale.z += (sc - m.scale.z) * Math.min(1, dt * 5);
      });

      /* 小磁针：每只按自身位置的合磁场阻尼转动 */
      O.needles.forEach(function (cp) {
        var b = fieldAt(q, cp.position.x, cp.position.z);
        var aim = Math.atan2(b.x, b.z);
        cp.userData._a += (aim - cp.userData._a) * Math.min(1, dt * 3.0);
        cp.userData.setAngle(cp.userData._a);
      });
    }
  };

  function reset(s) { s.closed = false; s.rev = false; s.more = false; s.assembled = false; s.wrong = false; }

  K.boot({
    title: '探究通电螺线管外部磁场的方向',
    chip: '物理 · 鲁教版 · 九下 · 第十八章 电与磁 · 第二节 电生磁',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 14, dist: 62, tx: 0, tz: 0, yaw: .2, pitch: .36 },
    reads: [['I', '线圈电流 I'], ['N', '匝数 N'], ['Bc', '管中心 B'], ['Be', '管口 B'], ['pole', '极性'], ['theta', '右端磁针偏角']],
    values: function (s) {
      var q = solve(s), b = fieldAt(q, 16, 0);
      var deg = Math.atan2(b.x, b.z) * 180 / Math.PI;
      return {
        I: q.on ? q.I.toFixed(2) + ' A' : '0.00 A（断开）',
        N: String(q.N) + ' 匝',
        Bc: q.on ? (Math.abs(q.bc) * 1000).toFixed(2) + ' mT' : '0.00 mT',
        Be: q.on ? (Math.abs(q.be) * 1000).toFixed(2) + ' mT' : '0.00 mT',
        pole: q.pole,
        theta: (deg >= 0 ? '+' : '') + deg.toFixed(1) + '°（0° 指北）'
      };
    },
    steps: [
      { name: '看装置', title: '认识器材：未通电时小磁针只指北',
        ask: '没通电时，小磁针为什么仍指向同一方向？',
        body: '<p><b>器材：</b>空心螺线管（N = ' + N0 + ' 匝）、小磁针 6 只、铁屑与硬纸板、电源、开关、导线。</p>' +
          '<p><b>操作：</b>按下方按钮把<b>纸板和磁针</b>从备料位推到工作位；此时开关断开，螺线管 B = 0，各磁针只受<b>地磁水平分量 Bₑ ≈ ' + (BE * 1e6).toFixed(0) + ' µT</b> 作用，全部指北（偏角 0°），铁屑杂乱。</p>' +
          '<p><b>猜想：</b>通电后外部磁场分布与<b>条形磁铁</b>相似，两端出现 N、S 极。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '把纸板与小磁针推到工作位', onClick: function (s) { s.assembled = true; } }],
        cam: { tx: 0, ty: 14, tz: 0, dist: 64, yaw: .2, pitch: .4 } },
      { name: '通电', title: '闭合开关：磁场由模型算，铁屑沿场排列',
        ask: '通电后小磁针 N 极指向说明什么？',
        body: '<p><b>电路：</b>E = ' + E.toFixed(1) + ' V、内阻 r = ' + RINT + ' Ω、线圈电阻 ' + RCOIL + ' Ω，由闭合电路欧姆定律得 <b>I = E/(r + R) = ' + (E / (RINT + RCOIL)).toFixed(2) + ' A</b>。</p>' +
          '<p><b>场强（有限长空心螺线管解析式）：</b>B(x) = μ₀NI/(2L)·[(x+L/2)/√(R²+(x+L/2)²) − (x−L/2)/√(R²+(x−L/2)²)]。管中心 B ≈ <b>' + (solve({ closed: true, rev: false, more: false }).bc * 1000).toFixed(2) + ' mT</b>，管口约为其一半——右栏读数由该式实时给出。</p>' +
          '<p><b>现象：</b>铁屑沿<b>局部磁场方向</b>排成链（场强处链更长），磁感线由场数值积分画出，6 只磁针按各自位置的合磁场分别偏转。</p>',
        apply: function (s) { reset(s); s.assembled = true; },
        controls: [{ type: 'btn', label: '闭合开关（通电）', onClick: function (s) { s.assembled = true; s.closed = true; } }],
        cam: { tx: 0, ty: 12, tz: 2, dist: 52, yaw: .22, pitch: .38 } },
      { name: '安培定则', title: '右手螺旋定则：四指电流、拇指 N 极',
        ask: '右手螺旋定则中，四指和拇指分别代表什么？',
        body: '<p><b>安培定则：</b>右手握住螺线管，<b>四指</b>弯向线圈中的<b>电流方向</b>，<b>大拇指</b>所指那端就是 <b>N 极</b>。本接法电流由左引线流入，故右端为 <b>N</b>。</p>' +
          '<p><b>方向由模型定：</b>课件用电流方向符号 sgn = +1 决定双磁荷场的极性；磁感线从 N 端出发、回到 S 端（内部 S→N 闭合），小磁针 N 极沿合磁场指向——没有预先写好的 N/S 与偏角。</p>' +
          '<p><b>边界：</b>空心线圈、忽略铁芯磁化与边缘漏磁；把管外场等效为双磁荷并以管口解析场标定，是定性演示，不是有限元数据；地磁只保留水平分量。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.closed = true; },
        cam: { tx: 4, ty: 12, tz: 0, dist: 46, yaw: .26, pitch: .34 } },
      { name: '反向', title: '对调电源正负极：磁场随之反向',
        ask: '电流反向后，小磁针与 N/S 极怎样变化？',
        body: '<p><b>操作：</b>对调电源<b>正负极</b>——画面里是<b>整套导线换成另一组接法</b>（电流改从右引线流入），不是只改一个标签。</p>' +
          '<p><b>结果：</b>I 大小不变、符号相反 → sgn = −1 → N/S 互换、磁感线箭头反向、每只磁针偏角反号，而 <b>|B| 与铁屑排布形状不变</b>。</p>' +
          '<p><b>结论：</b>通电螺线管的<b>磁场方向只由电流方向</b>决定。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.closed = true; s.rev = true; },
        controls: [
          { type: 'btn', label: '对调正负极（反向）', onClick: function (s) { s.closed = true; s.rev = true; } },
          { type: 'btn', label: '接回原极性', onClick: function (s) { s.rev = false; } }
        ],
        cam: { tx: 0, ty: 12, tz: 0, dist: 50, yaw: .2, pitch: .36 } },
      { name: '反例', title: '匝数加倍：B 加倍，磁针方向却几乎不变',
        ask: '小磁针能判断磁场强弱吗？',
        body: '<p><b>反例（本步重点）：</b>按按钮把 N 由 ' + N0 + ' 匝加倍到 ' + (N0 * 2) + ' 匝。由 B ∝ NI，管中心 B 由 <b>' + (solve({ closed: true, rev: false, more: false }).bc * 1000).toFixed(2) + ' mT</b> 变为 <b>' + (solve({ closed: true, rev: false, more: true }).bc * 1000).toFixed(2) + ' mT</b>（磁感线更亮、铁屑链更长），但磁针<b>偏角几乎不变</b>——因为 B 远大于地磁 Bₑ，方向早已饱和。</p>' +
          '<p><b>结论：</b>小磁针是<b>方向</b>探测器，不是<b>强弱</b>测量仪；强弱要看铁屑密度／磁感应强度计。误以为「磁针偏得越多磁场越强」是常见错误。</p>' +
          '<p><b>边界：</b>加倍匝数时忽略了线圈电阻随之增大（若用同规格导线，I 会下降，B 不会严格翻倍）；此处只为演示方向与强弱的解耦。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.closed = true; },
        controls: [
          { type: 'btn', label: '匝数加倍到 ' + (N0 * 2) + ' 匝', onClick: function (s) { s.more = true; s.wrong = true; } },
          { type: 'btn', label: '回到 ' + N0 + ' 匝', onClick: function (s) { s.more = false; s.wrong = false; } }
        ],
        cam: { tx: 0, ty: 12, tz: 0, dist: 52, yaw: .2, pitch: .36 } }
    ],
    quiz: function () {
      var bank = [
        { q: '安培定则四指代表？', opts: ['电流方向', 'N 极', 'S 极', '磁场强弱'], ans: '电流方向', why: '右手四指弯向电流方向，拇指指 N 极。' },
        { q: '通电螺线管外部磁场似？', opts: ['条形磁铁', '蹄形磁铁', '匀强磁场', '无磁场'], ans: '条形磁铁', why: '外部磁感线从一端出发绕回另一端，与条形磁铁相似。' },
        { q: '改变电流方向会？', opts: ['磁场反向', '磁场不变', '磁场消失', '只改变强弱'], ans: '磁场反向', why: '电流方向决定 N/S 极，反向则极性互换。' },
        { q: '小磁针能否测磁场强弱？', opts: ['不能，只判方向', '能，偏角正比于 B', '能，直接读数', '只能测电流'], ans: '不能，只判方向', why: '偏角由合磁场方向决定，强场下很快饱和。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
