/* 格物实验室 · 测量物体运动的速度（three.js 单文件课件）
   鲁教版 八年级上册 · 第一章 机械运动 · 第三节 速度的测量

   【严谨】小车按 a = g(sinθ − μcosθ) 做初速为零的匀加速直线运动：
           x(t) = ½at²，v(t) = at，走完 s 用时 t = √(2s/a)。
           秒表、路程、瞬时速度、全程/分段平均速度全部由模型实时算出，
           无拟合曲线、无硬编码结果；并给出模型边界与「误按匀速」反例。
   【真实感】木纹斜面 + 金属包边、刻度尺沿板敷设、终点金属片带支座、
           每件器材接地阴影、四轮随位移真实滚动、停表立托架、备料动线。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源，所有读数由此推出）─────────────── */
  var TH = 6;                 // 斜面倾角（°）——足够缓，时间才测得准
  var MU = 0.05;              // 小车滚动阻力等效系数（非滑动摩擦系数）
  var S = 48;                 // 小车中心行程 = 路程 s（cm）
  var LEN = S + 8;            // 板长留两端余量
  var W = 9;                  // 板宽
  var A = P.model.inclineA(TH, MU);            // cm/s²
  var T_END = P.model.inclineT(S, A);          // 全程时间
  var T_HALF = P.model.inclineT(S / 2, A);     // 走完前半程的时刻
  var V_UP = (S / 2) / T_HALF;
  var V_DOWN = (S / 2) / (T_END - T_HALF);
  var V_MEAN = S / T_END;
  var V_END = P.model.inclineV(T_END, A);
  var X0 = S / 2, X1 = -S / 2;                // 板局部 x：高端 → 低端

  /* 连续量用 _ 前缀，避开 K.boot 的步骤补间 */
  var st = { _t: 0, _after: 0, go: false, showSeg: true, wrong: false, judged: false };
  var O = {};

  /* 沿板敷设的刻度尺：CanvasTexture，每 1 cm 一格、每 5 cm 标数 */
  function makeScale(len) {
    var cv = document.createElement('canvas'); cv.width = len * 20; cv.height = 44;
    var x = cv.getContext('2d');
    x.fillStyle = '#f6f2e6'; x.fillRect(0, 0, cv.width, cv.height);
    x.strokeStyle = '#8c939a'; x.fillStyle = '#1c2b39';
    x.textAlign = 'center'; x.font = 'bold 20px Consolas,monospace';
    for (var i = 0; i <= len; i++) {
      var px = i * 20 + 1;
      x.lineWidth = (i % 10 === 0) ? 3 : (i % 5 === 0 ? 2 : 1);
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, i % 10 === 0 ? 26 : (i % 5 === 0 ? 19 : 12)); x.stroke();
      if (i % 10 === 0) x.fillText(String(i), px, 41);
    }
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    var m = new T.Mesh(new T.PlaneGeometry(len, 2.2), new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2;   // 法线朝 +y，贴在板顶面
    return m;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(78, 28);

      /* ── 斜面：木纹板 + 金属包边 + 沿板刻度尺 ── */
      var ramp = P.ramp({ len: LEN, w: W, angle: TH });
      K.scene().add(ramp); O.ramp = ramp;
      var board = ramp.userData.board; board.material = P.MAT.wood; O.board = board;
      [-1, 1].forEach(function (s) {
        var edge = new T.Mesh(new T.BoxGeometry(LEN, .5, .3), P.MAT.steel);
        edge.position.set(0, .35, s * (W / 2 + .1)); board.add(edge);
      });
      var ruler = makeScale(LEN);
      ruler.position.set(0, .36, W / 2 - 1.4); board.add(ruler); O.ruler = ruler;

      /* ── 小车：四轮随位移真实滚动（深色橡胶轮 + 前撞板）── */
      var cart = P.cart({ len: 6, w: 4.4 });
      board.add(cart); O.cart = cart; O.wheels = [];
      cart.traverse(function (o) {
        if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop > 1) {
          o.material = new T.MeshStandardMaterial({ color: 0x2c3238, roughness: .85, metalness: .05 });
          O.wheels.push(o);
        }
      });
      var bumper = new T.Mesh(new T.BoxGeometry(.25, 1.2, 4.2), P.MAT.steel);
      bumper.position.set(-3.05, 1.5, 0); cart.add(bumper);
      /* 加厚车板 + 顶面深色挡光片：正面不再只读成「两个轮子加一小块」 */
      var DECKM = new T.MeshStandardMaterial({ color: 0x9c7638, roughness: .8, metalness: .04, envMapIntensity: .3 });
      var deck = new T.Mesh(new T.BoxGeometry(6.2, 1.0, 4.6), DECKM);
      deck.position.y = 3.1; cart.add(deck);
      var FINM = new T.MeshStandardMaterial({ color: 0x22282e, roughness: .78, metalness: .1, envMapIntensity: .3 });
      var fin = new T.Mesh(new T.BoxGeometry(.3, 1.7, 4.0), FINM);
      fin.position.set(-1.5, 4.4, 0); cart.add(fin);
      cart.position.set(X0, .35, 0);   // 轮底落在板顶面 y=.3，消除悬空

      /* ── 终点金属片：L 形挡板 + 底座；备料在台面上，装好才上斜面 ── */
      var plate = new T.Group();
      var face = new T.Mesh(new T.BoxGeometry(.6, 3.4, W - 1), P.MAT.steel);
      face.position.y = 2.2; plate.add(face);
      var foot = new T.Mesh(new T.BoxGeometry(2.4, .5, W - 1), P.MAT.steelD);
      foot.position.y = .25; plate.add(foot);
      var boss = new T.Mesh(new T.CylinderGeometry(.5, .5, 1.2, 12), P.MAT.brass);
      boss.rotation.x = Math.PI / 2; boss.position.set(1.0, 3.0, W / 2 - 1); plate.add(boss);
      K.scene().add(plate); O.plate = plate;
      ramp.updateMatrixWorld(true);
      O.plateWorkW = board.localToWorld(new T.Vector3(X1 - 3.4, .3, 0)); // 装到板低端
      O.plateHomeW = new T.Vector3(-34.5, 0, 5.5);                       // 备料：台面左前
      plate.position.copy(O.plateHomeW);

      /* ── 停表：托盘 + 四腿立架，表盘朝上便于读数；整体左移进正面画面 ── */
      var tray = new T.Group(); tray.position.set(10, 0, -9); K.scene().add(tray);
      var TRAYTOP = new T.MeshStandardMaterial({ color: 0x33393f, roughness: .75, metalness: .15, envMapIntensity: .5 });
      var pad = new T.Mesh(new T.BoxGeometry(10, .5, 8), TRAYTOP); pad.position.y = 4.05; tray.add(pad);
      var sw = P.stopwatch(); sw.rotation.x = -Math.PI / 2; sw.position.set(0, 4.55, 0); tray.add(sw); O.sw = sw;
      [[-4.1, -3.1], [4.1, -3.1], [-4.1, 3.1], [4.1, 3.1]].forEach(function (p) {
        var leg = new T.Mesh(new T.BoxGeometry(.55, 3.8, .55), P.MAT.steelD);
        leg.position.set(p[0], 1.9, p[1]); tray.add(leg);
      });

      /* ── 接地阴影（深色台面用深色 blob）── */
      P.ground(0, 0, 26); P.ground(10, -9, 6); P.ground(-34.5, 5.5, 3);
      K.tag(O.cart, '小车', '由静止释放，沿斜面匀加速下滑；轮子随位移滚动');
      K.tag(O.plate, '终点金属片', '小车撞击即停表，标记路程终点');
      K.tag(O.sw, '停表', '记录小车从释放到撞击的真实时间');
      K.tag(O.ruler, '刻度尺', '沿斜面敷设，直接读出路程 s');
      O.ready = true;
    },

    update: function (dt, s) {
      /* 时钟推进：到达终点即停表，时间不再增长；_after 单独记撞击后经过 */
      if (s.go && s._t < T_END) s._t = Math.min(T_END, s._t + dt);
      if (s.go && s._t >= T_END) s._after = Math.min(1, s._after + dt);
      var t = s._t;
      var x = P.model.inclineX(t, A);                  // 已走位移（cm）
      O.cart.position.x = X0 - x;
      O.wheels.forEach(function (w) { w.rotation.z = -x / 1.1; });  // 纯滚动：θ = s / r
      O.sw.userData.setTime(t);

      /* 备料动线：第 1 步从台面备料位装到斜面低端，之后保持装好 */
      var target = s.showSeg ? O.plateWorkW : O.plateHomeW;
      O.plate.position.lerp(target, Math.min(1, dt * 6));

      /* 撞击瞬间金属片微振（纯视觉，不改物理读数） */
      O.plate.scale.y = (s._after > 0 && s._after < .18) ? 1 + .05 * Math.sin(s._after * 90) : 1;
    }
  };

  function reset(s) { s._t = 0; s._after = 0; s.go = false; s.showSeg = true; s.wrong = false; s.judged = false; }

  K.boot({
    title: '测量物体运动的速度',
    chip: '物理 · 鲁教版 · 八上 · 第一章 机械运动 · 第三节 速度的测量',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 18, dist: 84, tx: 10, tz: 0, yaw: .2, pitch: .3 },
    reads: [['s', '已走 s'], ['t', '时间 t'], ['v', '瞬时速度 v'], ['vbar', '平均 v̄'], ['seg', '分段速度']],
    values: function (s) {
      var t = s._t, x = P.model.inclineX(t, A);
      var seg = s.wrong
        ? (V_MEAN.toFixed(1) + ' / ' + V_MEAN.toFixed(1) + '（匀速假设·错）')
        : (V_UP.toFixed(1) + ' / ' + V_DOWN.toFixed(1) + ' cm/s');
      return {
        s: x.toFixed(1) + ' cm',
        t: (s.go || t > 0) ? t.toFixed(2) + ' s' : '—',
        v: (s.go || t > 0) ? P.model.inclineV(t, A).toFixed(1) + ' cm/s' : '—',
        vbar: (t > 0) ? (x / t).toFixed(1) + ' cm/s' : (s.wrong ? V_MEAN.toFixed(1) + ' cm/s' : '—'),
        seg: seg
      };
    },
    steps: [
      { name: '搭斜面', title: '搭缓斜面、沿板敷设刻度尺、装终点金属片',
        ask: '斜面为什么要“足够缓”？',
        body: '<p><b>操作：</b>木板搭成 <b>θ = ' + TH + '°</b> 的缓斜面，沿板敷设刻度尺，低端装金属片；量出小车中心行程 <b>s = ' + S + ' cm</b>。</p>' +
          '<p><b>模型：</b>小车受重力沿斜面分量与滚动阻力，<b>a = g(sinθ − μcosθ)</b>，取 μ = ' + MU + '（等效滚动阻力系数，<b>不是</b>滑动摩擦系数）。本模型算得 a ≈ <b>' + A.toFixed(1) + ' cm/s²</b>。</p>' +
          '<p><b>边界：</b>该式只在 θ、μ 恒定且小车纯滚动时成立；θ 过大则下滑太快，秒表反应时间（约 0.2 s）占比过大，测量失效——这正是要搭缓斜面的原因。</p>',
        apply: function (s) { reset(s); s.showSeg = false; },
        controls: [{ type: 'btn', label: '把金属片推到终点位', onClick: function (s) { s.showSeg = true; } }],
        cam: { tx: 10, ty: 20, tz: 0, dist: 88, yaw: .2, pitch: .38 } },
      { name: '释放计时', title: '由静止释放，秒表记录真实时间',
        ask: '为什么每次释放位置和方式必须一致？',
        body: '<p><b>操作：</b>小车从高端<b>由静止</b>释放，秒表从 0 走起，撞击金属片即停表。</p>' +
          '<p><b>读数由模型算：</b>x(t) = ½at²，v(t) = at；右侧 <b>s / t / v</b> 每帧由此式实时更新，不是预设动画。走完 s = ' + S + ' cm 的时间 <b>t = √(2s/a) ≈ ' + T_END.toFixed(2) + ' s</b>。</p>' +
          '<p><b>控制变量：</b>释放位置、方式与初速（= 0）一致，各次结果才可比。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '① 由静止释放（自动计时）', onClick: function (s) { s._t = 0; s.go = true; } }],
        cam: { tx: 10, ty: 15, tz: 2, dist: 66, yaw: .22, pitch: .32 } },
      { name: '算速度', title: '平均速度 v̄ = s / t，及其与瞬时速度的区别',
        ask: '“平均速度”描述的是哪一段？等于末速度吗？',
        body: '<p><b>公式：</b><b>v̄ = s / t</b>。由模型算得 v̄ ≈ <b>' + V_MEAN.toFixed(1) + ' cm/s</b>，而到达终点时的瞬时速度 v(T) = aT ≈ <b>' + V_END.toFixed(1) + ' cm/s</b>。</p>' +
          '<p><b>结论：</b>初速为零的匀加速运动中 <b>v(T) = 2v̄</b>，二者<b>不相等</b>；平均速度是对整段的整体描述，不是某一时刻的速度。</p>' +
          '<p><b>误差：</b>秒表起动/停止各约 0.2 s 的人为延迟，是本实验主要误差来源；故需多次测量取平均。</p>',
        apply: function (s) { reset(s); s._t = T_END; s.go = true; s.showSeg = true; },
        cam: { tx: 10, ty: 16, tz: 0, dist: 74, yaw: .2, pitch: .32 } },
      { name: '分段比', title: '上、下半段平均速度：真实模型 vs 错误「匀速」假设',
        ask: '小车下半段平均速度比上半段大还是小？为什么？',
        body: '<p><b>由模型算：</b>走完前半程的时刻 t₁ = √(s/a) ≈ ' + T_HALF.toFixed(2) + ' s，故 上半段 <b>' + V_UP.toFixed(1) + ' cm/s</b>，下半段 <b>' + V_DOWN.toFixed(1) + ' cm/s</b>——下半段明显<b>更大</b>（小车在加速）。</p>' +
          '<p><b>反例：</b>若误以为小车<b>匀速</b>，则两段都等于 ' + V_MEAN.toFixed(1) + ' cm/s，与实测不符；可按下方按钮切换对照，再切回真实模型。</p>' +
          '<p><b>拓展：</b>频闪照片、打点计时器能更精细地研究变速运动；本模型未计入空气阻力。</p>',
        apply: function (s) { reset(s); s._t = T_END; s.go = true; s.showSeg = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '误按「匀速」假设（反例）', onClick: function (s) { s.wrong = true; } },
          { type: 'btn', label: '回到真实匀加速模型', onClick: function (s) { s.wrong = false; } }
        ],
        cam: { tx: 10, ty: 17, tz: 0, dist: 78, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '平均速度公式是？', opts: ['v=s/t', 'v=t/s', 'v=s·t', 'v=s−t'], ans: 'v=s/t', why: '平均速度等于该段路程除以所用时间。' },
        { q: '斜面要搭得缓，主要是为了？', opts: ['延长运动时间便于计时', '减小摩擦', '增大速度', '好看'], ans: '延长运动时间便于计时', why: '缓斜面使 a 减小、t 增大，秒表反应误差占比下降。' },
        { q: '初速为零的匀加速运动，末速度与平均速度关系是？', opts: ['v=2v̄', 'v=v̄', 'v=v̄/2', '无关'], ans: 'v=2v̄', why: 'v(T)=aT，v̄=s/T=½aT，故 v(T)=2v̄。' },
        { q: '小车下半段平均速度与上半段相比？', opts: ['更大', '更小', '相等', '为零'], ans: '更大', why: '加速下滑，同样的半程用时更短，平均速度更大。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
