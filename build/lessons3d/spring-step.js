/* 格物实验室 · 用弹簧测力计测量力（three.js 单文件课件）
   鲁教版 八年级下册 · 第六章 力与运动 · 第二节 弹力

   【严谨】静止时钩码受平衡力：拉力 F = G = mg（每钩码 50 g → 0.5 N）。
           弹性限度内胡克定律 F = kx，取 k = 0.5 N/cm（= 50 N/m），
           x = P.model.springX(F,k) = F/k；测力计示数由 k·x 反算，
           不是硬编码。量程 0~5 N、分度值 0.2 N、满量程伸长 x = 10 cm。
           边界：仅 F ≤ 5 N（弹性限度）内 k 恒定、静止、沿轴线、忽略弹簧自重。
           反例：超量程进入塑性区，卸载后留残余伸长、指针不回零，F = kx 失效；
                 未调零引入 +0.4 N 零点系统误差（易错点）。
   【真实感】P.stand 铁架台夹持、螺旋弹簧按 x 逐帧重建 TubeGeometry（螺距随伸长变，
           不是只改读数）、0.2 N 刻度板 + 超量程红区、挂环/挂钩、钩码逐个
           从 HOME 备料位挂上（真实搬运动线）、每件落地器材 P.ground 接地、
           材质按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源，所有读数由此推出）────────────── */
  var G      = P.model.gN;                        // 10 N/kg
  var M_HOOK = 0.05;                              // 每个钩码 50 g = 0.05 kg
  var W_HOOK = P.model.weightN(M_HOOK);           // 0.5 N
  var K_SPR  = 0.5;                               // 劲度系数 N/cm（= 50 N/m）
  var F_MAX  = 5;                                 // 量程 0~5 N
  var DIV    = 0.2;                               // 分度值 0.2 N
  var X_MAX  = P.model.springX(F_MAX, K_SPR);     // 满量程伸长 10 cm
  var L0     = 4.0;                               // 弹簧自然长 cm
  var Z0     = 0.4;                               // 未调零的零点误差 N
  var RES    = 1.2;                               // 超量程后的永久残余伸长 cm
  var N_MAX  = 12;                                // 钩码池（可到 6 N，用于超量程反例）
  var STEP   = 0.93;                              // 钩码堆叠间距（scale .62 × h 1.5）
  var Y_TOP  = 40;                                // 弹簧顶端锚点（场景 y）
  var Y_BASE = Y_TOP - L0;                        // 自然长时弹簧底端 = 0 N 指针位（26）
  var HOME_X = 10;                                // 备料托盘 x

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = { _n: 0, _zeroed: false, _damaged: false, judged: false, _t: 0 };
  var O = {};

  /* 模型：静止 F = G = mg；弹性区 x = F/k；示数由 k·x 反算（+ 未调零零点误差）。
     超量程 → 塑性残余，卸载后 x 不归零，胡克关系失效。 */
  function physics(s) {
    var F = P.model.weightN(s._n * M_HOOK);
    var over = F > F_MAX + 1e-9;
    var xLin = P.model.springX(F, K_SPR);
    var x;
    if (s._damaged)      x = xLin + RES;                          // 永久形变：残余叠加
    else if (over)       x = X_MAX + (F - F_MAX) / K_SPR * 1.6;   // 塑性区：k 等效下降
    else                 x = xLin;                                 // 弹性区：胡克定律
    var reading = K_SPR * x + (s._zeroed ? 0 : Z0);
    return { F: F, x: x, over: over, reading: reading };
  }

  /* 螺旋弹簧：顶端锚定、长度 = L0 + x；每帧重建，螺距随伸长真实变化 */
  function helixGeo(lenCm) {
    var pts = [], turns = 12, n = turns * 14, R = 0.85, i;
    for (i = 0; i <= n; i++) {
      var t = i / n, a = t * turns * Math.PI * 2;
      pts.push(new T.Vector3(Math.cos(a) * R, -t * lenCm, Math.sin(a) * R));
    }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, 0.13, 8, false);
  }

  /* 0~5 N 刻度板：每 0.2 N 一小格（25 格），末尾红色超量程区 */
  function makeBoard() {
    var cv = document.createElement('canvas'); cv.width = 140; cv.height = 600;
    var x = cv.getContext('2d');
    x.fillStyle = '#0e2437'; x.fillRect(0, 0, 140, 600);
    x.fillStyle = 'rgba(200,40,40,.35)'; x.fillRect(0, 500, 140, 100);
    x.fillStyle = '#ff9a88'; x.font = 'bold 17px "Microsoft YaHei",sans-serif';
    x.textAlign = 'center'; x.fillText('超量程', 70, 590);
    for (var i = 0; i <= 30; i++) {                 // 30 格 × 0.2 N = 6 N
      var yy = i * 20, isN = i % 5 === 0;          // 50 px/cm → 0.2 N = 0.4 cm
      x.strokeStyle = (i === 25) ? '#ff5a3c' : '#cfe6f2';
      x.lineWidth = isN ? 3 : 1.4;
      x.beginPath(); x.moveTo(isN ? 46 : 86, yy); x.lineTo(128, yy); x.stroke();
      if (isN && i <= 25) {
        x.fillStyle = '#cfe6f2'; x.textAlign = 'right';
        x.font = 'bold 22px Consolas,monospace'; x.fillText(String(i / 5), 40, yy + 7);
      }
    }
    x.fillStyle = '#9fc6dc'; x.textAlign = 'center';
    x.font = 'bold 18px Consolas,monospace'; x.fillText('N', 70, 20);
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    /* 刻度纸贴玻璃筒内壁：弧面 R1.42（筒内半径 1.5，留缝不穿壁）、凹面朝轴线。
       BackSide 渲染凹面 + repeat.x=-1，同时修正背面镜像与读向 */
    tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1;
    return new T.Mesh(
      new T.CylinderGeometry(1.42, 1.42, 12, 24, 1, true, Math.PI - 1.16, 2.32),
      new T.MeshBasicMaterial({ map: tex, side: T.BackSide }));
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(46, 20);

      /* ── 铁架台（P.stand）+ 加粗横臂 + 立柱十字抱箍，让「挂在支架上」读得出来 ── */
      var stand = P.stand(40, { baseW: 9, baseD: 7 });
      stand.position.set(-7, 0, 0); K.scene().add(stand); O.stand = stand;
      var ARMM = new T.MeshStandardMaterial({ color: 0x4a5560, roughness: .45, metalness: .65, envMapIntensity: .8 });
      var arm = new T.Mesh(new T.BoxGeometry(7.9, 1.0, 1.0), ARMM);
      arm.position.set(-3.5, 40.7, 0); K.scene().add(arm);
      /* 立柱顶端抱箍 + 横向夹块：套住细立柱，明显夹在支架上而非悬空 */
      var collar = new T.Mesh(new T.CylinderGeometry(.82, .82, 1.8, 16), ARMM);
      collar.position.set(-7, 40.4, 0); K.scene().add(collar);
      var cross = new T.Mesh(new T.BoxGeometry(2.0, 1.1, 1.4), ARMM);
      cross.position.set(-7, 40.7, 0); K.scene().add(cross);
      var clamp = new T.Mesh(new T.BoxGeometry(1.3, 1.2, 1.2), P.MAT.steelD);
      clamp.position.set(0, 40.6, 0); K.scene().add(clamp);

      /* ── 弹簧测力计（自建，螺旋按 x 真实伸缩）── */
      var dev = new T.Group(); K.scene().add(dev); O.dev = dev;
      var shellMat = P.MAT.glass.clone(); shellMat.opacity = .22;
      var shell = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 16.5, 24, 1, true), shellMat);
      shell.position.y = 32.25; dev.add(shell);
      var capT = new T.Mesh(new T.CylinderGeometry(1.55, 1.55, .5, 24), P.MAT.steelD);
      capT.position.y = 40.5; dev.add(capT);
      var capB = new T.Mesh(new T.CylinderGeometry(1.55, 1.55, .5, 24), P.MAT.steelD);
      capB.position.y = 24; dev.add(capB);
      var ring = new T.Mesh(new T.TorusGeometry(.5, .16, 8, 16), P.MAT.brass);
      ring.rotation.x = Math.PI / 2; ring.position.y = 40.9; dev.add(ring);

      O.board = makeBoard(); O.board.position.set(0, 30, 0); dev.add(O.board);
      O.spring = new T.Mesh(helixGeo(L0), P.MAT.steel);
      O.spring.position.y = Y_TOP; dev.add(O.spring);

      /* 弹簧底端组件：collar + 拉杆 + 挂钩 + 指针（随 x 整体下移） */
      O.mover = new T.Group(); dev.add(O.mover);
      O.mover.add(new T.Mesh(new T.CylinderGeometry(1.0, 1.0, .4, 18), P.MAT.steelD));
      var rod = new T.Mesh(new T.CylinderGeometry(.16, .16, 13.4, 10), P.MAT.steel);
      rod.position.y = -6.7; O.mover.add(rod);
      var hook = new T.Mesh(new T.TorusGeometry(.45, .14, 8, 16), P.MAT.brass);
      hook.position.y = -13.6; hook.rotation.x = Math.PI / 2; O.mover.add(hook);
      var ptr = new T.Mesh(new T.BoxGeometry(1.9, .14, .06), P.MAT.red);
      ptr.position.set(0, 0, .35); O.mover.add(ptr);

      /* ── 钩码池：始终存在，从 HOME 备料位逐个搬到挂钩 ── */
      O.hooks = [];
      var HOOKSTEEL = new T.MeshStandardMaterial({ color: 0xc3ccd4, roughness: .3, metalness: .85, envMapIntensity: 1.4 });
      for (var i = 0; i < N_MAX; i++) {
        var w = P.hookWeight(50); w.scale.setScalar(.62);
        w.traverse(function (o) {          // 本体换亮钢：深灰钩码挂在黑板前会隐形
          if (o.isMesh && o.geometry.type === 'CylinderGeometry') o.material = HOOKSTEEL;
        });
        var hp = new T.Vector3(HOME_X, .6 + (i + .5) * STEP, 0);
        w.position.copy(hp); w.userData.pos = hp.clone();
        K.scene().add(w); O.hooks.push(w);
      }
      var tray = new T.Mesh(new T.BoxGeometry(4, .6, 4), P.MAT.dark);
      tray.position.set(HOME_X, .3, 0); K.scene().add(tray);

      /* 每件落地器材一个深色接地阴影 */
      P.ground(-7, 0, 7); P.ground(HOME_X, 0, 5);

      K.tag(O.dev, '弹簧测力计', 'F = kx，示数由 k·x 反算；量程 0~5 N、分度值 0.2 N');
      K.tag(O.stand, '铁架台', '夹持测力计，保证拉力沿弹簧轴线');
      K.tag(O.hooks[0], '钩码', '每个 50 g → G = 0.5 N，从备料位逐个挂上');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var ph = physics(s);
      if (ph.over) s._damaged = true;      // 加载一旦超限，弹簧即产生永久形变
      ph = physics(s);

      /* 螺旋真实伸缩：顶端锚定，长度 L0 + x */
      O.spring.geometry.dispose();
      O.spring.geometry = helixGeo(L0 + ph.x);
      /* 弹簧底端 / 指针 / 挂钩随 x 整体下移 */
      O.mover.position.y = Y_BASE - ph.x;
      /* 未调零：刻度板上移 0.8 cm，等效读数偏 +0.4 N */
      O.board.position.y = 30 + (s._zeroed ? 0 : 0.8);

      /* 钩码：已挂的串随弹簧下移，未挂的留在备料托盘 */
      for (var i = 0; i < O.hooks.length; i++) {
        var h = O.hooks[i], u = h.userData, tp;
        if (i < s._n) tp = new T.Vector3(0, O.mover.position.y - 13.6 - (i + .5) * STEP, 0);
        else          tp = new T.Vector3(HOME_X, .6 + (i - s._n + .5) * STEP, 0);
        u.pos.lerp(tp, Math.min(1, dt * 8));
        h.position.copy(u.pos);
      }
    }
  };

  function reset(s) { s._n = 0; s._zeroed = false; s._damaged = false; s.judged = false; }

  K.boot({
    title: '用弹簧测力计测量力',
    chip: '物理 · 鲁教版 · 八下 · 第六章 力与运动 · 第二节 弹力',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 21, dist: 62, tx: 1, tz: 0, yaw: .2, pitch: .3 },
    reads: [['n', '钩码数'], ['force', '拉力 F'], ['stretch', '伸长'],
            ['read', '示数 R'], ['state', '弹簧状态']],
    values: function (s) {
      var ph = physics(s);
      return {
        n: s._n + ' 个',
        force: ph.F.toFixed(1) + ' N',
        stretch: ph.x.toFixed(1) + ' cm',
        read: ph.reading.toFixed(2) + ' N',
        state: s._damaged ? '塑性形变·已失准' : (ph.over ? '超量程!' : '弹性限度内')
      };
    },
    steps: [
      { name: '看量程', title: '观察量程与分度值',
        ask: '弹簧测力计为什么不能超量程使用？',
        body: '<p><b>器材与刻度：</b>弹簧测力计量程 <b>0~' + F_MAX + ' N</b>、分度值 <b>' + DIV + ' N</b>（每 1 N 分 5 小格，共 25 格），' +
          '铁架台夹持，空载时指针指零；末尾红色区为超量程警示。</p>' +
          '<p><b>模型：</b>静止时钩码受<b>平衡力</b>，拉力 <b>F = G = mg</b>；每钩码 m = ' + (M_HOOK * 1000) + ' g = ' + M_HOOK + ' kg，' +
          '取 g = ' + G + ' N/kg，故 G = <b>' + W_HOOK.toFixed(1) + ' N</b>（P.model.weightN）。' +
          '弹性限度内 <b>F = kx</b>，取 k = ' + K_SPR + ' N/cm（= 50 N/m），<b>x = F/k = P.model.springX(F,k)</b>。</p>' +
          '<p><b>满量程：</b>F = ' + F_MAX + ' N 时 x = F/k = <b>' + X_MAX.toFixed(1) + ' cm</b>，' +
          '正好是刻度板 0~5 N 的长度（每 1 N 对应 2 cm）。可按按钮挂到满量程，看螺旋被真实拉长。</p>' +
          '<p><b>边界假设：</b>F = kx 只在<b>弹性限度内（F ≤ ' + F_MAX + ' N）</b>、k 恒定、静止、力沿轴线、忽略弹簧自重时成立；' +
          '示数由 <b>k·x 反算</b>，不是预设动画。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '挂到满量程 5 N（10 个钩码）', onClick: function (s) { s._n = 10; } },
          { type: 'btn', label: '卸下钩码', onClick: function (s) { s._n = 0; } }
        ],
        cam: { tx: 1, ty: 23, tz: 2, dist: 64, yaw: .24, pitch: .34 } },
      { name: '调零', title: '使用前必须调零',
        ask: '指针不指零会怎样？如何调零？',
        body: '<p><b>问题：</b>使用前指针不指零，读数会带<b>系统误差</b>。本装置未调零时零点偏高 <b>' + Z0 + ' N</b>（刻度板整体上移 0.8 cm）。' +
          '现挂 2 个钩码作对照。</p>' +
          '<p><b>模型：</b>真实拉力 F = ' + (2 * W_HOOK).toFixed(1) + ' N，弹簧伸长 x = F/k = ' + (2 * W_HOOK / K_SPR).toFixed(1) + ' cm ' +
          '<b>不受调零影响</b>（弹簧受力没变）；但按刻度读出的示数 = k·x + 零点误差 = <b>' + (2 * W_HOOK + Z0).toFixed(1) + ' N</b>，比真实值大 ' + Z0 + ' N。</p>' +
          '<p><b>操作：</b>旋转<b>调零螺母</b>使指针归零（刻度板回到基准），示数恢复为 <b>' + (2 * W_HOOK).toFixed(1) + ' N</b>。' +
          '<b>易错：</b>不调零直接测，所有读数都偏大 ' + Z0 + ' N，且不能靠"多测几次取平均"消除（系统误差）。</p>' +
          '<p><b>边界：</b>调零只改读数零点，不改变弹簧受力与 k；测量时力须与弹簧轴线一致，避免弹簧蹭外壳。</p>',
        apply: function (s) { reset(s); s._n = 2; s._zeroed = false; },
        controls: [
          { type: 'btn', label: '旋转调零螺母，指针归零', onClick: function (s) { s._zeroed = true; } },
          { type: 'btn', label: '故意不调零（对照）', onClick: function (s) { s._zeroed = false; } }
        ],
        cam: { tx: 1, ty: 21, tz: 1, dist: 56, yaw: .22, pitch: .36 } },
      { name: '测重力', title: '挂钩码测重力',
        ask: '钩码所受重力，在静止时等于多少？',
        body: '<p><b>操作：</b>逐个把钩码从备料位挂到挂钩上（真实搬运动线）；静止后读数即所受<b>重力</b>。</p>' +
          '<p><b>模型：</b>F = G = mg = n × ' + W_HOOK.toFixed(1) + ' N；x = P.model.springX(F,k) = F/' + K_SPR + '；' +
          '测力计示数 = <b>k·x</b>（反算）。例如 n = 3：F = ' + (3 * W_HOOK).toFixed(1) + ' N，x = ' + (3 * W_HOOK / K_SPR).toFixed(1) + ' cm，示数 = ' + (3 * W_HOOK).toFixed(1) + ' N。</p>' +
          '<p><b>结论：</b>弹性限度内 <b>伸长与拉力成正比</b>（胡克定律）：每加 1 个钩码（+0.5 N），螺旋多伸长 ' + (W_HOOK / K_SPR).toFixed(1) + ' cm。' +
          '螺旋长度按 x 逐帧重建 TubeGeometry，是真实形变，不是只改读数。</p>' +
          '<p><b>边界：</b>钩码<b>静止</b>（受力平衡）才成立；晃动或加速中读数≠重力。量程内最多挂 10 个（5 N）。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '加 1 个钩码', onClick: function (s) { if (s._n < 10) s._n++; } },
          { type: 'btn', label: '减 1 个钩码', onClick: function (s) { if (s._n > 0) s._n--; } }
        ],
        cam: { tx: 1, ty: 20, tz: 1, dist: 56, yaw: .2, pitch: .38 } },
      { name: '结论', title: '弹簧测力计的原理与拓展',
        ask: '弹簧测力计能否测摩擦力？怎么测？',
        body: '<p><b>原理：</b>弹性限度内 <b>F = kx</b> → x = F/k；示数由 k·x 反算。' +
          '本测力计 k = ' + K_SPR + ' N/cm、量程 ' + F_MAX + ' N、分度值 ' + DIV + ' N。</p>' +
          '<p><b>反例（超量程，胡克定律失效）：</b>挂 12 个钩码（F = ' + (12 * W_HOOK).toFixed(1) + ' N &gt; ' + F_MAX + ' N）后弹簧被拉过弹性限度，进入<b>塑性区</b>；' +
          '卸载后留下<b>永久残余伸长</b> ' + RES + ' cm，指针回不到零（n = 0 时示数仍有 ' + (K_SPR * RES).toFixed(1) + ' N）。' +
          '此时 <b>F = kx 不再成立</b>，测力计失准、必须更换弹簧——这就是"不可超量程"的原因。按下方按钮依次对照。</p>' +
          '<p><b>边界假设：</b>塑性区用"等效残余伸长"建模（不模拟 k 随形变变化）；全程忽略弹簧自重与温度影响，力沿轴线且静止。</p>' +
          '<p><b>拓展：</b>水平<b>匀速</b>拉动时拉力与摩擦力平衡，示数即滑动摩擦力（见摩擦力课件）；1 N ≈ 两个鸡蛋的重力。</p>',
        apply: function (s) { reset(s); s._n = 3; s._zeroed = true; s.judged = true; },
        controls: [
          { type: 'btn', label: '① 挂满 5 N（量程内·线性）', onClick: function (s) { s._n = 10; s._damaged = false; } },
          { type: 'btn', label: '② 超量程到 6 N（12 个·损坏）', onClick: function (s) { s._n = 12; s._damaged = true; } },
          { type: 'btn', label: '③ 卸载钩码，看指针是否回零', onClick: function (s) { s._n = 0; } },
          { type: 'btn', label: '④ 换新弹簧（恢复胡克定律）', onClick: function (s) { s._n = 0; s._damaged = false; s._zeroed = true; } },
          { type: 'btn', label: '判定结论', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: 1, ty: 22, tz: 0, dist: 64, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '弹簧测力计原理？', opts: ['伸长与拉力成正比', '伸长与拉力成反比', '随机', '与温度有关'], ans: '伸长与拉力成正比', why: '弹性限度内，弹簧伸长与所受拉力成正比（胡克定律定性基础）。' },
        { q: '使用前必须？', opts: ['调零', '加热', '加水', '加砝码'], ans: '调零', why: '指针不指零须用调零螺母调零，否则读数带系统误差。' },
        { q: '超过量程会？', opts: ['损坏或永久形变', '更准', '无影响', '自动归零'], ans: '损坏或永久形变', why: '超量程进入塑性区，卸载后留残余伸长、指针不回零，胡克定律失效。' },
        { q: '测摩擦力时应？', opts: ['水平匀速拉动', '快速拉动', '竖直拉', '随便拉'], ans: '水平匀速拉动', why: '匀速时拉力与摩擦力平衡，示数即摩擦力。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
