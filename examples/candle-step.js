/* 格物实验室 · 对蜡烛及其燃烧的探究（three.js 版）
   鲁教版 九年级上册 · 第一单元 步入化学殿堂 · 课题2 化学研究些什么 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    lit: 0,          /* 是否点燃 0/1 */
    burnT: 0,        /* 累计燃烧时间 s（驱动产物量与蜡柱高度） */
    probe: .55,      /* 温度探针插入位置 0（焰心底部）..1（外焰顶部） */
    stick: 0,        /* 火柴梗是否横穿火焰 */
    hood: 0,         /* 是否罩上干冷烧杯 */
    fog: 0,          /* 内壁水雾 0..1 */
    turbid: 0,       /* 石灰水浑浊度 0..1 */
    smoke: 0,        /* 白烟强度 0..1 */
    gasIn: 0,        /* 气体是否通入石灰水 */
    gasRig: 0,       /* 导气装置从备料区移入的进度 0..1 */
    bubT: 0,         /* 通气累计时间（驱动气泡上浮） */
    charT: 0,        /* 火柴梗在火焰中的累计时间（驱动炭化由两端向中间推进） */
    stickOut: 0,     /* 炭化完成后把火柴梗取出观察的进度 0..1 */
    probeIn: 0,      /* 探针从备料区移到火焰的进度 */
    probeUse: 0,     /* 本步是否需要探针出场（只测温度那一步） */
    matchIn: 0,      /* 点燃用火柴的移动进度 */
    matchUse: 0,     /* 火柴是否该出场（用完自动归 0，回火柴盒旁） */
    matchHold: 0,    /* 点着之后火柴还举着的时长 */
    matchLv: 0,      /* 火柴火焰亮度 */
    lightWant: 0,    /* 本步是否要执行"用火柴点燃蜡烛" */
    relitWant: 0,    /* 是否已点"用火柴去点白烟"按钮 */
    stickIn: 0,      /* 火柴梗移动进度 */
    hoodIn: 0,       /* 烧杯移动进度 */
    relit: 0,        /* 白烟是否被点燃 */
    judged: false,
    t: 0
  };

  var O = {};
  /* 两点之间摆一根圆柱（铁架台横臂） */
  function armBetween(a, b, r, mat) {
    var dir = new T.Vector3().subVectors(b, a);
    var len = dir.length();
    var m = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), mat);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    m.position.copy(a).add(b).multiplyScalar(.5);
    return m;
  }
  /* 备料区：所有器材一开始就摆在桌上，用到时再移过去。
     整体向画面左侧收拢——右侧 400px 是文字面板，器材摆到 x>6 就被压住了。 */
  var HOME = {
    stick: [-2.6, .30, 4.4],   /* 前排：火柴梗 */
    probe: [1.4, .26, 5.4],    /* 右前：温度探针（横放，避开表面皿） */
    hood:  [4.4, .05, 3.2],    /* 右前：干冷烧杯（位置不动） */
    match: [-8.2, .42, 4.2],   /* 点燃用火柴：靠在火柴盒边，全场景唯一一根火柴 */
    /* 导气装置一开始就立在桌面右侧、烧杯的右后方（和其它器材一样），用到时才移过来 */
    gas:   [12.6, 0, -2.2]
  };
  /* 导气装置关键坐标（先定好，setup 与 update 共用） */
  var GAS = {
    funY0: 9.55, funH: 1.75, funR: 1.75,   /* 漏斗下沿高度 / 锥高 / 口径 */
    tipX: 0, tipY: 1.30,                   /* 导管出口（石灰水近底部）——气泡从这里冒 */
    liqTop: 5.70                           /* 液面：气泡到这儿就破了 */
  };

  /* ── 模型：火焰温度按高度分层（真实蜡烛：外焰≈1000℃ > 内焰≈820℃ > 焰心≈480℃） ── */
  var FLAME_H = 3.3;                            /* 必须与 O.flameMain 的 h 一致，探针/火柴梗按它定位 */
  function flameTemp(u) {                       /* u: 0 底部 → 1 顶端 */
    if (u > .72) return 1000;                   /* 外焰：与氧气接触最充分 */
    if (u > .30) return 820;                    /* 内焰：燃烧不充分 */
    return 480;                                 /* 焰心：石蜡蒸气，几乎不燃烧 */
  }
  /* 火柴梗炭化：3.4 s 走完"两端先焦黑 → 向中间逐渐变浅"的全过程 */
  var CHAR_FULL = 3.4;
  var CHAR_END = new T.Color(0x1a1410);

  function zoneName(u) {
    if (u > .72) return '外焰';
    if (u > .30) return '内焰';
    return '焰心';
  }

  function reset(s) {
    s.lit = 0; s.stick = 0; s.hood = 0; s.fog = 0;
    s.turbid = 0; s.smoke = 0; s.relit = 0; s.gasIn = 0; s.probe = .55;
    s.probeIn = 0; s.stickIn = 0; s.hoodIn = 0; s.matchIn = 0;
    s.gasRig = 0; s.bubT = 0; s.charT = 0; s.stickOut = 0;
    s.probeUse = 0; s.matchUse = 0; s.matchHold = 0; s.matchLv = 0;
    s.lightWant = 0; s.relitWant = 0;
  }

  /* 柔边圆点贴图：白烟用。用实心球体会出现一圈硬边，
     看起来是一串肥皂泡；径向渐变的贴片才有"烟"的虚边 */
  var smokeTex = null;
  function softDot() {
    if (smokeTex) return smokeTex;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,.92)');
    g.addColorStop(.45, 'rgba(255,255,255,.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    smokeTex = new T.CanvasTexture(c);
    return smokeTex;
  }

  /* ═══ 火柴梗炭化渐变贴图 ═══
     真实的炭化不是"三段依次跳出来"，而是从两端向内连续过渡：
     最外端焦黑 → 焦褐 → 焦黄 → 木色。用一张 256×8 的贴图画这条渐变，
     BoxGeometry 四个长面的 u 轴正好沿梗长，共用同一张贴图；
     两端的 ±X 小截面用纯色端帽（贴图 uv 在那里会整张糊上去）。 */
  var CH_W = 256, CH_H = 8;
  var chCv = null, chCtx = null, chTex = null;
  var CHAR_SPEC = [];                       /* 焦斑：位置固定，避免逐帧闪烁 */
  for (var csi = 0; csi < 30; csi++) CHAR_SPEC.push([Math.random(), Math.random()]);
  function initCharTex() {
    chCv = document.createElement('canvas');
    chCv.width = CH_W; chCv.height = CH_H;
    chCtx = chCv.getContext('2d');
    chTex = new T.CanvasTexture(chCv);
    chTex.encoding = T.sRGBEncoding;
    chTex.wrapS = chTex.wrapT = T.ClampToEdgeWrapping;
    chTex.anisotropy = 4;
  }
  var lastCharR = -9, lastCharA = -9;
  /* reachPx：已炭化长度（从两端向内，像素）；a0：端部的黑度 */
  function drawStickChar(reachPx, a0) {
    if (!chCtx) return;
    /* 值没变就别重画：省掉每帧一次 canvas→GPU 的贴图上传 */
    if (Math.abs(reachPx - lastCharR) < .9 && Math.abs(a0 - lastCharA) < .004) return;
    lastCharR = reachPx; lastCharA = a0;
    var x = chCtx, W = CH_W, H = CH_H, i;
    /* 木底色 + 两道纵向木纹 */
    x.globalAlpha = 1;
    x.fillStyle = '#c9a86e'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(176,146,96,.55)';
    x.fillRect(0, Math.round(H * .25), W, 1);
    x.fillRect(0, Math.round(H * .62), W, 1);
    if (reachPx > 1 && a0 > .01) {
      var side, sx, ex, g;
      for (side = 0; side < 2; side++) {
        sx = side === 0 ? 0 : W;
        ex = side === 0 ? reachPx : W - reachPx;
        g = x.createLinearGradient(sx, 0, ex, 0);
        g.addColorStop(0.00, 'rgba(20,15,12,' + (a0).toFixed(3) + ')');
        g.addColorStop(.20, 'rgba(46,32,20,' + (a0 * .93).toFixed(3) + ')');
        g.addColorStop(.48, 'rgba(104,72,42,' + (a0 * .66).toFixed(3) + ')');
        g.addColorStop(.78, 'rgba(152,114,72,' + (a0 * .28).toFixed(3) + ')');
        g.addColorStop(1.00, 'rgba(196,160,108,0)');
        x.fillStyle = g;
        x.fillRect(Math.min(sx, ex), 0, Math.abs(ex - sx), H);
      }
      /* 零星焦斑：越靠近两端越密越深 */
      for (i = 0; i < CHAR_SPEC.length; i++) {
        var sp = CHAR_SPEC[i], px = sp[0] * W;
        var dd = Math.min(px, W - px);
        if (dd > reachPx) continue;
        var kk = 1 - dd / Math.max(1, reachPx);
        x.fillStyle = 'rgba(28,20,14,' + (a0 * .6 * kk * (.45 + sp[1] * .55)).toFixed(3) + ')';
        x.fillRect(px, Math.floor(sp[1] * H), 2, 1);
      }
    }
    chTex.needsUpdate = true;
  }

  var scene = {
    setup: function () {
      var MAT = {
        wax: new T.MeshPhysicalMaterial({
          color: 0xfbf6ec, roughness: .42, metalness: 0, clearcoat: .55, clearcoatRoughness: .25,
          sheen: .4, sheenColor: new T.Color(0xfff2d8)
        }),
        wick: new T.MeshStandardMaterial({ color: 0x4a3f36, roughness: .95 }),
        wood: new T.MeshStandardMaterial({ color: 0xd8c49a, roughness: .85 }),
        char: new T.MeshStandardMaterial({ color: 0x1e1a17, roughness: .95 }),
        glass: new T.MeshPhysicalMaterial({
          color: 0xf2f8fc, roughness: .05, metalness: 0, transparent: true, opacity: .3,
          side: T.DoubleSide, depthWrite: false, clearcoat: .7, clearcoatRoughness: .08,
          envMapIntensity: 1.8
        }),
        steel: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 }),
        dish: new T.MeshPhysicalMaterial({ color: 0xf0f4f8, roughness: .25, metalness: 0, clearcoat: .8 })
      };
      O.MAT = MAT;

      /* 台面缩到 30×15：原来 44×28 的台面在近景里就是一块没有边的黑板，
         桌腿、柜门、踢脚全落在画面外，看着像悬空 */
      K.bench(30, 15);

      /* ═══ 蜡烛：表面皿 + 蜡柱 + 蜡油 + 烛芯 ═══ */
      var CX = -1.8, CZ = -.8, WAX_R = .92, WAX_H = 6.4;
      O.cx = CX; O.cz = CZ; O.waxR = WAX_R; O.waxH = WAX_H;

      var dish = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, .3, 36), MAT.dish);
      dish.position.set(CX, .15, CZ);
      K.scene().add(dish);

      O.wax = new T.Mesh(new T.CylinderGeometry(WAX_R, WAX_R * 1.04, WAX_H, 28), MAT.wax);
      O.wax.position.set(CX, .35 + WAX_H / 2, CZ);
      O.wax.castShadow = true;
      K.scene().add(O.wax);
      /* 蜡柱口沿的一圈软化的蜡（燃烧后略微塌陷）*/
      O.waxLip = new T.Mesh(new T.TorusGeometry(WAX_R * .96, .12, 8, 28), MAT.wax);
      O.waxLip.rotation.x = Math.PI / 2;
      O.waxLip.position.set(CX, .35 + WAX_H, CZ);
      K.scene().add(O.waxLip);
      /* 蜡油流挂：贴着烛身下沿几条不规则的蜡痕 */
      for (var wi = 0; wi < 5; wi++) {
        var waxDrop = new T.Mesh(new T.SphereGeometry(.10 + Math.random() * .06, 10, 8),
          MAT.wax);
        var wa = wi / 5 * Math.PI * 2 + .4;
        waxDrop.position.set(CX + Math.cos(wa) * WAX_R * .98,
          .35 + WAX_H * (.24 + (wi % 3) * .12),
          CZ + Math.sin(wa) * WAX_R * .98);
        waxDrop.scale.set(.62, 1.5 + (wi % 2) * .6, .62);
        K.scene().add(waxDrop);
      }
      /* 烛芯 */
      O.wick = new T.Mesh(new T.CylinderGeometry(.055, .075, 1.05, 8), MAT.wick);
      O.wick.position.set(CX, .35 + WAX_H + .5, CZ);
      K.scene().add(O.wick);

      /* ═══ 火焰：四层嵌套 Lathe（v2 轮廓 + 顶点扰动），三层温度分区由高度决定 ═══ */
      O.flameMain = K.shaderFlame({
        x: CX, y: .35 + WAX_H + .10, z: CZ,
        r0: .62, h: 3.3, light: 1.15
      });
      O.flameMain.setLit(0);

      /* ═══ 温度探针：细拉丝钢杆 + 陶瓷绝缘环 + 银灰感应珠 + 短手柄 ═══ */
      O.probeGrp = new T.Group();
      var steelFine = new T.MeshStandardMaterial({ color: 0xc7ced6, roughness: .22, metalness: .95, envMapIntensity: 1.4 });
      var rod = new T.Mesh(new T.CylinderGeometry(.045, .045, 4.0, 10), steelFine);
      rod.rotation.z = Math.PI / 2;
      rod.position.x = 2.0;
      O.probeGrp.add(rod);
      /* 陶瓷绝缘环（探针常见的白瓷件） */
      var ceramic = new T.Mesh(new T.CylinderGeometry(.085, .085, .26, 12),
        new T.MeshStandardMaterial({ color: 0xf2f5f8, roughness: .5, metalness: .05 }));
      ceramic.rotation.z = Math.PI / 2;
      ceramic.position.x = .30;
      O.probeGrp.add(ceramic);
      /* 感应珠：银灰金属小球（温度越高泛红） */
      O.bead = new T.Mesh(new T.SphereGeometry(.17, 16, 14),
        new T.MeshStandardMaterial({ color: 0xb9c2cb, roughness: .28, metalness: .85, envMapIntensity: 1.5 }));
      O.probeGrp.add(O.bead);
      /* 手柄：短、深灰橡胶 + 末端圆头 */
      var gripMat = new T.MeshStandardMaterial({ color: 0xd3d9df, roughness: .6, metalness: .1 });
      var grip = new T.Mesh(new T.CylinderGeometry(.13, .13, .85, 14), gripMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.x = 4.4;
      O.probeGrp.add(grip);
      var gripEnd = new T.Mesh(new T.SphereGeometry(.14, 12, 10), gripMat);
      gripEnd.position.x = 4.78;
      O.probeGrp.add(gripEnd);
      /* 显示屏头：让它一眼看出是"温度探针"，而不是火柴 */
      var head = new T.Mesh(new T.BoxGeometry(.8, .55, .3),
        new T.MeshStandardMaterial({ color: 0xe8edf2, roughness: .48, metalness: .1 }));
      head.position.set(5.25, 0, 0); O.probeGrp.add(head);
      var scrMat = new T.MeshBasicMaterial({ color: new T.Color(0x2fffa0).multiplyScalar(1.7) });
      var scrF = new T.Mesh(new T.PlaneGeometry(.5, .3), scrMat); scrF.position.set(5.25, 0, .155); O.probeGrp.add(scrF);
      var scrB = new T.Mesh(new T.PlaneGeometry(.5, .3), scrMat); scrB.position.set(5.25, 0, -.155); scrB.rotation.y = Math.PI; O.probeGrp.add(scrB);
      O.probeGrp.position.set(HOME.probe[0], HOME.probe[1], HOME.probe[2]);
      O.probeGrp.rotation.y = Math.PI / 2;      /* 备料时杆朝镜头，不横穿其他器材 */
      O.probeGrp.visible = true;
      K.scene().add(O.probeGrp);

      /* ═══ 火柴梗（横穿火焰） ═══ */
      O.stickGrp = new T.Group();
      initCharTex();
      drawStickChar(0, 0);
      /* 火柴梗：方形木条（真实火柴梗是方截面）。长度按火焰半径定：
         梗两端应刚好落在外焰外缘（r≈.66），原来 3.4 让两端悬在空气里 */
      O.stickMat = new T.MeshStandardMaterial({ map: chTex, color: 0xffffff, roughness: .92, metalness: 0 });
      O.stickCapMat = new T.MeshStandardMaterial({ color: 0xc9a86e, roughness: .92, metalness: 0 });
      var stickGeo = new T.BoxGeometry(2.3, .17, .17);
      /* BoxGeometry 分组顺序：+X −X +Y −Y +Z −Z。±X 是两端 0.17×0.17 的小截面，
         用纯色端帽；其余四个长面用沿梗长渐变的炭化贴图 */
      O.stickBar = new T.Mesh(stickGeo, [
        O.stickCapMat, O.stickCapMat,
        O.stickMat, O.stickMat, O.stickMat, O.stickMat
      ]);
      O.stickGrp.add(O.stickBar);
      O.stickGrp.position.set(HOME.stick[0], HOME.stick[1], HOME.stick[2]);
      O.stickGrp.visible = true;
      K.scene().add(O.stickGrp);

      /* ═══ 罩上的干冷烧杯（倒扣，内壁可结水雾） ═══ */
      O.hoodGrp = new T.Group();
      /* 250 mL 烧杯比例（高/径≈1.45）。原来 r2.9/h8.6 摆在桌上比蜡烛大一圈，
         直接把蜡烛和试管都挡住了 */
      var hood = K.glassCyl({ r: 2.0, h: 5.8, x: 0, z: 0, y0: .2, noHalo: true, noSide: true });
      O.hoodGrp.add(hood);
      /* 内壁水雾层：贴在玻璃内表面的一层白雾。
         玻璃材质是 depthWrite:false，不设 renderOrder 会被玻璃盖住，
         之前"水雾看不见"就是这个原因 */
      var fogMat = new T.MeshBasicMaterial({
        color: 0xf4f9ff, transparent: true, opacity: 0,
        side: T.BackSide, depthWrite: false
      });
      O.fogMesh = new T.Mesh(new T.CylinderGeometry(1.94, 1.94, 5.4, 36, 1, true), fogMat);
      O.fogMesh.position.y = 2.9;
      O.fogMesh.renderOrder = 12;
      O.hoodGrp.add(O.fogMesh);
      /* 杯底（倒扣时的顶端）也要结雾 */
      O.fogTop = new T.Mesh(new T.CircleGeometry(1.94, 36), fogMat);
      O.fogTop.rotation.x = Math.PI / 2;
      O.fogTop.position.y = 5.6;
      O.fogTop.renderOrder = 12;
      O.hoodGrp.add(O.fogTop);
      /* 杯口的水珠：一圈小水珠，贴着内壁、集中在杯口附近
         （原来半径 .19 + 不透明度 .75，看起来像一圈乒乓球浮在杯里） */
      O.drops = [];
      var dgeo = new T.SphereGeometry(.11, 8, 6);
      var dmat = new T.MeshPhysicalMaterial({
        color: 0xffffff, roughness: .04, metalness: 0, transparent: true, opacity: .58
      });
      for (var di = 0; di < 24; di++) {
        var da = di / 24 * Math.PI * 2;
        var dr = new T.Mesh(dgeo, dmat);
        /* 水雾结在整个内壁（靠近杯底的内壁最凉、凝得最明显），
           不只挤在杯口一圈 */
        dr.position.set(Math.cos(da) * 1.92, .7 + (di % 5) * .9, Math.sin(da) * 1.92);
        dr.scale.set(1, 1.35, 1);
        dr.visible = false;
        O.hoodGrp.add(dr);
        O.drops.push(dr);
      }
      O.hoodGrp.position.set(HOME.hood[0], HOME.hood[1], HOME.hood[2]);
      O.hoodGrp.visible = true;
      K.scene().add(O.hoodGrp);

      /* ═══ 石灰水试管（检验 CO₂） ═══ */
      /* 位置往画面左后方挪：原来 TX=4.5、z=0 与备料区的烧杯在视线方向上重叠，
         看着像"试管插在烧杯里" */
      var TX = -6.2, TZ = -1.6;
      O.tubeZ = TZ;
      /* 高径比 9.6 : 2.36 ≈ 4：试管要细长，粗了看着就是个烧杯 */
      O.tube = K.glassCyl({ r: .95, h: 9.6, x: TX, z: TZ, y0: .2, noHalo: true, noSide: true });
      /* 初始要"清澈"：原来 opacity .5 已经接近乳白，变浑浊后反而看不出差别 */
      O.lime = K.liquidCyl({ r: .82, h: 5.6, x: TX, z: TZ, y0: .4, color: 0xdceef5, opacity: .34 });
      O.limeTop = K.liquidTop({ r: .82, x: TX, z: TZ, y: 6.0, color: 0xf2fbff });
      K.spriteLabel([TX, 7.3, TZ], '澄清石灰水', { w: 4.2, fs: 34 });

      /* 石灰水：renderOrder 必须排在导管(2)、气泡(7)之后——
         液体 depthWrite:true，若先画会把伸进液面以下的导管整段挡掉 */
      O.lime.renderOrder = 4;
      O.limeTop.renderOrder = 5;

      /* 浑浊颗粒：按"从底往上"的顺序编号 —— 通气时浑浊是贴着导管口先起来的，
         不是整杯同时变白 */
      O.milk = [];
      var mgeo = new T.SphereGeometry(.13, 8, 6);
      var mmat = new T.MeshBasicMaterial({ color: 0xe9eff5, transparent: true, opacity: 0 });
      for (var mi = 0; mi < 46; mi++) {
        var mm = new T.Mesh(mgeo, mmat.clone());
        var ma = Math.random() * Math.PI * 2, mr = Math.random() * .58;
        var my0 = .75 + (mi / 46) * 4.9 + (Math.random() - .5) * .14;
        mm.position.set(TX + Math.cos(ma) * mr, my0, TZ + Math.sin(ma) * mr);
        mm.userData.y0 = my0;
        mm.material.depthWrite = false;
        mm.material.depthTest = false;   /* 同上：别被液体前表面剔掉 */
        mm.renderOrder = 6;              /* 排在液体表面之后，否则颗粒被液面挡住看不见 */
        mm.visible = false;
        K.scene().add(mm);
        O.milk.push(mm);
      }

      /* ═══ 导气装置：漏斗罩在火焰上方收气 → 乳胶管 → 玻璃导管伸到石灰水底部 ═══
         教材原话是"把蜡烛燃烧产生的气体通入澄清石灰水"，不画出这条通路，
         学生只看到一杯水自己变白了，过程是断的。 */
      GAS.tipX = TX + .30;
      O.gasGrp = new T.Group();                 /* 位移层：从备料区移入 */
      O.gasPivot = new T.Group();               /* 姿态层：绕装置中心微倾 */
      var PVX = (CX + GAS.tipX) / 2, PVY = 6.6, PVZ = (CZ + TZ) / 2;
      O.gasPivot.position.set(PVX, PVY, PVZ);
      O.gasInner = new T.Group();
      O.gasInner.position.set(-PVX, -PVY, -PVZ);
      O.gasPivot.add(O.gasInner);
      O.gasGrp.add(O.gasPivot);

      var fMat = new T.MeshPhysicalMaterial({
        color: 0xeaf3fa, roughness: .06, metalness: 0, transparent: true, opacity: .28,
        side: T.DoubleSide, depthWrite: false, clearcoat: .85, clearcoatRoughness: .06,
        envMapIntensity: 1.7
      });
      /* 漏斗（倒扣锥形罩）：下沿在火焰尖上方，罩住燃烧产物 */
      var funnel = new T.Mesh(new T.CylinderGeometry(.20, GAS.funR, GAS.funH, 36, 1, true), fMat);
      funnel.position.set(CX, GAS.funY0 + GAS.funH / 2, CZ);
      O.gasInner.add(funnel);
      var frim = new T.Mesh(new T.TorusGeometry(GAS.funR, .075, 8, 44), fMat);
      frim.rotation.x = Math.PI / 2;
      frim.position.set(CX, GAS.funY0, CZ);
      O.gasInner.add(frim);
      /* 漏斗尾管 */
      var stem = new T.Mesh(new T.CylinderGeometry(.20, .20, .95, 14), fMat);
      stem.position.set(CX, GAS.funY0 + GAS.funH + .45, CZ);
      O.gasInner.add(stem);

      /* 铁架台：漏斗必须有支撑——悬在半空一眼就是假的。
         底座落在蜡烛正后方（不挡镜头、也不与试管底座打架） */
      var BX = CX - 2.7, BZ = CZ - 3.4;
      var standMat = new T.MeshStandardMaterial({ color: 0x9aa2aa, roughness: .38, metalness: .90, envMapIntensity: 1.25 });
      var baseMat = new T.MeshStandardMaterial({ color: 0x6d757c, roughness: .58, metalness: .70, envMapIntensity: 1.0 });
      var sBase = new T.Mesh(K.geoRoundBox(3.2, .34, 1.4, .10, 3), baseMat);
      sBase.position.set(BX, .17, BZ);
      sBase.castShadow = true; sBase.receiveShadow = true;
      O.gasInner.add(sBase);
      var sRod = new T.Mesh(new T.CylinderGeometry(.19, .19, 12.7, 14), standMat);
      sRod.position.set(BX, .34 + 6.35, BZ);
      sRod.castShadow = true;
      O.gasInner.add(sRod);
      /* 铁夹：横臂（按两点连线摆，斜着夹也成立）+ 抱箍 + 紧固螺帽 */
      var clampY = GAS.funY0 + GAS.funH + .32;
      var sArm = armBetween(new T.Vector3(BX, clampY, BZ), new T.Vector3(CX, clampY, CZ), .10, standMat);
      O.gasInner.add(sArm);
      var sRing = new T.Mesh(new T.TorusGeometry(.29, .07, 8, 20), standMat);
      sRing.rotation.x = Math.PI / 2;
      sRing.position.set(CX, clampY, CZ);
      O.gasInner.add(sRing);
      var sKnob = new T.Mesh(new T.CylinderGeometry(.13, .13, .34, 10), standMat);
      sKnob.rotation.x = Math.PI / 2;
      sKnob.position.set(BX + .34, clampY, BZ);
      O.gasInner.add(sKnob);

      /* 乳胶管：从尾管拱上去、再拐下来接玻璃导管 */
      var hoseMat = new T.MeshStandardMaterial({ color: 0x25292f, roughness: .82, metalness: .04, envMapIntensity: .35 });
      var hc = new T.CatmullRomCurve3([
        new T.Vector3(CX, GAS.funY0 + GAS.funH + .88, CZ),
        new T.Vector3(CX - .55, GAS.funY0 + GAS.funH + 1.62, CZ + .08),
        new T.Vector3(CX - 1.95, GAS.funY0 + GAS.funH + 1.60, CZ - .55),
        new T.Vector3(GAS.tipX + .80, 12.45, TZ),
        new T.Vector3(GAS.tipX + .06, 12.15, TZ),
        new T.Vector3(GAS.tipX, 11.55, TZ)
      ]);
      var hose = new T.Mesh(new T.TubeGeometry(hc, 72, .19, 12, false), hoseMat);
      hose.castShadow = true;
      O.gasInner.add(hose);

      /* 玻璃导管：竖直穿过试管口，出口埋在液面以下（气泡从出口冒） */
      var dtMat = new T.MeshPhysicalMaterial({
        color: 0xf0f7fc, roughness: .05, metalness: 0, transparent: true, opacity: .52,
        side: T.DoubleSide, depthWrite: false, clearcoat: .9, clearcoatRoughness: .06,
        envMapIntensity: 1.6
      });
      var dtLen = 11.55 - GAS.tipY;
      var dtube = new T.Mesh(new T.CylinderGeometry(.145, .145, dtLen, 14), dtMat);
      dtube.position.set(GAS.tipX, (11.55 + GAS.tipY) / 2, TZ);
      dtube.renderOrder = 2;             /* 先于液体绘制，才能"透过石灰水"看见 */
      O.gasInner.add(dtube);
      O.gasTube = dtube;

      O.gasGrp.position.set(HOME.gas[0], HOME.gas[1], HOME.gas[2]);
      K.scene().add(O.gasGrp);

      /* 气泡：从导管口连续冒出、上浮到液面破掉 */
      O.bubbles = [];
      var bgeo = new T.SphereGeometry(.18, 12, 9);
      for (var bi = 0; bi < 34; bi++) {
        /* 气泡靠"亮边 + 半透明银灰"才看得见：纯白半透明球在浅色液体上等于隐形 */
        var bmat = new T.MeshPhysicalMaterial({
          color: 0xdcebf6, roughness: .02, metalness: .05, transparent: true, opacity: 0,
          side: T.DoubleSide, clearcoat: 1, clearcoatRoughness: .03,
          envMapIntensity: 2.2, depthWrite: false,
          depthTest: false   /* 液体写深度，气泡在其前表面之后会被整颗剔掉 */
        });
        var bm = new T.Mesh(bgeo, bmat);
        bm.userData.ph = bi / 28;
        bm.userData.w = Math.random() * 6.283;
        bm.renderOrder = 7;
        bm.visible = false;
        K.scene().add(bm);
        O.bubbles.push(bm);
      }

      /* ═══ 白烟（熄灭后上升的石蜡蒸气） ═══ */
      O.smoke = [];
      var stex = softDot();
      for (var si = 0; si < 26; si++) {
        var sm = new T.Sprite(new T.SpriteMaterial({
          map: stex, color: 0xe9eff6, transparent: true, opacity: 0, depthWrite: false
        }));
        sm.userData.ph = Math.random();
        sm.position.set(CX, .35 + WAX_H + .3, CZ);
        K.scene().add(sm);
        O.smoke.push(sm);
      }

      /* ═══ 火柴盒（静态道具，让"要用的东西一开始都在"这件事成立） ═══ */
      var boxMat = new T.MeshStandardMaterial({ color: 0xe8e2d6, roughness: .82 });
      var mBox = new T.Mesh(new T.BoxGeometry(1.9, .42, 1.2), boxMat);
      mBox.position.set(-7.4, .28, 3.6);
      K.scene().add(mBox);
      var mLabel = new T.Mesh(new T.PlaneGeometry(1.7, 1.0),
        new T.MeshBasicMaterial({ color: 0xc8442e }));
      mLabel.rotation.x = -Math.PI / 2;
      mLabel.position.set(-7.4, .50, 3.6);
      K.scene().add(mLabel);
      /* 注意：原来这里还斜靠着一根装饰火柴，加上会移动的"点燃用火柴"，
         场景里同时出现两根火柴（学生第一眼就数出两根，且分不清哪根是点燃用的）。
         现只保留一根真的会烧的火柴，装饰那根已删除。 */

      /* ═══ 点燃用火柴（会真的烧）：木梗 + 红头对齐 + 小火焰 ═══ */
      O.matchGrp = new T.Group();
      var mRod = new T.Mesh(new T.BoxGeometry(2.3, .09, .09), MAT.wood);
      mRod.position.x = 1.15;            /* 原点在红头端 */
      O.matchGrp.add(mRod);
      var mHead2 = new T.Mesh(new T.SphereGeometry(.11, 10, 8),
        new T.MeshStandardMaterial({ color: 0xb0341e, roughness: .5 }));
      mHead2.scale.set(1.25, .95, .95);
      O.matchGrp.add(mHead2);
      /* 划燃后的小火焰（几何火舌） */
      O.matchFlame = K.shaderFlame({ x: 0, y: .16, z: 0, r0: .22, h: .9, light: .3, parent: O.matchGrp });
      O.matchFlame.setLit(0);
      O.matchGrp.position.set(HOME.match[0], HOME.match[1], HOME.match[2]);
      O.matchGrp.rotation.set(0, Math.PI + .4, -.32);   /* 红头在内、梗斜向外下 */
      K.scene().add(O.matchGrp);

      /* 接触阴影 */
      K.blob({ x: CX, z: CZ, r: 3.8 });
      K.blob({ x: TX, z: TZ, r: 1.7 });

      /* 标注与交互。蜡烛不挂常显贴片标签：它挡住的正好是试管底部，
         而且"蜡烛"三个字在第一步正文里已经说清了；悬停时仍有 tag 提示 */
      K.tag(O.wax, '蜡烛', '石蜡 + 棉芯');
      K.tag(O.hoodGrp, '干冷烧杯', '罩住火焰检验水');
      K.tag(O.gasGrp, '导气装置', '漏斗收集燃烧产生的气体，经导管通入澄清石灰水');
      K.tag(O.stickGrp, '火柴梗', '横穿火焰：两端先炭化变黑，向中间逐渐变浅');
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      var i, f;

      /* 燃烧累计（点燃才计时） */
      if (s.lit > .5) s.burnT = Math.min(60, s.burnT + dt);

      /* 火焰：几何火焰由本课驱动（渐亮渐暗 + 摇曳 + 位置跟随蜡柱） */
      var fv = (s.lit > .5 || s.relit > .5) ? 1 : 0;
      var flv = s.flameLv === undefined ? 0 : s.flameLv;   /* 先取值，避免 undefined 参与运算 */
      s.flameLv = flv + (fv - flv) * Math.min(1, dt * 4.2);
      O.flameMain.setLit(s.flameLv);
      O.flameMain.tick(s.t);

      /* 蜡柱随燃烧变短 + 蜡油池变宽 */
      var burn = Math.min(1, s.burnT / 55);
      var h = O.waxH * (1 - burn * .16);
      O.wax.scale.y = h / O.waxH;
      O.wax.position.y = .35 + h / 2;
      O.waxLip.position.y = .35 + h;
      O.wick.position.y = .35 + h + .45;
      O.flameMain.mesh.position.set(O.cx, .35 + h + .12, O.cz);
      O.flameMain.light.position.set(O.cx, .35 + h + .12 + O.flameMain.h * .55, O.cz);

      /* ═══ 器材动线：先在备料区，用到时滑到使用位（不再"突然出现"） ═══ */
      function ease(cur, target, sp) { return cur + (target - cur) * Math.min(1, dt * sp); }

      /* 探针：只在本步（测火焰温度）才进火焰。
         原来条件是"只要点燃就伸进去"，于是后面每一步火焰里都横着一根探针 */
      var tProbe = (s.lit > .5 && s.probeUse > .5) ? 1 : 0;
      s.probeIn = ease(s.probeIn || 0, tProbe, 3.4);
      var uRaw = Math.max(0, Math.min(1, s.probe));
      s.probeDisp = (s.probeDisp === undefined) ? uRaw : s.probeDisp + (uRaw - s.probeDisp) * Math.min(1, dt * 4.5);
      var u = s.probeDisp;
      var pUseX = O.cx + .1, pUseY = .35 + h + .25 + u * FLAME_H;
      O.probeGrp.position.set(
        HOME.probe[0] + (pUseX - HOME.probe[0]) * s.probeIn,
        HOME.probe[1] + (pUseY - HOME.probe[1]) * s.probeIn,
        HOME.probe[2] + (O.cz - HOME.probe[2]) * s.probeIn
      );
      /* 常驻桌面：不用时就停在备料位，不再整根隐藏 */
      var tempT = flameTemp(u);
      var heat = Math.max(0, tempT - 400) / 600;
      /* 感应珠保持银灰金属（红色是火柴/火焰的专属色，不能混淆），
         温度只体现在微弱的红热 emissive 上 */
      O.bead.material.color.setHex(0xb9c2cb);
      O.bead.material.emissive.setHex(0x882211);
      O.bead.material.emissiveIntensity = heat * .5;

      /* 火柴梗：从桌面移到火焰中线，两端先炭化、再向内逐渐变浅，
         炭化完成后像真实操作那样"取出"到一旁观察（在火焰里看不清渐变） */
      var tStick = s.stick > .5 ? 1 : 0;
      s.stickIn = ease(s.stickIn || 0, tStick, 3.2);
      /* 横穿火焰中部（不是上部）：原来 .62 落在外焰顶端，梗看着像"压在火尖上" */
      var sUseX = O.cx, sUseY = .35 + h + .55 + .55 * FLAME_H, sUseZ = O.cz + .9;
      /* 取出位：向右前方挪出火焰、略降低，正对镜头便于观察炭化梯度 */
      var sOutX = O.cx + 3.1, sOutY = sUseY - 1.05, sOutZ = O.cz + 3.0;
      var charDone = (s.charT || 0) >= CHAR_FULL - .001;
      var tOut = (s.stick > .5 && charDone) ? 1 : 0;
      s.stickOut = ease(s.stickOut || 0, tOut, 2.2);
      var so = s.stickOut;
      var stX = sUseX + (sOutX - sUseX) * so;
      var stY = sUseY + (sOutY - sUseY) * so;
      var stZ = sUseZ + (sOutZ - sUseZ) * so;
      O.stickGrp.position.set(
        HOME.stick[0] + (stX - HOME.stick[0]) * s.stickIn,
        HOME.stick[1] + (stY - HOME.stick[1]) * s.stickIn,
        HOME.stick[2] + (stZ - HOME.stick[2]) * s.stickIn
      );
      /* 同上：火柴梗也常驻备料位 */
      /* 炭化只在"火柴梗已经在火焰里"时推进；取出后不再加深 */
      var stickAt = (s.stick > .5 && s.stickIn > .78 && s.stickOut < .12) ? 1 : 0;
      if (stickAt > .5) s.charT = Math.min(CHAR_FULL, (s.charT || 0) + dt);
      else if (s.stick < .5) s.charT = 0;
      var ct = (s.charT || 0) / CHAR_FULL;                 /* 0 → 1 */
      /* 炭化前沿：从两端向中心推进（半长 1.15，留 0.15 让中心保持木色） */
      var reach = Math.min(1.00, ct * 1.26);
      var black = Math.min(1, ct * 1.7);
      drawStickChar(reach / 1.15 * (CH_W / 2), black);
      /* 两端截面跟着变黑；还在火焰里时带一点炭火微光 */
      O.stickCapMat.color.setHex(0xc9a86e);
      if (black > .001) O.stickCapMat.color.lerp(CHAR_END, black);
      O.stickCapMat.emissive.setHex(0x551a08);
      O.stickCapMat.emissiveIntensity = stickAt > .5 ? Math.min(.30, ct * .42) : 0;

      /* 点燃用火柴：只在"需要它出场"的那一步出现
         旧逻辑是 (lit || relit) 就一直停在烛芯旁——烧杯都罩上了火柴还在里面烧。
         现在由 matchUse 控制，用完自动退场回到火柴盒旁。 */
      var tMatch = s.matchUse > .5 ? 1 : 0;
      s.matchIn = ease(s.matchIn || 0, tMatch, 3.2);
      var mIn = s.matchIn;
      /* 点白烟时要抬到烟柱中段，而不是停在烛芯高度。
         水平位置也要退到火焰外侧（原来 cx-.55 已经在火焰半径 .62 里面，
         火柴整个被火焰挡住，看着像"火柴消失了"） */
      var mUseX = O.cx - 1.0;
      var mUseY = .35 + h + .35 + ((s.relitWant > .5 && s.relit < .5) ? 1.5 : 0);
      var mUseZ = O.cz;
      O.matchGrp.position.set(
        HOME.match[0] + (mUseX - HOME.match[0]) * mIn,
        HOME.match[1] + (mUseY - HOME.match[1]) * mIn + Math.sin(Math.PI * mIn) * .9,
        HOME.match[2] + (mUseZ - HOME.match[2]) * mIn
      );
      O.matchGrp.rotation.z = Math.sin(s.t * 5.2) * .05 * Math.sin(Math.PI * mIn);
      /* 火柴只在"已经划燃、还没点着"这段时间烧 */
      var matchBurning = (s.matchUse > .5 && mIn > .55 && s.lit < .5 && s.relit < .5) ? 1 : 0;
      var mlv = s.matchLv === undefined ? 0 : s.matchLv;
      s.matchLv = mlv + ((matchBurning ? 1 : 0) - mlv) * Math.min(1, dt * 5);
      O.matchFlame.setLit(s.matchLv);
      O.matchFlame.tick(s.t + 2.4);

      /* 火柴凑到烛芯 → 点燃。只由"点燃"这一步触发；
         原来的 if (mIn > .8) s.lit = 1 不分场合，点白烟时会把蜡烛又点着 */
      if (s.lightWant > .5 && mIn > .82 && s.lit < .5) {
        s.lit = 1; s.matchHold = 0;
      }
      /* 火柴凑到烟柱 → 白烟被引燃，火焰顺着烟回到烛芯；火柴随即撤离 */
      if (s.relitWant > .5 && s.relit < .5 && mIn > .82) {
        s.relit = 1; s.smoke = 0; s.matchUse = 0; s.matchHold = 0;
      }
      /* 点完之后火柴再举 1.8 s 就熄灭退场，回到火柴盒旁 */
      if (s.matchUse > .5 && (s.lit > .5 || s.relit > .5)) {
        s.matchHold = (s.matchHold || 0) + dt;
        if (s.matchHold > 1.8) s.matchUse = 0;
      }

      /* 干冷烧杯：从备料区移到蜡烛上方，杯口罩到烛顶稍下——
         火焰整个在杯内；杯子是"倒扣在火焰上"的手持操作，不落到桌面
         （落桌面的话杯高不够，火焰会从杯顶穿出去） */
      var tHood = s.hood > .5 ? 1 : 0;
      s.hoodIn = ease(s.hoodIn || 0, tHood, 3.6);
      var hUseY = .35 + h - .55;
      O.hoodGrp.position.set(
        HOME.hood[0] + (O.cx - HOME.hood[0]) * s.hoodIn,
        HOME.hood[1] + (hUseY - HOME.hood[1]) * s.hoodIn + Math.sin(Math.PI * s.hoodIn) * .55,
        HOME.hood[2] + (O.cz - HOME.hood[2]) * s.hoodIn
      );
      /* "扣"的姿态：行进中杯身微倾、到手时摆正；像被手拿过去扣下 */
      var tiltK = Math.sin(Math.PI * s.hoodIn);   /* 只在移动途中倾斜，到位/备料时摆正 */
      O.hoodGrp.rotation.z = tiltK * .3;
      O.hoodGrp.rotation.x = tiltK * .12;
      O.hoodGrp.visible = true;
      if (s.hoodIn > .85 && s.hood > .5) {
        var fogK = Math.min(1, s.burnT / 12);
        s.fog = fogK;
        O.fogMesh.material.opacity = fogK * .74;
        for (i = 0; i < O.drops.length; i++) {
          O.drops[i].visible = fogK > .35;
          O.drops[i].material.opacity = .3 + fogK * .42;
        }
      } else {
        O.fogMesh.material.opacity = 0;
      }

      /* ═══ 导气装置：从左上前方"端过来"，漏斗扣到火焰上方、导管插进石灰水 ═══ */
      var tGasRig = s.gasIn > .5 ? 1 : 0;
      s.gasRig = ease(s.gasRig || 0, tGasRig, 1.9);
      var gk = s.gasRig || 0;
      O.gasGrp.position.set(
        HOME.gas[0] * (1 - gk),
        HOME.gas[1] * (1 - gk) + Math.sin(Math.PI * gk) * .55,
        HOME.gas[2] * (1 - gk));
      /* 移动途中微倾、略抬起，落到位摆正——像用手端着放下去 */
      var gtilt = Math.sin(Math.PI * gk);
      O.gasPivot.rotation.z = gtilt * .10;
      O.gasPivot.rotation.x = gtilt * .05;

      /* ═══ 石灰水：气体从导管口鼓泡进入 → 由下往上逐渐变浑浊 ═══
         导管出口必须埋在液面以下才有"通入"这回事；浑浊也要跟着气泡走，
         不能一按开关整杯瞬间变白 */
      var flowing = (s.gasIn > .5 && gk > .88) ? 1 : 0;
      if (flowing > .5) s.bubT = (s.bubT || 0) + dt;
      /* 通气推进浑浊；撤掉装置后缓慢回清（换一步时 reset 会直接归零） */
      s.turbid = Math.max(0, Math.min(1, s.turbid + (flowing > .5 ? dt * .30 : -dt * 1.4)));
      var tk = s.turbid;
      /* 观感曲线：真实石灰水一通气就很快发白，线性插值到 60% 时还像清水 */
      var wk = Math.pow(tk, .6);
      var milkCol = new T.Color(0xdceef5).lerp(new T.Color(0xffffff), wk);
      K.setLiquidColor(O.lime, milkCol, .96 - wk * .24);
      O.lime.material.uniforms.uOpacity.value = .40 + wk * .52;
      K.setLiquidColor(O.limeTop, milkCol, .96);
      for (i = 0; i < O.milk.length; i++) {
        /* 编号即高度顺序：底部先浑，往上推进 */
        var showM = tk > .04 && i < Math.round(tk * O.milk.length);
        O.milk[i].visible = showM;
        if (showM) {
          O.milk[i].material.opacity = Math.min(.95, .40 + wk * .55);
          O.milk[i].position.y = O.milk[i].userData.y0 + Math.sin(s.t * .8 + i) * .11;
        }
      }
      /* 气泡：导管口 → 液面，边升边略微变大，越浑越看不清 */
      for (i = 0; i < O.bubbles.length; i++) {
        var bb = O.bubbles[i];
        if (flowing < .5) { bb.visible = false; continue; }
        var bph = ((s.bubT * .52) + bb.userData.ph) % 1;
        var bsz = .90 + bph * 1.10;
        bb.visible = true;
        bb.position.set(
          GAS.tipX + Math.sin(bph * 7.4 + bb.userData.w) * .10,
          GAS.tipY + .16 + bph * (GAS.liqTop - GAS.tipY - .22),
          O.tubeZ + Math.cos(bph * 6.2 + bb.userData.w) * .10);
        /* 上升中的气泡是扁的（长轴水平），不是标准球 */
        bb.scale.set(bsz * 1.14, bsz * .84, bsz * 1.14);
        bb.material.opacity = (.55 + .38 * Math.sin(bph * Math.PI)) * (1 - wk * .50);
      }

      /* 白烟：熄灭后上升、散开，可被点燃 */
      var smokeK = s.smoke > .5 ? 1 : 0;
      for (i = 0; i < O.smoke.length; i++) {
        var sm = O.smoke[i];
        if (smokeK) {
          var ph = (sm.userData.ph + s.t * .30) % 1;
          sm.visible = true;
          sm.position.set(
            O.cx + Math.sin(ph * 6.2 + i) * .34,
            .35 + h + .40 + ph * 4.8,
            O.cz + Math.cos(ph * 5.1 + i) * .34);
          /* 贴片：越往上越大越淡，形成一缕散开的烟 */
          var sc = .5 + ph * 1.9;
          sm.scale.set(sc, sc, 1);
          sm.material.opacity = Math.sin(Math.min(1, ph * 1.1) * Math.PI) * .88 * smokeK;
        } else {
          sm.visible = false;
        }
      }
      if (s.relit > .5) O.flameMain.lit = true;

      /* 石灰水标注随状态更新 */
    }
  };

  K.boot({
    title: '对蜡烛及其燃烧的探究',
    chip: '化学 · 九上 · 第一单元 步入化学殿堂 · 课题2 化学研究些什么（鲁教版）',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { ty: 7.2, dist: 31, tx: .8, yaw: .24, pitch: .19 },

    reads: [
      ['lit', '状态'],
      ['temp', '探针位置温度'],
      ['zone', '所处火焰层'],
      ['water', '生成的水'],
      ['gas', '通气状态'],
      ['co2', '生成的 CO₂'],
      ['concl', '结论']
    ],

    values: function (s) {
      var u = Math.max(0, Math.min(1, s.probe));
      var on = s.lit > .5;
      return {
        lit: s.relit > .5 ? '白烟被点燃' : (on ? '燃烧中' : (s.burnT > 1 ? '已熄灭' : '未点燃')),
        temp: (on && s.probeUse > .5) ? flameTemp(u).toFixed(0) + ' ℃' : '—',
        zone: (on && s.probeUse > .5) ? zoneName(u) : '—',
        water: s.fog > .02 ? '已检出（内壁水雾）' : '未检出',
        gas: s.gasIn > .5
          ? ((s.gasRig || 0) > .88 ? '通入中·导管口冒泡' : '导管正在插入')
          : '未通气',
        co2: s.turbid > .1
          ? '已检出（浑浊 ' + Math.round(s.turbid * 100) + '%）' : '未检出',
        concl: s.judged ? '化学变化：生成了水和二氧化碳' : '—'
      };
    },

    steps: [
      {
        name: '先看蜡烛',
        title: '蜡烛是什么样的物质？',
        ask: '蜡烛是固体还是液体？能溶于水吗？',
        body: '<p><b>观察物理性质：</b>蜡烛是<b>白色（或彩色）固体</b>，有轻微的石油气味，' +
          '<b>不溶于水</b>，密度比水小（会浮在水面上），硬度小、易熔化。</p>' +
          '<p><b>思考：</b>这些性质属于<b>物理性质</b>——不需要发生化学变化就能表现出来。</p>',
        apply: function (s) {
          reset(s); s.burnT = 0; s.judged = false;
        }
      },
      {
        name: '点燃看火焰',
        title: '火焰分成三层，温度不一样',
        ask: '为什么外焰最亮、焰心反而最暗？',
        body: '<p><b>点燃后</b>火焰分三层：<b>外焰、内焰、焰心</b>。</p>' +
          '<p>外焰与空气（氧气）接触最充分，燃烧最完全，<b>温度最高（约 1000 ℃）</b>；' +
          '内焰燃烧不充分（约 820 ℃）；焰心是<b>石蜡蒸气</b>，几乎没有燃烧（约 480 ℃）。</p>' +
          '<p>用这支<b>带显示屏的温度探针</b>（前端银珠感应，插入火焰测温度）上下移动，看读数怎么变。</p>',
        apply: function (s) { reset(s); s.lightWant = 1; s.matchUse = 1; s.probeUse = 1; },
        controls: [
          { type: 'range', key: 'probe', min: 0, max: 1, step: .05, label: '探针高度（0 焰心底部 → 1 外焰顶端）' }
        ]
      },
      {
        name: '外焰最热',
        title: '用火柴梗验证：两端先变黑',
        ask: '为什么火柴梗是两端变黑，中间反而没事？',
        body: '<p><b>操作：</b>把火柴梗横穿火焰中部，约 1 秒后取出观察。</p>' +
          '<p><b>现象：</b>火柴梗<b>接触外焰的两端先炭化变黑</b>，' +
          '越往中间颜色越浅——焦黑 → 焦褐 → 焦黄 → 木色，是一条连续的过渡带，' +
          '中间（焰心处）几乎不变。</p>' +
          '<p><b>结论：</b>外焰温度最高。所以加热时要用<b>外焰</b>，这也解释了为什么酒精灯要用外焰加热。</p>' +
          '<p style="color:#7a8899;font-size:12.5px">炭化完成后火柴梗会自动取出到一旁——在火焰里被火光包住，看不清这条渐变。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.stick = 1; s.burnT = Math.max(s.burnT, 6); },
        controls: [
          { type: 'btn', label: '重新演示炭化过程', onClick: function (s) { s.charT = 0; s.stickOut = 0; } }
        ]
      },
      {
        name: '产物一：水',
        title: '干冷的烧杯罩上去，内壁出现水雾',
        ask: '水雾是从哪来的？为什么烧杯必须是"干冷"的？',
        body: '<p><b>操作：</b>把一个<b>干燥、冰冷</b>的烧杯倒扣在火焰上方。</p>' +
          '<p><b>现象：</b>烧杯内壁出现<b>水雾</b>（小水珠），杯口有水珠聚集。</p>' +
          '<p><b>结论：</b>蜡烛燃烧生成了<b>水</b>。<br>' +
          '烧杯必须干冷：如果有水，就分不清水雾是原来的还是生成的。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.hood = 1; s.burnT = Math.max(s.burnT, 10); }
      },
      {
        name: '产物二：二氧化碳',
        title: '把气体通入澄清石灰水',
        ask: '石灰水变浑浊说明了什么？',
        body: '<p><b>操作：</b>把一个<b>漏斗</b>倒扣在火焰上方收集蜡烛燃烧产生的气体，' +
          '经乳胶管接到一根玻璃导管，导管口<b>插到澄清石灰水的液面以下</b>，把气体通入。</p>' +
          '<p><b>现象：</b>导管口<b>连续冒出气泡</b>，气泡在液体中上升；' +
          '澄清石灰水<b>由下往上逐渐变浑浊</b>（生成难溶的碳酸钙）。</p>' +
          '<p><b>结论：</b>蜡烛燃烧生成了<b>二氧化碳</b>。' +
          '反应式：CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O</p>' +
          '<p style="color:#7a8899;font-size:12.5px">为什么要通到液面以下：气体必须穿过液体才能充分接触，' +
          '只在液面上方吹过是检验不出来的。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.gasIn = 1; s.burnT = Math.max(s.burnT, 20); },
        controls: [
          { type: 'btn', label: '重新演示通入过程', onClick: function (s) { s.turbid = 0; s.bubT = 0; } }
        ]
      },
      {
        name: '熄灭与白烟',
        title: '吹灭后的一缕白烟，还能点燃',
        ask: '白烟是烟还是石蜡蒸气？',
        body: '<p><b>操作：</b>吹灭蜡烛，立即用燃着的火柴靠近白烟（不要碰到烛芯）。</p>' +
          '<p><b>现象：</b>白烟被点燃，火焰顺着"烟"回到烛芯，蜡烛复燃。</p>' +
          '<p><b>结论：</b>白烟是<b>石蜡蒸气冷凝成的固体小颗粒</b>，不是"烟"（燃烧产物），' +
          '它说明蜡烛燃烧前先<b>汽化</b>。</p>' +
          '<p><b>动手试：</b>先看熄灭火后冒出的白烟，再点下面的按钮，用火柴去点白烟。</p>',
        apply: function (s) { reset(s); s.lit = 0; s.smoke = 1; },
        controls: [
          { type: 'btn', label: '① 用燃着的火柴去点白烟', onClick: function (s) { s.matchUse = 1; s.relitWant = 1; } },
          { type: 'btn', label: '② 重新吹灭，再来一次', onClick: function (s) { reset(s); s.smoke = 1; } }
        ]
      },
      {
        name: '得出结论',
        title: '蜡烛燃烧是化学变化吗？',
        ask: '熔化是物理变化还是化学变化？',
        body: '<p><b>证据链：</b>点燃 → 生成<b>水</b>（冷烧杯水雾）→ 生成<b>二氧化碳</b>（石灰水浑浊）。' +
          '有新物质生成 → <b>化学变化</b>。</p>' +
          '<p><b>同时发生的物理变化：</b>石蜡受热<b>熔化</b>、汽化。' +
          '所以蜡烛燃烧的过程里<b>既有物理变化又有化学变化</b>。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.hood = 1; s.burnT = Math.max(s.burnT, 14); },
        controls: [
          { type: 'btn', label: '① 看"水"的证据：罩干冷烧杯', onClick: function (s) { s.hood = 1; s.gasIn = 0; } },
          { type: 'btn', label: '② 看"CO₂"的证据：通入石灰水', onClick: function (s) { s.hood = 0; s.gasIn = 1; } },
          { type: 'btn', label: '③ 判定并给出结论', onClick: function (s) { s.judged = true; } }
        ]
        /* 这一步不放 quiz：答题态会整块替换正文并隐藏右侧读数区，
           学生点完"判定"就看不到"结论"那一栏的变化了 */
      },
      {
        name: '迁移思考',
        title: '为什么用外焰加热？',
        ask: '同样一根火柴，为什么放在外焰和焰心效果差这么多？',
        body: '<p><b>本质原因：</b>外焰与氧气接触最充分，燃烧完全，放热多。</p>' +
          '<p><b>延伸到酒精灯：</b>加热试管时要先把试管在火焰上来回移动预热，再用<b>外焰</b>加热' +
          '（外焰温度最高）；焰心温度低，加热效率差。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.burnT = Math.max(s.burnT, 16); },
        quiz: true
      }
    ],

    quiz: function (s) {
      var bank = [
        {
          q: '蜡烛燃烧时，温度最高的是哪一层？',
          opts: ['外焰', '内焰', '焰心', '三层一样'],
          ans: '外焰',
          why: '外焰与氧气接触最充分，燃烧最完全，温度最高（约 1000 ℃）。'
        },
        {
          q: '干冷烧杯罩在火焰上方，内壁出现水雾，说明生成了？',
          opts: ['水', '二氧化碳', '石蜡', '氧气'],
          ans: '水',
          why: '水雾是水蒸气遇冷凝结成的小水滴，说明燃烧生成了水。'
        },
        {
          q: '澄清石灰水变浑浊，说明生成了？',
          opts: ['二氧化碳', '水', '一氧化碳', '碳酸钙'],
          ans: '二氧化碳',
          why: 'CO₂ 与 Ca(OH)₂ 反应生成难溶的 CaCO₃，使石灰水变浑浊；碳酸钙是产物不是气体。'
        },
        {
          q: '吹灭蜡烛后的一缕"白烟"其实是？',
          opts: ['石蜡蒸气冷凝的固体小颗粒', '二氧化碳', '水蒸气', '燃烧后的灰'],
          ans: '石蜡蒸气冷凝的固体小颗粒',
          why: '白烟能被点燃并引燃烛芯，说明它是石蜡蒸气冷凝成的小颗粒。'
        },
        {
          q: '蜡烛燃烧过程中，熔化属于？',
          opts: ['物理变化', '化学变化', '既是物理也是化学', '都不是'],
          ans: '物理变化',
          why: '熔化只是状态改变，没有新物质生成；蜡烛燃烧整体是化学变化。'
        }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
