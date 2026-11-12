/* 黑灯工厂 · 无人车间（Lights-Out Factory）
   一条汽车件的无人产线：立库出料 → 上下料机器人 → 车削单元 → 清洗 → 视觉检测
   → 激光打码 → 装配机器人 → 码垛机器人 → AGV 出货。
   全场默认「黑灯」：只有设备自身的 LED / 屏幕 / 激光在发光，人不在场，灯不用开。 */
(function () {
  var T = window.THREE, K = window.Lab;

  /* ---------------- 布局 ---------------- */
  var FLOOR = -16;                  // 地坪面
  var BELT_Y = -14.2;               // 滚筒线顶面
  var BELT_Z = 0;
  var ROB_Z = -3.8;                 // 机械臂安装位（线后方，臂展 6.1 内）
  var PX = { store: -47, load: -35, cnc: -21, wash: -8, insp: 3, mark: 14, asm: 26, pal: 37, dock: 47 };
  var CEIL = 1.6;                   // 屋架下弦
  var AGV_Z = 9.2;                  // AGV 通道中心

  /* ---------------- .glb 真实资产 ---------------- */
  var GLB_ROBOT_ARM = "{{GLB_ROBOT_ARM}}";
  var GLB_AGV = "{{GLB_AGV}}";
  var HAVE_GLB = GLB_ROBOT_ARM.length > 200 && GLB_AGV.length > 200;
  var ASSETS = { robot: null, agv: null };

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
    run: true, speed: 1, lit: 0, _litT: 0,
    estop: false, done: 0, ng: 0, prod: 0,
    ph: 'IDLE', _t: 0, _simT: 0, job: 5821,
    _cam: 0, _fly: 0, oee: 0
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
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: glowTex(), color: color, transparent: true, opacity: .55,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      sp.scale.set(r * 7, r * 7, 1);
      sp.position.copy(m.position); parent.add(sp);
      return { mesh: m, mat: mat, halo: sp };
    }
    return { mesh: m, mat: mat, halo: null };
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
    MAT.orange = new T.MeshStandardMaterial({ color: 0xc4680f, roughness: .5, metalness: .14, envMapIntensity: .9, roughnessMap: gr2 });
    MAT.safety = new T.MeshStandardMaterial({ color: 0xcfa01e, roughness: .54, metalness: .16, roughnessMap: gr2 });
    MAT.steel = new T.MeshStandardMaterial({ color: 0x8d959d, roughness: .24, metalness: .95, envMapIntensity: 1.3 });
    MAT.alu = new T.MeshStandardMaterial({ color: 0x9ba3ab, roughness: .3, metalness: .8, envMapIntensity: 1.15 });
    MAT.dark = new T.MeshStandardMaterial({ color: 0x14181c, roughness: .78, metalness: .2 });
    MAT.rubber = new T.MeshStandardMaterial({ color: 0x101316, roughness: .95, metalness: .04 });
    MAT.glass = new T.MeshPhysicalMaterial({ color: 0x16303f, roughness: .12, metalness: 0, transparent: true, opacity: .15, envMapIntensity: .7, side: T.DoubleSide, depthWrite: false });
    MAT.haz = new T.MeshStandardMaterial({ map: hazTex(), roughness: .6, metalness: .1 });
    MAT.carton = new T.MeshStandardMaterial({ color: 0xa8895e, roughness: .86, metalness: .02, roughnessMap: gr2, envMapIntensity: .7 });
    /* 汽车件：铸铁刹车盘（粗糙、暗）+ 铝轮毂（亮） */
    MAT.castIron = new T.MeshStandardMaterial({ color: 0x6e747b, roughness: .52, metalness: .8, envMapIntensity: 1.05, map: gr2 });
    MAT.alum = new T.MeshStandardMaterial({ color: 0xa8b0b8, roughness: .28, metalness: .88, envMapIntensity: 1.2 });
    MAT.machined = new T.MeshStandardMaterial({ color: 0xc2c9d0, roughness: .16, metalness: .95, envMapIntensity: 1.4 });
    MAT.paint = new T.MeshPhysicalMaterial({ color: 0x1c2a3a, roughness: .3, metalness: .45, clearcoat: .6, clearcoatRoughness: .25, envMapIntensity: 1.1 });
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
    var bandI = bright ? 1.5 : .55;
    for (var i = 0; i < 3; i++) {
      var b = new T.Mesh(new T.PlaneGeometry(30, 1.4),
        new T.MeshStandardMaterial({ color: 0x000000, emissive: bandCol, emissiveIntensity: bandI, roughness: 1 }));
      b.position.set(0, 14, -8 + i * 8); b.rotation.x = Math.PI / 2; env.add(b);
    }
    /* 侧向光斑：给暗部一点结构（青 + 橙，呼应设备灯） */
    [[-16, 3, -10, 0x3f9fd0, bright ? 1.6 : 1.1], [14, 1, 6, 0xe08a30, bright ? 1.2 : .8],
    [0, -2, 16, 0x2f7fa8, bright ? 1.0 : .7]].forEach(function (p) {
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
    /* 哑光环氧地坪：用 Standard 材质而不是 Physical —— 去掉清漆层的镜面高光，
       粗糙度抬到 .78、环境反射压到 .12，地坪只吃设备灯的一层很淡的柔光。
       颜色压到接近黑灰，黑灯场景里地面不能比设备还亮。 */
    var fl = new T.Mesh(new T.BoxGeometry(196, .6, 150),
      new T.MeshStandardMaterial({
        color: 0x14181c, roughness: .90, metalness: .02, envMapIntensity: .05,
        roughnessMap: grainTex(128, .94, .05, 3), normalMap: normalTex(128, .16, 2.2),
        normalScale: new T.Vector2(.01, .01)
      }));
    fl.position.set(0, FLOOR - .3, 6);
    fl.receiveShadow = true; sc.add(fl);
    O.floor = fl;

    /* 地坪分缝：细、暗、几乎与漆面同色。太密会变成球场线 */
    var seamMat = new T.MeshStandardMaterial({ color: 0x181d21, roughness: .85, metalness: .02 });
    for (var sx = -60; sx <= 60; sx += 12) {
      var sl = new T.Mesh(new T.BoxGeometry(.05, .01, 76), seamMat);
      sl.position.set(sx, FLOOR + .006, 2); sc.add(sl);
    }
    for (var sz = -30; sz <= 30; sz += 12) {
      var st2 = new T.Mesh(new T.BoxGeometry(120, .01, .05), seamMat);
      st2.position.set(0, FLOOR + .006, sz); sc.add(st2);
    }

    /* 通道黄线（微自发光：黑灯时也看得见地面的路） */
    var lineMat = new T.MeshStandardMaterial({ color: 0xc9a02a, emissive: 0x6a4f06, emissiveIntensity: .22, roughness: .62 });
    /* AGV 通道两条边线 */
    [-2.9, 2.9].forEach(function (dz) {
      var l = new T.Mesh(new T.BoxGeometry(112, .04, .3), lineMat);
      l.position.set(0, FLOOR + .026, AGV_Z + dz); sc.add(l);
    });
    /* 磁导航条：中间一条深色带 + 间隔的青色导向灯点（比整条虚线更「物流」） */
    var magMat = new T.MeshStandardMaterial({ color: 0x11161a, roughness: .5, metalness: .35 });
    var mag = new T.Mesh(new T.BoxGeometry(112, .028, .34), magMat);
    mag.position.set(0, FLOOR + .022, AGV_Z); sc.add(mag);
    var magDotMat = new T.MeshStandardMaterial({ color: 0x2fa8c8, emissive: 0x2fa8c8, emissiveIntensity: .9, roughness: .4 });
    for (var dxi = -53; dxi < 56; dxi += 4) {
      var md = new T.Mesh(new T.BoxGeometry(.5, .024, .12), magDotMat);
      md.position.set(dxi, FLOOR + .038, AGV_Z); sc.add(md);
    }
    /* 地面导向箭头：每 16 米一组，指明物流方向 */
    var arrowMat = new T.MeshStandardMaterial({ color: 0xd8b23a, emissive: 0x6a4f06, emissiveIntensity: .28, roughness: .6 });
    for (var axi = -48; axi < 56; axi += 16) {
      [-1, 1].forEach(function (sg) {
        var wing = new T.Mesh(new T.BoxGeometry(.9, .035, .11), arrowMat);
        wing.position.set(axi - sg * .3, FLOOR + .04, AGV_Z + sg * .42);
        wing.rotation.y = sg * .72; sc.add(wing);
      });
    }
    /* 产线两侧警戒带 */
    [[-4.2], [4.2]].forEach(function (dz) {
      var l = new T.Mesh(new T.BoxGeometry(108, .04, .32),
        new T.MeshStandardMaterial({ color: 0xb98c1c, emissive: 0x5c4206, emissiveIntensity: .20, roughness: .66 }));
      l.position.set(-2, FLOOR + .026, BELT_Z + dz[0]); sc.add(l);
    });
    /* 出货口地面框线：让 AGV 的交接终点在地面上就能读出来 */
    var dockMat = new T.MeshStandardMaterial({ color: 0xd8b23a, emissive: 0x5c4206, emissiveIntensity: .24, roughness: .6 });
    [[-3.4, 0], [3.4, 0]].forEach(function (p) {
      var l = new T.Mesh(new T.BoxGeometry(.22, .04, 6.8), dockMat);
      l.position.set(PX.dock + p[0], FLOOR + .03, AGV_Z + p[1]); sc.add(l);
    });
    [[0, -3.4], [0, 3.4]].forEach(function (p) {
      var l = new T.Mesh(new T.BoxGeometry(6.6, .04, .22), dockMat);
      l.position.set(PX.dock + p[0], FLOOR + .03, AGV_Z + p[1]); sc.add(l);
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
    [[-13.5, 1.05, pipeMat], [-11.6, .82, pipeMat2], [10.5, .95, pipeMat],
    [12.4, .7, pipeMat2], [-27, .8, pipeMat2]].forEach(function (p) {
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
    [-19.5, 17.5].forEach(function (tz) {
      var tray = new T.Mesh(new T.BoxGeometry(LONG, .26, .95), pipeMat2);
      tray.position.set(0, CEIL + .45, tz); roofG.add(tray);
      for (var hx = -52; hx <= 52; hx += 9) {
        var hang = new T.Mesh(new T.BoxGeometry(.1, 1.3, .1), pipeMat2);
        hang.position.set(hx, CEIL + 1.1, tz); roofG.add(hang);
      }
    });

    /* 远墙 + 侧墙：近黑，只给一点体积 */
    var wallMat = new T.MeshStandardMaterial({ color: 0x2b333b, roughness: .92, metalness: .1, emissive: new T.Color(0x6a7681), emissiveIntensity: 0 });
    LGT.wall = wallMat;
    var backW = new T.Mesh(new T.PlaneGeometry(HALL.x1 - HALL.x0, 22), wallMat);
    backW.position.set(0, FLOOR + 11, HALL.z0); sc.add(backW);
    /* 侧墙 */
    [[HALL.x0, Math.PI / 2], [HALL.x1, -Math.PI / 2]].forEach(function (p) {
      var w = new T.Mesh(new T.PlaneGeometry(HALL.z1 - HALL.z0, 22), wallMat);
      w.position.set(p[0], FLOOR + 11, (HALL.z0 + HALL.z1) / 2); w.rotation.y = p[1]; sc.add(w);
    });

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

    /* 地面上的设备反光斑：黑灯时唯一的地面信息。哑光漆面上只留一层很淡的柔光，
       不再拉成水面那样的长条亮痕 */
    [
      [PX.cnc, 0, 4.5, 0x63c8ff, .045], [PX.wash, 0, 3.5, 0x63c8ff, .035],
      [PX.insp, 0, 3.2, 0x4fe0c8, .042], [PX.mark, 0, 3.2, 0xff5a4a, .035],
      [PX.asm, -1, 4.0, 0xffb45a, .038], [PX.pal, 0, 3.6, 0x63c8ff, .035],
      [PX.load, -1, 3.4, 0xffb45a, .032]
    ].forEach(function (g) {
      var d3 = glowDecal(g[0], g[1] + BELT_Z, g[2], g[3], g[4], 1.15, .85);
      deviceGlows.push({ m: d3, op: g[4] });
    });
  }

  /* ---------------- 光照：黑灯 / 开灯两套 ---------------- */
  var LGT = {};
  function buildLights() {
    var sc = K.scene();
    /* 收掉引擎默认的实验室高调光 */
    sc.traverse(function (o) {
      if (o.isHemisphereLight) { o.intensity = .17; o.color.setHex(0x35597a); o.groundColor.setHex(0x070a0e); LGT.hemi = o; }
      else if (o.isDirectionalLight) { o.intensity = .22; o.color.setHex(0x8fb4d8); }
    });
    /* 主投光（开灯时才强）：一盏，负责投阴影 */
    var key = new T.DirectionalLight(0xdce9f6, .36);
    key.position.set(28, 62, 34);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
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

    /* 轮廓光：从设备后上方压过来的冷光，只擦亮顶面和侧棱。
       黑灯场景里这比提高整体亮度更有效：机器不死黑，也不会失去「黑灯」的气氛 */
    var rim = new T.DirectionalLight(0x6fc0e8, .34);
    rim.position.set(-38, 22, -54);
    sc.add(rim); LGT.rim = rim;
    var rim2 = new T.DirectionalLight(0xffa860, .16);
    rim2.position.set(46, 14, -34);
    sc.add(rim2); LGT.rim2 = rim2;

    /* 黑灯下的「设备自照」：几盏低强度点光，把工位附近的空气点亮一点点 */
    /* 黑灯下的「工位工作灯」：不是给车间照明，是把每台设备的立面擦出来一点。
       真实黑灯车间里，机器人工作区和检修位本来就留少量局部照明。 */
    [
      [PX.load, -8.6, 3.2, 0xffb060, 2.4, 30],
      [PX.cnc, -8.0, 4.0, 0x6fc4f0, 2.7, 32],
      [PX.wash, -8.6, 3.4, 0x6fd8e8, 1.9, 26],
      [PX.insp, -8.0, 3.4, 0x5fe8d0, 2.3, 28],
      [PX.mark, -8.0, 3.4, 0xff6a50, 1.9, 26],
      [PX.asm, -8.2, 3.6, 0xffb060, 2.5, 30],
      [PX.pal, -8.6, 3.4, 0x6fc4f0, 2.0, 28],
      [0, -8.0, AGV_Z + 2, 0x4fb0d8, 1.1, 28]
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
    if (LGT.key) LGT.key.intensity = .36 + lit * 1.55;
    if (LGT.amb) LGT.amb.intensity = lit * .48;
    if (LGT.fill) LGT.fill.intensity = lit * 1.35;
    if (LGT.ceil) LGT.ceil.emissiveIntensity = lit * 1.15;
    if (LGT.wall) LGT.wall.emissiveIntensity = lit * .55;
    /* 曝光：黑灯压到 .95，暗部还能分出机器轮廓；开灯抬到 1.42 让整间厂房真的亮起来
       （postfx 的终合 Pass 统一做 ACES，改它的 uExposure 是最稳的全局提亮） */
    var d2 = window.__labDebug;
    if (d2 && d2.composer) {
      var ps = d2.composer.passes;
      var last2 = ps[ps.length - 1];
      if (last2 && last2.uniforms && last2.uniforms.uExposure) {
        last2.uniforms.uExposure.value = .95 + lit * .34;
      }
    }
    if (LGT.hemi) {
      LGT.hemi.intensity = .17 + lit * .74;
      LGT.hemi.color.setRGB(.21 + lit * .62, .35 + lit * .60, .48 + lit * .50);
      LGT.hemi.groundColor.setRGB(.028 + lit * .30, .038 + lit * .31, .048 + lit * .32);
    }
    if (LGT.rim) LGT.rim.intensity = .34 - lit * .16;
    if (LGT.rim2) LGT.rim2.intensity = .16 - lit * .10;
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
    for (var j = 0; j < cones.length; j++) cones[j].m.material.uniforms.uOp.value = cones[j].op * (.25 + lit * 2.6);
    if (O.exitGlow) O.exitGlow.material.opacity = .30 - lit * .12;
    for (var k3 = 0; k3 < deviceGlows.length; k3++) {
      deviceGlows[k3].m.material.opacity = deviceGlows[k3].op * (1 - lit * .92);
    }
    if (O.floor) {
      O.floor.material.envMapIntensity = .05 + lit * .38;
      O.floor.material.roughness = .90 - lit * .20;
      O.floor.material.metalness = .02;
      O.floor.material.color.setHex(lit > .45 ? 0x2c343b : 0x111417);
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


  /* ---------------- 输送线（辊道） ---------------- */
  var BELT_X0 = -53, BELT_X1 = 53;
  function buildConveyor() {
    var sc = K.scene();
    var W = 3.6;
    /* 侧梁：铝型材，带一条 LED 灯带（黑灯时输送线是一条发光的河） */
    [-1, 1].forEach(function (sg) {
      var beam = new T.Mesh(new T.BoxGeometry(BELT_X1 - BELT_X0, .42, .3), MAT.alu);
      beam.position.set(0, BELT_Y - .34, BELT_Z + sg * (W / 2 - .15));
      beam.castShadow = true; beam.receiveShadow = true; sc.add(beam);
      /* 灯带：分段装（通长一条会变成一根贯穿全场的白线，抢掉设备的光） */
      for (var lx2 = BELT_X0 + 2; lx2 < BELT_X1 - 3; lx2 += 6.5) {
        var led = ledStrip(3.4, .055, .05, 0x59c8f0, 1, null);
        led.position.set(lx2 + 1.7, BELT_Y - .15, BELT_Z + sg * (W / 2 - .02));
      }
    });
    /* 滚筒：实例化，一根 draw call */
    var n = Math.floor((BELT_X1 - BELT_X0) / .62);
    var geo = new T.CylinderGeometry(.17, .17, W - .5, 10);
    var inst = new T.InstancedMesh(geo, MAT.alu, n);
    var dm = new T.Object3D();
    var qb = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
    for (var i = 0; i < n; i++) {
      dm.position.set(BELT_X0 + .4 + i * .62, BELT_Y - .17, BELT_Z);
      dm.quaternion.copy(qb);
      dm.updateMatrix();
      inst.setMatrixAt(i, dm.matrix);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    sc.add(inst); O.rollers = inst;

    /* 支腿 + 斜撑 */
    var legMat = MAT.graphite;
    for (var lx = BELT_X0 + 3; lx < BELT_X1; lx += 6.5) {
      [-1, 1].forEach(function (sg) {
        var lg = new T.Mesh(new T.BoxGeometry(.26, BELT_Y - FLOOR - .5, .26), legMat);
        lg.position.set(lx, (BELT_Y - .5 + FLOOR) / 2, BELT_Z + sg * (W / 2 - .2));
        lg.castShadow = true; sc.add(lg);
      });
      var cross = new T.Mesh(new T.BoxGeometry(.14, .14, W - .5), legMat);
      cross.position.set(lx, FLOOR + .35, BELT_Z); sc.add(cross);
    }
    /* 托盘挡停器（每个工位前一对） */
    [PX.cnc, PX.wash, PX.insp, PX.mark, PX.asm, PX.pal].forEach(function (px) {
      [-1, 1].forEach(function (sg) {
        var st2 = new T.Mesh(new T.BoxGeometry(.18, .46, .18), MAT.steel);
        st2.position.set(px - 2.2, BELT_Y + .1, BELT_Z + sg * 1.3); sc.add(st2);
      });
    });
  }

  /* ---------------- 托盘 / 汽车件 ---------------- */
  function makePallet() {
    var g = new T.Group();
    var top = new T.Mesh(new T.BoxGeometry(3.0, .16, 2.4), new T.MeshPhysicalMaterial({
      color: 0x1f2a35, roughness: .55, metalness: .18, envMapIntensity: .8,
      roughnessMap: grainTex(64, .55, .3, 3)
    }));
    top.position.y = .22; top.castShadow = true; top.receiveShadow = true; g.add(top);
    for (var i = 0; i < 3; i++) {
      var foot = new T.Mesh(new T.BoxGeometry(2.9, .14, .26), MAT.dark);
      foot.position.set(0, .07, -.9 + i * .9); g.add(foot);
    }
    /* 托盘 RFID 标签 + 一个蓝色指示点（黑灯时看得见托盘在哪） */
    var tag = new T.Mesh(new T.BoxGeometry(.34, .02, .22), MAT.dark);
    tag.position.set(-1.1, .31, .85); g.add(tag);
    var dot = glowDot(g, 1.15, .32, .9, 0x4fd8ff, .045);
    dot.mat.emissiveIntensity = 1.6;
    return g;
  }

  /* 刹车盘：盘体 + 通风槽 + 中心毂 + 螺栓孔。汽车件里辨识度最高的一个。 */
  function makeBrakeDisc(detail) {
    var g = new T.Group();
    var R = 1.42, TH = .16;
    /* 盘体（两片摩擦面 + 中间通风夹层） */
    var face1 = new T.Mesh(new T.CylinderGeometry(R, R, TH, 40), MAT.castIron);
    face1.position.y = .07; g.add(face1);
    var face2 = new T.Mesh(new T.CylinderGeometry(R, R, TH, 40), MAT.castIron);
    face2.position.y = -.07; g.add(face2);
    var core = new T.Mesh(new T.CylinderGeometry(R * .99, R * .99, .05, 40), MAT.dark);
    core.position.y = 0; g.add(core);
    /* 通风槽：径向排布的小暗条，读作散热筋 */
    if (detail !== false) {
      for (var i = 0; i < 24; i++) {
        var a = i / 24 * Math.PI * 2;
        var rib = new T.Mesh(new T.BoxGeometry(.055, .055, R * .86), MAT.dark);
        rib.position.set(Math.sin(a) * R * .45, 0, Math.cos(a) * R * .45);
        rib.rotation.y = a; g.add(rib);
      }
      /* 摩擦面上的车削纹（同心细环） */
      [1.05, .82, .6].forEach(function (rr) {
        var ring = new T.Mesh(new T.TorusGeometry(rr, .012, 6, 44), MAT.machined);
        ring.rotation.x = Math.PI / 2; ring.position.y = TH / 2 + .085; g.add(ring);
      });
    }
    /* 中心毂（帽） */
    var hat = new T.Mesh(new T.CylinderGeometry(.56, .64, .5, 28), MAT.castIron);
    hat.position.y = .22; g.add(hat);
    var hatTop = new T.Mesh(new T.CylinderGeometry(.56, .56, .06, 28), MAT.machined);
    hatTop.position.y = .48; g.add(hatTop);
    /* 螺栓孔：5 孔均布，用深色小圆柱「挖」出孔的观感 */
    for (var k = 0; k < 5; k++) {
      var ang = k / 5 * Math.PI * 2;
      var hole = new T.Mesh(new T.CylinderGeometry(.085, .085, .1, 10), MAT.dark);
      hole.position.set(Math.sin(ang) * .38, .5, Math.cos(ang) * .38); g.add(hole);
      var bolt = new T.Mesh(new T.CylinderGeometry(.055, .055, .12, 8), MAT.steel);
      bolt.position.set(Math.sin(ang) * .38, .55, Math.cos(ang) * .38); g.add(bolt);
    }
    /* 外缘倒角环，强化轮廓 */
    var rim = new T.Mesh(new T.TorusGeometry(R - .01, .04, 8, 48), MAT.machined);
    rim.rotation.x = Math.PI / 2; rim.position.y = .07; g.add(rim);
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* 轮毂：LatheGeometry 母线，读作铝合金铸件 */
  function makeHub() {
    var g = new T.Group();
    var pts = [
      [1.25, 0], [1.32, .1], [1.3, .55], [1.16, .8], [.95, .86],
      [.72, .8], [.6, .55], [.58, .2], [.3, .1], [.12, 0]
    ].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var body = new T.Mesh(new T.LatheGeometry(pts, 32), MAT.alum);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    /* 法兰盘面 + 5 个螺柱 */
    var flange = new T.Mesh(new T.CylinderGeometry(1.3, 1.3, .1, 32), MAT.machined);
    flange.position.y = .06; g.add(flange);
    for (var k = 0; k < 5; k++) {
      var a = k / 5 * Math.PI * 2;
      var stud = new T.Mesh(new T.CylinderGeometry(.075, .075, .3, 8), MAT.steel);
      stud.position.set(Math.sin(a) * .95, .2, Math.cos(a) * .95); g.add(stud);
      var nut = new T.Mesh(new T.CylinderGeometry(.11, .11, .1, 6), MAT.steel);
      nut.position.set(Math.sin(a) * .95, .34, Math.cos(a) * .95); g.add(nut);
    }
    /* 中心孔 */
    var bore = new T.Mesh(new T.CylinderGeometry(.3, .3, .9, 20), MAT.dark);
    bore.position.y = .3; g.add(bore);
    return g;
  }

  /* 变速箱端盖：带加强筋的薄壁铸件 */
  function makeGearbox() {
    var g = new T.Group();
    var base = new T.Mesh(new T.CylinderGeometry(1.1, 1.2, .42, 26), MAT.alum);
    base.position.y = .21; g.add(base);
    var neck = new T.Mesh(new T.CylinderGeometry(.52, .78, .55, 24), MAT.alum);
    neck.position.y = .68; g.add(neck);
    var top = new T.Mesh(new T.CylinderGeometry(.5, .5, .08, 24), MAT.machined);
    top.position.y = .98; g.add(top);
    /* 法兰耳朵 */
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      var ear = new T.Mesh(new T.BoxGeometry(.3, .18, .34), MAT.alum);
      ear.position.set(Math.sin(a) * 1.14, .2, Math.cos(a) * 1.14);
      ear.rotation.y = a; g.add(ear);
      var hole = new T.Mesh(new T.CylinderGeometry(.09, .09, .22, 8), MAT.dark);
      hole.position.set(Math.sin(a) * 1.14, .22, Math.cos(a) * 1.14); g.add(hole);
    }
    /* 加强筋 */
    for (var j = 0; j < 4; j++) {
      var b = j / 4 * Math.PI * 2 + .4;
      var rib = new T.Mesh(new T.BoxGeometry(.1, .62, .5), MAT.alum);
      rib.position.set(Math.sin(b) * .8, .48, Math.cos(b) * .8);
      rib.rotation.y = b; rib.rotation.x = .18; g.add(rib);
    }
    g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  /* ---------------- 立体仓库 ---------------- */
  function buildStore() {
    var sc = K.scene();
    var cx = PX.store, cz = -4.5;
    var W = 11, H = 8.4, D = 6.4, LV = 4;
    var upMat = MAT.steel, beamMat = MAT.graphite;
    /* 四根立柱 + 层板 */
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (p) {
      var col = new T.Mesh(new T.BoxGeometry(.34, H, .34), upMat);
      col.position.set(cx + p[0] * W / 2, FLOOR + H / 2, cz + p[1] * D / 2);
      col.castShadow = true; sc.add(col);
    });
    for (var l = 0; l < LV; l++) {
      var y = FLOOR + 1.1 + l * 2.0;
      [-1, 1].forEach(function (sg) {
        var bm = new T.Mesh(new T.BoxGeometry(W, .16, .2), beamMat);
        bm.position.set(cx, y, cz + sg * D / 2); sc.add(bm);
      });
      /* 层板（放料） */
      var deck = new T.Mesh(new T.BoxGeometry(W - .5, .1, D - .5),
        new T.MeshStandardMaterial({ color: 0x2b3238, roughness: .7, metalness: .3 }));
      deck.position.set(cx, y + .1, cz); deck.receiveShadow = true; sc.add(deck);
      /* 仓位：每个格子一个料筐 / 毛坯 */
      for (var c = 0; c < 4; c++) {
        if ((l + c) % 3 === 2) continue;
        var bx = cx - W / 2 + 1.5 + c * 2.6;
        var bin = new T.Mesh(new T.BoxGeometry(1.9, .8, 2.2),
          new T.MeshStandardMaterial({ color: 0x243544, roughness: .62, metalness: .15, roughnessMap: grainTex(64, .5, .3, 2) }));
        bin.position.set(bx, y + .55, cz); bin.castShadow = true; sc.add(bin);
        /* 毛坯件 */
        var blank = new T.Mesh(new T.CylinderGeometry(.62, .62, .38, 18), MAT.castIron);
        blank.position.set(bx, y + 1.08, cz); blank.castShadow = true; sc.add(blank);
        /* 仓位地址灯：黑灯时仓库自己亮着 */
        var lb = glowDot(sc, bx, y + .2, cz + D / 2 - .25, 0x4fc8f0, .06);
        lb.mat.emissiveIntensity = 2.2;
      }
    }
    /* 堆垛机导轨 + 立柱（简化：一根竖直滑轨 + 载货台） */
    var mast = new T.Mesh(new T.BoxGeometry(.3, H + .6, .3), MAT.steel);
    mast.position.set(cx + W / 2 - .6, FLOOR + (H + .6) / 2, cz); sc.add(mast);
    O.storeFork = new T.Group();
    O.storeFork.position.set(cx + W / 2 - .6, FLOOR + 2.0, cz);
    var forkP = new T.Mesh(new T.BoxGeometry(1.5, .18, 2.4), MAT.steel); O.storeFork.add(forkP);
    var forkB = new T.Mesh(new T.BoxGeometry(.4, .7, .5), MAT.graphite); forkB.position.y = .4; O.storeFork.add(forkB);
    /* 载货台上的料筐 + 蓝色定位灯，堆垛机在动的时候观众能看出它在搬什么 */
    var carryBin = new T.Mesh(new T.BoxGeometry(1.6, .72, 2.0),
      new T.MeshStandardMaterial({ color: 0x2a4050, roughness: .6, metalness: .2 }));
    carryBin.position.y = .45; O.storeFork.add(carryBin);
    var forkLed = glowDot(O.storeFork, .78, .2, 1.18, 0x4fc8f0, .05, false);
    forkLed.mat.emissiveIntensity = 2.0;
    sc.add(O.storeFork);
    /* 货架四角的竖向轮廓灯：立库 8 米高，黑场里没有这条线就是一堵黑墙 */
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (p) {
      var cl = ledStrip(.055, H - .4, .055, 0x3fa8cc, .55, null);
      cl.position.set(cx + p[0] * (W / 2 + .02), FLOOR + H / 2, cz + p[1] * (D / 2 + .02));
    });
    var mastLed = ledStrip(.05, H - .8, .05, 0x4fc8f0, .7, null);
    mastLed.position.set(cx + W / 2 - .6, FLOOR + H / 2, cz + .2);
    /* 出料口输送段 */
    var outBelt = new T.Mesh(new T.BoxGeometry(6, .24, 2.6), MAT.alu);
    outBelt.position.set(cx + W / 2 + 2.6, BELT_Y - .12, -3.2); sc.add(outBelt);
    /* 仓库三色灯 + 标签位置 */
    makeTower(cx - W / 2 + .4, FLOOR + H, cz - D / 2 + .4, 'store');
    /* 地面接触暗影（黑灯下也需要一点接地感） */
    glowDecal(cx, cz, 7, 0x2a4456, .06, 1.8, 1.1, FLOOR + .02);
  }

  /* ---------------- 车削单元 CNC-01 ---------------- */
  function buildCNC() {
    var sc = K.scene();
    var cx = PX.cnc, cz = -3.4;
    var W = 7.2, H = 5.2, D = 6.0;
    /* 底座 */
    K.rbox({ x: cx, y: FLOOR + .35, z: cz, sx: W + .6, sy: .7, sz: D + .4, r: .1, mat: MAT.graphite }).castShadow = true;
    /* 机身做成 U 型（后壁 + 两侧 + 顶），前面敞开 —— 实心盒子会把卡盘和刀塔整个包死，
       从观察窗看进去只有一片黑，等于白建内部 */
    var wallZ = cz - D / 2 + .22;
    K.rbox({ x: cx, y: FLOOR + .7 + H / 2, z: wallZ, sx: W, sy: H, sz: .44, r: .12, mat: MAT.shellL }).castShadow = true;
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: cx + sg * (W / 2 - .2), y: FLOOR + .7 + H / 2, z: cz + .15, sx: .4, sy: H, sz: D - .6, r: .1, mat: MAT.shellL }).castShadow = true;
    });
    K.rbox({ x: cx, y: FLOOR + .7 + H - .17, z: cz + .15, sx: W, sy: .34, sz: D - .6, r: .1, mat: MAT.shellD }).castShadow = true;
    /* 内壁背板：给加工区一个浅色反射面，卡盘的轮廓才立得住 */
    var backPanel = new T.Mesh(new T.BoxGeometry(W - 1.1, H - 1.2, .12),
      new T.MeshStandardMaterial({ color: 0xb8c0c7, roughness: .42, metalness: .5, envMapIntensity: .9 }));
    backPanel.position.set(cx, FLOOR + .7 + H / 2, wallZ + .3); sc.add(backPanel);
    /* 门前框 */
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: cx + sg * (W / 2 - .35), y: FLOOR + .7 + H / 2, z: cz + D / 2 - .5, sx: .7, sy: H, sz: .5, r: .1, mat: MAT.shellD }).castShadow = true;
    });
    K.rbox({ x: cx, y: FLOOR + .7 + H - .3, z: cz + D / 2 - .5, sx: W, sy: .6, sz: .5, r: .1, mat: MAT.shellD }).castShadow = true;
    K.rbox({ x: cx, y: FLOOR + .75, z: cz + D / 2 - .5, sx: W, sy: .34, sz: .5, r: .1, mat: MAT.shellD }).castShadow = true;
    /* 门（可滑动）：两扇，中间留加工观察窗 */
    O.cncDoors = [];
    [-1, 1].forEach(function (sg) {
      var d = new T.Group(); d.position.set(cx + sg * 1.52, FLOOR + .7 + H / 2 - .2, cz + D / 2 - .3);
      var DH = H - .9;                       // 门总高
      /* 门做成「框 + 玻璃」：实心板上贴一块玻璃，等于把加工区焊死，什么都看不见 */
      var winBot = -.6, winTop = 1.6;
      var t1 = K.rbox({ x: 0, y: (winTop + DH / 2) / 2, z: 0, sx: 2.7, sy: DH / 2 - winTop, sz: .22, r: .06, mat: MAT.shellD });
      var b1 = K.rbox({ x: 0, y: (-DH / 2 + winBot) / 2, z: 0, sx: 2.7, sy: winBot + DH / 2, sz: .22, r: .06, mat: MAT.shellD });
      var s1 = K.rbox({ x: -1.24, y: (winBot + winTop) / 2, z: 0, sx: .22, sy: winTop - winBot, sz: .22, r: .05, mat: MAT.shellD });
      var s2 = K.rbox({ x: 1.24, y: (winBot + winTop) / 2, z: 0, sx: .22, sy: winTop - winBot, sz: .22, r: .05, mat: MAT.shellD });
      [t1, b1, s1, s2].forEach(function (p2) { d.add(p2); });
      var win = new T.Mesh(new T.BoxGeometry(2.28, winTop - winBot, .04), MAT.glass);
      win.position.set(0, (winBot + winTop) / 2, .05); d.add(win);
      /* 窗口内沿的灯带：黑灯时把观察窗的框勾出来，观众一眼知道「里面在加工」 */
      var winLed = new T.Mesh(new T.BoxGeometry(.05, winTop - winBot - .1, .05),
        new T.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xffb45a, emissiveIntensity: 1.7, roughness: .4 }));
      winLed.position.set(-sg * 1.235, (winBot + winTop) / 2, .12); d.add(winLed);
      var winLed2 = winLed.clone(); winLed2.rotation.z = Math.PI / 2;
      winLed2.scale.set(1, 2.28 / (winTop - winBot - .1), 1);
      winLed2.position.set(0, winTop - .05, .12); d.add(winLed2);
      glows.push({ m: winLed, base: 1.7, keep: true });
      /* 门上把手 */
      var hd = new T.Mesh(new T.BoxGeometry(.08, .5, .1), MAT.steel);
      hd.position.set(-sg * 1.05, .55, .16); d.add(hd);
      sc.add(d);
      O.cncDoors.push({ g: d, home: d.position.x, sg: sg });
    });
    /* 加工区（内部）：卡盘 + 主轴 + 工件 + 刀塔 */
    O.cncInner = new T.Group(); O.cncInner.position.set(cx, FLOOR + 3.2, cz - .3);
    var bed = new T.Mesh(new T.BoxGeometry(5.6, .5, 3.2), MAT.graphite); O.cncInner.add(bed);
    O.chuck = new T.Group(); O.chuck.position.set(0, 1.0, 1.25);
    var ch = new T.Mesh(new T.CylinderGeometry(.92, .92, .7, 26), MAT.steel);
    ch.rotation.x = Math.PI / 2; O.chuck.add(ch);
    for (var j = 0; j < 3; j++) {
      var ja = j / 3 * Math.PI * 2;
      var jaw = new T.Mesh(new T.BoxGeometry(.26, .26, .8), MAT.steel);
      jaw.position.set(Math.sin(ja) * .62, Math.cos(ja) * .62, .35);
      jaw.rotation.z = -ja; O.chuck.add(jaw);
    }
    O.cncInner.add(O.chuck);
    /* 刀塔 */
    O.turret = new T.Group(); O.turret.position.set(0, 1.9, -1.1);
    var tt = new T.Mesh(new T.CylinderGeometry(.5, .5, 1.4, 16), MAT.orange);
    tt.rotation.x = Math.PI / 2; O.turret.add(tt);
    var tool = new T.Mesh(new T.BoxGeometry(.18, .18, 1.1), MAT.steel);
    tool.position.set(.4, .0, .9); O.turret.add(tool);
    O.cncInner.add(O.turret);
    sc.add(O.cncInner);
    /* 内部照明：黑灯时从观察窗里透出的暖光 */
    var innerL = new T.PointLight(0xffe0b8, 4.6, 14, 2);
    innerL.position.set(cx, FLOOR + 3.6, cz + .8); sc.add(innerL); O.cncLight = innerL;
    var glowBar = ledStrip(4.8, .14, .12, 0xffdca8, 1, O.cncInner);
    glowBar.position.set(0, 2.4, 1.1);
    /* 冷却液喷嘴（细流 + 青色小光） */
    var cool = new T.Mesh(new T.CylinderGeometry(.03, .03, .9, 6),
      new T.MeshStandardMaterial({ color: 0x7fe8d8, emissive: 0x38b8a8, emissiveIntensity: 1.4, transparent: true, opacity: .55 }));
    cool.position.set(.7, 1.6, .4); cool.rotation.z = .3; O.cncInner.add(cool);
    O.coolJet = cool;
    /* 切削区的冷却液雾 + 火花：两团加色 sprite，加工时才亮 */
    O.coolMist = new T.Sprite(new T.SpriteMaterial({
      map: glowTex(), color: 0x8fe8e0, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    O.coolMist.scale.set(2.0, 1.5, 1); O.coolMist.position.set(.55, 1.25, .55); O.cncInner.add(O.coolMist);
    O.cutSpark = new T.Sprite(new T.SpriteMaterial({
      map: glowTex(), color: 0xffd08a, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    O.cutSpark.scale.set(1.1, 1.1, 1); O.cutSpark.position.set(.55, 1.42, .5); O.cncInner.add(O.cutSpark);
    /* 内部工作灯：一盏窄光束把卡盘端面扫亮，观察窗里不再是黑洞 */
    var innerSpot = new T.SpotLight(0xffe2bd, 2.2, 9, .72, .55, 1.6);
    innerSpot.position.set(cx + .8, FLOOR + 6.2, cz + 1.6);
    innerSpot.target.position.set(cx, FLOOR + 4.0, cz -.2);
    sc.add(innerSpot); sc.add(innerSpot.target); O.cncSpot = innerSpot;
    /* 右侧控制柜 + 屏幕 */
    K.rbox({ x: cx + W / 2 + .9, y: FLOOR + 1.6, z: cz + 1.2, sx: 1.6, sy: 3.2, sz: 1.4, r: .08, mat: MAT.shellD }).castShadow = true;
    O.cncScreen = makeScreen(1.5, .95);
    O.cncScreen.mesh.position.set(cx + W / 2 + .9, FLOOR + 2.5, cz + 1.94);
    O.cncScreen.mesh.rotation.x = -.25; sc.add(O.cncScreen.mesh);
    var arm2 = new T.Mesh(new T.BoxGeometry(.12, .12, .4), MAT.graphite);
    arm2.position.set(cx + W / 2 + .9, FLOOR + 1.9, cz + 1.95); sc.add(arm2);
    /* 顶部三色灯 + 状态灯带 */
    makeTower(cx + W / 2 - .5, FLOOR + .7 + H, cz - D / 2 + .8, 'cnc');
    var topLed = ledStrip(W - 1.4, .08, .08, 0x4fd0ff, 1, null);
    topLed.position.set(cx, FLOOR + .7 + H - .05, cz + D / 2 - .42);
    /* 机身侧面的检修灯带 + 底部黄黑警示条：黑场里靠这两条线读出机床的体积 */
    [-1, 1].forEach(function (sg) {
      var side = ledStrip(.06, H - 1.2, .06, 0x4fb4d8, .8, null);
      side.position.set(cx + sg * (W / 2 + .01), FLOOR + .7 + H / 2, cz + D / 2 - .35);
    });
    var hazStrip = new T.Mesh(new T.BoxGeometry(W + .7, .2, .05), MAT.haz);
    hazStrip.position.set(cx, FLOOR + .16, cz + D / 2 + .22); sc.add(hazStrip);
    /* 控制柜指示灯 */
    [[0x36e08a, .35], [0xffb020, 0], [0x4fc8ff, -.35]].forEach(function (p, i) {
      glowDot(sc, cx + W / 2 + .55 + p[1], FLOOR + 2.95, cz + 1.94, p[0], .05, false);
    });
    var cabLed = ledStrip(.06, 2.4, .06, 0x4fd0ff, .7, null);
    cabLed.position.set(cx + W / 2 + 1.66, FLOOR + 1.6, cz + 1.2);
    /* 地面：切削区油污反光 */
    glowDecal(cx, cz + 3.2, 5, 0x3a8fc0, .045, 1.9, 1.05);
  }

  /* ---------------- 清洗 / 吹干 ---------------- */
  function buildWash() {
    var sc = K.scene();
    var cx = PX.wash;
    /* 罩体：前后开口，让工件穿过去 */
    K.rbox({ x: cx, y: FLOOR + 2.6, z: BELT_Z - 1.6, sx: 5.2, sy: 5.2, sz: .35, r: .08, mat: MAT.shellD }).castShadow = true;
    K.rbox({ x: cx, y: FLOOR + 5.3, z: BELT_Z, sx: 5.2, sy: .4, sz: 5.2, r: .08, mat: MAT.shellD }).castShadow = true;
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: cx + sg * 2.5, y: FLOOR + 2.6, z: BELT_Z, sx: .35, sy: 5.2, sz: 5.0, r: .08, mat: MAT.shellD }).castShadow = true;
    });
    /* 内部：风刀 + 喷淋环 */
    O.washJets = [];
    for (var i = 0; i < 3; i++) {
      var ring = new T.Mesh(new T.TorusGeometry(1.5, .075, 8, 26),
        new T.MeshStandardMaterial({ color: 0x2f8fa8, emissive: 0x2fa8c0, emissiveIntensity: 1.6, roughness: .4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx - 1.2 + i * 1.2, BELT_Y + 1.5, BELT_Z);
      sc.add(ring); O.washJets.push(ring);
    }
    /* 内部雾光 */
    var wl = new T.PointLight(0x66d8e8, .8, 8, 2);
    wl.position.set(cx, BELT_Y + 2.2, BELT_Z); sc.add(wl);
    /* 水雾：从罩体前口飘出来的一团冷光，黑灯里这团雾就是「在洗」的证据 */
    O.washMist = [];
    for (var m3 = 0; m3 < 2; m3++) {
      var mist = new T.Sprite(new T.SpriteMaterial({
        map: glowTex(), color: 0x9fe8f0, transparent: true, opacity: .16,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      mist.scale.set(3.6, 2.2, 1);
      mist.position.set(cx + (m3 ? 1.5 : -1.4), BELT_Y + 1.5, BELT_Z + 2.2);
      sc.add(mist); O.washMist.push(mist);
    }
    /* 罩体两侧的检修灯带 + 顶部状态条 */
    [-1, 1].forEach(function (sg) {
      var sl2 = ledStrip(.06, 4.4, .06, 0x4fd0e8, .9, null);
      sl2.position.set(cx + sg * 2.68, FLOOR + 2.6, BELT_Z + 2.45);
    });
    var washTop = ledStrip(4.6, .07, .07, 0x5fe0f0, 1.1, null);
    washTop.position.set(cx, FLOOR + 5.51, BELT_Z + 2.5);
    /* 顶部小屏（洁净度） */
    O.washScreen = makeScreen(1.2, .75);
    O.washScreen.mesh.position.set(cx + 2.75, FLOOR + 3.4, BELT_Z + 2.62);
    O.washScreen.mesh.rotation.y = 0; O.washScreen.mesh.rotation.x = -.18;
    sc.add(O.washScreen.mesh);
    makeTower(cx - 2.6, FLOOR + 5.4, BELT_Z + 1.4, 'wash');
    glowDecal(cx, BELT_Z + 2.4, 4, 0x3fb8d0, .04, 1.8, 1.05);
  }

  /* ---------------- 视觉检测 QC-01 ---------------- */
  function buildInsp() {
    var sc = K.scene();
    var cx = PX.insp;
    /* 门架 */
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: cx, y: FLOOR + 3.6, z: BELT_Z + sg * 2.5, sx: .6, sy: 7.2, sz: .6, r: .07, mat: MAT.shellD }).castShadow = true;
    });
    K.rbox({ x: cx, y: FLOOR + 7.15, z: BELT_Z, sx: 1.1, sy: .9, sz: 6.0, r: .09, mat: MAT.shellD }).castShadow = true;
    /* 相机：机身 + 镜头 + 遮光罩 */
    O.camBody = new T.Group(); O.camBody.position.set(cx, FLOOR + 6.5, BELT_Z);
    var body = new T.Mesh(K.geoRoundBox(1.15, 1.0, 1.3, .1), MAT.shellL); body.castShadow = true; O.camBody.add(body);
    var lens = new T.Mesh(new T.CylinderGeometry(.3, .34, .62, 18), MAT.dark);
    lens.position.y = -.72; O.camBody.add(lens);
    var lensGlass = new T.Mesh(new T.CircleGeometry(.26, 18),
      new T.MeshBasicMaterial({ color: 0x1a3a52 }));
    lensGlass.rotation.x = Math.PI / 2; lensGlass.position.y = -1.02; O.camBody.add(lensGlass);
    var hood = new T.Mesh(new T.CylinderGeometry(.62, .78, .38, 18, 1, true), MAT.graphite);
    hood.position.y = -.98; O.camBody.add(hood);
    sc.add(O.camBody);
    /* 环形光源：黑灯时它自己就是一个小太阳 */
    var ringMat = new T.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x8fe8ff, emissiveIntensity: 2.4, roughness: .4 });
    var ring = new T.Mesh(new T.TorusGeometry(.82, .085, 10, 34), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(cx, FLOOR + 5.35, BELT_Z); sc.add(ring);
    O.inspRing = ring;
    var ringHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0x9fe8ff, transparent: true, opacity: .42, blending: T.AdditiveBlending, depthWrite: false }));
    ringHalo.scale.set(5, 5, 1); ringHalo.position.set(cx, FLOOR + 5.35, BELT_Z); sc.add(ringHalo);
    O.inspHalo = ringHalo;
    /* 视场光锥（相机看下去的那束光） */
    var fovG = new T.CylinderGeometry(.28, 1.55, 3.2, 22, 1, true);
    var fovM = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { uOp: { value: .10 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform float uOp; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float up=pow(clamp(vUv.y,0.,1.),1.1); float fr=pow(1.0-abs(dot(normalize(vN),normalize(vV))),1.4); gl_FragColor=vec4(vec3(.45,.92,1.0), up*fr*uOp); }'
    });
    var fov = new T.Mesh(fovG, fovM);
    fov.position.set(cx, FLOOR + 3.75, BELT_Z); sc.add(fov);
    O.inspFov = fov;
    /* 绿色扫描线：检测时在工件表面来回扫的一道激光，画面上最容易读的「在测量」 */
    var scanMat = new T.MeshStandardMaterial({ color: 0x6fffc0, emissive: 0x3ce89a, emissiveIntensity: 2.6, roughness: .35 });
    O.scanLine = new T.Mesh(new T.BoxGeometry(2.9, .025, .08), scanMat);
    O.scanLine.position.set(cx, BELT_Y + .55, BELT_Z);
    O.scanLine.visible = false; sc.add(O.scanLine);
    var scanGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0x5fe8a8, transparent: true, opacity: .45, blending: T.AdditiveBlending, depthWrite: false }));
    scanGlow.scale.set(3.4, 1.1, 1); scanGlow.position.set(cx, BELT_Y + .55, BELT_Z);
    O.scanGlow = scanGlow; scanGlow.visible = false; sc.add(scanGlow);
    /* 门架立柱上的灯带：把 7.2 米高的门架从黑背景里勾出来 */
    [-1, 1].forEach(function (sg) {
      var gl2 = ledStrip(.07, 6.4, .07, 0x4fd8e8, 1.0, null);
      gl2.position.set(cx, FLOOR + 3.6, BELT_Z + sg * 2.82);
      var gl3 = ledStrip(.07, 6.4, .07, 0x4fd8e8, 1.0, null);
      gl3.position.set(cx + (sg > 0 ? .32 : -.32), FLOOR + 3.6, BELT_Z + sg * 2.5);
    });
    var crossLed = ledStrip(1.3, .07, 5.2, 0x5fe0e8, .9, null);
    crossLed.position.set(cx, FLOOR + 7.62, BELT_Z);
    /* 镜头状态灯 */
    glowDot(O.camBody, .36, -.45, .5, 0x4fffc0, .045, false);
    /* 判定屏：挂在门架外侧 */
    O.inspScreen = makeScreen(1.7, 1.06);
    O.inspScreen.mesh.position.set(cx - 2.1, FLOOR + 5.4, BELT_Z + 2.85);
    O.inspScreen.mesh.rotation.y = .18; sc.add(O.inspScreen.mesh);
    K.box({ x: cx - 2.1, y: FLOOR + 4.6, z: BELT_Z + 2.9, sx: .22, sy: 1.6, sz: .22, mat: MAT.graphite });
    makeTower(cx + 1.5, FLOOR + 7.6, BELT_Z + 2.2, 'insp');
    glowDecal(cx, BELT_Z + 1.6, 4.2, 0x4fd8d0, .045, 1.8, 1.05);
  }

  /* ---------------- 激光打码 MK-01 ---------------- */
  function buildMark() {
    var sc = K.scene();
    var cx = PX.mark;
    /* 立柱（在线后）+ 悬臂 */
    K.rbox({ x: cx, y: FLOOR + 3.4, z: BELT_Z - 3.2, sx: .55, sy: 6.8, sz: .55, r: .07, mat: MAT.shellD }).castShadow = true;
    K.rbox({ x: cx, y: FLOOR + 6.5, z: BELT_Z - 1.5, sx: .7, sy: .55, sz: 3.4, r: .08, mat: MAT.shellD }).castShadow = true;
    /* 激光头：机身 + 振镜 + 红色指示灯 */
    O.laserHead = new T.Group(); O.laserHead.position.set(cx, FLOOR + 5.85, BELT_Z);
    var hb = new T.Mesh(K.geoRoundBox(.86, .9, 1.0, .08), MAT.orange); hb.castShadow = true; O.laserHead.add(hb);
    var galvo = new T.Mesh(new T.CylinderGeometry(.3, .34, .3, 16), MAT.steel);
    galvo.position.y = -.58; O.laserHead.add(galvo);
    var emit = new T.Mesh(new T.CircleGeometry(.22, 16),
      new T.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }));
    emit.rotation.x = Math.PI / 2; emit.position.y = -.735; O.laserHead.add(emit);
    sc.add(O.laserHead);
    /* 激光束 */
    var beam = new T.Mesh(new T.CylinderGeometry(.012, .062, 2.05, 10, 1, true),
      new T.MeshBasicMaterial({ color: 0xff5a40, transparent: true, opacity: .75, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    beam.position.set(cx, FLOOR + 4.6, BELT_Z); O.beam = beam; sc.add(beam);
    /* 光束外的红色柔晕：黑灯里单靠一根细线读不出来 */
    var beamHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xff4a30, transparent: true, opacity: .0, blending: T.AdditiveBlending, depthWrite: false }));
    beamHalo.scale.set(2.2, 3.2, 1); beamHalo.position.set(cx, FLOOR + 4.55, BELT_Z);
    O.beamHalo = beamHalo; sc.add(beamHalo);
    /* 打码烟尘：两团慢慢升起、变淡的灰白烟雾 */
    O.smoke = [];
    for (var sm = 0; sm < 3; sm++) {
      var puff = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0x9aa8b0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      puff.scale.set(1.5 + sm * .55, 1.5 + sm * .55, 1);
      puff.position.set(cx + (sm - 1) * .35, BELT_Y + .9 + sm * .55, BELT_Z + (sm - 1) * .22);
      sc.add(puff); O.smoke.push(puff);
    }
    /* 打码火花点 */
    var spark = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    spark.scale.set(2.4, 2.4, 1); spark.position.set(cx, BELT_Y + .72, BELT_Z); O.spark = spark; sc.add(spark);
    /* 读码器（下游）+ 屏幕 */
    K.rbox({ x: cx + 2.6, y: FLOOR + 3.0, z: BELT_Z - 2.4, sx: .4, sy: 5.6, sz: .4, r: .06, mat: MAT.shellD }).castShadow = true;
    K.rbox({ x: cx + 2.6, y: FLOOR + 5.6, z: BELT_Z - 1.3, sx: .5, sy: .45, sz: 2.2, r: .07, mat: MAT.shellD }).castShadow = true;
    var rd = new T.Mesh(new T.BoxGeometry(.34, .3, .34), MAT.graphite);
    rd.position.set(cx + 2.6, FLOOR + 5.3, BELT_Z); sc.add(rd);
    var rdLed = glowDot(sc, cx + 2.6, FLOOR + 5.12, BELT_Z, 0x48e8a0, .05);
    O.readerLed = rdLed;
    O.markScreen = makeScreen(1.35, .85);
    O.markScreen.mesh.position.set(cx + 1.2, FLOOR + 5.9, BELT_Z - 2.95);
    sc.add(O.markScreen.mesh);
    /* 立柱灯带 + 抽风罩：把打码工位从黑背景里「拎」出来 */
    var mkLed = ledStrip(.06, 5.2, .06, 0xff6a50, .9, null);
    mkLed.position.set(cx, FLOOR + 3.4, BELT_Z - 2.9);
    var hood2 = new T.Mesh(new T.CylinderGeometry(.5, .86, .62, 16, 1, true), MAT.graphite);
    hood2.position.set(cx, FLOOR + 6.5, BELT_Z); sc.add(hood2);
    var hoodGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xff7050, transparent: true, opacity: .24, blending: T.AdditiveBlending, depthWrite: false }));
    hoodGlow.scale.set(2.2, 1.4, 1); hoodGlow.position.set(cx, FLOOR + 6.1, BELT_Z); sc.add(hoodGlow);
    makeTower(cx + 3.4, FLOOR + 6.8, BELT_Z - 2.4, 'mark');
    glowDecal(cx, BELT_Z + 1.5, 3.6, 0xff5a40, .045, 1.7, 1.05);
  }

  /* ---------------- 六轴机械臂 ---------------- */
  function makeRobot(cx, cz, id) {
    var sc = K.scene();
    var R = { cx: cx, cz: cz, sy: FLOOR + .7 + 1.1, id: id, cell: 0, held: null };
    /* 基座：铸铁圆盘 + 黄黑警示环 + 地脚 */
    K.cyl({ x: cx, y0: FLOOR, z: cz, r: 1.62, h: .34, seg: 30, mat: MAT.dark });
    var hazRing = new T.Mesh(new T.CylinderGeometry(1.66, 1.66, .14, 30), MAT.haz);
    hazRing.position.set(cx, FLOOR + .39, cz); sc.add(hazRing);
    K.cyl({ x: cx, y0: FLOOR + .46, z: cz, r: 1.38, h: .26, seg: 26, mat: MAT.graphite });

    if (ASSETS.robot) {
      R.rob = ASSETS.robot.clone(true);
      R.rob.position.set(cx, FLOOR + .72, cz);
      R.rob.scale.setScalar(1.12);
      R.rob.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      R.jShoulder = R.rob.getObjectByName('jShoulder');
      R.jElbow = R.rob.getObjectByName('jElbow');
      R.jWrist = R.rob.getObjectByName('jWrist');
      R.grip = R.rob.getObjectByName('grip');
      R.fingerL = R.rob.getObjectByName('fingerL');
      R.fingerR = R.rob.getObjectByName('fingerR');
      sc.add(R.rob);
    } else {
      /* 程序化回退：同样 1.2 / 4.9 的连杆长度，保证 IK 常量一致 */
      R.rob = new T.Group(); R.rob.position.set(cx, FLOOR + .72, cz);
      var turret = new T.Mesh(K.geoRoundBox(2.0, .85, 2.0, .12), MAT.orange); turret.position.y = .45; R.rob.add(turret);
      R.jShoulder = new T.Group(); R.jShoulder.position.set(0, 1.05, 0); R.rob.add(R.jShoulder);
      R.jShoulder.add(new T.Mesh(K.geoRoundBox(1.25, 1.15, 1.35, .14), MAT.shellD));
      R.jElbow = new T.Group(); R.jElbow.position.set(0, 1.2, 0); R.jShoulder.add(R.jElbow);
      var upper = new T.Mesh(K.geoRoundBox(.85, 3.4, .95, .12), MAT.shellL); upper.position.y = 1.7; R.jElbow.add(upper);
      R.jWrist = new T.Group(); R.jWrist.position.set(0, 3.3, 0); R.jElbow.add(R.jWrist);
      var fore = new T.Mesh(K.geoRoundBox(.7, 2.0, .8, .1), MAT.orange); fore.position.y = 1.0; R.jWrist.add(fore);
      R.grip = new T.Group(); R.grip.position.set(0, 2.0, 0); R.jWrist.add(R.grip);
      R.grip.add(new T.Mesh(K.geoRoundBox(1.0, .5, .9, .08), MAT.graphite));
      R.fingerL = new T.Mesh(new T.BoxGeometry(.16, .8, .5), MAT.steel); R.fingerL.position.set(-.3, -.5, 0); R.grip.add(R.fingerL);
      R.fingerR = R.fingerL.clone(); R.fingerR.position.x = .3; R.grip.add(R.fingerR);
      sc.add(R.rob);
    }
    /* 关节挂件：电机盖 / 电缆 / 蓝色示教灯 —— 低模靠这些细节读成工业机器人 */
    var motorMat = new T.MeshStandardMaterial({ color: 0x23282e, roughness: .38, metalness: .78, envMapIntensity: 1.15 });
    var capMat = new T.MeshStandardMaterial({ color: 0x2b3238, roughness: .35, metalness: .8, envMapIntensity: 1.2 });
    if (R.jShoulder) {
      /* 肩部减速机：比臂体更粗的横置圆筒，两端带橙色端盖 */
      var m1 = new T.Mesh(new T.CylinderGeometry(.70, .70, 1.72, 22), motorMat);
      m1.rotation.z = Math.PI / 2; m1.position.set(0, .06, 0); R.jShoulder.add(m1);
      [-1, 1].forEach(function (sg) {
        var c1 = new T.Mesh(new T.CylinderGeometry(.46, .52, .16, 20), capMat);
        c1.rotation.z = Math.PI / 2; c1.position.set(sg * .92, .06, 0); R.jShoulder.add(c1);
        var b1 = new T.Mesh(new T.CylinderGeometry(.16, .16, .1, 10), MAT.steel);
        b1.rotation.z = Math.PI / 2; b1.position.set(sg * 1.0, .06, 0); R.jShoulder.add(b1);
      });
    }
    if (R.jElbow) {
      var m2 = new T.Mesh(new T.CylinderGeometry(.60, .60, 1.34, 20), motorMat);
      m2.rotation.z = Math.PI / 2; m2.position.set(0, 0, 0); R.jElbow.add(m2);
      [-1, 1].forEach(function (sg) {
        var c2 = new T.Mesh(new T.CylinderGeometry(.36, .42, .14, 18), capMat);
        c2.rotation.z = Math.PI / 2; c2.position.set(sg * .74, 0, 0); R.jElbow.add(c2);
      });
      /* 大臂外侧的电缆束（随大臂摆动，读作管线包） */
      [-1, 1].forEach(function (sg) {
        var cb = new T.Mesh(new T.CylinderGeometry(.06, .06, 3.2, 7),
          new T.MeshStandardMaterial({ color: 0x0d1013, roughness: .88 }));
        cb.position.set(sg * .38, 1.55, -.36); R.jElbow.add(cb);
      });
      var bl = glowDot(R.jElbow, 0, 2.62, .42, 0x3fb0ff, .07);
      bl.mat.emissiveIntensity = 2.4;
    }
    if (R.jWrist) {
      var m3 = new T.Mesh(new T.CylinderGeometry(.40, .40, .94, 16), motorMat);
      m3.rotation.z = Math.PI / 2; m3.position.set(0, 0, 0); R.jWrist.add(m3);
      var c3 = new T.Mesh(new T.CylinderGeometry(.26, .3, .12, 14), capMat);
      c3.rotation.z = Math.PI / 2; c3.position.set(.52, 0, 0); R.jWrist.add(c3);
    }
    /* 末端法兰 + 夹具（glb 已带 grip/finger，这里只补一个法兰环） */
    if (R.grip) {
      var fl = new T.Mesh(new T.CylinderGeometry(.36, .36, .18, 16), MAT.steel);
      fl.position.y = .3; R.grip.add(fl);
    }
    /* glb 部件加硬边描边：低模在暗场里靠这道线才不糊成一团 */
    if (ASSETS.robot && R.rob) {
      var lm = new T.LineBasicMaterial({ color: 0x6ea4c4, transparent: true, opacity: .42, depthWrite: false });
      R.rob.traverse(function (o) {
        if (!o.isMesh || !o.geometry) return;
        try {
          var eg = new T.EdgesGeometry(o.geometry, 32);
          var ls = new T.LineSegments(eg, lm);
          ls.renderOrder = 4; o.add(ls);
        } catch (e) { }
      });
    }
    robots.push(R);
    return R;
  }

  /* 两连杆 IK：关节链 肩→肘 1.2，肘→腕 3.3，腕→抓取面 1.6（L1=1.2, L2=4.9） */
  var L1 = 1.2, L2 = 4.9;
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
    var th1 = Math.max(.05, Math.min(1.5, phi + a2));
    R.rob.rotation.y = Math.atan2(dx, dz);
    R.jShoulder.rotation.x = Math.PI / 2 - th1;
    R.jElbow.rotation.x = Math.PI - gamma;
    R.jWrist.rotation.x = Math.PI - (R.jShoulder.rotation.x + R.jElbow.rotation.x);
  }
  function setGrip(R, closed) {
    if (!R.fingerL) return;
    var g = closed ? .12 : .36;
    R.fingerL.position.x = -g;
    R.fingerR.position.x = g;
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

  /* ---------------- 装配单元（R2）+ 工装台 ---------------- */
  function buildAsm() {
    var sc = K.scene();
    var cx = PX.asm;
    O.R2 = makeRobot(cx, ROB_Z, 'asm');
    /* 工装台：在机械臂前右侧，线上方高度 */
    var tx = cx + 4.2, tz = -2.6;
    K.rbox({ x: tx, y: FLOOR + 1.25, z: tz, sx: 2.6, sy: 2.5, sz: 2.6, r: .08, mat: MAT.shellD }).castShadow = true;
    K.box({ x: tx, y: FLOOR + 2.56, z: tz, sx: 2.0, sy: .12, sz: 2.0, mat: MAT.steel });
    /* 定位销 */
    [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]].forEach(function (p) {
      var pin2 = new T.Mesh(new T.CylinderGeometry(.07, .07, .4, 8), MAT.machined);
      pin2.position.set(tx + p[0], FLOOR + 2.8, tz + p[1]); sc.add(pin2);
    });
    /* 工装上的轮毂（装配目标件） */
    O.hubOnFixture = makeHub();
    O.hubOnFixture.position.set(tx, FLOOR + 2.62, tz);
    O.hubOnFixture.scale.set(.92, .92, .92);
    sc.add(O.hubOnFixture);
    /* 气动压钳：两侧各一只，让「压装」这个动作有实物可看 */
    [-1, 1].forEach(function (sg) {
      var clamp = new T.Mesh(K.geoRoundBox(.42, .3, .7, .05), MAT.orange);
      clamp.position.set(tx + sg * .78, FLOOR + 2.74, tz);
      clamp.castShadow = true; sc.add(clamp);
      var rod = new T.Mesh(new T.CylinderGeometry(.06, .06, .55, 8), MAT.machined);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(tx + sg * .55, FLOOR + 2.74, tz); sc.add(rod);
      glowDot(sc, tx + sg * .78, FLOOR + 2.94, tz + .35, 0x4fd0ff, .04, false);
    });
    /* 工装台面的 LED 定位环：工件落位时最醒目的一圈光 */
    var fixRing = new T.Mesh(new T.TorusGeometry(.95, .035, 6, 40),
      new T.MeshStandardMaterial({ color: 0x5fd8ff, emissive: 0x4fc8ff, emissiveIntensity: 1.8, roughness: .35 }));
    fixRing.rotation.x = Math.PI / 2; fixRing.position.set(tx, FLOOR + 2.63, tz); sc.add(fixRing);
    O.fixRing = fixRing;
    /* 拧紧枪（挂在工装旁）+ 屏幕 */
    K.rbox({ x: tx, y: FLOOR + 5.2, z: tz - 1.6, sx: .5, sy: .5, sz: .5, r: .06, mat: MAT.orange }).castShadow = true;
    var sp3 = new T.Mesh(new T.CylinderGeometry(.09, .09, 2.8, 10), MAT.steel);
    sp3.position.set(tx, FLOOR + 3.7, tz - 1.6); sc.add(sp3);
    O.asmScreen = makeScreen(1.6, 1.0);
    O.asmScreen.mesh.position.set(cx - 3.4, FLOOR + 5.0, BELT_Z - 3.2);
    sc.add(O.asmScreen.mesh);
    K.box({ x: cx - 3.4, y: FLOOR + 4.0, z: BELT_Z - 3.25, sx: .22, sy: 2.0, sz: .22, mat: MAT.graphite });
    makeTower(cx - 4.6, FLOOR + 6.4, BELT_Z - 3.2, 'asm2');
    glowDecal(cx, BELT_Z + 1.6, 4.6, 0xffb060, .045, 1.8, 1.05);
  }

  /* ---------------- 码垛单元（R3） ---------------- */
  function buildPalletize() {
    var sc = K.scene();
    var cx = PX.pal;
    O.R3 = makeRobot(cx, ROB_Z, 'pal');
    /* 托盘位 */
    var tx = cx + 4.4, tz = -2.4;
    O.stockPallet = makePallet();
    O.stockPallet.position.set(tx, FLOOR, tz);
    O.stockPallet.rotation.y = 0;
    sc.add(O.stockPallet);
    /* 已码好的成品箱（3 个） */
    O.boxes = [];
    for (var i = 0; i < 3; i++) {
      var b = new T.Mesh(new T.BoxGeometry(2.4, 1.5, 2.0), MAT.carton);
      b.position.set(tx, FLOOR + .55 + i * 1.55, tz);
      b.rotation.y = (i % 2 ? .06 : -.04);
      b.castShadow = true; b.receiveShadow = true; sc.add(b);
      O.boxes.push(b);
      /* 箱侧标签：微弱自发光，黑灯下也能看出「这是贴标成品箱」 */
      var lb = new T.Mesh(new T.PlaneGeometry(.9, .55),
        new T.MeshStandardMaterial({ color: 0xdfe8ee, emissive: 0x9fb4c2, emissiveIntensity: .25, roughness: .8 }));
      lb.position.set(tx, FLOOR + .9 + i * 1.55, tz + 1.01); sc.add(lb);
    }
    /* 托盘位地面框线 + 角灯：码垛的落点要一眼看出来 */
    var palLine = new T.MeshStandardMaterial({ color: 0xc9a02a, emissive: 0x6a4f06, emissiveIntensity: .25, roughness: .62 });
    [[-1.65, 0], [1.65, 0]].forEach(function (p) {
      var l2 = new T.Mesh(new T.BoxGeometry(.12, .035, 3.5), palLine);
      l2.position.set(tx + p[0], FLOOR + .03, tz); sc.add(l2);
    });
    [[0, -1.65], [0, 1.65]].forEach(function (p) {
      var l2 = new T.Mesh(new T.BoxGeometry(3.4, .035, .12), palLine);
      l2.position.set(tx + p[0], FLOOR + .03, tz + p[1]); sc.add(l2);
    });
    [[-1.62, -1.62], [1.62, -1.62], [-1.62, 1.62], [1.62, 1.62]].forEach(function (p) {
      glowDot(sc, tx + p[0], FLOOR + .16, tz + p[1], 0x5fd0ff, .045, false);
    });
    /* 空箱工位 + 折盖机 */
    K.rbox({ x: cx - 3.2, y: FLOOR + 2.2, z: -3.4, sx: 3.0, sy: 4.4, sz: 2.8, r: .1, mat: MAT.shellD }).castShadow = true;
    var mouth = new T.Mesh(new T.BoxGeometry(2.2, .1, 2.0), MAT.dark);
    mouth.position.set(cx - 3.2, FLOOR + 4.42, -3.4); sc.add(mouth);
    var foldLed = ledStrip(2.4, .06, .06, 0x4fc8f0, .9, null);
    foldLed.position.set(cx - 3.2, FLOOR + 4.5, -2.0);
    makeTower(cx - 4.4, FLOOR + 4.6, -3.4, 'pal2');
    /* 码垛 → AGV 的交接台：产线与物流通道之间的转运位，放在 AGV 通道边沿 */
    var spurX = tx, spurZ = 5.3;
    var spur = new T.Mesh(new T.BoxGeometry(3.2, .22, 2.6), MAT.alu);
    spur.position.set(spurX, FLOOR + 1.1, spurZ); spur.receiveShadow = true; sc.add(spur);
    for (var gi = 0; gi < 6; gi++) {
      var gr = new T.Mesh(new T.CylinderGeometry(.085, .085, 3.0, 10), MAT.alu);
      gr.rotation.z = Math.PI / 2;
      gr.position.set(spurX, FLOOR + 1.24, spurZ - 1.0 + gi * .4); sc.add(gr);
    }
    [-1, 1].forEach(function (sg) {
      var rail = new T.Mesh(new T.BoxGeometry(.2, .34, 2.6), MAT.graphite);
      rail.position.set(spurX + sg * 1.6, FLOOR + 1.0, spurZ); sc.add(rail);
      var lg2 = new T.Mesh(new T.BoxGeometry(.22, 1.0, .22), MAT.graphite);
      lg2.position.set(spurX + sg * 1.4, FLOOR + .5, spurZ); sc.add(lg2);
      var sl3 = ledStrip(2.4, .05, .05, 0x4fc8f0, .8, null);
      sl3.position.set(spurX + sg * 1.72, FLOOR + 1.18, spurZ);
    });
    var trPallet = makePallet(); trPallet.position.set(spurX, FLOOR + 1.24, spurZ);
    trPallet.scale.set(.9, .9, .9); sc.add(trPallet);
    /* 交接端的地面停车框 + 导向灯，AGV 停在这里取货 */
    var stopMat = new T.MeshStandardMaterial({ color: 0xc9a02a, emissive: 0x6a4f06, emissiveIntensity: .26, roughness: .62 });
    [[-2.2, 0], [2.2, 0]].forEach(function (p) {
      var l3 = new T.Mesh(new T.BoxGeometry(.16, .035, 4.4), stopMat);
      l3.position.set(spurX + p[0], FLOOR + .03, AGV_Z); sc.add(l3);
    });
    [[0, -2.1], [0, 2.1]].forEach(function (p) {
      var l3 = new T.Mesh(new T.BoxGeometry(4.5, .035, .16), stopMat);
      l3.position.set(spurX + p[0], FLOOR + .03, AGV_Z + p[1]); sc.add(l3);
    });
    [[-2.1, -2.0], [2.1, -2.0]].forEach(function (p) {
      glowDot(sc, spurX + p[0], FLOOR + .18, AGV_Z + p[1], 0x5fd0ff, .05, false);
    });
    glowDecal(cx, BELT_Z + 1.4, 4.4, 0x5fb8e8, .045, 1.8, 1.05);
  }

  /* ---------------- 上料单元（R1） ---------------- */
  function buildLoad() {
    var sc = K.scene();
    var cx = PX.load;
    O.R1 = makeRobot(cx, ROB_Z, 'load');
    /* 上料缓存位（线后侧） */
    var tx = cx - 4.0, tz = -3.0;
    K.rbox({ x: tx, y: FLOOR + 1.2, z: tz, sx: 2.6, sy: 2.4, sz: 2.6, r: .08, mat: MAT.shellD }).castShadow = true;
    O.blankStack = [];
    for (var i = 0; i < 3; i++) {
      var bl = new T.Mesh(new T.CylinderGeometry(.7, .7, .34, 20), MAT.castIron);
      bl.position.set(tx, FLOOR + 2.58 + i * .36, tz);
      bl.castShadow = true; sc.add(bl); O.blankStack.push(bl);
    }
    makeTower(cx + 3.4, FLOOR + 7.4, BELT_Z - 3.0, 'load2');
    /* 缓存位灯圈 + 料垛轮廓：上料工位的主角是「一垛毛坯」，不能被黑吃掉 */
    var loadRing = new T.Mesh(new T.TorusGeometry(1.0, .035, 6, 36),
      new T.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 1.6, roughness: .4 }));
    loadRing.rotation.x = Math.PI / 2; loadRing.position.set(tx, FLOOR + 2.42, tz); sc.add(loadRing);
    var stackLed = ledStrip(1.9, .05, .05, 0xffb060, .9, null);
    stackLed.position.set(tx, FLOOR + 3.72, tz + .95);
    glowDecal(cx, BELT_Z + 1.4, 4.0, 0xffb060, .04, 1.7, 1.05);
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
    /* 顶灯 + 腰灯：黑灯时 AGV 是一团移动的光 */
    var topLamp = new T.Mesh(new T.CylinderGeometry(.34, .3, .26, 14),
      new T.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd98a, emissiveIntensity: 2.6, roughness: .4 }));
    topLamp.position.set(0, 4.2, 1.3); g.add(topLamp);
    var halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xffd98a, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(4.4, 4.4, 1); halo.position.set(0, 4.2, 1.3); g.add(halo);
    var led = new T.Mesh(new T.BoxGeometry(2.7, .09, .05),
      new T.MeshStandardMaterial({ color: 0x4fd0ff, emissive: 0x4fd0ff, emissiveIntensity: 2.8, roughness: .4 }));
    led.position.set(0, .95, -1.76); g.add(led);
    var led2 = led.clone(); led2.position.z = 1.76; g.add(led2);
    /* 车头扫描雷达 */
    var lidar = new T.Mesh(new T.CylinderGeometry(.22, .26, .2, 12), MAT.graphite);
    lidar.position.set(0, 1.6, -1.8); g.add(lidar);
    var lidGlow = glowDot(g, 0, 1.72, -1.8, 0x48ffa0, .05);
    /* 车顶滚筒台面：AGV 不只是「一块板」，上面要有交接机构 */
    var deckRail = new T.Mesh(new T.BoxGeometry(3.0, .12, .18), MAT.graphite);
    deckRail.position.set(0, 1.46, -1.05); g.add(deckRail);
    var deckRail2 = deckRail.clone(); deckRail2.position.z = 1.0; g.add(deckRail2);
    for (var rl = 0; rl < 6; rl++) {
      var roller = new T.Mesh(new T.CylinderGeometry(.09, .09, 2.5, 10), MAT.alu);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, 1.52, -.85 + rl * .35); g.add(roller);
    }
    /* 货箱：有载的 AGV 才像物流设备；箱角加一根捆扎带和一张发光面单 */
    var cargo = new T.Group(); cargo.position.set(0, 1.56, -.05); g.add(cargo);
    var cbox = new T.Mesh(new T.BoxGeometry(1.95, 1.05, 1.7), MAT.carton);
    cbox.position.y = .55; cbox.castShadow = true; cargo.add(cbox);
    var strap = new T.Mesh(new T.BoxGeometry(2.0, 1.08, .12), MAT.dark);
    strap.position.set(0, .55, .12); cargo.add(strap);
    var cLabel = new T.Mesh(new T.PlaneGeometry(.72, .46),
      new T.MeshStandardMaterial({ color: 0xe6f2f8, emissive: 0x9fc4d8, emissiveIntensity: .5, roughness: .7 }));
    cLabel.position.set(0, .62, -.86); cLabel.rotation.y = Math.PI; cargo.add(cLabel);
    /* 红色旋转警示灯：车体自身的安全状态灯，黑灯里最跳的一颗 */
    var warnMat = new T.MeshStandardMaterial({ color: 0xff3a20, emissive: 0xff2a10, emissiveIntensity: 2.6, roughness: .35 });
    var warn = new T.Mesh(new T.SphereGeometry(.17, 12, 10), warnMat);
    warn.position.set(0, 3.62, -1.05); g.add(warn);
    var warnHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xff3a20, transparent: true, opacity: .38, blending: T.AdditiveBlending, depthWrite: false }));
    warnHalo.scale.set(2.4, 2.4, 1); warnHalo.position.copy(warn.position); g.add(warnHalo);
    /* 车头避障扫描扇面：贴地的一层绿光，能看出雷达在「看路」 */
    var fanGeo = new T.CircleGeometry(2.6, 20, Math.PI / 2 - .5, 1.0);
    var fan = new T.Mesh(fanGeo, new T.MeshBasicMaterial({
      color: 0x48ffa0, transparent: true, opacity: .10, blending: T.AdditiveBlending,
      depthWrite: false, side: T.DoubleSide
    }));
    fan.rotation.x = -Math.PI / 2; fan.position.set(0, .1, -1.9);
    fan.renderOrder = 2; g.add(fan);
    /* 前保险杠的黄黑警示条 */
    var bump = new T.Mesh(new T.BoxGeometry(2.9, .22, .06), MAT.haz);
    bump.position.set(0, .5, -1.78); g.add(bump);
    /* 地面光斑（跟随车体） */
    var dec = new T.Mesh(new T.PlaneGeometry(7.5, 5.2),
      new T.MeshBasicMaterial({ map: glowTex(), color: 0xffd08a, transparent: true, opacity: .07, blending: T.AdditiveBlending, depthWrite: false }));
    dec.rotation.x = -Math.PI / 2; dec.position.y = .06; dec.renderOrder = 1; g.add(dec);
    sc.add(g);
    var agvBlob = K.blob({ x: x, y: FLOOR, z: z, r: 2.4 });
    var rec = {
      g: g, fork: fork, beacon: beacon, wheels: wheels, x: x, z: z, ry: 0,
      route: null, wpi: 0, spd: 8.5, carry: null, onArrive: null,
      warn: warn, warnHalo: warnHalo, fan: fan, lidar: lidar,
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
        /* 顶灯呼吸 / 警示灯旋转 / 雷达扇面扫描 */
        var t2 = st._t;
        halo.material.opacity = .38 + Math.sin(t2 * 3) * .12;
        if (rec.warn) {
          var wk = .55 + .45 * Math.abs(Math.sin(t2 * 5.5));
          rec.warn.material.emissiveIntensity = 1.4 + wk * 2.2;
          rec.warnHalo.material.opacity = .16 + wk * .34;
          rec.warnHalo.scale.setScalar(2.0 + wk * .9);
        }
        if (rec.fan) rec.fan.rotation.z = Math.sin(t2 * 1.8) * .55;
        if (rec.lidar) rec.lidar.rotation.y += dt * 3.4;
        if (beacon) beacon.rotation.y += dt * 6;
      }
    };
    return rec;
  }

  /* ---------------- 工件与流转 ---------------- */
  var P = {};
  var CYCLE = 56;                   // 一个节拍（秒，仿真时间）

  function buildParts() {
    var sc = K.scene();
    /* 主托盘 + 主工件：全程跟着走，是「这一件」的主角 */
    P.pallet = makePallet(); sc.add(P.pallet);
    P.work = makeBrakeDisc(true); sc.add(P.work);
    /* 背景件（排队流）：只做匀速通过，撑住画面的忙碌感 */
    P.bg = [];
    for (var i = 0; i < 2; i++) {
      var pl = makePallet(); sc.add(pl);
      var w = makeGearbox(); w.scale.set(.86, .86, .86); sc.add(w);
      P.bg.push({ pallet: pl, work: w, ph: i * .42 + .18 });
    }
    /* R2 抓取的刹车盘（装配用，独立一个） */
    P.asmDisc = makeBrakeDisc(true); P.asmDisc.visible = false; sc.add(P.asmDisc);
    /* AGV：一台走通道，一台停在出货口 */
    O.agv1 = makeAGV(-30, AGV_Z, 1);
    O.agv2 = makeAGV(44, AGV_Z + 1, 2);
    /* 主件初始位（时间轴 t=0） */
    var m0 = mainPos(0);
    P.pallet.position.set(m0.x, BELT_Y + .16, BELT_Z);
    P.work.position.set(m0.x, m0.y, m0.z);
  }

  function easeIO(k) { return k < .5 ? 2 * k * k : -1 + (4 - 2 * k) * k; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var CART_Y = BELT_Y + .30;        // 托盘顶
  var WORK_Y = CART_Y + .26;        // 工件中心（躺平）

  /* 主工件位置：t 为 0..CYCLE */
  function mainPos(t) {
    var x, y = WORK_Y, z = BELT_Z, rotX = 0, hidden = false;
    var cncX = PX.cnc;
    if (t < 4) {                                    // R1 上料：缓存位 → 线上
      var k = easeIO(t / 4);
      x = lerp(-39.2, PX.load, k);
      y = lerp(FLOOR + 2.62, WORK_Y, k);
      z = lerp(-3.0, BELT_Z, k);
    } else if (t < 9) {                             // 输送到 CNC 前
      x = lerp(PX.load, cncX, (t - 4) / 5);
    } else if (t < 12.5) {                          // 门开 + 工件进卡盘
      var k2 = easeIO((t - 9) / 3.5);
      x = cncX;
      y = lerp(WORK_Y, FLOOR + 4.2, k2);
      z = lerp(BELT_Z, -2.2, k2);
      rotX = Math.PI / 2 * k2;
    } else if (t < 20) {                            // 车削
      x = cncX; y = FLOOR + 4.2; z = -2.2; rotX = Math.PI / 2;
    } else if (t < 23.5) {                          // 出料
      var k3 = easeIO((t - 20) / 3.5);
      x = cncX;
      y = lerp(FLOOR + 4.2, WORK_Y, k3);
      z = lerp(-2.2, BELT_Z, k3);
      rotX = Math.PI / 2 * (1 - k3);
    } else if (t < 28) {                            // → 检测
      x = lerp(cncX, PX.insp, (t - 23.5) / 4.5);
    } else if (t < 31) {                            // 检测
      x = PX.insp;
    } else if (t < 35) {                            // → 打码
      x = lerp(PX.insp, PX.mark, (t - 31) / 4);
    } else if (t < 38.5) {                          // 打码
      x = PX.mark;
    } else if (t < 42.5) {                          // → 装配
      x = lerp(PX.mark, PX.asm, (t - 38.5) / 4);
    } else if (t < 46) {                            // R2 抓取装到工装再放回
      x = PX.asm;
      if (t > 43.4 && t < 45.2) { hidden = true; }
    } else if (t < 50.5) {                          // → 码垛
      x = lerp(PX.asm, PX.pal, (t - 46) / 4.5);
    } else if (t < 53.5) {                          // R3 抓取码垛
      x = PX.pal;
      if (t > 51.4 && t < 53.0) { hidden = true; }
    } else {                                        // 托盘回程
      var k4 = (t - 53.5) / 2.5;
      x = lerp(PX.pal, -51, Math.min(1, k4));
    }
    return { x: x, y: y, z: z, rotX: rotX, hidden: hidden };
  }

  /* 各机器人关键帧（目标为「抓取面」世界坐标） */
  var SEQ = {};
  function buildSeqs() {
    var lx = PX.load, lz = ROB_Z;
    SEQ.R1 = [
      [0.00, lx - 4.0, FLOOR + 3.6, -3.0, 0],   // 待机在缓存位上方
      [0.12, lx - 4.0, FLOOR + 2.72, -3.0, 0],  // 下降到毛坯
      [0.26, lx - 4.0, FLOOR + 2.72, -3.0, 1],  // 夹紧
      [0.40, lx - 4.0, FLOOR + 4.2, -3.0, 1],   // 抬起
      [0.64, lx - .2, FLOOR + 4.2, 0, 1],       // 横移到线上方
      [0.80, lx - .2, WORK_Y + .55, 0, 1],      // 下降就位
      [0.88, lx - .2, WORK_Y + .55, 0, 0],      // 松爪
      [1.00, lx - .2, FLOOR + 4.4, 0, 0]        // 退回
    ];
    SEQ.R2 = [
      [0.00, PX.asm, WORK_Y + 3.4, 0, 0],
      [0.16, PX.asm, WORK_Y + .5, 0, 0],
      [0.26, PX.asm, WORK_Y + .5, 0, 1],
      [0.44, PX.asm + 4.2, FLOOR + 4.6, -2.6, 1],
      [0.60, PX.asm + 4.2, FLOOR + 2.55, -2.6, 1], // 放到轮毂上
      [0.72, PX.asm + 4.2, FLOOR + 2.55, -2.6, 0],
      [0.80, PX.asm + 4.2, FLOOR + 4.4, -2.6, 0],
      [0.92, PX.asm, WORK_Y + .5, 0, 0],
      [1.00, PX.asm, WORK_Y + 3.4, 0, 0]
    ];
    SEQ.R3 = [
      [0.00, PX.pal, WORK_Y + 3.4, 0, 0],
      [0.16, PX.pal, WORK_Y + .5, 0, 0],
      [0.26, PX.pal, WORK_Y + .5, 0, 1],
      [0.46, PX.pal + 4.4, FLOOR + 4.8, -2.4, 1],
      [0.66, PX.pal + 4.4, FLOOR + 2.2, -2.4, 1],
      [0.74, PX.pal + 4.4, FLOOR + 2.2, -2.4, 0],
      [0.84, PX.pal + 4.4, FLOOR + 4.6, -2.4, 0],
      [1.00, PX.pal, WORK_Y + 3.6, 0, 0]
    ];
  }

  /* 待机微动：不工作时缓慢呼吸，避免画面死掉 */
  function idleRobot(R, t, ph) {
    /* 待命不是立正：臂要往前探、爪垂在线上方，这才是机器人在「等下一件」 */
    var s = Math.sin(t * .5 + ph) * .42;
    var s2 = Math.cos(t * .38 + ph) * .22;
    solveIK(R, R.cx - 1.0 + s, WORK_Y + 1.9 + s2, ROB_Z + 3.4 + s2 * .6);
    setGrip(R, false);
  }

  /* ---------------- 主更新 ---------------- */
  var _lastT = 0;
  function upd(dt) {
    st._t += dt * st.speed;
    st._simT += dt * st.speed;
    var t = st._t % CYCLE;
    if (t < _lastT && st.run) {                       // 一个节拍完成
      st.done++; st.prod++;
      if (P.boxes && P.boxes.length) {                // 码垛箱往上长一层
        var b = P.boxes[st.done % P.boxes.length];
        b.position.y = FLOOR + .55 + (st.done % 3) * 0 + ((st.done % 3)) * 1.55;
      }
    }
    _lastT = t;

    /* 灯光过渡 */
    st._litT += (st.lit - st._litT) * Math.min(1, dt * 3.2);
    applyMood();

    /* 主工件 */
    var mp = mainPos(t);
    P.pallet.position.set(mp.x, BELT_Y + .16, BELT_Z);
    P.pallet.visible = true;
    if (mp.hidden) {
      P.work.visible = false;
    } else {
      P.work.visible = true;
      P.work.position.set(mp.x, mp.y, mp.z);
      P.work.rotation.x = mp.rotX;
    }
    /* CNC 加工时工件随卡盘转 */
    if (t >= 12.5 && t < 20) {
      O.chuck.rotation.z += dt * 26 * st.speed;
      P.work.rotation.z = Math.PI / 2;
    } else {
      P.work.rotation.z = 0;
    }
    /* 背景件：匀速排队通过 */
    P.bg.forEach(function (b) {
      var frac = ((st._t / 42) + b.ph) % 1;
      var bx = lerp(-51, 52, frac);
      b.pallet.position.set(bx, BELT_Y + .16, BELT_Z);
      b.work.position.set(bx, WORK_Y + .1, BELT_Z);
    });

    /* 机器人 */
    if (st.estop) {
      idleRobot(O.R1, 0, 0); idleRobot(O.R2, 0, 2); idleRobot(O.R3, 0, 4);
    } else {
      if (t >= 0 && t < 4.8) playSeq(O.R1, SEQ.R1, Math.max(0, Math.min(1, t / 4.8)));
      else idleRobot(O.R1, st._t, 0);
      if (t >= 42.5 && t < 46.6) playSeq(O.R2, SEQ.R2, (t - 42.5) / 4.1);
      else idleRobot(O.R2, st._t, 2.1);
      if (t >= 50.5 && t < 54) playSeq(O.R3, SEQ.R3, (t - 50.5) / 3.5);
      else idleRobot(O.R3, st._t, 4.2);
    }

    /* R2 抓取：工件跟着爪子（替换掉线上的那个） */
    if (t > 43.4 && t < 45.2) {
      var gp = O.R2.grip.getWorldPosition(new T.Vector3());
      P.asmDisc.visible = true;
      P.asmDisc.position.set(gp.x, gp.y - 1.5, gp.z);
      P.asmDisc.rotation.y = O.R2.rob.rotation.y;
    } else {
      P.asmDisc.visible = false;
    }
    /* R3 抓取：箱子跟着爪子走 */
    if (t > 51.4 && t < 53.0) {
      var gp2 = O.R3.grip.getWorldPosition(new T.Vector3());
      var bx2 = O.boxes[0];
      bx2.position.set(gp2.x, gp2.y - 1.2, gp2.z);
      bx2.rotation.y = O.R3.rob.rotation.y;
    } else if (P.boxes && P.boxes.length) {
      O.boxes[0].position.set(PX.pal + 4.4, FLOOR + .55 + ((st.done) % 3) * 1.55, -2.4);
      O.boxes[0].rotation.y = 0;
    }

    /* 机床门 / 主轴 / 刀塔 / 冷却液 */
    var doorOpen = (t > 9.2 && t < 12.0) || (t > 20.2 && t < 23.2);
    O.cncDoors.forEach(function (d) {
      var target = d.home + (doorOpen ? -d.sg * 1.35 : 0);
      d.g.position.x += (target - d.g.position.x) * Math.min(1, dt * 4);
    });
    if (t >= 12.5 && t < 20) {
      O.turret.position.z = -1.1 + Math.sin((t - 12.5) * 1.4) * .55;
      O.turret.position.x = Math.sin((t - 12.5) * .7) * .5;
      O.coolJet.visible = true;
      O.coolJet.scale.y = .6 + Math.abs(Math.sin(st._t * 8)) * .5;
      /* 冷却液雾 + 刀尖火花：加工区里有两团会动的高光，观察窗才「活」 */
      O.coolMist.material.opacity = .18 + Math.abs(Math.sin(st._t * 5.2)) * .16;
      O.cutSpark.material.opacity = .25 + Math.abs(Math.sin(st._t * 17)) * .5;
    } else {
      O.turret.position.z += (-1.1 - O.turret.position.z) * Math.min(1, dt * 3);
      O.turret.position.x *= 1 - Math.min(1, dt * 3);
      O.coolJet.visible = false;
      O.coolMist.material.opacity += (0 - O.coolMist.material.opacity) * Math.min(1, dt * 4);
      O.cutSpark.material.opacity += (0 - O.cutSpark.material.opacity) * Math.min(1, dt * 4);
    }

    /* 检测：环形光呼吸 + 扫描闪 */
    var scanning = (t >= 28 && t < 31);
    O.inspRing.material.emissiveIntensity = scanning ? 3.6 + Math.sin(st._t * 18) * .8 : 2.4;
    O.inspHalo.material.opacity = scanning ? .85 : .5;
    O.inspFov.material.uniforms.uOp.value = scanning ? .22 : .10;
    O.camBody.position.y = FLOOR + 6.5 + (scanning ? Math.sin(st._t * 5) * .08 : 0);
    O.scanLine.visible = O.scanGlow.visible = scanning;
    if (scanning) {
      var scanX = PX.insp + Math.sin(st._t * 4.6) * 1.15;
      O.scanLine.position.x = scanX; O.scanGlow.position.x = scanX;
      O.scanGlow.material.opacity = .28 + Math.abs(Math.sin(st._t * 4.6)) * .28;
    }

    /* 打码：激光只在刻码那几秒亮 */
    var marking = (t >= 35 && t < 38.5);
    O.beam.visible = marking;
    O.spark.material.opacity = marking ? (.5 + Math.sin(st._t * 30) * .35) : 0;
    O.beamHalo.material.opacity = marking ? (.28 + Math.abs(Math.sin(st._t * 16)) * .3) : 0;
    if (marking) {
      O.beam.scale.x = O.beam.scale.z = .7 + Math.abs(Math.sin(st._t * 22)) * .6;
      O.laserHead.rotation.y = Math.sin(st._t * 9) * .04;
      /* 烟尘：三团错相升起，到顶后回落重来 */
      O.smoke.forEach(function (p, i) {
        var ph = (st._t * .42 + i * .27) % 1;
        p.position.y = BELT_Y + .8 + ph * 2.4;
        p.position.x = PX.mark + (i - 1) * .32 + Math.sin(st._t * 1.7 + i) * .16;
        p.material.opacity = (1 - ph) * .16;
        p.scale.setScalar(1.1 + ph * 1.8);
      });
    } else {
      O.smoke.forEach(function (p) { p.material.opacity += (0 - p.material.opacity) * Math.min(1, dt * 3); });
    }
    O.readerLed.mat.emissiveIntensity = (t >= 38.5 && t < 41) ? 3.2 : 1.2;

    /* 清洗环脉冲 + 水雾呼吸 */
    O.washJets.forEach(function (r, i) {
      r.material.emissiveIntensity = 1.2 + Math.sin(st._t * 4 + i * 1.1) * .7;
    });
    O.washMist.forEach(function (p, i) {
      p.material.opacity = .10 + .08 * (.5 + .5 * Math.sin(st._t * 2.2 + i * 1.7));
      p.scale.x = 3.4 + Math.sin(st._t * 1.6 + i) * .35;
    });
    /* 装配定位环：压装时闪一下 */
    if (O.fixRing) O.fixRing.material.emissiveIntensity = (t >= 42.5 && t < 46.6) ? 2.6 + Math.sin(st._t * 9) * .9 : 1.4;
    /* 立体库堆垛机：缓慢升降 + 沿货架平移，仓库永远在「工作」 */
    if (O.storeFork) {
      O.storeFork.position.y = FLOOR + 2.0 + (Math.sin(st._t * .32) * .5 + .5) * 3.6;
      O.storeFork.position.z = -4.5 + Math.sin(st._t * .21) * 1.6;
      O.storeFork.position.x = PX.store + 4.4 + Math.sin(st._t * .17) * .5;
    }

    /* 三色灯 / 状态 */
    if (st.estop) allTowers('stop');
    else if (t >= 12.5 && t < 20) activeTower('cnc');
    else if (t >= 28 && t < 31) activeTower('insp');
    else if (t >= 35 && t < 38.5) activeTower('mark');
    else if (t >= 42.5 && t < 46) activeTower('asm2');
    else if (t >= 50.5 && t < 54) activeTower('pal2');
    else if (t < 4.8) activeTower('load2');
    else allTowers('run');

    /* 屏幕 */
    O.cncScreen.show(t >= 12.5 && t < 20 ? 'S3200' : 'READY', t >= 12.5 && t < 20 ? '#5fd0ff' : '#3f8fa8',
      t >= 12.5 && t < 20 ? '车削 φ280' : '待料');
    O.inspScreen.show(scanning ? 'OK' : '—', scanning ? '#4fe0a0' : '#3f8fa8',
      scanning ? 'φ280.02 / 圆度 .008' : '等待工件');
    O.markScreen.show(marking ? 'MARK' : (t >= 38.5 && t < 41 ? 'SCAN' : 'RDY'),
      marking ? '#ff8a60' : (t >= 38.5 && t < 41 ? '#4fe0a0' : '#3f8fa8'),
      marking ? 'DPM 刻码中' : (t >= 38.5 && t < 41 ? '读码成功' : '—'));
    O.asmScreen.show(t >= 42.5 && t < 46.6 ? '24.5' : '—', '#ffc070',
      t >= 42.5 && t < 46.6 ? 'kN 压装力' : '待装配');
    O.washScreen.show('CLEAN', '#5fd0ff', '洁净度 OK');
    if (O.board) O.board.draw(st);

    /* AGV */
    if (st.run && !st.estop) {
      if (t > 6 && t < 13 && O.agv1.x < 40) O.agv1.go([[PX.dock, AGV_Z]]);
      else if (t > 45 && t < 52 && O.agv1.x > 30) O.agv1.go([[-32, AGV_Z]]);
      O.agv1.upd(dt);
      O.agv2.upd(dt);
    }

    /* 剖切：相机高过屋面就隐藏顶棚，像工业可视化的「掀顶」视角；
       否则俯视机位会一头顶在屋面板底面上，画面全黑 */
    var camRef = window.__labDebug && window.__labDebug.camera;
    if (camRef && O.roof) O.roof.visible = camRef.position.y < CEIL + 2.2;

    /* 灯光名单：发光件随「开灯」略微降亮，避免开灯后一片白 */
    var dim = 1 - st._litT * .35;
    for (var i = 0; i < glows.length; i++) {
      if (glows[i].keep) glows[i].m.material.emissiveIntensity = glows[i].base * dim;
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
      var st2 = document.createElement('style');
      st2.textContent = '#dfToast{position:fixed;right:20px;bottom:22px;z-index:8;padding:9px 14px;border-radius:8px;' +
        'font-size:12px;letter-spacing:.02em;background:rgba(5,14,20,.86);color:#bfe0f2;' +
        'border:1px solid rgba(80,160,200,.32);box-shadow:0 8px 24px rgba(0,0,0,.5);' +
        'opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;' +
        'max-width:320px;line-height:1.5}#dfToast.on{opacity:1;transform:none}' +
        '#dfToast.stop{border-color:rgba(255,110,90,.6);color:#ffb0a0}';
      document.head.appendChild(st2);
    }
    toastEl.textContent = msg;
    toastEl.className = 'on' + (tag === 'stop' ? ' stop' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 2600);
  }

  /* ---------------- 机位 ---------------- */
  /* 机位：目标点整体比设备中心偏右一点，让设备落在左侧可视区的中间；
     俯角统一抬高到 0.30~0.34，设备底部（地脚、托盘）和顶部（三色灯、门架）都留出呼吸位。 */
  var CAMS = [
    { tx: -2, tz: -1.6, ty: -11.0, dist: 72, yaw: .58, pitch: .26 },              // 总览：整线入画
    { tx: PX.load + 4.4, tz: -2.4, ty: -11.8, dist: 30, yaw: .42, pitch: .32 },   // 上料 R1 + 缓存料垛
    { tx: PX.cnc + 4.8, tz: -2.6, ty: -12.4, dist: 28, yaw: .30, pitch: .33 },    // 车削 CNC 正面
    { tx: PX.insp + 4.2, tz: -0.8, ty: -11.9, dist: 25, yaw: .24, pitch: .31 },   // 检测门架 + 环形光
    { tx: PX.mark + 4.2, tz: -0.8, ty: -11.9, dist: 23, yaw: .26, pitch: .30 },   // 打码激光头 + 读码器
    { tx: PX.asm + 5.0, tz: -2.2, ty: -11.9, dist: 28, yaw: .36, pitch: .32 },    // 装配 R2 + 工装
    { tx: PX.pal + 5.0, tz: -1.4, ty: -12.0, dist: 36, yaw: .34, pitch: .40 },    // 码垛 R3 + 成品垛 + AGV
    { tx: 2, tz: 2.6, ty: -11.6, dist: 44, yaw: .85, pitch: .30 }                 // 巡检：沿 AGV 通道看整线
  ];
  /* 近景机位只留本工位标签：远端工位在画面左上角会挤成一团，还会压住 MES 看板。
     总览/巡检保留全部标签；映射缺省表示全显。 */
  var labelRecs = [], _labelCam = -1;
  var LABEL_STEP = { 1: [0, 1], 2: [2], 3: [4], 4: [5], 5: [6], 6: [7, 8] };
  function syncLabels() {
    if (st._cam === _labelCam) return;
    _labelCam = st._cam;
    var keep = LABEL_STEP[st._cam];
    for (var i = 0; i < labelRecs.length; i++) {
      labelRecs[i].el.style.visibility = (!keep || keep.indexOf(i) >= 0) ? '' : 'hidden';
    }
  }
  function flyCam(dt) {
    if (!st._fly) return;
    var d = window.__labDebug;
    if (!d || !d.cam) return;
    var c = CAMS[Math.min(CAMS.length - 1, st._cam)], cm = d.cam;
    var k = Math.min(1, dt * 3.0);
    ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch'].forEach(function (f) {
      cm[f] += (c[f] - cm[f]) * k;
    });
    var done = Math.abs(cm.tx - c.tx) < .06 && Math.abs(cm.dist - c.dist) < .12 &&
      Math.abs(cm.tz - c.tz) < .06 && Math.abs(cm.pitch - c.pitch) < .004;
    if (done) st._fly = 0;
  }

  /* ---------------- 组装 ---------------- */
  var postfxFixed = false;
  function fixPostfx() {
    if (postfxFixed) return;
    postfxFixed = true;
    var d = window.__labDebug;
    if (!d || !d.composer) return;
    try {
      /* SSAOPass 兼任主 RenderPass，关掉它会把整个场景停渲染：
         先补一个 RenderPass，再把 SSAO 关掉（暗场里 SSAO 也看不出来） */
      d.composer.passes.unshift(new T.RenderPass(d.scene, d.camera));
      d.composer.passes.forEach(function (p) {
        if (p.kernelRadius !== undefined) p.enabled = false;
      });
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
    var light = new T.CanvasTexture(b);
    return { dark: dark, light: light };
  }

  /* 轮廓线：黑灯里设备几乎只剩剪影，靠一道冷青描边才读得出形体与体块关系 */
  function addOutlines() {
    var sc = K.scene();
    var targets = [];
    sc.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.visible === false) return;
      var m = o.material;
      if (!m || m.transparent || m.isShaderMaterial || m.isMeshBasicMaterial) return;
      var t = o.geometry.type;
      if (t !== 'BoxGeometry' && t !== 'CylinderGeometry') return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var bs = o.geometry.boundingBox.getSize(new T.Vector3());
      var mx = Math.max(bs.x, bs.y, bs.z);
      if (mx < 2.4 || mx > 40) return;
      targets.push(o);
    });
    var lineMat = new T.LineBasicMaterial({ color: 0x619ec0, transparent: true, opacity: .42, depthWrite: false });
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

    /* 收掉引擎默认的明亮实验室背景与陈设 */
    for (var i = sc.children.length - 1; i >= 0; i--) {
      var o = sc.children[i];
      if (!o) continue;
      if (o.geometry && o.geometry.type === 'CircleGeometry') { o.visible = false; continue; }
      if (!o.isLight && o.position && o.position.z < -17) o.visible = false;
      if (o.isGroup && o.position.z < -17) o.visible = false;
    }
    /* 背景与雾 */
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
    buildStore();
    buildCNC();
    buildWash();
    buildInsp();
    buildMark();
    buildLoad();
    buildAsm();
    buildPalletize();
    buildParts();
    buildSeqs();

    /* 材质统一的接地阴影（黑灯下几乎看不出，但开灯后需要） */
    sc.traverse(function (o) {
      if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
    });
    addOutlines();

    /* 工位标签：深底浅字，两种模式都读得清 */
    var LY = FLOOR + 11.2;
    labelRecs = [
      K.label([PX.store, FLOOR + 9.4, -4.5], '立库 AS/RS', 14, 10),
      K.label([PX.load, LY, BELT_Z], '上料 R1'),
      K.label([PX.cnc, LY, BELT_Z], '车削单元 CNC-01'),
      K.label([PX.wash, LY, BELT_Z], '清洗吹干'),
      K.label([PX.insp, LY, BELT_Z], '视觉检测 QC-01'),
      K.label([PX.mark, LY, BELT_Z], '激光打码 MK-01'),
      K.label([PX.asm, LY, BELT_Z], '装配 R2'),
      K.label([PX.pal, LY, BELT_Z], '码垛 R3'),
      K.label([PX.dock, LY - .6, AGV_Z], '出货口')
    ];

    /* 面板用的 CSS */
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
    dg.innerHTML = '<div><span class="k">SHIFT</span> <b id="dgShift">02 夜班</b> <span class="k">·</span> <span class="r" id="dgLit">黑灯</span></div>' +
      '<div><span class="k">TAKT</span> <b id="dgTakt">56.0 s</b> <span class="k">·</span> <span class="k">OEE</span> <b id="dgOee">94.2%</b></div>' +
      '<div><span class="k">OUT</span> <b id="dgOut">0</b> <span class="k">pcs</span> <span class="k">·</span> <span class="k">NG</span> <b id="dgNg">0</b></div>';
    document.body.appendChild(dg);

    window.__dfState = st;
    window.__dfP = P;
    window.__dfO = O;

    applyMood();
    fixPostfx();
    setTimeout(fixPostfx, 300);
  }

  function syncDiag() {
    var s1 = document.getElementById('dgOut'); if (!s1) return;
    s1.textContent = st.done;
    document.getElementById('dgNg').textContent = st.ng;
    document.getElementById('dgLit').textContent = st._litT > .5 ? '照明 开' : '黑灯';
    document.getElementById('dgLit').style.color = st._litT > .5 ? '#ffd98a' : '#ff8a70';
    document.getElementById('dgTakt').textContent = (56 / Math.max(.5, st.speed)).toFixed(1) + ' s';
    document.getElementById('dgOee').textContent = (92 + Math.min(6, st.done * .3)).toFixed(1) + '%';
  }

  /* ---------------- 启动 ---------------- */
  _preloadGLB(function () {
    K.boot({
      title: '黑灯工厂 · 无人车间',
      chip: '虚拟仿真 · 智能制造 · 汽车零部件无人产线',
      hint: '拖空白处旋转视角 · 滚轮缩放 · 点设备可聚焦',
      state: st,
      scene: {
        setup: setup,
        update: function (dt) {
          ensureEnv();
          if (st.run && !st.estop) upd(dt);
          else {
            st._litT += (st.lit - st._litT) * Math.min(1, dt * 3.2);
            applyMood();
          }
          flyCam(dt);
          syncLabels();
          syncDiag();
        }
      },
      postfx: true,
      cam: { ty: -11.0, dist: 72, tx: -2, tz: -1.6, yaw: .58, pitch: .26 },

      reads: [['ph', '当前工序'], ['mode', '运行模式'], ['done', '累计产出'], ['takt', '节拍']],
      values: function (s) {
        var t = st._t % CYCLE;
        var ph = t < 4 ? '上料' : t < 4.8 ? 'R1 取件' : t < 9 ? '输送到 CNC' : t < 12.5 ? '装夹' :
          t < 20 ? '车削加工' : t < 23.5 ? '出料' : t < 28 ? '输送到检测' : t < 31 ? '视觉检测' :
            t < 35 ? '输送到打码' : t < 38.5 ? '激光刻码' : t < 42.5 ? '输送到装配' : t < 46 ? '机器人装配' :
              t < 50.5 ? '输送到码垛' : t < 53.5 ? '机器人码垛' : '托盘回程';
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
              trace(s.lit > .5 ? '值班照明接入 —— 注意：无人产线本不需要开灯' : '照明断开，回车黑灯运行');
            }
          },
          {
            label: '暂停 / 恢复', type: 'btn',
            onClick: function (s) { s.run = !s.run; trace(s.run ? '产线恢复自动运行' : '产线进入暂停待机'); }
          },
          {
            label: '急停 / 复位', type: 'btn',
            onClick: function (s) { s.estop = !s.estop; trace(s.estop ? '急停拍下！全线锁定' : '急停复位', s.estop ? 'stop' : 'info'); }
          },
          { label: '运行倍速', type: 'range', key: 'speed', min: .5, max: 3, step: .25 }
        ];
        function cam(i) { return function (s) { s._cam = i; s._fly = .0001; }; }
        return [
          {
            name: '黑灯', title: '为什么敢把灯关掉',
            ask: '没有人的车间，灯是开给谁看的？',
            body: '<p>这就是<b>黑灯工厂</b>（Lights-Out Manufacturing）：从毛坯上线到成品出货，<b>全程没有一个操作工</b>。人不在场，照明就没有意义——所以整片厂房是暗的，只有设备自己的<b>指示灯、屏幕、激光</b>在发光。</p>' +
              '<p><b>看点：</b>① 天花板上那排工矿灯全是<b>熄的</b>，这是「黑灯」最直白的证据；② 输送线侧梁那条<b>青色灯带</b>，是给人巡检时看「线在哪」用的；③ 远处墙上那块绿色的<b>安全出口</b>，是厂房里唯一常亮的灯。</p>' +
              '<p>点下面的「开灯 / 关灯」按钮对比一下：灯一亮，色彩和阴影全出来了，但电费和人力也回来了。</p>',
            apply: function (s) { cam(0)(s); s.run = true; s.lit = 0; },
            controls: ctl
          },
          {
            name: '上料', title: '第一件毛坯怎么上线',
            ask: '仓库那么高，机器人够得着吗？',
            body: '<p>立库按<b>排-列-层</b>定位，堆垛机把料筐送到出口，<b>R1 上料机器人</b>把毛坯抓到输送线上。它的六轴里，真正决定「够不够得着」的是<b>大臂 + 小臂</b>两段长度——剩下四个轴负责<b>姿态</b>，让夹爪永远垂直于料面。</p>' +
              '<p>注意看它的肘关节：目标是哪，肘就自动弯到哪，这叫<b>逆运动学（IK）</b>。人手去拿杯子时也在做同样的解算，只是你感觉不到。</p>',
            apply: cam(1), controls: ctl
          },
          {
            name: '车削', title: '刹车盘是怎么车出来的',
            ask: '为什么加工的时候要把门关上？',
            body: '<p>封闭式车削单元：卡盘夹住毛坯高速旋转，<b>刀塔</b>按程序进给，把端面车平、把外圆车到 <b>φ280</b>。加工区里那点<b>暖光</b>是机床自己的照明——它不是给车间照明的，是给<b>观察窗</b>用的。</p>' +
              '<p>门必须关：切屑和冷却液会飞出来，而且关上门才能形成<b>安全联锁</b>（门没关到位，主轴不允许启动）。这就是「黑灯」能成立的前提——<b>每个动作都有联锁，不需要人盯着</b>。</p>',
            apply: cam(2), controls: ctl
          },
          {
            name: '检测', title: '黑灯里怎么「看」',
            ask: '车间都黑了，相机还能看清吗？',
            body: '<p>工业视觉<b>自带光源</b>：相机外面那圈<b>环形光</b>把工件照亮，相机只认这一束光。所以车间灯开不开，对测量结果<b>几乎没有影响</b>——这恰恰是黑灯工厂敢关灯的技术底气。</p>' +
              '<p>检测项：外径、圆度、端面跳动。判定结果实时写进 MES，<b>不良品在这里就被拦下</b>，不会流到后面。</p>',
            apply: cam(3), controls: ctl
          },
          {
            name: '刻码', title: '一个零件的身份证',
            ask: '二维码打在哪，才一辈子擦不掉？',
            body: '<p>激光在金属表面烧出 <b>DPM 码</b>（直接零件标识）——不是贴纸，是<b>材料本身的凹坑</b>，耐油、耐高温、不脱落。从那一下闪光开始，这个刹车盘有了唯一编号。</p>' +
              '<p>下游读码器必须读到码才放行；读不到就踢到返修。黑灯工厂里没人拿扫码枪，<b>全靠这一束红光和一台读码器</b>。</p>',
            apply: cam(4), controls: ctl
          },
          {
            name: '装配', title: '机器人的「手感」',
            ask: '把盘装到轮毂上，怎么知道压到位了？',
            body: '<p><b>R2</b> 把刹车盘从线上抓到工装，对正轮毂的五个螺柱，压装到位。夹爪张合的幅度、腕部的角度，全由程序给定——同一个动作重复十万次，<b>误差不会累加</b>，这是人做不到的。</p>' +
              '<p>真实产线这里还有<b>力控</b>：压装力超窗口立即报警。屏幕上那个 kN 读数就是干这个用的。</p>',
            apply: cam(5), controls: ctl
          },
          {
            name: '码垛', title: '最后一步也是机器人',
            ask: '为什么成品要码得这么整齐？',
            body: '<p><b>R3</b> 把装配好的总成抓进包装箱、码到托盘上。<b>AGV</b> 沿地面的黄色磁导航线把整托盘运到出货口——没有叉车司机，也没有人推。</p>' +
              '<p>注意 AGV 车头那颗<b>绿色小灯</b>：那是激光避障雷达在工作，遇到人会自动停。<b>「无人」不等于「无安全」</b>，恰恰相反，黑灯工厂的安全冗余比有人车间更高。</p>',
            apply: cam(6), controls: ctl
          },
          {
            name: '巡检', title: '人还来吗',
            ask: '如果设备半夜坏了，谁来修？',
            body: '<p>黑灯不等于<b>永远没人</b>。白天仍有运维做保养、换刀、处理异常；夜里靠<b>状态监测</b>：主轴振动、电流、温度、气压全在采集，趋势不对就提前报警——<b>预测性维护</b>。</p>' +
              '<p>所以「黑灯」的本质不是省电费，而是<b>把人的判断写进了系统</b>：联锁、视觉、力控、追溯、预警。灯关掉只是结果，不是目的。</p>',
            apply: cam(7), controls: ctl
          }
        ];
      })(),

      quiz: null
    });
  });
})();
