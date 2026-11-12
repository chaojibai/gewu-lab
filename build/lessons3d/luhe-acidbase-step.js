/* 格物实验室 · 酸碱中和与 pH（three.js 版） */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    n: 0,
    cA: 100,
    judged: false,
    flow: false,
    drops: [],
    t: 0,
    ripple: 0,
    splash: []
  };

  var O = {};   // 对象引用

  /* ---------------- 装置尺寸（世界坐标，y 向上，台面 y=0） ---------------- */
  var FL = { baseR: 5.4, bodyH: 12.2, neckR: 1.85, neckH: 4.2, liq: .40 };
  var FY0 = .12;                                /* 瓶下衬垫上表面 = 瓶底 */
  var LVL = FY0 + .5 + FL.bodyH * FL.liq * .95; /* 液面 ≈ 5.86，与 flask 的 liquid 一致 */
  var MOUTH = FY0 + .5 + FL.bodyH + FL.neckH;   /* 瓶口 ≈ 13.92 */

  var TUBE_R = .78, TUBE_Y0 = MOUTH + 1.7, TUBE_Y1 = TUBE_Y0 + 10.6;
  var LIQ_Y0 = TUBE_Y0 - .15, LIQ_Y1 = TUBE_Y1 - .3;            /* 管内液体上端 25.9 - n*.12 */
  var TIP_Y = MOUTH + .75;                            /* 尖嘴：瓶口上方约 1 个单位 */
  var ROD_X = -13.2;
  var METER_X = 9.2;   /* pH 计原来在 12.4，离锥形瓶太远，电极线只能横跨画面；
                          挪到瓶右侧 9.2（机身左缘 6.8 > 瓶最大半径 5.4，不重叠） */

  /* 真实模型：0.100 mol/L NaOH 10.00 mL，用 0.100 mol/L HCl 滴定
     每滴 0.50 mL（s.n 为滴数），等当点 10.00 mL = 第 20 滴 */
  var C_B = .100, V_B = 10.00, C_A = .100, PER_DROP = .5;
  var P = { cA: C_A, temp: 25 };            /* 可调参数：盐酸浓度、温度 */
  function vEq() { return Sim.equivalence({ cB: C_B, vB: V_B, cA: P.cA }); }
  var V_EQ = vEq();                          /* 10.00 mL */
  function ph(n) {
    return Sim.pH({ cB: C_B, vB: V_B, cA: P.cA, vA: n * PER_DROP, temp: P.temp });
  }

  function lerpC(a, b, t) { return a + (b - a) * t; }

  function redOf(p) {
    var a = Math.max(0, Math.min(1, (p - 7.0) / 3.0));
    return a;
  }

  /* 两种十六进制颜色按 t 插值 */
  function mix(c1, c2, t) {
    function h(x, y) {
      var v = Math.round(K.lerp(x, y, t)).toString(16);
      return v.length < 2 ? '0' + v : v;
    }
    return '#' +
      h(parseInt(c1.slice(1, 3), 16), parseInt(c2.slice(1, 3), 16)) +
      h(parseInt(c1.slice(3, 5), 16), parseInt(c2.slice(3, 5), 16)) +
      h(parseInt(c1.slice(5, 7), 16), parseInt(c2.slice(5, 7), 16));
  }

  function drawPH(p, hue) {
    var x = O.phCtx;
    x.fillStyle = '#07161a';
    x.fillRect(0, 0, 256, 128);
    x.font = 'bold 58px ui-monospace,Consolas,monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(120,205,180,.5)';
    x.font = '22px ui-monospace,Consolas,monospace';
    x.fillText('pH', 52, 40);
    x.font = 'bold 62px ui-monospace,Consolas,monospace';
    x.fillStyle = 'rgb(' + hue + ')';
    x.fillText(p.toFixed(1), 148, 68);
    O.phTex.needsUpdate = true;
  }

  /* 滴定曲线面板：pH-滴加体积，曲线由 Sim.curve 计算 */
  function drawCurve(n) {
    var c = O.curveCtx, W = O.curveCv.width, H = O.curveCv.height;
    var padL = 44, padR = 12, padT = 14, padB = 26;
    var vMax = 50, pMin = 0, pMax = 14;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#fbfcfe';
    c.fillRect(0, 0, W, H);

    function X(v) { return padL + (v / vMax) * (W - padL - padR); }
    function Y(p) { return padT + (1 - (p - pMin) / (pMax - pMin)) * (H - padT - padB); }

    /* 网格与刻度 */
    c.strokeStyle = 'rgba(40,70,110,.10)';
    c.lineWidth = 1;
    var i;
    for (i = 0; i <= 14; i += 2) {
      c.beginPath(); c.moveTo(padL, Y(i)); c.lineTo(W - padR, Y(i)); c.stroke();
      c.fillStyle = 'rgba(45,75,105,.7)';
      c.font = '11px ui-monospace,monospace';
      c.textAlign = 'right';
      c.fillText(String(i), padL - 6, Y(i) + 4);
    }
    for (i = 0; i <= 50; i += 10) {
      c.beginPath(); c.moveTo(X(i), padT); c.lineTo(X(i), H - padB); c.stroke();
      c.fillStyle = 'rgba(45,75,105,.7)';
      c.textAlign = 'center';
      c.fillText(String(i), X(i), H - 8);
    }
    c.fillStyle = 'rgba(45,75,105,.75)';
    c.textAlign = 'left';
    c.fillText('pH', 6, 12);
    c.textAlign = 'right';
    c.fillText('V(HCl) / mL', W - padR, H - 8);

    /* 等当点虚线 */
    c.save();
    c.setLineDash([4, 4]);
    c.strokeStyle = 'rgba(31,165,103,.55)';
    c.beginPath(); c.moveTo(X(vEq()), padT); c.lineTo(X(vEq()), H - padB); c.stroke();
    c.restore();

    /* 模型曲线（完整曲线淡色 + 已滴加部分高亮） */
    var pts = Sim.curve({ cB: C_B, vB: V_B, cA: P.cA }, vMax, .2);
    c.lineWidth = 1.6;
    c.strokeStyle = 'rgba(47,125,209,.28)';
    c.beginPath();
    for (i = 0; i < pts.length; i++) {
      var px = X(pts[i].v), py = Y(pts[i].pH);
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();

    c.lineWidth = 2.4;
    c.strokeStyle = '#2f7dd1';
    c.beginPath();
    var started = false;
    for (i = 0; i < pts.length; i++) {
      if (pts[i].v > n * PER_DROP + 1e-6) break;
      var qx = X(pts[i].v), qy = Y(pts[i].pH);
      if (!started) { c.moveTo(qx, qy); started = true; } else c.lineTo(qx, qy);
    }
    c.stroke();

    /* 当前位置 */
    var cur = Sim.pH({ cB: C_B, vB: V_B, cA: P.cA, vA: n * PER_DROP });
    c.beginPath();
    c.arc(X(n * PER_DROP), Y(cur), 4.4, 0, Math.PI * 2);
    c.fillStyle = '#d9455f';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.stroke();
  }

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

  var scene = {
    setup: function () {
      var i;

      /* ---- 每件器材独立材质：不再全场共用一套 ---- */
      var MAT = {
        glassThin: new T.MeshPhysicalMaterial({           /* 滴定管：薄壁、极透 */
          color: 0xffffff, metalness: 0, roughness: .09, ior: 1,
          transmission: 1, thickness: .22, transparent: true,
          side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.35
        }),
        glassFlask: new T.MeshPhysicalMaterial({          /* 锥形瓶：硼硅玻璃，略带青绿 */
          color: 0xf1faf4, metalness: 0, roughness: .12, ior: 1,
          transmission: 1, thickness: .55,
          attenuationColor: new T.Color('#dff0e8'), attenuationDistance: 4,
          transparent: true, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.7
        }),
        iron: new T.MeshStandardMaterial({ color: 0x39424c, roughness: .42, metalness: .86, envMapIntensity: 1.15 }),
        alu: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .34, metalness: .92, envMapIntensity: 1.25 }),
        plastic: new T.MeshPhysicalMaterial({ color: 0xe7ecf2, roughness: .42, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 }),
        bodyDark: new T.MeshStandardMaterial({ color: 0x27303a, roughness: .48, metalness: .35 }),
        screen: new T.MeshStandardMaterial({ color: 0x0b1218, roughness: .16, metalness: .2 }),
        rubberCap: new T.MeshStandardMaterial({ color: 0x3a3630, roughness: .82, metalness: .02 })
      };
      O.MAT = MAT;

      K.bench(46, 30);



      /* ---------------- 锥形瓶（含 NaOH＋酚酞 溶液） ---------------- */
      O.flask = K.flask({
        baseR: FL.baseR, bodyH: FL.bodyH, neckR: FL.neckR, neckH: FL.neckH,
        x: 0, z: 0, y0: FY0,
        liquid: FL.liq, liquidCol: 0xbe4a62, liquidA: 1, glassMat: MAT.glassFlask, liqInset: .45, liqSurface: true
      });
      K.tag(O.flask, '锥形瓶', '装 10.00 mL NaOH 与酚酞');

      /* 瓶身轮廓只留两条母线：整圈 LineLoop 在浅背景 + 不透明玻璃上会读成
         一圈圈「透明光环」，尤其肩部那圈半径是随手给的，根本不贴在真实器壁上。
         玻璃形体由瓶身几何 + 母线读出，不再叠环。 */
      var lineMatF = new T.LineBasicMaterial({ color: 0x7f9fb8, transparent: true, opacity: .5 });
      var prof = [
        new T.Vector3(-FL.baseR, .56, 0), new T.Vector3(-FL.neckR, FL.bodyH + .5, 0),
        new T.Vector3(FL.baseR, .56, 0), new T.Vector3(FL.neckR, FL.bodyH + .5, 0)
      ];
      O.flask.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(prof), lineMatF));
      /* 引擎 K.flask 自己还会在底沿、肩部、液面各画一圈 LineLoop；
         浅背景 + 浅色玻璃下这些整圈线就是「透明光环」，且肩环半径并不贴壁。
         统一隐藏整圈环，只留上面的两条母线定形。 */
      O.flask.traverse(function (o) { if (o.isLineLoop) o.visible = false; });
      /* K.flask 还自带一片 AdditiveBlending 的竖向高光 Plane（opacity .5），
         在浅墙 + 黑板前会烧成一块刺眼白板，盖住板书。按明确特征只在本课隐藏。 */
      O.flask.traverse(function (o) {
        if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' &&
            o.material && o.material.blending === T.AdditiveBlending) o.visible = false;
      });

      /* 找到瓶内液体网格（材质是 flask 私有的 MeshPhysicalMaterial） */
      var liqMesh = O.flask.getObjectByName('liquid');
      O.liqMat = liqMesh ? liqMesh.material : null;
      O.liqMesh = liqMesh;

      /* ---------------- 铁架台（底座 + 立杆 + 单道夹持臂） ---------------- */
      K.box({ x: ROD_X, y: .62, z: 0, sx: 6.6, sy: 1.24, sz: 7.2, mat: MAT.bodyDark });
      K.rod([ROD_X, 1.2, 0], [ROD_X, 25.9, 0], .38, { mat: MAT.iron });

      /* 夹持臂：立杆上的十字夹 + 一段横臂 + 管夹 */
      var CLAMP_Y = TUBE_Y0 + 4.9;
      K.box({ x: ROD_X, y: CLAMP_Y, z: 0, sx: 1.25, sy: 1.5, sz: 1.6, mat: MAT.alu });
      K.rod([ROD_X, CLAMP_Y, 0], [-1.12, CLAMP_Y, 0], .19, { mat: MAT.alu });
      K.box({ x: -1.02, y: CLAMP_Y, z: .82, sx: .5, sy: 1.15, sz: .35, mat: new T.MeshStandardMaterial({ color: 0x38404c, roughness: .5, metalness: .5 }) });
      K.box({ x: -1.02, y: CLAMP_Y, z: -.82, sx: .5, sy: 1.15, sz: .35, mat: new T.MeshStandardMaterial({ color: 0x38404c, roughness: .5, metalness: .5 }) });

      /* ---------------- 滴定管 ---------------- */
      /* 管内液体：上端随滴加下降（单位高圆柱，靠 scale 拉伸；关透射保证可见） */
      O.bLiq = K.liquidCyl({ r: .52, h: 1, x: 0, z: 0, y0: LIQ_Y0, color: 0xd7e8f6, opacity: .55 });
      O.bLiq.material.transmission = 0;
      K.tag(K.glassCyl({ r: TUBE_R, h: TUBE_Y1 - TUBE_Y0, x: 0, z: 0, y0: TUBE_Y0, glassMat: MAT.glassThin }),
        '酸式滴定管', '0.100 mol/L 盐酸');

      /* 刻度（短横线贴在管壁前侧） */
      for (i = 0; i < 11; i++) {
        var ty = TUBE_Y0 + .5 + i * .88, maj = i % 5 === 0;
        K.box({
          x: -.38, y: ty, z: .78, sx: maj ? .68 : .42, sy: .07, sz: .03,
          mat: new T.MeshStandardMaterial({ color: 0xacccec, roughness: .4, transparent: true, opacity: maj ? .85 : .5 })
        });
      }
      /* 玻璃旋塞：横向塞壳 + 锥形磨口塞 + 侧向手柄 + 卡环 + 尖嘴 */
      O.stopcock = K.stopcock({ x: 0, y: TUBE_Y0 - .5, z: 0, r: .72 });
      K.tag(O.stopcock, '玻璃旋塞', '转动它控制滴速');
      /* 滴定管刻度（0 在上、50 在下，与真实滴定管读数方向一致） */
      var gcv = document.createElement('canvas');
      gcv.width = 128; gcv.height = 1024;
      var gx = gcv.getContext('2d');
      gx.clearRect(0, 0, 128, 1024);
      gx.textAlign = 'right';
      for (i = 0; i <= 100; i++) {
        var yy = 18 + (i / 100) * 988;
        var maj = i % 10 === 0, mid = i % 5 === 0;
        gx.strokeStyle = 'rgba(52,86,120,' + (maj ? '.9' : mid ? '.6' : '.38') + ')';
        gx.lineWidth = maj ? 2.6 : 1.4;
        gx.beginPath();
        gx.moveTo(128, yy);
        gx.lineTo(maj ? 92 : mid ? 104 : 114, yy);
        gx.stroke();
      }
      var gTex = new T.CanvasTexture(gcv);
      var gTop = TUBE_Y1, gBot = TUBE_Y0 + 1.5;      /* 刻度只到活塞上方 */
      var scalePlane = new T.Mesh(
        new T.PlaneGeometry(1.02, gTop - gBot),
        new T.MeshBasicMaterial({ map: gTex, transparent: true, depthWrite: false }));
      scalePlane.position.set(-.16, (gTop + gBot) / 2, TUBE_R + .012);
      K.scene().add(scalePlane);

      /* 实时滴定曲线（画在讲解面板里，随滴加量实时生长） */
      var cvc = document.createElement('canvas');
      cvc.width = 760; cvc.height = 220;
      cvc.className = 'curve';
      var ctrlsEl = document.getElementById('sCtrls');
      ctrlsEl.parentNode.insertBefore(cvc, ctrlsEl);
      O.curveCv = cvc;
      O.curveCtx = cvc.getContext('2d');
      O.curveLast = -1;

      /* 尖嘴已包含在旋塞图元内 */

      /* ---------------- 台式 pH 计（落地 + 斜面屏 + 探头） ---------------- */
      K.box({ x: METER_X, y: .55, z: 0, sx: 5.4, sy: 1.1, sz: 4.4, mat: MAT.bodyDark });
      K.box({ x: METER_X, y: 3.2, z: 0, sx: 4.8, sy: 4.2, sz: 3.0, mat: MAT.plastic });
      /* 倾斜的显示屏（CanvasTexture，随 pH 实时刷新） */
      var pc = document.createElement('canvas'); pc.width = 256; pc.height = 128;
      O.phCtx = pc.getContext('2d');
      O.phTex = new T.CanvasTexture(pc);
      var scr = new T.Mesh(new T.PlaneGeometry(4.1, 2.05),
        new T.MeshBasicMaterial({ map: O.phTex }));
      scr.position.set(METER_X, 3.55, 1.53);
      scr.rotation.x = -.1;
      K.scene().add(scr);
      drawPH(13.0, '255,158,178');
      /* 机顶电极插座 */
      K.box({ x: METER_X, y: 5.4, z: -.15, sx: .72, sy: .34, sz: .72, mat: new T.MeshStandardMaterial({ color: 0x465466, roughness: .5, metalness: .4 }) });
      /* pH 读数由模型直接给出；电极线从机顶插座连到电极，短弧贴着器材走。
         原来把线删干净后，pH 计与电极各自孤立，老师指出「没连上」。 */
      K.tube([[METER_X, 5.5, -.15], [METER_X + .5, 7.6, -.05], [METER_X - 1.6, 10.8, .04],
              [5.4, 13.2, .10], [2.8, 14.4, .13], [1.15, 14.6, .14]], .06, { rubber: true });
      /* pH 电极：从瓶口开口内垂直插到液面以下（原来 x≈1.8 贴在瓶颈半径上，
         等于从玻璃壁里穿进去；瓶颈内径≈1.75，杆必须收在 1.28 以内）。 */
      var ELEC_BOT = LVL - 1.5;
      K.tube([[1.15, 14.55, .14], [1.10, ELEC_BOT, .14]], .13);
      K.sphere({ x: 1.10, y: ELEC_BOT - .18, z: .14, r: .21,
        mat: new T.MeshStandardMaterial({ color: 0xe2f2ff, transparent: true, opacity: .9, roughness: .2 }) });
      K.cyl({ r: .20, h: .45, y0: 14.5, x: 1.15, z: .14, mat: MAT.bodyDark });

      /* ---------------- 液面涟漪圈 ---------------- */
      O.rip = new T.Mesh(new T.RingGeometry(.8, 1.02, 32),
        new T.MeshBasicMaterial({ color: 0xffebf2, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      O.rip.rotation.x = -Math.PI / 2;
      O.rip.position.set(0, LVL + .03, 0);
      K.scene().add(O.rip);

      /* ---- 背景道具：试剂瓶架、洗瓶、备用烧杯（低对比，营造使用痕迹） ---- */
      var BX0 = -12.6, BZ = -9.2;
      K.box({ x: BX0 - .6, y: .34, z: BZ, sx: 10, sy: .68, sz: 3.2, mat: MAT.plastic });
      var bcols = [0x8fb7d6, 0xd9c07a, 0x9fc8a8, 0xc9a0c0, 0xd6a89a, 0x8fc4c8];
      for (i = 0; i < 4; i++) {
        var bx = BX0 - 3.4 + i * 2.1;
        K.glassCyl({ r: .82, h: 3.4, x: bx, z: BZ, y0: .68, glassMat: MAT.glassThin });
        K.liquidCyl({ r: .74, h: 2.1, x: bx, z: BZ, y0: .76, color: bcols[i], opacity: .5 });
        K.cyl({ r: .86, h: .52, x: bx, z: BZ, y0: 4.08, mat: MAT.rubberCap });
      }
      /* 洗瓶 */
      K.cyl({ r: 1.25, h: 3.5, x: BX0 + 6.4, z: BZ + .9, mat: new T.MeshStandardMaterial({ color: 0xf2f7fc, roughness: .32, transparent: true, opacity: .88 }) });
      K.tube([[BX0 + 6.4, 4.2, BZ + .9], [BX0 + 6.9, 5.4, BZ + .9], [BX0 + 7.7, 5.2, BZ + .9]], .1, {});
      /* 备用烧杯 + 玻璃棒 */
      K.beaker({ r: 1.6, h: 3.0, x: BX0 + 8.4, z: BZ + 1.0 });
      K.rod([BX0 + 7.9, .5, BZ + 1.0], [BX0 + 8.9, 2.9, BZ + 1.0], .09, { mat: MAT.glassThin });

      /* 接触阴影 */
      /* 接触阴影贴片：K.blob 默认白色贴图，在深色台面上读成「白盘」。
         三处统一染成深绿黑 + 压透明度，只留柔和接地感（nacl 已验证同款处理）。 */
      [K.blob({ x: 0, z: 0, r: 6.2 }),
       K.blob({ x: ROD_X, z: 0, r: 4.6 }),
       K.blob({ x: METER_X, z: 0, r: 4.0 })].forEach(function (b) {
        b.material.color.setHex(0x16231d);
        b.material.opacity = .22;
      });

      /* 标注：Sprite 贴图，随透视缩放、始终面向相机 */
      K.spriteLabel([4.6, TUBE_Y1 - 1.2, 0], '酸式滴定管（稀盐酸）', { w: 6.4, fs: 40 });
      K.spriteLabel([-3.4, TUBE_Y0 - 1.1, .8], '玻璃活塞', { w: 3.6, fs: 36 });
      K.spriteLabel([-8.4, 10.6, 1.8], 'NaOH＋酚酞', { w: 5.0, fs: 38 });
      K.spriteLabel([METER_X + 2.6, 4.4, 1.2], '台式 pH 计', { w: 4.2, fs: 38 });

      /* 溶液状态（动态标注，随 pH 换文字与颜色） */
      O.dyn = K.spriteLabel([6.6, 8.2, 2.6], '碱性 · 酚酞呈红色', { w: 5.6, fs: 38 });

      /* 液滴 / 溅滴共享几何材质 */
      O.dropGeo = new T.SphereGeometry(.26, 12, 10);
      O.dropMat = new T.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: .92, roughness: .15 });
      O.spGeo = new T.SphereGeometry(.12, 8, 6);
      O.spMat = new T.MeshStandardMaterial({ color: 0xebf2fa, transparent: true, opacity: .85, roughness: .2 });

      O.all = [];
      O.lastP = -1;
    },

    update: function (dt, s) {
      var i, d;
      s.t += dt;
      for (i = 0; i < O.all.length; i++) O.all[i].__seen = false;

      /* 打开旋钮：盐酸一滴一滴落下 */
      if (s.flow && s.n < 40) {
        var prev = s.n;
        s.n = Math.min(40, s.n + dt * 4.2);
        if (Math.floor(s.n) > Math.floor(prev)) {
          s.drops.push({
            y: TIP_Y - .08, v: 11,
            sp: (function () {
              var m = new T.Mesh(O.dropGeo, O.dropMat);
              m.castShadow = false; m.receiveShadow = false;
              K.scene().add(m); O.all.push(m);
              return m;
            })()
          });
        }
      }
      for (i = s.drops.length - 1; i >= 0; i--) {
        d = s.drops[i];
        d.y -= d.v * dt;
        d.sp.position.set(0, d.y, 0);
        d.sp.__seen = true;
        if (d.y < LVL) {
          s.drops.splice(i, 1);
          s.ripple = 1;
          for (var j = 0; j < 3; j++) {
            s.splash.push({
              x: K.rnd(-.5, .5), z: K.rnd(-.5, .5), y: LVL + .15, vy: K.rnd(2.2, 4), a: 1,
              sp: (function () {
                var m = new T.Mesh(O.spGeo, O.spMat);
                m.castShadow = false; m.receiveShadow = false;
                K.scene().add(m); O.all.push(m);
                return m;
              })()
            });
          }
        }
      }
      /* 溅起的小液滴（受重力落回液面） */
      for (i = s.splash.length - 1; i >= 0; i--) {
        d = s.splash[i];
        d.vy -= 12 * dt;
        d.y += d.vy * dt;
        d.a -= dt * 2.4;
        d.sp.position.set(d.x, Math.max(d.y, LVL + .06), d.z);
        d.sp.__seen = true;
        if (d.a <= 0 || d.y < LVL - .2) s.splash.splice(i, 1);
      }
      if (s.ripple) s.ripple = Math.max(0, s.ripple - dt * 1.5);

      /* 溶液颜色：红 → 浅粉 → 近无色（分两段插值，中途不发紫） */
      var p = ph(s.n);
      var a = redOf(p);
      var col = a > .30
        ? mix('#c8324f', '#eec3ce', 1 - (a - .30) / .70)
        : mix('#eec3ce', '#eef4f7', 1 - a / .30);
      var hue = p > 8.2 ? '255,158,178' : (p < 6.9 ? '162,206,246' : '150,232,192');
      if (O.liqMat && O.liqMat.uniforms) {
        var cTarget = new T.Color(col);
        if (!O.colCur) O.colCur = cTarget.clone();
        /* 颜色按时间常数过渡：滴一滴下去是渐变，不是瞬间跳色 */
        O.colCur.lerp(cTarget, Math.min(1, dt * 2.6));
        K.setLiquidColor(O.liqMesh, O.colCur, lerpC(.5, .82, Math.min(1, a / .3)));
      }

      /* 滴定管内液面随 s.n 下降 */
      var lh = Math.max(.05, (LIQ_Y1 - s.n * .12) - LIQ_Y0);
      O.bLiq.scale.y = lh;
      O.bLiq.position.y = LIQ_Y0 + lh / 2;

      /* 涟漪圈 */
      if (s.ripple > 0) {
        O.rip.scale.setScalar(.9 + (1 - s.ripple) * 2.3);
        O.rip.material.opacity = s.ripple * .5;
      } else {
        O.rip.material.opacity = 0;
      }

      /* 滴定曲线：模型算出的整条曲线 + 当前位置标记 */
      if (Math.abs(s.n - O.curveLast) > .05) {
        O.curveLast = s.n;
        drawCurve(s.n);
      }

      /* pH 屏与状态标注 */
      if (Math.abs(p - O.lastP) > .011) {
        O.lastP = p;
        drawPH(p, hue);
      }
      var stxt = p > 8.2 ? '碱性 · 酚酞呈红色' : (p < 6.9 ? '酸性 · 酚酞无色' : '中性 · 恰好完全反应');
      /* 标签文字统一用默认深色，与其余 spriteLabel 一致。
         以前把溶液颜色 hue 当文字色，酸性（酚酞无色）时等于白底白字，几乎读不出来；
         溶液颜色由瓶内液体与右侧 pH 读数表达，不必再染文字。 */
      O.dyn.set(stxt);

      sweep();
    }
  };

  K.boot({
    title: '常见酸、碱的化学性质',
    chip: '化学 · 鲁教版 · 九年级下册 · 学生实验7',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 12.4, dist: 66, tx: 1.8, yaw: .42, pitch: .2 },

    reads: [['v', '已滴加盐酸'], ['ph', 'pH'], ['color', '溶液颜色'], ['note', '溶液性质'], ['endV', '终点体积'], ['score', '操作评分']],
    values: function (s) {
      var p = ph(s.n);
      var vol = s.n * PER_DROP;
      var dev = vol - V_EQ;
      var sc = s.judged ? Math.max(0, Math.round(100 - Math.abs(dev) * 400)) : null;
      return {
        v: (s.n * 0.5).toFixed(1) + ' mL',
        ph: p.toFixed(1),
        color: p > 8.2 ? '红色' : (p < 6.9 ? '无色' : '浅红→无色'),
        note: p > 7.05 ? '碱性' : (p < 6.95 ? '酸性' : '中性'),
        endV: s.judged ? vol.toFixed(2) + ' mL（偏差 ' + (dev >= 0 ? '+' : '') + dev.toFixed(2) + '）' : '—',
        score: sc === null ? '—' : (sc >= 90 ? '优秀 ' + sc : sc >= 75 ? '良好 ' + sc : '需改进 ' + sc)
      };
    },

    steps: [
      {
        name: '先变红', title: '氢氧化钠 + 酚酞',
        ask: '为什么一加酚酞就变红？',
        body: '<p><b>现象：</b>烧杯里是无色澄清的氢氧化钠溶液，滴入两滴<b>无色酚酞试液</b>的瞬间，整杯液体立刻变成<b>红色</b>。pH 计读数约 <b>13</b>，碱性很强。</p>' +
          '<p><b>机制：</b>酚酞是一种<b>酸碱指示剂</b>：遇碱性溶液变红，在中性和酸性溶液中都呈无色。变红的是<b>酚酞本身</b>，不是「NaOH 把溶液染了色」——表述题常抠这一点。</p>' +
          '<p>另一位常用指示剂是紫色石蕊：遇酸变<b>红</b>、遇碱变<b>蓝</b>，两种指示剂的变色规律不要记混。</p>' +
          '<p>接下来酚酞就是我们的「哨兵」：红色还在，说明碱没耗尽；红色消失的那一刻，就是转折点。</p>',
        apply: function (s) { s.n = 0; s.flow = false; s.drops = []; }
      },
      {
        name: '逐滴加入', title: '一滴一滴地加',
        ask: '红色为什么会越来越浅？',
        body: '<p><b>现象：</b>用滴管把稀盐酸<b>一滴一滴</b>加进红色溶液，每落一滴，红色就淡一分，pH 数字从 13 一路向下、朝 7 逼近。</p>' +
          '<p><b>机制：</b>盐酸带来的每个 H⁺ 都会抓住一个 OH⁻ 结合成水，碱性被一点点「磨掉」，酚酞的红色随之变浅。颜色变化是<b>整杯均匀</b>发生的，因为分子级别的反应瞬间就混匀了。</p>' +
          '<p><b>操作要点：</b>越接近变色终点越要<b>放慢</b>——最后一滴往往就决定是「恰好中和」还是「盐酸过量」，真实滴定实验里这是成败的关键。</p>' +
          '<p><b>考点：</b>题目常给 pH 随滴数变化的曲线让你判断「谁滴进谁」：起点 pH &gt; 7、一路降到 7 以下的，是<b>向碱中滴酸</b>；起点小于 7、升上去的，是向酸中滴碱。</p>',
        apply: function (s) { s.n = 6; s.flow = true; s.drops = []; },
        controls: [
          { type: 'range', key: 'cA', min: 50, max: 200, step: 10, label: '盐酸浓度（×0.001 mol/L，标准 100）',
            onChange: function (s) { P.cA = s.cA / 1000; O.curveLast = -1; } },
          { type: 'btn', label: '继续滴加', onClick: function (s) { s.flow = true; s.judged = false; } },
          { type: 'btn', label: '停止滴加', onClick: function (s) { s.flow = false; } },
          { type: 'btn', label: '判定终点并评分', onClick: function (s) { s.flow = false; s.judged = true; } }
        ]
      },
      {
        name: '恰好中和', title: '红色消失的那一滴',
        ask: 'pH 正好等于 7 时，溶液是什么颜色？',
        body: '<p><b>现象：</b>某一滴落下，红色<b>恰好完全消失</b>，pH 计停在 <b>7</b>，溶液变成无色透明——这个点叫<b>恰好完全反应</b>。</p>' +
          '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:6px 0">NaOH + HCl → NaCl + H₂O</p>' +
          '<p><b>机制：</b>此时 NaOH 与 HCl 恰好按 1:1 的个数比反应完，溶液里的溶质只剩<b>氯化钠</b>，其余是水。中和反应还会<b>放出热量</b>，摸杯壁能感到微温。</p>' +
          '<p><b>易错点：</b>「恰好中和」时既没有多余的 NaOH，也没有多余的 HCl。若题目问此刻溶液中的溶质，答案只有一个——NaCl。</p>' +
          '<p><b>考点：</b>判断「恰好中和」依据的是<b>指示剂颜色突变</b>（红色→无色）。传统滴定没有 pH 计，颜色突变就是终点信号。</p>',
        apply: function (s) { s.n = 20; s.flow = false; s.drops = []; s.judged = false; },
        controls: [
          { type: 'btn', label: '判定终点并评分', onClick: function (s) { s.judged = true; } }
        ]
      },
      {
        name: '加过量', title: '再多滴几滴会怎样',
        ask: '继续滴，pH 会停在 7 吗？',
        body: '<p><b>现象：</b>越过终点后继续滴盐酸，pH 跌破 7 并继续变小，可溶液<b>依旧无色</b>，看不出任何新变化。</p>' +
          '<p><b>机制：</b>酚酞在<b>中性和酸性溶液里都是无色</b>的。盐酸过量只是 H⁺ 变多了，对酚酞来说「无色」这个状态从未改变。</p>' +
          '<p><b>易错点：</b>所以「无色」只能说明溶液<b>不显碱性</b>，<b>不能证明恰好中和</b>。要确认盐酸是否过量，得另加紫色石蕊试液（变红则酸过量）或用 pH 计测量。</p>' +
          '<p><b>考点：</b>「酚酞褪色能否证明恰好完全反应」是判断题常客——答案永远是<b>不能</b>，理由就是：酚酞在中性和酸性下都无色。</p>',
        apply: function (s) { s.n = 32; s.flow = false; s.drops = []; }
      },
      {
        name: '本质', title: '真正发生反应的是两种离子',
        ask: '中和反应的实质是什么？',
        body: '<p><b>先看溶液里有什么：</b>NaOH 在水中电离出 Na⁺ 和 OH⁻，HCl 电离出 H⁺ 和 Cl⁻，四种离子同处一锅。</p>' +
          '<p><b>真正动手的是谁？</b>只有 H⁺ 抓住 OH⁻ 结合成水：</p>' +
          '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:6px 0">H⁺ + OH⁻ → H₂O</p>' +
          '<p>Na⁺ 和 Cl⁻ 从头到尾没变化，只是「旁观者」。换成 KOH 和稀硝酸，实质仍是 H⁺ 与 OH⁻ 结合成水——这是<b>所有中和反应的共同本质</b>。</p>' +
          '<p><b>考点：</b>问「中和反应的实质」，标准答案就一句：<b>酸中的 H⁺ 与碱中的 OH⁻ 结合生成水</b>。答「生成盐和水」不算对——那只是结果，不是实质。</p>',
        apply: function (s) { s.n = 20; s.flow = false; s.drops = []; }
      },
      {
        name: '生活里', title: '中和反应有什么用',
        ask: '胃药、改良土壤、蚊虫叮咬，有什么共同点？',
        body: '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">胃酸过多</td><td style="color:#c8d4e6">服氢氧化铝，中和多余胃酸</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">酸性土壤</td><td style="color:#c8d4e6">撒熟石灰改良</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">蚊虫叮咬</td><td style="color:#c8d4e6">涂肥皂水（碱性）减轻痛痒</td></tr>' +
          '<tr><td style="padding:5px 0;color:#9fb2cc">工厂废水</td><td style="color:#c8d4e6">加酸或碱调到中性再排放</td></tr>' +
          '</table>' +
          '<p style="margin-top:10px">这四个场景做的是<b>同一件事</b>：让多余的 H⁺ 或 OH⁻ 找到对手结合成水，把 pH 拉回接近 7。</p>' +
          '<p><b>易错点：</b>改良酸性土壤选<b>熟石灰</b>而不是烧碱（NaOH）——熟石灰来源广、价格低、腐蚀性相对温和；烧碱太贵、腐蚀性又强，不适合撒进田里。</p>' +
          '<p><b>考点：</b>答题时点明「中和」二字即可：胃药（含氢氧化铝）中和胃酸、肥皂水中和蚁酸、熟石灰改良酸性土壤，模型都是 H⁺ + OH⁻ → H₂O。</p>',
        apply: function (s) { s.n = 20; s.flow = false; s.drops = []; }
      },
      {
        name: 'pH 怎么用', title: '一张纸判断酸碱',
        ask: 'pH 试纸能不能直接伸进溶液？',
        body: '<p><b>先记范围：</b>pH 通常在 <b>0～14</b>：pH &lt; 7 呈<b>酸性</b>，pH = 7 呈<b>中性</b>，pH &gt; 7 呈<b>碱性</b>；数值越小酸性越强，越大碱性越强。</p>' +
          '<p><b>正确操作：</b>用<b>玻璃棒蘸取</b>待测液滴到 pH 试纸上，再把显示的颜色与<b>标准比色卡</b>对照读数。</p>' +
          '<p><b>两个禁止：</b>① 不能把试纸直接伸进待测液——会污染整瓶试剂；② 不能先把试纸用水润湿——相当于把待测液<b>稀释</b>了：酸性溶液 pH 偏<b>大</b>，碱性溶液 pH 偏<b>小</b>，都会向 7 靠拢。</p>' +
          '<p><b>考点：</b>pH 试纸只能读出<b>整数</b>，精确到小数要用 pH 计。「润湿试纸后读数偏大还是偏小」是选择题高频坑。</p>',
        apply: function (s) { s.n = 34; s.flow = false; s.drops = []; }
      },
      {
        name: '考核', title: '当一回实验员',
        ask: '下面每题都考中和与 pH。',
        quiz: true,
        apply: function (s) { s.n = 20; s.flow = false; s.drops = []; }
      },
      {
        name: '指示剂变色',
        cam: { tx: 2, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '石蕊和酚酞，遇酸碱怎么变色？',
        ask: '紫色石蕊、无色酚酞遇到酸和碱，各变什么色？',
        body: '<p><b>紫色石蕊：</b>遇酸变<b>红</b>，遇碱变<b>蓝</b>。</p>' +
          '<p><b>无色酚酞：</b>遇酸<b>不变色</b>，遇碱变<b>红</b>。</p>' +
          '<p><b>记法：</b>石蕊「酸红碱蓝」；酚酞只对碱显红，对酸不显色。</p>',
        apply: function () {}
      },
      {
        name: '酸与金属 / 碱与氧化物',
        cam: { tx: 2, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '酸能置换出氢气，碱能吸收酸性氧化物',
        ask: '稀盐酸加锌粒、氢氧化钠溶液通 CO₂，各发生什么？',
        body: '<p><b>酸 + 活泼金属：</b>Zn + 2 HCl → ZnCl₂ + <b>H₂↑</b>（有气泡，需氢前的金属）。</p>' +
          '<p><b>碱 + 非金属氧化物：</b>2 NaOH + CO₂ → Na₂CO₃ + H₂O（碱溶液能吸收 CO₂ 等酸性气体）。</p>' +
          '<p>这两条是酸、碱化学性质的重要补充。</p>',
        apply: function () {}
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '向滴有酚酞的氢氧化钠溶液中逐滴加入稀盐酸，看到的现象是：',
          opts: ['红色逐渐变浅，恰好中和时变为无色', '无色逐渐变红', '先变蓝再变红', '红色始终不变'],
          ans: '红色逐渐变浅，恰好中和时变为无色',
          why: 'OH⁻ 被 H⁺ 一点点消耗，碱性减弱，酚酞的红色随之变浅；恰好中和后溶液不再显碱性，酚酞呈无色。'
        },
        {
          q: '中和反应的实质是：',
          opts: ['H⁺ 与 OH⁻ 结合生成水', 'Na⁺ 与 Cl⁻ 结合生成 NaCl', '两种溶液简单地混合', '酸碱指示剂变色'],
          ans: 'H⁺ 与 OH⁻ 结合生成水',
          why: 'Na⁺ 和 Cl⁻ 反应前后没有任何变化，是旁观者；酸和碱真正发生的反应就是 H⁺ 与 OH⁻ 结合成水。答「生成盐和水」只是结果，不算实质。'
        },
        {
          q: '向氢氧化钠溶液中不断滴入稀盐酸，溶液 pH 的变化过程是：',
          opts: ['从大于 7 逐渐减小，恰好中和时等于 7，盐酸过量后小于 7', '从小于 7 逐渐增大到大于 7', '始终等于 7 不变', '先增大后减小'],
          ans: '从大于 7 逐渐减小，恰好中和时等于 7，盐酸过量后小于 7',
          why: '起点是强碱，pH 大于 7；随盐酸加入碱性减弱，pH 一路下降；恰好中和时 pH = 7；再滴盐酸就小于 7。曲线的起点和走向是判断「谁滴进谁」的依据。'
        },
        {
          q: '二氧化碳与氢氧化钠反应生成碳酸钠和水，该反应：',
          opts: ['不是中和反应，因为反应物不是酸和碱', '是中和反应，因为生成了盐和水', '属于置换反应', '反应时酚酞会变红'],
          ans: '不是中和反应，因为反应物不是酸和碱',
          why: '中和反应特指酸与碱作用生成盐和水的反应；CO₂ 是非金属氧化物，不是酸。所以「生成盐和水的反应不一定是中和反应」。'
        },
        {
          q: '被蚊虫叮咬后痒痛难忍，涂抹肥皂水能缓解，原理是：',
          opts: ['肥皂水中的碱中和了蚊虫分泌的蚁酸', '肥皂水把蚁酸冲走了', '肥皂水提高了皮肤的温度', '发生了置换反应'],
          ans: '肥皂水中的碱中和了蚊虫分泌的蚁酸',
          why: '蚁酸显酸性，肥皂水显碱性，两者发生中和反应减轻痛痒——这与用含氢氧化铝的胃药中和多余胃酸是同一个道理。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
