/* 格物实验室 · 探究滑动摩擦力大小与哪些因素有关（three.js 单文件课件）
   鲁教版 八年级下册 · 第六章 力与运动 · 第四节 摩擦力

   【严谨】水平面 N = mg = P.model.weightN(0.2 + 0.05n) = 2.0 + 0.5n N
           （每砝码 50 g → 0.5 N，原代码 2.0 + 1.0n 与质量矛盾、已纠正）；
           f = P.model.friction(μ, N) = μN，μ = 木板 .30 / 棉布 .40 / 毛巾 .50。
           匀速时 a = 0，F拉 = f（平衡力，示数即摩擦力）；
           加速时由牛顿第二定律 F拉 − f = ma → F拉 = f + ma ≠ f（反例）。
           读数全部由模型实时算，无 pressN·k·0.6 之类的拟合映射。
   【真实感】按钮触发后木块以真实速度沿 x 平移、测力计同速移动，连接线
           每帧用 P.port 取两端重算保持绷紧；砝码从 HOME 搬到木块顶并随块运动；
           三面用木纹 / 斜纹 / 毛圈三种不同 CanvasTexture；测力计水平 + 滑座支撑；
           材质按 P.MAT、每件落地器材 P.ground 接地。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源）────────────────────────────── */
  var G       = P.model.gN;                 // 10 N/kg
  var M_BLOCK = 0.20;                       // 木块质量 kg
  var M_W     = 0.05;                       // 每个砝码 50 g = 0.05 kg
  var W_W     = P.model.weightN(M_W);       // 0.5 N / 个
  var N_W     = 4;                          // 砝码池
  var SURF = [
    { name: '木板', mu: .30 },
    { name: '棉布', mu: .40 },
    { name: '毛巾', mu: .50 }
  ];
  var V_PULL = 6;                           // 匀速速度 cm/s
  var A_ACC  = 0.5;                         // 加速对照加速度 m/s²（= 50 cm/s²）
  var X0 = -8, X_END = 8;                   // 木块起点 / 终点（往复演示）
  var GAP = 10;                             // 测力计与木块中心间距（连接线定长）
  var HOME_W_X = -13;                       // 砝码备料托盘 x
  var UP = new T.Vector3(0, 1, 0);

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = {
    _n: 0, _surface: 0, _moving: false, _accel: false,
    _x: 0, _dir: 1, _v: V_PULL, judged: false, _t: 0
  };
  var O = {};

  /* 模型：N = mg，f = μN，F拉 = f + ma */
  function physics(s) {
    var m  = M_BLOCK + M_W * s._n;
    var N  = P.model.weightN(m);
    var mu = SURF[s._surface].mu;
    var f  = P.model.friction(mu, N);
    var a  = (s._moving && s._accel) ? A_ACC : 0;
    var Fpull = f + m * a;
    return { N: N, mu: mu, f: f, Fpull: Fpull, a: a, active: s._moving };
  }

  /* 三种接触面：木纹 / 棉布斜纹 / 毛巾毛圈（不只是换颜色） */
  function makeTex(kind) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var x = cv.getContext('2d');
    if (kind === 0) {
      x.fillStyle = '#b07a3c'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(70,40,12,.45)';
      for (var i = 0; i < 24; i++) {
        x.lineWidth = 1 + Math.random() * 2; x.beginPath();
        var y = Math.random() * 256;
        x.moveTo(0, y); x.bezierCurveTo(80, y + 8, 170, y - 8, 256, y + 3); x.stroke();
      }
    } else if (kind === 1) {
      x.fillStyle = '#9fb89a'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(60,90,60,.35)'; x.lineWidth = 1;
      for (var a = -256; a < 512; a += 8) { x.beginPath(); x.moveTo(a, 0); x.lineTo(a + 256, 256); x.stroke(); }
      for (var b = -256; b < 512; b += 8) { x.beginPath(); x.moveTo(0, b); x.lineTo(256, b - 256); x.stroke(); }
    } else {
      x.fillStyle = '#e8e2d0'; x.fillRect(0, 0, 256, 256);
      for (var k = 0; k < 900; k++) {
        x.fillStyle = Math.random() > .5 ? 'rgba(180,170,140,.55)' : 'rgba(255,255,250,.6)';
        x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 0, 6.283); x.fill();
      }
    }
    var t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 2); t.anisotropy = 4;
    return t;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(52, 20);

      /* ── 接触面垫（材质按 P.MAT.wood，换纹理）── */
      O.tex = [makeTex(0), makeTex(1), makeTex(2)];
      var matMat = P.MAT.wood.clone(); matMat.map = O.tex[0]; matMat.needsUpdate = true;
      var mat = new T.Mesh(new T.BoxGeometry(34, .3, 8), matMat);
      mat.position.set(0, .15, 0); K.scene().add(mat); O.mat = mat; O.lastSurf = 0;
      P.ground(0, 0, 13);

      /* ── 木块（坐在垫顶 y = .3，不悬空）── */
      var blk = P.woodBlock({ len: 7, w: 4, h: 3 });
      blk.position.set(X0, .3, 0); K.scene().add(blk); O.blk = blk;
      var eyeB = new T.Mesh(new T.TorusGeometry(.4, .12, 8, 16), P.MAT.brass);
      eyeB.position.set(3.5, 1.5, 0); eyeB.rotation.y = Math.PI / 2; blk.add(eyeB);
      /* 挂环座：小螺钉底座，让挂环有连接而不是凭空贴在木块端面上 */
      var eyeBase = new T.Mesh(new T.CylinderGeometry(.26, .26, .18, 12), P.MAT.steelD);
      eyeBase.rotation.z = Math.PI / 2; eyeBase.position.set(3.45, 1.5, 0); blk.add(eyeBase);
      O.blockShadow = P.ground(X0, 0, 3);

      /* ── 砝码池：始终存在，HOME → 木块顶真实搬运 ── */
      O.wpool = [];
      for (var i = 0; i < N_W; i++) {
        var w = P.weight(50); w.scale.setScalar(.6);
        var hp = new T.Vector3(HOME_W_X, .6 + (i + .5) * .45, 0);
        w.position.copy(hp); w.userData.pos = hp.clone();
        K.scene().add(w); O.wpool.push(w);
      }
      var tray = new T.Mesh(new T.BoxGeometry(4, .6, 4), P.MAT.dark);
      tray.position.set(HOME_W_X, .3, 0); K.scene().add(tray);
      P.ground(HOME_W_X, 0, 3);

      /* ── 弹簧测力计：水平姿态（-π/2 使挂钩朝木块）+ 滑座支撑 ── */
      var scale = P.springScale({ max: 5 });
      scale.rotation.z = -Math.PI / 2;
      scale.position.set(X0 + GAP, 1.8, 0); K.scene().add(scale); O.scale = scale;
      var eyeS = new T.Mesh(new T.TorusGeometry(.4, .12, 8, 16), P.MAT.brass);
      eyeS.position.set(0, -2.6, 0); scale.add(eyeS);   // 固定连接环（连接线端点）
      var sled = new T.Group(); K.scene().add(sled); O.sled = sled;
      sled.add(new T.Mesh(new T.BoxGeometry(6, .4, 4), P.MAT.dark));
      sled.children[0].position.y = .2;
      [-1.8, 1.8].forEach(function (dx) {
        var leg = new T.Mesh(new T.CylinderGeometry(.18, .18, 1.3, 10), P.MAT.steel);
        leg.position.set(dx, .9, 0); sled.add(leg);
      });
      O.scaleShadow = P.ground(X0 + GAP, 0, 3);

      /* ── 连接线：可见的深灰细钢丝绳（半径 .12），每帧按 P.port 两端重算保持绷紧 ── */
      var WIREM = new T.MeshStandardMaterial({ color: 0x2f353b, roughness: .6, metalness: .55, envMapIntensity: .6 });
      O.line = new T.Mesh(new T.CylinderGeometry(.12, .12, 1, 8), WIREM);
      K.scene().add(O.line);

      K.tag(O.blk, '木块', '水平匀速拉动时拉力 = 摩擦力（平衡力）');
      K.tag(O.scale, '弹簧测力计', '水平姿态，示数由模型实时给出');
      K.tag(O.mat, '接触面垫', '木板 / 棉布 / 毛巾，三种纹理对应不同 μ');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;

      /* 真实平移：匀速往复；加速对照先加速冲高读数，到位后恢复匀速 */
      if (s._moving) {
        var v = (s._accel ? s._v : V_PULL);
        if (s._accel) s._v += A_ACC * 100 * dt;         // cm/s²
        s._x += s._dir * v * dt;
        if (s._x >= X_END - X0) { s._x = X_END - X0; s._dir = -1; s._accel = false; }
        if (s._x <= 0)         { s._x = 0;            s._dir = 1; }
      }
      var ph = physics(s);

      /* 接触面纹理切换（只在变化时换，避免每帧重编译） */
      if (s._surface !== O.lastSurf) {
        O.mat.material.map = O.tex[s._surface];
        O.mat.material.needsUpdate = true; O.lastSurf = s._surface;
      }
      O.scale.userData.setForce(ph.active ? ph.Fpull : 0);

      /* 木块 / 测力计 / 滑座 / 阴影 同速真实平移 */
      var bx = X0 + s._x, sx = bx + GAP;
      O.blk.position.x = bx; O.scale.position.x = sx; O.sled.position.x = sx;
      O.blockShadow.position.x = bx; O.scaleShadow.position.x = sx;

      /* 砝码：挂上的堆在木块顶（随块运动），未挂的留在 HOME */
      for (var i = 0; i < O.wpool.length; i++) {
        var w = O.wpool[i], u = w.userData, tp;
        if (i < s._n) tp = new T.Vector3(bx, .3 + 3 + (i + .5) * .45, 0);
        else          tp = new T.Vector3(HOME_W_X, .6 + (i - s._n + .5) * .45, 0);
        u.pos.lerp(tp, Math.min(1, dt * 8)); w.position.copy(u.pos);
      }

      /* 连接线两端用 P.port 精确取点，每帧重算长度/位置保持绷紧 */
      var p0 = P.port(O.scale, 0, -2.6, 0);   // 测力计固定拉环
      var p1 = P.port(O.blk, 3.5, 1.5, 0);    // 木块右端挂钩
      var dir = new T.Vector3().subVectors(p1, p0);
      var len = dir.length();
      O.line.position.copy(p0).addScaledVector(dir, .5);
      O.line.scale.set(1, len, 1);
      O.line.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    }
  };

  function pull(s, accel) {
    s._x = 0; s._dir = 1; s._v = V_PULL;
    s._accel = !!accel; s._moving = true;
  }
  function reset(s) {
    s._n = 0; s._surface = 0; s._moving = false; s._accel = false;
    s._x = 0; s._dir = 1; s._v = V_PULL; s.judged = false;
  }

  K.boot({
    title: '探究滑动摩擦力大小与哪些因素有关',
    chip: '物理 · 鲁教版 · 八下 · 第六章 力与运动 · 第四节 摩擦力',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 12, dist: 50, tx: 2, tz: 0, yaw: .2, pitch: .28 },
    reads: [['surface', '接触面'], ['pressure', '压力'], ['f', '摩擦力 f'],
            ['read', '测力计示数'], ['state', '运动状态']],
    values: function (s) {
      var ph = physics(s);
      return {
        surface: SURF[s._surface].name + '（μ=' + SURF[s._surface].mu.toFixed(2) + '）',
        pressure: ph.N.toFixed(1) + ' N',
        f: ph.active ? ph.f.toFixed(2) + ' N' : '—',
        read: ph.active ? ph.Fpull.toFixed(2) + ' N' : '—',
        state: s._moving ? (s._accel ? '加速拉动' : '匀速往复') : '静止'
      };
    },
    steps: [
      { name: '原理', title: '为什么匀速拉动时示数就是摩擦力？',
        ask: '弹簧测力计为什么要“水平匀速”拉动木块？',
        body: '<p><b>模型：</b>水平面上 <b>N = mg = P.model.weightN(0.2 + 0.05n) = ' +
          (P.model.weightN(M_BLOCK)).toFixed(1) + ' + ' + W_W.toFixed(1) + 'n N</b>（每砝码 50 g → 0.5 N）；' +
          '滑动摩擦力 <b>f = P.model.friction(μ, N) = μN</b>。</p>' +
          '<p><b>为什么匀速：</b>由牛顿第二定律 <b>F<sub>拉</sub> − f = ma</b>。匀速时 a = 0，故 <b>F<sub>拉</sub> = f</b>，' +
          '测力计示数才等于摩擦力（平衡力）。本课件"匀速拉动"会让木块与测力计<b>同速真实平移</b>，连接线每帧重算保持绷紧。</p>' +
          '<p><b>反例（加速拉动）：</b>一旦加速（a &gt; 0），<b>F<sub>拉</sub> = f + ma ≠ f</b>——示数冲高、不再等于摩擦力。' +
          '可按"加速拉动"对照：读数先大于 f，到位恢复匀速后回到 f。</p>' +
          '<p><b>边界假设：</b>f = μN 只适用于<b>相对滑动</b>、水平面（N = mg）、μ 与速度和接触面积无关；' +
          '控制变量：研究压力时保持接触面不变，研究粗糙程度时保持压力不变。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '匀速拉动读数（F拉=f）', onClick: function (s) { pull(s, false); } },
          { type: 'btn', label: '加速拉动（反例 F拉≠f）', onClick: function (s) { pull(s, true); } },
          { type: 'btn', label: '停止', onClick: function (s) { s._moving = false; } }
        ],
        cam: { tx: 2, ty: 11, tz: 1, dist: 46, yaw: .24, pitch: .32 } },
      { name: '测压力', title: '改变压力，看摩擦力变化',
        ask: '压力越大，滑动摩擦力越大还是越小？',
        body: '<p><b>操作：</b>把砝码逐个搬到木块上（真实搬运动线，砝码随木块一起运动），再匀速拉动。</p>' +
          '<p><b>模型：</b>N = mg = (0.2 + 0.05n) × ' + G + ' = <b>' +
          P.model.weightN(M_BLOCK).toFixed(1) + ' + ' + W_W.toFixed(1) + 'n N</b>；f = μN。' +
          '取木板 μ = ' + SURF[0].mu.toFixed(2) + '：n = 0 时 f = ' + (SURF[0].mu * P.model.weightN(M_BLOCK)).toFixed(2) + ' N，' +
          'n = 4 时 N = ' + P.model.weightN(M_BLOCK + M_W * N_W).toFixed(1) + ' N、f = ' + (SURF[0].mu * P.model.weightN(M_BLOCK + M_W * N_W)).toFixed(2) + ' N。</p>' +
          '<p><b>结论：</b>接触面相同时，<b>压力越大，滑动摩擦力越大</b>（f 与 N 成正比）。' +
          '<b>易错：</b>50 g 砝码重 0.5 N，不是 1 N——把压力写成 2.0 + 1.0n 与质量矛盾。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '加 1 个砝码（+0.5 N）', onClick: function (s) { if (s._n < N_W) s._n++; } },
          { type: 'btn', label: '减 1 个砝码', onClick: function (s) { if (s._n > 0) s._n--; } },
          { type: 'btn', label: '匀速拉动读数', onClick: function (s) { pull(s, false); } }
        ],
        cam: { tx: 2, ty: 10, tz: 1, dist: 44, yaw: .22, pitch: .34 } },
      { name: '测粗糙', title: '改变接触面粗糙程度',
        ask: '同一木块在毛巾上拉动，摩擦力比在木板上大吗？',
        body: '<p><b>操作：</b>换用木板 / 棉布 / 毛巾（三种<b>不同纹理</b>，不只是换颜色），保持压力相同，匀速拉动比较。</p>' +
          '<p><b>模型：</b>f = μN，N 固定 = ' + P.model.weightN(M_BLOCK).toFixed(1) + ' N（n = 0）时，' +
          SURF.map(function (v) { return v.name + ' μ=' + v.mu.toFixed(2) + ' → f=' + (v.mu * P.model.weightN(M_BLOCK)).toFixed(2) + ' N'; }).join('，') + '。</p>' +
          '<p><b>结论：</b>压力相同时，<b>接触面越粗糙，滑动摩擦力越大</b>。' +
          '<b>边界：</b>μ 是接触面材料属性，本模型取定值、与速度和接触面积无关；换面时砝码数（压力）必须保持不变。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '换木板', onClick: function (s) { s._surface = 0; } },
          { type: 'btn', label: '换棉布', onClick: function (s) { s._surface = 1; } },
          { type: 'btn', label: '换毛巾', onClick: function (s) { s._surface = 2; } },
          { type: 'btn', label: '匀速拉动读数', onClick: function (s) { pull(s, false); } }
        ],
        cam: { tx: 1, ty: 11, tz: 1, dist: 46, yaw: .22, pitch: .32 } },
      { name: '结论', title: '归纳结论与易错点',
        ask: '滑动摩擦力的大小与速度、接触面积有关吗？',
        body: '<p><b>结论：</b>滑动摩擦力 <b>f = μN</b>，只与<b>压力</b>和<b>接触面粗糙程度</b>有关；' +
          '与运动速度、接触面积<b>无关</b>。本课件所有读数由 f = P.model.friction(μ, N) 实时给出。</p>' +
          '<p><b>反例复盘：</b>只有 <b>a = 0（匀速）</b> 时 F<sub>拉</sub> = f；加速时 F<sub>拉</sub> = f + ma（如 n=0 木板：' +
          'f = ' + (SURF[0].mu * P.model.weightN(M_BLOCK)).toFixed(2) + ' N，ma = ' + (M_BLOCK * A_ACC).toFixed(2) +
          ' N，F<sub>拉</sub> = ' + (SURF[0].mu * P.model.weightN(M_BLOCK) + M_BLOCK * A_ACC).toFixed(2) + ' N ≠ f）。' +
          '误把加速时的示数当摩擦力，是本节最常见错误。</p>' +
          '<p><b>边界假设：</b>水平面 N = mg、相对滑动、μ 恒定；未计静摩擦与滚动摩擦。' +
          '<b>拓展：</b>滚动摩擦 &lt; 滑动摩擦；花纹、润滑油是增大/减小摩擦的生活实例。</p>',
        apply: function (s) { reset(s); s._n = 2; pull(s, false); s.judged = true; },
        controls: [
          { type: 'btn', label: '加速拉动（反例对照）', onClick: function (s) { pull(s, true); } },
          { type: 'btn', label: '回到匀速', onClick: function (s) { pull(s, false); } },
          { type: 'btn', label: '判定结论', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: 2, ty: 12, tz: 0, dist: 50, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '匀速拉动时，测力计示数等于？', opts: ['滑动摩擦力', '重力', '支持力', '压力'], ans: '滑动摩擦力', why: '匀速时拉力与摩擦力平衡，f = F拉。' },
        { q: '压力越大，滑动摩擦力？', opts: ['越大', '越小', '不变', '无关'], ans: '越大', why: '接触面相同时，压力越大，滑动摩擦力越大。' },
        { q: '接触面越粗糙，摩擦力？', opts: ['越大', '越小', '不变', '为零'], ans: '越大', why: '压力相同时，越粗糙摩擦力越大。' },
        { q: '滑动摩擦力与什么无关？', opts: ['接触面积、速度', '压力', '粗糙程度', '都有关'], ans: '接触面积、速度', why: '滑动摩擦力与压力、粗糙程度有关，与面积、速度无关。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
