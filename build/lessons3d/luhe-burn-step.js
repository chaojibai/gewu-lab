/* 格物实验室 · 燃烧的条件（three.js 版） */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    o2: false,
    white: true,
    under: false,
    t: 0,
    smoke: [],
    steam: [],
    bub: []
  };

  var O = {};   // 对象引用

  /* ---------------- 装置尺寸（世界坐标，y 向上，台面 y=0） ---------------- */
  var R = 5.4, BH = 11.2;            /* 烧杯半径 / 高 */
  var NET_Y = 5.65;                  /* 石棉网 */
  var Y0 = NET_Y + .08;              /* 杯底 = 石棉网上表面 */
  var RIM = Y0 + BH;                 /* 杯口 16.93 */
  var WL = Y0 + BH * .74;            /* 热水水面 14.02 */
  var RING_Y = 5.52;                 /* 三脚架铁圈（托住石棉网） */
  var LEG_R = 6.0;
  var CUY = RIM + .09;               /* 铜片中心 */
  var PLT = CUY + .09;               /* 铜片上表面 */
  var WP = [-3.4, PLT + .34, .15];   /* 铜片上白磷 */
  var RP = [3.3, PLT, -.05];         /* 铜片上红磷 */
  var UP = [1.3, 6.23, -3.5];        /* 水下白磷 */
  var TIP = [1.3, 7.05, -3.5];       /* 导气管口 */

  function legXZ(a, k) { k = k || 1; return [Math.cos(a) * LEG_R * k, Math.sin(a) * LEG_R * k]; }

  /* 粒子批量回收：state 数组被 apply 清空时，同步移除 3D 对象 */
  function sweep() {
    var i;
    for (i = O.all.length - 1; i >= 0; i--) {
      if (!O.all[i].__seen) {
        K.scene().remove(O.all[i]);
        O.all.splice(i, 1);
      }
    }
  }

  function puffSprite(x, y, z, sc, op) {
    var sp = new T.Sprite(new T.SpriteMaterial({
      map: O.puffTex, transparent: true, depthWrite: false, opacity: op
    }));
    sp.position.set(x, y, z);
    sp.scale.set(sc, sc, 1);
    K.scene().add(sp);
    O.all.push(sp);
    return sp;
  }

  function bubMesh(x, y, z) {
    var m = new T.Mesh(O.bubGeo, O.bubMat);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 3;
    K.scene().add(m);
    O.all.push(m);
    return m;
  }

  /* 火焰贴图是加色混合，浅色背景上会洗白：改成普通混合 */
  function solidFlame(o) {
    o = o || {}; o.blend = 'normal';
    return K.flame(o);
  }

  /* 暖色立方体环境：把 kit3d 默认的 PMREM 环境替换为"等距渐变 -> 立方体贴图"，
     让铜片正确反射出橙铜色（金属本色相当于高光着色，环境越暖铜越像铜）。
     仅在 burn-step 运行时覆盖 scene.environment，不影响其他课件的共享环境。 */
  function warmEnv() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#eef2f8');     /* 顶部天光（亮冷白） */
    g.addColorStop(0.28, '#d9cec0');  /* 偏暖灰 */
    g.addColorStop(0.42, '#c4a87f');  /* 暖橙棕：铜片反射区，使铜显饱和橙 */
    g.addColorStop(0.55, '#8a7458');  /* 地平线暖灰 */
    g.addColorStop(0.64, '#333a42');  /* 地平线下压暗，制造反光对比 */
    g.addColorStop(1, '#121820');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.globalCompositeOperation = 'lighter';
    function spot(cx, cy, r, a, col) {
      col = col || '255,255,255';
      var rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
      rg.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    spot(120, 55, 80, 0.95); spot(380, 45, 100, 0.7); spot(256, 22, 130, 0.6);
    spot(150, 150, 115, 0.85, '255,236,208');   /* 地平线暖色柔光窗 */
    spot(150, 150, 55, 0.95, '255,247,236');
    spot(150, 150, 22, 1.0, '255,255,255');
    x.globalCompositeOperation = 'source-over';
    (function () {   /* 右侧暗区：制造左亮右暗的方位对比 */
      var rg = x.createRadialGradient(372, 152, 0, 372, 152, 150);
      rg.addColorStop(0, 'rgba(18,22,28,0.55)'); rg.addColorStop(1, 'rgba(18,22,28,0)');
      x.fillStyle = rg; x.fillRect(222, 2, 300, 300);
    })();
    var W = 512, H = 256, S = 128;
    var src = x.getImageData(0, 0, W, H).data;
    function samp(px, py) {
      px = px < 0 ? 0 : (px > W - 1 ? W - 1 : px | 0);
      py = py < 0 ? 0 : (py > H - 1 ? H - 1 : py | 0);
      var i = (py * W + px) * 4; return [src[i], src[i + 1], src[i + 2]];
    }
    function dir(f, i, j) {
      var s = (2 * i + 1) / S - 1, t = (2 * j + 1) / S - 1;
      switch (f) {
        case 0: return [1, -t, -s]; case 1: return [-1, -t, s];
        case 2: return [s, 1, -t];  case 3: return [-s, -1, t];
        case 4: return [s, -t, 1];  case 5: return [-s, -t, -1];
      }
    }
    var faces = [];
    for (var f = 0; f < 6; f++) {
      var cv = document.createElement('canvas'); cv.width = cv.height = S;
      var cx2 = cv.getContext('2d'); var img = cx2.createImageData(S, S); var d = img.data;
      for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) {
        var v = dir(f, i, j); var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        var dx = v[0] / L, dy = v[1] / L, dz = v[2] / L;
        var lon = Math.atan2(dx, dz);
        var lat = Math.asin(dy < -1 ? -1 : (dy > 1 ? 1 : dy));
        var u = ((lon / (2 * Math.PI)) + 0.5) * (W - 1);
        var vt = (0.5 - lat / Math.PI) * (H - 1);
        var sd = samp(u, vt); var o = (j * S + i) * 4;
        d[o] = sd[0]; d[o + 1] = sd[1]; d[o + 2] = sd[2]; d[o + 3] = 255;
      }
      cx2.putImageData(img, 0, 0); faces.push(cv);
    }
    var cube = new T.CubeTexture(faces); cube.needsUpdate = true; cube.encoding = T.sRGBEncoding;
    K.scene().environment = cube;
  }

  var scene = {
    setup: function () {
      var la, lb, lc, la2, lb2, lc2;
      /* 铜色材质修正：metalness=1 才是真金属（原 0.6 会把铜色冲成褐色）；
         并把本课件环境换成暖色立方体贴图，使铜片反射出饱和橙铜色。 */
      var cu = K.M().copper;
      cu.color.setHex(0xc24a14); cu.metalness = 1.0; cu.roughness = .3;
      cu.envMapIntensity = 1.15; cu.needsUpdate = true;
      warmEnv();
      K.bench(46, 30);


      /* ---- 酒精灯：灯体＋灯内酒精＋灯颈＋灯芯＋火焰 ---- */
      K.glassCyl({ r: 1.85, h: 3.3, x: 0, z: 0, y0: .06 });
      var alc = K.liquidCyl({ r: 1.62, h: 1.9, x: 0, z: 0, y0: .2, color: 0x7fa8d8, opacity: .75 });
      alc.material.transmission = 0;
      K.cyl({ r: .55, h: .6, y0: 3.36, x: 0, z: 0, mat: K.M().glass });
      K.cyl({ r: .13, h: .55, y0: 3.82, x: 0, z: 0, mat: new T.MeshStandardMaterial({ color: 0xefe3c8, roughness: .9 }) });
      O.flameLamp = solidFlame({ x: 0, y: 4.18, z: 0, s: 1.25, tex: 'alcohol' });

      /* ---- 三脚架：三条腿 + 铁圈（托住石棉网） ---- */
      la = legXZ(Math.PI * 7 / 6); lb = legXZ(Math.PI * 11 / 6); lc = legXZ(Math.PI / 2);
      la2 = legXZ(Math.PI * 7 / 6, 1.13); lb2 = legXZ(Math.PI * 11 / 6, 1.13); lc2 = legXZ(Math.PI / 2, 1.13);
      K.rod([la2[0], 0, la2[1]], [la[0], RING_Y + .05, la[1]], .45, { mat: K.M().iron });
      K.rod([lb2[0], 0, lb2[1]], [lb[0], RING_Y + .05, lb[1]], .45, { mat: K.M().iron });
      K.rod([lc2[0], 0, lc2[1]], [lc[0], RING_Y + .05, lc[1]], .45, { mat: K.M().iron });
      var ring = new T.Mesh(new T.TorusGeometry(LEG_R, .22, 10, 48), K.M().iron);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = RING_Y;
      K.scene().add(ring);

      /* ---- 石棉网：半透明网板 + 白色陶芯圆片 ---- */
      K.box({ x: 0, y: NET_Y, z: 0, sx: 13.4, sy: .12, sz: 13.4, mat: new T.MeshStandardMaterial({ color: 0x88919f, transparent: true, opacity: .38, roughness: .5, metalness: .4 }) });
      var core = new T.Mesh(new T.CircleGeometry(3.4, 32),
        new T.MeshStandardMaterial({ color: 0xdfe3ea, transparent: true, opacity: .4, roughness: .8, side: T.DoubleSide }));
      core.rotation.x = -Math.PI / 2;
      core.position.y = NET_Y + .09;
      K.scene().add(core);

      /* ---- 大烧杯与 80 ℃ 热水 ---- */
      K.beaker({ r: R, h: BH, x: 0, z: 0, y0: Y0 });
      /* 关键读色液体：关掉透射，用实体半透明保证浅背景下的可见度 */
      O.water = K.liquidCyl({ r: R - .24, h: WL - Y0 - .06, x: 0, z: 0, y0: Y0 + .04, color: 0x3a7fb8, opacity: .55 });
      O.water.material.transmission = 0;
      K.liquidTop({ r: R - .25, x: 0, z: 0, y: WL, color: 0x63a4d8 });

      /* ---- 导气管：从左上引入，垂入杯内到水下白磷 ---- */
      /* 橡胶软管：从左引入、绕过杯口上方（深色、细） */
      K.tube([[TIP[0] - 16, 21.0, TIP[2]], [TIP[0] - 6, 21.0, TIP[2]],
              [TIP[0] - 1.2, 20.2, TIP[2]], [TIP[0], 19.4, TIP[2]]], .18,
             { rubber: true, color: 0x3c4650 });
      /* 玻璃导管：垂入水中到水下白磷 */
      K.tube([[TIP[0], 19.4, TIP[2]], [TIP[0], WL + .5, TIP[2]], [TIP[0], TIP[1], TIP[2]]], .16);

      /* ---- 水下白磷（通氧后在水下燃烧） ---- */
      O.up = K.sphere({ x: UP[0], y: UP[1], z: UP[2], r: .5, color: 0xebe5d2 });
      O.flameU = solidFlame({ x: UP[0], y: UP[1] + .38, z: UP[2], s: .85, tex: 'alcohol' });
      O.flameU.lit = false;
      /* 水下火焰要透过水壁可见：不做深度测试、最后绘制 */
      O.flameU.sp.material.depthTest = false;
      O.flameU.sp.renderOrder = 3;

      /* ---- 铜片：薄铜板横搭杯口（轻微倾斜，使铜面反射出明暗渐变，避免整片死平） ---- */
      var cuSheet = K.box({ x: 0, y: CUY, z: 0, sx: 12.6, sy: .18, sz: 5.6, mat: K.M().copper });
      cuSheet.rotation.z = 0.06;
      cuSheet.rotation.x = -0.05;

      /* ---- 铜片上白磷（着火冒白烟） ---- */
      O.wp = K.sphere({ x: WP[0], y: WP[1], z: WP[2], r: .38, color: 0xfff3d0 });
      K.sphere({ x: WP[0] - .23, y: WP[1] - .16, z: WP[2] + .18, r: .23, color: 0xf7efd8 });
      O.flameW = solidFlame({ x: WP[0], y: WP[1] + .32, z: WP[2], s: .8 });

      /* ---- 铜片上红磷：暗红色小球堆 ---- */
      K.sphere({ x: RP[0] - .30, y: PLT + .20, z: RP[2] + .14, r: .20, color: 0x8c2419 });
      K.sphere({ x: RP[0] + .09, y: PLT + .24, z: RP[2] - .18, r: .24, color: 0xa3301f });
      K.sphere({ x: RP[0] + .36, y: PLT + .16, z: RP[2] + .20, r: .18, color: 0xb23c28 });
      K.sphere({ x: RP[0] - .04, y: PLT + .11, z: RP[2] + .02, r: .22, color: 0x93291f });

      /* 接触阴影 */
      K.blob({ x: 0, z: 0, r: 8.4 });
      K.blob({ x: 0, z: 0, r: 2.4 });

      /* 标注 */
      K.label([-6.8, CUY, 0], '铜片', -34, -8);
      K.label([WP[0], WP[1] + .5, WP[2]], '白磷', -44, -30);
      K.label([RP[0], PLT + .42, RP[2]], '红磷', 32, -30);
      K.label([-5.4, WL - 3.4, 1.5], '热水（80 ℃）', -48, 8);
      K.label([UP[0], UP[1] + .2, UP[2]], '水下白磷', -58, -22);

      /* ---- 粒子贴图（白烟 / 水汽共用柔边雾团，浅背景上带一点灰蓝） ---- */
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x2 = c.getContext('2d');
      var g2 = x2.createRadialGradient(32, 32, 2, 32, 32, 30);
      g2.addColorStop(0, 'rgba(203,214,231,.95)');
      g2.addColorStop(1, 'rgba(203,214,231,0)');
      x2.fillStyle = g2; x2.fillRect(0, 0, 64, 64);
      O.puffTex = new T.CanvasTexture(c);

      /* 气泡共享几何 / 材质 */
      O.bubGeo = new T.SphereGeometry(.16, 10, 8);
      O.bubMat = new T.MeshStandardMaterial({ color: 0xd8efff, transparent: true, opacity: .55, roughness: .15, depthTest: false });
      O.bubMat.depthWrite = false;

      O.all = [];
    },

    update: function (dt, s) {
      var i, m;
      s.t += dt;
      for (i = 0; i < O.all.length; i++) O.all[i].__seen = false;

      /* 铜片上白磷燃烧的白烟（五氧化二磷小颗粒） */
      if (s.white && Math.random() < dt * 16) {
        s.smoke.push({
          x: WP[0] + K.rnd(-.45, .45), y: WP[1] + .7, z: WP[2] + K.rnd(-.45, .45),
          r: K.rnd(.13, .24), v: K.rnd(1.5, 2.6), a: 1,
          sp: puffSprite(0, 0, 0, .8, .5)
        });
      }
      for (i = s.smoke.length - 1; i >= 0; i--) {
        m = s.smoke[i];
        m.y += m.v * dt; m.a -= dt * .45; m.r += dt * .5;
        m.sp.position.set(m.x, m.y, m.z);
        m.sp.scale.setScalar(Math.max(.1, m.r * 3.6));
        m.sp.material.opacity = Math.max(0, m.a * .5);
        m.sp.__seen = true;
        if (m.a <= 0) s.smoke.splice(i, 1);
      }

      /* 热水面缓缓上升的水汽 */
      if (Math.random() < dt * 7.0) {
        var ang = Math.random() * Math.PI * 2, rad = K.rnd(1.4, 4.6);
        s.steam.push({
          x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, y: WL + .2,
          r: K.rnd(.20, .46), v: K.rnd(1.0, 1.9), a: .62,
          sp: puffSprite(0, 0, 0, 1, .2)
        });
      }
      for (i = s.steam.length - 1; i >= 0; i--) {
        m = s.steam[i];
        m.y += m.v * dt; m.a -= dt * .3;
        m.x += Math.sin(s.t * 1.3 + m.z) * dt * .3;
        m.sp.position.set(m.x, Math.min(m.y, RIM - .4), m.z);
        m.sp.scale.setScalar(Math.max(.1, m.r * 3));
        m.sp.material.opacity = Math.max(0, m.a * .3);
        m.sp.__seen = true;
        if (m.a <= 0) s.steam.splice(i, 1);
      }

      /* 导气管口冒出的氧气泡 + 水下燃烧自身产生的气泡 */
      if (!s.o2 && !s.under) s.bub.length = 0;
      if (s.o2 && Math.random() < dt * 9) {
        s.bub.push({
          x: TIP[0] + K.rnd(-.14, .14), y: TIP[1], z: TIP[2] + K.rnd(-.14, .14),
          r: K.rnd(.09, .22), v: K.rnd(2.4, 3.8), ph: K.rnd(0, 6),
          sp: bubMesh(0, 0, 0)
        });
      }
      if (s.under && Math.random() < dt * 4) {
        s.bub.push({
          x: UP[0] + K.rnd(-.3, .3), y: UP[1] + .3, z: UP[2] + K.rnd(-.3, .3),
          r: K.rnd(.09, .20), v: K.rnd(1.8, 3.0), ph: K.rnd(0, 6),
          sp: bubMesh(0, 0, 0)
        });
      }
      for (i = s.bub.length - 1; i >= 0; i--) {
        m = s.bub[i];
        m.y += m.v * dt;
        m.sp.position.set(
          m.x + Math.sin(m.y * 1.1 + m.ph) * .55, m.y,
          m.z + Math.cos(m.y * .9 + m.ph) * .4);
        m.sp.scale.setScalar(m.r / .16);
        m.sp.__seen = true;
        if (m.y > WL - .25 || s.bub.length > 90) s.bub.splice(i, 1);
      }

      /* 火焰与白磷状态 */
      O.flameW.lit = s.white;
      O.flameU.lit = s.under;
      O.flameLamp.lit = true;
      if (!O.wpCol) O.wpCol = new T.Color(0xe8e2ce);
      O.wpCol.lerp(new T.Color(s.white ? 0xfff3d0 : 0xe8e2ce), Math.min(1, dt * 3));
      O.wp.material.color.copy(O.wpCol);
      if (!O.upCol) O.upCol = new T.Color(0xebe5d2);
      O.upCol.lerp(new T.Color(s.under ? 0xffd98a : 0xebe5d2), Math.min(1, dt * 3));
      O.up.material.color.copy(O.upCol);

      sweep();
    }
  };

  K.boot({
    title: '燃烧条件的探究',
    chip: '化学 · 鲁教版 · 八年级全一册 · 学生实验5',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 9.5, dist: 50, tx: 5.6, yaw: .5, pitch: .16 },

    reads: [['a', '铜片上白磷'], ['b', '铜片上红磷'], ['c', '水中白磷'], ['d', '水温']],
    values: function (s) {
      return {
        a: s.white ? '剧烈燃烧' : '未燃烧',
        b: '不燃烧',
        c: s.under ? '燃烧' : '不燃烧',
        d: '80 ℃'
      };
    },

    steps: [
      {
        name: '认识装置', title: '一块铜片，三个位置',
        ask: '为什么要把磷放在铜片上？',
        body: '<p><b>现象：</b>烧杯里是 <b>80 ℃ 的热水</b>，杯口架一块<b>铜片</b>。铜片左边的白磷正燃着火焰、不断冒白烟；右边的红磷纹丝不动；沉在水底的那块白磷也毫无动静。</p>' +
          '<p>铜是<b>热的良导体</b>，热水的热量经铜片传给上面的白磷和红磷，三处的温度都被拉到了 80 ℃ 左右。</p>' +
          '<p><b>为什么这样摆？</b>三个位置其实是三组<b>对照实验</b>：铜片上白磷对红磷，比的是物质本身；铜片上白磷对水中白磷，比的是氧气。每组只差一个条件，其余条件全部相同——这就是<b>控制变量法</b>。</p>' +
          '<p><b>看谁烧、谁不烧</b>，再想想差在哪里，燃烧的三个条件就会自己浮出水面。</p>',
        apply: function (s) { s.o2 = false; s.white = true; s.under = false; s.smoke = []; }
      },
      {
        name: '着火点', title: '同样的温度，为什么只烧一个',
        ask: '白磷和红磷都到了 80 ℃，差别在哪？',
        body: '<p><b>现象：</b>白磷和红磷贴在同一块铜片上，都接触空气，温度也都是 80 ℃，可白磷烧得正旺，红磷连一丝白烟都没有。</p>' +
          '<p><b>原因在着火点：</b>白磷的着火点约 <b>40 ℃</b>，80 ℃ 早已超过它；红磷的着火点约 <b>240 ℃</b>，80 ℃ 远远不够。燃烧要求温度<b>达到该物质的着火点</b>，不同物质这个门槛不一样。</p>' +
          '<p><b>易错点：</b>着火点是<b>物质本身的属性</b>，像密度、沸点一样，一般不能改变。用水灭火是<b>降温到着火点以下</b>，不是「降低着火点」——中考判断题专抓这种说法。</p>' +
          '<p><b>考点：</b>这组对比里温度相同、都接触氧气，唯一变量是物质种类，所以结论只能写成「白磷和红磷的着火点不同」，不能写成「温度越高越容易燃烧」。</p>',
        apply: function (s) { s.o2 = false; s.white = true; s.under = false; s.smoke = []; }
      },
      {
        name: '水中的白磷', title: '温度够了，为什么也不烧',
        ask: '水里那块白磷温度也够，怎么不燃烧？',
        body: '<p><b>现象：</b>水底的白磷温度同样是 80 ℃，早已超过它 40 ℃ 的着火点，却安安静静，连一点白烟都不冒。</p>' +
          '<p><b>为什么？</b>它被水严严实实包住，<b>接触不到氧气</b>。水在这里的职责是隔绝空气——顺便说一句，热水能灭火，靠的也是「降温 + 隔绝空气」这两手。</p>' +
          '<p><b>易错点：</b>这组对比推翻了「温度够就一定烧」的想法。燃烧必须<b>同时</b>满足可燃物、氧气、温度达着火点三个条件，缺席任何一个都不行。</p>' +
          '<p><b>考点：</b>铜片上的白磷与水中的白磷对比：温度相同、都是白磷，唯一变量是<b>是否接触氧气</b>——这正是下一步要补上的那块拼图。</p>',
        apply: function (s) { s.o2 = false; s.white = true; s.under = false; s.smoke = []; }
      },
      {
        name: '通入氧气', title: '三个条件凑齐了',
        ask: '往水里通氧气，会发生什么？',
        body: '<p><b>现象：</b>导管向水中的白磷通入氧气，白磷竟<b>在水下烧了起来</b>，还冒出白烟——这就是课本上著名的「水火相容」实验。</p>' +
          '<p><b>为什么现在才烧？</b>此刻三个条件第一次凑齐：<b>可燃物</b>（白磷）、<b>与氧气接触</b>（导管送来的氧气）、<b>温度达到着火点</b>（80 ℃ &gt; 40 ℃）。热水一直负责供温，水一直负责隔绝，氧气一通进来，最后一个缺口补上了。</p>' +
          '<p><b>易错点：</b>结论要写成「燃烧需要三个条件<b>同时满足</b>，缺一不可」。只写「需要氧气」或「需要温度达到着火点」都算漏答——中考按点给分。</p>' +
          '<p><b>考点：</b>整条推理链值得背下来：先比物质（着火点），再比氧气（水中白磷），最后把氧气补回去验证。这是实验探究题的标准答题模板。</p>',
        apply: function (s) { s.o2 = true; s.white = true; s.under = true; s.smoke = []; },
        controls: [
          { type: 'btn', label: '向水中通入氧气', onClick: function (s) { s.o2 = true; s.under = true; } },
          { type: 'btn', label: '停止通氧气', onClick: function (s) { s.o2 = false; s.under = false; } }
        ]
      },
      {
        name: '三个条件', title: '燃烧需要什么',
        ask: '把三个条件排一排。',
        body: '<p><b>① 可燃物</b>：本身能燃烧的物质，如木柴、纸张、汽油、天然气。没有它，其他条件再好也是空谈。</p>' +
          '<p><b>② 氧气（或空气）</b>：绝大多数燃烧都离不开氧气，所以给炉灶鼓入充足空气能让火更旺——这是促进燃烧的常见思路。</p>' +
          '<p><b>③ 温度达到着火点</b>：每种可燃物都有自己的着火点，它是物质的属性，一般不能改变。</p>' +
          '<p><b>易错点：</b>「燃烧需要氧气」是初中范围内的主流说法，但镁条能在二氧化碳中剧烈燃烧——遇到「燃烧不一定需要氧气」这类拓展选项，要能判断它成立。</p>' +
          '<p><b>考点：</b>三条件判断题最常挖坑的位置是第 ③ 条，把「降低温度」偷换成「降低着火点」，一字之差，整句判错。</p>',
        apply: function (s) { s.o2 = true; s.white = true; s.under = true; s.smoke = []; }
      },
      {
        name: '灭火', title: '破坏掉一个条件就行',
        ask: '灭火的三种办法，分别破坏了哪个条件？',
        body: '<p><b>原理一句话：</b>灭火不必破坏全部三个条件，只要<b>破坏掉其中一个</b>，燃烧就无法继续。</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">油锅起火盖锅盖</td><td style="color:#c8d4e6">隔绝氧气</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">森林火灾砍隔离带</td><td style="color:#c8d4e6">清除可燃物</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">用水浇灭柴火</td><td style="color:#c8d4e6">降温到着火点以下</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">吹灭蜡烛</td><td style="color:#c8d4e6">降温 + 带走可燃物蒸气</td></tr>' +
          '</table>' +
          '<p style="margin-top:10px"><b>易错点：</b>水不是万能灭火剂——油比水轻，浇上去会浮在油面继续烧，火还随水蔓延；水导电，电器着火必须先<b>切断电源</b>，再用干粉灭火器或干沙。</p>' +
          '<p><b>考点：</b>中考按「破坏了哪个条件」给分，规范写法只有三种：<b>隔绝氧气（或空气）</b>、<b>清除（隔离）可燃物</b>、<b>使温度降到着火点以下</b>。写「降低着火点」直接判错。</p>',
        apply: function (s) { s.o2 = false; s.white = false; s.under = false; s.smoke = []; },
        controls: [
          { type: 'btn', label: '盖住（隔绝氧气）', onClick: function (s) { s.white = false; } },
          { type: 'btn', label: '重新点燃白磷', onClick: function (s) { s.white = true; } }
        ]
      },
      {
        name: '安全', title: '实验室里的几条规矩',
        ask: '白磷为什么必须保存在水里？',
        body: '<p><b>现象与做法：</b>白磷着火点只有 40 ℃，常温下暴露在空气里就可能<b>自燃</b>，所以必须浸在<b>冷水</b>中保存，取用时在水下切割。另外白磷<b>有剧毒</b>，沾到皮肤会造成严重灼伤。</p>' +
          '<p><b>其他几条规矩的道理：</b>可燃性气体（氢气、一氧化碳、甲烷）点燃前必须<b>验纯</b>——不纯的气体点燃可能爆炸；酒精灯要用<b>灯帽盖灭</b>，用嘴吹可能把火焰压进灯颈、引燃灯内酒精。</p>' +
          '<p><b>易错点：</b>白磷保存在冷水中是一举两得：水既<b>隔绝氧气</b>，又把温度<b>压在着火点以下</b>，两个条件同时卡死，所以它怎么都烧不起来。</p>' +
          '<p><b>考点：</b>「白磷为什么必须保存在水中」要答两点：隔绝氧气、温度低于着火点。漏答一点就要扣分。</p>',
        apply: function (s) { s.o2 = false; s.white = false; s.under = false; s.smoke = []; }
      },
      {
        name: '考核', title: '当一回实验员',
        ask: '下面每题都考燃烧与灭火。',
        quiz: true,
        apply: function (s) { s.o2 = false; s.white = true; s.under = false; s.smoke = []; }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '向水中白磷通入氧气后，观察到的现象是：',
          opts: ['白磷在水下燃烧，冒出大量白烟', '白磷熔化成液体', '烧杯里的水剧烈沸腾', '白磷变成红磷'],
          ans: '白磷在水下燃烧，冒出大量白烟',
          why: '白磷温度早已达到着火点，通入氧气后三个条件凑齐，于是在水下燃烧；生成的五氧化二磷是白色固体小颗粒，看起来就是白烟。'
        },
        {
          q: '水中白磷通氧气前不燃烧、通氧气后燃烧，说明燃烧需要：',
          opts: ['与氧气接触', '温度达到着火点就一定燃烧', '水参加反应', '导管传热'],
          ans: '与氧气接触',
          why: '通氧前后温度、可燃物都没变，唯一补上的条件是氧气。对照前后两个状态，结论自然指向氧气。'
        },
        {
          q: '铜片上的白磷燃烧而红磷不燃烧，这组对比实验说明：',
          opts: ['白磷的着火点比红磷低', '红磷不能与氧气反应', '铜片只给白磷传热', '红磷不是可燃物'],
          ans: '白磷的着火点比红磷低',
          why: '两者温度同为 80 ℃、都接触氧气，唯一变量是物质种类：白磷着火点约 40 ℃，红磷约 240 ℃，80 ℃ 只够点燃白磷。'
        },
        {
          q: '下列关于着火点的说法，正确的是：',
          opts: ['着火点是物质的属性，一般不能改变', '用水灭火降低了可燃物的着火点', '温度越低着火点越高', '所有可燃物的着火点都相同'],
          ans: '着火点是物质的属性，一般不能改变',
          why: '水灭火只是把温度降到着火点以下，着火点本身没有变。「降低着火点」是中考判断题最经典的错误说法。'
        },
        {
          q: '炒菜时油锅起火，最合理的处理是：',
          opts: ['立即盖上锅盖并关火', '立即泼一大碗水', '继续翻炒把油烧干', '把油锅端到室外去'],
          ans: '立即盖上锅盖并关火',
          why: '锅盖隔绝氧气、关火撤掉热源，缺了条件火就熄灭；泼水会让燃着的油飞溅蔓延，水不能灭油火。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
