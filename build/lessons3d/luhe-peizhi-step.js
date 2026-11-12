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

      /* 托盘上表面：所有器材都坐在同一块垫布上，构图才聚得住 */
      var TOP = .22;

      var MAT = {
        glass: new T.MeshPhysicalMaterial({
          color: 0xf2f8fc, metalness: 0, roughness: .05,
          transparent: true, opacity: .3, side: T.DoubleSide,
          depthWrite: false, clearcoat: .7, clearcoatRoughness: .08,
          envMapIntensity: 1.8, specularIntensity: 1.2
        }),
        steel: new T.MeshStandardMaterial({ color: 0x7c8791, roughness: .4, metalness: .9, envMapIntensity: 1.25 }),
        body: new T.MeshPhysicalMaterial({ color: 0xcfd8df, roughness: .42, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 }),
        dark: new T.MeshStandardMaterial({ color: 0x27303a, roughness: .48, metalness: .35 }),
        rubber: new T.MeshStandardMaterial({ color: 0x8f3a3a, roughness: .75, metalness: .02 }),
        paper: new T.MeshStandardMaterial({ color: 0xe7ecef, roughness: .92 }),
        salt: new T.MeshStandardMaterial({ color: 0xfbfdff, roughness: .55, metalness: .02 }),
        tray: new T.MeshStandardMaterial({ color: 0xcdc7ba, roughness: .9, metalness: .02 }),
        trayRim: new T.MeshStandardMaterial({ color: 0xaea798, roughness: .82, metalness: .04 })
      };
      /* 试剂瓶单独一套材质：fadeShow 会改不透明度，不能污染其他器皿 */
      MAT.bottleGlass = MAT.glass.clone();
      MAT.bottleGlass.opacity = .34;
      MAT.cap = MAT.dark.clone();
      MAT.cap.color.setHex(0x1f2a34);
      O.MAT = MAT;

      K.envRoom();

      /* 收一档全局光：墙与桌面才有灰度层次，不被冲白 */
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .68;
        else if (o.isDirectionalLight) o.intensity *= .78;
      });

      K.bench(48, 30);


      /* ═══ 浅色托盘：把天平/量筒/烧杯/试剂瓶收成一组 ═══ */
      K.rbox({ x: .8, y: .07, z: .35, sx: 31.6, sy: .14, sz: 11.2, r: .28, mat: MAT.trayRim });
      K.rbox({ x: .8, y: .17, z: .35, sx: 30.4, sy: .12, sz: 10.2, r: .24, mat: MAT.tray });

      /* ═══ 电子天平 ═══ */
      var BALX = -9.4, BALZ = -1.0;
      [[-3.4, -2.7], [3.4, -2.7], [-3.4, 2.7], [3.4, 2.7]].forEach(function (p) {
        var ft = new T.Mesh(new T.CylinderGeometry(.32, .36, .16, 14), MAT.rubber);
        ft.position.set(BALX + p[0], TOP + .08, BALZ + p[1]);
        K.scene().add(ft);
      });
      K.rbox({ x: BALX, y: TOP + .22, z: BALZ, sx: 9.1, sy: .28, sz: 7.2, r: .16, mat: MAT.dark });
      /* 机身 */
      K.rbox({ x: BALX, y: TOP + 1.11, z: BALZ, sx: 8.8, sy: 1.5, sz: 7.0, r: .2, mat: MAT.body });
      K.box({ x: BALX, y: .585, z: BALZ, sx: 8.75, sy: .05, sz: 6.95, mat: MAT.dark });
      K.box({ x: BALX, y: 2.055, z: BALZ, sx: 8.55, sy: .05, sz: 6.75, mat: MAT.dark });

      /* 显示屏：嵌在正面（原来是埋在机身里，只露出一条绿边） */
      K.rbox({ x: BALX, y: 1.42, z: BALZ + 3.52, sx: 6.1, sy: 1.68, sz: .18, r: .1, mat: MAT.dark });
      var dcv = document.createElement('canvas');
      dcv.width = 512; dcv.height = 128;
      O.dctx = dcv.getContext('2d');
      O.dtex = new T.CanvasTexture(dcv);
      var scr = new T.Mesh(new T.PlaneGeometry(5.5, 1.32),
        new T.MeshBasicMaterial({ map: O.dtex }));
      scr.position.set(BALX, 1.42, BALZ + 3.64);
      K.scene().add(scr);

      /* 按键 */
      [-1, 1].forEach(function (sgn) {
        var btn = new T.Mesh(new T.CylinderGeometry(.24, .24, .18, 18), MAT.dark);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(BALX + sgn * 2.7, .72, BALZ + 3.58);
        K.scene().add(btn);
      });
      /* 水平泡 */
      var bub = new T.Mesh(new T.CylinderGeometry(.34, .34, .14, 18), MAT.glass);
      bub.position.set(BALX - 3.1, 2.15, BALZ - 2.45);
      K.scene().add(bub);
      var bubDot = new T.Mesh(new T.CylinderGeometry(.18, .18, .03, 16),
        new T.MeshBasicMaterial({ color: 0x8fd8a8 }));
      bubDot.position.set(BALX - 3.1, 2.10, BALZ - 2.45);
      K.scene().add(bubDot);

      /* 称盘：立柱 + 大秤盘 + 称量纸 */
      K.cyl({ x: BALX, z: BALZ - .4, y0: 2.08, r: .82, h: .3, mat: MAT.steel });
      K.cyl({ x: BALX, z: BALZ - .4, y0: 2.37, r: 3.05, h: .26, mat: MAT.steel });
      K.box({ x: BALX, y: 2.66, z: BALZ - .4, sx: 4.4, sy: .06, sz: 4.4, mat: MAT.paper });
      var crease = new T.Mesh(new T.BoxGeometry(4.3, .012, .05), MAT.dark);
      crease.position.set(BALX, 2.70, BALZ - .4);
      crease.rotation.y = .55;
      K.scene().add(crease);

      /* 称量纸上的 NaCl 小晶体 */
      O.saltPile = new T.Group();
      O.saltBits = [];
      var geo = new T.OctahedronGeometry(.17, 0);
      for (i = 0; i < 60; i++) {
        var bit = new T.Mesh(geo, MAT.salt);
        var a = Math.random() * Math.PI * 2, rr = Math.random() * 1.55;
        bit.position.set(BALX + Math.cos(a) * rr, 2.72 + Math.random() * .2,
          BALZ - .4 + Math.sin(a) * rr);
        bit.scale.set(.7 + Math.random() * .6, .6 + Math.random() * .6, .7 + Math.random() * .6);
        bit.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        bit.visible = false;
        O.saltPile.add(bit);
        O.saltBits.push({ m: bit, seq: Math.random() });
      }
      K.scene().add(O.saltPile);

      /* ═══ 量筒（100 mL）═══ */
      var CX = -.9, CZ = 1.8, CR = 2.05;
      var CYL_Y0 = .78, CYL_H = 11.4;
      O.cylGroup = new T.Group();
      var cylBody = K.glassCyl({ r: CR, h: CYL_H, x: 0, z: 0, y0: CYL_Y0 });
      O.cylGroup.add(cylBody);
      /* 六角玻璃底座 */
      var foot = new T.Mesh(new T.CylinderGeometry(CR * 1.62, CR * 1.7, .55, 6), MAT.glass);
      foot.position.y = .505;
      foot.rotation.y = Math.PI / 6;
      O.cylGroup.add(foot);
      /* 倾倒嘴 */
      var lip = new T.Mesh(new T.SphereGeometry(.3, 12, 8), MAT.glass);
      lip.scale.set(1.8, .62, 1);
      lip.position.set(CR * 1.02, CYL_Y0 + CYL_H - .3, 0);
      O.cylGroup.add(lip);

      /* 刻度：贴成弧形筒贴，0 在底部、100 在口沿下，与液面同一套映射 */
      var SCALE_BASE = 1.0, SCALE_H = 10.9;
      var gcv = document.createElement('canvas');
      gcv.width = 256; gcv.height = 1024;
      var gx = gcv.getContext('2d');
      gx.clearRect(0, 0, 256, 1024);
      var bandGrad = gx.createLinearGradient(96, 0, 162, 0);
      bandGrad.addColorStop(0, 'rgba(250,253,255,0)');
      bandGrad.addColorStop(1, 'rgba(250,253,255,.7)');
      gx.fillStyle = bandGrad;
      gx.fillRect(96, 0, 160, 1024);
      var PADT = 14, PADB = 14, HH = 1024 - PADT - PADB;
      for (i = 0; i <= 100; i += 2) {
        var yy = 1024 - PADB - i / 100 * HH;
        var maj = i % 10 === 0;
        gx.strokeStyle = 'rgba(24,58,88,' + (maj ? '1' : '.62') + ')';
        gx.lineWidth = maj ? 3.2 : 1.5;
        gx.beginPath();
        gx.moveTo(247, yy);
        gx.lineTo(247 - (maj ? 62 : 26), yy);
        gx.stroke();
        if (i % 20 === 0) {
          gx.fillStyle = 'rgba(16,48,78,.98)';
          gx.font = '700 46px ui-monospace,Consolas,monospace';
          gx.textAlign = 'right';
          gx.fillText(String(i), 180, yy + 13);
        }
      }
      gx.strokeStyle = 'rgba(24,58,88,.85)';
      gx.lineWidth = 2;
      gx.beginPath(); gx.moveTo(150, PADT); gx.lineTo(150, 1024 - PADB); gx.stroke();
      var gtex = new T.CanvasTexture(gcv);
      var scaleMesh = new T.Mesh(
        new T.CylinderGeometry(CR + .04, CR + .04, SCALE_H, 48, 1, true, -.85, 1.7),
        new T.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, side: T.FrontSide }));
      scaleMesh.position.y = SCALE_BASE + SCALE_H / 2;
      scaleMesh.renderOrder = 5;
      O.cylGroup.add(scaleMesh);
      O.scaleBase = SCALE_BASE; O.scaleH = SCALE_H; O.scalePad = PADB; O.scaleCvH = 1024;
      O.levelY = function (v) {
        return SCALE_BASE + SCALE_H * (1 - (1024 - PADB - v / 100 * HH) / 1024);
      };

      O.cylGroup.position.set(CX, 0, CZ);
      K.scene().add(O.cylGroup);
      O.cx = CX; O.cz = CZ;

      /* 量筒里的水：极淡蓝、通透；液面与刻度严格同源 */
      O.water = K.liquidCyl({ r: CR - .16, h: 1, x: CX, z: CZ, y0: .85, color: 0xc6e0ee, opacity: .58 });
      O.waterTop = K.liquidTop({ r: CR - .16, x: CX, z: CZ, y: .9, color: 0xf0f8fb });
      O.waterTop.material.transparent = true;
      O.waterTop.material.opacity = .62;
      K.setLiquidColor(O.water, 0xc6e0ee, .9);

      /* 凹液面：外圈上翘、中心下凹的环形曲面 + 亮边 */
      O.meniscus = new T.Group();
      (function () {
        var rings = [1, .8, .56, .3, 0], rys = [.085, .045, .012, -.022, -.045];
        var pos = [], idx = [], segs = 40, ri, si;
        for (ri = 0; ri < rings.length; ri++) {
          for (si = 0; si <= segs; si++) {
            var ma = si / segs * Math.PI * 2;
            pos.push(Math.cos(ma) * (CR - .18) * rings[ri], rys[ri], Math.sin(ma) * (CR - .18) * rings[ri]);
          }
        }
        for (ri = 0; ri < rings.length - 1; ri++) {
          for (si = 0; si < segs; si++) {
            var a0 = ri * (segs + 1) + si, b0 = a0 + 1;
            var c0 = a0 + segs + 1, d0 = c0 + 1;
            idx.push(a0, c0, b0, b0, c0, d0);
          }
        }
        var mg = new T.BufferGeometry();
        mg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        mg.setIndex(idx);
        mg.computeVertexNormals();
        var mm = new T.MeshStandardMaterial({
          color: 0xdceef7, roughness: .12, metalness: 0,
          transparent: true, opacity: .68, side: T.DoubleSide, depthWrite: false
        });
        O.meniscus.add(new T.Mesh(mg, mm));
        var rp = [], mi;
        for (mi = 0; mi < 48; mi++) {
          var ra = mi / 48 * Math.PI * 2;
          rp.push(new T.Vector3(Math.cos(ra) * (CR - .16), .085, Math.sin(ra) * (CR - .16)));
        }
        O.meniscus.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(rp),
          new T.LineBasicMaterial({ color: 0xaecfe2, transparent: true, opacity: .9 })));
      })();
      O.meniscus.position.set(CX, 0, CZ);
      K.scene().add(O.meniscus);

      /* 胶头滴管：只在液面接近刻度、尚未倒出时出现 */
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
      var dliq = new T.Mesh(new T.CylinderGeometry(.13, .1, 2.2, 12),
        new T.MeshBasicMaterial({ color: 0xdff0f8, transparent: true, opacity: .7 }));
      dliq.position.y = 1.25;
      O.dropper.add(dliq);
      var collar = new T.Mesh(new T.TorusGeometry(.19, .035, 8, 18), MAT.steel);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 4.12;
      O.dropper.add(collar);
      O.dropper.position.set(CX + .55, 11.55, CZ + .55);
      O.dropper.rotation.z = -.12;
      O.dropper.scale.setScalar(.72);
      K.scene().add(O.dropper);

      /* 滴管口落下的小水滴 */
      O.drop = new T.Mesh(new T.SphereGeometry(.085, 8, 6),
        new T.MeshBasicMaterial({ color: 0xbfe0f0, transparent: true, opacity: .85 }));
      O.drop.visible = false;
      K.scene().add(O.drop);

      /* ═══ 烧杯（溶解） ═══ */
      var BX = 6.7, BZ = -.2, BR = 4.0, BH = 8.5;
      O.beaker = K.beaker({ r: BR, h: BH, x: BX, z: BZ, y0: TOP });
      O.sol = K.liquidCyl({ r: BR - .22, h: 1, x: BX, z: BZ, y0: TOP + .06, color: 0xe8f2f6, opacity: .42 });
      O.solTop = K.liquidTop({ r: BR - .24, x: BX, z: BZ, y: TOP + .1, color: 0xf1f8fb });
      O.solTop.material.transparent = true;
      O.solTop.material.opacity = .38;
      /* 液面亮边：让溶液高度一眼可读 */
      (function () {
        var pts = [], si;
        for (si = 0; si < 56; si++) {
          var aa = si / 56 * Math.PI * 2;
          pts.push(new T.Vector3(BX + Math.cos(aa) * (BR - .22), 0, BZ + Math.sin(aa) * (BR - .22)));
        }
        O.solRim = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),
          new T.LineBasicMaterial({ color: 0x7fa9c4, transparent: true, opacity: .9 }));
        O.solRim.visible = false;
        K.scene().add(O.solRim);
      })();
      O.br = BR;
      O.bx = BX; O.bz = BZ; O.top = TOP;

      /* 烧杯杯身上的几条刻度弧（跟随烧杯一起显隐） */
      O.beakMarks = [];
      (function () {
        var k, si;
        for (k = 1; k <= 4; k++) {
          var pts = [];
          for (si = 0; si <= 16; si++) {
            var aa = -.55 + si / 16 * 1.1;
            pts.push(new T.Vector3(BX + Math.sin(aa) * (BR + .006), TOP + k * 1.55,
              BZ + Math.cos(aa) * (BR + .006)));
          }
          var mk = new T.Line(new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: 0x6f93ac, transparent: true, opacity: .45 }));
          O.beakMarks.push(mk);
          K.scene().add(mk);
        }
      })();

      /* 烧杯里未溶解的盐粒 */
      O.bitsIn = [];
      var bgeo = new T.OctahedronGeometry(.13, 0);
      for (i = 0; i < 44; i++) {
        var bb = new T.Mesh(bgeo, MAT.salt);
        bb.visible = false;
        O.bitsIn.push(bb);
        K.scene().add(bb);
      }
      O.milkyCol = new T.Color(0xf4fafc);
      O.clearCol = new T.Color(0xc6e0ee);
      O.solCol = new T.Color(0xf4fafc);
      O.whiteCol = new T.Color(0xffffff);

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
      O.rod.position.set(BX + 2.4, 9.4, BZ + .9);
      O.rod.rotation.z = -.34;
      K.scene().add(O.rod);

      /* 搅拌旋涡：液面上三圈细亮环，随搅拌强度出现 */
      O.swirl = new T.Group();
      (function () {
        var k, si;
        for (k = 0; k < 3; k++) {
          var pts = [], rr = 1.1 + k * .85;
          for (si = 0; si < 48; si++) {
            var aa = si / 48 * Math.PI * 2;
            pts.push(new T.Vector3(Math.cos(aa) * rr, 0, Math.sin(aa) * rr));
          }
          O.swirl.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: 0x6f9fbd, transparent: true, opacity: .3 - k * .06 })));
        }
      })();
      O.swirl.position.set(BX, 0, BZ);
      O.swirl.visible = false;
      K.scene().add(O.swirl);

      /* ═══ 试剂瓶：瓶肩 + 瓶颈 + 螺纹盖 + 弧形标签 ═══ */
      var PX = 13.6, PZ = 1.6;
      O.bottle = new T.Group();
      var prof = [
        new T.Vector2(0, 0), new T.Vector2(1.7, 0), new T.Vector2(2.05, .22),
        new T.Vector2(2.15, .55), new T.Vector2(2.15, 4.7), new T.Vector2(2.08, 5.25),
        new T.Vector2(1.55, 6.15), new T.Vector2(1.05, 6.7), new T.Vector2(1.0, 7.45)
      ];
      var bbody = new T.Mesh(new T.LatheGeometry(prof, 48), MAT.bottleGlass);
      O.bottle.add(bbody);
      /* 瓶身轮廓线：透明玻璃在浅背景下靠这几道细线立住形 */
      [[.55, 2.15], [5.25, 2.08], [6.7, 1.05], [7.45, 1.0]].forEach(function (rp) {
        var pts = [], si;
        for (si = 0; si < 48; si++) {
          var aa = si / 48 * Math.PI * 2;
          pts.push(new T.Vector3(Math.cos(aa) * rp[1], rp[0], Math.sin(aa) * rp[1]));
        }
        O.bottle.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),
          new T.LineBasicMaterial({ color: 0x7396b0, transparent: true, opacity: .5 })));
      });
      var brim = new T.Mesh(new T.TorusGeometry(1.0, .09, 8, 32), MAT.bottleGlass);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = 7.45;
      O.bottle.add(brim);
      /* 瓶盖 + 顶面压圈 */
      var cap = new T.Mesh(new T.CylinderGeometry(1.12, 1.12, .95, 28), MAT.cap);
      cap.position.y = 7.95;
      O.bottle.add(cap);
      var capTop = new T.Mesh(new T.CylinderGeometry(1.03, 1.03, .08, 28), MAT.cap);
      capTop.position.y = 8.46;
      O.bottle.add(capTop);
      [-.28, 0, .28].forEach(function (dy) {
        var rib = new T.Mesh(new T.TorusGeometry(1.13, .035, 6, 30), MAT.cap);
        rib.rotation.x = Math.PI / 2;
        rib.position.y = 7.95 + dy;
        O.bottle.add(rib);
      });

      /* 标签：弧形筒贴，字会随瓶身转，贴签时从侧面滑入 */
      var lcv = document.createElement('canvas');
      lcv.width = 512; lcv.height = 256;
      var lx = lcv.getContext('2d');
      lx.fillStyle = '#fbfdff'; lx.fillRect(0, 0, 512, 256);
      lx.strokeStyle = 'rgba(47,125,209,.55)'; lx.lineWidth = 6;
      lx.strokeRect(8, 8, 496, 240);
      lx.fillStyle = '#1d2a38';
      lx.textAlign = 'center';
      lx.font = '600 58px -apple-system,"PingFang SC",sans-serif';
      lx.fillText('NaCl 溶液', 256, 86);
      lx.fillStyle = '#2f6ea8';
      lx.font = '700 104px ui-monospace,Consolas,monospace';
      lx.fillText('6%', 256, 196);
      lx.fillStyle = '#6b8499';
      lx.font = '500 24px -apple-system,"PingFang SC",sans-serif';
      lx.fillText('质量分数', 256, 232);
      var ltex = new T.CanvasTexture(lcv);
      O.labelMesh = new T.Mesh(
        new T.CylinderGeometry(2.2, 2.2, 2.2, 32, 1, true, -.8, 1.6),
        new T.MeshBasicMaterial({ map: ltex, transparent: true, side: T.DoubleSide, depthWrite: false }));
      O.labelMesh.position.y = 3.35;
      O.labelMesh.renderOrder = 6;
      O.bottle.add(O.labelMesh);

      O.bottle.position.set(PX, TOP, PZ);
      O.bottle.visible = false;
      K.scene().add(O.bottle);

      /* 瓶内配好的溶液 */
      O.bottleLiq = K.liquidCyl({ r: 1.85, h: 4.6, x: PX, z: PZ, y0: TOP + .3, color: 0xe9f3f8, opacity: .45 });
      O.bottleLiq.visible = false;
      O.bottleLiqTop = K.liquidTop({ r: 1.85, x: PX, z: PZ, y: TOP + 4.9, color: 0xdfeef6 });
      O.bottleLiqTop.material.transparent = true;
      O.bottleLiqTop.material.opacity = .5;
      O.bottleLiqTop.visible = false;

      /* 接触阴影 */
      K.blob({ x: BALX, z: BALZ, r: 4.8, y: TOP + .01 });
      K.blob({ x: CX, z: CZ, r: 3.2, y: TOP + .01 });
      K.blob({ x: BX, z: BZ, r: 4.8, y: TOP + .01 });
      K.blob({ x: PX, z: PZ, r: 3.0, y: TOP + .01 });

      /* 标注：数量克制，位置错开，避免互相压住 */
      O.labBal = K.spriteLabel([BALX, 4.9, BALZ], '电子天平', { w: 3.6, fs: 40 });
      O.labCyl = K.spriteLabel([CX - 2.2, 13.6, CZ], '量筒 100 mL', { w: 4.2, fs: 40 });
      O.labBeak = K.spriteLabel([BX, TOP + BH + 1.5, BZ], '烧杯', { w: 2.8, fs: 40 });
      O.labBottle = K.spriteLabel([PX - .6, TOP + 9.4, PZ], '试剂瓶', { w: 3.0, fs: 40 });

      O.ready = true;
    },

    update: function (dt, s) {
      var i;
      s.t += dt;

      /* 当前步骤号：只用于视觉分工（标注/器材出场），不影响任何读数 */
      var idxEl = document.getElementById('sIdx');
      var si = idxEl ? (parseInt(idxEl.textContent, 10) - 1) : 0;

      /* SSAO 在大平面桌面上会落方块状暗斑：补 RenderPass 后禁用 SSAOPass，
         它兼任主渲染通道，直接禁会让整个场景停渲染 */
      if (!s.ssaoFixed && s.t > .5 && window.__labDebug && window.__labDebug.composer) {
        s.ssaoFixed = true;
        var DBG = window.__labDebug, CP = DBG.composer;
        CP.passes.unshift(new T.RenderPass(DBG.scene, DBG.camera));
        CP.passes.forEach(function (p) { if (p.kernelRadius !== undefined) p.enabled = false; });
      }

      /* 视觉缓动：水位、溶解、溶液体积。读数仍由面板直接算，不受影响 */
      if (O.volVis === undefined) O.volVis = 0;
      O.volVis += (s.vol - O.volVis) * Math.min(1, dt * 3.5);
      if (Math.abs(s.vol - O.volVis) < .02) O.volVis = s.vol;

      var targetDiss = (s.poured > .5 && s.dissolved > .5) ? 1 : 0;
      if (O.visDiss === undefined) O.visDiss = 0;
      O.visDiss += (targetDiss - O.visDiss) * Math.min(1, dt * .55);
      if (targetDiss && O.visDiss > .995) O.visDiss = 1;
      if (!targetDiss && O.visDiss < .005) O.visDiss = 0;

      /* 天平屏幕：只显示称量值，字号做大，远处也读得清 */
      if (O.dctx) {
        var c = O.dctx;
        c.fillStyle = '#0b1712';
        c.fillRect(0, 0, 512, 128);
        c.fillStyle = '#25453a';
        c.fillRect(12, 12, 488, 104);
        c.fillStyle = '#0b1712';
        c.fillRect(16, 16, 480, 96);
        c.fillStyle = '#7ef0b8';
        c.font = '700 82px ui-monospace,Consolas,monospace';
        c.textAlign = 'right';
        c.fillText(Math.max(0, s.mass).toFixed(1), 400, 104);
        c.font = '700 40px ui-monospace,Consolas,monospace';
        c.fillText('g', 474, 104);
        c.fillStyle = '#3f7a63';
        c.font = '600 18px ui-monospace,Consolas,monospace';
        c.textAlign = 'left';
        c.fillText('NaCl', 32, 38);
        O.dtex.needsUpdate = true;
      }

      /* 称量盘上的盐堆：按质量显示晶粒数量 */
      var nShow = Math.round(Math.min(1, s.mass / Math.max(.001, needMass(s))) * 56);
      for (i = 0; i < O.saltBits.length; i++) {
        O.saltBits[i].m.visible = i < nShow;
      }

      /* 量筒水位：液面高度与刻度同一套映射 */
      var lvl = O.levelY(Math.max(0, Math.min(100, O.volVis)));
      var wh = Math.max(.02, lvl - .85);
      K.setLiquidLevel(O.water, wh, .85);
      O.water.position.y = .85 + wh / 2;
      O.waterTop.position.y = lvl;
      O.meniscus.position.y = lvl;
      var showW = O.volVis > .15;
      O.water.visible = showW;
      O.waterTop.visible = showW;
      O.meniscus.visible = showW;

      /* 滴管：液面接近刻度、还没倒出时才俯身滴加 */
      var near = s.poured < .5 && s.vol > .5 && lvl > 8.2;
      O.dropper.visible = near;
      O.drop.visible = false;
      if (near) {
        O.dropT = ((O.dropT || 0) + dt * .9) % 1;
        O.drop.position.set(O.cx + .5, lvl + .06 + (1 - O.dropT) * .44, O.cz + .5);
        O.drop.visible = O.dropT > .12;
      }

      /* 倒入烧杯 → 液面上升 */
      var solTarget = .001;
      if (s.poured > .01) {
        var sh = Math.max(.001, (s.mass + s.vol) / Math.max(1, s.mT) * 7.2 * (s.bottled > .5 ? .58 : 1));
        solTarget = sh;
      }
      if (O.solVis === undefined) O.solVis = .001;
      O.solVis += (solTarget - O.solVis) * Math.min(1, dt * 3.2);
      if (Math.abs(solTarget - O.solVis) < .002) O.solVis = solTarget;
      K.setLiquidLevel(O.sol, Math.max(.001, O.solVis), O.top + .06);
      O.sol.position.y = O.top + .06 + O.solVis / 2;
      O.solTop.position.y = O.top + .06 + O.solVis;
      O.solRim.position.y = O.top + .065 + O.solVis;
      O.solRim.visible = O.solVis > .08;
      O.sol.visible = O.solVis > .01;
      O.solTop.visible = O.solVis > .05;

      /* 浑浊 → 澄清：刚倒入时偏乳白，溶解均匀后转为极淡青灰 */
      O.solCol.copy(O.milkyCol).lerp(O.clearCol, O.visDiss);
      K.setLiquidColor(O.sol, O.solCol, .9);
      if (O.sol.material.uniforms) O.sol.material.uniforms.uOpacity.value = .6 - .12 * O.visDiss;
      O.solTop.material.color.copy(O.solCol).lerp(O.whiteCol, .1);
      O.solTop.material.opacity = .42 - .1 * O.visDiss;

      /* 烧杯里的盐粒：随旋流下沉，越溶越少 */
      var undiss = Math.max(0, 1 - O.visDiss);
      var inN = s.poured > .5 ? Math.round(undiss * 40) : 0;
      var surf = O.top + .06 + O.solVis;
      for (i = 0; i < O.bitsIn.length; i++) {
        var b = O.bitsIn[i];
        if (i < inN) {
          var ang = i * 2.399 + s.t * (s.stir > .1 && s.bottled < .5 ? 3.0 : .35);
          var rr = .7 + (i % 6) * .38;
          var ph = (i * .137 + O.visDiss * .55) % 1;
          var gy = .42 + (1 - ph) * (surf - .55);
          b.visible = true;
          b.position.set(O.bx + Math.cos(ang) * rr, Math.min(gy, surf - .06), O.bz + Math.sin(ang) * rr * .85);
          b.scale.set(.7 + (i % 4) * .12, .55 + (i % 3) * .12, .7 + (i % 5) * .1);
        } else {
          b.visible = false;
        }
      }

      /* 玻璃棒：搅拌时绕杯心画圆并轻轻摆动，装瓶后靠杯壁停住 */
      var stirring = s.stir > .05 && s.poured > .5 && s.bottled < .5;
      if (stirring) {
        var ra = s.t * 3.2;
        O.rod.position.set(O.bx + Math.cos(ra) * 1.75, 9.5 + Math.sin(s.t * 2.1) * .16,
          O.bz + Math.sin(ra) * 1.75);
        O.rod.rotation.z = -.2 + Math.sin(s.t * 3.2) * .06;
        O.rod.rotation.x = Math.cos(s.t * 3.2) * .06;
        O.rod.visible = true;
      } else if (s.poured > .5) {
        O.rod.position.set(O.bx + 1.8, 6.3, O.bz + .9);
        O.rod.rotation.z = -.5;
        O.rod.rotation.x = .1;
        O.rod.visible = true;
      } else {
        O.rod.visible = false;
      }

      /* 旋涡亮环 */
      O.swirl.visible = stirring && O.solVis > .4;
      if (O.swirl.visible) {
        O.swirl.position.y = O.top + .06 + O.solVis + .02;
        O.swirl.rotation.y = s.t * 2.2;
        for (i = 0; i < O.swirl.children.length; i++) {
          O.swirl.children[i].material.opacity = (.3 - i * .06) * Math.min(1, s.stir);
        }
      }

      /* 装瓶：瓶身淡入，标签从侧面滑到瓶身 */
      K.fadeShow(O.bottle, s.bottled > .5 && si >= 4, dt, 3.2);
      var ba = O.bottle.userData.__a || 0;
      O.bottleLiq.visible = ba > .02;
      O.bottleLiqTop.visible = ba > .02;
      K.setLiquidColor(O.bottleLiq, O.clearCol, .92);
      if (O.bottleLiq.material.uniforms) O.bottleLiq.material.uniforms.uOpacity.value = .46 * ba;
      O.bottleLiqTop.material.opacity = .5 * ba;

      if (O.labelIn === undefined) O.labelIn = 0;
      O.labelIn = Math.max(0, Math.min(1, O.labelIn + (s.bottled > .5 ? dt * .85 : -dt * 2)));
      var le = O.labelIn * O.labelIn * (3 - 2 * O.labelIn);
      O.labelMesh.position.x = (1 - le) * 2.8;
      O.labelMesh.position.z = (1 - le) * .7;
      O.labelMesh.scale.setScalar(1 + (1 - le) * .12);

      /* 标注按步骤取舍：只留当前主体，避免互相压、避免被面板裁切 */
      O.labBal.sprite.visible = (si === 0 || si === 1 || si === 6 || si === 7);
      O.labCyl.sprite.visible = (si === 0 || si === 2 || si === 6 || si === 7);
      O.labBeak.sprite.visible = (si === 3 || si === 5 || si === 6 || si === 7);
      O.labBottle.sprite.visible = (ba > .06) && si >= 4;

      /* 器材入场/退场：当前步骤用不到的先退到一旁，画面只留主体 */
      var showCyl = si <= 2 || si >= 6;
      var showBeak = si === 3 || si === 5 || si === 6 || si === 7;
      O.cylGroup.visible = showCyl;
      O.water.visible = O.water.visible && showCyl;
      O.waterTop.visible = O.waterTop.visible && showCyl;
      O.meniscus.visible = O.meniscus.visible && showCyl;
      O.dropper.visible = O.dropper.visible && showCyl;
      O.drop.visible = O.drop.visible && showCyl;
      O.beaker.visible = showBeak;
      O.sol.visible = O.sol.visible && showBeak;
      O.solTop.visible = O.solTop.visible && showBeak;
      O.solRim.visible = O.solRim.visible && showBeak;
      O.rod.visible = O.rod.visible && showBeak;
      if (!showBeak) {
        for (i = 0; i < O.bitsIn.length; i++) O.bitsIn[i].visible = false;
        for (i = 0; i < O.beakMarks.length; i++) O.beakMarks[i].visible = false;
      } else {
        for (i = 0; i < O.beakMarks.length; i++) O.beakMarks[i].visible = true;
      }

      /* 读数不做逐帧写入，由面板 values 计算 */
      O.lastMass = s.mass;
    }
  };

  K.boot({
    title: '配制一定溶质质量分数的氯化钠溶液',
    chip: '化学 · 鲁教版 · 九上 · 学生实验3 一定溶质质量分数的氯化钠溶液的配制',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 4, ty: 5.2, tz: 2, dist: 42, yaw: .22, pitch: 0.16 },

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
        cam: { tx: 4, ty: 5.2, tz: 2, dist: 42, yaw: .22, pitch: 0.16 },
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
        cam: { tx: -6.14, ty: 2.2, tz: -.9, dist: 14.5, yaw: .16, pitch: .28 },
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
        cam: { tx: .4, ty: 6.5, tz: 1.8, dist: 30, yaw: -.12, pitch: .14 },
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
        cam: { tx: 16.5, ty: 8.0, tz: 0, dist: 25, yaw: .24, pitch: .26 },
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
        cam: { tx: 17.7, ty: 4.4, tz: 1.4, dist: 17.5, yaw: .45, pitch: .22 },
        title: '转入试剂瓶，贴上标签',
        ask: '标签上至少要写哪两样信息？',
        body: '<p><b>操作：</b>把配好的溶液转入试剂瓶，盖好瓶塞，贴上标签。</p>' +
          '<p><b>标签必须写：药品名称 + 溶质质量分数</b>（如「NaCl 溶液 6%」）。' +
          '只写名称，下次就不知道浓度，实验会出错。</p>',
        apply: function (s) { s.bottled = 1; s.stir = 0; }
      },
      {
        name: '误差与评分',
        cam: { tx: 11.0, ty: 5.8, tz: .5, dist: 22, yaw: .12, pitch: .30 },
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
        cam: { tx: 8.0, ty: 5.8, tz: .2, dist: 34, yaw: .28, pitch: .30 },
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
        cam: { tx: 8.0, ty: 6.0, tz: .2, dist: 34, yaw: .38, pitch: .31 },
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
