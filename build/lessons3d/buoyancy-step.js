/* 格物实验室 · 探究浮力大小与哪些因素有关（阿基米德原理）（three.js 单文件课件）
   鲁教版 八年级下册 · 第八章 浮力 · 第二节 阿基米德原理

   【严谨】G = mg = P.model.weightN(0.054) = 0.54 N；
           石块为规则柱体：底面积 A = 4 cm²、高 H = 5 cm、V = 20 cm³。
           V排 由浸入几何算：V排 = A·min(d, H)（d 为浸入深度，封顶 V）；
           F浮 = P.model.buoyancy(ρ水, V排) = ρ水 g V排；
           F拉 = G − F浮；G排 = ρ水 g V排 —— 与 F浮 同一式子，天然相等，
           从而验证 F浮 = G排（阿基米德原理），数值不再是硬编码。
           反例：完全浸没后继续加深（d > H），V排 封顶不变 → F浮 不变（与深度无关）。
   【真实感】溢水杯装满至溢水口、石块细线真实悬挂并随浸入下沉（细线放长）、
           溢水嘴出水 + 小桶接水且桶内水面随 V排 上升、铁架台夹持测力计、
           每件器材 P.ground 接地、材质按 P.MAT。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源）────────────────────────────── */
  var G       = P.model.gN;                       // 10 N/kg
  var RHO_W   = 1000;                             // 水 kg/m³
  var M_STONE = 0.054;                            // 石块 54 g = 0.054 kg
  var G_STONE = P.model.weightN(M_STONE);         // 0.54 N
  var A_STONE = 4;                                // 底面积 cm²
  var H_STONE = 5;                                // 高 cm
  var V_STONE = A_STONE * H_STONE;                // 20 cm³
  var Y_SURF  = 7.5;                              // 溢水杯液面 = 溢水口（装满）
  var D_DEEP  = 6.5;                              // 完全浸没后继续加深（反例）
  var A_BUCKET = Math.PI * 1.7 * 1.7;             // 小桶内截面（水面上升用）
  var CX = -3.6, SPOUT_X = 1.5, SCALE_Y = 20.6;   // 溢水杯 / 小桶 / 测力计 的世界 x·y
  var RING_Y = SCALE_Y - 4.9;                     // 测力计底部固定吊环世界 y（15.7）

  /* 连续量用 _ 前缀，避开 K.boot 的 0.55 s 步骤补间 */
  var st = { _d: 0, _targetD: 0, judged: false, _t: 0 };
  var O = {};

  /* 模型：V排 由浸入几何算，F浮/G排 同一公式，F拉 = G − F浮 */
  function physics(s) {
    var d    = s._d;
    var Vsub = A_STONE * Math.min(d, H_STONE);      // 浸入几何（封顶 V_STONE）
    var Ff   = P.model.buoyancy(RHO_W, Vsub);       // F浮 = ρ水 g V排
    var Fpull = G_STONE - Ff;                        // F拉 = G − F浮
    var Gp   = RHO_W * G * Vsub / 1e6;              // G排 = ρ水 g V排（= F浮）
    return { d: d, Vsub: Vsub, Ff: Ff, Fpull: Fpull, Gp: Gp, G: G_STONE };
  }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(46, 18);

      /* ══ 铁架台 + 横臂 + 弹簧测力计（竖直，夹持不悬空）══ */
      var stand = P.stand(26, { baseW: 6, baseD: 5 });
      stand.position.set(CX, 0, -5.5); K.scene().add(stand);
      var arm = new T.Mesh(new T.BoxGeometry(1.1, .9, 5.5), P.MAT.steel);   // 横臂加粗
      arm.position.set(CX, 26.7, -2.75); K.scene().add(arm);
      /* 立柱十字夹：立杆顶 ↔ 横臂的双向卡箍 + 旋钮，消除「从天花板吊下来」 */
      var crossV = new T.Mesh(new T.CylinderGeometry(.55, .55, 1.6, 16), P.MAT.steelD);
      crossV.position.set(CX, 26.7, -5.5); K.scene().add(crossV);
      var crossH = new T.Mesh(new T.CylinderGeometry(.45, .45, 1.6, 16), P.MAT.steelD);
      crossH.rotation.z = Math.PI / 2; crossH.position.set(CX, 26.7, -5.5); K.scene().add(crossH);
      var crossKnob = new T.Mesh(new T.SphereGeometry(.3, 12, 10), P.MAT.brass);
      crossKnob.position.set(CX + .75, 26.7, -5.5); K.scene().add(crossKnob);
      P.ground(CX, -5.5, 5);

      /* ── 玻璃器材统一配方 + 定形母线：浅墙前靠「口沿环 + 竖母线 + 水色」读形体，
            不靠把玻璃调白（调白就成塑料桶）── */
      var GLASS = new T.MeshPhysicalMaterial({ color: 0xf2f8fc, roughness: .05, metalness: 0,
        transparent: true, opacity: .26, side: T.DoubleSide, depthWrite: false,
        clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: 1.45 });
      var LINEM = new T.MeshStandardMaterial({ color: 0xdce8f2, roughness: .3, metalness: .15,
        envMapIntensity: 1.2 });
      /* 玻璃定形：Fresnel 边缘光壳（掠射角才亮，正对相机几乎全透）+ 口沿亮环。
         不再用两条等粗等亮的竖母线——那会读成贴了两根白塑料条。 */
      var RIMSHADER = {
        uniforms: { uColor: { value: new T.Color(0xe4f2fc) }, uStr: { value: 1.15 } },
        vertexShader: [
          'varying vec3 vN; varying vec3 vV;',
          'void main() {',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  vN = normalize(normalMatrix * normal);',
          '  vV = normalize(-mv.xyz);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; uniform float uStr;',
          'varying vec3 vN; varying vec3 vV;',
          'void main() {',
          '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
          '  f = pow(f, 3.2) * uStr;',
          '  gl_FragColor = vec4(uColor, f);',
          '}'
        ].join('\n'),
        transparent: true, depthWrite: false, side: T.DoubleSide,
        blending: T.AdditiveBlending
      };
      function outline(g, R, y0, y1) {
        var h = Math.max(.01, y1 - y0), cy = (y0 + y1) / 2;
        var mat = new T.ShaderMaterial(RIMSHADER);
        var shell = new T.Mesh(new T.CylinderGeometry(R + .012, R + .012, h, 40, 1, true), mat);
        shell.position.y = cy; g.add(shell);
        /* 口沿一圈反光（真实杯口的亮边）*/
        var rim = new T.Mesh(new T.TorusGeometry(R, .04, 6, 36), LINEM);
        rim.rotation.x = Math.PI / 2; rim.position.y = y1; g.add(rim);
      }
      function helixGeo(turns, h, Rs, tubeR) {
        var pts = [], n = Math.round(turns * 20), i;
        for (i = 0; i <= n; i++) {
          var a = i / 20 * Math.PI * 2;
          pts.push(new T.Vector3(Math.cos(a) * Rs, i / n * h, Math.sin(a) * Rs));
        }
        return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, tubeR, 6, false);
      }

      /* ══ 弹簧测力计（自建：玻璃筒 + 弧面贴内壁刻度纸，1 N 量程 / 0.05 N 分度）══
         刻度纸 0 位对齐弹簧自然长时的指针位置，1 N 处按定标伸长；指针行程与纸上
         刻度严格同尺度（1 N = 2.8 世界单位），不是画上去的装饰。 */
      var MAXN = 1;
      var scale = (function () {
        var g = new T.Group(), R = 1.35, H = 8.6;
        g.add(new T.Mesh(new T.CylinderGeometry(R, R, H, 26, 1, true), GLASS));
        outline(g, R, -H / 2, H / 2);
        var capT = new T.Mesh(new T.CylinderGeometry(R * 1.05, R * 1.05, .5, 26), P.MAT.steelD);
        capT.position.y = H / 2 + .2; g.add(capT);
        var capB = new T.Mesh(new T.CylinderGeometry(R * 1.05, R * 1.05, .5, 26), P.MAT.steelD);
        capB.position.y = -H / 2 - .2; g.add(capB);
        var ringTop = new T.Mesh(new T.TorusGeometry(.42, .14, 8, 16), P.MAT.brass);
        ringTop.rotation.x = Math.PI / 2; ringTop.position.y = H / 2 + .62; g.add(ringTop);
        /* 底部固定吊环：细线端点（线长在 update 里随浸入深度放长）*/
        var ringBot = new T.Mesh(new T.TorusGeometry(.26, .1, 8, 14), P.MAT.brass);
        ringBot.position.y = -H / 2 - .48; g.add(ringBot);

        /* 刻度纸：上段印规格与「超量程」红区在 1 N 之后，0→1 N 共 20 格 × 0.05 N */
        var cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
        var cx = cv.getContext('2d');
        cx.fillStyle = '#0e2437'; cx.fillRect(0, 0, 128, 512);
        cx.fillStyle = 'rgba(206,230,242,.45)';
        cx.font = 'bold 12px "Microsoft YaHei",sans-serif'; cx.textAlign = 'center';
        cx.fillText('弹簧测力计', 64, 36);
        cx.font = '10px "Microsoft YaHei",sans-serif';
        cx.fillText('1N  0.05N', 64, 54);
        cx.fillStyle = 'rgba(196,44,44,.34)'; cx.fillRect(0, 452, 128, 44);
        cx.fillStyle = '#ff9a88'; cx.font = 'bold 12px "Microsoft YaHei",sans-serif';
        cx.fillText('超量程', 64, 482);
        for (var i = 0; i <= 20; i++) {
          var yy = 272 + i * 8.95, isN = i % 5 === 0;
          cx.strokeStyle = (i === 20) ? '#ff5a3c' : '#cfe6f2';
          cx.lineWidth = isN ? 3 : 1.2;
          cx.beginPath(); cx.moveTo(isN ? 40 : 78, yy); cx.lineTo(118, yy); cx.stroke();
          if (isN) {
            cx.fillStyle = '#cfe6f2'; cx.textAlign = 'right';
            cx.font = 'bold 17px Consolas,monospace';
            cx.fillText(String(i / 20), 34, yy + 6);
          }
        }
        cx.fillStyle = '#9fc6dc'; cx.textAlign = 'center';
        cx.font = 'bold 11px Consolas,monospace'; cx.fillText('N', 64, 266);
        var tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
        tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1;
        /* 弧面贴后壁内壁（凹面朝轴）；repeat.x=-1 修背向镜像 */
        g.add(new T.Mesh(new T.CylinderGeometry(R - .06, R - .06, H - .6, 20, 1, true,
          Math.PI - 1.2, 2.4), new T.MeshBasicMaterial({ map: tex, side: T.BackSide })));

        /* 弹簧顶端锚定 + 动子（指针 / 拉杆 / 挂钩）*/
        var sprTop = H / 2 - .45, L0 = 4.1;
        var spr = new T.Mesh(helixGeo(9, L0, .6, .085), P.MAT.steel);
        g.add(spr);
        var mover = new T.Group(); g.add(mover);
        mover.add(new T.Mesh(new T.CylinderGeometry(.56, .56, .32, 16), P.MAT.steelD));
        var ptr = new T.Mesh(new T.BoxGeometry(1.5, .12, .06),
          new T.MeshBasicMaterial({ color: 0xff5a3c }));
        ptr.position.set(0, 0, -.7); mover.add(ptr);
        var rod = new T.Mesh(new T.CylinderGeometry(.12, .12, 2.0, 10), P.MAT.steel);
        rod.position.y = -1.35; mover.add(rod);
        var hook = new T.Mesh(new T.TorusGeometry(.38, .11, 8, 16), P.MAT.brass);
        hook.position.y = -2.5; hook.rotation.x = Math.PI / 2; mover.add(hook);
        g.userData.setForce = function (N) {
          var f = Math.max(0, Math.min(1.08, N / MAXN));
          var len = L0 + 2.8 * f;                  // 1 N = 2.8 世界单位（与纸上刻度同尺度）
          spr.scale.y = len / L0;
          spr.position.y = sprTop - len;
          mover.position.y = sprTop - len;         // 0 N → 指针 y = −0.25
        };
        g.userData.setForce(0);
        return g;
      })();
      scale.position.set(CX, SCALE_Y, 0); K.scene().add(scale); O.scale = scale;

      /* ══ 石块：规则柱体（A=4 cm²、H=5 cm，与 V排=A·d 的模型几何严格一致）══
         面片微扰 + flatShading 读石面，不靠「不规则多面体」冒充柱体。 */
      var stoneGeo = new T.BoxGeometry(2, H_STONE, 2, 4, 6, 4);
      (function () {
        var p = stoneGeo.attributes.position, i, v = new T.Vector3();
        for (i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          var k = 1 + .055 * Math.sin(v.x * 6.1 + v.y * 4.3 + v.z * 5.7);
          p.setXYZ(i, v.x * k, v.y, v.z * k);
        }
        p.needsUpdate = true; stoneGeo.computeVertexNormals();
      })();
      var stone = new T.Mesh(stoneGeo,
        new T.MeshStandardMaterial({ color: 0x3a434e, roughness: .9, metalness: .18,
          flatShading: true, envMapIntensity: .5 }));
      K.scene().add(stone); O.stone = stone;
      var cap = new T.Mesh(new T.CylinderGeometry(.26, .26, .3, 10), P.MAT.brass);
      stone.add(cap); cap.position.y = H_STONE / 2 + .15;   // 顶部系线点
      /* 细线：单位圆柱，每帧按吊环与石块顶重算长度 */
      O.string = new T.Mesh(new T.CylinderGeometry(.05, .05, 1, 6), P.MAT.dark);
      K.scene().add(O.string);

      /* ══ 溢水杯（自建玻璃锥台：口沿环 + 竖母线定形体；装满至溢水口）══ */
      var CUP_RT = 2.8, CUP_RB = 2.55, CUP_H = 8.4;
      var cup = new T.Group();
      cup.add(new T.Mesh(new T.CylinderGeometry(CUP_RT, CUP_RB, CUP_H, 32, 1, true), GLASS));
      /* 杯底：不透明磨砂厚底盘，压暗一档，别在浅墙前烧成白色大圆盘 */
      var BOTM = new T.MeshStandardMaterial({ color: 0x648394, roughness: .75, metalness: .02, envMapIntensity: 0 });
      var cupBot = new T.Mesh(new T.CylinderGeometry(CUP_RB * .99, CUP_RB * .99, .32, 32), BOTM);
      cupBot.position.y = .16; cup.add(cupBot);
      /* 厚玻璃底的暗边：中间浅、边缘深，才读得出「玻璃厚底」而不是灰白垫片 */
      var cupEdge = new T.Mesh(new T.TorusGeometry(CUP_RB * .97, .075, 6, 36),
        new T.MeshBasicMaterial({ color: 0x547585 }));
      cupEdge.rotation.x = Math.PI / 2; cupEdge.position.y = .33; cup.add(cupEdge);
      outline(cup, CUP_RT, .02, CUP_H);
      cup.position.set(CX, 0, 0); K.scene().add(cup); O.cup = cup;
      /* 透明水不写深度，否则水前表面会把杯内石块 depthTest 剔除掉 */
      var waterMat = new T.MeshPhysicalMaterial({ color: 0x8fc6de, roughness: .12,
        metalness: 0, transparent: true, opacity: .42, side: T.DoubleSide, depthWrite: false,
        envMapIntensity: .9 });
      /* 水体只留侧壁（openEnded）：底面圆盘的三角扇在低角度下会读成一圈白色放射纹 */
      var cupWater = new T.Mesh(new T.CylinderGeometry(CUP_RT * .985, CUP_RB * .985, Y_SURF, 30, 1, true), waterMat);
      cupWater.position.set(CX, Y_SURF / 2, 0); K.scene().add(cupWater);
      /* 水体后壁：较浓的水色只画背向相机的半边，把背景里的铁架台立柱挡在「水后面」。
         否则后方立柱透过透明杯/桶会被读成「桶里插着一根玻璃棒」。 */
      var BACKM = new T.MeshBasicMaterial({ color: 0x9fd0e6, transparent: true, opacity: .78,
        side: T.BackSide, depthWrite: false });
      var cupBack = new T.Mesh(cupWater.geometry, BACKM);
      cupBack.position.copy(cupWater.position); K.scene().add(cupBack);
      /* 水面 = 明确水色的薄盘 + 一圈弯月面水位线（不用受光材质，浅墙前会被洗成白膜）*/
      var SURFM = new T.MeshBasicMaterial({ color: 0x6fb2cf, transparent: true, opacity: .22,
        side: T.DoubleSide, depthWrite: false });
      var Linem = new T.MeshBasicMaterial({ color: 0x4f9fc0 });
      var top = new T.Mesh(new T.CircleGeometry(CUP_RT * .96, 30), SURFM);
      top.rotation.x = -Math.PI / 2; top.position.set(CX, Y_SURF + .01, 0); K.scene().add(top);
      var topLine = new T.Mesh(new T.TorusGeometry(CUP_RT * .96, .045, 6, 36), Linem);
      topLine.rotation.x = Math.PI / 2; topLine.position.set(CX, Y_SURF + .02, 0); K.scene().add(topLine);
      P.ground(CX, 0, 4);

      /* ══ 小桶（自建玻璃桶，与溢水杯同材质系；桶内水面可见上升）══ */
      var BK_R = 2.0, BK_H = 4.6;
      var bucket = new T.Group();
      bucket.add(new T.Mesh(new T.CylinderGeometry(BK_R, BK_R * .84, BK_H, 26, 1, true), GLASS));
      var bkBot = new T.Mesh(new T.CylinderGeometry(BK_R * .84, BK_R * .84, .3, 26), BOTM);
      bkBot.position.y = .15; bucket.add(bkBot);
      var bkEdge = new T.Mesh(new T.TorusGeometry(BK_R * .83, .06, 6, 30),
        new T.MeshBasicMaterial({ color: 0x547585 }));
      bkEdge.rotation.x = Math.PI / 2; bkEdge.position.y = .31; bucket.add(bkEdge);
      outline(bucket, BK_R, .02, BK_H);
      /* 不做跨桶口的提手：水柱要落进桶心，任何跨口提梁都会被水流穿过去 */
      bucket.position.set(SPOUT_X, 0, 0); K.scene().add(bucket); O.bucket = bucket;

      /* 可见溢水嘴：杯壁伸出的细玻璃短管（粗/白会读成「温度计」）*/
      var spoutA = new T.Vector3(CX + CUP_RT - .05, Y_SURF - .15, 0);
      var spoutB = new T.Vector3(SPOUT_X - 1.35, Y_SURF - 1.05, 0);
      var sd = new T.Vector3().subVectors(spoutB, spoutA);
      var spoutMat = GLASS.clone(); spoutMat.opacity = .28;
      var spout = new T.Mesh(new T.CylinderGeometry(.2, .24, sd.length(), 14, 1, true), spoutMat);
      spout.position.copy(spoutA).addScaledVector(sd, .5);
      spout.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), sd.clone().normalize());
      K.scene().add(spout);

      /* ══ 溢水水流：**一条**连续的抛物线细水柱，从嘴口落进桶内、末端止于水面。
            旧版「斜蓝带 + 竖直玻璃棒」两段分离，且棒插穿水面读成实心管，全部废除。
            末端随桶内水位抬升（几何仅在水位变化时重建，静止不重建）。 ══ */
      /* 细水流材质：中心亮、边缘羽化、两端渐隐——等粗硬切的圆柱会读成玻璃棒 */
      var flowMat = new T.ShaderMaterial({
        uniforms: { uColor: { value: new T.Color(0xcbeafb) } },
        vertexShader: [
          'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
          'void main() {',
          '  vUv = uv;',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  vN = normalize(normalMatrix * normal);',
          '  vV = normalize(-mv.xyz);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor;',
          'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
          'void main() {',
          '  float core = pow(abs(dot(normalize(vN), normalize(vV))), .8);',
          '  float ends = smoothstep(0.0, .06, vUv.x) * smoothstep(1.0, .70, vUv.x);',
          '  gl_FragColor = vec4(uColor, core * ends * .9);',
          '}'
        ].join('\n'),
        transparent: true, depthWrite: false, side: T.DoubleSide
      });
      var flow = new T.Mesh(new T.BufferGeometry(), flowMat);
      flow.visible = false; K.scene().add(flow); O.flow = flow;
      var flowX = SPOUT_X - .25, dir = sd.clone().normalize();
      O.buildFlow = function (yEnd) {
        var a = spoutB.clone();
        var p1 = a.clone().addScaledVector(dir, .42);                   // 顺嘴口出射方向
        var p2 = new T.Vector3((a.x + flowX) / 2, a.y - 1.1, 0);       // 抛物线下弯
        var c = new T.Vector3(flowX, yEnd, 0);
        var curve = new T.CatmullRomCurve3([a, p1, p2, c]);
        var geo = new T.TubeGeometry(curve, 26, .085, 10, false);
        if (flow.geometry) flow.geometry.dispose();
        flow.geometry = geo;
      };
      O.buildFlow(.46); O.lastFlowY = .46;

      /* 桶内水体不吃光照：MeshPhysical 的镜面高光会在圆柱正中形成一条竖直亮带，
         特写里读成「水柱插进水里的玻璃棒」——均匀淡蓝才对 */
      var bWater = new T.Mesh(new T.CylinderGeometry(BK_R * .8, BK_R * .76, 1, 24, 1, true),
        new T.MeshBasicMaterial({ color: 0x9fd0e6, transparent: true, opacity: .22,
          side: T.DoubleSide, depthWrite: false }));
      K.scene().add(bWater); O.bWater = bWater;
      var bBack = new T.Mesh(bWater.geometry, BACKM);
      K.scene().add(bBack); O.bBack = bBack;
      /* 桶内水面：明确水色的薄盘 + 一圈水位线，随 V排 上升（不吃光照，不会洗成白塑料片）*/
      var bTop = new T.Group();
      var bSurf = new T.Mesh(new T.CircleGeometry(BK_R * .76, 24), SURFM);
      bSurf.rotation.x = -Math.PI / 2; bTop.add(bSurf);
      var bLine = new T.Mesh(new T.TorusGeometry(BK_R * .76, .04, 6, 28), Linem);
      bLine.rotation.x = Math.PI / 2; bTop.add(bLine);
      bTop.visible = false; K.scene().add(bTop); O.bTop = bTop;
      P.ground(SPOUT_X, 0, 3);

      K.tag(scale, '弹簧测力计', '称重法：F浮 = G − F拉');
      K.tag(O.cup, '溢水杯', '装满至溢水口，石块浸没即溢流');
      K.tag(O.bucket, '小桶', '收集排开的水，桶内水面随 V排 上升');
      K.tag(O.stone, '金属块', '规则柱体 A=4 cm²、H=5 cm，V排 由浸入几何算');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      /* 石块真实下沉（按钮设目标，逐帧插值到位） */
      s._d += (s._targetD - s._d) * Math.min(1, dt * 3);
      var ph = physics(s);

      /* 测力计示数由模型算 */
      O.scale.userData.setForce(ph.Fpull);
      /* 石块位置：底面 y = 液面 − 浸入深度 */
      var stoneCY = Y_SURF - s._d + H_STONE / 2;
      O.stone.position.set(CX, stoneCY, 0);
      /* 细线：固定吊环 → 石块顶，长度随下沉放长 */
      var stoneTopY = stoneCY + H_STONE / 2;
      var len = Math.max(.1, RING_Y - stoneTopY);
      O.string.position.set(CX, (RING_Y + stoneTopY) / 2, 0);
      O.string.scale.y = len;
      /* 小桶内水面：体积守恒，高度 = V排 / 桶截面，随浸入上升 */
      var hW = ph.Vsub / A_BUCKET;
      O.bWater.scale.y = Math.max(0.001, hW);
      O.bWater.position.set(SPOUT_X, .4 + hW / 2, 0);
      O.bBack.scale.y = O.bWater.scale.y;
      O.bBack.position.copy(O.bWater.position);
      O.bTop.visible = ph.Vsub > 0.01;
      O.bTop.position.set(SPOUT_X, .4 + hW + .02, 0);
      /* 水流末端永远贴着水面（不插进水里）：水位变了才重建曲线 */
      O.flow.visible = ph.Vsub > 0.01;
      if (O.flow.visible) {
        var yEnd = .4 + hW + .06;
        if (Math.abs(yEnd - O.lastFlowY) > .012) {
          O.buildFlow(yEnd); O.lastFlowY = yEnd;
        }
      }
    }
  };

  function reset(s) { s._d = 0; s._targetD = 0; s.judged = false; }

  K.boot({
    title: '探究浮力大小与哪些因素有关（阿基米德原理）',
    chip: '物理 · 鲁教版 · 八下 · 第八章 浮力 · 第二节 阿基米德原理',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 12.8, dist: 39, tx: -.9, tz: 0, yaw: .18, pitch: .26 },
    reads: [['phase', '阶段'], ['G', '重力 G'], ['Fpull', '示数 F拉'], ['Ffloat', '浮力 F浮'], ['Gp', 'G排'],
            ['Vp', 'V排'], ['depth', '浸入深度']],
    values: function (s) {
      var ph = physics(s);
      return {
        phase: ph.d < .05 ? '空气中' : (ph.d < H_STONE - .05 ? '浸入中' :
                (ph.d > H_STONE + .1 ? '完全浸没·已加深' : '完全浸没')),
        G: ph.G.toFixed(2) + ' N',
        Fpull: ph.Fpull.toFixed(2) + ' N',
        Ffloat: ph.Ff.toFixed(2) + ' N',
        Gp: ph.Gp.toFixed(2) + ' N',
        Vp: ph.Vsub.toFixed(0) + ' cm³',
        depth: ph.d.toFixed(1) + ' cm'
      };
    },
    steps: [
      { name: '空气中', title: '测石块在空气中的重力 G',
        ask: '称重法测浮力的公式是什么？',
        body: '<p><b>称重法：</b><b>F<sub>浮</sub> = G − F<sub>拉</sub></b>（G 为空气中重力，F<sub>拉</sub> 为浸入时测力计示数）。</p>' +
          '<p><b>模型：</b>G = mg = P.model.weightN(' + M_STONE + ') = <b>' + G_STONE.toFixed(2) + ' N</b>（m = ' +
          (M_STONE * 1000) + ' g，g = ' + G + ' N/kg）。' +
          '石块取<b>规则柱体</b>：底面积 A = ' + A_STONE + ' cm²、高 H = ' + H_STONE + ' cm，故体积 V = ' + V_STONE + ' cm³，' +
          '便于由浸入几何直接算 V<sub>排</sub>。</p>' +
          '<p><b>操作：</b>溢水杯先<b>装满至溢水口</b>，空小桶放在溢水嘴下；石块由细线挂在测力计下、静止于空气中。</p>' +
          '<p><b>边界假设：</b>石块静止（受力平衡）、不碰杯壁杯底；水 ρ 均匀、g 取 ' + G + ' N/kg；忽略细线体积与表面张力。</p>',
        apply: function (s) { reset(s); },
        controls: [
          { type: 'btn', label: '缓慢浸入石块（至完全浸没）', onClick: function (s) { s._targetD = H_STONE; } }
        ],
        cam: { tx: -1, ty: 14, tz: 1, dist: 44, yaw: .24, pitch: .34 } },
      { name: '浸没', title: '浸没溢水杯，读 F拉',
        ask: '石块浸没时，为什么测力计示数变小了？',
        body: '<p><b>操作：</b>将石块<b>缓慢浸没</b>于装满水的溢水杯中（不碰杯壁杯底），读示数；排开的水经溢水嘴流入小桶。</p>' +
          '<p><b>模型：</b>浸入深度 d = ' + H_STONE + ' cm 时，V<sub>排</sub> = A·min(d, H) = ' + V_STONE + ' cm³；' +
          '<b>F<sub>浮</sub> = P.model.buoyancy(ρ<sub>水</sub>, V<sub>排</sub>) = ρ<sub>水</sub>gV<sub>排</sub> = ' +
          P.model.buoyancy(RHO_W, V_STONE).toFixed(2) + ' N</b>；' +
          '<b>F<sub>拉</sub> = G − F<sub>浮</sub> = ' + G_STONE.toFixed(2) + ' − ' +
          P.model.buoyancy(RHO_W, V_STONE).toFixed(2) + ' = ' + (G_STONE - P.model.buoyancy(RHO_W, V_STONE)).toFixed(2) + ' N</b>。</p>' +
          '<p><b>反例（加深）：</b>完全浸没后继续下沉到 d = ' + D_DEEP + ' cm（&gt; H），' +
          'V<sub>排</sub> 被 min(d,H) 封顶仍为 ' + V_STONE + ' cm³，故 <b>F<sub>浮</sub> 仍为 ' + P.model.buoyancy(RHO_W, V_STONE).toFixed(2) + ' N 不变</b>——' +
          '浮力与浸没深度<b>无关</b>。可点下方按钮对照读数。</p>' +
          '<p><b>边界：</b>V<sub>排</sub> 由规则柱体浸入几何算，忽略表面张力；溢水杯必须先装满，否则收集的水少于 V<sub>排</sub>。</p>',
        apply: function (s) { reset(s); s._d = H_STONE; s._targetD = H_STONE; },
        controls: [
          { type: 'btn', label: '浸没石块（d = 5 cm）', onClick: function (s) { s._targetD = H_STONE; } },
          { type: 'btn', label: '继续下沉加深（反例 d = 6.5 cm）', onClick: function (s) { s._targetD = D_DEEP; } },
          { type: 'btn', label: '取出石块', onClick: function (s) { s._targetD = 0; } }
        ],
        cam: { tx: -1, ty: 12, tz: 1, dist: 40, yaw: .22, pitch: .36 } },
      { name: '测排开', title: '称排开水重 G排',
        ask: 'G排 与 F浮 有什么关系？',
        body: '<p><b>操作：</b>测小桶 + 溢出水总重 G<sub>总</sub>，则 <b>G<sub>排</sub> = G<sub>总</sub> − G<sub>桶</sub></b>；' +
          '溢出的水体积等于 V<sub>排</sub>，桶内水面随之上升。</p>' +
          '<p><b>模型：</b>G<sub>排</sub> = ρ<sub>水</sub>gV<sub>排</sub> = ' + RHO_W + ' × ' + G + ' × ' + V_STONE + ' / 10⁶ = <b>' +
          (RHO_W * G * V_STONE / 1e6).toFixed(2) + ' N</b>；' +
          '而 F<sub>浮</sub> = P.model.buoyancy(ρ<sub>水</sub>, V<sub>排</sub>) = <b>' + P.model.buoyancy(RHO_W, V_STONE).toFixed(2) + ' N</b>。' +
          '两者是<b>同一个式子</b>，故 <b>F<sub>浮</sub> = G<sub>排</sub></b> 精确成立（右侧两列读数实时相等），这就是阿基米德原理。</p>' +
          '<p><b>易错点：</b>若溢水杯<b>未装满</b>，石块浸入时先要把液面抬到溢水口，收集到的溢出水少于 V<sub>排</sub>，' +
          '测得的 G<sub>排</sub> 偏小，会误以为 F<sub>浮</sub> ≠ G<sub>排</sub>。</p>',
        apply: function (s) { reset(s); s._d = H_STONE; s._targetD = H_STONE; },
        controls: [
          { type: 'btn', label: '称排开水重 G排（判定）', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: 0, ty: 12, tz: 0, dist: 44, yaw: .2, pitch: .34 } },
      { name: '结论', title: '归纳阿基米德原理',
        ask: '浮力大小与物体密度、浸没深度有关吗？',
        body: '<p><b>阿基米德原理：</b><b>F<sub>浮</sub> = G<sub>排</sub> = ρ<sub>液</sub>gV<sub>排</sub></b>——' +
          '浮力只与<b>液体密度</b>和<b>排开体积</b>有关，与物体密度、浸没深度<b>无关</b>。</p>' +
          '<p><b>反例复盘：</b>本步已把石块下沉到 d = ' + D_DEEP + ' cm（超过 H = ' + H_STONE + ' cm），' +
          'V<sub>排</sub> 封顶 ' + V_STONE + ' cm³，F<sub>浮</sub> 仍 = ' + P.model.buoyancy(RHO_W, V_STONE).toFixed(2) + ' N、' +
          'G<sub>排</sub> 仍 = ' + (RHO_W * G * V_STONE / 1e6).toFixed(2) + ' N；读数不变，直接证明与深度无关。</p>' +
          '<p><b>边界假设：</b>液体静止、ρ 均匀、g = ' + G + ' N/kg；物体不接触容器；V<sub>排</sub> 按规则柱体浸入几何算，' +
          '忽略细线体积、表面张力与水的压缩性。</p>' +
          '<p><b>拓展：</b>浮沉条件（ρ<sub>物</sub> 与 ρ<sub>液</sub> 比较）、轮船、密度计、潜水艇。</p>',
        apply: function (s) { reset(s); s._d = D_DEEP; s._targetD = D_DEEP; s.judged = true; },
        controls: [
          { type: 'btn', label: '回到完全浸没 d = 5 cm', onClick: function (s) { s._targetD = H_STONE; } },
          { type: 'btn', label: '继续加深 d = 6.5 cm（反例）', onClick: function (s) { s._targetD = D_DEEP; } },
          { type: 'btn', label: '判定 F浮 = G排', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: -1, ty: 13, tz: 0, dist: 48, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '称重法测浮力公式？', opts: ['F浮=G−F拉', 'F浮=G+F拉', 'F浮=G', 'F浮=F拉'], ans: 'F浮=G−F拉', why: '空气中重力减去浸没时示数，等于浮力。' },
        { q: '阿基米德原理核心是？', opts: ['F浮=G排', 'F浮=ρgh', 'F浮=G', 'F浮=mg'], ans: 'F浮=G排', why: '浮力等于排开液体所受的重力。' },
        { q: '浮力与什么无关？', opts: ['物体密度、浸没深度', '液体密度', '排开体积', '都有关'], ans: '物体密度、浸没深度', why: 'F浮=ρ液gV排，与物体密度和浸没深度无关。' },
        { q: '溢水杯未装满会导致？', opts: ['G排偏小', 'G排偏大', '无影响', '浮力变大'], ans: 'G排偏小', why: '未装满时石块浸没溢出的水少于实际排开量，G排偏小。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
