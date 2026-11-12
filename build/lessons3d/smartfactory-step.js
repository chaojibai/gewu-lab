/* 智能车间 · 虚拟仿真（数字孪生产线）
   产线：立体仓库 → AGV 配送 → CNC 加工 → 视觉检测 → 激光刻码 → 机器人装配 → 自动包装 → 成品入库
   所有动作由同一张「工单」状态机驱动；三色灯 / 追溯日志 / 读数均由产线状态实时计算。 */
(function () {
  var T = window.THREE, K = window.Lab;

  /* ---------------- 布局常量 ---------------- */
  var FLOOR = -16;                 // 地坪顶面
  var BELT_Y = -14.6;              // 输送面高度
  var BELT_Z = -4;                 // 输送线纵向位置
  var PX = { io: -34, cnc: -16, insp: 0, mark: 16, asm: 32, pack: 48, end: 53, out: 55 };

  /* ---------------- .glb 真实资产（离线内嵌，build/make_glb.js 由带倒角几何导出） ---------------- */
  var GLB_ROBOT_ARM = "{{GLB_ROBOT_ARM}}";
  var GLB_AGV = "{{GLB_AGV}}";
  var HAVE_GLB = GLB_ROBOT_ARM.length > 200 && GLB_AGV.length > 200;
  var ASSETS = { robot: null, agv: null };

  function _b64ToArr(str) {
    var bin = atob(str), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  /* 材质升级：导出 glb 只有简单 PBR 因子，这里按色号换成清漆车漆 / 亮金属 / 反光石墨，
     让倒角边缘能抓住高光线（去塑料感的核心一步）。自发光件（警示灯/LED）原样保留。 */
  var _upCache = {};
  function _upMat(m) {
    var isEmissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .01;
    var key = (isEmissive ? 'e' : '') + (m.color ? m.color.getHex() : 0);
    if (_upCache[key]) return _upCache[key];
    var out;
    if (isEmissive) {
      m.roughness = Math.min(m.roughness, .5);
      m.envMapIntensity = 1.2;
      out = m;
    } else {
      var c = m.color ? m.color.getHex() : 0;
      if (c === 0xd67c18) {        // 橙色车漆：清漆层（中等强度，避免朝天面掠射角刷白）
        out = new T.MeshPhysicalMaterial({ color: 0xc96f12, roughness: .34, metalness: .12, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: .95 });
      } else if (c === 0x8a9099) { // 钢件：亮金属
        out = new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .22, metalness: 1.0, envMapIntensity: 1.35 });
      } else if (c === 0xe7b22f) { // 黄色安全件
        out = new T.MeshStandardMaterial({ color: 0xdca428, roughness: .42, metalness: .2, envMapIntensity: .9 });
      } else if (c === 0x23282d) { // 橡胶轮
        out = new T.MeshStandardMaterial({ color: 0x1d2126, roughness: .92, metalness: .04 });
      } else {                     // 石墨结构件
        out = new T.MeshStandardMaterial({ color: 0x4b535b, roughness: .4, metalness: .6, envMapIntensity: 1.0 });
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

  var ST_Z = -10.5;                // 工位体中心

  /* ---------------- 状态 ---------------- */
  var st = {
    run: true, speed: 1.25, estop: false,
    _simT: 0,                       // 仿真时钟（秒），起点 08:00:00
    done: 0, ng: 0,
    ph: 'WAIT', _pt: 0,
    job: 2411,
    _cam: 0, _fly: 0
  };

  var O = {};                       // 场景对象登记
  var towers = {};                  // 三色灯
  var rollers = [];                 // 输送辊筒
  var beltMove = 0;                 // 本帧辊筒转速需求

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
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep); t.encoding = T.LinearEncoding; return t;
  }
  function normalTex(w, strength, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w; var x = c.getContext('2d');
    var h = new Float32Array(w * w); var i;
    for (i = 0; i < w * w; i++) h[i] = Math.random();
    var img = x.createImageData(w, w); var d = img.data;
    for (var j = 0; j < w; j++) for (var k2 = 0; k2 < w; k2++) {
      var hl = h[j * w + ((k2 - 1 + w) % w)], hr = h[j * w + ((k2 + 1) % w)];
      var hu = h[((j - 1 + w) % w) * w + k2], hd = h[((j + 1) % w) * w + k2];
      var nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
      var L = Math.sqrt(nx * nx + ny * ny + nz * nz); var o = (j * w + k2) * 4;
      d[o] = (nx / L * .5 + .5) * 255; d[o + 1] = (ny / L * .5 + .5) * 255; d[o + 2] = (nz / L * .5 + .5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep); t.encoding = T.LinearEncoding; return t;
  }
  /* 黄黑安全警示斜纹（给防撞条 / 设备底座踢脚，强化工业感） */
  function hazardTex(rep) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 32;
    var x = c.getContext('2d');
    x.fillStyle = '#e2ad2c'; x.fillRect(0, 0, 128, 32);
    x.fillStyle = '#252a2f';
    for (var i = -32; i < 160; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i - 16, 32); x.lineTo(i - 32, 32);
      x.closePath(); x.fill();
    }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 3, 1); t.encoding = T.sRGBEncoding; return t;
  }

  /* 车间地坪：一张 1024 canvas 画出整个园区平面（环氧地坪 + 分区 + 磁导航道 + 人行道） */
  function floorTexture() {
    var S = 1024, SX = 104, SZ = 58;            // 世界 x[-52,52] z[-28,30]
    var c = document.createElement('canvas'); c.width = S; c.height = S * SZ / SX | 0;
    var x = c.getContext('2d'); var H = c.height;
    var px = function (wx) { return (wx + 52) / SX * S; };
    var py = function (wz) { return (wz + 28) / SZ * H; };
    var su = S / SX;                            // 每世界单位像素数
    /* 环氧地坪底色压暗一档：白机壳、黄分区线才有对比 */
    x.fillStyle = '#79838b'; x.fillRect(0, 0, S, H);
    for (var i = 0; i < 11000; i++) {
      var g = 112 + Math.random() * 34 | 0;
      x.fillStyle = 'rgba(' + g + ',' + (g + 5) + ',' + (g + 10) + ',.28)';
      x.fillRect(Math.random() * S, Math.random() * H, 2, 2);
    }
    /* 伸缩缝 */
    x.strokeStyle = 'rgba(56,66,76,.38)'; x.lineWidth = 1.6;
    for (i = -50; i <= 50; i += 10) { x.beginPath(); x.moveTo(px(i), 0); x.lineTo(px(i), H); x.stroke(); }
    for (i = -26; i <= 30; i += 9.67) { x.beginPath(); x.moveTo(0, py(i)); x.lineTo(S, py(i)); x.stroke(); }
    /* 输送线下方通长深色带：把主通道与作业区分开 */
    x.fillStyle = 'rgba(38,48,56,.15)';
    x.fillRect(px(-37), py(-2.6), 94 * su, 5.0 * su);
    /* 工位分区：每个工艺一个淡淡的功能色，远看也能分出区块 */
    var zones = [
      [-46.5, -15, 33.5, -6, 'rgba(64,112,158,.22)'],   // 立体仓库：蓝
      [-22, -15, -10, -6, 'rgba(176,136,74,.16)'],      // CNC：暖灰
      [-4.5, -15, 4.5, -6, 'rgba(62,140,104,.16)'],     // 检测：绿
      [11.5, -15, 20.5, -6, 'rgba(78,118,178,.16)'],    // 刻码：蓝紫
      [26.5, -15, 39.5, -6, 'rgba(196,132,48,.16)'],    // 装配：橙
      [44, -15, 52, -6, 'rgba(196,168,62,.16)']         // 包装：黄
    ];
    zones.forEach(function (z) {
      x.fillStyle = z[4];
      x.fillRect(px(z[0]), py(z[1]), (z[2] - z[0]) * su, (z[3] - z[1]) * su);
      x.strokeStyle = '#efbe3c'; x.lineWidth = 2.6;
      x.strokeRect(px(z[0]) + 2, py(z[1]) + 2, (z[2] - z[0]) * su - 4, (z[3] - z[1]) * su - 4);
    });
    /* 侧台区：备料 / 入库 */
    x.strokeStyle = '#efbe3c'; x.lineWidth = 2;
    x.strokeRect(px(-31), py(-5.6), 5.6 * su, 3.6 * su);
    x.strokeRect(px(-42.4), py(-5.6), 4.8 * su, 3.6 * su);
    /* AGV 磁导航环线（双黄线，加粗提亮） */
    function lane(x1, z1, x2, z2, w, col) {
      x.strokeStyle = col || '#e0aa24'; x.lineWidth = w || 2.6;
      x.beginPath(); x.moveTo(px(x1), py(z1)); x.lineTo(px(x2), py(z2)); x.stroke();
    }
    var LX1 = -47, LX2 = 55, LZ = 6.5, LW = 1.0;
    lane(LX1, LZ - LW, LX2, LZ - LW); lane(LX1, LZ + LW, LX2, LZ + LW);
    [[-28.5, 4.5], [-34, .9], [55, .9], [-40, .9]].forEach(function (p) {
      lane(p[0] - LW, LZ + LW, p[0] - LW, p[1]); lane(p[0] + LW, LZ + LW, p[0] + LW, p[1]);
      lane(p[0] - LW, p[1], p[0] + LW, p[1]);
    });
    lane(LX1, LZ + LW, LX1 - 1.5, LZ + LW); lane(LX1 - 1.5, LZ - LW, LX1 - 1.5, LZ + LW);
    lane(LX1 - 1.5, LZ - LW, LX1, LZ - LW); lane(LX2, LZ - LW, LX2 + 1.5, LZ - LW);
    lane(LX2 + 1.5, LZ - LW, LX2 + 1.5, LZ + LW); lane(LX2 + 1.5, LZ + LW, LX2, LZ + LW);
    /* 站点停车框：AGV 真正停靠的地面标记（框 + 编号） */
    var stops = [[-28.5, 4.5, 'ST-01'], [-34, .9, 'ST-02'], [55, .9, 'ST-03'], [-40, .9, 'ST-04']];
    stops.forEach(function (s2) {
      x.fillStyle = 'rgba(32,150,210,.18)';
      x.fillRect(px(s2[0] - 2.0), py(s2[1] - 1.6), 4.0 * su, 3.2 * su);
      x.strokeStyle = 'rgba(44,168,226,.9)'; x.lineWidth = 2.2;
      x.strokeRect(px(s2[0] - 2.0), py(s2[1] - 1.6), 4.0 * su, 3.2 * su);
      x.fillStyle = 'rgba(255,255,255,.82)';
      x.font = '600 ' + (su * .62 | 0) + 'px "Microsoft YaHei", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(s2[2], px(s2[0]), py(s2[1] + 1.95));
    });
    /* 人行通道（绿色 + 白边） */
    var WY1 = 15.5, WY2 = 22.5;
    x.fillStyle = 'rgba(40,118,76,.34)'; x.fillRect(px(-50), py(WY1), 100 * su, (WY2 - WY1) * su);
    x.strokeStyle = 'rgba(255,255,255,.78)'; x.lineWidth = 2.6;
    x.strokeRect(px(-50), py(WY1), 100 * su, (WY2 - WY1) * su);
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (i = -48; i < 50; i += 6) {
      x.save(); x.translate(px(i), py(WY1 + 3.5)); x.rotate(-.5);
      x.fillRect(-su * .18, -su * .9, su * .36, su * 1.8); x.restore();
    }
    /* 充电区斜纹 */
    x.save(); x.beginPath(); x.rect(px(-49), py(8.6), 6.4 * su, 2.6 * su); x.clip();
    x.fillStyle = '#e7b73c';
    for (i = 0; i < 14; i++) {
      x.save(); x.translate(px(-49 + i * .55), py(8.6)); x.rotate(.7); x.fillRect(0, -8, su * .22, 40); x.restore();
    }
    x.restore();
    x.strokeStyle = '#e7b73c'; x.lineWidth = 2; x.strokeRect(px(-49), py(8.6), 6.4 * su, 2.6 * su);
    /* 周界黄黑警示条 */
    function hazard(x1, z1, x2, z2, vertical) {
      var n = vertical ? (z2 - z1) / 1.6 : (x2 - x1) / 1.6;
      for (var j = 0; j < n; j++) {
        x.fillStyle = j % 2 ? '#2c3238' : '#e7b73c';
        if (vertical) x.fillRect(px(x1), py(z1 + j * 1.6), (x2 - x1) * su, 1.6 * su);
        else x.fillRect(px(x1 + j * 1.6), py(z1), 1.6 * su, (z2 - z1) * su);
      }
    }
    hazard(-51, -27, 51, -25.6, false);
    hazard(-51, 28.6, 51, 30, false);
    hazard(-51, -25.6, -49.6, 28.6, true);
    hazard(49.6, -25.6, 51, 28.6, true);
    /* 地面大字：先描深色投影再压白字，浅灰地坪上也清楚 */
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 ' + (su * 1.72 | 0) + 'px "Microsoft YaHei", sans-serif';
    var words = [[-40, -1.2, '立体仓库'], [-16, -1.2, '加工 CNC'], [0, -1.2, '视觉检测'],
                 [16, -1.2, '激光刻码'], [32, -1.2, '机器人装配'], [48, -1.2, '自动包装'],
                 [-45.6, 4.4, '充电区'], [-28.5, 2.0, '备料台'], [-40, -8.6, '入库台'],
                 [55.2, .2, '出库口']];
    words.forEach(function (w) {
      x.fillStyle = 'rgba(28,38,48,.30)';
      x.fillText(w[2], px(w[0]) + 2, py(w[1]) + 2);
      x.fillStyle = 'rgba(255,255,255,.95)';
      x.fillText(w[2], px(w[0]), py(w[1]));
    });
    x.font = '600 ' + (su * 1.15 | 0) + 'px "Microsoft YaHei", sans-serif';
    x.fillStyle = 'rgba(255,255,255,.62)';
    x.fillText('AGV 磁导航通道 · 限速 1.5 m/s', px(4), py(9.6));
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding;
    t.anisotropy = 8; return t;
  }

  /* ---------------- 追溯面板（自绘 DOM） ---------------- */
  function trace(msg, tag) {
    var box = document.getElementById('traceB');
    if (!box) return;
    var s = st._simT, hh = 8 + (s / 3600 | 0), mm = (s / 60 | 0) % 60, ss = s % 60 | 0;
    var clock = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    var el = document.createElement('div');
    el.className = 'tr';
    el.innerHTML = '<span class="tt">' + clock + '</span><span class="tj">' + ('W-' + st.job) +
      '</span><span class="tg ' + (tag || 'info') + '">' + msg + '</span>';
    box.appendChild(el);
    while (box.children.length > 9) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  /* ---------------- 三色信号塔 ---------------- */
  function makeTower(x, y, z, key) {
    var g = new T.Group(); g.position.set(x, y, z);
    var dark = new T.MeshStandardMaterial({ color: 0x2c3238, roughness: .5, metalness: .4 });
    var pole = new T.Mesh(new T.CylinderGeometry(.09, .11, 1.5, 10), dark); pole.position.y = .75; g.add(pole);
    var base = new T.Mesh(new T.CylinderGeometry(.3, .36, .22, 12), dark); base.position.y = .06; g.add(base);
    var lamps = [];
    var cols = [[0xd94a45, .16], [0xe8b23c, .42], [0x35b06a, .68]];
    for (var i = 0; i < 3; i++) {
      var lm = new T.MeshStandardMaterial({ color: 0x3a3f45, roughness: .35, emissive: 0x000000, emissiveIntensity: 0 });
      var lp = new T.Mesh(new T.SphereGeometry(.30, 16, 12), lm);
      lp.position.y = 1.6 + cols[i][1]; lp.scale.y = .82; g.add(lp);
      lamps.push({ m: lm, col: cols[i][0] });
    }
    var cap = new T.Mesh(new T.CylinderGeometry(.16, .26, .16, 10), dark); cap.position.y = 2.62; g.add(cap);
    K.scene().add(g);
    var rec = { lamps: lamps, mode: 'off', key: key };
    towers[key] = rec;
    setTower(rec, 'run');
    return rec;
  }
  function setTower(rec, mode) {
    if (!rec) return;
    rec.mode = mode;
    rec.lamps.forEach(function (L, i) {
      var on = (mode === 'run' && i === 2) || (mode === 'busy' && i === 1) || (mode === 'stop' && i === 0);
      if (on) { L.m.color.setHex(L.col); L.m.emissive.setHex(L.col); L.m.emissiveIntensity = 2.2; }
      else { L.m.color.setHex(0x3a3f45); L.m.emissive.setHex(0x000000); L.m.emissiveIntensity = 0; }
    });
  }
  function allTowers(mode) { for (var k2 in towers) setTower(towers[k2], mode); }
  function activeTower(key) {
    for (var k2 in towers) setTower(towers[k2], k2 === key ? 'busy' : (st.estop ? 'stop' : 'run'));
  }

  /* ---------------- 小屏（Canvas 显示） ---------------- */
  function makeScreen(w, h) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 160;
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    var mat = new T.MeshBasicMaterial({ map: tex });
    var m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    var rec = { mesh: m, cv: c, tex: tex, draw: null, last: '' };
    rec.show = function (txt, col, sub) {
      var sig = txt + '|' + col + '|' + (sub || '');
      if (sig === rec.last) return;
      rec.last = sig;
      var g = c.getContext('2d');
      g.fillStyle = '#0d141b'; g.fillRect(0, 0, 256, 160);
      g.strokeStyle = 'rgba(120,150,180,.4)'; g.strokeRect(3, 3, 250, 154);
      g.fillStyle = col; g.font = '600 44px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 128, sub ? 62 : 80);
      if (sub) { g.font = '24px "Microsoft YaHei", sans-serif'; g.fillStyle = '#9fb6c8'; g.fillText(sub, 128, 116); }
      tex.needsUpdate = true;
    };
    return rec;
  }

  /* ---------------- 建材 ---------------- */
  var MAT = {};
  /* 金属反射统一走引擎的 scene.environment（PMREM，kit3d makeEnvMap 生成）。
     早期手搓的 makeGradEnv（非 PMREM canvas）在 PBR 里反射无效，已删除。 */

  function buildMats() {
    // gr1 = 浅色喷涂细颗粒；gr2 = 深色粗颗粒；nr1 = 表面微起伏法线（强度翻倍，去光滑塑料感）
    var gr1 = grainTex(128, .72, .30, 7), nr1 = normalTex(128, 2.0, 6);
    var gr2 = grainTex(128, .48, .42, 10);
    MAT.shellL = new T.MeshPhysicalMaterial({ color: 0xc6cbd1, roughness: .66, metalness: .05, envMapIntensity: .38, roughnessMap: gr1, normalMap: nr1, normalScale: new T.Vector2(.24, .24) });
    MAT.shellD = new T.MeshPhysicalMaterial({ color: 0x333a41, roughness: .5, metalness: .34, envMapIntensity: .7, roughnessMap: gr2, normalMap: nr1, normalScale: new T.Vector2(.16, .16) });
    MAT.graphite = new T.MeshStandardMaterial({ color: 0x3d444b, roughness: .44, metalness: .44, envMapIntensity: .9 });
    MAT.orange = new T.MeshStandardMaterial({ color: 0xd0741a, roughness: .52, metalness: .14, envMapIntensity: .85, roughnessMap: gr2 });
    MAT.safety = new T.MeshStandardMaterial({ color: 0xe3ad28, roughness: .5, metalness: .16, roughnessMap: gr2 });
    MAT.steel = new T.MeshStandardMaterial({ color: 0x8e969e, roughness: .22, metalness: .95, envMapIntensity: 1.35 });
    MAT.alu = new T.MeshStandardMaterial({ color: 0x949ca4, roughness: .3, metalness: .8, envMapIntensity: 1.1 });
    MAT.rubber = new T.MeshStandardMaterial({ color: 0x1f2429, roughness: .92, metalness: .04 });
    MAT.pallet = new T.MeshPhysicalMaterial({ color: 0x225d92, roughness: .6, metalness: .06, envMapIntensity: .45, roughnessMap: gr2, normalMap: nr1, normalScale: new T.Vector2(.12, .12) });
    MAT.work = new T.MeshStandardMaterial({ color: 0x9ba3ab, roughness: .28, metalness: .9, envMapIntensity: 1.1 });
    MAT.carton = new T.MeshStandardMaterial({ color: 0xc39a68, roughness: .84, metalness: .02, roughnessMap: gr2 });
    /* 黄黑警示条 / 地面安全圈 / 状态灯 */
    MAT.hazard = new T.MeshStandardMaterial({ map: hazardTex(3), roughness: .58, metalness: .12, envMapIntensity: .5 });
    MAT.hazardL = new T.MeshStandardMaterial({ map: hazardTex(8), roughness: .6, metalness: .1, envMapIntensity: .4 });
    MAT.ledBlue = new T.MeshStandardMaterial({ color: 0x2f9fe0, emissive: 0x2f9fe0, emissiveIntensity: 1.7, roughness: .4 });
    MAT.ledGreen = new T.MeshStandardMaterial({ color: 0x35b06a, emissive: 0x35b06a, emissiveIntensity: 1.7, roughness: .4 });
    MAT.ledRed = new T.MeshStandardMaterial({ color: 0xd94a45, emissive: 0xd94a45, emissiveIntensity: 1.5, roughness: .4 });
    MAT.ledWarm = new T.MeshStandardMaterial({ color: 0xffe6bd, emissive: 0xffe3b0, emissiveIntensity: 1.6, roughness: .4 });
    MAT.darkGlass = new T.MeshPhysicalMaterial({ color: 0x1a242e, roughness: .12, metalness: .1, transparent: true, opacity: .62, envMapIntensity: 1.4, side: T.DoubleSide, depthWrite: false });
    // 玻璃：去掉 clearcoat（球顶留死白高光的元凶），改用低粗糙 + 低不透明 + 环境反射成形
    MAT.glassD = new T.MeshPhysicalMaterial({ color: 0x141e27, roughness: .14, metalness: 0, transparent: true, opacity: .5, envMapIntensity: 1.3, side: T.DoubleSide, depthWrite: false });
    MAT.blueBin = new T.MeshStandardMaterial({ color: 0x2c75c8, roughness: .56, metalness: .10, roughnessMap: gr2 });
    MAT.tan = new T.MeshStandardMaterial({ color: 0xc2a779, roughness: .84, metalness: .02, roughnessMap: gr2 });
    MAT.green = new T.MeshStandardMaterial({ color: 0x2c824f, roughness: .58, metalness: .10, roughnessMap: gr2 });
  }

  /* ---------------- 接触阴影（落地感，去漂浮塑料玩具感） ---------------- */
  var _shTex = null;
  function shadowTex() {
    if (_shTex) return _shTex;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 3, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,.58)');
    grd.addColorStop(.5, 'rgba(0,0,0,.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c); t.encoding = T.LinearEncoding;
    _shTex = t; return t;
  }
  function shadowPlane(x, z, r, a) {
    var m = new T.Mesh(new T.PlaneGeometry(r * 2.3, r * 2.3),
      new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: a, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + .05, z);
    K.scene().add(m);
  }
  function addContactShadows() {
    var defs = [
      [-40, -10.5, 7.0],     // 立体仓库
      [PX.cnc, -10.5, 6.0],  // CNC 加工单元
      [PX.insp, -10.5, 5.0], // 视觉检测
      [PX.mark, -10.5, 5.0], // 激光刻码
      [34, -9.5, 6.5],       // 机器人装配 + 伺服压机
      [PX.pack, -10.5, 6.0], // 自动包装
      [-28.5, -1.4, 3.5],    // 备料台
      [-40, -4.0, 3.5]       // 入库台
    ];
    defs.forEach(function (d) {
      shadowPlane(d[0], d[1], d[2], .5);          // 外层柔影
      shadowPlane(d[0], d[1], d[2] * 0.6, .62);   // 内层深影，叠出接地感
    });
  }

  /* ---------------- 增强主光对比（压平光、立体感，去塑料感） ---------------- */
  function boostLights() {
    K.scene().traverse(function (o) {
      if (o.isHemisphereLight) o.intensity = .34;        // 压环境光，暗部交给接触阴影
      else if (o.isDirectionalLight) {
        if (o.intensity > 1) {
          o.intensity = 2.15;                            // 主光：斜侧打，棱线出高光
          if (o.color) o.color.setHex(0xfff0d8);
        } else {
          o.intensity = Math.max(o.intensity, .62);      // 补光
        }
      }
    });
    /* 后侧轮廓光略微加强，金属件边缘能立起来 */
    K.scene().traverse(function (o) {
      if (o.isDirectionalLight && o.position.z < -30) o.intensity = 1.0;
    });
  }

  /* ---------------- 强制全场景投影（去“无影悬浮塑料感”根因） ---------------- */
  function enforceShadows() {
    K.scene().traverse(function (o) {
      if (!o.isMesh || !o.material || o.material.transparent) return;
      if (o.geometry && o.geometry.type === 'PlaneGeometry') return; // 地面单独处理
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  /* ---------------- 建造：地坪 ---------------- */
  function buildFloor() {
    var slab = new T.Mesh(new T.BoxGeometry(104, .5, 58),
      new T.MeshStandardMaterial({ color: 0x757f87, roughness: .94, metalness: .02 }));
    slab.position.set(0, FLOOR - .25, 1); slab.receiveShadow = true;
    K.scene().add(slab);
    var top = new T.Mesh(new T.PlaneGeometry(104, 58),
      new T.MeshStandardMaterial({ map: floorTexture(), roughness: .74, metalness: .12, envMapIntensity: .5 }));
    top.rotation.x = -Math.PI / 2; top.position.set(0, FLOOR + .012, 1); top.receiveShadow = true;
    K.scene().add(top);
  }

  /* ---------------- 建造：厂房背景墙（填补远景空白、给金属反射提供结构） ---------------- */
  function buildShell() {
    var W = 108, Hh = 15.5, z = -19.6;
    var c = document.createElement('canvas'); c.width = 2048; c.height = 420;
    var x = c.getContext('2d');
    /* 底：工业灰蓝色墙板 */
    var g = x.createLinearGradient(0, 0, 0, 420);
    g.addColorStop(0, '#aeb8c2'); g.addColorStop(.55, '#98a3ae'); g.addColorStop(1, '#7b8691');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 420);
    /* 竖向墙板分缝 */
    for (var i = 0; i < 2048; i += 46) {
      x.fillStyle = 'rgba(60,72,84,.12)'; x.fillRect(i, 0, 2, 420);
      x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(i + 2, 0, 2, 420);
    }
    /* 上部高窗带：淡蓝天空 + 窗框 */
    var wy = 56, wh = 118;
    var wg = x.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#c9e0f4'); wg.addColorStop(1, '#eaf3fb');
    x.fillStyle = wg; x.fillRect(30, wy, 1988, wh);
    for (i = 30; i < 2020; i += 118) {
      x.fillStyle = 'rgba(92,108,124,.85)'; x.fillRect(i, wy, 8, wh);
    }
    x.fillStyle = 'rgba(92,108,124,.85)'; x.fillRect(30, wy, 1988, 8);
    x.fillRect(30, wy + wh - 8, 1988, 8);
    /* 墙面标语与看板（低对比，不抢主体） */
    x.fillStyle = 'rgba(40,58,74,.72)';
    x.font = '700 58px "Microsoft YaHei", sans-serif';
    x.fillText('智能车间 · 数字孪生产线', 150, 262);
    x.font = '600 26px "Segoe UI", sans-serif';
    x.fillStyle = 'rgba(40,58,74,.45)';
    x.fillText('SMART FACTORY  ·  MES / WMS / AGV 调度', 152, 302);
    /* 右侧电子看板：三行绿色数据条 */
    x.fillStyle = 'rgba(22,34,44,.82)'; x.fillRect(1570, 214, 330, 148);
    x.fillStyle = '#4fd08a'; x.font = '600 22px monospace';
    x.fillText('OEE  92.4%', 1594, 250);
    x.fillText('PLAN  W-2411', 1594, 286);
    x.fillText('STATUS RUN', 1594, 322);
    x.fillStyle = 'rgba(79,208,138,.55)'; x.fillRect(1594, 332, 270, 6);
    /* 墙裙 */
    x.fillStyle = 'rgba(54,64,74,.85)'; x.fillRect(0, 382, 2048, 38);
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
    var wall = new T.Mesh(new T.PlaneGeometry(W, Hh),
      new T.MeshStandardMaterial({ map: tex, roughness: .9, metalness: .04, envMapIntensity: .25 }));
    wall.position.set(0, FLOOR + Hh / 2, z); K.scene().add(wall);
    /* 远景天空：厂房上方不再是一块死灰，给总览与近景背景留出空气感 */
    var skyC = document.createElement('canvas'); skyC.width = 512; skyC.height = 512;
    var sk = skyC.getContext('2d');
    var sg = sk.createLinearGradient(0, 0, 0, 512);
    sg.addColorStop(0, '#8fa7bd'); sg.addColorStop(.60, '#a6bbcc'); sg.addColorStop(.66, '#b3c6d6');
    sg.addColorStop(.78, '#c6d5e1'); sg.addColorStop(.86, '#d8e4ed'); sg.addColorStop(1, '#e8eef4');
    sk.fillStyle = sg; sk.fillRect(0, 0, 512, 512);
    var sun = sk.createRadialGradient(110, 90, 8, 110, 90, 240);
    sun.addColorStop(0, 'rgba(255,248,228,.55)'); sun.addColorStop(1, 'rgba(255,248,228,0)');
    sk.fillStyle = sun; sk.fillRect(0, 0, 512, 512);
    sk.fillStyle = 'rgba(255,255,255,.22)';
    [[40, 150, 210, 26], [300, 210, 170, 20], [90, 300, 250, 18]].forEach(function (cl) {
      sk.beginPath(); sk.ellipse(cl[0], cl[1], cl[2], cl[3], 0, 0, Math.PI * 2); sk.fill();
    });
    /* 远处厂房剪影与排风管，底边落到墙顶视线以下，读作天际线而不是漂浮色块 */
    sk.fillStyle = 'rgba(120,143,164,.5)';
    [[0, 426, 190, 46], [230, 432, 130, 40], [390, 424, 122, 48]].forEach(function (b) {
      sk.fillRect(b[0], b[1], b[2], b[3]);
    });
    sk.fillStyle = 'rgba(105,128,148,.55)';
    [[40, 410, 14, 62], [120, 418, 9, 54], [330, 420, 11, 52], [440, 412, 8, 60]].forEach(function (b) {
      sk.fillRect(b[0], b[1], b[2], b[3]);
    });
    var haze = sk.createLinearGradient(0, 428, 0, 440);
    haze.addColorStop(0, 'rgba(226,236,244,0)'); haze.addColorStop(1, 'rgba(226,236,244,.45)');
    sk.fillStyle = haze; sk.fillRect(0, 428, 512, 12);
    var skyT = new T.CanvasTexture(skyC); skyT.encoding = T.sRGBEncoding;
    var sky = new T.Mesh(new T.PlaneGeometry(420, 200),
      new T.MeshBasicMaterial({ map: skyT }));
    /* 放在默认背景墙(-21)之前、结构柱(-20.5)之后：既盖住灰墙和假窗，又不挡钢柱 */
    sky.position.set(0, 70, -20.7); K.scene().add(sky);
    /* H 型钢立柱 + 顶部横梁，压出厂房进深 */
    var steel = MAT.shellD;
    for (var cx = -48; cx <= 48; cx += 12) {
      K.box({ x: cx, y: FLOOR + 7.2, z: z + .55, sx: .55, sy: 14.4, sz: .7, mat: steel });
      K.box({ x: cx, y: FLOOR + 14.2, z: z + .55, sx: 1.5, sy: .35, sz: .9, mat: steel });
      /* 柱脚安全条 */
      K.box({ x: cx, y: FLOOR + .55, z: z + .9, sx: .62, sy: .9, sz: .12, mat: MAT.hazard });
    }
    K.box({ x: 0, y: FLOOR + 14.5, z: z + .6, sx: W - 2, sy: .4, sz: .8, mat: steel });
    /* 顶部桥架 / 电缆槽 */
    K.box({ x: 0, y: FLOOR + 12.6, z: z + 1.1, sx: W - 4, sy: .22, sz: .6, mat: MAT.alu });
    /* 墙上壁灯：自发光小块，给背景加亮点 */
    for (cx = -42; cx <= 42; cx += 14) {
      K.box({ x: cx, y: FLOOR + 11.5, z: z + .35, sx: 1.1, sy: .28, sz: .2, mat: MAT.ledWarm });
    }
  }

  /* ---------------- 建造：输送线 ---------------- */
  function buildConveyor() {
    var x0 = -34, x1 = 53, len = x1 - x0, cx = (x0 + x1) / 2;
    var rail = new T.MeshStandardMaterial({ color: 0x99a2ab, roughness: .4, metalness: .6, envMapIntensity: .9 });
    [-1.72, 1.72].forEach(function (zz) {
      var r = K.rbox({ x: cx, y: BELT_Y + .28, z: zz, sx: len, sy: .55, sz: .28, r: .06, mat: rail });
      r.castShadow = true;
    });
    /* 皮带面：深胶带 + 横向防滑纹，随输送滚动（offset 由帧循环推进） */
    var bc = document.createElement('canvas'); bc.width = 64; bc.height = 64;
    var bg = bc.getContext('2d');
    bg.fillStyle = '#2a2f34'; bg.fillRect(0, 0, 64, 64);
    bg.fillStyle = '#4d545c'; bg.fillRect(0, 0, 64, 7);       // 横向防滑纹（高对比，强光下仍可辨）
    bg.fillStyle = '#1f2429'; bg.fillRect(0, 40, 64, 5);
    var bt = new T.CanvasTexture(bc);
    bt.wrapS = bt.wrapT = T.RepeatWrapping;
    bt.repeat.set(len / 2.6, 1);                              // 每格 2.6 单位 ≈ 辊距
    bt.encoding = T.LinearEncoding;
    O.beltTex = bt;
    var belt = new T.Mesh(new T.BoxGeometry(len, .14, 3.1),
      new T.MeshStandardMaterial({ color: 0xffffff, map: bt, roughness: .92, metalness: .04 }));
    belt.position.set(cx, BELT_Y - .02, 0);
    belt.receiveShadow = true; K.scene().add(belt);
    var legMat = new T.MeshStandardMaterial({ color: 0x7d858e, roughness: .5, metalness: .5 });
    for (var lx = x0 + 2; lx < x1; lx += 6) {
      K.box({ x: lx, y: BELT_Y - .7, z: -1.45, sx: .32, sy: BELT_Y - FLOOR, sz: .32, mat: legMat });
      K.box({ x: lx, y: BELT_Y - .7, z: 1.45, sx: .32, sy: BELT_Y - FLOOR, sz: .32, mat: legMat });
    }
    /* 辊筒：轴向横跨皮带（沿 Z），藏进皮带下方（只露下缘），顶面线速度与皮带同向（+x） */
    for (var rx = x0 + 1.3; rx < x1 - 1; rx += 2.6) {
      var ro = new T.Mesh(new T.CylinderGeometry(.24, .24, 2.9, 12), MAT.steel);
      ro.rotation.x = Math.PI / 2; ro.position.set(rx, BELT_Y - .33, 0);   // 顶面贴皮带底（-14.69），不外露
      K.scene().add(ro); rollers.push(ro);
    }
    /* 末端过渡台（成品滑出，台面与输送面齐平） */
    K.rbox({ x: 55.2, y: BELT_Y - .15, z: 0, sx: 4.2, sy: .4, sz: 3.2, r: .05, mat: MAT.shellD }).castShadow = true;
    [[53.8, -1.3], [56.6, -1.3], [53.8, 1.3], [56.6, 1.3]].forEach(function (p) {
      K.box({ x: p[0], y: (BELT_Y - .35 + FLOOR) / 2, z: p[1], sx: .26, sy: BELT_Y - .35 - FLOOR, sz: .26, mat: legMat });
    });
    /* —— 细节：侧向导轨（黄色耐磨条）+ 回程托辊横梁 —— */
    [-1.62, 1.62].forEach(function (zz) {
      K.box({ x: cx, y: BELT_Y + .20, z: zz, sx: len, sy: .16, sz: .10, mat: MAT.safety });
    });
    for (var bx = x0 + 1.5; bx < x1; bx += 5.2) {
      K.box({ x: bx, y: BELT_Y - .40, z: 0, sx: .26, sy: .16, sz: 3.35, mat: legMat });
    }
    /* 驱动电机 + 减速箱（东端南侧，读得出“这条线是活的”） */
    K.rbox({ x: 51.4, y: BELT_Y - .62, z: -1.98, sx: 1.35, sy: 1.15, sz: 1.1, r: .08, mat: MAT.shellD }).castShadow = true;
    var mot = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.3, 18), MAT.graphite);
    mot.rotation.z = Math.PI / 2; mot.position.set(52.4, BELT_Y - .62, -1.98); K.scene().add(mot);
    for (var mf = 0; mf < 6; mf++) {
      var fin = new T.Mesh(new T.TorusGeometry(.45, .05, 6, 16), MAT.steel);
      fin.rotation.y = Math.PI / 2; fin.position.set(51.95 + mf * .19, BELT_Y - .62, -1.98); K.scene().add(fin);
    }
    /* 线首控制箱 + 急停按钮 */
    K.rbox({ x: -33.2, y: BELT_Y - .55, z: 2.45, sx: 1.15, sy: 1.5, sz: .75, r: .06, mat: MAT.shellD }).castShadow = true;
    var eStop = new T.Mesh(new T.CylinderGeometry(.16, .16, .1, 14), MAT.ledRed);
    eStop.rotation.x = Math.PI / 2; eStop.position.set(-33.2, BELT_Y + .02, 2.84); K.scene().add(eStop);
    /* 工位定位挡块（托盘每次停准，才谈得上节拍） */
    [PX.cnc, PX.insp, PX.mark, PX.asm, PX.pack].forEach(function (sx) {
      [-1.92, 1.92].forEach(function (zz) {
        K.box({ x: sx, y: BELT_Y + .10, z: zz, sx: .55, sy: .30, sz: .34, mat: MAT.safety });
      });
    });
    /* 安全光栅门（CNC 入口 / 包装入口）：立柱 + 绿色细光束平面 */
    (function () {
      var cc = document.createElement('canvas'); cc.width = 16; cc.height = 128;
      var cg = cc.getContext('2d');
      cg.fillStyle = 'rgba(0,0,0,0)'; cg.fillRect(0, 0, 16, 128);
      cg.fillStyle = 'rgba(84,222,150,.85)';
      for (var yy = 6; yy < 128; yy += 10) cg.fillRect(0, yy, 16, 2);
      var ct = new T.CanvasTexture(cc); ct.wrapS = ct.wrapT = T.RepeatWrapping; ct.repeat.set(1, 1);
      var cm = new T.MeshBasicMaterial({ map: ct, transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false });
      [-23.2, 43.1].forEach(function (xpos) {
        [-2.05, 2.05].forEach(function (zz) {
          K.box({ x: xpos, y: BELT_Y + 1.45, z: zz, sx: .16, sy: 3.1, sz: .16, mat: MAT.safety });
          K.box({ x: xpos, y: BELT_Y + 3.02, z: zz, sx: .34, sy: .2, sz: .26, mat: MAT.graphite });
        });
        var pl = new T.Mesh(new T.PlaneGeometry(4.1, 2.85), cm);
        pl.position.set(xpos, BELT_Y + 1.5, 0); pl.rotation.y = Math.PI / 2;
        K.scene().add(pl);
      });
    })();
  }

  /* ---------------- 建造：托盘 / 工件 / 纸箱 ---------------- */
  function makePallet() {
    var g = new T.Group();
    var deck = new T.Mesh(K.geoRoundBox(3.4, .34, 3.0, .05), MAT.pallet);
    deck.position.y = .28; deck.castShadow = true; g.add(deck);
    [[-1.4, -1.1], [0, -1.1], [1.4, -1.1], [-1.4, 1.1], [0, 1.1], [1.4, 1.1], [-1.4, 0], [0, 0], [1.4, 0]].forEach(function (p) {
      var b = new T.Mesh(new T.BoxGeometry(.5, .22, .5), MAT.pallet);
      b.position.set(p[0], .11, p[1]); g.add(b);
    });
    /* 托盘侧面标签 + 防滑垫（近看不再是一块蓝板） */
    var pc = document.createElement('canvas'); pc.width = 128; pc.height = 48;
    var pgx = pc.getContext('2d');
    pgx.fillStyle = '#eef1f4'; pgx.fillRect(0, 0, 128, 48);
    pgx.fillStyle = '#17608f'; pgx.fillRect(0, 0, 128, 12);
    pgx.fillStyle = '#1a2026';
    for (var pi = 0; pi < 12; pi++) pgx.fillRect(8 + pi * 7, 22, 3 + (pi * 5) % 3, 18);
    var pt = new T.CanvasTexture(pc); pt.encoding = T.sRGBEncoding;
    var pl = new T.Mesh(new T.PlaneGeometry(.95, .34), new T.MeshBasicMaterial({ map: pt }));
    pl.position.set(.55, .29, 1.512); g.add(pl);
    [[-1.35, -1.05], [1.35, -1.05], [-1.35, 1.05], [1.35, 1.05]].forEach(function (p2) {
      var pad = new T.Mesh(new T.BoxGeometry(.42, .05, .42), MAT.rubber);
      pad.position.set(p2[0], .475, p2[1]); g.add(pad);
    });
    return g;
  }
  function makeWorkpiece() {
    var g = new T.Group();
    var body = new T.Mesh(new T.CylinderGeometry(1.02, 1.02, 1.6, 28), MAT.work);
    body.position.y = .8; body.castShadow = true; g.add(body);
    var groove = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, .16, 28), MAT.graphite);
    groove.position.y = 1.18; g.add(groove);
    /* 顶部法兰 + 4 颗螺栓：机加工件的特征线 */
    var flange = new T.Mesh(new T.CylinderGeometry(1.02, 1.12, .16, 28), MAT.steel);
    flange.position.y = 1.62; flange.castShadow = true; g.add(flange);
    for (var bi = 0; bi < 4; bi++) {
      var ang = bi * Math.PI / 2 + Math.PI / 4;
      var bolt = new T.Mesh(new T.CylinderGeometry(.12, .12, .12, 6), MAT.graphite);
      bolt.position.set(Math.cos(ang) * .82, 1.74, Math.sin(ang) * .82); g.add(bolt);
    }
    var bore = new T.Mesh(new T.CylinderGeometry(.34, .34, .04, 20), MAT.graphite);
    bore.position.y = 1.705; g.add(bore);
    /* 刻码贴片（默认透明） */
    var qc = document.createElement('canvas'); qc.width = qc.height = 128;
    var qx = qc.getContext('2d');
    qx.fillStyle = '#1a2026';
    for (var i = 0; i < 12; i++) for (var j = 0; j < 12; j++) {
      if ((i * 7 + j * 13 + ((i * j) % 5)) % 3 < 2) qx.fillRect(6 + i * 10, 6 + j * 10, 8, 8);
    }
    qx.fillStyle = '#e8edf2'; qx.fillRect(46, 46, 36, 36);
    qx.fillStyle = '#1a2026'; qx.fillRect(54, 54, 20, 20);
    var qt = new T.CanvasTexture(qc); qt.encoding = T.sRGBEncoding;
    var decal = new T.Mesh(new T.PlaneGeometry(1.15, 1.15),
      new T.MeshBasicMaterial({ map: qt, transparent: true, opacity: 0 }));
    decal.position.set(0, .85, 1.045); g.add(decal);
    g.userData.decal = decal;
    return g;
  }
  function makeCarton() {
    var g = new T.Group();
    var t = .14, W = 3.2, D = 2.9, Hh = 2.2;
    var bottom = new T.Mesh(new T.BoxGeometry(W, t, D), MAT.carton); bottom.position.y = t / 2; g.add(bottom);
    /* 物流标签贴片（贴标机压印后显现，随箱走完全程） */
    var lc = document.createElement('canvas'); lc.width = 192; lc.height = 128;
    var lx2 = lc.getContext('2d');
    lx2.fillStyle = '#f2f4f6'; lx2.fillRect(0, 0, 192, 128);
    lx2.fillStyle = '#1a2026'; lx2.fillRect(10, 10, 60, 14);
    lx2.font = '12px monospace'; lx2.fillText('W-' + '2411', 78, 22);
    for (var li = 0; li < 10; li++) lx2.fillRect(10, 36 + li * 9, 150 - (li * 13) % 60, 4);
    var lt = new T.CanvasTexture(lc); lt.encoding = T.sRGBEncoding;
    var label = new T.Mesh(new T.PlaneGeometry(.9, .6),
      new T.MeshBasicMaterial({ map: lt, transparent: true, opacity: 0 }));
    label.position.set(1.0, 1.05, D / 2 + .012); g.add(label);
    g.userData.label = label;
    [[0, -D / 2 + t / 2, W, t], [0, D / 2 - t / 2, W, t]].forEach(function (p) {
      var w = new T.Mesh(new T.BoxGeometry(p[2], Hh, t), MAT.carton); w.position.set(p[0], Hh / 2 + t, p[1]); g.add(w);
    });
    [[-W / 2 + t / 2, 0, t, D], [W / 2 - t / 2, 0, t, D]].forEach(function (p) {
      var w = new T.Mesh(new T.BoxGeometry(p[2], Hh, p[3]), MAT.carton); w.position.set(p[0], Hh / 2 + t, p[1]); g.add(w);
    });
    var flaps = [];
    [[-1, -D / 2 + t / 2, W / 2 - t / 2, t], [1, -D / 2 + t / 2, W / 2 - t / 2, t],
     [-1, D / 2 - t / 2, W / 2 - t / 2, t], [1, D / 2 - t / 2, W / 2 - t / 2, t]].forEach(function (p, i) {
      var f = new T.Mesh(new T.BoxGeometry(p[2], .1, p[3]), MAT.carton);
      var pv = new T.Group(); pv.position.set(p[0] * (W / 2 - t / 2) * .98, Hh + t, p[1]);
      f.position.x = -p[0] * (W / 2 - t / 2) / 2;
      pv.rotation.z = p[0] > 0 ? -2.0 : 2.0;
      pv.add(f); g.add(pv); flaps.push({ pv: pv, sgn: p[0] });
    });
    g.userData.flaps = flaps;
    g.visible = false;
    return g;
  }

  /* ---------------- 建造：立体仓库 ---------------- */
  function buildWarehouse() {
    var cx = -40, cz = -10.5, W = 13, D = 9, Hh = 9.5, y0 = FLOOR;
    var rowZ = 2.9;                          // 前后两排货位中心，中间留 3.2 宽堆垛巷道
    /* 立柱：前后各 4 根，中间巷道完全通透 */
    [-6, -2, 2, 6].forEach(function (dx) {
      [-4.15, 4.15].forEach(function (dz) {
        var post = K.rbox({ x: cx + dx, y: y0 + Hh / 2, z: cz + dz, sx: .5, sy: Hh, sz: .5, r: .06, mat: MAT.orange });
        post.castShadow = true;
        /* 柱脚防撞条 */
        K.box({ x: cx + dx, y: y0 + .55, z: cz + dz + (dz > 0 ? .30 : -.30), sx: .56, sy: .9, sz: .1, mat: MAT.hazard });
      });
    });
    O.craneLevels = [];
    for (var lv = 0; lv < 4; lv++) {
      var sy = y0 + 1.35 + lv * 2.1;
      O.craneLevels.push(sy);
      [-1, 1].forEach(function (sg) {
        var rz = cz + sg * rowZ;
        /* 层板（每排一块，中间让出巷道） */
        var panel = K.box({ x: cx, y: sy, z: rz, sx: W - .6, sy: .14, sz: 2.7, mat: MAT.alu });
        panel.receiveShadow = true;
        /* 前后主梁：橙色，货架的“骨架线” */
        [-1, 1].forEach(function (bs) {
          K.box({ x: cx, y: sy + .20, z: rz + bs * 1.32, sx: W - .4, sy: .28, sz: .22, mat: MAT.orange });
        });
      });
      /* 层间斜撑（后方，增加结构可信度） */
      K.box({ x: cx, y: sy + 1.05, z: cz - 4.15, sx: W - .9, sy: .08, sz: .08, mat: MAT.graphite });
      K.box({ x: cx, y: sy + 1.05, z: cz + 4.15, sx: W - .9, sy: .08, sz: .08, mat: MAT.graphite });
    }
    /* 货物：程序生成的小标签贴片（白底黑码，贴片共享材质） */
    var lc = document.createElement('canvas'); lc.width = 96; lc.height = 64;
    var lx2 = lc.getContext('2d');
    lx2.fillStyle = '#eef1f3'; lx2.fillRect(0, 0, 96, 64);
    lx2.fillStyle = '#1a2026'; lx2.fillRect(6, 6, 34, 8);
    for (var li = 0; li < 7; li++) lx2.fillRect(6, 20 + li * 5, 58 - (li * 11) % 34, 2);
    lx2.fillRect(70, 8, 18, 18);
    var lt = new T.CanvasTexture(lc); lt.encoding = T.sRGBEncoding;
    var labelMat = new T.MeshBasicMaterial({ map: lt });
    function cargoBox(w, h, d, km, kind) {
      var bg = new T.Group();
      var body = new T.Mesh(K.geoRoundBox(w, h, d, .07), km);
      body.position.y = h / 2; body.castShadow = true; bg.add(body);
      /* 顶部盖沿 + 打包带：远看不再是一块纯色积木 */
      var lid = new T.Mesh(new T.BoxGeometry(w * .94, .09, d * .94), kind === 2 ? MAT.graphite : MAT.carton);
      lid.position.y = h + .02; bg.add(lid);
      var strap = new T.Mesh(new T.BoxGeometry(w * .12, h * .98, d + .02), MAT.shellD);
      strap.position.y = h / 2; bg.add(strap);
      if (kind !== 2) {
        var lb = new T.Mesh(new T.PlaneGeometry(w * .38, h * .30), labelMat);
        lb.position.set(w * .18, h * .55, d / 2 + .014); bg.add(lb);
      }
      return bg;
    }
    for (lv = 0; lv < 4; lv++) {
      var sy2 = O.craneLevels[lv];
      for (var ci = 0; ci < 4; ci++) for (var dj = 0; dj < 2; dj++) {
        if ((ci * 3 + lv * 5 + dj * 7) % 10 < 3) continue;    // 留出空仓位
        var kind = (ci + lv + dj) % 5;
        var km2 = kind === 1 ? MAT.blueBin : kind === 2 ? MAT.shellD : MAT.tan;
        var hh = 1.35 + ((ci * 5 + lv * 3 + dj) % 3) * .28;
        var bx = cargoBox(2.35, hh, 2.45, km2, kind);
        bx.position.set(cx - 4.5 + ci * 3, sy2 + .10, cz + (dj ? rowZ : -rowZ));
        K.scene().add(bx);
      }
    }
    /* 顶部横梁 + 后侧拉杆 */
    [-4.15, 4.15].forEach(function (zz) {
      K.box({ x: cx, y: y0 + Hh + .25, z: cz + zz, sx: W + .6, sy: .5, sz: .5, mat: MAT.orange });
    });
    K.box({ x: cx, y: y0 + Hh + .05, z: cz, sx: W + .4, sy: .16, sz: 8.6, mat: MAT.graphite });
    /* —— 堆垛机：地轨 + 单立柱 + 载货台 + 双向货叉 ——
       机位放在货架前排外侧（出入库台与货架之间），正面可见立柱与载货台；
       货叉朝 -z 伸入前排货位，避免被整排货架挡住变成“看不见的动作”。 */
    var railZ = cz + 4.75;
    K.box({ x: cx, y: y0 + .07, z: railZ, sx: W - 1.2, sy: .14, sz: .7, mat: MAT.steel });
    K.box({ x: cx, y: y0 + .18, z: railZ + .52, sx: W - 1.0, sy: .18, sz: .16, mat: MAT.hazardL });
    O.crane = new T.Group(); O.crane.position.set(cx, 0, railZ);
    var craneBase = new T.Mesh(K.geoRoundBox(1.25, .55, 1.5, .07), MAT.orange);
    craneBase.position.set(0, y0 + .38, 0); craneBase.castShadow = true; O.crane.add(craneBase);
    /* 立柱加高并换成黄色：高出货架顶梁，避免与橙色立柱“混成一片” */
    var mastH = Hh + 1.1;
    var mast = new T.Mesh(K.geoRoundBox(.44, mastH, .6, .05), MAT.safety);
    mast.position.set(0, y0 + mastH / 2 + .05, 0); mast.castShadow = true; O.crane.add(mast);
    var mastGuide = new T.Mesh(new T.BoxGeometry(1.0, .3, .9), MAT.graphite);
    mastGuide.position.set(0, y0 + mastH + .22, 0); O.crane.add(mastGuide);          // 顶部导向
    var mastStripe = new T.Mesh(new T.BoxGeometry(.06, 7.4, .12), MAT.hazardL);
    mastStripe.position.set(.27, y0 + 5.2, .31); O.crane.add(mastStripe);           // 立柱警示条
    /* 顶部红色航空灯 + 机身铭牌，远看也能识别出这是堆垛机 */
    var mastLamp = new T.Mesh(new T.SphereGeometry(.12, 10, 8), MAT.ledRed);
    mastLamp.position.set(0, y0 + mastH + .52, 0); O.crane.add(mastLamp);
    var sc = document.createElement('canvas'); sc.width = 128; sc.height = 80;
    var sx2 = sc.getContext('2d');
    sx2.fillStyle = '#e2ad2c'; sx2.fillRect(0, 0, 128, 80);
    sx2.fillStyle = '#1d2328'; sx2.fillRect(0, 0, 128, 8); sx2.fillRect(0, 72, 128, 8);
    sx2.font = '700 38px "Segoe UI", sans-serif'; sx2.textAlign = 'center';
    sx2.fillText('SC-01', 64, 54);
    var st2 = new T.CanvasTexture(sc); st2.encoding = T.sRGBEncoding;
    var scSign = new T.Mesh(new T.PlaneGeometry(.8, .5), new T.MeshBasicMaterial({ map: st2 }));
    scSign.position.set(0, y0 + 3.3, .315); O.crane.add(scSign);
    O.craneCar = new T.Group(); O.craneCar.position.set(0, y0 + 4.4, 0); O.crane.add(O.craneCar);
    var carBody = new T.Mesh(K.geoRoundBox(1.35, 1.05, 1.35, .07), MAT.shellD);
    carBody.castShadow = true; O.craneCar.add(carBody);
    var carLed = new T.Mesh(new T.BoxGeometry(.9, .07, .05), MAT.ledGreen);
    carLed.position.set(0, .28, .69); O.craneCar.add(carLed);
    var carBumper = new T.Mesh(new T.BoxGeometry(.9, .10, .05), MAT.safety);
    carBumper.position.set(0, -.10, .69); O.craneCar.add(carBumper);
    var forkPlate = new T.Mesh(new T.BoxGeometry(1.5, .9, .16), MAT.graphite);
    forkPlate.position.set(0, -.72, -.10); O.craneCar.add(forkPlate);
    O.craneFork = new T.Group(); O.craneFork.position.set(0, -.72, 0); O.craneCar.add(O.craneFork);
    [-.46, .46].forEach(function (fx) {
      var tine = new T.Mesh(new T.BoxGeometry(.18, .12, 3.5), MAT.steel);
      tine.position.set(fx, -.02, 1.72); tine.castShadow = true; O.craneFork.add(tine);
    });
    K.scene().add(O.crane);
    O.craneIdx = 0; O.craneT = 0; O.craneExt = 0;
    /* 任务点全部选在前排“空仓位”，货叉伸进去时不会被货物挡住 */
    O.craneSeq = [[0, 1, 1], [1, 2, 1], [3, 3, 1], [1, 0, 1]];
    /* 出入库台（西） + 备料台（东） */
    K.rbox({ x: -40, y: BELT_Y + .2, z: -4, sx: 4.6, sy: .4, sz: 3.4, r: .05, mat: MAT.alu }).castShadow = true;
    [[-41.8, -5.2], [-38.2, -5.2], [-41.8, -2.8], [-38.2, -2.8]].forEach(function (p) {
      K.box({ x: p[0], y: (BELT_Y + FLOOR) / 2, z: p[1], sx: .28, sy: BELT_Y - FLOOR, sz: .28, mat: MAT.graphite });
    });
    /* 出入库台辊道 + 托盘定位块 */
    for (var tr = 0; tr < 4; tr++) {
      var rr = new T.Mesh(new T.CylinderGeometry(.16, .16, 3.0, 10), MAT.steel);
      rr.rotation.x = Math.PI / 2; rr.position.set(-41.7 + tr * 1.15, BELT_Y + .42, -4); K.scene().add(rr);
    }
    K.box({ x: -40, y: BELT_Y + .30, z: -5.75, sx: 4.2, sy: .25, sz: .18, mat: MAT.safety });
    K.rbox({ x: -28.5, y: BELT_Y + .2, z: -1.4, sx: 5.2, sy: .4, sz: 3.4, r: .05, mat: MAT.alu }).castShadow = true;
    [[-30.4, -2.6], [-26.6, -2.6], [-30.4, -.2], [-26.6, -.2]].forEach(function (p) {
      K.box({ x: p[0], y: (BELT_Y + FLOOR) / 2, z: p[1], sx: .28, sy: BELT_Y - FLOOR, sz: .28, mat: MAT.graphite });
    });
    /* 备料台上待用托盘 ×2（西端叠放） */
    O.spare1 = makePallet(); O.spare1.position.set(-30.7, BELT_Y + .4, -1.4); K.scene().add(O.spare1);
    O.spare2 = makePallet(); O.spare2.position.set(-30.7, BELT_Y + .4 + .62, -1.4); K.scene().add(O.spare2);
    makeTower(cx, y0 + Hh + .5, cz + 4.15, 'wh');   // 立在顶梁正上方
  }

  /* ---------------- 建造：CNC 加工单元 ---------------- */
  function buildCNC() {
    var cx = PX.cnc, cz = ST_Z, W = 12, D = 9, Hh = 7.6;
    K.rbox({ x: cx, y: FLOOR + Hh - .25, z: cz, sx: W, sy: .5, sz: D, r: .08, mat: MAT.shellL }).castShadow = true;
    K.rbox({ x: cx, y: FLOOR + Hh / 2, z: cz - D / 2 + .25, sx: W, sy: Hh, sz: .5, r: .08, mat: MAT.shellD }).castShadow = true;
    [-1, 1].forEach(function (sg) {
      K.rbox({ x: cx + sg * (W / 2 - .25), y: FLOOR + Hh / 2, z: cz, sx: .5, sy: Hh, sz: D, r: .08, mat: MAT.shellL }).castShadow = true;
    });
    K.rbox({ x: cx, y: FLOOR + Hh - .9, z: cz - D / 2 + .55, sx: W - 2.4, sy: 2.4, sz: .3, r: .05, mat: MAT.glassD });
    /* 立柱 + 主轴 */
    K.rbox({ x: cx, y: FLOOR + 4.4, z: cz - 2.6, sx: 2.4, sy: 6.4, sz: 2.0, r: .1, mat: MAT.shellD }).castShadow = true;
    O.spindleHead = new T.Group(); O.spindleHead.position.set(cx, FLOOR + 5.2, cz - 2.0);
    var head = new T.Mesh(K.geoRoundBox(2.0, 1.5, 1.7, .12), MAT.graphite); O.spindleHead.add(head);
    O.tool = new T.Mesh(new T.CylinderGeometry(.22, .3, 2.1, 14), MAT.steel);
    O.tool.position.y = -1.7; O.spindleHead.add(O.tool);
    var chuck = new T.Mesh(new T.CylinderGeometry(.5, .5, .4, 16), MAT.graphite);
    chuck.position.y = -2.85; O.spindleHead.add(chuck);
    K.scene().add(O.spindleHead);
    /* 安全光栅（前开口）：细密绿光束，近看是“光幕”而不是一块绿玻璃 */
    var curC = document.createElement('canvas'); curC.width = 32; curC.height = 128;
    var cg2 = curC.getContext('2d');
    cg2.clearRect(0, 0, 32, 128);
    cg2.fillStyle = 'rgba(82,240,152,.95)';
    for (var cy2 = 4; cy2 < 128; cy2 += 8) cg2.fillRect(0, cy2, 32, 2.6);
    var curT = new T.CanvasTexture(curC); curT.wrapS = curT.wrapT = T.RepeatWrapping; curT.repeat.set(2, 1);
    /* 淡绿底光：让光幕在深色门体前也能读出“绿色安全光” */
    var curGlow = new T.Mesh(new T.PlaneGeometry(W - 1.4, Hh - 1.4),
      new T.MeshBasicMaterial({ color: 0x46ff9e, transparent: true, opacity: .10, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    curGlow.position.set(cx, FLOOR + Hh / 2 - .4, cz + D / 2 + .15); K.scene().add(curGlow);
    var curtain = new T.Mesh(new T.PlaneGeometry(W - 1.4, Hh - 1.4),
      new T.MeshBasicMaterial({ map: curT, transparent: true, opacity: .72, side: T.DoubleSide, depthWrite: false }));
    curtain.position.set(cx, FLOOR + Hh / 2 - .4, cz + D / 2 + .16); K.scene().add(curtain);
    /* 操控屏 */
    O.cncScreen = makeScreen(2.6, 1.7);
    O.cncScreen.mesh.position.set(cx + W / 2 - .1, FLOOR + 4.6, cz + D / 2 - 1.6);
    O.cncScreen.mesh.rotation.y = -1.15; K.scene().add(O.cncScreen.mesh);
    K.box({ x: cx + W / 2 - .4, y: FLOOR + 3.4, z: cz + D / 2 - 1.9, sx: .3, sy: 2.6, sz: .3, mat: MAT.graphite });
    O.cncDoor = [];   // 滑门两片（深色机身 + 观察窗）
    [-1, 1].forEach(function (sg) {
      var d = K.rbox({ x: cx + sg * 2.6, y: FLOOR + 2.6, z: cz + D / 2 - .1, sx: 4.6, sy: 4.2, sz: .3, r: .06, mat: MAT.shellD });
      d.castShadow = true;
      var win = K.box({ x: cx + sg * 2.6, y: FLOOR + 3.3, z: cz + D / 2 + .08, sx: 2.6, sy: 1.5, sz: .06, mat: MAT.glassD });
      win.castShadow = false;
      /* 观察窗窗框：跟随门体一起滑动 */
      [-1.35, 1.35].forEach(function (fx) {
        var bar = new T.Mesh(new T.BoxGeometry(.08, 1.62, .05), MAT.steel);
        bar.position.set(fx, .7, .17); d.add(bar);
      });
      var hbar = new T.Mesh(new T.BoxGeometry(2.76, .08, .05), MAT.steel);
      hbar.position.set(0, .7, .17); d.add(hbar);
      O.cncDoor.push({ m: d, w: win, sg: sg, x0: cx + sg * 2.6 });
    });
    /* —— 细节：底座黄黑踢脚、内腔工作灯、排屑器、冷却液管、侧面警示牌 —— */
    K.box({ x: cx, y: FLOOR + .38, z: cz + D / 2 + .10, sx: W - .5, sy: .76, sz: .12, mat: MAT.hazard });
    var inGlow = new T.Mesh(new T.PlaneGeometry(W - 3.0, 3.2),
      new T.MeshBasicMaterial({ color: 0xaddcff, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false }));
    inGlow.position.set(cx, FLOOR + 3.5, cz - 3.3); K.scene().add(inGlow);
    var workLight = new T.PointLight(0xaad8ff, .75, 15, 2);
    workLight.position.set(cx, FLOOR + 4.2, cz - 2.2); K.scene().add(workLight);
    /* 排屑器（左前） */
    K.rbox({ x: cx - W / 2 - .55, y: FLOOR + .75, z: cz + 1.3, sx: .9, sy: 1.5, sz: 2.3, r: .06, mat: MAT.shellD }).castShadow = true;
    var auger = new T.Mesh(new T.CylinderGeometry(.18, .18, 2.1, 10), MAT.steel);
    auger.rotation.x = Math.PI / 2; auger.position.set(cx - W / 2 - .55, FLOOR + 1.1, cz + 1.3); K.scene().add(auger);
    /* 冷却液软管：从机顶弯到主轴，补足“活设备”的管线 */
    K.rod([cx - 2.4, FLOOR + 7.15, cz - 2.3], [cx - 1.1, FLOOR + 6.0, cz - 1.7], .07, { mat: MAT.rubber });
    K.rod([cx - 1.1, FLOOR + 6.0, cz - 1.7], [cx - .35, FLOOR + 5.05, cz - 1.5], .07, { mat: MAT.rubber });
    K.box({ x: cx - 2.5, y: FLOOR + 7.25, z: cz - 2.3, sx: .5, sy: .4, sz: .5, mat: MAT.graphite });
    /* 顶置电柜 / 排风 */
    K.rbox({ x: cx + 2.2, y: FLOOR + 7.55, z: cz - 2.8, sx: 2.6, sy: 1.0, sz: 2.0, r: .06, mat: MAT.shellL }).castShadow = true;
    K.box({ x: cx + 2.2, y: FLOOR + 8.05, z: cz - 2.8, sx: 1.0, sy: .18, sz: 1.0, mat: MAT.graphite });
    /* 侧门警示牌（自绘） */
    var signC = document.createElement('canvas'); signC.width = 96; signC.height = 128;
    var sgx = signC.getContext('2d');
    sgx.fillStyle = '#e2ad2c'; sgx.fillRect(0, 0, 96, 128);
    sgx.fillStyle = '#1d2328'; sgx.beginPath();
    sgx.moveTo(48, 18); sgx.lineTo(82, 74); sgx.lineTo(14, 74); sgx.closePath(); sgx.fill();
    sgx.fillStyle = '#e2ad2c'; sgx.font = '700 34px sans-serif'; sgx.textAlign = 'center';
    sgx.fillText('!', 48, 66);
    sgx.fillStyle = '#1d2328'; sgx.font = '600 15px "Microsoft YaHei", sans-serif';
    sgx.fillText('主轴旋转', 48, 96); sgx.fillText('禁止开门', 48, 114);
    var sT = new T.CanvasTexture(signC); sT.encoding = T.sRGBEncoding;
    var sign = new T.Mesh(new T.PlaneGeometry(.72, .96), new T.MeshBasicMaterial({ map: sT }));
    sign.position.set(cx + W / 2 + .27, FLOOR + 2.35, cz + 1.4); sign.rotation.y = Math.PI / 2; K.scene().add(sign);
    makeTower(cx + W / 2 - .8, FLOOR + Hh, cz - 1.6, 'cnc');
  }

  /* ---------------- 建造：视觉检测单元 ---------------- */
  function buildInsp() {
    var cx = PX.insp;
    [-2.9, 2.9].forEach(function (dx) {
      var post = K.rbox({ x: cx + dx, y: FLOOR + 3.6, z: BELT_Z, sx: .5, sy: 7.2, sz: .5, r: .06, mat: MAT.shellD });
      post.castShadow = true;
    });
    var beam = K.rbox({ x: cx, y: FLOOR + 7.0, z: BELT_Z, sx: 6.4, sy: .55, sz: .6, r: .08, mat: MAT.shellL });
    beam.castShadow = true;
    O.camBox = new T.Group(); O.camBox.position.set(cx, FLOOR + 6.4, BELT_Z);
    var cb = new T.Mesh(K.geoRoundBox(1.3, 1.0, 1.3, .1), MAT.graphite); O.camBox.add(cb);
    var lens = new T.Mesh(new T.CylinderGeometry(.3, .38, .35, 14), MAT.steel);
    lens.position.y = -.65; O.camBox.add(lens);
    var ring = new T.Mesh(new T.TorusGeometry(.62, .1, 10, 24),
      new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff2ff, emissiveIntensity: 1.6 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -.95; O.camBox.add(ring);
    K.scene().add(O.camBox);
    /* 扫描光片 */
    O.scan = new T.Mesh(new T.BoxGeometry(.16, 1.9, 2.6),
      new T.MeshBasicMaterial({ color: 0xaef0ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    O.scan.position.set(cx, BELT_Y + 1.2, BELT_Z); K.scene().add(O.scan);
    /* 判定屏 */
    O.inspScreen = makeScreen(2.4, 1.5);
    O.inspScreen.mesh.position.set(cx + 3.6, FLOOR + 4.4, BELT_Z + 1.4);
    O.inspScreen.mesh.rotation.y = -.5; K.scene().add(O.inspScreen.mesh);
    K.box({ x: cx + 3.9, y: FLOOR + 3.1, z: BELT_Z + 1.8, sx: .3, sy: 3.2, sz: .3, mat: MAT.graphite });
    /* 控制柜 */
    var cab = K.rbox({ x: cx - 4.6, y: FLOOR + 1.7, z: ST_Z, sx: 2.2, sy: 3.4, sz: 2.4, r: .1, mat: MAT.shellL });
    cab.castShadow = true;
    K.box({ x: cx - 4.6, y: FLOOR + 2.6, z: ST_Z + 1.22, sx: 1.2, sy: .9, sz: .1, mat: MAT.glassD });
    /* —— 细节：龙门柱防撞条、条形补光灯、相机线缆、柜体散热 —— */
    [-2.9, 2.9].forEach(function (dx) {
      K.box({ x: cx + dx, y: BELT_Y + .72, z: BELT_Z + .30, sx: .56, sy: 1.45, sz: .08, mat: MAT.hazard });
      K.box({ x: cx + dx, y: FLOOR + 7.0, z: BELT_Z + .34, sx: .62, sy: .12, sz: .1, mat: MAT.ledGreen });
    });
    /* 条形光源：向下压两道暖白光，环形光之外的“补光” */
    [-1.55, 1.55].forEach(function (dx) {
      var lp = new T.Mesh(new T.CylinderGeometry(.24, .24, .9, 14), MAT.shellD);
      lp.rotation.z = Math.PI / 2; lp.position.set(cx + dx, FLOOR + 6.55, BELT_Z + .35); K.scene().add(lp);
      var lens2 = new T.Mesh(new T.PlaneGeometry(.78, .34), new T.MeshBasicMaterial({ color: 0xfff4dc }));
      lens2.rotation.x = -Math.PI / 2 + .25; lens2.position.set(cx + dx, FLOOR + 6.24, BELT_Z + .38); K.scene().add(lens2);
    });
    /* 环形光：外圈 + 内圈，近看有层次 */
    var ring2 = new T.Mesh(new T.TorusGeometry(.82, .055, 8, 28),
      new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff2ff, emissiveIntensity: 1.1 }));
    ring2.rotation.x = Math.PI / 2; ring2.position.y = -1.02; O.camBox.add(ring2);
    /* 相机线缆（梁上垂到相机顶） */
    K.rod([cx, FLOOR + 7.35, BELT_Z], [cx, FLOOR + 6.95, BELT_Z], .055, { mat: MAT.rubber });
    /* 柜体散热格栅 + 底座 */
    for (var vv = 0; vv < 5; vv++) {
      K.box({ x: cx - 4.6, y: FLOOR + 3.05 + vv * .16, z: ST_Z + 1.23, sx: 1.5, sy: .06, sz: .03, mat: MAT.graphite });
    }
    K.box({ x: cx - 4.6, y: FLOOR + .14, z: ST_Z + 1.2, sx: 2.0, sy: .28, sz: .12, mat: MAT.hazard });
    makeTower(cx - 2.2, FLOOR + 7.3, BELT_Z, 'insp');
  }

  /* ---------------- 建造：激光刻码单元（立柱→悬臂→激光头 连续受力结构） ---------------- */
  function buildMark() {
    var cx = PX.mark;
    /* 立柱在皮带后方，柱顶 FLOOR+6.8 */
    var post = K.rbox({ x: cx, y: FLOOR + 3.4, z: BELT_Z - 2.9, sx: .6, sy: 6.8, sz: .6, r: .08, mat: MAT.shellD });
    post.castShadow = true;
    /* 悬臂从柱顶伸向皮带上空（z 覆盖到 BELT_Z），底面 FLOOR+6.13 */
    var arm = K.rbox({ x: cx, y: FLOOR + 6.35, z: BELT_Z - 1.35, sx: .8, sy: .45, sz: 3.2, r: .08, mat: MAT.shellD });
    arm.castShadow = true;
    /* 激光头吊在悬臂端正下方（头顶 FLOOR+6.5，嵌入悬臂 .37 保证连接） */
    O.laserHead = new T.Group(); O.laserHead.position.set(cx, FLOOR + 5.9, BELT_Z);
    var lh = new T.Mesh(K.geoRoundBox(1.0, 1.2, 1.0, .1), MAT.graphite); O.laserHead.add(lh);
    var tip = new T.Mesh(new T.CylinderGeometry(.16, .26, .5, 12), MAT.steel);
    tip.position.y = -.8; O.laserHead.add(tip);
    K.scene().add(O.laserHead);
    O.beam = new T.Mesh(new T.CylinderGeometry(.05, .09, 1.4, 8),
      new T.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    O.beam.position.set(cx, FLOOR + 4.6, BELT_Z); K.scene().add(O.beam);
    O.spark = [];
    for (var i = 0; i < 3; i++) {
      var sp = new T.Mesh(new T.SphereGeometry(.09, 8, 6),
        new T.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      sp.position.set(cx, BELT_Y + 2.4, BELT_Z); K.scene().add(sp); O.spark.push(sp);
    }
    /* 电柜 */
    var cab = K.rbox({ x: cx + 3.6, y: FLOOR + 1.8, z: ST_Z, sx: 2.4, sy: 3.6, sz: 2.6, r: .1, mat: MAT.shellD });
    cab.castShadow = true;
    /* —— 细节：立柱底座 + 排烟软管 + 安全标识 + 柜体操作面板 —— */
    K.box({ x: cx, y: FLOOR + .16, z: BELT_Z - 2.9, sx: 1.5, sy: .32, sz: 1.5, mat: MAT.steel });
    K.box({ x: cx, y: FLOOR + .48, z: BELT_Z - 2.9 + .31, sx: .64, sy: .38, sz: .08, mat: MAT.hazard });
    /* 排烟软管：挂在激光头与悬臂之间（随头升降，读作负压排烟） */
    var hose = new T.Mesh(new T.CylinderGeometry(.15, .15, 1.0, 10), MAT.rubber);
    hose.position.set(0, .85, -.25); O.laserHead.add(hose);
    for (var hb = 0; hb < 3; hb++) {
      var band = new T.Mesh(new T.TorusGeometry(.16, .035, 6, 12), MAT.steel);
      band.rotation.x = Math.PI / 2; band.position.set(0, .55 + hb * .28, -.25); O.laserHead.add(band);
    }
    /* 激光安全标识（黄底黑字） */
    var lsc = document.createElement('canvas'); lsc.width = 96; lsc.height = 128;
    var lcx = lsc.getContext('2d');
    lcx.fillStyle = '#e2ad2c'; lcx.fillRect(0, 0, 96, 128);
    lcx.fillStyle = '#1d2328'; lcx.beginPath();
    lcx.moveTo(48, 14); lcx.lineTo(84, 72); lcx.lineTo(12, 72); lcx.closePath(); lcx.fill();
    lcx.fillStyle = '#e2ad2c'; lcx.font = '700 32px sans-serif'; lcx.textAlign = 'center';
    lcx.fillText('!', 48, 64);
    lcx.fillStyle = '#1d2328'; lcx.font = '600 14px "Microsoft YaHei", sans-serif';
    lcx.fillText('激光辐射', 48, 94); lcx.fillText('请勿直视', 48, 112);
    var lst = new T.CanvasTexture(lsc); lst.encoding = T.sRGBEncoding;
    var lsign = new T.Mesh(new T.PlaneGeometry(.72, .96), new T.MeshBasicMaterial({ map: lst }));
    lsign.position.set(cx + .32, FLOOR + 2.7, BELT_Z - 2.58); lsign.rotation.y = .12; K.scene().add(lsign);
    /* 柜体：散热格栅 + 运行指示灯 + 底座踢脚 */
    for (var lv2 = 0; lv2 < 5; lv2++) {
      K.box({ x: cx + 3.6, y: FLOOR + 2.9 + lv2 * .17, z: ST_Z + 1.32, sx: 1.7, sy: .06, sz: .03, mat: MAT.graphite });
    }
    K.box({ x: cx + 4.15, y: FLOOR + 3.34, z: ST_Z + 1.33, sx: .16, sy: .08, sz: .03, mat: MAT.ledGreen });
    K.box({ x: cx + 3.6, y: FLOOR + .15, z: ST_Z + 1.28, sx: 2.2, sy: .3, sz: .12, mat: MAT.hazard });
    /* 打标工位两侧定位夹块 */
    [-1.95, 1.95].forEach(function (zz) {
      K.box({ x: cx, y: BELT_Y + .12, z: zz, sx: .8, sy: .34, sz: .4, mat: MAT.safety });
    });
    /* 常亮红色指示激光，让“刻码工位”远看也有识别点 */
    var pilot = new T.Mesh(new T.CylinderGeometry(.02, .02, 2.3, 6),
      new T.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: .28, blending: T.AdditiveBlending, depthWrite: false }));
    pilot.position.set(cx, BELT_Y + 1.45, BELT_Z); K.scene().add(pilot);
    makeTower(cx, FLOOR + 6.8, BELT_Z - 2.9, 'mark');   // 立在悬臂立柱柱顶
  }

  /* ---------------- 建造：六轴机器人 + 压机 ---------------- */
  function buildAsm() {
    var cx = PX.asm, cz = -8.8;
    /* 基座 */
    K.cyl({ x: cx, y0: FLOOR, z: cz, r: 1.5, h: .7, seg: 24, mat: MAT.graphite });
    /* 基座以上：优先用 .glb 真实倒角模型，否则回退程序化 */
    if (ASSETS.robot) {
      O.rob = ASSETS.robot.clone(true);
      O.rob.position.set(cx, FLOOR + .7, cz);
      O.rob.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      O.jShoulder = O.rob.getObjectByName('jShoulder');
      O.jElbow = O.rob.getObjectByName('jElbow');
      O.jWrist = O.rob.getObjectByName('jWrist');
      O.grip = O.rob.getObjectByName('grip');
      O.fingerL = O.rob.getObjectByName('fingerL');
      O.fingerR = O.rob.getObjectByName('fingerR');
      K.scene().add(O.rob);
    } else {
      O.rob = new T.Group(); O.rob.position.set(cx, FLOOR + .7, cz);
      var turret = new T.Mesh(K.geoRoundBox(1.9, .9, 1.9, .12), MAT.orange); turret.position.y = .45; O.rob.add(turret);
      O.jShoulder = new T.Group(); O.jShoulder.position.set(0, 1.1, 0); O.rob.add(O.jShoulder);
      var shBox = new T.Mesh(K.geoRoundBox(1.2, 1.1, 1.3, .14), MAT.shellD); shBox.position.y = .2; O.jShoulder.add(shBox);
      /* 配重（肩后伸出，读作工业机械臂） */
      var cw = new T.Mesh(K.geoRoundBox(.9, 1.4, .6, .1), MAT.graphite);
      cw.position.set(0, -.3, -.9); O.jShoulder.add(cw);
      O.jElbow = new T.Group(); O.jElbow.position.set(0, 1.2, 0); O.jShoulder.add(O.jElbow);
      var upper = new T.Mesh(K.geoRoundBox(.8, 3.3, .9, .12), MAT.shellL); upper.position.y = 1.65; O.jElbow.add(upper);
      O.jWrist = new T.Group(); O.jWrist.position.set(0, 3.3, 0); O.jElbow.add(O.jWrist);
      var fore = new T.Mesh(K.geoRoundBox(.65, 1.9, .75, .1), MAT.orange); fore.position.y = .95; O.jWrist.add(fore);
      var wrist = new T.Mesh(new T.CylinderGeometry(.38, .46, .7, 14), MAT.graphite);
      wrist.position.y = 2.1; O.jWrist.add(wrist);
      O.grip = new T.Group(); O.grip.position.set(0, 2.5, 0); O.jWrist.add(O.grip);
      var gp = new T.Mesh(K.geoRoundBox(.95, .5, .85, .08), MAT.graphite); O.grip.add(gp);
      O.fingerL = new T.Mesh(new T.BoxGeometry(.16, .8, .5), MAT.steel);
      O.fingerL.position.set(-.28, -.5, 0); O.grip.add(O.fingerL);
      O.fingerR = O.fingerL.clone(); O.fingerR.position.x = .28; O.grip.add(O.fingerR);
      O.rob.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
      K.scene().add(O.rob);
    }
    /* 关节链：肩→肘 1.2，肘→腕 3.3，腕→抓取面 1.6（L1=1.2, L2=4.9） */
    /* 伺服压机（台面顶 FLOOR+2.6，与机器人抓取高度衔接） */
    var px2 = 36.6, pz = -9.4;
    K.rbox({ x: px2, y: FLOOR + 1.4, z: pz, sx: 3.0, sy: 2.4, sz: 2.8, r: .08, mat: MAT.shellD }).castShadow = true;
    K.box({ x: px2, y: FLOOR + 2.65, z: pz, sx: 1.7, sy: .12, sz: 1.7, mat: MAT.steel });
    K.rbox({ x: px2, y: FLOOR + 2.9 + 2.1, z: pz, sx: 1.7, sy: 4.2, sz: 1.7, r: .1, mat: MAT.shellL }).castShadow = true;
    K.box({ x: px2, y: FLOOR + 4.9, z: pz + .88, sx: 1.9, sy: .5, sz: .12, mat: MAT.orange });
    O.ram = new T.Group(); O.ram.position.set(px2, FLOOR + 7.3, pz);
    var ramB = new T.Mesh(K.geoRoundBox(1.1, 1.4, 1.1, .1), MAT.graphite); O.ram.add(ramB);
    var tip2 = new T.Mesh(new T.CylinderGeometry(.45, .45, .5, 14), MAT.steel);
    tip2.position.y = -.9; O.ram.add(tip2);
    O.ram.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    K.scene().add(O.ram);
    /* 压机小屏：装在压机下座正面的安装框里。
       原来整块屏朝里倾斜 20°，上半截直接沉进机身——远看像一块悬空的黑板。 */
    K.box({ x: px2, y: FLOOR + 1.6, z: pz + 1.47, sx: 2.2, sy: 1.5, sz: .12, mat: MAT.graphite });
    O.asmScreen = makeScreen(2.0, 1.3);
    O.asmScreen.mesh.position.set(px2, FLOOR + 1.6, pz + 1.55);
    K.scene().add(O.asmScreen.mesh);
    /* 安全围栏（西/北/东） */
    var fenceMat = MAT.safety;
    function fenceRun(x1, z1, x2, z2) {
      var dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(2, Math.round(len / 3));
      for (var i2 = 0; i2 <= n; i2++) {
        var t2 = i2 / n;
        K.box({ x: x1 + dx * t2, y: FLOOR + .75, z: z1 + dz * t2, sx: .14, sy: 1.5, sz: .14, mat: fenceMat });
      }
      [0.55, 1.25].forEach(function (hy) {
        var rail = new T.Mesh(new T.BoxGeometry(len, .09, .09), fenceMat);
        rail.position.set((x1 + x2) / 2, FLOOR + hy, (z1 + z2) / 2);
        rail.rotation.y = -Math.atan2(dz, dx); K.scene().add(rail);
      });
    }
    fenceRun(27.2, -6.4, 27.2, -14.2);
    fenceRun(27.2, -14.2, 40.6, -14.2);
    fenceRun(40.6, -14.2, 40.6, -6.4);
    /* —— 细节：机器人安全地标、围栏网片、压机观察窗与力传感器 —— */
    (function () {
      var dc = document.createElement('canvas'); dc.width = dc.height = 256;
      var dg = dc.getContext('2d');
      dg.clearRect(0, 0, 256, 256);
      dg.strokeStyle = 'rgba(232,182,48,.95)'; dg.lineWidth = 7;
      dg.setLineDash([16, 12]);
      dg.beginPath(); dg.arc(128, 128, 116, 0, Math.PI * 2); dg.stroke();
      dg.lineWidth = 4; dg.setLineDash([10, 16]);
      dg.beginPath(); dg.arc(128, 128, 96, 0, Math.PI * 2); dg.stroke();
      var dt = new T.CanvasTexture(dc); dt.encoding = T.sRGBEncoding;
      var dm = new T.Mesh(new T.PlaneGeometry(7.2, 7.2),
        new T.MeshBasicMaterial({ map: dt, transparent: true, opacity: .72, depthWrite: false }));
      dm.rotation.x = -Math.PI / 2; dm.position.set(cx, FLOOR + .028, cz); K.scene().add(dm);
    })();
    /* 围栏网片（半透明网格，远看不再是一排孤零零的立杆） */
    (function () {
      var gc = document.createElement('canvas'); gc.width = gc.height = 64;
      var gg = gc.getContext('2d');
      gg.clearRect(0, 0, 64, 64);
      gg.strokeStyle = 'rgba(214,170,38,.55)'; gg.lineWidth = 2;
      for (var gq = 0; gq <= 64; gq += 8) {
        gg.beginPath(); gg.moveTo(gq, 0); gg.lineTo(gq, 64); gg.stroke();
        gg.beginPath(); gg.moveTo(0, gq); gg.lineTo(64, gq); gg.stroke();
      }
      var gt = new T.CanvasTexture(gc); gt.wrapS = gt.wrapT = T.RepeatWrapping;
      function meshPanel(x1, z1, x2, z2) {
        var dx2 = x2 - x1, dz2 = z2 - z1, len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        var mat2 = new T.MeshBasicMaterial({ map: gt, transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false });
        mat2.map = gt.clone(); mat2.map.needsUpdate = true; mat2.map.repeat.set(len2 / 1.1, 1.4);
        var mp = new T.Mesh(new T.PlaneGeometry(len2, 1.32), mat2);
        mp.position.set((x1 + x2) / 2, FLOOR + .95, (z1 + z2) / 2);
        mp.rotation.y = -Math.atan2(dz2, dx2); K.scene().add(mp);
      }
      meshPanel(27.2, -6.4, 27.2, -14.2);
      meshPanel(27.2, -14.2, 40.6, -14.2);
      meshPanel(40.6, -14.2, 40.6, -6.4);
    })();
    /* 压机：底部黄黑、上部观察窗、侧面力传感器与气路 */
    K.box({ x: px2, y: FLOOR + .30, z: pz + 1.44, sx: 2.7, sy: .6, sz: .12, mat: MAT.hazard });
    K.box({ x: px2, y: FLOOR + 2.35, z: pz + 1.43, sx: 2.6, sy: .18, sz: .1, mat: MAT.orange });
    var pglass = new T.Mesh(new T.PlaneGeometry(1.25, 3.2), MAT.darkGlass);
    pglass.position.set(px2, FLOOR + 4.95, pz + .87); K.scene().add(pglass);
    var sensor = new T.Mesh(new T.CylinderGeometry(.24, .24, .5, 14), MAT.steel);
    sensor.position.set(px2, FLOOR + 6.72, pz); K.scene().add(sensor);
    K.rod([px2 + .2, FLOOR + 6.9, pz], [px2 + .8, FLOOR + 5.0, pz + .9], .06, { mat: MAT.rubber });
    /* 侧挂安全光幕：贴住立柱左侧面（原来悬在机身外 0.7 m 的空中） */
    K.box({ x: px2 - .92, y: FLOOR + 4.1, z: pz + .2, sx: .12, sy: 1.4, sz: 1.2, mat: MAT.graphite });
    K.box({ x: px2 - .94, y: FLOOR + 4.72, z: pz + .2, sx: .16, sy: .1, sz: 1.0, mat: MAT.ledRed });
    /* 压机旁料箱（待压装端盖） */
    K.rbox({ x: px2 - 2.4, y: FLOOR + .55, z: pz + 1.2, sx: 1.1, sy: .9, sz: .9, r: .06, mat: MAT.blueBin }).castShadow = true;
    makeTower(px2, FLOOR + 7.1, pz, 'asm');   // 压机立柱顶（FLOOR+7.1）
  }

  /* ---------------- 建造：包装单元 ---------------- */
  function buildPack() {
    var cx = PX.pack;
    [-3.0, 3.0].forEach(function (dx) {
      var post = K.rbox({ x: cx + dx, y: FLOOR + 3.9, z: BELT_Z, sx: .5, sy: 7.8, sz: .5, r: .06, mat: MAT.shellD });
      post.castShadow = true;
    });
    var beam = K.rbox({ x: cx, y: FLOOR + 7.6, z: BELT_Z, sx: 6.6, sy: .6, sz: .7, r: .08, mat: MAT.shellL });
    beam.castShadow = true;
    /* 下降封装罩 */
    O.hood = new T.Group(); O.hood.position.set(cx, FLOOR + 6.9, BELT_Z);
    var hk = new T.MeshStandardMaterial({ color: 0x7c8894, roughness: .38, metalness: .55, transparent: true, opacity: .5 });
    var f1 = new T.Mesh(new T.BoxGeometry(4.0, .3, 3.6), hk); O.hood.add(f1);
    [[-1.9, -1.2], [1.9, -1.2], [-1.9, 1.2], [1.9, 1.2]].forEach(function (p) {
      var leg = new T.Mesh(new T.BoxGeometry(.22, 1.8, .22), hk); leg.position.set(p[0], -1.05, p[1]); O.hood.add(leg);
      var shoe = new T.Mesh(new T.BoxGeometry(.3, .16, .3), MAT.safety); shoe.position.set(p[0], -1.95, p[1]); O.hood.add(shoe);
      var pad2 = new T.Mesh(new T.BoxGeometry(.3, .22, .3), MAT.graphite); pad2.position.set(p[0], -.18, p[1]); O.hood.add(pad2);
    });
    /* 罩体顶面安全条 + 两侧横撑（焊接框架感） */
    [-1.72, 1.72].forEach(function (zz) {
      var hz = new T.Mesh(new T.BoxGeometry(4.05, .12, .16), MAT.hazard);
      hz.position.set(0, .2, zz); O.hood.add(hz);
    });
    [-1.2, 1.2].forEach(function (zz) {
      var cr = new T.Mesh(new T.BoxGeometry(3.9, .1, .1), MAT.alu);
      cr.position.set(0, -.55, zz); O.hood.add(cr);
    });
    /* 光电对射：罩口两侧红点，箱子到位才下落 */
    [-1.9, 1.9].forEach(function (dx2) {
      var eye = new T.Mesh(new T.SphereGeometry(.06, 8, 6), MAT.ledRed);
      eye.position.set(dx2, -1.15, 1.26); O.hood.add(eye);
    });
    K.scene().add(O.hood);
    /* 贴标臂：立柱 + 悬臂 + 打印头（PACK_RUN 时压向箱侧贴标） */
    var lab = K.rbox({ x: cx + 3.0, y: FLOOR + 2.6, z: BELT_Z + 2.2, sx: .4, sy: 1.2, sz: .4, r: .05, mat: MAT.shellD });
    lab.castShadow = true;
    var labArm = K.rbox({ x: cx + 2.0, y: FLOOR + 3.35, z: BELT_Z + 1.9, sx: 2.4, sy: .3, sz: .5, r: .05, mat: MAT.alu });
    labArm.castShadow = true;
    O.stamp = new T.Group(); O.stamp.position.set(cx + 1.0, FLOOR + 3.2, BELT_Z + 1.9);
    var stem = new T.Mesh(new T.BoxGeometry(.14, .5, .14), MAT.graphite); stem.position.y = -.25; O.stamp.add(stem);
    var head = new T.Mesh(K.geoRoundBox(.55, .75, .28, .05), MAT.graphite); head.position.y = -.85; O.stamp.add(head);
    var nozzle = new T.Mesh(new T.BoxGeometry(.4, .12, .1),
      new T.MeshStandardMaterial({ color: 0x2c3238, roughness: .5 }));
    nozzle.position.y = -1.28; O.stamp.add(nozzle);
    O.stamp.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    K.scene().add(O.stamp);
    /* —— 细节：打印头机匣 / 标签纸卷 / 胶带卷 / 成品纸箱垛 / 出料辊道 —— */
    var printer = new T.Mesh(K.geoRoundBox(.7, .55, .45, .05), MAT.shellD);
    printer.position.set(cx + 1.0, FLOOR + 3.72, BELT_Z + 1.9); K.scene().add(printer);
    var roll = new T.Mesh(new T.TorusGeometry(.22, .09, 8, 18), MAT.tan);
    roll.rotation.x = Math.PI / 2; roll.position.set(cx + 1.0, FLOOR + 3.72, BELT_Z + 2.17); K.scene().add(roll);
    var tape = new T.Mesh(new T.TorusGeometry(.30, .10, 8, 20), MAT.tan);
    tape.position.set(cx - 1.55, FLOOR + 6.55, BELT_Z + 1.65); K.scene().add(tape);
    var tapeArm = new T.Mesh(new T.BoxGeometry(.12, .9, .12), MAT.alu);
    tapeArm.position.set(cx - 1.55, FLOOR + 7.0, BELT_Z + 1.65); K.scene().add(tapeArm);
    /* 成品纸箱垛（机旁缓存） */
    var stackMats = [MAT.carton, MAT.tan, MAT.carton];
    [[0, 0], [1, 0], [0, 1]].forEach(function (q, qi) {
      var cb2 = new T.Mesh(K.geoRoundBox(2.6, 1.7, 2.4, .06), stackMats[qi]);
      cb2.position.set(cx + 4.6 + q[0] * 2.9, FLOOR + .85 + q[1] * 1.75, BELT_Z - 8.4);
      cb2.castShadow = true; K.scene().add(cb2);
    });
    for (var orr = 0; orr < 3; orr++) {
      var orl = new T.Mesh(new T.CylinderGeometry(.2, .2, 3.0, 10), MAT.steel);
      orl.rotation.x = Math.PI / 2; orl.position.set(54.0 + orr * 1.1, BELT_Y + .26, 0); K.scene().add(orl);
    }
    /* 龙门柱脚安全条 */
    [-3.0, 3.0].forEach(function (dx3) {
      K.box({ x: cx + dx3, y: FLOOR + .55, z: BELT_Z + .30, sx: .56, sy: .9, sz: .1, mat: MAT.hazard });
    });
    /* 电柜 */
    var cab = K.rbox({ x: cx + 5.2, y: FLOOR + 1.8, z: ST_Z, sx: 2.4, sy: 3.6, sz: 2.6, r: .1, mat: MAT.shellL });
    cab.castShadow = true;
    K.box({ x: cx + 5.2, y: FLOOR + 2.7, z: ST_Z + 1.32, sx: 1.3, sy: .9, sz: .1, mat: MAT.darkGlass });
    K.box({ x: cx + 5.2, y: FLOOR + .16, z: ST_Z + 1.28, sx: 2.2, sy: .3, sz: .12, mat: MAT.hazard });
    makeTower(cx - 3.0, FLOOR + 7.8, BELT_Z, 'pack');   // 立在西侧龙门柱柱顶（柱 x=cx±3.0，顶 FLOOR+7.8）
  }

  /* ---------------- 建造：充电桩 ---------------- */
  function buildDock() {
    [[-45, 6.5], [-41, 6.5]].forEach(function (p) {
      var pad = K.box({ x: p[0], y: FLOOR + .03, z: p[1], sx: 4.6, sy: .06, sz: 4.4, mat: MAT.graphite });
      pad.receiveShadow = true;
      var post = K.rbox({ x: p[0], y: FLOOR + .9, z: p[1] + 2.9, sx: .7, sy: 1.8, sz: .5, r: .06, mat: MAT.shellD });
      post.castShadow = true;
      var lamp = new T.Mesh(new T.SphereGeometry(.14, 10, 8),
        new T.MeshStandardMaterial({ color: 0x35b06a, emissive: 0x35b06a, emissiveIntensity: 1.8 }));
      lamp.position.set(p[0], FLOOR + 1.9, p[1] + 2.9); K.scene().add(lamp);
      var arm2 = K.box({ x: p[0], y: FLOOR + 1.3, z: p[1] + 2.55, sx: .3, sy: .3, sz: .5, mat: MAT.steel });
    });
  }

  /* ---------------- AGV ---------------- */
  function makeAGV(name, x, z) {
    var g = new T.Group(); g.position.set(x, FLOOR, z);
    var fork, beacon, wheels = [];
    if (ASSETS.agv) {
      var av = ASSETS.agv.clone(true);
      av.traverse(function (o) {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material = o.material.clone();
          if (o.name && o.name.indexOf('wheel') === 0) wheels.push(o); }
      });
      g.add(av);
      fork = av.getObjectByName('fork');
      beacon = av.getObjectByName('beacon');
    } else {
      var body = new T.Mesh(K.geoRoundBox(3.3, .85, 3.4, .16), MAT.orange);
    body.position.y = .85; body.castShadow = true; g.add(body);
    var skirt = new T.Mesh(new T.BoxGeometry(3.0, .3, 3.1), MAT.graphite);
    skirt.position.y = .38; g.add(skirt);
    var deck = new T.Mesh(new T.BoxGeometry(3.0, .14, 2.6), MAT.shellD);
    deck.position.y = 1.36; g.add(deck);
    /* 门架 */
    [-1.45, 1.45].forEach(function (dx) {
      var p = new T.Mesh(new T.BoxGeometry(.22, 2.7, .22), MAT.shellD);
      p.position.set(dx, 2.5, -.9); g.add(p);
    });
    var top = new T.Mesh(new T.BoxGeometry(3.2, .24, .3), MAT.orange);
    top.position.set(0, 3.85, -.9); g.add(top);
    /* 货叉（沿 -z 前伸） */
    fork = new T.Group(); fork.position.set(0, 1.43, -.6); g.add(fork);
    var fp = new T.Mesh(new T.BoxGeometry(2.8, .13, 2.2), MAT.steel);
    fp.position.z = -.9; fork.add(fp);
    [-1.05, 1.05].forEach(function (dx) {
      var f2 = new T.Mesh(new T.BoxGeometry(.3, .18, 2.6), MAT.steel);
      f2.position.set(dx, .12, -1.15); fork.add(f2);
    });
    /* 车轮 */
    [[-1.5, -1.35], [1.5, -1.35], [-1.5, 1.35], [1.5, 1.35]].forEach(function (p) {
      var w = new T.Mesh(new T.CylinderGeometry(.4, .4, .3, 16), MAT.rubber);
      w.rotation.z = Math.PI / 2; w.position.set(p[0], .4, p[1]); g.add(w);
    });
    /* 前向激光雷达 + 警示灯 */
    var lidar = new T.Mesh(new T.CylinderGeometry(.24, .28, .2, 12), MAT.graphite);
    lidar.position.set(0, 1.55, -1.75); g.add(lidar);
    beacon = new T.Mesh(new T.SphereGeometry(.2, 12, 10),
      new T.MeshStandardMaterial({ color: 0xe8b23c, emissive: 0xe8b23c, emissiveIntensity: 1.5 }));
    beacon.position.set(0, 4.1, -.9); g.add(beacon);
    /* LED 腰灯 */
    var led = new T.Mesh(new T.BoxGeometry(2.6, .1, .06),
      new T.MeshStandardMaterial({ color: 0x2f9fe0, emissive: 0x2f9fe0, emissiveIntensity: 1.6 }));
    led.position.set(0, .95, -1.72); g.add(led);
    }
    /* —— 车体细节（GLB / 程序化两条路径都叠加）：防撞条、侧腰灯、充电口、料箱、雷达扫描 —— */
    var bumper = new T.Mesh(new T.BoxGeometry(3.0, .34, .12), MAT.hazard);
    bumper.position.set(0, .58, -1.82); g.add(bumper);
    var bumperBar = new T.Mesh(new T.BoxGeometry(2.6, .12, .18), MAT.rubber);
    bumperBar.position.set(0, .38, -1.84); g.add(bumperBar);
    [-1.79, 1.79].forEach(function (sx) {
      var strip = new T.Mesh(new T.BoxGeometry(.05, .08, 2.2), MAT.ledBlue);
      strip.position.set(sx, .96, .25); g.add(strip);
      /* 侧身反光贴（黄白相间） */
      var refl = new T.Mesh(new T.BoxGeometry(.04, .34, .9), MAT.safety);
      refl.position.set(sx, .62, -1.15); g.add(refl);
    });
    /* 尾部充电口：深色凹槽 + 铜触点 + 绿色充电指示 */
    var chg = new T.Mesh(new T.BoxGeometry(.9, .58, .10), MAT.graphite);
    chg.position.set(0, .98, 1.815); g.add(chg);
    var chgPlate = new T.Mesh(new T.PlaneGeometry(.52, .40),
      new T.MeshStandardMaterial({ color: 0x1a2026, roughness: .4, metalness: .3 }));
    chgPlate.position.set(0, .98, 1.87); g.add(chgPlate);
    [-.13, .13].forEach(function (cx2) {
      var pin = new T.Mesh(new T.BoxGeometry(.09, .16, .04), new T.MeshStandardMaterial({ color: 0xc9a06f, roughness: .3, metalness: .9 }));
      pin.position.set(cx2, .98, 1.90); g.add(pin);
    });
    var chgLed = new T.Mesh(new T.SphereGeometry(.055, 8, 6), MAT.ledGreen);
    chgLed.position.set(.33, 1.19, 1.87); g.add(chgLed);
    /* 后部料箱（随车周转的空箱，平衡叉车重心） */
    var bin1 = new T.Mesh(K.geoRoundBox(1.5, .82, 1.25, .06), MAT.blueBin);
    bin1.position.set(0, 1.78, .95); bin1.castShadow = true; g.add(bin1);
    var binLid = new T.Mesh(new T.BoxGeometry(1.54, .07, 1.29), MAT.graphite);
    binLid.position.set(0, 2.21, .95); g.add(binLid);
    var bin2 = new T.Mesh(K.geoRoundBox(1.2, .66, 1.0, .05), MAT.tan);
    bin2.position.set(0, 2.58, .95); bin2.castShadow = true; g.add(bin2);
    /* 激光雷达：旋转扫描头 + 地面扫描环（作业时更亮） */
    var lidarSpin = new T.Mesh(new T.CylinderGeometry(.19, .22, .10, 14), MAT.ledBlue);
    lidarSpin.position.set(0, 1.70, -1.78); g.add(lidarSpin);
    var scanRing = new T.Mesh(new T.RingGeometry(.55, .72, 28),
      new T.MeshBasicMaterial({ color: 0x6fd2ff, transparent: true, opacity: .18, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    scanRing.rotation.x = -Math.PI / 2; scanRing.position.set(0, .03, -1.0); g.add(scanRing);
    /* 警示灯座 + 小范围照地光（让黄色警示灯真的“亮”在地上） */
    var beaconLight = new T.PointLight(0xe8b23c, .45, 7, 2);
    beaconLight.position.set(0, 4.0, -.9); g.add(beaconLight);
    K.scene().add(g);
    var blob = K.blob({ x: x, y: FLOOR, z: z, r: 2.6 });
    var s = {
      g: g, fork: fork, beacon: beacon, wheels: wheels, blob: blob, name: name,
      lidarSpin: lidarSpin, scanRing: scanRing,
      x: x, z: z, ry: 0, route: null, wpi: 0, spd: 7.0,
      forkY: 0, forkYt: 0, forkZ: 0, forkZt: 0,
      carry: null, onArrive: null, onFork: null,
      label: null,
      go: function (pts, cb) { s.route = pts; s.wpi = 0; s.onArrive = cb || null; },
      forkTo: function (up, slide, cb) {
        s.forkYt = up ? 1 : 0; s.forkZt = slide || 0; s.onFork = cb || null;
      },
      upd: function (dt) {
        /* 行走 */
        var rolled = 0;
        if (s.route) {
          var wp = s.route[s.wpi], dx = wp[0] - s.x, dz = wp[1] - s.z, d = Math.sqrt(dx * dx + dz * dz);
          if (d < .12) {
            s.wpi++;
            if (s.wpi >= s.route.length) {
              s.route = null;
              if (s.onArrive) { var cb = s.onArrive; s.onArrive = null; cb(); }
            }
          } else {
            var mv = Math.min(d, s.spd * dt);
            s.x += dx / d * mv; s.z += dz / d * mv;
            rolled = mv;
            var ty = Math.atan2(-dx, -dz);
            var dy = ty - s.ry;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            s.ry += dy * Math.min(1, dt * 5);
          }
        }
        /* 车轮按行驶距离滚动（轮半径 .42） */
        if (rolled && s.wheels.length) {
          var rw = rolled / .42;
          for (var wi = 0; wi < s.wheels.length; wi++) s.wheels[wi].rotateY(rw);
        }
        /* 货叉 */
        var done = true;
        var ny = s.forkY + (s.forkYt - s.forkY) * Math.min(1, dt * 3.2);
        if (Math.abs(s.forkYt - ny) > .003) done = false; else ny = s.forkYt;
        s.forkY = ny;
        var nz = s.forkZ + (s.forkZt - s.forkZ) * Math.min(1, dt * 2.6);
        if (Math.abs(s.forkZt - nz) > .004) done = false; else nz = s.forkZt;
        s.forkZ = nz;
        s.fork.position.set(0, 1.43 + s.forkY * 1.05, -.6 - s.forkZ);
        if (done && s.onFork) { var cf = s.onFork; s.onFork = null; cf(); }
        /* 姿态同步 */
        s.g.position.set(s.x, FLOOR, s.z);
        s.g.rotation.y = s.ry;
        var blink = (s.route || s.forkYt !== s.forkY || s.forkZt !== s.forkZ) ?
          (1.2 + Math.sin(K.now * 9) * 1.2) : 1.0;
        s.beacon.material.emissiveIntensity = Math.max(.15, blink);
        /* 激光雷达旋转 + 扫描环呼吸：静止时只留一圈微光，行走时明显 */
        if (s.lidarSpin) s.lidarSpin.rotation.y += dt * 4.2;
        if (s.scanRing) {
          var pulse = 1 + Math.sin(K.now * 3.2) * .07;
          s.scanRing.scale.set(pulse, pulse, 1);
          s.scanRing.material.opacity = s.route ? .36 : .14;
        }
        /* 载荷跟随货叉（叉板中心在车体前 1.5+forkZ 处） */
        if (s.carry) {
          var fw = new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(0, 1, 0), s.ry);
          var off = 1.5 + s.forkZ;
          s.carry.position.set(s.x + fw.x * off, FLOOR + 1.5 + s.forkY * 1.05, s.z + fw.z * off);
          s.carry.rotation.y = s.ry;
        }
        if (s.label) s.label.p.set(s.x, s.labelY, s.z);
        if (s.blob) { s.blob.position.x = s.x; s.blob.position.z = s.z; }
      }
    };
    /* 两台车初始并排，标签上下错开，避免总览里叠字 */
    var isA2 = name.indexOf('02') >= 0;
    s.labelY = FLOOR + (isA2 ? 4.15 : 5.25);
    s.label = K.label([x, s.labelY, z], name, isA2 ? -10 : 14, isA2 ? 18 : -16);
    return s;
  }

  /* ---------------- AGV 物流路径可视化 ----------------
     静态虚线箭头说明“往哪走”；流动光点说明“取货 → 搬运 → 放货”的方向与节拍。 */
  function buildAGVRoutes() {
    function arrowTex(col) {
      var c = document.createElement('canvas'); c.width = 96; c.height = 40;
      var x = c.getContext('2d');
      x.clearRect(0, 0, 96, 40);
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 4;
      x.beginPath(); x.moveTo(0, 31); x.lineTo(96, 31); x.stroke();
      [24, 62].forEach(function (ax) {
        x.beginPath(); x.moveTo(ax - 9, 9); x.lineTo(ax + 5, 21); x.lineTo(ax - 9, 33);
        x.closePath(); x.fill();
      });
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
      t.encoding = T.sRGBEncoding; return t;
    }
    O.routeMats = [];
    function seg(x1, z1, x2, z2, col, y) {
      var dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz);
      var tex = arrowTex(col);
      tex.repeat.set(len / 3.0, 1);
      var mat = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: .42, depthWrite: false });
      var m = new T.Mesh(new T.BoxGeometry(len, .025, 1.05), mat);
      m.position.set((x1 + x2) / 2, y || (FLOOR + .035), (z1 + z2) / 2);
      m.rotation.y = -Math.atan2(dz, dx);
      K.scene().add(m);
      O.routeMats.push(mat);
    }
    /* 出库 / 上料（蓝） */
    seg(-45, 6.5, -28.5, 6.5, '#3fa9e6');
    seg(-28.5, 6.5, -28.5, 4.6, '#3fa9e6');
    seg(-28.5, 4.6, -34, 6.5, '#3fa9e6');
    seg(-34, 6.5, -34, .9, '#3fa9e6');
    /* 成品入库（琥珀），略抬高避免与蓝线重叠闪烁 */
    var amberY = FLOOR + .046;
    seg(55, .9, 55, 6.5, '#e8a51c', amberY);
    seg(55, 6.5, -40, 6.5, '#e8a51c', amberY);
    seg(-40, 6.5, -40, .9, '#e8a51c', amberY);
    /* 站点光环 + 站名（仅 AGV 步骤显示，避免总览信息过载） */
    O.routeFx = new T.Group();
    var padC = document.createElement('canvas'); padC.width = padC.height = 128;
    var pg = padC.getContext('2d');
    pg.clearRect(0, 0, 128, 128);
    pg.strokeStyle = 'rgba(90,196,255,.95)'; pg.lineWidth = 5;
    pg.beginPath(); pg.arc(64, 64, 54, 0, Math.PI * 2); pg.stroke();
    pg.lineWidth = 3; pg.setLineDash([9, 9]);
    pg.beginPath(); pg.arc(64, 64, 42, 0, Math.PI * 2); pg.stroke();
    var padT = new T.CanvasTexture(padC); padT.encoding = T.sRGBEncoding;
    O.stationPads = [];
    var stops = [[-28.5, 4.5, 'ST-01 备料台'], [-34, .9, 'ST-02 上线点'],
                 [55, .9, 'ST-03 出库口'], [-40, .9, 'ST-04 入库台']];
    stops.forEach(function (s2) {
      var pad = new T.Mesh(new T.PlaneGeometry(3.4, 3.4),
        new T.MeshBasicMaterial({ map: padT, transparent: true, opacity: .8, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(s2[0], FLOOR + .05, s2[1]);
      O.routeFx.add(pad); O.stationPads.push(pad);
      K.spriteLabel([s2[0], FLOOR + 1.7, s2[1]], s2[2], { fs: 34, w: 3.2, parent: O.routeFx, bg: 'rgba(16,38,56,.86)', color: '#cdefff' });
    });
    /* 流动光点：两条任务链各 4 个 */
    function makeFlow(pts, col) {
      var cum = [0], total = 0;
      for (var i = 1; i < pts.length; i++) {
        total += Math.sqrt(Math.pow(pts[i][0] - pts[i - 1][0], 2) + Math.pow(pts[i][1] - pts[i - 1][1], 2));
        cum.push(total);
      }
      var f = { pts: pts, cum: cum, len: total, dots: [] };
      for (var d = 0; d < 4; d++) {
        var dot = new T.Mesh(new T.SphereGeometry(.17, 10, 8),
          new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .95 }));
        dot.position.y = FLOOR + .18;
        O.routeFx.add(dot);
        f.dots.push({ m: dot, off: total * d / 4 });
      }
      return f;
    }
    O.flows = [
      makeFlow([[-45, 6.5], [-28.5, 6.5], [-28.5, 4.6], [-28.5, 6.5], [-34, 6.5], [-34, .9]], 0x7fd8ff),
      makeFlow([[55, .9], [55, 6.5], [-40, 6.5], [-40, .9]], 0xffcc66)
    ];
    O.routeFx.visible = false;
    K.scene().add(O.routeFx);
    O.routeFocus = false;
  }
  function setRouteFocus(on) {
    if (!O.routeFx || !O.routeMats) return;
    O.routeFocus = !!on;
    O.routeFx.visible = !!on;
    for (var i = 0; i < O.routeMats.length; i++) O.routeMats[i].opacity = on ? .92 : .42;
  }
  /* 标注聚焦：近景步骤只保留本工位与必要的 AGV 标签，避免远工位文字穿透画面打架。 */
  function setLabelFocus(step) {
    if (O.stationLabels) {
      for (var i = 0; i < O.stationLabels.length; i++) {
        var l = O.stationLabels[i];
        l.rec.el.style.opacity = (l.step === step) ? '1' : '0';
      }
    }
    [AG1, AG2].forEach(function (a) {
      if (!a || !a.label) return;
      a.label.el.style.opacity = (step === 0 || step === 2) ? '1' : '0';
    });
  }

  /* ---------------- 场景组装 ---------------- */
  var AG1, AG2;
  var P = {};   // 流转对象：pallet / work / carton

  function hideDefaultRoom() {
    var sc = K.scene();
    for (var i = sc.children.length - 1; i >= 0; i--) {
      var o = sc.children[i];
      if (o === undefined || !o.isMesh && !o.isGroup) continue;
      if (o.geometry && o.geometry.type === 'CircleGeometry') { o.visible = false; continue; }
      if (o.position && o.position.z < -17 && !o.isGroup) o.visible = false;
      if (o.isGroup && o.position.z < -17) o.visible = false;
    }
  }

  var scene = {
    setup: function () {
      hideDefaultRoom();
      buildMats();
      buildFloor();
      buildShell();
      buildConveyor();
      buildWarehouse();
      buildCNC();
      buildInsp();
      buildMark();
      buildAsm();
      buildPack();
      buildDock();
      addContactShadows();
      boostLights();
      enforceShadows();

      /* 流转主角（位置由 resetFlow 统一给出：初始停在备料台） */
      P.pallet = makePallet(); K.scene().add(P.pallet);
      P.work = makeWorkpiece(); K.scene().add(P.work);
      P.carton = makeCarton(); K.scene().add(P.carton);
      P.cap = new T.Mesh(new T.CylinderGeometry(.72, .72, .3, 20), MAT.blueBin);
      P.cap.visible = false; K.scene().add(P.cap);

      AG1 = makeAGV('AGV-01 上料', -45, 6.5);
      AG2 = makeAGV('AGV-02 入库', -41, 6.5);
      buildAGVRoutes();
      /* 流转主角初始停在备料台 */
      resetFlow();
      robotCycle(0);            // 机器人初始待机姿态
      window.__facState = st;   // 验证脚本用
      window.__facGo = go;
      window.__facP = P;

      /* 工位标签：总览与各近景步骤按需显示（cam() 内统一切换透明度） */
      var LY = FLOOR + 10.6;
      O.stationLabels = [
        { x: -40, t: '立体仓库 AS/RS', step: 1 },
        { x: PX.cnc, t: '加工单元 CNC-01', step: 3 },
        { x: PX.insp, t: '视觉检测 QC-01', step: 4 },
        { x: PX.mark, t: '激光刻码 MK-01', step: 5 },
        { x: PX.asm, t: '装配单元 AS-01', step: 6 },
        { x: PX.pack, t: '包装单元 PK-01', step: 7 }
      ].map(function (d) {
        var rec = K.label([d.x, LY, ST_Z], d.t);
        rec.el.style.transition = 'opacity .3s';
        return { rec: rec, step: d.step };
      });
      [AG1, AG2].forEach(function (a) { if (a && a.label) a.label.el.style.transition = 'opacity .3s'; });
      setLabelFocus(0);

      /* 追溯面板 */
      var css = document.createElement('style');
      css.textContent =
        '.trace{position:fixed;left:20px;bottom:44px;width:342px;z-index:4;background:rgba(255,255,255,.94);' +
        'border:1px solid rgba(30,60,110,.14);border-radius:14px;padding:10px 14px 12px;box-shadow:0 10px 30px rgba(30,60,110,.13)}' +
        '.trace-h{font-size:11.5px;color:#66788c;letter-spacing:.08em;margin-bottom:6px;display:flex;align-items:center;gap:6px}' +
        '.trace-h i{width:7px;height:7px;border-radius:50%;background:#1fa567;display:inline-block;animation:tp 1.6s infinite}' +
        '@keyframes tp{0%,100%{opacity:1}50%{opacity:.25}}' +
        '.trace-b{max-height:172px;overflow:auto;scrollbar-width:thin}' +
        '.tr{display:flex;gap:8px;align-items:baseline;font-size:12px;line-height:1.9;border-bottom:1px dashed rgba(30,60,110,.08)}' +
        '.tr .tt{font-family:ui-monospace,Consolas,monospace;color:#8a97a6;font-size:11px;flex:0 0 auto}' +
        '.tr .tj{font-family:ui-monospace,Consolas,monospace;color:#2f7dd1;font-size:11px;flex:0 0 auto}' +
        '.tr .tg{color:#3d4c5e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.tr .tg.ok{color:#0e7a4b;font-weight:600}.tr .tg.warn{color:#9c6410}.tr .tg.stop{color:#b03a48;font-weight:600}' +
        '@media(max-width:1100px){.trace{display:none}}';
      document.head.appendChild(css);
      var panel = document.createElement('div');
      panel.className = 'trace';
      panel.innerHTML = '<div class="trace-h"><i></i>生产追溯 · MES 数据流</div><div class="trace-b" id="traceB"></div>';
      document.body.appendChild(panel);

      trace('产线上电，系统自检通过', 'ok');
      trace('立体仓库就绪，等待出库任务', 'info');

      O.cncScreen.show('待机', '#35b06a', 'CNC-01 · 程序就绪');
      O.inspScreen.show('待机', '#35b06a', 'QC-01 · 相机标定 OK');
      O.asmScreen.show('待机', '#35b06a', '压装力 0.0 kN');
    },

    /* ---------------- 工单状态机 ---------------- */
    update: function (dt, s) {
      fixPostfx();
      flyCam(dt);
      var eff = (s.estop || !s.run) ? 0 : s.speed;
      if (eff > 0) {
        s._simT += dt * eff;
        s._pt += dt * eff;
        var ph = PHASES[s.ph];
        if (s._pt >= ph.d) { go(ph.nx); }
      }
      if (PHASES[s.ph].up) PHASES[s.ph].up(Math.min(1, s._pt / PHASES[s.ph].d), dt * eff);
      var adt = dt * eff;
      AG1.upd(adt); AG2.upd(adt);
      /* 堆垛机：取任务 → 平移/升降 → 伸叉取放 → 收回，周期 4.6s */
      if (O.crane) {
        var cseq = O.craneSeq, cq = cseq[O.craneIdx];
        var ctx = -40 + (-4.5 + cq[0] * 3);
        var cty = O.craneLevels[cq[1]] + .76;
        O.crane.position.x += (ctx - O.crane.position.x) * Math.min(1, dt * 2.0);
        O.craneCar.position.y += (cty - O.craneCar.position.y) * Math.min(1, dt * 1.8);
        O.craneT += dt;
        var cArr = Math.abs(ctx - O.crane.position.x) < .16 && Math.abs(cty - O.craneCar.position.y) < .16;
        var cWant = (cArr && O.craneT > 1.0 && O.craneT < 3.0) ? 1 : 0;
        O.craneExt += (cWant - O.craneExt) * Math.min(1, dt * 2.8);
        O.craneFork.position.z = -O.craneExt * .95;   // 向 -z 伸入前排货位
        O.craneFork.rotation.y = Math.PI;
        if (O.craneT > 4.6) { O.craneT = 0; O.craneIdx = (O.craneIdx + 1) % cseq.length; }
      }
      /* AGV 路径：虚线箭头滚动 + 站点光环呼吸 */
      if (O.routeMats) {
        for (var rm = 0; rm < O.routeMats.length; rm++) {
          if (O.routeMats[rm].map) O.routeMats[rm].map.offset.x -= dt * .34;
        }
      }
      if (O.flows && O.routeFocus) {
        for (var fi = 0; fi < O.flows.length; fi++) {
          var fl = O.flows[fi];
          for (var di = 0; di < fl.dots.length; di++) {
            var dot = fl.dots[di];
            dot.off = (dot.off + adt * 3.6) % fl.len;
            var dd = dot.off, k2 = 1;
            while (k2 < fl.cum.length && fl.cum[k2] < dd) k2++;
            if (k2 >= fl.cum.length) k2 = fl.cum.length - 1;
            var pa = fl.pts[k2 - 1], pb = fl.pts[k2];
            var sl = fl.cum[k2] - fl.cum[k2 - 1] || 1, kk = (dd - fl.cum[k2 - 1]) / sl;
            dot.m.position.set(pa[0] + (pb[0] - pa[0]) * kk, FLOOR + .2, pa[1] + (pb[1] - pa[1]) * kk);
          }
        }
        for (var pi = 0; pi < O.stationPads.length; pi++) {
          var sc2 = 1 + Math.sin(K.now * 2.4 + pi) * .06;
          O.stationPads[pi].scale.set(sc2, sc2, 1);
          O.stationPads[pi].material.opacity = .55 + .22 * Math.sin(K.now * 2.4 + pi);
        }
      }
      /* 辊筒 + 皮带面：辊筒绕自身轴（局部 Y，轴向已转成横跨 Z）滚动；
         顶面线速度方向与工件输送方向（+x）一致 → 绕 +Z 角速度为负 */
      if (beltMove) {
        var w = beltMove * dt * 3;
        for (var i = 0; i < rollers.length; i++) rollers[i].rotateY(-w);
        O.beltTex.offset.x -= w * .24 / 2.6;   // 皮带面同速滚动（辊半径 .24，纹距 2.6）
        beltMove = 0;
      }
      /* 塔灯闪烁 */
      for (var k2 in towers) {
        var rec = towers[k2];
        if (rec.mode === 'busy') {
          var L = rec.lamps[1];
          L.m.emissiveIntensity = 1.1 + Math.sin(K.now * 9) * 1.1;
        }
      }
      if (s.estop) {
        allTowers('stop');
        AG1.beacon.material.emissiveIntensity = 1.2 + Math.sin(K.now * 14) * 1.2;
        AG2.beacon.material.emissiveIntensity = 1.2 + Math.sin(K.now * 14) * 1.2;
      }
      /* 火花闪烁 */
      if (O.spark && O.sparkOn) {
        O.spark.forEach(function (sp) {
          sp.material.opacity = .5 + Math.random() * .5;
          sp.position.set(PX.mark + K.rnd(-.3, .3), BELT_Y + 2.45 + K.rnd(0, .4), BELT_Z + K.rnd(-.3, .3));
          sp.scale.setScalar(K.rnd(.6, 1.2));
        });
      }
      /* 屏幕联动 */
      syncScreens();
    }
  };

  /* SSAO 在浅色大平面上会留方块暗斑：补 RenderPass 并关闭 SSAO（保留 Bloom + ACES） */
  var postfxFixed = false;
  function fixPostfx() {
    if (postfxFixed) return;
    postfxFixed = true;
    var d = window.__labDebug;
    if (!d || !d.composer) return;
    try {
      d.composer.passes.unshift(new T.RenderPass(d.scene, d.camera));
      d.composer.passes.forEach(function (p) {
        if (p.kernelRadius !== undefined) p.enabled = false;
        /* 略降曝光：压住浅色地坪与墙面的“发白”，让橙色货架/黄黑警示条更沉 */
        if (p.uniforms && p.uniforms.uExposure) p.uniforms.uExposure.value = .82;
      });
    } catch (e) { }
  }

  /* ---------------- 相机飞行 ----------------
     机位原则：主体落在面板左侧 1/3 画面内，避免大片空地和右侧讲解面板遮挡。
     yaw>0 表示相机在 +x/+z 象限（从产线右前方看）。 */
  var CAMS = [
    { tx: 31, tz: -9, ty: -10.4, dist: 134, yaw: .07, pitch: .28 },  // 总览：整线避开右侧面板，墙填满背景
    { tx: -39.5, tz: -10.5, ty: -10.4, dist: 32, yaw: .30, pitch: .29 },// 立体仓库 + 堆垛机（正视，机前取景）
    { tx: -31, tz: 2.8, ty: -12.2, dist: 21.5, yaw: .82, pitch: .19 }, // AGV 物流：两台车都收进面板左侧，车体占画面中部
    { tx: -15.5, tz: -10.5, ty: -11.4, dist: 31, yaw: .26, pitch: .24 },// CNC：整机入画，不裁切
    { tx: 0, tz: -6.4, ty: -11.6, dist: 26, yaw: .30, pitch: .20 },  // 视觉检测：龙门 + 皮带 + 判定屏
    { tx: 16, tz: -4.8, ty: -12.1, dist: 20.5, yaw: .30, pitch: .17 }, // 激光刻码：激光头 + 输送面同框，主体略放大
    { tx: 34.2, tz: -8.8, ty: -10.9, dist: 29, yaw: .30, pitch: .22 },// 机器人装配：机械臂与压机同框
    { tx: 48.5, tz: -5.0, ty: -12.2, dist: 25, yaw: .24, pitch: .19 },// 自动包装：龙门罩 + 辊道 + 箱垛
    { tx: 31, tz: -9, ty: -10.4, dist: 134, yaw: .07, pitch: .28 }    // 生产追溯俯瞰
  ];
  function flyCam(dt) {
    if (!st._fly) return;
    var c = window.__labDebug && window.__labDebug.cam;
    if (!c) return;
    if (!st._from) st._from = { tx: c.tx, tz: c.tz, ty: c.ty, dist: c.dist, yaw: c.yaw, pitch: c.pitch };
    var tgt = CAMS[st._cam];
    st._fly += dt;
    var e = Math.min(1, st._fly / 1.7);
    e = e < .5 ? 2 * e * e : -1 + (4 - 2 * e) * e;
    ['tx', 'tz', 'ty', 'dist', 'yaw', 'pitch'].forEach(function (k2) {
      c[k2] = st._from[k2] + (tgt[k2] - st._from[k2]) * e;
    });
    if (st._fly >= 1.7) { st._fly = 0; st._from = null; }
  }

  /* ---------------- 屏幕联动 ---------------- */
  function syncScreens() {
    var runTxt = st.estop ? ['急停', '#d94a45', '设备已锁定'] : (st.run ? ['运行', '#35b06a', '自动模式'] : ['暂停', '#e8b23c', '待机']);
    if (st.ph === 'CNC_RUN') O.cncScreen.show('加工', '#e8b23c', 'S3200 F0.2 · M03');
    else O.cncScreen.show(runTxt[0], runTxt[1], 'CNC-01 · ' + runTxt[2]);
    if (st.ph === 'INSP_RUN') {
      O.inspScreen.show(st.pt > 2.2 ? 'OK ✓' : '…', st.pt > 2.2 ? '#35b06a' : '#e8b23c', '视觉检测中');
    } else O.inspScreen.show(runTxt[0], runTxt[1], 'QC-01 · ' + runTxt[2]);
    if (st.ph === 'ASM_RUN') {
      var f = Math.min(12, Math.max(0, (st.pt - 4.2) * 8));
      O.asmScreen.show(f.toFixed(1) + ' kN', '#35b06a', '压装曲线 OK');
    } else O.asmScreen.show(runTxt[0], runTxt[1], '压机 · ' + runTxt[2]);
  }

  /* ---------------- 工单阶段 ---------------- */
  function go(name) {
    st.ph = name; st._pt = 0;
    var ph = PHASES[name];
    if (ph.enter) ph.enter();
  }
  function beltTo(x1, x2, d) {
    return {
      d: d,
      enter: function () { P._x0 = P.pallet.position.x; },
      up: function (k) {
        var x = P._x0 + (x2 - P._x0) * (k < .12 ? 0 : k > .88 ? 1 : (k - .12) / .76);
        P.pallet.position.x = x; P.work.position.x = x; P.cap.position.x = x;
        P.pallet.position.z = BELT_Z; P.work.position.z = BELT_Z;
        beltMove = 1;
      }
    };
  }

  var PHASES = {
    WAIT: { d: 1.4, nx: 'A1_PICK', enter: function () { activeTower('wh'); } },

    /* AGV-01：备料台取托盘 → 送上产线
       叉取点：AGV 停 z=4.5，叉伸 4.4 → 叉板中心 z = 4.5-(1.5+4.4) = -1.4 = 备料台 */
    A1_PICK: {
      d: 99, nx: 'A1_LIFT',
      enter: function () {
        trace('出库任务下达，AGV-01 前往备料台', 'info');
        AG1.go([[-28.5, 6.5], [-28.5, 4.5]], function () { go('A1_LIFT'); });
      },
      up: function () { }
    },
    A1_LIFT: {
      d: 1.8, nx: 'A1_TODROP',
      enter: function () { AG1.forkTo(true, 4.4, null); AG1.carry = null; },
      up: function (k) {
        /* 叉板抬升过半后把托盘挂上 */
        if (k > .5 && !AG1.carry) AG1.carry = P.pallet;
      }
    },
    A1_TODROP: {
      d: 99, nx: 'A1_DROP',
      enter: function () {
        AG1.forkTo(true, 0, null);            // 收叉行驶
        AG1.go([[-34, 6.5], [-34, .9]], function () { go('A1_DROP'); });
      },
      up: function () { }
    },
    A1_DROP: {
      d: 2.0, nx: 'BELT_CNC',
      enter: function () { AG1.forkTo(false, 3.4, null); },  // 伸叉落到输送面
      up: function (k) {
        if (k > .62 && AG1.carry) {
          AG1.carry = null;
          P.pallet.position.set(-34, BELT_Y + .06, BELT_Z);
          P.work.position.set(-34, BELT_Y + .51, BELT_Z);
          P.cap.position.set(-34, BELT_Y + 2.26, BELT_Z);
          AG1.forkTo(false, 0, null);
          trace('毛坯托盘上线，产线启动', 'ok');
        }
      }
    },

    /* 输送 + 各工位 */
    BELT_CNC: { d: 3.2, nx: 'CNC_RUN', enter: null, up: beltTo(-34, PX.cnc, 3.2).up },
    CNC_RUN: {
      d: 5.2, nx: 'BELT_INSP',
      enter: function () {
        activeTower('cnc');
        trace('进入 CNC 加工程序 O0042', 'info');
      },
      up: function (k) {
        /* 门 0-.15 关 /.85-1 开；主轴 .18-.8 转 */
        var door = k < .15 ? k / .15 : k > .85 ? (1 - k) / .15 : 1;
        O.cncDoor.forEach(function (d) {
          d.m.position.x = d.x0 + d.sg * door * 2.2;
          d.w.position.x = d.x0 + d.sg * door * 2.2;
        });
        var spin = (k > .18 && k < .8) ? 1 : 0;
        O.tool.rotation.y += spin * .9;
        O.spindleHead.position.y = FLOOR + 5.2 - (k > .25 && k < .75 ? Math.sin((k - .25) / .5 * Math.PI) * .9 : 0);
      }
    },
    BELT_INSP: { d: 3.0, nx: 'INSP_RUN', enter: null, up: beltTo(PX.cnc, PX.insp, 3.0).up },
    INSP_RUN: {
      d: 4.0, nx: 'BELT_MARK',
      enter: function () { activeTower('insp'); trace('视觉检测：尺寸 + 外观判定', 'info'); },
      up: function (k) {
        var down = Math.min(1, k / .2) * 1.2 - Math.max(0, (k - .85) / .15) * 1.2;
        O.camBox.position.y = FLOOR + 6.4 - Math.max(0, down);
        var sk = Math.max(0, Math.min(1, (k - .25) / .55));
        O.scan.material.opacity = sk > 0 && sk < 1 ? .85 : 0;
        O.scan.position.x = PX.insp - 1.5 + sk * 3.0;
      }
    },
    BELT_MARK: { d: 3.0, nx: 'MARK_RUN', enter: null, up: beltTo(PX.insp, PX.mark, 3.0).up },
    MARK_RUN: {
      d: 4.2, nx: 'BELT_ASM',
      enter: function () { activeTower('mark'); trace('激光打标 DPM 码 · 一物一码', 'info'); },
      up: function (k) {
        var down = Math.min(1, k / .18) * 1.1 - Math.max(0, (k - .85) / .15) * 1.1;
        O.laserHead.position.y = FLOOR + 5.9 - Math.max(0, down);
        var lasing = k > .25 && k < .8;
        O.beam.material.opacity = lasing ? .5 + Math.random() * .4 : 0;
        O.beam.visible = lasing;
        O.beam.position.y = O.laserHead.position.y - 1.2;
        O.sparkOn = lasing;
        P.work.userData.decal.material.opacity = Math.max(0, (k - .3) / .45);
      }
    },
    BELT_ASM: { d: 3.0, nx: 'ASM_RUN', enter: null, up: beltTo(PX.mark, PX.asm, 3.0).up },
    ASM_RUN: {
      d: 9.2, nx: 'BELT_PACK',
      enter: function () { activeTower('asm'); trace('机器人抓取，压装端盖', 'info'); },
      up: function (k) { robotCycle(k); }
    },
    BELT_PACK: {
      d: 2.6, nx: 'PACK_RUN',
      enter: function () { robotCycle(0); },   // 机器人回待机姿态
      up: beltTo(PX.asm, PX.pack, 2.6).up
    },
    PACK_RUN: {
      d: 4.4, nx: 'BELT_OUT',
      enter: function () { activeTower('pack'); trace('自动包装：开箱 · 装箱 · 封箱', 'info'); },
      up: function (k) {
        var hd = Math.min(1, k / .22) - Math.max(0, (k - .8) / .2);
        O.hood.position.y = FLOOR + 6.9 - Math.max(0, hd) * 2.5;
        var fold = Math.max(0, Math.min(1, (k - .35) / .4));
        P.carton.visible = k > .3;
        if (P.carton.visible) {
          P.carton.position.set(P.pallet.position.x, BELT_Y + .51, BELT_Z);
          P.carton.rotation.y = 0;
          P.carton.userData.flaps.forEach(function (f) {
            f.pv.rotation.z = (f.sgn > 0 ? -1 : 1) * (2.0 - fold * 2.0);
          });
          P.work.visible = k < .34;
        }
        /* 贴标：打印头 k.55-.68 压向箱侧，k.7 标签显现，k.68-.82 退回 */
        var sd = Math.max(0, Math.min(1, (k - .55) / .13)) - Math.max(0, (k - .68) / .14);
        O.stamp.position.y = FLOOR + 3.2 - Math.max(0, sd) * .35;
        P.carton.userData.label.material.opacity = k > .7 ? 1 : 0;
      }
    },
    BELT_OUT: {
      d: 2.0, nx: 'A2_PICK',
      enter: null,
      up: function (k) {
        var x = PX.pack + (PX.out - PX.pack) * (k < .15 ? 0 : k > .85 ? 1 : (k - .15) / .7);
        P.pallet.position.x = x; P.carton.position.x = x; P.cap.position.x = x;
        beltMove = 1;
      }
    },

    /* AGV-02：成品入库；托盘回收 */
    A2_PICK: {
      d: 99, nx: 'A2_LIFT',
      enter: function () {
        trace('包装完成，AGV-02 前往出库口', 'ok');
        AG2.go([[PX.out, 6.5], [PX.out, .9]], function () { go('A2_LIFT'); });
      },
      up: function (k) {
        /* 托盘淡出（回流回收） */
        if (k > .05) P.pallet.visible = false;
      }
    },
    A2_LIFT: {
      d: 1.8, nx: 'A2_TOWH',
      enter: function () { AG2.forkTo(true, 3.4, null); AG2.carry = null; },
      up: function (k) { if (k > .5 && !AG2.carry) AG2.carry = P.carton; }
    },
    A2_TOWH: {
      d: 99, nx: 'A2_DROP',
      enter: function () {
        AG2.forkTo(true, 0, null);
        AG2.go([[-40, 6.5], [-40, .9]], function () { go('A2_DROP'); });
      },
      up: function () { }
    },
    A2_DROP: {
      d: 2.0, nx: 'DONE',
      enter: function () { AG2.forkTo(false, 3.4, null); },
      up: function (k) {
        if (k > .62 && AG2.carry) {
          AG2.carry = null;
          P.carton.position.set(-40, BELT_Y + .4, -4);
          AG2.forkTo(false, 0, null);
          trace('成品入库完成 · W-' + st.job + ' 批次记录归档', 'ok');
        }
      }
    },
    DONE: {
      d: 2.2, nx: 'WAIT',
      enter: function () {
        AG2.go([[-41, 6.5]], null);          // 返回待命位（与下一循环并行）
        st.done++; st.job++;
        trace('工单闭环 · 空托盘回流回收', 'warn');
        /* 复位流转件：新托盘 + 新毛坯出现在备料台 */
        resetFlow();
      },
      up: function () { }
    }
  };

  function resetFlow() {
    /* 备料台位（台面顶 BELT_Y+.4）：托盘 / 工件 / 端盖 / 纸箱的高度链由此推算 */
    P.carton.visible = false;
    P.work.visible = true;
    P.cap.visible = false;
    P.work.userData.decal.material.opacity = 0;
    P.pallet.visible = true;
    P.pallet.position.set(-28.5, BELT_Y + .4, -1.4);
    P.work.position.set(-28.5, BELT_Y + .85, -1.4);
    P.cap.position.set(-28.5, BELT_Y + 2.6, -1.4);
    P.carton.position.set(-28.5, BELT_Y + .85, -1.4);
  }

  /* ---------------- 机器人压装循环（肩-肘 2 连杆 IK） ----------------
     关节链：肩枢轴 →(1.2)→ 肘 →(3.3)→ 腕 →(1.6)→ 抓取面；L1=1.2, L2=4.9 */
  var L1 = 1.2, L2 = 4.9;
  function robotCycle(k) {
    var cx = PX.asm, cz = -8.8, sy = FLOOR + .7 + 1.1;   // 肩枢轴世界坐标
    var seq = [
      [0.00, 34.8, -11.8, -6.4, 0],         // 待机：臂外伸、肘部弯折
      [0.10, cx, -11.4, BELT_Z, 0],         // 移到托盘上方
      [0.24, cx, -13.3, BELT_Z, 0],         // 下降到抓取高度
      [0.30, cx, -13.3, BELT_Z, 1],         // 夹紧
      [0.40, cx, -11.4, BELT_Z, 1],         // 抬起
      [0.52, 36.6, -11.0, -9.4, 1],         // 移到压机上方
      [0.62, 36.6, -12.6, -9.4, 1],         // 放到压机台面
      [0.80, 36.6, -12.6, -9.4, 1],         // 压装（压机下行）
      [0.88, 36.6, -11.2, -9.4, 1],         // 提起已压装工件
      [0.96, cx, -11.4, BELT_Z, 1],         // 移回托盘上方
      [1.00, cx, -13.3, BELT_Z, 0]          // 放回，松爪
    ];
    var t = Math.min(.999, Math.max(0, k)), a = seq[0], b = seq[seq.length - 1];
    for (var i = 0; i < seq.length - 1; i++) {
      if (t >= seq[i][0] && t <= seq[i + 1][0]) { a = seq[i]; b = seq[i + 1]; break; }
    }
    var span = Math.max(1e-4, b[0] - a[0]);
    var e = (t - a[0]) / span; e = e < .5 ? 2 * e * e : -1 + (4 - 2 * e) * e;
    var gx = a[1] + (b[1] - a[1]) * e, gy = a[2] + (b[2] - a[2]) * e, gz = a[3] + (b[3] - a[3]) * e;
    var grip = a[4] + (b[4] - a[4]) * e;
    /* IK：目标 = 抓取面（gx,gy,gz），相对肩枢轴 */
    var dx = gx - cx, dz = gz - cz;
    var dH = Math.max(.15, Math.sqrt(dx * dx + dz * dz));
    var dy = gy - sy;
    var d = Math.sqrt(dH * dH + dy * dy);
    var maxD = L1 + L2 - .06;
    if (d > maxD) { var sc = maxD / d; dy *= sc; d = maxD; }
    d = Math.max(.2, d);
    var cosE = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    cosE = Math.max(-1, Math.min(1, cosE));
    var gamma = Math.acos(cosE);                     // 肘内角
    var phi = Math.atan2(dy, dH);                    // 目标仰角
    var a2 = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    var th1 = phi + a2;                              // 大臂仰角（肘抬高解）
    th1 = Math.max(.06, Math.min(1.45, th1));
    /* 应用：模型正面 = 局部 +z；rotation.x 正向把臂摆向 +z */
    O.rob.rotation.y = Math.atan2(dx, dz);
    O.jShoulder.rotation.x = Math.PI / 2 - th1;
    O.jElbow.rotation.x = Math.PI - gamma;
    /* 腕：让抓手保持竖直向下（三段转角总和 = π） */
    O.jWrist.rotation.x = Math.PI - (O.jShoulder.rotation.x + O.jElbow.rotation.x);
    /* 爪指 */
    var g2 = grip > .5 ? .12 : .34;
    O.fingerL.position.x = -g2; O.fingerR.position.x = g2;
    /* 压机：k .62-.8 内下行冲压 */
    var pk = Math.max(0, Math.min(1, (k - .66) / .12));
    O.ram.position.y = FLOOR + 7.3 - Math.sin(Math.min(1, pk) * Math.PI) * 1.75;
    /* 工件跟随 */
    var carried = grip > .5;
    if (carried && t < .62) {
      P.work.position.set(gx, gy - .8, gz);
      P.work.rotation.y = O.rob.rotation.y;
    } else if (t >= .62 && t < .88) {
      P.work.position.set(36.6, FLOOR + 2.6, -9.4);
      P.work.rotation.y = 0;
      if (t > .72) {
        P.cap.visible = true;
        P.cap.position.set(36.6, FLOOR + 2.6 + 1.75, -9.4);
      }
    } else if (t >= .96 || (carried && t >= .88)) {
      var back = (t >= .96);
      P.work.position.set(back ? PX.asm : gx, back ? BELT_Y + .51 : gy - .8, back ? BELT_Z : gz);
      P.work.rotation.y = 0;
      if (back) {
        P.cap.visible = true;
        P.cap.position.set(PX.asm, BELT_Y + 2.26, BELT_Z);
      }
    }
  }

  /* ---------------- 启动 ---------------- */
  _preloadGLB(function () {
    K.boot({
    title: '智能车间 · 虚拟仿真',
    chip: '虚拟仿真 · 智能制造 · 数字孪生产线',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    postfx: true,
    ssao: { kernelRadius: 18, minDistance: 0.0008, maxDistance: 0.5 },
    cam: { tx: 31, tz: -9, ty: -10.4, dist: 134, yaw: .07, pitch: .28 },

    reads: [['ph', '当前工序'], ['st', '系统状态'], ['done', '完成入库'], ['rate', '良品率']],
    values: function (s) {
      var phn = {
        WAIT: '等待工单', A1_PICK: 'AGV 备料取货', A1_LIFT: 'AGV 叉取', A1_TODROP: 'AGV 配送上线',
        A1_DROP: '托盘上线', BELT_CNC: '输送 → 加工', CNC_RUN: 'CNC 加工', BELT_INSP: '输送 → 检测',
        INSP_RUN: '视觉检测', BELT_MARK: '输送 → 刻码', MARK_RUN: '激光刻码', BELT_ASM: '输送 → 装配',
        ASM_RUN: '机器人压装', BELT_PACK: '输送 → 包装', PACK_RUN: '自动包装', BELT_OUT: '成品出线',
        A2_PICK: 'AGV-02 接货', A2_LIFT: 'AGV 叉取', A2_TOWH: 'AGV 送仓', A2_DROP: '成品入库',
        DONE: '工单闭环'
      };
      return {
        ph: phn[s.ph] || s.ph,
        st: s.estop ? '急停锁定' : (s.run ? '自动运行' : '暂停待机'),
        done: s.done,
        rate: s.done + s.ng > 0 ? Math.round(s.done / (s.done + s.ng) * 100) + '%' : '—'
      };
    },

    steps: (function () {
      var ctl = [
        {
          label: '暂停 / 恢复', type: 'btn',
          onClick: function (s) { s.run = !s.run; if (s.run) trace('产线恢复运行', 'info'); else trace('产线人工暂停', 'warn'); }
        },
        {
          label: '急停 / 复位', type: 'btn',
          onClick: function (s) {
            s.estop = !s.estop;
            trace(s.estop ? '急停按钮拍下！全线锁定' : '急停复位，产线恢复', s.estop ? 'stop' : 'info');
          }
        },
        { label: '运行倍速', type: 'range', key: 'speed', min: .5, max: 3, step: .25 }
      ];
      function cam(i) {
        return function (s) {
          s._cam = i; s._fly = .0001;
          /* 只在「AGV 物流」步点亮路径光点与站名，其余步骤保留淡色导引线 */
          setRouteFocus(i === 2);
          setLabelFocus(i);
        };
      }
      return [
        {
          name: '总览', title: '一条会自己干活的产线',
          ask: '毛坯从仓库到成品入库，中间发生了什么？',
          body: '<p>这是一套<b>智能车间数字孪生</b>：立体仓库出库毛坯 → <b>AGV</b> 配送上线 → <b>CNC 加工</b> → <b>视觉检测</b> → <b>激光刻码</b> → <b>机器人压装</b> → <b>自动包装</b> → 成品回库。所有工位由同一张「工单」驱动，一个工件走完全程。</p>' +
            '<p><b>看点：</b>① 每台设备顶上的<b>三色信号塔</b>——绿=自动运行、黄=该工位正在作业、红=故障；② 地面的<b>黄色磁导航环线</b>是 AGV 的行走轨道；③ 左下角的<b>生产追溯</b>面板在实时记录每一步。</p>',
          apply: function (s) { cam(0)(s); s.run = true; },
          controls: ctl
        },
        {
          name: '立体仓库', title: '原料从哪一格里来',
          ask: '几百个仓位，系统怎么知道该取哪一个？',
          body: '<p>货架 <b>4 层 × 4 列 × 2 深</b>，每个仓位有唯一地址（排-列-层）。WMS（仓库管理系统）按<b>先进先出</b>和物料批次指定出库仓位，出入库台完成交接。</p>' +
            '<p>注意看备料台：出库后的毛坯托盘在这里等待 AGV。空托盘和料箱都会<b>回流复用</b>——真实车间里托盘是循环资产，不随工件走。</p>',
          apply: cam(1), controls: ctl
        },
        {
          name: 'AGV 物流', title: '没有司机的叉车怎么认路',
          ask: '它不会撞人，也不会迷路吗？',
          body: '<p>AGV 沿地面<b>磁导航环线</b>行走，站点之间按任务调度；车体前方有<b>激光避障雷达</b>，头顶黄色警示灯在作业时闪烁。电量低时自动前往<b>充电桩</b>对接充电。</p>' +
            '<p><b>货叉式 AGV</b> 能自己完成「取托盘 → 放输送线」的全过程，不需要人工上下货。按下急停按钮试试——全线会立刻锁定。</p>',
          apply: cam(2), controls: ctl
        },
        {
          name: 'CNC 加工', title: '主轴转起来，铁屑才知道疼',
          ask: '绿色薄薄一层「光幕」是干什么用的？',
          body: '<p>开放式车铣单元：主轴按程序 <b>S3200 r/min</b> 下刀，把毛坯铣出沟槽。围栏缺口处那层绿色平面是<b>安全光幕</b>——有人闯入会立刻触发停机。</p>' +
            '<p>门滑关 → 加工 → 门滑开，全程由 PLC 联锁；只有门确认关闭主轴才允许启动，这是机床安全标准（ISO 16090）的基本要求。</p>',
          apply: cam(3), controls: ctl
        },
        {
          name: '视觉检测', title: '相机一眼，量出 0.01 mm',
          ask: '为什么检测工位要自带光源？',
          body: '<p>龙门架上的<b>工业相机</b> + 环形光源对工件做尺寸测量和外观判定。光源比相机还重要：稳定的光才能拍出稳定的图，车间灯光变化才不会造成误判。</p>' +
            '<p>判定结果实时写到小屏上（OK ✓），并同步到 MES——<b>不良品在这里就会被拦下</b>，不会流到后面工位。</p>',
          apply: cam(4), controls: ctl
        },
        {
          name: '激光刻码', title: '给每个零件一张身份证',
          ask: '油漆会掉，二维码凭什么一辈子擦不掉？',
          body: '<p>激光在工件表面烧蚀出 <b>DPM 码</b>（Direct Part Marking）——直接打在金属上，耐油、耐高温、不脱落。从这一刻起，这个工件有了唯一身份。</p>' +
            '<p>读码器扫码成功才放行；读不到码的工件会被踢到返修道——<b>一物一码</b>是全程追溯的起点。</p>',
          apply: cam(5), controls: ctl
        },
        {
          name: '机器人装配', title: '六轴机械臂的「手感」',
          ask: '机器人怎么知道压装力够不够？',
          body: '<p>六轴机器人把工件抓到<b>伺服压机</b>上压装端盖。压机实时采集<b>压力-位移曲线</b>，小屏上的 kN 读数就是压装力——曲线不合格立即报警，杜绝「压坏了还装上去」。</p>' +
            '<p>注意看机器人的肘关节：它实时解算 IK（逆运动学），让爪子始终垂直对准目标——这是六轴机器人「柔顺作业」的基本功。</p>',
          apply: cam(6), controls: ctl
        },
        {
          name: '自动包装', title: '最后一道工序，也有讲究',
          ask: '包装箱上的标签是谁贴的？',
          body: '<p>封装罩下行 → 开箱、装箱、折盖封箱一气呵成；贴标臂把<b>带追溯码的物流标签</b>打在箱侧。AGV-02 随后把成品箱送到入库台，空托盘自动回流。</p>' +
            '<p>到这里，一个毛坯完成了从原料到成品的全旅程，<b>每一次加工、检测、搬运都有记录</b>。</p>',
          apply: cam(7), controls: ctl
        },
        {
          name: '生产追溯', title: '把整条产线装进数据库',
          ask: '出了质量问题，怎么 10 分钟内定位批次？',
          body: '<p>俯瞰整条产线。左下角追溯面板记录的每一行，都对应数据库里的一条记录：<b>工件号、工位、时间、设备参数、判定结果</b>。</p>' +
            '<p>真实车间里这就是 MES 的核心：扫码读取出 W-xxxx 的全部履历——哪个班次加工、哪台设备、用了哪批料，<b>分钟级锁定影响范围</b>，这就是「智能制造」里数据的价值。</p>',
          apply: cam(8), controls: ctl
        }
      ];
    })(),

    quiz: null
    });
  });
})();
