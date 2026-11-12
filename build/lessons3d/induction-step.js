/* 格物实验室 · 探究导体在磁场中运动时产生感应电流的条件（three.js 单文件课件）
   鲁教版 九年级下册 · 第十八章 电与磁 · 第五节 磁生电

   【严谨】气隙内 B 近似匀强，动生电动势 ε = ∫(v×B)·dl = B·L·v·sinθ：
           棒沿 x、B 沿 z、切割运动沿 y 时 (v×B) 与棒平行 → ε = BLv；
           沿磁感线（z）运动时 v×B = 0 → ε = 0。I = ε/R（开关断开则 I=0，
           但 ε 仍存在）。v 由简谐运动学 v = Aωcos(ωt) 实时算，指针、读数、
           磁极反向后的电流符号全部由该模型推出，无预设摆动、无拟合曲线。
   【真实感】蹄形磁铁转 90° 让 B 沿 z（与棒、运动方向严格正交）、气隙磁感线
           带箭头且随磁极对调翻转、竖直金属导轨兼作引出电极（棒滑动时导线不动）、
           检流计自建表盘与红黑接线柱、导线用 P.port 精确接柱并贴台面走、
           器材从 HOME 备料位推到工作位后才接线、每件 P.ground 接地阴影。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 模型参数（唯一真源，所有读数由此推出）────────────── */
  var B = 0.25;              // 气隙磁感应强度 T
  var LM = 0.12;             // 导体棒有效长度 12 cm = 0.12 m
  var RTOT = 2.0;            // 闭合回路总电阻 Ω
  var IFS = 0.8e-3;          // 检流计满偏电流 A
  var OMEGA = 2.6;           // 往复角频率 rad/s
  var AMP = 1.7;             // 上下振幅（场景单位 cm）
  var AMPZ = 1.2;            // 平行运动振幅（cm，限制在气隙内不撞极面）
  var ROD_Y = 8.4;           // 导体棒中心高度（气隙 3~10 内）
  var ROD_X = 6.2;           // 半长（导轨位置）
  var RED = 0xb01818, BLK = 0x222222;

  /* 运动学 + 电磁感应（读数唯一真源） */
  function solve(s) {
    var moving = (s.motion === 'cut' || s.motion === 'open');
    var vCm = moving ? AMP * OMEGA * Math.cos(OMEGA * s._t) : 0;    // cm/s
    var vm = vCm / 100;                                              // m/s
    var parallel = s.motion === 'parallel';
    var sinTheta = parallel ? 0 : 1;         // v∥B 时 v×B = 0
    var sgnB = s.flip ? -1 : 1;              // 对调磁极 → B 反向 → 电流反向
    var emf = sgnB * B * LM * vm * sinTheta; // V，带符号
    var I = (s.closed && moving) ? emf / RTOT : 0;
    return {
      moving: moving, parallel: parallel, vCm: vCm, vm: vm, emf: emf, I: I,
      gapEmf: moving && !parallel, closed: s.closed,
      cond: (s.closed && moving && !parallel && Math.abs(emf) > 1e-9) ? '有感应电流' : '无感应电流',
      dir: (Math.abs(I) < 1e-9) ? '—' : (I > 0 ? '正向偏转' : '反向偏转')
    };
  }

  var st = { closed: true, motion: 'still', flip: false, assembled: false, wrong: false,
             _t: 0, _place: 0 };  /* 连续量用 _ 前缀，避开 K.boot 的步骤补间 */
  var O = {};

  /* ── 检流计：白机壳 + 表盘 + 红黑柱，指针按 I/满偏 ────── */
  function dialTex() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 512;
    var x = cv.getContext('2d');
    x.fillStyle = '#f6f8f5'; x.beginPath(); x.arc(256, 256, 246, 0, 6.283); x.fill();
    x.strokeStyle = '#1c2b39'; x.lineWidth = 7; x.stroke();
    var a0 = Math.PI * .78, a1 = Math.PI * 2.22;
    for (var i = 0; i <= 20; i++) {
      var a = a0 + (a1 - a0) * i / 20, r1 = 208, r2 = (i % 5 === 0) ? 168 : 190;
      x.strokeStyle = '#1c2b39'; x.lineWidth = i % 5 === 0 ? 5 : 2;
      x.beginPath(); x.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      x.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2); x.stroke();
    }
    x.fillStyle = '#0a4d2f'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 74px Georgia,serif'; x.fillText('G', 256, 176);
    x.font = 'bold 34px Consolas,monospace';
    x.fillText('−', 60, 336); x.fillText('0', 256, 336); x.fillText('+', 452, 336);
    return new T.CanvasTexture(cv);
  }
  function makeGalvo() {
    var g = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(9, 6.6, 3.4), P.MAT.ceramic);
    body.position.y = 3.3; g.add(body);
    var back = new T.Mesh(new T.BoxGeometry(8.7, 6.3, .12), P.MAT.dark);
    back.position.set(0, 3.3, -1.76); g.add(back);
    var bezel = new T.Mesh(new T.TorusGeometry(2.6, .24, 10, 36), P.MAT.steelD);
    bezel.position.set(0, 4.0, 1.72); g.add(bezel);
    var face = new T.Mesh(new T.CircleGeometry(2.52, 40),
      new T.MeshBasicMaterial({ map: dialTex() }));
    face.position.set(0, 4.0, 1.73); g.add(face);
    var needle = new T.Mesh(new T.BoxGeometry(.14, 2.0, .05),
      new T.MeshBasicMaterial({ color: 0xc0392b }));
    needle.geometry.translate(0, 1.0, 0); needle.position.set(0, 4.0, 1.79); g.add(needle);
    var pivot = new T.Mesh(new T.CylinderGeometry(.24, .24, .16, 14), P.MAT.brass);
    pivot.rotation.x = Math.PI / 2; pivot.position.set(0, 4.0, 1.85); g.add(pivot);
    [-1, 1].forEach(function (sg) {
      var post = new T.Mesh(new T.CylinderGeometry(.34, .34, 1.0, 14),
        sg > 0 ? P.MAT.red : P.MAT.dark);
      post.rotation.x = Math.PI / 2; post.position.set(sg * 3.0, 1.1, 1.9); g.add(post);
    });
    g.userData.setValue = function (f) {
      needle.rotation.z = -Math.max(-1, Math.min(1, f)) * 1.05;
    };
    return g;
  }
  function spriteLabel(letter, bg) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var x = cv.getContext('2d');
    x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 58, 0, 6.283); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 78px Georgia,serif'; x.fillText(letter, 64, 68);
    /* depthTest 必须开：背面机位磁铁/墙面在前时，标签要一起被遮挡，
       不能像贴纸一样永远浮在最前面（原来只剩两个字母） */
    var sp = new T.Sprite(new T.SpriteMaterial({
      map: new T.CanvasTexture(cv), depthTest: true, depthWrite: false
    }));
    sp.scale.set(3.0, 3.0, 1); return sp;
  }

  /* 蹄形磁铁在课件内重做：共享库是两根方柱 + 一条底块，放大后读作
     「两块彩色积木」。改成圆柱腿 + 粗 U 形弯底 + 极靴，N/S 印在极靴顶面；
     磁铁整体旋转仍由 update 控制，气隙 B 方向与电磁模型一字未动。 */
  function dressMagnet(mag) {
    mag.traverse(function (o) { if (o.isMesh) o.visible = false; });
    var red = new T.MeshStandardMaterial({ color: 0xc0392b, roughness: .45, metalness: .3, envMapIntensity: .35 });
    var blue = new T.MeshStandardMaterial({ color: 0x2f6fbf, roughness: .45, metalness: .3, envMapIntensity: .35 });
    var steel = new T.MeshStandardMaterial({ color: 0x59636d, roughness: .42, metalness: .72, envMapIntensity: .5 });
    [-1, 1].forEach(function (s) {
      var leg = new T.Mesh(new T.CylinderGeometry(1.5, 1.7, 7.2, 24), s < 0 ? red : blue);
      leg.position.set(s * 4, 6.6, 0); mag.add(leg);
      var shoe = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, 1.1, 24), s < 0 ? red : blue);
      shoe.position.set(s * 4, 10.6, 0); mag.add(shoe);
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var x = cv.getContext('2d');
      x.fillStyle = s < 0 ? '#c0392b' : '#2f6fbf'; x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 84px Georgia,serif'; x.fillText(s < 0 ? 'N' : 'S', 64, 68);
      var disc = new T.Mesh(new T.CircleGeometry(1.6, 32),
        new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), side: T.DoubleSide }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(s * 4, 11.35, 0); mag.add(disc);
    });
    /* 粗 U 形弯底把两腿连成整块磁铁（钢色，避开气隙磁感线 y≥5.2） */
    var arcPts = [], i;
    for (i = 0; i <= 28; i++) {
      var a = Math.PI * (1 - i / 28);
      arcPts.push(new T.Vector3(Math.cos(a) * 4, 3.1 - Math.sin(a) * 1.7, 0));
    }
    mag.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arcPts), 36, 1.3, 12, false), steel));
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(74, 30);

      /* ── 蹄形磁铁转 90°：两极落在 z=±4，B 沿 z；棒沿 x、运动沿 y ── */
      var mag = P.horseshoeMagnet(); mag.rotation.y = Math.PI / 2;
      dressMagnet(mag);
      K.scene().add(mag); O.mag = mag;
      P.ground(0, 0, 8);

      /* 气隙内磁感线（沿 z，N→S）：细管代替 1px Line，且严格止于极面内侧，
         旧版线穿进磁极、又被 1px 线宽吞掉，画面上几乎看不见 */
      var fl = new T.Group(); K.scene().add(fl); O.flux = fl;
      var fmat = new T.MeshBasicMaterial({ color: 0x2f86c9, transparent: true,
        opacity: 1, depthWrite: false });
      var amat = new T.MeshBasicMaterial({ color: 0x1f5f9e });
      [5.2, 7.0, 8.8].forEach(function (y) {
        [-3.4, 0, 3.4].forEach(function (x) {
          var tube = new T.Mesh(new T.CylinderGeometry(.11, .11, 4.4, 8), fmat);
          tube.rotation.x = Math.PI / 2; tube.position.set(x, y, 0); fl.add(tube);
          /* 箭头放到气隙前缘，才不会被近侧红色磁极整根挡住 */
          var ar = new T.Mesh(new T.ConeGeometry(.38, 1.0, 10), amat);
          ar.position.set(x, y, 1.35);
          ar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, -1));
          fl.add(ar);
        });
      });
      /* N/S 已印在极靴顶面，随磁铁整体翻转；不再用永远朝向相机的浮空圆牌 */

      /* ── 竖直导轨兼作引出电极：棒上下/前后滑动，外接导线始终不动 ── */
      function rail(x) {
        var g = new T.Group(); g.position.set(x, 0, 0); K.scene().add(g);
        var foot = new T.Mesh(new T.BoxGeometry(3.0, .7, 4.0), P.MAT.steelD);
        foot.position.y = .35; g.add(foot);
        /* 两根细钢立柱 + 顶梁 + 中间滑槽：旧版是一整块实心灰方柱，像墓碑 */
        [-1, 1].forEach(function (sz) {
          var p = new T.Mesh(new T.CylinderGeometry(.28, .32, 10.6, 14), P.MAT.steel);
          p.position.set(0, 6.0, sz * 1.15); g.add(p);
        });
        var groove = new T.Mesh(new T.BoxGeometry(.26, 9.6, .5), P.MAT.dark);
        groove.position.set(0, 6.3, 0); g.add(groove);
        var top = new T.Mesh(new T.BoxGeometry(1.1, .5, 3.0), P.MAT.steelD);
        top.position.y = 11.5; g.add(top);
        var post = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.1, 14), P.MAT.brass.clone());
        post.rotation.x = Math.PI / 2; post.position.set(0, 1.2, 0); g.add(post);
        P.ground(x, 0, 2.6);
        return g;
      }
      O.railL = rail(-ROD_X); O.railR = rail(ROD_X);

      /* 导体棒（沿 x）+ 两端滑块，随位移真实运动 */
      var rodGrp = new T.Group(); K.scene().add(rodGrp); O.rodGrp = rodGrp;
      var rod = P.conductorRod({ len: ROD_X * 2 }); rodGrp.add(rod);
      [-1, 1].forEach(function (sg) {
        var shoe = new T.Mesh(new T.BoxGeometry(1.1, 1.1, 1.2), P.MAT.brass);
        shoe.position.x = sg * ROD_X; rodGrp.add(shoe);
      });
      O.rod = rod;

      /* 运动方向双向箭头：切割=竖直(y)，沿磁感线=前后(z)；静止时隐藏 */
      var mo = new T.Group(), arrowMat = new T.MeshBasicMaterial({ color: 0xf0a428 });
      mo.add(new T.Mesh(new T.CylinderGeometry(.11, .11, 3.0, 10), arrowMat));
      [1, -1].forEach(function (sg) {
        var c = new T.Mesh(new T.ConeGeometry(.36, .8, 10), arrowMat);
        c.position.y = sg * 1.9; if (sg < 0) c.rotation.x = Math.PI; mo.add(c);
      });
      mo.position.set(-9.4, ROD_Y, 0); K.scene().add(mo); O.motion = mo;

      /* ── 检流计 + 开关：先在备料位，推到工作位后才显示接线 ── */
      var circuit = new T.Group(); K.scene().add(circuit); O.circuit = circuit;
      /* 检流计与开关放在画面左侧：右侧 UI 面板会遮住 x>10 的器材 */
      var gal = makeGalvo(); gal.position.set(-19, 0, -3); circuit.add(gal); O.gal = gal;
      var sw = P.switch_(); sw.position.set(-12, 0, 9); circuit.add(sw); O.sw = sw;

      /* P.port 必须在「工作位」取点，取完再把整组移回 HOME */
      var leftPost = P.port(O.railL, 0, 1.2, 0), rightPost = P.port(O.railR, 0, 1.2, 0);
      var swL = P.port(sw, -1.6, 1.2, 0), swR = P.port(sw, 1.6, 1.2, 0);
      var galL = P.port(gal, -3.0, 1.1, 1.9), galR = P.port(gal, 3.0, 1.1, 1.9);
      var wires = new T.Group(); K.scene().add(wires); O.wires = wires;
      function wire(pts, color) {
        var m = P.wire(pts, { color: color, r: .2 }); K.scene().remove(m); wires.add(m);
      }
      wire([leftPost, [-ROD_X, 1.4, 0], [-ROD_X, 1.4, 9], [-13.6, 1.4, 9], swL], RED);
      wire([swR, [-10.4, 1.4, 9], [-10.4, 1.4, 3], [-22, 1.4, -3], galL], RED);
      wire([galR, [-16, 1.4, -3], [-16, 1.4, -10], [ROD_X, 1.4, -10], [ROD_X, 1.4, 0], rightPost], BLK);
      circuit.position.set(9, 0, 5);   // HOME 备料位：左前方，避开磁极与右侧面板
      wires.visible = false;

      K.tag(O.mag, '蹄形磁铁', '转 90° 后 B 沿 z：N → S');
      K.tag(O.rod, '导体棒', '闭合回路的一部分；沿 x 放置，与 B、v 两两正交');
      K.tag(O.gal, '灵敏电流计', '检测 µA~mA 级感应电流，指针方向即电流方向');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var q = solve(s);

      /* 备料动线：检流计与开关到位后才接线，避免导线凭空出现 */
      var target = s.assembled ? 1 : 0;
      s._place += (target - s._place) * Math.min(1, dt * 3.4);
      O.circuit.position.set(9 * (1 - s._place), 0, 5 * (1 - s._place));
      O.wires.visible = s._place > .96;
      O.sw.userData.setClosed(s.closed);

      /* 棒的真实运动：切割沿 y、沿磁感线沿 z（后者幅度受限不撞极面） */
      var y = ROD_Y, z = 0;
      if (q.moving) y = ROD_Y + AMP * Math.sin(OMEGA * s._t);
      if (q.parallel) z = AMPZ * Math.sin(OMEGA * s._t);
      O.rodGrp.position.set(0, y, z);
      O.gal.userData.setValue(q.I / IFS);
      O.motion.visible = q.moving;
      O.motion.rotation.x = q.parallel ? Math.PI / 2 : 0;

      /* 磁极对调：磁铁整体转 180°，气隙磁感线与端面 N/S 字同步翻转 */
      O.mag.rotation.y = s.flip ? -Math.PI / 2 : Math.PI / 2;
      O.flux.rotation.y = s.flip ? Math.PI : 0;
    }
  };

  function reset(s) { s.closed = true; s.motion = 'still'; s.flip = false; s.assembled = false; s.wrong = false; }

  K.boot({
    title: '探究导体在磁场中运动时产生感应电流的条件',
    chip: '物理 · 鲁教版 · 九下 · 第十八章 电与磁 · 第五节 磁生电',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 12, dist: 58, tx: 3, tz: 0, yaw: .48, pitch: .34 },
    reads: [['v', '切割速度 v'], ['emf', '电动势 ε'], ['I', '感应电流 I'], ['sw', '回路'], ['cond', '判定']],
    values: function (s) {
      var q = solve(s);
      return {
        v: (q.moving ? Math.abs(q.vCm).toFixed(2) : '0.00') + ' cm/s',
        emf: (q.emf * 1000).toFixed(3) + ' mV',
        I: (q.I * 1e6).toFixed(0) + ' µA' + (q.dir !== '—' ? '（' + q.dir + '）' : ''),
        sw: q.closed ? '闭合' : '断开',
        cond: q.cond
      };
    },
    steps: [
      { name: '搭装置', title: '连成闭合回路，让 B、棒、运动方向两两正交',
        ask: '为什么要让导体棒、磁场、运动方向互相垂直？',
        body: '<p><b>器材：</b>蹄形磁铁（气隙 B ≈ ' + B.toFixed(2) + ' T）、导体棒（有效长度 L = ' + (LM * 100).toFixed(0) + ' cm）、<b>灵敏电流计</b>、开关、竖直金属导轨、导线。</p>' +
          '<p><b>装配：</b>磁铁转 90° 后两极在前后，<b>B 沿 z</b>；棒沿 <b>x</b> 架在两导轨上，只能沿 <b>y</b> 上下或沿 <b>z</b> 前后滑动。这样 (v×B) 才可能与棒平行，电动势 ε = ∫(v×B)·dl 才不为零。</p>' +
          '<p><b>操作：</b>按按钮把检流计与开关从备料位推到工作位，接好导线（导轨兼作引出电极，棒滑动时导线不跟着动）。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '推到工作位并接好导线', onClick: function (s) { s.assembled = true; } }],
        cam: { tx: 3, ty: 12, tz: 0, dist: 60, yaw: .48, pitch: .4 } },
      { name: '静止', title: '导体静止：ε = 0，无感应电流',
        ask: '导体静止在磁场中时，电流计偏转吗？',
        body: '<p><b>操作：</b>闭合开关，导体棒静止于气隙中，观察电流计。</p>' +
          '<p><b>模型：</b>v = 0 → <b>ε = BLv = 0</b> → I = 0，指针不偏转。</p>' +
          '<p><b>注意：</b>此时回路是闭合的、磁场也存在，唯独没有<b>切割</b>——说明「有磁场 + 闭合」还不够。</p>',
        apply: function (s) { reset(s); s.assembled = true; },
        cam: { tx: 3, ty: 11, tz: 2, dist: 50, yaw: .48, pitch: .36 } },
      { name: '切割', title: '垂直切割磁感线：ε = BLv，I = ε/R',
        ask: '电流计指针为什么会左右摆动而不是停在一侧？',
        body: '<p><b>模型：</b>棒做简谐往复 y(t) = A sin(ωt)，速度 <b>v(t) = Aω cos(ωt)</b>（A = ' + AMP + ' cm，ω = ' + OMEGA + ' rad/s），由 <b>ε = B·L·v</b>、<b>I = ε/R</b>（R = ' + RTOT.toFixed(1) + ' Ω）实时求解，峰值约 <b>' + (B * LM * (AMP * OMEGA / 100) / RTOT * 1e6).toFixed(0) + ' µA</b>。</p>' +
          '<p><b>现象：</b>v 换向 → ε、I 变号 → 检流计指针左右摆动；v = 0 的端点瞬间指针回零。读数与指针同源，不是预设动画。</p>' +
          '<p><b>结论：</b>闭合电路的<b>一部分导体做切割磁感线运动</b>时产生感应电流（电磁感应）。等价说法：穿过回路的磁通量发生变化，ε = −dΦ/dt。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.motion = 'cut'; },
        controls: [{ type: 'btn', label: '上下切割运动', onClick: function (s) { s.closed = true; s.motion = 'cut'; } }],
        cam: { tx: 3, ty: 10, tz: 2, dist: 46, yaw: .48, pitch: .34 } },
      { name: '反例', title: '沿磁感线运动：不切割，仍然没有电流',
        ask: '「只要在磁场中运动就有电流」错在哪里？',
        body: '<p><b>反例（本步重点）：</b>让棒沿 <b>z 方向（平行于 B）</b>前后运动，位移同样在变，但 <b>v×B = 0</b> → ε = 0 → I = 0，指针不偏转。</p>' +
          '<p><b>关键量是 sinθ：</b>ε = BLv·sinθ，θ 为 v 与 B 的夹角。平行时 θ = 0；切割时 θ = 90°。所以条件是<b>切割</b>，不是「在磁场中动」。</p>' +
          '<p><b>易错：</b>也不能只看棒有没有动——若棒沿<b>自身方向</b>平移，(v×B) 与棒垂直，同样没有电动势。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.motion = 'parallel'; s.wrong = true; },
        controls: [
          { type: 'btn', label: '沿磁感线（平行）运动', onClick: function (s) { s.closed = true; s.motion = 'parallel'; } },
          { type: 'btn', label: '切回垂直切割', onClick: function (s) { s.motion = 'cut'; } }
        ],
        cam: { tx: 3, ty: 10, tz: 2, dist: 46, yaw: .48, pitch: .34 } },
      { name: '条件', title: '断开开关 / 对调磁极：条件与方向一次说清',
        ask: '产生感应电流必须同时满足哪两个条件？',
        body: '<p><b>① 断开开关：</b>棒照样切割，<b>ε 依然存在</b>（右栏 mV 不为零），但回路不闭合 → <b>I = 0</b>，指针不偏转。这正是「<b>闭合电路</b>」这一条件不能省的原因。</p>' +
          '<p><b>② 对调磁极：</b>B 反向 → 由 ε = (v×B)·L 得电流<b>反向</b>，指针偏转方向相反；磁场与磁感线箭头也随磁铁真实翻转。</p>' +
          '<p><b>结论：</b>闭合电路的<b>一部分导体</b>做<b>切割磁感线</b>运动 → 产生感应电流；方向与 <b>B 方向</b>和<b>运动方向</b>都有关。这是<b>发电机</b>的原理。</p>' +
          '<p><b>边界：</b>气隙内 B 近似匀强（忽略边缘效应）、导体电阻取定值、不计回路自感与棒的质量；真实发电机用连续转动代替简谐往复。</p>',
        apply: function (s) { reset(s); s.assembled = true; s.motion = 'open'; s.closed = false; },
        controls: [
          { type: 'btn', label: '断开开关（ε 有、I 无）', onClick: function (s) { s.motion = 'open'; s.closed = false; } },
          { type: 'btn', label: '闭合开关', onClick: function (s) { s.motion = 'cut'; s.closed = true; } },
          { type: 'btn', label: '对调磁极（电流反向）', onClick: function (s) { s.motion = 'cut'; s.closed = true; s.flip = true; } },
          { type: 'btn', label: '磁极复位', onClick: function (s) { s.flip = false; } }
        ],
        cam: { tx: 3, ty: 11, tz: 0, dist: 50, yaw: .48, pitch: .36 } }
    ],
    quiz: function () {
      var bank = [
        { q: '产生感应电流的条件？', opts: ['闭合 + 切割磁感线', '只要运动', '只要磁场', '只要闭合'], ans: '闭合 + 切割磁感线', why: '必须是闭合电路的一部分导体做切割磁感线运动。' },
        { q: '导体沿磁感线方向运动？', opts: ['无感应电流', '有感应电流', '电流最大', '电流反向'], ans: '无感应电流', why: 'v∥B 时 v×B=0，不切割磁感线。' },
        { q: '开关断开但仍在切割？', opts: ['有 ε 无 I', 'ε、I 都有', 'ε、I 都无', '只有 I'], ans: '有 ε 无 I', why: '动生电动势仍存在，但回路不闭合故无电流。' },
        { q: '电磁感应是哪种机器的原理？', opts: ['发电机', '电动机', '变压器', '电磁铁'], ans: '发电机', why: '磁生电是发电机的工作原理。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
