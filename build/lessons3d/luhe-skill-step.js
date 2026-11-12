/* 格物实验室 · 化学实验基本技能训练（three.js 单文件课件）
   鲁教版 八年级全一册 · 学生实验1 · 取药 / 加热 / 洗涤 */
(function () {
  var T = window.THREE, K = window.Lab;

  var st = { t: 0 };
  var O = {};

  var scene = {
    setup: function () {
      var i;
      var MAT = {
        glass: new T.MeshPhysicalMaterial({
          color: 0xf2f8fc, metalness: 0, roughness: .05, transparent: true, opacity: .3,
          side: T.DoubleSide, depthWrite: false, clearcoat: .7, clearcoatRoughness: .08,
          envMapIntensity: 1.8, specularIntensity: 1.2
        }),
        steel: new T.MeshStandardMaterial({ color: 0xaab2ba, roughness: .3, metalness: .9, envMapIntensity: 1.25 }),
        dark: new T.MeshStandardMaterial({ color: 0x3a434d, roughness: .5, metalness: .4 }),
        rubber: new T.MeshStandardMaterial({ color: 0x8a2f2f, roughness: .75, metalness: .02 }),
        epoxy: new T.MeshStandardMaterial({ color: 0xc3ccd2, roughness: .55, metalness: .1 }),
        wood: new T.MeshStandardMaterial({ color: 0xc08a4a, roughness: .8, metalness: .02 }),
        salt: new T.MeshStandardMaterial({ color: 0xfbfdff, roughness: .55, metalness: .02 }),
        bristle: new T.MeshStandardMaterial({ color: 0x2f6f8f, roughness: .85, metalness: .02 })
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
      /* 板书：这节课的操作口诀（引擎黑板已不写具体物质，由课件覆盖） */
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
        x.fillText('化学实验基本技能', 60, 78);
        x.font = '38px "Microsoft YaHei", Georgia, serif';
        x.fillText('三不：不摸 · 不凑闻 · 不尝', 70, 158);
        x.fillText('固体：一斜 二送 三直立', 70, 226);
        x.fillText('液体：标签向手心 · 瓶塞倒放', 70, 294);
        x.fillText('加热：外焰 · 灯帽盖灭', 70, 362);
        x.fillText('洗涤：水膜均匀不成滴', 70, 430);
        var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
        board.material.map = t; board.material.needsUpdate = true;
      })();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .8;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });

      /* 台面：沿用验收样板的深色环氧实验台 */
      K.bench(52, 16);
      /* 极亮的 scene.environment 会在 MeshPhysicalMaterial 的 IBL/clearcoat
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

      /* 试管架（木块 + 两个插孔）；试管由 ChemKit 高模放在孔位上，
         旧的 K.glassCyl 手搓圆柱不能再叠一层。 */
      var RX = -14, RZ = 2;
      K.rbox({ x: RX, y: .7, z: RZ, sx: 6, sy: 1.4, sz: 3, r: .2, mat: MAT.wood });
      [-1, 1].forEach(function (sg) {
        var hole = new T.Mesh(new T.CircleGeometry(.95, 28).rotateX(-Math.PI / 2),
          new T.MeshStandardMaterial({ color: 0x6b4a21, roughness: .92 }));
        hole.position.set(RX + sg * 1.4, 1.41, RZ);
        K.scene().add(hole);
      });
      /* 试管里的少量固体 */
      var sg = new T.OctahedronGeometry(.18, 0);
      O.solid = [];
      for (i = 0; i < 10; i++) {
        var b = new T.Mesh(sg, MAT.salt);
        b.position.set(RX - 1.4 + (Math.random() - .5) * 1.2, 1.7 + Math.random() * .5, RZ + (Math.random() - .5) * 1.2);
        O.solid.push(b); K.scene().add(b);
      }

      /* 药匙 */
      O.spoon = new T.Group();
      var handle = new T.Mesh(new T.CylinderGeometry(.16, .16, 6, 8), MAT.dark);
      handle.rotation.z = Math.PI / 2; O.spoon.add(handle);
      var scoop = new T.Mesh(new T.SphereGeometry(.55, 12, 8, 0, 6.28, 0, 1.7), MAT.dark);
      scoop.position.x = 3.0; O.spoon.add(scoop);
      O.spoon.position.set(-7, .8, 4); O.spoon.rotation.z = .2;
      K.scene().add(O.spoon);

      /* 量筒：整件交给 ChemKit 高模（自带 9 条刻度与液柱）。
         旧的手搓玻璃筒、口沿环、4 圈刻度、液柱/液面全部删除，
         否则会与高模叠成双层玻璃和重影刻度。 */
      var CX = 0, CZ = 2;

      /* 胶头滴管 */
      O.dropper = new T.Group();
      var db = new T.Mesh(new T.CylinderGeometry(.2, .12, 4.0, 14), MAT.glass);
      db.position.y = 2.0; O.dropper.add(db);
      var bulb = new T.Mesh(new T.SphereGeometry(.48, 14, 10), MAT.rubber);
      bulb.position.y = 4.2; bulb.scale.set(1, 1.25, 1); O.dropper.add(bulb);
      O.dropper.position.set(2.2, 7.6, 2); O.dropper.scale.setScalar(.8);
      O.dropper.visible = false;                    /* 只在「液体取用」步骤出现，不悬空 */
      K.scene().add(O.dropper);

      /* 酒精灯：整件交给 ChemKit 高模（灯体/酒精/灯芯/灯帽齐全）。
         旧的两段圆柱灯体、酒精液柱、灯芯、红帽全部删掉，
         否则两套灯叠在一起。火焰底部对齐高模灯芯顶 y≈2.81。 */
      var LX = 7, LZ = 2;
      O.flame = K.shaderFlame({ x: LX, y: 2.85, z: LZ, r: .55, h: 2.6, light: 1.0, dist: 12 });
      O.flame.mesh.traverse(function (m) { m.renderOrder = 5; });

      /* 试管夹：夹环必须同轴套在试管上，柄从夹环接出去。
         整组一起倾斜（不再各转各的），夹环半径略大于试管半径 1.05。 */
      O.clamp = new T.Group();
      var held = window.ChemKit.create('testTube', { scale: .78, liquid: .18 });
      O.clamp.add(held);                       /* 管底落在组原点 */
      var jaw = new T.Mesh(new T.TorusGeometry(1.12, .12, 8, 24), MAT.steel);
      jaw.rotation.x = Math.PI / 2;           /* 水平环，套住管身 */
      jaw.position.y = 3.2;                  /* 夹在距管口约 1/3 处 */
      O.clamp.add(jaw);
      var joint = new T.Mesh(new T.BoxGeometry(1.0, .18, .18), MAT.steel);
      joint.position.set(.62, 3.2, 0); O.clamp.add(joint);
      var cm = new T.Mesh(new T.CylinderGeometry(.13, .13, 4.2, 8), MAT.steel);
      cm.rotation.z = Math.PI / 2;
      cm.position.set(2.1, 3.2, 0); O.clamp.add(cm);
      O.clamp.visible = false;
      K.scene().add(O.clamp);

      /* 烧杯（洗涤）+ 试管刷：烧杯交给高模（自带刻度、倾倒嘴、洗涤水），
         旧的 K.beaker 圆柱、两圈口沿环、手搓水柱全部删掉。 */
      var BX = 14, BZ = 2;
      /* 试管刷：金属丝柄 + 同轴的刷毛簇，斜插进烧杯的洗涤水里。
         旧版柄和刷头是两根分离的棍子、还悬在杯口上方。 */
      O.brush = new T.Group();
      var stem = new T.Mesh(new T.CylinderGeometry(.075, .075, 7.0, 10), MAT.steel);
      stem.position.y = 3.5; O.brush.add(stem);
      var core = new T.Mesh(new T.CylinderGeometry(.30, .30, 2.2, 16), MAT.bristle);
      core.position.y = -1.1; O.brush.add(core);
      /* 9 层 × 18 根放射状细毛，用 InstancedMesh 一次绘制，
         既致密又不会因上百个 draw call 掉帧 */
      var hairG = new T.CylinderGeometry(.018, .018, .34, 4);
      var hairs = new T.InstancedMesh(hairG, MAT.bristle, 9 * 18);
      var dummy = new T.Object3D(), hi = 0;
      for (var bi = 0; bi < 9; bi++) {
        for (var bj = 0; bj < 18; bj++) {
          var a2 = bj / 18 * Math.PI * 2;
          dummy.position.set(Math.cos(a2) * .44, -2.05 + bi * .26, Math.sin(a2) * .44);
          dummy.rotation.set(0, -a2, -Math.PI / 2);
          dummy.updateMatrix();
          hairs.setMatrixAt(hi++, dummy.matrix);
        }
      }
      hairs.instanceMatrix.needsUpdate = true;
      O.brush.add(hairs);
      O.brush.position.set(BX + .3, 3.4, BZ);
      O.brush.rotation.z = -.26;
      O.brush.visible = false;
      K.scene().add(O.brush);

      /* 去掉 K.blob 接触阴影贴片：浅台面上它们就是一块块白色圆盘，
         玻璃器皿底下尤其明显（蛋壳课已验证）。 */

      O.lab1 = K.spriteLabel([RX, 10.5, RZ], '试管 + 试管架', { w: 4.4, fs: 36 });
      O.lab2 = K.spriteLabel([-7, 4.0, 4], '药匙（取固体）', { w: 4.6, fs: 36 });
      O.lab3 = K.spriteLabel([0, 11.5, 2], '量筒 + 滴管（取液体）', { w: 5.6, fs: 36 });
      O.lab4 = K.spriteLabel([7, 6.2, 2], '酒精灯（外焰加热）', { w: 5.2, fs: 36 });
      O.lab5 = K.spriteLabel([14, 7.4, 2], '试管刷（洗涤）', { w: 4.4, fs: 36 });

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
        C.dress(K.scene(), { reagentX: -21, reagentZ: -5, waste: false });
        C.retrofit(O, K.scene(), {
          /* 手搓玻璃器皿已整组删除，这里只需管仍保留的步骤小件 */
          hide: ['dropper','clamp','brush'],
          add: [
            { id:'cylinder', x: CX, z: CZ, liquid:.38 },
            { id:'beaker',   x: BX, z: BZ, liquid:.42, scaleTo:.85 },
            { id:'lamp',     x: LX, z: LZ, scaleTo:.9 },
            { id:'testTube', x: RX-1.4, z: RZ, y: 1.4, scaleTo:.85 },
            { id:'testTube', x: RX+1.4, z: RZ, y: 1.4, scaleTo:.85 }
          ]
        });
        /* 量筒/烧杯都是直筒，内部液柱顶盖就是液面；外面再套一圈
           恒半径液位箍反而像被箍住，烧杯经 scaleTo 缩小后还会撑出杯壁。 */
        [0, 1].forEach(function (k) {
          var lb = O.ck[k].userData && O.ck[k].userData.liquidBand;
          if (lb) lb.visible = false;
        });
      })();
      O.ready = true;
    },

    update: function (dt, s) {
      s.t += dt;
      var si = 0;
      var idxEl = document.getElementById('sIdx');
      if (idxEl) si = (parseInt(idxEl.textContent, 10) - 1);

      /* 火焰只在「加热」步骤亮 */
      O.flame.setLit(si === 3 ? 1 : 0);
      O.flame.tick(s.t);
      /* 滴管只在「液体取用」步骤出现 */
      O.dropper.visible = (si === 2);

      /* 试管夹 + 试管：加热步骤出现在灯焰上方 */
      O.clamp.visible = si === 3;
      if (si === 3) {
        O.clamp.position.set(7.6, 4.35, 2);
        O.clamp.rotation.z = .35 + Math.sin(s.t * 1.6) * .02;   /* 管口朝左上 */
      }
      /* 洗涤刷 */
      O.brush.visible = si === 4;

      /* 标注按步骤取舍 */
      O.lab1.sprite.visible = (si === 0 || si === 1);
      O.lab2.sprite.visible = (si === 1);
      O.lab3.sprite.visible = (si === 2);
      O.lab4.sprite.visible = (si === 3);
      O.lab5.sprite.visible = (si === 4);
    }
  };

  K.boot({
    title: '化学实验基本技能训练',
    chip: '化学 · 鲁教版 · 八年级全一册 · 学生实验1',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切换步骤',
    state: st,
    scene: scene,
    cam: { tx: 2, ty: 5.0, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
    postfx: true,

    reads: [['a', '固体取用'], ['b', '液体取用'], ['c', '加热 / 洗涤']],
    values: function () {
      return { a: '一斜二送三直立', b: '标签向手心', c: '外焰 / 水膜均匀' };
    },

    steps: [
      {
        name: '安全规则',
        cam: { tx: 2, ty: 5.0, tz: 2, dist: 44, yaw: .22, pitch: 0.16 },
        title: '进实验室，先记住几条',
        ask: '为什么不能用手直接接触药品、不能尝药品味道？',
        body: '<p><b>三不：</b>不用手接触药品、不把鼻孔凑到容器口闻气味、不尝任何药品味道。</p>' +
          '<p><b>节约：</b>没说明用量时，液体取 1–2 mL，固体只需盖满试管底。</p>' +
          '<p><b>安全：</b>酒精灯用灯帽盖灭，不能用嘴吹；加热的仪器不能立即用手拿。</p>',
        apply: function () {}
      },
      {
        name: '固体取用',
        cam: { tx: -10, ty: 5, tz: 3, dist: 26, yaw: .15, pitch: .28 },
        title: '药匙取固体：一斜二送三直立',
        ask: '把块状固体放进试管，为什么要先倾斜再竖起？',
        body: '<p><b>粉末：</b>用药匙或<b>纸槽</b>送到底部，避免沾在管壁上。</p>' +
          '<p><b>块状：</b>试管先<b>倾斜</b>，把固体送入，再慢慢<b>竖立</b>，让固体滑到底——防止打破试管底。</p>' +
          '<p><b>口诀：</b>一斜、二送、三直立。</p>',
        apply: function () {}
      },
      {
        name: '液体取用',
        cam: { tx: 1, ty: 6, tz: 3, dist: 26, yaw: .1, pitch: .26 },
        title: '倾倒液体：标签向手心',
        ask: '倒液体时瓶塞为什么要倒放？标签为什么朝手心？',
        body: '<p><b>倾倒：</b>瓶塞<b>倒放</b>在桌面（防止污染）；标签<b>朝向手心</b>（防止残液流下腐蚀标签）；瓶口紧靠试管口。</p>' +
          '<p><b>量取：</b>用量筒量取，接近刻度时改用<b>胶头滴管</b>，视线与凹液面最低处相平。</p>',
        apply: function () {}
      },
      {
        name: '酒精灯加热',
        cam: { tx: 7, ty: 6, tz: 3, dist: 24, yaw: .2, pitch: .26 },
        title: '用外焰加热，用灯帽盖灭',
        ask: '为什么用外焰而不是内焰加热？',
        body: '<p><b>点燃：</b>用火柴点燃，不能用一盏酒精灯去点燃另一盏。</p>' +
          '<p><b>加热：</b>用<b>外焰</b>（温度最高）加热；试管夹夹在距管口约 1/3 处，先预热再集中加热。</p>' +
          '<p><b>熄灭：</b>用<b>灯帽盖灭</b>，盖灭后打开再盖一次，防止冷却后盖打不开。</p>',
        apply: function () {}
      },
      {
        name: '仪器洗涤',
        cam: { tx: 14, ty: 6, tz: 3, dist: 24, yaw: .25, pitch: .26 },
        title: '洗到水膜均匀、不聚成滴',
        ask: '仪器洗净的标准是什么？',
        body: '<p><b>洗涤：</b>用<b>试管刷</b>蘸洗涤剂刷洗，再用水冲洗。</p>' +
          '<p><b>洗净标准：</b>内壁附着的水<b>既不聚成水滴，也不成股流下</b>——形成均匀水膜。</p>' +
          '<p><b>难溶物：</b>油污用热的纯碱溶液；氧化铜等用稀盐酸（再用水冲净）。</p>',
        apply: function () {}
      },
      {
        name: '小结',
        cam: { tx: 0, ty: 6, tz: 2, dist: 52, yaw: .2, pitch: .3 },
        title: '技能训练过关了吗？',
        ask: '取用、加热、洗涤，各记住一条最关键的？',
        body: '<p><b>取固体：</b>一斜二送三直立。<br><b>取液体：</b>标签向手心、瓶塞倒放。<br>' +
          '<b>加热：</b>外焰、预热、灯帽盖灭。<br><b>洗涤：</b>水膜均匀不成滴。</p>' +
          '<p>这些动作规范，决定实验能不能做成功、安不安全。</p>',
        quiz: true
      }
    ],

    quiz: function () {
      var bank = [
        { q: '把块状固体放入试管，正确顺序是？', opts: ['一斜二送三直立', '直接丢入', '先竖立再倒', '用滴管送'], ans: '一斜二送三直立', why: '试管倾斜送到底部再竖立，防止击破管底。' },
        { q: '加热时应使用酒精灯的哪部分？', opts: ['外焰', '内焰', '焰心', '灯芯'], ans: '外焰', why: '外焰温度最高，加热最快。' },
        { q: '熄灭酒精灯的正确做法是？', opts: ['用灯帽盖灭', '用嘴吹灭', '用水浇灭', '用另一盏灯点燃'], ans: '用灯帽盖灭', why: '用嘴吹可能把火焰吹入灯内引起危险。' },
        { q: '仪器洗净的标准是？', opts: ['水膜均匀不成滴', '看不到水', '摸着光滑', '有洗涤剂'], ans: '水膜均匀不成滴', why: '内壁水膜均匀、不聚滴、不成股流下即为洗净。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
