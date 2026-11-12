/* 格物实验室 · 金属活动性顺序（three.js 版） */
(function () {
  var T = window.THREE, K = window.Lab;
  var st = {
    t: 0,
    bubbles: [],
    fe: 0
  };

  var O = {};   // 对象引用

  /* ───────── 几何（沿用旧版坐标系） ───────── */
  var XS = [-12.6, -6.3, 0, 6.3, 12.6];
  var TR = 1.5;                  /* 试管半径 */
  var T_TOP = 15.5;              /* 管口 */
  var T_BOT = 2.85;              /* 管底圆弧圆心（最低点 = T_BOT - TR） */
  var LVL = 7.30;                /* 液面高度（五支一致） */

  var ACID = 0x9ccbe8;           /* 稀盐酸：近无色，略偏冷（旧 rgb148,202,234） */
  var SOL0 = [40, 106, 190], SOL1 = [128, 198, 158];

  /* 架体 */
  var BOARD_Y0 = 0.30, BOARD_Y1 = 1.35;
  var TOP_Y0 = 9.15, TOP_Y1 = 9.75;
  var RACK_W = 32.6, RACK_D = 5.6, PANEL_X = 15.3;

  /* 各管金属件顶端（气泡起点） */
  var MET = [{ top: 5.30 }, { top: 2.98 }, { top: 5.05 }, { top: 4.75 }, { top: 9.40 }];
  var RATE = [30, 13, 5, 0, 0];

  /* 第五支试管的铁钉 */
  var N0 = [XS[4] - .55, 1.55, .38], N1 = [XS[4] + .50, MET[4].top, -.30];
  var N_DY = N1[1] - N0[1];
  var T_SUB = (LVL - N0[1]) / N_DY;

  function mix3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  var scene = {
    setup: function () {
      K.bench(46, 26);


      var wood = K.M().wood;
      var woodDark = new (K.T().MeshStandardMaterial)({ color: 0x6b4f34, roughness: .82 });
      var woodHole = new (K.T().MeshStandardMaterial)({ color: 0x4a3421, roughness: .9 });

      /* ── 架体：底板 + 两端立板 ── */
      K.box({ x: 0, y: (BOARD_Y0 + BOARD_Y1) / 2, z: 0, sx: RACK_W, sy: BOARD_Y1 - BOARD_Y0, sz: RACK_D, mat: wood });
      K.box({ x: -PANEL_X, y: (BOARD_Y1 + TOP_Y1) / 2, z: 0, sx: 1.8, sy: TOP_Y1 - BOARD_Y1, sz: RACK_D, mat: woodDark });
      K.box({ x: PANEL_X, y: (BOARD_Y1 + TOP_Y1) / 2, z: 0, sx: 1.8, sy: TOP_Y1 - BOARD_Y1, sz: RACK_D, mat: woodDark });

      /* ── 五支试管（圆底，竖直，管底最低点 y = T_BOT - TR） ── */
      var TUBE_H = T_TOP - (T_BOT - TR);
      var LIQ = (LVL - (T_BOT - TR)) / (TUBE_H * .95);
      for (var i = 0; i < 4; i++) {
        var gg = K.testTube({ r: TR, h: TUBE_H, pos: [XS[i], T_BOT - TR, 0], dir: [0, 1, 0],
          liquid: LIQ, liquidCol: ACID });
        /* 液体去 transmission + 不写深度：让气泡与铜生长层可见 */
        if (gg.children[1]) {
          gg.children[1].material.transmission = 0;
          gg.children[1].material.opacity = .5;
          gg.children[1].material.depthWrite = false;
        }
      }
      var g5 = K.testTube({ r: TR, h: TUBE_H, pos: [XS[4], T_BOT - TR, 0], dir: [0, 1, 0],
        liquid: LIQ, liquidCol: 0x286abe });
      O.cuLiq = g5.children[1];   /* 液体网格（testTube 第二个子对象） */
      if (O.cuLiq) {
        O.cuLiq.material.transmission = 0;
        O.cuLiq.material.opacity = .6;
        O.cuLiq.material.depthWrite = false;
      }

      /* ── 管内金属 ── */
      var mgMat = new (K.T().MeshStandardMaterial)({ color: 0xdbe1e9, roughness: .28, metalness: .9 });
      var mgMat2 = new (K.T().MeshStandardMaterial)({ color: 0xc6ced8, roughness: .32, metalness: .88 });
      K.rod([XS[0] - .58, 1.62, .34], [XS[0] + .44, 5.20, -.28], .15, { mat: mgMat });   /* 镁条两段交叠 */
      K.rod([XS[0] + .54, 1.60, .12], [XS[0] - .34, 4.70, -.32], .15, { mat: mgMat2 });

      K.sphere({ x: XS[1] - .52, y: 1.92, z: .30, r: .50, color: 0xa9b2bc });            /* 锌粒四颗 */
      K.sphere({ x: XS[1] + .46, y: 1.84, z: -.20, r: .45, color: 0x99a2ac });
      K.sphere({ x: XS[1] + .06, y: 2.42, z: .38, r: .41, color: 0xb4bdc7 });
      K.sphere({ x: XS[1] - .28, y: 2.52, z: -.28, r: .32, color: 0x9ba4ae });

      var ironLite = new (K.T().MeshStandardMaterial)({ color: 0x7e8791, roughness: .42, metalness: .85 });
      var nailHeadMat = new (K.T().MeshStandardMaterial)({ color: 0xaab2bc, roughness: .42, metalness: .8 });
      /* 第三支：铁钉（斜置，钉帽在上） */
      K.rod([XS[2] - .70, 1.58, .42], [XS[2] + .50, 4.98, -.30], .19, { mat: ironLite });
      var up = new (K.T().Vector3)(0, 1, 0);
      var d3 = new (K.T().Vector3)(XS[2] + .50 - (XS[2] - .70), 4.98 - 1.58, -.30 - .42).normalize();
      var head = new (K.T().Mesh)(new (K.T().CylinderGeometry)(.36, .36, .16, 18), nailHeadMat);
      head.quaternion.setFromUnitVectors(up, d3);
      head.position.set(XS[2] + .50, 4.98, -.30);
      K.scene().add(head);

      /* 第四支：铜片（竖直薄板） */
      K.box({ x: XS[3], y: 3.05, z: 0, sx: .42, sy: 3.1, sz: 1.75, mat: K.M().copper });

      /* 第五支：铁钉 + 硫酸铜（铜自下而上生长） */
      K.rod(N0, N1, .19, { mat: ironLite });
      var d5 = new (K.T().Vector3)(N1[0] - N0[0], N1[1] - N0[1], N1[2] - N0[2]).normalize();
      var head5 = new (K.T().Mesh)(new (K.T().CylinderGeometry)(.36, .36, .16, 18), nailHeadMat);
      head5.quaternion.setFromUnitVectors(up, d5);
      head5.position.set(N1[0], N1[1], N1[2]);
      K.scene().add(head5);

      var cuMat = new (K.T().MeshStandardMaterial)({ color: 0xd2652c, roughness: .32, metalness: .7,
        transparent: true, opacity: 1 });
      O.cuRod = K.rod(N0, N1, .26, { mat: cuMat });
      O.cuTip = K.sphere({ x: N0[0], y: N0[1], z: N0[2], r: .26, color: 0xd2652c });
      O.cuTip.material = cuMat;
      O.cuRod.renderOrder = 10;    /* 画在液体之后：depthTest 仍生效，立板照样遮挡 */
      O.cuTip.renderOrder = 10;
      O.cuRod.visible = false;
      O.cuTip.visible = false;

      /* ── 顶板（分段拼出 5 个孔位） + 孔沿 ── */
      var HR = TR + .12;
      var edges = [-RACK_W / 2];
      for (i = 0; i < XS.length; i++) { edges.push(XS[i] - HR, XS[i] + HR); }
      edges.push(RACK_W / 2);
      for (i = 0; i < edges.length; i += 2) {
        var w = edges[i + 1] - edges[i];
        if (w > .05) {
          K.box({ x: (edges[i] + edges[i + 1]) / 2, y: (TOP_Y0 + TOP_Y1) / 2, z: 0,
            sx: w, sy: TOP_Y1 - TOP_Y0, sz: RACK_D, mat: wood });
        }
      }
      for (i = 0; i < XS.length; i++) {
        var rim = new (K.T().Mesh)(new (K.T().TorusGeometry)(HR, .16, 10, 32), woodHole);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(XS[i], TOP_Y1, 0);
        K.scene().add(rim);
      }

      /* 接触阴影 */
      K.blob({ x: 0, z: 0, r: 18 });

      /* 标注 */
      K.label([XS[0], T_TOP + .2, 0], '镁条 Mg', -8, -26);
      K.label([XS[1], T_TOP + .2, 0], '锌粒 Zn', -8, -52);
      K.label([XS[2], T_TOP + .2, 0], '铁钉 Fe', -8, -26);
      K.label([XS[3], T_TOP + .2, 0], '铜片 Cu', -8, -52);
      K.label([XS[4], T_TOP + .2, 0], '铁钉＋硫酸铜', -14, -26);

      /* 气泡小球池 */
      O.bGeo = new (K.T().SphereGeometry)(1, 12, 10);
      O.bMat = new (K.T().MeshStandardMaterial)({ color: 0xf6fcff, roughness: .25, metalness: 0 });
      O.pool = [];
      O.bound = null;
    },

    update: function (dt, s) {
      var i, j, b;
      s.t += dt;
      s.fe = Math.min(1, s.fe + dt * .19);

      /* steps.apply 会整体替换 s.bubbles —— 换数组时回收旧网格 */
      if (O.bound !== s.bubbles) {
        if (O.bound) {
          for (i = 0; i < O.bound.length; i++) {
            if (O.bound[i].m) { K.scene().remove(O.bound[i].m); O.pool.push(O.bound[i].m); }
          }
        }
        O.bound = s.bubbles;
      }

      /* 生成：速率 镁>锌>铁>铜=0 */
      for (i = 0; i < 4; i++) {
        if (Math.random() < dt * RATE[i]) {
          var m = O.pool.pop() || new (K.T().Mesh)(O.bGeo, O.bMat);
          m.scale.setScalar(K.rnd(.16, .30));
          m.position.set(XS[i] + K.rnd(-.62, .62), MET[i].top - K.rnd(.05, 1.1), K.rnd(-.55, .55));
          K.scene().add(m);
          s.bubbles.push({ i: i, x: m.position.x, y: m.position.y, z: m.position.z,
            v: K.rnd(2.4, 4.4), ph: K.rnd(0, 6.28), m: m });
        }
      }

      /* 上升 + 摆动 + 回收 */
      for (j = s.bubbles.length - 1; j >= 0; j--) {
        b = s.bubbles[j];
        b.y += b.v * dt;
        if (b.y > LVL - .35) {
          K.scene().remove(b.m);
          O.pool.push(b.m);
          s.bubbles.splice(j, 1);
          continue;
        }
        b.m.position.set(b.x + Math.sin(b.y * 1.6 + b.ph) * .20, b.y, b.z);
      }
      while (s.bubbles.length > 200) {
        b = s.bubbles.shift();
        K.scene().remove(b.m);
        O.pool.push(b.m);
      }

      /* 第五支：硫酸铜 蓝 → 浅绿 */
      var c = mix3(SOL0, SOL1, s.fe);
      O.cuLiq.material.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);

      /* 钉身铜红色自下而上生长到液面 */
      if (s.fe > .02) {
        var tc = Math.min(T_SUB, T_SUB * 1.35 * s.fe);
        O.cuRod.visible = true;
        O.cuTip.visible = true;
        O.cuRod.scale.y = Math.max(.001, tc);
        O.cuRod.position.set(N0[0] + (N1[0] - N0[0]) * tc / 2,
          N0[1] + N_DY * tc / 2, N0[2] + (N1[2] - N0[2]) * tc / 2);
        O.cuTip.position.set(N0[0] + (N1[0] - N0[0]) * tc,
          N0[1] + N_DY * tc, N0[2] + (N1[2] - N0[2]) * tc);
      } else {
        O.cuRod.visible = false;
        O.cuTip.visible = false;
      }
    }
  };

  K.boot({
    title: '常见金属的物理性质和化学性质',
    chip: '化学 · 鲁教版 · 九年级下册 · 学生实验9',
    hint: '拖空白处旋转视角 · 滚轮缩放',
    state: st,
    scene: scene,
    cam: { ty: 7.2, dist: 46, tx: 2.5, yaw: .38, pitch: .18 },

    reads: [['mg', '镁 + 稀盐酸现象'], ['zn', '锌 + 稀盐酸现象'], ['cu', '铜 + 稀盐酸现象'], ['fe', '铁 + 硫酸铜现象']],
    values: function (s) {
      return {
        mg: '剧烈冒泡',
        zn: '缓慢冒泡',
        cu: '没有气泡',
        fe: s.fe > .5 ? '析出红色铜' : '开始反应'
      };
    },

    steps: [
      {
        name: '四种金属进酸', title: '谁冒泡，谁不冒',
        ask: '同样泡在稀盐酸里，四种金属表现一样吗？',
        body: '<p>五支试管：前四支装<b>稀盐酸</b>，分别放入镁、锌、铁、铜；第五支装<b>硫酸铜溶液</b>，里面放铁钉。先看前四支。</p>' +
          '<p>现象按剧烈程度排队：<b>镁</b>——大量气泡，金属块很快变小，试管壁发烫；<b>锌</b>——气泡持续，速度明显慢于镁；<b>铁</b>——要等一会儿才出现少量气泡，溶液慢慢泛浅绿；<b>铜</b>——<b>毫无现象</b>，不冒泡也不变色。</p>' +
          '<p>气泡是什么？是金属把酸里的<b>氢</b>顶替出来放出的<b>氢气</b>。类比拔河：活动性强的金属力气大，能把氢从化合物里拉下台、自己顶上去。冒泡越猛，说明顶得越轻松，活动性越强。</p>' +
          '<p>易错点：铜「毫无动静」不是反应慢，而是它排在氢<b>后面</b>，压根不与稀盐酸反应——「无现象」本身就是一条重要结论。</p>',
        apply: function (s) { s.fe = 0; s.bubbles = []; }
      },
      {
        name: '排出顺序', title: 'Mg > Zn > Fe > (H) > Cu',
        ask: '这个顺序能说明什么？',
        body: '<p>把四支试管按冒泡由快到慢排序：<b>镁 &gt; 锌 &gt; 铁</b>；铜不反应，排在氢后面。局部顺序出来了：<b>Mg &gt; Zn &gt; Fe &gt; (H) &gt; Cu</b>。</p>' +
          '<p>(H) 是一道分界线：排在它前面的金属能与稀盐酸、稀硫酸反应放出氢气；排在它后面的不能。铁「在氢前」、铜「在氢后」，两个位置一查，结论就定了。</p>' +
          '<p>类比考试排名：分数高的能顶替分数低的座位；分数比录取线（氢）还低的，连考场都进不去。</p>' +
          '<p>易错点：铁与稀盐酸、稀硫酸反应，生成的是<b>亚铁盐</b>（FeCl₂、FeSO₄，溶液<b>浅绿色</b>），铁显 +2 价——不是黄色的 FeCl₃。凡是「铁 + 酸」这类反应，价态和颜色都是高频陷阱。</p>',
        apply: function (s) { s.fe = 0; s.bubbles = []; }
      },
      {
        name: '铁与硫酸铜', title: '红色物质从哪来',
        ask: '铁钉放进硫酸铜溶液，表面为什么变红？',
        body: '<p>第五支试管：铁钉浸入<b>蓝色</b>的硫酸铜溶液，几分钟内，铁钉表面覆盖一层<b>紫红色</b>的铜，溶液由蓝色变为<b>浅绿色</b>（FeSO₄）。</p>' +
          '<p style="text-align:center;font-family:ui-monospace,monospace;color:#cfe0f5;padding:6px 0">Fe + CuSO₄ → FeSO₄ + Cu</p>' +
          '<p>这个反应本身就是一杆「活动性之秤」：铁能把铜从它的盐溶液里置换出来，证明<b>铁比铜活泼</b>。反过来，把铜片放进硫酸亚铁溶液，什么也不会发生——「前换后」是<b>单向</b>的。</p>' +
          '<p>再算一笔质量账：每有 56 份质量的铁溶进溶液，就有 64 份质量的铜析出，溶液质量<b>净减 8 份</b>，铁钉增重。课件演示的正是这个趋势。</p>' +
          '<p>考点：比较两种金属的活动性，就用「前换后」设计实验——让可能更活泼的那种金属去碰另一种金属的盐溶液，看到现象即可下结论。</p>',
        apply: function (s) { s.fe = 0; s.bubbles = []; },
        controls: [
          { type: 'btn', label: '把铁钉放入硫酸铜溶液', onClick: function (s) { s.fe = 0; } }
        ]
      },
      {
        name: '活动性顺序表', title: '背下这一串',
        ask: 'K Ca Na Mg Al Zn Fe Sn Pb (H) Cu Hg Ag Pt Au 怎么用？',
        body: '<p style="font-family:ui-monospace,monospace;color:#cfe0f5;font-size:13px;line-height:1.9">' +
          'K Ca Na Mg Al Zn <b>Fe</b> Sn Pb <span style="color:#ffb066">(H)</span> <b>Cu</b> Hg Ag Pt Au</p>' +
          '<p>顺口溜：「钾钙钠镁铝，锌铁锡铅氢，铜汞银铂金」。位置越靠前，金属越活泼。</p>' +
          '<p>两条用法：① 排在氢<b>前</b>的金属，能置换稀盐酸、稀硫酸中的氢；② 排在<b>前面</b>的金属，能把排在后面的金属从它们的<b>盐溶液</b>中置换出来。所以 Fe 能换 Cu，Cu 换不了 Fe。</p>' +
          '<p>三个使用前提：酸必须是<b>稀盐酸或稀硫酸</b>——硝酸、浓硫酸氧化性太强，不生成氢气；盐必须是<b>可溶</b>的，不溶性盐不反应；钾、钙、钠太活泼，扔进盐溶液会先跟水反应，<b>不能</b>用来置换金属。</p>' +
          '<p>中考综合判断题基本都是这三条前提的组合——前提背熟，题目就变成对号入座。</p>',
        apply: function (s) { s.fe = 1; s.bubbles = []; }
      },
      {
        name: '用起来', title: '为什么不能用铁桶装硫酸铜',
        ask: '波尔多液为什么不能用铁制容器配？',
        body: '<p><b>波尔多液</b>是一种含硫酸铜的农药，不能用铁桶配制：铁会与硫酸铜反应，铁桶被腐蚀出洞、铜被置换出来，农药也失效——一桶两空，反应式就是刚才那条 Fe + CuSO₄。</p>' +
          '<p><b>湿法炼铜</b>用的正是这个反应。我国古籍记载「曾青得铁则化为铜」：把铁放进硫酸铜溶液，铁表面就长出红色的铜。它省去了高温冶炼，是化学史上的重要发明。</p>' +
          '<p>反过来想：<b>金、铂</b>排在最后，极难被置换、也难被氧化，所以「真金不怕火炼」——高温也烧不坏它。银器、金饰能传几百年，靠的就是这个位置。</p>' +
          '<p>考点：用活动性顺序解释生活现象有答题模板——先写反应原理，再说清「谁比谁活泼、谁置换谁」，最后落到后果（腐蚀 / 失效 / 提炼）。</p>',
        apply: function (s) { s.fe = 1; s.bubbles = []; }
      },
      {
        name: '反应类型', title: '置换 vs 化合 vs 分解',
        ask: '怎么一眼认出置换反应？',
        body: '<p><b>置换反应</b>：A + BC → AC + B，一种单质和一种化合物反应，生成另一种单质和另一种化合物。识别标志：<b>反应物和生成物里都必须既有单质、又有化合物</b>。</p>' +
          '<p>对比另外两类：<b>化合反应</b> A + B → AB，多变一（如铁在氧气中燃烧）；<b>分解反应</b> AB → A + B，一变多（如电解水）。</p>' +
          '<p>铁与硫酸铜、锌与稀盐酸、湿法炼铜，都是典型的置换反应。</p>' +
          '<p>易错点：一氧化碳还原氧化铁（Fe₂O₃ + 3CO → 2Fe + 3CO₂）<b>不是</b>置换反应——CO 是化合物，反应物里没有单质。这个反例几乎是每年必考。</p>',
        apply: function (s) { s.fe = 1; s.bubbles = []; }
      },
      {
        name: '考核', title: '当一回实验员',
        ask: '下面每题都考金属活动性。',
        quiz: true,
        apply: function (s) { s.fe = .6; s.bubbles = []; }
      },
      {
        name: '物理性质',
        cam: { tx: 2, ty: 5.2, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '金属的物理性质：光泽、导电、导热、延展',
        ask: '铜、铁、铝，哪些物理性质相同？哪些不同？',
        body: '<p><b>共同：</b>都有<b>金属光泽</b>，能导电、导热，有延展性（能拉成丝、压成片）。</p>' +
          '<p><b>不同：</b>颜色不同（铜紫红、金金黄、铁银白）；导电导热能力不同；硬度、密度、熔点也不同。</p>' +
          '<p><b>用途：</b>电线用铜（导电好）、锅用铁铝（导热）、金箔能压得很薄（延展性好）。</p>',
        apply: function () {}
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '把铁钉放入硫酸铜溶液中，观察到的现象是：',
          opts: ['铁钉表面覆盖红色物质，溶液由蓝色变浅绿色', '产生大量气泡，溶液变无色', '铁钉表面变黑，溶液不变色', '没有明显现象'],
          ans: '铁钉表面覆盖红色物质，溶液由蓝色变浅绿色',
          why: '置换出的铜呈紫红色、附着在钉上；生成的硫酸亚铁使溶液呈浅绿色。现象题要「固体 + 液体」两头都答才给全分。'
        },
        {
          q: '镁、锌分别放入相同浓度的稀盐酸中，镁产生气泡更快，说明：',
          opts: ['镁的活动性比锌强', '镁的质量比锌大', '盐酸浓度变大了', '镁是更贵重的金属'],
          ans: '镁的活动性比锌强',
          why: '同种酸、同浓度的条件下，冒泡越剧烈、反应越快，金属活动性越强——这是比较活动性最常用的方法之一。'
        },
        {
          q: '要验证铁和铜的活动性强弱，下列方案最直接可行的是：',
          opts: ['把铁钉放入硫酸铜溶液，观察现象', '把铜片放入硫酸亚铁溶液，观察现象', '把两块金属都放入蒸馏水', '比较两者的硬度大小'],
          ans: '把铁钉放入硫酸铜溶液',
          why: '「前换后」是单向的：铁能置换出铜，即可证明铁更活泼、现象又明显；铜放入硫酸亚铁只能反证，且硬度与活动性无关。'
        },
        {
          q: '铁与足量稀盐酸完全反应后，所得溶液的颜色是：',
          opts: ['浅绿色', '黄色', '蓝色', '无色'],
          ans: '浅绿色',
          why: '铁与稀盐酸发生置换反应生成氯化亚铁（FeCl₂），亚铁离子使溶液呈浅绿色；黄色是铁离子（Fe³⁺）的颜色，是常见陷阱。'
        },
        {
          q: '铜粉中混有少量铁粉，要除去铁粉，最合适的方法是：',
          opts: ['加入足量稀盐酸，充分反应后过滤、洗涤、干燥', '加入足量稀盐酸后直接蒸发', '在空气中加热灼烧', '加足量水溶解后过滤'],
          ans: '加入足量稀盐酸，充分反应后过滤、洗涤、干燥',
          why: '铁排在氢前能与稀盐酸反应溶解，铜不反应留在滤纸上；加热灼烧会让铜也变成氧化铜，越除越糟。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
