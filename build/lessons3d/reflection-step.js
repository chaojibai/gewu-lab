/* 格物实验室 · 探究光的反射定律（three.js 单文件课件）
   鲁教版 八年级上册 · 第三章 光现象 · 第二节 光的反射

   【严谨】反射方向由矢量公式实时算：r = d − 2(d·n)n（d 入射传播方向、n 镜面单位法线）。
           入射角 ∠i = arccos(−d·n)、反射角 ∠r = arccos(r·n)，均由 arccos 实时算并显示在 reads，
           不写死「∠r=∠i」的结果；镜面转 α 后 n 随之转 α，反射方向相对基准的偏转角
           Δ = arccos(r·r₀) 由模型算得恰为 2α（反例：误以为反射光也只转 α）。
           三线共面用可折转纸板演示：纸板绕铰链真实转出入射面，反射光线随之断 / 续。
   【真实感】平面镜水平+底座、可折纸板有厚度与黄铜铰链、激光笔由铁架台+横臂支撑、
           量角器可读 0–180° 刻度（备料 HOME→工作位动线）、法线虚线、入射/反射光斑，
           材质按 P.MAT、每件落地器材 P.ground 接地；无纯白大平面、无长弧导线、无凭空 visible。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源，所有读数由此推出）────────────────── */
  var I0        = 45;                        // 基准入射角（激光笔方向，°）
  var ALPHA_DEG = 10;                        // 反例：镜面转角 α（°）
  var FOLD_MAX  = 1.05;                      // 纸板折转角上限（rad ≈ 60°）
  var D_EMIT    = 15;                        // 激光笔到入射点距离（cm）
  var L_BEAM    = D_EMIT - 2.5;              // 入射光束长（扣去笔身半长）
  var L_REF     = 11;                        // 反射光束长（落在 F 板上）
  var L_NORMAL  = 11;                        // 法线虚线长
  var O_POINT   = new T.Vector3(0, .8, .9);  // 入射点（镜面顶面、纸板前表面）
  var X_AXIS    = new T.Vector3(1, 0, 0);
  var UP        = new T.Vector3(0, 1, 0);
  var PROT_HOME = new T.Vector3(18, .6, -7); // 量角器备料位（托盘）
  var PROT_WORK = new T.Vector3(0, .8, .95); // 量角器工作位（屏前）
  var STAND_TOP = new T.Vector3(-16, 11.7, 1.6); // 铁架台夹持端
  var CLAMP_LOCAL_X = -1.6;                      // 夹环套在笔身本地 x（笔尾侧）

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间；on / judged 为布尔字段，安全 */
  var st = {
    _i0: I0, _i0T: I0,                       // 入射角当前 / 目标（激光笔真实摆动）
    _alpha: 0, _alphaT: 0,                   // 镜面转角当前 / 目标
    _fold: 0, _foldT: 0,                     // 纸板折转当前 / 目标
    _prot: 0, _protT: 0,                     // 量角器 HOME→WORK 进度
    on: false, judged: false, _t: 0
  };
  var O = {};

  function clamp(v) { return Math.max(-1, Math.min(1, v)); }
  /* 反射模型：r = d − 2(d·n)n；∠i、∠r、反射光偏角 Δ 全用 arccos 实时算 */
  function opticsCore(i0Deg, alphaDeg) {
    var i0 = i0Deg * Math.PI / 180, a = alphaDeg * Math.PI / 180;
    var d  = new T.Vector3(Math.sin(i0), -Math.cos(i0), 0);        // 入射传播方向（指向 O）
    var n0 = new T.Vector3(0, 1, 0);                                // 镜面未转时的法线
    var n  = new T.Vector3(-Math.sin(a), Math.cos(a), 0);           // 转 α 后的法线
    var r  = d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n)));  // r = d − 2(d·n)n
    var r0 = d.clone().sub(n0.clone().multiplyScalar(2 * d.dot(n0)));// 同 d、镜面未转的反射方向
    return {
      d: d, n: n, r: r, r0: r0,
      iDeg: Math.acos(clamp(-d.dot(n))) * 180 / Math.PI,            // 入射角
      rDeg: Math.acos(clamp(r.dot(n))) * 180 / Math.PI,              // 反射角
      turnDeg: Math.acos(clamp(r.dot(r0))) * 180 / Math.PI            // 反射光相对基准偏角 = 2α
    };
  }
  function optics(s) {
    var c = opticsCore(s._i0, s._alpha);
    c.i0Deg = s._i0; c.alphaDeg = s._alpha; c.fold = s._fold; c.prot = s._prot;
    return c;
  }

  function cmat0(c, r, m) { return new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m }); }
  function glow(c, op) {
    return new T.MeshBasicMaterial({ color: c, transparent: true, opacity: op,
      blending: T.AdditiveBlending, depthWrite: false });
  }
  /* 量角器高对比刻度贴图：浅背景下原贴图刻度线/数字太淡，这里覆盖一份加深版 */
  function deepProtractorTex() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(255,255,255,.94)'; x.beginPath();
    x.moveTo(256, 256); x.arc(256, 256, 252, Math.PI, 2 * Math.PI); x.closePath(); x.fill();
    x.strokeStyle = '#16283a'; x.lineWidth = 4; x.beginPath();
    x.arc(256, 256, 252, Math.PI, 2 * Math.PI); x.stroke();
    x.strokeStyle = '#101c28'; x.fillStyle = '#101c28';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 26px Consolas,monospace';
    for (var a = 0; a <= 180; a += 5) {
      var rad = Math.PI + a / 180 * Math.PI;
      var major = (a % 30 === 0), mid = (a % 10 === 0);
      var r1 = 250, r2 = major ? 220 : (mid ? 231 : 240);
      x.lineWidth = major ? 4 : (mid ? 2.6 : 1.8);
      x.beginPath();
      x.moveTo(256 + Math.cos(rad) * r1, 256 + Math.sin(rad) * r1);
      x.lineTo(256 + Math.cos(rad) * r2, 256 + Math.sin(rad) * r2); x.stroke();
      if (major) x.fillText(String(a), 256 + Math.cos(rad) * (r2 - 20), 256 + Math.sin(rad) * (r2 - 20));
    }
    var t = new T.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  /* 单位圆柱（y 轴）重算为 p0→p1 线段；长度→0 即渐隐，不用凭空 visible */
  function setSeg(o, p0, p1) {
    var d = new T.Vector3().subVectors(p1, p0), L = d.length();
    o.position.copy(p0).addScaledVector(d, .5);
    o.scale.set(1, Math.max(1e-4, L), 1);
    if (L > 1e-6) o.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  }
  function unitCyl(r, mat) {
    var m = new T.Mesh(new T.CylinderGeometry(r, r, 1, 8), mat); return m;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(56, 22);

      /* ── 平面镜：水平躺在底座上，可绕 z 轴转 α（法线随之倾斜）── */
      var base = new T.Mesh(new T.BoxGeometry(31, .3, 11), P.MAT.dark);
      base.position.set(0, .15, 0); K.scene().add(base);
      var mirrorPivot = new T.Group(); mirrorPivot.position.set(0, .55, 0);
      K.scene().add(mirrorPivot); O.mirrorPivot = mirrorPivot;
      /* 镜面宽 30 覆盖纸板底边（x∈[−14,14]），纸板坐在镜面上不悬空 */
      var mirror = P.mirror({ w: 30, h: 10 });
      mirror.children[0].material = P.MAT.dark;      // 背板
      mirror.rotation.x = -Math.PI / 2;               // 镜面朝上（法线 +y）
      mirrorPivot.add(mirror); O.mirror = mirror;
      /* 铝合金边框：四面压在玻璃上缘，让镜面读出「镶框的镜子」而不是蓝胶带 */
      var FR = new T.MeshStandardMaterial({ color: 0xb7c0c8, roughness: .3, metalness: .9, envMapIntensity: 1.2 });
      [[0, -5.05, 31.2, .5], [0, 5.05, 31.2, .5]].forEach(function (p) {
        var f = new T.Mesh(new T.BoxGeometry(p[2], .22, p[3]), FR);
        f.position.set(p[0], .74, p[1]); mirrorPivot.add(f);
      });
      [[-15.35, 0], [15.35, 0]].forEach(function (p) {
        var f = new T.Mesh(new T.BoxGeometry(.5, .22, 10.6), FR);
        f.position.set(p[0], .74, p[1]); mirrorPivot.add(f);
      });
      P.ground(0, 0, 8);

      /* ── 可折转纸板：E 左半固定、F 右半绕竖直铰链折转（有厚度）── */
      var H = 13, W = 14, TH = .5, ZC = .6;
      var paper = P.MAT.wood;
      var left = new T.Mesh(new T.BoxGeometry(W, H, TH), paper);
      left.position.set(-W / 2, .8 + H / 2, ZC); K.scene().add(left); O.left = left;
      var hinge = new T.Group(); hinge.position.set(0, .8, ZC); K.scene().add(hinge); O.hinge = hinge;
      var right = new T.Mesh(new T.BoxGeometry(W, H, TH), paper);
      right.position.set(W / 2, H / 2, 0); hinge.add(right); O.right = right;
      /* 黄铜铰链：竖直轴 + 三个合页环 */
      var axle = new T.Mesh(new T.CylinderGeometry(.2, .2, H, 10), P.MAT.brass);
      axle.position.set(0, .8 + H / 2, ZC); K.scene().add(axle);
      [3, 6.5, 10].forEach(function (dy) {
        var ring = new T.Mesh(new T.TorusGeometry(.42, .12, 8, 16), P.MAT.brass);
        ring.rotation.x = Math.PI / 2; ring.position.set(0, .8 + dy, ZC); K.scene().add(ring);
      });
      P.ground(0, ZC, 7);

      /* ── 激光笔：铁架台 + 横臂支撑，本体随入射角真实摆动 ── */
      var stand = P.stand(11, { baseW: 5, baseD: 4 });
      stand.position.set(-16, 0, 1.6); K.scene().add(stand);
      var laser = P.laser({ len: L_BEAM });
      laser.children[0].material = P.MAT.red;       // 笔身
      laser.children[1].material = P.MAT.brass;     // 笔帽
      K.scene().add(laser); O.laser = laser;
      /* 实体夹持支架：底座+立杆由 P.stand 提供，这里补「夹环」套住笔身，
         横臂末端连到夹环，笔不再像悬在半空 */
      var clampRing = new T.Mesh(new T.TorusGeometry(.92, .17, 10, 24), P.MAT.steelD);
      clampRing.rotation.y = Math.PI / 2;        // 环面法线沿笔身轴（本地 +x）
      clampRing.position.x = CLAMP_LOCAL_X;
      laser.add(clampRing); O.clampRing = clampRing;
      var arm = unitCyl(.32, P.MAT.steelD); K.scene().add(arm); O.arm = arm; // 横臂（加粗）
      P.ground(-16, 1.6, 4);

      /* ── 反射光束 + 光斑（长度/缩放由模型驱动）── */
      var refBeam = unitCyl(.12, glow(0xff2b2b, .85)); K.scene().add(refBeam); O.refBeam = refBeam;
      var refDot = new T.Mesh(new T.SphereGeometry(.42, 12, 10), glow(0xff5555, .8));
      K.scene().add(refDot); O.refDot = refDot;

      /* ── 法线虚线：多段小圆柱拼成，整体 quaternion 跟随镜面法线 n ── */
      var normalGrp = new T.Group(); K.scene().add(normalGrp); O.normalGrp = normalGrp;
      for (var k = 0; k < 9; k++) {
        var seg = new T.Mesh(new T.CylinderGeometry(.08, .08, .7, 6), P.MAT.ceramic);
        seg.position.y = .45 + k * 1.2; normalGrp.add(seg);
      }

      /* ── 量角器：备料件，HOME 托盘 → 工作位（用到才移入）── */
      var tray = new T.Mesh(new T.BoxGeometry(6, .5, 5), P.MAT.dark);
      tray.position.set(18, .25, -7); K.scene().add(tray);
      P.ground(18, -7, 3);
      var protractor = P.protractor({ r: 6.5 });
      /* 覆盖高对比刻度纹理：刻度线/数字加深，浅背景下可读 */
      var disc = protractor.children[0];
      if (disc && disc.material) {
        disc.material.map = deepProtractorTex();
        disc.material.opacity = 1;
        disc.material.needsUpdate = true;
      }
      K.scene().add(protractor); O.protractor = protractor;

      K.tag(O.mirror, '平面镜', '水平放置，法线 n 垂直镜面；转 α 后法线随之转 α');
      K.tag(O.laser, '激光笔', '铁架台支撑，沿纸板面射向入射点 O');
      K.tag(O.hinge, '可折转纸板', 'F 半绕铰链转出入射面，验证三线共面');
      K.tag(O.protractor, '量角器', '可读 0–180° 刻度，量 ∠i、∠r');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      /* 连续量阻尼缓动：入射角、镜面转角、折转、量角器动线（真实物体运动） */
      s._i0    += (s._i0T - s._i0) * Math.min(1, dt * 5);
      s._alpha += (s._alphaT - s._alpha) * Math.min(1, dt * 5);
      s._fold  += (s._foldT - s._fold) * Math.min(1, dt * 5);
      s._prot  += (s._protT - s._prot) * Math.min(1, dt * 5);
      var o = optics(s);

      /* 镜面绕 z 轴转 α */
      O.mirrorPivot.rotation.z = s._alpha * Math.PI / 180;

      /* 激光笔按当前入射角摆动：本地 +x 对准 d，笔口光束恰好打到 O */
      var pemit = O_POINT.clone().addScaledVector(o.d, -D_EMIT);
      O.laser.position.copy(pemit);
      O.laser.quaternion.setFromUnitVectors(X_AXIS, o.d);
      O.laser.userData.setOn(s.on);
      /* 横臂末端连到夹环（夹环箍住笔身），装配关系明确 */
      var clampAt = pemit.clone().addScaledVector(o.d, CLAMP_LOCAL_X);
      setSeg(O.arm, STAND_TOP, clampAt);

      /* 反射光束：从 O 沿 r；长度 = 开机 × (1 − 折转比例)，折转/关灯连续渐隐 */
      var frac = s.on ? Math.max(0, 1 - s._fold / FOLD_MAX) : 0;
      var L = L_REF * frac;
      var end = O_POINT.clone().addScaledVector(o.r, L);
      setSeg(O.refBeam, O_POINT, end);
      O.refDot.position.copy(end);
      O.refDot.scale.set(Math.max(1e-3, frac), Math.max(1e-3, frac), Math.max(1e-3, frac * .45)); // 压扁贴板像光斑

      /* 法线虚线跟随当前镜面法线 n（始终垂直镜面） */
      O.normalGrp.position.copy(O_POINT);
      O.normalGrp.quaternion.setFromUnitVectors(UP, o.n);

      /* 纸板 F 半绕竖直铰链真实折转（反射光线随之断 / 续） */
      O.hinge.rotation.y = -s._fold;

      /* 量角器 HOME（平躺托盘）→ WORK（竖直贴屏）真实动线 */
      O.protractor.position.lerpVectors(PROT_HOME, PROT_WORK, s._prot);
      O.protractor.rotation.x = -Math.PI / 2 * (1 - s._prot);
    }
  };

  /* reset 不强行归零连续量，交回 update 阻尼缓动，避免瞬移 */
  function reset(s) {
    s._i0T = I0; s._alphaT = 0; s._foldT = 0; s._protT = 0;
    s.on = false; s.judged = false;
  }

  K.boot({
    title: '探究光的反射定律',
    chip: '物理 · 鲁教版 · 八上 · 第三章 光现象 · 第二节 光的反射',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 16, dist: 54, tx: -2, tz: 0, yaw: .2, pitch: .42 },
    reads: [['theta', '入射角 ∠i'], ['r', '反射角 ∠r'], ['eq', '关系'],
            ['alpha', '镜面转角 α'], ['turn', '反射光转角'], ['plane', '三线共面']],
    values: function (s) {
      var o = optics(s);
      return {
        theta: s.on ? o.iDeg.toFixed(1) + '°' : '—',
        r: s.on ? o.rDeg.toFixed(1) + '°' : '—',
        eq: s.on ? '∠r = ∠i' : '—',
        alpha: o.alphaDeg.toFixed(0) + '°',
        turn: s.on ? (o.turnDeg.toFixed(1) + '°（≈ 2α）') : '—',
        plane: o.fold > .15 ? '纸板折转 → 反射光消失（三线共面）'
          : (s.on ? '共面可见' : '—')
      };
    },
    steps: [
      { name: '看装置', title: '认识器材与“法线”',
        ask: '“法线”是真实存在的线吗？',
        body: '<p><b>器材：</b>铁架台支撑的激光笔、<b>水平平面镜</b>（带底座）、' +
          '有厚度且带黄铜铰链的<b>可折转纸板</b>、可读刻度的<b>量角器</b>。</p>' +
          '<p><b>模型：</b>反射方向 <b>r = d − 2(d·n)n</b>，其中 d 为入射光传播方向、n 为镜面单位法线。' +
          '取基准入射角 i₀ = ' + I0 + '°，则 d = (sin i₀, −cos i₀, 0)，镜面水平时 n = (0, 1, 0)。' +
          '∠i、∠r 由 <b>arccos</b> 实时算出，不是预设值。</p>' +
          '<p><b>法线：</b>过入射点 O、<b>垂直镜面</b>的假想线，为研究方便而画（图中虚线），<b>不是真实光线</b>；' +
          '法线始终垂直镜面，镜面转 α 时法线也转 α。</p>' +
          '<p><b>边界 / 假设：</b>理想平面镜、均匀空气、几何光学近似；量角器为屏上读数示意，' +
          '面板 ∠i、∠r 以 arccos 相对当前法线实时计算。<b>易错：</b>把法线当成真实光线，或把镜面当光源；' +
          '量角器作为备料件放在 HOME 托盘，需读数时才移入工作位。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '把量角器移入工作位', onClick: function (s) { s._protT = 1; } }],
        cam: { tx: 0, ty: 14, tz: 2, dist: 44, yaw: .2, pitch: .4 } },
      { name: '入射反射', title: '让激光入射，观察反射光',
        ask: '反射光线、入射光线和法线在同一个平面内吗？',
        body: '<p><b>操作：</b>点亮激光，激光笔绕支架真实摆动到指定入射角；用<b>量角器</b>量 ∠i、∠r，' +
          '描出入射与反射光线。<b>现象：</b>反射光线与入射光线分居<b>法线两侧</b>。</p>' +
          '<p><b>模型（全部实时算）：</b>r = d − 2(d·n)n；' +
          '<b>∠i = arccos(−d·n)</b>、<b>∠r = arccos(r·n)</b>。由 r·n = −d·n 得二者恒等，' +
          '但顺序必须是「<b>反射角 = 入射角</b>」——反射角随入射角变化（因果关系不能颠倒）。</p>' +
          '<p><b>参数：</b>∠i 取 ' + [30, 45, 60].join('° / ') + '°，' +
          '对应 ∠r = ∠i 同为 ' + [30, 45, 60].join('° / ') + '°（arccos 实时给出）。' +
          '反射方向随 ∠i 改变：∠i=45° 时 r = (sin i₀, cos i₀, 0)。</p>' +
          '<p><b>边界 / 假设：</b>0° ≤ ∠i &lt; 90°；∠i = 0° 时 r = −d（原路返回），∠i → 90° 为掠射。' +
          '<b>易错：</b>把入射角量成「光线与镜面的夹角」（应为与<b>法线</b>的夹角）；' +
          '把 ∠i、∠r 写成固定数值而非随操作实时计算。</p>',
        apply: function (s) { reset(s); s.on = true; s._protT = 1; },
        controls: [
          { type: 'btn', label: '点亮激光', onClick: function (s) { s.on = true; s._protT = 1; } },
          { type: 'btn', label: '∠i=30°', onClick: function (s) { s._i0T = 30; s.on = true; } },
          { type: 'btn', label: '∠i=45°', onClick: function (s) { s._i0T = I0; s.on = true; } },
          { type: 'btn', label: '∠i=60°', onClick: function (s) { s._i0T = 60; s.on = true; } }
        ],
        cam: { tx: -2, ty: 12, tz: 2, dist: 40, yaw: .2, pitch: .42 } },
      { name: '共面', title: '折转光屏，验证三线共面',
        ask: '把光屏的一半向后折转，还能看到反射光线吗？说明什么？',
        body: '<p><b>操作：</b>把纸板右半 F 绕竖直铰链<b>向后折转</b>（真实转动），观察 F 上是否还能看到反射光线。</p>' +
          '<p><b>模型：</b>入射面由 d 与 n 张成；反射方向 <b>r = d − 2(d·n)n</b> 只由 d、n 决定，' +
          '<b>不因纸板折转而改变</b>。折转后 F 离开入射面，反射光线仍沿原方向传播、却不再落在 F 上，' +
          '故 F 上看不到反射光线 → 证明入射光线、反射光线、法线<b>共面</b>。</p>' +
          '<p><b>边界 / 假设：</b>折转角 0 ≤ β &lt; 90°（本课件 β≤' + (FOLD_MAX * 180 / Math.PI).toFixed(0) + '°）；' +
          '镜面、入射光方向保持不变，只改变纸板朝向。<b>反例 / 易错：</b>误以为「反射光消失了」' +
          '（其实是折转面接不到光，反射光仍在 r 方向）；或误以为要折转的是<b>镜面</b>。</p>' +
          '<p><b>结论：</b>展平 F → 反射光斑重现；折转 F → 反射光断——三线共面。</p>',
        apply: function (s) { reset(s); s.on = true; s._protT = 1; },
        controls: [
          { type: 'btn', label: '折转光屏（反射光断）', onClick: function (s) { s._foldT = FOLD_MAX; } },
          { type: 'btn', label: '展平光屏（反射光续）', onClick: function (s) { s._foldT = 0; } }
        ],
        cam: { tx: 4, ty: 12, tz: 2, dist: 38, yaw: -.2, pitch: .4 } },
      { name: '结论', title: '归纳光的反射定律',
        ask: '表述反射定律时，为什么必须说“反射角等于入射角”？',
        body: '<p><b>反射定律：</b>① 三线<b>共面</b>；② 反射光线、入射光线分居<b>法线两侧</b>；' +
          '③ <b>反射角 = 入射角</b>（∠r = ∠i，由 arccos 实时算，反射角随入射角变）。' +
          '镜面反射与漫反射都遵循此定律。</p>' +
          '<p><b>反例（加按钮对照）：</b>保持入射光 d 固定，把<b>镜面转 α = ' + ALPHA_DEG + '°</b>，' +
          '法线 n 随之转 α；由 r = d − 2(d·n)n 实时算得反射方向相对基准偏转 ' +
          '<b>Δ = arccos(r·r₀) = ' + opticsCore(I0, ALPHA_DEG).turnDeg.toFixed(0) + '° = 2α</b>，' +
          '同时 ∠i 由 ' + I0 + '° 变为 ' + opticsCore(I0, ALPHA_DEG).iDeg.toFixed(0) + '°。' +
          '学生最易错判为「反射光也只转 α」——按下方「镜面转 +' + ALPHA_DEG + '° / 复位」对照，' +
          'α、∠i、∠r 与反射光转角读数随之实时改变。</p>' +
          '<p><b>边界 / 假设：</b>入射光方向固定、镜面绕与入射面垂直的轴转、几何光学；' +
          '2α 结论由矢量公式与 arccos 算出，非硬编码。<b>易错：</b>说成「入射角 = 反射角」（因果颠倒）、' +
          '把法线当真实光线、把镜面转动与纸板折转混为一谈。</p>',
        apply: function (s) { reset(s); s.on = true; s._protT = 1; s._alphaT = ALPHA_DEG; s.judged = true; },
        controls: [
          { type: 'btn', label: '镜面转 +' + ALPHA_DEG + '°（反射光转 2α）', onClick: function (s) { s._alphaT = ALPHA_DEG; s.on = true; } },
          { type: 'btn', label: '复位镜面（α=0）', onClick: function (s) { s._alphaT = 0; } },
          { type: 'btn', label: '判定 ∠r=∠i', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: -2, ty: 16, tz: 0, dist: 52, yaw: .2, pitch: .42 } }
    ],
    quiz: function () {
      var bank = [
        { q: '光的反射定律核心是？', opts: ['∠r=∠i', '∠r>∠i', '∠r<∠i', '任意'], ans: '∠r=∠i', why: '反射角等于入射角（反射角随入射角变化）。' },
        { q: '“法线”是？', opts: ['假想线', '真实光线', '镜面', '光源'], ans: '假想线', why: '法线是为研究方便画出的垂直线，不是真实光线。' },
        { q: '折转光屏后看不到反射光，说明？', opts: ['三线共面', '无反射', '镜面脏', '光消失'], ans: '三线共面', why: '证明入射、反射光线与法线在同一平面内。' },
        { q: '镜面转 α，反射光转？', opts: ['2α', 'α', 'α/2', '0'], ans: '2α', why: '法线转 α，反射方向由 r=d−2(d·n)n 得偏 2α。' },
        { q: '漫反射遵循反射定律吗？', opts: ['遵循', '不遵循', '部分遵循', '只有镜面反射遵循'], ans: '遵循', why: '镜面反射和漫反射都遵循光的反射定律。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
