/* 格物实验室 · 用电压表测量电压（three.js 单文件课件）
   鲁教版 九年级上册 · 第十四章 电流 电压 电阻 · 第三节 电压

   【严谨】闭合电路欧姆定律 I = E /(r + R灯)，被测电压 U = I·R灯 = series(...).drops[0]
           全部由模型实时算出，不写死；反例「电压表串联」用 series(E, r, [R_V, R灯])
           算近断路电流与电压表分压 U_V≈E。连续量用 _ 前缀避开补间。
   【真实感】导线用 P.port + P.link，端点精确落在接线柱、中段自然下垂；
           电压表补一对可见红(+)/黑(−) 接线柱；并联跨接灯泡两端；
           灯泡亮度由功率 I²R 驱动；每件器材 P.ground 接地阴影，新增几何按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；所有读数与正文数字由此推出）── */
  var E = 3.0;          // 电源电动势 V
  var r = 0.2;          // 电源内阻 Ω
  var R_LAMP = 10;      // 小灯泡电阻 Ω（假设为定值，忽略灯丝温度影响）
  var R_V = 3000;       // 电压表内阻 Ω（极大）
  var SER = P.model.series(E, r, [R_LAMP]);          // 正确并联时的主回路
  var WRONG = P.model.series(E, r, [R_V, R_LAMP]);   // 电压表误串联（近断路）
  var I_N = SER.I;                 // 主回路电流 ≈ 0.294 A
  var U_N = SER.drops[0];          // 灯泡两端电压 U = I·R灯 ≈ 2.94 V
  var I_WRONG = WRONG.I;           // 误串联电流 ≈ 0.001 A
  var U_WRONG = WRONG.drops[0];    // 电压表分压 U_V ≈ 2.99 V ≈ E
  var RANGE = 3, DIV = 0.1;       // 选定量程 V 与分度值 V

  /* 器材接线柱「局部坐标」（交给 P.port 换算成世界坐标） */
  var BAT_X = 4, BAT_Y = 4.4;      // P.battery: (±W/2, H+.4, 0)，+ 在 +x(红)
  var SW_X = 1.6, SW_Y = 1.2;      // P.switch_: (±1.6, 1.2, 0)
  var LB_X = 1.8, LB_Y = 1.4;      // P.bulb: 底座两侧 (±1.8, 1.4, 0)
  /* 柱必须落在表盘下沿：POST_Y=1.0 是表盘圆心高度，导线会横穿表盘 */
  var POST_X = 2.1, POST_Y = -2.4, POST_Z = 1.7;  // 电表可见接线柱外端（+ 在 +x）

  /* 连续模拟量用 _ 前缀，避开 K.boot 的 0.55s 步骤补间 */
  var st = { closed: false, tried: false, wrong: false, judged: false,
             _touch: 0, _U: 0, _I: 0, _lit: 0, t: 0 };
  var O = {};

  function meterPosts(m) {
    [-1, 1].forEach(function (s) {
      var post = new T.Mesh(new T.CylinderGeometry(.3, .3, .9, 14),
        s > 0 ? P.MAT.red : P.MAT.dark);
      post.rotation.x = Math.PI / 2;
      post.position.set(s * POST_X, POST_Y, POST_Z - .45);
      m.add(post);
      /* 柱根绝缘套 + 外端金属接头环，让导线「接上」看得出来；POST_Z 不变 */
      var boot = new T.Mesh(new T.CylinderGeometry(.4, .4, .34, 12), P.MAT.rubber);
      boot.rotation.x = Math.PI / 2;
      boot.position.set(s * POST_X, POST_Y, POST_Z - .68); m.add(boot);
      var ring = new T.Mesh(new T.TorusGeometry(.34, .09, 6, 12), P.MAT.brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(s * POST_X, POST_Y, POST_Z + .02); m.add(ring);
    });
  }
  /* 电源盒：顶面凹槽 + 两节电池示意 + 接线柱底座环。
     原柱局部坐标 (±4, 4.4, 0) 不动，P.port 端点仍精确落柱。 */
  function dressBattery(bat) {
    var BW = 8, BH = 4, BD = 4;
    var cellMat = new T.MeshStandardMaterial({ color: 0x39434b, roughness: .55, metalness: .35 });
    var groove = new T.Mesh(new T.BoxGeometry(BW - .7, .12, BD - .7), P.MAT.dark);
    groove.position.set(0, BH + .01, 0); bat.add(groove);
    [-1, 1].forEach(function (s) {
      var cell = new T.Mesh(new T.CylinderGeometry(.6, .6, 2.4, 16), cellMat);
      cell.rotation.z = Math.PI / 2; cell.position.set(s * 1.5, BH + .02, 0); bat.add(cell);
      var cap = new T.Mesh(new T.CylinderGeometry(.26, .26, .3, 12), P.MAT.brass);
      cap.rotation.z = Math.PI / 2; cap.position.set(s * 1.5 + 1.32, BH + .02, 0); bat.add(cap);
      var ring = new T.Mesh(new T.TorusGeometry(.78, .15, 8, 16), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.set(s * BW / 2, BH + .08, 0); bat.add(ring);
    });
  }
  function W(a, b, color, sag) {
    var g = new T.Group();
    /* lay:true：导线从接线柱垂下、贴台面走、再爬上另一根柱，
       旧版是横跨整个桌面的悬空粗弧线 */
    g.add(P.link(a, b, { color: color, sag: sag === undefined ? .9 : sag,
      lay: true, floorY: .6 }));
    /* 两端接头环必须用独立材质：K.fadeShow 直接写 mat.opacity，
       共享 P.MAT.brass 会把全场黄铜件（含另一套导线）一起淡掉 */
    [a, b].forEach(function (p) {
      var v = p instanceof T.Vector3 ? p : new T.Vector3(p[0], p[1], p[2]);
      var ring = new T.Mesh(new T.TorusGeometry(.28, .09, 6, 12), P.MAT.brass.clone());
      ring.rotation.x = Math.PI / 2; ring.position.copy(v); g.add(ring);
    });
    return g;
  }
  function isOn(s) { return (s.closed && s.tried) || s._touch > 0; }

  /* 唯一真源：正常并联 U=I·R灯；误串联则电压表分得几乎全部电源电压 */
  function solve(s) {
    if (!isOn(s)) return { U: 0, I: 0, Ilamp: 0, on: false, series: false };
    if (s.wrong) {
      /* 电压表（内阻 R_V 极大）误串联：回路近断路，灯不亮，表测自身分压≈E */
      return { U: WRONG.drops[0], I: WRONG.I, Ilamp: WRONG.I, on: true, series: true };
    }
    /* 正确：电压表并联在灯泡两端，内阻极大、分流可忽略，主回路 I=E/(r+R灯) */
    return { U: SER.drops[0], I: SER.I, Ilamp: SER.I, on: true, series: false };
  }

  /* 两组导线：正确并联 / 错误串联（重新接线，端点均 P.port 精确接柱） */
  function wiresParallel() {
    var g = new T.Group(), red = 0xb01818, blk = 0x222222, blu = 0x1f6f8b;
    g.add(W(P.port(O.bat, BAT_X, BAT_Y, 0), P.port(O.sw, -SW_X, SW_Y, 0), red));          // 主回路：电源+ → 开关
    g.add(W(P.port(O.sw, SW_X, SW_Y, 0), P.port(O.bulb, LB_X, LB_Y, 0), red));           // 开关 → 灯泡高电势端
    g.add(W(P.port(O.bulb, -LB_X, LB_Y, 0), P.port(O.bat, -BAT_X, BAT_Y, 0), blk, 1.2));  // 灯泡 → 电源−（垂落回程）
    g.add(W(P.port(O.vm, POST_X, POST_Y, POST_Z), P.port(O.bulb, LB_X, LB_Y, 0), blu));   // 表+ 跨接灯泡高电势端
    g.add(W(P.port(O.vm, -POST_X, POST_Y, POST_Z), P.port(O.bulb, -LB_X, LB_Y, 0), blu)); // 表− 跨接灯泡低电势端
    return g;
  }
  function wiresSeries() {
    var g = new T.Group(), red = 0xb01818, blk = 0x222222;
    g.add(W(P.port(O.bat, BAT_X, BAT_Y, 0), P.port(O.sw, -SW_X, SW_Y, 0), red));          // 电源+ → 开关
    g.add(W(P.port(O.sw, SW_X, SW_Y, 0), P.port(O.vm, POST_X, POST_Y, POST_Z), red));     // 开关 → 电压表+（误串入）
    g.add(W(P.port(O.vm, -POST_X, POST_Y, POST_Z), P.port(O.bulb, LB_X, LB_Y, 0), red));  // 电压表− → 灯泡
    g.add(W(P.port(O.bulb, -LB_X, LB_Y, 0), P.port(O.bat, -BAT_X, BAT_Y, 0), blk, 1.2));  // 灯泡 → 电源−
    return g;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(56, 24);

      /* 整组器材统一左移 2.5：正面机位灯泡原被右侧面板压住；
         P.port 端点按物体世界坐标换算，故导线仍精确落柱（勿只移一半）。 */
      var bat = P.battery({ w: 8 }); bat.position.set(-15.5, 0, 0); K.scene().add(bat); O.bat = bat;
      dressBattery(bat);
      var sw = P.switch_(); sw.position.set(-7.5, 0, 6); K.scene().add(sw); O.sw = sw;
      var bulb = P.bulb(); bulb.position.set(6.5, 0, 0); K.scene().add(bulb); O.bulb = bulb;
      var vm = P.voltmeter({ max: RANGE }); vm.position.set(0.5, 3.2, -6); K.scene().add(vm); O.vm = vm;
      meterPosts(vm);

      O.wiresP = wiresParallel(); K.scene().add(O.wiresP);
      O.wiresS = wiresSeries(); K.scene().add(O.wiresS); O.wiresS.visible = false;

      P.ground(-15.5, 0, 5); P.ground(-7.5, 6, 4); P.ground(0.5, -6, 5); P.ground(6.5, 0, 4);

      K.tag(vm, '电压表', '并联在灯泡两端，3 V 量程，红柱 + / 黑柱 −');
      K.tag(bulb, '灯泡', '用电器；亮度由功率 I²R 驱动');
      K.tag(bat, '电源', 'E = 3 V、内阻 r = 0.2 Ω');
      K.tag(sw, '开关', '试触时快合快弹');
      O.ready = true;
    },
    update: function (dt, s) {
      s.t += dt;
      if (s._touch > 0) s._touch = Math.max(0, s._touch - dt);
      var q = solve(s);
      /* 表针阻尼 + 灯丝热惯性：一阶跟随，切步骤/合开关不再瞬间跳 */
      s._U += (q.U - s._U) * Math.min(1, dt * 12);
      s._I += (q.I - s._I) * Math.min(1, dt * 12);

      O.vm.userData.setValue(s._U);           // 指针读数由模型实时给出（经阻尼）
      O.sw.userData.setClosed(isOn(s));

      /* 灯泡亮度 ∝ I灯²R灯，相对正常电流归一化；误串联时 I≈0 → 灯不亮 */
      var lit = Math.max(0, Math.min(1, Math.pow(q.Ilamp / I_N, 2)));
      s._lit += (lit - s._lit) * Math.min(1, dt * 9);
      O.bulb.userData.fil.material.emissiveIntensity = 2.2 * s._lit;
      O.bulb.userData.glow.intensity = 1.6 * s._lit;

      /* 并联/串联两套导线交叉淡入淡出 */
      K.fadeShow(O.wiresP, !s.wrong, dt, 9);
      K.fadeShow(O.wiresS, !!s.wrong, dt, 9);
    }
  };

  function reset(s) {
    s.closed = false; s.tried = false; s.wrong = false; s.judged = false;
    s._touch = 0; s._U = 0; s._I = 0; s._lit = 0;
  }

  K.boot({
    title: '用电压表测量电压',
    chip: '物理 · 鲁教版 · 九上 · 第十四章 电流 电压 电阻 · 第三节 电压',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 13, dist: 52, tx: 2, tz: 0, yaw: .2, pitch: .3 },
    reads: [['state', '状态'], ['voltage', '电压 U'], ['lamp', '灯泡'], ['warn', '警告'], ['judge', '结论']],
    values: function (s) {
      var q = solve(s);
      return {
        state: !q.on ? '断开' : (s.wrong ? '误串联（近断路）' : (s._touch > 0 ? '试触中' : '接通')),
        voltage: q.on ? q.U.toFixed(2) + ' V' : '0 V',
        lamp: q.on ? (q.Ilamp > 0.05 ? '亮（正常）' : '不亮（近断路）') : '灭',
        warn: s.wrong ? '电压表串联→电路近断路，灯不亮' : '—',
        judge: s.judged ? '电压表须并联，“+接高电势”' : '—'
      };
    },
    steps: [
      { name: '看表', title: '认识电压表：量程与接线柱',
        ask: '电压表与电流表在接法上的根本区别是什么？',
        body: '<p><b>符号与量程：</b>○V。两个量程 <b>0～3 V（分度值 0.1 V）</b>、<b>0～15 V（分度值 0.5 V）</b>；本实验选 <b>3 V</b> 量程。</p>' +
          '<p><b>接线柱：</b>仍「+」进「−」出，但电压表必须<b>并联</b>在被测部分两端，「+」接<b>高电势</b>端（红柱 + / 黑柱 −）。</p>' +
          '<p><b>电路参数（唯一真源）：</b>E = ' + E + ' V、内阻 r = ' + r + ' Ω、灯泡电阻 R灯 = ' + R_LAMP + ' Ω、电压表内阻 R_V = ' + R_V + ' Ω（极大）。假设灯泡电阻为定值、忽略温度影响。</p>' +
          '<p><b>模型：</b>主回路电流 <b>I = E /(r + R灯) = ' + E + '/(' + r + ' + ' + R_LAMP + ') ≈ ' + I_N.toFixed(2) + ' A</b>；被测电压 <b>U = I·R灯 ≈ ' + U_N.toFixed(2) + ' V</b>（= series(...).drops[0]），每帧由模型实时算出，不是写死。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 3, ty: 10, tz: -6, dist: 30, yaw: .24, pitch: .34 } },
      { name: '并联+试触', title: '并联接入，先试触',
        ask: '电压表内阻很大，这带来什么安全优势？',
        body: '<p><b>操作：</b>电压表<b>并联</b>在灯泡两端；先用大量程<b>试触</b>选量程（点下方按钮，开关快合快弹）。</p>' +
          '<p><b>优势：</b>电压表内阻 R_V = ' + R_V + ' Ω 极大，直接接电源两极<b>不会短路</b>（与电流表相反）。</p>' +
          '<p><b>假设/边界：</b>因 R_V ≫ R灯，并联分流可忽略，故主回路仍按 I = E/(r + R灯) 计算；若 R_V 不够大，分流将使电流、电压偏离此式。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '试触（选量程）', onClick: function (s) { s._touch = 0.6; s.tried = true; } }],
        cam: { tx: 2, ty: 12, tz: 1, dist: 40, yaw: .2, pitch: .32 } },
      { name: '读数', title: '闭合开关，读取电压',
        ask: '本实验中电压表测的是谁两端的电压？',
        body: '<p><b>操作：</b>闭合开关，平视读数。电压由 <b>U = I·R灯，I = E/(r + R灯)</b> 算得 <b>U ≈ ' + U_N.toFixed(2) + ' V</b>，灯泡对应电流 I ≈ ' + I_N.toFixed(2) + ' A。</p>' +
          '<p><b>读数：</b>3 V 量程分度值 ' + DIV + ' V，' + U_N.toFixed(2) + ' V 约在第 ' + Math.round(U_N / DIV) + ' 小格；电压表测的是<b>灯泡两端</b>的电压，不是电源电压（二者数值接近，是因 r ≪ R灯）。</p>' +
          '<p><b>拓展：</b>电压是形成电流的原因；电压表也可直接并联在电源两极测路端电压。边界：模型把灯泡按定值处理。</p>',
        apply: function (s) { reset(s); s.tried = true; },
        controls: [{ type: 'btn', label: '闭合开关', onClick: function (s) { s.closed = true; s.tried = true; } }],
        cam: { tx: 2, ty: 11, tz: 2, dist: 36, yaw: .2, pitch: .34 } },
      { name: '注意', title: '红线与易错点',
        ask: '如果把电压表错接成串联，会怎样？',
        body: '<p><b>红线：</b>① 必须<b>并联</b>，不可串联；② 「+」「−」接线、试触选量程同样适用。</p>' +
          '<p><b>反例（点击下方按钮模拟）：</b>若把电压表<b>串联</b>接入，由 series(E, r, [R_V, R灯]) 得回路电流 <b>I ≈ ' + I_WRONG.toFixed(3) + ' A</b>（近断路），<b>灯不亮</b>；电压表内阻极大，分得几乎全部电压，读数 <b>U_V ≈ ' + U_WRONG.toFixed(2) + ' V ≈ E</b>。</p>' +
          '<p><b>易错点/边界：</b>并联时 U≈' + U_N.toFixed(2) + ' V、串联时 U_V≈' + U_WRONG.toFixed(2) + ' V，数值都接近 E，<b>不能只看电压读数判断接法对错</b>——必须同时看灯泡是否发光（电流）。本模型把电压表视为理想大内阻、灯泡按定值，未计电表功耗。</p>',
        apply: function (s) { reset(s); s.closed = true; s.tried = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '模拟：误把电压表串联接入', onClick: function (s) { s.wrong = true; s.closed = true; s.tried = true; } },
          { type: 'btn', label: '恢复正确并联接法', onClick: function (s) { s.wrong = false; } }
        ],
        cam: { tx: 2, ty: 13, tz: 0, dist: 50, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '电压表必须怎样接入？', opts: ['并联', '串联', '随便', '接地'], ans: '并联', why: '电压表测两端电压，必须并联在被测部分两端。' },
        { q: '电压表内阻很大，故？', opts: ['可直接接电源', '不能接电源', '会短路', '须串联'], ans: '可直接接电源', why: '内阻大，直接接电源两极不会造成短路（区别于电流表）。' },
        { q: '电压表“+”接线柱应接？', opts: ['高电势端', '低电势端', '任意', '接地'], ans: '高电势端', why: '“+”接高电势端，保证正常偏转。' },
        { q: '本电路 U=I·R灯 由模型算得约为？', opts: ['2.94 V', '15 V', '0.2 V', '30 V'], ans: '2.94 V', why: 'I≈0.294 A，R灯=10 Ω，U≈2.94 V。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
