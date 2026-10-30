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
    probeIn: 0,      /* 探针从备料区移到火焰的进度 */
    stickIn: 0,      /* 火柴梗移动进度 */
    hoodIn: 0,       /* 烧杯移动进度 */
    relit: 0,        /* 白烟是否被点燃 */
    judged: false,
    t: 0
  };

  var O = {};
  /* 备料区：所有器材一开始就摆在桌上，用到时再移过去 */
  var HOME = {
    probe: [2.2, .34, 5.2],
    stick: [-3.0, .30, 5.4],
    hood:  [11.6, .05, 4.6]
  };

  /* ── 模型：火焰温度按高度分层（真实蜡烛：外焰≈1000℃ > 内焰≈820℃ > 焰心≈480℃） ── */
  var FLAME_H = 4.6;
  function flameTemp(u) {                       /* u: 0 底部 → 1 顶端 */
    if (u > .72) return 1000;                   /* 外焰：与氧气接触最充分 */
    if (u > .30) return 820;                    /* 内焰：燃烧不充分 */
    return 480;                                 /* 焰心：石蜡蒸气，几乎不燃烧 */
  }
  function zoneName(u) {
    if (u > .72) return '外焰';
    if (u > .30) return '内焰';
    return '焰心';
  }

  function reset(s) {
    s.lit = 0; s.stick = 0; s.hood = 0; s.fog = 0;
    s.turbid = 0; s.smoke = 0; s.relit = 0; s.gasIn = 0; s.probe = .55;
    s.probeIn = 0; s.stickIn = 0; s.hoodIn = 0;
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

      K.bench(44, 28);

      /* ═══ 蜡烛：表面皿 + 蜡柱 + 蜡油 + 烛芯 ═══ */
      var CX = -7.5, CZ = 0, WAX_R = 1.55, WAX_H = 7.0;
      O.cx = CX; O.cz = CZ; O.waxR = WAX_R; O.waxH = WAX_H;

      var dish = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, .35, 36), MAT.dish);
      dish.position.set(CX, .18, CZ);
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
      /* 烛芯 */
      O.wick = new T.Mesh(new T.CylinderGeometry(.07, .09, .95, 8), MAT.wick);
      O.wick.position.set(CX, .35 + WAX_H + .45, CZ);
      K.scene().add(O.wick);

      /* ═══ 火焰：一张程序化纹理搞定三层（焰心蓝 / 内焰白黄 / 外焰橙） ═══ */
      O.flameMain = K.flame({
        x: CX, y: .35 + WAX_H + .45, z: CZ, s: 3.0, tex: 'candle', light: 1.6, blend: 'normal'
      });
      O.flameMain.lit = false;
      O.flameMain.lv = 0;

      /* ═══ 温度探针（细杆 + 感温珠） ═══ */
      O.probeGrp = new T.Group();
      var rod = new T.Mesh(new T.CylinderGeometry(.07, .07, 5.2, 10), MAT.steel);
      rod.rotation.z = Math.PI / 2;
      rod.position.x = 2.8;
      O.probeGrp.add(rod);
      /* 手柄（露在火焰外的把手，让"人手拿着"这件事读得出来） */
      var grip = new T.Mesh(new T.CylinderGeometry(.18, .18, 1.2, 12),
        new T.MeshStandardMaterial({ color: 0x3d4650, roughness: .7 }));
      grip.rotation.z = Math.PI / 2;
      grip.position.x = 4.6;
      O.probeGrp.add(grip);
      O.bead = new T.Mesh(new T.SphereGeometry(.28, 14, 12),
        new T.MeshStandardMaterial({ color: 0xd44a3a, roughness: .35, metalness: .3, emissive: 0x551008 }));
      O.probeGrp.add(O.bead);
      O.probeGrp.position.set(HOME.probe[0], HOME.probe[1], HOME.probe[2]);
      O.probeGrp.visible = true;
      K.scene().add(O.probeGrp);

      /* ═══ 火柴梗（横穿火焰） ═══ */
      O.stickGrp = new T.Group();
      /* 火柴梗：方形木条（真实火柴梗是方截面），中段木色、两端燃烧后炭化 */
      O.stickMid = new T.Mesh(new T.BoxGeometry(4.2, .16, .16), MAT.wood);
      O.stickGrp.add(O.stickMid);
      /* 木纹：两道极细的浅色刻线 */
      [-.04, .04].forEach(function (dy) {
        var grain = new T.Mesh(new T.BoxGeometry(4.0, .012, .012),
          new T.MeshStandardMaterial({ color: 0xc2a97c, roughness: .95 }));
        grain.position.y = dy;
        O.stickGrp.add(grain);
      });
      /* 炭化端：三段由浅到深的棕黑，模拟"烧焦过渡"（不是一刀切的黑块） */
      O.charSegs = [];
      var charCols = [0x6b4a2c, 0x3b2a1c, 0x1b1512];
      [-1, 1].forEach(function (sgn) {
        for (var ci = 0; ci < 3; ci++) {
          var seg = new T.Mesh(new T.BoxGeometry(.5, .17, .17),
            new T.MeshStandardMaterial({ color: charCols[ci], roughness: .98 }));
          seg.position.x = sgn * (1.85 - ci * .42);
          seg.visible = false;
          O.stickGrp.add(seg);
          O.charSegs.push({ m: seg, k: ci });
        }
      });
      O.charL = null; O.charR = null;
      O.stickGrp.position.set(HOME.stick[0], HOME.stick[1], HOME.stick[2]);
      O.stickGrp.visible = true;
      K.scene().add(O.stickGrp);

      /* ═══ 罩上的干冷烧杯（倒扣，内壁可结水雾） ═══ */
      O.hoodGrp = new T.Group();
      var hood = K.glassCyl({ r: 3.3, h: 8.6, x: 0, z: 0, y0: .2, noHalo: true, noSide: true });
      O.hoodGrp.add(hood);
      /* 内壁水雾层：贴在玻璃内表面的一层白雾 */
      O.fogMesh = new T.Mesh(new T.CylinderGeometry(3.18, 3.18, 8.2, 36, 1, true),
        new T.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          side: T.BackSide, depthWrite: false
        }));
      O.fogMesh.position.y = 4.4;
      O.hoodGrp.add(O.fogMesh);
      /* 杯口的水珠：一圈小半球 */
      O.drops = [];
      var dgeo = new T.SphereGeometry(.19, 10, 8);
      var dmat = new T.MeshPhysicalMaterial({ color: 0xf6fbff, roughness: .05, metalness: 0, transparent: true, opacity: .75 });
      for (var di = 0; di < 12; di++) {
        var da = di / 18 * Math.PI * 2;
        var dr = new T.Mesh(dgeo, dmat);
        dr.position.set(Math.cos(da) * 3.15, 1.3 + (di % 3) * .5, Math.sin(da) * 3.15);
        dr.visible = false;
        O.hoodGrp.add(dr);
        O.drops.push(dr);
      }
      O.hoodGrp.position.set(HOME.hood[0], HOME.hood[1], HOME.hood[2]);
      O.hoodGrp.visible = true;
      K.scene().add(O.hoodGrp);

      /* ═══ 石灰水试管（检验 CO₂） ═══ */
      var TX = 4.5;
      O.tube = K.glassCyl({ r: 1.5, h: 9.6, x: TX, z: 0, y0: .2, noHalo: true, noSide: true });
      O.lime = K.liquidCyl({ r: 1.34, h: 5.6, x: TX, z: 0, y0: .4, color: 0xe8f6fb, opacity: .45 });
      O.limeTop = K.liquidTop({ r: 1.34, x: TX, z: 0, y: 6.0, color: 0xf2fbff });
      K.spriteLabel([TX, 11.2, 0], '澄清石灰水', { w: 5.0, fs: 38 });

      /* 浑浊颗粒 */
      O.milk = [];
      var mgeo = new T.SphereGeometry(.17, 8, 6);
      var mmat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      for (var mi = 0; mi < 40; mi++) {
        var mm = new T.Mesh(mgeo, mmat.clone());
        var ma = Math.random() * Math.PI * 2, mr = Math.random() * 1.2;
        mm.position.set(TX + Math.cos(ma) * mr, .6 + Math.random() * 5.2, Math.sin(ma) * mr);
        mm.visible = false;
        K.scene().add(mm);
        O.milk.push(mm);
      }

      /* ═══ 白烟（熄灭后上升的石蜡蒸气） ═══ */
      O.smoke = [];
      var sgeo = new T.SphereGeometry(.35, 8, 6);
      for (var si = 0; si < 16; si++) {
        var sm = new T.Mesh(sgeo, new T.MeshBasicMaterial({
          color: 0xcfd8e2, transparent: true, opacity: 0, depthWrite: false
        }));
        sm.userData.ph = Math.random();
        sm.position.set(CX, .35 + WAX_H + .3, CZ);
        K.scene().add(sm);
        O.smoke.push(sm);
      }

      /* 接触阴影 */
      K.blob({ x: CX, z: CZ, r: 3.8 });
      K.blob({ x: TX, z: 0, r: 2.2 });

      /* 标注与交互 */
      K.spriteLabel([CX, 2.4, 2.6], '蜡烛', { w: 3.2, fs: 38 });
      K.tag(O.wax, '蜡烛', '石蜡 + 棉芯');
      K.tag(O.hoodGrp, '干冷烧杯', '罩住火焰检验水');
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      var i, f;

      /* 燃烧累计（点燃才计时） */
      if (s.lit > .5) s.burnT = Math.min(60, s.burnT + dt);

      /* 火焰：只设 lit，闪烁与淡入淡出交给引擎统一的 updateFlames 驱动 */
      O.flameMain.lit = s.lit > .5 || s.relit > .5;

      /* 蜡柱随燃烧变短 + 蜡油池变宽 */
      var burn = Math.min(1, s.burnT / 55);
      var h = O.waxH * (1 - burn * .16);
      O.wax.scale.y = h / O.waxH;
      O.wax.position.y = .35 + h / 2;
      O.waxLip.position.y = .35 + h;
      O.wick.position.y = .35 + h + .45;
      var fy = .35 + h + .35;
      O.flameMain.sp.position.set(O.cx, fy + O.flameMain.base * .95, O.cz);
      if (O.flameMain.light) O.flameMain.light.position.copy(O.flameMain.sp.position);

      /* ═══ 器材动线：先在备料区，用到时滑到使用位（不再"突然出现"） ═══ */
      function ease(cur, target, sp) { return cur + (target - cur) * Math.min(1, dt * sp); }

      /* 探针：只有在"看火焰温度"这步才进火焰；探针高度仍由滑块决定 */
      var tProbe = (s.lit > .5 && s.stick < .5 && s.hood < .5) ? 1 : 0;
      s.probeIn = ease(s.probeIn || 0, tProbe, 3.4);
      var u = Math.max(0, Math.min(1, s.probe));
      var pUseX = O.cx + .1, pUseY = .35 + h + .25 + u * FLAME_H;
      O.probeGrp.position.set(
        HOME.probe[0] + (pUseX - HOME.probe[0]) * s.probeIn,
        HOME.probe[1] + (pUseY - HOME.probe[1]) * s.probeIn,
        HOME.probe[2] + (O.cz - HOME.probe[2]) * s.probeIn
      );
      O.probeGrp.visible = s.probeIn > .02;
      var tempT = flameTemp(u);
      var heat = Math.max(0, tempT - 400) / 600;
      O.bead.material.emissiveIntensity = .2 + heat * 1.6;
      O.bead.material.color.setRGB(.72 + heat * .25, .22 + heat * .1, .16);

      /* 火柴梗：从桌面移到火焰中线，两端随燃烧炭化 */
      var tStick = s.stick > .5 ? 1 : 0;
      s.stickIn = ease(s.stickIn || 0, tStick, 3.2);
      var sUseY = .35 + h + .55 + .62 * FLAME_H;
      O.stickGrp.position.set(
        HOME.stick[0] + (O.cx - HOME.stick[0]) * s.stickIn,
        HOME.stick[1] + (sUseY - HOME.stick[1]) * s.stickIn,
        HOME.stick[2] + (O.cz + .9 - HOME.stick[2]) * s.stickIn
      );
      O.stickGrp.visible = s.stickIn > .02;
      var charK = Math.min(1, s.burnT / 8);
      for (i = 0; i < O.charSegs.length; i++) {
        var cg = O.charSegs[i];
        /* 三段依次出现：越靠外烧得越透 */
        var need = (cg.k + 1) / 3 * .95;
        cg.m.visible = charK > need * .45;
        cg.m.scale.setScalar(.4 + Math.min(1, charK / need) * .6);
      }

      /* 干冷烧杯：从备料区移到蜡烛上方，杯口压到烛顶下方才真"扣住" */
      var tHood = s.hood > .5 ? 1 : 0;
      s.hoodIn = ease(s.hoodIn || 0, tHood, 2.6);
      var hUseY = .35 + h - .15;                    /* 杯口略低于烛顶 → 火焰在杯内 */
      O.hoodGrp.position.set(
        HOME.hood[0] + (O.cx - HOME.hood[0]) * s.hoodIn,
        HOME.hood[1] + (hUseY - HOME.hood[1]) * s.hoodIn,
        HOME.hood[2] + (O.cz - HOME.hood[2]) * s.hoodIn
      );
      O.hoodGrp.visible = s.hoodIn > .02;
      if (s.hoodIn > .85 && s.hood > .5) {
        var fogK = Math.min(1, s.burnT / 12);
        s.fog = fogK;
        O.fogMesh.material.opacity = fogK * .85;
        for (i = 0; i < O.drops.length; i++) {
          O.drops[i].visible = fogK > .35;
          O.drops[i].material.opacity = .35 + fogK * .45;
        }
      } else {
        O.fogMesh.material.opacity = 0;
      }

      /* 石灰水：通入 CO₂ 后变浑浊 */
      if (s.gasIn > .5) {
        s.turbid = Math.min(1, s.turbid + dt * .55);
        var tk = s.turbid;
        /* 浑浊：由淡蓝透明 → 乳白不透明 */
        var milkCol = new T.Color(0xe8f6fb).lerp(new T.Color(0xffffff), tk);
        K.setLiquidColor(O.lime, milkCol, .95);
        O.lime.material.uniforms.uOpacity.value = .45 + tk * .5;
        K.setLiquidColor(O.limeTop, milkCol, .95);
        for (i = 0; i < O.milk.length; i++) {
          var show = tk > .08 && i < Math.round(tk * 40);
          O.milk[i].visible = show;
          if (show) {
            O.milk[i].material.opacity = .35 + tk * .6;
            O.milk[i].position.y = .6 + ((i * 0.37 + s.t * .12) % 1) * 5.0;
          }
        }
      }

      /* 白烟：熄灭后上升、散开，可被点燃 */
      var smokeK = s.smoke > .5 ? 1 : 0;
      for (i = 0; i < O.smoke.length; i++) {
        var sm = O.smoke[i];
        if (smokeK) {
          var ph = (sm.userData.ph + s.t * .32) % 1;
          sm.visible = true;
          sm.position.set(O.cx + Math.sin(ph * 6.2 + i) * .25, .35 + h + .5 + ph * 5.5, O.cz + Math.cos(ph * 5.1 + i) * .25);
          sm.scale.setScalar(.55 + ph * 1.3);
          sm.material.opacity = (1 - ph) * .78 * smokeK;
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
    cam: { ty: 8.2, dist: 40, tx: -1.4, yaw: .42, pitch: .17 },

    reads: [
      ['lit', '状态'],
      ['temp', '探针位置温度'],
      ['zone', '所处火焰层'],
      ['water', '生成的水'],
      ['co2', '生成的 CO₂'],
      ['concl', '结论']
    ],

    values: function (s) {
      var u = Math.max(0, Math.min(1, s.probe));
      var on = s.lit > .5;
      return {
        lit: s.relit > .5 ? '白烟被点燃' : (on ? '燃烧中' : (s.burnT > 1 ? '已熄灭' : '未点燃')),
        temp: on ? flameTemp(u).toFixed(0) + ' ℃' : '—',
        zone: on ? zoneName(u) : '—',
        water: s.fog > .02 ? '已检出（内壁水雾）' : '未检出',
        co2: s.turbid > .1 ? '已检出（石灰水浑浊）' : '未检出',
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
          '<p>拖动滑块改变探针高度，看读数怎么变。</p>',
        apply: function (s) { reset(s); s.lit = 1; },
        controls: [
          { type: 'range', key: 'probe', min: 0, max: 1, step: .05, label: '探针高度（0 焰心底部 → 1 外焰顶端）' }
        ]
      },
      {
        name: '外焰最热',
        title: '用火柴梗验证：两端先变黑',
        ask: '为什么火柴梗是两端变黑，中间反而没事？',
        body: '<p><b>操作：</b>把火柴梗横穿火焰中部，约 1 秒后取出。</p>' +
          '<p><b>现象：</b>火柴梗<b>接触外焰的两端先炭化变黑</b>，中间（焰心处）几乎不变。</p>' +
          '<p><b>结论：</b>外焰温度最高。所以加热时要用<b>外焰</b>，这也解释了为什么酒精灯要用外焰加热。</p>',
        apply: function (s) { reset(s); s.lit = 1; s.stick = 1; s.burnT = Math.max(s.burnT, 6); }
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
        body: '<p><b>操作：</b>把烧杯内壁用澄清石灰水润湿，或把气体通入石灰水。</p>' +
          '<p><b>现象：</b>澄清石灰水<b>变浑浊</b>（生成难溶的碳酸钙）。</p>' +
          '<p><b>结论：</b>蜡烛燃烧生成了<b>二氧化碳</b>。' +
          '反应式：CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O</p>',
        apply: function (s) { reset(s); s.lit = 1; s.gasIn = 1; s.burnT = Math.max(s.burnT, 20); }
      },
      {
        name: '熄灭与白烟',
        title: '吹灭后的一缕白烟，还能点燃',
        ask: '白烟是烟还是石蜡蒸气？',
        body: '<p><b>操作：</b>吹灭蜡烛，立即用燃着的火柴靠近白烟（不要碰到烛芯）。</p>' +
          '<p><b>现象：</b>白烟被点燃，火焰顺着"烟"回到烛芯，蜡烛复燃。</p>' +
          '<p><b>结论：</b>白烟是<b>石蜡蒸气冷凝成的固体小颗粒</b>，不是"烟"（燃烧产物），' +
          '它说明蜡烛燃烧前先<b>汽化</b>。</p>',
        apply: function (s) { reset(s); s.lit = 0; s.smoke = 1; }
      },
      {
        name: '得出结论',
        title: '蜡烛燃烧是化学变化吗？',
        ask: '熔化是物理变化还是化学变化？',
        body: '<p><b>证据链：</b>点燃 → 生成<b>水</b>（冷烧杯水雾）→ 生成<b>二氧化碳</b>（石灰水浑浊）。' +
          '有新物质生成 → <b>化学变化</b>。</p>' +
          '<p><b>同时发生的物理变化：</b>石蜡受热<b>熔化</b>、汽化。' +
          '所以蜡烛燃烧的过程里<b>既有物理变化又有化学变化</b>。</p>',
        controls: [
          { type: 'btn', label: '判定并给出结论', onClick: function (s) { s.judged = true; } }
        ],
        quiz: true
      },
      {
        name: '迁移思考',
        title: '为什么用外焰加热？',
        ask: '同样一根火柴，为什么放在外焰和焰心效果差这么多？',
        body: '<p><b>本质原因：</b>外焰与氧气接触最充分，燃烧完全，放热多。</p>' +
          '<p><b>延伸到酒精灯：</b>加热试管时要先把试管在火焰上来回移动预热，再用<b>外焰</b>加热' +
          '（外焰温度最高）；焰心温度低，加热效率差。</p>',
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
