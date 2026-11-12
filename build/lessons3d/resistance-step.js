/* 格物实验室 · 用电流表和电压表测量电阻（伏安法）（three.js 单文件课件）
   鲁教版 九年级上册 · 第十五章 欧姆定律 · 第三节 电阻的测量

   【严谨】读数由分压模型 P.model.divider(E, r, Rvar, Rx) 实时算出：
           I = E /(r + Rvar + Rx)、Ux = I·Rx、R = Ux / I；
           Rvar 由滑片位置线性映射，是模型的「输入」而非读数拟合（已删除 U=1+slider*2）。
           多组 (U,I) 分别算 R 再取平均，均值也由模型算；反例：小灯泡电阻随温度变化不能取平均。
           连续量用 _ 前缀避开 K.boot 的 0.55s 补间。
   【真实感】导线用 P.port + P.link 端点精确落在接线柱、中段自然下垂；
           电表补可见红(+)/黑(−) 接线柱；滑片位置与 Rvar 一一对应、待测电阻带支架；
           换接元件 = 真的替换 5 Ω / 10 Ω 电阻；每件器材 P.ground 接地阴影，新增几何按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；所有读数与正文数字由此推出）── */
  var E = 3.0;          // 电源电动势 V
  var r = 0.5;          // 电源内阻 Ω
  var RX_LIST = [5, 10];// 可换接的两个待测定值电阻 Ω
  var R_MIN = 0, R_MAX = 12;   // 滑动变阻器接入阻值范围 Ω
  var SAMPLES = [0.2, 0.5, 0.8];  // 三组滑片位置，用于多组 (U,I) 取平均

  /* 滑片位置 → 接入电阻 Rvar 的线性映射（模型输入）。滑片右移(s↑)接入电阻↓、U↑ */
  function rvarOf(sl) { return R_MAX - sl * (R_MAX - R_MIN); }
  function curRx(s) { return s.bigR ? RX_LIST[1] : RX_LIST[0]; }
  function dividerAt(sl, rx) { return P.model.divider(E, r, rvarOf(sl), rx); }
  /* 多组 (U,I) 各算 R=Ux/I 再取平均，均值完全由模型算，不写死 */
  function meanR(rx) {
    var sum = 0;
    for (var i = 0; i < SAMPLES.length; i++) {
      var d = dividerAt(SAMPLES[i], rx);
      sum += d.Ux / d.I;
    }
    return sum / SAMPLES.length;
  }
  var R_MEAN_5 = meanR(5), R_MEAN_10 = meanR(10);
  function sampleLine(sl, rx) {
    var d = dividerAt(sl, rx);
    return 'Rvar = ' + rvarOf(sl).toFixed(1) + ' Ω → U = ' + d.Ux.toFixed(2) +
      ' V，I = ' + d.I.toFixed(3) + ' A，R = ' + (d.Ux / d.I).toFixed(1) + ' Ω';
  }

  /* 器材接线柱「局部坐标」（交给 P.port 换算成世界坐标） */
  var BAT_X = 4, BAT_Y = 4.4;      // P.battery: (±W/2, H+.4, 0)，+ 在 +x(红)
  var SW_X = 1.6, SW_Y = 1.2;      // P.switch_: (±1.6, 1.2, 0)
  var RHEO_X = 4.5, RHEO_Y = 2.6;  // P.rheostat(len=9): (±L/2, R+1.2, 0)
  /* 柱必须落在表盘下沿：POST_Y=1.0 是表盘圆心高度，导线会横穿表盘 */
  var POST_X = 2.1, POST_Y = -2.4, POST_Z = 1.7;  // 电表可见接线柱外端（+ 在 +x）
  var RES_X = 2.6;                 // makeResistor 两端子 (±2.6, 0, 0)

  /* 连续模拟量用 _ 前缀，避开 K.boot 的 0.55s 步骤补间 */
  var st = { closed: false, tried: false, slider: 0, bigR: false, judged: false,
             _touch: 0, _U: 0, _I: 0, _R: 0, t: 0 };
  var O = {};

  /* ── 以下三个 helper 为原有实现，保持不动 ── */
  function makeResistor() {
    var g = new T.Group();
    var body = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 4, 20), cmat0(0xd9b34a, .6, .2));
    body.rotation.z = Math.PI / 2; g.add(body);
    [-1, 1].forEach(function (s) {
      var t = new T.Mesh(new T.CylinderGeometry(.3, .3, 1.4, 10), C.MAT.metal);
      t.rotation.z = Math.PI / 2; t.position.x = s * 2.6; g.add(t);
    });
    var tex = canvasTex0(128, 64, function (x) {
      x.fillStyle = '#d9b34a'; x.fillRect(0, 0, 128, 64);
      x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 40px "Microsoft YaHei",sans-serif'; x.fillText('R', 64, 32);
    });
    var lab = new T.Mesh(new T.PlaneGeometry(2.4, 1.2), new T.MeshBasicMaterial({ map: tex }));
    lab.position.set(0, 0, 1.21); g.add(lab);
    /* 两端金属引线（在端子外侧，不覆盖 RES_X=±2.6 接线点） */
    [-1, 1].forEach(function (s) {
      var lead = new T.Mesh(new T.CylinderGeometry(.11, .11, 1.6, 8), C.MAT.metal);
      lead.rotation.z = Math.PI / 2; lead.position.x = s * 3.9; g.add(lead);
    });
    /* 3 道色环：绕圆柱的细环，读出「色环电阻」而非电池 */
    var bandMat = [0x6b3f1d, 0xc0392b, 0xd9861a].map(function (c) {
      return new T.MeshStandardMaterial({ color: c, roughness: .55, metalness: .1 });
    });
    [-1.25, -.55, .15].forEach(function (x, i) {
      var band = new T.Mesh(new T.TorusGeometry(1.22, .12, 8, 20), bandMat[i]);
      band.rotation.y = Math.PI / 2; band.position.x = x; g.add(band);
    });
    return g;
  }
  function cmat0(c, r, m) { return new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m }); }
  function canvasTex0(w, h, d) { var c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')); var t = new T.CanvasTexture(c); t.anisotropy = 4; return t; }

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
  /* 待测电阻支架：底板 + 两立柱，把电阻架在台面之上，消除悬空 */
  function resistorStand() {
    var g = new T.Group();
    var base = new T.Mesh(new T.BoxGeometry(6, .4, 2.4), P.MAT.steelD);
    base.position.y = .2; g.add(base);
    [-2.2, 2.2].forEach(function (x) {
      var p = new T.Mesh(new T.CylinderGeometry(.28, .34, 1.2, 12), P.MAT.steel);
      p.position.set(x, .8, 0); g.add(p);
    });
    return g;
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
      cell.rotation.z = Math.PI / 2; cell.position.set(s * 1.5, BH + .6, 0); bat.add(cell);
      var cap = new T.Mesh(new T.CylinderGeometry(.26, .26, .3, 12), P.MAT.brass);
      cap.rotation.z = Math.PI / 2; cap.position.set(s * 1.5 + 1.32, BH + .6, 0); bat.add(cap);
      var ring = new T.Mesh(new T.TorusGeometry(.78, .15, 8, 16), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.set(s * BW / 2, BH + .08, 0); bat.add(ring);
    });
  }
  function W(a, b, color, sag) {
    var g = new T.Group();
    g.add(P.link(a, b, { color: color, sag: sag === undefined ? .9 : sag }));
    /* 每条导线两端补一个金属接头环，端点坐标不变 */
    [a, b].forEach(function (p) {
      var v = p instanceof T.Vector3 ? p : new T.Vector3(p[0], p[1], p[2]);
      var ring = new T.Mesh(new T.TorusGeometry(.28, .09, 6, 12), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.copy(v); g.add(ring);
    });
    return g;
  }
  function isOn(s) { return (s.closed && s.tried) || s._touch > 0; }

  /* 唯一真源：分压模型 divider(E, r, Rvar, Rx) */
  function solve(s) {
    var rx = curRx(s), rv = rvarOf(s.slider);
    if (!isOn(s)) return { U: 0, I: 0, R: 0, Rx: rx, Rvar: rv, on: false };
    var d = P.model.divider(E, r, rv, rx);
    return { U: d.Ux, I: d.I, R: d.Ux / d.I, Rx: rx, Rvar: rv, on: true };
  }

  /* 伏安法接线：电源—开关—滑变—电流表—待测电阻串联，电压表并联在待测电阻两端 */
  function wires() {
    var g = new T.Group(), red = 0xb01818, blk = 0x222222, blu = 0x1f6f8b;
    g.add(W(P.port(O.bat, BAT_X, BAT_Y, 0), P.port(O.sw, -SW_X, SW_Y, 0), red));            // 电源+ → 开关
    g.add(W(P.port(O.sw, SW_X, SW_Y, 0), P.port(O.rheo, -RHEO_X, RHEO_Y, 0), red));        // 开关 → 滑变
    g.add(W(P.port(O.rheo, RHEO_X, RHEO_Y, 0), P.port(O.am, POST_X, POST_Y, POST_Z), red)); // 滑变 → 电流表+
    g.add(W(P.port(O.am, -POST_X, POST_Y, POST_Z), P.port(O.R5, -RES_X, 0, 0), red));       // 电流表− → 待测电阻(高电势端)
    g.add(W(P.port(O.R5, RES_X, 0, 0), P.port(O.bat, -BAT_X, BAT_Y, 0), blk, 1.2));         // 待测电阻 → 电源−（垂落回程）
    g.add(W(P.port(O.vm, POST_X, POST_Y, POST_Z), P.port(O.R5, -RES_X, 0, 0), blu));       // 电压表+ 并联高电势端
    g.add(W(P.port(O.vm, -POST_X, POST_Y, POST_Z), P.port(O.R5, RES_X, 0, 0), blu, 1.2));  // 电压表− 并联低电势端
    return g;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(60, 24);

      /* 整组器材统一左移 2.5：正面机位定值电阻原被右侧面板压住；
         P.port 端点按物体世界坐标换算，故导线仍精确落柱（勿只移一半）。 */
      var bat = P.battery({ w: 8 }); bat.position.set(-17.5, 0, 0); K.scene().add(bat); O.bat = bat;
      dressBattery(bat);
      var sw = P.switch_(); sw.position.set(-10.5, 0, 6); K.scene().add(sw); O.sw = sw;
      var rheo = P.rheostat({ len: 9 }); rheo.position.set(-2.5, 0, 6); K.scene().add(rheo); O.rheo = rheo;
      var am = P.ammeter({ max: 0.6 }); am.position.set(5.5, 3, 6); K.scene().add(am); O.am = am; meterPosts(am);
      var vm = P.voltmeter({ max: 3 }); vm.position.set(1.5, 3, -6); K.scene().add(vm); O.vm = vm; meterPosts(vm);

      /* 两个可换接的定值电阻：同位置、同接线柱，切换即"换接元件" */
      var R5 = makeResistor(); R5.position.set(10.5, 1.4, 0); K.scene().add(R5); O.R5 = R5;
      var R10 = makeResistor(); R10.position.set(10.5, 1.4, 0); K.scene().add(R10); O.R10 = R10;
      R10.children[0].material = cmat0(0x7f9fb5, .6, .3);   // 换接后颜色区分（10 Ω 蓝灰）
      R10.visible = false;
      var stand = resistorStand(); stand.position.set(10.5, 0, 0); K.scene().add(stand); O.stand = stand;

      O.wires = wires(); K.scene().add(O.wires);

      P.ground(-17.5, 0, 5); P.ground(-10.5, 6, 4); P.ground(-2.5, 6, 5);
      P.ground(5.5, 6, 5); P.ground(10.5, 0, 4); P.ground(1.5, -6, 5);

      K.tag(vm, '电压表', '并联在待测电阻两端，3 V 量程');
      K.tag(O.R5, '待测电阻 R', '定值电阻，可换接 5 Ω / 10 Ω');
      K.tag(rheo, '滑动变阻器', '保护电路 + 改变待测电压；滑片位置对应 Rvar');
      K.tag(am, '电流表', '串联，0.6 A 量程');
      K.tag(bat, '电源', 'E = 3 V、内阻 r = 0.5 Ω');
      O.ready = true;
    },
    update: function (dt, s) {
      s.t += dt;
      if (s._touch > 0) s._touch = Math.max(0, s._touch - dt);
      var q = solve(s);
      /* 表针阻尼：一阶跟随，换量程/切步骤不再瞬间跳 */
      s._U += (q.U - s._U) * Math.min(1, dt * 12);
      s._I += (q.I - s._I) * Math.min(1, dt * 12);
      s._R = q.R;

      O.am.userData.setValue(s._I);           // 电流表读数由模型实时给出（经阻尼）
      O.vm.userData.setValue(s._U);           // 电压表读数由模型实时给出（经阻尼）
      O.sw.userData.setClosed(isOn(s));
      O.rheo.userData.setSlider(s.slider);    // 滑片真实移动，与 Rvar 一一对应

      /* 换接元件：真替换待测电阻（5 Ω / 10 Ω），两组交叉淡入淡出 */
      K.fadeShow(O.R5, !s.bigR, dt, 8);
      K.fadeShow(O.R10, !!s.bigR, dt, 8);
    }
  };

  function reset(s) {
    s.closed = false; s.tried = false; s.slider = 0; s.bigR = false; s.judged = false;
    s._touch = 0; s._U = 0; s._I = 0; s._R = 0;
  }

  K.boot({
    title: '用电流表和电压表测量电阻',
    chip: '物理 · 鲁教版 · 九上 · 第十五章 欧姆定律 · 第三节 电阻的测量',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 13, dist: 56, tx: -1, tz: 0, yaw: .2, pitch: .3 },
    reads: [['U', '电压 U'], ['I', '电流 I'], ['R', '电阻 R'], ['rvar', '滑变 Rvar'], ['mean', '多组平均 R̄']],
    values: function (s) {
      var q = solve(s), rbar = meanR(curRx(s));
      return {
        U: q.on ? q.U.toFixed(2) + ' V' : '0 V',
        I: q.on ? q.I.toFixed(3) + ' A' : '0 A',
        R: s.judged ? (rbar.toFixed(1) + ' Ω（平均）') : (q.on ? q.R.toFixed(1) + ' Ω' : '—'),
        rvar: rvarOf(s.slider).toFixed(1) + ' Ω',
        mean: rbar.toFixed(1) + ' Ω'
      };
    },
    steps: [
      { name: '连线', title: '按电路图连接（伏安法）',
        ask: '滑动变阻器在连入电路前，滑片应放在什么位置？',
        body: '<p><b>电路：</b>电源—开关—滑动变阻器—待测电阻<b>串联</b>；电压表<b>并联</b>在待测电阻两端，电流表<b>串联</b>。</p>' +
          '<p><b>参数（唯一真源）：</b>E = ' + E + ' V、内阻 r = ' + r + ' Ω、待测电阻 Rx = ' + RX_LIST[0] + ' Ω（可换接 ' + RX_LIST[1] + ' Ω）、滑变接入范围 Rvar ∈ [' + R_MIN + ', ' + R_MAX + '] Ω。</p>' +
          '<p><b>模型：</b>由分压 <b>P.model.divider(E, r, Rvar, Rx)</b> 得 <b>I = E /(r + Rvar + Rx)</b>、<b>Ux = I·Rx</b>、<b>R = Ux / I</b>；Rvar 由滑片位置线性映射（是模型<b>输入</b>，不是读数拟合）。</p>' +
          '<p><b>边界/假设：</b>电压表分流、电流表内阻、导线电阻均忽略，待测电阻按定值处理；滑片置<b>阻值最大处</b>（' + R_MAX + ' Ω，保护电路），对应本模型 slider = 0。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 0, ty: 14, tz: 0, dist: 56, yaw: .2, pitch: .36 } },
      { name: '试触', title: '闭合试触，确认接线与量程',
        ask: '若电流表指针反偏，可能是什么原因？',
        body: '<p><b>操作：</b>闭合开关<b>试触</b>（开关瞬时闭合又弹开），确认接线无误、不超量程，再正式测量。</p>' +
          '<p><b>原理：</b>欧姆定律 <b>R = U / I</b>，其中 U、I 都由 divider 模型实时给出；改变滑片（即改变 Rvar）可得多组 (U, I)，分别算 R 再取平均更可靠。</p>' +
          '<p><b>反例/易错点：</b>若「+」「−」接反，电流表会反偏打弯；接线后须先试触，不能一上来就长时间通电。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '试触（开关快合快弹）', onClick: function (s) { s._touch = 0.6; s.tried = true; } }],
        cam: { tx: 2, ty: 11, tz: 2, dist: 42, yaw: .2, pitch: .34 } },
      { name: '调节测量', title: '调节滑变，记录多组数据',
        ask: '为什么定值电阻要取多次测量的平均值？',
        body: '<p><b>操作：</b>调节滑动变阻器（滑片真实移动 → Rvar 线性变化）改变待测电压，记录多组 U、I，分别算 R 再取平均。以下三组均由 divider 模型实时算出（接入 ' + RX_LIST[0] + ' Ω 时）：</p>' +
          '<p>① ' + sampleLine(SAMPLES[0], 5) + '；<br>② ' + sampleLine(SAMPLES[1], 5) + '；<br>③ ' + sampleLine(SAMPLES[2], 5) + '。</p>' +
          '<p><b>由模型取平均：</b>R̄ = ' + R_MEAN_5.toFixed(1) + ' Ω；<b>换接 ' + RX_LIST[1] + ' Ω 电阻</b>同理得 R̄ = ' + R_MEAN_10.toFixed(1) + ' Ω（点击下方按钮真的换元件）。</p>' +
          '<p><b>边界：</b>理想线性模型下每组 R 都恰等于真值，取平均是为减小<b>实测</b>的随机误差，课件所示为不含误差的理想值。</p>',
        apply: function (s) { reset(s); s.tried = true; },
        controls: [
          { type: 'btn', label: '滑片回调：接入电阻↑，U↓', onClick: function (s) { s.closed = true; s.tried = true; s.slider = Math.max(0, s.slider - 0.3); } },
          { type: 'btn', label: '滑片前推：接入电阻↓，U↑', onClick: function (s) { s.closed = true; s.tried = true; s.slider = Math.min(1, s.slider + 0.3); } },
          { type: 'btn', label: '换接 10 Ω 电阻（换电阻）', onClick: function (s) { s.bigR = true; s.closed = true; s.tried = true; } },
          { type: 'btn', label: '换回 5 Ω 电阻', onClick: function (s) { s.bigR = false; } }
        ],
        cam: { tx: 4, ty: 11, tz: 2, dist: 40, yaw: .2, pitch: .34 } },
      { name: '结论', title: '计算电阻与易错点',
        ask: '若测的是小灯泡电阻，能否也取平均值？',
        body: '<p><b>结论：</b>定值电阻取多次测量的<b>平均值</b>减小误差；接入 ' + RX_LIST[0] + ' Ω 时 R̄ = <b>' + R_MEAN_5.toFixed(1) + ' Ω</b>，接入 ' + RX_LIST[1] + ' Ω 时 R̄ = <b>' + R_MEAN_10.toFixed(1) + ' Ω</b>（均由模型多组算出）。</p>' +
          '<p><b>反例（重点）：</b>若把待测元件换成<b>小灯泡</b>，灯丝电阻随温度升高而<b>增大</b>：电压越高、灯丝越热、R 越大，各次测得的 R 本就<b>不相等</b>，取平均值没有物理意义，只能用来研究电阻随温度的变化规律。</p>' +
          '<p><b>边界：</b>本课件测的是定值电阻（欧姆定律适用、R 近似不变）；未计温度系数、电表精度、接触电阻等。</p>',
        apply: function (s) { reset(s); s.closed = true; s.tried = true; s.slider = 0.5; s.judged = true; },
        controls: [{ type: 'btn', label: '判定 R̄（多组平均）', onClick: function (s) { s.judged = true; } }],
        cam: { tx: 0, ty: 13, tz: 0, dist: 52, yaw: .2, pitch: .32 } }
    ],
    quiz: function () {
      var bank = [
        { q: '伏安法测电阻依据公式？', opts: ['R=U/I', 'R=UI', 'R=I/U', 'R=U+I'], ans: 'R=U/I', why: '由欧姆定律 R = U / I 算出电阻。' },
        { q: '本课件电流 I 由哪个模型算？', opts: ['I=E/(r+Rvar+Rx)', 'I=U·R', 'I=E·R', '拟合曲线'], ans: 'I=E/(r+Rvar+Rx)', why: '由 divider 模型 I = E /(r + Rvar + Rx) 实时算出。' },
        { q: '连入电路前滑片应置于？', opts: ['阻值最大处', '阻值最小处', '中间', '任意'], ans: '阻值最大处', why: '置于最大阻值处可保护电路，防电流过大。' },
        { q: '小灯泡电阻能否取平均？', opts: ['不能（随温度变）', '能', '随便', '必须'], ans: '不能（随温度变）', why: '灯丝电阻随温度升高而增大，取平均无意义。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
