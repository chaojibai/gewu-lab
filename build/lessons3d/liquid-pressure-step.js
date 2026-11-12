/* 格物实验室 · 探究液体压强与哪些因素有关（three.js 单文件课件）
   鲁教版 八年级下册 · 第七章 压强 · 第二节 液体压强

   【严谨】Δp = P.model.hydroP(ρ, h) = ρgh，h 为探头橡皮膜在液面下的
           真实几何深度 h = Y_SURF − probeY（由探头几何位置反算，非滑块映射）；
           U 管液面差 Δh = P.model.manometerCm(Δp, ρ柱) = Δp/(ρ柱 g)，
           两式相消得 Δh = (ρ/ρ柱)·h。水 1000 kg/m³、盐水 1200、U 管液柱 1000。
           方向改变时模型里根本没有方向变量，故 Δp、Δh 不变（各向同性反例）。
   【真实感】U 管玻璃 + 有色液柱（左升右降、体积守恒）+ 刻度板、探头金属盒
           与橡皮膜 + 可真实升降/转向 + 橡胶软管、烧杯玻璃与液面、每件器材
           P.ground 接地、材质按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源）────────────────────────────── */
  var G       = P.model.gN;                 // 10 N/kg
  var RHO_W   = 1000;                       // 水 kg/m³
  var RHO_S   = 1200;                       // 盐水 kg/m³
  var RHO_MAN = 1000;                       // U 管有色液柱 kg/m³
  var Y_SURF  = 12;                         // 烧杯液面（场景 y）
  var Y_MID   = 9;                          // U 管两液面平衡位（管高 18，半高 9）
  var P_PRESS = 200;                        // 轻压橡皮膜的附加压强 Pa（气密性检查输入）
  var BX = 6, UXL = -7, UXR = -1;           // 烧杯 / U 管左管 / 右管 x（右管接探头）

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = {
    _probeY: Y_SURF - 5,   // 探头橡皮膜当前几何 y
    _targetY: Y_SURF - 5,  // 目标 y（按钮设，逐帧插值 = 真实升降）
    _angle: 0,             // 探头当前转角（绕膜中心）
    _dir: 0,               // 0 膜朝下 / 1 朝上 / 2 朝侧
    _salt: false,
    _press: 0,             // 轻压橡皮膜 0/1
    judged: false, _t: 0
  };
  var O = {};

  /* 模型：h 由几何算，Δp = ρgh，Δh = Δp/(ρ柱 g)＝(ρ/ρ柱)h；与方向无关 */
  function physics(s) {
    var h   = Y_SURF - s._probeY;                 // 真实几何深度 cm
    if (h < 0) h = 0;
    var rho = s._salt ? RHO_S : RHO_W;
    var dp  = P.model.hydroP(rho, h);             // 液体压强 Pa
    var dH  = P.model.manometerCm(dp + s._press * P_PRESS, RHO_MAN); // U 管液面差 cm
    return { h: h, rho: rho, dp: dp, dH: dH };
  }

  /* U 管刻度板：0 在中线，每 1 cm 一格、每 5 cm 标数 */
  function makeScaleBoard() {
    var cv = document.createElement('canvas'); cv.width = 240; cv.height = 720;
    var x = cv.getContext('2d');
    x.fillStyle = '#f3ecdc'; x.fillRect(0, 0, 240, 720);
    x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 22px Consolas,monospace'; x.fillText('cm', 200, 26);
    for (var i = -9; i <= 9; i++) {
      var yy = 360 - i * 40;                     // 40 px/cm
      var major = i % 5 === 0;
      x.strokeStyle = i === 0 ? '#c0392b' : '#5b6b78';
      x.lineWidth = i === 0 ? 3 : (major ? 2.5 : 1.2);
      x.beginPath(); x.moveTo(major ? 96 : 130, yy); x.lineTo(196, yy); x.stroke();
      if (major) { x.fillStyle = '#1c2b39'; x.textAlign = 'right'; x.fillText(String(i), 88, yy); }
    }
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    return new T.Mesh(new T.PlaneGeometry(9, 18),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
  }

  /* 橡胶软管：每帧按两端点重建，带自然下垂（端点贴合、不横跨画面成长弧） */
  function updateHose(a, b) {
    var mid = a.clone().add(b).multiplyScalar(.5); mid.y = Math.min(a.y, b.y) - 1.6;
    var q1 = a.clone().lerp(mid, .5); q1.y = a.y - 1.0;
    var q2 = b.clone().lerp(mid, .5); q2.y = b.y - 1.0;
    O.hose.geometry.dispose();
    O.hose.geometry = new T.TubeGeometry(
      new T.CatmullRomCurve3([a, q1, mid, q2, b]), 20, .28, 8, false);
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(46, 18);

      /* ══ U 形管压强计（左）══ */
      var glass = P.MAT.glass;
      [UXL, UXR].forEach(function (ux) {
        var tube = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 18, 20, 1, true), glass);
        tube.position.set(ux, Y_MID, 0); K.scene().add(tube);
      });
      var bot = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 8, 16, 1, true), glass);
      bot.rotation.z = Math.PI / 2; bot.position.set((UXL + UXR) / 2, .9, 0); K.scene().add(bot);
      /* 玻璃管在浅背景下会整根隐形，只剩红柱「悬在空中」：补上下口沿 + 两条母线定形 */
      var tubeLine = new T.LineBasicMaterial({ color: 0x6f93ad, transparent: true, opacity: .6 });
      [UXL, UXR].forEach(function (ux) {
        [.03, 17.97].forEach(function (yy) {
          var pts = [];
          for (var i = 0; i < 32; i++) {
            var a = i / 32 * Math.PI * 2;
            pts.push(new T.Vector3(ux + Math.cos(a) * 1.0, yy, Math.sin(a) * 1.0));
          }
          K.scene().add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), tubeLine));
        });
        [-1, 1].forEach(function (s) {
          K.scene().add(new T.Line(new T.BufferGeometry().setFromPoints([
            new T.Vector3(ux + s * 1.0, 0, 0), new T.Vector3(ux + s * 1.0, 18, 0)]), tubeLine));
        });
      });
      /* 有色液柱：半透明暗红 + 半径收进玻璃内壁（.74 vs 管内径 1.0，留出玻璃缝），
         深度测试保持开启，不再把液柱画到玻璃管外面去；两侧高度差仍由 Δh 逐帧给出 */
      function liqMaterial() {
        return new T.MeshBasicMaterial({ color: 0xc0503f, transparent: true, opacity: .86,
          depthWrite: false, side: T.DoubleSide });
      }
      var liqL = new T.Mesh(new T.CylinderGeometry(.74, .74, 1, 18), liqMaterial());
      var liqR = new T.Mesh(new T.CylinderGeometry(.74, .74, 1, 18), liqMaterial());
      liqL.renderOrder = 4; liqR.renderOrder = 4;
      K.scene().add(liqL); K.scene().add(liqR); O.liqL = liqL; O.liqR = liqR;
      var botLiq = new T.Mesh(new T.CylinderGeometry(.74, .74, 6, 14), liqMaterial());
      botLiq.renderOrder = 4;
      botLiq.rotation.z = Math.PI / 2; botLiq.position.set((UXL + UXR) / 2, .9, 0); K.scene().add(botLiq);
      /* 液面高亮环：标出两侧液面位置，随 Δh 升降 */
      function meniscus(ux) {
        var m = new T.Mesh(new T.TorusGeometry(.75, .075, 8, 24),
          new T.MeshBasicMaterial({ color: 0xffd9c8, transparent: true, opacity: .95, depthWrite: false }));
        m.rotation.x = Math.PI / 2; m.position.set(ux, Y_MID, 0); m.renderOrder = 7;
        K.scene().add(m); return m;
      }
      O.menL = meniscus(UXL); O.menR = meniscus(UXR);
      /* 刻度板（贴在管后） */
      var board = makeScaleBoard(); board.position.set((UXL + UXR) / 2, Y_MID, -1.7);
      K.scene().add(board);
      /* 底座 + 夹环（不悬空）+ 接地 */
      var baseU = new T.Mesh(new T.BoxGeometry(10, 1, 5), P.MAT.steelD);
      baseU.position.set((UXL + UXR) / 2, .5, 0); K.scene().add(baseU);
      [UXL, UXR].forEach(function (ux) {
        var clip = new T.Mesh(new T.TorusGeometry(1.05, .14, 8, 18), P.MAT.steelD);
        clip.rotation.x = Math.PI / 2; clip.position.set(ux, 13, 0);
        clip.renderOrder = 8;   // 画在 depthTest:false 的液柱之后，夹环不被冲掉
        K.scene().add(clip);
      });
      P.ground((UXL + UXR) / 2, 0, 6);

      /* ══ 烧杯（右）：玻璃筒 + 水柱 + 液面 ══ */
      var cup = new T.Mesh(new T.CylinderGeometry(3.2, 3.0, 14, 28, 1, true), glass);
      cup.position.set(BX, 7, 0); K.scene().add(cup);
      var cupBot = new T.Mesh(new T.CylinderGeometry(3.0, 3.0, .4, 28), glass);
      cupBot.position.set(BX, .2, 0); K.scene().add(cupBot);
      var waterMat = new T.MeshPhysicalMaterial({ color: 0x9fd0e6, roughness: .15,
        metalness: 0, transparent: true, opacity: .5, side: T.DoubleSide });
      var water = new T.Mesh(new T.CylinderGeometry(3.0, 3.0, Y_SURF, 28), waterMat);
      water.position.set(BX, Y_SURF / 2, 0); K.scene().add(water); O.water = water;
      var top = new T.Mesh(new T.CircleGeometry(3.0, 28),
        new T.MeshStandardMaterial({ color: 0xbfe4f2, roughness: .25, metalness: 0,
          transparent: true, opacity: .75, side: T.DoubleSide }));
      top.rotation.x = -Math.PI / 2; top.position.set(BX, Y_SURF + .01, 0); K.scene().add(top);
      P.ground(BX, 0, 4);

      /* ══ 探头：金属盒 + 橡皮膜（绕膜中心转向，深度不变）+ 吊杆 ══ */
      var probe = new T.Group(); K.scene().add(probe); O.probe = probe;
      var box = new T.Mesh(new T.CylinderGeometry(.9, .9, 1.0, 20), P.MAT.steelD);
      box.position.y = .5; probe.add(box);                    // 盒在膜上方
      var mem = new T.Mesh(new T.CircleGeometry(.85, 20), P.MAT.rubber);
      mem.rotation.x = Math.PI / 2; probe.add(mem);           // 膜在原点、法线 -y
      var rim = new T.Mesh(new T.TorusGeometry(.86, .1, 8, 20), P.MAT.red);
      rim.rotation.x = Math.PI / 2; probe.add(rim);           // 红环标出橡皮膜
      var nip = new T.Mesh(new T.CylinderGeometry(.22, .22, .5, 10), P.MAT.steel);
      nip.position.y = 1.15; probe.add(nip);                  // 顶部气嘴（接软管）
      /* 吊杆：顶端固定、底端随探头深度伸缩 */
      O.rod = new T.Mesh(new T.CylinderGeometry(.12, .12, 1, 8), P.MAT.steel);
      K.scene().add(O.rod);
      var stand = P.stand(20, { baseW: 5, baseD: 4 });
      stand.position.set(BX, 0, -5.5); K.scene().add(stand);
      var arm = new T.Mesh(new T.BoxGeometry(.5, .5, 5.5), P.MAT.steel);
      arm.position.set(BX, 20.6, -2.75); K.scene().add(arm);
      P.ground(BX, -5.5, 4);

      /* ══ 橡胶软管（U 管右口 → 探头气嘴），每帧重建 ══ */
      O.hose = new T.Mesh(new T.TubeGeometry(
        new T.CatmullRomCurve3([new T.Vector3(UXR, 18.4, 0), new T.Vector3(0, 10, 0),
          new T.Vector3(BX, 12, 0)]), 12, .28, 8, false), P.MAT.rubber);
      K.scene().add(O.hose);

      K.tag(board, '刻度板', '读出 U 管两侧液面高度差 Δh（cm）');
      K.tag(O.probe, '探头', '橡皮膜中心深度 h = 液面 y − 膜 y；可转向但 Δp 不变');
      K.tag(O.water, '被测液体', '水 1000 / 盐水 1200 kg/m³');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      /* 探头真实升降与转向 */
      s._probeY += (s._targetY - s._probeY) * Math.min(1, dt * 4);
      var angT = s._dir === 1 ? Math.PI : (s._dir === 2 ? Math.PI / 2 : 0);
      s._angle += (angT - s._angle) * Math.min(1, dt * 5);
      var ph = physics(s);

      /* U 管液面：接探头的右管被压低、左管升高，体积守恒（差 = Δh） */
      var d = Math.max(-16, Math.min(16, ph.dH));
      var yL = Y_MID + d / 2, yR = Y_MID - d / 2;
      O.liqL.scale.y = yL; O.liqL.position.set(UXL, yL / 2, 0);
      O.liqR.scale.y = yR; O.liqR.position.set(UXR, yR / 2, 0);
      /* 液面高亮环跟随两侧液面 */
      if (O.menL) O.menL.position.y = yL;
      if (O.menR) O.menR.position.y = yR;

      /* 探头：绕膜中心转，膜始终在 y = _probeY（几何深度不随方向变） */
      O.probe.position.set(BX, s._probeY, 0);
      O.probe.rotation.x = s._angle;
      /* 吊杆 */
      var topY = 20.4, botY = s._probeY + 1.0, L = Math.max(.1, topY - botY);
      O.rod.scale.y = L; O.rod.position.set(BX, (topY + botY) / 2, 0);
      /* 软管端点随探头（气嘴）更新 */
      updateHose(new T.Vector3(UXR, 18.4, 0), P.port(O.probe, 0, 1.3, 0));
      /* 液体颜色随盐水/水切换 */
      O.water.material.color.setHex(s._salt ? 0x74aecb : 0x9fd0e6);
    }
  };

  function reset(s) {
    s._probeY = Y_SURF - 5; s._targetY = Y_SURF - 5; s._angle = 0;
    s._dir = 0; s._salt = false; s._press = 0; s.judged = false;
  }
  function setDepth(s, cm) { s._targetY = Y_SURF - cm; }

  K.boot({
    title: '探究液体压强与哪些因素有关',
    chip: '物理 · 鲁教版 · 八下 · 第七章 压强 · 第二节 液体压强',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 11, dist: 48, tx: 0, tz: 0, yaw: .2, pitch: .3 },
    reads: [['depth', '深度 h'], ['liquid', '液体'], ['delta', '高度差'],
            ['dp', '压强 Δp'], ['dir', '橡皮膜朝向']],
    values: function (s) {
      var ph = physics(s);
      return {
        depth: ph.h.toFixed(1) + ' cm',
        liquid: (s._salt ? '盐水 ' + RHO_S : '水 ' + RHO_W) + ' kg/m³',
        delta: ph.dH.toFixed(1) + ' cm',
        dp: ph.dp.toFixed(0) + ' Pa',
        dir: s._dir === 1 ? '朝上' : (s._dir === 2 ? '朝侧' : '朝下')
      };
    },
    steps: [
      { name: '气密性', title: '先检查压强计气密性',
        ask: '轻压橡皮膜，U形管液面应出现什么现象？',
        body: '<p><b>检查：</b>轻压探头橡皮膜，膜内气体压强升高，U 形管两侧应出现<b>明显高度差且稳定</b>；' +
          '松开后回到原处。若装置漏气，则无论怎么压都没有高度差——这是测量的前提。</p>' +
          '<p><b>模型：</b>压强计把橡皮膜处的压强差 Δp 转成 U 管液面差：' +
          '<b>Δh = P.model.manometerCm(Δp, ρ<sub>柱</sub>) = Δp/(ρ<sub>柱</sub>g)</b>，ρ<sub>柱</sub> = ' + RHO_MAN + ' kg/m³。' +
          '本按钮"轻压"施加附加压强 ' + P_PRESS + ' Pa，对应 Δh 增加 ' +
          P.model.manometerCm(P_PRESS, RHO_MAN).toFixed(1) + ' cm。</p>' +
          '<p><b>边界假设：</b>软管气密、U 管两臂等截面（液面一升一降各 Δh/2）、液体静止、忽略毛细作用。</p>',
        apply: function (s) { reset(s); s._probeY = Y_SURF; s._targetY = Y_SURF; },
        controls: [
          { type: 'btn', label: '① 轻压橡皮膜（看高度差）', onClick: function (s) { s._press = 1; } },
          { type: 'btn', label: '② 松开（回到原处）', onClick: function (s) { s._press = 0; } }
        ],
        cam: { tx: -3, ty: 12, tz: 0, dist: 40, yaw: .28, pitch: .34 } },
      { name: '深度', title: '改变深度，看压强变化',
        ask: '液体内部压强随深度怎样变化？',
        body: '<p><b>操作：</b>把探头真实降入水中不同深度（右侧读数 h 由几何 <b>h = 液面 y − 橡皮膜 y</b> 实时反算，不是滑块映射）。</p>' +
          '<p><b>模型：</b><b>Δp = P.model.hydroP(ρ, h) = ρgh</b>；' +
          '<b>Δh = P.model.manometerCm(Δp, ρ<sub>柱</sub>)</b>。两式相消得 <b>Δh = (ρ/ρ<sub>柱</sub>)·h</b>，' +
          '水中（ρ = ρ<sub>柱</sub> = ' + RHO_W + '）恰好 <b>Δh = h</b>。</p>' +
          '<p><b>由模型算：</b>h = 5 cm → Δp = ' + P.model.hydroP(RHO_W, 5).toFixed(0) + ' Pa、Δh = ' + P.model.manometerCm(P.model.hydroP(RHO_W, 5), RHO_MAN).toFixed(1) + ' cm；' +
          'h = 10 cm → Δp = ' + P.model.hydroP(RHO_W, 10).toFixed(0) + ' Pa、Δh = ' + P.model.manometerCm(P.model.hydroP(RHO_W, 10), RHO_MAN).toFixed(1) + ' cm。' +
          '<b>深度越大，压强越大</b>。</p>' +
          '<p><b>边界：</b>静止液体、ρ 均匀、h 从液面竖直量到橡皮膜中心；p = ρgh 与容器形状、液体总量无关。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '深度 5 cm', onClick: function (s) { setDepth(s, 5); } },
          { type: 'btn', label: '深度 10 cm', onClick: function (s) { setDepth(s, 10); } },
          { type: 'btn', label: '深度 12 cm', onClick: function (s) { setDepth(s, 12); } }
        ],
        cam: { tx: 0, ty: 12, tz: 0, dist: 46, yaw: .2, pitch: .32 } },
      { name: '方向', title: '同一深度，各方向压强相等',
        ask: '转动探头方向（上、下、侧），高度差会变吗？',
        body: '<p><b>操作：</b>保持 h = 10 cm 不变，转动探头让橡皮膜分别<b>朝下、朝上、朝侧</b>（真实转动，绕膜中心，深度不变）。</p>' +
          '<p><b>反例 / 易错点：</b>常误以为"膜朝下受上方水柱更多、压强更大"。实际上液体内部同一深度向<b>各个方向压强相等</b>（各向同性）：' +
          '模型 <b>Δp = ρgh</b> 中只有 ρ、g、h，<b>没有方向变量</b>，故三种朝向读数<b>完全相同</b>：' +
          'Δp = ' + P.model.hydroP(RHO_W, 10).toFixed(0) + ' Pa、Δh = ' + P.model.manometerCm(P.model.hydroP(RHO_W, 10), RHO_MAN).toFixed(1) + ' cm。</p>' +
          '<p><b>结论：</b>液体压强只随深度、密度变化，与方向无关；转动探头是验证各向同性的关键对照。</p>' +
          '<p><b>边界：</b>静止液体（流动液体不满足简单的 ρgh 各向同性）；橡皮膜足够小、可视为一点。</p>',
        apply: function (s) { reset(s); s._probeY = Y_SURF - 10; s._targetY = Y_SURF - 10; },
        controls: [
          { type: 'btn', label: '橡皮膜朝下', onClick: function (s) { s._dir = 0; } },
          { type: 'btn', label: '橡皮膜朝上', onClick: function (s) { s._dir = 1; } },
          { type: 'btn', label: '橡皮膜朝侧', onClick: function (s) { s._dir = 2; } }
        ],
        cam: { tx: 3, ty: 12, tz: 1, dist: 42, yaw: .22, pitch: .32 } },
      { name: '密度', title: '改变液体密度，看压强变化',
        ask: '深度相同时，盐水与水哪个压强大？',
        body: '<p><b>操作：</b>换用<b>盐水</b>（ρ = ' + RHO_S + ' kg/m³，颜色更深），在同一深度 h = 10 cm 比较高度差。</p>' +
          '<p><b>由模型算：</b>水 Δp = ' + P.model.hydroP(RHO_W, 10).toFixed(0) + ' Pa、Δh = ' + P.model.manometerCm(P.model.hydroP(RHO_W, 10), RHO_MAN).toFixed(1) + ' cm；' +
          '盐水 Δp = ' + P.model.hydroP(RHO_S, 10).toFixed(0) + ' Pa、Δh = ' + P.model.manometerCm(P.model.hydroP(RHO_S, 10), RHO_MAN).toFixed(1) + ' cm。' +
          '深度相同时，<b>密度越大，压强越大</b>。</p>' +
          '<p><b>规律：</b><b>p = ρgh</b> 只与 ρ、h、g 有关，与容器形状无关；U 管液柱密度 ρ<sub>柱</sub> 固定为 ' + RHO_MAN + '，故 Δh = (ρ/ρ<sub>柱</sub>)h 随 ρ 线性增大。</p>' +
          '<p><b>边界假设：</b>ρ 均匀、液体静止、g = ' + G + ' N/kg；本模型未计温度与溶解气体对密度的影响。</p>',
        apply: function (s) { reset(s); s._probeY = Y_SURF - 10; s._targetY = Y_SURF - 10; s._salt = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '换盐水', onClick: function (s) { s._salt = true; } },
          { type: 'btn', label: '换回水', onClick: function (s) { s._salt = false; } },
          { type: 'btn', label: '判定结论', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: 0, ty: 12, tz: 0, dist: 48, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '液体内部压强随深度？', opts: ['增大而增大', '增大而减小', '不变', '无规律'], ans: '增大而增大', why: '同种液体中，深度越大，压强越大（p=ρgh）。' },
        { q: '同一深度，各方向压强？', opts: ['相等', '向上最大', '向下最大', '向侧面最大'], ans: '相等', why: '液体向各个方向的压强相等（各向同性），与橡皮膜朝向无关。' },
        { q: '深度相同，盐水比水压强？', opts: ['更大', '更小', '相等', '不确定'], ans: '更大', why: '盐水密度更大，p=ρgh 中 ρ 更大则压强更大。' },
        { q: '液体压强公式？', opts: ['p=ρgh', 'p=F/S', 'p=ρg', 'p=mgh'], ans: 'p=ρgh', why: '液体压强 p = ρgh，与深度和密度有关。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
