/* 黑灯工厂 · 汽车总装线（Lights-Out Final Assembly）
   涂装车身下线 → 拆门 → 仪表台 → 座椅 → 底盘合装 → 轮胎 → 车门回装 → 检测下线。
   全场默认「黑灯」：只有设备自身的 LED / 屏幕 / 激光在发光。
   这是黑灯工厂里最难的一段——总装天生比焊装、涂装「柔性」，本片在讲解里点明了
   哪些工序已经能无人、哪些还离不开人，不做「什么都全自动」的粉饰。 */
(function () {
  var T = window.THREE, K = window.Lab;

  /* ---------------- 布局（1 单位 ≈ 0.45 m，车身 4.8 单位 ≈ 4.8 m 级轿车） ---------------- */
  var FLOOR = -16;                  // 地坪面
  var BELT_Y = -14.4;               // 滑板顶面（车身底面）
  var BELT_Z = 0;
  var ROB_Z = -5.1;                 // 机械臂安装位（线后方，臂展 6.1 内）
  var PX = { in: -46, strip: -34, ip: -21, seat: -8, marry: 5, tire: 18, dress: 31, out: 44 };
  var CEIL = 1.6;                   // 屋架下弦
  var AGV_Z = 12.4;                 // AGV 通道中心（放到产线外，不挡视线）
  var CAR = { L: 4.8, W: 1.9, H: 1.48 };   // 白车身主尺寸

  /* ---------------- .glb 真实资产 ---------------- */
  var GLB_ROBOT_ARM = "{{GLB_ROBOT_ARM}}";
  var GLB_AGV = "{{GLB_AGV}}";
  var HAVE_GLB = GLB_ROBOT_ARM.length > 200 && GLB_AGV.length > 200;
  var ASSETS = { robot: null, agv: null };
  /*__GLB_DK1__*/

  function _b64ToArr(str) {
    var bin = atob(str), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  /* 材质升级：按色号换成哑光工业漆 / 亮钢 / 橡胶，让倒角边在暗部也能抓住高光 */
  var _upCache = {};
  function _upMat(m) {
    var isEmissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .01;
    var key = (isEmissive ? 'e' : '') + (m.color ? m.color.getHex() : 0);
    if (_upCache[key]) return _upCache[key];
    var out;
    if (isEmissive) {
      m.envMapIntensity = 1.0; out = m;
    } else {
      var c = m.color ? m.color.getHex() : 0;
      if (c === 0xd67c18) {        // 橙色工业漆：半哑光，暗场里靠边缘高光定形
        out = new T.MeshPhysicalMaterial({ color: 0xc4680f, roughness: .42, metalness: .18, clearcoat: .25, clearcoatRoughness: .45, envMapIntensity: .9 });
      } else if (c === 0x8a9099) { // 钢件：亮金属
        out = new T.MeshStandardMaterial({ color: 0x9aa3ad, roughness: .26, metalness: 1.0, envMapIntensity: 1.25 });
      } else if (c === 0xe7b22f) { // 黄色安全件
        out = new T.MeshStandardMaterial({ color: 0xcf9a20, roughness: .5, metalness: .2, envMapIntensity: .8 });
      } else if (c === 0x23282d) { // 橡胶轮
        out = new T.MeshStandardMaterial({ color: 0x14181c, roughness: .95, metalness: .05 });
      } else {                     // 石墨结构件
        out = new T.MeshStandardMaterial({ color: 0x3b4249, roughness: .44, metalness: .55, envMapIntensity: .95 });
      }
    }
    _upCache[key] = out;
    return out;
  }
  function _loadGLB(b64, cb) {
    new T.GLTFLoader().parse(_b64ToArr(b64), '', function (gltf) {
      gltf.scene.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) o.material = _upMat(o.material);
        }
      });
      cb(gltf.scene);
    }, function (e) { console.error('GLB parse error', e); cb(null); });
  }
  function _preloadGLB(cb) {
    if (!HAVE_GLB) return cb();
    var n = 2, done = function () { if (--n === 0) cb(); };
    _loadGLB(GLB_ROBOT_ARM, function (s) { ASSETS.robot = s; done(); });
    _loadGLB(GLB_AGV, function (s) { ASSETS.agv = s; done(); });
  }

  /* ---------------- 状态 ---------------- */
  var st = {
    run: true, speed: 1, lit: 1, _litT: 1,
    estop: false, done: 0, ng: 0, prod: 0,
    ph: 'IDLE', _t: 0, _simT: 0, job: 5821,
    _cam: 0, _fly: 0, oee: 0,
    xray: 0, explode: 0, _xrayT: 0, _expT: 0   // 透视 / 爆炸视图
  };
  var O = {};                       // 场景对象登记
  var towers = {};                  // 三色灯
  var glows = [];                   // 黑灯时呼吸的发光件
  var cones = [];                   // 工矿灯光锥
  var lamps = [];                   // 工矿灯灯盘
  var rollers = [];                 // 滚筒
  var deviceGlows = [];             // 黑灯时的地面光池（开灯要淡出）
  var screens = [];                 // 屏幕
  var robots = [];                  // 机械臂记录

  /* ---------------- 通用贴图 ---------------- */
  function grainTex(w, avg, amp, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w;
    var x = c.getContext('2d'); var img = x.createImageData(w, w); var d = img.data;
    for (var i = 0; i < w * w; i++) {
      var v = (avg + (Math.random() - .5) * amp) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v; var o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 1, rep || 1);
    return t;
  }
  function normalTex(w, strength, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w;
    var x = c.getContext('2d'); var img = x.createImageData(w, w); var d = img.data;
    var hgt = new Float32Array(w * w);
    for (var i = 0; i < w * w; i++) hgt[i] = Math.random();
    for (var y = 0; y < w; y++) for (var xx = 0; xx < w; xx++) {
      var i2 = y * w + xx;
      var l = hgt[y * w + (xx - 1 + w) % w], r = hgt[y * w + (xx + 1) % w];
      var u = hgt[((y - 1 + w) % w) * w + xx], dn = hgt[((y + 1) % w) * w + xx];
      var nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; var o = i2 * 4;
      d[o] = (nx / len * .5 + .5) * 255; d[o + 1] = (ny / len * .5 + .5) * 255;
      d[o + 2] = (nz / len * .5 + .5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 1, rep || 1);
    return t;
  }
  /* 径向光斑：地面上的灯光倒影 / 发光点的柔晕 */
  var _glowTex = null;
  function glowTex() {
    if (_glowTex) return _glowTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.28, 'rgba(255,255,255,.52)');
    g.addColorStop(.62, 'rgba(255,255,255,.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c); _glowTex = t; return t;
  }
  /* 黄黑警示斜纹（护栏 / 机器人底座） */
  var _hazTex = null;
  function hazTex() {
    if (_hazTex) return _hazTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    x.fillStyle = '#d8a51e'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#14181c'; x.lineWidth = 17;
    for (var i = -128; i < 256; i += 44) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 1);
    _hazTex = t; return t;
  }
  /* 地面反光条：湿亮地坪上被灯拉长的一道亮痕 */
  function glowDecal(x, z, r, color, op, sx, sz, y) {
    var m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2),
      new T.MeshBasicMaterial({
        map: glowTex(), color: color, transparent: true, opacity: op,
        blending: T.AdditiveBlending, depthWrite: false
      }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, (y === undefined ? FLOOR + .045 : y), z);
    m.scale.set(sx || 1, sz || 1, 1);
    m.renderOrder = 1;
    K.scene().add(m);
    return m;
  }
  /* 体积光锥：灯下的光雾（加色、双面、顶端亮底端淡） */
  function lightCone(x, y, z, rTop, h, color, op) {
    var g = new T.CylinderGeometry(rTop * .16, rTop, h, 26, 1, true);
    var mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { uCol: { value: new T.Color(color) }, uOp: { value: op } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ float up=pow(clamp(vUv.y,0.,1.),1.35); float fr=pow(1.0-abs(dot(normalize(vN),normalize(vV))),1.6);\n' +
        ' float a=up*(.30+.70*fr)*uOp; gl_FragColor=vec4(uCol,a); }'
    });
    var m = new T.Mesh(g, mat);
    m.position.set(x, y - h / 2, z);
    m.renderOrder = 2;
    K.scene().add(m);
    cones.push({ m: m, op: op });
    return m;
  }
  /* 发光小球（灯珠 + 光晕 sprite） */
  function glowDot(parent, x, y, z, color, r, halo) {
    var mat = new T.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 3.0, roughness: .35 });
    var m = new T.Mesh(new T.SphereGeometry(r, 10, 8), mat);
    m.position.set(x, y, z); parent.add(m);
    if (halo !== false) {
      /* halo 传数字＝光晕相对灯珠的倍数：机械臂上的示教灯是贴面 LED，
         倍数给到 7 就成了挂在关节上的发光球，所以调用处会压到 2~3。 */
      var hs = (typeof halo === 'number' && halo > 0) ? halo : 7;
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: glowTex(), color: color, transparent: true,
        opacity: hs < 5 ? .34 : .55,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      sp.scale.set(r * hs, r * hs, 1);
      sp.position.copy(m.position); parent.add(sp);
      return { mesh: m, mat: mat, halo: sp };
    }
    return { mesh: m, mat: mat, halo: null };
  }

  /* ---------------- PBR 细节贴图（真实感的差别全在这里） ---------------- */
  var _paintN = null, _metalN = null, _rough = null, _nameTex = null;
  function paintNormal() {
    if (_paintN) return _paintN;
    /* 漆面不是镜面：细密橘皮 + 几道打磨痕，高光才不会是一块死白 */
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    var img = x.createImageData(256, 256), d = img.data;
    var h = new Float32Array(256 * 256);
    for (var i = 0; i < h.length; i++) h[i] = Math.random() * .55 + Math.sin(i % 256 * .18) * .12;
    for (var yy = 0; yy < 256; yy++) for (var xx = 0; xx < 256; xx++) {
      var i2 = yy * 256 + xx;
      var l = h[yy * 256 + (xx - 1 + 256) % 256], r = h[yy * 256 + (xx + 1) % 256];
      var u = h[((yy - 1 + 256) % 256) * 256 + xx], dn = h[((yy + 1) % 256) * 256 + xx];
      var nx = (l - r) * 1.1, ny = (u - dn) * 1.1, nz = 1;
      var len = Math.sqrt(nx * nx + ny * ny + 1), o = i2 * 4;
      d[o] = (nx / len * .5 + .5) * 255; d[o + 1] = (ny / len * .5 + .5) * 255;
      d[o + 2] = (nz / len * .5 + .5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    /* 几道细微划痕 */
    x.globalAlpha = .16; x.strokeStyle = '#fff'; x.lineWidth = 1;
    for (var k = 0; k < 9; k++) {
      var sy2 = Math.random() * 256, sx2 = Math.random() * 256;
      x.beginPath(); x.moveTo(sx2, sy2); x.lineTo(sx2 + 20 + Math.random() * 60, sy2 + 3); x.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(5, 5);
    _paintN = t; return t;
  }
  function metalNormal() {
    if (_metalN) return _metalN;
    /* 金属拉丝：一个方向的高频条纹 */
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    var img = x.createImageData(256, 256), d = img.data;
    for (var yy = 0; yy < 256; yy++) for (var xx = 0; xx < 256; xx++) {
      var v = Math.sin(yy * 2.3) * .35 + (Math.random() - .5) * .3;
      var o = (yy * 256 + xx) * 4;
      d[o] = (v * .5 + .5) * 255; d[o + 1] = 128; d[o + 2] = 245; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 8);
    _metalN = t; return t;
  }
  function roughTex() {
    if (_rough) return _rough;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var img = x.createImageData(128, 128), d = img.data;
    for (var i = 0; i < 128 * 128; i++) {
      var v = 150 + (Math.random() - .5) * 60, o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 6);
    _rough = t; return t;
  }
  /* 机器人铭牌：品牌、负载、编号、警示三角——真机上一定有的东西 */
  function namePlate(idx, hex) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 128;
    var x = c.getContext('2d');
    var col = '#' + ('000000' + hex.toString(16)).slice(-6);
    x.fillStyle = '#12161a'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = col; x.fillRect(0, 0, 256, 14);
    x.fillStyle = '#e8eef4'; x.font = 'bold 30px Arial'; x.textAlign = 'left';
    x.fillText('ARC ROBOTICS', 14, 48);
    x.fillStyle = '#8fa6b8'; x.font = '16px Arial';
    x.fillText('6-AXIS  PAYLOAD 210 kg', 14, 72);
    var d = new Date(); x.fillText('ID  R-' + (100 + idx) + '   SN 24' + (1000 + idx), 14, 94);
    /* 警示三角 */
    x.strokeStyle = '#f2b600'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(224, 108); x.lineTo(238, 82); x.lineTo(252, 108); x.closePath(); x.stroke();
    x.fillStyle = '#f2b600'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('!', 238, 104);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }

  /* ---------------- 墙面生产看板 ---------------- */
  function makeBoard(w, h) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 288;
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    var mesh = new T.Mesh(new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    var rec = { mesh: mesh, cv: c, tex: tex, last: '' };
    rec.draw = function (s) {
      var sig = s.done + '|' + Math.floor(s._t / 3);
      if (sig === rec.last) return;
      rec.last = sig;
      var g = c.getContext('2d');
      g.fillStyle = '#060d14'; g.fillRect(0, 0, 512, 288);
      g.strokeStyle = 'rgba(80,170,220,.4)'; g.lineWidth = 2;
      g.strokeRect(6, 6, 500, 276);
      g.fillStyle = '#5fd0ff'; g.font = '600 26px "Microsoft YaHei",sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('夜班 · 无人运行', 26, 24);
      /* 运行指示点 */
      g.fillStyle = '#3ce08a'; g.beginPath(); g.arc(464, 38, 9, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(60,224,138,.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(464, 38, 16, 0, 6.283); g.stroke();
      g.fillStyle = 'rgba(120,170,200,.5)'; g.fillRect(24, 66, 464, 1);
      /* 三个大数 */
      var items = [
        ['累计产出', String(s.done), 'pcs', '#e8f6ff'],
        ['OEE', (92 + Math.min(6, s.done * .3)).toFixed(1), '%', '#5fe0b0'],
        ['节拍', (56 / Math.max(.5, s.speed)).toFixed(0), 's', '#ffd08a']
      ];
      items.forEach(function (it, i) {
        var bx = 26 + i * 158;
        g.fillStyle = 'rgba(110,160,190,.8)'; g.font = '17px "Microsoft YaHei",sans-serif';
        g.fillText(it[0], bx, 86);
        g.fillStyle = it[3]; g.font = '700 62px "DIN Alternate",Consolas,monospace';
        g.fillText(it[1], bx, 112);
        g.fillStyle = 'rgba(130,180,210,.75)'; g.font = '17px "Microsoft YaHei",sans-serif';
        g.fillText(it[2], bx + g.measureText(it[1]).width + 8, 150);
      });
      g.fillStyle = 'rgba(120,170,200,.45)'; g.fillRect(24, 200, 464, 1);
      g.fillStyle = 'rgba(110,160,190,.8)'; g.font = '16px "Microsoft YaHei",sans-serif';
      g.fillText('设备状态   CNC-01 运行 · QC-01 运行 · MK-01 运行 · R1-R3 自动', 26, 216);
      g.fillText('在岗人数   0        照明    ' + (s._litT > .5 ? 'ON' : 'OFF'), 26, 246);
      tex.needsUpdate = true;
    };
    return rec;
  }

  /* ---------------- 三色信号灯 ---------------- */
  function makeTower(x, y, z, key) {
    var g = new T.Group(); g.position.set(x, y, z);
    var dark = new T.MeshStandardMaterial({ color: 0x22272c, roughness: .5, metalness: .45 });
    var pole = new T.Mesh(new T.CylinderGeometry(.07, .09, 1.2, 10), dark); pole.position.y = .6; g.add(pole);
    var base = new T.Mesh(new T.CylinderGeometry(.26, .32, .18, 12), dark); base.position.y = .05; g.add(base);
    var lst = [];
    var cols = [[0xe8483f, .16], [0xf0b32e, .42], [0x35c072, .68]];
    for (var i = 0; i < 3; i++) {
      var lm = new T.MeshStandardMaterial({ color: 0x2a2f34, roughness: .3, emissive: 0x000000, emissiveIntensity: 0 });
      var lp = new T.Mesh(new T.SphereGeometry(.24, 14, 10), lm);
      lp.position.y = 1.3 + cols[i][1]; lp.scale.y = .8; g.add(lp);
      lst.push({ m: lm, col: cols[i][0] });
    }
    var cap = new T.Mesh(new T.CylinderGeometry(.13, .21, .13, 10), dark); cap.position.y = 2.32; g.add(cap);
    K.scene().add(g);
    var rec = { lamps: lst, mode: 'run', key: key, g: g };
    towers[key] = rec;
    setTower(rec, 'run');
    return rec;
  }
  function setTower(rec, mode) {
    if (!rec) return;
    rec.mode = mode;
    rec.lamps.forEach(function (L, i) {
      var on = (mode === 'run' && i === 2) || (mode === 'busy' && i === 1) || (mode === 'stop' && i === 0);
      if (on) { L.m.color.setHex(L.col); L.m.emissive.setHex(L.col); L.m.emissiveIntensity = 2.6; }
      else { L.m.color.setHex(0x2a2f34); L.m.emissive.setHex(0x000000); L.m.emissiveIntensity = 0; }
    });
  }
  function allTowers(mode) { for (var k2 in towers) setTower(towers[k2], mode); }
  function activeTower(key) {
    for (var k2 in towers) setTower(towers[k2], k2 === key ? 'busy' : (st.estop ? 'stop' : 'run'));
  }

  /* ---------------- 小屏 ---------------- */
  function makeScreen(w, h, base) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 160;
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    var mat = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
    var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    var rec = { mesh: m, cv: c, tex: tex, last: '', base: base || '#08131c' };
    rec.show = function (txt, col, sub) {
      var sig = txt + '|' + col + '|' + (sub || '');
      if (sig === rec.last) return;
      rec.last = sig;
      var g = c.getContext('2d');
      g.fillStyle = rec.base; g.fillRect(0, 0, 256, 160);
      /* 扫描线 */
      g.fillStyle = 'rgba(90,190,230,.05)';
      for (var i = 0; i < 160; i += 3) g.fillRect(0, i, 256, 1);
      g.strokeStyle = 'rgba(90,180,220,.35)'; g.strokeRect(3, 3, 250, 154);
      g.fillStyle = col; g.font = '600 42px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 128, sub ? 62 : 78);
      if (sub) { g.font = '22px "Microsoft YaHei",sans-serif'; g.fillStyle = '#7fa9c4'; g.fillText(sub, 128, 116); }
      tex.needsUpdate = true;
    };
    screens.push(rec);
    return rec;
  }

  /* ---------------- 材质 ---------------- */
  var MAT = {};
  function buildMats() {
    var gr1 = grainTex(128, .70, .26, 7), nr1 = normalTex(128, 1.0, 3);
    var gr2 = grainTex(128, .52, .34, 9);
    /* 暗场漆：比明场更深，靠边缘高光而不是靠固有色读形 */
    MAT.shellL = new T.MeshPhysicalMaterial({ color: 0x9aa4ad, roughness: .62, metalness: .12, envMapIntensity: .85, roughnessMap: gr1, normalMap: nr1, normalScale: new T.Vector2(.2, .2) });
    MAT.shellD = new T.MeshPhysicalMaterial({ color: 0x2e363d, roughness: .5, metalness: .38, envMapIntensity: 1.0, roughnessMap: gr2, normalMap: nr1, normalScale: new T.Vector2(.16, .16) });
    MAT.graphite = new T.MeshStandardMaterial({ color: 0x363d44, roughness: .46, metalness: .45, envMapIntensity: 1.0 });
    MAT.orange = new T.MeshStandardMaterial({ color: 0xc4680f, roughness: .5, metalness: .22, envMapIntensity: 1.4, roughnessMap: gr2 });
    MAT.safety = new T.MeshStandardMaterial({ color: 0xcfa01e, roughness: .54, metalness: .16, roughnessMap: gr2 });
    MAT.steel = new T.MeshStandardMaterial({ color: 0x8d959d, roughness: .24, metalness: .95, envMapIntensity: 1.5, normalMap: metalNormal(), normalScale: new T.Vector2(.10, .10), roughnessMap: roughTex() });
    MAT.alu = new T.MeshStandardMaterial({ color: 0x9ba3ab, roughness: .3, metalness: .8, envMapIntensity: 1.15 });
    MAT.dark = new T.MeshStandardMaterial({ color: 0x14181c, roughness: .78, metalness: .2 });
    MAT.rubber = new T.MeshStandardMaterial({ color: 0x101316, roughness: .95, metalness: .04 });
    MAT.glass = new T.MeshPhysicalMaterial({ color: 0x0d1a24, roughness: .08, metalness: 0, transparent: true, opacity: .26, envMapIntensity: .85, side: T.DoubleSide, depthWrite: false });
    MAT.haz = new T.MeshStandardMaterial({ map: hazTex(), roughness: .6, metalness: .1 });
    MAT.carton = new T.MeshStandardMaterial({ color: 0xa8895e, roughness: .86, metalness: .02, roughnessMap: gr2, envMapIntensity: .7 });
    /* 汽车件：铸铁刹车盘（粗糙、暗）+ 铝轮毂（亮） */
    MAT.castIron = new T.MeshStandardMaterial({ color: 0x6e747b, roughness: .52, metalness: .8, envMapIntensity: 1.05, map: gr2 });
    MAT.alum = new T.MeshStandardMaterial({ color: 0xa8b0b8, roughness: .28, metalness: .88, envMapIntensity: 1.2 });
    MAT.machined = new T.MeshStandardMaterial({ color: 0xc2c9d0, roughness: .16, metalness: .95, envMapIntensity: 1.4 });
    MAT.paint = new T.MeshPhysicalMaterial({ color: 0x1c2a3a, roughness: .3, metalness: .45, clearcoat: .6, clearcoatRoughness: .25, envMapIntensity: 1.1 });
    /* 车身漆：金属银。黑灯下深色车漆会糊成一团黑，浅色才好读轮廓；
       金属度不能太高 —— .72 时漫反射几乎没有了，暗场里白车就是一块灰板 */
    MAT.carPaint = new T.MeshPhysicalMaterial({
      color: 0xd2dbe4, roughness: .22, metalness: .48,
      clearcoat: 1.0, clearcoatRoughness: .10, envMapIntensity: 1.45,
      normalMap: paintNormal(), normalScale: new T.Vector2(.10, .10),
      roughnessMap: roughTex()
    });
    /* 车身外壳单独一份漆：透视/装配入位时只让「外壳」半透明，车门/零件保持实体 */
    MAT.shellPaint = MAT.carPaint.clone();
    MAT.cabin = new T.MeshStandardMaterial({ color: 0x0a0f14, roughness: .95, metalness: .05 });
    MAT.trim = new T.MeshStandardMaterial({ color: 0x12171d, roughness: .5, metalness: .4 });
    MAT.doorTrim = new T.MeshStandardMaterial({ color: 0x252c34, roughness: .68, metalness: .12, roughnessMap: gr2 });
    MAT.seat = new T.MeshStandardMaterial({ color: 0x2d3238, roughness: .82, metalness: .04 });
    MAT.rim = new T.MeshStandardMaterial({ color: 0xa9b3bc, roughness: .2, metalness: .95, envMapIntensity: 1.6, normalMap: metalNormal(), normalScale: new T.Vector2(.08, .08) });
    MAT.engine = new T.MeshStandardMaterial({ color: 0x4d545b, roughness: .55, metalness: .6, envMapIntensity: .9 });
    MAT.lampGlass = new T.MeshPhysicalMaterial({ color: 0xdfeaf4, roughness: .08, metalness: .1, transparent: true, opacity: .62, clearcoat: 1, envMapIntensity: 1.4 });
    MAT.tailLamp = new T.MeshStandardMaterial({ color: 0x8c1a16, emissive: 0x9c1a12, emissiveIntensity: .9, roughness: .3, metalness: .2 });
  }

  /* 发光条（设备 LED 灯带） */
  function ledStrip(w, h, d, color, op, parent) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.5, roughness: .4 }));
    if (parent) parent.add(m); else K.scene().add(m);
    glows.push({ m: m, base: 1.5, keep: true });
    return m;
  }

  /* ---------------- 暗 / 亮两套环境贴图 ---------------- */
  /* 颜色一律用 Color 对象插值：直接 setRGB 给的是线性分量，
     经 sRGB 转换后会比预期亮一大截（地面会变成浅灰蓝的水塘） */
  var FLR_D = new T.Color(0x171c21), FLR_L = new T.Color(0x3d464f);
  var FOG_D = new T.Color(0x05080b), FOG_L = new T.Color(0x5f6a75);
  var ENV = { dark: null, light: null };
  function makeEnv(bright) {
    var RND = (window.__labDebug && window.__labDebug.renderer) || null;
    if (!RND || !T.PMREMGenerator) return null;
    var pmrem = new T.PMREMGenerator(RND);
    pmrem.compileEquirectangularShader();
    var env = new T.Scene();
    var roomCol = bright ? 0x9aa6b2 : 0x0c1116;
    var room = new T.Mesh(new T.BoxGeometry(40, 26, 40),
      new T.MeshStandardMaterial({ color: roomCol, side: T.BackSide, roughness: 1 }));
    room.position.y = 6; env.add(room);
    var gnd = new T.Mesh(new T.PlaneGeometry(40, 40),
      new T.MeshStandardMaterial({ color: bright ? 0x6d7681 : 0x070a0d, roughness: .95 }));
    gnd.position.y = -6; gnd.rotation.x = Math.PI / 2; env.add(gnd);

    /* 顶部灯带：金属反射里的细长高光条 —— 黑灯下也要有，只是很弱 */
    var bandCol = bright ? 0xffffff : 0x93c6e8;
    var bandI = bright ? 1.8 : 2.4;
    for (var i = 0; i < 3; i++) {
      var b = new T.Mesh(new T.PlaneGeometry(30, 1.4),
        new T.MeshStandardMaterial({ color: 0x000000, emissive: bandCol, emissiveIntensity: bandI, roughness: 1 }));
      b.position.set(0, 14, -8 + i * 8); b.rotation.x = Math.PI / 2; env.add(b);
    }
    /* 侧向光斑：给暗部一点结构（青 + 橙，呼应设备灯） */
    [[-16, 3, -10, 0x6fc8f0, bright ? 1.8 : 2.0], [14, 1, 6, 0xffc070, bright ? 1.4 : 1.6],
    [0, -2, 16, 0x4fa8d0, bright ? 1.2 : 1.5]].forEach(function (p) {
      var s = new T.Mesh(new T.PlaneGeometry(7, 5),
        new T.MeshStandardMaterial({ color: 0x000000, emissive: p[3], emissiveIntensity: p[4], roughness: 1 }));
      s.position.set(p[0], p[1], p[2]); s.lookAt(0, 2, 0); env.add(s);
    });
    var rt = pmrem.fromScene(env, .045);
    pmrem.dispose();
    return rt.texture;
  }

  /* ---------------- 建厂房 ---------------- */
  var HALL = { x0: -62, x1: 62, z0: -34, z1: 30 };
  function buildShell() {
    var sc = K.scene();
    /* 环氧地坪：中等灰度 + 分格缝，受光后是真实车间的地面（不是黑水面）。
       分格缝贴图用浅底深线，颜色由材质主色决定，缝只是轻微压暗。 */
    /* 环氧地坪贴图：基础灰 + 大尺度色差 + 油污暗斑 + 磨痕 + 分格缝。
       不再是一张干净匀色的板 —— 真实车间的地面永远有油渍、划痕和深浅变化。*/
    var seamC = document.createElement('canvas'); seamC.width = seamC.height = 1024;
    var sx = seamC.getContext('2d');
    sx.fillStyle = '#9aa2aa'; sx.fillRect(0, 0, 1024, 1024);
    for (var nb = 0; nb < 300; nb++) {
      var r = 8 + Math.random() * 34, xm = Math.random() * 1024, ym = Math.random() * 1024;
      sx.fillStyle = 'rgba(' + (88 + Math.random() * 36 | 0) + ',' + (94 + Math.random() * 36 | 0) + ',' + (100 + Math.random() * 36 | 0) + ',' + (0.07 + Math.random() * 0.10).toFixed(3) + ')';
      sx.beginPath(); sx.arc(xm, ym, r, 0, 7); sx.fill();
    }
    for (var ob = 0; ob < 30; ob++) {
      var ox = Math.random() * 1024, oy = Math.random() * 1024, oR = 25 + Math.random() * 120;
      var og = sx.createRadialGradient(ox, oy, 0, ox, oy, oR);
      og.addColorStop(0, 'rgba(22,26,30,' + (0.40 + Math.random() * 0.18).toFixed(2) + ')'); og.addColorStop(1, 'rgba(22,26,30,0)');
      sx.fillStyle = og; sx.beginPath(); sx.arc(ox, oy, oR, 0, 7); sx.fill();
    }
    for (var pb = 0; pb < 6; pb++) {
      var px2b = Math.random() * 1024, py2b = Math.random() * 1024, pR = 140 + Math.random() * 160;
      var pg = sx.createRadialGradient(px2b, py2b, 0, px2b, py2b, pR);
      pg.addColorStop(0, 'rgba(70,76,82,.22)'); pg.addColorStop(1, 'rgba(70,76,82,0)');
      sx.fillStyle = pg; sx.beginPath(); sx.arc(px2b, py2b, pR, 0, 7); sx.fill();
    }
    for (var sc2 = 0; sc2 < 44; sc2++) {
      sx.strokeStyle = 'rgba(228,233,238,' + (0.05 + Math.random() * 0.08).toFixed(3) + ')';
      sx.lineWidth = 1 + Math.random() * 2;
      var x1 = Math.random() * 1024, y1 = Math.random() * 1024, ang = Math.random() * 6.28, len = 20 + Math.random() * 130;
      sx.beginPath(); sx.moveTo(x1, y1); sx.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len); sx.stroke();
    }
    sx.strokeStyle = 'rgba(28,34,40,.55)'; sx.lineWidth = 4;
    for (var gx2 = 0; gx2 <= 1024; gx2 += 128) { sx.beginPath(); sx.moveTo(gx2, 0); sx.lineTo(gx2, 1024); sx.stroke(); }
    for (var gz2 = 0; gz2 <= 1024; gz2 += 128) { sx.beginPath(); sx.moveTo(0, gz2); sx.lineTo(1024, gz2); sx.stroke(); }
    var seamTex = new T.CanvasTexture(seamC); seamTex.wrapS = seamTex.wrapT = T.RepeatWrapping; seamTex.repeat.set(13, 10);
    /* 哑光环氧：粗糙度拉到 .82、法线只留极轻的颗粒、金属度近 0。
       之前 .46 + 强法线 + 高环境反射，在低机位的掠射角下把整片地坪打成
       镜子——黑灯车间看着像刚下过雨的水泥地，这是最伤的「假」。 */
    var fl = new T.Mesh(new T.BoxGeometry(196, .6, 150),
      new T.MeshStandardMaterial({
        color: 0x2b3138, roughness: .92, metalness: .03, envMapIntensity: .06,
        map: seamTex,
        roughnessMap: grainTex(128, .97, .025, 18), normalMap: normalTex(128, .35, 26),
        normalScale: new T.Vector2(.022, .022)
      }));
    fl.position.set(0, FLOOR - .3, 6);
    fl.receiveShadow = true; sc.add(fl);
    O.floor = fl;

    /* 通道黄线（微自发光：黑灯时也看得见地面的路） */
    var lineMat = new T.MeshStandardMaterial({ color: 0xd0a72e, emissive: 0x7a5c08, emissiveIntensity: .42, roughness: .55 });
    /* AGV 通道两条边线 */
    [-2.9, 2.9].forEach(function (dz) {
      var l = new T.Mesh(new T.BoxGeometry(112, .05, .26), lineMat);
      l.position.set(0, FLOOR + .03, AGV_Z + dz); sc.add(l);
    });
    /* 虚线中线 */
    for (var dxi = -54; dxi < 56; dxi += 6) {
      var dash = new T.Mesh(new T.BoxGeometry(3.2, .05, .18), lineMat);
      dash.position.set(dxi, FLOOR + .03, AGV_Z); sc.add(dash);
    }
    /* AGV 通道地面标识：箭头 + 交接位方框。
       黑灯里只看两条黄线认不出这是「无人送料通道」，地面上得有字和方向 */
    var laneC = document.createElement('canvas'); laneC.width = 256; laneC.height = 128;
    var lxn = laneC.getContext('2d');
    lxn.clearRect(0, 0, 256, 128);
    lxn.strokeStyle = 'rgba(120,215,255,.92)'; lxn.lineWidth = 9;
    lxn.lineCap = 'round'; lxn.lineJoin = 'round';
    lxn.beginPath(); lxn.moveTo(196, 22); lxn.lineTo(234, 64); lxn.lineTo(196, 106); lxn.stroke();
    lxn.fillStyle = 'rgba(120,215,255,.86)';
    lxn.font = 'bold 52px Arial'; lxn.textAlign = 'left'; lxn.textBaseline = 'middle';
    lxn.fillText('AGV', 18, 62);
    var laneTex = new T.CanvasTexture(laneC); laneTex.encoding = T.sRGBEncoding;
    var laneMat = new T.MeshBasicMaterial({ map: laneTex, transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
    for (var ai = -5; ai <= 4; ai++) {
      var stencil = new T.Mesh(new T.PlaneGeometry(6.2, 3.1), laneMat);
      stencil.rotation.x = -Math.PI / 2;
      stencil.position.set(ai * 10.5, FLOOR + .035, AGV_Z);
      stencil.renderOrder = 1; sc.add(stencil);
    }
    var padC = document.createElement('canvas'); padC.width = padC.height = 256;
    var pc = padC.getContext('2d');
    pc.clearRect(0, 0, 256, 256);
    pc.strokeStyle = 'rgba(240,190,70,.85)'; pc.lineWidth = 8;
    pc.setLineDash([22, 14]); pc.strokeRect(12, 12, 232, 232);
    pc.setLineDash([]);
    pc.fillStyle = 'rgba(240,190,70,.9)'; pc.font = 'bold 30px "Microsoft YaHei",sans-serif';
    pc.textAlign = 'center'; pc.textBaseline = 'middle';
    pc.fillText('AGV 交接位', 128, 128);
    var padTex = new T.CanvasTexture(padC); padTex.encoding = T.sRGBEncoding;
    var padMat = new T.MeshBasicMaterial({ map: padTex, transparent: true, opacity: .5, depthWrite: false, toneMapped: false });
    [PX.ip - 6, PX.seat - 6].forEach(function (px3) {
      var pad = new T.Mesh(new T.PlaneGeometry(4.0, 4.0), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(px3, FLOOR + .04, AGV_Z);
      pad.renderOrder = 1; sc.add(pad);
    });
    /* 产线两侧警戒带 */
    [[-4.2], [4.2]].forEach(function (dz) {
      var l = new T.Mesh(new T.BoxGeometry(108, .05, .3),
        new T.MeshStandardMaterial({ color: 0xb98c1c, emissive: 0x5c4206, emissiveIntensity: .25, roughness: .6 }));
      l.position.set(-2, FLOOR + .03, BELT_Z + dz[0]); sc.add(l);
    });

    /* 屋顶整体成组：俯视机位要整组剖掉，只藏屋面板挡不住桁架和管线 */
    var roofG = new T.Group();
    sc.add(roofG);
    /* 屋面板：压在天花板上，形成一个真正的「顶」，不然背景渐变会透上来显得空 */
    var ceilPanel = new T.Mesh(new T.BoxGeometry(HALL.x1 - HALL.x0, .32, HALL.z1 - HALL.z0),
      new T.MeshStandardMaterial({ color: 0x59646e, roughness: .82, metalness: .18, envMapIntensity: .55 }));
    ceilPanel.position.set(0, CEIL + 2.55, (HALL.z0 + HALL.z1) / 2);
    roofG.add(ceilPanel);
    O.ceil = ceilPanel;
    O.roof = roofG;
    LGT.ceil = ceilPanel.material;
    LGT.ceil.emissive = new T.Color(0x8b97a3);
    LGT.ceil.emissiveIntensity = 0;

    /* 屋架：主梁 + 竖向吊杆（细杆比斜方块读起来像钢结构） */
    var trussMat = new T.MeshStandardMaterial({ color: 0x4a545e, roughness: .55, metalness: .6, envMapIntensity: .85 });
    for (var tx = -56; tx <= 56; tx += 14) {
      var beam = new T.Mesh(new T.BoxGeometry(.62, 1.1, HALL.z1 - HALL.z0 - 4), trussMat);
      beam.position.set(tx, CEIL + 1.2, (HALL.z0 + HALL.z1) / 2); roofG.add(beam);
      var bot = new T.Mesh(new T.BoxGeometry(.34, .34, HALL.z1 - HALL.z0 - 4), trussMat);
      bot.position.set(tx, CEIL - .1, (HALL.z0 + HALL.z1) / 2); roofG.add(bot);
      /* 竖向腹杆 */
      for (var tz = HALL.z0 + 3.5; tz < HALL.z1 - 3; tz += 6) {
        var wb = new T.Mesh(new T.BoxGeometry(.16, 1.25, .16), trussMat);
        wb.position.set(tx, CEIL + .55, tz); roofG.add(wb);
      }
    }
    /* 纵向檩条 */
    [-24, -8, 8, 24].forEach(function (tz) {
      var p = new T.Mesh(new T.BoxGeometry(HALL.x1 - HALL.x0, .3, .3), trussMat);
      p.position.set(0, CEIL + 1.9, tz); roofG.add(p);
    });

    /* 天花板管线：真实厂房顶上永远塞满管子，空着就显得这个车间是「布景」 */
    var pipeMat = new T.MeshStandardMaterial({ color: 0x606c78, roughness: .48, metalness: .65, envMapIntensity: 1.4 });
    var pipeMat2 = new T.MeshStandardMaterial({ color: 0x77848f, roughness: .52, metalness: .55, envMapIntensity: 1.3 });
    var LONG = HALL.x1 - HALL.x0 - 2;
    [[-13.5, 1.05, pipeMat], [-11.6, .82, pipeMat2], [-9.8, .68, pipeMat], [10.5, .95, pipeMat],
    [12.4, .7, pipeMat2], [14.3, .86, pipeMat], [-27, .8, pipeMat2], [-29.2, .64, pipeMat]].forEach(function (p) {
      var tube = new T.Mesh(new T.CylinderGeometry(p[1], p[1], LONG, 12), p[2]);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, CEIL - .1, p[0]);
      roofG.add(tube);
      /* 法兰环：一根光管读不出工业感 */
      for (var fx = -50; fx <= 50; fx += 12.5) {
        var fl2 = new T.Mesh(new T.CylinderGeometry(p[1] * 1.28, p[1] * 1.28, .16, 12), pipeMat);
        fl2.rotation.z = Math.PI / 2; fl2.position.set(fx, CEIL - .1, p[0]); roofG.add(fl2);
      }
    });
    /* 电缆桥架：方槽 + 每隔一段的吊架 */
    [-19.5, 17.5, -3.5, 7.5].forEach(function (tz) {
      var tray = new T.Mesh(new T.BoxGeometry(LONG, .26, .95), pipeMat2);
      tray.position.set(0, CEIL + .45, tz); roofG.add(tray);
      for (var hx = -52; hx <= 52; hx += 9) {
        var hang = new T.Mesh(new T.BoxGeometry(.1, 1.3, .1), pipeMat2);
        hang.position.set(hx, CEIL + 1.1, tz); roofG.add(hang);
      }
    });
    /* 横向桥架：沿 Z 走向，和上面的纵管交织成真实车间顶部的网格结构层 */
    [-44, -22, 0, 22, 44].forEach(function (px) {
      var cross = new T.Mesh(new T.BoxGeometry(.5, .24, HALL.z1 - HALL.z0 - 6), pipeMat);
      cross.position.set(px, CEIL + .62, (HALL.z0 + HALL.z1) / 2); roofG.add(cross);
    });
    /* 第二层横桥架（更低一些，错开），进一步加密顶部结构层 */
    [-33, -11, 11, 33].forEach(function (px) {
      var cross2 = new T.Mesh(new T.BoxGeometry(.42, .20, HALL.z1 - HALL.z0 - 12), pipeMat2);
      cross2.position.set(px, CEIL + .98, (HALL.z0 + HALL.z1) / 2); roofG.add(cross2);
    });
    /* 设备支管：从顶部桥架垂下到产线的竖向管，强化「顶部塞满」的工业感 */
    [-40, -20, 0, 20, 40].forEach(function (px) {
      var drop = new T.Mesh(new T.CylinderGeometry(.12, .12, 3.4, 10), pipeMat2);
      drop.position.set(px, CEIL - 1.9, -10); roofG.add(drop);
      var drop2 = new T.Mesh(new T.CylinderGeometry(.09, .09, 2.6, 8), pipeMat);
      drop2.position.set(px + 1.4, CEIL - 1.5, 6); roofG.add(drop2);
    });

    /* 远墙 + 侧墙：近黑，只给一点体积 */
    var wallMat = new T.MeshStandardMaterial({ color: 0x2b333b, roughness: .92, metalness: .1, emissive: new T.Color(0x6a7681), emissiveIntensity: 0 });
    LGT.wall = wallMat;
    var backW = new T.Mesh(new T.PlaneGeometry(HALL.x1 - HALL.x0, 22), wallMat);
    backW.position.set(0, FLOOR + 11, HALL.z0); sc.add(backW);
    /* 侧墙。出口端（x1）留大门洞：总装线末端正对厂门，下线车从这里开出厂房
       （以前端墙是整面实体，车开不出去，下线之后只能凭空消失） */
    var w0 = new T.Mesh(new T.PlaneGeometry(HALL.z1 - HALL.z0, 22), wallMat);
    w0.position.set(HALL.x0, FLOOR + 11, (HALL.z0 + HALL.z1) / 2);
    w0.rotation.y = Math.PI / 2; sc.add(w0);
    var ex = HALL.x1, gz = 3.6, GATE_H = 5.2;
    [[(HALL.z0 - gz) / 2, -gz - HALL.z0], [(HALL.z1 + gz) / 2, HALL.z1 - gz]].forEach(function (p) {
      var w = new T.Mesh(new T.PlaneGeometry(p[1], 22), wallMat);
      w.position.set(ex, FLOOR + 11, p[0]); w.rotation.y = -Math.PI / 2; sc.add(w);
    });
    var lintel = new T.Mesh(new T.PlaneGeometry(gz * 2, 22 - GATE_H), wallMat);
    lintel.position.set(ex, FLOOR + GATE_H + (22 - GATE_H) / 2, 0);
    lintel.rotation.y = -Math.PI / 2; sc.add(lintel);
    /* 门框：两柱一梁 + 门梁常亮的青光条（出厂口的视觉锚点） */
    var gMat = new T.MeshStandardMaterial({ color: 0x3a444e, roughness: .6, metalness: .5, envMapIntensity: .9 });
    [-gz - .35, gz + .35].forEach(function (zz) {
      var post = new T.Mesh(new T.BoxGeometry(.7, GATE_H + .4, .7), gMat);
      post.position.set(ex - .1, FLOOR + (GATE_H + .4) / 2, zz);
      post.castShadow = true; sc.add(post);
    });
    var gbeam = new T.Mesh(new T.BoxGeometry(.7, .8, gz * 2 + 1.5), gMat);
    gbeam.position.set(ex - .1, FLOOR + GATE_H + .4, BELT_Z);
    gbeam.castShadow = true; sc.add(gbeam);
    var gled = new T.Mesh(new T.BoxGeometry(.2, .18, gz * 2 + .8),
      new T.MeshStandardMaterial({ color: 0x59d8ff, emissive: 0x59d8ff, emissiveIntensity: 2.0, roughness: .4 }));
    gled.position.set(ex - .5, FLOOR + GATE_H + .05, BELT_Z); sc.add(gled);

    /* 出厂门楣的「出口」灯箱：黑灯厂房里下线车唯一的去处，
       从厂内往外看，它是画面里最明确的一块路标（朝两侧都贴一块） */
    var exC = document.createElement('canvas'); exC.width = 384; exC.height = 128;
    var exX = exC.getContext('2d');
    exX.fillStyle = '#051a12'; exX.fillRect(0, 0, 384, 128);
    exX.strokeStyle = '#35e08a'; exX.lineWidth = 6; exX.strokeRect(5, 5, 374, 118);
    exX.fillStyle = '#4ff0a0'; exX.font = 'bold 62px "Microsoft YaHei",sans-serif';
    exX.textAlign = 'left'; exX.textBaseline = 'middle';
    exX.fillText('出口', 26, 64);
    exX.font = 'bold 38px Arial'; exX.fillStyle = '#9ff8c8';
    exX.fillText('EXIT', 190, 66);
    exX.beginPath(); exX.moveTo(316, 64); exX.lineTo(352, 40); exX.lineTo(352, 88); exX.closePath();
    exX.fillStyle = '#4ff0a0'; exX.fill();
    var exTex2 = new T.CanvasTexture(exC); exTex2.encoding = T.sRGBEncoding;
    var exSignMat = new T.MeshBasicMaterial({ map: exTex2, toneMapped: false });
    [1, -1].forEach(function (sg) {
      var sign = new T.Mesh(new T.PlaneGeometry(3.8, 1.27), exSignMat);
      sign.position.set(ex + sg * .28, FLOOR + GATE_H + 1.45, BELT_Z);
      sign.rotation.y = sg > 0 ? Math.PI / 2 : -Math.PI / 2;
      sc.add(sign);
      /* 灯箱外框 */
      var frame = new T.Mesh(new T.BoxGeometry(.34, 1.5, 4.05), MAT.graphite);
      frame.position.set(ex + sg * .10, FLOOR + GATE_H + 1.45, BELT_Z);
      sc.add(frame);
    });
    /* 出口灯箱的绿色光晕（从门里往外看，先看到绿光再看到车） */
    var exHalo = new T.Sprite(new T.SpriteMaterial({
      map: glowTex(), color: 0x3ce08a, transparent: true, opacity: .34,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    exHalo.scale.set(9, 5, 1);
    exHalo.position.set(ex - .8, FLOOR + GATE_H + 1.4, BELT_Z);
    sc.add(exHalo);
    /* 门外的洗墙光：让正在驶出的车从背后被勾出轮廓，而不是掉进一片黑 */
    var gateSpot = new T.SpotLight(0xbfe6ff, 2.4, 26, .72, .8, 1.5);
    gateSpot.position.set(ex + 4.2, FLOOR + 7.6, BELT_Z);
    gateSpot.target.position.set(ex - 3.0, FLOOR + .6, BELT_Z);
    sc.add(gateSpot); sc.add(gateSpot.target);
    LGT.gateSpot = gateSpot;

    /* 安全出口指示牌：黑灯厂房里唯一常亮的绿光 */
    var exitG = new T.Group(); exitG.position.set(-18, FLOOR + 6.4, HALL.z0 + .12);
    var exPlate = new T.Mesh(new T.BoxGeometry(3.2, 1.1, .18),
      new T.MeshStandardMaterial({ color: 0x0a1a10, emissive: 0x0a2a16, emissiveIntensity: .6, roughness: .6 }));
    exitG.add(exPlate);
    var exFace = new T.Mesh(new T.PlaneGeometry(2.9, .85),
      new T.MeshBasicMaterial({ color: 0x2fe07a, toneMapped: false }));
    exFace.position.z = .1; exitG.add(exFace);
    var sc2 = document.createElement('canvas'); sc2.width = 128; sc2.height = 40;
    var sx2 = sc2.getContext('2d');
    sx2.fillStyle = '#0b1a12'; sx2.fillRect(0, 0, 128, 40);
    sx2.fillStyle = '#3cf08a'; sx2.font = 'bold 26px "Microsoft YaHei",sans-serif';
    sx2.textAlign = 'center'; sx2.textBaseline = 'middle'; sx2.fillText('安全出口', 64, 21);
    var exTex = new T.CanvasTexture(sc2); exTex.encoding = T.sRGBEncoding;
    exFace.material = new T.MeshBasicMaterial({ map: exTex, toneMapped: false });
    K.scene().add(exitG);
    var exSp = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0x2fe07a, transparent: true, opacity: .30, blending: T.AdditiveBlending, depthWrite: false }));
    exSp.scale.set(11, 7, 1); exSp.position.copy(exitG.position); exSp.position.z += .3; K.scene().add(exSp);
    O.exitGlow = exSp;

    /* 墙面生产看板：黑灯厂房里最亮的一块「信息」，也是构图上唯一的远处亮点 */
    var bf = new T.Mesh(new T.BoxGeometry(13.2, 7.8, .3), MAT.graphite);
    bf.position.set(-14, FLOOR + 9.4, HALL.z0 + .2); K.scene().add(bf);
    O.board = makeBoard(12.2, 6.9);
    O.board.mesh.position.set(-14, FLOOR + 9.4, HALL.z0 + .42);
    K.scene().add(O.board.mesh);

    /* 工矿灯：黑灯时是暗罩，开灯时才亮 —— 这是「黑灯」最直白的证据 */
    var lampMat = new T.MeshStandardMaterial({ color: 0x2b333a, roughness: .5, metalness: .55, envMapIntensity: .8, side: T.DoubleSide });
    var innerMat0 = new T.MeshStandardMaterial({ color: 0xd8dde2, roughness: .35, metalness: .2, emissive: 0xfff2e0, emissiveIntensity: 0, side: T.DoubleSide });
    for (var li = -3; li <= 3; li++) {
      var lx = li * 15.5;
      var g = new T.Group(); g.position.set(lx, 0, -6);
      var rod = new T.Mesh(new T.CylinderGeometry(.06, .06, 1.2, 8), lampMat);
      rod.position.y = 2.2; g.add(rod);
      /* 灯罩：上小下大的喇叭口（反了就是从下看一口大盆） */
      var shade = new T.Mesh(new T.CylinderGeometry(.38, .88, .52, 22, 1, true), lampMat);
      shade.position.y = 1.36; g.add(shade);
      /* 灯罩内壁：开灯时被灯盘照亮 */
      var innerM = innerMat0.clone();
      var inner = new T.Mesh(new T.CylinderGeometry(.35, .83, .48, 22, 1, true), innerM);
      inner.position.y = 1.35; g.add(inner);
      var discM = new T.MeshStandardMaterial({ color: 0xe8eef4, emissive: 0xfff3e2, emissiveIntensity: 0, roughness: .35 });
      var disc = new T.Mesh(new T.CircleGeometry(.78, 26), discM);
      disc.rotation.x = Math.PI / 2; disc.position.y = 1.11; g.add(disc);
      var halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xfff0d6, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      halo.scale.set(6, 6, 1); halo.position.y = 1.05; g.add(halo);
      K.scene().add(g);
      lamps.push({ g: g, mat: discM, inner: innerM, halo: halo });
      /* 光锥：从灯口向下张开到地坪 */
      lightCone(lx, 1.08, -6, 12.0, 17.1, 0xffeedd, .075);
    }
    /* 灯下的地面光斑（开灯时才显） */
    for (var li2 = -3; li2 <= 3; li2++) {
      var d2 = glowDecal(li2 * 15.5, -6, 12, 0xffe9cf, .0, 1, 1);
      d2.userData.lampDecal = true; lamps[li2 + 3].decal = d2;
    }

    /* 地面上的设备反光斑：黑灯时唯一的地面信息（灯在哪，地上就有一道亮） */
    [
      [PX.cnc, 0, 9, 0x63c8ff, .13], [PX.wash, 0, 6, 0x63c8ff, .10],
      [PX.insp, 0, 5, 0x4fe0c8, .12], [PX.mark, 0, 5, 0xff5a4a, .10],
      [PX.asm, -1, 8, 0xffb45a, .12], [PX.pal, 0, 7, 0x63c8ff, .10],
      [PX.load, -1, 6, 0xffb45a, .09]
    ].forEach(function (g) {
      var d3 = glowDecal(g[0], g[1] + BELT_Z, g[2], g[3], g[4], 1.5, .55);
      deviceGlows.push({ m: d3, op: g[4] });
    });
  }

  /* ---------------- 光照：黑灯 / 开灯两套 ---------------- */
  var LGT = {};
  function buildLights() {
    var sc = K.scene();
    /* 收掉引擎默认的实验室高调光 */
    sc.traverse(function (o) {
      if (o.isHemisphereLight) { o.intensity = .22; o.color.setHex(0x35597a); o.groundColor.setHex(0x070a0e); LGT.hemi = o; }
      else if (o.isDirectionalLight) { o.intensity = .22; o.color.setHex(0x8fb4d8); }
    });
    /* 主投光（开灯时才强）：一盏，负责投阴影。黑灯也保留 .98 —— 全黑不等于没形 */
    var key = new T.DirectionalLight(0xdce9f6, .98);
    key.position.set(28, 62, 34);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -66; key.shadow.camera.right = 66;
    key.shadow.camera.top = 60; key.shadow.camera.bottom = -60;
    key.shadow.camera.far = 200;
    key.shadow.bias = -.0006;
    key.shadow.normalBias = .04;
    sc.add(key); LGT.key = key;
    /* 开灯时的「室内反射光」：顶棚、墙面这些朝下的面只有环境光能照到 */
    var amb = new T.AmbientLight(0xd6e2ef, 0);
    sc.add(amb); LGT.amb = amb;
    /* 补光：开灯后被墙面反射回来的光，从相机这一侧打，设备的立面才不是一块黑 */
    var fill2 = new T.DirectionalLight(0xeaf2fb, 0);
    fill2.position.set(-14, 26, 62);
    sc.add(fill2); LGT.fill = fill2;

    /* 黑灯下的「设备自照」：几盏低强度点光，把工位附近的空气点亮一点点 */
    /* 随车工位灯：车身走到哪，这束光就跟到哪。
       黑灯场景最忌「均匀泛光」——有明确的光池边界，照片感才出来 */
    var follow = new T.SpotLight(0xf2f8ff, 1.8, 24, .50, .80, 1.6);
    follow.position.set(PX.in, FLOOR + 8.2, BELT_Z + 2.6);
    follow.target.position.set(PX.in, FLOOR + .4, BELT_Z);
    sc.add(follow); sc.add(follow.target);
    LGT.follow = follow;
    /* 可见光锥（加色、顶端亮底端淡） */
    LGT.followCone = lightCone(PX.in, FLOOR + 8.2, BELT_Z + 1.2, 4.4, 7.8, 0xc8e4ff, .055);

    /* 轮廓光：从后方掠过金属边缘，漆面和减速机才有高光线，不然全是平涂 */
    var rim = new T.DirectionalLight(0xa9d4ff, .70);
    rim.position.set(-34, 22, -46);
    sc.add(rim); LGT.rim = rim;
    /* 另一侧的低角度侧逆光：黑灯里补出车身朝 +x 的一面，
       否则近侧永远是死黑，白色车身读成一块灰板 */
    var rim2 = new T.DirectionalLight(0xcfe4ff, .32);
    rim2.position.set(66, 12, 30);
    sc.add(rim2); LGT.rim2 = rim2;

    /* 黑灯下的「工位工作灯」：不是给车间照明，是把每台设备的立面擦出来一点。
       真实黑灯车间里，机器人工作区和检修位本来就留少量局部照明。 */
    [
      [PX.in, -8.2, 3.4, 0x8fd0f0, 2.8, 26],
      [PX.strip, -8.2, 3.6, 0x8fd0f0, 2.8, 26],
      [PX.ip, -8.2, 3.4, 0x8fd0f0, 2.6, 26],
      [PX.seat, -8.2, 3.4, 0x8fd0f0, 2.6, 26],
      [PX.marry, -8.4, 3.2, 0xd8ecff, 2.8, 26],
      [PX.tire, -8.2, 3.4, 0x8fd0f0, 2.9, 26],
      [PX.tire, -8.6, -2.4, 0xbfe2ff, 1.6, 20],
      [PX.dress, -8.2, 3.4, 0x8fd0f0, 2.6, 26],
      [PX.out, -8.2, 3.4, 0x6fe8c0, 2.6, 26],
      [0, -8.0, AGV_Z + 2, 0x4fb0d8, 1.2, 26]
    ].forEach(function (p) {
      var l = new T.PointLight(p[3], p[4], p[5], 2);
      l.position.set(p[0], p[1], p[2]);
      sc.add(l);
    });
  }

  /* 环境 / 背景 / 雾：随 st._litT 平滑切换 */
  function applyMood() {
    var sc = K.scene();
    var lit = st._litT;
    if (ENV.dark && ENV.light) sc.environment = lit > .5 ? ENV.light : ENV.dark;
    if (LGT.key) LGT.key.intensity = .86 + lit * 1.10;
    if (LGT.amb) LGT.amb.intensity = .075 + lit * .60;
    if (LGT.fill) LGT.fill.intensity = lit * 1.55;
    if (LGT.ceil) LGT.ceil.emissiveIntensity = lit * 1.25;
    if (LGT.wall) LGT.wall.emissiveIntensity = lit * .6;
    /* 曝光：黑灯抬到 .98 —— 目的不是「亮」，而是让机械臂的暗面、
       车身轮拱里还留得住一层灰；开灯时再抬到 1.42。 */
    var d2 = window.__labDebug;
    if (d2 && d2.composer) {
      var ps = d2.composer.passes;
      var last2 = ps[ps.length - 1];
      if (last2 && last2.uniforms && last2.uniforms.uExposure) {
        last2.uniforms.uExposure.value = .94 + lit * .48;
      }
    }
    if (LGT.hemi) {
      LGT.hemi.intensity = .26 + lit * .68;
      LGT.hemi.color.setRGB(.21 + lit * .62, .35 + lit * .60, .48 + lit * .50);
      LGT.hemi.groundColor.setRGB(.028 + lit * .30, .038 + lit * .31, .048 + lit * .32);
    }
    if (sc.fog) {
      sc.fog.color.setHex(lit > .45 ? 0x6b7681 : 0x05080b);
      sc.fog.density = .0072 - lit * .0050;
    }
    /* 灯盘 / 光晕 / 光锥 */
    for (var i = 0; i < lamps.length; i++) {
      var L = lamps[i];
      L.mat.emissive.setHex(0xfff3e2);
      L.mat.emissiveIntensity = lit * 4.2;
      if (L.inner) L.inner.emissiveIntensity = lit * 1.9;
      L.halo.material.opacity = lit * .45;
      if (L.decal) L.decal.material.opacity = lit * .16;
    }
    /* 灯灭时不该有看得见的光锥：压低到 8%，只当极淡的余晖 */
    for (var j = 0; j < cones.length; j++) cones[j].m.material.uniforms.uOp.value = cones[j].op * (.08 + lit * 2.8);
    if (O.exitGlow) O.exitGlow.material.opacity = .30 - lit * .12;
    for (var k3 = 0; k3 < deviceGlows.length; k3++) {
      deviceGlows[k3].m.material.opacity = deviceGlows[k3].op * .72 * (1 - lit * .92);
    }
    if (O.floor) {
      O.floor.material.envMapIntensity = .045 + lit * .34;  // 黑灯几乎不反射，只留轮廓里的微光
      O.floor.material.roughness = .93 - lit * .10;          // 哑光环氧，低机位掠射也不成镜面
      O.floor.material.metalness = .04;
      O.floor.material.color.setHex(lit > .45 ? 0x5c656e : 0x252b31);
    }
    /* 背景：黑灯是深空蓝黑，开灯是冷灰 */
    if (sc.__BGTEX) sc.background = lit > .5 ? sc.__BGTEX.light : sc.__BGTEX.dark;
  }

  /* 环境贴图要等 renderer 就绪（boot 里 setup 早于 __labDebug 赋值），第一帧再生成 */
  function ensureEnv() {
    if (ENV.tried) return;
    var d = window.__labDebug;
    if (!d || !d.renderer) return;
    ENV.tried = true;
    try {
      ENV.dark = makeEnv(false);
      ENV.light = makeEnv(true);
    } catch (e) { console.warn('env build failed', e); }
    if (!ENV.dark) {
      /* 兜底：无 PMREM 就断开环境反射，暗场里金属偏黑也好过一片亮白 */
      var sc = K.scene();
      sc.environment = null;
      sc.traverse(function (o) {
        if (o.isMesh && o.material && o.material.envMapIntensity !== undefined) o.material.envMapIntensity *= .3;
      });
    } else {
      K.scene().environment = ENV.dark;
    }
  }


  /* ---------------- 滑板输送线（Skillet） ----------------
     整车总装不用辊道：车身自重几百公斤、还要在工位间精确停位，
     现场用的是滑板（skillet）或空中 EMS。这里做滑板 + 地面拖链。 */
  var BELT_X0 = -52, BELT_X1 = 52;
  function buildConveyor() {
    var sc = K.scene();
    var W = 2.9;
    /* 轨道必须在产线末端收头：直通到 BELT_X1=52 会整段插穿下线坡道(46.7 起) */
    var BELT_END = PX.out + 2.2;
    /* 两条导轨：滑板在导轨上滚，导轨侧边嵌 LED 灯带 */
    [-1, 1].forEach(function (sg) {
      var rail = new T.Mesh(new T.BoxGeometry(BELT_END - BELT_X0, .26, .2), MAT.steel);
      rail.position.set((BELT_X0 + BELT_END) / 2, BELT_Y - .26, BELT_Z + sg * W / 2);
      rail.castShadow = true; rail.receiveShadow = true; sc.add(rail);
      for (var lx2 = BELT_X0 + 2; lx2 < BELT_END - 2.5; lx2 += 6.5) {
        var led = ledStrip(3.4, .05, .05, 0x59c8f0, 1, null);
        led.position.set(lx2 + 1.7, BELT_Y - .38, BELT_Z + sg * (W / 2 + .12));
      }
    });
    /* 导轨支架 */
    for (var lx = BELT_X0 + 3; lx < BELT_END; lx += 6.5) {
      [-1, 1].forEach(function (sg) {
        var lg = new T.Mesh(new T.BoxGeometry(.22, BELT_Y - FLOOR - .4, .22), MAT.graphite);
        lg.position.set(lx, (BELT_Y - .4 + FLOOR) / 2, BELT_Z + sg * W / 2);
        lg.castShadow = true; sc.add(lg);
      });
      var cross = new T.Mesh(new T.BoxGeometry(.12, .12, W), MAT.graphite);
      cross.position.set(lx, FLOOR + .3, BELT_Z); sc.add(cross);
    }
    /* 地面拖链槽（供电滑板） */
    var drag = new T.Mesh(new T.BoxGeometry(BELT_END - BELT_X0, .12, .34), MAT.dark);
    drag.position.set((BELT_X0 + BELT_END) / 2, FLOOR + .06, BELT_Z + W / 2 + .55); sc.add(drag);
    /* 轨道端梁：导轨在此收头、接下线坡道，不是一根直通厂房墙的悬空轨 */
    var endBeam = new T.Mesh(new T.BoxGeometry(.42, .5, W + .7), MAT.graphite);
    endBeam.position.set(BELT_END, BELT_Y - .2, BELT_Z); endBeam.castShadow = true; sc.add(endBeam);
    /* 工位停止器：每个工位一对，滑板到位后顶住 */
    Object.keys(PX).forEach(function (k) {
      [-1, 1].forEach(function (sg) {
        var stop = new T.Mesh(new T.BoxGeometry(.16, .5, .16), MAT.steel);
        stop.position.set(PX[k] - 2.9, BELT_Y - .1, BELT_Z + sg * (W / 2 + .28));
        sc.add(stop);
      });
    });
  }

  /* ---------------- 滑板（承载车身，随线走） ---------------- */
  function makeSkillet() {
    var g = new T.Group();
    /* 合装窗口要让开的板件：动力总成从地坑升起时，滑板的实心台面/定位销/
       支撑柱正挡在中间，不避开就是一段「从铁板里钻出来」的穿模 */
    var liftParts = [];
    var deck = new T.Mesh(new T.BoxGeometry(5.4, .2, 2.6),
      new T.MeshPhysicalMaterial({
        color: 0x1f262d, roughness: .74, metalness: .16, envMapIntensity: .45,
        roughnessMap: grainTex(64, .55, .3, 3)
      }));
    deck.position.y = -.1; deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck); liftParts.push(deck);
    /* 四个滚轮（让开时仍保留，滑板还在轨道上） */
    [[-2.2, -1.25], [2.2, -1.25], [-2.2, 1.25], [2.2, 1.25]].forEach(function (p) {
      var w = new T.Mesh(new T.CylinderGeometry(.16, .16, .16, 12), MAT.rubber);
      w.rotation.x = Math.PI / 2; w.position.set(p[0], -.3, p[1]); g.add(w);
    });
    /* 车身定位销：四个锥形销，车身落在上面 */
    [[-1.6, -.8], [1.6, -.8], [-1.6, .8], [1.6, .8]].forEach(function (p) {
      var pin = new T.Mesh(new T.CylinderGeometry(.07, .11, .2, 8), MAT.machined);
      pin.position.set(p[0], .06, p[1]); g.add(pin); liftParts.push(pin);
    });
    /* 支撑柱：车身底板比滑板高 0.34（那是悬架空间），没有柱子会像悬浮 */
    [[-1.5, -.72], [1.5, -.72], [-1.5, .72], [1.5, .72]].forEach(function (p) {
      var post = new T.Mesh(new T.BoxGeometry(.2, .34, .2), MAT.graphite);
      post.position.set(p[0], .17, p[1]); g.add(post); liftParts.push(post);
    });
    g.userData.liftParts = liftParts;
    /* 滑板编号灯 */
    var led = glowDot(g, 2.4, .02, 1.05, 0x4fd8ff, .05);
    led.mat.emissiveIntensity = 1.8;
    return g;
  }

  /* ---------------- 汽车总成件 ----------------
     白车身用「侧视轮廓 + 沿车宽挤出」：真正的车身是曲面，但总装线上读到的是
     侧面剪影（车顶弧线、A/C 柱、轮拱），把这条线做对，比堆一堆曲面更像车。 */

  function bodyShape(withWheels) {
    var sh = new T.Shape();
    var r = .44;                       // 轮拱半径
    var front = 1.50, rear = -1.45;    // 前后轮心 x
    sh.moveTo(-2.34, .34);
    sh.lineTo(rear - r, .34);
    sh.absarc(rear, .34, r, Math.PI, 0, true);      // 后轮拱：向上绕半圆 = 在底边开缺口
    sh.lineTo(front - r, .34);
    sh.absarc(front, .34, r, Math.PI, 0, true);     // 前轮拱
    sh.lineTo(2.34, .34);
    sh.lineTo(2.40, .58);              // 前保险杠
    sh.lineTo(2.34, .84);
    sh.lineTo(1.96, .93);              // 引擎盖前缘
    sh.lineTo(1.42, 1.00);             // 风挡下沿（A 柱根）
    sh.lineTo(.86, 1.42);              // A 柱
    sh.lineTo(.30, 1.47);              // 车顶
    sh.lineTo(-1.16, 1.44);            // 车顶后
    sh.lineTo(-1.58, 1.04);            // C 柱
    sh.lineTo(-2.06, 1.00);            // 后备箱盖
    sh.lineTo(-2.30, .90);
    sh.lineTo(-2.40, .56);             // 后保险杠
    sh.closePath();
    return sh;
  }

  /* 白车身 / 涂装车身：车身骨架 + 玻璃位 + 门缝线 */
  function makeBody(withGlass) {
    var g = new T.Group();
    var W = CAR.W;
    /* steps 必须 >1：否则宽度方向只有 2 个顶点，车顶/引擎盖的横弧根本做不出来，
       整车就是「平顶一块砖」。加宽向细分后，中央顶点得以抬高，车顶才有拱度。 */
    var geo = new T.ExtrudeGeometry(bodyShape(), {
      depth: W, bevelEnabled: true, bevelThickness: .055, bevelSize: .055,
      bevelSegments: 3, curveSegments: 16, steps: 4
    });
    geo.translate(0, 0, -W / 2);
    /* 挤出体侧面是平的，看着像一块「饼干」。这里对顶点做三件事：
       车头车尾收窄 → 腰线以上收窄 → 车顶压出横弧，形体立刻立起来 */
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      var zn = pz / (W / 2);
      var xk = Math.abs(px) / 2.4;
      var taper = 1 - .17 * Math.pow(xk, 2.4);            // 头尾内收
      var roofK = Math.max(0, (py - .92) / .55);
      taper *= (1 - .27 * roofK * roofK);                  // 车顶（温室）更窄，收腰更明显
      var rockK = Math.max(0, (.60 - py) / .30);           // 下裙轻微内收（不能太狠，否则轮子会甩出车身外）
      taper *= (1 - .08 * rockK * rockK);
      pos.setZ(i, pz * taper);
      /* 车顶 + 引擎盖/后备箱横弧：越靠侧边越低，整车才有「鼓起来」的曲面，而不是平板。
         幅度取 .10 而非 .17 —— 太大就成了「鹅卵石/蛋形」，反而不像车。 */
      var arc = Math.max(0, (py - .88) / .58);
      pos.setY(i, py - .10 * arc * Math.pow(Math.abs(zn), 2));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    var body = new T.Mesh(geo, MAT.shellPaint);
    body.castShadow = true; body.receiveShadow = true; g.add(body);

    /* 翼子板不再用独立实体盒（会插进轮胎造成穿模）；轮拱由 profile 的底边弧口 + 轮子内缩来表现 */

    /* 腰线：分段亮条。不能整条贯穿 —— 四扇门体（z .93~1.06）比端盖(z≈.95)更靠外，
       整条腰线会在门区插进门板里；门自带腰线，车身只留门区之外的两段。 */
    [-1, 1].forEach(function (sg) {
      [[1.35, 1.90], [-1.68, 1.24]].forEach(function (w2) {
        var wn = new T.Mesh(new T.BoxGeometry(w2[1], .045, .035), MAT.trim);
        wn.position.set(w2[0], .98, sg * (W * .503)); g.add(wn);
      });
    });

    /* 门缝：与四门位置对齐（后门 -1.00/-0.46，前门 -0.32/0.34），读作四门 */
    var seamMat = new T.LineBasicMaterial({ color: 0x1a222a, transparent: true, opacity: .85 });
    [-1, 1].forEach(function (sg) {
      var pts = [
        [-0.98, .42, sg * (W * .503)], [-0.98, 1.24, sg * (W * .503)],
        [-0.46, .42, sg * (W * .503)], [-0.46, 1.24, sg * (W * .503)],
        [-0.32, .42, sg * (W * .503)], [-0.32, 1.24, sg * (W * .503)],
        [0.34, .42, sg * (W * .503)], [0.34, .96, sg * (W * .503)]
      ];
      var lg = new T.BufferGeometry().setFromPoints(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
      var ls = new T.LineSegments(lg, seamMat); g.add(ls);
    });

    /* 前后灯组 + 格栅 + 后视镜：车身上这四处一有，形体立刻被认成「车」。
       灯组必须贴在保险杠前表面外侧：车头经 taper 收窄后侧板只到 x≈2.37，
       沿用 x=2.31 整组灯都埋在实体里 —— 下线车看着「没灯、漆面不完整」。 */
    [-1, 1].forEach(function (sg) {
      var lamp = new T.Mesh(new T.BoxGeometry(.07, .17, .44), MAT.lampGlass);
      lamp.position.set(2.41, .70, sg * .56); g.add(lamp);
      var tail = new T.Mesh(new T.BoxGeometry(.06, .15, .48), MAT.tailLamp);
      tail.position.set(-2.42, .84, sg * .54); g.add(tail);
      var mir = new T.Mesh(K.geoRoundBox(.19, .11, .26, .04), MAT.trim);
      mir.position.set(.88, 1.03, sg * .99); g.add(mir);
      var mirArm = new T.Mesh(new T.BoxGeometry(.10, .07, .12), MAT.trim);
      mirArm.position.set(.88, .99, sg * .90); g.add(mirArm);
    });
    var grille = new T.Mesh(new T.BoxGeometry(.05, .26, .96), MAT.dark);
    grille.position.set(2.42, .56, 0); g.add(grille);
    var grilleBar = new T.Mesh(new T.BoxGeometry(.03, .04, .92), MAT.machined);
    grilleBar.position.set(2.44, .60, 0); g.add(grilleBar);
    var grilleBar2 = grilleBar.clone(); grilleBar2.position.y = .52; g.add(grilleBar2);

    /* 删掉的三类「贴片」细节，全是穿模源：
       ① 侧窗深色片 win / B 柱片 bp：z=.956 落在门体(z .93~1.06)内部，回装后插进门板；
       ② 车顶内腔片 rf/rf2：平片顶边 1.44 高于横弧压低后的车顶曲面(≈1.38)，翘出车顶；
       ③ 附加底板 underF/underR：横跨前后轮心 x 与全车宽，直接插进轮胎。
       侧窗由门玻璃承担（门拆下时敞开，总装线正是如此），地板用挤出体自带的一层。 */

    /* 轮眉亮条：贴在车身表面外侧（该处实体半宽 ≈.90，z=.905 在外面），
       半径 .46 不啃胎面(.415)。轮拱 r=.44 与轮胎间隙只有 .025，
       塞不进任何有厚度的内衬环 —— 内衬删除，轮眉负责轮拱的「轮廓感」。 */
    [-1.45, 1.50].forEach(function (rx) {
      [-1, 1].forEach(function (sg) {
        var brow = new T.Mesh(new T.TorusGeometry(.46, .02, 6, 22, Math.PI), MAT.trim);
        brow.position.set(rx, .34, sg * .905); g.add(brow);
      });
    });
    return g;
  }

  /* 车门：外板（带窗框）+ 玻璃 + 内板 + 把手。总装线先拆门、装完内饰再回装。
     总高必须 .88：装到 y=.42 后门顶 1.30，低于车顶横弧压低后的侧板顶边(≈1.34)。
     沿用 1.02 时门顶 1.44、高出车身 0.1 —— 回装阶段「门比车高」的穿模就是它。 */
  function makeDoor(side, front) {
    var g = new T.Group();
    var w = front ? .66 : .52;   // 后门 .52：右缘 -0.98 避开后轮拱开口（拱右端 -1.01）
    var h = .84;   // 门顶 1.26，与车顶弧线(≈1.34)拉开 .08 层次，不再糊在一起
    var sh = new T.Shape();
    sh.moveTo(0, 0); sh.lineTo(w, 0);
    sh.lineTo(w, .62); sh.lineTo(w - .1, .62);
    sh.lineTo(w - .12, h); sh.lineTo(.10, h); sh.lineTo(.02, .62); sh.lineTo(0, .62);
    sh.closePath();
    var geo = new T.ExtrudeGeometry(sh, { depth: .09, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2, curveSegments: 6 });
    var outer = new T.Mesh(geo, MAT.carPaint);
    outer.castShadow = true; outer.receiveShadow = true;
    g.add(outer);
    /* 窗玻璃 */
    var win = new T.Mesh(new T.ShapeGeometry((function () {
      var w2 = new T.Shape();
      w2.moveTo(.12, .66); w2.lineTo(w - .16, .66); w2.lineTo(w - .18, h - .04); w2.lineTo(.18, h - .04);
      w2.closePath(); return w2;
    })()), MAT.cabin);
    win.position.z = .045; g.add(win);
    /* 腰线饰条：门板与窗框的分界 */
    var belt = new T.Mesh(new T.BoxGeometry(w - .02, .035, .026), MAT.trim);
    belt.position.set(w / 2, .62, .096); g.add(belt);
    /* 内板 */
    var inner = new T.Mesh(new T.BoxGeometry(w - .12, .56, .06), MAT.doorTrim);
    inner.position.set(w / 2, .30, -.06); g.add(inner);
    /* 把手：放在门板区内（腰线 .62 以下） */
    var hd = new T.Mesh(new T.BoxGeometry(.26, .07, .06), MAT.machined);
    hd.position.set(w * .62, .52, .07); g.add(hd);
    /* 门缝：有厚度的深色细条。1px 线在这个缩放下看不见，且 bevel 后门外
       表面到 z≈.11，细条必须放到 .128 才不会被埋掉。 */
    var seamMat = new T.MeshBasicMaterial({ color: 0x1b2730 });
    [[w / 2, 0, w, .018], [w / 2, h, w, .018], [0, h / 2, .018, h], [w, h / 2, .018, h]].forEach(function (b) {
      var s2 = new T.Mesh(new T.BoxGeometry(b[2], b[3], .014), seamMat);
      s2.position.set(b[0], b[1], .128); g.add(s2);
    });
    g.userData.w = w;
    return g;
  }

  /* 座椅：坐垫 + 靠背 + 头枕 + 侧翼，深色皮革 */
  function makeSeat() {
    var g = new T.Group();
    var cush = new T.Mesh(K.geoRoundBox(.62, .16, .62, .07), MAT.seat);
    cush.position.y = .30; g.add(cush);
    var back = new T.Mesh(K.geoRoundBox(.62, .78, .16, .07), MAT.seat);
    back.position.set(0, .68, -.24); back.rotation.x = -.16; g.add(back);
    var head = new T.Mesh(K.geoRoundBox(.34, .26, .14, .06), MAT.seat);
    head.position.set(0, 1.14, -.30); head.rotation.x = -.16; g.add(head);
    /* 侧翼 */
    [-1, 1].forEach(function (sg) {
      var fin = new T.Mesh(K.geoRoundBox(.12, .30, .52, .05), MAT.seat);
      fin.position.set(sg * .34, .38, 0); g.add(fin);
    });
    /* 滑轨 */
    [-1, 1].forEach(function (sg) {
      var rail = new T.Mesh(new T.BoxGeometry(.08, .08, .78), MAT.steel);
      rail.position.set(sg * .26, .1, .06); g.add(rail);
    });
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* 仪表台总成：横梁 + 中控屏 + 出风口 + 方向盘 */
  function makeCockpit() {
    var g = new T.Group();
    var dash = new T.Mesh(K.geoRoundBox(1.72, .34, .52, .09), MAT.doorTrim);
    dash.position.set(0, .98, -.55); g.add(dash);
    /* 中控屏（黑灯时它自己亮着） */
    var scrC = document.createElement('canvas'); scrC.width = 128; scrC.height = 80;
    var sx = scrC.getContext('2d');
    sx.fillStyle = '#050d14'; sx.fillRect(0, 0, 128, 80);
    sx.fillStyle = '#2f8fb8'; sx.fillRect(6, 6, 116, 10);
    sx.fillStyle = '#123'; for (var i = 0; i < 4; i++) sx.fillRect(10, 26 + i * 12, 60 + i * 12, 7);
    var st2 = new T.CanvasTexture(scrC); st2.encoding = T.sRGBEncoding;
    var scr = new T.Mesh(new T.PlaneGeometry(.62, .38),
      new T.MeshBasicMaterial({ map: st2, toneMapped: false }));
    scr.position.set(.30, 1.06, -.30); scr.rotation.x = -.12; g.add(scr);
    /* 出风口 */
    [-.62, .78].forEach(function (dx) {
      var vent = new T.Mesh(new T.BoxGeometry(.30, .12, .06), MAT.dark);
      vent.position.set(dx, 1.02, -.28); g.add(vent);
    });
    /* 方向盘：盘圈 + 三辐 + 转向柱 */
    var wheelG = new T.Group(); wheelG.position.set(-.50, 1.02, -.24);
    wheelG.rotation.x = -.42;
    var rim = new T.Mesh(new T.TorusGeometry(.30, .045, 10, 26), MAT.dark);
    wheelG.add(rim);
    for (var k = 0; k < 3; k++) {
      var sp = new T.Mesh(new T.BoxGeometry(.27, .05, .04), MAT.dark);
      sp.rotation.z = k / 3 * Math.PI * 2 + Math.PI / 2;
      sp.position.set(Math.cos(k / 3 * Math.PI * 2 + Math.PI / 2) * .14, Math.sin(k / 3 * Math.PI * 2 + Math.PI / 2) * .14, 0);
      wheelG.add(sp);
    }
    var hub = new T.Mesh(new T.CylinderGeometry(.09, .09, .06, 12), MAT.trim);
    hub.rotation.x = Math.PI / 2; wheelG.add(hub);
    g.add(wheelG);
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* 车轮总成：胎 + 轮辋 + 五辐 + 五颗螺母 + 中心盖。
     螺母必须真的存在：轮胎工位整节课讲的就是「五颗螺母、110 N·m」，
     只有五根辐条而没有螺母，镜头推得再近也讲不出这件事。 */
  var _nutGeo = null;
  function makeWheel() {
    var g = new T.Group();
    /* 车轮轴沿 Z（车身横轴）：轮胎圆环默认轴即 Z，无需旋转；轮辋圆柱轴 Y→Z 对齐。
       之前轮胎旋成轴朝 Y、再整体转 π/2，装车后外倾——这是「车轮撞歪」的根因。*/
    var tire = new T.Mesh(new T.TorusGeometry(.30, .115, 14, 30), MAT.rubber);
    g.add(tire);
    var rim = new T.Mesh(new T.CylinderGeometry(.24, .24, .19, 22), MAT.rim);
    rim.rotation.x = Math.PI / 2; g.add(rim);
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2;
      var spoke = new T.Mesh(new T.BoxGeometry(.055, .205, .05), MAT.rim);
      spoke.position.set(Math.sin(a) * .12, Math.cos(a) * .12, 0);
      spoke.rotation.z = -a; g.add(spoke);
    }
    /* 五颗轮毂螺母：沿 72° 均布在轮辋面上，六角头朝外 */
    if (!_nutGeo) _nutGeo = new T.CylinderGeometry(.058, .064, .085, 6);
    var nuts = new T.InstancedMesh(_nutGeo, MAT.machined, 5);
    var nd = new T.Object3D();
    for (var ni = 0; ni < 5; ni++) {
      var na = ni / 5 * Math.PI * 2 + Math.PI / 2;
      nd.position.set(Math.cos(na) * .158, Math.sin(na) * .158, .135);
      nd.rotation.set(Math.PI / 2, 0, 0);
      nd.updateMatrix(); nuts.setMatrixAt(ni, nd.matrix);
    }
    nuts.castShadow = true;
    g.add(nuts);
    g.userData.nuts = nuts;
    var cap = new T.Mesh(new T.CylinderGeometry(.075, .075, .06, 12), MAT.machined);
    cap.rotation.x = Math.PI / 2; cap.position.z = .10; g.add(cap);
    /* 轮速传感器线（细节） */
    var wire = new T.Mesh(new T.CylinderGeometry(.012, .012, .3, 5), MAT.dark);
    wire.position.set(0, -.26, .02); g.add(wire);
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* 动力总成：发动机 + 变速箱 + 传动轴 + 副车架（合装工位从下方升起） */
  function makePowertrain() {
    var g = new T.Group();
    var eng = new T.Mesh(K.geoRoundBox(.86, .66, .70, .08), MAT.engine);
    g.add(eng);
    var head = new T.Mesh(K.geoRoundBox(.78, .22, .62, .06), MAT.alu);
    head.position.y = .42; g.add(head);
    var trans = new T.Mesh(new T.CylinderGeometry(.30, .36, .78, 16), MAT.alu);
    trans.rotation.z = Math.PI / 2; trans.position.set(-.78, -.04, 0); g.add(trans);
    var shaft = new T.Mesh(new T.CylinderGeometry(.055, .055, 1.6, 8), MAT.steel);
    shaft.rotation.z = Math.PI / 2; shaft.position.set(-1.9, -.06, 0); g.add(shaft);
    /* 副车架 */
    var sub = new T.Mesh(new T.BoxGeometry(2.2, .1, 1.5), MAT.graphite);
    sub.position.set(-.1, -.42, 0); g.add(sub);
    /* 前悬架：两根下摆臂 */
    [-1, 1].forEach(function (sg) {
      var arm = new T.Mesh(new T.BoxGeometry(.78, .09, .12), MAT.graphite);
      arm.position.set(.28, -.34, sg * .62); arm.rotation.y = sg * .18; g.add(arm);
    });
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* ---------------- 六轴机械臂 ---------------- */
  /* ---------------- 真实 CAD 六轴臂（TRLC-DK1） ----------------
     按 skill-virtue(robot-glb-sim) 的流水线：URDF 运动学装配 + 数值 IK + 刚性跟随。
     解析 2 连杆 IK 对真实限位不可用（J3 禁负角等），这里主臂走数值解。 */
  var DK1 = {
    S: 7, ready: false, root: null, lg: {}, tcp: null,
    angles: [0, .65, 1.35, -1.55, .85],
    home: [0, .65, 1.35, -1.55, .85],
    JLIM: [[-2.2, 2.2], [-1.4, 1.5], [-.15, 4.4], [-2.3, 2.3], [-1.9, 1.9]]
  };
  function _dk1Mat(m) {
    /* 按 URDF 材质亮度分级：白壳→白漆、中灰→金属、近黑→深色金属 */
    var c = m.color ? m.color.clone() : new T.Color(.5, .5, .5);
    var lum = c.r * .3 + c.g * .6 + c.b * .1;
    if (lum > .6) return new T.MeshPhysicalMaterial({
      color: 0xdfe4e9, roughness: .38, metalness: .30,
      clearcoat: .4, clearcoatRoughness: .35, envMapIntensity: 1.45,
      normalMap: metalNormal(), normalScale: new T.Vector2(.08, .08)
    });
    if (lum > .22) return new T.MeshStandardMaterial({
      color: 0x596068, roughness: .44, metalness: .85, envMapIntensity: 1.3,
      normalMap: metalNormal(), normalScale: new T.Vector2(.10, .10), roughnessMap: roughTex()
    });
    return new T.MeshStandardMaterial({ color: 0x1a1e23, roughness: .55, metalness: .72, envMapIntensity: 1.1 });
  }
  function _dk1Load(cb) {
    var table = window.__GLB_DK1 || {};
    var names = Object.keys(table);
    if (!names.length) return cb();
    var loader = new T.GLTFLoader(), meshes = {}, n = names.length;
    names.forEach(function (name) {
      var bin = atob(table[name]), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loader.parse(bytes.buffer, '', function (g) {
        g.scene.traverse(function (o) {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = _dk1Mat(o.material); }
        });
        meshes[name] = g.scene;
        if (--n === 0) { DK1.meshes = meshes; _dk1Assemble(); cb(); }
      }, function (e) { console.error('DK1 parse fail', name, e); if (--n === 0) cb(); });
    });
  }
  function _dk1Assemble() {
    /* 直接从 URDF 抄：<joint><origin xyz/><axis/>；负轴用 sign */
    var CHAIN = [
      { link: 'base_link', parent: null, origin: [0, 0, 0], axis: null },
      { link: 'link1-2', parent: 'base_link', origin: [0, 0, 0.0615], axis: 'z', sign: 1 },
      { link: 'link2-3', parent: 'link1-2', origin: [0.02, 0, 0.0385], axis: 'y', sign: 1 },
      { link: 'link3-4', parent: 'link2-3', origin: [-0.264, 0, 0], axis: 'y', sign: -1 },
      { link: 'link4-5', parent: 'link3-4', origin: [0.244004, 0, 0.059971], axis: 'y', sign: -1 },
      { link: 'link5-6', parent: 'link4-5', origin: [0.061868, 0, 0.0425], axis: 'z', sign: -1 },
      { link: 'link6-7', parent: 'link5-6', origin: [0.032, 0, -0.0425], axis: 'x', sign: 1 }
    ];
    var root = DK1.root;                       // makeCadArm 已建好并挂进场景
    var lg = {};
    CHAIN.forEach(function (c) {
      var g = new T.Group();
      g.position.set(c.origin[0], c.origin[1], c.origin[2]);
      (c.parent ? lg[c.parent] : root).add(g);
      lg[c.link] = g;
      if (DK1.meshes[c.link]) g.add(DK1.meshes[c.link]);
    });
    var tcp = new T.Object3D(); tcp.position.set(0.158, 0, 0);
    lg['link6-7'].add(tcp);
    /* 真空吸盘（米制）：快换法兰 + 波纹管 + 吸盘面 */
    var flange = new T.Mesh(new T.CylinderGeometry(.028, .034, .03, 14), new T.MeshStandardMaterial({ color: 0x3a4249, roughness: .5, metalness: .8, envMapIntensity: 1.1 }));
    flange.rotation.z = Math.PI / 2; flange.position.set(.03, 0, 0); tcp.add(flange);
    var wrist = new T.Mesh(new T.CylinderGeometry(.016, .016, .06, 10), new T.MeshStandardMaterial({ color: 0x8d959d, roughness: .3, metalness: .9, envMapIntensity: 1.2 }));
    wrist.rotation.z = Math.PI / 2; wrist.position.set(.075, 0, 0); tcp.add(wrist);
    var cup = new T.Mesh(new T.CylinderGeometry(.052, .062, .022, 16), new T.MeshStandardMaterial({ color: 0x14181c, roughness: .85 }));
    cup.rotation.z = Math.PI / 2; cup.position.set(.115, 0, 0); tcp.add(cup);
    var bellows = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([
      new T.Vector3(-.01, .02, 0), new T.Vector3(-.12, .06, .02),
      new T.Vector3(-.2, .12, -.01), new T.Vector3(-.26, .2, .02)
    ]), 12, .012, 6, false), new T.MeshStandardMaterial({ color: 0x101317, roughness: .9 }));
    tcp.add(bellows);
    var led = glowDot(tcp, .09, .04, .035, 0x48e0a0, .012);
    DK1.lg = lg; DK1.tcp = tcp;
    DK1.joints = [
      { obj: lg['link1-2'], axis: 'z', sign: 1 },
      { obj: lg['link2-3'], axis: 'y', sign: 1 },
      { obj: lg['link3-4'], axis: 'y', sign: -1 },
      { obj: lg['link4-5'], axis: 'y', sign: -1 },
      { obj: lg['link5-6'], axis: 'z', sign: -1 }
    ];
    DK1.axes = [
      { t: [0, 0, 0.0615], r: [0, 0, 1] },
      { t: [0.02, 0, 0.0385], r: [0, 1, 0] },
      { t: [-0.264, 0, 0], r: [0, -1, 0] },
      { t: [0.244004, 0, 0.059971], r: [0, -1, 0] },
      { t: [0.061868, 0, 0.0425], r: [0, 0, -1] }
    ];
    DK1.ready = true;
  }
  /* 数值 IK：多起点坐标下降 + 关节限位 + 贴近当前姿态的正则（骨架照抄 robot-glb-sim） */
  var _fkM = null, _fkT = null, _fkR = null, _fkV = null, _fkP = null;
  function fkTCP(a) {
    if (!_fkM) { _fkM = new T.Matrix4(); _fkT = new T.Matrix4(); _fkR = new T.Matrix4(); _fkV = new T.Vector3(); _fkP = new T.Vector3(); }
    _fkM.identity();
    for (var i = 0; i < 5; i++) {
      _fkT.makeTranslation(DK1.axes[i].t[0], DK1.axes[i].t[1], DK1.axes[i].t[2]);
      _fkR.makeRotationAxis(_fkV.set(DK1.axes[i].r[0], DK1.axes[i].r[1], DK1.axes[i].r[2]), a[i]);
      _fkM.multiply(_fkT).multiply(_fkR);
    }
    /* J6 的 origin 平移不能漏：J6 绕 x 转不改变自身原点位置，
       漏掉这段会让 IK 模型与场景图差 0.053m（×S=0.37 场景单位），
       表现为「臂解到地里、门贴地」 */
    _fkT.makeTranslation(0.032, 0, -0.0425);
    _fkM.multiply(_fkT);
    return _fkP.set(0.158, 0, 0).applyMatrix4(_fkM);
  }
  /* 肘部前向运动学：前 n 个关节变换后的原点（模型单位，独立矩阵避免与 fkTCP 冲突） */
  var _fkM2 = new T.Matrix4(), _fkT2 = new T.Matrix4(), _fkR2 = new T.Matrix4(), _fkP2 = new T.Vector3();
  function fkJoint(a, n) {
    _fkM2.identity();
    for (var i = 0; i < n; i++) {
      _fkT2.makeTranslation(DK1.axes[i].t[0], DK1.axes[i].t[1], DK1.axes[i].t[2]);
      _fkR2.makeRotationAxis(_fkP2.set(DK1.axes[i].r[0], DK1.axes[i].r[1], DK1.axes[i].r[2]), a[i]);
      _fkM2.multiply(_fkT2).multiply(_fkR2);
    }
    return _fkP2.set(0, 0, 0).applyMatrix4(_fkM2);
  }
  function solveCadIK(lt, seed) {
    var JL = DK1.JLIM;
    var clampA = function (a) {
      return a.map(function (v, i) { return Math.min(JL[i][1], Math.max(JL[i][0], v)); });
    };
    /* 越障阈值：肘部（模型单位）低于此高度即罚分，逼出「拱肘越过车身」的姿态 */
    var ELBOW_MIN = (BELT_Y + 1.85 - (FLOOR + .1)) / DK1.S;
    var cost = function (a) {
      var p = fkTCP(a);
      var d2 = (p.x - lt.x) * (p.x - lt.x) + (p.y - lt.y) * (p.y - lt.y) + (p.z - lt.z) * (p.z - lt.z);
      /* 拱肘引导：真实机器人跨越车身就是抬肘过顶。仅在 TCP 已基本到位时启用——
         先保证抓得到，seed 继承让抬肘逐帧渐进，不会把末端精度压死 */
      var ej = fkJoint(a, 3).y;
      if (d2 < 0.4 && ej < ELBOW_MIN) d2 += (ELBOW_MIN - ej) * 0.8;
      var reg = 0;
      for (var i = 0; i < 5; i++) reg += (a[i] - seed[i]) * (a[i] - seed[i]);
      return d2 + 0.008 * reg;
    };
    var starts = [clampA(seed.slice(0, 5))];
    var spread = [[0, .5, 1.6, -1.6, .9], [0, -.3, 2.2, -2.0, .4], [1.2, .8, 1.0, -1.2, 1.3]];
    spread.forEach(function (s0) { starts.push(clampA(s0.slice())); });
    var best = null, bd = Infinity;
    for (var s2 = 0; s2 < starts.length; s2++) {
      var a = starts[s2].slice(), f = cost(a), step = .45;
      for (var it = 0; it < 46 && step > .004; it++) {
        var ok = false;
        for (var i2 = 0; i2 < 5; i2++) {
          for (var d2i = 0; d2i < 2; d2i++) {
            var t = a.slice(); t[i2] += d2i ? -step : step;
            t = clampA(t);
            var c = cost(t);
            if (c < f - 1e-9) { f = c; a = t; ok = true; }
          }
        }
        if (!ok) step *= .5;
      }
      if (f < bd) { bd = f; best = a; }
    }
    return { angles: best, err: Math.sqrt(bd > 0 ? Math.max(0, bd) : 0) };
  }
  function applyCadJoints(a) {
    DK1.joints.forEach(function (j, i) {
      var ang = a[i];
      if (j.axis === 'z') j.obj.rotation.z = j.sign * ang;
      else if (j.axis === 'y') j.obj.rotation.y = j.sign * ang;
      else j.obj.rotation.x = j.sign * ang;
    });
  }
  /* 主臂实例：落在拆门工位，负转角锥体覆盖车门与门架（坑 3：先验方位角） */
  function makeCadArm(cx, cz) {
    var sc = K.scene();
    /* 借程序化底座件：铸铁盘 + 警示环 + 地脚 */
    K.cyl({ x: cx, y0: FLOOR, z: cz, r: 1.35, h: .3, seg: 30, mat: MAT.dark });
    var ring = new T.Mesh(new T.CylinderGeometry(1.42, 1.42, .12, 30), MAT.haz);
    ring.position.set(cx, FLOOR + .36, cz); sc.add(ring);
    K.cyl({ x: cx, y0: FLOOR + .42, z: cz, r: .95, h: .3, seg: 26, mat: MAT.graphite });
    var plate = new T.Mesh(new T.PlaneGeometry(.8, .4),
      new T.MeshBasicMaterial({ map: namePlate(88, 0xdfe4e9), toneMapped: false }));
    plate.position.set(cx + .7, FLOOR + 1.0, cz + .85); plate.rotation.y = .5;
    sc.add(plate);
    var R = { cx: cx, cz: cz, cad: true, id: 'cadStrip' };
    DK1.root = new T.Group();          // 每次构建重建（热重载安全）
    DK1.root.rotation.x = -Math.PI / 2;
    DK1.root.scale.setScalar(DK1.S);
    DK1.root.position.set(cx, FLOOR + .1, cz);
    sc.add(DK1.root);
    O.cadArm = R;
    return R;
  }
  /* 把世界目标转成 URDF 局部（米、z-up）：root 本地 → 翻轴 → 除 S */
  /* 纯数学变换，不碰场景图（worldToLocal 与欧拉写入互相踩更新的坑已实测）：
     root = T(P) · Rx(-90°) · S，其逆作用在 Δworld 上：
     urdf = ( dx/S, -dz/S, dy/S )，其中 d = world - P */
  function worldToUrdf(wx, wy, wz) {
    var P = DK1.root.position;
    return {
      x: (wx - P.x) / DK1.S,
      y: -(wz - P.z) / DK1.S,
      z: (wy - P.y) / DK1.S
    };
  }

  /* ---------------- 高密度六轴工业机器人 ----------------
     不用 328 三角的低模 glb 了：真实感来自「关节而不是方块」——
     J1 转台 / J2 肩 / J3 肘 / J4-J6 腕、减速机法兰螺栓圈、波纹管线包、
     可换末端工具（焊钳 / 夹爪 / 涂胶枪 / 拧紧轴 / 激光头）。
     节点层级严格贴合 IK 的 1.2 / 3.3 / 2.0 连杆长度。 */
  var ARM_COLORS = [0xf2b600, 0xff6a13, 0xdfe4e8, 0x2b6cb0, 0xc33b2e, 0x2fa36b];
  var ARM_MATS = {};
  function armMats(hex) {
    if (ARM_MATS[hex]) return ARM_MATS[hex];
    var o = {
      paint: new T.MeshPhysicalMaterial({
        color: hex, roughness: .52, metalness: .28,
        clearcoat: .14, clearcoatRoughness: .6, envMapIntensity: 1.9,
        normalMap: paintNormal(), normalScale: new T.Vector2(.14, .14),
        roughnessMap: roughTex()
      }),
      cast: new T.MeshStandardMaterial({ color: 0x3a4249, roughness: .62, metalness: .66, envMapIntensity: 1.25, normalMap: metalNormal(), normalScale: new T.Vector2(.14, .14), roughnessMap: roughTex() }),
      steel: new T.MeshStandardMaterial({ color: 0x9aa4ad, roughness: .22, metalness: .96, envMapIntensity: 1.6, normalMap: metalNormal(), normalScale: new T.Vector2(.09, .09) }),
      dark: new T.MeshStandardMaterial({ color: 0x15191d, roughness: .82, metalness: .18, normalMap: paintNormal(), normalScale: new T.Vector2(.06, .06) }),
      bolt: new T.MeshStandardMaterial({ color: 0xbcc6ce, roughness: .28, metalness: .92, envMapIntensity: 1.4, normalMap: metalNormal(), normalScale: new T.Vector2(.06, .06) })
    };
    ARM_MATS[hex] = o;
    return o;
  }
  /* 一圈法兰螺栓：用实例化，一次 draw call */
  function boltRing(parent, r, y, axis, mat, n) {
    var g = new T.CylinderGeometry(.045, .045, .09, 6);
    var im = new T.InstancedMesh(g, mat, n || 12);
    var d = new T.Object3D();
    for (var i = 0; i < (n || 12); i++) {
      var a = i / (n || 12) * Math.PI * 2;
      if (axis === 'x') { d.position.set(y, Math.sin(a) * r, Math.cos(a) * r); d.rotation.set(0, 0, Math.PI / 2); }
      else if (axis === 'z') { d.position.set(Math.sin(a) * r, Math.cos(a) * r, y); d.rotation.set(Math.PI / 2, 0, 0); }
      else { d.position.set(Math.sin(a) * r, y, Math.cos(a) * r); d.rotation.set(0, 0, 0); }
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    parent.add(im);
    return im;
  }
  /* 波纹管线包：沿臂走一条曲线，带卡箍 */
  function cablePack(parent, pts, mat) {
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    var tube = new T.Mesh(new T.TubeGeometry(curve, 18, .075, 7, false), mat);
    parent.add(tube);
    /* 卡箍 */
    for (var i = 1; i < 5; i++) {
      var p2 = curve.getPoint(i / 5);
      var cl = new T.Mesh(new T.TorusGeometry(.085, .022, 5, 10), mat);
      cl.position.copy(p2); cl.rotation.x = Math.PI / 2; parent.add(cl);
    }
    return tube;
  }

  /* 末端工具：不同工位挂不同工具，设备立刻不单一 */
  function makeTool(kind, m) {
    var g = new T.Group();
    if (kind === 'welder') {
      /* 点焊钳：C 形框架 + 上下电极臂 + 电极帽 + 粗电缆 */
      var frame = new T.Mesh(K.geoRoundBox(.62, .76, .26, .08), m.paint);
      frame.position.y = -.1; g.add(frame);
      [-1, 1].forEach(function (sg) {
        var arm = new T.Mesh(new T.CylinderGeometry(.055, .055, .72, 10), m.steel);
        arm.rotation.z = sg * .16;
        arm.position.set(.24, -.05 + sg * .0, sg * .18);
        arm.rotation.x = Math.PI / 2; g.add(arm);
        var cap = new T.Mesh(new T.CylinderGeometry(.085, .065, .12, 10), m.bolt);
        cap.position.set(.24, -.05, sg * .52); cap.rotation.x = Math.PI / 2; g.add(cap);
      });
      var xf = new T.Mesh(new T.BoxGeometry(.34, .28, .34), m.cast);
      xf.position.set(-.34, .18, 0); g.add(xf);
      cablePack(g, [[-.4, .28, 0], [-.62, .5, .1], [-.7, .8, .2], [-.5, 1.0, .3]], m.dark);
    } else if (kind === 'glue') {
      var gun = new T.Mesh(new T.CylinderGeometry(.10, .16, .78, 14), m.cast);
      gun.position.y = -.32; g.add(gun);
      var nozzle = new T.Mesh(new T.CylinderGeometry(.018, .055, .36, 10), m.steel);
      nozzle.position.y = -.88; g.add(nozzle);
      var hose = cablePack(g, [[0, .08, -.1], [.18, .3, -.22], [.3, .62, -.3], [.22, .9, -.32]], m.dark);
    } else if (kind === 'nut') {
      var spindle = new T.Mesh(new T.CylinderGeometry(.075, .075, .9, 12), m.steel);
      spindle.position.y = -.42; g.add(spindle);
      var sock = new T.Mesh(new T.CylinderGeometry(.12, .12, .2, 12), m.bolt);
      sock.position.y = -.96; g.add(sock);
      var gear = new T.Mesh(new T.CylinderGeometry(.2, .2, .24, 16), m.cast);
      gear.position.y = .08; g.add(gear);
      var led = glowDot(g, .16, .1, .12, 0x48e0a0, .04);
    } else if (kind === 'laser') {
      var hb = new T.Mesh(K.geoRoundBox(.44, .5, .52, .06), m.paint);
      hb.position.y = -.22; g.add(hb);
      var galvo = new T.Mesh(new T.CylinderGeometry(.16, .19, .18, 14), m.steel);
      galvo.position.y = -.55; g.add(galvo);
      var red = glowDot(g, 0, -.66, 0, 0xff4a30, .05);
    } else if (kind === 'vacuum') {
      var bar = new T.Mesh(new T.BoxGeometry(.72, .09, .2), m.cast); g.add(bar);
      [-.28, 0, .28].forEach(function (dx) {
        var cup = new T.Mesh(new T.CylinderGeometry(.12, .16, .18, 12), m.dark);
        cup.position.set(dx, -.16, 0); g.add(cup);
      });
    } else {
      /* 双指伺服夹爪 */
      var cyl = new T.Mesh(K.geoRoundBox(.56, .34, .42, .06), m.cast);
      cyl.position.y = -.1; g.add(cyl);
      var fL = new T.Mesh(K.geoRoundBox(.10, .52, .28, .03), m.steel);
      fL.position.set(-.19, -.5, 0); g.add(fL);
      var fR = new T.Mesh(K.geoRoundBox(.10, .52, .28, .03), m.steel);
      fR.position.set(.19, -.5, 0); g.add(fR);
      var padL = new T.Mesh(new T.BoxGeometry(.12, .16, .3), m.dark);
      padL.position.set(-.19, -.76, 0); g.add(padL);
      var padR = padL.clone(); padR.position.x = .19; g.add(padR);
      g.userData.fL = fL; g.userData.fR = fR;
      var led = glowDot(g, 0, -.02, .23, 0x48e0a0, .035);
    }
    return g;
  }

  /* 按节点把同材质的静态件合并成一个 mesh：
     12 台机器人 × 55 个小件 = 660 个 draw call，核显直接掉到 24fps。
     关节节点各自独立（要旋转），只合并每个节点内部的静态子件。
     统一 toNonIndexed 是因为 indexed / non-indexed 混着 merge 会失败。 */
  function mergeNode(node) {
    if (!T.BufferGeometryUtils || !T.BufferGeometryUtils.mergeBufferGeometries) return;
    var groups = {};
    node.children.slice().forEach(function (c) {
      if (!c.isMesh || c.isInstancedMesh) return;   // Sprite / Group / InstancedMesh 保留
      var key = c.material.uuid;
      if (!groups[key]) groups[key] = { mat: c.material, geos: [] };
      c.updateMatrix();
      var g;
      try { g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); }
      catch (e) { return; }
      g.applyMatrix4(c.matrix);
      /* 属性对齐：只保留 position/normal/uv，多余的（如 uv2）会让 merge 失败 */
      for (var nm in g.attributes) {
        if (nm !== 'position' && nm !== 'normal' && nm !== 'uv') g.deleteAttribute(nm);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        var n = g.attributes.position.count;
        g.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2));
      }
      groups[key].geos.push(g);
      node.remove(c);
    });
    Object.keys(groups).forEach(function (k) {
      var gr = groups[k];
      if (!gr.geos.length) return;
      var merged = gr.geos.length > 1
        ? T.BufferGeometryUtils.mergeBufferGeometries(gr.geos, false) : gr.geos[0];
      if (!merged) {
        gr.geos.forEach(function (g) { node.add(new T.Mesh(g, gr.mat)); });
        return;
      }
      var m = new T.Mesh(merged, gr.mat);
      m.castShadow = true; m.receiveShadow = true;
      node.add(m);
    });
  }

  function makeRobot(cx, cz, id, opt) {
    opt = opt || {};
    var sc = K.scene();
    var hex = opt.color !== undefined ? opt.color : ARM_COLORS[(robots.length) % ARM_COLORS.length];
    var m = armMats(hex);
    var tool = opt.tool || 'grip';
    var R = { cx: cx, cz: cz, sy: FLOOR + .72 + 1.1, id: id, tool: tool };

    /* ---------- 基座：固定，不随 J1 转（收进 base 组，CAD 臂接管时可整体隐藏） ---------- */
    var base = new T.Group();
    base.position.set(cx, FLOOR, cz);
    var plinth = new T.Mesh(new T.CylinderGeometry(1.42, 1.58, .30, 32), m.cast);
    plinth.position.y = .15; base.add(plinth);
    var ring = new T.Mesh(new T.CylinderGeometry(1.60, 1.60, .13, 32), MAT.haz);
    ring.position.y = .34; base.add(ring);
    var collar = new T.Mesh(new T.CylinderGeometry(.92, 1.10, .48, 28), m.paint);
    collar.position.y = .62; base.add(collar);
    boltRing(base, 1.30, .31, 'y', m.bolt, 16);
    var jbox = new T.Mesh(K.geoRoundBox(.42, .34, .28, .04), m.cast);
    jbox.position.set(.95, .46, .62); base.add(jbox);
    var tag = glowDot(base, -.95, .38, .72, 0x4fd8ff, .045);
    tag.mat.emissiveIntensity = 1.6;
    base.name = 'armbase_' + id;
    sc.add(base);
    R.base = base;
    R.robHolder = new T.Group(); R.robHolder.name = 'armhold_' + id; sc.add(R.robHolder);

    /* ---------- J1 转台 ---------- */
    R.rob = new T.Group(); R.rob.position.set(cx, FLOOR + .72, cz);
    var turret = new T.Mesh(new T.CylinderGeometry(.86, .96, .92, 28), m.paint);
    turret.position.y = .46; R.rob.add(turret);
    var turretTop = new T.Mesh(new T.CylinderGeometry(.72, .80, .16, 26), m.cast);
    turretTop.position.y = .98; R.rob.add(turretTop);
    var plate2 = new T.Mesh(new T.PlaneGeometry(.66, .33),
      new T.MeshBasicMaterial({ map: namePlate(robots.length, hex), toneMapped: false }));
    plate2.position.set(0, .46, .90); R.rob.add(plate2);

    /* ---------- J2 肩（pivot 在 rob 局部 y=1.1） ---------- */
    R.jShoulder = new T.Group(); R.jShoulder.position.set(0, 1.10, 0); R.rob.add(R.jShoulder);
    var shBody = new T.Mesh(K.geoRoundBox(1.16, 1.02, 1.30, .18), m.paint);
    shBody.position.y = .06; R.jShoulder.add(shBody);
    /* 肩部减速机：横置大圆筒 + 两端端盖 + 螺栓圈 */
    var shMotor = new T.Mesh(new T.CylinderGeometry(.56, .56, 1.52, 24), m.cast);
    shMotor.rotation.z = Math.PI / 2; shMotor.position.set(0, .06, 0); R.jShoulder.add(shMotor);
    [-1, 1].forEach(function (sg) {
      var cap = new T.Mesh(new T.CylinderGeometry(.44, .50, .14, 22), m.paint);
      cap.rotation.z = Math.PI / 2; cap.position.set(sg * .82, .06, 0); R.jShoulder.add(cap);
      var hub = new T.Mesh(new T.CylinderGeometry(.13, .13, .08, 12), m.steel);
      hub.rotation.z = Math.PI / 2; hub.position.set(sg * .9, .06, 0); R.jShoulder.add(hub);
      boltRing(R.jShoulder, .40, .06, 'x', m.bolt, 10);
    });
    /* 配重 + 示教灯 */
    var cw = new T.Mesh(K.geoRoundBox(.62, .86, .58, .10), m.cast);
    cw.position.set(0, -.22, -.78); R.jShoulder.add(cw);
    var teach = glowDot(R.jShoulder, .58, .52, .0, 0x3fb0ff, .04, 2.6);
    teach.mat.emissiveIntensity = 2.0;

    /* ---------- J3 肘（pivot 在 jShoulder 局部 y=1.2） ---------- */
    R.jElbow = new T.Group(); R.jElbow.position.set(0, 1.20, 0); R.jShoulder.add(R.jElbow);
    var elbowMotor = new T.Mesh(new T.CylinderGeometry(.50, .50, 1.20, 22), m.cast);
    elbowMotor.rotation.z = Math.PI / 2; R.jElbow.add(elbowMotor);
    [-1, 1].forEach(function (sg) {
      var cap = new T.Mesh(new T.CylinderGeometry(.36, .42, .13, 20), m.paint);
      cap.rotation.z = Math.PI / 2; cap.position.set(sg * .66, 0, 0); R.jElbow.add(cap);
      boltRing(R.jElbow, .34, 0, 'x', m.bolt, 10);
    });
    /* 大臂：变截面（下粗上细）+ 两侧筋板 */
    var upper = new T.Mesh(new T.CylinderGeometry(.44, .62, 3.10, 18), m.paint);
    upper.position.y = 1.62; R.jElbow.add(upper);
    var upperFlat = new T.Mesh(K.geoRoundBox(.78, 2.7, .62, .12), m.paint);
    upperFlat.position.y = 1.60; R.jElbow.add(upperFlat);
    /* 特征警示条：黄黑斜纹带，真实工业机械臂（KUKA 等）大臂上的标配，去「通用模型」感 */
    var band = new T.Mesh(new T.CylinderGeometry(.64, .64, .42, 18), MAT.haz);
    band.position.y = 2.35; R.jElbow.add(band);
    [-1, 1].forEach(function (sg) {
      var rib = new T.Mesh(new T.BoxGeometry(.10, 2.5, .50), m.cast);
      rib.position.set(sg * .42, 1.60, -.10); R.jElbow.add(rib);
    });
    /* 波纹管线包：从肩绕到肘，随大臂摆动 */
    cablePack(R.jElbow, [[-.42, .25, -.42], [-.56, 1.0, -.50], [-.52, 2.1, -.48], [-.36, 3.0, -.38]], m.dark);
    cablePack(R.jElbow, [[.42, .25, -.42], [.56, 1.1, -.50], [.52, 2.2, -.48]], m.dark);

    /* ---------- J4/J5/J6 腕（pivot 在 jElbow 局部 y=3.3） ---------- */
    R.jWrist = new T.Group(); R.jWrist.position.set(0, 3.30, 0); R.jElbow.add(R.jWrist);
    var wMotor = new T.Mesh(new T.CylinderGeometry(.40, .40, .92, 20), m.cast);
    wMotor.rotation.z = Math.PI / 2; R.jWrist.add(wMotor);
    boltRing(R.jWrist, .30, 0, 'x', m.bolt, 8);
    var fore = new T.Mesh(new T.CylinderGeometry(.28, .40, 1.70, 18), m.paint);
    fore.position.y = .92; R.jWrist.add(fore);
    var foreFlat = new T.Mesh(K.geoRoundBox(.50, 1.45, .48, .10), m.paint);
    foreFlat.position.y = .92; R.jWrist.add(foreFlat);
    /* J5 摆腕 + J6 法兰 */
    var j5 = new T.Mesh(new T.CylinderGeometry(.26, .26, .56, 16), m.cast);
    j5.rotation.z = Math.PI / 2; j5.position.y = 1.82; R.jWrist.add(j5);
    var j6 = new T.Mesh(new T.CylinderGeometry(.22, .26, .34, 16), m.steel);
    j6.position.y = 2.06; R.jWrist.add(j6);
    boltRing(R.jWrist, .20, 2.20, 'y', m.bolt, 8);
    /* 腕部小线缆 */
    cablePack(R.jWrist, [[.28, .3, -.3], [.34, 1.0, -.3], [.26, 1.7, -.26]], m.dark);

    /* ---------- 工具快换盘 + 末端工具 ---------- */
    R.grip = new T.Group(); R.grip.position.set(0, 2.20, 0); R.jWrist.add(R.grip);
    var qc = new T.Mesh(new T.CylinderGeometry(.30, .30, .12, 18), m.cast);
    R.grip.add(qc);
    boltRing(R.grip, .24, .07, 'y', m.bolt, 8);
    var toolG = makeTool(tool, m);
    toolG.position.y = -.1; R.grip.add(toolG);
    R.toolGroup = toolG;
    R.fingerL = toolG.userData.fL || { position: { x: -.19 }, rotation: { z: 0 } };
    R.fingerR = toolG.userData.fR || { position: { x: .19 }, rotation: { z: 0 } };

    /* 合并静态件（关节节点各自独立，仍能转） */
    [base, R.rob, R.jShoulder, R.jElbow, R.jWrist, R.grip, toolG].forEach(mergeNode);

    R.rob.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    R.robHolder.add(R.rob);   // 挂进 holder：CAD 臂接管时才能整台隐藏
    robots.push(R);
    return R;
  }

  /* 两连杆 IK：关节链 肩→肘 1.2，肘→腕 3.3，腕→抓取面 1.6（L1=1.2, L2=4.9） */
  var L1 = 1.2, L2 = 4.9;
  /* 机械感核心：所有回转/开合都必须限速趋近，不允许任何一帧瞬跳。
     IK_DT 由 upd 每帧刷新（帧率无关的指数趋近） */
  var IK_DT = 1 / 60;
  /* 关节限速趋近：远距离匀速（maxVel rad/s），接近目标按比例减速。
     真实机械臂的回转就是这条速度曲线——绝不允许任何一帧瞬跳 */
  function jog(cur, tgt, maxVel) {
    var d = tgt - cur;
    var step = Math.min(Math.abs(d), maxVel * IK_DT, Math.abs(d) * .12 + .0008);
    return cur + (d >= 0 ? step : -step);
  }
  function solveIK(R, gx, gy, gz, vScale) {
    var dx = gx - R.cx, dz = gz - R.cz;
    var dH = Math.max(.18, Math.sqrt(dx * dx + dz * dz));
    var dy = gy - R.sy;
    var d = Math.sqrt(dH * dH + dy * dy);
    var maxD = L1 + L2 - .06;
    if (d > maxD) { var sc2 = maxD / d; dy *= sc2; d = maxD; }
    d = Math.max(.3, d);
    var cosE = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    cosE = Math.max(-1, Math.min(1, cosE));
    var gamma = Math.acos(cosE);
    var phi = Math.atan2(dy, dH);
    var a2 = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    var th1 = Math.max(.02, Math.min(2.2, phi + a2));
    var tyaw = Math.atan2(dx, dz);
    if (R._yaw === undefined) R._yaw = tyaw;
    var dyaw = tyaw - R._yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    R._yaw = jog(R._yaw, tyaw, 1.15);            /* 基座回转 ≤1.15 rad/s，缓慢有力 */
    R.rob.rotation.y = R._yaw;
    R.jShoulder.rotation.x = Math.PI / 2 - th1;
    R.jElbow.rotation.x = Math.PI - gamma;
    R.jWrist.rotation.x = Math.PI - (R.jShoulder.rotation.x + R.jElbow.rotation.x);
  }
  function setGrip(R, closed) {
    if (!R.fingerL) return;
    var g = closed ? .12 : .36;
    R.fingerL.position.x = jog(R.fingerL.position.x, -g, 1.4);
    R.fingerR.position.x = jog(R.fingerR.position.x, g, 1.4);
  }
  /* 关键帧序列播放：seq = [[t, x, y, z, grip], ...]，t 为 0..1 */
  function playSeq(R, seq, t, ease) {
    var a = seq[0], b = seq[seq.length - 1];
    for (var i = 0; i < seq.length - 1; i++) {
      if (t >= seq[i][0] && t <= seq[i + 1][0]) { a = seq[i]; b = seq[i + 1]; break; }
    }
    var span = Math.max(1e-4, b[0] - a[0]);
    var e = Math.max(0, Math.min(1, (t - a[0]) / span));
    if (ease !== false) e = e < .5 ? 2 * e * e : -1 + (4 - 2 * e) * e;
    var gx = a[1] + (b[1] - a[1]) * e, gy = a[2] + (b[2] - a[2]) * e, gz = a[3] + (b[3] - a[3]) * e;
    var grip = a[4] + (b[4] - a[4]) * e;
    solveIK(R, gx, gy, gz);
    setGrip(R, grip > .5);
    return { x: gx, y: gy, z: gz, grip: grip };
  }

  /* 搬运助手：让零件在 [grab, place] 窗口内被机械臂夹爪「抓着走」，
     而不是在半空做独立 lerp —— 这是「操作太假」的主因。
     rack = 料架世界坐标；bodyLocal = 装好后相对车身的局部坐标；drop = 零件中心到夹爪的落差。*/
  var _gwv = new T.Vector3();
  function carryWith(R, part, t, grab, place, rack, bodyLocal, drop, rotY) {
    drop = drop || 0;
    var ry = rotY || 0;
    var scn = K.scene();
    if (t < grab) {
      if (part.parent !== scn) scn.add(part);
      part.position.set(rack[0], rack[1], rack[2]);
      part.rotation.set(0, ry, 0);
      return;
    }
    if (t < place) {
      if (!R) { part.position.set(rack[0], rack[1], rack[2]); part.rotation.set(0, ry, 0); return; }
      if (part.parent !== scn) scn.add(part);
      R.grip.getWorldPosition(_gwv);
      part.position.set(_gwv.x, _gwv.y - drop, _gwv.z);
      part.rotation.set(0, ry, 0);
      return;
    }
    if (part.parent !== P.body) {
      P.body.add(part);
      part.position.set(bodyLocal[0], bodyLocal[1], bodyLocal[2]);
      part.rotation.set(0, ry, 0);
    }
  }


  /* ---------------- 工业环境细节（真实感 = 信息密度） ---------------- */

  /* 安全围栏：网格用 alphaMap，比堆几百根细杆便宜得多 */
  var _fenceTex = null;
  function fenceTex() {
    if (_fenceTex) return _fenceTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
    for (var i = 0; i <= 128; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(10, 2.5);
    _fenceTex = t; return t;
  }
  function fenceRun(x1, z1, x2, z2, h) {
    var sc = K.scene();
    var dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.round(len / 2.6));
    var H2 = h || 2.5;
    var ang = -Math.atan2(dz, dx);
    var panel = new T.Mesh(new T.PlaneGeometry(len, H2),
      new T.MeshBasicMaterial({
        color: 0x63788a, alphaMap: fenceTex(), transparent: true, opacity: .72,
        side: T.DoubleSide, depthWrite: false
      }));
    panel.position.set((x1 + x2) / 2, FLOOR + H2 / 2, (z1 + z2) / 2);
    panel.rotation.y = ang;
    K.scene().add(panel);
    /* 上下框 + 立柱 */
    [0, H2].forEach(function (hy) {
      var rail = new T.Mesh(new T.BoxGeometry(len, .09, .09), MAT.safety);
      rail.position.set((x1 + x2) / 2, FLOOR + hy, (z1 + z2) / 2);
      rail.rotation.y = ang; sc.add(rail);
    });
    for (var i2 = 0; i2 <= n; i2++) {
      var k = i2 / n;
      var post = new T.Mesh(new T.BoxGeometry(.13, H2 + .25, .13), MAT.graphite);
      post.position.set(x1 + dx * k, FLOOR + (H2 + .25) / 2, z1 + dz * k);
      sc.add(post);
      if (i2 % 3 === 0) {
        var foot = new T.Mesh(new T.BoxGeometry(.32, .08, .32), MAT.steel);
        foot.position.set(x1 + dx * k, FLOOR + .04, z1 + dz * k); sc.add(foot);
      }
    }
  }

  /* 控制柜：门缝 / 屏幕 / 指示灯列 / 散热格栅 / 把手 / 顶灯 */
  function controlCabinet(x, z, col) {
    var sc = K.scene();
    var body = K.rbox({ x: x, y: FLOOR + 1.15, z: z, sx: 1.25, sy: 2.3, sz: .85, r: .06, mat: MAT.shellD });
    body.castShadow = true;
    var door = K.rbox({ x: x, y: FLOOR + 1.15, z: z + .44, sx: 1.12, sy: 2.14, sz: .05, r: .04, mat: MAT.shellL });
    /* 屏幕 */
    var scr = makeScreen(.62, .40);
    scr.mesh.position.set(x - .18, FLOOR + 1.75, z + .475); sc.add(scr.mesh);
    scr.show('AUTO', '#4fe0a0', 'READY');
    /* 指示灯列 */
    [0, 1, 2].forEach(function (i) {
      var led = glowDot(sc, x + .38, FLOOR + 1.85 - i * .16, z + .48,
        [0x35c072, 0xf0b32e, 0x4fd8ff][i], .045);
      led.mat.emissiveIntensity = i === 0 ? 2.4 : .8;
    });
    /* 散热格栅 */
    for (var g2 = 0; g2 < 2; g2++) {
      var gr = new T.Mesh(new T.BoxGeometry(.7, .025, .02), MAT.dark);
      gr.position.set(x - .15, FLOOR + .45 + g2 * .12, z + .475); sc.add(gr);
    }
    var hd = new T.Mesh(new T.BoxGeometry(.05, .30, .06), MAT.steel);
    hd.position.set(x + .46, FLOOR + 1.05, z + .49); sc.add(hd);
    /* 柜顶警示灯 */
    var tl = glowDot(sc, x, FLOOR + 2.36, z, col || 0x35c072, .075);
    tl.mat.emissiveIntensity = 2.0;
    return scr;
  }

  /* 周转料箱：带棱纹，堆叠 */
  function partsBin(x, y, z, col) {
    var sc = K.scene();
    var b = new T.Mesh(new T.BoxGeometry(1.0, .58, .72),
      new T.MeshStandardMaterial({ color: col, roughness: .68, metalness: .08, roughnessMap: grainTex(64, .5, .3, 2) }));
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; sc.add(b);
    var lip = new T.Mesh(new T.BoxGeometry(1.02, .035, .74), MAT.dark);
    lip.position.set(x, y - .18, z); sc.add(lip);
    return b;
  }

  /* EMS 空中悬挂输送：工字钢轨道 + 吊具 + 走轮 */
  function buildEMS() {
    var sc = K.scene();
    var TY = CEIL - 1.5;
    [-1, 1].forEach(function (sg) {
      var rail = new T.Mesh(new T.BoxGeometry(96, .22, .16), MAT.steel);
      rail.position.set(0, TY, BELT_Z + sg * 1.15); sc.add(rail);
      var web = new T.Mesh(new T.BoxGeometry(96, .38, .06), MAT.graphite);
      web.position.set(0, TY + .22, BELT_Z + sg * 1.15); sc.add(web);
    });
    /* 吊架 */
    for (var hx = -46; hx <= 46; hx += 11.5) {
      var h = new T.Mesh(new T.BoxGeometry(.1, 1.1, .1), MAT.graphite);
      h.position.set(hx, TY + .65, BELT_Z); sc.add(h);
      var cross = new T.Mesh(new T.BoxGeometry(.1, .1, 2.4), MAT.graphite);
      cross.position.set(hx, TY, BELT_Z); sc.add(cross);
    }
    /* 空吊具：C 形夹爪，挂在轨道上 */
    O.emsCarriers = [];
    [-34, -6, 22].forEach(function (ex, i) {
      var g = new T.Group(); g.position.set(ex, TY - .3, BELT_Z);
      var bogie = new T.Mesh(new T.BoxGeometry(.9, .28, 2.5), MAT.graphite); g.add(bogie);
      [-1, 1].forEach(function (sg) {
        var arm = new T.Mesh(new T.BoxGeometry(.18, 2.6, .18), MAT.steel);
        arm.position.set(0, -1.5, sg * 1.05); g.add(arm);
        var hook = new T.Mesh(new T.BoxGeometry(.55, .18, .18), MAT.orange);
        hook.position.set(0, -2.75, sg * 1.05); g.add(hook);
      });
      var led = glowDot(g, 0, .2, 0, 0x4fd8ff, .06);
      led.mat.emissiveIntensity = 1.6;
      sc.add(g); O.emsCarriers.push({ g: g, home: ex, ph: i * 1.8 });
    });
  }

  /* 焊装机器人岛：4 台点焊机器人围一套夹具，带弧光火花 */
  function buildWeldCell() {
    var sc = K.scene();
    var cx = -56, cz = -13;
    /* 夹具平台 */
    var jig = new T.Mesh(new T.BoxGeometry(6.4, .45, 4.2), MAT.graphite);
    jig.position.set(cx, FLOOR + .5, cz); jig.castShadow = true; sc.add(jig);
    /* 定位夹具：四个立柱 + 横梁 */
    [[-3.3, -2.0], [3.3, -2.0], [-3.3, 2.0], [3.3, 2.0]].forEach(function (p) {
      var c = new T.Mesh(new T.CylinderGeometry(.14, .18, 1.4, 10), MAT.steel);
      c.position.set(cx + p[0], FLOOR + 1.2, cz + p[1]); sc.add(c);
      var clamp = new T.Mesh(new T.BoxGeometry(.5, .12, .3), MAT.safety);
      clamp.position.set(cx + p[0], FLOOR + 1.95, cz + p[1]); sc.add(clamp);
    });
    /* 白车身骨架（焊接中的侧围） */
    var side = new T.Mesh(new T.BoxGeometry(4.6, 1.2, .12), MAT.carPaint);
    side.position.set(cx, FLOOR + 1.5, cz - .2); side.castShadow = true; sc.add(side);
    var side2 = side.clone(); side2.position.z = cz + .2; sc.add(side2);
    O.weldArms = [];
    var spots = [[-3.4, -3.0], [3.4, -3.0], [-3.4, 3.0], [3.4, 3.0]];
    spots.forEach(function (p, i) {
      var R = makeRobot(cx + p[0], cz + p[1], 'weld' + i,
        { color: [0xf2b600, 0xff6a13, 0x2b6cb0, 0xc33b2e][i], tool: 'welder' });
      O.weldArms.push(R);
    });
    /* 点焊火花：每台的焊钳处一组闪动 sprite */
    O.sparks = [];
    for (var s2 = 0; s2 < 4; s2++) {
      var grp = new T.Group();
      for (var k = 0; k < 7; k++) {
        var sp = new T.Sprite(new T.SpriteMaterial({
          map: glowTex(), color: k % 2 ? 0xffd070 : 0xfff4d0,
          transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false
        }));
        sp.scale.set(.18 + Math.random() * .22, .18 + Math.random() * .22, 1);
        sp.position.set((Math.random() - .5) * .7, (Math.random() - .5) * .5, (Math.random() - .5) * .5);
        grp.add(sp);
      }
      grp.position.set(cx + (s2 % 2 ? 1.4 : -1.4), FLOOR + 1.6, cz + (s2 > 1 ? 1.2 : -1.2));
      sc.add(grp);
      O.sparks.push({ g: grp, ph: s2 * 1.3 });
    }
    /* 围栏把焊装岛圈起来 */
    fenceRun(cx - 5.2, cz - 4.6, cx + 5.2, cz - 4.6, 2.7);
    fenceRun(cx - 5.2, cz + 4.6, cx + 5.2, cz + 4.6, 2.7);
    fenceRun(cx - 5.2, cz - 4.6, cx - 5.2, cz + 4.6, 2.7);
    return { cx: cx, cz: cz };
  }

  /* 沿线的设备层：围栏 / 控制柜 / 料箱 / 桥架 / 地面油污 */
  function buildPlantDetail() {
    var sc = K.scene();
    /* 机器人侧围栏：把自动化区围起来，真机上一定有 */
    fenceRun(PX.strip - 6, ROB_Z - 5.1, PX.dress + 6, ROB_Z - 5.1, 2.4);
    /* 控制柜：每个工位一组两个 */
    Object.keys(PX).forEach(function (k, i) {
      controlCabinet(PX[k] - 5.4, -11.2, i % 3 === 0 ? 0xf0b32e : 0x35c072);
      if (i % 2 === 0) controlCabinet(PX[k] - 4.3, -11.2, 0x4fd8ff);
    });
    /* 料箱堆 */
    var binColors = [0x2f6099, 0xb8822a, 0x3d8f6a, 0x8c4a3a];
    for (var b = 0; b < 14; b++) {
      var bx = PX.strip + b * 6.2, bz = -12.6 + (b % 3) * .8;
      partsBin(bx, FLOOR + .34, bz, binColors[b % 4]);
      if (b % 3 === 0) partsBin(bx, FLOOR + .95, bz, binColors[(b + 1) % 4]);
    }
    /* 电缆桥架：产线上方沿 X 走，带吊筋 */
    var tray = new T.Mesh(new T.BoxGeometry(100, .18, .9), MAT.graphite);
    tray.position.set(0, FLOOR + 7.2, -12.0); sc.add(tray);
    for (var tx = -48; tx <= 48; tx += 8) {
      var hg = new T.Mesh(new T.BoxGeometry(.08, 1.2, .08), MAT.graphite);
      hg.position.set(tx, FLOOR + 7.9, -12.0); sc.add(hg);
    }
    /* 地面油污/修补痕：暗色不规则贴片，打破「刚拖过的地」的塑料感 */
    var oilTex = glowTex();
    for (var o = 0; o < 10; o++) {
      var ox = PX.in + o * 10 + Math.random() * 4, oz = -2 + (Math.random() - .5) * 8;
      var oil = new T.Mesh(new T.PlaneGeometry(2.4 + Math.random() * 3, 1.2 + Math.random() * 2),
        new T.MeshBasicMaterial({ map: oilTex, color: 0x0a0f14, transparent: true, opacity: .34, depthWrite: false }));
      oil.rotation.x = -Math.PI / 2; oil.position.set(ox, FLOOR + .02, oz);
      oil.renderOrder = 1; sc.add(oil);
    }
    /* 地脚螺栓阵列：42 个小 mesh 合成一个 InstancedMesh */
    var boltGeo = new T.CylinderGeometry(.055, .055, .04, 6);
    var boltInst = new T.InstancedMesh(boltGeo, MAT.rim, 42);
    var bd = new T.Object3D(), bi = 0;
    for (var fx = -50; fx <= 50; fx += 5) {
      [-1.7, 1.7].forEach(function (fz) {
        bd.position.set(fx, FLOOR + .02, fz); bd.updateMatrix();
        if (bi < 42) boltInst.setMatrixAt(bi++, bd.matrix);
      });
    }
    boltInst.count = bi; sc.add(boltInst);
  }

  /* ---------------- 总装工位 ---------------- */

  /* 通用：工位标牌 + 三色灯 + 地面光池 */
  function stationCommon(x, key, color, name) {
    /* 塔灯必须从地面立起来：之前灯杆悬在 FLOOR+7.4 的半空，是最大的「假」 */
    var px2 = x - 3.0, pz2 = BELT_Z - 3.2;
    var foot = new T.Mesh(new T.CylinderGeometry(.42, .5, .12, 14), MAT.graphite);
    foot.position.set(px2, FLOOR + .06, pz2); K.scene().add(foot);
    /* 细杆(.075)在暗处几乎不可见，灯头看着就像悬在半空 —— 加粗 + 双斜撑 + 配重箱 */
    var pole = new T.Mesh(new T.CylinderGeometry(.10, .15, 7.5, 10), MAT.steel);
    pole.position.set(px2, FLOOR + 3.75, pz2); pole.castShadow = true; K.scene().add(pole);
    [[2.0, .95, .34], [4.6, .70, .26]].forEach(function (bp) {
      var brace = new T.Mesh(new T.BoxGeometry(bp[1], .08, .08), MAT.steel);
      brace.position.set(px2 + bp[2] * 1.35, FLOOR + bp[0], pz2);
      brace.rotation.z = -.34; brace.castShadow = true; K.scene().add(brace);
    });
    var wbox = new T.Mesh(K.geoRoundBox(.95, .85, .65, .06), MAT.graphite);
    wbox.position.set(px2 + 1.0, FLOOR + .45, pz2); wbox.castShadow = true; K.scene().add(wbox);
    var joint = new T.Mesh(new T.CylinderGeometry(.15, .19, .55, 10), MAT.graphite);
    joint.position.set(px2, FLOOR + 7.35, pz2); K.scene().add(joint);
    makeTower(px2, FLOOR + 7.5, pz2, key);
    glowDecal(x, BELT_Z + 2.0, 4.6, color, .075, 1.6, .9);
  }

  /* 工位看板：夹在工位灯杆上，正面朝产线一侧。
     之前是四块黑屏悬在半空（FLOOR+5.4），有的还正好压在第二台机器人的大臂上，
     拆门工位那根立杆更是直接从屏面中间穿出去——所以又穿模又别扭。 */
  function stationBoard(rec, poleX, y) {
    var sc = K.scene();
    var zPole = BELT_Z - 3.2;          /* 与 stationCommon 的灯杆同一条竖线 */
    var bx = poleX + 1.16;             /* 屏挑到杆的一侧：压在杆上会看着像被杆穿过 */
    var z = zPole + .34;
    var g = rec.mesh.geometry.parameters;
    var w = g.width, h = g.height;
    var back = K.rbox({
      x: bx, y: FLOOR + y, z: z - .07, sx: w + .16, sy: h + .16, sz: .12,
      r: .03, mat: MAT.graphite
    });
    back.castShadow = true;
    rec.mesh.position.set(bx, FLOOR + y, z + .005);
    sc.add(rec.mesh);
    /* 抱箍（卡在灯杆上）+ 悬臂（把屏挑出去），屏才有"被固定"的交代 */
    var clamp = K.box({ x: poleX, y: FLOOR + y, z: zPole, sx: .34, sy: .34, sz: .20, mat: MAT.steel });
    clamp.castShadow = true;
    var arm = K.box({
      x: (poleX + bx) / 2, y: FLOOR + y, z: zPole + .17,
      sx: bx - poleX - .16, sy: .10, sz: .10, mat: MAT.steel
    });
    arm.castShadow = true;
  }

  /* 1) 涂装来车：隧道口 */
  function buildInbound() {
    var sc = K.scene(), x = PX.in;
    var frame = MAT.graphite;
    /* 门洞外框 */
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: x, y: FLOOR + 4.0, z: BELT_Z + sg * 2.3, sx: .7, sy: 8.0, sz: .7, r: .08, mat: frame }).castShadow = true;
    });
    K.rbox({ x: x, y: FLOOR + 8.2, z: BELT_Z, sx: .7, sy: .7, sz: 5.3, r: .08, mat: frame }).castShadow = true;
    /* 门洞后是一条「看得进去」的通道：两片侧墙 + 顶板 + 尽端发光帘。
       之前用 BackSide 封闭大盒，从外面看它就是一堵实心黑墙 */
    var tunMat = new T.MeshStandardMaterial({ color: 0x1a2129, roughness: .85, metalness: .15 });
    [-1, 1].forEach(function (sg) {
      var side = new T.Mesh(new T.BoxGeometry(5.6, 7.2, .3), tunMat);
      side.position.set(x - 3.2, FLOOR + 3.7, BELT_Z + sg * 2.45);
      side.receiveShadow = true; sc.add(side);
    });
    var top = new T.Mesh(new T.BoxGeometry(5.6, .3, 5.2), tunMat);
    top.position.set(x - 3.2, FLOOR + 7.5, BELT_Z); sc.add(top);
    /* 尽端的发光帘：通道里的光源 */
    var curtain = new T.Mesh(new T.PlaneGeometry(4.6, 6.6),
      new T.MeshBasicMaterial({ color: 0x35608a, toneMapped: false }));
    curtain.position.set(x - 5.85, FLOOR + 3.8, BELT_Z); curtain.rotation.y = Math.PI / 2;
    sc.add(curtain);
    /* 通道地面反光 */
    var floorGlow = new T.Mesh(new T.PlaneGeometry(5.4, 4.4),
      new T.MeshBasicMaterial({ map: glowTex(), color: 0x8fc4e8, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false }));
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(x - 3.4, FLOOR + .04, BELT_Z); sc.add(floorGlow);
    /* 门洞的光：隧道里唯一亮的东西 */
    var glowP = new T.Mesh(new T.PlaneGeometry(4.4, 6.4),
      new T.MeshBasicMaterial({ color: 0x2a4a63, toneMapped: false }));
    glowP.position.set(x - .55, FLOOR + 4.1, BELT_Z); glowP.rotation.y = Math.PI / 2; sc.add(glowP);
    var lb = ledStrip(.1, 6.2, .1, 0x6fd0ff, 1, null);
    lb.position.set(x + .02, FLOOR + 7.2, BELT_Z);
    stationCommon(x, 'in', 0x6fd0ff);
  }

  /* 2) 拆门工位：机器人 + 车门分装支线 */
  function buildStrip() {
    var sc = K.scene(), x = PX.strip;
    O.Rstrip = makeRobot(x, -3.8, 'strip', { color: ARM_COLORS[0], tool: 'vacuum' });
    /* 同工位的第二台：不同品牌 / 不同末端，机器人不是复制粘贴 */
    O.Rstrip2 = makeRobot(x + 3.4, -3.0, 'strip2', { color: ARM_COLORS[4], tool: 'welder' });
    /* 车门分装支线（车后侧，z=-12）：4 个挂架 + 一条短输送 */
    /* 门架贴着机器人放（臂展 6.1），否则「机器人放门」的戏是假的 */
    var base = K.rbox({ x: x - 1.2, y: FLOOR + .5, z: -8.4, sx: 5.4, sy: 1.0, sz: 2.2, r: .1, mat: MAT.shellD });
    base.castShadow = true;
    O.doorRack = [];
    var rackPos = [[-3.0, -7.6], [-1.3, -7.6], [0.4, -7.6], [2.1, -7.6]];
    for (var i = 0; i < 4; i++) {
      var rx = x + rackPos[i][0], rz = rackPos[i][1];
      var post = K.rbox({ x: rx, y: FLOOR + 2.4, z: rz, sx: .18, sy: 2.8, sz: .18, r: .04, mat: MAT.graphite });
      post.castShadow = true;
      var d = makeDoor(i % 2 ? 1 : -1, i < 2);
      d.position.set(rx, FLOOR + 1.05, rz + .40);
      d.rotation.y = Math.PI / 2;
      K.scene().add(d);
      O.doorRack.push(d);
      var hk = new T.Mesh(new T.BoxGeometry(.5, .06, .06), MAT.steel);
      hk.position.set(rx, FLOOR + 1.95, rz + .3); K.scene().add(hk);
      var l = glowDot(sc, rx, FLOOR + 1.0, rz - .5, 0x4fd8ff, .04);
      l.mat.emissiveIntensity = 1.4;
    }
    /* 顶部横梁：把 4 根立柱连成「门储存架」，门是挂上去的，不悬空 */
    var railX0 = x + rackPos[0][0] - .9, railX1 = x + rackPos[3][0] + .9;
    var rail = K.rbox({ x: (railX0 + railX1) / 2, y: FLOOR + 2.6, z: -7.6, sx: (railX1 - railX0), sy: .16, sz: .16, r: .04, mat: MAT.graphite });
    rail.castShadow = true; K.scene().add(rail);
    /* 每扇门顶到横梁的吊臂：门（高 .88）顶在 FLOOR+1.93，吊臂下端必须落到门顶，
       太高就成了「门悬空、吊臂够不着」 */
    for (var ri = 0; ri < 4; ri++) {
      var rrx = x + rackPos[ri][0];
      var arm = new T.Mesh(new T.BoxGeometry(.10, .62, .10), MAT.steel);
      arm.position.set(rrx, FLOOR + 2.24, -7.6 + .30); K.scene().add(arm);
    }
    O.stripScreen = makeScreen(1.5, .95);
    stationBoard(O.stripScreen, x - 3.0, 4.55);
    stationCommon(x, 'strip', 0x4fd8ff);
  }

  /* 3) 仪表台工位 */
  function buildCockpit() {
    var sc = K.scene(), x = PX.ip;
    O.Rip = makeRobot(x, ROB_Z, 'ip', { color: ARM_COLORS[1], tool: 'grip' });
    O.Rip2 = makeRobot(x + 3.2, -3.0, 'ip2', { color: ARM_COLORS[3], tool: 'glue' });
    /* 料架：两个仪表台总成 */
    K.rbox({ x: x - 4.2, y: FLOOR + 1.2, z: -3.0, sx: 2.4, sy: 2.4, sz: 2.0, r: .08, mat: MAT.shellD }).castShadow = true;
    O.cockpitRack = [];
    for (var i = 0; i < 2; i++) {
      var c = makeCockpit();
      c.position.set(x - 4.2, FLOOR + 2.5 + i * .55, -3.0);
      c.rotation.y = -Math.PI / 2;
      K.scene().add(c);
      O.cockpitRack.push(c);
    }
    O.ipScreen = makeScreen(1.4, .9);
    stationBoard(O.ipScreen, x - 3.0, 4.75);
    stationCommon(x, 'ip', 0x6fd0ff);
  }

  /* 4) 座椅工位 */
  function buildSeat() {
    var sc = K.scene(), x = PX.seat;
    O.Rseat = makeRobot(x, ROB_Z, 'seat', { color: ARM_COLORS[2], tool: 'grip' });
    O.Rseat2 = makeRobot(x + 3.4, -3.0, 'seat2', { color: ARM_COLORS[0], tool: 'nut' });
    K.rbox({ x: x - 4.0, y: FLOOR + 1.0, z: -2.8, sx: 2.2, sy: 2.0, sz: 2.2, r: .08, mat: MAT.shellD }).castShadow = true;
    O.seatRack = [];
    for (var i = 0; i < 3; i++) {
      var st3 = makeSeat();
      st3.position.set(x - 4.0 + (i - 1) * .0, FLOOR + 2.0 + i * .02, -2.8 + (i - 1) * 1.0);
      st3.rotation.y = 0;
      st3.scale.setScalar(.70);
      K.scene().add(st3);
      O.seatRack.push(st3);
    }
    /* 悬挂拧紧枪：每个座椅 4 颗螺栓 */
    var armG = new T.Group(); armG.position.set(x + 1.6, FLOOR + 6.2, BELT_Z - 1.4);
    var p1 = new T.Mesh(new T.BoxGeometry(.16, .16, 1.6), MAT.graphite); p1.position.z = .8; armG.add(p1);
    var tool = new T.Mesh(new T.CylinderGeometry(.10, .13, 1.5, 12), MAT.orange);
    tool.position.set(0, -.85, 1.5); armG.add(tool);
    var tip = new T.Mesh(new T.CylinderGeometry(.05, .05, .35, 8), MAT.steel);
    tip.position.set(0, -1.65, 1.5); armG.add(tip);
    sc.add(armG); O.gunArm = armG;
    O.seatScreen = makeScreen(1.4, .9);
    stationBoard(O.seatScreen, x - 3.0, 4.45);
    stationCommon(x, 'seat', 0xffb060);
  }

  /* 5) 底盘合装：动力总成从地坑升起，车身下降到合装高度 */
  function buildMarry() {
    var sc = K.scene(), x = PX.marry;
    /* 地坑 */
    var pit = new T.Mesh(new T.BoxGeometry(6.2, 2.6, 4.0),
      new T.MeshStandardMaterial({ color: 0x05080b, roughness: .96, metalness: .08 }));
    pit.position.set(x, FLOOR - 1.32, BELT_Z); sc.add(pit);
    /* 坑壁：四条内侧立面，有深度才像坑 */
    [[0, -2.0, 6.2, .1], [0, 2.0, 6.2, .1], [-3.1, 0, .1, 4.0], [3.1, 0, .1, 4.0]].forEach(function (w) {
      var wall = new T.Mesh(new T.BoxGeometry(w[2], 2.6, w[3]), MAT.graphite);
      wall.position.set(x + w[0], FLOOR - 1.32, BELT_Z + w[1]); sc.add(wall);
    });
    /* 地坑边沿（黄黑警示） */
    [[0, -2.2], [0, 2.2]].forEach(function (p) {
      var edge = new T.Mesh(new T.BoxGeometry(6.6, .12, .22), MAT.haz);
      edge.position.set(x + p[0], FLOOR + .05, BELT_Z + p[1]); sc.add(edge);
    });
    [-3.3, 3.3].forEach(function (dx) {
      var edge2 = new T.Mesh(new T.BoxGeometry(.22, .12, 4.4), MAT.haz);
      edge2.position.set(x + dx, FLOOR + .05, BELT_Z); sc.add(edge2);
    });
    /* 举升台：动力总成放在上面。发动机对准前轮拱（局部 x≈1.6），
       台子跟着前移，不然「举升台托着动力总成」对不上位。 */
    O.liftTable = new T.Group();
    O.liftTable.position.set(x + 1.0, FLOOR - .9, BELT_Z);
    var deck = new T.Mesh(new T.BoxGeometry(5.0, .2, 3.4), MAT.steel);
    O.liftTable.add(deck);
    var sc2 = new T.Mesh(new T.BoxGeometry(4.6, .5, .5), MAT.graphite);
    sc2.position.y = -.4; O.liftTable.add(sc2);
    sc.add(O.liftTable);
    O.powertrain = makePowertrain();
    /* 缩到 .70 并对准前轮拱空腔（r=.44，腔顶 .78）：最终顶 .63 < .78、
       底部停在滑板顶面之上 —— 不再顶穿实心底板。 */
    O.powertrain.scale.setScalar(.70);
    O.powertrain.position.set(x + 1.60, 0, BELT_Z);
    K.scene().add(O.powertrain);
    /* 四根导向柱 */
    [[-3.3, -2.0], [3.3, -2.0], [-3.3, 2.0], [3.3, 2.0]].forEach(function (p) {
      var col = new T.Mesh(new T.CylinderGeometry(.10, .10, 3.6, 10), MAT.steel);
      col.position.set(x + p[0], FLOOR + 1.8, BELT_Z + p[1]); sc.add(col);
    });
    /* 安全光幕（合装区四周） */
    [[0, -2.5, 6.8], [0, 2.5, 6.8]].forEach(function (p) {
      var curt = new T.Mesh(new T.PlaneGeometry(p[2], 3.2),
        new T.MeshBasicMaterial({ color: 0x3fd0a0, transparent: true, opacity: .025, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
      curt.position.set(x + p[0], FLOOR + 1.8, BELT_Z + p[1]); sc.add(curt);
    });
    stationCommon(x, 'marry', 0x3fd0a0);
  }

  /* 6) 轮胎工位：四个轮位各一台拧紧机 */
  function buildTire() {
    var sc = K.scene(), x = PX.tire;
    O.tireGuns = [];
    [[1.50, -1.05], [1.50, 1.05], [-1.45, -1.05], [-1.45, 1.05]].forEach(function (p, i) {
      var gx = x + p[0], gz = BELT_Z + p[1] * 1.15;
      /* 立柱 + 横臂 + 拧紧轴。横臂高度必须落在轮心：
         原来挂在 FLOOR+4.2，套筒比轮毂高 1.7 米，等于「拧空气」 */
      var post = new T.Mesh(new T.BoxGeometry(.22, 4.4, .22), MAT.graphite);
      post.position.set(gx, FLOOR + 2.2, gz + (p[1] > 0 ? 1.5 : -1.5)); post.castShadow = true; sc.add(post);
      var armG = new T.Group();
      armG.position.set(gx, FLOOR + 2.16, gz + (p[1] > 0 ? 1.5 : -1.5));
      /* 立柱上的滑座：让横臂有「装在柱子上」的支点 */
      var carr = new T.Mesh(new T.BoxGeometry(.23, .38, .23), MAT.graphite);
      carr.position.y = 0; armG.add(carr);
      var arm = new T.Mesh(new T.BoxGeometry(.15, .15, 1.5), MAT.orange);
      arm.position.z = p[1] > 0 ? -.75 : .75; armG.add(arm);
      var head = new T.Mesh(new T.CylinderGeometry(.055, .055, .42, 12), MAT.machined);
      head.rotation.x = Math.PI / 2;
      head.position.set(0, -.0, p[1] > 0 ? -1.5 : 1.5); armG.add(head);
      var sock = new T.Mesh(new T.CylinderGeometry(.055, .055, .32, 6), MAT.steel);
      sock.position.set(0, 0, p[1] > 0 ? -1.82 : 1.82); armG.add(sock);
      sc.add(armG);
      /* 扭矩灯 */
      var tl = glowDot(sc, gx, FLOOR + 4.55, gz + (p[1] > 0 ? 1.5 : -1.5), 0x48e0a0, .06);
      O.tireGuns.push({ g: armG, light: tl, phase: i, head: head, sock: sock });
    });
    /* 近侧前轮立柱上的小扭矩数显：镜头推到轮毂时，110 N·m 仍读得到 */
    O.tireGunScreen = makeScreen(1.0, .6);
    O.tireGunScreen.mesh.position.set(x + 1.5, FLOOR + 3.55, BELT_Z + 2.92);
    sc.add(O.tireGunScreen.mesh);
    K.rbox({ x: x + 1.5, y: FLOOR + 3.55, z: BELT_Z + 2.83, sx: 1.05, sy: .66, sz: .07, r: .04, mat: MAT.graphite });
    O.tireGunScreen.show('—', '#3f8fa8', 'N·m · 5 螺母');
    /* 轮胎料架 */
    K.rbox({ x: x - 3.4, y: FLOOR + .9, z: -4.2, sx: 3.0, sy: 1.8, sz: 2.4, r: .08, mat: MAT.shellD }).castShadow = true;
    O.tireRack = [];
    for (var i2 = 0; i2 < 4; i2++) {
      var wh = makeWheel();
      wh.position.set(x - 4.2 + (i2 % 2) * 1.5, FLOOR + 1.9, -4.2 + (i2 < 2 ? -.6 : .6));
      wh.rotation.z = Math.PI / 2;
      wh.scale.setScalar(.98);
      K.scene().add(wh);
      O.tireRack.push(wh);
    }
    O.tireScreen = makeScreen(1.6, 1.0);
    stationBoard(O.tireScreen, x - 3.0, 4.75);
    stationCommon(x, 'tire', 0x6fd0ff);
  }

  /* 7) 车门回装 */
  function buildDress() {
    var sc = K.scene(), x = PX.dress;
    O.Rdress = makeRobot(x, -3.8, 'dress', { color: ARM_COLORS[3], tool: 'grip' });
    O.Rdress2 = makeRobot(x + 3.2, -3.0, 'dress2', { color: ARM_COLORS[5], tool: 'laser' });
    K.rbox({ x: x - .8, y: FLOOR + .6, z: -9.3, sx: 3.4, sy: 1.2, sz: 2.4, r: .08, mat: MAT.shellD }).castShadow = true;
    O.dressRack = [];
    for (var i = 0; i < 2; i++) {
      var d = makeDoor(i ? 1 : -1, true);
      d.position.set(x - 1.7 + i * 1.9, FLOOR + 1.25, -8.9);
      d.rotation.y = Math.PI / 2;
      K.scene().add(d); O.dressRack.push(d);
    }
    stationCommon(x, 'dress', 0x4fd8ff);
  }

  /* 8) 检测下线：灯光隧道 + 四轮定位滚筒 */
  function buildOut() {
    var sc = K.scene(), x = PX.out;
    /* 灯光检测隧道：两侧是「一排灯管」，不是一块发光白板——
       整面白墙会把车挡死，也读不出「灯」 */
    [-1, 1].forEach(function (sg) {
      var post;
      [-3.0, 0, 3.0].forEach(function (dx) {
        post = new T.Mesh(new T.BoxGeometry(.16, 3.6, .16), MAT.graphite);
        post.position.set(x + dx, FLOOR + 2.0, BELT_Z + sg * 3.4); K.scene().add(post);
      });
      for (var i = 0; i < 5; i++) {
        var tube = new T.Mesh(new T.BoxGeometry(5.8, .1, .1),
          new T.MeshStandardMaterial({ color: 0xe8f2fa, emissive: 0xdce8f4, emissiveIntensity: 2.2, roughness: .5 }));
        tube.position.set(x, FLOOR + .55 + i * .78, BELT_Z + sg * 3.4);
        K.scene().add(tube);
      }
    });
    /* 顶部横梁 + 检测相机 */
    K.rbox({ x: x, y: FLOOR + 5.0, z: BELT_Z, sx: .5, sy: .5, sz: 7.0, r: .06, mat: MAT.graphite }).castShadow = true;
    O.outCam = new T.Group(); O.outCam.position.set(x, FLOOR + 4.6, BELT_Z);
    var cb = new T.Mesh(K.geoRoundBox(.6, .5, .7, .06), MAT.shellL); O.outCam.add(cb);
    var cl = new T.Mesh(new T.CylinderGeometry(.16, .18, .3, 12), MAT.dark);
    cl.position.y = -.4; O.outCam.add(cl);
    sc.add(O.outCam);
    /* 四轮定位滚筒（检测时由滚筒带动车轮，upd 里驱动旋转） */
    O.rollers = [];
    [-1.45, 1.50].forEach(function (rx) {
      [-1, 1].forEach(function (sg) {
        var roll = new T.Mesh(new T.CylinderGeometry(.16, .16, .9, 12), MAT.steel);
        roll.rotation.x = Math.PI / 2;
        roll.position.set(x + rx, BELT_Y - .12, BELT_Z + sg * 1.05);
        sc.add(roll); O.rollers.push(roll);
      });
    });
    O.outScreen = makeBoard(9, 5.1);
    O.outScreen.mesh.position.set(x + 1.0, FLOOR + 8.6, BELT_Z - 6.4);
    sc.add(O.outScreen.mesh);
    var bf = new T.Mesh(new T.BoxGeometry(9.6, 5.6, .3), MAT.graphite);
    bf.position.set(x + 1.0, FLOOR + 8.6, BELT_Z - 6.6); sc.add(bf);

    /* 下线坡道：楔形斜面从滑板顶面落到厂区地面 —— 下线车沿坡驶下，
       而不是从产线高度凭空掉下去 */
    var RL = 13.0, RH = BELT_Y - FLOOR;   // 12% 坡度（≈7°）：7.5 长时是 21%，车头会扎进坡面
    var rampSh = new T.Shape();
    rampSh.moveTo(0, 0); rampSh.lineTo(RL, 0); rampSh.lineTo(RL, -RH); rampSh.closePath();
    var rampG = new T.ExtrudeGeometry(rampSh, { depth: 4.4, bevelEnabled: false });
    rampG.translate(0, 0, -2.2);
    var ramp = new T.Mesh(rampG,
      new T.MeshStandardMaterial({ color: 0x343c44, roughness: .95, metalness: .04, envMapIntensity: .12 }));
    ramp.position.set(x + 2.7, BELT_Y, BELT_Z); sc.add(ramp);
    /* 坡道两侧的绿色引导灯：把「车从这里驶出去」画成一条可见的路径 */
    for (var gi = 0; gi < 7; gi++) {
      var gwx = PX.out + 3.6 + gi * 2.1;
      var gwy = gwx < PX.out + 15.7 ? BELT_Y - (gwx - (PX.out + 2.7)) * (1.6 / 13.0) : FLOOR;
      [-2.18, 2.18].forEach(function (gzz) {
        var dot = new T.Mesh(new T.BoxGeometry(.5, .05, .14),
          new T.MeshStandardMaterial({ color: 0x3ce08a, emissive: 0x2fd47e, emissiveIntensity: 1.7, roughness: .5 }));
        dot.position.set(gwx, gwy + .06, BELT_Z + gzz); sc.add(dot);
      });
    }
    /* 护栏贴坡面（厚 .06、只凸出坡面 .04）：横杆式护栏正好横在车身视线高度，
       近侧那条与车身画面重叠，看起来就像穿过车身 */
    [-2.26, 2.26].forEach(function (zz) {
      var rail = new T.Mesh(new T.BoxGeometry(RL, .06, .08), MAT.haz);
      rail.position.set(x + 2.7 + RL / 2, BELT_Y - RH / 2 + .10, BELT_Z + zz);
      rail.rotation.z = Math.atan2(-RH, RL); sc.add(rail);
    });

    /* 厂外公路：下线车驶出大门后的去处。沥青 + 车道虚线/边线 + 路灯 */
    var road = new T.Mesh(new T.BoxGeometry(40, .1, 8.2),
      new T.MeshStandardMaterial({ color: 0x24282d, roughness: .92, metalness: .05 }));
    road.position.set(x + 34, FLOOR + .02, BELT_Z); sc.add(road);
    var roadW = new T.MeshStandardMaterial({ color: 0xd8dde2, roughness: .6 });
    for (var li2 = 0; li2 < 12; li2++) {
      var dash2 = new T.Mesh(new T.BoxGeometry(2.6, .02, .16), roadW);
      dash2.position.set(x + 17.5 + li2 * 3.4, FLOOR + .09, BELT_Z); sc.add(dash2);
    }
    [-4.0, 4.0].forEach(function (zz) {
      var edge = new T.Mesh(new T.BoxGeometry(40, .02, .16), roadW);
      edge.position.set(x + 34, FLOOR + .09, BELT_Z + zz); sc.add(edge);
    });
    for (var lp2 = 0; lp2 < 3; lp2++) {
      var lx2 = x + 20 + lp2 * 9;
      var pole = new T.Mesh(new T.CylinderGeometry(.09, .13, 6.2, 8), MAT.graphite);
      pole.position.set(lx2, FLOOR + 3.1, BELT_Z - 4.8); sc.add(pole);
      var arm2 = new T.Mesh(new T.BoxGeometry(1.6, .12, .12), MAT.graphite);
      arm2.position.set(lx2 + .8, FLOOR + 6.1, BELT_Z - 4.8); sc.add(arm2);
      var lamp2 = new T.Mesh(new T.BoxGeometry(1.0, .1, .42),
        new T.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe9b0, emissiveIntensity: 1.6, roughness: .4 }));
      lamp2.position.set(lx2 + 1.4, FLOOR + 6.0, BELT_Z - 4.8); sc.add(lamp2);
    }
    stationCommon(x, 'out', 0x4fe0a0);
  }

  /* ---------------- AGV ---------------- */
  function makeAGV(x, z, id) {
    var sc = K.scene();
    var g = new T.Group(); g.position.set(x, FLOOR, z);
    var fork, beacon, wheels = [];
    if (ASSETS.agv) {
      var av = ASSETS.agv.clone(true);
      av.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) o.material = o.material.clone();
          if (o.name && o.name.indexOf('wheel') === 0) wheels.push(o);
        }
      });
      g.add(av);
      fork = av.getObjectByName('fork');
      beacon = av.getObjectByName('beacon');
    } else {
      var body = new T.Mesh(K.geoRoundBox(3.3, .85, 3.4, .16), MAT.orange);
      body.position.y = .85; body.castShadow = true; g.add(body);
      fork = new T.Group(); fork.position.set(0, 1.43, -.6); g.add(fork);
      fork.add(new T.Mesh(new T.BoxGeometry(2.8, .13, 2.2), MAT.steel));
      beacon = new T.Mesh(new T.SphereGeometry(.2, 12, 10),
        new T.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 2.4 }));
      beacon.position.set(0, 4.1, -.9); g.add(beacon);
    }
    /* 前照工作灯：固定在桅杆正面（z≈-0.66，y≈3.7），随车体一起走，
       不再悬在车头后上方（原 y=4.2,z=1.3 脱离车体 → 飘灯） */
    var topLamp = new T.Mesh(new T.CylinderGeometry(.26, .26, .18, 16),
      new T.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd98a, emissiveIntensity: 2.6, roughness: .4 }));
    topLamp.rotation.x = Math.PI / 2; topLamp.position.set(0, 3.7, -0.66); g.add(topLamp);
    var halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xffd98a, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(3.2, 3.2, 1); halo.position.set(0, 3.7, -0.5); g.add(halo);
    var led = new T.Mesh(new T.BoxGeometry(2.7, .09, .05),
      new T.MeshStandardMaterial({ color: 0x4fd0ff, emissive: 0x4fd0ff, emissiveIntensity: 2.8, roughness: .4 }));
    led.position.set(0, .95, -1.76); g.add(led);
    var led2 = led.clone(); led2.position.z = 1.76; g.add(led2);
    /* 车头扫描雷达 */
    var lidar = new T.Mesh(new T.CylinderGeometry(.22, .26, .2, 12), MAT.graphite);
    lidar.position.set(0, 1.6, -1.8); g.add(lidar);
    var lidGlow = glowDot(g, 0, 1.72, -1.8, 0x48ffa0, .05);
    /* 地面光斑（跟随车体） */
    var dec = new T.Mesh(new T.PlaneGeometry(9, 6),
      new T.MeshBasicMaterial({ map: glowTex(), color: 0xffd08a, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false }));
    dec.rotation.x = -Math.PI / 2; dec.position.y = .06; dec.renderOrder = 1; g.add(dec);
    sc.add(g);
    var agvBlob = K.blob({ x: x, y: FLOOR, z: z, r: 2.4 });
    var rec = {
      g: g, fork: fork, beacon: beacon, wheels: wheels, x: x, z: z, ry: 0,
      route: null, wpi: 0, spd: 8.5, carry: null, onArrive: null,
      go: function (pts, cb) { rec.route = pts; rec.wpi = 0; rec.onArrive = cb || null; },
      setCarry: function (o) { rec.carry = o; },
      upd: function (dt) {
        var rolled = 0;
        if (rec.route) {
          var wp = rec.route[rec.wpi], dx = wp[0] - rec.x, dz = wp[1] - rec.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          if (d < .2) {
            rec.wpi++;
            if (rec.wpi >= rec.route.length) {
              rec.route = null;
              if (rec.onArrive) { var cb = rec.onArrive; rec.onArrive = null; cb(); }
            }
          } else {
            var mv = Math.min(d, rec.spd * dt);
            rec.x += dx / d * mv; rec.z += dz / d * mv; rolled = mv;
            var ty = Math.atan2(-dx, -dz), dy2 = ty - rec.ry;
            while (dy2 > Math.PI) dy2 -= Math.PI * 2;
            while (dy2 < -Math.PI) dy2 += Math.PI * 2;
            rec.ry += dy2 * Math.min(1, dt * 4);
          }
        }
        if (rolled && rec.wheels.length) {
          var rw = rolled / .44;
          for (var wi = 0; wi < rec.wheels.length; wi++) rec.wheels[wi].rotateY(rw);
        }
        g.position.set(rec.x, FLOOR + (rec.route ? Math.sin(rec.x * .3) * .01 : 0), rec.z);
        g.rotation.y = rec.ry;
        agvBlob.position.set(rec.x, FLOOR + .04, rec.z);
        /* 顶灯呼吸 */
        var t2 = st._t;
        halo.material.opacity = .38 + Math.sin(t2 * 3) * .12;
        if (beacon) beacon.rotation.y += dt * 6;
      }
    };
    return rec;
  }


  /* ---------------- 车身流转 ---------------- */
  var P = {};
  var CYCLE = 84;                    // 一个节拍（秒）

  function buildParts() {
    var sc = K.scene();
    P.skillet = makeSkillet(); sc.add(P.skillet);
    P.body = makeBody(true);
    P.skillet.add(P.body);
    P.body.position.y = .16;         // 落在滑板定位销上

    /* 四门：作为车身的子节点，拆门阶段隐藏（分装线上另有一份） */
    P.doors = [];
    var defs = [
      { x: -.32, z: CAR.W / 2, ry: 0, front: true },
      { x: -.32, z: -CAR.W / 2, ry: Math.PI, front: true },
      { x: -0.98, z: CAR.W / 2, ry: 0, front: false },
      { x: -0.98, z: -CAR.W / 2, ry: Math.PI, front: false }
    ];
    defs.forEach(function (d) {
      var dw = d.front ? .66 : .54;
      var dr = makeDoor(d.z > 0 ? 1 : -1, d.front);
      /* -z 侧用 π 翻面会让车门沿 x 镜像，导致左右门错位（一端靠前、一端靠后）；
         这里把 -z 侧的基准 x 加回门宽，使两侧门在同一 x 区间、左右对称。*/
      var px = d.z < 0 ? d.x + dw : d.x;
      dr.position.set(px, .42, d.z);
      dr.rotation.y = d.ry;
      dr.userData.base = { x: px, y: .42, z: d.z };
      dr.userData.zd = d.z > 0 ? 1 : -1;
      P.body.add(dr);
      P.doors.push(dr);
    });

    /* 车内总成：仪表台 / 座椅（装配时才出现，从料架飞入） */
    P.cockpit = makeCockpit();
    P.cockpit.position.set(PX.ip - 4.2, FLOOR + 2.5, -3.0);
    /* -π/2 而非 +π/2：+π/2 会把原本在 -z 侧的方向盘翻到 +z（右舵），
       装进车里看着就是「驾驶位装反了」 */
    P.cockpit.rotation.y = -Math.PI / 2;
    sc.add(P.cockpit);
    P.seats = [];
    for (var i = 0; i < 2; i++) {
      var st4 = makeSeat();
      st4.position.set(PX.seat - 4.0, FLOOR + 2.0, -2.8 + i * 1.0);
      /* .70：座椅总高 1.27，装到 y=.42 后头枕顶 ≈1.31 < 车顶 1.47；
         沿用 .95 时头枕顶 1.63，直接刺出车顶 —— 安装座椅阶段的穿模 */
      st4.scale.setScalar(.70);
      sc.add(st4);
      P.seats.push(st4);
    }
    /* 四轮：装配后装到车上 */
    P.wheels = [];
    for (var w = 0; w < 4; w++) {
      var wh = makeWheel();
      wh.rotation.z = Math.PI / 2;
      wh.rotation.y = w % 2 ? Math.PI : 0;   // 轮毂盖朝外（+z 轮不翻转，-z 轮翻 180°）
      wh.visible = false;
      sc.add(wh);
      P.wheels.push(wh);
    }
    /* 后备箱里的随车工具包（下线前的最后一件事） */
    P.toolkit = new T.Mesh(new T.BoxGeometry(.7, .22, .5), MAT.carton);
    P.toolkit.visible = false; sc.add(P.toolkit);

    /* 吸盘抓取用的「飞行门」：不挂任何 parent（root 缩放会放大它），
       每帧用 link6-7 的 localToWorld 刚性跟随（skill-virtue 坑 5 的修法） */
    P.flyingDoor = makeDoor(1, true);
    P.flyingDoor.visible = false;
    sc.add(P.flyingDoor);

    /* AGV：向线边料架补料 */
    O.agv1 = makeAGV(-4, AGV_Z, 1);
    O.agv2 = makeAGV(42, AGV_Z + 1.2, 2);

    /* 真实 CAD 主臂接管拆门工位（加载异步，就绪前由程序化臂顶班） */
    O.cadArm = makeCadArm(PX.strip - .2, -3.2);   /* 基座离车身 3.2：臂杆越过车顶，不再横穿车身 */
    _dk1Load(function () {
      DK1.root.position.set(PX.strip - .2, FLOOR + .1, -3.2);
      applyCadJoints(DK1.angles);
      window.__cadReady = true;
    });

    window.__carP = P; window.__carO = O;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeIO(k) { return k < .5 ? 2 * k * k : -1 + (4 - 2 * k) * k; }

  /* 车身位置：各工位之间匀速，工位内停住 */
  var STOPS = [
    { t0: 0, t1: 5, x0: PX.in, x1: PX.strip },
    { t0: 5, t1: 11, hold: PX.strip },
    { t0: 11, t1: 16, x0: PX.strip, x1: PX.ip },
    { t0: 16, t1: 23, hold: PX.ip },
    { t0: 23, t1: 28, x0: PX.ip, x1: PX.seat },
    { t0: 28, t1: 35, hold: PX.seat },
    { t0: 35, t1: 40, x0: PX.seat, x1: PX.marry },
    { t0: 40, t1: 49, hold: PX.marry },
    { t0: 49, t1: 54, x0: PX.marry, x1: PX.tire },
    { t0: 54, t1: 61, hold: PX.tire },
    { t0: 61, t1: 66, x0: PX.tire, x1: PX.dress },
    { t0: 66, t1: 72, hold: PX.dress },
    { t0: 72, t1: 78, x0: PX.dress, x1: PX.out },
    { t0: 78, t1: CYCLE, hold: PX.out }
  ];
  function carX(t) {
    for (var i = 0; i < STOPS.length; i++) {
      var s2 = STOPS[i];
      if (t >= s2.t0 && t < s2.t1) {
        if (s2.hold !== undefined) return s2.hold;
        var k = easeIO((t - s2.t0) / (s2.t1 - s2.t0));
        return lerp(s2.x0, s2.x1, k);
      }
    }
    return PX.out;
  }

  /* ---------------- 机械臂动作序列 ---------------- */
  var SEQ = {};
  function buildSeqs() {
    var BY = BELT_Y;   // 车门高度基准
    SEQ.strip = [
      [0.00, PX.strip - .6, BY + 3.4, -2.4, 0],
      [0.14, PX.strip - .6, BY + 3.9, -2.4, 0],   // 先升到车顶上方
      [0.22, PX.strip - .6, BY + 3.9, 1.02, 0],   // 高位横移到车门正上方（z 在车身外）
      [0.32, PX.strip - .6, BY + 1.5, 1.02, 0],   // 沿车身外侧垂直下降到门高
      [0.40, PX.strip - .6, BY + 1.5, 1.02, 1],   // 吸住车门
      [0.52, PX.strip - .6, BY + 3.9, 1.02, 1],   // 提起并升过车顶
      [0.68, PX.strip - 1.3, BY + 3.7, -7.6, 1],  // 高位移到分装架上方
      [0.80, PX.strip - 1.3, BY + .95, -7.6, 1],  // 下降到门架
      [0.90, PX.strip - 1.3, BY + .95, -7.6, 0],
      [1.00, PX.strip - .6, BY + 3.4, -2.6, 0]
    ];
    SEQ.ip = [
      [0.00, PX.ip - .8, BELT_Y + 3.4, -2.2, 0],
      [0.18, PX.ip - 3.4, FLOOR + 2.1, -3.0, 0],   // 去料架（降到真实料架高度≈离地2.1）
      [0.30, PX.ip - 3.4, FLOOR + 2.1, -3.0, 1],   // 夹住仪表台
      [0.50, PX.ip - 3.4, FLOOR + 3.6, -3.0, 1],   // 抬起
      [0.70, PX.ip, FLOOR + 3.2, -.4, 1],          // 送进驾驶室
      [0.84, PX.ip, FLOOR + 2.1, -.4, 1],          // 落位（≈仪表台安装高度，避免瞬移）
      [0.92, PX.ip, FLOOR + 2.1, -.4, 0],
      [1.00, PX.ip, BELT_Y + 3.2, -1.8, 0]
    ];
    SEQ.seat = [
      [0.00, PX.seat - .8, BELT_Y + 3.4, -2.0, 0],
      [0.18, PX.seat - 3.4, BELT_Y + 2.6, -2.8, 0],
      [0.30, PX.seat - 3.4, BELT_Y + 2.6, -2.8, 1],
      [0.52, PX.seat - 3.4, BELT_Y + 3.8, -2.8, 1],
      [0.72, PX.seat - 1.2, BELT_Y + 2.8, -.6, 1],
      [0.86, PX.seat - 1.2, BELT_Y + 1.2, -.6, 1],
      [0.94, PX.seat - 1.2, BELT_Y + 1.2, -.6, 0],
      [1.00, PX.seat - .8, BELT_Y + 3.2, -2.0, 0]
    ];
    SEQ.dress = [
      [0.00, PX.dress - .6, BELT_Y + 3.2, -2.4, 0],
      [0.18, PX.dress - 1.6, BELT_Y + 1.35, -8.9, 0],
      [0.30, PX.dress - 1.6, BELT_Y + 1.35, -8.9, 1],
      [0.50, PX.dress - 1.6, BELT_Y + 2.6, -8.9, 1],
      [0.62, PX.dress - .4, BELT_Y + 3.6, 1.05, 1],   // 从车顶上方越过，到门外
      [0.78, PX.dress - .4, BELT_Y + 1.4, 1.05, 1],   // 沿车身外侧垂直下降贴装
      [0.90, PX.dress - .4, BELT_Y + 1.4, 1.05, 0],
      [1.00, PX.dress - .6, BELT_Y + 3.0, -2.4, 0]
    ];
  }

  function idleRobot(R, t, ph) {
    var s2 = Math.sin(t * .5 + ph) * .42;
    var s3 = Math.cos(t * .38 + ph) * .22;
    solveIK(R, R.cx - 1.0 + s2, BELT_Y + 2.0 + s3, ROB_Z + 3.2 + s3 * .6);
    setGrip(R, false);
  }

  /* ---------------- 主更新 ---------------- */
  var _lastT = 0;
  function upd(dt) {
    IK_DT = Math.max(.001, Math.min(.1, dt));
    st._t += dt * st.speed;
    st._simT += dt * st.speed;
    var t = st._t % CYCLE;
    if (t < _lastT && st.run) { st.done++; st.prod++; }
    _lastT = t;

    st._litT += (st.lit - st._litT) * Math.min(1, dt * 3.2);
    applyMood();

    /* 车身与滑板 */
    var x = carX(t);
    P.skillet.position.set(x, BELT_Y, BELT_Z);
    if (LGT.follow) {
      var follX = x + (t >= 80 ? P.body.position.x : 0);
      LGT.follow.position.x = follX;
      LGT.follow.target.position.x = follX;
      LGT.follow.intensity = 2.35 - st._litT * 1.35;   // 开灯后这束就不需要了
    }
    if (LGT.followCone) LGT.followCone.position.x = x + (t >= 80 ? P.body.position.x : 0);

    /* 四门：拆下前在车上，拆下后到分装架，回装前从架上取回 */
    var doorsOn = t < 7.5 || t > 70.5;
    P.doors.forEach(function (d) { d.visible = (t < 7.2 || t > 70.5); });
    /* 料架上的门：仅在「离车」窗口显示，避免与车身四门叠成两副（车门乱死的根因）。
       doorRack 是拆下后的唯一存放点；dressRack 是冗余道具，长期可见会叠出 6+ 扇门，故常隐。 */
    var offCar = (t >= 11 && t < 70.5);
    O.doorRack.forEach(function (d) { d.visible = offCar; });
    O.dressRack.forEach(function (d) { d.visible = false; });
    /* 料架装饰件常隐：它们与 P.cockpit / P.seats 摆在同一位置，
       长期可见会叠出「2 个仪表台 + 5 个座椅」，和车门叠影是同一类毛病 */
    O.cockpitRack.forEach(function (c) { c.visible = false; });
    O.seatRack.forEach(function (s5) { s5.visible = false; });

    /* 仪表台：16-23，由 IP 机器人从料架夹取、被夹爪抓着送进驾驶室（不再凭空飞）。
       关键修正：仪表台组内 dash 在 y≈0.98、方向盘 y≈1.02，若装到 body 局部 y=1.0，
       则跑到 1.98 —— 高过车顶 1.47，就是「方向盘飘在车顶上方」。改为装到局部 y=0，
       并保留 π/2 朝向（与料架一致），让仪表台落进驾驶舱内（被车身挡住，不再悬空）。*/
    var rackIP = [PX.ip - 3.4, FLOOR + 2.1, -3.0];
    carryWith(O.Rip, P.cockpit, t, 18.0, 22.0, rackIP, [0.0, 0.0, 0.0], .35, -Math.PI / 2);

    /* 座椅：28-35，送料到位（修复父子关系，避免瞬移/错位） */
    P.seats.forEach(function (s4, i) {
      var t0 = 29 + i * 1.6, t1 = t0 + 2.6;
      var scn = K.scene();
      if (t < t0) {
        if (s4.parent !== scn) scn.add(s4);
        s4.position.set(PX.seat - 4.0, FLOOR + 2.0, -2.8 + i * 1.0);
        s4.rotation.y = 0;
      } else if (t < t1) {
        if (s4.parent !== scn) scn.add(s4);
        var k2 = easeIO((t - t0) / (t1 - t0));
        s4.position.set(lerp(PX.seat - 4.0, PX.seat - .60, k2), lerp(FLOOR + 2.0, BELT_Y + .42, k2), lerp(-2.8 + i * 1.0, -.62 + i * 1.02, k2));
        s4.rotation.y = lerp(0, Math.PI / 2, k2);
      } else if (s4.parent !== P.body) {
        P.body.add(s4);
        /* rotation.y = π/2：靠背（本地 -z 侧）转到 -x 即朝车尾。
           之前是 0，靠背朝向车侧面 —— 两个座椅是「侧着坐」的 */
        s4.position.set(-.60, .42, -.62 + i * 1.02);
        s4.rotation.y = Math.PI / 2;
      }
    });

    /* 底盘合装：动力总成从地坑升起（40-49） */
    var liftY, powY;
    if (t < 41.5) { liftY = FLOOR - .5; }
    else if (t < 45.5) { liftY = lerp(FLOOR - .5, BELT_Y - .02, easeIO((t - 41.5) / 4)); }
    else if (t < 48) { liftY = BELT_Y - .02; }
    else { liftY = lerp(BELT_Y - .02, FLOOR - .5, Math.min(1, (t - 48) / 1.5)); }
    O.liftTable.position.y = liftY;
    /* powY 终值 = BELT_Y+.42（车身局部 .26）：发动机顶 .63 落在前轮拱空腔
       （r=.44，腔顶 .78）内，底部停在滑板顶面之上 —— 沿用 +.55 时缸盖
       直顶到车身局部 .74，插进实心底板，每台车必穿 */
    powY = liftY + .44;
    /* 滑板台面/定位销/支撑柱在举升窗口让开，否则动力总成要从实心台面里钻过去 */
    var marryOpen = (t >= 41 && t < 48.5);
    var lp = P.skillet.userData.liftParts;
    if (lp) for (var li = 0; li < lp.length; li++) lp[li].visible = !marryOpen;
    /* 装好后挂到车身继续可见（此前 visible=false，下线车上凭空少个动力总成） */
    var scnP = K.scene();
    if (t > 47.4) {
      if (O.powertrain.parent !== P.body) {
        P.body.add(O.powertrain);
        O.powertrain.position.set(1.60, .26, 0);
        O.powertrain.scale.setScalar(.70);
      }
    } else {
      if (O.powertrain.parent !== scnP) scnP.add(O.powertrain);
      O.powertrain.position.set(PX.marry + 1.60, powY, BELT_Z);
      O.powertrain.scale.setScalar(.70);
    }
    O.powertrain.visible = true;

    /* 轮胎：54-61，四个轮位依次装 */
    P.wheels.forEach(function (w2, i) {
      var scn = K.scene();
      var t0 = 55 + i * 1.1, t1 = t0 + 1.4;
      var wx = [1.50, 1.50, -1.45, -1.45][i], wz = [1, -1, 1, -1][i] * (CAR.W / 2 - .15);
      if (t < t0) {
        w2.visible = false;
      } else if (t < t1) {
        w2.visible = true;
        if (w2.parent !== scn) scn.add(w2);
        var k3 = (t - t0) / (t1 - t0);
        var rackX = PX.tire - 4.2 + (i % 2) * 1.5, rackZ = -4.2 + (i < 2 ? -.6 : .6);
        w2.position.set(lerp(rackX, x + wx, k3), lerp(FLOOR + 1.9, BELT_Y + .34, k3), lerp(rackZ, BELT_Z + wz, k3));
      } else {
        w2.visible = true;                       // 装到位后必须把 visible 恢复，否则轮子永远不出现
        if (w2.parent !== P.body) {
          w2.position.set(wx, .34, wz);
          P.body.add(w2);
        }
      }
    });

    /* 真实 CAD 主臂：数值 IK 跟随拆门序列；就绪前由程序化臂顶班 */
    var cadOn = DK1.ready && DK1.root.parent;
    if (cadOn && !O.Rstrip._gone) {
          /* 彻底移除（visible 已验证会被某些旁路 mesh 绕过） */
          [O.Rstrip.robHolder, O.Rstrip.base].forEach(function (g) {
            if (g && g.parent) g.parent.remove(g);
          });
          O.Rstrip._gone = true;
        }
    var cadGrip = 0, cadErr = -1;
    if (cadOn) {
      if (t >= 5 && t < 11 && !st.estop) {
        var kk = (t - 5) / 6;
        var aS = SEQ.strip[0], bS = SEQ.strip[SEQ.strip.length - 1];
        for (var si3 = 0; si3 < SEQ.strip.length - 1; si3++) {
          if (kk >= SEQ.strip[si3][0] && kk <= SEQ.strip[si3 + 1][0]) { aS = SEQ.strip[si3]; bS = SEQ.strip[si3 + 1]; break; }
        }
        var span3 = Math.max(1e-4, bS[0] - aS[0]);
        var e3 = Math.max(0, Math.min(1, (kk - aS[0]) / span3));
        e3 = e3 < .5 ? 2 * e3 * e3 : -1 + (4 - 2 * e3) * e3;
        var gx3 = lerp(aS[1], bS[1], e3), gy3 = lerp(aS[2], bS[2], e3), gz3 = lerp(aS[3], bS[3], e3);
        cadGrip = lerp(aS[4], bS[4], e3);
        DK1.root.updateWorldMatrix(true, false);
        var lt2 = worldToUrdf(gx3, gy3, gz3);
        var sol = solveCadIK(lt2, DK1.angles);
        /* 关节限速：J1（基座回转）最慢——「机械感」就是回转缓慢有力 */
        for (var ai2 = 0; ai2 < 5; ai2++)
          DK1.angles[ai2] = jog(DK1.angles[ai2], sol.angles[ai2], ai2 === 0 ? .9 : 2.2);
        cadErr = sol.err;
        applyCadJoints(DK1.angles);
      } else {
        for (var hi3 = 0; hi3 < 5; hi3++) DK1.angles[hi3] = jog(DK1.angles[hi3], DK1.home[hi3], hi3 === 0 ? .7 : 1.8);
        applyCadJoints(DK1.angles);
      }
      /* 吸盘抓门：夹住期间门刚性跟随 TCP 位置，姿态保持竖直 */
      var gripping = cadGrip > .5;
      if (gripping) {
        DK1.lg['link6-7'].updateWorldMatrix(true, false);
        var tw = DK1.lg['link6-7'].localToWorld(new T.Vector3(.128, 0, 0));
        if (!P.flyingDoor.visible) P.flyingDoor.visible = true;
        P.flyingDoor.position.set(tw.x, tw.y - .50, tw.z);
        P.flyingDoor.rotation.y = 0;
      } else if (P.flyingDoor.visible) {
        /* 松爪后立刻隐藏。旧条件 `t>=5 && t<11` 在拆门序列一结束就恒为 false，
           门会卡在机械臂末端上空永远可见 —— 就是「立在车顶上的白板」 */
        P.flyingDoor.visible = false;
      }
      window.__cadErr = cadErr; window.__DK1 = DK1;
    }

    /* 机器人 */
    if (st.estop) {
      [O.Rstrip, O.Rip, O.Rseat, O.Rdress].forEach(function (R, i) { if (R) idleRobot(R, 0, i * 1.7); });
    } else {
      if (!cadOn) {
        if (t >= 5 && t < 11) playSeq(O.Rstrip, SEQ.strip, (t - 5) / 6);
        else idleRobot(O.Rstrip, st._t, 0);
      }
      if (t >= 16 && t < 23) playSeq(O.Rip, SEQ.ip, (t - 16) / 7);
      else idleRobot(O.Rip, st._t, 1.7);
      if (t >= 28 && t < 35) playSeq(O.Rseat, SEQ.seat, (t - 28) / 7);
      else idleRobot(O.Rseat, st._t, 3.4);
      if (t >= 66 && t < 72) playSeq(O.Rdress, SEQ.dress, (t - 66) / 6);
      else idleRobot(O.Rdress, st._t, 5.1);
      /* 辅助机器人：各自不同相位的小幅作业循环，整片车间都是「活的」 */
      var aux = [O.Rstrip2, O.Rip2, O.Rseat2, O.Rdress2];
      for (var ai = 0; ai < aux.length; ai++) {
        if (!aux[ai]) continue;
        var ph2 = st._t * .8 + ai * 1.6;
        var gx = aux[ai].cx - 1.4 + Math.sin(ph2) * 1.0;
        var gy = BELT_Y + 2.0 + Math.abs(Math.cos(ph2 * .7)) * 1.1;
        var gz = aux[ai].cz + 1.4 + Math.sin(ph2 * .5) * .6;   // 车身外侧(-1.6)，别伸进车体
        solveIK(aux[ai], gx, gy, gz);
        setGrip(aux[ai], Math.sin(ph2) > .3);
      }
    }

    /* 焊装岛：4 台点焊机器人各自焊接，火花成组闪 */
    if (O.weldArms) {
      for (var wi = 0; wi < O.weldArms.length; wi++) {
        var WR = O.weldArms[wi];
        var wph = st._t * 1.05 + wi * 1.7;
        solveIK(WR, WR.cx + Math.sin(wph) * 1.1,
          BELT_Y + 2.0 + Math.cos(wph * .7) * .8,
          WR.cz + 3.0 + Math.sin(wph * .6) * .7);
        setGrip(WR, Math.sin(wph) > 0);
      }
    }
    if (O.sparks) {
      for (var si = 0; si < O.sparks.length; si++) {
        var sk = O.sparks[si];
        var on = ((st._t * 1.6 + sk.ph) % 2.6) < .30;
        for (var ci = 0; ci < sk.g.children.length; ci++) {
          var sp2 = sk.g.children[ci];
          sp2.material.opacity = on ? Math.random() * .95 : 0;
          if (on) sp2.position.y += .012;
        }
      }
    }
    /* EMS 空吊具缓慢往返 */
    if (O.emsCarriers) {
      for (var ei = 0; ei < O.emsCarriers.length; ei++) {
        var ec = O.emsCarriers[ei];
        ec.g.position.x = ec.home + Math.sin(st._t * .13 + ec.ph) * 5.5;
      }
    }

    /* 轮胎拧紧机：到点位后小幅压紧 + 套筒自转。
       以前旋转的是整条横臂（rotation.z），臂会像风车一样甩起来；现在只转套筒 */
    var tightening = (t >= 57 && t < 62);
    O.tireGuns.forEach(function (g2, i) {
      var active = tightening && Math.abs((t - 57) - i * .9) < 1.2;
      g2.g.position.y = FLOOR + 2.16 - (active ? .045 + Math.sin((t - 57) * 6 + i) * .015 : 0);
      g2.light.mat.emissiveIntensity = active ? 3.2 : 1.0;
      if (active) {
        if (g2.head) g2.head.rotation.z += dt * 11;
        if (g2.sock) g2.sock.rotation.z -= dt * 13;
      }
    });
    if (O.tireGunScreen) O.tireGunScreen.show(tightening ? '110' : '—', tightening ? '#4fe0a0' : '#3f8fa8',
      tightening ? 'N·m · 5 螺母' : '等待车轮');

    /* 整车下线（t 80-84）：驶下坡道 → 出厂门 → 上公路。
       以前车到 CYCLE 末尾直接消失，下线之后就没有下文了。
       轨迹必须贴合坡道斜面，否则车轮插进滑台/坡道：
       x<2.7 时车身还在滑板上（轮底从销撑高度落贴到台面），
       2.7~10.2 沿坡道斜面下滑（斜率 .2133 = 坡高 1.6 / 坡长 7.5），
       x=10.2 轮底正好落地，之后加速开远 */
    if (t >= 80) {
      var kR = easeIO(Math.min(1, (t - 80) / 2.8));
      var kD = easeIO(Math.max(0, (t - 82.8) / 1.2));
      var bx = kR * 15.7 + kD * 18.5;
      P.body.position.x = bx;
      /* 两点支撑解算：前后轮各自取所在位置的支承面高度，倾角由两点高差决定，
         中心高度取两点均值。这样「半在坡上半在平地」「坡道末端后轮未离坡」
         这些过渡状态都自动贴合，不会出现车头扎进坡面/后轮陷进坡底 */
      var SX = PX.out + 2.7, SE = PX.out + 15.7, SL = 1.6 / 13.0;
      var surfAt = function (v) {           /* 返回相对 BELT_Y 的高度 */
        var wx = PX.out + v;
        if (wx < SX) return 0;
        if (wx < SE) return -(wx - SX) * SL;
        return -(BELT_Y - FLOOR);
      };
      var hf = surfAt(bx + 1.5), hr = surfAt(bx - 1.45);
      var sinT = Math.max(-1, Math.min(1, (hf - hr) / 2.95));
      var th = Math.asin(sinT);
      P.body.rotation.z = th;
      /* 轮底在车身局部坐标里是 y = -0.207（实测，四轮同高），
         所以「前后轮各落在各自支承面上」的组原点高度就是
         (hf+hr)/2 + 0.207·cosθ。原式里的 +.075 是个拍出来的常数，
         比真实值小 0.13，坡上整段车轮陷进坡面 0.15~0.17 m。 */
      P.body.position.y = (hf + hr) / 2 + (.207 * Math.cos(th));
      if (bx > 2.7) for (var wi3 = 0; wi3 < P.wheels.length; wi3++) P.wheels[wi3].rotation.z += dt * 15;
      /* 驶出发运：车灯点亮 */
      MAT.lampGlass.emissive.setHex(0xfff0c8); MAT.lampGlass.emissiveIntensity = 1.8;
      MAT.tailLamp.emissiveIntensity = 2.6;
      if (!st._outT) { st._outT = 1; trace('整车检测合格 · 驶出发运'); }
    } else {
      P.body.position.x = 0; P.body.position.y = .207; P.body.rotation.z = 0;   /* 同下线段：轮底正好压住滑板面 */
      MAT.lampGlass.emissiveIntensity = 0;
      MAT.tailLamp.emissiveIntensity = .9;
      st._outT = 0;
    }

    /* 设备状态：检测工位的滚筒、相机、AGV 警灯 —— 设备不能在非作业时段死掉 */
    var inCheck = (t >= 72.5 && t < 80);
    if (O.rollers) for (var ri2 = 0; ri2 < O.rollers.length; ri2++)
      O.rollers[ri2].rotation.y += dt * (inCheck ? 3.4 : .3);   /* 待机也保持慢转 */
    if (O.outCam) O.outCam.rotation.y = inCheck ? Math.sin(t * 1.4) * .5 : 0;
    if (inCheck && P.wheels) for (var wi4 = 0; wi4 < P.wheels.length; wi4++)
      if (P.wheels[wi4].parent === P.body) P.wheels[wi4].rotation.z += dt * 1.4;
    [O.agv1, O.agv2].forEach(function (A) {
      if (A && A.beacon && A.beacon.material && A.beacon.material.emissive)
        A.beacon.material.emissiveIntensity = 1.5 + Math.sin(st._t * 9 + (A.x || 0)) * 1.2;
    });

    /* 屏幕 */
    O.stripScreen.show(t >= 5 && t < 11 ? 'DOOR' : '—', '#5fd0ff', t >= 5 && t < 11 ? '拆除 4 门' : '待料');
    O.ipScreen.show(t >= 16 && t < 23 ? 'IP' : '—', '#6fd0ff', t >= 16 && t < 23 ? '仪表台落位' : '待装');
    O.seatScreen.show(t >= 28 && t < 35 ? '4×45' : '—', '#ffc070', t >= 28 && t < 35 ? 'N·m 拧紧' : '待装');
    O.tireScreen.show(tightening ? '110' : '—', tightening ? '#4fe0a0' : '#3f8fa8',
      tightening ? 'N·m / 5 螺母' : '等待车轮');
    if (O.outScreen) O.outScreen.draw(st);

    /* 三色灯 */
    if (st.estop) allTowers('stop');
    else if (t >= 5 && t < 11) activeTower('strip');
    else if (t >= 16 && t < 23) activeTower('ip');
    else if (t >= 28 && t < 35) activeTower('seat');
    else if (t >= 40 && t < 49) activeTower('marry');
    else if (t >= 54 && t < 62) activeTower('tire');
    else if (t >= 66 && t < 72) activeTower('dress');
    else if (t >= 72) activeTower('out');
    else allTowers('run');

    /* AGV：送料到各工位料架 */
    if (st.run && !st.estop) {
      if (O.agv1.x < 20 && t > 20 && t < 26) O.agv1.go([[PX.ip - 6, AGV_Z], [PX.seat - 6, AGV_Z]]);
      else if (O.agv1.x > 0 && t > 50 && t < 56) O.agv1.go([[-40, AGV_Z]]);
      O.agv1.upd(dt);
      O.agv2.upd(dt);
    }

    var camRef = window.__labDebug && window.__labDebug.camera;
    if (camRef && O.roof) O.roof.visible = camRef.position.y < CEIL + 2.2;

    var dim = 1 - st._litT * .35;
    for (var i2 = 0; i2 < glows.length; i2++) {
      if (glows[i2].keep) glows[i2].m.material.emissiveIntensity = glows[i2].base * dim;
    }
    K.updateMoves(dt);
  }

  /* ---------------- 事件提示 ---------------- */
  var toastEl = null, toastTimer = 0;
  function trace(msg, tag) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'dfToast';
      document.body.appendChild(toastEl);
      var st9 = document.createElement('style');
      st9.textContent = '#dfToast{position:fixed;right:20px;bottom:22px;z-index:8;padding:9px 14px;border-radius:8px;' +
        'font-size:12px;letter-spacing:.02em;background:rgba(5,14,20,.86);color:#bfe0f2;' +
        'border:1px solid rgba(80,160,200,.32);box-shadow:0 8px 24px rgba(0,0,0,.5);' +
        'opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;' +
        'max-width:320px;line-height:1.5}#dfToast.on{opacity:1;transform:none}' +
        '#dfToast.stop{border-color:rgba(255,110,90,.6);color:#ffb0a0}';
      document.head.appendChild(st9);
    }
    toastEl.textContent = msg;
    toastEl.className = 'on' + (tag === 'stop' ? ' stop' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 2600);
  }

  /* ---------------- 机位 ----------------
     右上是讲解面板（约占画面右侧 1/3），所以每个机位都把主体往左推：
     目标点沿「屏幕右方向」偏 1 个单位左右，车身落在画面 40%~48% 处。
     高度按「车身腰线略下」取，车顶与机械臂上方都留得出空间。 */
  var CAMS = [
    { tx: -10.0, tz: -1.5, ty: -9.0, dist: 52, yaw: .45, pitch: .48 },     // 黑灯总览（带 AGV 通道）
    { tx: -34.8, tz: -0.3, ty: -13.5, dist: 14.0, yaw: -.55, pitch: .30 },// 来车
    { tx: -32.6, tz: -0.4, ty: -13.5, dist: 13.0, yaw: -.55, pitch: .30 },// 拆门
    { tx: -19.6, tz: -0.4, ty: -13.4, dist: 12.5, yaw: -.55, pitch: .30 },// 仪表台
    { tx: -6.6, tz: -0.4, ty: -13.4, dist: 13.0, yaw: -.55, pitch: .30 }, // 座椅
    { tx: 6.5, tz: -0.1, ty: -14.3, dist: 9.5, yaw: .48, pitch: .20 },    // 合装
    { tx: 20.6, tz: 0.3, ty: -13.9, dist: 10.8, yaw: -.52, pitch: .14 },  // 轮胎
    { tx: 50.0, tz: 0.2, ty: -12.0, dist: 18.0, yaw: 1.00, pitch: .20 }   // 下线·驶出发运（厂门外回望）
  ];
  function flyCam(dt) {
    if (!st._fly) return;
    var d = window.__labDebug;
    if (!d || !d.cam) return;
    var c = CAMS[Math.min(CAMS.length - 1, st._cam)], cm = d.cam;
    var k = Math.min(1, dt * 3.0);
    ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch'].forEach(function (f) { cm[f] += (c[f] - cm[f]) * k; });
    if (Math.abs(cm.tx - c.tx) < .06 && Math.abs(cm.dist - c.dist) < .12 && Math.abs(cm.pitch - c.pitch) < .004) st._fly = 0;
  }

  /* ---------------- 组装 ---------------- */
  var postfxFixed = false;
  function fixPostfx() {
    if (postfxFixed) return;
    postfxFixed = true;
    var d = window.__labDebug;
    if (!d || !d.composer) return;
    try {
      d.composer.passes.unshift(new T.RenderPass(d.scene, d.camera));
      d.composer.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
    } catch (e) { }
  }

  function buildBg() {
    var a = document.createElement('canvas'); a.width = 4; a.height = 256;
    var x = a.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0a121a'); g.addColorStop(.5, '#060a0e'); g.addColorStop(1, '#030507');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    var dark = new T.CanvasTexture(a);
    var b = document.createElement('canvas'); b.width = 4; b.height = 256;
    var y = b.getContext('2d');
    var g2 = y.createLinearGradient(0, 0, 0, 256);
    g2.addColorStop(0, '#7d8894'); g2.addColorStop(.52, '#6a7580'); g2.addColorStop(1, '#565f69');
    y.fillStyle = g2; y.fillRect(0, 0, 4, 256);
    return { dark: dark, light: new T.CanvasTexture(b) };
  }

  /* 轮廓线：黑灯里设备几乎只剩剪影，靠一道冷青描边才读得出形体 */
  function addOutlines() {
    var sc = K.scene();
    var targets = [];
    sc.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.visible === false) return;
      var m = o.material;
      if (!m || m.transparent || m.isShaderMaterial || m.isMeshBasicMaterial) return;
      var t = o.geometry.type;
      if (t !== 'BoxGeometry' && t !== 'CylinderGeometry' && t !== 'ExtrudeGeometry') return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bs = o.geometry.boundingBox.getSize(new T.Vector3());
      var mx = Math.max(bs.x, bs.y, bs.z);
      if (mx < 2.4 || mx > 40) return;
      targets.push(o);
    });
    var lineMat = new T.LineBasicMaterial({ color: 0x4e86a6, transparent: true, opacity: .30, depthWrite: false });
    targets.forEach(function (o) {
      try {
        var eg = new T.EdgesGeometry(o.geometry, 30);
        var ls = new T.LineSegments(eg, lineMat);
        ls.renderOrder = 4;
        o.add(ls);
      } catch (e) { }
    });
    O.outlineCount = targets.length;
  }

  var setupDone = false;
  function setup() {
    if (setupDone) return;
    setupDone = true;
    var sc = K.scene();

    for (var i = sc.children.length - 1; i >= 0; i--) {
      var o = sc.children[i];
      if (!o) continue;
      if (o.geometry && o.geometry.type === 'CircleGeometry') { o.visible = false; continue; }
      if (!o.isLight && o.position && o.position.z < -17) o.visible = false;
      if (o.isGroup && o.position.z < -17) o.visible = false;
    }
    var BG = buildBg();
    sc.background = BG.dark; sc.__BGTEX = BG;
    sc.fog = new T.FogExp2(0x05080b, .0072);

    buildMats();
    ENV.dark = makeEnv(false);
    ENV.light = makeEnv(true);
    if (ENV.dark) sc.environment = ENV.dark;

    buildShell();
    buildLights();
    buildConveyor();
    buildEMS();
    buildPlantDetail();
    buildWeldCell();
    buildInbound();
    buildStrip();
    buildCockpit();
    buildSeat();
    buildMarry();
    buildTire();
    buildDress();
    buildOut();
    buildParts();
    buildSeqs();

    sc.traverse(function (o) {
      if (!o.isMesh || !o.material || o.material.transparent) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bb = o.geometry.boundingBox.getSize(new T.Vector3());
      var big = Math.max(bb.x, bb.y, bb.z) > 1.2;
      o.castShadow = big; o.receiveShadow = true;
    });
    addOutlines();

    /* 工位标签：压到 FLOOR+7 —— 近景机位下标签正好落在车顶上方，
       再高就出画了；同时不至于压到机械臂的大臂 */
    var LY = FLOOR + 7.0;
    K.label([PX.in, FLOOR + 7.0, BELT_Z], '涂装车身入口');
    K.label([PX.strip, LY, BELT_Z], '拆门 / 车门分装');
    K.label([PX.ip, LY, BELT_Z], '仪表台装配');
    K.label([PX.seat, LY, BELT_Z], '座椅装配');
    K.label([PX.marry, LY, BELT_Z], '底盘合装 Marriage');
    K.label([PX.tire, LY, BELT_Z], '车轮装配');
    K.label([PX.dress, LY, BELT_Z], '车门回装');
    K.label([PX.out, LY, BELT_Z], '检测 · 下线');

    var css = document.createElement('style');
    css.textContent =
      '.lab-label{color:#a9cee4!important;background:rgba(5,12,18,.62);padding:2px 8px 3px;border-radius:5px;' +
      'border:1px solid rgba(80,150,190,.28);text-shadow:none!important;font-size:11px;letter-spacing:.02em;' +
      'backdrop-filter:blur(2px)}' +
      '.lab-label.on{color:#eaf6ff!important;background:rgba(12,32,46,.86);border-color:rgba(120,200,240,.6)}' +
      '#diag{position:fixed;left:18px;bottom:18px;z-index:6;font:11px/1.5 ui-monospace,Consolas,monospace;' +
      'color:#7fb4cf;background:rgba(4,10,16,.72);border:1px solid rgba(70,130,170,.3);border-radius:8px;' +
      'padding:8px 11px;pointer-events:none;letter-spacing:.02em}' +
      '#diag b{color:#d8ecf8;font-weight:600}' +
      '#diag .k{color:#4f8aa8}' +
      '#diag .r{color:#ff8a70}';
    document.head.appendChild(css);

    var dg = document.createElement('div');
    dg.id = 'diag';
    dg.innerHTML = '<div><span class="k">LINE</span> <b>总装 02 线</b> <span class="k">·</span> <span class="r" id="dgLit">黑灯</span></div>' +
      '<div><span class="k">JPH</span> <b id="dgJph">43</b> <span class="k">·</span> <span class="k">OEE</span> <b id="dgOee">—</b></div>' +
      '<div><span class="k">OUT</span> <b id="dgOut">0</b> <span class="k">台</span> <span class="k">·</span> <span class="k">FTT</span> <b>98.6%</b></div>';
    document.body.appendChild(dg);

    window.__dfState = st;
    window.__dfO = O;
    window.__dfP = P;
    applyMood();
    fixPostfx();
    setTimeout(fixPostfx, 300);
  }

  function syncDiag() {
    var s1 = document.getElementById('dgOut'); if (!s1) return;
    s1.textContent = st.done;
    document.getElementById('dgJph').textContent = (3600 / (CYCLE / Math.max(.5, st.speed))).toFixed(0);
    document.getElementById('dgOee').textContent = (92 + Math.min(6, st.done * .3)).toFixed(1) + '%';
    var el = document.getElementById('dgLit');
    el.textContent = st._litT > .5 ? '照明 开' : '黑灯';
    el.style.color = st._litT > .5 ? '#ffd98a' : '#ff8a70';
  }

  /* ---------------- 透视 / 爆炸（colorfigures 式检查交互） ----------------
     两个交互：
     ① 透视：外壳单独一份漆 → 半透明，露出座椅/仪表台/动力总成；
     ② 爆炸：车门向两侧分离、车轮外移下沉、座椅与仪表台上移；
     另外，仪表台/座椅/动力总成「入位」那一小段自动半透外壳 ——
     既让观众看见零件怎么装进去，也避免闭壳穿模（这是每台车必经的一步）。 */
  function insertActive(t) {
    return (t >= 5 && t < 11.5) || (t >= 18 && t < 23) || (t >= 28 && t < 36) || (t >= 40.5 && t < 49);
  }
  function applyInspect(dt) {
    var t = st._t % CYCLE;
    var auto = (!st.estop && insertActive(t)) ? .16 : 0;   // 只留一点半透提示，车身仍必须读成实体
    /* 下线段（t≥78）强制实车：透视是检查在制品的工具，成品车永远不透明 ——
       否则用户开着透视看下线车，半透车身 + 内部件透出，全被当成穿模 */
    var tgtX = Math.max((st.xray && t < 78) ? 1 : 0, auto, st.explode ? .55 : 0);
    st._xrayT += (tgtX - st._xrayT) * Math.min(1, dt * 4.6);
    st._expT += ((st.explode ? 1 : 0) - st._expT) * Math.min(1, dt * 3.4);
    var x = st._xrayT, e = st._expT;

    if (MAT.shellPaint) {
      MAT.shellPaint.opacity = 1 - .80 * x;
      var tr = x > .02;
      if (MAT.shellPaint.transparent !== tr) { MAT.shellPaint.transparent = tr; MAT.shellPaint.needsUpdate = true; }
      MAT.shellPaint.depthWrite = x < .5;
    }

    if (P.doors) P.doors.forEach(function (d) {
      var b = d.userData.base; if (!b) return;
      d.position.set(b.x, b.y + .10 * e, b.z + (d.userData.zd || 1) * .95 * e);
    });
    if (P.wheels) P.wheels.forEach(function (w2, i) {
      if (w2.parent !== P.body) return;
      var wx = [1.50, 1.50, -1.45, -1.45][i], sg = [1, -1, 1, -1][i];
      w2.position.set(wx, .34 - .55 * e, sg * (CAR.W / 2 - .15) + sg * .8 * e);
    });
    if (P.seats) P.seats.forEach(function (s4, i) {
      if (s4.parent !== P.body) return;
      s4.position.set(-.60, .42 + 1.3 * e, -.62 + i * 1.02);
    });
    if (P.cockpit && P.cockpit.parent === P.body) {
      P.cockpit.position.set(1.0 * e, .8 * e, 0);
    }
  }

  /* ---------------- 启动 ---------------- */
  _preloadGLB(function () {
    K.boot({
      title: '黑灯工厂 · 汽车总装线',
      chip: '虚拟仿真 · 智能制造 · 无人总装',
      hint: '拖空白处旋转视角 · 滚轮缩放 · 点设备可聚焦',
      state: st,
      scene: {
        setup: setup,
        update: function (dt) {
          ensureEnv();
          if (st.run && !st.estop) upd(dt);
          else { st._litT += (st.lit - st._litT) * Math.min(1, dt * 3.2); applyMood(); }
          applyInspect(dt);
          flyCam(dt);
          syncDiag();
        }
      },
      postfx: true,
      cam: { ty: -11.6, dist: 31, tx: -34, tz: -2, yaw: .66, pitch: .17 },

      reads: [['ph', '当前工位'], ['mode', '运行模式'], ['done', '累计下线'], ['takt', '节拍']],
      values: function (s) {
        var t = st._t % CYCLE;
        var ph = t < 5 ? '涂装车身驶入' : t < 11 ? '拆门 / 车门分装' : t < 16 ? '输送到仪表台' :
          t < 23 ? '仪表台装配' : t < 28 ? '输送到座椅' : t < 35 ? '座椅装配' :
            t < 40 ? '输送到合装位' : t < 49 ? '底盘合装' : t < 54 ? '输送到车轮位' :
              t < 61 ? '车轮装配' : t < 66 ? '输送到回装位' : t < 72 ? '车门回装' :
                t < 78 ? '输送到检测' : t < 80 ? '检测下线' : '驶出发运 · 上路';
        return {
          ph: s.estop ? '急停锁定' : ph,
          mode: s.estop ? '急停' : (s.run ? (s.lit > .5 ? '无人 · 照明' : '无人 · 黑灯') : '暂停'),
          done: s.done,
          takt: (CYCLE / Math.max(.5, s.speed)).toFixed(0) + ' s'
        };
      },

      steps: (function () {
        var ctl = [
          {
            label: '开灯 / 关灯', type: 'btn',
            onClick: function (s) {
              s.lit = s.lit > .5 ? 0 : 1;
              trace(s.lit > .5 ? '值班照明接入——注意：无人产线本不需要开灯' : '照明断开，回车黑灯运行');
            }
          },
          {
            label: '暂停 / 恢复', type: 'btn',
            onClick: function (s) { s.run = !s.run; trace(s.run ? '总装线恢复自动运行' : '总装线进入暂停待机'); }
          },
          {
            label: '急停 / 复位', type: 'btn',
            onClick: function (s) { s.estop = !s.estop; trace(s.estop ? '急停拍下！全线锁定' : '急停复位', s.estop ? 'stop' : 'info'); }
          },
          {
            label: '透视 / X 光', type: 'btn',
            onClick: function (s) { s.xray = s.xray ? 0 : 1; trace(s.xray ? '透视模式：外壳半透明，露出内部总成' : '恢复实体外壳'); }
          },
          {
            label: '爆炸视图', type: 'btn',
            onClick: function (s) { s.explode = s.explode ? 0 : 1; trace(s.explode ? '爆炸视图：车门/车轮/座椅沿装配轴分离' : '零件复位'); }
          },
          { label: '运行倍速', type: 'range', key: 'speed', min: .5, max: 3, step: .25 }
        ];
        /* 切步骤时不但换机位，还要把仿真钟推到该工位的作业时刻，
           否则镜头对着一个空工位——观众会以为这里没东西 */
        function cam(i, at) {
          return function (s) {
            s._cam = i; s._fly = .0001;
            if (at !== undefined) s._t = at;
          };
        }
        return [
          {
            name: '黑灯', title: '“黑灯”不是省电，是没人',
            ask: '没有人站在产线边上，灯是开给谁看的？',
            body: '<p>黑灯工厂（Lights-Out Manufacturing）的严格定义是：<b>全自动到不需要人在现场</b>。照明不是为了设备，是为了人——<b>既然没人，灯自然就不开</b>。所以“关灯”是结果，不是目的。</p>' +
              '<p>最常被引用的样板是日本 <b>FANUC</b>：2001 年起它在富士山下的工厂里<b>用机器人造机器人</b>，一个班 50 台，能连续 <b>30 天</b>无人运行。他们的副总裁说过一句很有名的话——「不只是关灯，我们把空调和暖气也关了」。</p>' +
              '<p><b>看点：</b>① 顶上那排工矿灯全熄着；② 地面一条条黄线是滑板输送的轨道；③ 车身自己从左侧涂装隧道里驶出来，全程没出现一个人。</p>',
            apply: function (s) { cam(0, 2.8)(s); s.run = true; s.lit = 0; },
            controls: ctl
          },
          {
            name: '来车', title: '总装的第一步：接住涂装好的车身',
            ask: '为什么车身进总装时，门和内饰都还没有？',
            body: '<p>整车厂四大工艺是<b>冲压 → 焊装 → 涂装 → 总装</b>。到总装这一步，车身已经有漆、有颜色，但里面还是空的——没有仪表台、没有座椅、没有门内饰、没有车轮。</p>' +
              '<p>车身落在<b>滑板（skillet）</b>上，靠四个定位销固定。整车几百公斤，靠辊道推不动也停不准，所以总装线用滑板或者空中 <b>EMS</b> 吊具。滑板下面那条拖链槽，是给它供电和传数据的。</p>',
            apply: cam(1, 1.2), controls: ctl
          },
          {
            name: '拆门', title: '装车之前，先把门拆下来',
            ask: '刚装好的门，为什么又要拆掉？',
            body: '<p>这是总装线上最反直觉的一步：<b>车门先拆下来，送到旁边的分装线单独装</b>——玻璃升降器、音响、线束、内饰板、防水膜，在门还平放在架子上时装，比装在车上好装十倍。</p>' +
              '<p>拆下来的门走<b>车门分装线</b>，装完再回到主线，在最后一道工序装回车身。所以你在总装车间会看到车门<b>离车旅行</b>一整圈——不是多此一举，是把「难装的位置」搬到「好装的位置」。</p>',
            apply: cam(2, 8), controls: ctl
          },
          {
            name: '仪表台', title: '仪表台是一个「模块」',
            ask: '这么大一块，是怎么塞进驾驶室的？',
            body: '<p>现在的仪表台总成（IP, Instrument Panel）不是一个个零件装上去的，而是供应商那边就做成<b>一个模块</b>：横梁、空调箱、线束、屏幕、出风口、安全气囊全在一起，送到线边是一整块。</p>' +
              '<p>机器人抓住整个模块，从<b>前风挡的开口</b>送进驾驶室，两侧螺栓一次打紧。<b>模块化供货</b>是总装线能提速的根本——把几百个动作挪到供应商那里去做。</p>',
            apply: cam(3, 19), controls: ctl
          },
          {
            name: '座椅', title: '座椅为什么从门里塞进去',
            ask: '四个螺栓，凭什么要 45 N·m？',
            body: '<p>座椅从车门开口送进车内，落在滑轨上，四颗螺栓按 <b>45 N·m</b> 打紧。这个扭矩不是随便定的——它是<b>碰撞安全</b>算出来的：座椅是安全带的受力点，松了就是人命。</p>' +
              '<p>所以每把拧紧枪都是<b>伺服扭矩枪</b>，拧紧曲线实时上传：扭矩到了没有、转角对不对、有没有重复打紧，全部记录在案，和这台车的 VIN 绑在一起。<b>十年后撞了车，能查出来这颗螺栓是谁打的、扭矩多少。</b></p>',
            apply: cam(4, 30.5), controls: ctl
          },
          {
            name: '合装', title: 'Marriage：车身和底盘的那一下',
            ask: '为什么这一步叫「结婚」？',
            body: '<p>英文里这一步就叫 <b>Marriage</b>（结婚）——车身上半部从上面下来，动力总成加前悬架从地坑里升上来，两边对准，一次结合。这是整车装配最有仪式感的一刻。</p>' +
              '<p>合装精度要求极高：发动机悬置、副车架、传动轴花键，全部要在<b>毫米级</b>对上。所以地坑里那套举升台带四根导向柱，车身下降的速度是<b>伺服控制</b>的，不是自由落体。</p>' +
              '<p>注意地上那层淡绿色的平面——那是<b>安全光幕</b>。合装区是整条线最危险的区域，有人进入会立即锁定，不允许下降。</p>',
            apply: cam(5, 42.0), controls: ctl
          },
          {
            name: '车轮', title: '五颗螺母，110 N·m，一颗都不能少',
            ask: '拧螺母这么简单，为什么要专门一个工位？',
            body: '<p>四个轮位各一台拧紧机，<b>五颗螺母同时拧</b>，扭矩 <b>110 N·m</b>。车轮是最容易出人命的部位，所以这里的防错做到了极致：扭矩、转角、拧紧顺序全部记录，少打一颗立即报警、车不放行。</p>' +
              '<p>这也是黑灯工厂最典型的场景——<b>动作固定、判定明确、后果严重</b>。凡是这样的工序，机器人比人可靠得多：它不会漏、不会累、不会觉得「应该拧紧了吧」。</p>',
            apply: cam(6, 57.2), controls: ctl
          },
          {
            name: '下线', title: '总装，恰恰是黑灯最难的一段',
            ask: '既然能无人，为什么现实中的总装车间还灯火通明？',
            body: '<p>这里要说一句实话：<b>汽车总装是「黑灯」最难的环节</b>，比焊装、涂装难得多。</p>' +
              '<p>焊装车间里全是点焊机器人，可以 100% 无人；涂装车间是封闭的喷涂机器人，也能黑灯。但总装到最后，剩下的是<b>线束插接、软内饰塞装、卡扣按压</b>——这些动作需要手感、需要看、需要判断「到底插到位没有」。所以真实的汽车厂，总装线至今仍开着灯、站着人。</p>' +
              '<p>所以「黑灯」不是一句口号，而是一把<b>尺子</b>：能量出每个工序的自动化程度。这条线把能做的都做了——拆门、装仪表台、装座椅、合装、拧轮、检测，剩下的插接类工序，仍然留给白班的人。<b>诚实地知道边界在哪，比假装全都无人更有价值。</b></p>',
            apply: cam(7, 80.4), controls: ctl
          }
        ];
      })(),

      quiz: null
    });
  });

})();
