/* 格物实验室 · 探究电流与电压、电阻的关系（three.js 单文件课件）
   鲁教版 九年级上册 · 第十五章 欧姆定律 · 第一节 电流与电压、电阻的关系

   【严谨】全电路欧姆定律 I = E/(r + Rvar + Rx)，待测电阻电压 Ux = I·Rx，
           经 P.model.divider 实时求解；无 `U = 1 + slider*2` 之类的拟合映射。
           「探究 I 与 R 关系、保持 U0 不变」不是写死 3V，而是由
           Ux = E·Rx/(r+Rvar+Rx) = U0 **反解**出所需滑变阻值 Rvar = Rx(E−U0)/U0 − r，
           换电阻后滑片自动移到该位置，Ux 才真的回到 U0。
   【真实感】三只定值电阻在 HOME 备料位，换阻时真的把物体移到工作位；
           导线用 P.port + P.link 精确接接线柱；滑片位置与 Rvar 一一对应；
           每件 P.ground 接地阴影；反例按钮演示「同时改 U 和 R」违背控制变量。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 电路模型参数（唯一真源）── */
  var E = 4.5, r = 0.2, U0 = 3.0;        // 电源电动势 / 内阻 / 目标恒定电压
  var RV_MIN = 2.5, RV_MAX = 20;         // 滑动变阻器可调范围 Ω
  var RX_LIST = [5, 10, 15];
  var RANGE_A = 0.6;                    // 电流表量程（本电路最大电流 < 0.6A）
  function rvarFromSlider(s) { return RV_MIN + (RV_MAX - RV_MIN) * (1 - s._slider); }
  function sliderFromRvar(rv) { return 1 - (rv - RV_MIN) / (RV_MAX - RV_MIN); }
  /* 反解：要使 Ux = U0，滑变应取的阻值 */
  function rvarForU0(rx) { return rx * (E - U0) / U0 - r; }

  var st = { mode: 'Urel', closed: false, wrong: false, judged: false,
             _slider: .5, _rx: 5, _t: 0, t: 0, _I: 0, _U: 0 };
  var O = {};

  var BAT_X = 4, BAT_Y = 4.4, SW_X = 1.6, SW_Y = 1.2;
  /* 柱落在表盘下沿，导线不穿表盘 */
  var POST_X = 2.1, POST_Y = -2.4, POST_Z = 1.7;
  var RED = 0xb01818, BLK = 0x222222, BLUE = 0x1f6f8b;
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
    g.add(P.link(a, b, { color: color, sag: sag === undefined ? 1.0 : sag,
      lay: true, floorY: .6 }));
    /* 端点接头环独立材质，避免共享黄铜被连带改透明度 */
    [a, b].forEach(function (p) {
      var v = p instanceof T.Vector3 ? p : new T.Vector3(p[0], p[1], p[2]);
      var ring = new T.Mesh(new T.TorusGeometry(.28, .09, 6, 12), P.MAT.brass.clone());
      ring.rotation.x = Math.PI / 2; ring.position.copy(v); g.add(ring);
    });
    return g;
  }

  function cmat0(c, r0, m) { return new T.MeshStandardMaterial({ color: c, roughness: r0, metalness: m }); }
  function canvasTex0(w, h, d) { var c = document.createElement('canvas'); c.width = w; c.height = h; d(c.getContext('2d')); var t = new T.CanvasTexture(c); t.anisotropy = 4; return t; }

  function meterPosts(m) {
    [-1, 1].forEach(function (s) {
      var p = new T.Mesh(new T.CylinderGeometry(.3, .3, .9, 14), s > 0 ? P.MAT.red : P.MAT.dark);
      p.rotation.x = Math.PI / 2; p.position.set(s * POST_X, POST_Y, POST_Z - .45); m.add(p);
      /* 柱根绝缘套 + 外端金属接头环，让导线「接上」看得出来；POST_Z 不变 */
      var boot = new T.Mesh(new T.CylinderGeometry(.4, .4, .34, 12), P.MAT.rubber);
      boot.rotation.x = Math.PI / 2;
      boot.position.set(s * POST_X, POST_Y, POST_Z - .68); m.add(boot);
      var ring = new T.Mesh(new T.TorusGeometry(.34, .09, 6, 12), P.MAT.brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(s * POST_X, POST_Y, POST_Z + .02); m.add(ring);
    });
  }
  /* 定值电阻：不同阻值做成不同长度与标签的实体，从 HOME 位搬到工作位 */
  /* 定值电阻：架在绝缘支座上的实体，端点恒为 ±END。
     旧版电阻中心 y=0、两端引线悬在空中，导线端点却写死 y=1.4，
     读作「一段漂浮的香肠 + 两个断开的线头」。 */
  var RES_CY = 1.6, RES_END = 4.2;
  function makeResistor(rx) {
    var g = new T.Group();
    var len = 3.4 + rx * .16;
    var body = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, len, 20),
      cmat0(0xd9b34a, .6, .2));
    body.rotation.z = Math.PI / 2; body.position.y = RES_CY; g.add(body);
    /* 深色底板 + 两端绝缘支座 + 黄铜接线柱，换电阻时导线端点不动 */
    var tray = new T.Mesh(new T.BoxGeometry(RES_END * 2 + 1.4, .3, 2.6), P.MAT.dark);
    tray.position.y = .15; g.add(tray);
    [-1, 1].forEach(function (s) {
      var t = new T.Mesh(new T.CylinderGeometry(.28, .28, 1.4, 10), C.MAT.metal);
      t.rotation.z = Math.PI / 2; t.position.set(s * (len / 2 + .7), RES_CY, 0); g.add(t);
      var ll = RES_END - len / 2 - .7;
      var lead = new T.Mesh(new T.CylinderGeometry(.11, .11, ll, 8), C.MAT.metal);
      lead.rotation.z = Math.PI / 2;
      lead.position.set(s * (len / 2 + .7 + ll / 2), RES_CY, 0); g.add(lead);
      var ped = new T.Mesh(new T.CylinderGeometry(.42, .5, RES_CY, 14), P.MAT.ceramic);
      ped.position.set(s * (RES_END - .35), RES_CY / 2, 0); g.add(ped);
      var cap = new T.Mesh(new T.CylinderGeometry(.3, .3, .32, 14), P.MAT.brass.clone());
      cap.position.set(s * (RES_END - .35), RES_CY + .1, 0); g.add(cap);
    });
    var lab = new T.Mesh(new T.PlaneGeometry(3.0, 1.3), new T.MeshBasicMaterial({
      map: canvasTex0(192, 80, function (x) {
        x.fillStyle = '#d9b34a'; x.fillRect(0, 0, 192, 80);
        x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 44px Consolas,monospace'; x.fillText(rx + ' Ω', 96, 42);
      })
    }));
    lab.position.set(0, RES_CY, 1.05); g.add(lab);
    /* 3 道色环：绕圆柱的细环，读出「色环电阻」而非电池 */
    var bandMat = [0x6b3f1d, 0xc0392b, 0xd9861a].map(function (c) {
      return new T.MeshStandardMaterial({ color: c, roughness: .55, metalness: .1 });
    });
    [-len * .3, -len * .16, -len * .02].forEach(function (x, i) {
      var band = new T.Mesh(new T.TorusGeometry(1.02, .11, 8, 20), bandMat[i]);
      band.rotation.y = Math.PI / 2; band.position.set(x, RES_CY, 0); g.add(band);
    });
    g.userData.len = len;
    return g;
  }

  /* 唯一真源：由电路模型实时解出 I 与 Ux */
  function solve(s) {
    if (!s.closed) return { on: false, I: 0, Ux: 0, rv: rvarFromSlider(s) };
    var rv = (s.mode === 'Rrel') ? rvarForU0(s._rx) : rvarFromSlider(s);
    var q = P.model.divider(E, r, rv, s._rx);
    return { on: true, I: q.I, Ux: q.Ux, rv: rv };
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(72, 26);
      /* 整组器材（含 HOME 备料位 / 工作位 / 导线端点 / 接地阴影）统一左移 2.5：
         正面机位电阻组原被右侧面板压住；P.port 端点按物体世界坐标换算，
         硬编码端点同步平移，保证导线仍精确落在电阻两端（勿只移一半）。 */
      var bat = P.battery({ w: 8 }); bat.position.set(-20.5, 0, 0); K.scene().add(bat); O.bat = bat;
      dressBattery(bat);
      var sw = P.switch_(); sw.position.set(-12.5, 0, 7); K.scene().add(sw); O.sw = sw;
      var rheo = P.rheostat({ len: 9 }); rheo.position.set(-4.5, 0, 7); K.scene().add(rheo); O.rheo = rheo;
      var am = P.ammeter({ max: RANGE_A }); am.position.set(3.5, 3.2, 7); K.scene().add(am); O.am = am; meterPosts(am);
      var vm = P.voltmeter({ max: 3 }); vm.position.set(1.5, 3.2, -8); K.scene().add(vm); O.vm = vm; meterPosts(vm);

      /* 三只定值电阻：HOME 备料位放桌面左后方（旧版 x=17.5 被右侧面板整挡），选中者移到工作位 */
      O.resistors = {};
      RX_LIST.forEach(function (rx, i) {
        var R = makeResistor(rx);
        R.position.set(-15, 0, -12 + i * 3.4);
        K.scene().add(R); O.resistors[rx] = R;
        P.ground(-15, -12 + i * 3.4, 3);
      });
      O.workPos = new T.Vector3(8.0, 0, 0);   /* 再左移，工作位电阻不被右侧面板压住 */

      /* 导线：电源+ → 开关 → 滑变 → 电流表+ → 电流表− → 电阻右端
              电阻左端 → 回电源−；电压表两柱跨接电阻两端 */
      /* 电阻端点：工作位 10.5 ± RES_END，高度与支座顶的接线柱一致 */
      var rR = O.workPos.x + RES_END, rL = O.workPos.x - RES_END;
      K.scene().add(W(P.port(bat, BAT_X, BAT_Y, 0), P.port(sw, -SW_X, SW_Y, 0), RED));
      K.scene().add(W(P.port(sw, SW_X, SW_Y, 0), P.port(rheo, -4.5, 2.6, 0), RED));
      K.scene().add(W(P.port(rheo, 4.5, 2.6, 0), P.port(am, POST_X, POST_Y, POST_Z), RED));
      K.scene().add(W(P.port(am, -POST_X, POST_Y, POST_Z), [rR, RES_CY, 0], RED));
      K.scene().add(W([rL, RES_CY, 0], P.port(bat, -BAT_X, BAT_Y, 0), BLK, 1.6));
      K.scene().add(W(P.port(vm, POST_X, POST_Y, POST_Z), [rR, RES_CY, 0], BLUE));
      K.scene().add(W(P.port(vm, -POST_X, POST_Y, POST_Z), [rL, RES_CY, 0], BLUE));
      [bat, sw, rheo, am, vm].forEach(function (o) { P.ground(o.position.x, o.position.z, 3.2); });
      P.ground(8.0, 0, 4);
      K.tag(vm, '电压表', '并联在 R 两端，读 Ux');
      K.tag(am, '电流表', '串联，读 I');
      K.tag(rheo, '滑动变阻器', '滑片位置 ↔ Rvar，保护电路 + 调节 Ux');
      O.ready = true;
    },
    update: function (dt, s) {
      s._t += dt;
      var q = solve(s);
      /* 表针阻尼：切换电压/电阻、换 Rx 时指针平滑跟随 */
      s._I += (q.I - s._I) * Math.min(1, dt * 12);
      s._U += (q.Ux - s._U) * Math.min(1, dt * 12);
      O.am.userData.setValue(s._I);
      O.vm.userData.setValue(s._U);
      O.sw.userData.setClosed(s.closed);
      /* Rrel 模式：滑片自动移到「反解出的 Rvar」位置，Ux 才真的守恒 */
      var sp = (s.mode === 'Rrel') ? sliderFromRvar(rvarForU0(s._rx)) : s._slider;
      O.rheo.userData.setSlider(Math.max(0, Math.min(1, sp)));
      /* 三只电阻：选中的从 HOME 位平滑移到工作位，其余回备料位 */
      RX_LIST.forEach(function (rx, i) {
        var R = O.resistors[rx];
        var target = (rx === s._rx) ? O.workPos : new T.Vector3(-15, 0, -12 + i * 3.4);
        R.position.lerp(target, Math.min(1, dt * 5));
      });
    }
  };

  function reset(s) { s.closed = false; s.wrong = false; s.judged = false; s._slider = .5; s._rx = 5; }

  K.boot({
    title: '探究电流与电压、电阻的关系',
    chip: '物理 · 鲁教版 · 九上 · 第十五章 欧姆定律 · 第一节',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 14, dist: 62, tx: 4, tz: 0, yaw: .2, pitch: .32 },
    reads: [['U', '电压 Ux'], ['I', '电流 I'], ['R', '电阻 Rx'], ['rv', '滑变 Rvar']],
    values: function (s) {
      var q = solve(s);
      return {
        U: q.on ? q.Ux.toFixed(2) + ' V' : '—',
        I: q.on ? q.I.toFixed(3) + ' A' : '—',
        R: s._rx + ' Ω',
        rv: q.rv.toFixed(2) + ' Ω'
      };
    },
    steps: [
      { name: '电路', title: '伏安法电路与滑动变阻器的两个作用',
        ask: '本实验采用什么研究方法？滑变起什么作用？',
        body: '<p><b>电路模型：</b>E = ' + E + ' V、内阻 r = ' + r + ' Ω，滑变 Rvar ∈ [' + RV_MIN + ', ' + RV_MAX + '] Ω 与定值电阻 Rx <b>串联</b>：<b>I = E/(r + Rvar + Rx)</b>，<b>Ux = I·Rx</b>。电流表量程 ' + RANGE_A + ' A。</p>' +
          '<p><b>方法：</b><b>控制变量法</b>——固定 Rx 只调 Rvar 研究 I–U；固定 Ux 只换 Rx 研究 I–R。</p>' +
          '<p><b>滑变作用：</b>① 限流保护（Rvar 下限保证 I < ' + RANGE_A + ' A）；② 改变或<b>稳定</b> Ux。</p>',
        apply: function (s) { reset(s); s.mode = 'Urel'; s.closed = true; },
        cam: { tx: 2, ty: 13, tz: 0, dist: 60, yaw: .2, pitch: .36 } },
      { name: 'I∝U', title: '电阻一定：调节滑变，I 与 Ux 成正比',
        ask: '保持电阻不变，增大电压，电流怎样变？',
        body: '<p><b>操作：</b>固定 Rx = 5 Ω，移动滑片改变 Rvar，Ux = I·Rx 随之改变；记录多组 (Ux, I)。</p>' +
          '<p><b>推导：</b>因 Ux = I·Rx 且 Rx 恒定，故 <b>I = Ux / Rx ∝ Ux</b>（I–Ux 图像为过原点直线）。注意此处 Ux 是<b>由电路模型解出</b>的，不是人为指定的电压值。</p>' +
          '<p><b>边界：</b>忽略电阻发热导致的阻值变化；电源内阻 r 已计入，故 Ux 恒小于 E。</p>',
        apply: function (s) { reset(s); s.mode = 'Urel'; s.closed = true; s._rx = 5; },
        controls: [
          { type: 'btn', label: 'Rvar 调大（Ux↓）', onClick: function (s) { s.mode = 'Urel'; s.closed = true; s._rx = 5; s._slider = Math.max(0, s._slider - .25); } },
          { type: 'btn', label: 'Rvar 调小（Ux↑）', onClick: function (s) { s.mode = 'Urel'; s.closed = true; s._rx = 5; s._slider = Math.min(1, s._slider + .25); } }
        ],
        cam: { tx: 4, ty: 11, tz: 2, dist: 46, yaw: .2, pitch: .34 } },
      { name: 'I∝1/R', title: '电压一定：换电阻后反解 Rvar，使 Ux 守恒',
        ask: '保持电压不变，换大电阻，电流怎样变？',
        body: '<p><b>关键（不是把 U 写死 3V）：</b>要求 Ux = U₀ = ' + U0 + ' V，由 <b>Ux = E·Rx/(r + Rvar + Rx)</b> <b>反解</b>得 <b>Rvar = Rx(E − U₀)/U₀ − r</b>。每换一只电阻，滑片就自动移到这个位置，Ux 才真的回到 ' + U0 + ' V。</p>' +
          '<p><b>结果：</b>I = U₀/Rx，故 <b>I ∝ 1/Rx</b>；Rx = 5/10/15 Ω 时 I = 0.60/0.30/0.20 A（由模型算）。</p>' +
          '<p><b>易错：</b>换大电阻后 Ux 会升高，必须先增大 Rvar 把电压拉回，再读电流。</p>',
        apply: function (s) { reset(s); s.mode = 'Rrel'; s.closed = true; s._rx = 5; },
        controls: [
          { type: 'btn', label: '换 Rx = 5 Ω', onClick: function (s) { s.mode = 'Rrel'; s.closed = true; s._rx = 5; } },
          { type: 'btn', label: '换 Rx = 10 Ω', onClick: function (s) { s.mode = 'Rrel'; s.closed = true; s._rx = 10; } },
          { type: 'btn', label: '换 Rx = 15 Ω', onClick: function (s) { s.mode = 'Rrel'; s.closed = true; s._rx = 15; } }
        ],
        cam: { tx: 4, ty: 11, tz: 2, dist: 46, yaw: .2, pitch: .34 } },
      { name: '结论', title: '综合得欧姆定律，并辨析控制变量',
        ask: '两段结论综合起来是什么定律？',
        body: '<p><b>结论：</b>R 一定 I ∝ U；U 一定 I ∝ 1/R，综合得 <b>I = U / R</b>（欧姆定律）。</p>' +
          '<p><b>反例：</b>按下方按钮「同时改变 U 和 R」，电压和电阻一起变，电流的变化<b>无法归因</b>到任何一个变量——这正是必须用控制变量法的原因。</p>' +
          '<p><b>边界：</b>欧姆定律适用于<b>同一段导体、温度不变</b>；小灯泡灯丝温度随电流升高，阻值变化，不能取多组平均值当作定值。</p>',
        apply: function (s) { reset(s); s.mode = 'Urel'; s.closed = true; s._rx = 5; },
        controls: [
          { type: 'btn', label: '反例：同时改 U 和 R', onClick: function (s) { s.wrong = true; s._rx = 15; s._slider = .9; s.closed = true; } },
          { type: 'btn', label: '回到控制变量（只变 U）', onClick: function (s) { s.wrong = false; s._rx = 5; s.closed = true; } }
        ],
        cam: { tx: 2, ty: 13, tz: 0, dist: 58, yaw: .2, pitch: .34 } }
    ],
    quiz: function () {
      var bank = [
        { q: '本实验研究方法？', opts: ['控制变量法', '等效替代', '转换法', '理想实验'], ans: '控制变量法', why: '分别控制 R 或 U 不变来研究关系。' },
        { q: '电阻一定时 I 与 U？', opts: ['成正比', '成反比', '无关', '平方'], ans: '成正比', why: 'I = U/R，R 不变时 I ∝ U。' },
        { q: '电压一定时 I 与 R？', opts: ['成反比', '成正比', '无关', '平方'], ans: '成反比', why: 'I = U/R，U 不变时 I ∝ 1/R。' },
        { q: '换大电阻后第一步？', opts: ['调滑变使电压回到原值', '直接读数', '增大电压', '换电源'], ans: '调滑变使电压回到原值', why: '换大电阻 Ux 升高，须增大 Rvar 把电压拉回。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
