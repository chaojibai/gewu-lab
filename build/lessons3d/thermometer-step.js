/* 格物实验室 · 用常见温度计测量温度（three.js 单文件课件）
   鲁教版 九年级上册 · 第十一章 物态变化 · 第一节 温度及其测量

   【严谨】水温由热平衡模型实时算：T(t) = T₀ + P·t/(c·m)，
           dT/dt = P/(c·m) = 84/(4200×0.2) = 0.10 ℃/s，到沸点 100 ℃ 后恒定。
           温度计示数 = T(t)；玻璃泡碰底示数 = T(t) + ΔT底；取出后按牛顿冷却
           T_out(τ) = T环境 + (T − T环境)·e^(−τ/τ₀) 下降，均由模型算，非拟合。
           体温计缩口保持 T体 = 37.0 ℃，可离体读数。
   【真实感】P.ringStand 铁架台夹持温度计、玻璃泡浸没不碰底壁、石棉网+水面+
           酒精灯火焰、体温计缩口与托架；每件 P.ground 接地阴影，材质取 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；正文与读数都引用这里算出的值）── */
  var T0 = 24, T_ENV = 24, T_BOIL = 100;          // 初温 / 环境温度 / 标准大气压沸点 ℃
  var P_HEAT = 84;                                 // 酒精灯有效加热功率 W
  var C_W = 4.2e3;                                // 水比热容 J/(kg·℃)
  var M_W = 0.20;                                 // 水质量 kg（200 mL）
  var RATE = P_HEAT / (C_W * M_W);                // 升温速率 0.10 ℃/s
  var T_BOIL_TIME = (T_BOIL - T0) / RATE;         // 760 s 到达沸点
  var DT_BOTTOM = 6.0;                            // 玻璃泡碰杯底：局部过热偏高 ℃
  var TAU = 30;                                   // 离体牛顿冷却时间常数 s
  var T_BODY = 37.0;                              // 体温计热平衡温度（真实体温）℃
  function modelT(t) { return Math.min(T_BOIL, T0 + RATE * t); }
  function modelOut(T, tau) { return T_ENV + (T - T_ENV) * Math.exp(-tau / TAU); }
  /* 正文示例值全部由模型算，保证与读数一致 */
  var T60 = modelT(60);                           // 30.0 ℃
  var T_BOTTOM_EX = T60 + DT_BOTTOM;              // 36.0 ℃
  var T_OUT30 = modelOut(T60, 30);                // ≈26.2 ℃

  var RIG = {
    bx: -8, bz: 0,                                // 烧杯 / 温度计 / 酒精灯同轴
    ringY: 6.0, netY: 6.5, beakerY: 6.7,
    waterLevel: .62, waterH: .62 * 5.0,           // 水柱高 3.1
    lampFlameY: 5.0, flameH: 2.8,
    standX: -13, postH: 15, clampY: 12.5,
    thermoY: 9.1,                                // 玻璃泡中心 8.5：全浸没、不碰杯底
    drop: 1.2, lift: 6.2                         // 碰底/取出：取出要完全离开杯口沿
  };

  /* 连续量一律 _ 前缀，避开 K.boot 的 0.55 s 数值补间 */
  var st = {
    _t: 0, _out: 0, _drop: 0, _lift: 0,
    heating: false, touchBottom: false, outside: false, bodyMode: false, judged: false
  };
  var O = {};
  var flameLv = 0;
  var YAXIS = new T.Vector3(0, 1, 0);

  /* 真实酒精灯：玻璃灯体 + 灯芯管 + 棉芯 + 旁置金属灯帽。
     灯芯顶端 ≈ y=5，与现有 K.shaderFlame 的火焰底对齐；玻璃靠轮廓线定形。 */
  function makeAlcoholLamp(o) {
    o = o || {};
    var g = new T.Group();
    var bodyH = 4.2, R = 2.2;
    var glass = new T.MeshPhysicalMaterial({ color: 0xeef6fb, roughness: .06, metalness: 0,
      transparent: true, opacity: .34, side: T.DoubleSide, depthWrite: false,
      clearcoat: .8, clearcoatRoughness: .08, envMapIntensity: 1.4 });
    var prof = [], i, N = 20;
    for (i = 0; i <= N; i++) {
      var t = i / N;
      var rr = R * (.34 + .66 * Math.sin(Math.PI * Math.pow(t, .8)));
      if (t > .82) rr *= 1 - (t - .82) * 2.2;
      prof.push(new T.Vector2(Math.max(.12, rr), t * bodyH));
    }
    var body = new T.Mesh(new T.LatheGeometry(prof, 40), glass);
    body.castShadow = false; body.renderOrder = 3; g.add(body);
    var alc = new T.Mesh(new T.CylinderGeometry(R * .8, R * .76, bodyH * .5, 32),
        new T.MeshStandardMaterial({ color: 0xd9e2c8, roughness: .2,
          transparent: true, opacity: .55, depthWrite: false }));
    alc.position.y = bodyH * .3; g.add(alc);
    /* 酒精液面线：没有它，透明灯体在浅墙前读成一个白玻璃球 */
    var alcRim = new T.Mesh(new T.TorusGeometry(R * .79, .05, 6, 30),
      new T.MeshBasicMaterial({ color: 0x7fa8c0 }));
    alcRim.rotation.x = Math.PI / 2; alcRim.position.y = bodyH * .55; g.add(alcRim);
    var collar = new T.Mesh(new T.CylinderGeometry(.55, .62, .8, 20),
      new T.MeshStandardMaterial({ color: 0x9aa3ad, metalness: .85, roughness: .3, envMapIntensity: 1.1 }));
    collar.position.y = bodyH + .3; g.add(collar);
    var wick = new T.Mesh(new T.CylinderGeometry(.2, .22, .55, 12),
      new T.MeshStandardMaterial({ color: 0x2b231c, roughness: .9 }));
    wick.position.y = bodyH + .65; g.add(wick);
    /* 玻璃轮廓：口沿环 + 底环 + 两条母线 */
    var lineCol = 0x52738f;
    function ring(y, rr, op) {
      var pts = [], k;
      for (k = 0; k <= 48; k++) {
        var a = k / 48 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts.slice(0, 48)),
        new T.LineBasicMaterial({ color: lineCol, transparent: true, opacity: op })));
    }
    ring(.06, R * .36, .55);
    ring(bodyH, R * .3, .75);
    [-1, 1].forEach(function (sg) {
      g.add(new T.LineSegments(new T.BufferGeometry().setFromPoints([
        new T.Vector3(sg * R * .9, bodyH * .45, 0),
        new T.Vector3(sg * R * .5, bodyH * .9, 0)]),
        new T.LineBasicMaterial({ color: lineCol, transparent: true, opacity: .4 })));
    });
    /* 旁置灯帽：深灰金属，避免「粉色小柱像蛋糕」 */
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

  /* ══ 细玻璃管温度计（自建）══
     共享 P.thermometer 用 2.0 宽的贴纸平板 + 半径 1.15 的大圆泡，
     浅背景下读成「墙上贴了把尺子 + 杯里一个橙色灯泡」。这里改成：
     细玻璃管 + 管内乳白窄刻度背板 + 细液柱 + 长圆形玻璃泡，全部在管内。 */
  function makeThermo(lo, hi, major, minor, opt) {
    opt = opt || {};
    var g = new T.Group(), H = opt.h || 12, R = .38;
    var glass = new T.MeshPhysicalMaterial({ color: 0xf2f8fc, roughness: .05, metalness: 0,
      transparent: true, opacity: .3, side: T.DoubleSide, depthWrite: false,
      clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: 1.5 });
    g.add(new T.Mesh(new T.CylinderGeometry(R, R, H, 20, 1, true), glass));
    var LM = new T.MeshBasicMaterial({ color: 0xc9dce8 });
    [0, H].forEach(function (y) {
      var ring = new T.Mesh(new T.TorusGeometry(R, .035, 6, 22), LM);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    });
    /* 刻度背板：宽 .72 < 管径 .76，贴管内壁后侧。canvas 中央 92~108 是液柱通道，
       刻度线从通道右缘 112 起、数字右对齐到 196 —— 液柱顶端与刻度水平对齐，
       不再出现「红柱在左、刻度在右」两列错开。 */
    var cv = document.createElement('canvas'); cv.width = 200; cv.height = 1024;
    var x = cv.getContext('2d');
    x.fillStyle = '#eef3f6'; x.fillRect(0, 0, 200, 1024);
    x.fillStyle = '#d8e3ea'; x.fillRect(92, 0, 16, 1024);       // 毛细管通道
    x.fillStyle = '#263440'; x.textAlign = 'right'; x.textBaseline = 'middle';
    var span = hi - lo;
    for (var v = lo; v <= hi + 1e-6; v += minor) {
      var f = (v - lo) / span, yy = (1 - f) * (1024 - 32) + 16;
      var isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      x.fillRect(isMaj ? 88 : 100, yy, isMaj ? 52 : 26, isMaj ? 4 : 2.5);
      if (isMaj) {
        x.font = 'bold 26px Consolas,monospace';
        x.fillText(String(Math.round(v)), 196, yy);
      }
    }
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 8;
    tex.minFilter = T.LinearFilter; tex.magFilter = T.LinearFilter; tex.generateMipmaps = false;
    var plate = new T.Mesh(new T.PlaneGeometry(.72, H - .3),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    plate.position.set(0, H / 2, -.14); g.add(plate);
    /* 液柱（实验温度计红 / 体温计深水银）+ 细长玻璃泡（不是圆蛋）*/
    var LIQ = new T.MeshBasicMaterial({ color: opt.silver ? 0x5c6b78 : 0xb8281e });
    var col = new T.Mesh(new T.CylinderGeometry(.07, .07, 1, 10), LIQ);
    col.position.set(0, 0, .02); g.add(col);
    var bulb = new T.Mesh(new T.SphereGeometry(.19, 16, 12), LIQ);
    bulb.scale.set(1, 3.0, 1); bulb.position.y = -.62; g.add(bulb);
    var bulbGlass = new T.Mesh(new T.SphereGeometry(.24, 16, 12), glass);
    bulbGlass.scale.set(1, 2.8, 1); bulbGlass.position.y = -.62; g.add(bulbGlass);
    var cap = new T.Mesh(new T.SphereGeometry(R, 14, 10), glass);
    cap.position.y = H; g.add(cap);
    g.userData.setTemp = function (t) {
      var f = Math.max(0, Math.min(1, (t - lo) / span));
      var h = Math.max(.02, f * (H - .3));
      col.scale.y = h; col.position.y = .15 + h / 2;
    };
    g.userData.setTemp(lo);
    return g;
  }

  /* ══ 石棉网 / 铁圈：只做**后半圈** ══
     俯视机位下，完整的前半圈 + 实心网面必然挡住正下方的火焰（火只会从网眼露出几块黄斑）。
     从正面看后半圈就足以读出「铁圈托网」，前方留空则火苗完整可见、加热关系正确。 */
  function makeNet() {
    var g = new T.Group();
    var WM = new T.MeshStandardMaterial({ color: 0x5d6873, roughness: .5, metalness: .6, envMapIntensity: .2 });
    for (var i = -4; i <= 0; i++) {
      var o = i * .68;
      var a = new T.Mesh(new T.BoxGeometry(5.8, .06, .06), WM); a.position.set(0, .11, o); g.add(a);
    }
    for (var j = -4; j <= 4; j++) {
      var b = new T.Mesh(new T.BoxGeometry(.06, .06, 2.9), WM);
      b.position.set(j * .68, .11, -1.45); g.add(b);
    }
    /* 后半金属边框（前框会横在火苗前面）*/
    var back = new T.Mesh(new T.BoxGeometry(6.2, .14, .14), WM);
    back.position.set(0, .1, -3.0); g.add(back);
    [-3.0, 3.0].forEach(function (x) {
      var side = new T.Mesh(new T.BoxGeometry(.14, .14, 3.0), WM);
      side.position.set(x, .1, -1.5); g.add(side);
    });
    /* 前缘左右两段短托边（中央留缺口给火苗）：正面能读出「网托着烧杯」，又不挡火 */
    [-2.1, 2.1].forEach(function (x) {
      var lip = new T.Mesh(new T.BoxGeometry(2.0, .16, .5), WM);
      lip.position.set(x, .1, 2.9); g.add(lip);
    });
    return g;
  }
  function makeHalfRing(R, y, mat) {
    var pts = [], i;
    for (i = 0; i <= 32; i++) {
      var a = Math.PI + i / 32 * Math.PI;
      pts.push(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    var m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 32, .13, 6, false), mat);
    m.position.y = y; return m;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(52, 24);

      /* ── 铁架台：铁圈托石棉网/烧杯，夹子真正固定温度计 ── */
      var stand = P.ringStand({ postX: RIG.standX, postZ: 0, postH: RIG.postH,
        ringX: RIG.bx, ringZ: RIG.bz, ringY: RIG.ringY, ringR: 2.9, clampY: RIG.clampY });
      K.scene().add(stand); O.stand = stand;
      /* 共享 P.ringStand 的环形夹（半径 .62 + 1.1 方块）比细温度计粗五倍，
         读成「吊环挂着尺子」：隐藏夹头，改挂贴合管径的小卡箍 + 两片夹爪 */
      stand.children.forEach(function (o) {
        if (o.position && o.position.x === RIG.bx &&
            Math.abs(o.position.y - RIG.clampY) < 1.2) o.visible = false;
      });
      var CLAMPM = new T.MeshStandardMaterial({ color: 0x6b7782, roughness: .42,
        metalness: .6, envMapIntensity: .25 });
      var smallJaw = new T.Mesh(new T.TorusGeometry(.5, .07, 8, 18), CLAMPM);
      smallJaw.rotation.x = Math.PI / 2;
      smallJaw.position.set(RIG.bx, RIG.clampY, RIG.bz); K.scene().add(smallJaw);
      [-1, 1].forEach(function (sg) {
        var pad = new T.Mesh(new T.BoxGeometry(.18, .42, .42), CLAMPM);
        pad.position.set(RIG.bx + sg * .5, RIG.clampY, RIG.bz); K.scene().add(pad);
      });
      /* 共享铁圈管径 .32 太粗，俯视时后半弧会连成一条深色碗把火挡住 → 换细圈 */
      stand.children.forEach(function (o) {
        if (o.geometry && o.geometry.type === 'TorusGeometry' &&
            Math.abs(o.position.y - RIG.ringY) < .1) o.visible = false;
      });
      var fineRing = makeHalfRing(2.9, RIG.ringY, CLAMPM);
      fineRing.position.x = RIG.bx; fineRing.position.z = RIG.bz;
      K.scene().add(fineRing);
      var net = makeNet(); net.position.set(RIG.bx, RIG.netY, RIG.bz);
      K.scene().add(net); O.net = net;

      /* ── 烧杯（不自带液体，避免与课件水柱重复）+ 真实水柱 + 水面 ── */
      var beaker = C.create('beaker', {});
      C.place(beaker, RIG.bx, RIG.bz, RIG.beakerY); K.scene().add(beaker); O.beaker = beaker;
      /* 共享玻璃的 clearcoat/envMap 会在杯壁正中形成一条竖直镜面亮带，
         温度计移走后它孤零零留在杯里，读成「杯里还残留玻璃」→ 压掉高光 */
      beaker.traverse(function (o) {
        if (o.isMesh && o.material && o.material.transparent) {
          o.material = o.material.clone();
          o.material.envMapIntensity = .3;
          if ('clearcoat' in o.material) o.material.clearcoat = .15;
        }
      });
      /* 不透明磨砂杯底：挡住下方酒精灯灯体透过杯底被读成「杯里泡着个白球」 */
      var cupBot = new T.Mesh(new T.CylinderGeometry(2.85, 2.85, .18, 32),
        new T.MeshStandardMaterial({ color: 0x9fbac8, roughness: .7, metalness: 0, envMapIntensity: 0 }));
      cupBot.position.set(RIG.bx, RIG.beakerY + .09, RIG.bz); K.scene().add(cupBot);
      /* 水体不吃光照：MeshPhysical 的镜面高光会在圆柱正中形成一条竖直亮带，
         特写里读成「从水面插到杯底的白色棒」；只留侧壁，不要底面圆盘 */
      var water = new T.Mesh(new T.CylinderGeometry(2.9, 2.9 * .96, RIG.waterH, 28, 1, true),
        new T.MeshBasicMaterial({ color: 0x9fd0e6, transparent: true, opacity: .38,
          side: T.DoubleSide, depthWrite: false }));
      water.position.set(RIG.bx, RIG.beakerY + RIG.waterH / 2, RIG.bz);
      K.scene().add(water); O.water = water;
      var surf = new T.Mesh(new T.CircleGeometry(2.86, 32),
        new T.MeshBasicMaterial({ color: 0x6fb4d0, transparent: true, opacity: .5, side: T.DoubleSide }));
      surf.rotation.x = -Math.PI / 2;
      surf.position.set(RIG.bx, RIG.beakerY + RIG.waterH, RIG.bz);
      K.scene().add(surf); O.surf = surf;

      /* ── 实验室温度计：细玻璃管 + 管内刻度背板，铁架台夹子固定 ── */
      var th = makeThermo(0, 110, 10, 5);
      th.position.set(RIG.bx, RIG.thermoY, RIG.bz); K.scene().add(th); O.thermo = th;
      th.userData.setTemp(T0);

      /* 酒精灯 + 火焰：只前移 1.5（仍在烧杯正下方，不偏到左外侧），
         让火苗从铁圈/石棉网的前缘内侧露出来；billboard 已在 update 里修正为竖直 */
      var lamp = makeAlcoholLamp({ x: RIG.bx, z: RIG.bz + 1.5 });
      K.scene().add(lamp); O.lamp = lamp;
      O.flame = K.shaderFlame({ x: RIG.bx, y: RIG.lampFlameY, z: RIG.bz + 1.5,
        r: 1.25, h: RIG.flameH, light: 1.9, dist: 13 });
      /* 浅色墙 + 白石棉网会把默认亮黄火焰吃成白尖：调成饱和橙红、压低高光亮度 */
      O.flame.mat.uniforms.uHot.value.set(1.0, .80, .26);
      O.flame.mat.uniforms.uMid.value.set(1.0, .30, .04);
      O.flame.mat.uniforms.uLow.value.set(.22, .40, 1.0);
      O.flame.setLit(0);

      /* ── 体温计：浅托盘 + 双立柱 + 黄铜卡箍，缩口做成管内细颈 ── */
      var bTray = new T.Group();
      var trayMat = new T.MeshStandardMaterial({ color: 0xe6ebef, roughness: .65,
        metalness: .05, envMapIntensity: 0 });
      var tray = new T.Mesh(new T.BoxGeometry(5.2, .35, 2.4), trayMat);
      tray.position.y = .18; bTray.add(tray);
      var POSTM = new T.MeshStandardMaterial({ color: 0x6b7782, roughness: .45,
        metalness: .55, envMapIntensity: .2 });
      [-1.5, 1.5].forEach(function (dx) {
        var post = new T.Mesh(new T.CylinderGeometry(.12, .12, 1.6, 10), POSTM);
        post.position.set(dx, .95, 0); bTray.add(post);
      });
      /* 横杆把两根立柱连起来，卡箍挂在横杆上（否则读作两根孤立柱子）*/
      var cross = new T.Mesh(new T.BoxGeometry(3.1, .12, .12), POSTM);
      cross.position.y = 1.72; bTray.add(cross);
      var brass = new T.MeshStandardMaterial({ color: 0xb08a4a, roughness: .38,
        metalness: .68, envMapIntensity: .35 });
      var hoop = new T.Mesh(new T.TorusGeometry(.45, .08, 8, 18), brass);
      hoop.rotation.x = Math.PI / 2; hoop.position.y = 1.7; bTray.add(hoop);
      bTray.position.set(6.5, 0, 0); K.scene().add(bTray); O.bStand = bTray;
      var body = makeThermo(35, 42, 1, .1, { silver: true, h: 11 });
      body.position.set(6.5, 1.4, 0); K.scene().add(body); O.body = body;
      body.userData.setTemp(T_BODY);
      /* 缩口：管身可读高度的一圈黄铜细环（太靠底会与托架卡箍重叠）*/
      var neck = new T.Mesh(new T.TorusGeometry(.22, .05, 6, 16), brass);
      neck.rotation.x = Math.PI / 2; neck.position.y = 1.2; body.add(neck);
      O.neck = neck;

      /* ── 接地阴影（深色台面用深色 blob，每件落地器材一个）── */
      P.ground(RIG.bx, RIG.bz, 7);    // 烧杯/灯/温度计
      P.ground(RIG.standX, 0, 5);     // 铁架台
      P.ground(6.5, 0, 4);             // 体温计托架

      K.tag(stand, '铁架台', '铁圈托石棉网，夹子固定温度计');
      K.tag(th, '实验室温度计', '玻璃泡全浸没、不碰底壁、读数时留在水中');
      K.tag(beaker, '烧杯+水', 'm = ' + M_W.toFixed(2) + ' kg，c = ' + C_W.toFixed(0) + ' J/(kg·℃)');
      K.tag(lamp, '酒精灯', '有效加热功率 P = ' + P_HEAT + ' W，外焰加热');
      K.tag(body, '体温计', '缩口使液柱不回退，可离体读数；用前需甩');
      K.tag(neck, '缩口', '水银冷却时在此断开，液柱保持最高温度');
      O.ready = true;
    },

    update: function (dt, s) {
      /* 时钟：加热中且未取出时推进；取出后单独累计离体时间 */
      if (s.heating && !s.outside) s._t += dt;
      if (s.outside) s._out += dt;
      if (s.bodyMode) { /* 体温计由缩口保持，不随加热时钟变 */ }

      var lit = (s.heating && !s.outside && !s.bodyMode) ? 1 : 0;
      flameLv += (lit - flameLv) * Math.min(1, dt * 4);
      O.flame.setLit(flameLv); O.flame.tick(s._t);
      /* 引擎 tick 让整组跟着相机俯仰倾斜，plane 的 H/2 局部偏移会把火苗甩到灯芯侧上方；
         只保留绕 y 轴的朝向，火焰始终竖直立在灯芯正上方。 */
      O.flame.mesh.quaternion.setFromAxisAngle(YAXIS, K.cam.yaw);

      /* 真实位移：碰底则下移、取出则上移离开水面 */
      s._drop += ((s.touchBottom ? 1 : 0) - s._drop) * Math.min(1, dt * 4);
      s._lift += ((s.outside ? 1 : 0) - s._lift) * Math.min(1, dt * 4);
      O.thermo.position.y = RIG.thermoY - s._drop * RIG.drop + s._lift * RIG.lift;

      /* 实验室温度计示数由模型算：正常=T(t)，碰底=T+Δ，取出=牛顿冷却 */
      var Tt = modelT(s._t), labRead;
      if (s.outside) labRead = modelOut(Tt, s._out);
      else if (s.touchBottom) labRead = Tt + DT_BOTTOM;
      else labRead = Tt;
      O.thermo.userData.setTemp(labRead);
      O.body.userData.setTemp(T_BODY);            // 体温计缩口：离体也不回落
    }
  };

  function reset(s) {
    s._t = 0; s._out = 0; s._drop = 0; s._lift = 0;
    s.heating = false; s.touchBottom = false; s.outside = false;
    s.bodyMode = false; s.judged = false;
  }

  K.boot({
    title: '用常见温度计测量温度',
    chip: '物理 · 鲁教版 · 九上 · 第十一章 物态变化 · 第一节 温度及其测量',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 11, dist: 48, tx: 3, tz: 0, yaw: .2, pitch: .18 },
    reads: [['state', '状态'], ['temp', '水温'], ['read', '温度计示数'],
            ['judge', '结论'], ['time', '加热 t'], ['rate', '升温速率']],
    values: function (s) {
      var Tt = modelT(s._t);
      var read;
      if (s.bodyMode) read = T_BODY;
      else if (s.outside) read = modelOut(Tt, s._out);
      else if (s.touchBottom) read = Tt + DT_BOTTOM;
      else read = Tt;
      var state = s.bodyMode ? '体温计·离体'
                : s.outside ? '已取出（冷却中）'
                : s.touchBottom ? '加热中·玻璃泡碰底'
                : s.heating ? (s._t >= T_BOIL_TIME ? '沸腾中' : '加热中') : '未加热';
      var judge = !s.judged ? '—'
                : s.bodyMode ? '缩口保持，可离体读数'
                : s.touchBottom ? '玻璃泡碰底 → 读数偏高 ' + DT_BOTTOM.toFixed(1) + ' ℃'
                : s.outside ? '取出读数 → 低于真实水温'
                : '液体热胀冷缩，热平衡后平视读数';
      return {
        state: state,
        temp: Tt.toFixed(1) + ' ℃',
        read: read.toFixed(1) + ' ℃',
        judge: judge,
        time: (s.bodyMode ? '—' : s._t.toFixed(1) + ' s'),
        rate: RATE.toFixed(2) + ' ℃/s'
      };
    },
    steps: [
      { name: '三观察', title: '使用温度计前先看什么？',
        ask: '量程和分度值分别代表什么？',
        body: '<p><b>三观察：</b>① <b>零刻度</b>位置；② <b>量程</b>（能测的温度范围）；' +
          '③ <b>分度值</b>（相邻两刻度差）。本装置：铁架台（铁圈+温度计夹）、石棉网、' +
          '烧杯（m = ' + M_W.toFixed(2) + ' kg 水）、酒精灯、实验室温度计与体温计。</p>' +
          '<p><b>参数：</b>实验室温度计 0~110 ℃、分度 1 ℃（本模型取此量程）；' +
          '体温计 35~42 ℃、分度 <b>0.1 ℃</b>，可测到小数点后一位。</p>' +
          '<p><b>边界/假设：</b>温度计基于液体<b>热胀冷缩</b>且已与被测物达到<b>热平衡</b>；' +
          '玻璃泡须全部浸入、不碰杯底杯壁；本模型忽略玻璃自身吸热与读数滞后。</p>' +
          '<p><b>反例：</b>测超过量程的温度会<b>胀裂</b>；用体温计直接测沸水（' + T_BOIL +
          ' ℃ ≫ 42 ℃）同样会损坏——量程是硬边界，不是建议值。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: -7, ty: 11, tz: 0, dist: 42, yaw: .28, pitch: .18 } },

      { name: '正确测温', title: '把温度计放入水中测量（热平衡模型）',
        ask: '为什么玻璃泡不能碰杯底、杯壁，且要等示数稳定再读数？',
        body: '<p><b>规范：</b>玻璃泡<b>全部浸入</b>水中、不碰杯壁杯底；待示数<b>稳定</b>后读数；' +
          '读数时温度计<b>留在水中</b>，视线与液柱上表面<b>相平</b>。画面里温度计由铁架台夹子真正固定。</p>' +
          '<p><b>模型：</b>忽略散热与容器吸热时，功率 P 全部用来升温，' +
          '<b>P·t = c·m·(T − T₀)</b>，即 <b>T(t) = T₀ + P·t/(c·m)</b>，' +
          '升温速率 <b>dT/dt = P/(c·m) = ' + P_HEAT + '/(' + C_W.toFixed(0) + '×' + M_W.toFixed(2) +
          ') = ' + RATE.toFixed(2) + ' ℃/s</b>；达到 T<sub>沸</sub> = ' + T_BOIL +
          ' ℃ 后 <b>T 恒定为 ' + T_BOIL + ' ℃</b>（继续吸热用于汽化）。右侧水温每帧由此式实时算。</p>' +
          '<p><b>由模型算：</b>T(60 s) = ' + T0 + ' + ' + RATE.toFixed(2) + '×60 = <b>' + T60.toFixed(1) +
          ' ℃</b>；到沸点需 t = (' + T_BOIL + ' − ' + T0 + ')/' + RATE.toFixed(2) +
          ' = <b>' + T_BOIL_TIME.toFixed(0) + ' s</b>。</p>' +
          '<p><b>边界/假设：</b>标准大气压、P 与 m 恒定、水混合均匀、无相变前的散热；' +
          '真实酒精灯有效功率约几十瓦且另有散热，故实际升温更慢、到沸点更久（本模型取 P = ' + P_HEAT + ' W 为等效净功率）。</p>' +
          '<p><b>反例：</b>① 玻璃泡<b>碰杯底</b>，测到被直接加热的杯底，示数 = T + ' + DT_BOTTOM.toFixed(1) +
          ' = <b>' + T_BOTTOM_EX.toFixed(1) + ' ℃</b>（偏高）；② <b>取出</b>读数，按牛顿冷却 ' +
          'T<sub>out</sub>(τ) = T<sub>环境</sub> + (T − T<sub>环境</sub>)e<sup>−τ/τ₀</sup>（τ₀ = ' + TAU +
          ' s），取 30 s 后只有 <b>' + T_OUT30.toFixed(1) + ' ℃</b>（偏低）。按下方按钮切换，温度计会真实下移/上移。</p>',
        apply: function (s) { reset(s); s.heating = true; s.judged = true; },
        cam: { tx: -7, ty: 12, tz: 1, dist: 40, yaw: .24, pitch: .17 },
        controls: [
          { type: 'btn', label: '点燃 / 熄灭 酒精灯', onClick: function (s) { s.heating = !s.heating; } },
          { type: 'btn', label: '反例：玻璃泡碰杯底', onClick: function (s) { s.touchBottom = true; s.outside = false; } },
          { type: 'btn', label: '反例：取出温度计读数', onClick: function (s) { s.outside = true; s.touchBottom = false; s.heating = false; s._out = 0; } },
          { type: 'btn', label: '恢复正常（浸没、不碰底）', onClick: function (s) { s.touchBottom = false; s.outside = false; s._out = 0; s.heating = true; } }
        ] },

      { name: '体温计', title: '体温计有什么特别之处？',
        ask: '为什么体温计可以离开人体读数？',
        body: '<p><b>缩口：</b>体温计玻璃泡与毛细管间有一段<b>缩口（细弯，画面里有黄铜环标记）</b>。' +
          '水银受热膨胀通过缩口上升；离开人体冷却时，缩口处水银断开，液柱<b>不会回退</b>，故可离开人体读数。</p>' +
          '<p><b>模型：</b>体温计与人体达到热平衡，示数 <b>T = T<sub>体</sub> = ' + T_BODY.toFixed(1) +
          ' ℃</b>；离体后因缩口保持该值，不按上一步的牛顿冷却下降——这是结构带来的、而非液体性质的例外。' +
          '右侧「温度计示数」在体温计步恒为 ' + T_BODY.toFixed(1) + ' ℃。</p>' +
          '<p><b>边界/假设：</b>缩口只在<b>降温</b>方向断开液柱；量程 35~42 ℃、分度 0.1 ℃；' +
          '读数前须与人体充分接触至热平衡。</p>' +
          '<p><b>反例：</b>使用前<b>不甩</b>，残留液柱可能停在 ' + T_BODY.toFixed(1) +
          ' ℃，若实测体温更低，读数会<b>虚高</b>——所以必须用力甩到 35 ℃ 以下。</p>',
        apply: function (s) { reset(s); s.bodyMode = true; s.judged = true; },
        cam: { tx: 8, ty: 7, tz: 0, dist: 24, yaw: -.2, pitch: .24 },
        controls: [
          { type: 'btn', label: '离开人体读数（缩口保持）', onClick: function (s) { s.bodyMode = true; } },
          { type: 'btn', label: '甩动后重新测量', onClick: function (s) { s.bodyMode = true; s.judged = true; } }
        ] },

      { name: '注意', title: '注意事项与拓展',
        ask: '温度计胀裂通常是什么原因？',
        body: '<p><b>红线：</b>① 不能测超<b>量程</b>的温度（会胀裂）；② 读数一般不取出（体温计除外）；' +
          '③ 玻璃泡须与被测物体充分接触至<b>热平衡</b>；④ 平视液柱上表面。</p>' +
          '<p><b>证据链（由模型算）：</b>本步把加热时钟设在 t = 60 s，则真实水温 T = ' + T60.toFixed(1) +
          ' ℃。正常放置示数 = ' + T60.toFixed(1) + ' ℃；碰杯底 = ' + T_BOTTOM_EX.toFixed(1) +
          ' ℃（偏高 ' + DT_BOTTOM.toFixed(1) + ' ℃）；取出 30 s ≈ ' + T_OUT30.toFixed(1) +
          ' ℃（偏低 ' + (T60 - T_OUT30).toFixed(1) + ' ℃）。三者差异全部来自模型，不是预设数字。</p>' +
          '<p><b>边界/假设：</b>T(t) 线性段只在未沸腾、P 与 m 恒定、散热可忽略时成立；' +
          '到 ' + T_BOIL + ' ℃ 后温度恒定是标准大气压下的结论，气压降低沸点也降低。</p>' +
          '<p><b>反例：</b>把三种错误操作（碰底、取出、超量程）与规范操作对照，' +
          '可见「误差」可减小而「错误」必须避免；拓展：热力学温标 <b>T(K) = t(℃) + 273.15</b>。</p>',
        apply: function (s) { reset(s); s.heating = true; s._t = 60; s.judged = true; },
        cam: { tx: 3, ty: 11, tz: 0, dist: 48, yaw: .2, pitch: .18 },
        controls: [
          { type: 'btn', label: '对照：碰杯底（偏高）', onClick: function (s) { s.touchBottom = true; s.outside = false; } },
          { type: 'btn', label: '对照：取出读数（偏低）', onClick: function (s) { s.outside = true; s.touchBottom = false; s._out = 0; } },
          { type: 'btn', label: '回到规范放置', onClick: function (s) { s.touchBottom = false; s.outside = false; s._out = 0; } }
        ] }
    ],
    quiz: function () {
      var bank = [
        { q: '使用温度计前不需观察？', opts: ['生产厂家', '量程', '分度值', '零刻度'], ans: '生产厂家', why: '三观察为：零刻度、量程、分度值。' },
        { q: '体温计分度值约为？', opts: ['0.1℃', '1℃', '5℃', '10℃'], ans: '0.1℃', why: '体温计分度值 0.1℃，可测到小数点后一位。' },
        { q: '体温计能离开人体读数的原因？', opts: ['有缩口', '水银多', '玻璃厚', '量程小'], ans: '有缩口', why: '缩口使液柱断开，冷却时不回退。' },
        { q: '水温模型 T(t)=T₀+P·t/(c·m)，升温速率由？', opts: ['P/(c·m)', 'c·m/P', 'P·c·m', 'T₀/t'], ans: 'P/(c·m)', why: '对 t 求导得 dT/dt = P/(c·m)。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
