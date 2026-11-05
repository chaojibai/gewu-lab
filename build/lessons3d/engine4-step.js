/* 格物实验室 · 直列四缸四冲程汽油机 · 组件 3D 示意（职业教育线）
   真实机构：曲柄连杆（滑块-曲柄）+ 双顶置凸轮（DOHC）+ 8 气门 + 火花塞。
   运动学全部由曲轴角解析计算，不是时间线动画：
     · 活塞往复：y = r·cosβ + sqrt(L² − r²sin²β)   （β 为该缸循环角，0~720°）
     · 连杆小头随手画线，实际两端点由曲柄销与活塞销实时求出
     · 配气：凸轮以半速转动，气门升程由循环角 ± 余弦凸包给出（含进排气重叠）
   点火顺序 1-3-4-2；1、4 缸同步，2、3 缸同步。 */
(function () {
  var T = window.THREE, K = window.Lab;
  var PI = Math.PI, TAU = PI * 2, CYC = PI * 4;

  /* ── 机构尺寸（示意单位，≈ 厘米量级） ── */
  var BORE_R = 1.5;          /* 缸径半径 */
  var CRANK_R = 1.5;         /* 曲柄半径 = 冲程 / 2 */
  var ROD_L = 5.0;           /* 连杆大小头中心距 */
  var SPACING = 3.95;        /* 缸心距 */
  var XS = [-5.925, -1.975, 1.975, 5.925];
  var CYC_PHASE = [0, 3 * PI, PI, 2 * PI];   /* 1-3-4-2 点火顺序（1..4 缸） */
  var THROW = [0, PI, PI, 0];                /* 曲拐相位：1/4 同向，2/3 反向 */
  var DECK = 7.5;            /* 缸体上平面 */
  var BLOCK_BOT = -2.4;
  var PAN_BOT = -3.6;
  var HEAD_LIFT = 6.2;       /* 拆解：缸盖抬起 */
  var PAN_DROP = 6.6;        /* 拆解：油底壳沿 +z 抽出的距离 */
  var MAXLIFT = .55;         /* 气门最大升程 */
  var UP = new T.Vector3(0, 1, 0);

  var st = {
    spin: 1, speed: 1, theta: 0,
    explPct: 0, setAng: 0, t: 0
  };
  var O = {};

  /* ── 运动学 ── */
  function betaOf(th, i) { var b = (th - CYC_PHASE[i]) % CYC; if (b < 0) b += CYC; return b; }
  function pistonY(b) {
    var a = b % TAU, s = CRANK_R * Math.sin(a);
    return CRANK_R * Math.cos(a) + Math.sqrt(ROD_L * ROD_L - s * s);
  }
  function strokeOf(b) {
    b = b % CYC;
    if (b < PI) return '做功';
    if (b < 2 * PI) return '排气';
    if (b < 3 * PI) return '进气';
    return '压缩';
  }
  function valveLift(b, center, half) {
    var d = b - center;
    if (Math.abs(d) >= half) return 0;
    return .5 * (1 + Math.cos(PI * d / half));
  }
  var IN_C = 2.5 * PI, EX_C = 1.5 * PI, VHALF = .62 * PI;
  function inLift(b) { return valveLift(b, IN_C, VHALF); }
  function exLift(b) { return valveLift(b, EX_C, VHALF); }

  /* ── 材质（PBR，金属靠环境反射出明暗结构） ── */
  var MAT = {
    block: new T.MeshPhysicalMaterial({ color: 0x9fabb8, metalness: .55, roughness: .44, transparent: true, opacity: .15, side: T.DoubleSide, depthWrite: false, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: 1.1 }),
    liner: new T.MeshPhysicalMaterial({ color: 0xd6dee6, metalness: .62, roughness: .34, transparent: true, opacity: .26, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.25 }),
    head: new T.MeshPhysicalMaterial({ color: 0xa9b4c0, metalness: .55, roughness: .4, transparent: true, opacity: .17, side: T.DoubleSide, depthWrite: false, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: 1.1 }),
    steel: new T.MeshStandardMaterial({ color: 0xa8b2bc, metalness: .92, roughness: .28, envMapIntensity: 1.45 }),
    steelD: new T.MeshStandardMaterial({ color: 0x5c666f, metalness: .9, roughness: .4, envMapIntensity: 1.1 }),
    piston: new T.MeshStandardMaterial({ color: 0xd4dce4, metalness: .82, roughness: .3, envMapIntensity: 1.35 }),
    ring: new T.MeshStandardMaterial({ color: 0x22272d, metalness: .6, roughness: .55 }),
    rod: new T.MeshStandardMaterial({ color: 0x99a3ad, metalness: .92, roughness: .3, envMapIntensity: 1.3 }),
    valve: new T.MeshStandardMaterial({ color: 0xcdd6de, metalness: .96, roughness: .2, envMapIntensity: 1.45 }),
    spring: new T.MeshStandardMaterial({ color: 0x8d97a1, metalness: .88, roughness: .42 }),
    plug: new T.MeshStandardMaterial({ color: 0x707b86, metalness: .9, roughness: .34 }),
    ceramic: new T.MeshStandardMaterial({ color: 0xf1ece0, metalness: .05, roughness: .5 }),
    gasket: new T.MeshStandardMaterial({ color: 0x31363d, metalness: .25, roughness: .78 }),
    pan: new T.MeshStandardMaterial({ color: 0x353c44, metalness: .55, roughness: .5, envMapIntensity: .8 }),
    cover: new T.MeshPhysicalMaterial({ color: 0x93a0ad, metalness: .55, roughness: .44, clearcoat: .55, clearcoatRoughness: .25, envMapIntensity: .95 }),
    fly: new T.MeshStandardMaterial({ color: 0x777f88, metalness: .92, roughness: .32, envMapIntensity: 1.2 }),
    benchTop: new T.MeshStandardMaterial({ color: 0x141d19, metalness: .34, roughness: .56, envMapIntensity: .5 }),
    bench: new T.MeshStandardMaterial({ color: 0x2b333b, metalness: .55, roughness: .52, envMapIntensity: .55 }),
    accent: new T.MeshStandardMaterial({ color: 0x2f6ea8, metalness: .3, roughness: .45 }),
    warn: new T.MeshStandardMaterial({ color: 0xb08a1e, metalness: .1, roughness: .6 }),
    /* 剖切缸体：实体壁板，+z 面留空露出内部（比全透明更像真机） */
    blockSolid: null, headSolid: null,
    linerSolid: new T.MeshStandardMaterial({ color: 0xa2aeba, metalness: .85, roughness: .32, side: T.DoubleSide, envMapIntensity: 1.35 }),
    cutFace: new T.MeshStandardMaterial({ color: 0xc3ccd6, metalness: .88, roughness: .24, envMapIntensity: 1.4 }),
    linerIn: new T.MeshStandardMaterial({ color: 0x5f6a76, metalness: .85, roughness: .38, side: T.DoubleSide, envMapIntensity: 1.0 })
  };

  /* 铸铁麻点贴图：大平面没有纹理在近景一定糊成塑料 */
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
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 4, rep || 4);
    return t;
  }
  (function () {
    var map = castTex(5);
    MAT.blockSolid = new T.MeshStandardMaterial({ color: 0x8d99a6, metalness: .8, roughness: .44, envMapIntensity: 1.1, map: map, bumpMap: map, bumpScale: .026 });
    MAT.headSolid = new T.MeshStandardMaterial({ color: 0x939fab, metalness: .8, roughness: .42, envMapIntensity: 1.05, map: map, bumpMap: map, bumpScale: .022 });
  })();

  function RM(w, h, d, r, mat) { return new T.Mesh(K.geoRoundBox(w, h, d, r === undefined ? .18 : r, 3), mat); }
  function helixGeo(r, tubeR, h, turns, seg) {
    var pts = [], n = seg || 72, i, t, a;
    for (i = 0; i <= n; i++) { t = i / n; a = turns * TAU * t; pts.push(new T.Vector3(Math.cos(a) * r, h * t, Math.sin(a) * r)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, tubeR, 6, false);
  }

  /* ── 工作台（发动机稳稳落在台面上，避免"悬空"） ── */
  function buildBench(G) {
    var g = new T.Group();
    var W = 32, D = 19;
    /* 深色环氧台面 + 加厚包边（浅色塑料板会显得很廉价） */
    var top = RM(W, 1.6, D, .28, MAT.benchTop); top.position.y = -.8; g.add(top);
    var band = RM(W + 1.2, .55, D + 1.2, .16, MAT.bench); band.position.y = -1.72; g.add(band);
    var apron = RM(W - 3, .9, .6, .12, MAT.bench); apron.position.set(0, -2.4, D / 2 - .9); g.add(apron);
    var warn = RM(W + .3, .22, .34, .06, MAT.warn); warn.position.set(0, -.06, D / 2 - .05); g.add(warn);
    /* 方管腿 + 脚垫 */
    [[W / 2 - 2.6, D / 2 - 2.6], [-(W / 2 - 2.6), D / 2 - 2.6], [W / 2 - 2.6, -(D / 2 - 2.6)], [-(W / 2 - 2.6), -(D / 2 - 2.6)]].forEach(function (p) {
      var leg = RM(1.5, 13.6, 1.5, .12, MAT.bench);
      leg.position.set(p[0], -8.4, p[1]); g.add(leg);
      var foot = RM(2.0, .34, 2.0, .1, MAT.steelD);
      foot.position.set(p[0], -15.3, p[1]); g.add(foot);
    });
    /* 下层隔板 + 横梁 */
    var shelf = RM(W - 6, .4, D - 7, .1, MAT.bench); shelf.position.y = -9.6; g.add(shelf);
    var beam = RM(W - 6, .5, .5, .1, MAT.bench); beam.position.set(0, -6.2, D / 2 - 3.4); g.add(beam);
    /* 右侧工具柜（两抽 + 拉手），让台面下不是空的 */
    var cab = RM(11, 7.4, 11, .18, MAT.bench); cab.position.set(8.5, -6.0, -3.0); g.add(cab);
    [-2.4, -4.6].forEach(function (yy) {
      var dr = RM(9.8, 1.9, .3, .1, MAT.steelD); dr.position.set(8.5, yy, 2.6); g.add(dr);
      var hd = new T.Mesh(new T.CylinderGeometry(.09, .09, 4.2, 10), MAT.steel);
      hd.rotation.z = PI / 2; hd.position.set(8.5, yy, 3.0); g.add(hd);
    });
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(g);
    K.blob({ x: 0, z: 0, r: 11, y: .02 });
    return g;
  }

  /* ── 缸体 + 缸套 + 主轴承座 ── */
  function buildBlock() {
    var g = new T.Group(); O.block = g;
    var W = 16.4, H = DECK - BLOCK_BOT, Z = 4.9;
    var cy = (DECK + BLOCK_BOT) / 2, th = .6, i;
    /* 左右侧壁 + 后壁（+z 面留空 = 剖切，正对默认机位露出内部） */
    [-1, 1].forEach(function (s) {
      var wall = RM(th, H, Z, .12, MAT.blockSolid);
      wall.position.set(s * (W / 2 - th / 2), cy, 0); g.add(wall);
      /* 剖切面：前端一圈机加工亮边，"剖开"才看得出来 */
      var cut = new T.Mesh(new T.BoxGeometry(th + .05, H, .16), MAT.cutFace);
      cut.position.set(s * (W / 2 - th / 2), cy, Z / 2 - .08); g.add(cut);
      /* 外壁加强筋（真机铸件不会是一块光板） */
      [-1.55, 1.55].forEach(function (zz) {
        var rib = RM(.16, H * .74, .34, .06, MAT.blockSolid);
        rib.position.set(s * (W / 2 + .04), cy + .3, zz); g.add(rib);
      });
      var rib2 = RM(.14, .3, Z * .82, .05, MAT.blockSolid);
      rib2.position.set(s * (W / 2 + .03), cy - 1.1, 0); g.add(rib2);
    });
    var back = RM(W - 2 * th, H, th, .12, MAT.blockSolid); back.position.set(0, cy, -Z / 2 + th / 2); g.add(back);
    /* 曲轴箱底板（压低到平衡重之下，避免曲轴与底板穿模） */
    var bot = RM(W - 2 * th, 1.0, Z - 2 * th, .14, MAT.blockSolid); bot.position.set(0, BLOCK_BOT + .5, 0); g.add(bot);
    /* 顶缘：四周细框，中间镂空让缸套露出 */
    [Z / 2 - .25, -Z / 2 + .25].forEach(function (zz) {
      var strip = RM(W, .5, .5, .08, MAT.blockSolid); strip.position.set(0, DECK - .05, zz); g.add(strip);
    });
    [W / 2 - .25, -W / 2 + .25].forEach(function (xx) {
      var strip = RM(.5, .5, Z, .08, MAT.blockSolid); strip.position.set(xx, DECK - .05, 0); g.add(strip);
    });
    /* 缸套：保留后半圈（+z 前半圈剖掉），活塞才看得出"坐在缸孔里" */
    var linH = DECK - 2.05;
    for (i = 0; i < 4; i++) {
      var lo = new T.Mesh(new T.CylinderGeometry(BORE_R + .14, BORE_R + .14, linH, 34, 1, true, PI / 2, PI), MAT.linerSolid);
      lo.position.set(XS[i], 2.05 + linH / 2, 0); g.add(lo);
      var li = new T.Mesh(new T.CylinderGeometry(BORE_R + .02, BORE_R + .02, linH, 34, 1, true, PI / 2, PI), MAT.linerIn);
      li.position.copy(lo.position); g.add(li);
      /* 剖切断面的壁厚棱边 */
      [-1, 1].forEach(function (s2) {
        var edge = new T.Mesh(new T.BoxGeometry(.15, linH, .15), MAT.linerSolid);
        edge.position.set(XS[i] + s2 * (BORE_R + .08), lo.position.y, 0); g.add(edge);
      });
      /* 缸孔上缘环 */
      var ring = new T.Mesh(new T.TorusGeometry(BORE_R + .07, .055, 8, 40), MAT.steelD);
      ring.rotation.x = PI / 2; ring.position.set(XS[i], DECK - .04, 0); g.add(ring);
    }
    /* 缸垫 */
    var gk = new T.Mesh(new T.BoxGeometry(W - 1.2, .1, Z - 1.2), MAT.gasket); gk.position.set(0, DECK + .16, 0); g.add(gk);
    /* 缸间隔板（主轴承座上方的那道铸件壁）：没有它整个缸体读成空架子 */
    for (i = 0; i < 5; i++) {
      var bw = RM(.6, DECK - 2.2, Z - 2 * th, .12, MAT.blockSolid);
      bw.position.set((i - 2) * SPACING * .98, (DECK + 2.2) / 2, 0); g.add(bw);
    }
    /* 主轴承座（抱在主轴颈下方） */
    for (i = 0; i < 5; i++) {
      var bx = (i - 2) * SPACING * .98;
      var cap = RM(1.0, 1.0, Z - 1.4, .16, MAT.blockSolid); cap.position.set(bx, -.82, 0); g.add(cap);
      var blt1 = new T.Mesh(new T.CylinderGeometry(.1, .1, 1.5, 8), MAT.steelD);
      blt1.position.set(bx - .34, -.82, Z / 2 - .95); g.add(blt1);
      var blt2 = blt1.clone(); blt2.position.z = -(Z / 2 - .95); g.add(blt2);
    }
    /* 后侧水道口 + 机油滤清器 + 机油尺（增强"是一台真机"的识别度） */
    for (i = 0; i < 4; i++) {
      var wj = new T.Mesh(new T.CylinderGeometry(.2, .2, .5, 12), MAT.steelD);
      wj.rotation.x = PI / 2; wj.position.set(XS[i], 2.4, -Z / 2 - .02); g.add(wj);
    }
    var of = new T.Mesh(new T.CylinderGeometry(.72, .72, 1.5, 22), MAT.pan);
    of.rotation.z = PI / 2; of.position.set(-W / 2 - .78, 1.6, -1.0); g.add(of);
    var ofc = new T.Mesh(new T.CylinderGeometry(.78, .78, .22, 22), MAT.steelD);
    ofc.rotation.z = PI / 2; ofc.position.set(-W / 2 - 1.52, 1.6, -1.0); g.add(ofc);
    var dip = new T.Mesh(new T.CylinderGeometry(.1, .1, 3.2, 10), MAT.steelD);
    dip.position.set(W / 2 + .34, 2.1, -1.6); g.add(dip);
    var dcap = new T.Mesh(new T.CylinderGeometry(.19, .19, .3, 12), MAT.accent);
    dcap.position.set(W / 2 + .34, 3.8, -1.6); g.add(dcap);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  /* ── 活塞 ── */
  function buildPiston(i) {
    var g = new T.Group(); g.position.set(XS[i], 0, 0);
    var r = BORE_R * .97;
    var body = new T.Mesh(new T.CylinderGeometry(r, r, 1.1, 32), MAT.piston); body.position.y = .05; g.add(body);
    var crown = new T.Mesh(new T.CylinderGeometry(r, r * .98, .14, 32), MAT.piston); crown.position.y = .63; g.add(crown);
    /* 气环槽 */
    [.46, .32, .18].forEach(function (yy) {
      var rg = new T.Mesh(new T.CylinderGeometry(r + .01, r + .01, .05, 32, 1, true), MAT.ring);
      rg.position.y = yy; g.add(rg);
    });
    /* 活塞销 */
    var pin = new T.Mesh(new T.CylinderGeometry(.17, .17, r * 2 - .1, 16), MAT.steel);
    pin.rotation.z = PI / 2; g.add(pin);
    [-1, 1].forEach(function (s) {
      var boss = new T.Mesh(new T.CylinderGeometry(.26, .26, .22, 16), MAT.piston);
      boss.rotation.z = PI / 2; boss.position.x = s * (r - .12); g.add(boss);
    });
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.hit = 'piston'; g.userData.hitName = '活塞'; g.userData.hitDesc = '承受燃气压力，沿缸孔做直线往复运动';
    K.tag(g, '活塞', '承受燃烧气体压力，把往复运动经连杆传给曲轴');
    O.pistons[i] = g;
    return g;
  }

  /* ── 连杆 ── */
  function buildRod(i) {
    var g = new T.Group();
    var L = ROD_L;
    var beam = RM(.34, L - 1.1, .62, .12, MAT.rod); g.add(beam);
    /* 大头（抱曲柄销） */
    var big = new T.Mesh(new T.CylinderGeometry(.62, .62, .74, 22), MAT.rod); big.rotation.z = PI / 2; big.position.y = -L / 2; g.add(big);
    var bigHole = new T.Mesh(new T.CylinderGeometry(.34, .34, .78, 18), MAT.steelD); bigHole.rotation.z = PI / 2; bigHole.position.y = -L / 2; g.add(bigHole);
    /* 小头（抱活塞销） */
    var small = new T.Mesh(new T.CylinderGeometry(.34, .34, .6, 18), MAT.rod); small.rotation.z = PI / 2; small.position.y = L / 2; g.add(small);
    var smallHole = new T.Mesh(new T.CylinderGeometry(.17, .17, .64, 14), MAT.steelD); smallHole.rotation.z = PI / 2; smallHole.position.y = L / 2; g.add(smallHole);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    K.tag(g, '连杆', '连接活塞与曲轴，把直线往复转换为旋转运动');
    O.rods[i] = g;
    return g;
  }

  /* ── 曲轴总成（含飞轮、前端皮带轮） ── */
  function buildCrank() {
    var g = new T.Group(); O.crank = g;
    var main = new T.Mesh(new T.CylinderGeometry(.5, .5, 18.2, 24), MAT.steel); main.rotation.z = PI / 2; g.add(main);
    var i;
    for (i = 0; i < 4; i++) {
      var tg = new T.Group(); tg.position.x = XS[i]; tg.rotation.x = THROW[i]; g.add(tg);
      var pin = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.02, 20), MAT.steel); pin.rotation.z = PI / 2; pin.position.set(0, CRANK_R, 0); tg.add(pin);
      [-.62, .62].forEach(function (dx) {
        /* 曲柄臂：主轴颈 → 连杆轴颈的板 + 反向平衡重（半圆盘，不是垫圈） */
        var web = RM(.46, CRANK_R + .9, 1.05, .18, MAT.steel);
        web.position.set(dx, CRANK_R / 2 - .1, 0); tg.add(web);
        var cw = new T.Mesh(new T.CylinderGeometry(1.18, 1.18, .46, 30, 1, false, PI, PI), MAT.steel);
        cw.rotation.z = PI / 2; cw.position.set(dx, -.15, 0); tg.add(cw);
      });
    }
    /* 飞轮（后端） */
    var flyX = -8.9;
    var fly = new T.Mesh(new T.CylinderGeometry(2.9, 2.9, .7, 44), MAT.fly); fly.rotation.z = PI / 2; fly.position.x = flyX; g.add(fly);
    var ringT = new T.Mesh(new T.TorusGeometry(2.86, .12, 8, 48), MAT.steelD); ringT.rotation.y = PI / 2; ringT.position.x = flyX; g.add(ringT);
    for (i = 0; i < 34; i++) {
      var a = i / 34 * TAU;
      var tooth = new T.Mesh(new T.BoxGeometry(.8, .26, .26), MAT.steelD);
      tooth.position.set(flyX, Math.cos(a) * 2.9, Math.sin(a) * 2.9);
      tooth.rotation.x = -a; g.add(tooth);
    }
    /* 前端皮带轮（减振器） */
    var pul = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, .6, 40), MAT.steelD); pul.rotation.z = PI / 2; pul.position.x = 8.78; g.add(pul);
    var pul2 = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, .3, 40), MAT.accent); pul2.rotation.z = PI / 2; pul2.position.x = 9.18; g.add(pul2);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    K.tag(g, '曲轴', '把活塞的往复运动汇总为旋转输出，飞轮储能使运转平稳');
    return g;
  }

  /* ── 气门（进/排） ── */
  function buildValve(cyl, kind) {
    var z = kind === 'in' ? -.9 : .9;
    var vg = new T.Group();
    var baseY = DECK + .62;
    vg.position.set(XS[cyl], baseY, z);
    var head = new T.Mesh(new T.CylinderGeometry(.62, .48, .16, 26), MAT.valve); head.position.y = -.02; vg.add(head);
    /* 气门锥面（45° 座面） */
    var cone = new T.Mesh(new T.CylinderGeometry(.5, .62, .12, 26), MAT.valve); cone.position.y = -.14; vg.add(cone);
    var stem = new T.Mesh(new T.CylinderGeometry(.07, .07, 1.7, 12), MAT.valve); stem.position.y = .85; vg.add(stem);
    var ret = new T.Mesh(new T.CylinderGeometry(.24, .24, .1, 16), MAT.steel); ret.position.y = 1.6; vg.add(ret);
    vg.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    /* 气门导管：从缸盖底面往上，气门才有"装在缸盖上"的着落感 */
    var guide = new T.Mesh(new T.CylinderGeometry(.15, .17, 1.1, 14), MAT.steelD);
    guide.position.set(XS[cyl], DECK + 1.58, z); guide.castShadow = true;
    /* 气门弹簧：独立挂在缸盖上，按压缩长度缩放 */
    var sprBase = DECK + 1.07;
    var spr = new T.Mesh(helixGeo(.3, .045, 1.55, 7, 60), MAT.spring);
    spr.position.set(XS[cyl], sprBase, z); spr.castShadow = true;
    O.valves.push({ vg: vg, baseY: baseY, kind: kind, cyl: cyl, spr: spr, sprBase: sprBase, sprH: 1.55, guide: guide });
    return vg;
  }

  /* 凸轮桃形轮廓：基圆 + 指向 +y 的鼻尖（比"球+盘"更像真凸轮） */
  function lobeGeo() {
    var s = new T.Shape(), N = 56, i, th, d, r, px, py;
    for (i = 0; i <= N; i++) {
      th = i / N * TAU;
      d = Math.cos(th - PI / 2);
      r = .44 + MAXLIFT * Math.pow(Math.max(0, d), 3.4);
      px = Math.cos(th) * r; py = Math.sin(th) * r;
      if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
    var geo = new T.ExtrudeGeometry(s, { depth: .5, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 1, curveSegments: 2 });
    geo.translate(0, 0, -.25);
    return geo;
  }

  /* 带孔的缸盖底板（8 个气门座孔 + 4 个火花塞孔） */
  function headDeckGeo(w, d, thk, mode) {
    var s = new T.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.closePath();
    var i;
    if (mode === 'base') {
      /* 缸盖底面：只开 4 个缸孔通孔，燃烧室由下面的半圆壁围出来 */
      for (i = 0; i < 4; i++) {
        var hb = new T.Path(); hb.absarc(XS[i], 0, BORE_R + .02, 0, TAU, true); s.holes.push(hb);
      }
    } else {
      /* 燃烧室顶：8 个气门导管孔 + 4 个火花塞孔 */
      for (i = 0; i < 4; i++) {
        [-.9, .9].forEach(function (zz) {
          var p = new T.Path(); p.absarc(XS[i], zz, .7, 0, TAU, true); s.holes.push(p);
        });
        var q = new T.Path(); q.absarc(XS[i], 0, .3, 0, TAU, true); s.holes.push(q);
      }
    }
    var geo = new T.ExtrudeGeometry(s, { depth: thk, bevelEnabled: false, curveSegments: 20 });
    geo.rotateX(-PI / 2);
    geo.translate(0, -thk, 0);
    return geo;
  }

  /* ── 缸盖总成（缸盖 + 底板 + 燃烧室 + 气门 + 凸轮轴 + 火花塞 + 气门室盖） ── */
  function buildHead() {
    var g = new T.Group(); O.headAsm = g;
    var W = 16.4, Z = 4.9, th = .58, i;
    /* 侧壁 + 后壁：从缸盖底面一直砌到气门室盖下方（否则缸盖读成一个空框） */
    var hwall = null;
    [-1, 1].forEach(function (s) {
      var w = RM(th, 2.95, Z, .1, MAT.headSolid); w.position.set(s * (W / 2 - th / 2), DECK + 1.66, 0); g.add(w);
      if (!hwall) hwall = w;
    });
    var hback = RM(W - 2 * th, 2.95, th, .1, MAT.headSolid); hback.position.set(0, DECK + 1.66, -Z / 2 + th / 2); g.add(hback);
    /* 缸盖侧壁剖切亮边 */
    [-1, 1].forEach(function (s) {
      var hc = new T.Mesh(new T.BoxGeometry(th + .05, 2.95, .14), MAT.cutFace);
      hc.position.set(s * (W / 2 - th / 2), DECK + 1.66, Z / 2 - .07); g.add(hc);
    });
    /* 缸盖底面：坐在缸垫上，只留 4 个缸孔通孔 */
    var hbase = new T.Mesh(headDeckGeo(W - 1.1, Z - 1.1, .18, 'base'), MAT.headSolid);
    hbase.position.y = DECK + .40; g.add(hbase);
    /* 燃烧室：每缸一个后半圆凹窝（正面剖开，能看见气门盘） */
    for (i = 0; i < 4; i++) {
      var ch = new T.Mesh(new T.CylinderGeometry(BORE_R + .02, BORE_R + .02, .65, 30, 1, true, PI / 2, PI), MAT.headSolid);
      ch.position.set(XS[i], DECK + .725, 0); g.add(ch);
    }
    /* 燃烧室顶（气门座所在平面），气门杆穿孔而过 */
    var deck = new T.Mesh(headDeckGeo(W - 1.1, Z - 1.1, .2, 'roof'), MAT.headSolid);
    deck.position.y = DECK + 1.05; g.add(deck);
    /* 气门 + 弹簧 + 导管 */
    O.valves = [];
    for (i = 0; i < 4; i++) {
      g.add(buildValve(i, 'in'));
      g.add(buildValve(i, 'ex'));
      var a = O.valves[O.valves.length - 1], b = O.valves[O.valves.length - 2];
      g.add(a.spr); g.add(a.guide);
      g.add(b.spr); g.add(b.guide);
    }
    /* 双顶置凸轮轴 + 轴承座 */
    var camY = DECK + 2.7, j, lobeG = lobeGeo();
    var camDefs = [{ z: -.95, kind: 'in' }, { z: .95, kind: 'ex' }];
    O.camIn = null; O.camEx = null;
    camDefs.forEach(function (cd) {
      var cg = new T.Group(); cg.position.set(0, camY, cd.z); g.add(cg);
      var shaft = new T.Mesh(new T.CylinderGeometry(.26, .26, 14.6, 20), MAT.steel); shaft.rotation.z = PI / 2; cg.add(shaft);
      for (j = 0; j < 4; j++) {
        var lg = new T.Group(); lg.position.x = XS[j];
        var lobe = new T.Mesh(lobeG, MAT.steel); lobe.rotation.y = PI / 2; lg.add(lobe);
        /* 凸轮相位：使其在对应气门最大升程时，鼻尖正对下方气门 */
        lg.rotation.x = (cd.kind === 'in' ? -0.25 * PI : 0.25 * PI) - CYC_PHASE[j] / 2;
        lg.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
        cg.add(lg);
      }
      /* 轴颈（落在轴承座上） */
      for (j = 0; j < 5; j++) {
        var jr = new T.Mesh(new T.CylinderGeometry(.34, .34, .46, 18), MAT.steel);
        jr.rotation.z = PI / 2; jr.position.x = (j - 2) * SPACING * .98; cg.add(jr);
      }
      if (cd.kind === 'in') O.camIn = cg; else O.camEx = cg;
    });
    /* 凸轮轴轴承座 ×5（横跨两根凸轮轴，缸盖才不是空架子） */
    for (i = 0; i < 5; i++) {
      var tw = RM(1.0, 1.37, Z - 1.8, .14, MAT.headSolid);
      tw.position.set((i - 2) * SPACING * .98, DECK + 1.735, 0); g.add(tw);
      [-1, 1].forEach(function (s) {
        var cap2 = RM(1.0, .34, .72, .1, MAT.headSolid);
        cap2.position.set((i - 2) * SPACING * .98, DECK + 2.49, s * .95); g.add(cap2);
      });
    }
    /* 火花塞 ×4（两凸轮轴之间，拧在缸盖底板中央孔上） */
    for (i = 0; i < 4; i++) {
      var pg = new T.Group(); pg.position.set(XS[i], 0, 0); g.add(pg);
      var body = new T.Mesh(new T.CylinderGeometry(.2, .2, 2.4, 16), MAT.plug); body.position.y = DECK + 1.4; pg.add(body);
      var hex = new T.Mesh(new T.CylinderGeometry(.3, .3, .5, 6), MAT.plug); hex.position.y = DECK + 2.7; pg.add(hex);
      var cer = new T.Mesh(new T.CylinderGeometry(.26, .22, 1.0, 16), MAT.ceramic); cer.position.y = DECK + 3.8; pg.add(cer);
      var term = new T.Mesh(new T.CylinderGeometry(.08, .08, .5, 10), MAT.steel); term.position.y = DECK + 4.55; pg.add(term);
      pg.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    }
    /* 气门室盖：顶篷（前开，能看见凸轮）＋ 火花塞井 ＋ 加强筋 ＋ 加油口盖 */
    var covTop = RM(W + .2, .32, Z - .1, .12, MAT.cover); covTop.position.set(0, DECK + 4.14, 0); g.add(covTop);
    [-1, 1].forEach(function (s) { var w = RM(.4, 1.3, Z - .1, .08, MAT.cover); w.position.set(s * ((W + .2) / 2 - .2), DECK + 3.52, 0); g.add(w); });
    var covBack = RM(W + .2, 1.3, .4, .08, MAT.cover); covBack.position.set(0, DECK + 3.52, -(Z - .1) / 2 + .2); g.add(covBack);
    var rim = RM(W + .2, .1, Z - .1, .05, MAT.accent); rim.position.set(0, DECK + 4.31, 0); g.add(rim);
    for (i = 0; i < 4; i++) {
      /* 火花塞井：让火花塞"穿过"罩盖而不是硬插进去 */
      var well = new T.Mesh(new T.CylinderGeometry(.36, .38, .5, 18), MAT.cover);
      well.position.set(XS[i], DECK + 4.14, 0); g.add(well);
    }
    [-4.2, 4.2].forEach(function (xx) {
      var ribC = RM(2.6, .16, 1.1, .06, MAT.cover); ribC.position.set(xx, DECK + 4.36, 0); g.add(ribC);
    });
    for (i = 0; i < 8; i++) {
      var bo = new T.Mesh(new T.CylinderGeometry(.16, .16, .16, 10), MAT.steelD);
      bo.position.set(-W / 2 + .55 + (i % 2) * (W - 1.1), DECK + 4.37, i < 4 ? -1.85 : 1.85); g.add(bo);
    }
    var cap = new T.Mesh(new T.CylinderGeometry(.5, .5, .34, 20), MAT.accent); cap.position.set(4.6, DECK + 4.42, 0); g.add(cap);
    var capK = new T.Mesh(new T.CylinderGeometry(.2, .2, .18, 14), MAT.steelD); capK.position.set(4.6, DECK + 4.64, 0); g.add(capK);
    g.traverse(function (o) { if (o.isMesh) { o.receiveShadow = true; } });
    /* 拾取标签：缸盖 / 凸轮轴 / 气门室盖 */
    K.tag(hwall, '缸盖', '封闭气缸上部，安装气门与火花塞，容纳燃烧室');
    K.tag(hback, '缸盖（后侧）', '封闭气缸上部，安装气门与火花塞，容纳燃烧室');
    if (O.camIn) K.tag(O.camIn, '凸轮轴（进气）', '以曲轴一半的转速转动，按相位顶开进气门');
    K.tag(covTop, '气门室盖', '密封润滑油的罩盖，防止机油飞溅外泄');
    return g;
  }

  /* ── 油底壳 ── */
  /* ── 油底壳（做成真正的"盆"：底板 + 四壁 + 法兰，拆下来放在台面上才像零件） ── */
  function buildPan() {
    var g = new T.Group(); O.panAsm = g;
    var W = 12.4, D = 4.2, botY = -3.98, topY = -2.36;
    var h = topY - botY, midY = (topY + botY) / 2, i;
    var bot = RM(W + .2, .3, D + .2, .18, MAT.pan); bot.position.set(0, botY, 0); g.add(bot);
    /* 长壁 + 端壁 */
    [-1, 1].forEach(function (s) {
      var lw = RM(W + .3, h, .3, .1, MAT.pan); lw.position.set(0, midY, s * (D / 2)); g.add(lw);
      var ew = RM(.3, h, D, .1, MAT.pan); ew.position.set(s * (W / 2), midY, 0); g.add(ew);
    });
    /* 顶法兰（螺栓孔一圈）*/
    [-1, 1].forEach(function (s) {
      var fl = RM(W + .8, .22, .62, .08, MAT.pan); fl.position.set(0, topY, s * (D / 2 + .1)); g.add(fl);
      var fs = RM(.62, .22, D + .3, .08, MAT.pan); fs.position.set(s * (W / 2 + .15), topY, 0); g.add(fs);
    });
    for (i = 0; i < 10; i++) {
      var bo = new T.Mesh(new T.CylinderGeometry(.13, .13, .26, 8), MAT.steelD);
      bo.position.set(-W / 2 + .7 + (i % 5) * (W - 1.4) / 4, topY + .04, i < 5 ? -(D / 2 + .1) : (D / 2 + .1)); g.add(bo);
    }
    /* 内部挡油板 + 放油螺塞 */
    var baf = RM(.22, h * .7, D * .8, .06, MAT.pan); baf.position.set(-2.4, midY - .2, 0); g.add(baf);
    var plug = new T.Mesh(new T.CylinderGeometry(.3, .3, .34, 14), MAT.steelD); plug.position.set(2.6, botY - .18, -.8); g.add(plug);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    K.tag(bot, '油底壳', '储存机油并封闭曲轴箱，底部放油螺塞用于换油');
    return g;
  }

  /* ── 标注 ── */
  function buildLabels() {
    var y0 = 4.2;   /* 发动机整体抬升量（油底壳坐落在台面） */
    O.labels = {
      block: K.spriteLabel([-11.2, y0 + 3.4, 3.4], '缸体 / 缸套', { w: 4.8, fs: 40, onTop: true }),
      piston: K.spriteLabel([-7.6, y0 + 6.0, 3.2], '活塞 ×4', { w: 3.4, fs: 40, onTop: true }),
      rod: K.spriteLabel([-3.4, y0 + 3.0, 3.6], '连杆 ×4', { w: 3.2, fs: 40, onTop: true }),
      crank: K.spriteLabel([-11.6, y0 - 1.4, 3.4], '曲轴 / 飞轮', { w: 4.8, fs: 40, onTop: true }),
      cam: K.spriteLabel([-8.6, y0 + 9.4, 2.6], '双凸轮轴（半速）', { w: 5.2, fs: 40, onTop: true }),
      valve: K.spriteLabel([-8.8, y0 + 8.2, 2.8], '气门 ×8', { w: 3.2, fs: 40, onTop: true }),
      plug: K.spriteLabel([1.6, y0 + 10.4, 2.2], '火花塞 ×4', { w: 3.6, fs: 40, onTop: true }),
      pan: K.spriteLabel([4.4, y0 - 3.4, 3.6], '油底壳', { w: 3.0, fs: 40, onTop: true })
    };
  }

  /* ── 场景 ── */
  var scene = {
    setup: function () {
      var G = (K.world ? K.world() : K.scene());
      K.envShop();          /* 实训车间：水泥地坪 + 波纹钢板墙 + 卷帘门 + 工具柜（不是化学实验室） */
      /* 车间比实验室暗：环境光再收一档，金属才立得住 */
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .58;
        else if (o.isDirectionalLight) o.intensity *= .86;
      });
      /* 台面颗粒：复用引擎的程序化台面贴图，近景不是一块纯色板 */
      try {
        var kitM = K.M && K.M();
        if (kitM && kitM.benchTop && kitM.benchTop.map) {
          MAT.benchTop.map = kitM.benchTop.map;
          MAT.benchTop.needsUpdate = true;
        }
      } catch (e) { }
      buildBench(G);
      /* 剖切内部补光：从 +z 前方斜打进来，否则缸内发黑、活塞看不清 */
      var fillIn = new T.DirectionalLight(0xffffff, .62); fillIn.position.set(6, 12, 22); K.scene().add(fillIn);
      var fillIn2 = new T.DirectionalLight(0xdfe8ff, .28); fillIn2.position.set(-12, 6, 18); K.scene().add(fillIn2);

      var eng = new T.Group(); eng.position.y = 4.2; G.add(eng);
      O.eng = eng;
      eng.add(buildBlock());
      O.pistons = []; O.rods = [];
      var i;
      for (i = 0; i < 4; i++) { eng.add(buildPiston(i)); }
      for (i = 0; i < 4; i++) { eng.add(buildRod(i)); }
      eng.add(buildCrank());
      eng.add(buildHead());
      eng.add(buildPan());
      buildLabels();

      O.ex = 0;
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;

      /* SSAO 在浅色大面积上会落方块暗斑：补 RenderPass 后关掉 SSAOPass（它兼主渲染通道） */
      if (!s._ssao && s.t > .6 && window.__labDebug && window.__labDebug.composer) {
        s._ssao = true;
        var DBG = window.__labDebug, CP = DBG.composer;
        CP.passes.unshift(new T.RenderPass(DBG.scene, DBG.camera));
        CP.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
        /* 曝光：车间比实验室暗，ACES 终合压到 .74（.9 会把深色台面冲成浅绿） */
        CP.passes.forEach(function (p) {
          if (p.uniforms && p.uniforms.uExposure) p.uniforms.uExposure.value = .74;
        });
      }

      /* 曲轴推进 */
      if (s.spin > 0) s.theta += dt * 2.1 * s.speed;
      s.theta = ((s.theta % CYC) + CYC) % CYC;
      var th = s.theta;

      /* 拆解缓动 */
      O.ex += ((s.explPct / 100) - O.ex) * Math.min(1, dt * 6);
      var ex = O.ex * O.ex * (3 - 2 * O.ex);
      if (O.headAsm) O.headAsm.position.y = HEAD_LIFT * ex;
      /* 油底壳不能再往下沉（会穿过台面）：拆下后沿 +z 抽出来放台面上 */
      if (O.panAsm) { O.panAsm.position.set(0, -.06 * ex, PAN_DROP * ex); }

      if (O.crank) O.crank.rotation.x = th;
      if (O.camIn) O.camIn.rotation.x = th * .5;
      if (O.camEx) O.camEx.rotation.x = th * .5;

      var i;
      for (i = 0; i < 4; i++) {
        var b = betaOf(th, i);
        var py = pistonY(b);
        if (O.pistons[i]) O.pistons[i].position.y = py;

        /* 曲柄销世界坐标（发动机局部）：y=r·cosβ, z=r·sinβ */
        var kx = XS[i], ky = CRANK_R * Math.cos(b), kz = CRANK_R * Math.sin(b);
        var rod = O.rods[i];
        if (rod) {
          var mx = (kx + XS[i]) / 2, my = (ky + py) / 2, mz = (kz + 0) / 2;
          rod.position.set(mx, my, mz);
          var dx = 0, dyy = py - ky, dzz = 0 - kz;
          var len = Math.sqrt(dx * dx + dyy * dyy + dzz * dzz) || 1;
          var dirv = new T.Vector3(dx / len, dyy / len, dzz / len);
          rod.quaternion.setFromUnitVectors(UP, dirv);
        }
      }

      /* 气门升程 + 弹簧压缩 */
      for (i = 0; i < O.valves.length; i++) {
        var v = O.valves[i];
        var b2 = betaOf(th, v.cyl);
        var lift01 = v.kind === 'in' ? inLift(b2) : exLift(b2);
        var dy = lift01 * MAXLIFT;
        v.vg.position.y = v.baseY - dy;
        var retY = (v.baseY - dy) + 1.6;
        var len2 = Math.max(.35, retY - v.sprBase);
        v.spr.scale.y = len2 / v.sprH;
        v.spr.position.y = v.sprBase;
      }

      /* 标注随步骤取舍：只留本步要看的，避免互相压 */
      if (O.labels) {
        var vis = ex < .02, LS = s._labSet || 'all';
        for (var k in O.labels) {
          if (!O.labels[k]) continue;
          var show = LS === 'all'
            || (LS === 'crank' && (k === 'piston' || k === 'rod' || k === 'crank'))
            || (LS === 'valve' && (k === 'cam' || k === 'valve' || k === 'plug'));
          O.labels[k].sprite.visible = vis && show;
        }
      }
    }
  };

  K.boot({
    title: '直列四缸四冲程汽油机 · 组件示意',
    chip: '职业教育 · 汽车发动机 · 曲柄连杆 + 配气机构',
    hint: '拖空白处旋转视角 · 滚轮缩放 · 悬停零件看名称 · 单击聚焦该零件 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .58, pitch: .32 },

    reads: [
      ['ang', '曲轴转角'],
      ['c1', '1 缸'], ['c2', '2 缸'], ['c3', '3 缸'], ['c4', '4 缸']
    ],

    values: function (s) {
      var deg = (s.theta * 180 / PI) % 720; if (deg < 0) deg += 720;
      return {
        ang: deg.toFixed(0) + '°',
        c1: strokeOf(betaOf(s.theta, 0)),
        c2: strokeOf(betaOf(s.theta, 1)),
        c3: strokeOf(betaOf(s.theta, 2)),
        c4: strokeOf(betaOf(s.theta, 3))
      };
    },

    steps: [
      {
        name: '整机总览',
        cam: { tx: 4.0, ty: 6.8, tz: 0, dist: 43, yaw: .58, pitch: .315 },
        title: '一台直列四缸发动机，由哪些部分组成？',
        ask: '四个气缸为什么不是同时点火？',
        body: '<p><b>整机分三大块：</b>缸体缸盖（骨架与燃烧室）、曲柄连杆机构（把往复变旋转）、配气机构（按时开关气门）。</p>' +
          '<p>四个活塞排成一列叫<b>直列四缸</b>。曲轴每转两圈（720°）完成一个完整循环，' +
          '四缸按 <b>1-3-4-2</b> 顺序依次做功，每 180° 就有一个缸在出力，所以运转平稳。</p>' +
          '<p>拖动鼠标可环绕查看，点击任一零件会显示其名称与作用。</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'all'; },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' }
        ]
      },
      {
        name: '曲柄连杆机构',
        cam: { tx: 4.0, ty: 4.6, tz: 0, dist: 36, yaw: .34, pitch: .16 },
        title: '活塞的上下，怎么变成曲轴的旋转？',
        ask: '为什么活塞到最上、最下时，曲轴的扭矩为零？',
        body: '<p><b>滑块-曲柄机构：</b>活塞只能上下（往复），连杆一头连活塞、一头连曲轴销，' +
          '转动时连杆摆动，就把直线运动"翻译"成旋转。</p>' +
          '<p>活塞位置 <code>y = r·cosβ + √(L² − r²sin²β)</code>：<b>r</b> 是曲柄半径（冲程的一半），' +
          '<b>L</b> 是连杆长度。<b>β</b> 是该缸从"做功上止点"起的曲轴转角。</p>' +
          '<p>上/下止点时连杆与曲柄共线，力臂为零，所以那一瞬扭矩最小——这也是要靠飞轮储能的原因。</p>',
        apply: function (s) { s.spin = 0; s.explPct = 0; s._labSet = 'crank'; s.theta = 0; s.setAng = 0; },
        controls: [
          { type: 'range', key: 'setAng', min: 0, max: 720, step: 2, label: '曲轴转角（°）', onChange: function (s) { s.theta = s.setAng * PI / 180; s.spin = 0; } },
          { type: 'btn', label: '自动运转', onClick: function (s) { s.spin = 1; } }
        ]
      },
      {
        name: '配气机构',
        cam: { tx: 3.4, ty: 14.1, tz: 0, dist: 30, yaw: .24, pitch: .04 },
        title: '气门由谁、在什么时候打开？',
        ask: '为什么凸轮轴的转速只有曲轴的一半？',
        body: '<p><b>双顶置凸轮轴（DOHC）：</b>两根凸轮轴压在气门上方，凸轮鼻尖转到下方时把气门顶开，' +
          '弹簧再把气门压回关闭。</p>' +
          '<p>四冲程发动机曲轴转<b>两圈</b>（720°）才完成一次"进气—压缩—做功—排气"，' +
          '而气门每循环只开一次，所以<b>凸轮轴转速 = 曲轴的一半</b>。</p>' +
          '<p>排气门在排气行程打开、进气门在进气行程打开；在排气末与进气初会有短暂的<b>气门重叠</b>，' +
          '利用气流惯性帮助换气。</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'valve'; },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' }
        ]
      },
      {
        name: '四冲程循环',
        cam: { tx: 4.0, ty: 6.6, tz: 0, dist: 43, yaw: .60, pitch: .32 },
        title: '进气 → 压缩 → 做功 → 排气',
        ask: '四个缸各自处在哪个冲程？看右侧读数。',
        body: '<p>每个缸都按 <b>进气（吸）→ 压缩（压）→ 做功（爆）→ 排气（排）</b> 循环，各占曲轴 180°。</p>' +
          '<p>四个缸错开相位：1、4 缸同相，2、3 缸同相，彼此差 180°。这样<b>任何时刻总有一个缸在做功</b>，' +
          '动力输出才连续。</p>' +
          '<p>右侧读数实时显示各缸当前冲程，暂停后可用"曲轴转角"滑块逐度观察。</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; s._labSet = 'crank'; s.setAng = 0; },
        controls: [
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'range', key: 'speed', min: 0, max: 3, step: .1, label: '运转速度' }
        ]
      },
      {
        name: '拆解总览',
        cam: { tx: 3.6, ty: 9.0, tz: 0, dist: 48, yaw: .56, pitch: .27 },
        title: '把缸盖揭开，看清内部结构',
        ask: '缸盖与缸体之间、油底壳与缸体之间靠什么密封？',
        body: '<p>拖动"拆解程度"把缸盖抬起、油底壳抽出，露出燃烧室、气门、凸轮与曲轴。</p>' +
          '<p><b>装配关系：</b>缸盖—缸垫—缸体—油底壳依次用螺栓紧固。缸垫密封燃烧室与水道，' +
          '油底壳密封曲轴箱并储存机油。</p>' +
          '<p>点选任一零件可读出名称与功能，便于对照实物做结构认知。</p>',
        apply: function (s) { s.spin = 0; s._labSet = 'none'; s.explPct = 0; },
        controls: [
          { type: 'range', key: 'explPct', min: 0, max: 100, step: 2, label: '拆解程度（%）' },
          { type: 'btn', label: '展开 / 合拢', onClick: function (s) { s.explPct = s.explPct > 5 ? 0 : 90; } }
        ]
      },
      {
        name: '小测验',
        cam: { tx: 4.0, ty: 6.8, tz: 0, dist: 43, yaw: .58, pitch: .315 },
        title: '检验一下：发动机的几个关键点',
        ask: '先想一想，再选答案。',
        body: '<p>下面这道题考察四缸机的相位与配气关系。</p>',
        apply: function (s) { s.spin = 1; s.explPct = 0; },
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        {
          q: '直列四缸四冲程发动机，曲轴转一圈（360°）内，共有几个缸完成做功？',
          opts: ['2 个', '1 个', '4 个', '0 个'],
          ans: '2 个',
          why: '每 180° 有一个缸做功，360° 内正好两个缸做功（四缸曲轴两圈完成一个循环）。'
        },
        {
          q: '凸轮轴的转速与曲轴相比是？',
          opts: ['一半', '相同', '两倍', '四倍'],
          ans: '一半',
          why: '曲轴转两圈完成一个四冲程循环，气门每循环开一次，故凸轮轴转速为曲轴的一半。'
        },
        {
          q: '1、4 缸的活塞处于什么关系？',
          opts: ['同步上下', '相差 180°', '相差 90°', '完全无关'],
          ans: '同步上下',
          why: '直列四缸中 1、4 缸同相（同时到达上/下止点），2、3 缸同相，两组相差 180°。'
        },
        {
          q: '活塞到达上止点时，曲轴输出的扭矩为什么最小？',
          opts: ['连杆与曲柄共线，力臂为零', '气体压力为零', '活塞速度最大', '飞轮停转'],
          ans: '连杆与曲柄共线，力臂为零',
          why: '上/下止点处连杆与曲柄几乎共线，燃气压力对曲轴的回转力臂接近零，故瞬时扭矩最小。'
        }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
