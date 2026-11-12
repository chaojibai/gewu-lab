/* 格物实验室 · 探究串、并联电路中电流与电压的特点（three.js 单文件课件）
   鲁教版 九年级上册 · 第十四章 · 第二节(电流规律)/第四节(电压规律)

   【严谨】所有读数由 P.model.series / P.model.parallel 对真实电路求解：
           I = E/(r+ΣR)、U = E−Ir；并联 U = I·Req、Iₖ = U/Rₖ。
           无硬编码 0.20A/0.40A/1.5V。反例：两灯同阻时 I₁=I₂ 只是特例，
           换不同规格灯泡后 I₁≠I₂，但 I=I₁+I₂、U=U₁=U₂ 仍成立。
   【真实感】两套完整电路（器材+导线）按接法整体切换；导线用 P.port +
           P.link 精确落在接线柱、中段自然下垂；分流/合流处有真实接线排；
           电表补可见接线柱；灯泡亮度由各自功率 I²R 驱动；每件 P.ground。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 电路模型参数（唯一真源）── */
  var E = 3.0, r = 0.2, R1 = 10;
  function R2(s) { return s.odd ? 20 : 10; }   // 「换不同规格灯泡」改变第二盏灯
  var st = { mode: 'series', closed: false, odd: false, judged: false, _t: 0, t: 0,
             _I: 0, _u1: 0, _u2: 0, _u: 0, _p1: 0, _p2: 0 };
  var O = {};

  /* 接线柱局部坐标（交给 P.port 换算世界坐标） */
  var BAT_X = 4, BAT_Y = 4.4, SW_X = 1.6, SW_Y = 1.2, LB_X = 1.8, LB_Y = 1.4;
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
    /* 端点接头环用独立材质，避免整组切换时共享材质被连带改透明度 */
    [a, b].forEach(function (p) {
      var v = p instanceof T.Vector3 ? p : new T.Vector3(p[0], p[1], p[2]);
      var ring = new T.Mesh(new T.TorusGeometry(.28, .09, 6, 12), P.MAT.brass.clone());
      ring.rotation.x = Math.PI / 2; ring.position.copy(v); g.add(ring);
    });
    return g;
  }

  /* 电表原接线柱在台面下（y≈−3.3），在机身正面下部补一对可见红/黑柱 */
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
  /* 分流/合流接线排：给导线端点一个真实可接的实体，避免悬空线头 */
  function junction(x, z) {
    var g = new T.Group(); g.position.set(x, 0, z);
    var base = new T.Mesh(new T.BoxGeometry(3.4, .7, 2.2), P.MAT.dark);
    base.position.y = .35; g.add(base);
    /* 两柱之间的铜排：分流/合流点要读得出是导电接线排，不是白色小积木 */
    var bar = new T.Mesh(new T.BoxGeometry(2.2, .14, .6), P.MAT.brass.clone());
    bar.position.set(0, .78, 0); g.add(bar);
    [-1, 1].forEach(function (s) {
      var p = new T.Mesh(new T.CylinderGeometry(.28, .28, 1.0, 12), P.MAT.brass);
      p.position.set(s * .8, 1.1, 0); g.add(p);
      /* 接线排柱也补绝缘套 + 接头环，端点局部 y=1.6 不变 */
      var boot = new T.Mesh(new T.CylinderGeometry(.38, .38, .3, 10), P.MAT.rubber);
      boot.position.set(s * .8, .82, 0); g.add(boot);
      var ring = new T.Mesh(new T.TorusGeometry(.34, .09, 6, 12), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.set(s * .8, 1.6, 0); g.add(ring);
    });
    return g;
  }
  function bulbTag(text) {
    var cv = document.createElement('canvas'); cv.width = 192; cv.height = 80;
    var x = cv.getContext('2d');
    x.fillStyle = '#16232e'; x.fillRect(0, 0, 192, 80);
    x.fillStyle = '#ffd58a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 44px Arial,sans-serif'; x.fillText(text, 96, 42);
    return new T.CanvasTexture(cv);
  }
  function setBulb(b, pow) {
    b.userData.setLit(pow > .01);
    if (pow > .01) {
      b.userData.glow.intensity = Math.min(1.8, pow * .55);
      b.userData.fil.material.emissiveIntensity = Math.min(2.6, pow * .8);
    }
  }

  /* ── 串联电路（含两套电压表分别跨两灯）── */
  function buildSeries() {
    var g = new T.Group(); K.scene().add(g);
    var bat = P.battery({ w: 8 }); bat.position.set(-22, 0, 0); g.add(bat); dressBattery(bat);
    var sw = P.switch_(); sw.position.set(-15, 0, 6); g.add(sw);
    /* 电表原点在机身中心，y=0 会让表身一半埋进台面（旧版只露出半截白盒） */
    var am = P.ammeter({ max: 0.6 }); am.position.set(-8, 3.2, 6); g.add(am); meterPosts(am);
    var l1 = P.bulb(); l1.position.set(0, 0, 6); g.add(l1);
    var l2 = P.bulb(); l2.position.set(9, 0, 6); g.add(l2);
    var vm1 = P.voltmeter({ max: 3 }); vm1.position.set(0, 3.2, -7); g.add(vm1); meterPosts(vm1);
    var vm2 = P.voltmeter({ max: 3 }); vm2.position.set(9, 3.2, -7); g.add(vm2); meterPosts(vm2);
    g.add(W(P.port(bat, BAT_X, BAT_Y, 0), P.port(sw, -SW_X, SW_Y, 0), RED));
    g.add(W(P.port(sw, SW_X, SW_Y, 0), P.port(am, POST_X, POST_Y, POST_Z), RED));
    g.add(W(P.port(am, -POST_X, POST_Y, POST_Z), P.port(l1, -LB_X, LB_Y, 0), RED));
    g.add(W(P.port(l1, LB_X, LB_Y, 0), P.port(l2, -LB_X, LB_Y, 0), RED));
    g.add(W(P.port(l2, LB_X, LB_Y, 0), P.port(bat, -BAT_X, BAT_Y, 0), BLK, 1.6));
    g.add(W(P.port(vm1, POST_X, POST_Y, POST_Z), P.port(l1, LB_X, LB_Y, 0), BLUE));
    g.add(W(P.port(vm1, -POST_X, POST_Y, POST_Z), P.port(l1, -LB_X, LB_Y, 0), BLUE));
    g.add(W(P.port(vm2, POST_X, POST_Y, POST_Z), P.port(l2, LB_X, LB_Y, 0), BLUE));
    g.add(W(P.port(vm2, -POST_X, POST_Y, POST_Z), P.port(l2, -LB_X, LB_Y, 0), BLUE));
    [bat, sw, am, l1, l2, vm1, vm2].forEach(function (o) {
      P.ground(o.position.x, o.position.z, o === bat ? 5 : 3.2);
    });
    return { group: g, sw: sw, am: am, vm1: vm1, vm2: vm2, bulbs: [l1, l2] };
  }

  /* ── 并联电路（两支路 + 干路电流表 + 跨接电压表）── */
  function buildParallel() {
    var g = new T.Group(); K.scene().add(g);
    var bat = P.battery({ w: 8 }); bat.position.set(-22, 0, 0); g.add(bat); dressBattery(bat);
    var sw = P.switch_(); sw.position.set(-15, 0, 6); g.add(sw);
    var l1 = P.bulb(); l1.position.set(0, 0, 12); g.add(l1);
    var l2 = P.bulb(); l2.position.set(0, 0, -2); g.add(l2);
    var JA = junction(-6, 6), JB = junction(6, 6); g.add(JA); g.add(JB);
    /* 电表左移到 x=9：右侧 UI 面板会压住 x≥12 的器材 */
    var am = P.ammeter({ max: 0.6 }); am.position.set(9, 3.2, 6); g.add(am); meterPosts(am);
    var vm = P.voltmeter({ max: 3 }); vm.position.set(9, 3.2, -8); g.add(vm); meterPosts(vm);
    var a = P.port(JA, 0, 1.6, 0), b = P.port(JB, 0, 1.6, 0);
    g.add(W(P.port(bat, BAT_X, BAT_Y, 0), P.port(sw, -SW_X, SW_Y, 0), RED));
    g.add(W(P.port(sw, SW_X, SW_Y, 0), a, RED));
    g.add(W(a, P.port(l1, -LB_X, LB_Y, 0), RED));
    g.add(W(a, P.port(l2, -LB_X, LB_Y, 0), RED));
    g.add(W(P.port(l1, LB_X, LB_Y, 0), b, RED));
    g.add(W(P.port(l2, LB_X, LB_Y, 0), b, RED));
    g.add(W(b, P.port(am, POST_X, POST_Y, POST_Z), RED));
    g.add(W(P.port(am, -POST_X, POST_Y, POST_Z), P.port(bat, -BAT_X, BAT_Y, 0), BLK, 1.6));
    g.add(W(P.port(vm, POST_X, POST_Y, POST_Z), a, BLUE));
    g.add(W(P.port(vm, -POST_X, POST_Y, POST_Z), b, BLUE));
    [bat, sw, l1, l2, am, vm].forEach(function (o) { P.ground(o.position.x, o.position.z, o === bat ? 5 : 3.2); });
    P.ground(-6, 6, 2.4); P.ground(6, 6, 2.4);
    /* L₂ 规格牌：换 20 Ω 灯泡时外观也要跟着变，不能只改读数 */
    var t10 = new T.Mesh(new T.PlaneGeometry(3.2, 1.35),
      new T.MeshBasicMaterial({ map: bulbTag('10 Ω'), side: T.DoubleSide }));
    t10.position.set(0, 1.15, 2.06); l2.add(t10);
    var t20 = new T.Mesh(new T.PlaneGeometry(3.2, 1.35),
      new T.MeshBasicMaterial({ map: bulbTag('20 Ω'), side: T.DoubleSide }));
    t20.position.copy(t10.position); t20.visible = false; l2.add(t20);
    g.userData.t10 = t10; g.userData.t20 = t20;
    return { group: g, sw: sw, am: am, vm: vm, bulbs: [l1, l2] };
  }

  /* 唯一真源：由电路模型实时解出全部电流与电压 */
  function solve(s) {
    var Rs = [R1, R2(s)];
    if (!s.closed) return { on: false, I: 0, U: 0, i1: 0, i2: 0, u1: 0, u2: 0 };
    if (s.mode === 'series') {
      var q = P.model.series(E, r, Rs);
      return { on: true, I: q.I, U: q.U, i1: q.I, i2: q.I, u1: q.drops[0], u2: q.drops[1] };
    }
    var p = P.model.parallel(E, r, Rs);
    return { on: true, I: p.I, U: p.U, i1: p.branches[0], i2: p.branches[1], u1: p.U, u2: p.U };
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(70, 30);
      O.series = buildSeries(); O.parallel = buildParallel();
      O.series.group.visible = true; O.parallel.group.visible = false;
      P.ground(0, 0, 22);
      K.tag(O.series.am, '电流表', '串联在干路，测 I');
      K.tag(O.series.bulbs[0], '灯泡 L₁', 'R₁ = ' + R1 + ' Ω');
      K.tag(O.series.vm1, '电压表', '并联在 L₁ 两端');
      O.ready = true;
    },
    update: function (dt, s) {
      s._t += dt;
      var q = solve(s), ser = s.mode === 'series';
      O.series.group.visible = ser; O.parallel.group.visible = !ser;
      O.parallel.group.userData.t10.visible = !s.odd;
      O.parallel.group.userData.t20.visible = !!s.odd;
      var c = ser ? O.series : O.parallel;
      var k = Math.min(1, dt * 12), kl = Math.min(1, dt * 9);
      c.sw.userData.setClosed(s.closed);
      /* 表针阻尼：合开关/切步骤时指针平滑摆到新读数 */
      s._I += (q.I - s._I) * k;
      c.am.userData.setValue(s._I);
      if (ser) {
        s._u1 += (q.u1 - s._u1) * k; s._u2 += (q.u2 - s._u2) * k;
        c.vm1.userData.setValue(s._u1); c.vm2.userData.setValue(s._u2);
      } else {
        s._u += (q.U - s._u) * k;
        c.vm.userData.setValue(s._u);
      }
      /* 灯丝热惯性：功率一阶跟随，亮度渐变 */
      var Rs = [R1, R2(s)];
      s._p1 += (q.i1 * q.i1 * Rs[0] - s._p1) * kl;
      s._p2 += (q.i2 * q.i2 * Rs[1] - s._p2) * kl;
      setBulb(c.bulbs[0], s._p1);
      setBulb(c.bulbs[1], s._p2);
    }
  };

  function reset(s) { s.closed = false; s.odd = false; s.judged = false; }

  K.boot({
    title: '探究串、并联电路中电流与电压的特点',
    chip: '物理 · 鲁教版 · 九上 · 第十四章 · 第二/四节 串并联规律',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 15, dist: 68, tx: 6, tz: 0, yaw: .2, pitch: .32 },
    reads: [['I', '干路电流 I'], ['U', '总电压 U'], ['branch', '支路电流'], ['rule', '规律']],
    values: function (s) {
      var q = solve(s);
      if (!q.on) return { I: '—', U: '—', branch: '—', rule: '闭合开关后由电路模型求解' };
      return {
        I: q.I.toFixed(3) + ' A',
        U: q.U.toFixed(2) + ' V',
        branch: 'I₁=' + q.i1.toFixed(3) + ' / I₂=' + q.i2.toFixed(3) + ' A；U₁=' + q.u1.toFixed(2) + ' / U₂=' + q.u2.toFixed(2) + ' V',
        rule: s.mode === 'series'
          ? '串联 I=I₁=I₂，U=U₁+U₂=' + (q.u1 + q.u2).toFixed(2) + ' V'
          : '并联 I=I₁+I₂=' + (q.i1 + q.i2).toFixed(3) + ' A，U=U₁=U₂'
      };
    },
    steps: [
      { name: '串联', title: '串联电路：电流处处相等、总电压等于分压之和',
        ask: '串联电路中各处电流、总电压与各用电器电压有何关系？',
        body: '<p><b>电路模型：</b>电源 E = ' + E + ' V、内阻 r = ' + r + ' Ω，两灯 R₁ = ' + R1 + ' Ω、R₂ = 10 Ω（第 3 步可换 20 Ω）<b>串联</b>。由闭合电路欧姆定律 <b>I = E/(r + R₁ + R₂)</b>，各灯分压 <b>Uₖ = I·Rₖ</b>，端电压 <b>U = E − Ir</b>。</p>' +
          '<p><b>结论：</b>I = I₁ = I₂；U = U₁ + U₂。右侧读数与灯泡亮度均由该模型实时解出，不是预设值。</p>' +
          '<p><b>边界：</b>把灯丝视为定值电阻（忽略温度影响）；电源内阻不可忽略，故 U 略小于 E。</p>',
        apply: function (s) { reset(s); s.mode = 'series'; },
        controls: [{ type: 'btn', label: '闭合开关（串联）', onClick: function (s) { s.mode = 'series'; s.closed = true; } }],
        cam: { tx: 5, ty: 13, tz: 2, dist: 60, yaw: .2, pitch: .36 } },
      { name: '并联', title: '并联电路：干路电流等于支路之和、各支路电压相等',
        ask: '并联电路中干路/支路电流、各支路电压有何关系？',
        body: '<p><b>电路模型：</b>两灯并联，等效电阻 <b>1/R = 1/R₁ + 1/R₂</b>，干路电流 <b>I = E/(r + R)</b>，并联部分电压 <b>U = I·R</b>，各支路电流 <b>Iₖ = U/Rₖ</b>。</p>' +
          '<p><b>结论：</b>I = I₁ + I₂；U = U₁ = U₂（各支路两端是同一对节点）。</p>' +
          '<p><b>接法：</b>电流表<b>串联</b>在干路、电压表<b>并联</b>跨接；画面里两套电路按接法真实切换，导线端点都落在接线柱上。</p>',
        apply: function (s) { reset(s); s.mode = 'parallel'; },
        controls: [{ type: 'btn', label: '切换为并联并闭合', onClick: function (s) { s.mode = 'parallel'; s.closed = true; } }],
        cam: { tx: 5, ty: 13, tz: 2, dist: 60, yaw: .2, pitch: .36 } },
      { name: '对比', title: '换不同规格灯泡：排除「特殊值」误导',
        ask: '为什么必须换用不同规格的灯泡重复实验？',
        body: '<p><b>反例（本步重点）：</b>两灯电阻<b>相同</b>时（各 10 Ω），并联 I₁ = I₂ —— 这容易让人误记成「并联各支路电流相等」。按下方按钮把 L₂ 换成 <b>20 Ω</b>，可见 I₁ ≠ I₂，但 <b>I = I₁ + I₂</b> 与 <b>U = U₁ = U₂</b> 依然成立。</p>' +
          '<p><b>结论：</b>规律与用电器规格无关；多次换规格测量才能归纳出普遍规律，避免偶然特殊值。</p>' +
          '<p><b>易错：</b>电流表串联、电压表并联，「+」「−」柱不可接反；换灯前须断开开关。</p>',
        apply: function (s) { reset(s); s.mode = 'parallel'; s.closed = true; },
        controls: [
          { type: 'btn', label: 'L₂ 换 20 Ω（不同规格）', onClick: function (s) { s.odd = true; s.closed = true; } },
          { type: 'btn', label: 'L₂ 换回 10 Ω（相同规格）', onClick: function (s) { s.odd = false; s.closed = true; } },
          { type: 'btn', label: '切回串联验证', onClick: function (s) { s.mode = 'series'; s.closed = true; } }
        ],
        cam: { tx: 5, ty: 13, tz: 0, dist: 62, yaw: .2, pitch: .34 } }
    ],
    quiz: function () {
      var bank = [
        { q: '串联电路电流特点？', opts: ['处处相等', '干路最大', '支路不等', '随机'], ans: '处处相等', why: '串联只有一条通路，I = I₁ = I₂。' },
        { q: '并联电路电压特点？', opts: ['各支路相等', '干路最大', '相加', '随机'], ans: '各支路相等', why: '各支路接在同一对节点上，U = U₁ = U₂。' },
        { q: '两灯电阻不同时，并联支路电流？', opts: ['不相等', '仍相等', '都为零', '与电阻无关'], ans: '不相等', why: 'Iₖ = U/Rₖ，阻值不同则支路电流不同，但干路仍等于之和。' },
        { q: '为何要换不同规格灯泡？', opts: ['避免特殊值误导', '更亮', '省电', '保护电表'], ans: '避免特殊值误导', why: '多次换规格才能归纳普遍规律。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
