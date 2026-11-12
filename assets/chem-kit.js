/* 格物实验室 · 化学实验共用器材层（单一真源）
   ------------------------------------------------------------------
   GLB 生成器 (make_chem_glb.html) 与 10 门化学课件共用本文件，几何只写一次。
   契约（借鉴 Polyfork 的工程方法，但几何与材质全部自建，无外部资产）：
     1. 统一尺度：1 scene unit = 0.02 m；器材为可读性按 DISPLAY_GAIN 放大，
        元数据同时给真实米制 size_m 与场景尺寸 size_u，摆放只用 size_u。
     2. 原点：所有器材 rests on y=0、x/z 居中，place() 不需要包围盒计算。
     3. 元数据契约：每件器材发布 id/title/size_m/size_u/origin/palette/
        materials/namedParts/triangles/knobs，课件按名取件、按名驱动。
     4. 参数化：create(id, opts) 支持 scale / colorway / liquid / parts 等 knobs，
        返回 THREE.Group，userData.meta 携带该实例的完整契约。
     5. 材质键编进 mesh.name 前缀 "MAT_<key>__"，GLB 加载后按前缀精确升级 PBR
        （GLTFLoader 会丢 material.name 并漂移色号，name 才可靠）。
   用法：
     ChemKit.create('beaker', { liquid: .6 })        → THREE.Group
     ChemKit.place(obj, x, z)                        → 落在台面 y=0
     ChemKit.mountGLB(gltfScene)                     → 升级 GLB 材质 + 阴影
     ChemKit.dress(K.scene(), opts)                  → 背景布/试剂架/废液缸等陈设
     ChemKit.SPEC                                    → 元数据契约表
*/
(function (T) {
  'use strict';
  if (!T) { window.ChemKit = null; return; }
  var PI = Math.PI, TAU = PI * 2;

  /* ══════════════ 统一尺度契约 ══════════════ */
  var SCALE = {
    unit_m: 0.02,          // 1 scene unit = 2 cm
    display_gain: 1.8,     // 教学放大：小器材按此系数放大以便观察
    bench_y: 0,            // 台面高度，所有器材 rests on y=0
    up_axis: 'Y',
    origin: 'ground (minY = 0), centred on x/z',
    note: 'size_m 是真实器材尺寸；size_u 是场景尺寸 = size_m/unit_m*display_gain。' +
          ' 摆放一律用 size_u，讲解用 size_m。缩放请用 scale knob，不要事后 rescale。'
  };
  function u(meters) { return +(meters / SCALE.unit_m * SCALE.display_gain).toFixed(2); }
  function m(units) { return +(units * SCALE.unit_m / SCALE.display_gain).toFixed(3); }

  /* ══════════════ 统一色板（10 门课共用，避免各课自带一套颜色） ══════════════ */
  var PALETTE = {
    glass:  0xe8f2fa, glassRim: 0xdceaf4, frost: 0xb9c9d6,
    mark:   0x2d5c85, metal: 0xb3bcc6, metalDark: 0x6e7a85,
    rubber: 0x8d3a31, wick: 0xf2ecdd, charred: 0x2b231c,
    liquid: 0x8fc4d8, liquidDeep: 0x5fa8c6, paper: 0xf1ede2,
    salt:   0xfbfdff, mud: 0x5f4a30, eggshell: 0xe9e2d2,
    copper: 0xc08a4a, black: 0x2b3238, chalk: 0xf4f7fa
  };

  /* ══════════════ 材质表（PBR；玻璃走 transmission 真折射） ══════════════ */
  function buildMaterials(opts) {
    opts = opts || {};
    var transmission = opts.transmission !== false;
    var glass = new T.MeshPhysicalMaterial({
      color: 0xd2e4f0, metalness: 0, roughness: .055,
      side: T.DoubleSide, clearcoat: .9, clearcoatRoughness: .06,
      envMapIntensity: 1.25, specularIntensity: 1.0
    });
    if (transmission) {
      /* 真折射：不靠 opacity，浅背景也不会显示成白雾 */
      glass.transmission = .58;
      glass.thickness = .55;
      glass.ior = 1.46;
      glass.attenuationColor = new T.Color(0xbcdcea);
      glass.attenuationDistance = 9;
      glass.transparent = false;
      glass.opacity = 1;
      glass.depthWrite = true;
    } else {
      /* 后处理里半透明会被 SSAOPass 合成成白实心；禁用 SSAO 又整场过曝。
         唯一稳定路线：玻璃做不透明浅色 + 强清漆，形体靠轮廓线/口沿环/高光条。 */
      /* 完全照抄验收样板 candle-step 的玻璃配方，颜色按 12:52 定案的淡青蓝：
         纯白（0xf2f8fc）在亮台面/浅墙前对比度为零，会渲染成白色实心石膏罐。 */
      glass.color = new T.Color(0xa3cde6);
      glass.roughness = .05; glass.metalness = 0;
      glass.transparent = true; glass.opacity = .42;
      glass.side = T.DoubleSide; glass.depthWrite = false;
      glass.clearcoat = .7; glass.clearcoatRoughness = .08;
      glass.envMapIntensity = 1.8;
    }
    function std(c, metal, rough, extra) {
      return new T.MeshStandardMaterial(Object.assign({ color: c, metalness: metal, roughness: rough }, extra || {}));
    }
    var M = {
      glass: glass,
      rim: new T.MeshPhysicalMaterial({
        color: PALETTE.glassRim, metalness: 0, roughness: .07,
        side: T.DoubleSide, clearcoat: 1, clearcoatRoughness: .05,
        envMapIntensity: 1.35, transmission: transmission ? .55 : 0,
        thickness: .5, transparent: true, opacity: .62, depthWrite: false,
        color: PALETTE.glassRim
      }),
      /* 大口径缸（水槽/集气瓶）：双层壁 + 高 transmission 会自折射出竖条纹，
         改用低透射 + 实体底色的单壁观感材质。 */
      /* 大口径缸也走样板 M.glass 配方：半透明 + 高 clearcoat + fresnel 壳定形，
        不透明灰会让筒壁变成一块石膏。 */
      glassTank: new T.MeshPhysicalMaterial({
        color: 0xa3cde6, metalness: 0, roughness: .06,
        transparent: true, opacity: .26, side: T.DoubleSide, depthWrite: false,
        clearcoat: .75, clearcoatRoughness: .08, envMapIntensity: 1.5
      }),
      mark:   std(PALETTE.mark, 0, .6),
      frost:  std(PALETTE.frost, .05, .8),
      metal:  std(PALETTE.metal, .9, .28, { envMapIntensity: 1.25 }),
      metalD: std(PALETTE.metalDark, .85, .42),
      rubber: std(PALETTE.rubber, .04, .74),
      wick:   std(PALETTE.wick, 0, .92),
      char:   std(PALETTE.charred, 0, .95),
      cap:    std(PALETTE.rubber, .04, .72),
      paper:  std(PALETTE.paper, 0, .92, { side: T.DoubleSide }),
      /* 液体做不透明饱和色：transmission 玻璃会折射半透明体，只用不透明
         才能在透射后仍读出水位；顶面再用 liqTop 的亮色封口。 */
      /* 液体不参与 IBL 镜面反射：极亮环境会把淡青液柱洗成白色实心柱。
         关掉 envMapIntensity、颜色稍饱和，才能读出是液体而不是石膏。 */
      liquid: new T.MeshStandardMaterial({ color: 0x6fb4d0, roughness: .3,
        transparent: true, opacity: .6, side: T.DoubleSide, envMapIntensity: 0 }),
      liqTop: std(0x8fd0e8, 0, .12, { side: T.DoubleSide, envMapIntensity: 0 })
    };
    Object.keys(M).forEach(function (k) { M[k].name = 'CHEM_' + k; });
    return M;
  }
  /* 真实课件走 SSAO+Bloom 后处理：transmission 会被 RenderPass 吃掉，
     渲染成不透明灰白（已在 K.boot 管线里实测）。默认用后处理安全的
     opacity + 轮廓线 + 深色衬托方案；纯渲染环境可显式 buildMaterials({transmission:true})。 */
  var MAT = buildMaterials({ transmission: false });  /* 验收样板 candle-step 原配方 */

  /* ══════════════ 几何工具（共享实例，控制 GLB 体积） ══════════════ */
  var GEO = {};
  function cached(key, make) { if (!GEO[key]) GEO[key] = make(); return GEO[key]; }
  function lathe(pts, seg) {
    return new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg || 56);
  }
  function cyl(r1, r2, h, mat, seg, open) {
    return new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg || 28, 1, !!open), mat);
  }
  function torus(r, tube, mat, seg) {
    return new T.Mesh(new T.TorusGeometry(r, tube, 10, seg || 40), mat);
  }
  function named(n, o) { o.name = n; return o; }
  function put(parent, mesh, name, pos) {
    mesh.name = name;
    if (pos) mesh.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    var k = Object.keys(MAT).filter(function (key) { return MAT[key] === mesh.material; })[0];
    if (k) mesh.name = 'MAT_' + k + '__' + name;
    parent.add(mesh); return mesh;
  }
  function group(n) { return named(n, new T.Group()); }

  /* 样板 candle-step / K.glassCyl 的玻璃定形：fresnel 边缘光壳 + 细 LineLoop 口沿线。
     不用粗 Torus——粗环在浅背景上会发白、多圈叠加就是"重影"。 */
  var _fresMat = null;
  function fresMat() {
    if (_fresMat) return _fresMat;
    _fresMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uColor: { value: new T.Color(0x5f8ab0) }, uK: { value: 1.8 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV;' +
        'void main(){ vN = normalize(normalMatrix * normal);' +
        ' vec4 mv = modelViewMatrix * vec4(position,1.);' +
        ' vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uK;' +
        'void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.4);' +
        ' gl_FragColor = vec4(uColor, f * uK); }'
    });
    return _fresMat;
  }
  function ringLine(parent, y, r, op) {
    var pts = [], n = 64;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      pts.push(new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    var l = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color: 0x7d9db8, transparent: true, opacity: op || .62 }));
    parent.add(l); return l;
  }
  var _haloMat = null;
  function glassShell(mesh) {
    /* 样板 addFresnel 的两层：fresnel 边缘光 + BackSide 外扩光晕。
       少了光晕层，玻璃在浅背景上会彻底"隐形"、读不出形体。 */
    var sh = new T.Mesh(mesh.geometry, fresMat());
    sh.scale.setScalar(1.015);
    sh.castShadow = false; sh.receiveShadow = false;
    mesh.add(sh);
    if (!_haloMat) _haloMat = new T.MeshBasicMaterial({
      color: 0x6f9ec4, transparent: true, opacity: .26,
      side: T.BackSide, depthWrite: false
    });
    var halo = new T.Mesh(mesh.geometry, _haloMat);
    /* 外扩 1.035 会在瓶底/瓶口画出第二条平行轮廓，放大后读作「双层玻璃」。
       收紧到与 fresnel 壳几乎重合（A/B：双线合并成一条，玻璃形体不变）。 */
    halo.scale.setScalar(1.015 * 1.002);
    halo.castShadow = false; halo.receiveShadow = false;
    mesh.add(halo);
    return sh;
  }

  /* ══════════════ 器材工厂 ══════════════ */
  var BUILD = {};

  /* ① 烧杯 100mL：单层开放轮廓（外壁→卷口）+ 倾倒嘴 + 几何刻度 */
  BUILD.beaker = function (o) {
    var g = group('CHEM_BEAKER'), R = 3.0 * o.scale, H = 6.0 * o.scale, s = o.scale;
    var rIn = R - .16 * s;
    /* 单层壁：闭合 Lathe 回折出的内壁在半透明下会叠成「双层玻璃」。
       去掉底部中心段，底面用独立极淡圆片，不再读作白瓷盘。 */
    var p = [[R - .34 * s, .10 * s], [R - .10 * s, .13 * s], [R, .28 * s],
      [R, H - .30 * s], [R + .13 * s, H - .20 * s],
      [R + .15 * s, H - .04 * s], [R + .05 * s, H + .06 * s]];
    put(g, new T.Mesh(lathe(p, 64), MAT.glass), 'body');
    var bbase = put(g, new T.Mesh(new T.CircleGeometry(R - .34 * s, 48).rotateX(-PI / 2),
      new T.MeshBasicMaterial({ color: 0xb9d2e4, transparent: true, opacity: .10,
        side: T.DoubleSide, depthWrite: false })), 'base', [0, .11 * s, 0]);
    bbase.castShadow = false;
    var bead = torus(R + .075 * o.scale, .105 * o.scale, MAT.rim, 56);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, H + .01 * o.scale, 0]);
    /* 底沿不再画浅灰粗环：俯视下它会变成一整圈刺眼的亮白椭圆 */
    /* 倾倒嘴：真实烧杯只是杯口一个小尖嘴，不是一块大椭圆白片。
       缩小到约 1/3、用与杯身一致的淡青蓝，贴在杯口外缘。 */
    var spoutMat = new T.MeshPhysicalMaterial({ color: 0xa3cde6, roughness: .12,
      transparent: true, opacity: .35, side: T.DoubleSide, depthWrite: false,
      clearcoat: .3, envMapIntensity: .5 });
    var spout = new T.Mesh(new T.SphereGeometry(.24 * s, 14, 10), spoutMat);
    spout.scale.set(1.2, .3, .6);
    put(g, spout, 'spout', [0, H + .01 * s, R + .02 * s]);
    if (o.marks !== false) {
      /* 刻度按圆周参数化贴壁（与锥形瓶同一套）：
         旧写法 x=-R+…、z=R+.05 组合后半径约 1.14R，整条浮在杯外。 */
      var angB = .5, RB = R + .035 * s;
      /* 光有横线读不出体积，给主刻度补 mL 数字 */
      var numCache = {};
      function numTex(txt) {
        if (numCache[txt]) return numCache[txt];
        var cv = document.createElement('canvas'); cv.width = 160; cv.height = 80;
        var c = cv.getContext('2d');
        c.fillStyle = '#2d5c85'; c.font = 'bold 50px Arial, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, 80, 42);
        var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
        numCache[txt] = t; return t;
      }
      function addNum(txt, yy, off) {
        var lab = new T.Mesh(new T.PlaneGeometry(.92 * s, .46 * s),
          new T.MeshBasicMaterial({ map: numTex(txt), transparent: true,
            alphaTest: .12, depthWrite: false, side: T.DoubleSide }));
        lab.name = 'MAT_mark__num';
        lab.position.set(Math.sin(angB) * RB + Math.cos(angB) * off, yy * s,
          Math.cos(angB) * RB - Math.sin(angB) * off);
        lab.rotation.y = angB;
        lab.castShadow = false;
        g.add(lab);
      }
      [1.25, 2.15, 3.05, 3.95, 4.85, 5.62].forEach(function (yy, i) {
        var major = i % 2 === 0, len = (major ? 1.05 : .62) * s;
        var bar = new T.Mesh(cached('mk' + len, function () {
          return new T.BoxGeometry(len, .085 * s, .055 * s);
        }), MAT.mark);
        bar.name = 'MAT_mark__mark_' + i;
        bar.position.set(Math.sin(angB) * RB, yy * s, Math.cos(angB) * RB);
        bar.rotation.y = angB;
        g.add(bar);
        if (major) addNum(String((i / 2 + 1) * 50), yy, len / 2 + .62 * s);
      });
      addNum('mL', 5.92, .85 * s);
      var ax = new T.Mesh(new T.BoxGeometry(.085 * s, 4.55 * s, .055 * s), MAT.mark);
      ax.name = 'MAT_mark__mark_axis';
      ax.position.set(Math.sin(angB) * RB, 3.44 * s, Math.cos(angB) * RB);
      ax.rotation.y = angB;
      g.add(ax);
    }
    if (o.liquid > 0) {
      var lh = Math.min(H - .6 * o.scale, o.liquid * (H - .7 * o.scale));
      put(g, cyl(rIn - .06 * o.scale, rIn - .06 * o.scale, lh, MAT.liquid, 40),
        'liquid', [0, .3 * o.scale + lh / 2, 0]);
    }
    return g;
  };

  /* ② 锥形瓶 250mL：厚壁 + 卷口 + 磨砂颈环 + 肩部刻度 */
  BUILD.flask = function (o) {
    var g = group('CHEM_FLASK'), s = o.scale;
    /* 标准锥形瓶（Erlenmeyer）：平底 → 短直壁 → 一条直线斜壁收到细颈 → 短直颈 → 卷口。
       旧版用了 5 个中间点做圆弧肩，画成了奶瓶/圆底烧瓶，形状不合规。 */
    var R = 3.0 * s, neckR = 1.05 * s, H = 8.0 * s;
    var prof = [
      [R - .30 * s, .10 * s], [R, .34 * s],   /* 底面开放：中心段会让瓶底叠成白瓷盘 */
      [R, 1.15 * s],                 // 下段直壁
      [neckR + .25 * s, 6.05 * s],  // 一条直线斜肩（锥台）
      [neckR, 6.45 * s],            // 肩颈过渡
      [neckR, H - .30 * s],         // 直颈
      [neckR + .12 * s, H - .18 * s],
      [neckR + .13 * s, H - .03 * s],
      [neckR + .02 * s, H + .05 * s]
    ];
    /* 单层壁：不再回折出内壁。双层闭合轮廓在 opacity .3 下内外壁叠加
       正是"奶白色、没有玻璃质感"的根源。底部只用一个薄圆盘封口。 */
    put(g, new T.Mesh(lathe(prof, 56), MAT.glass), 'body');
    /* 底面用极淡的独立材质，不再和壁叠成奶白圆盘 */
    put(g, new T.Mesh(new T.CircleGeometry(R - .30 * s, 48).rotateX(-PI / 2),
      new T.MeshBasicMaterial({ color: 0xb9d2e4, transparent: true, opacity: .10,
        side: T.DoubleSide, depthWrite: false })), 'base', [0, .11 * s, 0]);
    var bead = torus(neckR + .07 * s, .085 * s, MAT.rim, 44);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, H + .02 * s, 0]);
    /* 磨砂颈环 + 刻度短线（贴在斜壁上，随半径收缩） */
    var frost = torus(neckR + .01 * s, .035 * s, MAT.frost, 40);
    frost.rotation.x = PI / 2; put(g, frost, 'neck_frost', [0, 7.3 * s, 0]);
    if (o.marks !== false) {
      /* 刻度贴合斜壁：斜壁是直线 (R,1.15s)→(neckR+.25s,6.05s)，
         每条刻度的壁半径由直线方程求出，bar 贴在壁外表面 z=r+.03 */
      var slY0 = 1.15 * s, slY1 = 6.05 * s;
      var slR0 = R, slR1 = neckR + .25 * s;
      [[1.9, 0], [3.0, 1], [4.1, 0], [5.2, 1]].forEach(function (mk, k) {
        var yy = mk[0] * s, t = (yy - slY0) / (slY1 - slY0);
        var rr = slR0 + (slR1 - slR0) * t;
        var len = (mk[1] ? .72 : .45) * s;
        /* 刻度必须落在半径 rr 的圆周上。旧写法 x=-rr*.88、z=rr+.035
           组合后实际半径约 1.36rr，整条刻度悬在瓶壁外面（放大像浮空）。 */
        var ang = .5, R2 = rr + .035 * s;
        var bar = new T.Mesh(cached('fmk' + k + '_' + s, function () {
          return new T.BoxGeometry(len, .06 * s, .04 * s);
        }), MAT.mark);
        bar.name = 'MAT_mark__mark_' + k;
        bar.position.set(Math.sin(ang) * R2, yy, Math.cos(ang) * R2);
        bar.rotation.y = ang;   /* 长边沿圆周切线，整条贴壁 */
        g.add(bar);
      });
    }
    if (o.liquid > 0) {
      /* 液柱顶半径按斜壁直线方程求，贴合瓶壁不穿出 */
      var lh = o.liquid * 3.9 * s;
      var yTop = .34 * s + lh;
      var rTop = R - (R - (neckR + .25 * s)) * (yTop - 1.15 * s) / (6.05 * s - 1.15 * s);
      put(g, new T.Mesh(new T.CylinderGeometry(Math.min(rTop, R - .2 * s), R - .25 * s, lh, 40),
        MAT.liquid, 40), 'liquid', [0, .16 * s + lh / 2, 0]);
    }
    return g;
  };

  /* ③ 酒精灯：扁球灯体（壁厚）+ 灯芯座 + 棉芯 + 焦头 + 旁置灯帽 + 酒精液面 */
  BUILD.lamp = function (o) {
    var g = group('CHEM_LAMP'), s = o.scale, H = 2.6 * s, R = 1.52 * s, w = .12 * s;
    var outer = [], N = 16;
    for (var i = 0; i <= N; i++) {
      var t = i / N, yy = (.08 + t * (H / s - .58)) * s;
      var rr = (.62 + (R / s - .62) * Math.sin(PI * Math.pow(t, .82)) * .96) * s;
      if (t > .78) rr *= 1 - (t - .78) * 1.15;
      outer.push([rr, yy]);
    }
    /* 单层壁：闭合轮廓回折出的内壁在半透明下会叠成双层玻璃 */
    var nR = outer[outer.length - 1][0];
    var prof = outer.concat([[nR + .10 * s, H - .50 * s], [nR + .11 * s, H - .40 * s],
      [nR, H - .33 * s]]);
    put(g, new T.Mesh(lathe(prof, 56), MAT.glass), 'body');
    /* 酒精液柱按扁球灯体内壁收成锥台，底半径收小，
       否则单层灯体下部会露出液柱（内径随高度变化，不是直筒） */
    put(g, cyl(1.29 * s, .75 * s, 1.02 * s, MAT.liquid, 40), 'alcohol', [0, .68 * s, 0]);
    put(g, cyl(.44 * s, .50 * s, .62 * s, MAT.metal, 28), 'collar', [0, H - .18 * s, 0]);
    var flange = torus(.50 * s, .075 * s, MAT.metalD, 32);
    flange.rotation.x = PI / 2; put(g, flange, 'collar_flange', [0, H - .48 * s, 0]);
    put(g, new T.Mesh(cached('ear' + s, function () {
      return new T.BoxGeometry(.30 * s, .12 * s, .46 * s);
    }), MAT.metalD), 'collar_ear', [.58 * s, H - .30 * s, 0]);
    put(g, cyl(.17 * s, .19 * s, .72 * s, MAT.wick, 18), 'wick', [0, H + .16 * s, 0]);
    var tip = new T.Mesh(new T.SphereGeometry(.19 * s, 14, 10), MAT.char);
    tip.scale.set(1, .72, 1); put(g, tip, 'wick_tip', [0, H + .52 * s, 0]);
    if (o.cap !== false) {
      var cap = group('CHEM_LAMP_CAP');
      put(cap, cyl(.62 * s, .66 * s, .74 * s, MAT.cap, 30), 'cap_body', [0, .37 * s, 0]);
      put(cap, cyl(.60 * s, .60 * s, .10 * s, MAT.cap, 30), 'cap_top', [0, .78 * s, 0]);
      put(cap, new T.Mesh(new T.SphereGeometry(.20 * s, 14, 10), MAT.cap), 'cap_knob', [0, .92 * s, 0]);
      var cr = torus(.62 * s, .055 * s, MAT.metalD, 30);
      cr.rotation.x = PI / 2; put(cap, cr, 'cap_ring', [0, .08 * s, 0]);
      cap.position.set(2.75 * s, 0, .25 * s);
      g.add(cap);
    }
    return g;
  };

  /* ④ 试管：厚壁 + 卷口 + 半球圆底 */
  BUILD.testTube = function (o) {
    var g = group('CHEM_TESTTUBE'), s = o.scale, R = 1.35 * s, H = 8.0 * s, w = .14 * s;
    /* 单层开放轮廓：保留厚圆底，去掉回折的内臂 */
    var p = [[0, 0], [R - .55 * s, 0], [R - .18 * s, .10 * s], [R, .55 * s],
      [R, H - .30 * s], [R + .11 * s, H - .20 * s], [R + .12 * s, H - .04 * s],
      [R + .02 * s, H + .05 * s]];
    put(g, new T.Mesh(lathe(p, 48), MAT.glass), 'body');
    var bead = torus(R + .06 * s, .085 * s, MAT.rim, 44);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, H + .01 * s, 0]);
    if (o.liquid > 0) {
      var lh = o.liquid * (H - 1.2 * s);
      put(g, cyl(R - w - .04 * s, R - w - .12 * s, lh, MAT.liquid, 32),
        'liquid', [0, .25 * s + lh / 2, 0]);
    }
    return g;
  };

  /* ⑤ 漏斗 + 滤纸（可拆）：玻璃漏斗 + 长颈 + 滤纸锥 */
  BUILD.funnel = function (o) {
    var g = group('CHEM_FUNNEL'), s = o.scale, R = 2.5 * s;
    /* 契约：minY = 0 落在漏斗颈末端；架到铁圈上时由课件整体抬高 */
    var inner = group('CHEM_FUNNEL_BODY');
    put(inner, new T.Mesh(new T.CylinderGeometry(R, .38 * s, 3.2 * s, 40, 1, true), MAT.glass),
      'body', [0, 1.6 * s + 3.6 * s, 0]);
    put(inner, new T.Mesh(new T.CylinderGeometry(.38 * s, .30 * s, 3.6 * s, 20, 1, true), MAT.glass),
      'stem', [0, 1.8 * s, 0]);
    var bead = torus(R, .075 * s, MAT.rim, 48);
    bead.rotation.x = PI / 2; put(inner, bead, 'rim_bead', [0, 6.8 * s, 0]);
    if (o.paper !== false) {
      var paper = group('CHEM_FILTER_PAPER');
      put(paper, new T.Mesh(new T.CylinderGeometry((R - .35 * s), .30 * s, 3.0 * s, 40, 1, true), MAT.paper),
        'paper_cone', [0, 1.7 * s + 3.6 * s, 0]);
      inner.add(paper);
    }
    g.add(inner);
    return g;
  };

  /* ⑥ 蒸发皿：浅碗 + 卷口 + 倾倒嘴 */
  BUILD.dish = function (o) {
    var g = group('CHEM_DISH'), s = o.scale;
    put(g, new T.Mesh(new T.CylinderGeometry(3.3 * s, 2.9 * s, 1.2 * s, 40, 1, true), MAT.glass),
      'body', [0, .6 * s, 0]);
    put(g, new T.Mesh(new T.CylinderGeometry(2.9 * s, 2.9 * s, .12 * s, 40), MAT.glass),
      'bottom', [0, .06 * s, 0]);
    var bead = torus(3.3 * s, .08 * s, MAT.rim, 48);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, 1.2 * s, 0]);
    if (o.liquid > 0) {
      put(g, cyl(3.0 * s, 2.95 * s, .4 * s * o.liquid, MAT.liquid, 40),
        'liquid', [0, .15 * s + .2 * s * o.liquid, 0]);
    }
    return g;
  };

  /* ⑦ 水槽（玻璃缸，带卷口） */
  BUILD.trough = function (o) {
    var g = group('CHEM_TROUGH'), s = o.scale, R = 6.0 * s, H = 4.0 * s;
    /* 单层壁：开放圆柱（无内壁），底面单独一片。
       双层闭合轮廓在 transmission 下内外壁互相折射会产生密集竖条纹。 */
    put(g, new T.Mesh(new T.CylinderGeometry(R, R, H, 56, 1, true), MAT.glassTank), 'wall');
    /* 口沿线由 outline() 的 ringLine 画一圈即可，这里不再叠 Torus 环
       （上版把环误放在 H/2 半腰，读作"刻度/光环不贴合"）。 */
    if (o.water > 0) {
      /* w 只属于烧杯/量筒的局部变量，这里原先误用会直接抛 ReferenceError，
         导致所有课件被迫传 water:0 —— 排水量气法的水槽里一直没有水。 */
      var wh = o.water * (H - .6 * s);
      var wy = .3 * s + wh;
      /* 水体贴住玻璃内壁：旧版 rW = R-.22 让水体的侧壁在玻璃里再画一层
         "内筒"，平视就是一只双层水槽。留 .05 只为避免与玻璃同半径打架。 */
      var rW = R - .05 * s;
      /* 水体：开放侧壁，不画实心顶盖。封闭圆柱的顶盖在俯视特写下
         就是一整块边缘锐利的蓝色圆盘，读作「塑料板」而不是水。 */
      var bodyMat = new T.MeshPhysicalMaterial({
        color: 0x63a9c6, roughness: .25, metalness: 0,
        transparent: true, opacity: .3, side: T.DoubleSide,
        depthWrite: false, envMapIntensity: .25
      });
      put(g, new T.Mesh(new T.CylinderGeometry(rW, rW, wh, 48, 1, true), bodyMat),
        'water_wall', [0, .3 * s + wh / 2, 0]);
      /* 水面：菲涅尔反射。正俯视几乎透明，掠射角才亮 —— 真实水面不会
         在俯视下变成一块不透明色板。 */
      var surfMat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide,
        uniforms: { uColor: { value: new T.Color(0x8fd0e8) }, uR: { value: rW } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
          'void main(){ vP = position; vN = normalize(normalMatrix * normal);' +
          ' vec4 mv = modelViewMatrix * vec4(position,1.);' +
          ' vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP;' +
          'uniform vec3 uColor; uniform float uR;' +
          'void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2);' +
          /* 盘缘淡出：掠射角下整片水面会压成一条硬直亮线，边缘不虚化
             就读作"水体里插了一块玻璃板"。 */
          ' float rr = length(vP.xz) / uR;' +
          ' float edge = 1. - smoothstep(.78, 1.0, rr);' +
          ' gl_FragColor = vec4(uColor, (.06 + .30 * f) * edge); }'
      });
      var surf = new T.Mesh(new T.CircleGeometry(rW - .02 * s, 48).rotateX(-PI / 2), surfMat);
      put(g, surf, 'water_surface', [0, wy, 0]);
      ringLine(g, wy, rW - .01 * s, .34);   /* 水位边缘细线，标出液面高度 */
    }
    return g;
  };

  /* ⑧ 集气瓶（广口 + 磨砂口 + 封底可选） */
  BUILD.gasJar = function (o) {
    var g = group('CHEM_GASJAR'), s = o.scale, R = 2.1 * s, H = 5.0 * s, w = .16 * s;
    /* 单层开放轮廓：闭合 Lathe 回折出的内壁在半透明下会叠成「双层玻璃」。
       底部由独立的极淡圆片封口（蛋壳课倒扣时另加有厚度的玻璃底盘）。 */
    var p = [[R - .3 * s, 0], [R, .3 * s], [R, H - .35 * s],
      [R + .12 * s, H - .22 * s], [R + .13 * s, H - .04 * s],
      [R + .02 * s, H + .05 * s]];
    put(g, new T.Mesh(lathe(p, 48), MAT.glass), 'body');
    /* 极淡底盖：无底盖时透射下瓶底是一个"浅蓝圆盘"悬浮观感 */
    put(g, new T.Mesh(new T.CircleGeometry(R - .3 * s, 44).rotateX(-PI / 2),
      new T.MeshBasicMaterial({ color: 0xb9d2e4, transparent: true, opacity: .10,
        side: T.DoubleSide, depthWrite: false })), 'base', [0, .04 * s, 0]);
    /* 集气瓶常倒置浸在水槽里，再画口沿环会与水槽口沿叠成"两个光环"；
       筒壁 + 卷口几何已足够定形，此处省略额外环。 */
    return g;
  };

  /* ⑨ 量筒：厚壁 + 底座 + 密集刻度 + 倾倒嘴 */
  BUILD.cylinder = function (o) {
    var g = group('CHEM_CYLINDER'), s = o.scale, R = 1.5 * s, H = 9.0 * s, w = .14 * s;
    /* 单层壁：保留实心底座，去掉回折的内臂（双层玻璃根源） */
    var p = [[0, 0], [2.1 * s, 0], [2.1 * s, .45 * s], [R, .7 * s],
      [R, H - .25 * s], [R + .1 * s, H - .15 * s], [R + .1 * s, H]];
    put(g, new T.Mesh(lathe(p, 48), MAT.glass), 'body');
    var bead = torus(R + .05 * s, .075 * s, MAT.rim, 44);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, H, 0]);
    if (o.marks !== false) {
      var angC = .5, RC = R + .035 * s;
      for (var k = 1; k <= 9; k++) {
        var major = k % 2 === 1;
        var bar = new T.Mesh(cached('cmk' + (major ? 'a' : 'b') + s, function () {
          return new T.BoxGeometry(major ? .9 * s : .55 * s, .06 * s, .05 * s);
        }), MAT.mark);
        bar.name = 'MAT_mark__mark_' + k;
        bar.position.set(Math.sin(angC) * RC, k * .88 * s, Math.cos(angC) * RC);
        bar.rotation.y = angC;
        g.add(bar);
      }
    }
    if (o.liquid > 0) {
      var lh = o.liquid * (H - 1.2 * s);
      put(g, cyl(R - w - .04 * s, R - w - .04 * s, lh, MAT.liquid, 40),
        'liquid', [0, .7 * s + lh / 2, 0]);
    }
    return g;
  };

  /* ⑩ 铁架台：底座 + 立杆 + 铁圈/横臂（可命名拆件） */
  BUILD.stand = function (o) {
    var g = group('CHEM_STAND'), s = o.scale, H = (o.height || 13) * s;
    put(g, new T.Mesh(cached('standbase' + s, function () {
      return new T.BoxGeometry(6 * s, .7 * s, 5.5 * s);
    }), MAT.metalD), 'base', [0, .35 * s, 0]);
    put(g, cyl(.35 * s, .35 * s, H, MAT.metal, 20), 'rod', [0, .7 * s + H / 2, 0]);
    if (o.ring !== false) {
      var ring = torus((o.ringR || 2.6) * s, .14 * s, MAT.metal, 36);
      ring.rotation.x = PI / 2;
      put(g, ring, 'iron_ring', [0, (o.ringY || 8.4) * s, 0]);
    }
    if (o.arm !== false) {
      put(g, new T.Mesh(cached('standarm' + s, function () {
        return new T.BoxGeometry(3.4 * s, .4 * s, .6 * s);
      }), MAT.metal), 'arm', [-1.7 * s, (o.armY || 8.4) * s, 1.9 * s]);
    }
    return g;
  };

  /* ⑪ 分液漏斗：梨形 + 活塞 + 长颈 + 顶塞 */
  BUILD.dropFunnel = function (o) {
    var g = group('CHEM_DROPFUNNEL'), s = o.scale;
    var p = [[0, 0], [.28 * s, 0], [.28 * s, 2.0 * s], [1.5 * s, 3.4 * s],
      [1.5 * s, 5.0 * s], [1.2 * s, 5.8 * s], [.75 * s, 6.2 * s], [.75 * s, 7.0 * s], [0, 7.0 * s]];
    put(g, new T.Mesh(lathe(p, 48), MAT.glass), 'body');
    var bead = torus(1.5 * s, .09 * s, MAT.rim, 44);
    bead.rotation.x = PI / 2; put(g, bead, 'rim_bead', [0, 5.0 * s, 0]);
    var stop = torus(.35 * s, .1 * s, MAT.metal, 20);
    stop.rotation.x = PI / 2; put(g, stop, 'stopcock', [0, 1.9 * s, 0]);
    put(g, cyl(.78 * s, .78 * s, .5 * s, MAT.frost, 24), 'stopper', [0, 7.15 * s, 0]);
    return g;
  };

  /* ⑫ 玻璃棒 */
  BUILD.rod = function (o) {
    var g = group('CHEM_ROD'), s = o.scale, L = (o.length || 6.2) * s;
    /* 契约：minY = 0（棒竖立时底端落地）；斜插时由课件旋转并重新定位 */
    put(g, new T.Mesh(new T.CylinderGeometry(.15 * s, .15 * s, L, 14), MAT.glass),
      'rod', [0, L / 2, 0]);
    return g;
  };

  /* 双层壁玻璃在 transmission 下内外壁互相折射会发白/起条纹。
     把闭合轮廓 Lathe 的「内壁段」单独拆出来，用 FrontSide 单壁材质绘制，
     外壁仍走 transmission；两者不再在同一几何里互相采样。 */
  function splitDoubleWall(obj) {
    obj.traverse(function (n) {
      if (!n.isMesh || !n.geometry || !n.geometry.type || n.geometry.type !== 'LatheGeometry') return;
      if (n.userData.__split) return;
      n.userData.__split = true;
      /* Lathe 的轮廓点按顺序成对：前半是外壁，后半是内壁。
         把内壁三角面剔除，仅保留外壁；内壁改用一层极淡的独立内衬。 */
      var g = n.geometry, pos = g.attributes.position;
      if (!pos || !g.index) return;
      var arr = g.index.array, keep = [], N = arr.length;
      /* 依据法线方向判断：外壁法线朝外(+r)，内壁法线朝内(-r)。 */
      var nor = g.attributes.normal;
      for (var i = 0; i < N; i += 3) {
        var i0 = arr[i], i1 = arr[i + 1], i2 = arr[i + 2];
        var nx = 0, ny = 0, nz = 0;
        if (nor) {
          nx = (nor.getX(i0) + nor.getX(i1) + nor.getX(i2)) / 3;
          nz = (nor.getZ(i0) + nor.getZ(i1) + nor.getZ(i2)) / 3;
        }
        var px = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
        var pz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
        var radial = Math.sqrt(px * px + pz * pz) || 1;
        var outward = (nx * px + nz * pz) / radial;
        if (outward >= -0.02) keep.push(arr[i], arr[i + 1], arr[i + 2]);
      }
      if (keep.length && keep.length < N) {
        var g2 = g.clone();
        g2.setIndex(keep);
        n.geometry = g2;
      }
    });
    return obj;
  }

  /* ══════════════ 元数据契约表 ══════════════ */
  var SPEC = {
    beaker:   { title: '烧杯 100 mL', size_m: [.055, .072, .055], size_u: [6, 6, 6], triangles: 780,
                rim: { y: 6.0, r: 3.0 },
                materials: ['glass', 'rim', 'frost', 'mark', 'liquid'],
                namedParts: ['rim_bead', 'spout', 'mark_axis', 'liquid'],
                knobs: { scale: 1, liquid: 0, marks: true } },
    flask:    { title: '锥形瓶 250 mL', size_m: [.085, .14, .085], size_u: [6, 8, 6], triangles: 900,
                rim: { y: 8.0, r: 1.2 },
                materials: ['glass', 'rim', 'frost', 'mark', 'liquid'],
                namedParts: ['rim_bead', 'neck_frost', 'liquid'],
                knobs: { scale: 1, liquid: 0, marks: true } },
    lamp:     { title: '酒精灯', size_m: [.09, .13, .09], size_u: [4.5, 2.6, 3], triangles: 1100,
                rim: { y: 2.6, r: .5 },
                materials: ['glass', 'metal', 'metalD', 'wick', 'char', 'cap', 'liquid'],
                namedParts: ['CHEM_LAMP_CAP', 'collar', 'wick', 'wick_tip', 'alcohol'],
                knobs: { scale: 1, cap: true } },
    testTube: { title: '试管 20×200 mm', size_m: [.02, .20, .02], size_u: [2.7, 8, 2.7], triangles: 600,
                rim: { y: 8.0, r: 1.35 },
                materials: ['glass', 'rim', 'liquid'], namedParts: ['rim_bead', 'liquid'],
                knobs: { scale: 1, liquid: 0 } },
    funnel:   { title: '玻璃漏斗 + 滤纸', size_m: [.07, .12, .07], size_u: [5, 6.8, 5], triangles: 700,
                rim: { y: 6.8, r: 2.5 },
                materials: ['glass', 'rim', 'paper'], namedParts: ['CHEM_FILTER_PAPER', 'stem', 'rim_bead'],
                knobs: { scale: 1, paper: true } },
    dish:     { title: '蒸发皿 90 mm', size_m: [.09, .035, .09], size_u: [6.6, 1.2, 6.6], triangles: 480,
                rim: { y: 1.2, r: 3.3 },
                materials: ['glass', 'rim', 'liquid'], namedParts: ['rim_bead', 'liquid'],
                knobs: { scale: 1, liquid: 0 } },
    trough:   { title: '水槽', size_m: [.24, .08, .24], size_u: [12, 4, 12], triangles: 700,
                rim: { y: 4.0, r: 6.0 },
                materials: ['glass', 'rim', 'liquid'], namedParts: ['rim_bead', 'water'],
                knobs: { scale: 1, water: 0 } },
    gasJar:   { title: '集气瓶 250 mL', size_m: [.06, .13, .06], size_u: [4.2, 5, 4.2], triangles: 620,
                rim: { y: 5.0, r: 2.1 },
                materials: ['glass', 'rim'], namedParts: ['rim_bead'],
                knobs: { scale: 1, closedTop: false } },
    cylinder: { title: '量筒 50 mL', size_m: [.028, .20, .028], size_u: [4.2, 9, 4.2], triangles: 900,
                rim: { y: 9.0, r: 1.5 },
                materials: ['glass', 'rim', 'mark', 'liquid'],
                namedParts: ['rim_bead', 'liquid', 'mark_1', 'mark_5', 'mark_9'],
                knobs: { scale: 1, liquid: 0, marks: true } },
    stand:    { title: '铁架台', size_m: [.20, .40, .18], size_u: [6, 13, 5.5], triangles: 420,
                materials: ['metal', 'metalD'], namedParts: ['base', 'rod', 'iron_ring', 'arm'],
                knobs: { scale: 1, height: 13, ring: true, arm: true, ringR: 2.6, ringY: 8.4, armY: 8.4 } },
    dropFunnel: { title: '分液漏斗', size_m: [.06, .20, .06], size_u: [3, 7, 3], triangles: 620,
                rim: { y: 7.0, r: .75 },
                materials: ['glass', 'rim', 'metal', 'frost'],
                namedParts: ['stopcock', 'stopper', 'rim_bead'],
                knobs: { scale: 1 } },
    rod:      { title: '玻璃棒', size_m: [.007, .30, .007], size_u: [.3, 6.2, .3], triangles: 60,
                materials: ['glass'], namedParts: ['rod'], knobs: { scale: 1, length: 6.2 } }
  };
  Object.keys(SPEC).forEach(function (id) {
    var s = SPEC[id];
    s.id = id; s.origin = SCALE.origin; s.palette = PALETTE;
    s.unit_m = SCALE.unit_m; s.display_gain = SCALE.display_gain;
  });

  /* ══════════════ 玻璃定形三件套（浅背景玻璃靠轮廓，不靠调白） ══════════════ */
  var EDGE = new T.LineBasicMaterial({ color: 0x4f7595, transparent: true, opacity: .85 });
  var _hiTex = null;
  function hiTex() {
    if (_hiTex) return _hiTex;
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 256;
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(.5, 'rgba(255,255,255,.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 256);
    _hiTex = new T.CanvasTexture(cv); return _hiTex;
  }
  /* 给器材补：口沿/底沿环 + 竖向母线 + 柔高光条。
     半径与高度从该器材的 size_u 契约推算，课件不需要手填坐标。 */
  function outline(obj, id) {
    var spec = SPEC[id]; if (!spec) return obj;
    var s = (obj.userData.meta && obj.userData.meta.instanceOpts || {}).scale || 1;
    /* 口沿半径/高度由几何定义显式发布在 SPEC.rim，不靠包围盒反推 */
    var box = new T.Box3().setFromObject(obj);
    var rim = spec.rim || { y: spec.size_u[1], r: Math.min(spec.size_u[0], spec.size_u[2]) / 2 };
    var H = rim.y * s;
    var R = Math.max((box.max.x - box.min.x), (box.max.z - box.min.z)) / 2;
    var topR = rim.r * s;
    var g = new T.Group(); g.name = 'CHEM_OUTLINE_' + id.toUpperCase();
    g.position.y = box.min.y;   // 抵消 create() 的归零偏移
    function ring(y, r, op) {
      var t = new T.Mesh(new T.TorusGeometry(r, .05 * s, 8, 44),
        new T.MeshBasicMaterial({ color: 0x4f7595, transparent: true, opacity: op || .8 }));
      t.rotation.x = PI / 2; t.position.y = y; g.add(t);
    }
    /* 只画一圈细口沿线（样板 ringLine 做法），不画粗 Torus、不画底沿环 */
    ringLine(g, H, topR, .72);
    var hi = new T.Mesh(new T.PlaneGeometry(Math.max(.4, R * .45), H * .6),
      new T.MeshBasicMaterial({ map: hiTex(), transparent: true, opacity: .10,
        depthWrite: false, blending: T.AdditiveBlending }));
    hi.position.set(-R * .45, H * .5, R * .6);
    hi.renderOrder = 4; g.add(hi);
    obj.add(g);
    obj.userData.outline = g;
    return obj;
  }
  /* 只给透明观感类器材加轮廓（铁架台/玻璃棒等不需要） */
  var OUTLINE_IDS = { beaker:1, flask:1, testTube:1, funnel:1, dish:1,
                      trough:1, gasJar:1, cylinder:1, dropFunnel:1, lamp:1 };

  /* ══════════════ 参数化工厂 ══════════════ */
  function create(id, opts) {
    var spec = SPEC[id];
    if (!spec || !BUILD[id]) throw new Error('ChemKit: unknown asset "' + id + '"');
    var o = Object.assign({}, spec.knobs, opts || {});
    var built = BUILD[id](o);
    /* 原点契约兜底：包一层把内容抬到 minY=0，place() 才能直接给地面点 */
    var box = new T.Box3().setFromObject(built);
    var g = built;
    if (Math.abs(box.min.y) > 1e-3) {
      g = new T.Group(); g.name = built.name;
      built.name = built.name + '_INNER';
      built.position.y -= box.min.y;
      g.add(built);
    }
    g.userData.meta = Object.assign({}, spec, { instanceOpts: o });
    g.traverse(function (n) {
      if (!n.isMesh) return;
      /* 菲涅尔水面是 ShaderMaterial 透明面，投影会在台面糊出一块假阴影 */
      if (n.material && n.material.type === 'ShaderMaterial') {
        n.castShadow = false; n.receiveShadow = false; return;
      }
      /* mL 数字这类带贴图的透明贴片不投影，否则 shadow map 会投出矩形黑块 */
      if (n.material && n.material.type === 'MeshBasicMaterial' &&
          n.material.map && n.material.transparent) {
        n.castShadow = false; n.receiveShadow = false; return;
      }
      var isGlass = /^MAT_(glass|rim|liquid)__/.test(n.name || '');
      if (!isGlass) { n.castShadow = true; n.receiveShadow = true; }
    });
    if (OUTLINE_IDS[id] && o.outline !== false) outline(g, id);
    /* 粗 Torus 口沿环在浅背景发白、多圈叠加成重影 → 隐藏，只留细线与 fresnel */
    g.traverse(function (n) {
      if (n.name && n.name.indexOf('MAT_rim__rim_bead') === 0) n.visible = false;
      if (n.isMesh && (n.material === MAT.glass || n.material === MAT.glassTank)) glassShell(n);
    });
    return g;
  }

  /* ── 液位表现 ──
     后处理里玻璃只能做不透明，内部液柱会被挡住；因此在器壁外贴一条
     「液位环 + 下方淡色带」，液位变化由 sync() 驱动，教学读数不丢。 */
  var LIQ_LEVEL = { beaker: 5.3, flask: 4.0, testTube: 7.0,
                    cylinder: 8.0, dish: 1.0, trough: 3.4, gasJar: 4.4 };
  function liquidBand(obj, id, level) {
    var spec = SPEC[id]; if (!spec) return null;
    var s = (obj.userData.meta && obj.userData.meta.instanceOpts || {}).scale || 1;
    var maxY = (LIQ_LEVEL[id] || spec.size_u[1] * .85) * s;
    var R = Math.min(spec.size_u[0], spec.size_u[2]) / 2 * s;
    var g = new T.Group(); g.name = 'CHEM_LIQ_' + id.toUpperCase();
    var band = new T.Mesh(new T.CylinderGeometry(R + .035, R + .035, 1, 40, 1, true),
      new T.MeshBasicMaterial({ color: 0x6fa8c6, transparent: true, opacity: .20,
        side: T.DoubleSide, depthWrite: false }));
    band.name = 'liq_band'; g.add(band);
    var ring = new T.Mesh(new T.TorusGeometry(R + .045, .055, 8, 44),
      new T.MeshBasicMaterial({ color: 0x3f83ac, transparent: true, opacity: .85 }));
    ring.rotation.x = PI / 2; ring.name = 'liq_ring'; g.add(ring);
    g.userData = { maxY: maxY, level: 0 };
    obj.add(g);
    obj.userData.liquidBand = g;
    setLiquid(obj, level || 0);
    return g;
  }
  function setLiquid(obj, v) {
    var g = obj.userData && obj.userData.liquidBand;
    if (!g) return;
    v = Math.max(0, Math.min(1, v));
    g.userData.level = v;
    var h = Math.max(.001, v * g.userData.maxY);
    var band = g.getObjectByName('liq_band');
    var ring = g.getObjectByName('liq_ring');
    if (band) { band.scale.y = h; band.position.y = h / 2; }
    if (ring) ring.position.y = h;
    g.visible = v > .001;
  }

  /* ── 覆盖式接入（保留原课件动画逻辑） ──
     plan: { hide:['O.beakerA',...], add:[{id, x, z, opts, liquid:'stateKey'}] }
     hide 按 O 的键名隐藏旧 primitive；新增高模挂到 O.ck 并由 sync(state) 驱动液位。 */
  function retrofit(O, scene, plan) {
    var C = window.ChemKit;
    /* 自动装光照/后处理修正：延迟到首帧之后（composer 此时已创建），
       课件无需改 update；10 门课统一生效。 */
    if (!window.__ckFixInstalled) {
      window.__ckFixInstalled = true;
      var tries = 0;
      (function wait() {
        if (C.fixPostfx({}) || ++tries > 90) return;
        requestAnimationFrame(wait);
      })();
    }
    (plan.hide || []).forEach(function (k) { if (O[k]) O[k].visible = false; });
    O.ck = O.ck || [];
    (plan.add || []).forEach(function (a) {
      var opts = Object.assign({}, a.opts || {});
      /* 数字型 liquid 要同时生成真实内部液柱（玻璃现在是透明的，看得见）；
         字符串型是 state key，交给 sync() 动态驱动液位环。 */
      if (typeof a.liquid === 'number') opts.liquid = a.liquid;
      var o = C.create(a.id, opts);
      C.place(o, a.x, a.z, a.y || 0);
      if (a.liquid !== undefined) {
        liquidBand(o, a.id, typeof a.liquid === 'number' ? a.liquid : 0);
        o.userData.liquidKey = (typeof a.liquid === 'string') ? a.liquid : null;
      }
      if (a.scaleTo) o.scale.setScalar(a.scaleTo);
      scene.add(o);
      O.ck.push(o);
    });
    return O.ck;
  }
  function sync(O, state) {
    (O.ck || []).forEach(function (o) {
      var k = o.userData.liquidKey;
      if (k && state && typeof state[k] === 'number') setLiquid(o, state[k]);
    });
  }

  /* 落到台面 y=0，x/z 即地面点（契约保证 minY=0） */
  function place(obj, x, z, y) {
    obj.position.set(x || 0, y || 0, z || 0);
    return obj;
  }

  /* GLB 加载后按 MAT_ 前缀升级材质 + 阴影（供走 GLB 路径的课件用） */
  function mountGLB(scene, materials) {
    var M = materials || MAT;
    scene.traverse(function (o) {
      if (!o.isMesh) return;
      var m = /^MAT_([a-zA-Z]+)__/.exec(o.name || '');
      if (m && M[m[1]]) o.material = M[m[1]];
      if (!/^MAT_(glass|rim|liquid)__/.test(o.name || '')) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    return scene;
  }

  function getPart(obj, name) { return obj.getObjectByName(name); }

  /* ══════════════ 场景陈设（老课件有、新 4 门缺的"实验室生活痕迹"） ══════════════
     统一背景布 + 试剂瓶架 + 废液缸 + 抹布 + 火柴盒，全部 rests on y=0 */
  function dress(scene, opts) {
    opts = opts || {};
    var g = group('CHEM_DRESS'), K = window.Lab;
    var backdrop = opts.backdrop === true;  /* 默认关闭：斜视角下会变成一块立着的玻璃板 */
    if (backdrop) {
      var cv = document.createElement('canvas');
      cv.width = 512; cv.height = 512;
      var c = cv.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
      var rg = c.createRadialGradient(256, 256, 40, 256, 256, 410);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(.62, '#c0c0c0'); rg.addColorStop(1, '#000000');
      c.fillStyle = rg; c.fillRect(0, 0, 512, 512);
      var tex = new T.CanvasTexture(cv);
      var cloth = new T.Mesh(new T.PlaneGeometry(30, 15),
        new T.MeshBasicMaterial({ color: 0x5c6a72, alphaMap: tex, transparent: true,
          opacity: .42, depthWrite: false, side: T.DoubleSide }));
      cloth.position.set(0, 6, -12); g.add(cloth);
    }
    /* 试剂瓶：细颈磨口瓶（瓶肩 + 玻璃塞 + 纸质标签），不是圆柱+色带 */
    if (opts.reagents !== false) {
      var bx = opts.reagentX === undefined ? -19 : opts.reagentX;
      var bz = opts.reagentZ === undefined ? -4.5 : opts.reagentZ;
      var labelTex = (function () {
        var cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
        var c = cv.getContext('2d');
        c.fillStyle = '#f3efe2'; c.fillRect(0, 0, 128, 64);
        c.fillStyle = '#b9b09a'; c.fillRect(0, 0, 128, 5); c.fillRect(0, 59, 128, 5);
        c.strokeStyle = '#5c6b78'; c.lineWidth = 2;
        for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(14, 20 + i * 9); c.lineTo(108 - (i % 2) * 26, 20 + i * 9); c.stroke(); }
        return new T.CanvasTexture(cv);
      })();
      [0, 1, 2].forEach(function (k) {
        var bot = group('CHEM_REAGENT_' + k);
        var bodyPts = [[0, 0], [.78, 0], [.86, .12], [.86, 1.9], [.72, 2.35], [.38, 2.7], [.38, 3.15]];
        var body = new T.Mesh(lathe(bodyPts, 28), MAT.frost);
        body.castShadow = true; bot.add(body);
        /* 磨口玻璃塞（不是橡皮柱）：倒锥 + 扁顶 */
        var stopper = new T.Mesh(new T.CylinderGeometry(.30, .42, .42, 20), MAT.rim);
        stopper.position.y = 3.32; bot.add(stopper);
        var knob = new T.Mesh(new T.CylinderGeometry(.42, .34, .22, 20), MAT.rim);
        knob.position.y = 3.62; bot.add(knob);
        /* 纸质标签（带文字线） */
        var lab = new T.Mesh(new T.CylinderGeometry(.875, .875, 1.05, 28, 1, true),
          new T.MeshStandardMaterial({ map: labelTex, roughness: .95, side: T.DoubleSide }));
        lab.position.y = 1.18; bot.add(lab);
        bot.position.set(bx + k * 2.15, 0, bz);
        g.add(bot);
      });
    }
    /* 废液缸：带内胆、卷边、提耳的搪瓷缸，不是开口圆筒 */
    if (opts.waste !== false) {
      var wx = opts.wasteX === undefined ? 19 : opts.wasteX;
      var wz = opts.wasteZ === undefined ? -4 : opts.wasteZ;
      var outer = new T.Mesh(new T.CylinderGeometry(1.5, 1.32, 2.3, 32, 1, true),
        new T.MeshStandardMaterial({ color: 0x5c666f, roughness: .5, metalness: .45,
          side: T.DoubleSide, envMapIntensity: .9 }));
      outer.position.set(wx, 1.15, wz); outer.castShadow = true; g.add(outer);
      var inner = new T.Mesh(new T.CylinderGeometry(1.36, 1.22, 2.1, 32, 1, true),
        new T.MeshStandardMaterial({ color: 0x2b333a, roughness: .85, side: T.BackSide }));
      inner.position.set(wx, 1.2, wz); g.add(inner);
      var bottom = new T.Mesh(new T.CircleGeometry(1.3, 32).rotateX(-PI / 2), outer.material);
      bottom.position.set(wx, .06, wz); g.add(bottom);
      var lip = torus(1.5, .085, MAT.metal, 36);
      lip.rotation.x = PI / 2; lip.position.set(wx, 2.3, wz); g.add(lip);
      /* 提耳：两侧小环 */
      [-1, 1].forEach(function (sg) {
        var ear = torus(.32, .07, MAT.metal, 20);
        ear.position.set(wx + sg * 1.5, 1.75, wz);
        ear.rotation.y = PI / 2; g.add(ear);
      });
    }
    /* 台面小件：火柴盒、玻璃棒、标签纸、抹布角 —— 让桌面像正在做实验，
       而不是器材列队展示（验收样板 candle 的做法）。 */
    if (opts.props === true) {
      var px = opts.propsX === undefined ? -4 : opts.propsX;
      var pz = opts.propsZ === undefined ? 5.2 : opts.propsZ;
      var match = new T.Mesh(cached('matchbox', function () {
        return new T.BoxGeometry(2.2, .34, 1.3);
      }), new T.MeshStandardMaterial({ color: 0xd4483b, metalness: .02, roughness: .78 }));
      match.position.set(px, .17, pz); match.rotation.y = .22;
      match.castShadow = true; g.add(match);
      var stripe = new T.Mesh(cached('matchStripe', function () {
        return new T.BoxGeometry(2.24, .02, .34);
      }), new T.MeshStandardMaterial({ color: 0xf0b429, metalness: .02, roughness: .8 }));
      stripe.position.set(px, .35, pz); stripe.rotation.y = .22; g.add(stripe);
      /* 一支火柴梗斜放在盒旁 */
      var stick = new T.Mesh(cached('matchStick', function () {
        return new T.BoxGeometry(2.6, .10, .10);
      }), new T.MeshStandardMaterial({ color: 0xd9cdb4, metalness: 0, roughness: .9 }));
      stick.position.set(px + 2.6, .06, pz + .5); stick.rotation.y = -.34;
      stick.castShadow = true; g.add(stick);
      /* 玻璃棒横放 */
      var rod = new T.Mesh(cached('glassRod', function () {
        return new T.CylinderGeometry(.11, .11, 4.2, 12);
      }), MAT.glass);
      rod.rotation.z = PI / 2; rod.rotation.y = .18;
      rod.position.set(px + 6.4, .12, pz - .3); g.add(rod);
      /* 标签纸（带手写感的浅色小片） */
      var note = new T.Mesh(cached('labelNote', function () {
        return new T.BoxGeometry(1.8, .04, 1.1);
      }), new T.MeshStandardMaterial({ color: 0xf4f1e6, metalness: 0, roughness: .94 }));
      note.position.set(px + 9.5, .03, pz + .4); note.rotation.y = -.28; g.add(note);
    }
    if (K && K.blob) {
      if (opts.reagents !== false) K.blob({ x: bx + 2.2, z: bz, r: 4, y: .02 });
      if (opts.waste !== false) K.blob({ x: wx, z: wz, r: 2.4, y: .02 });
    }
    scene.add(g);
    return g;
  }

  /* 后处理修正：SSAOPass 兼任主 RenderPass 时，透明玻璃会被合成为不透明灰白。
     补一个真正的 RenderPass 后禁用 SSAOPass（bloom/终合保留），透明才正常。
     10 门课统一在 update 早期调用一次；重复调用由 state 标记挡掉。 */
  function fixPostfx(state) {
    var D = window.__labDebug;
    if (!D || !D.composer || !window.THREE.RenderPass) return false;
    if (state && state.__ckPostfx) return true;
    /* 三件套必须一起做，缺一就"阴间"：
       ① 收一档全局光（否则禁用 SSAO 后整场过曝发白，玻璃变白雾）
       ② 补真正的 RenderPass（SSAOPass 兼任主渲染通道，直接禁会停渲染）
       ③ 禁用 SSAOPass（它会把 transmission/半透明合成成不透明灰白）
       验收样板 candle-step 就是这么做的。 */
    D.scene.traverse(function (o) {
      if (o.isHemisphereLight) o.intensity *= .78;
      else if (o.isDirectionalLight) o.intensity *= .86;
    });
    var cp = D.composer;
    cp.passes.unshift(new window.THREE.RenderPass(D.scene, D.camera));
    cp.passes.forEach(function (p) {
      if (p.kernelRadius !== undefined) p.enabled = false;
    });
    /* 禁用 SSAO 后少了暗部压制，原 bloom/.38 + exposure/.9 会整幅发白。
       压到样板能接受的亮度区间（实测对照 candle-step）。 */
    cp.passes.forEach(function (p) {
      if (p.constructor && p.constructor.name === 'UnrealBloomPass') {
        p.strength = .22; p.threshold = 1.25;
      }
      if (p.uniforms && p.uniforms.uExposure) p.uniforms.uExposure.value = .76;
    });
    /* 后处理禁用 SSAO 后，envRoom 的窗玻璃片（opacity .2 + envMap 1.5）
       叠在天空贴图上会变成一片白，读作"贴纸"。压到极淡只留窗外天色。 */
    D.scene.traverse(function (o) {
      if (!o.isMesh || !o.geometry || o.geometry.type !== 'PlaneGeometry') return;
      var m = o.material;
      if (m && m.isMeshPhysicalMaterial && m.transparent && m.opacity <= .25 &&
          o.geometry.parameters && o.geometry.parameters.width > 9) {
        m.opacity = .06; m.envMapIntensity = .25; m.needsUpdate = true;
      }
    });
    if (state) state.__ckPostfx = true;
    return true;
  }

  /* 台面统一为深色哑光（K.bench 的清漆在掠射角会反成浅银） */
  function matteBench(scene) {
    /* 样板 candle-step 的 K.bench 台面本身就是银灰金属拉丝带反光，
       不要 clearcoat=0 / roughness=.78 把它掐成死黑哑光（阴间感主因）。 */
    return scene;
  }

  window.ChemKit = {
    version: '1.0.0',
    SCALE: SCALE, PALETTE: PALETTE, SPEC: SPEC, MAT: MAT,
    u: u, m: m,
    buildMaterials: buildMaterials,
    create: create, place: place, getPart: getPart,
    mountGLB: mountGLB, dress: dress, matteBench: matteBench, fixPostfx: fixPostfx,
    outline: outline, EDGE: EDGE, splitDoubleWall: splitDoubleWall,
    liquidBand: liquidBand, setLiquid: setLiquid, retrofit: retrofit, sync: sync,
    /* 备料位约定：所有器材一开始就摆在桌面，用到才移过去（老课件做法） */
    HOME: {
      reagent: [-19, 0, -4.5], waste: [19, 0, -4],
      stand: [-11, 0, 3], trough: [9, 0, 1], lamp: [-14, 0, 3]
    }
  };
})(window.THREE);
