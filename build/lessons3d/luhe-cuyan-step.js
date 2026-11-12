/* 格物实验室 · 粗盐中难溶性杂质的去除（three.js 单文件课件）
   鲁教版 九年级下册 · 溶解 → 过滤 → 蒸发 三步除泥沙 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = { dissolve: 0, filter: 0, evaporate: 0, t: 0 };
  var O = {};

  function ease(cur, tgt, dt, sp) {
    var k = Math.min(1, dt * (sp || 3));
    var v = cur + (tgt - cur) * k;
    if (Math.abs(tgt - v) < 1e-3) v = tgt;
    return v;
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
        steel: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 }),
        dark: new T.MeshStandardMaterial({ color: 0x3a434d, roughness: .5, metalness: .4 }),
        rubber: new T.MeshStandardMaterial({ color: 0x8a2f2f, roughness: .75, metalness: .02 }),
        epoxy: new T.MeshStandardMaterial({ color: 0x9fa9b1, roughness: .55, metalness: .1 }),
        panel: new T.MeshStandardMaterial({ color: 0x8f9aa3, roughness: .62, metalness: .08 }),
        paper: new T.MeshStandardMaterial({ color: 0xf4f7fa, roughness: .9, metalness: 0, side: T.DoubleSide }),
        salt: new T.MeshStandardMaterial({ color: 0xfbfdff, roughness: .55, metalness: .02 }),
        mud: new T.MeshStandardMaterial({ color: 0x5f4a30, roughness: .95, metalness: 0 })
      };
      O.MAT = MAT;
      /* 玻璃三件套：口沿环 + 母线 + 竖向高光条（浅背景玻璃靠轮廓定形） */
      function gRim(parent, r, y, op) {
        var t = new T.Mesh(new T.TorusGeometry(r, .065, 8, 40),
          new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: op || .9 }));
        t.rotation.x = Math.PI / 2; t.position.y = y; parent.add(t);
      }
      function gLines(parent, r, y0, y1, n) {
        for (var k = 0; k < (n || 6); k++) {
          var a = k / (n || 6) * Math.PI * 2;
          var pts = [new T.Vector3(Math.cos(a) * r, y0, Math.sin(a) * r),
                     new T.Vector3(Math.cos(a) * r, y1, Math.sin(a) * r)];
          parent.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: 0x5f86a6, transparent: true, opacity: .5 })));
        }
      }
      function ringAt(x, y, z, r, op) {
        var t = new T.Mesh(new T.TorusGeometry(r, .07, 8, 44),
          new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: op || .9 }));
        t.rotation.x = Math.PI / 2; t.position.set(x, y, z); K.scene().add(t);
      }





      K.envRoom();
      /* 板书换成这节课的操作要点（引擎黑板已不写具体物质） */
      (function () {
        var board = null;
        K.scene().traverse(function (m) {
          if (m.isMesh && m.geometry && m.geometry.type === 'PlaneGeometry' &&
              m.geometry.parameters &&
              Math.abs(m.geometry.parameters.width - 19.2) < .01 &&
              Math.abs(m.geometry.parameters.height - 9.6) < .01) board = m;
        });
        if (!board) return;
        var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
        var x = cv.getContext('2d');
        var g = x.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#31493f'); g.addColorStop(1, '#283d35');
        x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
        x.globalAlpha = .08; x.strokeStyle = '#e8f0ea'; x.lineWidth = 4; x.lineCap = 'round';
        for (var i = 0; i < 6; i++) {
          var x0 = 60 + Math.random() * 800, y0 = 60 + Math.random() * 400;
          x.beginPath(); x.moveTo(x0, y0);
          x.lineTo(x0 + 60 + Math.random() * 110, y0 + (Math.random() - .5) * 30); x.stroke();
        }
        x.globalAlpha = .94; x.fillStyle = '#eef5ee';
        x.font = 'bold 44px "Microsoft YaHei", Georgia, serif';
        x.fillText('粗盐中难溶性杂质的去除', 60, 76);
        x.font = '38px "Microsoft YaHei", Georgia, serif';
        x.fillText('溶解 → 过滤 → 蒸发', 70, 152);
        x.fillText('一贴：滤纸紧贴漏斗内壁', 70, 222);
        x.fillText('二低：滤纸低于漏斗口 · 液面低于滤纸', 70, 292);
        x.fillText('三靠：杯靠棒 · 棒靠三层 · 颈靠杯壁', 70, 362);
        x.fillText('蒸发：边加热边搅拌，出现较多固体即停', 70, 432);
        var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
        board.material.map = t; board.material.needsUpdate = true;
      })();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .8;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });

      /* 台面：沿用验收样板的深色环氧实验台（白台面配白墙会整幅发白） */
      K.bench(52, 16);
      /* 极亮 scene.environment 会在 MeshPhysicalMaterial 的 IBL/clearcoat
         镜面层把 0x171d21 反成浅灰白。保留拉丝贴图、关掉环境反射。 */
      (function () {
        var top = null;
        K.scene().traverse(function (o) {
          if (!top && o.isMesh && o.material && o.material.color &&
              o.material.color.getHexString() === '171d21') top = o;
        });
        if (top) top.material = new T.MeshStandardMaterial({
          color: 0x171d21, map: top.material.map, roughness: .62,
          metalness: 0, envMapIntensity: 0
        });
      })();

      /* ═══ ① 溶解：烧杯 A + 粗盐 + 玻璃棒 ═══
         烧杯整件交给 ChemKit 高模；旧的手搓烧杯、两圈口沿/底沿环、
         母线、液柱与液面环全部删除，否则双层玻璃 + 重影环 + 白盘。 */
      var AX = -15, AZ = 2, AR = 3.0, AH = 6.0;

      /* 粗盐 + 泥沙颗粒 */
      O.grains = [];
      var saltG = new T.OctahedronGeometry(.27, 0), mudG = new T.DodecahedronGeometry(.24, 0);
      for (i = 0; i < 46; i++) {
        var isMud = i % 6 === 0;
        var g = new T.Mesh(isMud ? mudG : saltG, isMud ? MAT.mud : MAT.salt);
        var a = Math.random() * 6.28, rr = Math.random() * (AR - .6);
        g.position.set(AX + Math.cos(a) * rr, .35 + Math.random() * .6, AZ + Math.sin(a) * rr);
        g.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        g.userData.mud = isMud;
        O.grains.push(g);
        K.scene().add(g);
      }
      O.rod = new T.Mesh(new T.CylinderGeometry(.15, .15, 6.2, 12),
        new T.MeshPhysicalMaterial({ color: 0xdff0fa, roughness: .16, metalness: 0, transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.5 }));
      O.rod.position.set(AX + 1.6, 4.3, AZ + 1.0);
      O.rod.rotation.z = -.5;
      K.scene().add(O.rod);

      /* ═══ ② 过滤：铁架台 + 铁圈 + 漏斗 + 滤纸 + 承接烧杯 B ═══ */
      var FX = -3, FZ = 2;
      /* 立杆/底座退到承接烧杯之外（杯心 FX、半径 3.0 → 左缘 FX-3）：
         旧版立杆 FX-4 加底座右缘 FX-1，斜视下立杆看起来插进杯里。 */
      K.rbox({ x: FX - 6, y: .35, z: FZ, sx: 4, sy: .7, sz: 6, r: .1, mat: MAT.dark });
      K.cyl({ x: FX - 6, z: FZ, y0: .7, r: .34, h: 14, mat: MAT.steel });
      /* 铁圈要托住漏斗锥体：锥体半径从 0.34(y=8.64) 线性涨到 2.25(y=11.52)，
         半径 1.7 的圈对应 y≈10.7。旧版半径 2.4（比漏斗口还大）放在 y=8.4，
         等于一个环拦腰套在漏斗尖端，根本托不住。 */
      var ring = new T.Mesh(new T.TorusGeometry(1.7, .12, 8, 32), MAT.steel);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(FX, 10.68, FZ);
      K.scene().add(ring);
      K.rbox({ x: FX - 3.85, y: 10.68, z: FZ, sx: 4.3, sy: .4, sz: .6, r: .08, mat: MAT.steel });
      /* 漏斗与承接烧杯整件交给 ChemKit 高模（漏斗自带滤纸锥）。
         旧的手搓漏斗、两圈烧杯环、液柱/液面全部删除。 */
      var BX = FX, BZ = FZ, BR = 2.7, BH = 5.4;

      /* 过滤液流：只在漏斗颈末端下方一小段（颈末端 y=5.4），
         旧版是一根 4 单位白柱，和漏斗颈连起来贯穿整个烧杯。 */
      O.stream = new T.Mesh(new T.CylinderGeometry(.07, .07, .7, 8),
        new T.MeshBasicMaterial({ color: 0xdff0f8, transparent: true, opacity: .7 }));
      O.stream.position.set(FX, 5.05, FZ);
      O.stream.visible = false;
      K.scene().add(O.stream);

      /* ═══ ③ 蒸发：铁架台 + 铁圈 + 蒸发皿 + 酒精灯 ═══ */
      var EX = 8.8, EZ = 2;
      /* 立杆退到皿外（皿半径 3.3）、铁圈半径收到 2.6 托在皿底下方，
         旧版立杆 x=EX-3.4 与半径 3.2 的铁圈都会切进蒸发皿。 */
      K.rbox({ x: EX - 4.6, y: .35, z: EZ, sx: 4, sy: .7, sz: 6, r: .1, mat: MAT.dark });
      K.cyl({ x: EX - 4.6, z: EZ, y0: .7, r: .34, h: 12, mat: MAT.steel });
      var ering = new T.Mesh(new T.TorusGeometry(2.6, .16, 8, 32), MAT.steel);
      ering.rotation.x = Math.PI / 2; ering.position.set(EX, 4.45, EZ); K.scene().add(ering);
      K.rbox({ x: EX - 3.6, y: 4.45, z: EZ, sx: 2.0, sy: .4, sz: .6, r: .08, mat: MAT.steel }); /* 立杆→铁圈横臂 */
      O.ex = EX; O.ez = EZ;
      /* 蒸发皿与酒精灯整件交给 ChemKit 高模；旧的手搓浅碗、皿内液柱/液面盘、
         两段圆柱灯体、灯芯、红帽全部删除，避免两个白盘和两套灯重叠。 */
      var LX = EX, LZ = EZ;
      /* 皿内析出的盐晶体（高模没有，保留手工颗粒） */
      O.crystals = [];
      var cg = new T.OctahedronGeometry(.14, 0);
      /* 聚成一小堆、略带米色并叠层，才能从白瓷皿底上读出来 */
      var crystalMat = new T.MeshStandardMaterial({ color: 0xdcd0ae, roughness: .85,
        metalness: 0, flatShading: true, envMapIntensity: 0 });
      for (i = 0; i < 40; i++) {
        var c = new T.Mesh(cg, crystalMat);
        var ca = Math.random() * 6.28, cr = Math.random() * 1.35;
        c.position.set(EX + Math.cos(ca) * cr,
          4.84 + (i % 3) * .07 + Math.random() * .08, EZ + Math.sin(ca) * cr);
        c.scale.setScalar(.01);
        O.crystals.push(c);
        K.scene().add(c);
      }
      /* 高模灯 scaleTo .72 → 灯芯顶约 y=2.25，主火底部对齐它；
         四周舔火从灯焰升到皿底（皿底 y=4.6），不再悬在皿边上。 */
      /* 只留一簇从灯芯顶升到皿底的火。旧版主火 + 3 簇舔火再各加十字面，
         斜视下变成一排黄色竖条，像倒挂的火而不是酒精灯火焰。 */
      O.flame = K.shaderFlame({ x: LX, y: 2.25, z: LZ, r: .55, h: 2.3, light: 1.2, dist: 12 });
      O.flame.mesh.traverse(function (m) { m.renderOrder = 5; });
      /* 单张平面在斜视下会窄成一条线，补一片绕 Y 轴 90° 的同材质平面 */
      (function () {
        var src = null;
        O.flame.mesh.traverse(function (m) { if (!src && m.isMesh) src = m; });
        if (!src) return;
        var cross = new T.Mesh(src.geometry, src.material);
        cross.rotation.y = Math.PI / 2;
        cross.position.copy(src.position);
        cross.renderOrder = src.renderOrder;
        O.flame.mesh.add(cross);
      })();
      O.flames = [O.flame];

      /* 玻璃棒（蒸发时搅拌用，复用一支） */
      O.stir = new T.Mesh(new T.CylinderGeometry(.14, .14, 3.6, 10),
        new T.MeshPhysicalMaterial({ color: 0xdff0fa, roughness: .16, metalness: 0, transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false }));
      O.stir.visible = false;
      K.scene().add(O.stir);

      /* 去掉 K.blob 接触阴影贴片：浅台面上它们就是一块块白色圆盘 */

      O.labA = K.spriteLabel([AX, 8.5, AZ], '溶解（烧杯 + 玻璃棒）', { w: 5.4, fs: 36 });
      O.labF = K.spriteLabel([FX, 12.2, FZ], '过滤（漏斗 + 滤纸）', { w: 5.0, fs: 36 });
      O.labE = K.spriteLabel([EX, 8.6, EZ], '蒸发（蒸发皿 + 酒精灯）', { w: 5.4, fs: 36 });

      /* 器材投影：每件器材在台面/柜体上留下影子，物件才"落地"（样板做法） */
      K.scene().traverse(function (m) {
        if (!m.isMesh || !m.material) return;
        if (Array.isArray(m.material)) return;
        if (m.material.transparent) return;   /* 玻璃/液体/影子贴片不投影 */
        m.castShadow = true;
        m.receiveShadow = true;
      });

      /* ═══ 共用器材层接入 ═══ */
      (function () {
        var C = window.ChemKit;
        C.matteBench(K.scene());
        C.dress(K.scene(), { reagentX: -21, waste: false });
        C.retrofit(O, K.scene(), {
          /* 手搓玻璃器皿已整组删除；保留的液流/玻璃棒仍按步骤显隐 */
          hide: ['stream','rod','stir'],
          add: [
            { id:'beaker', x: AX, z: AZ, liquid: 0 },
            { id:'beaker', x: BX, z: BZ, liquid: 0 },
            /* 漏斗：CHEM_FUNNEL 的 minY=0 是颈末端；颈要插进承接烧杯口，
               漏斗口 y≈5.4+6.8*.9≈11.5，铁圈在锥体下缘 y=8.4 托住 */
            { id:'funnel', x: FX, z: FZ, y: 5.4, opts:{ paper:true }, scaleTo: .9 },
            /* 蒸发皿坐铁圈：圈 y=4.6 → 皿底 y=4.6；酒精灯在皿正下方 */
            { id:'dish',   x: EX, z: EZ, y: 4.6, liquid: 0 },
            { id:'lamp',   x: EX, z: EZ, scaleTo: .72 }
          ]
        });
        /* 玻璃现在是透明的，只画恒半径器壁液位环会显得容器里空空的。
           三件容器改用自建实体液柱（顶盖即液面），液位环全部隐藏。 */
        [0, 1, 3].forEach(function (k) {
          var lb = O.ck[k].userData && O.ck[k].userData.liquidBand;
          if (lb) lb.visible = false;
        });
        /* 俯视下杯底转折处的镜面反射会烧成一整圈亮白椭圆（A/B 确认
           来自玻璃材质而非任何几何环）。只给这一课的玻璃件压一档
           clearcoat / 环境反射，共享层已验收的玻璃配方不动。 */
        [0, 1, 2, 3].forEach(function (k) {
          O.ck[k].traverse(function (n) {
            if (!n.isMesh || !n.name || n.name.indexOf('MAT_glass__') !== 0) return;
            if (n.name.indexOf('bottom') >= 0) return;
            if (!n.material || !n.material.isMeshPhysicalMaterial) return;
            var m = n.material.clone();
            m.clearcoat = .18; m.clearcoatRoughness = .6;
            m.envMapIntensity = .45; m.roughness = .28;
            m.specularIntensity = .45;
            n.material = m;
          });
        });
        /* 白瓷皿底给一点米灰，析出的盐晶体才有对比 */
        O.ck[3].traverse(function (n) {
          if (n.isMesh && n.name && n.name.indexOf('bottom') >= 0) {
            n.material = new T.MeshStandardMaterial({ color: 0xcac6b8,
              roughness: .92, metalness: 0, envMapIntensity: 0 });
          }
        });
        /* 酒精灯：玻璃灯体被亮背景洗成白球，灯帽粉红带小球像蛋糕。
           灯体换实体淡蓝、灯帽改深红棕并去掉顶部小球。 */
        var lampBody = O.ck[4].getObjectByName('MAT_glass__body');
        if (lampBody) lampBody.material = new T.MeshPhysicalMaterial({
          color: 0x76aecf, roughness: .1, transparent: true, opacity: .72,
          side: T.DoubleSide, depthWrite: false, clearcoat: .8, envMapIntensity: 1.0 });
        O.ck[4].traverse(function (n) {
          if (!n.isMesh || !n.name) return;
          if (n.name.indexOf('cap_knob') >= 0) { n.visible = false; return; }
          if (n.name.indexOf('cap_') >= 0) {
            n.material = new T.MeshStandardMaterial({ color: 0x8a3b32,
              roughness: .82, metalness: .02, envMapIntensity: 0 });
          }
        });
        /* 旧版封闭圆柱液柱的顶盖在方向光下会打出一块镜面高光，
           放大后就是烧杯液面上那个刺眼的白色椭圆点。改成开放侧壁
           + 不受光的独立液面圆盘，液面均匀淡蓝、没有高光斑。 */
        var sideMat = new T.MeshStandardMaterial({ color: 0x6fb4d0, roughness: .85,
          transparent: true, opacity: .5, side: T.DoubleSide,
          depthWrite: false, envMapIntensity: 0 });
        var topMat = new T.MeshBasicMaterial({ color: 0x8ec6dd, transparent: true,
          opacity: .3, side: T.DoubleSide, depthWrite: false });
        function liquid(r, x, z, y0) {
          var g = new T.Group();
          g.add(new T.Mesh(new T.CylinderGeometry(r, r, 1, 40, 1, true), sideMat));
          var top = new T.Mesh(new T.CircleGeometry(r, 40).rotateX(-Math.PI / 2), topMat);
          top.position.y = .5;   /* group.scale.y 会把它一起抬到液面 */
          g.add(top);
          g.position.set(x, y0, z);
          K.scene().add(g);
          return g;
        }
        O.liqA = liquid(2.78, AX, AZ, .3);   /* 溶解烧杯 */
        O.liqB = liquid(2.78, BX, BZ, .3);   /* 承接烧杯 */
        O.liqD = liquid(2.9, EX, EZ, 4.75);  /* 蒸发皿（皿底 y=4.6） */
      })();
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      /* 液位由自建实体液柱驱动，不再用恒半径器壁环 */
      var si = 0;
      var idxEl = document.getElementById('sIdx');
      if (idxEl) si = (parseInt(idxEl.textContent, 10) - 1);

      O.dv = ease(O.dv === undefined ? 0 : O.dv, s.dissolve, dt, 1.2);
      O.fv = ease(O.fv === undefined ? 0 : O.fv, s.filter, dt, .9);
      O.ev = ease(O.ev === undefined ? 0 : O.ev, s.evaporate, dt, .7);

      /* 溶解：盐粒逐渐消失（泥沙不溶，留底） */
      for (var i = 0; i < O.grains.length; i++) {
        var g = O.grains[i];
        if (g.userData.mud) { g.visible = true; continue; }
        var k = 1 - O.dv;
        g.visible = k > .05;
        g.scale.setScalar(Math.max(.01, k));
      }

      /* 过滤：液流出现，承接烧杯 B 液面上升、溶解烧杯 A 液面下降 */
      O.stream.visible = O.fv > .05 && O.fv < .8;
      O.stream.material.opacity = .7 * Math.sin(Math.PI * Math.min(1, O.fv));
      var bTarg = O.fv * 3.4;
      O.liqB.scale.y = Math.max(.02, bTarg);
      O.liqB.position.y = .3 + bTarg / 2;
      O.liqB.visible = bTarg > .05;

      var aTarg = Math.max(.4, 3.2 * (1 - O.fv));
      O.liqA.scale.y = aTarg;
      O.liqA.position.y = .3 + aTarg / 2;

      /* 蒸发：皿内液体下降，白色晶体析出 */
      var dTarg = Math.max(.04, .5 * (1 - O.ev));
      O.liqD.scale.y = dTarg;
      O.liqD.position.y = 4.75 + dTarg / 2;
      O.liqD.visible = dTarg > .05;
      var nC = Math.round(O.ev * O.crystals.length);
      for (i = 0; i < O.crystals.length; i++) {
        var c = O.crystals[i];
        c.visible = i < nC;
        c.scale.setScalar(i < nC ? (.95 + (i % 4) * .12) * Math.min(1, O.ev * 2) : .01);
      }

      /* 火焰：主火 + 皿底四周舔火（俯视也看得见加热） */
      var flv = s.evaporate > .05 ? 1 : 0;
      for (var f2 = 0; f2 < O.flames.length; f2++) {
        O.flames[f2].setLit(flv);
        O.flames[f2].tick(s.t + f2 * .7);
      }

      /* 玻璃棒：溶解在 A 里搅，蒸发在皿里搅 */
      if (si === 1) {
        O.rod.visible = true;
        O.rod.position.set(-14.6 + Math.cos(s.t * 2.4) * 1.1, 4.3, 2 + Math.sin(s.t * 2.4) * 1.1);
        O.rod.rotation.z = -.45;
      } else if (si === 5) {
        O.stir.visible = true;
        /* 玻璃棒斜插进蒸发皿：下端落在液面附近、上端露在皿外，
           旧版整根悬在皿右上方，根本没碰到皿 */
        O.stir.position.set(O.ex + 1.3 + Math.cos(s.t * 2.0) * .3, 6.15,
          O.ez + .3 + Math.sin(s.t * 2.0) * .3);
        O.stir.rotation.z = 1.0;
      } else {
        O.rod.visible = si === 0;
        O.stir.visible = false;
      }

      /* 标注 */
      O.labA.sprite.visible = si <= 1;
      O.labF.sprite.visible = si >= 1 && si <= 3;
      O.labE.sprite.visible = si >= 4;
    }
  };

  K.boot({
    title: '粗盐中难溶性杂质的去除',
    chip: '化学 · 鲁教版 · 九下 · 学生实验8 粗盐中难溶性杂质的去除',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 2, ty: 5.2, tz: 2, dist: 46, yaw: .22, pitch: 0.16 },
    postfx: true,

    reads: [['think', '方法'], ['d', '溶解'], ['e', '蒸发']],
    values: function (s) {
      return {
        think: '溶解 → 过滤 → 蒸发',
        d: s.dissolve > .5 ? '粗盐已溶解' : '待溶解',
        e: s.evaporate > .5 ? '正在蒸发结晶' : '—'
      };
    },

    steps: [
      {
        name: '实验思路',
        cam: { tx: 2, ty: 5.2, tz: 2, dist: 46, yaw: .22, pitch: 0.16 },
        title: '粗盐里的泥沙，怎么分离出去？',
        ask: '为什么用「溶解 → 过滤 → 蒸发」三步？',
        body: '<p><b>粗盐</b>里混有<b>泥沙</b>（不溶于水）和一些可溶杂质。</p>' +
          '<p><b>思路：</b>① 溶解——氯化钠溶于水，泥沙不溶；② 过滤——把不溶的泥沙截留；③ 蒸发——把水赶走，得到较纯的氯化钠晶体。</p>' +
          '<p><b>注意：</b>本实验只除去<b>难溶性</b>杂质；可溶杂质（如 MgCl₂、CaCl₂）要用化学方法再除。</p>',
        apply: function (s) { s.dissolve = 0; s.filter = 0; s.evaporate = 0; }
      },
      {
        name: '溶解',
        cam: { tx: -15, ty: 6, tz: 2, dist: 22, yaw: .1, pitch: .28 },
        title: '加水溶解，玻璃棒搅拌',
        ask: '搅拌的作用是什么？',
        body: '<p><b>操作：</b>把粗盐倒入烧杯，加水，用<b>玻璃棒搅拌</b>，直到氯化钠完全溶解。</p>' +
          '<p><b>搅拌的作用：</b>加快溶解<b>速率</b>（不改变溶解度）。</p>' +
          '<p><b>现象：</b>盐粒消失，水变浑浊（泥沙悬浮），底部有泥沙沉积。</p>',
        apply: function (s) { s.dissolve = 1; s.filter = 0; s.evaporate = 0; }
      },
      {
        name: '过滤·装配',
        cam: { tx: -3, ty: 9, tz: 2, dist: 24, yaw: .1, pitch: .26 },
        title: '滤纸三折，紧贴漏斗内壁',
        ask: '「一贴、二低、三靠」分别指什么？',
        body: '<p><b>装配：</b>滤纸对折两次成圆锥形，放入漏斗，<b>紧贴内壁</b>，用少量水润湿。</p>' +
          '<p><b>一贴：</b>滤纸紧贴漏斗内壁（不留气泡）。<br>' +
          '<b>二低：</b>滤纸边缘<b>低于</b>漏斗口；液面<b>低于</b>滤纸边缘。<br>' +
          '<b>三靠：</b>烧杯口靠玻璃棒、玻璃棒靠三层滤纸处、漏斗颈靠烧杯内壁。</p>',
        apply: function (s) { s.dissolve = 1; s.filter = 0.02; s.evaporate = 0; }
      },
      {
        name: '过滤·操作',
        cam: { tx: -3, ty: 8, tz: 2, dist: 22, yaw: .15, pitch: .26 },
        title: '玻璃棒引流，滤液澄清',
        ask: '为什么液面要低于滤纸边缘？',
        body: '<p><b>操作：</b>用玻璃棒<b>引流</b>，把浑浊液缓缓倒入漏斗。</p>' +
          '<p><b>现象：</b>滤纸上留下<b>泥沙</b>，烧杯里得到<b>澄清</b>的滤液。</p>' +
          '<p><b>液面低于滤纸边缘：</b>否则液体会从滤纸和漏斗的缝隙流下，滤液浑浊，等于没过滤。</p>',
        apply: function (s) { s.dissolve = 1; s.filter = 1; s.evaporate = 0; }
      },
      {
        name: '蒸发·装配',
        cam: { tx: 12, ty: 7, tz: 2, dist: 24, yaw: .2, pitch: .26 },
        title: '滤液倒入蒸发皿，架好酒精灯',
        ask: '蒸发皿为什么要放在铁圈上？',
        body: '<p><b>装配：</b>把澄清滤液倒入<b>蒸发皿</b>，放在铁架台的铁圈上，下面用酒精灯加热。</p>' +
          '<p><b>蒸发皿</b>可以直接加热；用铁圈托住，受热均匀又稳定。</p>',
        apply: function (s) { s.dissolve = 1; s.filter = 1; s.evaporate = 0.05; }
      },
      {
        name: '蒸发·操作',
        cam: { tx: 12, ty: 7, tz: 2, dist: 22, yaw: .25, pitch: .26 },
        title: '边加热边搅拌，出现固体就停',
        ask: '为什么快干时要停止加热？',
        body: '<p><b>操作：</b>加热时用<b>玻璃棒不断搅拌</b>，防止局部过热造成<b>液滴飞溅</b>。</p>' +
          '<p><b>停火时机：</b>当蒸发皿中出现<b>较多固体</b>时，停止加热，用<b>余热</b>把剩余水分蒸干。</p>' +
          '<p><b>直接蒸干会怎样：</b>固体飞溅、氯化钠受热分解、产率不准。</p>',
        apply: function (s) { s.dissolve = 1; s.filter = 1; s.evaporate = 1; }
      },
      {
        name: '产率与误差',
        cam: { tx: 12, ty: 6, tz: 2, dist: 26, yaw: .3, pitch: .28 },
        title: '这一份粗盐，提纯了多少？',
        ask: '产率偏低，可能是什么原因？',
        body: '<p><b>产率</b> = 提纯后氯化钠质量 ÷ 粗盐样品质量 × 100%。</p>' +
          '<p><b>偏低原因：</b>溶解不充分、过滤时液体溅出、蒸发时液滴飞溅、转移时有损失。<br>' +
          '<b>偏高原因：</b>晶体没蒸干（含水）、杂质没除净。</p>',
        quiz: true
      },
      {
        name: '小结',
        cam: { tx: -2, ty: 7, tz: 2, dist: 52, yaw: .22, pitch: .3 },
        title: '三步法记住：溶、滤、蒸',
        ask: '如果滤液仍然浑浊，该怎么办？',
        body: '<p><b>三步：</b>溶解 → 过滤 → 蒸发。</p>' +
          '<p><b>滤液浑浊</b>说明过滤失败（滤纸破、液面过高），应<b>重新过滤</b>。</p>' +
          '<p><b>本实验只除难溶性杂质</b>，得到的仍是「较纯」的氯化钠，不是纯净物。</p>',
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        { q: '过滤时「二低」指什么？', opts: ['滤纸边缘低于漏斗口、液面低于滤纸边缘', '漏斗低、烧杯低', '液面低、温度低', '滤纸低、玻璃棒低'], ans: '滤纸边缘低于漏斗口、液面低于滤纸边缘', why: '二低：滤纸边缘低于漏斗口，液面低于滤纸边缘。' },
        { q: '蒸发时玻璃棒不断搅拌，是为了？', opts: ['防止液滴飞溅', '加快蒸发', '增大溶解度', '让晶体更大'], ans: '防止液滴飞溅', why: '搅拌使受热均匀，防止局部过热造成液滴飞溅。' },
        { q: '本实验除去的杂质主要是？', opts: ['难溶性泥沙', '可溶性钙镁盐', '全部杂质', '水分'], ans: '难溶性泥沙', why: '过滤只能除去不溶性杂质，可溶杂质需化学方法。' },
        { q: '滤液仍然浑浊，正确做法是？', opts: ['重新过滤', '直接蒸发', '加水稀释', '加热'], ans: '重新过滤', why: '过滤失败应检查滤纸、液面后重新过滤。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
