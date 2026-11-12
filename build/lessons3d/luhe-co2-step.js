/* 格物实验室 · 二氧化碳的制取与检验（three.js 版） */
(function () {
  var T = window.THREE, K = window.Lab;
  var st = {
    react: false,
    fill: 0,
    test: '',
    bubbles: [],
    t: 0,
    /* dropT：大理石投入动线（0 = 在瓶口上方待投，1 = 已沉到液面下）。
       消融不另设计时，直接由收集进度 s.fill 驱动，保证读数与现象同源。 */
    dropT: 1,
    /* pourT：稀盐酸倒入进度（0 = 瓶空，1 = 液面升到反应位）。
       教学顺序「先固后液」：步骤 3 先投大理石，再点按钮让酸沿长颈漏斗流下；
       倒满后 needReact 触发 s.react，气泡自动开始。needReact=false 时
       pourT=1 只表示「瓶里有酸」的静态展示（步骤 1/2）。 */
    pourT: 1,
    needReact: false,
    /* 视觉辅助字段（不参与步骤逻辑） */
    _pt: '',
    fullT: 0,
    limeT: 0,
    smoke: []
  };

  var O = {};   // 对象引用

  /* ---- 布局常量 ---- */
  var FX = -12, FZ = 0;                 /* 锥形瓶 */
  var FBH = 7.2, LIQ_FRAC = .42;
  var LIQ_Y = .5 + FBH * LIQ_FRAC * .95;  /* 液面高度 ≈3.37（与 K.flask 公式一致） */
  var BX = 8, BZ = 0, BR = 3.2, B0 = .55, B1 = 11.55;   /* 集气瓶 */
  var LX = 13.6, LZ = 4.2;              /* 澄清石灰水试管 */
  var FUX = FX - .92;                   /* 长颈漏斗轴（左孔） */
  var DTX = FX + .92;                   /* 导管出塞位置（右孔） */
  var TIP = [BX - 1.85, 11.72, 1.2];    /* 验满木条尖端 */

  /* 玻璃可见壳：浅色背景下给玻璃器皿一个淡蓝读得出的轮廓 */
  function shellMat(op) {
    return new T.MeshBasicMaterial({ color: 0xa8c8e8, transparent: true, opacity: op,
      side: T.DoubleSide, depthWrite: false });
  }

  /* 大理石：不规则灰白小块（局部坐标 dx / y / z / r） */
  var MARBLES = [
    [-2.20, 1.08, .70, .62, '#dfe6ee'],
    [-1.35, .92, -.55, .48, '#c8d1dc'],
    [-.35, 1.16, .85, .66, '#e6ecf2'],
    [.75, .98, -.30, .52, '#d2dae4'],
    [1.65, 1.10, .95, .58, '#dde4ec'],
    [-.95, .88, 1.65, .44, '#cbd4df'],
    [1.30, .88, -1.55, .42, '#d5dde6']
  ];

  function mixC(a, b, t) { return new T.Color(a).lerp(new T.Color(b), t); }

  /* 把数据数组映射到对象池（对 s.bubbles / s.smoke 的数组重置天然免疫） */
  function mapPool(pool, items, place) {
    var i, k = 0;
    for (i = 0; i < pool.length; i++) pool[i].used = false;
    for (i = 0; i < items.length; i++) {
      while (k < pool.length && pool[k].used) k++;
      if (k >= pool.length) break;
      pool[k].used = true;
      place(pool[k].m, items[i]);
    }
    for (i = 0; i < pool.length; i++) pool[i].m.visible = pool[i].used;
  }

  var scene = {
    setup: function () {
      var i, m;
      K.bench(58, 36);


      O.darkMat = new T.MeshStandardMaterial({ color: 0x17120d, roughness: .9 });
      O.tubeMat = new T.MeshPhysicalMaterial({ color: 0xbcd8ee, roughness: .15, transparent: true, opacity: .45, side: T.DoubleSide });
      O.plateMat = new T.MeshPhysicalMaterial({ color: 0xa9c9e6, roughness: .1, transparent: true, opacity: .55, side: T.DoubleSide });
      /* 长颈漏斗必须用自己的材质：K.fadeShow 是直接改「材质.opacity」做淡入淡出的，
         O.tubeMat / O.darkMat 还被石灰水试管、木条、玻璃片共用，它们一淡出就把
         漏斗整件一起拉成 opacity=0 —— 画面上只剩「长颈漏斗」四个字，器材凭空消失。 */
      O.funnelMat = new T.MeshPhysicalMaterial({ color: 0xa3cde6, roughness: .12,
        transparent: true, opacity: .42, side: T.DoubleSide, depthWrite: false,
        clearcoat: .7, clearcoatRoughness: .08 });
      O.holeMat = new T.MeshStandardMaterial({ color: 0x17120d, roughness: .9 });
      O.waxMat = new T.MeshStandardMaterial({ color: 0xf3ede1, roughness: .55 });

      /* ---- 锥形瓶（内装稀盐酸）+ 可见壳 ---- */
      var ckFlask = K.flask({ baseR: 5, bodyH: 7.2, neckR: 1.75, neckH: 3.4, x: FX, z: FZ, y0: 0,
        liquid: LIQ_FRAC, liquidCol: 0x63b8d8, liquidA: .5 });
      /* 引擎 K.flask 自带的竖向加色高光片与整圈粉笔线环，在浅墙 + 白窗前
         会烧成白板/光环（acidbase 已验证同款处理），这里一并隐藏；
         瓶身形体由下方自建的 fshell / nshell 描边壳承担。 */
      ckFlask.traverse(function (o) {
        if (o.isLineLoop) o.visible = false;
        if (o.isMesh && o.geometry.type === 'PlaneGeometry' &&
            o.material && o.material.blending === T.AdditiveBlending) o.visible = false;
      });
      /* ── 稀盐酸液柱系（主体 liquid / 贴壁壳 liquidShell / 液面环 / 暗线）──
         教学顺序是「先固后液」：酸不是预装的，初始整组隐藏，
         由 setJarLevel(f) 随倒入动画升起（f: 0=空瓶 1=满到反应位）。 */
      O.jarLiq = [];
      ckFlask.traverse(function (o) {
        /* 液面白亮环（liquidMen）与引擎自带的底/肩/颈/口整圈线环，在浅背景上
           全读成「瓶身白环」。必须在这里直接隐藏、且不能收进 jarLiq——
           收进去会被液面动画每帧重新打开。 */
        if (o.isLineLoop) { o.visible = false; return; }
        if (o.name === 'liquid' || o.name === 'liquidShell') O.jarLiq.push(o);
      });
      O.jarLiq.forEach(function (o) { o.visible = false; });
      /* 倒入时的两段可见液体：漏斗口上方一股液流 + 漏斗细管内的液柱，
         透过玻璃管读出「液体正沿长颈漏斗往下走」。 */
      O.pourStream = K.cyl({ r: .22, h: 2.2, x: FUX, z: FZ, y0: 15.0,
        mat: new T.MeshPhysicalMaterial({ color: 0x8fc7e8, roughness: .18, transparent: true,
          opacity: .72, clearcoat: .5 }) });
      O.pourStream.visible = false;
      O.funFill = K.cyl({ r: .155, h: 10.7, x: FUX, z: FZ, y0: 2.4,
        mat: new T.MeshPhysicalMaterial({ color: 0x8fc7e8, roughness: .18, transparent: true,
          opacity: .8, clearcoat: .5 }) });
      O.funFill.visible = false;
      var fp = [new T.Vector2(.05, 0)], j;
      for (j = 0; j <= 24; j++) {
        var tt = j / 24;
        fp.push(new T.Vector2(5 + (1.75 - 5) * Math.pow(tt, .8) + .04, .5 + 7.2 * tt));
      }
      var fshell = new T.Mesh(new T.LatheGeometry(fp, 48), shellMat(.12));
      fshell.position.set(FX, 0, FZ);
      K.scene().add(fshell);
      var nshell = new T.Mesh(new T.CylinderGeometry(1.79, 1.79, 3.4, 40, 1, true), shellMat(.12));
      nshell.position.set(FX, 7.7 + 1.7, FZ);
      K.scene().add(nshell);

      /* ---- 大理石：先在瓶口上方待投；第 3 步逐颗落入瓶中沉到液面下 ---- */
      O.marbles = [];
      for (i = 0; i < MARBLES.length; i++) {
        m = MARBLES[i];
        O.marbles.push(K.sphere({ x: FX + m[0] * .35, y: 16 + i * .5, z: m[2],
          r: m[3], color: parseInt(m[4].slice(1), 16) }));
      }

      /* ---- 双孔橡胶塞（塞在瓶颈口内）：投固体时暂隐，避免穿模 ---- */
      O.stopper = [];
      O.stopper.push(K.cyl({ r: 2.15, h: 1.7, y0: 10.6, x: FX, z: FZ, mat: K.M().rubber }));
      O.stopper.push(K.cyl({ r: 2.4, h: .3, y0: 12.25, x: FX, z: FZ, mat: K.M().rubber }));
      O.stopper.push(K.cyl({ r: .34, h: .08, y0: 12.54, x: FUX, z: FZ, mat: O.holeMat }));
      O.stopper.push(K.cyl({ r: .30, h: .08, y0: 12.54, x: DTX, z: FZ, mat: O.holeMat }));

      /* ---- 长颈漏斗：细长玻璃管插到液面以下（液封）+ 顶部喇叭口 ---- */
      O.funnelStem = K.cyl({ r: .24, h: 10.85, y0: 2.3, x: FUX, z: FZ, mat: O.funnelMat });
      O.funnelBowl = K.cyl({ rt: 1.85, rb: .3, h: 1.9, y0: 12.6, x: FUX, z: FZ, mat: O.funnelMat });
      /* 口沿细环 + 两道竖向高光：浅色墙前靠轮廓定形，不靠把玻璃调白 */
      var frim = new T.Mesh(new T.TorusGeometry(1.85, .075, 8, 40),
        new T.MeshBasicMaterial({ color: 0x7fb6d8, transparent: true, opacity: .8 }));
      frim.rotation.x = Math.PI / 2;
      frim.position.set(FUX, 14.5, FZ);
      K.scene().add(frim);
      var fstemRim = new T.Mesh(new T.TorusGeometry(.24, .045, 8, 24),
        new T.MeshBasicMaterial({ color: 0x7fb6d8, transparent: true, opacity: .7 }));
      fstemRim.rotation.x = Math.PI / 2;
      fstemRim.position.set(FUX, 2.3, FZ);
      K.scene().add(fstemRim);
      /* 长管母线：玻璃管在浅墙 + 蓝液前对比太低，加一条细母线把
         「管口一直插到液面以下」这件事读出来（教学上的液封）。 */
      var stemLine = new T.Line(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(FUX + .17, 2.3, FZ + .12),
          new T.Vector3(FUX + .17, 13.1, FZ + .12)]),
        new T.LineBasicMaterial({ color: 0x6fa8c8, transparent: true, opacity: .65 }));
      K.scene().add(stemLine);

      /* ---- 导管：由塞孔连续走线，折向后插到集气瓶底 ---- */
      var duct = K.tube([[DTX, 12.25, 0], [DTX, 13.7, 0], [DTX + 1.0, 14.5, 0], [BX - 1.0, 14.5, 0],
        [BX, 13.7, 0], [BX, 12.4, 0], [BX, 10.9, 0], [BX, 6.0, 0], [BX, 1.7, 0]], .2);
      /* 塞子总成：真实操作是「先装固体，后塞塞子」，塞子、长颈漏斗、导气管
         本来就是一起装上的。投固体时整组收起，落定后一起出现，避免漏斗悬空。 */
      O.stopper.push(O.funnelStem, O.funnelBowl, frim, fstemRim, stemLine, duct);

      /* ---- 集气瓶（瓶口向上，向上排空气法）+ 可见壳 ---- */
      K.glassCyl({ r: BR, h: B1 - B0, x: BX, z: BZ, y0: B0 });
      var jshell = new T.Mesh(new T.CylinderGeometry(BR + .04, BR + .04, B1 - B0, 48, 1, true), shellMat(.14));
      jshell.position.set(BX, B0 + (B1 - B0) / 2, BZ);
      K.scene().add(jshell);
      /* 瓶内气体区：随 s.fill 从瓶底淡淡上涨 */
      O.gas = K.liquidCyl({ r: BR - .4, h: 10.4, x: BX, z: BZ, y0: B0 + .15, color: 0xdfeaf6, opacity: .13 });
      O.gasTop = K.liquidTop({ r: BR - .45, x: BX, z: BZ, y: B0 + .15, color: 0xeaf3fc });
      O.gasTop.material.opacity = 0;

      /* ---- 玻璃片：半盖在瓶口右侧的薄玻璃板 ---- */
      /* 玻璃片半盖瓶口右侧：左侧留出导管插入位，否则导管会直接穿过玻璃片 */
      O.plate = K.box({ x: BX + 2.6, y: B1 + .12, z: BZ, sx: 4.6, sy: .16, sz: 7.2, mat: O.plateMat });
      O.plate.rotation.z = .04;

      /* ---- 检验：澄清石灰水试管（s.test === 'lime' 时出现） ---- */
      O.limeVis = [];
      O.limeVis.push(K.cyl({ r: 1.42, h: 9.9, y0: .9, x: LX, z: LZ, mat: O.tubeMat }));
      var lrim = new T.Mesh(new T.TorusGeometry(1.42, .1, 10, 36), O.tubeMat);
      lrim.rotation.x = Math.PI / 2;
      lrim.position.set(LX, 10.8, LZ);
      K.scene().add(lrim);
      O.limeVis.push(lrim);
      O.limeLiq = K.liquidCyl({ r: 1.3, h: 5.0, x: LX, z: LZ, y0: 1.05, color: 0xbfe2ee, opacity: .85 });
      O.limeVis.push(O.limeLiq);
      /* 通石灰水的导管：一条单线走完——从瓶口内向下集气 → 升出瓶口 → 向右 →
         下弯 → 竖直插入试管。控制点单调、只折一次，CatmullRom 不会打结，
         也不会和主导管挤在瓶口上方。 */
      O.limeVis.push(K.tube([[BX + .9, 11.0, .9], [BX + 1.6, 13.0, 1.6], [BX + 3.6, 13.4, 2.6],
        [BX + 5.2, 12.4, 3.6], [LX - .25, 10.6, LZ], [LX - .25, 2.4, LZ]], .16));
      O.limeParts = [];
      var pp = [[-.4, 2.9], [.3, 3.7], [-.1, 4.5], [.36, 2.4]];
      for (i = 0; i < pp.length; i++) {
        O.limeParts.push(K.sphere({ x: LX + pp[i][0], y: pp[i][1], z: LZ, r: .17,
          mat: new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0 }) }));
      }
      O.limeVis = O.limeVis.concat(O.limeParts);
      for (i = 0; i < O.limeVis.length; i++) O.limeVis[i].visible = false;

      /* ---- 验满木条：平放在瓶口，燃着 → 熄灭冒青烟 ---- */
      O.splint = new T.Group();
      var a = new T.Vector3(BX - 5.8, 11.95, TIP[2]);
      var b2 = new T.Vector3(TIP[0], TIP[1], TIP[2]);
      var stick = new T.Mesh(new T.CylinderGeometry(.13, .13, 4.4, 10),
        new T.MeshStandardMaterial({ color: 0xb08050, roughness: .85 }));
      stick.position.copy(a).add(b2).multiplyScalar(.5);
      stick.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b2.clone().sub(a).normalize());
      O.splint.add(stick);
      var tipm = new T.Mesh(new T.SphereGeometry(.17, 10, 8), O.darkMat);
      tipm.position.set(TIP[0], TIP[1], TIP[2]);
      O.splint.add(tipm);
      K.scene().add(O.splint);
      O.splint.visible = false;
      O.sflame = K.flame({ x: TIP[0], y: TIP[1] + .3, z: TIP[2], s: 1.25, light: .5 });
      O.sflame.sp.material.blending = T.NormalBlending;   /* 浅背景下 Additive 不可见 */
      O.sflame.lit = false;

      /* 接触阴影 */
      K.blob({ x: FX, z: FZ, r: 6 });
      K.blob({ x: BX, z: BZ, r: 4 });
      K.blob({ x: LX, z: LZ, r: 1.8 });

      /* 标注 */
      K.label([FUX, 14.85, 0], '长颈漏斗', -34, -22);
      O.lblAcid = K.label([FX - 2.2, 2.6, 1.2], '稀盐酸', -26, 26);
      K.label([FX + 1.9, 1.1, .8], '大理石', 34, 28);
      K.label([BX + 2.4, 6.4, 0], '集气瓶', 32, -4);
      O.lblJar = O.lblJar || null;
      O.lblJar = K.label ? K.label([BX + 2.4, 6.4, 0], '集气瓶', 32, -4) : null;
      O.lblPlate = K.label([BX + 3.6, 11.8, 0], '玻璃片', 10, -38);
      O.lblLime = K.label([LX, 7.8, LZ], '石灰水变浑浊', -66, -10);

      /* 烟雾纹理 + sprite 池（灰蓝色：浅背景上读得出） */
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x2 = c.getContext('2d');
      var g2 = x2.createRadialGradient(32, 32, 2, 32, 32, 30);
      g2.addColorStop(0, 'rgba(255,255,255,.9)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      x2.fillStyle = g2; x2.fillRect(0, 0, 64, 64);
      O.smokeTex = new T.CanvasTexture(c);
      O.spool = [];
      for (i = 0; i < 32; i++) {
        var sp = new T.Sprite(new T.SpriteMaterial({ map: O.smokeTex, color: 0x8fa6c2, transparent: true, depthWrite: false }));
        sp.visible = false; K.scene().add(sp);
        O.spool.push({ m: sp, used: false });
      }
      /* 气泡球池 */
      O.bpool = [];
      for (i = 0; i < 48; i++) {
        var bm = new T.Mesh(new T.SphereGeometry(.3, 10, 8),
          new T.MeshStandardMaterial({ color: 0xffffff, roughness: .15, transparent: true, opacity: .9 }));
        bm.visible = false; K.scene().add(bm);
        O.bpool.push({ m: bm, used: false });
      }
    },

    update: function (dt, s) {
      var i, m;
      s.t += dt;

      /* ── 大理石动线：投固体 → 沉入液面下 → 随反应慢慢消融 ──
         消融量直接取自收集进度 s.fill（读数与现象同源，不做两套动画）。
         下落期间暂时收起双孔塞：真实操作本来就是「先装固体，后塞塞子」。 */
      if (s.dropT < 1) s.dropT = Math.min(1, s.dropT + dt * .55);
      var dropping = s.dropT < 1;
      for (i = 0; i < O.stopper.length; i++) O.stopper[i].visible = !dropping;
      var dis = K.clamp(s.fill * .72, 0, .72);   /* 大理石过量，反应后仍有剩余 */
      for (i = 0; i < O.marbles.length; i++) {
        var mb = O.marbles[i], tg = MARBLES[i];
        var lag = i * .055;
        var u = K.clamp((s.dropT - lag) / (1 - lag - .12), 0, 1);
        var ease = 1 - Math.pow(1 - u, 2);              /* 重力加速感 */
        var y0 = 16 + i * .5;
        /* 下落段收在瓶颈内（|x|≤1.1），出颈落到瓶底后才向四周散开，避免穿玻璃壁 */
        var xNeck = K.clamp(tg[0] * .35, -1.1, 1.1);
        mb.position.set(FX + xNeck + (tg[0] - xNeck) * Math.pow(ease, 3),
                        y0 + (tg[1] - y0) * ease, tg[2]);
        var sc = Math.max(.12, 1 - dis * (.75 + (i % 3) * .08));
        mb.scale.setScalar(sc);                        /* 慢慢消融、各块略有先后 */
        mb.visible = u > 0 || s.dropT >= 1;
      }

      /* ── 倒酸：液体沿长颈漏斗流入，瓶内液面从空升到反应位；倒满自动冒泡 ──
         「先固后液」的可见呈现：步骤 3 瓶是空的，投完大理石点按钮，酸才下来。
         液柱系用 scale.y + position.y 补偿，保证底部始终贴瓶底、液面线性升降。 */
      if (s.pourT > 0 && s.pourT < 1) s.pourT = Math.min(1, s.pourT + dt * .55);
      var liqY = .4 + (LIQ_Y - .4) * s.pourT;
      O.jarLiq.forEach(function (o) {
        o.visible = s.pourT > .003;
        var f = Math.max(.0001, s.pourT);
        o.scale.y = f;
        o.position.y = .5 * (1 - f);
      });
      var pouring = s.pourT > 0 && s.pourT < 1;
      O.pourStream.visible = pouring;
      O.funFill.visible = pouring;
      if (pouring) {
        var ph2 = Math.max(.3, 15.0 - liqY);
        O.pourStream.scale.y = ph2 / 2.2;
        O.pourStream.position.y = liqY + ph2 / 2;
      }
      if (s.pourT >= 1 && s.needReact) { s.react = true; s.needReact = false; }
      if (O.lblAcid) O.lblAcid.el.style.visibility = s.pourT > .15 ? 'visible' : 'hidden';

      /* 木条 / 石灰水状态切换时重置动画计时 */
      if (s.test !== s._pt) {
        s._pt = s.test;
        if (s.test === 'full') s.fullT = 0;
      }
      if (s.test === 'full') s.fullT += dt;
      if (s.test === 'lime') s.limeT = Math.min(4, s.limeT + dt);
      else s.limeT = Math.max(0, s.limeT - dt * 2);

      /* 反应冒泡：从大理石表面生成 */
      if (s.react) {
        s.fill = Math.min(1, s.fill + dt * .09);
        if (s.bubbles.length < 48 && Math.random() < dt * 26) {
          var mi = (Math.random() * MARBLES.length) | 0;
          m = MARBLES[mi];
          var msc = O.marbles[mi] ? O.marbles[mi].scale.x : 1;
          s.bubbles.push({
            x: FX + m[0] + K.rnd(-.5, .5), y: m[1] + m[3] * msc * .55, z: m[2] + K.rnd(-.5, .5),
            r: K.rnd(.14, .34), v: K.rnd(2.4, 4.2)
          });
        }
      }
      var b;
      for (i = s.bubbles.length - 1; i >= 0; i--) {
        b = s.bubbles[i];
        b.y += b.v * dt;
        b.x += Math.sin(s.t * 4 + b.y * 2.2) * dt * .4;
        if (b.y > LIQ_Y - .22) s.bubbles.splice(i, 1);
      }

      /* 验满木条熄灭后的青烟 */
      if (s.test === 'full' && s.fullT > .45 && s.fullT < 4.2 && Math.random() < dt * 16) {
        s.smoke.push({
          x: TIP[0] + K.rnd(-.08, .08), y: TIP[1] + .15, z: TIP[2] + K.rnd(-.08, .08),
          r: K.rnd(.11, .22), v: K.rnd(1.1, 1.8), a: 1, ph: K.rnd(0, 6.28)
        });
      }
      for (i = s.smoke.length - 1; i >= 0; i--) {
        var p = s.smoke[i];
        p.y += p.v * dt;
        p.x += Math.sin(s.t * 1.8 + p.ph) * dt * .45;
        p.r += dt * .32;
        p.a -= dt * .50;
        if (p.a <= 0) s.smoke.splice(i, 1);
      }

      /* ---- 3D 呈现（只由 state 驱动） ---- */
      /* 集气瓶内气体区上涨 */
      var gh = Math.max(.001, s.fill * (B1 - B0 - .7));
      O.gas.scale.y = gh / 10.4;
      O.gas.position.y = B0 + .15 + gh / 2;
      O.gasTop.position.y = B0 + .15 + gh;
      O.gasTop.material.opacity = Math.min(.4, s.fill * 2.5);

      /* 气泡 → 球池 */
      mapPool(O.bpool, s.bubbles, function (m2, b2) {
        m2.position.set(b2.x, b2.y, b2.z);
        m2.scale.setScalar(b2.r * 1.5 / .3);
      });

      /* 木条出现 + 火焰闷灭 */
      K.fadeShow(O.splint, s.test === 'full', dt, 5);
      K.fadeShow(O.plate, s.test !== 'lime', dt, 5);
      var fs = K.clamp(1 - s.fullT * 2.6, 0, 1);
      O.sflame.lit = (s.test === 'full' && fs > .03);
      O.sflame.base = Math.max(.02, 1.25 * fs);
      O.sflame.sp.position.y = TIP[1] + .3 + O.sflame.base * .9;

      /* 青烟 → sprite 池 */
      mapPool(O.spool, s.smoke, function (m2, p2) {
        m2.position.set(p2.x, p2.y, p2.z);
        var sc = 1.0 + p2.r * 4.2;
        m2.scale.set(sc, sc, 1);
        m2.material.opacity = Math.max(0, p2.a * .5);
      });

      /* 石灰水变浑浊 */
      var on = (s.test === 'lime'), cl = K.clamp(s.limeT / 2.5, 0, 1);
      for (i = 0; i < O.limeVis.length; i++) K.fadeShow(O.limeVis[i], on, dt, 5);
      if (on) {
        /* liquidCyl 的材质是 ShaderMaterial（无 .color）：浑浊变色走 uniforms。
           不做防御的话，第一次走到「检验」步骤就会崩（改编遗留 bug）。 */
        var lm3 = O.limeLiq.material;
        if (lm3.uniforms && lm3.uniforms.uShallow) {
          lm3.uniforms.uShallow.value.copy(mixC(0xbfe2ee, 0xf0f5f8, cl));
          lm3.uniforms.uDeep.value.copy(mixC(0x9fc6dd, 0xe4ecf1, cl));
        }
        if (lm3.uniforms && lm3.uniforms.uOpacity) lm3.uniforms.uOpacity.value = .82 + cl * .14;
      }
      for (i = 0; i < O.limeParts.length; i++) {
        O.limeParts[i].material.opacity = on ? cl * .7 : 0;
      }

      /* 标注切换 */
      O.lblLime.el.style.visibility = on ? 'visible' : 'hidden';
      O.lblPlate.el.style.visibility = on ? 'hidden' : 'visible';
    }
  };

  K.boot({
    title: '二氧化碳的实验室制取与性质',
    chip: '化学 · 鲁教版 · 八年级全一册 · 学生实验4',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 7.0, dist: 52, tx: 2.0, yaw: .5, pitch: .2 },

    reads: [['react', '反应状态'], ['fillv', '收集进度'], ['meth', '收集方法'], ['note', '现象']],
    values: function (s) {
      return {
        react: s.react ? '剧烈冒泡' : (s.fill >= 1 ? '反应已结束' : '未开始'),
        fillv: Math.round(s.fill * 100) + '%',
        meth: '向上排空气法',
        note: s.fill > .95 ? '已收集满' : (s.react ? '气泡不断产生' : '静止')
      };
    },

    steps: [
      {
        name: '为什么这样选药', title: '大理石 + 稀盐酸',
        ask: '实验室制二氧化碳，为什么偏用这两样？',
        body: '<p><b>现象层：</b>把大理石放进稀盐酸，固体表面<b>立刻产生大量气泡</b>，气泡持续、均匀地冒出，固体颗粒逐渐变小——这就是 3D 场景里看到的样子。</p>' +
          '<p><b>机制层：</b>大理石的主要成分是碳酸钙，它和盐酸一接触就「拆家」：碳酸根抢走酸里的氢变成二氧化碳气体跑出来，剩下的钙和氯结合成氯化钙留在水里。反应方程式：</p>' +
          '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:6px 0">CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑</p>' +
          '<p><b>易错层：</b>这三种药为什么不行？</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px">' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">不用稀硫酸</td><td style="color:#c8d4e6">生成的硫酸钙<b>微溶</b>，会盖在大理石表面把酸隔开，反应很快自行停止</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">不用碳酸钠粉末</td><td style="color:#c8d4e6">粉末与酸接触面积太大，反应<b>太剧烈</b>，气体一下全冲出来，来不及收集</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">不用浓盐酸</td><td style="color:#c8d4e6">浓盐酸易<b>挥发</b>，HCl 气体混进 CO₂，收集到的不纯</td></tr>' +
          '</table>' +
          '<p><b>考点层：</b>中考最常考的就是这道「药品选择理由题」，答题模板记三句话——硫酸钙微溶盖住表面、碳酸钠太快、浓盐酸挥发不纯。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 0; s.test = ''; s.bubbles = []; }
      },
      {
        name: '认识装置', title: '固体 + 液体，不加热',
        ask: '这套装置和制氧气的那套，差在哪儿？',
        body: '<p><b>现象层：</b>看这套装置的结构——锥形瓶里装块状固体，长颈漏斗从瓶口插下来，导管通向集气瓶，全程<b>没有酒精灯</b>。这叫「固液常温型」装置。</p>' +
          '<p><b>机制层：</b>反应本身放热又不需要点火，常温下就能顺利进行，所以不用加热。生活类比：就像往小苏打里倒醋，倒进去就冒泡，没人会拿去加热。</p>' +
          '<p><b>易错层：</b>长颈漏斗的下端管口必须<b>伸到液面以下</b>，形成「液封」。为什么？锥形瓶里一旦产生气体，会四处找出口——如果漏斗下端露在液面上方，气体就顺着漏斗颈从漏斗口跑掉了，收集不到。可以想象成防洪：必须把堤坝（液柱）修到位，气体的「洪水」才不会从这条通道流走。</p>' +
          '<p><b>考点层：</b>对比记忆——用高锰酸钾制氧气是「固体加热型」，要酒精灯；用过氧化氢和二氧化锰制氧气也是「固液常温型」，和这套一模一样。中考爱考：给一套装置图，问它还能用来制什么气体。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 0; s.test = ''; s.bubbles = []; }
      },
      {
        name: '加药品', title: '先固体，后液体',
        ask: '为什么不能先倒酸？',
        body: '<p><b>现象层：</b>正确顺序是先把大理石放进锥形瓶，再从长颈漏斗倒入稀盐酸。进入本步先观察：大理石从瓶口<b>逐颗落入瓶底、沉到液面以下</b>；再点下方按钮加酸，固体表面立刻冒泡，并随着反应<b>慢慢变小</b>。</p>' +
          '<p><b>机制层：</b>如果反过来先倒酸，有两个问题：一是放固体时固体砸进酸里，会<b>溅起酸液</b>，腐蚀皮肤和桌面；二是酸一倒进去，反应立刻开始，这时你还在忙着手忙脚乱塞塞子、接导管，产生的气体全白白跑掉了。</p>' +
          '<p><b>易错层：</b>还有一个更靠前的顺序容易漏：装药品<b>之前</b>要先<b>检查装置的气密性</b>。顺序口诀——查、装、定、注（查气密性→装药品→固定装置→注入液体）。顺序题每年必考，漏掉「查气密性」是高频丢分点。</p>',
        apply: function (s) { s.dropT = 0; s.pourT = 0; s.needReact = false; s.react = false; s.fill = 0; s.test = ''; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '从长颈漏斗倒入稀盐酸', onClick: function (s) { if (s.dropT < 1) return; s.needReact = true; if (s.pourT < 1) s.pourT = .0001; } },
          { type: 'btn', label: '暂停（夹住导管）', onClick: function (s) { s.react = false; } }
        ]
      },
      {
        name: '向上排空气法', title: '为什么瓶口要朝上',
        ask: '二氧化碳比空气重还是轻？',
        body: '<p><b>现象层：</b>看场景里的集气瓶——瓶口<b>朝上</b>正放，导管一直伸到<b>瓶底</b>。气体从底部慢慢积起来，像水从杯底往上漫，把空气从瓶口顶出去。</p>' +
          '<p><b>机制层：</b>二氧化碳的相对分子质量是 44，而空气平均约为 29——所以它的密度比空气<b>大</b>（约是空气的 1.5 倍）。重的气体沉在下面，这种收集方法就叫「向上排空气法」。如果导管只放在瓶口，新进的气体和空气一混合，很难收满、收纯。</p>' +
          '<p><b>易错层：</b>「向上」指的是<b>瓶口向上</b>、气体沉底往上排，别记反。为什么不能用排水法？因为二氧化碳<b>能溶于水</b>（1 体积水约溶解 1 体积 CO₂），排水法会把一部分气体「吃」掉，收集量偏少。</p>' +
          '<p><b>考点层：</b>中考答题理由要写全两条：①密度比空气大→向上排空气法；②能溶于水→不能用排水法。只写一条通常要扣分。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = true; s.fill = .25; s.test = ''; s.bubbles = []; }
      },
      {
        name: '验满', title: '怎么知道收满了',
        ask: '木条放在瓶口还是伸进去？',
        body: '<p><b>现象层：</b>把一根<b>燃着的木条</b>平放在<b>集气瓶口</b>，火焰<b>立即熄灭</b>——说明二氧化碳已经充满整瓶，多余的正从瓶口往外冒。点击按钮试试。</p>' +
          '<p><b>机制层：</b>二氧化碳不燃烧、也不支持燃烧。瓶满时瓶口逸出的就是纯 CO₂，火焰一碰就被「闷灭」。这和地窖灯火试验是一个道理：灯火灭了的菜窖说明二氧化碳太多，人下去会缺氧。</p>' +
          '<p><b>易错层：</b>位置错一步，答案就错：验满时木条只能<b>放在瓶口</b>。伸进瓶里才灭，只能证明「瓶里有二氧化碳」，不能证明「满了」。还有，验满用的是<b>燃着</b>的木条，不是带火星的——带火星木条复燃是用来<b>检验氧气</b>的，两套记混是经典错误。</p>' +
          '<p><b>考点层：</b>中考常把「验满」和「检验」放在一张卷子上让你辨析：验满→燃着木条放瓶口；检验→通入澄清石灰水。关键词「瓶口」「石灰水」必须出现在答案里。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 1; s.test = 'full'; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '把燃着的木条放到瓶口', onClick: function (s) { s.test = 'full'; } },
          { type: 'btn', label: '收起木条', onClick: function (s) { s.test = ''; } }
        ]
      },
      {
        name: '检验', title: '通进澄清石灰水',
        ask: '什么样的现象才能证明是二氧化碳？',
        body: '<p><b>现象层：</b>把气体通入澄清石灰水，原本透明的液体逐渐出现<b>白色浑浊</b>——像往清水里滴了几滴牛奶。点击按钮看现象。</p>' +
          '<p><b>机制层：</b>二氧化碳和石灰水里的氢氧化钙反应，生成<b>难溶于水</b>的碳酸钙，那些悬浮的白色小颗粒就是浑浊的来源：</p>' +
          '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:6px 0">Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O</p>' +
          '<p><b>易错层：</b>描述现象要说「澄清石灰水<b>变浑浊</b>」，说成「变白」「生成白烟」都不规范——浑浊的本质是<b>白色沉淀碳酸钙</b>悬浮在液体里。另外注意：验满用燃着木条，检验必须用石灰水，用木条检验不了二氧化碳（氮气也能灭火）。</p>' +
          '<p><b>考点层：</b>「能使澄清石灰水变浑浊」是二氧化碳的专属身份证，中考写检验方法时必须带上这句现象描述，方程式和现象各占一半分。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 1; s.test = 'lime'; s.bubbles = []; },
        /* 本步要看「集气瓶 → 导管 → 石灰水试管」整条线；默认机位会把试管
           挡在右侧面板后。步骤机位由引擎 flyTo 插值，字段必须是 tx/ty/tz/dist
           （缺 tz 会让目标点变 NaN、相机飞空），yaw/pitch 沿用开课机位。 */
        cam: { tx: 9, ty: 6.5, tz: 0, dist: 40, yaw: .45, pitch: .16 },
        controls: [
          { type: 'btn', label: '通入澄清石灰水', onClick: function (s) { s.test = 'lime'; } }
        ]
      },
      {
        name: '对比', title: '制氧气 vs 制二氧化碳',
        ask: '两套装置最大的区别是什么？',
        body: '<p><b>现象层：</b>把两种气体制取的要点并排放在一起看，先扫一遍表格：</p>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">反应物状态</td><td style="color:#c8d4e6">固+固加热 / 固+液常温</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">是否加热</td><td style="color:#c8d4e6">需要 / 不需要</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">收集方法</td><td style="color:#c8d4e6">排水法或向上排空气 / 只能向上排空气</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">验满</td><td style="color:#c8d4e6">带火星木条 / 燃着木条</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">检验</td><td style="color:#c8d4e6">带火星木条复燃 / 石灰水变浑浊</td></tr>' +
          '</table>' +
          '<p><b>机制层：</b>装置怎么选，归根到底由两个问题决定：反应物是什么状态？要不要加热？高锰酸钾是固体且必须加热分解，所以要「固固加热型」；大理石加稀盐酸常温就能反应，就选「固液常温型」。收集方法则看气体的密度和溶水性。</p>' +
          '<p><b>易错层：</b>共同点别漏：两套装置用之前都要<b>检查气密性</b>；用排空气法收集时，导管都要伸到<b>集气瓶底</b>，否则收集不满。验满的木条也最容易被张冠李戴。</p>' +
          '<p><b>考点层：</b>中考实验题几乎每年都把这两套装置放在一起考「选择装置并说理由」，表格里的五行就是五个得分点，建议整表背下来。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 1; s.test = ''; s.bubbles = []; }
      },
      {
        name: '考核', title: '当一回实验员',
        ask: '下面每题都考制取和检验。',
        quiz: true,
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 1; s.test = ''; s.bubbles = []; }
      },
      {
        name: '性质·检验',
        cam: { tx: 9, ty: 6.5, tz: 0, dist: 40, yaw: .45, pitch: .16 },
        title: '通入澄清石灰水，变浑浊就是 CO₂',
        ask: '怎样检验一瓶气体是二氧化碳？',
        body: '<p><b>检验：</b>把气体通入<b>澄清石灰水</b>，石灰水变<b>浑浊</b>，说明是 CO₂。</p>' +
          '<p><b>原理：</b>CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O，白色沉淀使石灰水变浑浊。</p>' +
          '<p>这是 CO₂ 最特征的检验方法。</p>',
        /* 这步标题就是「通入澄清石灰水」，装置必须真的出现，否则画面只有两只空瓶。
           机位偏向集气瓶与试管一侧，让整条导气管都在画内。 */
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; s.react = false; s.fill = 1; s.test = 'lime'; s.bubbles = []; }
      },
      {
        name: '性质·密度与灭火',
        cam: { tx: 2, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '密度比空气大：阶梯蜡烛下层先灭',
        ask: '把 CO₂ 沿烧杯内壁倒入阶梯蜡烛，哪支先灭？',
        body: '<p><b>现象：</b>下层蜡烛<b>先熄灭</b>，上层后灭。</p>' +
          '<p><b>原因：</b>CO₂ <b>密度比空气大</b>，先沉到烧杯底部；CO₂ <b>不燃烧也不支持燃烧</b>，所以低的先灭。</p>' +
          '<p><b>用途：</b>正是这两条性质，让 CO₂ 能用来<b>灭火</b>。</p>',
        apply: function (s) { s.dropT = 1; s.pourT = 1; s.needReact = false; }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '【现象辨认】大理石与稀盐酸反应时，你能观察到的现象是：',
          opts: ['固体表面产生大量气泡，固体逐渐减小', '产生白色沉淀', '放出大量白烟', '液体变成红色'],
          ans: '固体表面产生大量气泡，固体逐渐减小',
          why: '生成的 CO₂ 以气泡形式从固体表面逸出，大理石被消耗所以逐渐减小。白烟是固体小颗粒，这里没有；变红是石蕊遇酸的现象，此处用不到。'
        },
        {
          q: '【原理理解】长颈漏斗的下端管口必须伸到液面以下，目的是：',
          opts: ['防止生成的气体从漏斗口逸出', '防止液体溅出', '加快反应速率', '增大二氧化碳的溶解度'],
          ans: '防止生成的气体从漏斗口逸出',
          why: '下端被液体封住（液封）后，气体只能走导管进入集气瓶；若管口在液面上方，气体会顺着漏斗颈「抄近路」跑掉，收不到气体。'
        },
        {
          q: '【装置选择】实验室制二氧化碳不用稀硫酸，理由是：',
          opts: ['生成的硫酸钙微溶于水，覆盖在大理石表面使反应很快停止', '稀硫酸不能与碳酸钙反应', '反应太剧烈，不便于收集', '硫酸易挥发，使气体不纯'],
          ans: '生成的硫酸钙微溶于水，覆盖在大理石表面使反应很快停止',
          why: '硫酸钙微溶，会包住大理石把酸和碳酸钙隔开，反应「半途而废」。注意「易挥发使气体不纯」说的是浓盐酸，别张冠李戴。'
        },
        {
          q: '【验满与检验】检验集气瓶里的气体是否为二氧化碳，正确的方法是：',
          opts: ['通入澄清石灰水，观察是否变浑浊', '把燃着的木条放在瓶口', '把带火星的木条伸入瓶中', '倒入紫色石蕊试液'],
          ans: '通入澄清石灰水，观察是否变浑浊',
          why: '检验用石灰水变浑浊这个专属现象；燃着木条放瓶口是「验满」，且能使火焰熄灭的气体不止二氧化碳（如氮气），无法确认。'
        },
        {
          q: '【拓展迁移】装澄清石灰水的试剂瓶敞口放置几天后，液面出现一层白色薄膜，原因是：',
          opts: ['石灰水与空气中的二氧化碳反应生成了碳酸钙', '氢氧化钙蒸发了', '石灰水与水反应生成了新物质', '空气中的氧气把石灰水氧化了'],
          ans: '石灰水与空气中的二氧化碳反应生成了碳酸钙',
          why: '空气中的 CO₂ 溶入石灰水，发生 Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O，难溶的碳酸钙附着在瓶壁形成白膜——这正是石灰水检验 CO₂ 的日常版本。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
