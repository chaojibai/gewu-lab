/* 格物实验室 · 电解水：水由什么组成（three.js 版） */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = {
    on: false,
    h: 0,
    o: 0,
    test: '',
    bubbles: [],
    t: 0
  };

  var O = {};   // 对象引用

  var LX = -3.95, RX = 3.95, TR = 1.72;  /* 两支电解管（立在底座上） */
  var YB = 1.72, YT = 15.0;              /* 管底 / 封顶高度 */
  var GASMAX = 10.6;                     /* 气柱最大高度 */
  var RODY = 5.4;                        /* 电极顶端 */
  var BOX = [11.4, 1.45, 0];            /* 直流电源盒中心（坐在桌面上） */
  var BOXS = [6.2, 2.9, 3.4];

  /* 显示用渐变值：气体体积 lerp，液面平滑移动（内部动画量） */
  var dh = 0, dod = 0;

  function gasTop(g) { return YT - g * GASMAX; }

  function spawn(side) {
    if (st.bubbles.length > 90) return;
    var x = side === 'l' ? LX : RX;
    st.bubbles.push({
      side: side,
      x0: x + K.rnd(-.75, .75),
      z: K.rnd(-.85, .85),
      y: K.rnd(YB + .3, RODY),
      r: K.rnd(.10, .22),
      v: K.rnd(2.2, 4.0),
      ph: Math.random() * 6.28
    });
  }

  /* 一支管内的液柱 / 气柱 / 液面（高度由 update 驱动） */
  function setCol(liq, top, gas, yb, yl) {
    var lh = Math.max(.02, yl - yb);
    liq.scale.y = lh;
    liq.position.y = yb + lh / 2;
    top.position.y = yl + .03;
    var gh = Math.max(.02, YT - yl);
    gas.scale.y = gh;
    gas.position.y = yl + gh / 2;
  }

  var scene = {
    setup: function () {
      K.bench(56, 34);


      /* 电解器底座 + 顶板 + 接线柱 */
      K.box({ x: 0, y: .74, z: 0, sx: 13.9, sy: 1.48, sz: 6.2, color: 0x202836 });
      K.box({ x: 0, y: 1.52, z: 0, sx: 14.3, sy: .13, sz: 6.5, color: 0x2e3848 });
      K.box({ x: -2.9, y: .88, z: 2.92, sx: 1.05, sy: .9, sz: .16, color: 0x967a54 });
      K.box({ x: 2.9, y: .88, z: 2.92, sx: 1.05, sy: .9, sz: .16, color: 0x967a54 });

      /* T 型三通（玻璃）+ 前伸活塞 */
      K.tube([[LX, 1.95, 0], [-1.7, 1.95, 0], [0, 1.95, 0], [1.7, 1.95, 0], [RX, 1.95, 0]], .5);
      K.tube([[0, 1.95, 0], [0, 1.62, 2.7], [0, 1.05, 3.45]], .45);
      K.box({ x: 0, y: .95, z: 3.7, sx: 1.25, sy: .85, sz: .9, mat: K.M().metal });
      K.box({ x: 0, y: 1.12, z: 4.35, sx: 1.5, sy: .17, sz: .17, mat: K.M().metal });

      /* 管内液体 / 气体区 / 液面（先建，玻璃管罩在外面） */
      O.liqL = K.liquidCyl({ r: TR * .955, h: 1, x: LX, z: 0, y0: YB, color: 0x86c2e2, opacity: .42 });
      O.gasL = K.liquidCyl({ r: TR * .94, h: 1, x: LX, z: 0, y0: YB, color: 0xcde4ff, opacity: .05 });
      O.topL = K.liquidTop({ r: TR * .955, x: LX, z: 0, y: YB, color: 0x8ac4ee });
      O.liqR = K.liquidCyl({ r: TR * .955, h: 1, x: RX, z: 0, y0: YB, color: 0x86c2e2, opacity: .42 });
      O.gasR = K.liquidCyl({ r: TR * .94, h: 1, x: RX, z: 0, y0: YB, color: 0xcde4ff, opacity: .05 });
      O.topR = K.liquidTop({ r: TR * .955, x: RX, z: 0, y: YB, color: 0x8ac4ee });
      O.liqL.renderOrder = 2; O.liqR.renderOrder = 2;
      O.gasL.renderOrder = 1; O.gasR.renderOrder = 1;

      /* 带刻度竖直玻璃管 */
      K.glassCyl({ r: TR, h: YT - YB, x: LX, z: 0, y0: YB });
      K.glassCyl({ r: TR, h: YT - YB, x: RX, z: 0, y0: YB });

      /* 底部橡胶卡箍 */
      K.cyl({ r: 1.9, h: .5, y0: 1.24, x: LX, z: 0, mat: K.M().rubber });
      K.cyl({ r: 1.9, h: .5, y0: 1.24, x: RX, z: 0, mat: K.M().rubber });

      /* 金属电极：从底座顶面长出，插进管内 */
      K.rod([LX, YB - .04, 0], [LX, RODY, 0], .19, { mat: K.M().metal });
      K.sphere({ x: LX, y: RODY, z: 0, r: .24, color: 0x8a94a4 });
      K.rod([RX, YB - .04, 0], [RX, RODY, 0], .19, { mat: K.M().metal });
      K.sphere({ x: RX, y: RODY, z: 0, r: .24, color: 0x8a94a4 });

      /* 管壁刻度（贴在前侧） */
      var tickM = new T.MeshBasicMaterial({ color: 0xc6e0fa, transparent: true, opacity: .4 });
      var k = 0, yy, hw;
      for (yy = YB + 1.2; yy < YT - .6; yy += 1.15, k++) {
        hw = (k % 2 === 0) ? .62 : .4;
        K.box({ x: LX, y: yy, z: TR * .9, sx: hw * 2, sy: .07, sz: .02, mat: tickM });
        K.box({ x: RX, y: yy, z: TR * .9, sx: hw * 2, sy: .07, sz: .02, mat: tickM });
      }

      /* 直流电源：盒体 + 前面板 + 指示灯 + 接线柱 */
      K.box({ x: BOX[0], y: BOX[1], z: BOX[2], sx: BOXS[0], sy: BOXS[1], sz: BOXS[2], color: 0x1e2532 });
      K.box({ x: BOX[0], y: BOX[1] - .05, z: BOX[2] + 1.72, sx: 4.9, sy: 1.8, sz: .08, color: 0x151b26 });
      O.lamp = K.sphere({ x: BOX[0] - .92, y: BOX[1] + .42, z: BOX[2] + 1.78, r: .22,
        mat: new T.MeshStandardMaterial({ color: 0x78879b, roughness: .4, emissive: 0x33ff88, emissiveIntensity: 0 }) });
      K.box({ x: BOX[0] + .38, y: BOX[1] + .42, z: BOX[2] + 1.78, sx: 1.1, sy: .4, sz: .04,
        mat: new T.MeshStandardMaterial({ color: 0x2c3a52, roughness: .6 }) });
      var brass = new T.MeshStandardMaterial({ color: 0xb08a50, roughness: .35, metalness: .8 });
      K.cyl({ r: .35, h: .5, y0: 1.55, x: BOX[0] - 1.6, z: BOX[2] + 1.6, mat: brass });
      K.cyl({ r: .35, h: .5, y0: 1.55, x: BOX[0] + 1.6, z: BOX[2] + 1.6, mat: brass });

      /* 橡胶导线：底座接线柱 → 桌面 → 电源接线柱 */
      K.tube([[-2.9, .88, 3.0], [-2.9, .26, 4.2], [2.6, .26, 4.6], [7.7, .26, 4.6],
              [7.7, 1.80, 2.1], [9.8, 1.80, 1.86]], .15, { rubber: true, color: 0x282c38 });
      K.tube([[2.9, .88, 3.0], [2.9, .26, 3.9], [5.6, .26, 4.1], [15.0, .26, 4.1],
              [15.0, 1.80, 2.1], [13.0, 1.80, 1.86]], .15, { rubber: true, color: 0x7c3430 });

      /* 气体检验：木条 + 负极管口淡蓝火焰 + 正极复燃火星 */
      O.stickH = K.rod([LX + 2.2, YT + 4.4, 3.0], [LX + .55, YT + .35, .6], .13, { mat: K.M().wood });
      O.flame = K.flame({ x: LX, y: YT + .05, z: 0, s: 2.0, color: 0xffffff, light: .55 });
      /* 淡蓝火焰专用贴图（法线混合，浅背景上可读） */
      O.blueTex = (function () {
        var c = document.createElement('canvas'); c.width = c.height = 128;
        var x2 = c.getContext('2d');
        var g2 = x2.createRadialGradient(64, 84, 4, 64, 84, 62);
        g2.addColorStop(0, 'rgba(236,248,255,1)');
        g2.addColorStop(.28, 'rgba(150,202,255,.95)');
        g2.addColorStop(.58, 'rgba(86,148,255,.55)');
        g2.addColorStop(1, 'rgba(66,116,255,0)');
        x2.fillStyle = g2;
        x2.beginPath();
        x2.ellipse(64, 74, 30, 54, 0, 0, Math.PI * 2);
        x2.fill();
        return new T.CanvasTexture(c);
      })();
      O.flame.sp.material.map = O.blueTex;
      O.flame.sp.material.blending = T.NormalBlending;
      O.flame.sp.material.needsUpdate = true;
      O.flame.light.color.setHex(0x88baff);
      O.flame.lit = false;
      O.stickO = K.rod([RX + 2.0, YT + 4.4, 3.0], [RX + .15, YT - .5, .5], .13, { mat: K.M().wood });
      O.tip = K.sphere({ x: RX + .15, y: YT - .7, z: .4, r: .34,
        mat: new T.MeshStandardMaterial({ color: 0xffc469, emissive: 0xff7a1e, emissiveIntensity: 0 }) });
      O.flameO = K.flame({ x: RX + .15, y: YT - .45, z: .4, s: 1.1, color: 0xffd9a0, light: .5 });
      O.flameO.lit = false;
      O.stickH.visible = false;
      O.stickO.visible = false;
      /* 木条端头的火星球必须跟着木条一起显隐：之前只把木条藏了，
         这颗 0xffc469 的淡黄球一直悬在正极管上部气体区，读成一个莫名的小球。 */
      O.tip.visible = false;

      /* 接触阴影 */
      K.blob({ x: 0, z: 0, r: 9.6 });
      K.blob({ x: BOX[0], z: BOX[2], r: 4.4 });

      /* 标注 */
      O.labNeg = K.label([LX, YT, 0], '负极 · 氢气 0%', -58, -34);
      O.labPos = K.label([RX, YT, 0], '正极 · 氧气 0%', 58, -34);
      K.label([LX, RODY - .3, 0], '金属电极', -70, 14);
      K.label([BOX[0], BOX[1] + BOXS[1] / 2, BOX[2]], '直流电源', 6, -30);
      K.label([0, 1.0, 3.6], 'T 型三通 · 活塞', 8, 42);

      /* 气泡小球池 */
      O.bubGeo = new T.SphereGeometry(1, 8, 6);
      O.bubMat = new T.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: .92 });
      O.bubPool = [];
    },

    update: function (dt, s) {
      var i, b;
      s.t += dt;
      dh += (s.h - dh) * Math.min(1, dt * 3);
      dod += (s.o - dod) * Math.min(1, dt * 3);
      if (s.on) {
        s.h = Math.min(.80, s.h + dt * .048);
        s.o = Math.min(.40, s.o + dt * .024);
        if (Math.random() < dt * 26) spawn('l');   /* 负极冒泡速率约为正极两倍 */
        if (Math.random() < dt * 13) spawn('r');
      }
      var tl = gasTop(dh), tr = gasTop(dod);
      for (i = s.bubbles.length - 1; i >= 0; i--) {
        b = s.bubbles[i];
        b.y += b.v * dt;
        if (b.y > (b.side === 'l' ? tl : tr) - .15) s.bubbles.splice(i, 1);
      }

      /* 液柱 / 气柱 / 液面随气体量移动 */
      setCol(O.liqL, O.topL, O.gasL, YB, tl);
      setCol(O.liqR, O.topR, O.gasR, YB, tr);

      /* 电源指示灯 */
      O.lamp.material.emissiveIntensity = s.on ? 1.3 : 0;
      O.lamp.material.color.setHex(s.on ? 0x0e2c1c : 0x78879b);

      /* 气体检验明灭 */
      O.stickH.visible = s.test === 'h2';
      O.flame.lit = s.test === 'h2';
      O.stickO.visible = s.test === 'o2';
      O.tip.visible = s.test === 'o2';
      O.flameO.lit = s.test === 'o2';
      O.tip.material.emissiveIntensity = s.test === 'o2' ? 2.2 : 0;

      /* 气泡渲染（小球池同步） */
      for (i = 0; i < s.bubbles.length; i++) {
        b = s.bubbles[i];
        if (!O.bubPool[i]) {
          var m = new T.Mesh(O.bubGeo, O.bubMat);
          K.scene().add(m);
          O.bubPool.push(m);
        }
        var mm = O.bubPool[i];
        mm.visible = true;
        mm.position.set(b.x0 + Math.sin(s.t * 3.1 + b.ph) * .35, b.y, b.z);
        mm.scale.setScalar(b.r * 1.6);
      }
      for (; i < O.bubPool.length; i++) O.bubPool[i].visible = false;

      /* 标注实时百分比 */
      O.labNeg.el.textContent = '负极 · 氢气 ' + Math.round(dh * 100) + '%';
      O.labPos.el.textContent = '正极 · 氧气 ' + Math.round(dod * 100) + '%';
    }
  };

  K.boot({
    title: '水的组成及变化的探究',
    chip: '化学 · 鲁教版 · 八年级全一册 · 学生实验2',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 6.2, tx: 4.5, dist: 50, yaw: .30, pitch: .16 },

    reads: [['v1', '负极气体体积'], ['v2', '正极气体体积'], ['ratio', '氢氧体积比'], ['note', '实验状态']],
    values: function (s) {
      var r = s.o > .01 ? (s.h / s.o).toFixed(1) + ' : 1' : '—';
      return {
        v1: (s.h * 20).toFixed(1) + ' mL',
        v2: (s.o * 20).toFixed(1) + ' mL',
        ratio: r,
        note: s.on ? '两极都冒气泡' : '尚未通电'
      };
    },

    steps: [
      {
        name: '认识装置', title: '两根管子，一个电源',
        ask: '两端的试管为什么要倒扣在水里？',
        body: '<p>这是<b>水电解器</b>：水槽里盛水，两支试管<b>倒扣</b>着灌满水，管底各插一根电极，分别接到直流电源的负极和正极上。</p>' +
          '<p>倒扣是为了<b>收集气体</b>，原理和排水法收集氧气一样：气体不溶于水，升到试管顶部把水压下去。类比一下——把空杯子倒扣进水盆，往杯口里吹气泡，泡会顶到杯底。这样既接得住气体，又能直接读出体积。</p>' +
          '<p>水里加了少量<b>硫酸钠</b>，目的是增强导电性。纯水几乎不导电，通电半天也看不到几个气泡；硫酸钠只负责「搭桥」，<b>不会</b>改变反应的产物和比例。</p>' +
          '<p>易错点：这个实验必须用<b>直流电</b>。若用交流电，正负极每秒来回翻转，两极气体混在一起，就得不到稳定的 2:1。中考常考两问——「加硫酸钠的目的」「为什么不能用交流电」。</p>',
        apply: function (s) { s.on = false; s.h = 0; s.o = 0; s.test = ''; s.bubbles = []; }
      },
      {
        name: '通上电', title: '两极同时冒气泡',
        ask: '接通电源，会看到什么？',
        body: '<p>接通直流电源，两支电极上<b>同时</b>冒出气泡，两支试管里的液面一起下降——气体正在把水往外顶。</p>' +
          '<p>细看有差别：<b>负极冒泡明显更急</b>，正极慢一些。本课件里负极冒泡速率约为正极的两倍（课件设定，真实实验趋势相同）。点下面的按钮通电，盯住两支管子液面的高度差。</p>' +
          '<p>为什么冒泡？把水分子想成一辆小列车：两节氢「小车厢」配一节氧「大车厢」。通电就像拆车场开工——水分子被拆开，氢在负极聚成氢气，氧在正极聚成氧气，气泡就是这样一个个攒出来的。</p>' +
          '<p>易错点：气泡不是管子里「原本藏着的空气」，而是反应<b>新生成</b>的气体。是不是新生成的，往下两步的检验会给出证据。</p>',
        apply: function (s) { s.on = true; s.h = 0; s.o = 0; s.test = ''; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '接通电源', onClick: function (s) { s.on = true; } },
          { type: 'btn', label: '断开电源', onClick: function (s) { s.on = false; } }
        ]
      },
      {
        name: '2 : 1', title: '负极的气体正好是正极的两倍',
        ask: '为什么两支管子的体积总是 2:1？',
        body: '<p>等收集到一定量再量一次：负极气体体积 : 正极气体体积 ≈ <b>2 : 1</b>，而且通电越久总量越多，比例<b>始终</b>稳定在 2:1，不是偶然。</p>' +
          '<p>记住八字口诀：<b>正氧负氢、氢二氧一</b>——正极出氧气，负极出氢气；氢气的体积是氧气的两倍。所以那支气体多的、连着负极的是氢气，气体少的、连着正极的是氧气。</p>' +
          '<p>为什么是 2:1？一个水分子 <code>H₂O</code> 里有 2 个氢原子、1 个氧原子，拆开后 2 个氢原子拼成 1 个氢分子、2 个氧原子拼成 1 个氧分子，氢分子与氧分子的个数比就是 2:1。同温同压下，气体体积比正好等于分子个数比。</p>' +
          '<p>高频易错：「氢二氧一」说的是<b>体积比</b>，不是质量比。算质量的话，氢的相对原子质量是 1、氧是 16，2 个 H 对 1 个 O，氢与氧的质量比是 <b>1:8</b>。中考爱把 2:1 和 1:8 放在一起挖坑。</p>',
        apply: function (s) { s.on = false; s.h = .60; s.o = .30; s.test = ''; s.bubbles = []; }
      },
      {
        name: '检验氢气', title: '负极的气体烧得着',
        ask: '怎么证明负极收集的是氢气？',
        body: '<p>取下负极的试管，管口朝下靠近火焰：气体<b>能被点燃</b>，安静地燃烧，发出<b>淡蓝色</b>火焰——这就是氢气。</p>' +
          '<p>氢气烧起来，本质是氢气与空气里的氧气反应，重新变回水并放出热量。烧完又变回原料，不产生任何别的产物，所以氢气被称为最清洁的燃料。</p>' +
          '<p>安全细节：纯净的氢气点燃只有轻轻的「噗」声；如果混进了空气，会发出<b>尖锐的爆鸣声</b>，甚至炸裂试管。所以点燃任何可燃性气体之前，都必须先<b>验纯</b>。</p>' +
          '<p>易错点：氢气燃烧是<b>淡蓝色</b>火焰；一氧化碳、甲烷燃烧是<b>蓝色</b>火焰。三种可燃性气体的火焰颜色放在一起考，是最常见的辨析题。</p>',
        apply: function (s) { s.on = false; s.h = .60; s.o = .30; s.test = 'h2'; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '点燃负极端气体', onClick: function (s) { s.test = 'h2'; } },
          { type: 'btn', label: '收起火焰', onClick: function (s) { s.test = ''; } }
        ]
      },
      {
        name: '检验氧气', title: '正极的气体让木条复燃',
        ask: '怎么证明正极收集的是氧气？',
        body: '<p>把<b>带火星的木条</b>伸进正极的试管口，木条<b>复燃</b>——只带着一点火星的木条重新烧了起来，这是氧气独有的检验方法。</p>' +
          '<p>为什么能复燃？燃烧离不开氧气，氧气浓度越高烧得越旺。正极试管里几乎是纯氧，火星一进去就像被使劲吹了一口气的炭火。</p>' +
          '<p>易错点：氧气能<b>支持燃烧</b>（助燃性），但它自己<b>不能燃烧</b>（无可燃性）。说「氧气是可燃物」直接判错。</p>' +
          '<p>考点：氧气的检验，答题关键词是「带火星的木条<b>复燃</b>」——少了「复燃」两个字，现象分就丢了。</p>',
        apply: function (s) { s.on = false; s.h = .60; s.o = .30; s.test = 'o2'; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '伸入带火星木条', onClick: function (s) { s.test = 'o2'; } },
          { type: 'btn', label: '收起木条', onClick: function (s) { s.test = ''; } }
        ]
      },
      {
        name: '结论', title: '水不是一种「元素」',
        ask: '电解水这个实验，到底证明了什么？',
        body: '<p>把整条证据链串起来：水通电分解成了氢气和氧气；氢气由氢元素组成，氧气由氧元素组成；而化学反应前后<b>元素种类不变</b>。三步倒推，只有一个结论——<b>水是由氢元素和氧元素组成的</b>。</p>' +
          '<p>这个实验一举推翻了「水是一种元素」的旧说法——十八世纪以前，人们真的长期这么认为。</p>' +
          '<p>易错点一：不能说「水由氢气和氧气组成」。水是纯净物，里面一滴氢气也没有；氢气和氧气是水<b>反应后生成</b>的新物质，不是水的成分。</p>' +
          '<p>易错点二：也不能说「水由 2 个氢原子和 1 个氧原子组成」。宏观描述用元素，微观描述用原子——正确的说法是「水由氢、氧两种元素组成」「1 个水分子由 2 个氢原子和 1 个氧原子构成」。这两句话的搭配中考年年考。</p>',
        apply: function (s) { s.on = false; s.h = .60; s.o = .30; s.test = ''; s.bubbles = []; }
      },
      {
        name: '写方程式', title: '把现象写成式子',
        ask: '2:1 这个比例，怎么在方程式里体现？',
        body: '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:8px 0">' +
          '2H₂O <span style="color:#ffb066">—通电→</span> 2H₂↑ + O₂↑</p>' +
          '<p>配平后系数是 2 : 2 : 1，氢气与氧气的系数比 2:1 正好对应实验测出的体积比——方程式和现象互相印证。反应条件写「通电」。</p>' +
          '<p>一种物质生成了两种物质，这就是<b>分解反应</b>：AB → A + B，「一变多」。它和化合反应方向正好相反。</p>' +
          '<p>查一查原子账：左边 2×2=4 个 H、2 个 O；右边 2×2=4 个 H、2 个 O，一个不差——再次验证了质量守恒定律。</p>' +
          '<p>易错点：生成物都是反应新产生的气体，所以标「↑」；如果反应物里本来就有气体，生成气体就不能标了。中考常考：判断反应类型＋解释「↑」什么时候标。</p>',
        apply: function (s) { s.on = true; s.h = .58; s.o = .29; s.test = ''; s.bubbles = []; }
      },
      {
        name: '考核', title: '当一回实验员',
        ask: '下面每题都考电解水。',
        quiz: true,
        apply: function (s) { s.on = false; s.h = .60; s.o = .30; s.test = ''; s.bubbles = []; }
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '电解水时，正极试管里收集到的气体是：',
          opts: ['氧气', '氢气', '水蒸气', '二氧化碳'],
          ans: '氧气',
          why: '口诀「正氧负氢」：正极出氧气、负极出氢气；正极气体还能使带火星的木条复燃，这是氧气的专属检验现象。'
        },
        {
          q: '「氢二氧一」中的「二」和「一」，指的是氢气与氧气的：',
          opts: ['体积比', '质量比', '密度比', '相对分子质量比'],
          ans: '体积比',
          why: '同温同压下气体体积比等于分子个数比，为 2:1；氢、氧元素的质量比其实是 1:8，两组数常被放在一起设陷阱。'
        },
        {
          q: '某小组测得氢气与氧气的体积比明显大于 2:1，最可能的原因是：',
          opts: ['氧气比氢气更易溶于水', '氢气比氧气更易溶于水', '加硫酸钠改变了产物', '试管没有倒扣'],
          ans: '氧气比氢气更易溶于水',
          why: '氧气在水中的溶解能力比氢气略强，一小部分氧气溶进水里没被收集到，正极气体偏少，比值就偏大。'
        },
        {
          q: '实验前往水中加入少量硫酸钠，目的是：',
          opts: ['增强水的导电性', '增大产生气体的体积', '改变生成气体的种类', '防止电极被腐蚀'],
          ans: '增强水的导电性',
          why: '纯水几乎不导电，通电后迟迟看不到气泡；硫酸钠只起「搭桥」作用，不参与反应，产物种类和体积比都不变。'
        },
        {
          q: '由「水通电生成氢气和氧气」推出「水由氢、氧两种元素组成」，依据的原理是：',
          opts: ['化学反应前后元素种类不变', '化学反应前后分子种类不变', '水中本来就溶有氢气和氧气', '气体的体积可以相加'],
          ans: '化学反应前后元素种类不变',
          why: '生成物只含氢、氧两种元素，而元素在化学反应中不会凭空产生或消失，所以反应物水里也只能有这两种元素。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
