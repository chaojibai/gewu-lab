/* 格物实验室 · 探究凸透镜成像的规律（three.js 单文件课件）
   鲁教版 八年级上册 · 第三章 光现象 · 第五节 凸透镜成像的规律

   【严谨】高斯成像 1/u + 1/v = 1/f，统一走 P.model.lensV(f,u) / P.model.lensM(f,u)：
           v = f·u/(u−f)，m = f/(u−f)；像高 h′ = |m|·h 与屏上像尺寸随 |m|
           每帧实时变化，成像性质也由 |m| 判定，不再写死 v≈13.3。
           u=f 时 v→∞、m→∞：出射光平行，任意位置光屏都只得弥散光斑、
           无清晰像（不是「成很大的像」）；u<f 时 v<0 为正立放大虚像、屏上无像。
           反例：遮住透镜一半，透镜每一部分仍独立成完整像，只是通光面积减半
           → 像完整但亮度约减半（按钮切换，|m| 与像尺寸不变）。
   【真实感】三心等高可见（主光轴 y=7、竖直 cm 刻度尺、等高参照线）、光具座
           导轨上三个滑块随器材滑动、光屏木框+陶瓷面+P.stand 强化支座、透镜
           旋 90° 使法线沿 x 正对光路、每件 P.ground 接地，材质按 P.MAT；
           器材用真实位移 / 透明度变化而非凭空 visible。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源；所有读数与正文数字由此推出）────── */
  var F = 8;                 // 焦距 f（cm）
  var H_OBJ = 6;             // 物高 h（cm）：像高 h′ = |m|·h
  var AXIS_Y = 7;            // 主光轴 / 三心等高高度（cm）
  var BENCH_LEN = 60;        // 光具座长
  var SUN_X = -28;           // 远处平行光源（测焦距）工作位
  var HOME_Z = 9;            // 备料位 z（器材移出光路）
  var SCR_FAR = 26;          // 无清晰像时光屏停放位

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = { mode: 'focus', _u: 20, _t: 0, energized: false, half: false };
  var O = {};

  /* 屏上像：保留原 candleTex / drawImg 的 CanvasTexture 逻辑 */
  function candleTex(invert, label) {
    var c = document.createElement('canvas'); c.width = 160; c.height = 200;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0)'; x.fillRect(0, 0, 160, 200);
    if (invert) { x.translate(0, 200); x.scale(1, -1); }
    /* 加深配色 + 描边：白陶瓷屏上原来的浅黄像几乎看不见 */
    x.fillStyle = '#c8912f'; x.fillRect(60, 70, 40, 110);
    x.fillStyle = '#8a5a18'; x.fillRect(60, 70, 9, 110);
    x.strokeStyle = '#5c3c10'; x.lineWidth = 3; x.strokeRect(60, 70, 40, 110);
    x.fillStyle = '#ff7410'; x.beginPath(); x.ellipse(80, 52, 13, 24, 0, 0, 6.283); x.fill();
    x.strokeStyle = '#a8410a'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#ffd45a'; x.beginPath(); x.ellipse(80, 56, 6, 13, 0, 0, 6.283); x.fill();
    return new T.CanvasTexture(c);
  }

  function drawImg(mesh, size, invert, special) {
    if (special) {
      var c = document.createElement('canvas'); c.width = 128; c.height = 128;
      var x = c.getContext('2d');
      var g = x.createRadialGradient(64, 64, 2, 64, 64, 60);
      g.addColorStop(0, '#fff'); g.addColorStop(.4, '#ffe9a8'); g.addColorStop(1, 'rgba(255,220,120,0)');
      x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, 6.283); x.fill();
      mesh.material.map = new T.CanvasTexture(c); mesh.material.needsUpdate = true;
      mesh.scale.set(size, size, 1); mesh.material.opacity = 1;
      return;
    }
    mesh.material.map = candleTex(invert); mesh.material.needsUpdate = true;
    mesh.scale.set(size, size * 1.25, 1); mesh.material.opacity = 1;
  }

  /* u=f 的弥散光斑：平行光照屏不成清晰像，屏上是一大片柔和亮斑 */
  function drawBlur(mesh, size) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,246,214,.9)'); g.addColorStop(.55, 'rgba(255,226,150,.45)');
    g.addColorStop(1, 'rgba(255,210,110,0)');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, 6.283); x.fill();
    mesh.material.map = new T.CanvasTexture(c); mesh.material.needsUpdate = true;
    mesh.scale.set(size, size, 1);
  }

  /* 竖直高度刻度尺（CanvasTexture，0~12 cm 可读，作三心等高参照） */
  function heightRuler() {
    var cm = 12, px = 30;
    var cv = document.createElement('canvas'); cv.width = 64; cv.height = cm * px;
    var x = cv.getContext('2d');
    x.fillStyle = '#f6f2e6'; x.fillRect(0, 0, cv.width, cv.height);
    x.strokeStyle = '#8c939a'; x.fillStyle = '#1c2b39';
    x.font = 'bold 20px Consolas,monospace'; x.textAlign = 'left';
    for (var i = 0; i <= cm; i++) {
      var py = cv.height - i * px;       // 底 = 0 cm，向上递增
      x.lineWidth = (i % 2 === 0) ? 2 : 1;
      x.beginPath(); x.moveTo(0, py); x.lineTo(i % 2 === 0 ? 30 : 18, py); x.stroke();
      if (i % 2 === 0) x.fillText(String(i), 32, Math.min(cv.height - 4, py + 6));
    }
    var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    var g = new T.Group();
    var back = new T.Mesh(new T.BoxGeometry(2.6, cm, .4), P.MAT.wood);
    back.position.y = cm / 2; g.add(back);
    var face = new T.Mesh(new T.PlaneGeometry(2.4, cm),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    face.position.set(0, cm / 2, .22); g.add(face);
    return g;
  }

  /* 工具：真实位移、透明度渐变、贴图缓存（避免每帧新建 CanvasTexture） */
  function move(o, tx, tz, dt) {
    var k = Math.min(1, dt * 6);
    o.position.x += (tx - o.position.x) * k;
    o.position.z += (tz - o.position.z) * k;
  }
  function move3(o, p, dt) {
    var k = Math.min(1, dt * 6);
    o.position.x += (p.x - o.position.x) * k;
    o.position.y += (p.y - o.position.y) * k;
    o.position.z += (p.z - o.position.z) * k;
  }
  function fade(mat, target, dt) {
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 7);
  }
  function setRays(op, dt) {
    O.rays.forEach(function (r) {
      r.material.opacity += (op - r.material.opacity) * Math.min(1, dt * 7);
    });
  }
  var imgCache = { kind: '', size: -1, invert: null };
  function setImg(mesh, kind, size, invert) {
    if (kind === imgCache.kind && Math.abs(size - imgCache.size) < .01 && invert === imgCache.invert) return;
    imgCache = { kind: kind, size: size, invert: invert };
    if (kind === 'spot') drawImg(mesh, 3.2, false, '最小最亮光斑');
    else if (kind === 'blur') drawBlur(mesh, size);
    else drawImg(mesh, size, invert, '');
  }
  function syncGrounds() {
    if (O.gObj) O.gObj.position.x = O.obj.position.x;
    if (O.gScr) O.gScr.position.x = O.scr.position.x;
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .85;
        else if (o.isDirectionalLight) o.intensity *= .88;
      });
      K.bench(70, 24);

      /* 光具座（导轨 + 刻度）+ 三个滑块 */
      var bench = P.opticalBench({ len: BENCH_LEN, w: 6 });
      bench.position.set(0, 0, 0); K.scene().add(bench); O.bench = bench;
      function slider() {
        var s = new T.Mesh(new T.BoxGeometry(2.2, .8, 6.4), P.MAT.steelD);
        s.position.y = 1.5; K.scene().add(s); return s;
      }
      O.slObj = slider(); O.slLens = slider(); O.slScr = slider();

      /* 主光轴 / 三心等高参照线（半透明细杆，y=AXIS_Y） */
      var axis = new T.Mesh(new T.CylinderGeometry(.06, .06, BENCH_LEN, 8),
        new T.MeshBasicMaterial({ color: 0x9fd0e6, transparent: true, opacity: .45 }));
      axis.rotation.z = Math.PI / 2; axis.position.set(0, AXIS_Y, 0);
      K.scene().add(axis); O.axis = axis;

      /* 竖直高度刻度尺（器材高度参照） */
      var hr = heightRuler(); hr.position.set(-BENCH_LEN / 2 + 1, 0, -8);
      K.scene().add(hr); O.hr = hr;
      P.ground(-BENCH_LEN / 2 + 1, -8, 3);

      /* 物体蜡烛（镜前 −x，焰心≈主光轴高度）；成像实验蜡烛必须点燃 */
      var obj = P.candle({ h: H_OBJ }); obj.position.set(-st._u, 0, 0);
      obj.userData.setLit(true);
      /* 柔光晕：径向渐变贴片，随蜡烛移动（update 里跟随） */
      var gc = document.createElement('canvas'); gc.width = gc.height = 128;
      var gx = gc.getContext('2d');
      var gg = gx.createRadialGradient(64, 64, 4, 64, 64, 62);
      gg.addColorStop(0, 'rgba(255,150,60,.45)');
      gg.addColorStop(.45, 'rgba(255,120,30,.18)');
      gg.addColorStop(1, 'rgba(255,110,20,0)');
      gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
      var halo = new T.Mesh(new T.PlaneGeometry(2.6, 3.4),
        new T.MeshBasicMaterial({ map: new T.CanvasTexture(gc), transparent: true, opacity: .6,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      halo.position.y = H_OBJ + 1.4; obj.add(halo);
      K.scene().add(obj); O.obj = obj;

      /* 凸透镜：共享库的双凸 Lathe 体（有中心厚度、边缘厚度、轮廓线与细夹框），
         旋 90° 使光轴沿 x 正对光路；P.stand 从下方夹住镜边 */
      var lens = P.convexLens({ r: 3.2 });
      lens.rotation.z = Math.PI / 2; lens.position.set(0, AXIS_Y, 0);
      K.scene().add(lens); O.lens = lens;
      var lensStand = P.stand(AXIS_Y - .7, { baseW: 4, baseD: 4 });
      lensStand.position.set(0, 0, -3.2); K.scene().add(lensStand); O.lensStand = lensStand;

      /* 遮光板（反例：遮透镜下半），从备料位真实移到透镜前 */
      var cover = new T.Mesh(new T.BoxGeometry(.5, 3.4, 6.6), P.MAT.dark);
      cover.position.set(.6, AXIS_Y - 1.7, HOME_Z); K.scene().add(cover); O.cover = cover;
      O.coverHome = { x: .6, y: AXIS_Y - 1.7, z: HOME_Z };
      O.coverWork = { x: .6, y: AXIS_Y - 1.7, z: 0 };

      /* 光屏：木框 + 陶瓷面 + P.stand 强化支座，屏面朝 +z */
      var scr = new T.Group();
      var frame = new T.Mesh(new T.BoxGeometry(9.6, 11.6, .5), P.MAT.wood);
      frame.position.y = AXIS_Y; scr.add(frame);
      var face = new T.Mesh(new T.BoxGeometry(9, 11, .55), P.MAT.ceramic);
      face.position.set(0, AXIS_Y, .05); scr.add(face);
      var sstand = P.stand(AXIS_Y - .7, { baseW: 5, baseD: 4 });
      sstand.position.z = -1; scr.add(sstand);                 // 夹持在屏中心 y=AXIS_Y
      scr.rotation.y = -Math.PI / 2;                           // 屏面法线沿 −x：垂直光轴、面向透镜
      scr.position.set(13, 0, 0); K.scene().add(scr); O.scr = scr;
      /* 屏上像：贴在屏「朝透镜的一侧」（scr 本地 +z，rotation.y=-π/2 后指向世界 -x），
         略微前移出陶瓷面，避免被屏体边缘遮挡 / z-fighting */
      var img = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      img.position.set(0, AXIS_Y, .42); scr.add(img); O.img = img;

      /* 虚像（u<f 时浮动于物侧），正立贴图一次设好 */
      var vir = new T.Mesh(new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      vir.position.set(-24, AXIS_Y, 0); K.scene().add(vir); O.vir = vir;
      vir.material.map = candleTex(false); vir.material.needsUpdate = true;

      /* 平行光线（u=f 出射光），始终存在、用透明度切换 */
      O.rays = [];
      [-2, -1, 0, 1, 2].forEach(function (k) {
        var r = new T.Mesh(new T.BoxGeometry(26, .08, .08),
          new T.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false }));
        r.position.set(13, AXIS_Y + k * 1.3, 0); K.scene().add(r); O.rays.push(r);
      });

      /* 远处光源（测焦距用），从备料位真实移入光路 */
      var sun = new T.Mesh(new T.BoxGeometry(3, 8, 8),
        new T.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: .6 }));
      sun.position.set(SUN_X, AXIS_Y, -HOME_Z); K.scene().add(sun); O.sun = sun;

      /* 每件落地器材一个深色接地阴影；移动件的阴影在 update 里跟随 */
      O.gObj = P.ground(-20, 0, 4);
      O.gScr = P.ground(13, 0, 4);
      P.ground(0, 0, 4);            // 透镜
      P.ground(0, -3.2, 3);         // 透镜支座
      P.ground(SUN_X, 0, 3);        // 远处光源
      P.ground(0, HOME_Z, 2.5);     // 遮光板备料位

      K.tag(O.lens, '凸透镜', 'f = ' + F + ' cm；v = P.model.lensV(f,u)、m = P.model.lensM(f,u)');
      K.tag(O.obj, '蜡烛（物体）', '焰心、透镜光心、光屏中心同高 y ≈ ' + AXIS_Y + ' cm');
      K.tag(O.scr, '光屏（P.stand 支座）', '承接实像；虚像 / u=f 时屏上无清晰像');
      K.tag(O.hr, '高度刻度尺', '三心等高参照（0~12 cm 可读）');
      K.tag(O.axis, '主光轴 / 等高线', '贯穿三心，y = ' + AXIS_Y + ' cm');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      var u = s._u;
      var halfK = s.half ? .5 : 1;      // 反例：通光面积减半 → 像亮度约减半

      /* 器材真实位移：focus 模式把蜡烛移出光路、太阳移入（不用 visible） */
      var focus = (s.mode === 'focus');
      move(O.obj, focus ? -BENCH_LEN / 2 : -u, focus ? HOME_Z : 0, dt);
      move(O.sun, SUN_X, focus ? 0 : -HOME_Z, dt);
      O.slObj.position.x = O.obj.position.x;
      O.slLens.position.x = 0;

      /* 遮光板：反例按钮触发，从备料位移到透镜前遮住下半 */
      move3(O.cover, s.half ? O.coverWork : O.coverHome, dt);

      if (focus) {
        /* 测焦距：平行光 u→∞ → v=f，屏放焦点得最小最亮光斑 */
        O.scr.position.x = F; O.slScr.position.x = F;
        setImg(O.img, 'spot', 3.2, false);
        fade(O.img.material, halfK, dt); fade(O.vir.material, 0, dt);
        setRays(0, dt); syncGrounds();
        return;
      }

      var v = P.model.lensV(F, u);       // 1/u + 1/v = 1/f
      var m = P.model.lensM(F, u);       // m = v/u = f/(u−f)
      var real = u > F;
      var atF = Math.abs(u - F) < .4;    // u=f 奇点

      if (atF) {
        /* u=f：v→∞、m→∞，出射平行光，任意位置光屏都无清晰像 */
        O.scr.position.x = SCR_FAR; O.slScr.position.x = SCR_FAR;
        setImg(O.img, 'blur', 7, false);
        fade(O.img.material, .8 * halfK, dt); fade(O.vir.material, 0, dt);
        setRays(.5, dt); syncGrounds();
        return;
      }

      setRays(0, dt);
      if (real) {
        var sx = Math.max(-28, Math.min(28, v));
        O.scr.position.x = sx; O.slScr.position.x = sx;
        setImg(O.img, 'img', Math.abs(m) * 3, real);   // 实像倒立，尺寸 ∝ |m|
        fade(O.img.material, halfK, dt); fade(O.vir.material, 0, dt);
      } else {
        /* u<f：v<0 同侧虚像，屏上无像（opacity→0） */
        O.scr.position.x = SCR_FAR; O.slScr.position.x = SCR_FAR;
        fade(O.img.material, 0, dt);
        O.vir.position.x = Math.max(-34, v);
        var mw = Math.abs(m) * 3;
        O.vir.scale.set(mw, mw * 1.25, 1);
        fade(O.vir.material, .5 * halfK, dt);
      }
      syncGrounds();
    }
  };

  function reset(s) { s.energized = false; s.half = false; }

  K.boot({
    title: '探究凸透镜成像的规律',
    chip: '物理 · 鲁教版 · 八上 · 第三章 光现象 · 第五节 凸透镜成像的规律',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 13, dist: 64, tx: 7, tz: 0, yaw: -.62, pitch: .3 },
    reads: [['u', '物距 u'], ['v', '像距 v'], ['kind', '成像性质'],
            ['m', '放大率'], ['himg', '像高 h′'], ['bright', '通光/像亮度']],
    values: function (s) {
      if (s.mode === 'focus') return {
        u: '∞（平行光）', v: F + ' cm', kind: '最小最亮光斑（测焦距）',
        m: '—', himg: '—', bright: s.half ? '通光½·光斑亮度≈½' : '完整'
      };
      var u = s._u, v = P.model.lensV(F, u), m = P.model.lensM(F, u);
      if (Math.abs(u - F) < .4) return {
        u: u + ' cm', v: '∞（平行光）', kind: '不成像（出射平行光，屏上无清晰像）',
        m: '|m| → ∞', himg: '—', bright: '—'
      };
      var real = u > F, am = Math.abs(m);
      var himg = am * H_OBJ;                 // 像高 h′ = |m|·h
      var kind = real
        ? (am < .95 ? '倒立·缩小·实像（照相机）'
          : (am > 1.05 ? '倒立·放大·实像（投影仪）' : '倒立·等大·实像'))
        : '正立·放大·虚像（放大镜）';
      return {
        u: u + ' cm',
        v: real ? v.toFixed(1) + ' cm' : ('同侧 ' + Math.abs(v).toFixed(1) + ' cm（虚像）'),
        kind: kind,
        m: '|m| = ' + am.toFixed(2),
        himg: himg.toFixed(1) + ' cm',
        bright: s.half ? '通光 ½ · 像亮度 ≈ ½（像仍完整）' : '完整'
      };
    },
    steps: [
      { name: '测焦距', title: '平行光聚焦法测焦距 f',
        ask: '让凸透镜正对平行光，屏上什么位置出现最小最亮光斑？',
        body: '<p><b>操作：</b>凸透镜正对<b>平行光</b>（远处光源从备料位移入光路），在另一侧移动光屏，屏上出现<b>最小最亮的光斑</b>，光斑到光心的距离即<b>焦距 f</b>。</p>' +
          '<p><b>模型：</b>高斯成像 <b>1/u + 1/v = 1/f</b>，即 <b>v = P.model.lensV(f, u) = f·u/(u−f)</b>；平行光 u → ∞ 时 <b>v → f = ' + F + ' cm</b>，故屏放在 v = f 处得最小最亮光斑（本例屏在 x = ' + F + ' cm）。</p>' +
          '<p><b>边界/假设：</b>薄透镜、近轴光线（高斯近似）；「最小最亮」需前后移动光屏反复比较，光源不够远（u 不够大）会使 v 明显大于 f。</p>' +
          '<p><b>易错/反例：</b>把任意一个「很亮的光斑」当焦点、未前后比较就读数，是本实验主要误差；口诀<b>一倍焦距分虚实，二倍焦距分大小</b>。</p>',
        apply: function (s) { s.mode = 'focus'; reset(s); },
        cam: { tx: -10, ty: 10, tz: 0, dist: 50, yaw: -.62, pitch: .4 } },
      { name: '三心等高', title: '调节蜡烛、透镜、光屏“三心等高”',
        ask: '为什么要让烛焰中心、透镜光心、光屏中心在同一高度？',
        body: '<p><b>操作：</b>调节三只支座（P.stand 夹持高度可调），使<b>烛焰中心、透镜光心、光屏中心</b>大致都在主光轴 <b>y = ' + AXIS_Y + ' cm</b>；画面里半透明<b>等高参照线</b>贯穿三心，左端<b>竖直刻度尺（0~12 cm 可读）</b>给出高度基准，光具座上的滑块带器材沿导轨真实滑动。</p>' +
          '<p><b>模型意义：</b>近轴成像中像落在过光心的水平主光轴上；三心等高，像才成在光屏<b>中央</b>。</p>' +
          '<p><b>边界/易错：</b>三心不等高，像会偏出光屏甚至找不到；蜡烛燃烧变短后焰心下降，若不重新调高，像会向上移出屏——实验中需及时调整。</p>' +
          '<p><b>读数：</b>物距 u 由步骤给定，像距 v 与放大率 |m| 每帧由 P.model.lensV / lensM 实时算出。</p>',
        apply: function (s) { s.mode = 'mid'; s._u = 20; reset(s); },
        cam: { tx: 0, ty: 12, tz: 2, dist: 48, yaw: -.62, pitch: .38 } },
      { name: 'u>2f', title: '物距大于二倍焦距：倒立缩小实像',
        ask: 'u>2f 时成什么像？对应哪种应用？',
        body: '<p><b>模型：</b><b>v = P.model.lensV(f, u) = f·u/(u−f)</b>，<b>m = P.model.lensM(f, u) = f/(u−f)</b>，像高 <b>h′ = |m|·h</b>（h = ' + H_OBJ + ' cm）。u > 2f 时 f < v < 2f、|m| < 1 → <b>倒立·缩小·实像</b>。</p>' +
          '<p><b>本例（数字由模型算）：</b>u = 20 cm → v = ' + P.model.lensV(F, 20).toFixed(1) + ' cm，|m| = ' + Math.abs(P.model.lensM(F, 20)).toFixed(2) + '，h′ = ' + (Math.abs(P.model.lensM(F, 20)) * H_OBJ).toFixed(1) + ' cm；屏上像尺寸随 |m| 实时变化。<b>应用：照相机</b>。</p>' +
          '<p><b>反例（遮住透镜一半）：</b>按下方按钮把遮光板移到透镜前遮住下半，通光面积减半；但透镜<b>每一部分都独立成完整像</b>，屏上仍是<b>完整</b>的像，只是<b>亮度约减半</b>（|m| 与像尺寸不变）。</p>' +
          '<p><b>易错：</b>以为「遮一半就只剩半个像」——这是错的；可用两个按钮反复切换对照。</p>',
        apply: function (s) { s.mode = 'mid'; s._u = 20; reset(s); },
        controls: [
          { type: 'btn', label: '设为 u = 20 cm（远）', onClick: function (s) { s.mode = 'mid'; s._u = 20; } },
          { type: 'btn', label: '遮住透镜下半（反例：像完整但变暗）', onClick: function (s) { s.half = true; } },
          { type: 'btn', label: '露出整片透镜', onClick: function (s) { s.half = false; } }
        ],
        cam: { tx: 0, ty: 11, tz: 2, dist: 46, yaw: -.62, pitch: .38 } },
      { name: 'f<u<2f', title: '物距在一二倍焦距间：倒立放大实像',
        ask: '把蜡烛移近到 f<u<2f，像如何变化？',
        body: '<p><b>模型：</b>u = 12 cm → v = P.model.lensV(f, 12) = <b>' + P.model.lensV(F, 12).toFixed(1) + ' cm</b>（v > 2f），|m| = P.model.lensM(f, 12) = <b>' + Math.abs(P.model.lensM(F, 12)).toFixed(2) + '</b>，像高 h′ = |m|·h = <b>' + (Math.abs(P.model.lensM(F, 12)) * H_OBJ).toFixed(1) + ' cm</b> → <b>倒立·放大·实像</b>，应用：投影仪 / 幻灯机。</p>' +
          '<p><b>边界：</b>u → f⁺ 时 v = f·u/(u−f) → ∞、|m| → ∞，光屏需移到很远且像极大变暗，受光具座长度限制——这正接下一步 u = f 的情形。</p>' +
          '<p><b>反例仍成立：</b>遮住透镜一半，像依旧完整、只是变暗（按钮可切换）。</p>',
        apply: function (s) { s.mode = 'mid'; s._u = 12; reset(s); },
        controls: [
          { type: 'btn', label: '设为 u = 12 cm（近）', onClick: function (s) { s.mode = 'mid'; s._u = 12; } },
          { type: 'btn', label: '遮住透镜下半（反例）', onClick: function (s) { s.half = true; } },
          { type: 'btn', label: '露出整片透镜', onClick: function (s) { s.half = false; } }
        ],
        cam: { tx: 6, ty: 11, tz: 2, dist: 46, yaw: -.62, pitch: .38 } },
      { name: 'u<f', title: '物距小于焦距：正立放大虚像；u=f 不成像',
        ask: '把蜡烛移到焦点以内，光屏上还能看到像吗？u=f 呢？',
        body: '<p><b>u<f（放大镜）：</b>u = 6 cm → v = P.model.lensV(f, 6) = <b>' + P.model.lensV(F, 6).toFixed(1) + ' cm</b>（v < 0，像与物同侧），|m| = <b>' + Math.abs(P.model.lensM(F, 6)).toFixed(2) + '</b> → <b>正立·放大·虚像</b>；<b>光屏上完全没有像</b>（虚像不能承接），需从屏侧透过透镜观察。</p>' +
          '<p><b>u=f 不成像（真实表现）：</b>把 u 设到 f = ' + F + ' cm，v = f·u/(u−f) 的分母为 0 → <b>v → ∞、|m| → ∞</b>，折射光变为<b>平行光</b>：按下方按钮可见一束平行出射光，光屏移到任意位置都只得一片<b>弥散光斑、无清晰像</b>（不是「成很大的像」）。</p>' +
          '<p><b>边界/易错点：</b>① u = f 是<b>根本不成像</b>，不是像太大；② u < f 是屏上<b>无像</b>，不是「模糊的像」；③ 高斯公式在 u = f 处发散，属模型奇点，用「出射平行光」描述而非代入求值。</p>',
        apply: function (s) { s.mode = 'mid'; s._u = 6; reset(s); },
        controls: [
          { type: 'btn', label: '设为 u = 6 cm（焦点内·虚像）', onClick: function (s) { s.mode = 'mid'; s._u = 6; } },
          { type: 'btn', label: '设为 u = f = 8 cm（不成像·平行光斑）', onClick: function (s) { s.mode = 'mid'; s._u = F; } }
        ],
        cam: { tx: -10, ty: 11, tz: 0, dist: 48, yaw: -.62, pitch: .4 } }
    ],
    quiz: function () {
      var bank = [
        { q: '一倍焦距的作用？', opts: ['分虚实', '分大小', '都分', '无关'], ans: '分虚实', why: 'u>f 成实像，u<f 成虚像，u=f 不成像。' },
        { q: 'u>2f 成什么像？', opts: ['倒立缩小实像', '正立放大虚像', '倒立放大实像', '等大实像'], ans: '倒立缩小实像', why: '物距大于二倍焦距，成倒立缩小实像，如照相机。' },
        { q: '放大镜利用？', opts: ['u<f 正立放大虚像', 'u>2f', 'f<u<2f', 'u=f'], ans: 'u<f 正立放大虚像', why: '物体在焦点以内成正立放大虚像。' },
        { q: '为何要三心等高？', opts: ['像成在光屏中央', '更亮', '保护器材', '测焦距'], ans: '像成在光屏中央', why: '三心不等高会使像偏出光屏甚至找不到像。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
