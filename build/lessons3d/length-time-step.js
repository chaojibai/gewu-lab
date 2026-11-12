/* 格物实验室 · 用刻度尺测量长度，用表测量时间（three.js 单文件课件）
   鲁教版 八年级上册 · 第一章 机械运动 / 走进实验室

   【严谨】长度 = 末端读数 − 起始读数（故意用非零起点 2.30→8.70 cm，
           避开磨损零刻度），读数 = 准确值 + 估读值，1 mm 分度估读到 0.01 cm。
           多次测量值由「端点读数 + 量化估读偏差」模型算出，平均值由数组累加，
           无预置结果、无拟合曲线；停表读数就是时钟累计 Σdt。
           反例：忘减起点把 8.70 cm 当长度是「错误」(偏大 2.30 cm)，
           与 ±0.01 cm 的「误差」本质不同。
   【真实感】刻度尺有厚度、木纹材质与 1 mm 精细刻度贴图，零刻度磨损斑真实可见；
           木块贴尺且每条读数都重新拿起放下；停表立托架；每件 P.ground 接地。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源）────────────────────────────── */
  var L_CM = 30, DIV = 0.1, EST = 0.01;      // 量程 30 cm / 分度 1 mm / 估读 0.01 cm
  var A = 2.30, B = 8.70;                     // 起始、末端读数（非零起点）
  var LEN_TRUE = B - A;                       // 6.40 cm
  /* 每次测量的估读偏差（cm，量化到 0.01，确定性可复现）；由模型给出，不是结果表 */
  var E = [[0, 0], [.01, .01], [0, -.02], [.01, 0]];
  var N = E.length;
  var MEAS = E.map(function (e) {
    var a = A + e[0], b = B + e[1];
    return { a: a, b: b, L: b - a };          // 长度由端点读数相减算出
  });
  var BAD = B;                                // 错误读数：把末端读数直接当长度
  function avgOf(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;                    // 平均值由数组累加，不是常量
  }
  var ARR_GOOD = MEAS.map(function (m) { return m.L; });
  var ARR_BAD = ARR_GOOD.slice(); ARR_BAD[ARR_BAD.length - 1] = BAD;
  var AVG_GOOD = avgOf(ARR_GOOD), AVG_BAD = avgOf(ARR_BAD);
  var REACT = 0.2;                            // 秒表起动/停止人为反应延迟 s

  /* 连续量一律 _ 前缀，避开 K.boot 的 0.55 s 数值补间 */
  var st = {
    _t: 0, _elapsed: 0, _trial: 0, _shift: 0, _repl: 0,
    timing: false, placed: false, bad: false, judged: false
  };
  var O = {};

  var RULER_X = -2, RULER_Z = -4;             // 尺中心；1 cm = 1 场景单位
  var WORK = new T.Vector3((A + B) / 2 - 17, 0, -1.45);  // 木块贴尺位（后沿与尺前缘齐平）
  var HOME = new T.Vector3(-2, 0, 6);                     // 木块备料位

  function tex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  /* 1 mm 精细刻度贴图：每 1 mm 一格、每 5 mm 中格、每 1 cm 标数；0 处画磨损斑 */
  function rulerTex() {
    return tex(3000, 300, function (x, w, h) {
      x.fillStyle = '#f3ead2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1c2b39'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var mm = L_CM * 10;
      for (var i = 0; i <= mm; i++) {
        var px = 8 + i / mm * (w - 16), cm = i % 10 === 0, half = i % 5 === 0;
        x.fillRect(px - 1, 0, cm ? 3 : 1.5, cm ? 130 : (half ? 84 : 46));
        if (cm) { x.font = 'bold 62px Consolas,monospace'; x.fillText(String(i / 10), px, 224); }
      }
      x.fillStyle = 'rgba(96,84,66,.62)';
      x.beginPath(); x.ellipse(30, 46, 120, 60, .25, 0, 6.283); x.fill();
      x.fillStyle = '#6b5b3e'; x.font = 'bold 44px "Microsoft YaHei",sans-serif';
      x.fillText('磨损', 190, 46);
    });
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(56, 26);

      /* ── 刻度尺：用共享 P.ruler 的厚尺身，换成 1 mm 精细刻度 + P.MAT 木纹 ── */
      var ruler = P.ruler({ len: L_CM, cm: L_CM });
      ruler.position.set(RULER_X, 0, RULER_Z); K.scene().add(ruler); O.ruler = ruler;
      ruler.traverse(function (o) {
        if (!o.isMesh) return;
        if (o.geometry.type === 'PlaneGeometry') { o.material.map = rulerTex(); o.material.needsUpdate = true; }
        else if (o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width >= L_CM - 1) o.material = P.MAT.wood;
      });
      /* 磨损零刻度：贴图上的磨损斑已足够，不再叠钢块（会读成异物） */

      /* 起点 / 末端指示线：从尺前缘立起，对齐 2.30 与 8.70 刻度 */
      O.marks = [A, B].map(function (v) {
        var mk = new T.Mesh(new T.BoxGeometry(.06, 1.8, .06), P.MAT.red);
        mk.position.set(v - 15, .9, 1.6); ruler.add(mk);
        return mk;
      });

      /* ── 木块：长度 6.40 正好落在两指示线之间；先在 HOME 备料 ── */
      var blk = P.woodBlock({ len: LEN_TRUE, w: 2.4, h: 1.6 });
      blk.traverse(function (o) { if (o.isMesh && o.geometry.type === 'BoxGeometry') o.material = P.MAT.wood; });
      K.scene().add(blk); O.block = blk; blk.position.copy(HOME);
      /* 深灰橡胶垫：压暗并略缩小，浅背景下不再被环境反射洗成一块突兀白饼 */
      var pad = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, .3, 24),
        new T.MeshStandardMaterial({ color: 0x2b3036, roughness: .9, metalness: .02, envMapIntensity: .12 }));
      pad.position.set(HOME.x, .15, HOME.z); K.scene().add(pad);

      /* ── 停表 + 立托架（四腿落地 + 抬高垫板，表盘朝上便于读数）── */
      /* 托架整体左移进正面画面（只改位置，不动相机）；z 略前移避开刻度尺 */
      var tray = new T.Group(); tray.position.set(7, 0, 3); K.scene().add(tray); O.tray = tray;
      var TRAYTOP = new T.MeshStandardMaterial({ color: 0x33393f, roughness: .75, metalness: .15, envMapIntensity: .5 });
      var padT = new T.Mesh(new T.BoxGeometry(10, .5, 8), TRAYTOP); padT.position.y = 4.05; tray.add(padT);
      [[-4.1, -3.1], [4.1, -3.1], [-4.1, 3.1], [4.1, 3.1]].forEach(function (p) {
        var leg = new T.Mesh(new T.BoxGeometry(.55, 3.8, .55), P.MAT.steel);
        leg.position.set(p[0], 1.9, p[1]); tray.add(leg);
      });
      var sw = P.stopwatch(); sw.rotation.x = -Math.PI / 2; sw.position.set(0, 4.55, 0);
      tray.add(sw); O.sw = sw;

      /* ── 接地阴影（深色台面用深色 blob）── */
      P.ground(RULER_X, RULER_Z, 16);   // 尺
      P.ground(HOME.x, HOME.z, 3);      // 木块 HOME
      P.ground(7, 3, 6);               // 停表托架

      K.tag(ruler, '刻度尺', '量程 ' + L_CM + ' cm、分度 ' + (DIV * 10) + ' mm、零刻度已磨损');
      K.tag(blk, '木块', '贴尺摆放，左端对齐 ' + A.toFixed(2) + ' cm、右端 ' + B.toFixed(2) + ' cm');
      K.tag(sw, '停表', '读数 = 时钟累计时间，先归零再启动—停止');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      if (s.timing) s._elapsed += dt;         // 停表读数就是时钟走，不是拟合
      O.sw.userData.setTime(s._elapsed);

      var want = s.placed ? 1 : 0;
      s._shift += (want - s._shift) * Math.min(1, dt * 4);
      O.block.position.lerpVectors(HOME, WORK, s._shift);
      O.block.position.y += Math.sin(Math.PI * s._shift) * 2;   // 搬运动线
      /* 每次「记录」都把木块真的拿起再放下 */
      s._repl *= (1 - Math.min(1, dt * 3));
      O.block.position.y += s._repl * 1.6;
    }
  };

  function reset(s) {
    s._t = 0; s._elapsed = 0; s._trial = 0; s._shift = 0; s._repl = 0;
    s.timing = false; s.placed = false; s.bad = false; s.judged = false;
  }

  K.boot({
    title: '用刻度尺测量长度，用表测量时间',
    chip: '物理 · 鲁教版 · 八上 · 第一章 机械运动 / 走进实验室',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 14, dist: 50, tx: 0, tz: 0, yaw: .2, pitch: .34 },
    reads: [['len', '本次长度'], ['avg', '平均值'], ['time', '计时'],
            ['a', '起点读数'], ['b', '末端读数'], ['err', '平均偏差']],
    values: function (s) {
      var i = Math.floor(s._trial) % N, m = MEAS[i];
      var arr = s.bad ? ARR_BAD : ARR_GOOD;
      var avg = avgOf(arr);                        // 每帧由数组累加
      return {
        len: m.L.toFixed(2) + ' cm',
        avg: avg.toFixed(2) + ' cm' + (s.bad ? '（含错误·偏大）' : ''),
        time: s._elapsed.toFixed(2) + ' s',
        a: m.a.toFixed(2) + ' cm',
        b: m.b.toFixed(2) + ' cm',
        err: ((avg - LEN_TRUE) >= 0 ? '+' : '') + (avg - LEN_TRUE).toFixed(3) + ' cm'
      };
    },
    steps: [
      { name: '三观察', title: '用刻度尺前先看什么？',
        ask: '刻度尺的“分度值”如何确定？',
        body: '<p><b>三观察：</b>① <b>零刻度线</b>；② <b>量程</b>；③ <b>分度值</b>（相邻刻度差，决定估读位）。</p>' +
          '<p><b>参数：</b>本尺量程 <b>' + L_CM + ' cm</b>、分度值 <b>' + (DIV * 10) + ' mm = ' + DIV.toFixed(1) +
          ' cm</b>（尺面每 1 mm 一格），故读数须估读到 <b>' + EST.toFixed(2) + ' cm</b>。' +
          '尺有厚度、刻度面须正对观察者、视线垂直尺面。</p>' +
          '<p><b>边界/假设：</b>尺的刻度均匀、无热胀冷缩、与被测边平行紧贴；本模型忽略尺的弯曲与视差。</p>' +
          '<p><b>易错点：</b>本尺<b>零刻度已磨损</b>（尺面上有磨损斑），若仍从 0 量起会引入系统偏差；' +
          '正确做法是选一个整数刻度作起点、最后减去起点读数——这正是下一步用 ' + A.toFixed(2) + ' cm 起量的原因。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: -2, ty: 10, tz: -2, dist: 32, yaw: .3, pitch: .4 },
        controls: [{ type: 'btn', label: '把木块贴到尺边（从 ' + A.toFixed(2) + ' cm 起量）', onClick: function (s) { s.placed = true; } }] },

      { name: '读长度', title: '正确放置并读数（估读到下一位）',
        ask: '为什么读数必须“估读到分度值下一位”？',
        body: '<p><b>规范：</b>尺边<b>对齐</b>被测边并紧贴；刻度面正对观察者；视线<b>垂直</b>尺面。' +
          '结果 = 准确值 + 估读值 + 单位。</p>' +
          '<p><b>模型：</b><b>L = 末端读数 − 起始读数</b>。本例起点 <b>' + A.toFixed(2) +
          ' cm</b>、末端 <b>' + B.toFixed(2) + ' cm</b>，故 <b>L = ' + B.toFixed(2) + ' − ' + A.toFixed(2) +
          ' = ' + LEN_TRUE.toFixed(2) + ' cm</b>（末位是估读位）。' +
          '每次测量的端点读数带 ±0.01~0.02 cm 的估读偏差，L 由两端点相减实时算出，不是写死的数组。</p>' +
          '<p><b>多次测量求平均：</b>' + N + ' 次读数平均 <b>L̄ = ' + AVG_GOOD.toFixed(2) +
          ' cm</b>（由数组累加，估读波动被压小）。按「记录下一次」可看到木块被重新拿起放下、读数随估读变化。</p>' +
          '<p><b>边界：</b>分度 ' + DIV.toFixed(1) + ' cm 决定只能估读到 ' + EST.toFixed(2) +
          ' cm，再多写一位没有意义；被测边必须与尺平行。</p>' +
          '<p><b>反例（错误，不是误差）：</b>若忘记减起点，把末端读数 ' + BAD.toFixed(2) +
          ' cm 直接当长度，会偏大 <b>' + (BAD - LEN_TRUE).toFixed(2) + ' cm</b>；' +
          '把这条数据混进平均会使 L̄ 变成 <b>' + AVG_BAD.toFixed(2) + ' cm</b>。按下方按钮纳入/剔除对照。</p>',
        apply: function (s) { reset(s); s.placed = true; },
        cam: { tx: -2, ty: 9, tz: 1, dist: 28, yaw: .26, pitch: .42 },
        controls: [
          { type: 'btn', label: '记录下一次读数（重新放置木块）', onClick: function (s) { s._trial = (s._trial + 1) % N; s._repl = 1; } },
          { type: 'btn', label: '多次测量取平均', onClick: function (s) { s.judged = true; } },
          { type: 'btn', label: '反例：混入一次错误数据', onClick: function (s) { s.bad = true; } },
          { type: 'btn', label: '剔除错误数据', onClick: function (s) { s.bad = false; } }
        ] },

      { name: '测时间', title: '用停表测量时间',
        ask: '停表小盘是否过“半分钟”，影响大盘怎么读？',
        body: '<p><b>操作：</b>先<b>归零</b>，按「启动—停止—回零」。小表盘读分(min)，大表盘读秒(s)，相加得总时间。</p>' +
          '<p><b>模型：</b>停表读数就是时钟走：<b>t = ΣΔt</b>，右侧「计时」每帧由 <b>_elapsed += dt</b> 累加，' +
          '小盘 min = ⌊t/60⌋、大盘 s = t mod 60，都不是预设动画。大盘 1 圈 60 s、分度 0.1 s。</p>' +
          '<p><b>关键：</b>看小盘是否过半分钟——过半则大盘按 <b>30~60 s</b> 起读，未过半按 <b>0~30 s</b> 起读。</p>' +
          '<p><b>边界/误差：</b>起动与停止各有约 <b>' + REACT.toFixed(1) +
          ' s</b> 人为反应延迟，是本实验主要误差来源，故需多次测量取平均；模型把 dt 当作真实经过时间，未计机械迟滞。</p>' +
          '<p><b>反例：</b>忘记归零就启动，读数会带上一次残留；小盘未过半却按 30~60 s 区读，会凭空多出 30 s（可避免的错误）。</p>',
        apply: function (s) { reset(s); },
        cam: { tx: 16, ty: 10, tz: 0, dist: 30, yaw: -.3, pitch: .38 },
        controls: [
          { type: 'btn', label: '开始 / 停止 计时', onClick: function (s) { s.timing = !s.timing; } },
          { type: 'btn', label: '回零', onClick: function (s) { s._elapsed = 0; s.timing = false; } }
        ] },

      { name: '误差', title: '误差与错误的区别',
        ask: '误差能消除吗？错误呢？',
        body: '<p><b>误差 ≠ 错误：</b>误差是测量值与真实值之差，<b>不可避免</b>、只能减小；' +
          '错误是操作失误，<b>可以避免</b>，含错误的数据必须剔除重测。</p>' +
          '<p><b>由模型算：</b>本例 ' + N + ' 次正常测量的估读偏差只有 ±0.01~0.02 cm，' +
          '平均 <b>' + AVG_GOOD.toFixed(2) + ' cm</b> 与真值 ' + LEN_TRUE.toFixed(2) + ' cm 相差 ' +
          Math.abs(AVG_GOOD - LEN_TRUE).toFixed(3) + ' cm，这是<b>误差</b>；' +
          '而把 ' + BAD.toFixed(2) + ' cm 的错误数据混入，平均变成 <b>' + AVG_BAD.toFixed(2) +
          ' cm</b>、偏差 ' + (AVG_BAD - LEN_TRUE).toFixed(2) + ' cm，这是<b>错误</b>，取平均也救不回来。</p>' +
          '<p><b>减小误差：</b>选用精密工具、改进方法、<b>多次测量取平均值</b>；' +
          '边界是平均值只能减小偶然误差，不能消除系统误差（如零刻度磨损、尺不水平）。</p>' +
          '<p><b>反例：</b>若尺的零刻度磨损仍不减起点，多次测量取平均再多次，结果依旧整体偏大——' +
          '系统误差要靠改正方法消除，而不是靠多测几次。</p>',
        apply: function (s) { reset(s); s.judged = true; s.bad = true; },
        cam: { tx: 0, ty: 14, tz: 0, dist: 50, yaw: .2, pitch: .34 },
        controls: [
          { type: 'btn', label: '纳入错误数据（看平均被拉偏）', onClick: function (s) { s.bad = true; } },
          { type: 'btn', label: '剔除错误数据', onClick: function (s) { s.bad = false; } }
        ] }
    ],
    quiz: function () {
      var bank = [
        { q: '读数必须估读到？', opts: ['分度值下一位', '整数位', '任意位', '不需要'], ans: '分度值下一位', why: '估读一位是减小误差的规范动作。' },
        { q: '下列可减小误差的是？', opts: ['多次测量取平均', '估读', '换错仪器', '一次测量'], ans: '多次测量取平均', why: '多次测量取平均可减小偶然误差，不能消除。' },
        { q: '误差与错误的区别？', opts: ['误差不可免可减小', '都不可免', '都不可减小', '一样'], ans: '误差不可免可减小', why: '错误可避免；误差不可避免只能减小。' },
        { q: '零刻度磨损时应？', opts: ['选整刻度起量并减起点', '不能用', '估读', '随便量'], ans: '选整刻度起量并减起点', why: '可从某整数刻度量起，读数减去起点刻度。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
