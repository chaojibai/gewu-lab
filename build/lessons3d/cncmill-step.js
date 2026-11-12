/* ═══════════════════════════════════════════════════════════════════════
   MX-4LW 炮塔铣床 · 剖视 + 3D 数控面板操控 + 铣削仿真（第三轮：按图精修）
   ─────────────────────────────────────────────────────────────────────
   参考图：MX-4LW「主要技术参数图解」+「内部结构剖视示意图」。
   本轮四件事：
   ① 按图提质感：深蓝烤漆 + 奶白工作台/鞍座 + 乳白铸件剖切面；
      加工面用刮研 roughnessMap、漆面用 clearcoat + 颗粒 bump；
      三点光重新配平，360° 十六机位复核（build/shots 脚本出图）。
   ② 无自动转台：相机只跟鼠标拖拽，不自动环绕。
   ③ 知识卡片整块砍掉（DOM 里的 sTitle/sAsk/sBody 只留空壳）；
      3D 数控面板做成真按键：电源 / 正反转 / 转速升䧏 / 套筒升䧏 /
      冷却 / 自动走刀 / 急停（自锁），按下有行程、有指示灯、可键盘操作。
   ④ 内部传动按真实炮塔铣头重排（不是「一根轴串三个齿轮」）：
      立式主电机 1450 r/min 定速
        → 上双锥盘（Reeves 无级变速，可动盘轴向滑移）
        → 梯形 V 带（两轮包角与切线按当前半径实时重算）
        → 下双锥盘 = 主轴带轮
        → 高速档：带轮经花键套直驱主轴
        → 低速档：带轮同轴 22T → 偏心轴 48T ⇒ 同轴 22T → 主轴 48T 大齿轮
      背齿轮整组装在偏心轴上，由换挡手柄摆动啮合/脱开；
      主轴穿过带轮与大齿轮的花键孔随套筒下探，带轮与齿轮不跟着掉。
   真实参数：工作台 1270×254 · X780/Y380/Z300 · R8 · 75~4550 r/min ·
   2.2 kW · 3 条 T 槽 · 1566×1650×2100 · 1300 kg · 跳动 0.005。
   1 世界单位 = 50 mm（S=0.02）。构建： python build/build_chem.py cncmill-step
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var T = window.THREE, K = window.Lab;
  var PI = Math.PI, TAU = PI * 2;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  /* ── ① 常量 ───────────────────────────────────────────── */
  var S = 0.02;
  var GROUND = -15.5;
  var TABLE_Y = 3.35;
  /* 工件网格是「顶面 y=0、块体向下延伸」，所以 WP_Y 是工件【顶面】高度：
     台面顶(3.42) + 块高 40mm*S(0.8) = 4.22，整块才立在台面上而不是埋进去 */
  var WP_Y = TABLE_Y + 0.07 + 40 * S;
  var RPM_STEPS = [75, 110, 170, 260, 400, 620, 950, 1450, 2200, 3400, 4550];
  var LEAD = 5;                             /* 手轮 1 转 = 5 mm */
  var BW = 100, BD = 70, BH = 40;           /* 工件 mm（NX=BW+1 列 × NZ=BD+1 行） */
  var TOOL_R = 6;                           /* φ12 立铣刀 */
  var O = {}, G = null, CV = null;

  /* ── ② 材质：按参考图——深蓝烤漆机身 + 奶白工作台 + 乳白铸件内腔 ──
     质感三件事：① 漆面 clearcoat 低粗糙（新机器的高光条）
                 ② 加工面给 roughnessMap（刮研/拉丝），不是纯色
                 ③ 铸件给颗粒 bump，金属给足 envMapIntensity（否则发黑） */
  function paint(color, rough, clear, env) {
    return new T.MeshPhysicalMaterial({
      color: color, metalness: .09, roughness: rough,
      clearcoat: clear, clearcoatRoughness: .46,
      envMapIntensity: env
    });
  }
  /* 脏污/使用痕迹：整体接近白，只有很淡的斑块与竖直流痕。
     同时当 map 和 roughnessMap 用 —— 颜色有变化、高光也有变化，塑料感就没了。 */
  function grimeTex(rep, drip) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, 256, 256);
    for (i = 0; i < 46; i++) {
      var cx = Math.random() * 256, cy = Math.random() * 256, r = 12 + Math.random() * 46;
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(112,110,104,' + (.09 + Math.random() * .13).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,118,112,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    }
    if (drip) {
      for (i = 0; i < 26; i++) {
        var sx = Math.random() * 256, sy = Math.random() * 200;
        var gr = x.createLinearGradient(sx, sy, sx, sy + 30 + Math.random() * 60);
        gr.addColorStop(0, 'rgba(96,96,92,.18)');
        gr.addColorStop(1, 'rgba(100,100,96,0)');
        x.fillStyle = gr; x.fillRect(sx, sy, 1 + Math.random() * 3, 90);
      }
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 3, rep || 3);
    return t;
  }
  /* 漆面颗粒（凹凸用，不参与配色）：小而密的橘皮 */
  function grainTex(rep) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128);
    for (i = 0; i < 5200; i++) {
      var g = 108 + Math.floor(Math.random() * 40);
      x.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + (.25 + Math.random() * .5).toFixed(2) + ')';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, .28 + Math.random() * .95, 0, TAU); x.fill();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 6, rep || 6);
    return t;
  }
  /* 由高度场算法线贴图：漆面的橘皮、铸件的砂眼都是这么来的 */
  function normalTex(size, hFn, strength, rep) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d');
    var img = x.createImageData(size, size), d = img.data;
    for (var j = 0; j < size; j++) for (var i = 0; i < size; i++) {
      var hl = hFn(i - 1, j), hr = hFn(i + 1, j);
      var hu = hFn(i, j - 1), hd = hFn(i, j + 1);
      var nx = -(hr - hl) * strength, ny = -(hd - hu) * strength, nz = 1;
      var l = Math.sqrt(nx * nx + ny * ny + 1) || 1;
      var k = (j * size + i) * 4;
      d[k] = (nx / l * .5 + .5) * 255;
      d[k + 1] = (ny / l * .5 + .5) * 255;
      d[k + 2] = (nz / l * .5 + .5) * 255;
      d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep || 3, rep || 3);
    return t;
  }
  /* 加工面：拉丝/刮研 —— 当 roughnessMap 用，深浅决定高光碎不碎 */
  function grindTex(rep, scraped) {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'), i;
    x.fillStyle = '#8e8e8e'; x.fillRect(0, 0, 256, 256);
    if (scraped) {
      /* 刮研花：成排的短弧，一道压一道 */
      for (i = 0; i < 620; i++) {
        var g = 96 + Math.floor(Math.random() * 86);
        x.strokeStyle = 'rgba(' + g + ',' + g + ',' + g + ',.85)';
        x.lineWidth = .8 + Math.random() * 1.5;
        var cx = Math.random() * 256, cy = Math.random() * 256;
        x.beginPath(); x.arc(cx, cy, 3 + Math.random() * 7, Math.random() * TAU, Math.random() * TAU + .9);
        x.stroke();
      }
    } else {
      for (i = 0; i < 900; i++) {
        var g2 = 110 + Math.floor(Math.random() * 70);
        x.fillStyle = 'rgba(' + g2 + ',' + g2 + ',' + g2 + ',.5)';
        x.fillRect(0, Math.random() * 256, 256, .6 + Math.random() * 1.6);
      }
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep || 3, rep || 3);
    return t;
  }

  var MAT = {
    /* 机身烤漆：参考图是偏冷的工业深蓝（旧版过亮过饱和，一眼塑料） */
    blue:  paint(0x113562, .33, .72, .82),
    blueD: paint(0x0c2649, .35, .66, .78),
    blueL: paint(0x163a6a, .35, .66, .82),
    navy:  paint(0x0b2043, .31, .76, .88),
    /* 奶白铸件：压灰一档，避免点光 + PMREM 把白件刷成惨白塑料 */
    white: paint(0xafada5, .4, .28, .4),
    cream: paint(0xbcb8ad, .44, .22, .38),
    /* 灰铸铁（后立柱 / 滑枕 / 底座）：哑光、低环境反射 */
    castGray: new T.MeshStandardMaterial({ color: 0x565d65, metalness: .22, roughness: .72, envMapIntensity: .38 }),
    /* 铭牌底板、面板壳 */
    panelWhite: paint(0xb7bbbd, .52, .16, .26),
    /* 风琴防护罩：顶点色带明暗褶，材质本身要哑光双面 */
    bellows: new T.MeshStandardMaterial({ color: 0x1c2024, metalness: .04, roughness: .88,
      envMapIntensity: .14, side: T.DoubleSide }),
    /* 金属 */
    steel: new T.MeshStandardMaterial({ color: 0xc6cfd8, metalness: .9, roughness: .24, envMapIntensity: 1.5 }),
    steelD:new T.MeshStandardMaterial({ color: 0x8e9aa6, metalness: .93, roughness: .29, envMapIntensity: 1.35 }),
    gear:  new T.MeshStandardMaterial({ color: 0xd5dde5, metalness: .92, roughness: .21, envMapIntensity: 1.8 }),
    chrome:new T.MeshStandardMaterial({ color: 0xd2dbe4, metalness: .88, roughness: .3, envMapIntensity: 1.25 }),
    gold:  new T.MeshStandardMaterial({ color: 0xc08a1e, metalness: .95, roughness: .3, envMapIntensity: 1.3 }),
    goldL: new T.MeshStandardMaterial({ color: 0xe0aa32, metalness: .9, roughness: .28, envMapIntensity: 1.35 }),
    dark:  new T.MeshStandardMaterial({ color: 0x22272e, metalness: .35, roughness: .6, envMapIntensity: .55 }),
    darkM: new T.MeshStandardMaterial({ color: 0x39414b, metalness: .72, roughness: .4, envMapIntensity: .95 }),
    groove:new T.MeshStandardMaterial({ color: 0x121920, metalness: .5, roughness: .62, envMapIntensity: .45 }),
    /* 剖切面：乳白铸铁，不是深蓝 —— 参考图剖开的内腔是米白色 */
    castIn:new T.MeshStandardMaterial({ color: 0xbdb6a6, metalness: .06, roughness: .86, envMapIntensity: .22 }),
    alu:   new T.MeshStandardMaterial({ color: 0xffffff, metalness: .3, roughness: .36, envMapIntensity: 1.0, vertexColors: true }),
    aluS:  new T.MeshStandardMaterial({ color: 0xc9bda8, metalness: .32, roughness: .42, envMapIntensity: .55 }),
    /* 台面：刮研过的铸铁面，靠 roughnessMap 出碎高光 */
    tableTop: new T.MeshStandardMaterial({
      color: 0xa8b0b8, metalness: .82, roughness: .3,
      roughnessMap: grindTex(2, true), envMapIntensity: 1.15
    }),
    way:   new T.MeshStandardMaterial({
      color: 0x9fa9b3, metalness: .88, roughness: .26,
      roughnessMap: grindTex(4, true), envMapIntensity: 1.3
    }),
    red:   new T.MeshStandardMaterial({ color: 0xb62b26, metalness: .12, roughness: .34, envMapIntensity: .7 }),
    green: new T.MeshStandardMaterial({ color: 0x2f9e4f, emissive: 0x1c7a36, emissiveIntensity: .35, roughness: .32 }),
    orange:new T.MeshStandardMaterial({ color: 0xd8791c, metalness: .15, roughness: .44 }),
    hose:  new T.MeshStandardMaterial({ color: 0x2b5a44, metalness: .1, roughness: .68 }),
    rubber:new T.MeshStandardMaterial({ color: 0x1b1e21, metalness: .04, roughness: .82, envMapIntensity: .3 }),
    chip:  new T.MeshStandardMaterial({ color: 0xd2d9e0, metalness: .86, roughness: .28, envMapIntensity: 1.1 }),
    /* 面板按键：塑料，emissive 由状态点亮 */
    btnGreen: new T.MeshStandardMaterial({ color: 0x1f7a45, metalness: .12, roughness: .42, emissive: 0x0a2a15, emissiveIntensity: 1 }),
    btnDark:  new T.MeshStandardMaterial({ color: 0x2b3138, metalness: .22, roughness: .48, emissive: 0x000000, emissiveIntensity: 1 }),
    btnAmber: new T.MeshStandardMaterial({ color: 0xa8752a, metalness: .12, roughness: .44, emissive: 0x000000, emissiveIntensity: 1 })
  };

  function paintTex(rep) { return grainTex(rep); }
  (function () {
    var m = grainTex(6);
    var PAINT = ['blue', 'blueD', 'blueL', 'navy', 'white', 'cream', 'castGray', 'panelWhite'];
    PAINT.forEach(function (k) {
      MAT[k].bumpMap = m; MAT[k].bumpScale = .018;
    });
    /* 机身漆面：脏污贴图 + 粗糙度起伏，亮部/暗部都不再是一块死色 */
    var d1 = grimeTex(3, true);
    ['blue', 'blueD', 'blueL', 'navy', 'castGray'].forEach(function (k) {
      MAT[k].map = d1; MAT[k].roughnessMap = d1;
      MAT[k].roughness = .46; MAT[k].clearcoat = .42; MAT[k].envMapIntensity = .2;
    });
    var d2 = grimeTex(4, true);
    ['white', 'cream', 'panelWhite'].forEach(function (k) {
      MAT[k].map = d2; MAT[k].roughnessMap = d2;
      MAT[k].roughness = .5; MAT[k].envMapIntensity = .28;
    });
    /* 漆面法线：橘皮（细）+ 轻微起伏（粗）。法线比 bump 更能吃住侧光 */
    var hFn = function (i, j) {
      var v = Math.sin(i * .9 + j * .31) * .5 + Math.sin(i * .21 - j * .77) * .5;
      v += (Math.sin(i * 2.7 + j * 1.9) + Math.sin(i * 1.3 - j * 3.1)) * .22;
      return v;
    };
    var nm = normalTex(256, hFn, .55, 5);
    PAINT.forEach(function (k) {
      MAT[k].normalMap = nm;
      MAT[k].normalScale = new T.Vector2(.45, .45);
      MAT[k].bumpMap = null;
      MAT[k].needsUpdate = true;
    });
    /* 主电机是光滑烤漆圆筒：不能套铸件橘皮法线，否则读成碳纤维编织 */
    MAT.motorPaint = MAT.navy.clone();
    MAT.motorPaint.normalMap = null; MAT.motorPaint.bumpMap = null;
    MAT.motorPaint.roughness = .34; MAT.motorPaint.envMapIntensity = .46;
    MAT.motorPaint.needsUpdate = true;
    MAT.tableTop.color.setHex(0xa7b0b9);
    MAT.tableTop.roughness = .26;
    MAT.bellows.color.setHex(0x101316);
    MAT.bellows.roughness = .94;
  })();

  /* ── ③ 几何小工具 ─────────────────────────────────────── */
  function RM(w, h, d, r, mat) { return new T.Mesh(K.geoRoundBox(w, h, d, r == null ? .14 : r, 3), mat); }
  function BX(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }
  function CY(r, h, mat, seg) { return new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 24), mat); }
  function shadow(o) { o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); }

  var boltGeo = new T.CylinderGeometry(.13, .13, .24, 6);   /* 共享几何：内六角螺栓 */
  function bolt(x, y, z, mat) { var b = new T.Mesh(boltGeo, mat || MAT.darkM); b.position.set(x, y, z); return b; }
  function boltRing(g, cx, cy, cz, r, n, upright) {
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      var b = new T.Mesh(boltGeo, MAT.darkM);
      b.position.set(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
      if (!upright) b.rotation.x = PI / 2;
      g.add(b);
    }
  }

  /* 真齿轮：holeR 可指定（大轮要套在主轴上键连接） */
  function gearMesh(r, teeth, thick, mat, holeR, amp) {
    var sh = new T.Shape(), N = teeth * 4, i, a, rr, px, py, A = amp == null ? .19 : amp;
    for (i = 0; i <= N; i++) {
      a = i / N * TAU;
      var ph = i % 4;
      rr = (ph === 1 || ph === 2) ? r + A : r - A * .9;
      px = Math.cos(a) * rr; py = Math.sin(a) * rr;
      if (i === 0) sh.moveTo(px, py); else sh.lineTo(px, py);
    }
    var hole = new T.Path(); hole.absarc(0, 0, holeR || r * .22, 0, TAU, true); sh.holes.push(hole);
    var geo = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 1, curveSegments: 12 });
    geo.translate(0, 0, -thick / 2);
    var g = new T.Group();
    g.add(new T.Mesh(geo, mat));
    var hub = CY(holeR ? holeR + .14 : r * .34, thick + .3, MAT.steelD, 20); hub.rotation.x = PI / 2; g.add(hub);
    for (i = 0; i < 5; i++) {
      var a2 = i / 5 * TAU;
      var h3 = CY(r * .12, thick + .06, MAT.dark, 10);
      h3.rotation.x = PI / 2; h3.position.set(Math.cos(a2) * r * .56, Math.sin(a2) * r * .56, 0);
      g.add(h3);
    }
    return g;
  }

  function screwHelix(len, r, pitch, mat) {
    var turns = len / pitch, n = Math.ceil(turns * 9), pts = [], i;
    for (i = 0; i <= n; i++) {
      var t = i / n, a = t * turns * TAU;
      pts.push(new T.Vector3(Math.cos(a) * r, -len / 2 + t * len, Math.sin(a) * r));
    }
    return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, .022, 5, false), mat);
  }

  function handwheel(r, spokes, mat) {
    var g = new T.Group();
    g.add(new T.Mesh(new T.TorusGeometry(r, .13, 8, 30), mat));
    var hub = CY(.38, .45, MAT.steelD, 16); hub.rotation.x = PI / 2; g.add(hub);
    for (var i = 0; i < spokes; i++) {
      var sp = BX(r * 2 - .2, .16, .16, mat);
      sp.rotation.z = i * TAU / spokes; g.add(sp);
    }
    var knob = CY(.17, .6, MAT.dark, 12);
    knob.position.set(r - .15, 0, .34); g.add(knob);
    var stem = CY(.09, .5, MAT.steelD, 10);
    stem.position.set(r - .15, 0, .12); g.add(stem);
    return g;
  }
  /* 手轮装配：外层 mount 定朝向（法线 → X），内层 wheel 只绕自身 Z 自转；
     全部 mesh 标记 ctl，点击即可摇动该轴 */
  function wheelMount(x, y, z, r, spokes, mat, ctl, name, desc) {
    var mount = new T.Group(); mount.position.set(x, y, z); mount.rotation.y = PI / 2;
    var hw = handwheel(r, spokes, mat); mount.add(hw);
    K.tag(hw, name, desc);
    hw.traverse(function (m) { if (m.isMesh) { m.userData.ctl = ctl; O.ctlMeshes.push(m); } });
    return { mount: mount, wheel: hw };
  }

  /* 重型螺母座 */
  function nutHousing(mat) {
    var g = new T.Group();
    var fl = CY(1.5, .55, mat, 24); fl.rotation.z = PI / 2; g.add(fl);
    var barrel = CY(1.05, 1.9, mat, 24); barrel.rotation.z = PI / 2; g.add(barrel);
    [-.8, .8].forEach(function (dx) {
      var ring = new T.Mesh(new T.TorusGeometry(1.06, .1, 8, 24), MAT.steel);
      ring.rotation.y = PI / 2; ring.position.x = dx; g.add(ring);
    });
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * TAU;
      var b = CY(.12, .62, MAT.darkM, 8); b.rotation.z = PI / 2;
      b.position.set(.2, Math.cos(a) * 1.22, Math.sin(a) * 1.22); g.add(b);
    }
    return g;
  }
  /* 角接触轴承座：铸铁座壳 + 端盖 + 压紧螺栓 + 双列轴承环 */
  function bearingBlock(mat) {
    var g = new T.Group();
    var house = RM(1.7, 2.5, 2.5, .2, mat); g.add(house);
    var cap = CY(1.0, .34, MAT.steelD, 22); cap.rotation.z = PI / 2; cap.position.x = .62; g.add(cap);
    [[-.5, -.85], [-.5, .85], [.5, -.85], [.5, .85]].forEach(function (p) {
      var b = bolt(.78, p[0], p[1]); b.rotation.z = PI / 2; g.add(b);
    });
    [-.34, .34].forEach(function (dx) {
      var ring = new T.Mesh(new T.TorusGeometry(.92, .12, 8, 24), MAT.steel);
      ring.rotation.y = PI / 2; ring.position.x = dx - .55; g.add(ring);
    });
    return g;
  }

  function cable(a, b, sag, mat) {
    var m = new T.Vector3((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - sag, (a[2] + b[2]) / 2 + .6);
    var cv2 = new T.QuadraticBezierCurve3(new T.Vector3(a[0], a[1], a[2]), m, new T.Vector3(b[0], b[1], b[2]));
    return new T.Mesh(new T.TubeGeometry(cv2, 22, .085, 6, false), mat || MAT.dark);
  }

  /* ── ④ 屏幕 / 铭牌 ───────────────────────────────────── */
  function panelScreen() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 320;
    O.scrC = c; O.scrX = c.getContext('2d'); O.scrT = new T.CanvasTexture(c);
    var m = new T.Mesh(new T.PlaneGeometry(6.6, 4.1), new T.MeshBasicMaterial({ map: O.scrT }));
    var fr = RM(7.1, 4.6, .35, .1, MAT.dark); fr.position.z = -.22;
    var g = new T.Group(); g.add(fr); g.add(m);
    return g;
  }
  function drawScreen(s) {
    var x = O.scrX;
    x.fillStyle = '#0b141a'; x.fillRect(0, 0, 512, 320);
    x.strokeStyle = '#274a58'; x.lineWidth = 3; x.strokeRect(7, 7, 498, 306);
    x.fillStyle = '#5fbfd4'; x.font = 'bold 20px monospace';
    x.fillText('MX-4LW · DRO', 22, 36);
    x.textAlign = 'right';
    x.fillStyle = s.estop ? '#ff5d5d' : (s.power ? '#4fd08a' : '#57646d');
    x.fillText(s.estop ? 'E-STOP' : (s.power ? 'POWER ON' : 'POWER OFF'), 490, 36);
    x.textAlign = 'left';
    x.font = 'bold 40px monospace'; x.fillStyle = '#9ff0c0';
    x.fillText('X ' + s.xmm.toFixed(2), 22, 96);
    x.fillText('Y ' + s.ymm.toFixed(2), 22, 148);
    x.fillText('Z ' + s.zmm.toFixed(2), 22, 200);
    x.font = 'bold 22px monospace'; x.fillStyle = '#6bb6cc';
    x.fillText('S ' + Math.round(s.rpmAct) + ' r/min', 22, 244);
    x.fillText('F ' + Math.round(s.feed) + ' mm/min', 270, 244);
    var lo = s.rpmAct > 1 && s.rpmAct < 520;
    x.fillStyle = '#e8c07a';
    x.fillText((lo ? '低速档 · 背齿轮啮合' : '高速档 · 带传直驱'), 22, 282);
    x.fillStyle = '#6bb6cc';
    x.textAlign = 'right';
    x.fillText('套筒 ' + s.quillMm.toFixed(1) + '  冷却 ' + (s.coolant ? 'ON' : 'OFF'), 490, 282);
    x.textAlign = 'left';
    O.scrT.needsUpdate = true;
  }
  function namePlate() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 300;
    var x = c.getContext('2d');
    x.fillStyle = '#e5e9ec'; x.fillRect(0, 0, 512, 300);
    x.strokeStyle = '#5a6470'; x.lineWidth = 7; x.strokeRect(12, 12, 488, 276);
    x.fillStyle = '#17365f'; x.font = 'bold 44px sans-serif'; x.fillText('MX-4LW', 32, 66);
    x.fillStyle = '#20262c'; x.font = '25px sans-serif';
    ['炮塔式万能铣床 · R8 主轴', '工作台 1270×254  X780 Y380 Z300',
     '主轴 75~4550 r/min · 2.2 kW', '主轴轴向跳动 0.005 mm'].forEach(function (r, i) { x.fillText(r, 32, 116 + i * 40); });
    var t = new T.CanvasTexture(c);
    return new T.Mesh(new T.PlaneGeometry(5.4, 3.16), new T.MeshStandardMaterial({ map: t, roughness: .48, metalness: .12 }));
  }
  /* 机头铭牌板：真机是一整块「转速表 + 铭牌」丝印，不是空白门板。
     细表格 + 小字，远处看是浅灰一块，近看有信息量，这一条最去玩具感。 */
  function speedChart() {
    var c = document.createElement('canvas'); c.width = 768; c.height = 384;
    var x = c.getContext('2d');
    x.fillStyle = '#d9dbd7'; x.fillRect(0, 0, 768, 384);
    x.fillStyle = '#c3c7c6'; x.fillRect(0, 0, 768, 46);
    x.strokeStyle = '#7d858b'; x.lineWidth = 3; x.strokeRect(6, 6, 756, 372);
    x.fillStyle = '#1b3557'; x.font = 'bold 27px sans-serif'; x.fillText('主轴转速表 / SPINDLE SPEED', 20, 33);
    /* 上排：转速档位表 */
    var cols = 8, rows = 3, i, j;
    x.lineWidth = 1.8; x.strokeStyle = '#78838b';
    for (i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(20 + i * 91, 60); x.lineTo(20 + i * 91, 186); x.stroke(); }
    for (j = 0; j <= rows; j++) { x.beginPath(); x.moveTo(20, 60 + j * 42); x.lineTo(748, 60 + j * 42); x.stroke(); }
    var sp = [75, 110, 170, 260, 400, 620, 950, 1450, 2200, 3400, 4550];
    x.font = 'bold 22px monospace'; x.fillStyle = '#1b2630';
    for (i = 0; i < cols; i++) {
      x.fillText('H ' + (i + 1), 28 + i * 91, 86);
      x.fillText(String(sp[i] || ''), 28 + i * 91, 122);
      x.fillText('L ' + (i + 1), 28 + i * 91, 164);
    }
    /* 下排：铭牌参数 */
    x.strokeStyle = '#9aa1a6'; x.strokeRect(20, 202, 728, 160);
    x.fillStyle = '#22303c'; x.font = 'bold 22px sans-serif'; x.fillText('MX-4LW  炮塔式万能铣床', 36, 236);
    x.font = '19px monospace'; x.fillStyle = '#2d3842';
    ['MOTOR  2.2 kW / 1450 r/min     SPINDLE  R8',
     'TABLE  1270 x 254 mm   3 T-SLOTS  T型槽宽 16',
     'TRAVEL X780  Y380  Z300     QUILL 80 mm',
     '主轴轴向跳动 0.005 mm   工作台平行度 0.008/300',
     'NET WEIGHT 1300 kg      NO. 2024-MX4LW-0862'].forEach(function (r, k) { x.fillText(r, 36, 268 + k * 23); });
    var t = new T.CanvasTexture(c);
    if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    return new T.Mesh(new T.PlaneGeometry(7.45, 3.88),
      new T.MeshStandardMaterial({ map: t, roughness: .62, metalness: .06 }));
  }
  function motorPlate() {
    var c = document.createElement('canvas'); c.width = 384; c.height = 176;
    var x = c.getContext('2d');
    x.fillStyle = '#d7dce0'; x.fillRect(0, 0, 384, 176);
    x.strokeStyle = '#6c757d'; x.lineWidth = 5; x.strokeRect(8, 8, 368, 160);
    x.fillStyle = '#1d2b3a'; x.font = 'bold 34px sans-serif'; x.fillText('2.2 kW', 26, 58);
    x.font = 'bold 23px monospace';
    ['1450 r/min   50 Hz', '380 V   Y  /  5.2 A', 'Y2-100L-4   IP54'].forEach(function (r, i) { x.fillText(r, 26, 96 + i * 25); });
    var t = new T.CanvasTexture(c);
    if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    return new T.Mesh(new T.PlaneGeometry(1.5, .69),
      new T.MeshStandardMaterial({ map: t, roughness: .45, metalness: .28 }));
  }

  /* ── ⑤ 工件：1 mm 高度场 ─────────────────────────────── */
  var depth = new Float32Array((BW + 1) * (BD + 1));
  function buildWorkpiece() {
    var g = new T.Group();
    var geo = new T.PlaneGeometry(BW * S, BD * S, BW, BD);
    geo.rotateX(-PI / 2);
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    O.wpGeo = geo; O.wpPos = geo.attributes.position; O.wpCol = geo.attributes.color;
    var top = new T.Mesh(geo, MAT.alu); top.castShadow = true; top.receiveShadow = true; g.add(top);
    var h2 = BH * S / 2;
    [['f', BW * S, .05, BD * S / 2], ['b', BW * S, .05, -BD * S / 2]].forEach(function (p) {
      var w = BX(BW * S, BH * S, .05, MAT.aluS); w.position.set(0, -h2, p[3]); g.add(w);
    });
    [-1, 1].forEach(function (sg) {
      var w = BX(.05, BH * S, BD * S, MAT.aluS); w.position.set(sg * BW * S / 2, -h2, 0); g.add(w);
    });
    var bot = BX(BW * S, .05, BD * S, MAT.aluS); bot.position.set(0, -BH * S, 0); g.add(bot);
    rebuildTop();
    return g;
  }
  function hash2(i, j) { var v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); }
  function stamp(lxmm, lzmm, dmm) {
    var cx = lxmm + 50, cy = lzmm + 35, r = TOOL_R;
    var i0 = Math.max(0, Math.floor(cx - r - 1)), i1 = Math.min(BW, Math.ceil(cx + r + 1));
    var j0 = Math.max(0, Math.floor(cy - r - 1)), j1 = Math.min(BD, Math.ceil(cy + r + 1));
    var dirty = false, i, j;
    for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) {
      var dx = i - cx, dy = j - cy;
      if (dx * dx + dy * dy <= (r + .5) * (r + .5)) {
        var idx = j * (BW + 1) + i;
        if (dmm > depth[idx]) { depth[idx] = dmm; dirty = true; }
      }
    }
    if (dirty) O.wpDirty = true;
    return dirty;
  }
  function rebuildTop() {
    var pos = O.wpPos, col = O.wpCol, nrm = O.wpGeo.attributes.normal, i, n = pos.count;
    for (i = 0; i < n; i++) {
      var px = pos.getX(i), pz = pos.getZ(i);
      var ix = Math.min(BW, Math.max(0, Math.round(px / S + 50)));
      var iz = Math.min(BD, Math.max(0, Math.round(pz / S + 35)));
      var d = depth[iz * (BW + 1) + ix];
      pos.setY(i, -d * S);
      var sh = (d > .05) ? (.78 - .05 * Math.min(d / 4, 1) + (hash2(ix, iz) - .5) * .06)
                         : (1.0 + (hash2(ix, iz) - .5) * .03);
      col.setXYZ(i, .97 * sh, .88 * sh, .70 * sh);
      var dx2 = (depth[iz * (BW + 1) + Math.min(BW, ix + 1)] - depth[iz * (BW + 1) + Math.max(0, ix - 1)]) / 2;
      var dz2 = (depth[Math.min(BD, iz + 1) * (BW + 1) + ix] - depth[Math.max(0, iz - 1) * (BW + 1) + ix]) / 2;
      var len = Math.sqrt(dx2 * dx2 + dz2 * dz2 + 1);
      nrm.setXYZ(i, -dx2 / len, 1 / len, -dz2 / len);
    }
    pos.needsUpdate = true; col.needsUpdate = true; nrm.needsUpdate = true;
    O.wpGeo.computeBoundingSphere();
  }
  function resetWorkpiece() { depth.fill(0); rebuildTop(); }

  /* ── ⑥ 切屑 ──────────────────────────────────────────── */
  var chips = [], chipGeo = new T.TetrahedronGeometry(.055);
  function spawnChip(p) {
    var m = new T.Mesh(chipGeo, MAT.chip);
    m.position.set(p.x + (Math.random() - .5) * .3, p.y + .05, p.z + (Math.random() - .5) * .3);
    m.userData.v = new T.Vector3((Math.random() - .5) * 4, 2.2 + Math.random() * 3, 1.2 + Math.random() * 2.6);
    m.userData.life = .8 + Math.random() * .5;
    G.add(m); chips.push(m);
  }
  function updateChips(dt) {
    for (var i = chips.length - 1; i >= 0; i--) {
      var m = chips[i], u = m.userData;
      u.life -= dt; u.v.y -= 16 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += dt * 9; m.rotation.y += dt * 7;
      if (u.life <= 0 || m.position.y < WP_Y - BH * S - 2) { G.remove(m); chips.splice(i, 1); }
    }
    if (chips.length > 46) { G.remove(chips[0]); chips.shift(); }
  }

  /* ── ⑦ 状态（无转台）────────────────────────────────── */
  var st = {
    xmm: 0, ymm: 0, zmm: 0, quillMm: 0,
    rpmIdx: 7, rpmSet: 0, rpmAct: 0, feed: 0,
    turretDeg: 0, tiltDeg: 0,
    cutaway: false, coverT: 0,
    cutting: false, autoX: 0, autoDir: 1,
    /* 面板状态：电源 / 主轴旋向 / 冷却 / 急停（自锁） */
    power: true, dir: 'off', coolant: false, estop: false,
    t: 0, scrAcc: 0
  };
  function moveAxis(key, d) {
    var lim = { xmm: [-390, 390], ymm: [-190, 190], zmm: [0, 300], quillMm: [0, 80] }[key];
    st[key] = Math.min(lim[1], Math.max(lim[0], st[key] + d));
  }

  var SHEAVE_Y = -2.6, MOTOR_Z = 2.85, SPZ = .4;
  var MOD = .062, Z_SL = 22, Z_CB = 48, Z_PN = 22, Z_BL = 48;
  var R_SL = MOD * Z_SL / 2, R_BL = MOD * Z_BL / 2;
  var BACK_D = R_SL + R_BL;                        /* 2.975 偏心轴中心距 */
  var BACK_RATIO = (Z_SL / Z_CB) * (Z_PN / Z_BL);  /* ≈0.21 低速档减速比 */
  var SHEAVE_SUM = 1.06;                           /* 两轮工作半径之和（带长不变） */
  var BELT_D = MOTOR_Z - SPZ;                      /* 2.5 中心距 */

  /* 齿轮：外层组负责朝向，内层 spin 绕自身轴自转（几何沿 +Z 拉伸） */
  function spurGear(r, teeth, thick, mat, holeR, y, z, x) {
    var outer = new T.Group();
    outer.position.set(x || 0, y, z);
    outer.rotation.x = -PI / 2;                    /* 齿轮轴 → 竖直 Y */
    var g = gearMesh(r, teeth, thick, mat, holeR, MOD * .95);
    outer.add(g);
    return { outer: outer, spin: g };
  }
  function gearOnX(r, teeth, thick, mat, holeR, x, y, z) {
    var wrap = new T.Group(); wrap.position.set(x, y, z); wrap.rotation.z = PI / 2;
    var s = spurGear(r, teeth, thick, mat, holeR, 0, 0, 0);
    wrap.add(s.outer);
    return { outer: wrap, spin: s.spin };
  }

  /* 双锥盘：两盘窄端相对，夹出 V 型槽；带越往深处走（r 越小）两盘让得越开 */
  function makeSheave(z) {
    var g = new T.Group(); g.position.set(0, SHEAVE_Y, z);
    var up = new T.Mesh(new T.CylinderGeometry(.74, .30, 1.06, 34), MAT.steelD);
    var dn = new T.Mesh(new T.CylinderGeometry(.30, .74, 1.06, 34), MAT.steelD);
    var hub = new T.Mesh(new T.CylinderGeometry(.23, .23, 2.5, 16), MAT.steel);
    g.add(up); g.add(dn); g.add(hub);
    K.tag(up, '变速锥盘（Reeves）', '可动盘轴向滑移改变带轮工作半径：盘靠近 → 带往外走 → 主轴变快');
    return { g: g, up: up, dn: dn };
  }
  function layoutSheave(sh, r) {
    var off = .04 + (.74 - r) * .9;
    sh.up.position.y = .53 + off;
    sh.dn.position.y = -.53 - off;
  }

  /* V 带中心线：两圆外公切线 + 外弧，闭合成环（rA=主轴侧，rB=电机侧） */
  function beltLoop(rA, rB, d) {
    var a = Math.max(-.9, Math.min(.9, (rA - rB) / d));
    var b = Math.sqrt(1 - a * a);
    var phi = Math.atan2(a, b);
    var pts = [], N = 22, i, t;
    for (i = 0; i <= N; i++) {                    /* 主轴侧外弧 */
      t = phi - (PI + 2 * phi) * (i / N);
      pts.push([Math.cos(t) * rA, SPZ + Math.sin(t) * rA]);
    }
    for (i = 0; i <= N; i++) {                    /* 电机侧外弧 */
      t = (PI - phi) - (PI - 2 * phi) * (i / N);
      pts.push([Math.cos(t) * rB, SPZ + d + Math.sin(t) * rB]);
    }
    return pts;
  }
  /* 把折线挤出成矩形截面的带（平带环 → V 带厚度方向竖直） */
  function beltGeometry(loop, w, th) {
    var n = loop.length, pos = [], idx = [], i, k;
    for (i = 0; i < n; i++) {
      var p = loop[i], q = loop[(i + 1) % n], o = loop[(i - 1 + n) % n];
      var tx = q[0] - o[0], tz = q[1] - o[1], L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L;
      var nx = -tz, nz = tx;
      var ax = p[0] + nx * w / 2, az = p[1] + nz * w / 2;
      var bx = p[0] - nx * w / 2, bz = p[1] - nz * w / 2;
      pos.push(ax, -th / 2, az, ax, th / 2, az, bx, th / 2, bz, bx, -th / 2, bz);
    }
    for (i = 0; i < n; i++) {
      var A = i * 4, B = ((i + 1) % n) * 4;
      for (k = 0; k < 4; k++) {
        var k2 = (k + 1) % 4;
        idx.push(A + k, B + k, B + k2, A + k, B + k2, A + k2);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ── ⑧ 整机 ──────────────────────────────────────────── */
  function buildMachine() {
    var g = new T.Group();
    O.ctlMeshes = [];
    O.pressed = [];

    /* 带拔模的矩形棱柱（程序化小件仍用它）*/
    function draftBox(wb, wt, h, depth, mat) {
      var geo = new T.CylinderGeometry(wt / Math.SQRT2, wb / Math.SQRT2, h, 4, 1);
      geo.rotateY(Math.PI / 4);
      geo.scale(1, 1, (depth || wb) / wb);
      geo = geo.toNonIndexed();
      geo.computeVertexNormals();
      return new T.Mesh(geo, mat);
    }

    /* ── 机身：外壳来自 GLB ────────────────────────────────────────
       build/make_cncmill_glb.html 里预生成了倒角铸件、加强筋、分型线与
       顶点脏污梯度；这里只建「会动的东西」和操控件，再按名字把 GLB 的
       节点接进下面这些动画组：
         knee ← 升降台    saddle ← 鞍座    table ← 工作台
         turret / tilt ← 炮塔与铣头外壳    colCover / kneeCover / headCover ← 可拆盖
       没装到 GLB 时（本地预览）机型是空的，但丝杠手轮照常可用。 */
    O.knee = new T.Group();
    O.kneeCover = new T.Group();
    O.saddle = new T.Group();
    O.table = new T.Group();
    O.colCover = new T.Group();
    O.knee.add(O.kneeCover);
    O.knee.add(O.saddle);
    O.saddle.add(O.table);
    g.add(O.colCover);
    g.add(O.knee);

    /* 地脚（跟灰色底座的四角凸耳对齐） */
    [[-8.6, -12.4], [8.6, -12.4], [-8.6, 5.4], [8.6, 5.4]].forEach(function (p) {
      var f = BX(2.4, .6, 2.4, MAT.dark); f.position.set(p[0], GROUND + .28, p[1]); g.add(f);
    });

    /* 升降丝杠 + 螺母座 + Z 摇杆 */
    /* Z 升降丝杠必须在立柱内（z≈-4.6）：放在 z=-.9 会从主轴下方露出来，
       剖视里读作一根悬空弹簧 */
    O.liftScrew = new T.Group(); O.liftScrew.position.set(0, GROUND + 17.7, -4.6);
    O.liftScrew.add(CY(.4, 17, MAT.steelD, 18));
    O.liftScrew.add(screwHelix(16.2, .44, .26, MAT.steelD));
    g.add(O.liftScrew);
    K.tag(O.liftScrew.children[1], '升降丝杠（Z 轴）', '丝杠只转不升降；螺母座固定在升降台底面随台上下 —— 与真实结构一致');
    var liftNut = nutHousing(MAT.gold);
    liftNut.position.set(0, -3.9, -4.6); g.add(liftNut);
    O.liftNut = liftNut;
    /* Z 升降摇杆在立柱**右侧**（真机用一对伞齿轮把摇杆引到侧面），
       原来装在立柱座正前方中央，从正面看就是一片"悬空齿轮" */
    var gb = draftBox(2.4, 3.0, 2.6, 2.2, MAT.blueD);
    gb.position.set(3.7, GROUND + 8.2, 1.0); g.add(gb);
    var lcSh = CY(.28, 1.9, MAT.steelD, 14); lcSh.rotation.z = PI / 2;
    lcSh.position.set(5.3, GROUND + 8.2, 1.0); g.add(lcSh);
    var lcFl = CY(.86, .24, MAT.steelD, 20); lcFl.rotation.z = PI / 2;
    lcFl.position.set(6.0, GROUND + 8.2, 1.0); g.add(lcFl);
    var lc = wheelMount(6.35, GROUND + 8.2, 1.0, 1.5, 3, MAT.darkM, { act: 'wheel', key: 'zmm', step: 5 },
      'Z 垂向摇杆（可点击）', '点上半圈升降台升 5 mm、下半圈降 5 mm；丝杠转、螺母带台走');
    g.add(lc.mount); O.liftCrank = lc.wheel;

    /* 冷却软管 */
    var hose = cable([-3.6, GROUND + 9.4, 2.6], [-1.0, -12.0, 1.4], .45, MAT.hose);
    g.add(hose);
    K.tag(hose, '冷却液软管', '泵把切削液从底座水箱打上来对准刀尖浇；铣削发热不加冷却液会烧刀');
    [0.3, 0.6].forEach(function (t2) {
      var p = hose.geometry.parameters.path.getPoint(t2);
      var clip = new T.Mesh(new T.TorusGeometry(.3, .09, 6, 14), MAT.darkM);
      clip.position.copy(p); g.add(clip);
    });

    /* X 进给丝杠 */
    O.feedScrew = new T.Group(); O.feedScrew.position.set(0, -1.75, 5.6);
    var fsCore = CY(.38, 29, MAT.steelD, 18); fsCore.rotation.z = PI / 2; O.feedScrew.add(fsCore);
    var fsHel = screwHelix(28.2, .42, .26, MAT.steelD); fsHel.rotation.z = PI / 2; O.feedScrew.add(fsHel);
    O.knee.add(O.feedScrew);
    K.tag(fsHel, '进给丝杠（X 轴）', '手轮 1 转 = 5 mm；两端角接触轴承座轴向定位，螺母带动工作台走 780 mm');
    O.feedWheels = [];
    [-1, 1].forEach(function (sg) {
      var xx = sg * 14.6;
      var nh = nutHousing(MAT.gold); nh.position.set(xx, -1.75, 5.6); O.knee.add(nh);
      var ac = bearingBlock(MAT.blueD); ac.position.set(xx + (xx < 0 ? 1.7 : -1.7), -1.75, 5.6);
      O.knee.add(ac);
      if (sg > 0) {
        var w = wheelMount(xx, -1.75, 5.6, 1.45, 3, MAT.darkM, { act: 'wheel', key: 'xmm', step: 5 },
          'X 纵向手轮（可点击）', '上半圈工作台前进 5 mm、下半圈后退；丝杠转、螺母带台走，数显同步');
        O.knee.add(w.mount); O.feedWheels.push(w.wheel);
        var dial = CY(1.05, .3, MAT.steel, 28); dial.rotation.z = PI / 2;
        dial.position.set(xx - .55, -1.75, 5.6); O.knee.add(dial);
      }
    });
    var feedIdle = CY(.62, .34, MAT.gear, 20); feedIdle.rotation.z = PI / 2;
    feedIdle.position.set(-14.2, -1.75, 5.6); O.knee.add(feedIdle);
    O.feedWheels.push(feedIdle);

    /* Y 手轮 */
    var yw = wheelMount(-3.6, -2.6, 7.15, 1.75, 3, MAT.dark, { act: 'wheel', key: 'ymm', step: 5 },
      'Y 横向手轮（可点击）', '上半圈鞍座向前、下半圈向后，行程 ±190 mm');
    O.knee.add(yw.mount); O.yWheel = yw.wheel;
    var ystem = CY(.3, 1.5, MAT.steelD, 14); ystem.rotation.x = PI / 2;
    ystem.position.set(-3.6, -2.6, 6.5); O.knee.add(ystem);
    /* 轴承座 + 压盖：手轮必须读得出「装在升降台前壁上」，不能悬空 */
    var yBr = RM(1.3, 1.3, 1.15, .14, MAT.castGray);
    yBr.position.set(-3.6, -2.6, 6.35); O.knee.add(yBr);
    var yFl = CY(.82, .20, MAT.steelD, 20); yFl.rotation.x = PI / 2;
    yFl.position.set(-3.6, -2.6, 6.97); O.knee.add(yFl);

    /* 数显表：嵌进升降台前壁，外面一圈深色边框 —— 之前白盒孤零零凸在丝杠上方 */
    var droRim = BX(3.55, 3.45, .16, MAT.dark); droRim.position.set(4.4, -2.85, 8.14); O.knee.add(droRim);
    var dro = draftBox(3.2, 3.1, 2.2, 1.4, MAT.white); dro.position.set(4.4, -2.85, 7.05); O.knee.add(dro);
    var droScr = BX(2.4, 1.1, .08, MAT.green); droScr.position.set(4.4, -2.6, 8.18); O.knee.add(droScr);
    for (var di = 0; di < 3; di++) {
      var dbtn = BX(.35, .22, .1, MAT.dark); dbtn.position.set(3.55 + di * .55, -3.5, 8.20);
      O.knee.add(dbtn);
    }

    /* 工作台左端驱动箱（白色大方块已由护罩端盖承担，这里压成小铸件） */
    var hd = new T.Group(); hd.position.set(-16.3, 1.5, 1.8);
    var hdBody = RM(2.9, 2.2, 5.4, .16, MAT.castGray); hd.add(hdBody);
    /* 托架：小箱必须托在工作台端面下，不能悬空 */
    var hdArm = BX(1.4, .34, 4.6, MAT.castGray); hdArm.position.set(1.1, .55, 0); hd.add(hdArm);
    var hdLid = RM(2.6, .22, 4.8, .08, MAT.steelD); hdLid.position.y = 1.16; hd.add(hdLid);
    var hdRecess = BX(1.9, .8, .10, MAT.dark); hdRecess.position.set(-1.5, .25, 0); hd.add(hdRecess);
    [-1, 1].forEach(function (sg2) {
      var b4 = bolt(-1.15, 1.28, sg2 * 1.9); hd.add(b4);
    });
    O.table.add(hd);
    K.tag(hdBody, 'X 轴端部驱动箱', '电机经齿轮带丝杠；手动 / 机动进给切换手柄在侧面');

    /* 工件 + 压板装夹 */
    O.wp = buildWorkpiece(); O.wp.position.set(0, WP_Y, 1.8); O.table.add(O.wp);
    [-2.6, 2.6].forEach(function (zz) {
      var b2 = CY(.09, .5, MAT.steelD, 10); b2.position.set(6.5, WP_Y - .05, 1.8 + zz); O.table.add(b2);
      var nut = CY(.16, .17, MAT.darkM, 6); nut.position.set(6.5, WP_Y + .22, 1.8 + zz); O.table.add(nut);
      var clamp = BX(2.8, .18, .6, MAT.darkM); clamp.position.set(5.4, WP_Y + .12, 1.8 + zz);
      O.table.add(clamp);
      var shim = BX(.55, .32, .55, MAT.steelD); shim.position.set(6.6, WP_Y - .1, 1.8 + zz);
      O.table.add(shim);
    });

    /* ═══ 炮塔铣头：按参考图收窄到 8.6，内部传动同步重排 ═══════════════
       宽度 11.2 → 8.6，齿轮模数 .085 → .062（模块作用域已改），
       否则偏心轴上的 48T 会顶穿箱壁。动力链本身不变：
       电机 1450 定速 → 上双锥盘 → V 带 → 主轴带轮
       → 高速档直驱 / 低速档经偏心轴背齿轮组（22→48 ⇒ 22→48，0.21） */
    var HW = 4.3, HD2 = 8.4;

    O.turret = new T.Group(); O.turret.position.set(0, GROUND + 36.9, 0);
    O.tilt = new T.Group(); O.tilt.position.set(0, -1.2, 1.5); O.turret.add(O.tilt);
    O.headCover = new T.Group(); O.tilt.add(O.headCover);
    boltRing(O.turret, 0, .5, -.6, 3.1, 6, false);

    /* ── ⑤ 主电机：实物照是光滑深蓝圆柱 + 银色铭牌 + 底部银环，
       没有一圈外凸散热翅片（旧版 16 根翅片是"玩具感"最大来源之一） ── */
    O.motor = new T.Group(); O.motor.position.set(0, 3.2, MOTOR_Z);
    var mot = CY(1.9, 5.8, MAT.motorPaint, 40); O.motor.add(mot);
    K.tag(mot, '⑤ 主电机（2.2 kW · 1450 r/min 定速）', '电机转速不变；变速靠双锥盘改带轮比 + 背齿轮减速，才得到 75~4550 r/min');
    /* 极浅的竖向漆棱：给圆柱面一点分瓣，不做凸出散热片 */
    for (var mi = 0; mi < 14; mi++) {
      var a3 = mi / 14 * TAU;
      var fin = BX(.045, 5.25, .06, MAT.motorPaint);
      fin.position.set(Math.cos(a3) * 1.905, 0, Math.sin(a3) * 1.905);
      fin.rotation.y = -a3; O.motor.add(fin);
    }
    var motBand = CY(1.96, .40, MAT.steelD, 36); motBand.position.y = -2.82; O.motor.add(motBand);
    var motTop = CY(1.93, .14, MAT.steelD, 36); motTop.position.y = 2.72; O.motor.add(motTop);
    var motCap = CY(1.88, .24, MAT.blueD, 36); motCap.position.y = 2.98; O.motor.add(motCap);
    var fanCap = CY(.52, .18, MAT.darkM, 20); fanCap.position.y = 3.16; O.motor.add(fanCap);
    var mp = motorPlate(); mp.position.set(0, 1.40, 1.93); O.motor.add(mp);
    var jb = RM(1.25, 1.15, .78, .10, MAT.blueD); jb.position.set(1.86, .55, 0); O.motor.add(jb);
    var mShaft = CY(.2, 6.2, MAT.steelD, 14); mShaft.position.y = -3.5; O.motor.add(mShaft);
    O.tilt.add(O.motor);
    var mboss = CY(.62, .8, MAT.blueD, 20); mboss.position.set(0, .3, MOTOR_Z); O.tilt.add(mboss);
    /* 机头顶四周四根黑色 T 形变速 / 锁紧手柄（实物照的标志细节） */
    /* 四根手柄全部放在机头右半侧（x>0）：左壁是剖切可拆件，
       朝左的手柄拆壁后会悬在半空 */
    [0, 1, 2, 3].forEach(function (q) {
      var a = -.95 + q * .62;
      var rod = CY(.085, 1.75, MAT.darkM, 10);
      rod.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0),
        new T.Vector3(Math.cos(a), 0, Math.sin(a)));
      rod.position.set(Math.cos(a) * 3.55, .32, MOTOR_Z + Math.sin(a) * 3.55);
      O.tilt.add(rod);
      var ball = new T.Mesh(new T.SphereGeometry(.22, 12, 10), MAT.dark);
      ball.position.set(Math.cos(a) * 4.42, .32, MOTOR_Z + Math.sin(a) * 4.42);
      O.tilt.add(ball);
    });

    /* ── 双锥盘 + V 带 ── */
    O.shUp = makeSheave(MOTOR_Z); O.tilt.add(O.shUp.g);
    O.shDn = makeSheave(SPZ); O.tilt.add(O.shDn.g);
    layoutSheave(O.shUp, .56); layoutSheave(O.shDn, .50);
    /* 带在深蓝内腔里必须读得出来：比橡胶稍亮的灰 + 双面 + 一点金属粉 */
    O.belt = new T.Mesh(beltGeometry(beltLoop(.50, .56, BELT_D), .19, .30),
      new T.MeshStandardMaterial({ color: 0x4c545c, metalness: .18, roughness: .55,
        envMapIntensity: .55, side: T.DoubleSide }));
    O.belt.position.set(0, SHEAVE_Y, 0);
    O.tilt.add(O.belt);
    K.tag(O.belt, 'V 带（无级变速）', '工作半径随两锥盘开合变化；带轮比一改，主轴转速连续可调');

    /* ── 带轮花键套 + 同轴小齿轮 ── */
    var sleeve = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.9, 24, 1, true),
      new T.MeshStandardMaterial({ color: 0xa8b4c0, metalness: .94, roughness: .25, envMapIntensity: 1.5, side: T.DoubleSide }));
    sleeve.position.set(0, SHEAVE_Y - 1.0, SPZ); O.tilt.add(sleeve);
    O.sleeveGear = spurGear(R_SL, Z_SL, .48, MAT.gear, .28, -3.45, SPZ, 0);
    O.tilt.add(O.sleeveGear.outer);
    K.tag(O.sleeveGear.spin, '带轮同轴小齿轮（22T）', '低速档动力从这里下去：先驱动偏心轴上的 48T，再经同一根轴的 22T 带动主轴大齿轮');

    /* ── 偏心轴背齿轮组 ── */
    O.carrier = new T.Group(); O.carrier.position.set(0, 0, SPZ); O.tilt.add(O.carrier);
    O.cBack = new T.Group(); O.cBack.position.set(BACK_D, 0, 0); O.carrier.add(O.cBack);
    var cShaft = CY(.24, 3.6, MAT.steelD, 16); cShaft.position.y = -4.1; O.cBack.add(cShaft);
    O.cBig = spurGear(R_BL, Z_CB, .48, MAT.gear, .3, -3.45, 0, 0);
    O.cPin = spurGear(R_SL, Z_PN, .48, MAT.gear, .3, -4.75, 0, 0);
    O.cBack.add(O.cBig.outer); O.cBack.add(O.cPin.outer);
    K.tag(O.cBig.spin, '背齿轮组 · 大轮（48T）', '与带轮同轴的 22T 啮合；整组装在偏心轴上，换挡时连轴一起摆进/摆出');
    K.tag(O.cPin.spin, '背齿轮组 · 小轮（22T）', '与主轴 48T 大齿轮啮合；两级合起来减速比 (22/48)² ≈ 0.21，即 1:4.8');
    var hlArm = BX(1.5, .3, .38, MAT.darkM); hlArm.position.set(BACK_D + .75, -2.75, 0); O.cBack.add(hlArm);
    var hlKnob = CY(.26, .68, MAT.dark, 16); hlKnob.rotation.z = PI / 2;
    hlKnob.position.set(BACK_D + 1.5, -2.75, 0); O.cBack.add(hlKnob);
    hlKnob.userData.ctl = { act: 'range' }; O.ctlMeshes.push(hlKnob);
    K.tag(hlKnob, '点击：高/低速档换挡', '手柄转动偏心轴，把背齿轮组摆进啮合（低速档）或退出（高速档直传）');

    /* ── 主轴大齿轮 ── */
    O.bullGear = spurGear(R_BL, Z_BL, .52, MAT.gear, .42, -4.75, SPZ, 0);
    O.tilt.add(O.bullGear.outer);
    K.tag(O.bullGear.spin, '主轴大齿轮（48T · bull gear）', '与主轴花键连接、同轴同速；低速档由背齿轮 22T 驱动它');

    /* ── 套筒（半剖）── */
    O.quill = new T.Group(); O.quill.position.set(0, -9.2, SPZ);
    var qmat = new T.MeshStandardMaterial({ color: 0xc2ccd6, metalness: .95, roughness: .2, envMapIntensity: 1.5, side: T.DoubleSide });
    var quill = new T.Mesh(new T.CylinderGeometry(1.18, 1.18, 6.4, 30, 1, true, PI / 2, PI), qmat);
    quill.position.y = .5; O.quill.add(quill);
    K.tag(quill, '主轴套筒（Z 向进给 · 半剖）', '套筒外圆在铣头孔内滑动，背面齿条由小齿轮带动；套筒只进给、不旋转');
    var qLip = new T.Mesh(new T.TorusGeometry(1.18, .1, 8, 30, PI), qmat);
    qLip.rotation.x = PI / 2; qLip.rotation.z = PI / 2; qLip.position.y = -2.7; O.quill.add(qLip);
    for (var ri2 = 0; ri2 < 21; ri2++) {
      var tooth = BX(.46, .16, .16, MAT.steelD);
      tooth.position.set(0, 3.5 - ri2 * .31, -1.2); O.quill.add(tooth);
    }
    O.tilt.add(O.quill);

    /* ── 主轴 ── */
    O.spindle = new T.Group(); O.spindle.position.set(0, -9.2, SPZ);
    var spUp = CY(.32, 3.6, MAT.chrome, 20); spUp.position.y = 5.4; O.spindle.add(spUp);
    for (var sj = 0; sj < 6; sj++) {
      var a4 = sj / 6 * TAU;
      var spl = BX(.1, 3.2, .15, MAT.steelD);
      spl.position.set(Math.cos(a4) * .32, 5.6, Math.sin(a4) * .32);
      spl.rotation.y = -a4; O.spindle.add(spl);
    }
    var spMid = CY(.44, 3.4, MAT.steel, 22); spMid.position.y = 1.9; O.spindle.add(spMid);
    var spNose = CY(.58, 4.2, MAT.chrome, 26); spNose.position.y = -1.9; O.spindle.add(spNose);
    var noseRing = new T.Mesh(new T.TorusGeometry(.59, .06, 8, 26), MAT.steelD);
    noseRing.rotation.x = PI / 2; noseRing.position.y = -3.9; O.spindle.add(noseRing);
    K.tag(spUp, '主轴（R8 · 花键段）', '上段是花键，带轮和大齿轮的孔套在上面滑动 —— 套筒下探时带轮不跟着掉，这一条最容易做错');
    K.tag(spNose, '主轴下段（R8 锥孔）', 'R8 锥面自锁 + 拉杆拉紧刀柄；径向跳动 0.005 mm');
    var drawbar = CY(.13, 11.0, MAT.darkM, 10); drawbar.position.y = 2.4; O.spindle.add(drawbar);
    var drawnut = CY(.29, .34, MAT.dark, 6); drawnut.position.y = 7.35; O.spindle.add(drawnut);
    K.tag(drawnut, '拉杆 / 并紧螺母', '从主轴顶穿下去拉紧 R8 刀柄；换刀时松螺母、退锥面');

    O.tool = new T.Group(); O.tool.position.y = -4.85;
    var taper = new T.Mesh(new T.CylinderGeometry(.42, .28, 1.1, 20), MAT.steel); taper.position.y = .55; O.tool.add(taper);
    var holder = CY(.42, .5, MAT.steelD, 20); holder.position.y = 1.25; O.tool.add(holder);
    var cutter = CY(.12, 1.0, MAT.steel, 16); cutter.position.y = -.5; O.tool.add(cutter);
    for (var fl = 0; fl < 4; fl++) {
      var flute = BX(.07, .9, .14, MAT.dark); flute.position.y = -.48;
      var flg = new T.Group(); flg.add(flute); flg.rotation.y = fl * PI / 2 + .28; O.tool.add(flg);
    }
    var tipF = CY(.122, .06, MAT.dark, 16); tipF.position.y = -1.0; O.tool.add(tipF);
    O.spindle.add(O.tool);
    O.tip = new T.Object3D(); O.tip.position.y = -1.05; O.tool.add(O.tip);
    O.tilt.add(O.spindle);

    /* ── 套筒进给：齿条小齿轮 + 进给轴 + 手轮 + 发条 + 锁紧 ── */
    O.qPin = gearOnX(.4, 12, .5, MAT.gear, .13, 1.95, -7.6, -1.62);
    O.tilt.add(O.qPin.outer);
    var qShaft = CY(.18, 3.0, MAT.steelD, 12); qShaft.rotation.z = PI / 2;
    qShaft.position.set(3.45, -7.6, -1.62); O.tilt.add(qShaft);
    var qbush = CY(.38, .45, MAT.blueD, 16); qbush.rotation.z = PI / 2;
    qbush.position.set(4.02, -7.6, -1.62); O.tilt.add(qbush);
    K.tag(O.qPin.spin, '套筒进给小齿轮', '与套筒背面齿条啮合：手轮一转，套筒下探 3 mm');

    var sprH = new T.Group(); sprH.position.set(-3.6, -7.4, SPZ);
    var sprCase = CY(.95, .4, MAT.blueD, 26); sprCase.rotation.z = PI / 2; sprH.add(sprCase);
    var sprCap = CY(.5, .18, MAT.steelD, 18); sprCap.rotation.z = PI / 2; sprCap.position.x = .26; sprH.add(sprCap);
    var sprCoil = new T.Mesh(new T.TorusGeometry(.62, .1, 8, 30), MAT.steelD);
    sprCoil.rotation.y = PI / 2; sprCoil.position.x = .2; sprH.add(sprCoil);
    O.tilt.add(sprH);
    K.tag(sprCase, '发条盒（套筒回程）', '下压手柄时发条上劲，松手自动回位；微进给靠蜗轮蜗杆自锁');

    var qlock = CY(.15, 1.3, MAT.darkM, 10); qlock.rotation.x = PI / 2;
    qlock.position.set(3.6, -6.1, 1.1); O.tilt.add(qlock);
    var qlockK = new T.Mesh(new T.SphereGeometry(.24, 12, 10), MAT.dark);
    qlockK.position.set(3.6, -6.1, 1.85); O.tilt.add(qlockK);

    /* ── 变速盘 / 铭牌 / 警示条挂到 GLB 的前盖上（没有 GLB 时挂到 tilt）── */
    var hc = O.headCover || new T.Group();
    O.headCover = hc;
    if (hc.parent !== O.tilt) O.tilt.add(hc);
    /* 衬套孔凸台（GLB 底板上的细节） */
    var boreBoss = new T.Mesh(new T.TorusGeometry(1.56, .2, 10, 30), MAT.blueD);
    boreBoss.rotation.x = PI / 2; boreBoss.position.set(0, -9.24, SPZ); O.tilt.add(boreBoss);
    var boreRing = new T.Mesh(new T.TorusGeometry(1.5, .06, 8, 28), MAT.steelD);
    boreRing.rotation.x = PI / 2; boreRing.position.set(0, -9.12, SPZ); O.tilt.add(boreRing);
    /* 铭牌表格丝印：嵌进 GLB 前盖的圆角窗里（旧版这里是一整块空白白门） */
    var chart = speedChart(); chart.position.set(0, -4.25, 4.585); hc.add(chart);
    /* 铭牌板四颗沉头螺钉：真机铭牌是铆上去的，有紧固件才不像贴纸 */
    [[-3.45, -2.55], [3.45, -2.55], [-3.45, -5.95], [3.45, -5.95]].forEach(function (p) {
      var bs = bolt(p[0], p[1], 4.60, MAT.steelD); bs.rotation.x = PI / 2; hc.add(bs);
    });
    /* 红白变速盘下移到机头下部右侧，与实物照一致 */
    var DX = 2.55, DY = -7.35;
    var dialP = CY(1.0, .26, MAT.steelD, 30); dialP.rotation.x = PI / 2;
    dialP.position.set(DX, DY, 4.72); hc.add(dialP);
    var dialFace = CY(.82, .07, MAT.red, 30); dialFace.rotation.x = PI / 2;
    dialFace.position.set(DX, DY, 4.86); hc.add(dialFace);
    var dialCore = CY(.30, .08, MAT.panelWhite, 20); dialCore.rotation.x = PI / 2;
    dialCore.position.set(DX, DY, 4.91); hc.add(dialCore);
    for (var dk = 0; dk < 12; dk++) {
      var da = dk / 12 * TAU;
      var tick2 = BX(.12, .05, .04, MAT.panelWhite);
      tick2.position.set(DX + Math.cos(da) * .64, DY + Math.sin(da) * .64, 4.91);
      tick2.rotation.z = da; hc.add(tick2);
    }
    O.dialPtr = new T.Group(); O.dialPtr.position.set(DX, DY, 4.94); hc.add(O.dialPtr);
    var ptr = BX(.44, .08, .05, MAT.goldL); ptr.position.set(.18, 0, 0); O.dialPtr.add(ptr);
    dialP.userData.ctl = { act: 'rpm' }; O.ctlMeshes.push(dialP);
    dialFace.userData.ctl = { act: 'rpm' }; O.ctlMeshes.push(dialFace);
    O.dialPtr.traverse(function (m3) { if (m3.isMesh) { m3.userData.ctl = { act: 'rpm' }; O.ctlMeshes.push(m3); } });
    K.tag(dialP, '点击：变速盘（11 档）', '真机用这个盘旋转螺杆改双锥盘开合；这里点一下换一档，带轮半径会跟着变');
    /* 左侧黄底警示贴 + 几条斜纹（实物照机头左侧那块菱形警告牌） */
    var warn = BX(1.15, 1.0, .06, MAT.orange); warn.position.set(-4.55, -3.65, 4.60); hc.add(warn);
    var warnIn = BX(.62, .62, .07, MAT.red); warnIn.position.set(-4.55, -3.65, 4.64);
    warnIn.rotation.z = PI / 4; hc.add(warnIn);
    for (var hz = 0; hz < 5; hz++) {
      var stripe = BX(.16, 1.1, .05, MAT.goldL);
      stripe.position.set(-3.4 + hz * .2, -7.75, 4.60); stripe.rotation.z = .5; hc.add(stripe);
    }
    /* 黄色电气盒挂在前盖上（跟左壁一起走）：左壁一拆，挂在侧壁上的盒子会悬空 */
    var ebox = draftBox(1.4, 1.35, 1.5, 1.1, MAT.orange); ebox.position.set(-4.9, -2.4, 4.35); hc.add(ebox);
    var eSw = BX(.65, .65, .12, MAT.red); eSw.position.set(-4.9, -2.3, 4.95); hc.add(eSw);
    O.headCover = hc; O.tilt.add(hc);

    [-1, 1].forEach(function (sg) {
      var lv2 = CY(.14, 1.4, MAT.darkM, 10); lv2.rotation.z = PI / 2;
      lv2.position.set(sg * 4.7, -1.9, 1.4); O.tilt.add(lv2);
      var k5 = new T.Mesh(new T.SphereGeometry(.24, 12, 10), MAT.dark);
      k5.position.set(sg * 5.35, -1.9, 1.4); O.tilt.add(k5);
    });

    var qw = wheelMount(4.9, -7.6, -1.62, 1.75, 3, MAT.darkM, { act: 'wheel', key: 'quillMm', step: 3 },
      '套筒进给手柄（可点击）', '点上半圈套筒下探 3 mm（吃刀）、下半圈退回；齿条推动套筒，发条负责回程');
    O.tilt.add(qw.mount); O.quillHandle = qw.wheel;

    /* 两根斜向上的黑色球头手柄（套筒进给 / 主轴刹车），实物照机头右侧很显眼 */
    [[4.95, -5.55, 2.25, 3.4, -.60], [4.35, -2.70, 2.05, 2.5, -.95]].forEach(function (p) {
      var lev = CY(.105, p[3], MAT.darkM, 10);
      lev.position.set(p[0], p[1], p[2]); lev.rotation.z = p[4]; O.tilt.add(lev);
      var ball = new T.Mesh(new T.SphereGeometry(.23, 12, 10), MAT.dark);
      ball.position.set(p[0] - Math.sin(p[4]) * p[3] / 2,
                        p[1] + Math.cos(p[4]) * p[3] / 2, p[2]);
      O.tilt.add(ball);
    });
    g.add(O.turret);

    /* ═══ ② 数控操作面板：屏幕为主，8 个键 + 急停 + 旋钮，全部可直接点 ═══ */
    var PX = 9.9, PY = 15.4, PZ = 4.1, PW = 6.2, PH = 7.6, PD = 1.15;
    var PF = PZ;                                   /* 面板正面 z */
    var arm1 = CY(.26, 5.0, MAT.darkM, 12); arm1.rotation.z = PI / 2;
    arm1.position.set(7.0, 18.4, -2.0); g.add(arm1);
    var arm2 = CY(.24, 5.2, MAT.darkM, 12); arm2.rotation.set(PI / 2, 0, .24);
    arm2.position.set(8.6, 16.6, .9); g.add(arm2);
    var pbox = RM(PW, PH, PD, .26, MAT.white);
    pbox.position.set(PX, PY, PZ - PD / 2); g.add(pbox);
    K.tag(pbox, '② 数控操作面板', '屏幕是实时 DRO；下面 8 个键都能直接点：电源 / 正反转 / 转速升降 / 冷却 / 走刀 / 急停（自锁）');
    [[-2.8, 3.6], [2.8, 3.6], [-2.8, -3.6], [2.8, -3.6]].forEach(function (p) {
      g.add(bolt(PX + p[0], PY + p[1], PF + .04));
    });

    var TXT = {};
    function txtTex(s, col) {
      var key = s + '|' + (col || '');
      if (TXT[key]) return TXT[key];
      var c = document.createElement('canvas'); c.width = 256; c.height = 64;
      var x = c.getContext('2d');
      x.fillStyle = col || '#161b20';
      x.font = 'bold 32px "Microsoft YaHei",sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(s, 128, 34);
      var t = new T.CanvasTexture(c);
      if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
      TXT[key] = t; return t;
    }

    /* —— 屏幕（占上半板）—— */
    O.screen = panelScreen();
    O.screen.scale.set(.8, .8, 1);
    O.screen.position.set(PX, PY + 2.0, PF + .07); g.add(O.screen);

    /* —— 状态灯 —— */
    O.leds = {};
    ['pwr', 'fw', 'ccw', 'cool', 'cut'].forEach(function (k, i) {
      var led = CY(.075, .09, MAT.btnDark.clone(), 10);
      led.rotation.x = PI / 2;
      led.position.set(PX - 2.15 + i * .34, PY + .02, PF + .04);
      g.add(led); O.leds[k] = led;
    });
    var ledBar = new T.Mesh(new T.PlaneGeometry(2.0, .05),
      new T.MeshStandardMaterial({ color: 0x1a1f24, roughness: .8 }));
    ledBar.position.set(PX - 1.05, PY + .02, PF + .02); g.add(ledBar);

    /* —— 按键 —— */
    function mkKey(x, y, r, label, ctl, kind) {
      var mat;
      if (kind === 'green') mat = MAT.btnGreen.clone();
      else if (kind === 'amber') mat = MAT.btnAmber.clone();
      else if (kind === 'stop') mat = new T.MeshStandardMaterial({ color: 0xa8231e, metalness: .22, roughness: .38, emissive: 0x1a0302, emissiveIntensity: 1 });
      else mat = MAT.btnDark.clone();
      /* 工业面板是扁平方键，不是一圈彩色大圆钮（旧版最像玩具的地方） */
      var base = RM((r + .10) * 2, (r + .10) * 2, .12, .05, MAT.dark);
      base.position.set(x, y, PF + .02); g.add(base);
      var cap = RM(r * 2, r * 2, .16, .05, mat);
      cap.position.set(x, y, PF + .10); g.add(cap);
      cap.userData.baseZ = PF + .10;
      /* 命中盒：比键帽大一圈，边缘也点得中 */
      var hit = new T.Mesh(new T.CylinderGeometry(r + .2, r + .2, .34, 12),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.rotation.x = PI / 2; hit.position.set(x, y, PF + .12);
      hit.userData.ctl = ctl; hit.userData.visual = cap; hit.userData.baseZ = PF + .10;
      O.ctlMeshes.push(hit);
      if (label) {
        var lp = new T.Mesh(new T.PlaneGeometry(.88, .22),
          new T.MeshBasicMaterial({ map: txtTex(label), transparent: true }));
        lp.position.set(x, y + r + .2, PF + .02); g.add(lp);
      }
      return { cap: cap, mat: mat };
    }

    /* 键盘矩阵：真机屏幕下方一整片小方键，两色交替 + 键帽厚度 */
    var keyGeo = new T.BoxGeometry(.44, .30, .10);
    for (var kr = 0; kr < 3; kr++) for (var kc = 0; kc < 7; kc++) {
      var km = new T.Mesh(keyGeo, (kr + kc) % 5 === 0 ? MAT.btnDark : MAT.darkM);
      km.position.set(PX - 2.35 + kc * .78, PY - .32 - kr * .46, PF + .06);
      g.add(km);
    }
    /* 第一排：电源 / 正转 / 反转 / 急停 */
    var YA = PY - 2.05;
    mkKey(PX - 2.2, YA, .21, '电源', { act: 'power' }, 'dark');
    mkKey(PX - 1.1, YA, .21, '正转', { act: 'cw' }, 'green');
    mkKey(PX + 0.0, YA, .21, '反转', { act: 'ccw' }, 'dark');
    mkKey(PX + 1.7, YA, .32, '急停', { act: 'estop' }, 'stop');
    /* 急停的黄底警示圈（真机都有，一眼认得出是急停） */
    var esRing = new T.Mesh(new T.TorusGeometry(.38, .05, 8, 26), MAT.btnAmber);
    esRing.rotation.x = PI / 2; esRing.position.set(PX + 1.7, YA, PF + .09); g.add(esRing);
    /* 第二排：转速升降 / 冷却 / 走刀 */
    var YB = PY - 3.10;
    mkKey(PX - 2.2, YB, .21, '转速+', { act: 'rpm+' }, 'dark');
    mkKey(PX - 1.1, YB, .21, '转速−', { act: 'rpm-' }, 'dark');
    mkKey(PX + 0.0, YB, .21, '冷却', { act: 'cool' }, 'dark');
    mkKey(PX + 1.1, YB, .21, '走刀', { act: 'auto' }, 'green');
    var brand = new T.Mesh(new T.PlaneGeometry(2.3, .26),
      new T.MeshBasicMaterial({ map: txtTex('MX-4LW CNC', '#37424c'), transparent: true }));
    brand.position.set(PX - 1.35, PY - 3.58, PF + .02); g.add(brand);

    /* 转速旋钮 */
    O.rpmKnob = new T.Group(); O.rpmKnob.position.set(PX + 2.4, YB, PF + .12);
    var knobBody = CY(.34, .24, MAT.steelD, 20); knobBody.rotation.x = PI / 2; O.rpmKnob.add(knobBody);
    var knobMark = BX(.08, .26, .09, MAT.white); knobMark.position.set(0, .16, .13); O.rpmKnob.add(knobMark);
    var knobHit = new T.Mesh(new T.CylinderGeometry(.52, .52, .36, 12),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    knobHit.rotation.x = PI / 2; knobHit.position.set(PX + 2.4, YB, PF + .13);
    knobHit.userData.ctl = { act: 'rpm' }; knobHit.userData.visual = O.rpmKnob;
    O.ctlMeshes.push(knobHit);
    g.add(O.rpmKnob);
    var lp2 = new T.Mesh(new T.PlaneGeometry(.92, .22),
      new T.MeshBasicMaterial({ map: txtTex('转速档'), transparent: true }));
    lp2.position.set(PX + 2.4, YB + .56, PF + .02); g.add(lp2);
    K.tag(O.rpmKnob, '点击：转速档（11 档）', '11 档 75~4550 r/min；旋钮转、屏幕 S 与双锥盘开合同步变');

    /* 线缆一律贴着机身走：机头→滑枕→立柱→控制盒。
       旧版那条横跨画面的 5.0 下垂长弧线读作「悬空导气管」，已删。 */
    g.add(cable([5.2, 18.2, 1.6], [7.6, 12.0, .4], 1.1));
    g.add(cable([6.0, 16.5, 1.0], [8.4, 6.5, -1.6], 2.2));
    g.add(cable([8.6, 13.2, 3.7], [8.8, 9.0, 1.2], 1.0));
    g.add(cable([10.6, 13.2, 3.7], [9.2, 4.0, .6], 2.0));
    g.add(cable([-4.2, 8.0, -3.0], [-3.2, 1.0, 3.0], 1.4));
    g.add(cable([4.6, 2.0, 4.8], [6.6, -6.0, 6.4], 1.3));
    g.add(cable([-6.0, -3.0, 5.0], [-4.0, -9.0, 6.0], 1.6));

    shadow(g);
    return g;
  }

  /* ── ⑨ 3D 操控：捕获阶段拦截点击，不触发引擎聚焦 ────── */
  function bindCtl() {
    var ray = new T.Raycaster(), v2 = new T.Vector2();
    function hitCtl(e) {
      var cam = window.__labDebug && window.__labDebug.camera;
      if (!cam || !O.ctlMeshes) return null;
      var r = CV.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v2, cam);
      var hits = ray.intersectObjects(O.ctlMeshes, false);
      return hits.length ? { m: hits[0].object, p: hits[0].point } : null;
    }
    /* 必须挂在 window 的捕获阶段：引擎的 pointerdown/up（点击聚焦、拖拽转视角）
       挂在 canvas 上，同级同元素时按注册顺序触发，会先把相机拉走，
       导致随后的射线落空 —— 面板按键就"点不动"。命中按键时直接截断事件链。 */
    var downPos = null, downHit = null;
    window.addEventListener('pointerdown', function (e) {
      if (e.target !== CV) return;
      var h = hitCtl(e);
      if (!h) return;
      downPos = { x: e.clientX, y: e.clientY };
      downHit = h;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    window.addEventListener('pointerup', function (e) {
      if (!downHit) return;
      var moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      var h = downHit;
      downHit = null; downPos = null;
      e.stopPropagation();
      e.preventDefault();
      if (moved <= 6) runCtl(h.m.userData.ctl, h);
    }, true);
    /* 悬停光标：指到可点零件时给抓手指针 */
    window.addEventListener('pointermove', function (e) {
      if (e.target !== CV || downHit) return;
      CV.style.cursor = hitCtl(e) ? 'pointer' : 'grab';
    }, true);
  }
  function pressFx(mesh) {
    if (mesh.userData.baseZ === undefined) mesh.userData.baseZ = mesh.position.z;
    mesh.position.z = mesh.userData.baseZ - .09;
    O.pressed.push(mesh);
  }
  /* 键盘可达：Tab 在面板键之间移动，Enter 触发 */
  var KB = { i: -1 };
  function kbFocus(d) {
    var list = O.ctlMeshes.filter(function (m) { return m.userData.ctl && !m.userData.hold; });
    if (!list.length) return;
    KB.i = (KB.i + d + list.length) % list.length;
    O.ctlMeshes.forEach(function (m) { m.userData._kb = false; });
    list[KB.i].userData._kb = true;
    KB.list = list;
  }
  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); kbFocus(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Enter' && KB.list && KB.i >= 0) {
        var m = KB.list[KB.i];
        if (m) runCtl(m.userData.ctl, { m: m, p: m.getWorldPosition(new T.Vector3()) });
      }
    });
  }

  function runCtl(ctl, h) {
    var s = st;
    if (!ctl) return;
    var hitm = h && h.m;
    var vis = hitm && (hitm.userData.visual || hitm);
    function push() { if (vis) pressFx(vis); }

    if (s.estop && ctl.act !== 'estop') return;        /* 急停自锁：只有它能解 */

    if (ctl.act === 'power') {
      s.power = !s.power;
      if (!s.power) { s.rpmSet = 0; s.cutting = false; s.coolant = false; s.dir = 'off'; }
      push();
    } else if (ctl.act === 'cw' || ctl.act === 'ccw') {
      if (!s.power) { if (vis) flash(vis); return; }
      s.dir = (s.dir === (ctl.act === 'cw' ? 'cw' : 'ccw')) ? 'off' : (ctl.act === 'cw' ? 'cw' : 'ccw');
      if (s.dir !== 'off' && s.rpmSet < 1) s.rpmSet = RPM_STEPS[s.rpmIdx];
      if (s.dir === 'off') { s.rpmSet = 0; }
      push();
    } else if (ctl.act === 'rpm+' || ctl.act === 'rpm-') {
      if (!s.power) { if (vis) flash(vis); return; }
      s.rpmIdx = Math.max(0, Math.min(RPM_STEPS.length - 1, s.rpmIdx + (ctl.act === 'rpm+' ? 1 : -1)));
      if (s.rpmSet > 0) s.rpmSet = RPM_STEPS[s.rpmIdx];
      push();
    } else if (ctl.act === 'cool') {
      if (!s.power) { if (vis) flash(vis); return; }
      s.coolant = !s.coolant; push();
    } else if (ctl.act === 'auto') {
      if (!s.power) { if (vis) flash(vis); return; }
      s.cutting = !s.cutting;
      if (s.cutting) {
        if (s.rpmSet < 500) { s.dir = 'cw'; s.rpmSet = RPM_STEPS[s.rpmIdx] || 1450; }
        if (s.xmm < -70 || s.xmm > 70) { s.xmm = -60; s.autoX = -60; s.autoDir = 1; }
      }
      push();
    } else if (ctl.act === 'estop') {
      s.estop = !s.estop;
      if (s.estop) { s.rpmSet = 0; s.cutting = false; s.coolant = false; s.dir = 'off'; s.quillMm = 0; }
      push();
    } else if (ctl.act === 'rpm') {
      if (!s.power || s.estop) return;
      s.rpmIdx = (s.rpmIdx + 1) % RPM_STEPS.length;
      if (s.rpmSet > 0) s.rpmSet = RPM_STEPS[s.rpmIdx];
      push();
    } else if (ctl.act === 'range') {
      if (!s.power) return;
      /* 换挡：低速档 75~400 / 高速档 620~4550，跳到对应档位 */
      s.rpmIdx = (s.rpmSet > 1 && s.rpmSet < 520) ? 9 : 4;
      s.rpmSet = RPM_STEPS[s.rpmIdx];
      push();
    } else if (ctl.act === 'wheel' && h) {
      var c = new T.Vector3(); h.m.getWorldPosition(c);
      var dir = h.p.y >= c.y ? 1 : -1;
      moveAxis(ctl.key, dir * (ctl.step || 5));
    }
    syncPanel();
  }
  /* 面板灯与按键常亮/闪烁 */
  function flash(m) {
    if (!m) return;
    m.userData._flash = 6;
  }
  function syncPanel() {
    var s = st;
    if (!O.leds) return;
    var on = { pwr: s.power, fw: s.dir === 'cw', ccw: s.dir === 'ccw', cool: s.coolant, cut: s.cutting };
    var col = { pwr: 0x2fd07a, fw: 0x2fd07a, ccw: 0xf0b03a, cool: 0x4fc8e0, cut: 0xf0b03a };
    Object.keys(O.leds).forEach(function (k) {
      O.leds[k].material.emissive.setHex(on[k] ? col[k] : 0x000000);
      O.leds[k].material.emissiveIntensity = on[k] ? 1.6 : 0;
    });
  }

  /* ── ⑨b 左上角 DOM 数控面板 ─────────────────────────────
     与 3D 面板共用同一份 st：点这里的键，机床动作、3D 按键灯、右下读数一起变。
     每个键都带功能说明（hover 预览 / 点击追加「已执行」），演示时不用另讲。 */
  var DP = null;
  var DP_TIPS = {
    power: ['主电源', '通断整机电源。断电后主轴、冷却、走刀立即停止，屏幕转暗；重新上电回到待机状态。'],
    cw: ['主轴正转', '启动主轴顺时针旋转。实际转速由双锥盘无级变速与背齿轮低速档共同决定，屏幕 S 实时显示。'],
    ccw: ['主轴反转', '主轴逆时针旋转，用于攻丝回退或特殊刀具。空载演示时注意刀具旋向与工件装夹方向。'],
    'rpm-': ['降一档转速', '11 档转速（75~4550 r/min）降一档。低于 520 r/min 自动切入低速档，偏心轴上的背齿轮摆进啮合。'],
    'rpm+': ['升一档转速', '升一档转速。双锥盘可动盘轴向滑移，V 带工作半径随之改变，主轴转速连续可调。'],
    cool: ['冷却液泵', '冷却泵启停。铣削钢件必须开冷却，否则刀尖温度过高会烧刀、工件表层退火。'],
    auto: ['自动走刀', '工作台沿 X 轴往复进给（F = 90 mm/min，行程 ±60 mm）。铣平面时使用，注意两端限位。'],
    estop: ['急停（自锁）', '立即切断主轴、进给与冷却并锁死。排除异常后需再按一次复位，机床不会自动恢复运转。'],
    rpm: ['转速档位', '拖到任意档位：双锥盘开合改带轮比，屏幕显示的档位转速即为主轴目标转速（需先按正转）。']
  };
  function buildDomPanel() {
    if (document.getElementById('cncPanel')) return;
    var CSS = [
      '#cncPanel{position:fixed;left:14px;top:62px;width:298px;z-index:60;',
      'font:12px/1.45 "Microsoft YaHei",system-ui,sans-serif;color:#cfd7de;',
      'background:linear-gradient(180deg,#272e37,#161b21);border:1px solid #3d4751;',
      'border-radius:11px;box-shadow:0 16px 36px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.09);',
      'user-select:none;overflow:hidden}',
      '#cncPanel .cp-top{display:flex;align-items:center;gap:7px;padding:9px 12px 8px;',
      'background:linear-gradient(180deg,#313b46,#232b34);border-bottom:1px solid #414c57}',
      '#cncPanel .cp-brand{font:bold 14px/1 "Segoe UI",sans-serif;letter-spacing:.7px;color:#eaf1f7}',
      '#cncPanel .cp-sub{font-size:11px;color:#8b98a5;letter-spacing:.3px}',
      '#cncPanel .cp-led{width:7px;height:7px;border-radius:50%;background:#39424b;',
      'box-shadow:inset 0 0 2px #000;transition:.2s}',
      '#cncPanel .cp-led.pwr{margin-left:auto}',
      '#cncPanel .cp-led.on{background:#39d98a;box-shadow:0 0 7px #39d98a}',
      '#cncPanel .cp-led.stop{background:#4a2c2c}',
      '#cncPanel .cp-led.stop.on{background:#ff4d4f;box-shadow:0 0 9px #ff4d4f}',
      '#cncPanel .cp-scr{margin:9px 11px 8px;padding:8px 10px 6px;border-radius:6px;',
      'background:radial-gradient(120% 150% at 50% 0%,#0a1a13,#050b08);',
      'border:1px solid #1f3a2c;box-shadow:inset 0 2px 9px rgba(0,0,0,.85);',
      'font-family:Consolas,monospace;color:#5ef0a4;text-shadow:0 0 8px rgba(94,240,164,.55);',
      'background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.26) 0 1px,transparent 1px 3px)}',
      '#cncPanel .cp-line{display:flex;align-items:baseline;gap:5px;line-height:1.55}',
      '#cncPanel .cp-line b{font:600 10px/1 Consolas,monospace;color:#2a9e63;width:10px}',
      '#cncPanel .cp-line em{font:bold 15px/1.35 Consolas,monospace;font-style:normal;min-width:62px}',
      '#cncPanel .cp-line.small{justify-content:space-between;font-size:10.5px;color:#7fd8a8;margin-top:2px}',
      '#cncPanel .cp-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 11px}',
      '#cncPanel button{height:42px;border-radius:5px;border:1px solid #4a555f;cursor:pointer;',
      'background:linear-gradient(180deg,#3a444f,#262e37);color:#c8d2db;font:11.5px/1 "Microsoft YaHei",sans-serif;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 2px 3px rgba(0,0,0,.35);transition:.12s}',
      '#cncPanel button:hover{border-color:#6d7d8b;background:linear-gradient(180deg,#47535f,#2c353e)}',
      '#cncPanel button:active{transform:translateY(1px);box-shadow:inset 0 2px 6px rgba(0,0,0,.55)}',
      '#cncPanel button i{width:6px;height:6px;border-radius:50%;background:#1b232a;box-shadow:inset 0 0 2px #000}',
      '#cncPanel button.on{border-color:#39d98a;color:#eafff3;',
      'box-shadow:inset 0 0 12px rgba(57,217,138,.22),0 0 0 1px rgba(57,217,138,.28)}',
      '#cncPanel button.on i{background:#39d98a;box-shadow:0 0 6px #39d98a}',
      '#cncPanel button.stop{background:linear-gradient(180deg,#a8262a,#74171a);border-color:#d8ad39;color:#ffe9e9}',
      '#cncPanel button.stop.on{background:linear-gradient(180deg,#ff3f42,#a3121a);',
      'box-shadow:0 0 14px rgba(255,63,66,.6)}',
      '#cncPanel button.lock{opacity:.4;filter:saturate(.35);cursor:not-allowed}',
      '#cncPanel .cp-rpm{padding:10px 12px 2px}',
      '#cncPanel .cp-rl{display:flex;align-items:baseline;gap:5px;font-size:11px;color:#93a1ae}',
      '#cncPanel .cp-rl b{color:#e8f2fa;font:bold 14px/1 Consolas,monospace}',
      '#cncPanel input[type=range]{width:100%;height:4px;margin:8px 0 2px;-webkit-appearance:none;',
      'background:#1a2229;border-radius:2px;outline:none;border:1px solid #2c3742}',
      '#cncPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;',
      'border-radius:50%;background:radial-gradient(circle at 35% 30%,#d3e3f0,#7e93a6);',
      'border:1px solid #222c35;box-shadow:0 1px 3px #000;cursor:grab}',
      '#cncPanel .cp-ticks{display:flex;justify-content:space-between;font-size:9.5px;color:#66727e}',
      '#cncPanel .cp-tip{margin:9px 11px 0;padding:8px 10px;border-radius:6px;min-height:58px;',
      'background:rgba(11,17,22,.78);border:1px solid #2c3742;border-left:2px solid #3f8fd0}',
      '#cncPanel .cp-tip b{display:block;font-size:11.5px;color:#e6eef6;margin-bottom:3px}',
      '#cncPanel .cp-tip p{margin:0;font-size:11px;line-height:1.55;color:#9fb0be}',
      '#cncPanel .cp-tip p.done{color:#7fd8a8}',
      '@media(max-width:1180px){#cncPanel{transform:scale(.9);transform-origin:top left}}',
      '@media(max-height:740px){#cncPanel{transform:scale(.84);transform-origin:top left}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'cncPanelStyle'; style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'cncPanel';
    el.innerHTML = [
      '<div class="cp-top"><span class="cp-brand">MX-4LW</span><span class="cp-sub">数控操作面板</span>',
      '<i class="cp-led pwr" id="cpPwr"></i><i class="cp-led stop" id="cpStop"></i></div>',
      '<div class="cp-scr">',
      '  <div class="cp-line"><b>X</b><em id="cpX">0.00</em><b>Y</b><em id="cpY">0.00</em></div>',
      '  <div class="cp-line"><b>Z</b><em id="cpZ">0.00</em><b>S</b><em id="cpS">0</em></div>',
      '  <div class="cp-line small"><span id="cpState">待机 · 高速档</span><span id="cpF">F 0</span></div>',
      '</div>',
      '<div class="cp-keys">',
      '  <button data-a="power"><i></i>电源</button>',
      '  <button data-a="cw"><i></i>正转</button>',
      '  <button data-a="ccw"><i></i>反转</button>',
      '  <button data-a="estop" class="stop"><i></i>急停</button>',
      '  <button data-a="rpm-"><i></i>转速−</button>',
      '  <button data-a="rpm+"><i></i>转速+</button>',
      '  <button data-a="cool"><i></i>冷却</button>',
      '  <button data-a="auto"><i></i>走刀</button>',
      '</div>',
      '<div class="cp-rpm"><div class="cp-rl"><span>转速档</span><b id="cpRpm">1450</b><span>r/min</span></div>',
      '<input id="cpRange" type="range" min="0" max="10" step="1" value="7">',
      '<div class="cp-ticks"><span>75</span><span>4550</span></div></div>',
      '<div class="cp-tip"><b id="cpTipT">功能说明</b><p id="cpTipB">点击按钮操作机床；悬停任一键可查看它的作用。</p></div>'
    ].join('');
    document.body.appendChild(el);

    DP = {
      x: el.querySelector('#cpX'), y: el.querySelector('#cpY'), z: el.querySelector('#cpZ'),
      s: el.querySelector('#cpS'), f: el.querySelector('#cpF'), state: el.querySelector('#cpState'),
      pwr: el.querySelector('#cpPwr'), stop: el.querySelector('#cpStop'),
      range: el.querySelector('#cpRange'), rpm: el.querySelector('#cpRpm'),
      tipT: el.querySelector('#cpTipT'), tipB: el.querySelector('#cpTipB'),
      btns: Array.prototype.slice.call(el.querySelectorAll('button'))
    };
    /* 按键 → 与 3D 面板同一套 runCtl；说明区同步 */
    DP.btns.forEach(function (b) {
      var a = b.getAttribute('data-a');
      b.addEventListener('click', function () {
        runCtl({ act: a });
        dpTip(a, true);
      });
      b.addEventListener('mouseenter', function () { dpTip(a, false); });
    });
    DP.range.addEventListener('input', function () {
      st.rpmIdx = Math.max(0, Math.min(RPM_STEPS.length - 1, +this.value));
      if (st.rpmSet > 0) st.rpmSet = RPM_STEPS[st.rpmIdx];
      syncPanel();
      dpTip('rpm', true);
    });
    setInterval(dpSync, 150);
    dpSync();
    dpTip('power', false);
  }
  function dpTip(k, done) {
    if (!DP) return;
    var t = DP_TIPS[k]; if (!t) return;
    DP.tipT.textContent = t[0];
    DP.tipB.textContent = t[1] + (done ? '　· 已执行' : '');
    DP.tipB.className = done ? 'done' : '';
  }
  function dpSync() {
    if (!DP) return;
    var s = st, on = s.rpmAct > 1 && s.rpmAct < 520;
    DP.x.textContent = (s.xmm >= 0 ? '+' : '') + s.xmm.toFixed(2);
    DP.y.textContent = (s.ymm >= 0 ? '+' : '') + s.ymm.toFixed(2);
    DP.z.textContent = (s.zmm >= 0 ? '+' : '') + s.zmm.toFixed(2);
    DP.s.textContent = Math.round(s.rpmAct);
    DP.f.textContent = 'F ' + Math.round(s.feed);
    DP.state.textContent = s.estop ? '急停锁定'
      : (!s.power ? '电源关闭'
        : (s.dir === 'cw' ? '正转' : s.dir === 'ccw' ? '反转' : '待机') + ' · ' + (on ? '低速档' : '高速档'));
    DP.pwr.className = 'cp-led pwr' + (s.power ? ' on' : '');
    DP.stop.className = 'cp-led stop' + (s.estop ? ' on' : '');
    DP.btns[0].classList.toggle('on', s.power);
    DP.btns[1].classList.toggle('on', s.dir === 'cw');
    DP.btns[2].classList.toggle('on', s.dir === 'ccw');
    DP.btns[3].classList.toggle('on', s.estop);
    DP.btns[6].classList.toggle('on', s.coolant);
    DP.btns[7].classList.toggle('on', s.cutting);
    /* 断电 / 急停时，其余键压暗，避免"点了没反应"的困惑 */
    DP.btns.forEach(function (b) {
      var a = b.getAttribute('data-a');
      var lock = s.estop ? (a !== 'estop') : (!s.power && a !== 'power');
      b.classList.toggle('lock', lock);
    });
    if (+DP.range.value !== s.rpmIdx) DP.range.value = s.rpmIdx;
    DP.rpm.textContent = Math.round(s.rpmSet > 0 ? s.rpmSet : RPM_STEPS[s.rpmIdx]);
    /* 右下角引擎自带的「主轴转速」滑条与左上角面板重复，且它的数值标签
       会漏出原始浮点（如 40.589773176951324）。转速统一由左上角面板控，
       这条直接隐藏，界面也干净。 */
    var ctlList = document.querySelectorAll('aside .ctl');
    for (var ci = 0; ci < ctlList.length; ci++) {
      var c = ctlList[ci];
      if (c.getAttribute('data-cnc-hide') === '1') continue;
      if (/主轴转速/.test(c.textContent || '')) {
        c.style.display = 'none';
        c.setAttribute('data-cnc-hide', '1');
      }
    }
  }

  /* ── ⑩ 场景 ──────────────────────────────────────────── */
  var scene = {
    setup: function () {
      G = K.world();
      var pre = K.scene().children.slice();
      K.envShop({ groundY: GROUND });
      pre.forEach(function (c) {
        if (c === G || c.isLight || c.isAmbientLight) return;
        c.visible = false;
      });
      O.shopDecor = K.scene().children.filter(function (c) { return pre.indexOf(c) < 0; });
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .34;
        else if (o.isDirectionalLight) o.intensity *= .8;
        else if (o.isPointLight) o.intensity *= .32;
      });
      /* 三点光：主光（带阴影）+ 冷补 + 背轮廓；阴影收紧到机床范围才够锐 */
      var f1 = new T.DirectionalLight(0xfff2e2, 2.05);
      f1.position.set(17, 27, 21);
      f1.castShadow = true;
      f1.shadow.mapSize.set(2048, 2048);
      f1.shadow.camera.left = -34; f1.shadow.camera.right = 34;
      f1.shadow.camera.top = 40; f1.shadow.camera.bottom = -22;
      f1.shadow.camera.near = 1; f1.shadow.camera.far = 120;
      f1.shadow.bias = -.0006; f1.shadow.normalBias = .022;
      K.scene().add(f1);
      var f2 = new T.DirectionalLight(0xd6e6ff, .18); f2.position.set(-19, 11, 17); K.scene().add(f2);
      var f4 = new T.DirectionalLight(0xc2d8ff, 1.02); f4.position.set(-11, 15, -23); K.scene().add(f4);
      var f3 = new T.PointLight(0xfff0d8, .5, 34, 2); f3.position.set(2, 8, 11); K.scene().add(f3);
      /* 剖视补光：机头内腔很深，不补光时双锥盘/V 带全黑（只在剖视步骤亮） */
      O.cutLight = new T.PointLight(0xffe9c8, 0, 24, 2);
      O.cutLight.position.set(0, 17.2, 6.2); K.scene().add(O.cutLight);
      O.backFloor = new T.Mesh(new T.PlaneGeometry(220, 160),
        new T.MeshStandardMaterial({ color: 0x6c7278, roughness: .9, metalness: .03 }));
      O.backFloor.rotation.x = -PI / 2; O.backFloor.position.set(0, GROUND + .03, -12);
      O.backFloor.receiveShadow = true; O.backFloor.visible = false; K.scene().add(O.backFloor);
      O.backLight = new T.DirectionalLight(0xffffff, .72);
      O.backLight.position.set(-8, 16, -26); O.backLight.visible = false; K.scene().add(O.backLight);

      /* 厂房压暗：墙地面都是大面积浅灰，亮度压下来机器才成为主体 */
      O.shopDecor.forEach(function (o) {
        o.traverse(function (m2) {
          if (!m2.isMesh || !m2.material) return;
          var mats = Array.isArray(m2.material) ? m2.material : [m2.material];
          mats.forEach(function (mt) {
            if (!mt.color) return;
            mt.color.multiplyScalar(mt.isMeshBasicMaterial ? .55 : .20);
          });
        });
      });
      /* 终合改造：只改本课件 composer 的最后一道 pass。
         暗角 + 颗粒 + 轻 S 曲线 —— 这三样是"渲染图"和"照片"之间最直观的差别。 */
      setTimeout(function () {
        var D = window.__labDebug, found = null;
        if (!D || !D.composer) return;
        D.composer.passes.forEach(function (p) {
          var u = p.material && p.material.uniforms;
          if (u && u.uExposure) found = p;
        });
        if (!found) return;
        var u2 = found.material.uniforms;
        u2.uVig = { value: .42 };
        u2.uGrain = { value: .020 };
        u2.uTime = { value: 0 };
        found.material.fragmentShader = [
          'uniform sampler2D tDiffuse; uniform float uExposure;',
          'uniform float uVig; uniform float uGrain; uniform float uTime;',
          'varying vec2 vUv;',
          'vec3 aces(vec3 x){ float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;',
          '  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }',
          'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
          'void main(){',
          '  vec4 c = texture2D(tDiffuse, vUv);',
          '  vec3 col = aces(c.rgb * uExposure);',
          '  col = pow(col, vec3(1.0/2.2));',
          '  vec2 d = vUv - .5;',
          '  col *= clamp(1.0 - uVig * dot(d,d) * 2.4, 0.0, 1.0);',
          '  col = clamp((col - .5) * 1.07 + .5, 0.0, 1.0);',
          '  col += (hash(vUv * 1024.0 + uTime) - .5) * uGrain;',
          '  gl_FragColor = vec4(col, c.a);',
          '}'
        ].join('\n');
        found.material.needsUpdate = true;
        O.finalPass = found;
      }, 80);
      var m = buildMachine(); G.add(m); O.mach = m;
      window.__cnc = { O: O, st: st, K: K };

      /* ── 外壳 GLB：倒角铸件 + 顶点脏污由 build/make_cncmill_glb.html 预生成 ── */
      var MATC = {};
      function shellMat(key) {
        if (!MATC[key]) {
          var base = MAT[key] || MAT.blue;
          var mm2 = base.clone();
          mm2.vertexColors = true;          /* 顶点色带脏污梯度 */
          mm2.needsUpdate = true;
          MATC[key] = mm2;
        }
        return MATC[key];
      }
      var SLOT = { knee: O.knee, saddle: O.saddle, table: O.table,
                   turret: O.turret, tilt: O.tilt, colCover: O.colCover,
                   kneeCover: O.kneeCover, headCover: O.headCover };
      function adoptShell(gscene) {
        /* 先把网格和它所属的动画组配对收齐，再统一搬 —— 在 traverse 里
           改父子关系会让遍历指针失效（three 的 traverse 会走进新父节点） */
        var plan = [];
        gscene.traverse(function (o) {
          if (!o.isMesh || !/^MAT_/.test(o.name || '')) return;
          var p = o, slot = null;
          while (p && !slot) {
            p = p.parent;
            if (p && SLOT[p.name]) slot = SLOT[p.name];
          }
          /* 底座/立柱这类静态件挂在 GLB 根下，没动画组 → 兜底挂到机床根 */
          plan.push([o, slot || m]);
        });
        plan.forEach(function (it) {
          var o = it[0];
          var key = (/^MAT_(\w+)__/.exec(o.name) || [])[1] || 'blue';
          o.material = shellMat(key);
          o.castShadow = true; o.receiveShadow = true;
          it[1].attach(o);                   /* attach 保留世界变换 */
        });
        O.shellMoved = plan.length;
        if (typeof updateLabelScale === 'function') { /* noop */ }
        G.updateMatrixWorld(true);
      }
      function b64ToArr(b64) {
        var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
        for (var i2 = 0; i2 < n; i2++) u8[i2] = bin.charCodeAt(i2);
        return u8.buffer;
      }
      var shellB64 = (window.__GLB || {})['cncmill-shell'] || '';
      if (shellB64 && T.GLTFLoader) {
        new T.GLTFLoader().parse(b64ToArr(shellB64), '', function (g2) {
          adoptShell(g2.scene);
        }, function () { /* 解析失败就保持程序化空壳 */ });
      }
      K.blob({ x: 0, z: 0, r: 18, y: GROUND + .03 });
      K.blob({ x: 8.2, z: 7.4, r: 4.5, y: GROUND + .03 });
      /* 再加一层更紧的接触阴影：机器底部与地面之间压暗，才"坐"在地上 */
      (function () {
        var c = document.createElement('canvas'); c.width = c.height = 256;
        var x = c.getContext('2d');
        x.clearRect(0, 0, 256, 256);
        if ('filter' in x) x.filter = 'blur(13px)';
        x.fillStyle = 'rgba(0,0,0,.68)';
        x.fillRect(34, 34, 188, 188);
        if ('filter' in x) x.filter = 'none';
        var tx = new T.CanvasTexture(c);
        var sh = new T.Mesh(new T.PlaneGeometry(30, 20.5),
          new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, opacity: .95 }));
        sh.rotation.x = -PI / 2;
        sh.position.set(0, GROUND + .06, .6);
        sh.renderOrder = 1;
        G.add(sh);
      })();
      CV = document.getElementById('cv');
      bindCtl();
      bindKeys();
      buildDomPanel();          /* 左上角数控面板（DOM，与 3D 面板同一份 st） */

      /* ── 知识卡片整块砍掉：标题/正文/问句/步骤点全部不显示，
            侧栏收成右下角的紧凑操控条（只留数显 + 控件）── */
      var style = document.createElement('style');
      style.textContent = [
        '#sTitle,#sAsk,#sBody,#dots,.pstep{display:none!important}',
        'aside{top:auto!important;bottom:16px!important;right:16px!important;width:272px!important;',
        'max-height:calc(100vh - 34px)!important;padding:10px 12px 12px!important;',
        'border-radius:14px!important;background:rgba(255,255,255,.9)!important;',
        'backdrop-filter:blur(14px);box-shadow:0 12px 32px rgba(20,40,70,.18)!important}',
        'aside .pnav{margin-bottom:8px!important}',
        'aside .pnav>button{padding:4px 9px!important;font-size:11.5px!important;min-width:0!important}',
        'aside .ro{gap:6px!important;margin-bottom:8px!important}',
        'aside .ro>div{padding:4px 8px!important;border-radius:9px!important}',
        'aside .ro label{font-size:10px!important;margin-bottom:0!important}',
        'aside .ro b{font-size:12px!important;line-height:1.3!important}',
        'aside .ctl{margin:0 0 5px!important}',
        'aside .ctlhead{font-size:11.5px!important}',
        'aside input[type=range]{margin:2px 0 6px!important}',
        'aside button.act{margin:4px 0!important;padding:6px 10px!important;font-size:12px!important}',
        '.hint{font-size:13px!important;opacity:.95!important;bottom:14px!important;max-width:50vw!important;',
        'line-height:1.45!important}'
      ].join('\n');
      document.head.appendChild(style);
      try {
        var rr = window.__labDebug && window.__labDebug.renderer;
        if (rr) {
          var pmrem = new T.PMREMGenerator(rr);
          var env = new T.Scene();
          env.add(new T.Mesh(new T.BoxGeometry(34, 22, 34),
            new T.MeshStandardMaterial({ color: 0x9aa2aa, side: T.BackSide, roughness: 1 })));
          var gnd = new T.Mesh(new T.PlaneGeometry(34, 34),
            new T.MeshStandardMaterial({ color: 0x7c848c, roughness: .95 }));
          gnd.position.y = -5; gnd.rotation.x = PI / 2; env.add(gnd);
          var panel = new T.Mesh(new T.PlaneGeometry(13, 13),
            new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.25 }));
          panel.position.set(0, 12.5, 0); panel.rotation.x = PI / 2; env.add(panel);
          [-1, 1].forEach(function (sg) {
            var side = new T.Mesh(new T.PlaneGeometry(16, 12),
              new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdce8f5, emissiveIntensity: .55 }));
            side.position.set(sg * 16, 5, 0); side.rotation.y = sg > 0 ? -PI / 2 : PI / 2; env.add(side);
          });
          for (var wi = 0; wi < 4; wi++) {
            var wn = new T.Mesh(new T.PlaneGeometry(2.6, 10),
              new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe6ff, emissiveIntensity: .72 }));
            wn.position.set(-13 + wi * 8.6, 6, 16.9); env.add(wn);
          }
          K.scene().environment = pmrem.fromScene(env, .04).texture;
          pmrem.dispose();
        }
      } catch (e) { /* 沿用默认环境 */ }
    },

    update: function (dt, s) {
      s.t += dt; s.scrAcc += dt;
      var dbg = window.__labDebug;
      /* 超采样：1x 屏上默认 DPR=1，斜边和齿轮齿形全是阶梯（用户说的"像素网"）。
         固定 2x 渲染再下采样，齿形/轮廓立刻干净；引擎 resize 会重置，这里幂等补回。 */
      if (dbg && dbg.renderer && dbg.renderer.getPixelRatio() < 2) {
        dbg.renderer.setPixelRatio(2);
        if (dbg.composer) {
          if (dbg.composer.setPixelRatio) dbg.composer.setPixelRatio(2);
          dbg.composer.setSize(window.innerWidth, window.innerHeight);
        }
        dbg.renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
      if (dbg && dbg.camera) {
        var bv = dbg.camera.position.z < -20.9;
        if (bv !== O._backView) {
          O._backView = bv;
          O.shopDecor.forEach(function (c) { c.visible = !bv; });
          O.backFloor.visible = bv;
          O.backLight.visible = bv;
        }
      }

      /* ── 传动链：电机 1450 定速 → 双锥盘改带轮比 → V 带 → 主轴带轮 ──
         转速落在 520 r/min 以下自动走低速档（背齿轮啮合），以上走高速档（带传直驱） */
      var rpmGoal = s.estop ? 0 : s.rpmSet;
      s.rpmAct += (rpmGoal - s.rpmAct) * Math.min(1, dt * (s.estop ? 6 : 2.0));
      if (Math.abs(s.rpmAct) < 2) s.rpmAct = 0;

      var lowRange = s.rpmAct > 1 && s.rpmAct < 520;
      var beltRpm = lowRange ? s.rpmAct / BACK_RATIO : s.rpmAct;
      var ratio = Math.max(.4, Math.min(2.4, beltRpm / 1450));
      var r1 = SHEAVE_SUM * ratio / (1 + ratio);
      r1 = Math.max(.34, Math.min(.72, r1));
      var r2 = SHEAVE_SUM - r1;
      if (O._r1 === undefined || Math.abs(r1 - O._r1) > .005) {
        O._r1 = r1;
        layoutSheave(O.shUp, r1);
        layoutSheave(O.shDn, r2);
        O.belt.geometry.dispose();
        O.belt.geometry = beltGeometry(beltLoop(r2, r1, BELT_D), .17, .27);
      }
      /* 剖视时把带轮组拉开成「爆炸图」：上带轮抬起、V 带浮到两盘之间。
         带本来夹在 V 槽里，不拉开就完全看不见（这也是无级变速的演示点）。 */
      if (O.shUp) O.shUp.g.position.y = SHEAVE_Y + s.coverT * 1.9;
      if (O.belt) O.belt.position.y = SHEAVE_Y + s.coverT * .52;

      if (s.rpmAct > 1) {
        var kSpin = dt * TAU * .05;
        O.angS = (O.angS || 0) + s.rpmAct * kSpin;
        O.angP = (O.angP || 0) + beltRpm * kSpin;
        O.spindle.rotation.y = O.angS;
        O.bullGear.spin.rotation.z = -O.angS;
        O.shUp.g.rotation.y = O.angP;
        O.shDn.g.rotation.y = O.angP;
        O.sleeveGear.spin.rotation.z = O.angP;
        O.cBig.spin.rotation.z = -O.angP * (Z_SL / Z_CB);
        O.cPin.spin.rotation.z = -O.angP * (Z_SL / Z_CB);
        O.oilPump = O.oilPump || 0;
      }
      /* 背齿轮啮合/脱开：整组绕主轴轴线摆进摆出 */
      var backGoal = lowRange ? 0 : 1;
      O._backK = O._backK === undefined ? backGoal : O._backK + (backGoal - O._backK) * Math.min(1, dt * 3.2);
      O.carrier.rotation.y = O._backK * .062;

      if (s.cutting) {
        s.autoX += s.autoDir * dt * 90;
        if (s.autoX > 60) { s.autoX = 60; s.autoDir = -1; }
        if (s.autoX < -60) { s.autoX = -60; s.autoDir = 1; }
        s.xmm = s.autoX;
        s.feed = 90;
        if (s.rpmSet < 500) s.rpmSet = RPM_STEPS[s.rpmIdx] || 1450;
      } else s.feed = 0;

      var wheelA = s.xmm / LEAD * TAU;
      O.feedScrew.rotation.x = wheelA;
      O.feedWheels.forEach(function (w) { w.rotation.z = wheelA; });
      O.yWheel.rotation.z = s.ymm / LEAD * TAU;
      O.liftScrew.rotation.y = s.zmm / LEAD * TAU;
      O.liftCrank.rotation.z = s.zmm / LEAD * TAU;
      O.table.position.x = s.xmm * S;
      O.saddle.position.z = s.ymm * S;
      O.knee.position.y = s.zmm * S;
      O.liftNut.position.y = s.zmm * S - 3.9;
      /* 套筒进给：套筒与主轴一起下探；带轮、大齿轮留在原处（花键滑配） */
      var qy = -9.2 - s.quillMm * S;
      O.quill.position.y = qy;
      O.spindle.position.y = qy;
      O.qPin.spin.rotation.z = -s.quillMm / 3 * TAU;

      var ta = s.turretDeg * PI / 180, ia = s.tiltDeg * PI / 180;
      O.turret.rotation.y += (ta - O.turret.rotation.y) * Math.min(1, dt * 6);
      O.tilt.rotation.x += (ia - O.tilt.rotation.x) * Math.min(1, dt * 6);
      O.quillHandle.rotation.z = s.cutting ? Math.sin(s.t * 6) * .12 : 0;
      if (O.rpmKnob) O.rpmKnob.rotation.z += ((-s.rpmIdx * TAU / 11) - O.rpmKnob.rotation.z) * Math.min(1, dt * 8);
      if (O.dialPtr) O.dialPtr.rotation.z += ((-r1 + 1.0) * 4.2 - O.dialPtr.rotation.z) * Math.min(1, dt * 6);
      syncPanel();

      var goal = s.cutaway ? 1 : 0;
      s.coverT += (goal - s.coverT) * Math.min(1, dt * 5);
      if (O.cutLight) O.cutLight.intensity = 2.4 * s.coverT;
      function placeCover(gr, dx, dy, dz, rz) {
        gr.position.set(dx * s.coverT, dy * s.coverT, dz * s.coverT);
        gr.rotation.z = (rz || 0) * s.coverT;
      }
      /* 拆下的盖板不往画面中央飞：靠到左后墙边/地面，剖视机位窄，直接出画。
         之前 24/-11/9 会斜插在画面左侧，像堆废铁。 */
      placeCover(O.colCover, -40, -11.2, -18, -.05);
      placeCover(O.kneeCover, -30, -12.6, 2, .04);
      placeCover(O.headCover, -38, -7.0, -16, -.06);

      var canCut = s.cutting && s.rpmAct > 200 &&
                   Math.abs(s.turretDeg) < .5 && Math.abs(s.tiltDeg) < .5;
      if (canCut) {
        G.updateMatrixWorld(true);
        var wp = new T.Vector3(); O.tip.getWorldPosition(wp);
        var lp = O.wp.worldToLocal(wp.clone());
        var topY = WP_Y + s.zmm * S;
        var dmm = (topY - wp.y) / S;
        if (dmm > 0 && dmm < 6) {
          if (stamp(lp.x / S, lp.z / S, dmm)) {
            spawnChip(wp); if (Math.random() < .4) spawnChip(wp);
          }
        }
      }
      if (O.wpDirty && Math.floor(s.t * 30) % 2 === 0) { rebuildTop(); O.wpDirty = false; }

      for (var pi = O.pressed.length - 1; pi >= 0; pi--) {
        var pm = O.pressed[pi];
        pm.position.z = Math.min(pm.userData.baseZ, pm.position.z + dt * .8);
        if (pm.position.z >= pm.userData.baseZ) O.pressed.splice(pi, 1);
      }

      if (O.finalPass && O.finalPass.material.uniforms.uTime) {
        O.finalPass.material.uniforms.uTime.value = Math.floor(s.t * 24) * 1.37;
      }
      if (s.scrAcc > .1) { s.scrAcc = 0; drawScreen(s); }
      updateChips(dt);
    }
  };

  function hint(txt) { var h = document.querySelector('.hint'); if (h) h.textContent = txt; }

  /* ── ⑪ 课件：六步，无知识卡片，全操控 ────────────────── */
  K.boot({
    title: 'MX-4LW 炮塔铣床 · 结构剖视与实时操控',
    chip: '职业教育 · 金属切削 · 炮塔式万能铣床 · 面板实时操控 + 走刀仿真',
    hint: '拖空白处旋转视角 · 滚轮缩放 · 悬停零件看名称 · 点 3D 面板与手轮直接操控',
    state: st,
    scene: scene,
    postfx: true, bloom: .07, exposure: .75,
    /* AO 距离按「机床尺度」给：1 单位 = 50 mm。原来的 .0012/.14 只对 1 单位内的缝起作用，
       等于没开 —— 这也是整台机器“没有分量、零件像贴在一起”的主因 */
    ssao: { kernelRadius: 12, minDistance: .55, maxDistance: 5.5 },

    reads: [['X', 'X 纵向'], ['Y', 'Y 横向'], ['Z', 'Z 垂向'], ['S', '主轴 S'], ['F', '进给 F'], ['ang', '铣头角']],
    values: function (s) {
      return {
        X: s.xmm.toFixed(1) + ' mm', Y: s.ymm.toFixed(1) + ' mm', Z: s.zmm.toFixed(1) + ' mm',
        S: Math.round(s.rpmAct) + ' rpm', F: Math.round(s.feed) + ' mm/min',
        ang: s.turretDeg.toFixed(0) + '° / ' + s.tiltDeg.toFixed(0) + '°'
      };
    },

    steps: [
      {
        name: '整机总览',
        cam: { tx: 1, ty: 6.5, tz: 0, dist: 62, yaw: .17, pitch: .19 },
        apply: function (s) {
          s.cutting = false; s.rpmSet = 0; s.cutaway = false; s.turretDeg = 0; s.tiltDeg = 0;
          s.power = true; s.estop = false;
          hint('六块：炮塔铣头 / 数控面板 / 工作台 / 立柱 / 主电机 / 底座 —— 点面板绿键起主轴，点手轮走轴，拖空白处转视角');
        },
        controls: [{ type: 'btn', label: '剖视 切换', onClick: function (s) { s.cutaway = !s.cutaway; } }]
      },
      {
        name: '内部传动剖视',
        /* 前盖 + 左壁 + 顶板三面敞开；机位要退到能看见整台机头与机身，
           太近会把内腔塞满画面，反而读不出"这是剖视" */
        cam: { tx: 0, ty: 13.5, tz: 1.2, dist: 31, yaw: -.52, pitch: .40 },
        apply: function (s) {
          s.cutting = false; s.cutaway = true; s.rpmSet = 0; s.power = true;
          hint('动力链：主电机 1450 定速 → 上双锥盘 → V 带 → 主轴带轮 → 花键主轴；低速档再经偏心轴背齿轮组（22→48 ⇒ 22→48）');
        },
        controls: [
          { type: 'btn', label: '前盖 卸下 / 装回', onClick: function (s) { s.cutaway = !s.cutaway; } },
          { type: 'btn', label: '主轴转起来（看带与齿轮）', onClick: function (s) { s.rpmSet = s.rpmSet > 1 ? 0 : 1450; s.rpmIdx = 7; } }
        ]
      },
      {
        name: '无级变速与换挡',
        cam: { tx: 0, ty: 9.8, tz: 1.8, dist: 24, yaw: .18, pitch: .74 },
        apply: function (s) {
          s.cutting = false; s.cutaway = true; s.power = true;
          if (s.rpmSet < 1) s.rpmSet = 1450;
          hint('转速一改，双锥盘开合、V 带工作半径跟着变；520 r/min 以下背齿轮自动摆进啮合，以上退出直传');
        },
        controls: [
          { type: 'range', key: 'rpmSet', min: 0, max: 4550, step: 25, label: '主轴转速 S (r/min)' },
          { type: 'btn', label: '低速档 / 高速档', onClick: function (s) {
              s.rpmIdx = (s.rpmSet > 1 && s.rpmSet < 520) ? 9 : 4;
              s.rpmSet = RPM_STEPS[s.rpmIdx];
            } }
        ]
      },
      {
        name: '三轴进给',
        cam: { tx: 3, ty: 1, tz: 2, dist: 44, yaw: .34, pitch: .38 },
        apply: function (s) {
          s.cutting = false; s.cutaway = false; s.rpmSet = 0; s.power = true;
          hint('点 3D 手轮：上半圈前进、下半圈后退（每格 5 mm）；丝杠转、螺母带工作台走，数显同步');
        },
        controls: [
          { type: 'range', key: 'xmm', min: -300, max: 300, step: 1, label: 'X 纵向 (±390 mm)' },
          { type: 'range', key: 'ymm', min: -150, max: 150, step: 1, label: 'Y 横向 (±190 mm)' },
          { type: 'range', key: 'zmm', min: 0, max: 300, step: 1, label: 'Z 垂向 (0~300 mm)' },
          { type: 'btn', label: '三轴回中', onClick: function (s) { s.xmm = 0; s.ymm = 0; s.zmm = 0; } }
        ]
      },
      {
        name: '炮塔回转与倾斜',
        cam: { tx: 2, ty: 14, tz: 0, dist: 32, yaw: .5, pitch: .26 },
        apply: function (s) {
          s.cutting = false; s.cutaway = false; s.rpmSet = 0;
          hint('铣头可绕立柱回转 ±45°、绕水平轴倾斜 ±45°；扳角度后要重新对刀');
        },
        controls: [
          { type: 'range', key: 'turretDeg', min: -45, max: 45, step: 1, label: '炮塔回转角 (°)' },
          { type: 'range', key: 'tiltDeg', min: -45, max: 45, step: 1, label: '铣头倾斜角 (°)' },
          { type: 'btn', label: '回正 0° / 0°', onClick: function (s) { s.turretDeg = 0; s.tiltDeg = 0; } }
        ]
      },
      {
        name: '铣削操控台',
        cam: { tx: 1, ty: 4.5, tz: 2, dist: 26, yaw: .44, pitch: .52 },
        apply: function (s) {
          s.cutaway = false; s.turretDeg = 0; s.tiltDeg = 0;
          s.zmm = 48; s.ymm = 0; s.quillMm = 0;
          s.xmm = -60; s.autoX = -60; s.autoDir = 1; s.cutting = true;
          s.power = true; s.estop = false; s.dir = 'cw';
          s.rpmSet = RPM_STEPS[s.rpmIdx] || 1450;
          hint('完整流程：面板「电源」→「正转」→「走刀」→ 套筒手柄下刀吃深；急停按下要再点一次才复位');
        },
        controls: [
          { type: 'btn', label: '走刀 启动 / 暂停', onClick: function (s) { s.cutting = !s.cutting; } },
          { type: 'range', key: 'rpmSet', min: 0, max: 4550, step: 25, label: '主轴转速 S (r/min)' },
          { type: 'btn', label: '复位工件 + 三轴', onClick: function (s) {
              resetWorkpiece(); s.cutting = false; s.xmm = 0; s.ymm = 0; s.zmm = 0; s.quillMm = 0;
              s.autoX = 0; s.autoDir = 1;
            } }
        ]
      }
    ]
  });
})();
