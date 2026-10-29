/* 格物实验室 · 配制一定溶质质量分数的溶液（three.js 版）
   鲁教版 九年级上册 · 第三单元 溶液 · 溶液组成的定量表示 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    mT: 100,        /* 目标溶液质量 g */
    wT: 6,          /* 目标质量分数 % */
    mass: 0,        /* 实际称取的 NaCl 质量 g */
    vol: 0,         /* 实际量取的水体积 mL */
    poured: 0,      /* 是否已倒入烧杯 0/1 */
    dissolved: 0,   /* 溶解进度 0..1 */
    stir: 0,        /* 搅拌强度 0..1 */
    bottled: 0,     /* 是否已装瓶 */
    judged: false,
    t: 0
  };

  var O = {};

  /* ── 模型：全部读数由此计算 ── */
  function needMass(s) { return s.mT * s.wT / 100; }              /* m(NaCl) = m(溶液)×w */
  function needVol(s) { return s.mT - needMass(s); }              /* V(水) = m(溶液) − m(NaCl)，ρ水=1 */
  function actualW(s) {
    var m = s.massT !== undefined ? s.massT : s.mass;
    var v = s.volT !== undefined ? s.volT : s.vol;
    var tot = m + v * 1.0;                                        /* 溶液质量 = 溶质 + 水 */
    return tot > 0 ? m / tot * 100 : 0;
  }

  var scene = {
    setup: function () {
      var i;

      var MAT = {
        glass: new T.MeshPhysicalMaterial({
          color: 0xf2f8fc, metalness: 0, roughness: .05,
          transparent: true, opacity: .3, side: T.DoubleSide,
          depthWrite: false, clearcoat: .7, clearcoatRoughness: .08,
          envMapIntensity: 1.8, specularIntensity: 1.2
        }),
        steel: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .32, metalness: .9, envMapIntensity: 1.25 }),
        body: new T.MeshPhysicalMaterial({ color: 0xe7ecf2, roughness: .42, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 }),
        dark: new T.MeshStandardMaterial({ color: 0x27303a, roughness: .48, metalness: .35 }),
        rubber: new T.MeshStandardMaterial({ color: 0x8f3a3a, roughness: .75, metalness: .02 }),
        paper: new T.MeshStandardMaterial({ color: 0xf4f6f8, roughness: .92 }),
        salt: new T.MeshStandardMaterial({ color: 0xfbfdff, roughness: .55, metalness: .02 })
      };
      O.MAT = MAT;

      K.bench(48, 30);

      /* ═══ 电子天平 ═══ */
      var BALX = -14.5, BALZ = -1;
      K.box({ x: BALX, y: .55, z: BALZ, sx: 7.4, sy: 1.1, sz: 6.2, mat: MAT.body });
      K.box({ x: BALX, y: 1.6, z: BALZ - 2.2, sx: 6.6, sy: .5, sz: 1.2, mat: MAT.dark });
      /* 显示屏（CanvasTexture，实时显示克数） */
      var dcv = document.createElement('canvas');
      dcv.width = 256; dcv.height = 96;
      O.dctx = dcv.getContext('2d');
      O.dtex = new T.CanvasTexture(dcv);
      var scr = new T.Mesh(new T.PlaneGeometry(4.4, 1.65),
        new T.MeshBasicMaterial({ map: O.dtex }));
      scr.position.set(BALX, 1.62, BALZ + .61);
      K.scene().add(scr);
      /* 称盘 */
      K.cyl({ x: BALX, z: BALZ, y0: 2.2, r: 3.1, h: .35, mat: MAT.steel });
      /* 称量纸 */
      K.box({ x: BALX, y: 2.5, z: BALZ, sx: 3.4, sy: .05, sz: 3.4, mat: MAT.paper });

      /* 药匙上的 NaCl 堆：小晶体群，数量随称取量增加 */
      O.saltPile = new T.Group();
      O.saltBits = [];
      var geo = new T.SphereGeometry(.16, 8, 6);
      for (i = 0; i < 60; i++) {
        var bit = new T.Mesh(geo, MAT.salt);
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 1.25;
        bit.position.set(BALX + Math.cos(a) * rr, 2.56 + Math.random() * .18,
          BALZ + Math.sin(a) * rr);
        bit.visible = false;
        O.saltPile.add(bit);
        O.saltBits.push({ m: bit, seq: Math.random() });
      }
      K.scene().add(O.saltPile);

      /* ═══ 量筒（100 mL）═══ */
      var CX = -2.6, CR = 2.0;
      O.cylGroup = new T.Group();
      /* 玻璃筒身走引擎件：自动带口沿/底沿/母线 + 轮廓光晕 */
      var cylBody = K.glassCyl({ r: CR, h: 11.5, x: 0, z: 0, y0: .7, noHalo: true });
      O.cylGroup.add(cylBody);
      var foot = new T.Mesh(new T.CylinderGeometry(CR * 1.45, CR * 1.7, .7, 32), MAT.glass);
      foot.position.y = .35;
      O.cylGroup.add(foot);
      /* 刻度条：贴着筒身正面，背景透明只有刻线 */
      var gcv = document.createElement('canvas');
      gcv.width = 128; gcv.height = 1024;
      var gx = gcv.getContext('2d');
      gx.clearRect(0, 0, 128, 1024);
      var PAD = 8;
      for (i = 0; i <= 100; i += 2) {
        var yy = (1024 - PAD) - (i / 100) * (1024 - PAD * 2);
        var maj = i % 10 === 0;
        gx.strokeStyle = 'rgba(52,86,120,' + (maj ? '.95' : '.5') + ')';
        gx.lineWidth = maj ? 3 : 1.6;
        gx.beginPath();
        gx.moveTo(128 - PAD, yy);
        gx.lineTo(128 - PAD - (maj ? 46 : 24), yy);
        gx.stroke();
        if (maj) {
          gx.fillStyle = 'rgba(40,68,96,.95)';
          gx.font = '600 19px ui-monospace,Consolas,monospace';
          gx.textAlign = 'right';
          gx.fillText(String(i), 128 - PAD - 52, yy + 6);
        }
      }
      var gtex = new T.CanvasTexture(gcv);
      var scalePlane = new T.Mesh(new T.PlaneGeometry(CR * 1.9, 10.9),
        new T.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, alphaTest: .15 }));
      scalePlane.position.set(0, 6.75, CR * .96);
      scalePlane.renderOrder = 5;
      O.cylGroup.add(scalePlane);
      O.cylGroup.position.set(CX, 0, 2);
      K.scene().add(O.cylGroup);

      /* 量筒里的水 */
      O.water = K.liquidCyl({ r: CR - .2, h: 1, x: CX, z: 2, y0: .75, color: 0x8fc4e4, opacity: .5 });
      O.waterTop = K.liquidTop({ r: CR - .2, x: CX, z: 2, y: .8, color: 0x9fd0ea });
      /* 凹液面亮环：真实液面在筒壁处会上翘一圈高光 */
      var menPts = [], mi;
      for (mi = 0; mi < 48; mi++) {
        var ma = mi / 48 * Math.PI * 2;
        menPts.push(new T.Vector3(Math.cos(ma) * (CR - .12), 0, Math.sin(ma) * (CR - .12)));
      }
      O.meniscus = new T.LineLoop(new T.BufferGeometry().setFromPoints(menPts),
        new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
      O.meniscus.position.set(CX, .8, 2);
      K.scene().add(O.meniscus);

      /* 胶头滴管（吸取/滴加） */
      O.dropper = new T.Group();
      var dMat = new T.MeshPhysicalMaterial({
        color: 0xf2f8fc, roughness: .18, metalness: 0, ior: 1,
        transparent: true, opacity: .55, side: T.DoubleSide,
        depthWrite: false, envMapIntensity: 1.5
      });
      var dbody = new T.Mesh(new T.CylinderGeometry(.2, .12, 4.2, 16), dMat);
      dbody.position.y = 2.1;
      dbody.renderOrder = 8;
      O.dropper.add(dbody);
      [-1, 1].forEach(function (sgn) {
        var vp = [new T.Vector3(sgn * .2, 0, 0), new T.Vector3(sgn * .12, 4.2, 0)];
        O.dropper.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(vp),
          new T.LineBasicMaterial({ color: 0x6b8ca8, transparent: true, opacity: .7 })));
      });
      var bulb = new T.Mesh(new T.SphereGeometry(.5, 16, 12), MAT.rubber);
      bulb.position.y = 4.42;
      bulb.scale.set(1, 1.25, 1);
      O.dropper.add(bulb);
      /* 管内吸的少量水（让玻璃管有内容可读） */
      var dliq = new T.Mesh(new T.CylinderGeometry(.13, .1, 2.2, 12),
        new T.MeshBasicMaterial({ color: 0xa9d2ea, transparent: true, opacity: .8 }));
      dliq.position.y = 1.25;
      O.dropper.add(dliq);
      var collar = new T.Mesh(new T.TorusGeometry(.19, .035, 8, 18), MAT.steel);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 4.12;
      O.dropper.add(collar);
      O.dropper.position.set(CX + .15, 13.2, 2);
      O.dropper.rotation.z = -.1;
      K.scene().add(O.dropper);

      /* ═══ 烧杯（溶解） ═══ */
      var BX = 8.4, BR = 4.0;
      O.beaker = K.beaker({ r: BR, h: 8.4, x: BX, z: 0 });
      O.sol = K.liquidCyl({ r: BR - .3, h: 1, x: BX, z: 0, y0: .3, color: 0xdcecf6, opacity: .55 });
      O.solTop = K.liquidTop({ r: BR - .3, x: BX, z: 0, y: .35, color: 0xe8f4fb });
      O.br = BR; O.bx = BX;

      /* 烧杯里未溶解的盐粒 */
      O.bitsIn = [];
      var bgeo = new T.SphereGeometry(.15, 8, 6);
      for (i = 0; i < 40; i++) {
        var bb = new T.Mesh(bgeo, MAT.salt);
        bb.visible = false;
        O.bitsIn.push(bb);
        K.scene().add(bb);
      }

      /* 玻璃棒 */
      O.rod = new T.Mesh(new T.CylinderGeometry(.17, .17, 14, 12),
        new T.MeshPhysicalMaterial({
          color: 0xdff0fa, roughness: .16, metalness: 0, ior: 1,
          transparent: true, opacity: .62, side: T.DoubleSide,
          depthWrite: false, envMapIntensity: 1.5
        }));
      var rodCore = new T.Mesh(new T.CylinderGeometry(.055, .055, 13.6, 10),
        new T.MeshBasicMaterial({ color: 0x9fc4dd, transparent: true, opacity: .75 }));
      O.rod.add(rodCore);
      O.rod.position.set(BX, 10, 0);
      K.scene().add(O.rod);

      /* ═══ 试剂瓶（装瓶贴签） ═══ */
      var PX = 13.6, PR = 2.1;
      O.bottle = new T.Group();
      var bw = K.glassCyl({ r: PR, h: 7.2, x: 0, z: 0, y0: .5 });
      O.bottle.add(bw);
      var bc = new T.Mesh(new T.CylinderGeometry(PR * .8, PR * .8, 1.1, 24), MAT.dark);
      bc.position.y = 8.2;
      O.bottle.add(bc);
      O.bottle.position.set(PX, 0, 0);
      O.bottle.visible = false;
      K.scene().add(O.bottle);
      /* 瓶内配好的溶液 */
      O.bottleLiq = K.liquidCyl({ r: PR - .2, h: 4.8, x: PX, z: 0, y0: .9, color: 0xdcecf6, opacity: .6 });
      O.bottleLiq.visible = false;

      /* 标签 */
      var lcv = document.createElement('canvas');
      lcv.width = 256; lcv.height = 160;
      var lx = lcv.getContext('2d');
      lx.fillStyle = '#fbfdff'; lx.fillRect(0, 0, 256, 160);
      lx.strokeStyle = 'rgba(47,125,209,.5)'; lx.lineWidth = 4;
      lx.strokeRect(6, 6, 244, 148);
      lx.fillStyle = '#1d2a38';
      lx.font = '600 44px -apple-system,"PingFang SC",sans-serif';
      lx.textAlign = 'center';
      lx.fillText('NaCl 溶液', 128, 66);
      lx.font = '600 52px ui-monospace,Consolas,monospace';
      lx.fillStyle = '#2f6ea8';
      lx.fillText('6%', 128, 126);
      var ltex = new T.CanvasTexture(lcv);
      O.label = new T.Mesh(new T.PlaneGeometry(2.8, 1.75),
        new T.MeshBasicMaterial({ map: ltex, transparent: true }));
      O.label.position.set(PX, 4.4, PR + .04);
      O.label.visible = false;
      K.scene().add(O.label);

      /* 接触阴影 */
      K.blob({ x: BALX, z: BALZ, r: 4.2 });
      K.blob({ x: CX, z: 2, r: 3.4 });
      K.blob({ x: BX, z: 0, r: 5.2 });
      K.blob({ x: PX, z: 0, r: 3.0 });

      /* 标注 */
      K.spriteLabel([BALX, 4.4, BALZ], '电子天平', { w: 4.6, fs: 40 });
      K.spriteLabel([CX, 17.4, 2], '量筒 100 mL', { w: 5.2, fs: 40 });
      K.spriteLabel([BX, 11.4, 0], '烧杯 · 溶解', { w: 5.0, fs: 40 });
      K.spriteLabel([PX, 10.6, 0], '试剂瓶', { w: 4.0, fs: 38 });

      O.ready = true;
    },

    update: function (dt, s) {
      var i;
      s.t += dt;

      /* 天平显示：称量值（保留 1 位小数） */
      var mShow = Math.max(0, s.mass);
      if (O.dctx) {
        var c = O.dctx;
        c.fillStyle = '#0d1a14';
        c.fillRect(0, 0, 256, 96);
        c.fillStyle = '#7ef0b8';
        c.font = '600 54px ui-monospace,Consolas,monospace';
        c.textAlign = 'right';
        c.fillText(mShow.toFixed(1), 196, 68);
        c.font = '600 30px ui-monospace,Consolas,monospace';
        c.fillText('g', 234, 68);
        O.dtex.needsUpdate = true;
      }

      /* 称量盘上的盐堆：按质量显示晶粒数量 */
      var nShow = Math.round(Math.min(1, s.mass / Math.max(.001, needMass(s))) * 56);
      for (i = 0; i < O.saltBits.length; i++) {
        O.saltBits[i].m.visible = i < nShow;
      }

      /* 量筒水位：100 mL 对应 15.2 单位 */
      var hAll = 11.0;
      var wh = Math.max(.001, s.vol / 100 * hAll);
      K.setLiquidLevel(O.water, wh, .75);
      O.water.position.y = .75 + wh / 2;
      O.waterTop.position.y = .75 + wh;
      O.meniscus.position.y = .76 + wh;

      /* 滴管：接近目标体积时俯身滴加 */
      var near = Math.abs(s.vol - needVol(s)) < 6 && s.vol > 0;
      O.dropper.position.y = near ? 12.6 : 13.2;
      O.dropper.rotation.z = near ? -.32 : -.1;

      /* 倒入烧杯 → 液面上升 + 盐粒转移 */
      if (s.poured > .01) {
        var sh = Math.max(.001, (s.mass + s.vol) / Math.max(1, s.mT) * 7.2);
        K.setLiquidLevel(O.sol, sh, .3);
        O.sol.position.y = .3 + sh / 2;
        O.solTop.position.y = .3 + sh;
      } else {
        K.setLiquidLevel(O.sol, .001, .3);
        O.solTop.position.y = .3;
      }

      /* 盐粒：未倒入前不在烧杯里；倒入后按未溶解量显示 */
      var undiss = Math.max(0, 1 - s.dissolved);
      var inN = s.poured > .5 ? Math.round(undiss * 26) : 0;
      for (i = 0; i < O.bitsIn.length; i++) {
        var b = O.bitsIn[i];
        if (i < inN) {
          b.visible = true;
          var ang = i * 2.4 + s.t * (s.stir > .1 ? 2.2 : .3);
          var rr = .6 + (i % 5) * .55;
          b.position.set(O.bx + Math.cos(ang) * rr, .45 + (i % 3) * .18, Math.sin(ang) * rr);
        } else {
          b.visible = false;
        }
      }

      /* 玻璃棒：搅拌时绕杯心转动 */
      if (s.stir > .05 && s.poured > .5) {
        var ra = s.t * 3.4;
        O.rod.position.set(O.bx + Math.cos(ra) * 1.9, 9.6, Math.sin(ra) * 1.9);
        O.rod.rotation.z = -.22;
        O.rod.visible = true;
      } else if (s.poured > .5) {
        O.rod.position.set(O.bx + 2.0, 9.4, .4);
        O.rod.rotation.z = -.1;
        O.rod.visible = true;
      } else {
        O.rod.visible = false;
      }

      /* 溶液颜色：NaCl 溶液近无色，淡淡的盐雾感 */
      K.setLiquidColor(O.sol, 0xdcecf6, .8);
      K.setLiquidColor(O.bottleLiq, 0xdcecf6, .8);

      /* 装瓶 */
      K.fadeShow(O.bottle, s.bottled > .5, dt, 4);
      K.fadeShow(O.label, s.bottled > .5, dt, 4);
      O.bottleLiq.visible = s.bottled > .5;

      /* 读数不做逐帧写入，由面板 values 计算 */
      O.lastMass = s.mass;
    }
  };

  K.boot({
    title: '配制一定溶质质量分数的溶液',
    chip: '化学 · 九上 · 第三单元 溶液 · 溶液组成的定量表示（鲁教版）',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { ty: 7.2, dist: 64, tx: 1.0, yaw: .38, pitch: .17 },

    reads: [
      ['c', '目标质量分数'],
      ['need', '需称 NaCl'],
      ['got', '已称取'],
      ['vol', '已量水'],
      ['actual', '实际质量分数'],
      ['score', '操作评分']
    ],

    values: function (s) {
      var aw = actualW(s);
      var dev = aw - s.wT;
      var done = s.dissolved > .95 && s.poured > .5;
      var sc = s.judged ? Math.max(0, Math.round(100 - Math.abs(dev) * 200)) : null;
      return {
        c: s.wT.toFixed(1) + ' %',
        need: needMass(s).toFixed(1) + ' g',
        got: (s.massT !== undefined ? s.massT : s.mass).toFixed(1) + ' g',
        vol: (s.volT !== undefined ? s.volT : s.vol).toFixed(1) + ' mL',
        actual: done ? aw.toFixed(2) + ' %' : '—',
        score: sc === null ? '—' : (sc >= 90 ? '优秀 ' + sc : sc >= 75 ? '良好 ' + sc : '需改进 ' + sc)
      };
    },

    steps: [
      {
        name: '先算一算',
        title: '配 100 g 6% 的 NaCl 溶液，各要多少？',
        ask: '要称多少克氯化钠？要量多少毫升水？',
        body: '<p><b>溶质质量分数：</b>溶质质量 ÷ 溶液质量 × 100%。反过来，' +
          '<code>m(溶质) = m(溶液) × 质量分数</code>。</p>' +
          '<p>配 <b>100 g 6%</b> 的 NaCl 溶液：</p>' +
          '<p>m(NaCl) = 100 g × 6% = <b>6.0 g</b><br>' +
          'm(水) = 100 g − 6.0 g = 94.0 g，水的密度按 1.0 g/mL 算 → V(水) = <b>94.0 mL</b></p>' +
          '<p><b>注意：</b>这里用「水的质量 ÷ 密度」得体积，所以量筒量的是<b>水</b>，不是溶液。</p>' +
          '<p>你可以拖动下面的滑块换一个目标，读数会实时重算。</p>',
        apply: function (s) { s.mass = 0; s.vol = 0; s.poured = 0; s.dissolved = 0; s.stir = 0; s.bottled = 0; s.judged = false; },
        controls: [
          { type: 'range', key: 'wT', min: 2, max: 15, step: 1, label: '目标质量分数（%）' },
          { type: 'range', key: 'mT', min: 50, max: 150, step: 10, label: '目标溶液质量（g）' }
        ]
      },
      {
        name: '称溶质',
        title: '用电子天平称 6.0 g 氯化钠',
        ask: '为什么先称溶质，而不是先量水？',
        body: '<p><b>操作：</b>天平放平、调零，称量纸上放氯化钠，读数到 <b>6.0 g</b>。</p>' +
          '<p><b>为什么先称固体：</b>固体可以少量多次地加减，容易调到目标值；' +
          '水一旦量多了，只能倒掉重来。顺序错了就要返工。</p>' +
          '<p><b>易错：</b>腐蚀性药品（如氢氧化钠）不能直接放纸上，要放在玻璃器皿里称。</p>',
        apply: function (s) { s.mass = needMass(s); },
        controls: [
          { type: 'btn', label: '继续（下一步：量水）', onClick: function () {} }
        ]
      },
      {
        name: '量水',
        title: '用量筒量取 94.0 mL 水',
        ask: '量筒读数时，视线应该看哪里？',
        body: '<p><b>操作：</b>先倒到接近 94 mL，再用<b>胶头滴管</b>一滴一滴加到刻度线。</p>' +
          '<p><b>读数：</b>视线与<b>凹液面最低处</b>保持水平。<br>' +
          '俯视 → 读数偏大（实际取少了）；仰视 → 读数偏小（实际取多了）。</p>' +
          '<p><b>量筒不能加热、不能作反应容器</b>，也不能在量筒里配制溶液。</p>',
        apply: function (s) { s.vol = needVol(s); },
        controls: [
          { type: 'btn', label: '继续（下一步：溶解）', onClick: function () {} }
        ]
      },
      {
        name: '溶解',
        title: '倒入烧杯，用玻璃棒搅拌',
        ask: '搅拌能改变溶解度吗？',
        body: '<p><b>操作：</b>把称好的氯化钠倒入烧杯，再加入量好的水，用玻璃棒<b>搅拌</b>加速溶解。</p>' +
          '<p><b>搅拌的作用：</b>加快溶解<b>速率</b>，但<b>不能</b>增大溶解限量（溶解度只跟温度、溶质溶剂本性有关）。</p>' +
          '<p><b>玻璃棒用途：</b>搅拌加速溶解、引流（过滤时）、蘸取溶液测 pH。</p>',
        apply: function (s) { s.poured = 1; s.dissolved = 1; s.stir = 1; },
        controls: [
          { type: 'btn', label: '继续（下一步：装瓶）', onClick: function () {} }
        ]
      },
      {
        name: '装瓶贴签',
        title: '转入试剂瓶，贴上标签',
        ask: '标签上至少要写哪两样信息？',
        body: '<p><b>操作：</b>把配好的溶液转入试剂瓶，盖好瓶塞，贴上标签。</p>' +
          '<p><b>标签必须写：药品名称 + 溶质质量分数</b>（如「NaCl 溶液 6%」）。' +
          '只写名称，下次就不知道浓度，实验会出错。</p>',
        apply: function (s) { s.bottled = 1; s.stir = 0; }
      },
      {
        name: '误差与评分',
        title: '这一瓶配得准不准？',
        ask: '称多了或量少了，浓度会怎么变？',
        body: '<p><b>算一算你这一瓶：</b><br>' +
          '实际质量分数 = m(NaCl) ÷ [m(NaCl) + V(水)×1.0 g/mL] × 100%</p>' +
          '<p><b>常见偏差：</b><br>' +
          '· 氯化钠称多了 → 浓度偏<b>高</b><br>' +
          '· 水仰视读数（实际取多了）→ 浓度偏<b>低</b><br>' +
          '· 烧杯里残留水没倒干净 → 浓度偏<b>低</b><br>' +
          '· 溶质撒落 → 浓度偏<b>低</b></p>',
        controls: [
          { type: 'btn', label: '判定这次配制并评分', onClick: function (s) { s.judged = true; } }
        ]
      },
      {
        name: '换个目标试试',
        title: '如果老师要 50 g 10% 的溶液呢？',
        ask: '溶质和水分别要多少？',
        body: '<p>公式不变，只是数字换了：</p>' +
          '<p>m(NaCl) = 50 g × 10% = <b>5.0 g</b>，V(水) = 50 − 5.0 = <b>45.0 mL</b></p>' +
          '<p><b>规律：</b>质量分数翻倍，溶质质量也翻倍，但水的体积不是简单翻倍——' +
          '因为溶液总质量里既有溶质又有水。</p>',
        quiz: true
      },
      {
        name: '学到的方法',
        title: '配制溶液的四步法',
        ask: '如果配好的溶液太浓，该怎么处理？',
        body: '<p><b>四步：计算 → 称量 → 量取 → 溶解</b>，最后装瓶贴签。</p>' +
          '<p><b>太浓了怎么办：</b>加溶剂（水）稀释，<code>m₁w₁ = m₂w₂</code>；' +
          '不能「倒掉一点」，因为倒掉的仍是同浓度的溶液。</p>' +
          '<p><b>太稀了怎么办：</b>只能加溶质，或重新配制。</p>',
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        {
          q: '配 100 g 6% 的 NaCl 溶液，需要水多少毫升？',
          opts: ['94.0 mL', '100.0 mL', '6.0 mL', '106.0 mL'],
          ans: '94.0 mL',
          why: 'm(水)=100−6=94 g，密度 1.0 g/mL，所以 94 mL。'
        },
        {
          q: '量取水时仰视读数，配出的溶液质量分数会？',
          opts: ['偏低', '偏高', '不变', '无法判断'],
          ans: '偏低',
          why: '仰视读数偏小，实际加入的水比读数多，溶液变稀，质量分数偏低。'
        },
        {
          q: '搅拌的作用是？',
          opts: ['加快溶解速率', '增大溶解度', '增大溶解限量', '改变溶质性质'],
          ans: '加快溶解速率',
          why: '搅拌只加快溶解速度，溶解度由温度和物质本性决定。'
        },
        {
          q: '配好的溶液太浓，正确做法是？',
          opts: ['加水稀释', '倒掉一部分', '加热蒸发', '加同浓度溶液'],
          ans: '加水稀释',
          why: '倒掉一部分浓度不变；加水才能降低质量分数（m₁w₁ = m₂w₂）。'
        }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
