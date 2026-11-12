/* 格物实验室 · 工业级四旋翼无人机 · 结构与装调（职业教育线 · 混合管线）
   ----------------------------------------------------------------------------
   真机基准：DJI Matrice 300 RTK 级，对角轴距 895 mm → 44.75 单位（1 单位=2 cm）；
   展开 810×670×430 mm、双 TB60 电池、上置碳管机臂、下置三轴云台、六向避障。
   混合分工：
     · 外观/结构件 = build/assets/drone-shell.glb（GLTFExporter 导出的精模），
       29 个命名节点；课件按 material.name 升级 PBR，碳纤维斜纹/注塑颗粒/
       阳极氧化铝拉丝/镜头玻璃/橡胶都是程序化 canvas 生成，不是纯色。
     · 内部件 = 程序化：飞控板、电调×4、分电板、GPS/IMU、线束、减震球。
   运动学：四电机差速控制俯仰/横滚/偏航/油门，桨转速由状态量解析给出。
   拆解：上壳抬起、电池沿 +X 抽出、桨叶拆下、机臂绕铰链折叠 —— 方向物理可行。
   注意：K.boot 必须传 postfx:true（构建器只注入 addons 源码，不启用后处理）。
*/
(function () {
  var T = window.THREE, K = window.Lab;
  var PI = Math.PI, TAU = PI * 2;
  var WB = 44.75, MX = WB / (2 * Math.SQRT2);

  /* ── 状态 ── */
  /* 由 apply() 设置、又被滑块显示/判断的量一律用 `_` 前缀：
     goStep 会把普通数值键复位成旧值再做 0.55s 补间，滑块会卡在旧值，
     出现「滑块 0 但读数已跳」的错位。下划线键被引擎跳过补间，
     拆解/折叠的平滑改由 update 里的 _ex / _fd 自己缓动。 */
  var st = {
    t: 0, _labSet: 'all',
    spin: 1, _throttle: 0, _armed: 0,
    _explPct: 0, _fold: 0, _ex: 0, _fd: 0,
    n: [0, 0, 0, 0],          /* 四电机转速 rpm */
    _glow: 0
  };
  var O = {
    drone: null, glb: null, glbReady: false, parts: {},
    props: [], motors: [], arms: [], bats: [], shellTop: null, shellMid: null,
    inner: null, labels: {}, bench: null, loadCells: []
  };

  /* ══════════════════════════════════════════════════════════════
     程序化 PBR 贴图：真机质感全靠这几张，不是纯色塑料
     ══════════════════════════════════════════════════════════════ */

  /* 碳纤维 2×2 斜纹（twill weave）：每个 2×2 单元经纱跨两根纬纱，
     明暗交替形成斜向纹路，再叠清漆高光与细噪点。 */
  function carbonTex() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i, j, k;
    x.fillStyle = '#1c2026'; x.fillRect(0, 0, 128, 128);
    var cell = 16, n = 128 / cell;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        /* 2×2 twill：经纱在上还是纬纱在上的相位沿对角线推进 */
        var warpUp = ((Math.floor(i / 2) + Math.floor(j / 2)) % 2) === 0;
        var g = warpUp ? 52 : 34;
        var grd = x.createLinearGradient(i * cell, j * cell,
                                         (i + 1) * cell, (j + 1) * cell);
        if (warpUp) {
          grd.addColorStop(0, 'rgb(' + (g + 8) + ',' + (g + 10) + ',' + (g + 14) + ')');
          grd.addColorStop(.5, 'rgb(' + (g + 22) + ',' + (g + 25) + ',' + (g + 30) + ')');
          grd.addColorStop(1, 'rgb(' + (g + 4) + ',' + (g + 6) + ',' + (g + 9) + ')');
        } else {
          grd.addColorStop(0, 'rgb(' + (g + 4) + ',' + (g + 6) + ',' + (g + 9) + ')');
          grd.addColorStop(.5, 'rgb(' + (g + 18) + ',' + (g + 21) + ',' + (g + 26) + ')');
          grd.addColorStop(1, 'rgb(' + (g + 6) + ',' + (g + 8) + ',' + (g + 12) + ')');
        }
        x.fillStyle = grd;
        x.fillRect(i * cell, j * cell, cell, cell);
        /* 纤维束边界（细暗线） */
        x.strokeStyle = 'rgba(10,12,15,.55)'; x.lineWidth = 1;
        x.strokeRect(i * cell + .5, j * cell + .5, cell - 1, cell - 1);
      }
    }
    /* 细噪点 + 清漆斜向高光 */
    for (k = 0; k < 2600; k++) {
      var v = 90 + Math.floor(Math.random() * 70);
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',' + (.04 + Math.random() * .10).toFixed(2) + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(6, 2);
    t.anisotropy = 4;
    return t;
  }
  /* 注塑磨砂颗粒：细密噪点 + 极细划痕（近景不是一块纯色板） */
  function plasticTex(rep) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    /* 底色要压得很暗：这套管线的双重 gamma 会把贴图抬亮约一倍，
       用浅灰底贴图乘出来就是一块白板。 */
    x.fillStyle = '#8f979f'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 5200; i++) {
      var v = 88 + Math.floor(Math.random() * 62);
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',' + (.16 + Math.random() * .34).toFixed(2) + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random(), 1 + Math.random());
    }
    for (i = 0; i < 40; i++) {
      x.strokeStyle = 'rgba(120,132,145,.10)'; x.lineWidth = .5;
      x.beginPath(); var y = Math.random() * 128;
      x.moveTo(Math.random() * 30, y); x.lineTo(60 + Math.random() * 68, y + (Math.random() - .5) * 2);
      x.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 4, rep || 4);
    return t;
  }
  /* 阳极氧化铝拉丝：细横纹 + 微弱噪点 */
  function brushedTex() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#c8ced4'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 260; i++) {
      var v = 150 + Math.floor(Math.random() * 90);
      x.fillStyle = 'rgba(' + v + ',' + (v + 3) + ',' + (v + 8) + ',' + (.06 + Math.random() * .18).toFixed(2) + ')';
      x.fillRect(0, i * .5 + Math.random() * .4, 128, .5 + Math.random() * .6);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(2, 3);
    return t;
  }
  /* 台面防静电垫：细网格纹 */
  function matTex() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#22332d'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 128; i += 8) {
      x.strokeStyle = 'rgba(150,190,170,.10)'; x.lineWidth = .7;
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke();
    }
    for (i = 0; i < 2400; i++) {
      var v = 40 + Math.floor(Math.random() * 40);
      x.fillStyle = 'rgba(' + v + ',' + (v + 12) + ',' + (v + 6) + ',' + (.15 + Math.random() * .2).toFixed(2) + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(9, 6);
    return t;
  }

  /* ── PBR 材质表（按 glTF material.name 升级） ── */
  var MAT = {};
  (function initMats() {
    var car = carbonTex(), pla = plasticTex(4), br = brushedTex();
    /* 双重 gamma（FinalShader 的 pow(1/2.2) + renderer sRGB）会把深色抬亮，
       且 PMREM 环境反射过强会把碳纤/塑料刷成银白。A/B 实测：把 envMapIntensity
       压到 .3~.5、基色压到接近黑，才回到真机那种哑光深灰质感。 */
    MAT.shell = new T.MeshPhysicalMaterial({
      color: 0x5a636c, metalness: .14, roughness: .66,
      clearcoat: .10, clearcoatRoughness: .62,
      map: pla, bumpMap: pla, bumpScale: .012, envMapIntensity: .38
    });
    MAT.shellDk = new T.MeshStandardMaterial({
      color: 0x323a42, metalness: .22, roughness: .74,
      map: pla, bumpMap: pla, bumpScale: .016, envMapIntensity: .32
    });
    MAT.carbon = new T.MeshPhysicalMaterial({
      color: 0x242a30, metalness: .28, roughness: .42,
      clearcoat: .48, clearcoatRoughness: .28,
      map: car, bumpMap: car, bumpScale: .010, envMapIntensity: .34
    });
    /* 桨叶：哑光深色碳纤，绝不能带高光清漆（会反光成银白细条） */
    MAT.prop = new T.MeshStandardMaterial({
      color: 0x20262c, metalness: .14, roughness: .82,
      map: car, bumpMap: car, bumpScale: .008, envMapIntensity: .22
    });
    MAT.alu = new T.MeshStandardMaterial({
      color: 0x6f7882, metalness: .90, roughness: .34,
      map: br, bumpMap: br, bumpScale: .004, envMapIntensity: .52
    });
    MAT.aluDk = new T.MeshStandardMaterial({
      color: 0x3e464e, metalness: .86, roughness: .44,
      map: br, bumpMap: br, bumpScale: .005, envMapIntensity: .42
    });
    MAT.copper = new T.MeshStandardMaterial({
      color: 0x9a6836, metalness: .88, roughness: .36, envMapIntensity: .60
    });
    MAT.dark = new T.MeshStandardMaterial({
      color: 0x181d22, metalness: .22, roughness: .76,
      map: pla, bumpMap: pla, bumpScale: .008, envMapIntensity: .28
    });
    MAT.rubber = new T.MeshStandardMaterial({
      color: 0x1c2024, metalness: .02, roughness: .94, envMapIntensity: .25
    });
    MAT.glass = new T.MeshPhysicalMaterial({
      color: 0x35434f, metalness: .45, roughness: .10,
      transparent: true, opacity: .78, side: T.DoubleSide,
      clearcoat: .9, clearcoatRoughness: .06, envMapIntensity: 1.5
    });
    MAT.lens = new T.MeshPhysicalMaterial({
      color: 0x101c26, metalness: .55, roughness: .05,
      clearcoat: 1.0, clearcoatRoughness: .03,
      envMapIntensity: 1.8, side: T.DoubleSide
    });
    MAT.screw = new T.MeshStandardMaterial({
      color: 0xb6bec7, metalness: .94, roughness: .26, envMapIntensity: 1.35
    });
    MAT.label = new T.MeshStandardMaterial({
      color: 0xc8ced5, metalness: .06, roughness: .80, envMapIntensity: .4
    });
    /* 灯件：emissive >1 触发 bloom，待机暗、解锁后亮 */
    MAT.ledG = new T.MeshBasicMaterial({ color: new T.Color().setRGB(.25, 1.5, .62) });
    MAT.ledR = new T.MeshBasicMaterial({ color: new T.Color().setRGB(1.5, .28, .20) });
    MAT.ledW = new T.MeshBasicMaterial({ color: new T.Color().setRGB(1.3, 1.4, 1.5) });
    MAT.ledG.userData = MAT.ledR.userData = MAT.ledW.userData = { isLed: 1 };
    /* 程序化内部件 */
    MAT.pcb = new T.MeshStandardMaterial({ color: 0x18392c, metalness: .12, roughness: .72 });
    MAT.chip = new T.MeshStandardMaterial({ color: 0x1a1e22, metalness: .45, roughness: .48 });
    MAT.gold = new T.MeshStandardMaterial({ color: 0xc8a355, metalness: .92, roughness: .28 });
    MAT.wire = new T.MeshStandardMaterial({ color: 0x2a2f34, metalness: .05, roughness: .88 });
    MAT.bench = new T.MeshStandardMaterial({ color: 0x2b333b, metalness: .55, roughness: .52 });
    MAT.benchTop = new T.MeshStandardMaterial({
      color: 0x44544b, metalness: .10, roughness: .84,
      map: matTex(), bumpMap: matTex(), bumpScale: .012, envMapIntensity: .42
    });
    MAT.steel = new T.MeshStandardMaterial({ color: 0xa8b2bc, metalness: .92, roughness: .28 });
    MAT.warn = new T.MeshStandardMaterial({ color: 0xb08a1e, metalness: .12, roughness: .60 });
  })();

  function RM(w, h, d, r, mat) {
    return new T.Mesh(K.geoRoundBox(w, h, d, r === undefined ? .16 : r, 3), mat);
  }

  /* ── GLB 加载：base64 → ArrayBuffer → loader.parse（零 fetch，CSP 安全） ── */
  function b64ToArr(str) {
    var bin = atob(str), n = bin.length, u = new Uint8Array(n), i;
    for (i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  var UPGRADE = {};
  ['shell', 'shellDk', 'carbon', 'prop', 'alu', 'aluDk', 'copper', 'dark', 'rubber',
   'glass', 'lens', 'screw', 'label', 'ledG', 'ledR', 'ledW'].forEach(function (k) {
    UPGRADE[k] = MAT[k];
    UPGRADE['DRONE_' + k] = MAT[k];      /* 兜底：万一 loader 保留了 material.name */
  });
  /* 从 mesh.name 的 "MAT_<key>__" 前缀取材质键 */
  function matKeyOf(o) {
    var n = o.name || '';
    if (n.indexOf('MAT_') === 0) return n.slice(4).split('__')[0];
    if (o.material && o.material.name) {
      var m = o.material.name;
      if (m.indexOf('DRONE_') === 0) return m.slice(6);
    }
    return null;
  }
  /* 节点名 → 认件描述（悬停显示） */
  var TAGS = {
    SHELL_TOP:   ['上壳 / 顶盖', '玻纤增强注塑件，内含 IMU/GPS 舱；拆解时整体抬起，露出飞控仓'],
    SHELL_MID:   ['中壳 / 主承力壳', '承载机臂铰链与电池仓，侧面散热格栅与接口盖板在此'],
    SHELL_BOTTOM:['下壳 / 铝合金底板', '压铸铝承载板带散热鳍片，云台与起落架都固定在它上面'],
    SENSORS:     ['六向避障传感器', '前/后/左/右/上/下双目视觉与红外 ToF，探测 0.7–40 m'],
    SCREWS:      ['沉头螺丝 ×8', '顶盖固定件，拆装须按对角顺序、规定扭矩拧紧'],
    LEDS:        ['航行状态灯', '左红右绿、尾部白色，夜间判向与飞控状态指示'],
    GEAR_L:      ['起落架（左）', '碳纤维斜撑 + 横向滑橇 + 橡胶脚垫，吸收着陆冲击'],
    GEAR_R:      ['起落架（右）', '碳纤维斜撑 + 横向滑橇 + 橡胶脚垫，吸收着陆冲击'],
    GIMBAL:      ['三轴增稳云台', 'Yaw/Roll/Pitch 三轴无刷电机 + 橡胶减震球，隔离机体振动'],
    BAT_L:       ['TB60 智能电池（左）', '12S LiPo 5935 mAh / 52.8 V / 274 Wh，自加热，双电池冗余'],
    BAT_R:       ['TB60 智能电池（右）', '12S LiPo 5935 mAh / 52.8 V / 274 Wh，自加热，双电池冗余'],
    BAT_BAY:     ['电池仓 / 滑轨', '双仓独立导轨与卡扣，电池沿机身轴向插入；触点在仓底，插到位才通电'],
    RTK_L:       ['RTK / GNSS 天线（左）', 'GPS+GLONASS+BeiDou+Galileo 双天线测向，RTK FIX 可达 cm 级'],
    RTK_R:       ['RTK / GNSS 天线（右）', '双天线基线测向，抗磁干扰，也是 RTK 定位基准'],
    MOTOR_0:     ['无刷电机 · 前左', '外转子直驱，KV 值决定桨速；三相线由电调供电'],
    MOTOR_1:     ['无刷电机 · 前右', '外转子直驱，与对角电机同向、相邻反向以抵消反扭矩'],
    MOTOR_2:     ['无刷电机 · 后左', '外转子直驱，定子绕组铜线在 bell 下沿可见'],
    MOTOR_3:     ['无刷电机 · 后右', '外转子直驱，转速由飞控 PWM/ESC 指令实时调节'],
    PROP_0:      ['折叠桨 · 前左', '21 inch 级碳纤维折叠桨，桨尖后掠降噪；拆装注意正反桨'],
    PROP_1:      ['折叠桨 · 前右', '离心力展开、停机自动收拢；桨根铰链销是易损检查点'],
    PROP_2:      ['折叠桨 · 后左', '与对角桨同旋向，四桨两正两反配平反扭矩'],
    PROP_3:      ['折叠桨 · 后右', '桨尖警示色便于目视判转，裂纹/缺口必须更换'],
    HINGE_0:     ['机臂折叠铰链（前左）', '铸铝铰链 + 锁扣，运输时向内折叠；锁扣必须到位才能起飞'],
    HINGE_1:     ['机臂折叠铰链（前右）', '铸铝铰链 + 锁扣，检查锁止销磨损是日常维护项'],
    HINGE_2:     ['机臂折叠铰链（后左）', '铸铝铰链 + 锁扣，折叠时电机与桨随机臂整体转动'],
    HINGE_3:     ['机臂折叠铰链（后右）', '铸铝铰链 + 锁扣，展开后机臂上反角固定'],
    ARM_FL:      ['碳纤维机臂 · 前左', '锥形碳管上置，内走三相动力线与信号线'],
    ARM_FR:      ['碳纤维机臂 · 前右', '锥形碳管上置，2×2 斜纹铺层兼顾刚度与重量'],
    ARM_RL:      ['碳纤维机臂 · 后左', '锥形碳管上置，抱箍连接机身与电机座'],
    ARM_RR:      ['碳纤维机臂 · 后右', '锥形碳管上置，抱箍连接机身与电机座']
  };
  var ARM_DIR = { ARM_FL: 1, ARM_FR: -1, ARM_RL: -1, ARM_RR: 1 };

  function mountGLB(root) {
    O.glb = root;
    /* ★ 关键：整个 gltf.scene 必须作为一个整体挂到整机根组。
       MOTOR / PROP / HINGE 各节点都是 ARM 的子节点（机臂绕铰链折叠时
       电机与桨要跟着转），SCREWS 与 LEDS 是 SHELL_TOP 的子节点。
       若按名字逐个 add，会拆掉层级、局部坐标全失效 —— 桨叶会消失、电机跑进机身。
       所以这里只做「登记引用 + 材质升级」，绝不移动节点。 */
    O.drone.add(root);
    O.leds = [];
    root.traverse(function (o) {
      var n = o.name || '';
      if (TAGS[n]) {
        O.parts[n] = o;
        K.tag(o, TAGS[n][0], TAGS[n][1]);
        if (/^ARM_/.test(n)) O.arms.push({ g: o, dir: ARM_DIR[n] });
        if (/^PROP_/.test(n)) O.props.push(o);
        if (/^MOTOR_/.test(n)) O.motors.push(o);
        if (/^BAT_[LR]$/.test(n)) { O.bats.push(o); o.userData.x0 = o.position.x; o.userData.y0 = o.position.y; }
        if (n === 'SHELL_TOP') O.shellTop = o;
        if (n === 'SHELL_MID') O.shellMid = o;
      }
      if (o.isMesh) {
        var key = matKeyOf(o);
        if (key && UPGRADE[key]) {
          /* 灯件材质要逐灯克隆，否则共享单例会让所有灯一起闪烁/改色 */
          var mk = UPGRADE[key];
          o.material = (mk.userData && mk.userData.isLed) ? mk.clone() : mk;
          if (mk.userData && mk.userData.isLed) o.material.userData = { isLed: 1 };
        }
        o.castShadow = true; o.receiveShadow = true;
        if (o.material && o.material.userData && o.material.userData.isLed) O.leds.push(o);
      }
    });
    /* 桨叶拆解位移的基准高度，必须在第一次 update 之前记下来 */
    O.props.forEach(function (p) { p.userData.y0 = p.position.y; });
    O.glbReady = true;
  }
  function loadGLB() {
    var b64 = (window.__GLB || {})['drone-shell'] || '';
    if (b64.length < 200 || !T.GLTFLoader) { O.glbReady = true; return; }
    try {
      new T.GLTFLoader().parse(b64ToArr(b64), '', function (g) { mountGLB(g.scene); },
        function (e) { console.error('drone GLB parse failed', e); O.glbReady = true; });
    } catch (e) { console.error('drone GLB exception', e); O.glbReady = true; }
  }

  /* ── 车间工位：防静电台面 + 方管腿 + 脚垫 + 工具柜 + 接触阴影 ── */
  function buildBench(G) {
    var g = new T.Group(), GY = -15.5, W = 46, D = 34;
    var top = RM(W, 1.5, D, .28, MAT.benchTop); top.position.y = -.75; g.add(top);
    var band = RM(W + 1.2, .55, D + 1.2, .16, MAT.bench); band.position.y = -1.7; g.add(band);
    /* 前缘黄警示条 */
    var warn = RM(W + .3, .22, .34, .06, MAT.warn);
    warn.position.set(0, -.05, D / 2 - .05); g.add(warn);
    [[W / 2 - 2.6, D / 2 - 2.6], [-(W / 2 - 2.6), D / 2 - 2.6],
     [W / 2 - 2.6, -(D / 2 - 2.6)], [-(W / 2 - 2.6), -(D / 2 - 2.6)]].forEach(function (p) {
      var leg = RM(1.5, 13.6, 1.5, .12, MAT.bench);
      leg.position.set(p[0], -8.4, p[1]); g.add(leg);
      var foot = RM(2.0, .34, 2.0, .10, MAT.steel);
      foot.position.set(p[0], -15.3, p[1]); g.add(foot);
    });
    var shelf = RM(W - 6, .4, D - 7, .10, MAT.bench); shelf.position.y = -9.6; g.add(shelf);
    /* 台下工具柜（两抽 + 拉手） */
    var cab = RM(12, 7.2, 12, .18, MAT.bench); cab.position.set(11, -6.0, -3.0); g.add(cab);
    [-2.4, -4.6].forEach(function (yy) {
      var dr = RM(10.8, 1.9, .3, .10, MAT.steel);
      dr.position.set(11, yy, 3.1); g.add(dr);
      var hd = new T.Mesh(new T.CylinderGeometry(.09, .09, 4.2, 10), MAT.steel);
      hd.rotation.z = PI / 2; hd.position.set(11, yy, 3.35); g.add(hd);
    });
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(g);
    K.blob({ x: 0, z: 0, r: 14, y: .02 });
  }

  /* ── 内部件（程序化）：飞控仓里的板卡与线束，上壳抬起后才看得见 ── */
  function buildInner() {
    var g = new T.Group(); g.name = 'INNER'; O.inner = g;
    /* 飞控主板：深绿 PCB + 芯片 + 排针 + IMU 屏蔽罩 */
    var pcb = RM(9.5, .28, 7.0, .10, MAT.pcb); pcb.position.set(-1.0, 2.35, 0); g.add(pcb);
    K.tag(pcb, '飞控主板 / FC', '双 IMU 冗余 + 气压计，融合 GNSS/视觉数据解算姿态，输出四路电调指令');
    [[-2.2, -1.4, 2.2, 2.0], [1.6, 1.2, 1.8, 1.6], [2.9, -1.8, 1.2, 1.2]].forEach(function (q) {
      var chip = RM(q[2], .48, q[3], .08, MAT.chip);
      chip.position.set(q[0] - 1.0, 2.72, q[1]); g.add(chip);
    });
    /* IMU 金属屏蔽罩 */
    var shield = RM(2.6, .55, 2.4, .10, MAT.steel);
    shield.position.set(-2.4, 2.78, 1.6); g.add(shield);
    /* 排针（金色） */
    for (var i = 0; i < 10; i++) {
      var pin = RM(.10, .30, .10, .02, MAT.gold);
      pin.position.set(2.7, 2.60, -2.6 + i * .58); g.add(pin);
    }
    /* 分电板 + 四个电调（每个机臂一路） */
    var pdb = RM(4.2, .22, 6.6, .08, MAT.pcb);
    pdb.position.set(5.6, 2.30, 0); g.add(pdb);
    K.tag(pdb, '分电板 / PDB', '把双电池 52.8 V 分配到四路电调与云台/图传，带电流采样');
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (s, k) {
      var esc = RM(3.0, .85, 1.7, .12, MAT.chip);
      esc.position.set(1.6 + s[0] * 5.0, 2.65, s[1] * 2.3); g.add(esc);
      K.tag(esc, '电调 ESC · ' + (k + 1), '把飞控 PWM 指令变成三相交流驱动无刷电机，实时回传转速与温度');
      /* 三相线走向机臂根部 */
      var curve = new T.CatmullRomCurve3([
        new T.Vector3(1.6 + s[0] * 5.0, 2.7, s[1] * 2.3),
        new T.Vector3(1.6 + s[0] * 7.2, 2.9, s[1] * 4.4),
        new T.Vector3(s[0] * 8.6, 1.7, s[1] * 5.2)
      ]);
      var w = new T.Mesh(new T.TubeGeometry(curve, 16, .17, 6, false), MAT.wire);
      w.castShadow = true; g.add(w);
    });
    /* GPS / RTK 模块与馈线 */
    var gps = RM(2.4, .5, 2.4, .10, MAT.pcb);
    gps.position.set(-1.2, 3.3, 0); g.add(gps);
    K.tag(gps, 'GNSS / RTK 模块', '接收双天线信号做基线测向，RTK FIX 时水平定位 1 cm + 1 ppm');
    /* 减震球（云台与机身之间） */
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (s) {
      var ball = new T.Mesh(new T.SphereGeometry(.46, 14, 8), MAT.rubber);
      ball.position.set(-8.0 + s[0] * 2.0, 1.2, s[1] * 1.7);
      g.add(ball);
    });
    g.visible = false;      /* 默认藏在顶盖下 */
    O.drone.add(g);
  }

  /* ── 标注（onTop，避免被壳体切半截字） ── */
  function buildLabels() {
    O.labels = {
      all: {
        arm:   K.spriteLabel([-16, 8.5, -13], '碳纤维机臂 ×4', { w: 5.0, fs: 38, onTop: true }),
        motor: K.spriteLabel([-16, 12.2, 14], '外转子无刷电机 ×4', { w: 5.8, fs: 38, onTop: true }),
        prop:  K.spriteLabel([-24, 15.5, -12], '21″ 折叠桨', { w: 4.6, fs: 38, onTop: true }),
        bat:   K.spriteLabel([6, 15.5, 0], '双 TB60 智能电池', { w: 5.4, fs: 38, onTop: true }),
        rtk:   K.spriteLabel([1, 18.5, 10], 'RTK 双天线', { w: 4.4, fs: 38, onTop: true }),
        gim:   K.spriteLabel([-11, -1.5, 12], '三轴增稳云台', { w: 5.0, fs: 38, onTop: true }),
        shell: K.spriteLabel([6, 8.0, -13], '注塑上壳 / 飞控仓', { w: 5.6, fs: 38, onTop: true }),
        gear:  K.spriteLabel([4, 1.5, 16], '起落架 / 橡胶脚垫', { w: 5.6, fs: 38, onTop: true })
      },
      inner: {
        fc:   K.spriteLabel([-2, 7.5, 8], '飞控主板（双 IMU）', { w: 5.6, fs: 38, onTop: true }),
        esc:  K.spriteLabel([8, 6.5, -8], '电调 ESC ×4', { w: 4.6, fs: 38, onTop: true }),
        pdb:  K.spriteLabel([12, 6.0, 6], '分电板 PDB', { w: 4.4, fs: 38, onTop: true }),
        gps:  K.spriteLabel([-6, 8.5, -6], 'GNSS / RTK 模块', { w: 5.2, fs: 38, onTop: true })
      }
    };
  }

  /* ── 四旋翼运动学：差速控制俯仰/横滚/偏航，油门控制总升力 ── */
  var BASE_KV = 0;
  function motorRpm(s, k) {
    if (s._armed < .5 || s._throttle <= 0) return 0;
    var q = K.clamp(s._throttle / 100, 0, 1);
    /* 用两点标定：45% 油门 → 四桨合计 6.3 kgf（正好悬停 6.3 kg 整机），
       满油门 → 约 12 kgf（推重比 ≈1.9，符合工业机 2:1 量级）。
       21″ 桨真机悬停约 3000 rpm、最大约 4100 rpm。 */
    var base = 2224 + 1916 * Math.pow(q, 1.15);
    /* 演示姿态：给一个小的循环差速，学生能看出四桨转速不同 */
    var pitch = Math.sin(s.t * .55) * .055;
    var roll  = Math.cos(s.t * .42) * .045;
    var yaw   = Math.sin(s.t * .33) * .025;
    /* k: 0=前左 1=前右 2=后左 3=后右 */
    var sx = (k === 0 || k === 2) ? -1 : 1;      /* 前=-1 */
    var sz = (k === 0 || k === 1) ? -1 : 1;      /* 左=-1 */
    var spin = (k === 0 || k === 3) ? 1 : -1;    /* 对角同向 */
    return Math.max(0, base * (1 + sx * pitch + sz * roll + spin * yaw));
  }

  /* ── 场景 ── */
  var scene = {
    setup: function () {
      var G = (K.world ? K.world() : K.scene());
      K.envShop({ groundY: -15.5, top: '#7d8893', mid: '#66717c', bot: '#4e5964' });
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .48;
        else if (o.isDirectionalLight) o.intensity *= .72;
        if (o.isMesh && o.material && o.material.color) {
          var hx = o.material.color.getHex();
          if (hx === 0xd9b33e || hx === 0xc8b23f) O.loadCells.push(o);
        }
      });
      /* 车间黄线/墙裙压条在无人机下方会读成异色硬条，先收起 */
      O.loadCells.forEach(function (m) { m.visible = false; });
      var f1 = new T.DirectionalLight(0xffffff, .40); f1.position.set(6, 14, 24); K.scene().add(f1);
      var f2 = new T.DirectionalLight(0xdfe8ff, .18); f2.position.set(-14, 8, 18); K.scene().add(f2);

      buildBench(G);
      var d = new T.Group(); G.add(d);
      /* 脚垫底端 y=-11.05（局部），抬到台面上方 y≈0.2 */
      d.position.y = 11.25;
      O.drone = d;
      buildInner();
      loadGLB();
      buildLabels();
    },

    update: function (dt, s) {
      s.t += dt;
      /* 后处理：SSAO 兼主渲染通道，补 RenderPass 再关掉它；车间曝光压到 .56 */
      if (!s._pf && s.t > .6 && window.__labDebug && window.__labDebug.composer) {
        s._pf = 1;
        var DBG = window.__labDebug, CP = DBG.composer;
        CP.passes.unshift(new T.RenderPass(DBG.scene, DBG.camera));
        CP.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
        CP.passes.forEach(function (p) {
          if (p.uniforms && p.uniforms.uExposure) p.uniforms.uExposure.value = .56;
        });
      }
      s._glow += ((s._armed > .5 && s._throttle > 0 ? 1 : 0) - s._glow) * Math.min(1, dt * 3);
      /* 拆解/折叠自己缓动，滑块值即时生效且模型平滑过渡 */
      s._ex += (K.clamp(s._explPct / 100, 0, 1) - s._ex) * Math.min(1, dt * 5);
      s._fd += (K.clamp(s._fold / 100, 0, 1) - s._fd) * Math.min(1, dt * 5);
      var ex = s._ex, fold = s._fd;

      if (O.glbReady) {
        /* 上壳抬起：沿 +Y，露出飞控仓；中壳不动保证装配关系还在 */
        if (O.shellTop) O.shellTop.position.y = 9.0 * ex;
        if (O.inner) O.inner.visible = ex > .08;
        /* 电池沿 +X 抽出（真实拆电池方向），抬一点避免蹭仓体导轨 */
        O.bats.forEach(function (b) {
          b.position.x = (b.userData.x0 === undefined ? b.position.x : b.userData.x0) + 11 * ex;
          b.position.y = (b.userData.y0 === undefined ? b.position.y : b.userData.y0) + .6 * ex;
        });
        /* 桨叶拆下：沿 +Y 抬起，且拆解时不再自转 */
        O.props.forEach(function (p) { p.position.y = (p.userData.y0 === undefined
          ? (p.userData.y0 = p.position.y) : p.userData.y0) + 4.2 * ex; });
        /* 机臂绕铰链向内折叠：电机与桨作为子节点自动跟随 */
        O.arms.forEach(function (a) { a.g.rotation.y = a.dir * fold * .62; });
        /* 桨自转：转速由运动学给出，四桨两正两反 */
        for (var k = 0; k < O.props.length; k++) {
          var rpm = motorRpm(s, k);
          s.n[k] = rpm;
          var p = O.props[k];
          var dir = (k === 0 || k === 3) ? 1 : -1;
          p.rotation.y += dt * rpm / 60 * TAU * .045 * (s.spin > 0 ? 1 : 0) * (1 - ex * .85);
        }
        /* 状态灯：解锁后呼吸亮，待机暗 */
        O.leds.forEach(function (o, i) {
          if (!o.material.userData.baseC) o.material.userData.baseC = o.material.color.clone();
          var on = .28 + .72 * s._glow * (.75 + .25 * Math.sin(s.t * 4 + i));
          o.material.color.copy(o.material.userData.baseC).multiplyScalar(on);
        });
      }
      /* 标注按步骤分组，拆解展开时收起避免飘 */
      var LS = s._labSet || 'all', vis = ex < .12;
      Object.keys(O.labels).forEach(function (set) {
        Object.keys(O.labels[set]).forEach(function (k2) {
          var L = O.labels[set][k2];
          if (L && L.sprite) L.sprite.visible = vis && (set === LS);
        });
      });
    }
  };
  K.boot({
    title: '工业级四旋翼无人机 · 结构与装调',
    chip: '职业教育 · 无人机装调检修 · 外观 GLB 精模 + 程序化内部件',
    hint: '拖空白处旋转视角 · 滚轮缩放 · 悬停零件看名称 · 单击聚焦该零件 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    postfx: true,
    /* 整机跨度约 58 单位，拉远并偏左避开右侧面板；俯角保证地坪入画 */
    cam: { tx: 8, ty: 12.5, tz: 0, dist: 76, yaw: -.52, pitch: .31 },

    reads: [
      ['m1', '前左电机'], ['m2', '前右电机'],
      ['m3', '后左电机'], ['m4', '后右电机'],
      ['lift', '估算总拉力'], ['mode', '飞控状态']
    ],
    values: function (s) {
      var tot = 0, k;
      for (k = 0; k < 4; k++) tot += s.n[k];
      /* 21″ 桨单桨拉力标定：巡航 3000 rpm 时四桨合计 ≈ 6.3 kgf
         （正好托住含双电池的 6.3 kg 整机，即悬停），满油门约 9 kgf 级
         —— 与 M300 最大起飞重量 9 kg 对得上。系数由这两点标定。 */
      var liftKg = 0;
      for (k = 0; k < 4; k++) liftKg += 0.175 * Math.pow(s.n[k] / 1000, 2);
      return {
        m1: Math.round(s.n[0]) + ' rpm', m2: Math.round(s.n[1]) + ' rpm',
        m3: Math.round(s.n[2]) + ' rpm', m4: Math.round(s.n[3]) + ' rpm',
        lift: liftKg.toFixed(1) + ' kgf',
        mode: s._armed < .5 ? '待机 / 未解锁'
              : (s._throttle < 22 ? '怠速' : (s._throttle > 80 ? '大油门 / 爬升' : '悬停'))
      };
    },

    steps: [
      {
        name: '整机认知',
        cam: { tx: 8, ty: 12.5, tz: 0, dist: 76, yaw: -.52, pitch: .31 },
        title: '一台工业级四旋翼，由哪些总成组成？',
        ask: '为什么四个电机要"两正两反"转，而不是全部同一方向？',
        body: '<p><b>真机基准：</b>按 Matrice 300 RTK 级还原 —— 对角轴距 <b>895 mm</b>、' +
          '展开 810×670×430 mm、双 TB60 智能电池（12S / 52.8 V / 274 Wh）、上置碳纤维机臂、' +
          '下置三轴增稳云台、六向避障、IP45。</p>' +
          '<p><b>看材质：</b>机臂是 <b>2×2 斜纹碳纤维</b>带清漆；壳体是玻纤增强注塑件，' +
          '有分型线、散热格栅、沉头螺丝与接口盖板；电机是阳极氧化铝外转子，' +
          '下沿能看见铜绕组；镜头是镀膜玻璃。放大 5–8 倍可逐项核对。</p>' +
          '<p>拖动鼠标环绕，<b>悬停任一零件</b>会显示名称与作用，单击可聚焦。' +
          '点「上电试转」看四桨差速，点「拆解装调」把上壳揭开。</p>',
        apply: function (s) {
          s._armed = 0; s._throttle = 0; s._explPct = 0; s._fold = 0; s._labSet = 'all';
        },
        controls: [
          { type: 'btn', label: '上电试转 →', onClick: function (s) { s._armed = 1; s._throttle = 45; } },
          { type: 'btn', label: '拆解装调 →', onClick: function (s) { s._explPct = 100; s._labSet = 'inner'; } }
        ]
      },
      {
        name: '动力与飞控',
        cam: { tx: 6, ty: 12.0, tz: 0, dist: 70, yaw: -.42, pitch: .27 },
        title: '四桨差速，怎么让无人机前后左右和转弯？',
        ask: '悬停时四个电机转速一样吗？为什么读数一直在小幅变化？',
        body: '<p><b>四旋翼没有舵面</b>，全靠四个桨的拉力差。对角两桨正转、另两桨反转，' +
          '抵消反扭矩；要前飞就让后桨加速、前桨减速产生俯仰力矩，横滚与偏航同理。</p>' +
          '<p><b>控制链：</b>飞控主板（双 IMU 冗余）→ 解算姿态 → 四路电调 ESC → ' +
          '三相交流驱动外转子电机 → 折叠桨产生拉力。分电板 PDB 把双电池 52.8 V 分到四路。</p>' +
          '<p>推「油门」滑块，观察右侧四个电机转速与总拉力读数一起上升；' +
          '读数有小幅差速波动，是飞控在持续修正姿态 —— 真机悬停时也是这样。</p>',
        apply: function (s) {
          s._armed = 1; s._throttle = 45; s._explPct = 0; s._fold = 0; s._labSet = 'all';
        },
        controls: [
          { type: 'btn', label: '解锁 / 锁定', onClick: function (s) { s._armed = s._armed > .5 ? 0 : 1; if (s._armed > .5 && s._throttle < 20) s._throttle = 45; } },
          { type: 'range', key: '_throttle', min: 0, max: 100, step: 1, label: '油门（%）' },
          { type: 'btn', label: '暂停 / 继续', onClick: function (s) { s.spin = s.spin > 0 ? 0 : 1; } },
          { type: 'btn', label: '看拆解 →', onClick: function (s) { s._explPct = 100; s._labSet = 'inner'; } }
        ]
      },
      {
        name: '拆解装调',
        cam: { tx: 7, ty: 13.5, tz: 0, dist: 72, yaw: -.46, pitch: .30 },
        title: '上壳揭开后，里面是什么？装调要注意什么？',
        ask: '电池为什么沿 +X 抽出，而不是往下取？机臂折叠时哪些件要一起动？',
        body: '<p>拖「拆解程度」把<b>上壳整体抬起</b>，露出飞控主板（双 IMU）、' +
          '四个电调 ESC、分电板 PDB、GNSS/RTK 模块与线束；<b>双电池沿机身轴向抽出</b>，' +
          '<b>桨叶从桨座拆下</b>。</p>' +
          '<p><b>装配关系：</b>顶盖 8 颗沉头螺丝按对角顺序、规定扭矩拧紧；' +
          '机臂折叠时<b>电机与桨作为机臂子节点一起转动</b>；' +
          '云台靠 4 个橡胶减震球隔离机体振动，不能刚性连接。</p>' +
          '<p><b>维护检查点：</b>桨根铰链销磨损、桨叶裂纹、铰链锁扣到位、' +
          '电池触点氧化、散热格栅堵塞 —— 这些都在模型上有对应零件，可悬停认件。</p>',
        apply: function (s) {
          s._armed = 0; s._throttle = 0; s._explPct = 100; s._fold = 0; s._labSet = 'inner';
        },
        controls: [
          { type: 'range', key: '_explPct', min: 0, max: 100, step: 2, label: '拆解程度（%）' },
          { type: 'range', key: '_fold', min: 0, max: 100, step: 2, label: '机臂折叠（%）' },
          { type: 'btn', label: '全部展开 / 合拢', onClick: function (s) { s._explPct = s._explPct > 5 ? 0 : 100; } },
          { type: 'btn', label: '← 整机认知', onClick: function (s) { s._explPct = 0; s._fold = 0; s._labSet = 'all'; } }
        ]
      }
    ],

    quiz: function (s) {
      var bank = [
        { q: '四旋翼为什么要"两正两反"转？', opts: ['抵消反扭矩，避免机体自转', '省电', '让桨更安静', '方便折叠'],
          ans: '抵消反扭矩，避免机体自转',
          why: '对角两桨同向、相邻两桨反向，四个电机的反扭矩两两抵消，偏航靠两组桨的转速差来产生。' },
        { q: 'TB60 智能电池的标称电压是多少？', opts: ['52.8 V（12S LiPo）', '22.2 V（6S）', '14.8 V（4S）', '7.4 V（2S）'],
          ans: '52.8 V（12S LiPo）',
          why: '12 串锂电 12×3.7 V = 44.4 V 标称、50.4 V 满充；TB60 官方标称 52.8 V、5935 mAh、274 Wh，双电池冗余。' },
        { q: '拆下智能电池应该沿哪个方向？', opts: ['沿机身轴向（+X）抽出', '往下压再取出', '往侧面硬撬', '连上壳一起抬'],
          ans: '沿机身轴向（+X）抽出',
          why: '电池仓是沿轴向的滑轨 + 卡扣结构，先解锁卡扣再沿 +X 抽出；往下取会顶到中壳与分电板。' },
        { q: '机臂折叠时，哪些部件必须一起动？', opts: ['电机和桨', '只有桨', '只有机臂管', '云台'],
          ans: '电机和桨',
          why: '电机与桨都装在机臂末端，是机臂总成的子节点；折叠时若只转碳管会让电机悬空、三相线被拉断。' },
        { q: '顶盖 8 颗沉头螺丝的正确拧紧方式？', opts: ['对角顺序、规定扭矩', '从一端顺次拧到底', '越紧越好', '不用扭矩，手拧即可'],
          ans: '对角顺序、规定扭矩',
          why: '对角分次收紧能让壳体均匀受力不变形；复材/注塑件过扭矩会滑丝或压裂，必须按手册扭矩。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
