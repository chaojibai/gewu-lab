/* 格物实验室 · 探究平面镜成像的特点（three.js 单文件课件）
   鲁教版 八年级上册 · 第三章 光现象 · 第三节 平面镜成像

   【严谨】把玻璃板视作竖直平面镜：镜面 z=0（法线沿 z）。物点 A 在 z=+u，
           由反射定律得像点 I 与 A 关于镜面对称，z_I = −z_A = −u：
           物距 = |z_A| = u、像距 = |z_I| = u，二者由对称性天然相等；
           A 与 I 只有法向坐标相反 → 连线 ∥ 法线 ⟂ 镜面；反射是等距变换，
           像高 h′ = 物高 h、|m| = 1（像物等大）。物距 u 由滑块在 3~10 cm
           间可调，所有读数每帧由该几何算，不再把像距写死为 6。
           像由反射光反向延长线相交而成 → 虚像，光屏放在 z=−u 也承接不到。
   【真实感】玻璃板有厚度、钢边框与 P.stand 支架（竖立不悬空）；A 点燃有
           体积火焰、B 未点燃且与 A 完全相同；方格纸带可读 cm 刻度（0=镜面）；
           光屏木框+陶瓷面+P.stand 支座；B 与光屏各有 HOME 备料位，按按钮
           真实平移到位；每件落地器材 P.ground 接地，材质按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；所有读数与正文数字由此推出）────── */
  var MIRROR_Z = 0;                       // 镜面所在 z（法线沿 z）
  var U_MIN = 3, U_MAX = 10;              // 物距可调范围（cm）
  var U0 = 6;                             // 初始物距（cm）——只是初值，不是结论
  var CANDLE_H = 6;                       // 两支蜡烛完全相同：柱高（cm）
  var PAPER_W = 30, PAPER_D = 28;         // 方格纸（覆盖 z=−14..14）
  var GLASS_W = 12, GLASS_H = 12, GLASS_TH = .6;  // 玻璃板宽/高/厚
  var B_HOME = { x: 10, z: 9 };           // 蜡烛 B 备料位
  var SCR_HOME = { x: 10, z: -11 };       // 光屏备料位

  /* 平面镜几何：镜面 z=MIRROR_Z，像 = 物关于镜面的对称点。
     物/像坐标、物距、像距、放大率、像高全部由 u 推出。 */
  function mirrorGeo(u) {
    var zA = MIRROR_Z + u;                 // 物（镜前，+z 侧）
    var zI = 2 * MIRROR_Z - zA;            // 像：关于 z=MIRROR_Z 对称 ⇒ −u
    var objDist = Math.abs(zA - MIRROR_Z);
    var imgDist = Math.abs(zI - MIRROR_Z); // 由对称性 = objDist
    var imgH = CANDLE_H;                   // 反射是等距变换 → 像高 = 物高
    var m = imgH / CANDLE_H;                // 横向放大率 |m| = 1
    return { zA: zA, zI: zI, u: objDist, v: imgDist, m: m, imgH: imgH };
  }

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = { _u: U0, _t: 0, coincide: false, screen: false, wrong: false, judged: false };
  var O = {};

  /* 方格纸可读刻度：沿 z 铺一条 cm 尺，中心 0 = 镜面，每 1 cm 一格、每 5 cm 标数 */
  function makeZRuler(cm) {
    var px = 18;
    var cv = document.createElement('canvas'); cv.width = cm * px; cv.height = 44;
    var x = cv.getContext('2d');
    x.fillStyle = '#f6f2e6'; x.fillRect(0, 0, cv.width, cv.height);
    x.textAlign = 'center'; x.font = 'bold 20px Consolas,monospace';
    for (var i = 0; i <= cm; i++) {
      var p = i * px + 1, z = cm / 2 - i;     // 尺中心 z=0（镜面）
      var major = (z % 5 === 0);
      x.lineWidth = (z === 0) ? 3 : (major ? 2 : 1);
      x.strokeStyle = (z === 0) ? '#c0392b' : '#8c939a';
      x.beginPath(); x.moveTo(p, 0); x.lineTo(p, z === 0 ? 30 : (major ? 20 : 12)); x.stroke();
      if (z === 0) { x.fillStyle = '#c0392b'; x.fillText('0(镜面)', p, 42); }
      else if (major) { x.fillStyle = '#1c2b39'; x.fillText(String(z), p, 42); }
    }
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    var g = new T.Group();
    var m = new T.Mesh(new T.PlaneGeometry(cm, 2.2),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2;      // 长边沿世界 x 平铺
    g.add(m);
    g.rotation.y = Math.PI / 2;       // 长边转到世界 z
    return g;
  }

  /* 玻璃板：厚玻璃 + 钢边框 + 两根 P.stand 立杆夹持（不悬空、非贴纸平板） */
  function makeGlass() {
    var g = new T.Group();
    var plate = new T.Mesh(new T.BoxGeometry(GLASS_W, GLASS_H, GLASS_TH), P.MAT.glass);
    plate.position.set(0, GLASS_H / 2, 0); g.add(plate);   // 底 y=0，顶 y=12
    /* 玻璃轮廓线：浅背景玻璃靠轮廓定形，这里加深颜色/不透明度 */
    var edges = new T.LineSegments(new T.EdgesGeometry(plate.geometry),
      new T.LineBasicMaterial({ color: 0x2b5878, transparent: true, opacity: .9 }));
    edges.position.copy(plate.position); g.add(edges);
    /* 玻璃面矩形轮廓：把整片玻璃面勾出来（浅背景下玻璃易隐形） */
    var hw = GLASS_W / 2, fz = GLASS_TH / 2 + .02;
    g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints([
      new T.Vector3(-hw, 0, fz), new T.Vector3(hw, 0, fz),
      new T.Vector3(hw, GLASS_H, fz), new T.Vector3(-hw, GLASS_H, fz)]),
      new T.LineBasicMaterial({ color: 0x2b5878, transparent: true, opacity: .7 })));
    /* 钢框压深：浅银框在浅墙前读不出边界，改深灰金属 */
    var frameMat = new T.MeshStandardMaterial({ color: 0x3f4c58, roughness: .35, metalness: .8, envMapIntensity: 1.1 });
    var e = .35, d = GLASS_TH + .2;
    var eh = new T.Mesh(new T.BoxGeometry(GLASS_W + e, e, d), frameMat);
    eh.position.set(0, GLASS_H, 0); g.add(eh);              // 上框
    var el = eh.clone(); el.position.y = 0; g.add(el);       // 下框
    var ev = new T.Mesh(new T.BoxGeometry(e, GLASS_H, d), frameMat);
    ev.position.set(GLASS_W / 2, GLASS_H / 2, 0); g.add(ev);  // 右框
    var ev2 = ev.clone(); ev2.position.x = -GLASS_W / 2; g.add(ev2); // 左框
    [-1, 1].forEach(function (s) {                          // 两侧支架夹住板边
      var stand = P.stand(GLASS_H - .7, { baseW: 3, baseD: 4 });
      stand.position.set(s * (GLASS_W / 2 + .5), 0, 0);
      g.add(stand);
    });
    return g;
  }

  /* 光屏：木框 + 陶瓷面 + P.stand 强化支座，屏面朝 +z */
  function makeScreen() {
    var g = new T.Group();
    var frame = new T.Mesh(new T.BoxGeometry(9.6, 11.6, .4), P.MAT.wood);
    frame.position.y = 6; g.add(frame);
    var face = new T.Mesh(new T.BoxGeometry(9, 11, .45), P.MAT.ceramic);
    face.position.set(0, 6, .05); g.add(face);
    var stand = P.stand(5.3, { baseW: 5, baseD: 4 });
    stand.position.z = -1; g.add(stand);                    // 夹持在屏中心 y=6
    return g;
  }

  /* 半透明虚像（ghost）：始终在像位；半透明 + 柔光 + 轮廓，读成「虚像」而非实体 */
  function makeGhost() {
    var g = new T.Group();
    var waxMat = P.MAT.wax.clone();
    waxMat.transparent = true; waxMat.opacity = .62; waxMat.depthWrite = false;
    waxMat.color = new T.Color(0xdfe9f2);
    var waxGeo = new T.CylinderGeometry(1.4, 1.4, CANDLE_H, 22);
    var wax = new T.Mesh(waxGeo, waxMat);
    wax.position.y = CANDLE_H / 2; wax.renderOrder = 4; g.add(wax);
    /* 轮廓：EdgesGeometry 会给 22 边圆柱画出 22 条竖线 → 读成鸟笼。
       只留上下两个圆口 + 四条母线，虚像才像蜡烛。 */
    var lineMat = new T.LineBasicMaterial({ color: 0x4a7fa8, transparent: true, opacity: .55 });
    [.02, CANDLE_H - .02].forEach(function (y) {
      var pts = [];
      for (var i = 0; i < 40; i++) {
        var a = i / 40 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(a) * 1.4, y, Math.sin(a) * 1.4));
      }
      var ring = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), lineMat);
      ring.renderOrder = 5; g.add(ring);
    });
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (s) {
      var ln = new T.Line(new T.BufferGeometry().setFromPoints([
        new T.Vector3(s[0] * 1.4, 0, s[1] * 1.4),
        new T.Vector3(s[0] * 1.4, CANDLE_H, s[1] * 1.4)]), lineMat);
      ln.renderOrder = 5; g.add(ln);
    });
    /* 径向渐变柔光：虚像火光（软边，禁硬边白团），透过玻璃板可见 */
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var x = cv.getContext('2d');
    var grd = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,190,110,.60)');
    grd.addColorStop(.4, 'rgba(255,150,60,.22)');
    grd.addColorStop(1, 'rgba(255,130,40,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    var glowTex = new T.CanvasTexture(cv);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb45a,
      transparent: true, opacity: .6, depthWrite: false, blending: T.AdditiveBlending }));
    glow.scale.set(3.0, 4.0, 1); glow.position.y = CANDLE_H + .8;
    glow.renderOrder = 5; g.add(glow);
    var fl = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffd08a,
      transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }));
    fl.scale.set(1.2, 2.0, 1); fl.position.y = CANDLE_H + 1.0;
    fl.renderOrder = 5; g.add(fl);
    return g;
  }

  /* A 点燃的火光晕：径向渐变柔光板（软羽化，不再是有硬边的加性椭球） */
  function addVolFlame(candle) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var x = cv.getContext('2d');
    var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,150,60,.50)');
    g.addColorStop(.45, 'rgba(255,120,30,.20)');
    g.addColorStop(1, 'rgba(255,110,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var glow = new T.Mesh(new T.PlaneGeometry(2.6, 3.6),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, opacity: .7,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    glow.position.y = CANDLE_H + 1.3;
    candle.add(glow); candle.userData.glow = glow;
  }

  /* 错误预期：屏上浮现的淡「假像」贴图（表示把虚像当实像的错误猜想） */
  function fakeTex() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 160;
    var x = c.getContext('2d');
    x.fillStyle = '#e9c46a'; x.fillRect(44, 52, 40, 100);
    x.fillStyle = '#ff8a1e'; x.beginPath(); x.ellipse(64, 38, 12, 22, 0, 0, 6.283); x.fill();
    x.fillStyle = '#c0392b'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center';
    x.fillText('?', 64, 138);
    return new T.CanvasTexture(c);
  }

  /* 器材真实平移（带轻微抬起），代替凭空 visible */
  function moveTo(o, tx, tz, dt) {
    var k = Math.min(1, dt * 6);
    var dx = tx - o.position.x, dz = tz - o.position.z;
    o.position.x += dx * k; o.position.z += dz * k;
    var d = Math.sqrt(dx * dx + dz * dz);
    o.position.y += ((d > .35 ? .5 : 0) - o.position.y) * k;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(48, 30);

      /* 带可读 cm 刻度的方格纸（0 = 镜面） */
      var paper = P.gridPaper({ w: PAPER_W, d: PAPER_D });
      paper.position.set(0, .06, 0); K.scene().add(paper);
      var ruler = makeZRuler(PAPER_D);
      ruler.position.set(-PAPER_W / 2 + 2, .12, 0); K.scene().add(ruler); O.ruler = ruler;

      /* 玻璃板：厚玻璃 + 钢边框 + 两根 P.stand 支架，竖立于 z=0 */
      var glass = makeGlass(); glass.position.set(0, 0, MIRROR_Z); K.scene().add(glass); O.glass = glass;

      /* 物 A（点燃·体积火）与完全相同的 B（未点燃） */
      var A = P.candle({ h: CANDLE_H }); A.position.set(0, 0, U0);
      /* 关闭 P.candle 自带硬边锥火（浅背景下读成白色光团），
         改用径向渐变柔光 + K.shaderFlame 小体积火；火焰随 A 一起移动 */
      A.userData.setLit(false); addVolFlame(A); K.scene().add(A); O.A = A;
      O.AFlame = K.shaderFlame({ x: 0, y: CANDLE_H + .35, z: 0,
        r: .5, h: 1.5, light: .55, dist: 9, parent: A });
      O.AFlame.setLit(1);
      var B = P.candle({ h: CANDLE_H }); B.position.set(B_HOME.x, 0, B_HOME.z);
      B.userData.setLit(false); K.scene().add(B); O.B = B;

      /* 虚像 ghost：始终由几何放在 z=−u */
      var ghost = makeGhost(); ghost.position.set(0, 0, -U0); K.scene().add(ghost); O.ghost = ghost;

      /* 光屏（含支座），从 HOME 备料位真实移入 */
      var scr = makeScreen(); scr.position.set(SCR_HOME.x, 0, SCR_HOME.z); K.scene().add(scr); O.scr = scr;
      var fake = new T.Mesh(new T.PlaneGeometry(4, 5),
        new T.MeshBasicMaterial({ map: fakeTex(), transparent: true, opacity: 0,
          side: T.DoubleSide, depthWrite: false }));
      fake.position.set(0, 6, .32); scr.add(fake); O.fake = fake;

      /* 每件落地器材一个深色接地阴影；移动件的阴影在 update 里跟随 */
      P.ground(0, MIRROR_Z, 6);
      P.ground(-(GLASS_W / 2 + .5), 0, 2.4); P.ground(GLASS_W / 2 + .5, 0, 2.4);
      O.gA = P.ground(0, U0, 2.6);
      O.gB = P.ground(B_HOME.x, B_HOME.z, 2.2);
      O.gS = P.ground(SCR_HOME.x, SCR_HOME.z, 3.2);

      K.tag(O.glass, '玻璃板（带厚度·支架）', '竖直于 z=0，既成像又透光，便于确定像位置');
      K.tag(O.A, '蜡烛 A（点燃）', '物：z=+u，物距 u 可调');
      K.tag(O.B, '蜡烛 B（未点燃·与 A 完全相同）', '等效替代：移到像位与 A 的像重合');
      K.tag(O.ghost, 'A 的虚像', 'z=−u，由反射定律的对称关系确定');
      K.tag(O.scr, '光屏（支座）', '放在像位检验：屏上无像 → 虚像');
      K.tag(O.ruler, '方格纸刻度', '0 = 镜面，两侧读物距 / 像距（cm）');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var g = mirrorGeo(s._u);

      /* 物 A 随物距实时移动；火光晕轻微跳动（柔光板小幅缩放） */
      O.A.position.z = g.zA;
      if (O.A.userData.glow) O.A.userData.glow.scale.y = 1 + .07 * Math.sin(s._t * 9);
      O.AFlame.tick(s._t);

      /* 虚像 ghost 始终在像位 zI=−u（由对称几何算，不凭空显隐） */
      O.ghost.position.z = g.zI;

      /* B：重合则移到像位与 ghost 叠合；放光屏时先移去 B */
      var bWork = (s.coincide && !s.screen);
      moveTo(O.B, bWork ? 0 : B_HOME.x, bWork ? g.zI : B_HOME.z, dt);

      /* 光屏：放置则移到像位 zI，否则回 HOME */
      moveTo(O.scr, s.screen ? 0 : SCR_HOME.x, s.screen ? g.zI : SCR_HOME.z, dt);

      /* 接地阴影跟随移动件，不脱节 */
      if (O.gA) O.gA.position.z = O.A.position.z;
      if (O.gB) { O.gB.position.x = O.B.position.x; O.gB.position.z = O.B.position.z; }
      if (O.gS) { O.gS.position.x = O.scr.position.x; O.gS.position.z = O.scr.position.z; }

      /* 反例/易错：错误预期时屏上浮现淡「假像」；真实状态屏面空白（无像） */
      var tgt = (s.screen && s.wrong) ? .32 : 0;
      O.fake.material.opacity += (tgt - O.fake.material.opacity) * Math.min(1, dt * 5);
    }
  };

  function reset(s) { s.coincide = false; s.screen = false; s.wrong = false; s.judged = false; }

  K.boot({
    title: '探究平面镜成像的特点',
    chip: '物理 · 鲁教版 · 八上 · 第三章 光现象 · 第三节 平面镜成像',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 14, dist: 50, tx: 0, tz: 0, yaw: .2, pitch: .36 },
    reads: [['obj', '物距 u'], ['img', '像距 v'], ['eq', '物/像距关系'],
            ['m', '像/物大小'], ['perp', '连线与镜面'], ['scr', '光屏检验']],
    values: function (s) {
      var g = mirrorGeo(s._u);
      var shown = s.coincide || s.screen;   // 确定像位置后才给出像距等结论
      return {
        obj: g.u.toFixed(1) + ' cm',
        img: shown ? g.v.toFixed(1) + ' cm' : '—',
        eq: shown ? ('u = v = ' + g.u.toFixed(1) + ' cm（等距）') : '—',
        m: shown ? ('|m| = ' + g.m.toFixed(1) + '，h′ = h = ' + g.imgH.toFixed(1) + ' cm（等大）') : '—',
        perp: shown ? '连线 ∥ 法线 ⟂ 镜面' : '—',
        scr: s.screen ? (s.wrong ? '错误预期：以为有像 → 屏面仍空白' : '无像（虚像不能承接）') : '—'
      };
    },
    steps: [
      { name: '看装置', title: '为什么用玻璃板代替平面镜？',
        ask: '玻璃板比平面镜好在哪儿？',
        body: '<p><b>器材：</b>带厚度、钢边框与支架的<b>薄玻璃板</b>（竖直于 z = 0）、两支<b>完全相同</b>的蜡烛（A 点燃有体积火、B 未点燃）、带 cm 刻度的方格纸（刻度 0 即镜面）、带支座的光屏。</p>' +
          '<p><b>模型假设：</b>玻璃板视为理想平面镜，<b>镜面 z = 0、法线沿 z</b>；取前表面反射为主像，忽略前后两个表面各成一次像造成的重影（故选<b>薄</b>玻璃）——这是本模型的边界。</p>' +
          '<p><b>关键：</b>玻璃板既成像又<b>透光</b>，才能透过它看到板后的 B，用<b>等效替代法</b>确定像的位置。</p>' +
          '<p><b>易错/反例：</b>换成不透光平面镜，就看不到板后的 B，无法把 B 移到像位——像的位置无从确定。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 0, ty: 12, tz: 2, dist: 40, yaw: .2, pitch: .4 } },
      { name: '重合', title: '移动 B，使之与 A 的像完全重合',
        ask: 'B 与 A 的像重合，说明像与物在大小和位置上有什么关系？',
        body: '<p><b>操作：</b>点燃的 A 放在镜前 <b>z = +u</b>（u 由下方滑块在 ' + U_MIN + '~' + U_MAX + ' cm 间可调）；从 A 侧透过玻璃板观察，把<b>未点燃</b>的 B 从备料位移到 <b>z = −u</b>，直到 B 与 A 的像<b>完全重合</b>。</p>' +
          '<p><b>几何模型：</b>由反射定律，像点 I 与物点 A 关于镜面 z = 0 对称，<b>z_I = −z_A = −u</b>；B 的目标位置正是由这条几何关系算出的，<b>不是写死的固定值</b>。于是物距 = |z_A| = u、像距 = |z_I| = u，二者由对称性天然相等。</p>' +
          '<p><b>等大：</b>反射是等距变换，像高 h′ = 物高 h = ' + CANDLE_H.toFixed(1) + ' cm，横向放大率 <b>|m| = h′/h = 1</b>；右侧读数每帧随 u 重算。</p>' +
          '<p><b>易错/反例：</b>B 必须<b>与 A 完全相同且未点燃</b>——若 B 点燃，就分不清哪团火是像；若两支蜡烛不等高，「重合」也证明不了像物等大。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'range', key: '_u', min: U_MIN, max: U_MAX, step: .5, label: '物距 u（cm，改变后像位与读数实时重算）' },
          { type: 'btn', label: '移动 B 到像位（与 A 的像重合）', onClick: function (s) { s.coincide = true; } },
          { type: 'btn', label: '把 B 放回备料位', onClick: function (s) { s.coincide = false; } }
        ],
        cam: { tx: 0, ty: 10, tz: 2, dist: 30, yaw: .2, pitch: .42 } },
      { name: '测距', title: '测物距与像距，多次实验',
        ask: '平面镜成像中，像与物到镜面的距离有何关系？',
        body: '<p><b>由几何算：</b>物 A(0, 0, +u)、像 I(0, 0, −u) 到镜面 z = 0 的距离分别为 <b>u = |+u|、v = |−u| = u</b>，故<b>像距 = 物距</b>——对<u>任意</u> u 都成立（拖动滑块改变 u，读数面板的 u 与 v 始终相等），不是只对某个数巧合。</p>' +
          '<p><b>连线垂直镜面：</b>A 与 I 的 x、y 坐标相同、只有法向坐标 z 相反，连线方向 (0, 0, −2u) <b>平行于法线</b>，故<b>垂直镜面</b>；这也由对称关系直接推出。</p>' +
          '<p><b>多次实验：</b>取 u = ' + U_MIN + '、' + ((U_MIN + U_MAX) / 2) + '、' + U_MAX + ' cm 等，每次 v 都等于 u、|m| 都为 1，说明是普遍规律。</p>' +
          '<p><b>边界/易错：</b>若玻璃板未严格竖直（倾斜 θ），像会整体偏上/下，B 便无法与像完全重合——本模型假设镜面垂直台面。</p>',
        apply: function (s) { reset(s); s.coincide = true; },
        controls: [
          { type: 'range', key: '_u', min: U_MIN, max: U_MAX, step: .5, label: '改变物距 u（cm），观察 v 与 |m|' }
        ],
        cam: { tx: 0, ty: 11, tz: 0, dist: 36, yaw: .2, pitch: .4 } },
      { name: '虚像', title: '用光屏检验：像能否承接？',
        ask: '把光屏放在像的位置，屏上能看到像吗？这叫什么像？',
        body: '<p><b>操作：</b>移去 B，把光屏从备料位移到<b>像位置 z = −u</b>，从屏正面观察屏面。</p>' +
          '<p><b>物理模型：</b>平面镜的像由反射光线的<b>反向延长线</b>在镜后相交而成，镜后并<b>无实际光线会聚</b>；故光屏放在 z = −u 处，屏面仍是<b>空白（无像）</b>，读数面板显示「无像（虚像不能承接）」。</p>' +
          '<p><b>结论：</b>平面镜成的是<b>虚像</b>——不能用光屏承接；能承接的是实像（对照凸透镜 u > f 的情形）。</p>' +
          '<p><b>反例/易错点：</b>常把虚像当成「屏上能呈现的像」。按下方「错误预期」按钮，屏上会浮现一个淡像轮廓表示这种<b>错误猜想</b>；再按「回到真实」屏面恢复空白——实际像始终不在屏上。按钮可反复切换对照。</p>' +
          '<p><b>拓展：</b>像与物关于镜面对称；应用：潜望镜、镜面对称作图。</p>',
        apply: function (s) { reset(s); s.screen = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '放置光屏到像位（屏上无像）', onClick: function (s) { s.screen = true; s.judged = true; } },
          { type: 'btn', label: '移去光屏，放回 B 看虚像', onClick: function (s) { s.screen = false; s.coincide = true; } },
          { type: 'btn', label: '错误预期：以为屏上会成像', onClick: function (s) { s.wrong = true; } },
          { type: 'btn', label: '回到真实：屏面空白（无像）', onClick: function (s) { s.wrong = false; } }
        ],
        cam: { tx: 0, ty: 12, tz: -2, dist: 38, yaw: .2, pitch: .4 } }
    ],
    quiz: function () {
      var bank = [
        { q: '为何用玻璃板代替平面镜？', opts: ['便于确定像的位置', '更亮', '更便宜', '防碎'], ans: '便于确定像的位置', why: '玻璃板既能成像又能透过找像的准确位置（等效替代）。' },
        { q: '平面镜成像中像与物？', opts: ['大小相等', '像更大', '像更小', '无关'], ans: '大小相等', why: '像与物等大，这是平面镜成像特点之一。' },
        { q: '像与物到镜面距离？', opts: ['相等', '像更远', '物更远', '随机'], ans: '相等', why: '像与物到镜面距离相等，连线垂直镜面。' },
        { q: '平面镜成的是什么像？', opts: ['虚像', '实像', '二者皆可', '不是像'], ans: '虚像', why: '平面镜成虚像，不能用光屏承接。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
