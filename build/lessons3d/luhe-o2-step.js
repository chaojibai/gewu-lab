/* 格物实验室 · 氧气的实验室制取与性质（three.js 单文件课件）
   鲁教版 八年级全一册 · 学生实验3
   装置：固体加热型（高锰酸钾）→ 导管 → 排水法收集（水槽 + 集气瓶）
   现象：酒精灯加热出气泡 → 集气瓶排水集气 → 带火星木条复燃 → 木炭在氧气中燃烧 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    heat: 0,        /* 酒精灯是否点燃 0/1 */
    bubbles: 0,     /* 是否开始产生氧气 0/1 */
    collected: 0,   /* 集气瓶中气体体积比例 0..1 */
    test: 0,        /* 是否用带火星木条检验 */
    charcoal: 0,    /* 木炭是否在氧气中燃烧 */
    t: 0
  };

  var O = {};

  function ease(cur, tgt, dt, sp) {
    var k = Math.min(1, dt * (sp || 3));
    var v = cur + (tgt - cur) * k;
    if (Math.abs(tgt - v) < 1e-3) v = tgt;
    return v;
  }

  /* —— 装置几何规划（台面 y=0）——
     试管：高模 testTube（H8 / r1.35），几何中心 (-11.4, 4.35, 4)，管口朝右下倾 .30 rad。
           闭口端 (-15.22, 5.53)，管口 (-7.58, 3.17)；倾斜后管底最低点 y≈4.18。
     铁架台：底座在试管后方（z=0.6），立杆 x=-18.2；横臂从后方斜伸到夹点 (-10.06,3.94)，
             两圈夹爪抱住试管，位置在距管口约 1/3 处（不是管中央，也不穿管）。
     酒精灯：(-14.9, 0, 4) scale .85（灯芯顶 y≈2.65），外焰尖 y≈4.20 正对管底。
     导管：管口 → 越过水槽口沿 → 集气瓶口下方 y≈1.06（气体从瓶口升进瓶内）。
     水槽 (10,0,0) r6 h4，水面 y≈2.41；集气瓶倒扣，瓶口 y≈1.17 没在水面下。
     检验/性质：集气瓶必须取出、翻正才可能"伸入瓶内"，放到台面右侧 (18.4, 0, 2.2)。 */
  var RIG = {
    tubeCx: -11.4, tubeCy: 4.35, tubeCz: 4.0,
    tubeLen: 8, tubeR: 1.35, tilt: .30,
    rodX: -18.2, rodZ: .6,
    lampX: -14.9, lampZ: 4.0, lampS: .85, flameY: 2.66, flameH: 1.86,
    troughX: 10, troughZ: 0, water: .72,
    jarX: 10, jarZ: 0, jarS: .95, jarY: 3.545,
    homeX: 18.4, homeZ: 2.2
  };
  RIG.ux = Math.cos(RIG.tilt); RIG.uy = Math.sin(RIG.tilt);
  /* 管口 / 夹点由倾斜角推出，不手填坐标 */
  RIG.mouth = [RIG.tubeCx + RIG.tubeLen / 2 * RIG.ux, RIG.tubeCy - RIG.tubeLen / 2 * RIG.uy];
  RIG.clamp = [RIG.tubeCx + 1.4 * RIG.ux, RIG.tubeCy - 1.4 * RIG.uy];

  var scene = {
    setup: function () {
      var i, R = RIG, C = window.ChemKit, CM = C.MAT;
      /* 器材材质统一走共用器材层（0.02 m/unit 契约），课件不再自带一套玻璃配方 */
      var MAT = {
        glass: CM.glass,
        steel: CM.metal,
        dark: CM.metalD,
        rubber: CM.rubber,
        wood: new T.MeshStandardMaterial({ color: 0xc08a4a, roughness: .82, metalness: .02 }),
        kmno4: new T.MeshStandardMaterial({ color: 0x36144e, roughness: .58, metalness: .04,
          flatShading: true, envMapIntensity: .18 }),
        cotton: new T.MeshStandardMaterial({ color: 0xf4f2ea, roughness: .96, metalness: 0 }),
        /* 木炭在氧气里"发白光"——发光的是炭本身，不是一团火苗。
           炭块做成自发光白热体（>1 才有 bloom），外圈再补一小团暖白火。 */
        charcoal: new T.MeshStandardMaterial({ color: 0x2a211b, roughness: .95, metalness: 0,
          flatShading: true, envMapIntensity: .1,
          emissive: new T.Color(0xfff2dc), emissiveIntensity: 1.05 }),
        ember: new T.MeshBasicMaterial({ color: 0xff7a2a })
      };
      O.MAT = MAT;

      K.envRoom();
      /* 板书换成本课要点（引擎黑板已不写具体物质，这里按本课写实） */
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
        var ga = x.createLinearGradient(0, 0, 0, 512);
        ga.addColorStop(0, '#31493f'); ga.addColorStop(1, '#283d35');
        x.fillStyle = ga; x.fillRect(0, 0, 1024, 512);
        x.globalAlpha = .08; x.strokeStyle = '#e8f0ea'; x.lineWidth = 4; x.lineCap = 'round';
        for (var k = 0; k < 6; k++) {
          var x0 = 60 + Math.random() * 800, y0 = 60 + Math.random() * 400;
          x.beginPath(); x.moveTo(x0, y0);
          x.lineTo(x0 + 60 + Math.random() * 110, y0 + (Math.random() - .5) * 30); x.stroke();
        }
        x.globalAlpha = .94; x.fillStyle = '#eef5ee';
        x.font = 'bold 44px "Microsoft YaHei", Georgia, serif';
        x.fillText('氧气的实验室制取与性质', 60, 76);
        x.font = '36px "Microsoft YaHei", Georgia, serif';
        x.fillText('药品：KMnO₄（暗紫）+ 管口一团棉花', 70, 150);
        x.fillText('原理：2KMnO₄ △→ K₂MnO₄ + MnO₂ + O₂↑', 70, 214);
        x.fillText('装置：固体加热型 — 管口略向下倾斜', 70, 278);
        x.fillText('收集：排水法（O₂ 不易溶于水）', 70, 342);
        x.fillText('检验：带火星木条伸入瓶内 → 复燃', 70, 406);
        x.fillText('收尾：先撤导管，再熄灯（防倒吸）', 70, 470);
        var tx = new T.CanvasTexture(cv); tx.encoding = T.sRGBEncoding;
        board.material.map = tx; board.material.needsUpdate = true;
      })();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .8;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });

      /* ═══ 实验台：深色环氧台面（白台面配白墙会整幅发白）═══ */
      K.bench(50, 16);
      /* 极亮 scene.environment 会在 MeshPhysicalMaterial 的 IBL/clearcoat
         镜面层把 0x171d21 反成浅灰白（掠射角尤其明显）。保留拉丝贴图、关环境反射。 */
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

      /* ═══ 铁架台：底座/立杆退到试管后方，横臂斜伸到夹点 ═══
         旧版立杆 x=-12.9 正好落在试管长度范围内（-15.2…-7.6），
         视觉上是一根白杆从管身中间穿过去；横臂在 z+1.2 也从管前横穿。 */
      K.rbox({ x: R.rodX, y: .35, z: R.rodZ, sx: 4.4, sy: .7, sz: 4.4, r: .1, mat: MAT.dark });
      K.cyl({ x: R.rodX, z: R.rodZ, y0: .7, r: .34, h: 7.2, mat: MAT.steel });
      (function () {
        var dx = R.clamp[0] - R.rodX, dz = R.tubeCz - R.rodZ;
        var len = Math.sqrt(dx * dx + dz * dz);
        var ux = dx / len, uz = dz / len;
        var ay = R.clamp[1], ry = -Math.atan2(uz, ux);
        /* 臂端停在夹座外侧（距管轴 2.25）；夹座再伸到夹爪外缘，
           这样"杆—座—爪"三段接得上，不会像旧版那样杆端悬在管壁外。 */
        var ex = R.clamp[0] - ux * 2.25, ez = R.tubeCz - uz * 2.25;
        var arm = new T.Mesh(new T.BoxGeometry(len - 2.25, .34, .46), MAT.steel);
        arm.position.set((R.rodX + ex) / 2, ay, (R.rodZ + ez) / 2);
        arm.rotation.y = ry;
        K.scene().add(arm);
        var holder = new T.Mesh(new T.BoxGeometry(.95, .8, .9), MAT.dark);
        holder.position.set(R.clamp[0] - ux * 1.62, ay, R.tubeCz - uz * 1.62);
        holder.rotation.y = ry;
        K.scene().add(holder);
        var boss = new T.Mesh(new T.BoxGeometry(.92, .82, .82), MAT.dark);
        boss.position.set(R.rodX, ay, R.rodZ);
        K.scene().add(boss);
      })();

      /* ═══ 试管总成（高模；药品/棉花/橡皮塞/夹爪都是它的子件，随倾斜一起动）═══ */
      O.rig = new T.Group();                 /* rig 原点 = 试管几何中心 */
      var tube = C.create('testTube', { scale: 1 });
      tube.position.y = -R.tubeLen / 2;
      O.rig.add(tube);
      O.tube = tube;
      /* 近景特写：共享玻璃配方在"沿管轴掠射"时正反两层叠加 + 高光，
         整根管子会糊成一块奶白。只给这一课的试管局部压一档镜面反射，
         共享层已验收的配方不动（粗盐课的烧杯同法）。 */
      (function () {
        var soft = CM.glass.clone();
        soft.clearcoat = .16; soft.clearcoatRoughness = .62;
        soft.envMapIntensity = .42; soft.roughness = .26;
        if ('specularIntensity' in soft) soft.specularIntensity = .4;
        tube.traverse(function (n) {
          if (n.isMesh && n.name && n.name.indexOf('MAT_glass__') === 0) n.material = soft;
        });
        /* outline() 自带的高光片是"平板"，8 单位长的试管上会读成贴着
           一条白色胶带；试管的形体交给 fresnel 壳与口沿细线。 */
        var ol = tube.userData && tube.userData.outline;
        if (ol) {
          ol.children.slice().forEach(function (n) {
            if (n.isMesh && n.geometry && n.geometry.type === 'PlaneGeometry') n.visible = false;
          });
        }
      })();
      /* 高锰酸钾：铺在闭口端管底的暗紫粉末堆。
         试管倾斜后"世界向下"在试管本地坐标里是 +X 方向（本地 +Y 指向管口），
         所以药堆贴 +X 半壁、靠本地 y 0.45…2.75（闭口端），不是悬空葡萄串。 */
      var kg = new T.OctahedronGeometry(.105, 0);
      for (i = 0; i < 130; i++) {
        var bit = new T.Mesh(kg, MAT.kmno4);
        var ly = .44 + Math.random() * 2.2;
        var lr = Math.random() * .5;
        bit.position.set(.62 + lr * .52, ly, (Math.random() - .5) * 1.45);
        bit.scale.setScalar(.5 + Math.random() * .6);
        bit.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        tube.add(bit);
      }
      /* 管口棉花团：堵在导管口前，防粉末进导管 */
      for (i = 0; i < 7; i++) {
        var cw = new T.Mesh(new T.SphereGeometry(.33, 10, 8), MAT.cotton);
        cw.position.set((Math.random() - .5) * .95, 6.45 + Math.random() * .4,
          (Math.random() - .5) * 1.5);
        cw.scale.set(.9, 1.15, 1);
        tube.add(cw);
      }
      /* 单孔橡皮塞：塞在管口，导管从塞中间穿出（原来是光管口直接出导管） */
      var stopper = new T.Mesh(new T.CylinderGeometry(1.24, 1.04, 1.15, 22), MAT.rubber);
      stopper.position.y = 7.95;
      tube.add(stopper);
      /* 夹爪：两圈钢环抱住试管，位置在本地 y=1.4（距管口约 1/3） */
      [.9, 1.9].forEach(function (cy2) {
        var jaw = new T.Mesh(new T.TorusGeometry(R.tubeR + .09, .12, 8, 26), MAT.steel);
        jaw.rotation.x = Math.PI / 2;
        jaw.position.y = cy2;
        O.rig.add(jaw);
      });
      O.rig.position.set(R.tubeCx, R.tubeCy, R.tubeCz);
      O.rig.rotation.z = -(Math.PI / 2 + R.tilt);   /* 本地 +Y（管口）转向右下 */
      K.scene().add(O.rig);

      /* ═══ 酒精灯（高模）+ 外焰：外焰尖正好舔到管底 y≈4.18 ═══ */
      var lamp = C.create('lamp', { scale: R.lampS });
      C.place(lamp, R.lampX, R.lampZ);
      K.scene().add(lamp);
      O.lamp = lamp;
      O.flame = K.shaderFlame({ x: R.lampX, y: R.flameY, z: R.lampZ,
        r: .62, h: R.flameH, light: 1.3, dist: 13 });
      /* 火焰在玻璃之后绘制：否则被试管玻璃的半透明"洗"没 */
      O.flame.mesh.traverse(function (m) { m.renderOrder = 5; });

      /* ═══ 导管：管口 → 越过水槽口沿 → 倒扣瓶口下方 ═══
         末端必须从瓶口（口在瓶底侧，y≈1.17）下方进入，不能从瓶壁穿过去。 */
      var curve = new T.CatmullRomCurve3([
        new T.Vector3(R.mouth[0] + .30, R.mouth[1] - .10, R.tubeCz),
        new T.Vector3(-5.2, 4.3, 3.9),
        new T.Vector3(-1.6, 6.8, 3.4),
        new T.Vector3(2.2, 7.5, 2.8),
        new T.Vector3(5.4, 6.4, 1.9),
        new T.Vector3(7.0, 3.6, 1.05),
        new T.Vector3(8.1, .95, .75),
        new T.Vector3(9.3, .85, .50),
        new T.Vector3(9.92, 1.18, .45)
      ]);
      var duct = new T.Mesh(new T.TubeGeometry(curve, 84, .21, 12, false), MAT.glass);
      duct.renderOrder = 3;
      K.scene().add(duct);

      /* ═══ 水槽（高模，单层壁 + 菲涅尔水面）═══ */
      var trough = C.create('trough', { scale: 1, water: R.water });
      C.place(trough, R.troughX, R.troughZ);
      K.scene().add(trough);
      O.troughCk = trough;

      /* ═══ 集气瓶（高模，倒扣）：口朝下没在水里，气体从瓶口进、把水排出 ═══
         rig 原点 = 瓶中心，翻转绕中心转（绕瓶底转会让瓶口扫出一个大弧）。 */
      O.jarRig = new T.Group();
      var jar = C.create('gasJar', { scale: R.jarS });
      jar.position.y = -2.375;               /* H = 5.0*.95 = 4.75，中心下移半个瓶高 */
      O.jarRig.add(jar);
      O.jar = jar;
      (function () {
        /* 高模 base 只是 opacity .10 的极淡圆片，翻过来读作"一圈开口"。
           倒扣时补一块有厚度的玻璃底盘堵住瓶顶；正放时它压在瓶底，
           会被 IBL 反成一块白瓷盘，所以按状态显隐（见 update）。 */
        var disc = new T.Mesh(new T.CylinderGeometry(1.95, 1.95, .22, 40),
          new T.MeshPhysicalMaterial({ color: 0x7fa9c4, roughness: .22,
            transparent: true, opacity: .26, side: T.DoubleSide,
            depthWrite: false, clearcoat: .25, envMapIntensity: .35 }));
        disc.position.y = .11;
        disc.name = 'jar_closed_bottom';
        jar.add(disc);
        O.jarBase = disc;
      })();
      /* 瓶内水柱：满水 → 气体进来水位下降。水柱是 rig 的子件，
         随瓶一起翻转，不用每帧自己算世界坐标。 */
      (function () {
        var wm = new T.MeshPhysicalMaterial({ color: 0x4595bd, roughness: .3,
          metalness: 0, transparent: true, opacity: .72, side: T.DoubleSide,
          depthWrite: false, envMapIntensity: .3 });
        O.jarWater = new T.Mesh(new T.CylinderGeometry(1.78, 1.78, 1, 40), wm);
        O.jarRig.add(O.jarWater);
        O.jarLevel = new T.Mesh(new T.TorusGeometry(1.80, .055, 8, 44),
          new T.MeshBasicMaterial({ color: 0x2f7fa8, transparent: true, opacity: .8 }));
        O.jarLevel.rotation.x = Math.PI / 2;
        O.jarRig.add(O.jarLevel);
      })();
      O.jarRig.position.set(R.jarX, R.jarY, R.jarZ);
      O.jarRig.rotation.x = Math.PI;          /* 口朝下 */
      K.scene().add(O.jarRig);

      /* ═══ 气泡：从导管末端升起，穿过瓶口进入瓶内 ═══ */
      O.bub = [];
      var bg = new T.SphereGeometry(.19, 8, 6);
      var bm = new T.MeshBasicMaterial({ color: 0xeaf6fc, transparent: true, opacity: .85 });
      for (i = 0; i < 18; i++) {
        var b = new T.Mesh(bg, bm);
        b.userData.ph = Math.random();
        b.visible = false;
        O.bub.push(b);
        K.scene().add(b);
      }
      /* 两件器材：检验用「带火星木条」，性质·木炭用「坩埚钳夹黑色木炭块」。
         两步的现象——橙黄火焰烧木条 vs 黑色炭块发白光——一眼可辨。 */
      O.stick = new T.Group();               /* 原点 = 木条端头 */
      var sw = new T.Mesh(new T.CylinderGeometry(.085, .085, 4.4, 8), MAT.wood);
      sw.rotation.z = -.28;
      sw.position.set(.60, 2.16, 0);
      O.stick.add(sw);
      /* 端头火星：检验步骤用（带火星木条） */
      O.stickEm = new T.Mesh(new T.SphereGeometry(.16, 12, 10), MAT.ember);
      O.stickEm.material.toneMapped = false;   /* 火星要顶格亮，不被 ACES 压灰 */
      O.stickEm.position.set(0, .04, 0);
      O.stick.add(O.stickEm);
      O.stick.visible = false;
      K.scene().add(O.stick);
      /* 坩埚钳夹木炭：两条金属臂 + 铰点 + 内弯夹爪，炭块白热发光时是唯一亮源 */
      O.tongs = new T.Group();
      var armMat = new T.MeshStandardMaterial({ color: 0xb9c2cb, roughness: .28, metalness: .85, envMapIntensity: .9 });
      var armL = new T.Mesh(new T.CylinderGeometry(.055, .055, 3.2, 10), armMat);
      armL.position.set(-.11, 1.55, 0); armL.rotation.z = .05;
      O.tongs.add(armL);
      var armR = new T.Mesh(new T.CylinderGeometry(.055, .055, 3.2, 10), armMat);
      armR.position.set(.11, 1.55, 0); armR.rotation.z = -.05;
      O.tongs.add(armR);
      var hinge = new T.Mesh(new T.SphereGeometry(.10, 10, 8), armMat);
      hinge.position.set(0, 2.45, 0);
      O.tongs.add(hinge);
      var clawL = new T.Mesh(new T.BoxGeometry(.10, .36, .10), armMat);
      clawL.position.set(-.28, -.10, 0); clawL.rotation.z = .5;
      O.tongs.add(clawL);
      var clawR = new T.Mesh(new T.BoxGeometry(.10, .36, .10), armMat);
      clawR.position.set(.28, -.10, 0); clawR.rotation.z = -.5;
      O.tongs.add(clawR);
      O.coal = new T.Mesh(new T.DodecahedronGeometry(.60, 0), MAT.charcoal);
      O.coal.position.set(0, -.34, 0);
      O.tongs.add(O.coal);
      O.tongs.rotation.z = -.28;
      O.tongs.visible = false;
      K.scene().add(O.tongs);
      /* 复燃：火星伸进纯氧后要真的烧起来——木条本身就是燃料，复燃的视觉是
         「端头燃起一大团橙黄火焰」，小到只有一个亮点读不出"复燃"。 */
      O.tipFlame = K.shaderFlame({ x: R.homeX, y: 3.4, z: R.homeZ,
        r: .52, h: 2.4, light: .75, dist: 10 });
      O.tipFlame.mesh.traverse(function (m) { m.renderOrder = 5; });
      O.tipFlame.setLit(0);

      O.coalFlame = K.shaderFlame({ x: R.homeX, y: 4.0, z: R.homeZ,
        r: .75, h: 2.0, light: .9, dist: 12 });
      /* 木炭在氧气里发白光：把火焰色温整体推到白 */
      /* 白光火焰在浅色玻璃前会"白上白"看不见，色值推到 >1 才有 bloom 光晕 */
      O.coalFlame.mat.uniforms.uHot.value.set(1.75, 1.72, 1.6);
      O.coalFlame.mat.uniforms.uMid.value.set(1.6, 1.15, .68);
      O.coalFlame.mat.uniforms.uLow.value.set(.95, .96, 1.0);
      O.coalFlame.mesh.traverse(function (m) { m.renderOrder = 5; });
      O.coalFlame.setLit(0);

      /* ═══ 接触阴影 ═══ */
      K.blob({ x: R.rodX, z: R.rodZ, r: 3.6, y: .02 });
      K.blob({ x: R.lampX, z: R.lampZ, r: 2.2, y: .02 });
      K.blob({ x: R.troughX, z: R.troughZ, r: 6.8, y: .02 });

      /* ═══ 标注（贴各自器材，按步骤取舍）═══ */
      O.labStand = K.spriteLabel([R.rodX, 9.0, R.rodZ], '铁架台 · 试管夹', { w: 5.4, fs: 38 });
      O.labTube = K.spriteLabel([R.tubeCx - 1.0, 8.4, R.tubeCz], '试管 · 高锰酸钾 + 棉花', { w: 6.4, fs: 38 });
      O.labLamp = K.spriteLabel([R.lampX - 3.4, 3.2, R.lampZ], '酒精灯（外焰加热）', { w: 5.4, fs: 38 });
      O.labTrough = K.spriteLabel([R.troughX + 4.2, 4.9, R.troughZ + 4.6], '水槽', { w: 3.0, fs: 38 });
      O.labJar = K.spriteLabel([R.jarX - 4.4, 7.2, R.jarZ], '集气瓶（排水法）', { w: 5.2, fs: 38 });
      O.labSplint = K.spriteLabel([R.homeX - 3.2, 6.9, R.homeZ], '带火星木条', { w: 4.2, fs: 38 });
      O.labTongs = K.spriteLabel([R.homeX - 3.2, 6.9, R.homeZ], '坩埚钳 · 木炭', { w: 4.6, fs: 38 });

      /* 器材投影：每件器材在台面/柜体上留下影子，物件才"落地"（样板做法） */
      K.scene().traverse(function (m) {
        if (!m.isMesh || !m.material) return;
        if (Array.isArray(m.material)) return;
        if (m.material.transparent) return;   /* 玻璃/液体/影子贴片不投影 */
        m.castShadow = true;
        m.receiveShadow = true;
      });

      /* ═══ 共用器材层接入（陈设 + 后处理/光照修正）═══ */
      C.dress(K.scene(), { reagentX: -21.5, reagentZ: -5, wasteX: 22.6, wasteZ: -6.4 });
      C.retrofit(O, K.scene(), {});
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      var si = 0;
      var idxEl = document.getElementById('sIdx');
      if (idxEl) si = (parseInt(idxEl.textContent, 10) - 1);
      var R = RIG;

      /* 火焰强度缓动 */
      O.heatVis = ease(O.heatVis === undefined ? 0 : O.heatVis, s.heat, dt, 2.4);
      O.flame.setLit(O.heatVis);
      O.flame.tick(s.t);

      /* ── 集气瓶：取出水面 → 翻正 → 落到台面右侧 ──
         检验/性质两步要"伸入瓶内"，瓶口朝下时根本插不进去；
         所以先按真实操作取出、翻转、正放。 */
      var jvT = (s.test > .5 || s.charcoal > .5) ? 1 : 0;
      O.jarV = ease(O.jarV === undefined ? 0 : O.jarV, jvT, dt, 1.5);
      var v = O.jarV, jx, jy, jz, jr;
      if (v < .34) {                                   /* ① 垂直提出水面 */
        var k1 = v / .34;
        jx = R.jarX; jz = R.jarZ;
        jy = R.jarY + k1 * 2.75;
        jr = Math.PI;
      } else if (v < .78) {                            /* ② 横移 + 翻正 */
        var k2 = (v - .34) / .44;
        jx = R.jarX + (R.homeX - R.jarX) * k2;
        jz = R.jarZ + (R.homeZ - R.jarZ) * k2;
        jy = R.jarY + 2.75;
        jr = Math.PI * (1 - k2);
      } else {                                         /* ③ 落到台面 */
        var k3 = (v - .78) / .22;
        jx = R.homeX; jz = R.homeZ;
        jy = (R.jarY + 2.75) + (2.375 - (R.jarY + 2.75)) * k3;
        jr = 0;
      }
      O.jarRig.position.set(jx, jy, jz);
      O.jarRig.rotation.x = jr;
      /* 厚玻璃底盘只在倒扣时用（那时它是瓶顶）；正放时贴在瓶底，
         会被 IBL 反成一块白瓷盘，直接关掉，只留高模自带的极淡 base。 */
      if (O.jarBase) O.jarBase.visible = jr > 1.5;

      /* 瓶内水柱：气体把水往下压 */
      O.colVis = ease(O.colVis === undefined ? 0 : O.colVis, s.collected, dt, .55);
      var wh = Math.max(.02, 4.40 * (1 - O.colVis));
      var showW = v < .5 && O.colVis < .995;
      O.jarWater.visible = showW;
      O.jarLevel.visible = showW;
      if (showW) {
        O.jarWater.scale.y = wh;
        O.jarWater.position.y = 2.335 - wh / 2;
        O.jarLevel.position.y = 2.335 - wh;
      }

      /* 气泡：导管末端 → 瓶口 → 瓶内水面 */
      var rising = s.heat > .5 && s.bubbles > .5 && v < .5;
      var surfY = R.jarY - 2.335 + wh;
      for (var i = 0; i < O.bub.length; i++) {
        var b = O.bub[i];
        b.visible = rising;
        if (!rising) continue;
        b.userData.ph = (b.userData.ph + dt * .38) % 1;
        var ph = b.userData.ph;
        var ang = i * 2.399;
        b.position.set(
          9.92 + Math.cos(ang) * .55 * ph,
          1.18 + ph * (surfY - 1.18),
          .45 + Math.sin(ang) * .55 * ph);
        b.scale.setScalar(.75 + Math.sin(ph * 6.28) * .25 + ph * .5);
      }

      /* 检验（带火星木条复燃）与性质（坩埚钳夹木炭发白光）是两件器材、两种现象 */
      var stickOn = s.test > .5, coalOn = s.charcoal > .5;
      O.stickV = ease(O.stickV === undefined ? 0 : O.stickV, (stickOn || coalOn) ? 1 : 0, dt, 2.2);
      O.stick.visible = stickOn;          /* 按状态门控，不靠缓动衰减留残影 */
      O.tongs.visible = coalOn;
      if (stickOn || coalOn) {
        var sy = (coalOn ? 3.20 : 3.45) + (1 - O.stickV) * 2.8;
        O.stick.position.set(R.homeX + .55, sy, R.homeZ + .25);
        O.tongs.position.set(R.homeX + .55, sy, R.homeZ + .25);
        if (stickOn) {
          O.stickEm.material.color.setRGB(1, .26 + Math.sin(s.t * 16) * .12, .04);
          O.stickEm.scale.setScalar(1 + Math.sin(s.t * 11) * .12);
        }
        O.coalFlame.mesh.position.set(R.homeX + .55, sy - .10, R.homeZ + .25);
        O.tipFlame.mesh.position.set(R.homeX + .55, sy + .04, R.homeZ + .25);
      }
      O.coalFlame.setLit(coalOn ? 1 : 0);
      O.coalFlame.tick(s.t);
      O.tipFlame.setLit(stickOn ? 1 : 0);
      O.tipFlame.tick(s.t);

      /* 标注按步骤取舍；集气瓶标注跟着瓶走 */
      O.labStand.sprite.visible = (si >= 1 && si <= 3);
      O.labTube.sprite.visible = (si >= 1 && si <= 4);
      O.labLamp.sprite.visible = (si >= 2 && si <= 4);
      O.labTrough.sprite.visible = (si === 4);
      O.labJar.sprite.visible = (si === 3 || si === 4);
      if (O.labJar.sprite.visible) {
        O.labJar.sprite.position.set(jx - 4.4, v > .5 ? 6.6 : 7.4, jz);
      }
      O.labSplint.sprite.visible = (si === 5);
      O.labTongs.sprite.visible = (si === 6);
    }
  };

  K.boot({
    title: '氧气的实验室制取与性质',
    chip: '化学 · 鲁教版 · 八年级全一册 · 学生实验3',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: .5, ty: 5.6, tz: 2.5, dist: 43, yaw: .22, pitch: .20 },
    postfx: true,

    reads: [
      ['heat', '加热状态'],
      ['col', '已收集（约）'],
      ['test', '检验现象']
    ],

    values: function (s) {
      return {
        heat: s.heat > .5 ? '酒精灯已点燃' : '未加热',
        col: (s.collected * 100).toFixed(0) + ' %',
        test: s.test > .5 ? '带火星木条复燃' : '—'
      };
    },

    steps: [
      {
        name: '实验原理',
        cam: { tx: .5, ty: 5.6, tz: 2.5, dist: 43, yaw: .22, pitch: .20 },
        title: '高锰酸钾受热，放出氧气',
        ask: '实验室用什么药品、什么方法制取氧气？',
        body: '<p><b>药品：</b>高锰酸钾（KMnO₄，暗紫色固体），管口塞一小团<b>棉花</b>。</p>' +
          '<p><b>原理：</b>加热时分解放出氧气：</p>' +
          '<p style="text-align:center">2 KMnO₄ <span style="font-size:13px">△</span>→ K₂MnO₄ + MnO₂ + O₂↑</p>' +
          '<p><b>收集：</b>氧气<b>不易溶于水</b>，用<b>排水法</b>收集最纯；也可用向上排空气法（密度比空气大）。</p>',
        apply: function (s) { s.heat = 0; s.bubbles = 0; s.collected = 0; s.test = 0; s.charcoal = 0; }
      },
      {
        name: '组装仪器',
        cam: { tx: -10.5, ty: 5.6, tz: 4, dist: 21, yaw: .16, pitch: .28 },
        title: '铁架台夹稳试管，管口略向下倾斜',
        ask: '为什么试管口要略向下倾斜？',
        body: '<p><b>组装：</b>铁架台的夹子夹在距管口约 1/3 处，试管口<b>略向下倾斜</b>；管口塞棉花、连导管，导管伸到水槽里倒立的集气瓶口。</p>' +
          '<p><b>口向下倾斜的原因：</b>药品里的水分受热变成蒸气，在管口冷凝成水，倒流回<b>热的试管底部</b>会使试管炸裂。</p>',
        apply: function (s) { s.heat = 0; s.bubbles = 0; s.collected = 0; s.test = 0; s.charcoal = 0; }
      },
      {
        name: '检查气密性',
        cam: { tx: -10.5, ty: 5.6, tz: 4, dist: 21, yaw: .16, pitch: .28 },
        title: '先查气密性，再装药品',
        ask: '怎么判断装置气密性良好？',
        body: '<p><b>操作：</b>把导管一端浸入水中，<b>用手紧握试管</b>。</p>' +
          '<p><b>现象：</b>导管口有<b>气泡冒出</b>，松手后导管内回升一段<b>水柱</b> → 气密性良好。</p>' +
          '<p><b>忘了这步：</b>装置漏气，收集不到气体，整场实验白做。</p>',
        apply: function (s) { s.heat = 0; s.bubbles = 0; s.collected = 0; s.test = 0; s.charcoal = 0; }
      },
      {
        name: '加热制取',
        cam: { tx: -13, ty: 4.6, tz: 4, dist: 18, yaw: .10, pitch: .24 },
        title: '先来回预热，再对准药品固定加热',
        ask: '为什么要先预热？外焰有什么讲究？',
        body: '<p><b>操作：</b>点燃酒精灯，先来回移动灯子让试管<b>均匀受热</b>，再用<b>外焰</b>对准药品部位固定加热。</p>' +
          '<p><b>预热的原因：</b>局部骤热会炸裂试管。</p>' +
          '<p><b>记住：</b>用<b>外焰</b>（温度最高），灯帽盖灭，绝不能用嘴吹。</p>',
        apply: function (s) { s.heat = 1; s.bubbles = 0; s.collected = 0; s.test = 0; s.charcoal = 0; }
      },
      {
        name: '排水法收集',
        cam: { tx: 6, ty: 4.2, tz: 1, dist: 30, yaw: -.04, pitch: .22 },
        title: '气泡连续均匀时，才开始收集',
        ask: '为什么一开始的气泡不能收集？',
        body: '<p><b>操作：</b>等气泡<b>连续、均匀</b>冒出，导管口的气泡升进倒立的集气瓶，把水排出。</p>' +
          '<p><b>开头不收集：</b>最先排出的是试管里的<b>空气</b>，混进去氧气就不纯。</p>' +
          '<p><b>满瓶标志：</b>瓶口有大气泡向外冒。</p>',
        apply: function (s) { s.heat = 1; s.bubbles = 1; s.collected = 1; s.test = 0; s.charcoal = 0; }
      },
      {
        name: '检验氧气',
        cam: { tx: 17, ty: 4.4, tz: 2.2, dist: 19, yaw: .30, pitch: .24 },
        title: '带火星的木条，伸入瓶内复燃',
        ask: '检验氧气用什么方法？伸到哪里？',
        body: '<p><b>检验：</b>用<b>带火星的木条</b>伸入集气瓶<b>内</b>（不是瓶口）。</p>' +
          '<p><b>现象：</b>木条<b>复燃</b> → 证明是氧气。</p>' +
          '<p><b>原理：</b>氧气支持燃烧，能让将灭的火星重新烧起来。</p>',
        apply: function (s) { s.heat = 1; s.bubbles = 1; s.collected = 1; s.test = 1; s.charcoal = 0; }
      },
      {
        name: '性质·木炭',
        cam: { tx: 17.5, ty: 4.8, tz: 2.2, dist: 18, yaw: .36, pitch: .24 },
        title: '木炭伸进氧气：比在空气中烧得更旺',
        ask: '木炭在空气中和在氧气中燃烧有何不同？',
        body: '<p><b>操作：</b>用<b>坩埚钳</b>夹取一块<b>红热的木炭</b>，由瓶口向下伸入集气瓶，伸到瓶的中下部。</p>' +
          '<p><b>现象：</b>比在空气中<b>更旺</b>、发出<b>白光</b>、放热；生成使澄清石灰水变浑浊的 CO₂。</p>' +
          '<p><b>对比：</b>空气中只是红热——<b>氧气浓度越大，燃烧越剧烈</b>。</p>',
        apply: function (s) { s.heat = 1; s.bubbles = 1; s.collected = 1; s.test = 0; s.charcoal = 1; }
      },
      {
        name: '收尾与误区',
        cam: { tx: 0, ty: 5.6, tz: 2, dist: 48, yaw: .24, pitch: .26 },
        title: '实验结束：先撤导管，再熄灯',
        ask: '顺序反了会发生什么？',
        body: '<p><b>正确顺序：</b>① 先把<b>导管移出水面</b>；② 再<b>熄灭酒精灯</b>。</p>' +
          '<p><b>反了会怎样：</b>先熄灯 → 试管冷却、管内压强减小 → 水槽的水<b>倒吸</b>进热试管，试管炸裂。</p>' +
          '<p><b>口诀：</b>「查、装、定、点、收、离、熄」——离在熄之前。</p>',
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        {
          q: '试管口略向下倾斜，是为了防止什么？',
          opts: ['冷凝水倒流炸裂试管', '药品洒出', '气体逸散', '火焰烧到手'],
          ans: '冷凝水倒流炸裂试管',
          why: '加热时药品中的水分成蒸气，在管口冷凝成水，倒流回热的试管底会炸裂。'
        },
        {
          q: '排水法收集氧气，为什么一开始的气泡不收集？',
          opts: ['那是水蒸气', '那是空气，会使氧气不纯', '温度不够', '导管没伸到底'],
          ans: '那是空气，会使氧气不纯',
          why: '最先排出的是试管内的空气，混进去会让收集的氧气不纯。'
        },
        {
          q: '检验氧气应把带火星木条伸入哪里？',
          opts: ['瓶口', '瓶内', '导管口', '水槽里'],
          ans: '瓶内',
          why: '伸入集气瓶内，木条复燃才证明瓶中是氧气。'
        },
        {
          q: '实验结束先移导管再熄灯，是为了？',
          opts: ['防止水倒吸炸裂试管', '省酒精', '让气体更纯', '方便拆卸'],
          ans: '防止水倒吸炸裂试管',
          why: '先熄灯会使试管内压强减小，水槽的水被倒吸入热试管而炸裂。'
        }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
