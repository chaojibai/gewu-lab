/* 格物实验室 · 用电流表测量电流（three.js 单文件课件）
   鲁教版 九年级上册 · 第十四章 电流 电压 电阻 · 第一节 电流

   【严谨】闭合电路欧姆定律 I = E /(r + R灯)，读数全部由 P.model.series 实时算出，
           无拟合映射、无硬编码结果；反例用 P.model.parallel 算「误把电流表并联到
           灯泡两端」的近似短路（电流表内阻 R_A 极小）。连续量用 _ 前缀避开补间。
   【真实感】导线用 P.port + P.link，端点精确落在接线柱、中段自然下垂；
           电表在机身正面补一对可见红(+)/黑(−) 接线柱（assets 原柱在台面下）；
           灯泡亮度由功率 I²R 驱动；试触 = 开关瞬时闭合又弹开；
           每件器材 P.ground 接地阴影，新增几何按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；所有读数与正文数字由此推出）── */
  var E = 3.0;          // 电源电动势 V
  var r = 0.2;          // 电源内阻 Ω
  var R_LAMP = 10;      // 小灯泡电阻 Ω（假设为定值，忽略灯丝温度影响）
  var R_A = 0.05;       // 电流表内阻 Ω（极小）
  var SER = P.model.series(E, r, [R_LAMP]);          // 正常串联解
  var PAR = P.model.parallel(E, r, [R_LAMP, R_A]);   // 误并联（近似短路）解
  var I_N = SER.I;                 // 正常串联电流 ≈ 0.294 A
  var U_LAMP = SER.drops[0];       // 灯泡两端电压 ≈ 2.94 V
  var I_SHORT = PAR.branches[1];   // 短路时流过电流表的电流 ≈ 11.96 A
  var I_LAMP_SC = PAR.branches[0]; // 短路时灯泡电流 ≈ 0.06 A
  var U_SC = PAR.U;                // 短路时灯泡两端电压 ≈ 0.60 V
  var RANGE = 0.6, DIV = 0.02;     // 选定量程 A 与分度值 A

  /* 器材接线柱的「局部坐标」（交给 P.port 换算成世界坐标） */
  var BAT_X = 4, BAT_Y = 4.4;      // P.battery: (±W/2, H+.4, 0)，W=8,H=4；+ 在 +x(红)
  var SW_X = 1.6, SW_Y = 1.2;      // P.switch_: (±1.6, 1.2, 0)
  var LB_X = 1.8, LB_Y = 1.4;      // P.bulb: 底座两侧 (±1.8, 1.4, 0)
  /* 接线柱必须在表盘下沿（原先 POST_Y=1.0 落在表盘中心高度，导线从柱到柱
     正好横穿表盘）。改到机身下沿，柱短、带塑料帽，线从下方绕。 */
  var POST_X = 2.1, POST_Y = -2.4, POST_Z = 1.7;  // 电表可见接线柱外端（+ 在 +x）

  /* 连续模拟量用 _ 前缀，避开 K.boot 的 0.55s 步骤补间 */
  var st = { closed: false, tried: false, wrong: false, judged: false,
             _touch: 0, _I: 0, _Ilamp: 0, _lit: 0, t: 0 };
  var O = {};

  /* 电表接线柱：短黄铜柱 + 红/黑塑料帽，落在机身下沿（表盘下方），
     导线从柱端向下方走，不再横穿表盘 */
  function meterPosts(m) {
    [-1, 1].forEach(function (s) {
      var brass = new T.MeshStandardMaterial({ color: 0xb08c46, roughness: .32, metalness: .9, envMapIntensity: 1.25 });
      var post = new T.Mesh(new T.CylinderGeometry(.19, .19, .7, 14), brass);
      post.rotation.x = Math.PI / 2;
      post.position.set(s * POST_X, POST_Y, POST_Z - .35);
      m.add(post);
      var cap = new T.Mesh(new T.CylinderGeometry(.29, .27, .2, 14),
        s > 0 ? P.MAT.red : P.MAT.dark);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(s * POST_X, POST_Y, POST_Z - .02);
      m.add(cap);
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
      /* 电池嵌进顶面凹槽（原来整根躺在顶面，像两根黑管） */
      var cell = new T.Mesh(new T.CylinderGeometry(.58, .58, 2.4, 16), cellMat);
      cell.rotation.z = Math.PI / 2; cell.position.set(s * 1.5, BH + .24, 0); bat.add(cell);
      var label = new T.Mesh(new T.CylinderGeometry(.59, .59, .95, 16),
        new T.MeshStandardMaterial({ color: 0xd9d3c4, roughness: .82, metalness: .05 }));
      label.rotation.z = Math.PI / 2; label.position.set(s * 1.5, BH + .24, 0); bat.add(label);
      var cap = new T.Mesh(new T.CylinderGeometry(.24, .24, .26, 12), P.MAT.brass);
      cap.rotation.z = Math.PI / 2; cap.position.set(s * 1.5 + 1.3, BH + .24, 0); bat.add(cap);
      var ring = new T.Mesh(new T.TorusGeometry(.72, .12, 8, 16), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.set(s * BW / 2, BH + .06, 0); bat.add(ring);
    });
  }

  function W(a, b, color, sag) {
    /* 线径收到 .13：原来 .17 在近景里像塑料棒。端点已有柱帽，
       不再套金属接头环（和柱帽叠成一坨）。 */
    /* sag 从 .9 收到 .45：电表柱已落到机身下沿（世界 y≈0.6），
       下垂 .9 会让线垂到台面以下、从桌子里穿过去，看起来「断成两截」 */
    return P.link(a, b, { color: color, sag: sag === undefined ? .45 : sag, r: .13 });
  }

  /* 电路是否通电：正式闭合，或「试触」期间的瞬时闭合 */
  function isOn(s) { return (s.closed && s.tried) || s._touch > 0; }

  /* 唯一真源：由电路模型实时解出电流、灯泡电流等 */
  function solve(s) {
    if (!isOn(s)) return { I: 0, Ilamp: 0, U: 0, short: false, on: false };
    if (s.wrong) {
      /* 电流表误并联在灯泡两端：灯泡 ∥ 电流表内阻，再与电源内阻串联 */
      return { I: PAR.branches[1], Ilamp: PAR.branches[0], U: PAR.U, short: true, on: true };
    }
    /* 正确接法：理想电流表内阻忽略，串联回路 I = E /(r + R灯) */
    return { I: SER.I, Ilamp: SER.I, U: SER.drops[0], short: false, on: true };
  }

  /* 两组导线对应两种接线方式（点击「改接」按钮时切换，是真实的重新接线） */
  function wiresSeries() {
    var g = new T.Group(), red = 0x941c1c, blk = 0x1c1c1c;
    g.add(W(P.port(O.bat, BAT_X, BAT_Y, 0), P.port(O.sw, -SW_X, SW_Y, 0), red));          // 电源+ → 开关
    g.add(W(P.port(O.sw, SW_X, SW_Y, 0), P.port(O.am, POST_X, POST_Y, POST_Z), red));     // 开关 → 电流表+
    g.add(W(P.port(O.am, -POST_X, POST_Y, POST_Z), P.port(O.bulb, LB_X, LB_Y, 0), red));  // 电流表− → 灯泡
    g.add(W(P.port(O.bulb, -LB_X, LB_Y, 0), P.port(O.bat, -BAT_X, BAT_Y, 0), blk, 1.2));  // 灯泡 → 电源−（垂落回程）
    return g;
  }
  function wiresWrong() {
    var g = new T.Group(), red = 0x941c1c, blk = 0x1c1c1c, blu = 0x1f6f8b;
    g.add(W(P.port(O.bat, BAT_X, BAT_Y, 0), P.port(O.sw, -SW_X, SW_Y, 0), red));          // 主回路：电源+ → 开关
    g.add(W(P.port(O.sw, SW_X, SW_Y, 0), P.port(O.bulb, LB_X, LB_Y, 0), red));           // 开关 → 灯泡（灯泡仍在主回路）
    g.add(W(P.port(O.bulb, -LB_X, LB_Y, 0), P.port(O.bat, -BAT_X, BAT_Y, 0), blk, 1.2));  // 灯泡 → 电源−
    g.add(W(P.port(O.am, POST_X, POST_Y, POST_Z), P.port(O.bulb, LB_X, LB_Y, 0), blu));   // 电流表+ 误并到灯泡高电势端
    g.add(W(P.port(O.am, -POST_X, POST_Y, POST_Z), P.port(O.bulb, -LB_X, LB_Y, 0), blu)); // 电流表− 误并到灯泡低电势端
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

      var bat = P.battery({ w: 8 }); bat.position.set(-13, 0, 0); K.scene().add(bat); O.bat = bat;
      dressBattery(bat);
      /* 开关的全部细节（底座脚垫/黄铜柱/红黑帽/转轴/刀口夹）已在共享库里 */
      var sw = P.switch_(); sw.position.set(-5, 0, 6); K.scene().add(sw); O.sw = sw;
      var am = P.ammeter({ max: RANGE }); am.position.set(3, 3, 6); K.scene().add(am); O.am = am;
      meterPosts(am);                       // 机身下部的原柱在台面下，补可见 +/− 柱
      var bulb = P.bulb(); bulb.position.set(11, 0, 0); K.scene().add(bulb); O.bulb = bulb;

      /* 导线端点全部由 P.port 落在接线柱上，P.link 中段自然下垂 */
      O.wiresS = wiresSeries(); K.scene().add(O.wiresS);
      O.wiresW = wiresWrong(); K.scene().add(O.wiresW); O.wiresW.visible = false;

      /* 每件落地器材一个深色接地阴影 */
      P.ground(-13, 0, 5); P.ground(-5, 6, 4); P.ground(3, 6, 5); P.ground(11, 0, 4);

      K.tag(am, '电流表', '串联接入，0.6 A 量程，红柱 + / 黑柱 −');
      K.tag(bulb, '灯泡', '用电器；亮度由功率 I²R 驱动');
      K.tag(bat, '电源', 'E = 3 V、内阻 r = 0.2 Ω');
      K.tag(sw, '开关', '试触时快合快弹');
      O.ready = true;
    },
    update: function (dt, s) {
      s.t += dt;
      if (s._touch > 0) s._touch = Math.max(0, s._touch - dt);   // 试触瞬时闭合倒计时
      var q = solve(s);
      /* 表针阻尼 + 灯丝热惯性：目标值一阶跟随，切步骤/合开关不再瞬间跳 */
      s._I += (q.I - s._I) * Math.min(1, dt * 12);
      s._Ilamp += (q.Ilamp - s._Ilamp) * Math.min(1, dt * 12);

      O.am.userData.setValue(s._I);           // 指针读数由模型实时给出（经阻尼）
      O.sw.userData.setClosed(isOn(s));       // 开关（含试触）真实开合

      /* 灯泡亮度 ∝ 实际功率 I灯²R灯，相对正常串联功率归一化 */
      var lit = Math.max(0, Math.min(1, Math.pow(q.Ilamp / I_N, 2)));
      s._lit += (lit - s._lit) * Math.min(1, dt * 9);
      O.bulb.userData.fil.material.emissiveIntensity = 2.2 * s._lit;
      O.bulb.userData.glow.intensity = 1.6 * s._lit;

      /* 改接导线：两组导线淡入淡出，不再瞬间换一整套 */
      K.fadeShow(O.wiresS, !s.wrong, dt, 9);
      K.fadeShow(O.wiresW, !!s.wrong, dt, 9);
    }
  };

  function reset(s) {
    s.closed = false; s.tried = false; s.wrong = false; s.judged = false;
    s._touch = 0; s._I = 0; s._Ilamp = 0; s._lit = 0;
  }

  K.boot({
    title: '用电流表测量电流',
    chip: '物理 · 鲁教版 · 九上 · 第十四章 电流 电压 电阻 · 第一节 电流',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 13, dist: 52, tx: -1, tz: 0, yaw: .2, pitch: .3 },
    reads: [['state', '状态'], ['current', '电流 I'], ['warn', '警告'], ['judge', '结论']],
    values: function (s) {
      var q = solve(s);
      return {
        state: !q.on ? '断开' : (s.wrong ? '误并联（近似短路）' : (s._touch > 0 ? '试触中' : '接通')),
        current: q.on ? q.I.toFixed(2) + ' A' : '0 A',
        warn: s.wrong ? '近似短路！电流表打满，切勿这样接' : '—',
        judge: s.judged ? '电流表须串联，“+进−出”' : '—'
      };
    },
    steps: [
      { name: '看表', title: '认识电流表：量程与接线柱',
        ask: '电流表的两个量程与对应分度值分别是多少？',
        body: '<p><b>符号与量程：</b>○A。两个量程 <b>0～0.6 A（分度值 0.02 A）</b>、<b>0～3 A（分度值 0.1 A）</b>；本实验选 <b>0.6 A</b> 量程。</p>' +
          '<p><b>接线柱：</b>电流必须<b>「+」进「−」出</b>（红柱 + / 黑柱 −）；绝不可不经用电器直接接电源两极。</p>' +
          '<p><b>电路参数（唯一真源）：</b>电动势 E = ' + E + ' V、内阻 r = ' + r + ' Ω、灯泡电阻 R灯 = ' + R_LAMP + ' Ω。' +
          '假设灯泡电阻为定值、忽略灯丝温度影响，电流表内阻 R_A≈0（理想）。</p>' +
          '<p><b>模型：</b>闭合后由闭合电路欧姆定律 <b>I = E /(r + R灯) = ' + E + '/(' + r + ' + ' + R_LAMP + ') ≈ ' + I_N.toFixed(2) + ' A</b>；右侧读数每帧由此式实时算出，不是写死。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 3, ty: 10, tz: 6, dist: 30, yaw: -.2, pitch: .34 } },
      { name: '串联+试触', title: '串联接入，先试触选量程',
        ask: '为什么接线时必须先用大量程“试触”？',
        body: '<p><b>操作：</b>电流表必须<b>串联</b>入电路；连接时开关断开；电流「+」进「−」出。规范要求先用 <b>3 A 大量程瞬时试触</b>（点下方按钮，开关快合快弹），确认指针不打满后再换 0.6 A 小量程；场景中电流表已是换用的 0.6 A 表。</p>' +
          '<p><b>试触判据（由模型算）：</b>I ≈ <b>' + I_N.toFixed(2) + ' A</b> &lt; 0.6 A，指针只偏到满刻度约 ' + Math.round(I_N / RANGE * 100) + '%，故可安全换用小量程读数。</p>' +
          '<p><b>边界：</b>若未知电流大小，绝不可直接用小量程；此为理想电流表（R_A≈0）结论，未计电源过载。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '试触（开关快合快弹）', onClick: function (s) { s._touch = 0.6; s.tried = true; } }],
        cam: { tx: -1, ty: 12, tz: 1, dist: 40, yaw: .2, pitch: .32 } },
      { name: '读数', title: '闭合开关，读取电流',
        ask: '读数时视线应注意什么？',
        body: '<p><b>操作：</b>闭合开关，待指针稳定后<b>平视</b>读数。电流由 <b>I = E /(r + R灯) ≈ ' + I_N.toFixed(2) + ' A</b> 实时给出，灯泡两端电压 U灯 = I·R灯 ≈ ' + U_LAMP.toFixed(2) + ' V。</p>' +
          '<p><b>读数：</b>0.6 A 量程分度值 ' + DIV + ' A，' + I_N.toFixed(2) + ' A 约在第 ' + Math.round(I_N / DIV) + ' 小格；串联电路中 <b>I = I₁ = I₂</b>（各处相等）。</p>' +
          '<p><b>误差/边界：</b>此读数是理想模型值；实测还受电源内阻波动、灯丝电阻随温度变化、电表精度影响，故要多次测量。</p>',
        apply: function (s) { reset(s); s.tried = true; },
        controls: [{ type: 'btn', label: '闭合开关', onClick: function (s) { s.closed = true; s.tried = true; } }],
        cam: { tx: -1, ty: 11, tz: 2, dist: 36, yaw: .2, pitch: .34 } },
      { name: '注意', title: '红线与易错点',
        ask: '电流表为什么绝对不能并联在灯泡两端？',
        body: '<p><b>红线：</b>① 必须<b>串联</b>；② 「+」「−」接反会反偏打弯；③ 先试触再换小量程。</p>' +
          '<p><b>反例（点击下方按钮模拟）：</b>若误把电流表<b>并联</b>到灯泡两端，因内阻极小（R_A = ' + R_A + ' Ω），等效为「灯泡 ∥ R_A」再与电源内阻串联：' +
          '由并联模型 P.model.parallel(E, r, [R灯, R_A]) 得流过电流表的电流 <b>I_A ≈ ' + I_SHORT.toFixed(1) + ' A ≫ 3 A</b>，指针<b>打满</b>、近似短路，会烧表；此时灯泡两端电压仅 ' + U_SC.toFixed(2) + ' V、电流 ' + I_LAMP_SC.toFixed(2) + ' A，灯几乎不亮。</p>' +
          '<p><b>边界：</b>本课件只给警告并让指针打满，<b>不真烧模型</b>；模型把灯泡按定值处理，未计灯丝熔断、电源过载等非理想效应。</p>',
        apply: function (s) { reset(s); s.closed = true; s.tried = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '模拟：误把电流表并联到灯泡两端', onClick: function (s) { s.wrong = true; s.closed = true; s.tried = true; } },
          { type: 'btn', label: '恢复正确串联接法', onClick: function (s) { s.wrong = false; } }
        ],
        cam: { tx: -1, ty: 13, tz: 0, dist: 50, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '电流表必须怎样接入电路？', opts: ['串联', '并联', '随便', '接地'], ans: '串联', why: '电流表内阻极小，必须串联在被测电路中。' },
        { q: '电流方向应是？', opts: ['+进−出', '−进+出', '任意', '不经过'], ans: '+进−出', why: '电流须从“+”接线柱流入、“−”接线柱流出，否则反偏。' },
        { q: '接线时为什么要先试触？', opts: ['防超量程打表', '好看', '省力', '不用'], ans: '防超量程打表', why: '先用大量程试触，确认不超量程再换小量程。' },
        { q: '本电路由 I=E/(r+R灯) 算出的电流约为？', opts: ['0.29 A', '3 A', '10 A', '0.02 A'], ans: '0.29 A', why: 'E=3 V，r+R灯=10.2 Ω，I≈0.294 A。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
