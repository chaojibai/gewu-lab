/* 格物实验室 · 测定鸡蛋壳中碳酸钙的含量（three.js 单文件课件）
   鲁教版 九年级下册 · 学生实验10 · 酸与碳酸盐 · 排水量气法 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = { acid: 0, react: 0, gas: 0, t: 0 };
  var O = {};
  var SAMPLE = 2.0;       /* 样品质量 g */
  var CACO3 = 0.90;       /* 设定真实含量（用于出数） */
  var M_CACO3 = 100.09;   /* CaCO₃ 摩尔质量 g/mol */
  var VM = 22400;         /* 标准状况气体摩尔体积 mL/mol */
  var VMAX = SAMPLE * CACO3 / M_CACO3 * VM;  /* 理论 CO₂ 体积 ≈403 mL，由模型算不写死 */

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
          color: 0xe8f2fa, metalness: 0, roughness: .06, transparent: true, opacity: .22,
          side: T.FrontSide, depthWrite: false, clearcoat: .8, clearcoatRoughness: .08,
          envMapIntensity: .55, specularIntensity: 1.0
        }),
        edge: new T.LineBasicMaterial({ color: 0x54748f, transparent: true, opacity: .85 }),
        steel: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 }),
        dark: new T.MeshStandardMaterial({ color: 0x3a434d, roughness: .5, metalness: .4 }),
        rubber: new T.MeshStandardMaterial({ color: 0x8a2f2f, roughness: .75, metalness: .02 }),
        epoxy: new T.MeshStandardMaterial({ color: 0xc3ccd2, roughness: .55, metalness: .1 }),
        shell: new T.MeshStandardMaterial({ color: 0xe9e2d2, roughness: .8, metalness: .02 }),
        liquid: new T.MeshBasicMaterial({ color: 0xd8ecf6, transparent: true, opacity: .55 })
      };
      O.MAT = MAT;




      K.envRoom();
      /* 玻璃已恢复淡青蓝终版配方，靠自身颜色与 fresnel 边缘光定形。
         原先那块立在 z=-12 的深色背景布在平视机位下只是一块「立着的玻璃板」，
         而且把白墙/黑板压成阴间灰蓝，按验收样板去掉。 */

      /* 板书换成这个实验：引擎默认画的是 NaCl / H₂O，属于别的课，
         学生盯着这块板会读错反应式。按黑板 Plane 的精确尺寸定位替换贴图。 */
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
        x.font = 'bold 46px "Microsoft YaHei", Georgia, serif';
        x.fillText('测定鸡蛋壳中 CaCO₃ 的含量', 60, 82);
        x.font = '41px Georgia, "Microsoft YaHei", serif';
        x.fillText('CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑', 70, 186);
        x.fillText('n(CaCO₃) = n(CO₂)', 70, 266);
        x.fillText('w = m(CaCO₃) ÷ m(样品) × 100%', 70, 346);
        x.globalAlpha = .62; x.font = '32px "Microsoft YaHei", Georgia, serif';
        x.fillText('排水量气 · 冷却至室温再读数', 70, 438);
        var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
        board.material.map = t; board.material.needsUpdate = true;
      })();

      /* 窗户已在 K.envRoom() 里统一修好（窗框共面 + 天光片收进框内），
         这里不再叠一套局部压边，避免两套边框重影。 */

      /* 玻璃三件套：口沿环 + 母线 + 竖向高光条 */
      function glassRim(parent, r, y, tube, op) {
        var t = new T.Mesh(new T.TorusGeometry(r, tube || .06, 8, 40),
          new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: op || .9 }));
        t.rotation.x = Math.PI / 2; t.position.y = y; parent.add(t);
      }
      function glassSides(parent, rBot, rTop, y0, y1, n) {
        for (var k = 0; k < (n || 6); k++) {
          var a = k / (n || 6) * Math.PI * 2;
          var pts = [new T.Vector3(Math.cos(a) * rBot, y0, Math.sin(a) * rBot),
                     new T.Vector3(Math.cos(a) * rTop, y1, Math.sin(a) * rTop)];
          parent.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: 0x5f86a6, transparent: true, opacity: .55 })));
        }
      }
      function glassHi(parent, w, h, x, y, z) {
        var cv = document.createElement('canvas');
        cv.width = 64; cv.height = 256;
        var cx = cv.getContext('2d');
        var gr = cx.createLinearGradient(0, 0, 64, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(.5, 'rgba(255,255,255,.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = gr; cx.fillRect(0, 0, 64, 256);
        var tex = new T.CanvasTexture(cv);
        var m = new T.Mesh(new T.PlaneGeometry(w, h),
          new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: .5,
            depthWrite: false, blending: T.AdditiveBlending }));
        m.position.set(x, y, z); m.renderOrder = 4; parent.add(m);
      }

      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .8;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });

      /* 台面：沿用验收样板的深色环氧实验台 */
      K.bench(52, 16);

      /* 台面改哑光深色（必须在 K.bench() 之后做，台面此时才存在）：
         默认清漆 + 环境反射在掠射角会把深色台面反成浅灰，整幅失去对比 */
      /* A/B 定案：发白不是贴图也不是清漆单独的问题，而是极亮的
         scene.environment 在 MeshPhysicalMaterial 的 IBL/clearcoat 镜面层上
         把 0x171d21 反成浅灰白；压 clearcoat、压 envMapIntensity 都无效，
         换成不受环境反射的材质后整片恢复深灰。只改这一课，保留拉丝贴图
         与 PBR 高光；验收样板是俯视机位本来就不发白，不动引擎共享层。 */
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

      /* ═══ 锥形瓶（含蛋壳碎屑）═══ */
      var FX = -8, FZ = 2;
      O.flask = new T.Group();
      var prof = [
        new T.Vector2(.05, 0), new T.Vector2(3.0, 0), new T.Vector2(3.0, 3.0),
        new T.Vector2(2.3, 4.4), new T.Vector2(1.2, 5.8), new T.Vector2(1.2, 8.0)
      ];
      O.flask.add(new T.Mesh(new T.LatheGeometry(prof, 44), MAT.glass));
      glassRim(O.flask, 1.2, 8.0, .08);       /* 瓶口 */
      glassRim(O.flask, 3.0, .06, .07);       /* 瓶底 */
      glassRim(O.flask, 2.98, 3.0, .055, .6);/* 肩部转折 */
      glassSides(O.flask, 2.98, 1.2, 3.0, 8.0, 8);
      glassSides(O.flask, 3.0, 3.0, .06, 3.0, 8);
      glassHi(O.flask, .85, 5.4, -1.6, 4.0, 2.1);
      O.flask.position.set(FX, 0, FZ);
      K.scene().add(O.flask);
      /* 蛋壳碎片：薄弧片（外壳褐米、内壳瓷白），大小不一堆成一小堆。
         红片诊断证明几何一直在渲染，只是浅米色透过 .42 玻璃 + fresnel/halo
         后与亮台面同化；加深壳色、加大颗粒、堆出高度才有对比度。 */
      var shellOut = new T.MeshStandardMaterial({ color: 0x95794d, roughness: .95,
        side: T.DoubleSide, flatShading: true });
      var shellIn  = new T.MeshStandardMaterial({ color: 0xdfcea9, roughness: .88,
        side: T.DoubleSide, flatShading: true });
      O.shells = [];
      for (i = 0; i < 11; i++) {
        var c = new T.Group();
        var a = Math.random() * 6.28, rr = Math.random() * .95;
        var sz = .72 + Math.random() * .55;
        var chip = new T.Mesh(new T.SphereGeometry(sz, 9, 5, 0, 6.283, 0, 1.15), shellOut);
        chip.scale.set(1, .38, .82); c.add(chip);
        var inner = new T.Mesh(new T.SphereGeometry(sz * .88, 9, 5, 0, 6.283, 0, 1.02), shellIn);
        inner.scale.set(1, .34, .82); inner.position.y = -.055; c.add(inner);
        var lift = (i % 3 === 0) ? .34 : 0;   /* 中间几片往上叠，不是一层平铺的饼 */
        c.position.set(FX + Math.cos(a) * rr, .34 + lift + Math.random() * .12, FZ + Math.sin(a) * rr);
        c.rotation.set(Math.random() * .5 - .25, Math.random() * 6.28, Math.random() * .5 - .25);
        K.scene().add(c); O.shells.push(c);
      }
      /* 瓶内稀盐酸（随加酸上升） */
      O.acidLiq = K.liquidCyl({ r: 2.5, h: .3, x: FX, z: FZ, y0: .15, color: 0xd8ecf6, opacity: .5 });
      O.acidTop = K.liquidTop({ r: 2.5, x: FX, z: FZ, y: .45, color: 0xe8f4fb });
      O.acidTop.material.transparent = true; O.acidTop.material.opacity = .5;

      /* 分液漏斗（装稀盐酸，滴入锥形瓶）
         稀盐酸试剂瓶由 ChemKit.dress() 统一摆在左侧备料位，不再在画面右侧
         另放一个黑盖圆柱（旧机位遗留下来的突兀黑柱）。 */
      O.dropper = new T.Group();
      var db = new T.Mesh(new T.CylinderGeometry(1.5, .7, 3.4, 20), MAT.glass);
      db.position.y = 1.7; O.dropper.add(db);
      var stem = new T.Mesh(new T.CylinderGeometry(.28, .28, 2.4, 12), MAT.glass);
      stem.position.y = -1.2; O.dropper.add(stem);
      var stop = new T.Mesh(new T.TorusGeometry(.3, .1, 6, 14), MAT.steel);
      stop.position.y = -.2; stop.rotation.x = Math.PI / 2; O.dropper.add(stop);
      glassRim(O.dropper, 1.5, 3.4, .07);
      glassRim(O.dropper, .28, -2.4, .05);
      glassSides(O.dropper, .7, 1.5, 0, 3.4, 6);
      glassHi(O.dropper, .5, 3.0, -.7, 1.8, .9);
      O.dropper.position.set(FX, 10.0, FZ);
      K.scene().add(O.dropper);
      /* 铁架台：托住分液漏斗（不再悬空） */
      /* 铁架台退到锥形瓶左侧：底座右缘不得进入瓶体（瓶心 FX、底半径 3）。
         原来 x=FX-4、sx=6 → 右缘 FX-1，直接穿进瓶底。 */
      K.rbox({ x: FX - 6.6, y: .35, z: FZ, sx: 4, sy: .7, sz: 5.5, r: .1, mat: MAT.dark });
      K.cyl({ x: FX - 6.6, z: FZ, y0: .7, r: .35, h: 13, mat: MAT.steel });
      /* 横臂退到漏斗颈后方，末端用铁圈「抱住」漏斗颈，
         近景特写下不能再让一根黑杆从漏斗里横穿过去。 */
      K.rbox({ x: FX - 3.3, y: 9.6, z: FZ - .55, sx: 6.6, sy: .4, sz: .55, r: .08, mat: MAT.steel });
      K.rbox({ x: FX, y: 9.6, z: FZ - .5, sx: .5, sy: .4, sz: .5, r: .06, mat: MAT.steel });
      var clamp = new T.Mesh(new T.TorusGeometry(.46, .08, 8, 24), MAT.steel);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.set(FX, 9.6, FZ);
      clamp.name = 'funnel_clamp';
      K.scene().add(clamp);

      /* 导管：瓶口 → 水槽量筒 */
      var p0 = new T.Vector3(FX + .8, 8.0, FZ);
      var p1 = new T.Vector3(1.5, 8.5, FZ);
      var p2 = new T.Vector3(9, 4.2, FZ);
      var curve = new T.CatmullRomCurve3([p0, p1, p2]);
      O.oldDuct = new T.Mesh(new T.TubeGeometry(curve, 40, .22, 8, false), MAT.glass); K.scene().add(O.oldDuct);

      /* ═══ 水槽 + 倒立量筒（排水量气）═══ */
      var WX = 9, WZ = 2;
      /* 旧水槽/旧量筒几何已被 ChemKit 高模替代：
         全部挂进一个隐藏组，动画仍可驱动 O.ml，但 K.glassCyl 自带的
         口沿/底沿环不会再与高模叠成"两个光环"。 */
      var legacy = new T.Group(); legacy.visible = false; K.scene().add(legacy);
      O.oldTroughGroup = K.glassCyl({ r: 6.0, h: 4.0, x: WX, z: WZ, y0: 0, glassMat: MAT.glass });
      var troughRim = new T.Mesh(new T.TorusGeometry(6.0, .09, 8, 48),
        new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: .9 }));
      troughRim.rotation.x = Math.PI / 2; troughRim.position.set(WX, 4.0, WZ);
      K.scene().add(troughRim); O.oldTroughRim = troughRim;
      /* 水槽里的水：可控实心水板（避开 liquidCyl 顶面着色器在大水面的过曝） */
      O.water = new T.Mesh(new T.CylinderGeometry(5.65, 5.65, 1.8, 48),
        new T.MeshStandardMaterial({ color: 0x5fa8c6, roughness: .42, metalness: 0, transparent: true, opacity: .86, envMapIntensity: .12 }));
      O.water.position.set(WX, .9 + .1, WZ);
      K.scene().add(O.water);
      /* 倒立量筒（矮一半，口没入水下，顶部封闭瓶底） */
      var MY0 = .15, MH = 5.0;
      O.oldJarGroup = K.glassCyl({ r: 2.1, h: MH, x: WX, z: WZ, y0: MY0, glassMat: MAT.glass });
      var mcap = new T.Mesh(new T.CircleGeometry(2.1, 36), MAT.glass.clone());
      mcap.material.side = T.DoubleSide;
      mcap.rotation.x = -Math.PI / 2;
      mcap.position.set(WX, MY0 + MH - .01, WZ);
      K.scene().add(mcap); O.mcap = mcap;
      var mring = new T.Mesh(new T.TorusGeometry(2.1, .085, 10, 44),
        new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: .92 }));
      mring.rotation.x = Math.PI / 2; mring.position.set(WX, MY0 + .06, WZ);
      K.scene().add(mring); O.mring = mring;
      O.ml = K.liquidCyl({ r: 1.88, h: MH, x: WX, z: WZ, y0: MY0, color: 0x9ccadd, opacity: .5 });
      O.mlTop = K.liquidTop({ r: 1.9, x: WX, z: WZ, y: MY0 + MH, color: 0x9ccadd });
      O.mlTop.material.transparent = true; O.mlTop.material.opacity = .38;
      O.mlTop.material.roughness = .6; O.mlTop.material.metalness = 0;
      O.mlTop.material.envMapIntensity = .1;
      O.MY0 = MY0; O.MH = MH;


      /* 把旧水槽/量筒几何整体移进隐藏组（K.glassCyl 自带口沿环也会跟着隐藏） */
      var legacyKeep = [];
      K.scene().children.forEach(function (c) {
        if (c === legacy) return;
        if (c.isMesh && c.geometry && c.geometry.type === 'TorusGeometry') {
          var wp = c.getWorldPosition(new T.Vector3());
          if (Math.abs(wp.x - WX) < .1 && Math.abs(wp.z - WZ) < .1) legacyKeep.push(c);
        }
      });
      legacyKeep.forEach(function (c) { legacy.add(c); });
      /* 气泡 */
      O.bub = [];
      var bg = new T.SphereGeometry(.16, 8, 6);
      var bm = new T.MeshBasicMaterial({ color: 0xdff0f8, transparent: true, opacity: .8 });
      for (i = 0; i < 18; i++) { var b = new T.Mesh(bg, bm); b.userData.ph = Math.random(); b.visible = false; O.bub.push(b); K.scene().add(b); }

      O.labF = K.spriteLabel([FX + 4.6, 3.4, FZ + 2], '锥形瓶 + 蛋壳', { w: 4.8, fs: 36 });
      O.labW = K.spriteLabel([WX, -1.2, WZ], '水槽（排水量气）', { w: 5.0, fs: 36 });

      /* 器材投影：每件器材在台面/柜体上留下影子，物件才"落地"（样板做法） */
      K.scene().traverse(function (m) {
        if (!m.isMesh || !m.material) return;
        if (Array.isArray(m.material)) return;
        if (m.material.transparent) return;   /* 玻璃/液体/影子贴片不投影 */
        m.castShadow = true;
        m.receiveShadow = true;
      });

      /* ═══ 共用器材层接入（ChemKit 单一真源） ═══
         隐藏手搓的锥形瓶/分液漏斗/水槽/量筒，按统一尺度契约放共享高模；
         液面用器壁液位环表现（后处理下玻璃不透明，内部液柱会被挡）。 */
      (function () {
        var C = window.ChemKit;
        C.matteBench(K.scene());
        C.dress(K.scene(), { reagentX: -19, waste: false });
        /* 清掉旧 K.glassCyl 残留的口沿/底沿环：水槽与量筒各有两圈，
         与高模叠成"两个光环"。按坐标+半径精确去重，只留水槽口沿一圈。 */
      (function () {
        var rings = [];
        K.scene().traverse(function (o) {
          if (!o.isMesh || !o.geometry || o.geometry.type !== 'TorusGeometry') return;
          var wp = o.getWorldPosition(new T.Vector3());
          if (Math.abs(wp.x - WX) < .3 && Math.abs(wp.z - WZ) < .3) {
            rings.push({ o: o, r: o.geometry.parameters.radius || 0 });
          }
        });
        /* 旧 K.glassCyl 与高模 rim_bead 在同一个 y≈4、r≈6 完全重合 → 重影。
           按 (半径取整, 高度取整) 分组，每组只保留第一个，其余隐藏。 */
        var seen = {};
        rings.forEach(function (v) {
          var wy = v.o.getWorldPosition(new T.Vector3()).y;
          var key = Math.round(v.r * 2) + '_' + Math.round(wy * 2);
          if (seen[key]) v.o.visible = false;
          else seen[key] = true;
        });
      })();
      C.retrofit(O, K.scene(), {
          hide: ['flask','dropper','water','ml','mlTop','acidLiq','acidTop',
                 'mcap','mring','oldDuct','oldTroughRim',
                 'oldTroughGroup','oldJarGroup'],
          add: [
            /* 初始瓶里只有蛋壳、没有酸：给一层几乎看不见的底液，
               液面由 update 按 s.acid 抬升，否则蛋壳碎屑一开场就被液柱挡住。 */
            { id: 'flask',  x: FX, z: FZ, liquid: .04 },
            { id: 'dropFunnel', x: FX, z: FZ, y: 8.9, scaleTo: .62 },
            { id: 'trough', x: WX, z: WZ, opts: { water: .55 } },
            { id: 'gasJar', x: WX, z: WZ, y: 6.0, opts: { closedTop: false }, scaleTo: .95 }
          ]
        });
        /* 排水量气：集气瓶必须「封闭底朝上、瓶口浸在水面下」。
           高模 gasJar 是正放广口瓶（底在 y=0、口在 y=H），绕 X 轴翻 180° 后
           瓶口落到 y≈1.25（水面 2.17 以下）、封闭底升到 y≈6。
           口沿线与 fresnel 壳都是子对象，跟着父级一起翻，不会脱开。 */
        O.ck[3].rotation.x = Math.PI;
        O.ck[3].position.set(WX, 6.0, WZ);
        /* 倒扣后瓶顶必须是封闭的厚玻璃底。高模 gasJar 的 base 只是
           opacity .10 的极淡圆片，特写里读作「一圈开口」；
           换成有厚度的半透明玻璃底盘，并把极淡圆片隐藏。 */
        (function () {
          var jar = O.ck[3];
          var ob = jar.getObjectByName('base');
          if (ob) ob.visible = false;
          var bottom = new T.Mesh(new T.CylinderGeometry(1.95, 1.95, .22, 40),
            new T.MeshPhysicalMaterial({ color: 0x86b4cf, roughness: .18,
              transparent: true, opacity: .42, side: T.DoubleSide,
              depthWrite: false, clearcoat: .5, envMapIntensity: .8 }));
          bottom.position.y = .11;   /* 局部 y≈0 → 翻转后正是瓶顶 y≈5.9 */
          bottom.name = 'jar_closed_bottom';
          bottom.castShadow = false; bottom.receiveShadow = false;
          jar.add(bottom);
        })();
        /* 瓶内水柱：初始满水，CO₂ 进来把水排出、水位下降。
           这就是「量筒读数」对应的实物，旧版只动被隐藏的 O.ml，画面上什么都没发生。 */
        (function () {
          var wm = new T.MeshPhysicalMaterial({ color: 0x4595bd, roughness: .3, metalness: 0,
            transparent: true, opacity: .78, side: T.DoubleSide, depthWrite: false,
            envMapIntensity: .3 });
          O.jarWater = new T.Mesh(new T.CylinderGeometry(1.82, 1.82, 1, 40), wm);
          O.jarWater.name = 'jar_water';
          K.scene().add(O.jarWater);
          O.jarLevel = new T.Mesh(new T.TorusGeometry(1.84, .055, 8, 44),
            new T.MeshBasicMaterial({ color: 0x2f7fa8, transparent: true, opacity: .8 }));
          O.jarLevel.rotation.x = Math.PI / 2;
          O.jarLevel.name = 'jar_level';
          K.scene().add(O.jarLevel);
          /* 导管口冒出的气泡（区别于锥形瓶里反应产生的气泡） */
          O.jarBub = [];
          var bg = new T.SphereGeometry(.13, 8, 6);
          var bm = new T.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: .85 });
          for (var i = 0; i < 8; i++) {
            var b = new T.Mesh(bg, bm);
            b.userData.ph = i / 8; b.visible = false;
            O.jarBub.push(b); K.scene().add(b);
          }
        })();
        /* 开场瓶里只有蛋壳、没有酸：create() 生成的 2.8 半径液柱顶盖会把
           瓶底碎屑整片盖成一块亮白圆盘。先藏起来，加酸时由 update 显示并抬升。 */
        (function () {
          var fq = O.ck[0].getObjectByName('MAT_liquid__liquid');
          if (fq) {
            fq.visible = false;
            fq.material = new T.MeshStandardMaterial({ color: 0x6fb0cf, roughness: .35,
              metalness: 0, transparent: true, opacity: .52,
              side: T.DoubleSide, depthWrite: false, envMapIntensity: 0 });
          }
          /* liquidBand 是恒定最大半径（3.04）的圆柱带/环，套在会收缩的
             锥形瓶斜壁外会整圈穿出瓶壁；它停在 y≈2.48、而液柱顶才 y≈1.8，
             于是出现「一个空蓝环 + 一块低液面」两层盘。锥形瓶只用内部锥台。 */
          var lbg = O.ck[0].userData && O.ck[0].userData.liquidBand;
          if (lbg) lbg.visible = false;
          /* 瓶底那片极淡圆盘在平视下会和台面叠成一块亮蓝椭圆，也挡碎屑 */
          var fbase = O.ck[0].getObjectByName('base');
          if (fbase) { fbase.visible = false; fbase.castShadow = false; }
          /* 锥形瓶没有磨砂颈环：那圈 torus 和口沿线叠成「三层瓶口」 */
          var nf = O.ck[0].getObjectByName('MAT_frost__neck_frost');
          if (nf) nf.visible = false;
          /* 分液漏斗梨形壁在浅背景前几乎隐形，只剩一块孤立的蓝色液体。
             给它单独的实体淡蓝玻璃，形体才读得出来。 */
          var fb = O.ck[1].getObjectByName('MAT_glass__body');
          if (fb) fb.material = new T.MeshPhysicalMaterial({ color: 0x76aecf,
            roughness: .08, metalness: 0, transparent: true, opacity: .74,
            side: T.DoubleSide, depthWrite: false, clearcoat: .8,
            clearcoatRoughness: .08, envMapIntensity: 1.4 });
          /* 只给这一课的锥形瓶降一档叠层（共享配方不动）：
             .42 玻璃 + fresnel 1.8 + halo .26 会把瓶底蛋壳碎屑洗成一块白盘。
             A/B 实测 .28 / .8 / .10 后碎屑能读出、瓶形仍完整。 */
          function softenGlass(obj, op, uk, halo) {
            obj.traverse(function (n) {
              if (!n.isMesh || !n.material) return;
              var m = n.material;
              if (m === C.MAT.glass) { n.material = m.clone(); n.material.opacity = op; }
              else if (m.type === 'ShaderMaterial' && m.uniforms && m.uniforms.uK) {
                n.material = m.clone(); n.material.uniforms.uK.value = uk;
              } else if (m.isMeshBasicMaterial && m.side === T.BackSide &&
                         m.color && m.color.getHexString() === '6f9ec4') {
                n.material = m.clone(); n.material.opacity = halo;
              }
            });
          }
          /* 折中值：默认远景能读出蛋壳碎屑，近景特写锥形瓶也不至于整个消失。
             .28/.8/.1 太透（A/B 里瓶身没了），用 .36/1.35/.18 保住形体。 */
          softenGlass(O.ck[0], .36, 1.35, .18);
          softenGlass(O.ck[3], .34, 1.2, .16);
        })();
        O.ready = true;
        /* 分液漏斗细高且透射，光靠轮廓读不出：给它装上实验本来的稀盐酸，
             梨形体下部有实体液体后，形体立起来了。 */
        (function () {
          var df = O.ck[1];
          if (!df) return;
          df.traverse(function (n) {
            if (n.name && n.name.indexOf('MAT_rim__rim_bead') === 0) n.visible = true;
          });
          var liq = new T.Mesh(new T.CylinderGeometry(1.35, 1.28, 1.5, 28),
            new T.MeshPhysicalMaterial({ color: 0x6fb2cc, roughness: .22,
              transparent: true, opacity: .82, side: T.DoubleSide, depthWrite: false }));
          liq.position.y = 4.2; liq.name = 'funnel_liquid';
          df.add(liq);
        })();
        /* 橡皮塞：塞在锥形瓶口，导管从塞中穿出（真实装置的接法） */
        /* 上宽下窄才是橡皮塞：细端塞进瓶口，粗端留在瓶口外 */
        var stopper = new T.Mesh(new T.CylinderGeometry(.88, .62, .95, 26),
          new T.MeshStandardMaterial({ color: 0x4a4038, roughness: .88 }));
        stopper.position.set(FX, 8.42, FZ); stopper.castShadow = true;
        K.scene().add(stopper);
        /* 导管：从塞顶跨过水槽口沿，下降入水，从「瓶口下方」水平伸入后上翘进瓶内。
           旧版终点停在瓶顶上方，等于把 CO₂ 倒在封闭瓶底上，装置不成立。 */
        var ductPts = [new T.Vector3(FX, 8.95, FZ),
                       new T.Vector3(FX + 3.4, 9.5, FZ),
                       new T.Vector3(WX - 5.6, 8.0, WZ),
                       new T.Vector3(WX - 4.8, 3.2, WZ),
                       new T.Vector3(WX - 2.6, 1.05, WZ),
                       new T.Vector3(WX - 1.0, 1.05, WZ),
                       new T.Vector3(WX - 1.0, 1.95, WZ)];
        /* 细玻璃管在浅背景前若用 .42 半透明白玻璃，会糊成一条粗白塑料管。
           真实导管靠一点实体蓝灰 + 清漆高光读出圆柱，管径也收细到 .14。 */
        var ductMat = new T.MeshPhysicalMaterial({ color: 0x86b4d2, roughness: .12,
          metalness: .06, transparent: true, opacity: .82, depthWrite: false,
          clearcoat: .85, clearcoatRoughness: .08, envMapIntensity: 1.1,
          side: T.DoubleSide });
        var duct = new T.Mesh(new T.TubeGeometry(
          new T.CatmullRomCurve3(ductPts), 64, .14, 10, false), ductMat);
        duct.name = 'CHEM_DUCT';
        K.scene().add(duct);
      })();

    },

    update: function (dt, s) {
      s.t += dt;
      var si = 0;
      var idxEl = document.getElementById('sIdx');
      if (idxEl) si = (parseInt(idxEl.textContent, 10) - 1);

      O.av = ease(O.av === undefined ? 0 : O.av, s.acid, dt, 1.4);
      O.gv = ease(O.gv === undefined ? 0 : O.gv, s.gas, dt, .8);

      /* 与 setup 中水槽坐标一致（update 拿不到 setup 的局部变量） */
      var WX = 9, WZ = 2;

      /* 加酸：液体用车削体沿瓶壁轮廓生成 —— 直壁段是直筒、斜壁段按
         直线方程收锥，液面顶盖半径正好等于该高度的壁半径。
         恒半径圆柱（旧 scale.y 拉伸）或单一锥台都会与瓶壁脱开。 */
      if (O.ready && O.ck && O.ck[0]) {
        var fq = O.ck[0].getObjectByName('MAT_liquid__liquid');
        if (fq) {
          fq.visible = O.av > .03;
          var yBot = .16;
          var yTop = yBot + .16 + O.av * 2.9;   /* 加满酸后液面约 y=3.2 */
          var V2 = T.Vector2;
          var pts;
          if (yTop <= 1.15) {
            pts = [new V2(0, yBot), new V2(2.75, yBot),
                   new V2(2.75, yTop), new V2(0, yTop)];
          } else {
            /* 斜壁直线 (R=3, y=1.15) → (neckR+.25=1.3, y=6.05) */
            var yc = Math.min(6.05, yTop);
            var wall = 3.0 + (1.3 - 3.0) * (yc - 1.15) / (6.05 - 1.15);
            var rTop = Math.max(.9, wall - .10);
            pts = [new V2(0, yBot), new V2(2.75, yBot),
                   new V2(2.75, 1.15), new V2(rTop, yTop), new V2(0, yTop)];
          }
          /* 液面高度变化时才重建几何，避免每帧分配 */
          if (O.lastQh === undefined || Math.abs(yTop - O.lastQh) > .012) {
            if (fq.geometry) fq.geometry.dispose();
            fq.geometry = new T.LatheGeometry(pts, 40);
            O.lastQh = yTop;
          }
          fq.position.y = 0;       /* 几何已用绝对局部 y，无需中心偏移 */
          O.acidTopY = yTop;
        }
      }
      /* 分液漏斗梨形体里的稀盐酸随滴加减少 */
      if (O.ready && O.ck && O.ck[1]) {
        var fl = O.ck[1].getObjectByName('funnel_liquid');
        if (fl) {
          var fh = 1.5 * (1 - O.av * .6);
          fl.scale.y = fh / 1.5;
          fl.position.y = 3.45 + fh / 2;
        }
      }

      /* 气泡：反应中从瓶底上升 */
      var reacting = s.react > .5;
      for (var i = 0; i < O.bub.length; i++) {
        var b = O.bub[i];
        b.visible = reacting;
        if (reacting) {
          b.userData.ph = (b.userData.ph + dt * .6) % 1;
          var ph = b.userData.ph;
          /* 气泡只在液体内上升，不能冒出液面飘在瓶内空气里 */
          var bubTop = Math.max(.8, (O.acidTopY || 1.8) - .3);
          b.position.set(-8 + (i % 5 - 2) * .5, .4 + ph * bubTop, 2 + ((i * 7) % 5 - 2) * .4);
          b.scale.setScalar(.6 + Math.sin(ph * 6.28) * .35);
        }
      }

      /* 排水量气：瓶内水柱被 CO₂ 排出，水位下降 —— 读数对应的实物 */
      var JB0 = 1.32, JH = 4.25;
      var jh = Math.max(.05, JH * (1 - O.gv));
      if (O.jarWater) {
        O.jarWater.scale.y = jh;
        O.jarWater.position.set(WX, JB0 + jh / 2, WZ);
      }
      if (O.jarLevel) {
        O.jarLevel.position.set(WX, JB0 + jh, WZ);
        O.jarLevel.visible = O.gv < .98;
      }
      /* 导管口气泡：从瓶口下方向上冒到瓶内水面 */
      if (O.jarBub) {
        for (var j = 0; j < O.jarBub.length; j++) {
          var jb = O.jarBub[j];
          jb.visible = reacting && O.gv < .99;
          if (jb.visible) {
            jb.userData.ph = (jb.userData.ph + dt * .55) % 1;
            var jp = jb.userData.ph;
            jb.position.set(WX - 1 + (j % 3 - 1) * .24,
              1.9 + jp * Math.max(.3, jh - .55),
              WZ + ((j * 5) % 3 - 1) * .24);
            jb.scale.setScalar(.55 + Math.sin(jp * 6.28) * .3);
          }
        }
      }

      O.labF.sprite.visible = (si <= 4);
      O.labW.sprite.visible = (si >= 4);
    }
  };

  K.boot({
    title: '测定鸡蛋壳中碳酸钙的含量',
    chip: '化学 · 鲁教版 · 九年级下册 · 学生实验10',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 6, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
    postfx: true,

    reads: [['m', '样品质量'], ['v', 'CO₂ 体积'], ['w', '碳酸钙含量']],
    values: function (s) {
      /* 读数由模型反算：先量体积 → 物质的量 → CaCO₃ 质量 → 质量分数 */
      var v = s.gas * VMAX;
      var n = v / VM;
      var w = n * M_CACO3 / SAMPLE;
      return {
        m: SAMPLE.toFixed(1) + ' g',
        v: v.toFixed(0) + ' mL',
        w: s.gas > .95 ? (w * 100).toFixed(0) + ' %' : '—'
      };
    },

    steps: [
      {
        name: '实验原理',
        cam: { tx: 6, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '鸡蛋壳里的碳酸钙，怎么「量」出来？',
        ask: '为什么可以用生成的二氧化碳来算碳酸钙？',
        body: '<p>鸡蛋壳的主要成分是<b>碳酸钙（CaCO₃）</b>。</p>' +
          '<p><b>原理：</b>CaCO₃ + 2 HCl → CaCl₂ + H₂O + <b>CO₂↑</b></p>' +
          '<p>碳酸钙全部变成 CO₂，所以<b>量出 CO₂ 的量，就能反推 CaCO₃ 的量</b>（n(CaCO₃) = n(CO₂)）。</p>',
        apply: function (s) { s.acid = 0; s.react = 0; s.gas = 0; }
      },
      {
        name: '装置与称样',
        cam: { tx: -7, ty: 4.8, tz: 2, dist: 26, yaw: .1, pitch: .16 },
        title: '称取 2.0 g 蛋壳，装入锥形瓶',
        ask: '为什么要把蛋壳捣碎？',
        body: '<p><b>称样：</b>鸡蛋壳洗净、干燥、<b>捣碎</b>，称取约 2.0 g 装入锥形瓶。</p>' +
          '<p><b>捣碎的原因：</b>增大接触面积，让反应更快、更完全。</p>' +
          '<p><b>装置：</b>锥形瓶 + 分液漏斗（装稀盐酸）+ 导管 + 水槽中<b>倒扣的集气瓶</b>（排水量气，瓶口浸在水面下）。</p>',
        apply: function (s) { s.acid = 0; s.react = 0; s.gas = 0; }
      },
      {
        name: '加酸反应',
        cam: { tx: -7, ty: 4.8, tz: 2, dist: 24, yaw: .18, pitch: .16 },
        title: '滴加稀盐酸，蛋壳上冒气泡',
        ask: '看到什么现象说明反应在进行？',
        body: '<p><b>操作：</b>打开分液漏斗，让稀盐酸慢慢滴入锥形瓶。</p>' +
          '<p><b>现象：</b>蛋壳表面<b>产生大量气泡</b>，气泡逸出——这就是 CO₂。</p>' +
          '<p><b>提醒：</b>加酸要慢，让气体平稳排出，否则量气不准。</p>',
        apply: function (s) { s.acid = 1; s.react = 1; s.gas = 0; }
      },
      {
        name: '排水量气',
        cam: { tx: 9, ty: 4.5, tz: 2, dist: 19, yaw: -.1, pitch: .22 },
        title: '气体把水排出，读排出水的体积',
        ask: '为什么用排水法量气体，而不是直接看质量？',
        body: '<p><b>量气：</b>CO₂ 从瓶口进入倒扣的集气瓶，把瓶内的水排出，<b>瓶内水面下降</b>，排出水的体积就是 CO₂ 体积。</p>' +
          '<p><b>边界声明：</b>CO₂ 会溶于水，用纯水排水会使测得体积<b>偏小</b>；定量实验常用<b>饱和 NaHCO₃ 溶液</b>代替水，或用注射器／量气管直接量体积。</p>' +
          '<p><b>读数：</b>待反应结束、气体冷却到室温再读，视线与凹液面最低处相平。</p>',
        apply: function (s) { s.acid = 1; s.react = 1; s.gas = 1; }
      },
      {
        name: '计算含量',
        cam: { tx: 0, ty: 6.5, tz: 2, dist: 47, yaw: .22, pitch: .28 },
        title: '由 CO₂ 反推碳酸钙含量',
        ask: '样品 2.0 g，量得 CO₂，怎么算 CaCO₃ 质量分数？',
        body: '<p><b>步骤：</b><br>' +
          '① n(CO₂) = V(CO₂) ÷ Vm<br>' +
          '② n(CaCO₃) = n(CO₂)<br>' +
          '③ m(CaCO₃) = n × 100 g/mol<br>' +
          '④ w(CaCO₃) = m(CaCO₃) ÷ 2.0 g × 100%</p>' +
          '<p>例如量得 CO₂ 约 <b>403 mL</b>（标准状况，V<sub>m</sub> = 22.4 L/mol）：' +
          'n = 0.403 L ÷ 22.4 L/mol ≈ 0.018 mol → m(CaCO₃) ≈ 1.80 g → w ≈ 90%。</p>' +
          '<p><b>注意：</b>若按室温 V<sub>m</sub> ≈ 24 L/mol，同一份样品应为约 432 mL；' +
          '算体积与算含量必须用<b>同一个 V<sub>m</sub></b>，不能混用。</p>',
        quiz: true
      },
      {
        name: '误差分析',
        cam: { tx: -7, ty: 5.0, tz: 2, dist: 27, yaw: .15, pitch: .16 },
        title: '结果偏高或偏低，差在哪？',
        ask: '哪些操作会让测得的含量偏大？',
        body: '<p><b>偏低：</b>反应不完全（蛋壳太大、酸不足）、气体泄漏、CO₂ 溶于排水液。</p>' +
          '<p><b>偏高：</b>装置内原有空气受热膨胀被计入、读数时未冷却。</p>' +
          '<p><b>改进：</b>检查气密性、缓慢加酸、用饱和 NaHCO₃ 溶液代替纯水排水、反应完全后冷却再读数。</p>',
        quiz: true
      },
      {
        name: '小结',
        cam: { tx: 0, ty: 6.5, tz: 2, dist: 47, yaw: .22, pitch: .28 },
        title: '气体法测含量：守恒是关键',
        ask: '这个实验最核心的思想是什么？',
        body: '<p><b>核心：</b>利用<b>元素守恒</b>——碳酸钙里的碳全部变成 CO₂ 里的碳，所以 n(CaCO₃)=n(CO₂)。</p>' +
          '<p>测定物质含量，常把「测不到的量」转化成「能测的量」（这里是气体体积）。</p>',
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        { q: '鸡蛋壳与稀盐酸反应生成的气体是？', opts: ['CO₂', 'O₂', 'H₂', 'Cl₂'], ans: 'CO₂', why: 'CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑。' },
        { q: '为什么 n(CaCO₃) = n(CO₂)？', opts: ['碳元素守恒', '质量相等', '体积相等', '都是气体'], ans: '碳元素守恒', why: '每个 CaCO₃ 里的碳全部变成一个 CO₂ 的碳。' },
        { q: '蛋壳捣碎的目的？', opts: ['增大接触面积、反应更完全', '好看', '减小质量', '防止飞溅'], ans: '增大接触面积、反应更完全', why: '接触面积大，反应更快更充分。' },
        { q: '下列哪种情况会使结果偏低？', opts: ['气体泄漏', '读数未冷却', '装置有空气受热膨胀', '加酸过快'], ans: '气体泄漏', why: '气体泄漏使测得的 CO₂ 偏少，含量偏低。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
