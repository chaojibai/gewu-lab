/* 格物实验室 · 水的天然循环（鲁教版九年级上册 · 第二单元 探秘水世界 · 水分子的运动） */
(function () {
  'use strict';
  var T = window.THREE, K = window.Lab;

  /* 状态：每个 f 都是一条"这一环亮不亮"的权重，0~1，由 goStep 自动补间 */
  var st = {
    fEvap: 0, fVapor: 0, fCloud: 0, fRain: 0, fRun: 0, fGround: 0, fMicro: 0,
    snow: 0, stage: 0, t: 0
  };
  var O = {};

  /* ---------------- 地块参数 ---------------- */
  var X0 = -46, X1 = 46, Z0 = -34, Z1 = 34, DEPTH = 20;
  var SEA_X = 6, SEA_Y = 3.2, SEA_BOT = -3.0;

  /* ---------- 可调参数（改完跑 build_chem.py 即生效）----------
     TERRAIN_NX/NZ  地形网格数（0.4 单位一格 ≈ 92/68 ÷ NX、NZ）——值越大岸线越细，三角形越多
     RIVER_STEP     河面网格步长（越小水线越细）
     SHORE_IN/OUT   海岸两侧坡带的宽度（内陆 / 水下），决定岸坡的缓急
     SEA_EDGE_IN    海面边缘埋进滩面的深度（防止边缘露出一条沙台）
     RIVER_MOUTH_END  河面最后铺到距海岸线多远（负数=岸内）
     MOUTH_DROP       河口末段压到海面之下多少（让海面盖住接缝）
     MOUTH_FADE       河口水位从多远处开始往海面压（0~1，沿程参数）
     RIVER_SEA_FADE   河水颜色从多远处开始渐变成海水色
     WATER_EDGE_FADE  水边渐隐带（按水深算，越小水线越硬） */
  /* 地形网格从 460×340 收到 380×286：顶面三角形减少约 1/3，
     岸线由水面等值线裁剪决定，不依赖地形格子，观感几乎不变 */
  var TERRAIN_NX = 380, TERRAIN_NZ = 286;
  var RIVER_STEP = .22;
  var SHORE_IN = 7.0, SHORE_OUT = 14.0;
  var SEA_EDGE_IN = -1.2;    /* 海面向岸内伸，与河面重叠 1.2 单位，重叠处同高同色 */
  var RIVER_MOUTH_END = 1.8, MOUTH_DROP = 0, MOUTH_FADE = .90;
  var RIVER_SEA_FADE = .72;
  var WATER_EDGE_FADE = .04;   /* 地形够细了，渐隐带收窄；太大水边会发白、透出底下的颗粒 */

  var RIVER_CTRL = [[-27, 5], [-21, 0], [-16, 9], [-10, 3], [-4, 10], [2, 16], [6, 22]];
  /* 四团云：雨必须从云底落下，所以位置对两边共用 */
  var CLOUD_POS = [[-19, 29.5, 2], [2, 32, -12], [19, 27.5, 13], [-33, 26, -18]];
  var CLOUD_R = 6.4;
  var SNOW_AREA = [-44, -10, -30, 12];   /* 雪片活动范围 x0,x1,z0,z1 */
  var riverCurve = null, RIVER_PTS = [];

  function buildRiver() {
    var pts = [], i;
    for (i = 0; i < RIVER_CTRL.length; i++) {
      pts.push(new T.Vector3(RIVER_CTRL[i][0], 0, RIVER_CTRL[i][1]));
    }
    riverCurve = new T.CatmullRomCurve3(pts, false, 'catmullrom', .5);
    for (i = 0; i <= 72; i++) {
      var v = riverCurve.getPoint(i / 72);
      RIVER_PTS.push([v.x, v.z]);
    }
  }

  var RIVER_T = 0;

  /* 返回到河心线的最近距离，并把沿程参数（0 上游 → 1 入海）写进 RIVER_T */
  function riverDist(x, z) {
    var best = 1e9, bestI = 0, i, dx, dz, d;
    for (i = 0; i < RIVER_PTS.length; i++) {
      dx = x - RIVER_PTS[i][0]; dz = z - RIVER_PTS[i][1];
      d = dx * dx + dz * dz;
      if (d < best) { best = d; bestI = i; }
    }
    RIVER_T = bestI / (RIVER_PTS.length - 1);
    return Math.sqrt(best);
  }

  /* 海岸线：随 z 起伏，别是一条直边 */
  function coastAt(z) {
    return SEA_X + Math.sin(z * .16) * 3.4 + Math.cos(z * .09 + 2) * 1.9 + Math.sin(z * .31 + 1) * .8;
  }

  /* 地形高度场。海底 → 沙滩 → 丘陵 → 山，河谷下切 */
  function hAt(x, z) {
    var c = coastAt(z), h, t, dx, dz, d, rd, k;
    if (x > c) {
      /* 海底：从海岸缓慢下坡 */
      h = SEA_Y - Math.min(6.2, (x - c) * .40);
    } else {
      t = c - x;
      h = SEA_Y + Math.min(3.2, t * .115);
      h += 1.4 * Math.sin(x * .17 + 1.2) * Math.cos(z * .14);
      dx = (x + 29) * .92; dz = z + 8;
      d = Math.sqrt(dx * dx + dz * dz);
      if (d < 24) h += 16.5 * Math.pow(1 - d / 24, 1.75);
      /* 山脊崎岖：主峰包上再叠两级起伏 */
      if (h > 8) {
        var rk = K.clamp((h - 8) / 9, 0, 1);
        h += rk * (1.7 * Math.sin(x * .43 + 1.3) * Math.cos(z * .37)
          + .8 * Math.sin(x * 1.07 - z * .61));
      }
      var d2 = Math.sqrt((x + 13) * (x + 13) + (z + 21) * (z + 21));
      if (d2 < 19) h += 7.2 * Math.pow(1 - d2 / 19, 1.7);
      var d3 = Math.sqrt((x + 34) * (x + 34) * 1.2 + (z - 22) * (z - 22));
      if (d3 < 15) h += 4.6 * Math.pow(1 - d3 / 15, 1.6);
    }
    rd = riverDist(x, z);
    if (x < c) {
      /* 河谷：上游窄而浅、下游宽而深，形成真正的 V 形河谷 */
      var vw = 2.2 + 2.8 * Math.pow(RIVER_T, 1.45);
      var vd = 1.5 + 2.6 * RIVER_T;
      if (rd < vw) { k = 1 - rd / vw; h -= vd * Math.pow(k, 1.7); }
    }
    /* 岸线 7 单位内压成一条干净的缓坡：地形噪声会让水线抖成一串小水塘/沙嘴，
       海面网格的第一列是贴着 coastAt 的，滩面不干净就白搭。河道（rd<4）保留河床。 */
    /* 注意：这里不再排除河道（原来 rd>2.6）。河口附近的噪声会在滩面上挖出小水塘、
       还会把岸线咬出缺口；整片滩面压平，只在后面用一条固定宽度的通道穿过去。 */
    if (x < c) {
      var bd = K.clamp((x - (c - 7.0)) / 7.0, 0, 1);
      bd = bd * bd * (3 - 2 * bd);
      h = h * (1 - bd) + (SEA_Y + (c - x) * .11) * bd;
    }

    /* 河口通道：滩面上只保留一条 2.4 宽的渠，渠底在海面之下——
       河水到这里还是一条河，不会在平坦的滩面上摊成一片浅水 */
    /* 只在下游靠海那 12 单位内挖河口通道：不加这个范围限制，
       整条河（包括山体）都会被压到海平面以下 —— 山会被切出一道深槽，水面也会漫出河岸 */
    if (x < c && x > c - 12 && rd < 3.6) {
      var k3 = 1 - rd / 3.6;
      h = Math.min(h, SEA_Y - .85 * Math.pow(k3, 1.15) - .08);
    }

    /* 四边收口：地块边缘削平，剖面顶边才是一条干净的线。
       但**不能**在 x=c 处硬切成「内陆 5.0 / 海 -4.4」——那会在剖面上留下一条垂直的岸壁。
       改成一条连续的岸坡：内陆缓降到岸线的海平面，再顺着水下岸坡（冲积形成）降到海底。 */
    var ed = Math.min(Math.min(x - X0, X1 - x), Math.min(z - Z0, Z1 - z));
    if (ed < 10) {
      var w2 = K.clamp((10 - ed) / 10, 0, 1);
      w2 = w2 * w2 * (3 - 2 * w2);
      var edgeH = (x < c)
        ? 5.0 + (SEA_Y - 5.0) * sstep(c - SHORE_IN, c, x)            /* 滩面：5.0 → 3.2 */
        : SEA_Y + (-4.4 - SEA_Y) * sstep(c, c + SHORE_OUT, x);       /* 水下岸坡：3.2 → -4.4 */
      h = h * (1 - w2) + edgeH * w2;
    }
    return h;
  }

  /* ---------------- 程序化贴图 ---------------- */
  /* 多尺度 value noise：水面/波纹不再呈规则格子 */
  function vnoise(size, freq) {
    var g = [], i, j;
    for (i = 0; i < (freq + 1) * (freq + 1); i++) g.push(Math.random());
    function at(x, y) { return g[((y % freq) + freq) % freq * (freq + 1) + ((x % freq) + freq) % freq]; }
    var out = new Float32Array(size * size);
    for (j = 0; j < size; j++) {
      for (i = 0; i < size; i++) {
        var fx = i / size * freq, fy = j / size * freq;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        out[j * size + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      }
    }
    return out;
  }

  function waveNormalTex(size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d');
    var i, j;
    /* 低频权重压到 .26：原来的 .55 让最低倍频的格点露出来，近看是一张"气泡膜" */
    var n1 = vnoise(size, 7), n2 = vnoise(size, 15), n3 = vnoise(size, 33),
      n4 = vnoise(size, 67), n5 = vnoise(size, 127);
    var h = new Float32Array(size * size);
    for (i = 0; i < size * size; i++) {
      h[i] = n1[i] * .26 + n2[i] * .26 + n3[i] * .22 + n4[i] * .16 + n5[i] * .10;
    }
    var img = x.createImageData(size, size), d = img.data;
    for (j = 0; j < size; j++) {
      for (i = 0; i < size; i++) {
        var hl = h[j * size + ((i - 1 + size) % size)], hr = h[j * size + ((i + 1) % size)];
        var hu = h[((j - 1 + size) % size) * size + i], hd = h[((j + 1) % size) * size + i];
        var nx = (hl - hr) * 1.15, ny = (hu - hd) * 1.15, nz = 1;
        var L = Math.sqrt(nx * nx + ny * ny + nz * nz), o = (j * size + i) * 4;
        d[o] = (nx / L * .5 + .5) * 255;
        d[o + 1] = (ny / L * .5 + .5) * 255;
        d[o + 2] = (nz / L * .5 + .5) * 255;
        d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(7, 7);
    t.anisotropy = 8;
    t.encoding = T.LinearEncoding;
    return t;
  }

  /* 海面粗糙度贴图：让高光碎成一片粼光，而不是一整块白斑 */
  function waterRoughTex(size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d');
    var i;
    var n1 = vnoise(size, 9), n2 = vnoise(size, 23), n3 = vnoise(size, 51);
    var img = x.createImageData(size, size), d = img.data;
    for (i = 0; i < size * size; i++) {
      var v = .58 + (n1[i] * .5 + n2[i] * .3 + n3[i] * .2) * .42;
      v = K.clamp(v, 0, 1) * 255;
      var o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(5, 5);
    t.anisotropy = 8;
    t.encoding = T.LinearEncoding;
    return t;
  }

  /* 沙盘的落地软影：椭圆径向渐变，边缘彻底化开（别露出矩形板边） */
  function softShadowTex() {
    var s = 256, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    x.save();
    x.translate(s / 2, s / 2); x.scale(1, .70);
    var gr = x.createRadialGradient(0, 0, 0, 0, 0, s * .48);
    gr.addColorStop(0, 'rgba(38,66,90,.60)');
    gr.addColorStop(.38, 'rgba(38,66,90,.36)');
    gr.addColorStop(.70, 'rgba(38,66,90,.12)');
    gr.addColorStop(1, 'rgba(38,66,90,0)');
    x.fillStyle = gr;
    x.fillRect(-s / 2, -s / 2, s, s);
    x.restore();
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function grainTex(w, avg, amp, rep) {
    var c = document.createElement('canvas'); c.width = c.height = w;
    var x = c.getContext('2d'), img = x.createImageData(w, w), d = img.data, i;
    for (i = 0; i < w * w; i++) {
      var v = (avg + (Math.random() - .5) * amp) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      var o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.encoding = T.LinearEncoding;
    return t;
  }

  /* 径向软斑：水汽 / 云絮 / 雪 / 光晕 */
  function puffTex(inner, r, g, b) {
    var s = 96, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + inner + ')');
    gr.addColorStop(.42, 'rgba(' + r + ',' + g + ',' + b + ',' + (inner * .5) + ')');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* 雪花：比水汽更"实"的心，边缘仍柔，近看是一颗颗而不是一团雾 */
  function flakeTex() {
    var s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(.30, 'rgba(255,255,255,.98)');
    gr.addColorStop(.52, 'rgba(255,255,255,.72)');
    gr.addColorStop(.72, 'rgba(255,255,255,.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function skyTex() {
    var c = document.createElement('canvas'); c.width = 4; c.height = 256;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6fb0dd');
    g.addColorStop(.34, '#9ccdea');
    g.addColorStop(.62, '#cbe6f4');
    g.addColorStop(.82, '#e4f1f8');
    g.addColorStop(1, '#eef5f9');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* ---------------- 地块几何：顶面高度场 + 四面剖切墙 ---------------- */
  var LEVEL = [
    { y: -0.9, c: [122, 94, 64] },      /* 表土 */
    { y: -4.4, c: [172, 143, 97] },     /* 沙层 */
    { y: -7.2, c: [143, 185, 203] },    /* 含水层 */
    { y: -DEPTH, c: [111, 115, 120] }   /* 基岩 */
  ];

  /* 地层：不是硬色带，而是按深度连续过渡 + 层面轻微起伏（沉积层的真实感） */
  function sstep(a, b, x) {
    var t = K.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function strataColor(y, x, z) {
    var warp = Math.sin(x * .085 + z * .045) * .55 + Math.cos(z * .062 - x * .028) * .45;
    var yy = y + warp;
    var humus = [80, 61, 45];       /* 腐殖土：暗棕 */
    var soil = [139, 108, 79];      /* 亚层土：黄棕 */
    var sand = [193, 175, 142];     /* 风化砂 */
    var aqua = [126, 158, 169];     /* 含水层：青灰 */
    var rock = [102, 106, 110];     /* 基岩 */
    /* 层内保持纯色（分层看得见），层界用 1.2~1.4 的过渡带（不生硬） */
    var c = mix3(humus, soil, sstep(-0.7, -1.9, yy));
    c = mix3(c, sand, sstep(-2.2, -3.6, yy));
    c = mix3(c, aqua, sstep(-4.2, -5.4, yy));
    c = mix3(c, rock, sstep(-6.4, -8.2, yy));
    /* 沉积层理：每层内部有细密的水平纹理，不是光板 */
    var lam = Math.sin(yy * 6.1 + Math.sin(x * .16) * 1.4) * 5
      + Math.sin(yy * 17.3 + z * .07) * 2.5;
    return [c[0] + lam, c[1] + lam, c[2] + lam];
  }

  function mix3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function terrainColor(y, slope, x, z) {
    var wet = [148, 134, 104], sand = [201, 183, 139], grass = [62, 108, 46];
    var rock = [126, 118, 98], snow = [235, 241, 246];
    var c;
    /* 雪线不是一条等高线：用低频起伏扰动分界高度，再掺一点斑块，
       山顶的雪才像"积"上去的，而不是刷了一层白漆 */
    var wob = Math.sin(x * .29 + z * .21) * 1.15 + Math.sin(x * .11 - z * .37 + 1.7) * .85
      + Math.sin(x * .71 + z * .53) * .35;
    var snowLine = 11.9 + wob;
    var rockLine = 8.7 + wob * .35;
    if (y < 4.4) c = mix3(wet, sand, K.clamp((y + 2.4) / 6.2, 0, 1));
    else if (y < 6.2) c = mix3(sand, grass, K.clamp((y - 4.4) / 1.8, 0, 1));
    else if (y < rockLine) c = grass;
    else if (y < snowLine - 2.0) c = mix3(grass, rock, K.clamp((y - rockLine) / 2.4, 0, 1));
    else if (y < snowLine) c = mix3(rock, snow, K.clamp((y - (snowLine - 2.0)) / 2.0, 0, 1));
    else c = snow;
    /* 雪线附近的斑块：略低于雪线的地方也有零星的雪，不会一刀切 */
    var patch = (Math.sin(x * .63 + 1.1) * Math.cos(z * .71 - .6) + .5 * Math.sin(x * 1.7 + z * 1.3)) * .5 + .5;
    if (y > snowLine - 1.9 && y < snowLine + .4 && patch > .64) {
      c = mix3(c, snow, K.clamp((patch - .64) / .36, 0, 1) * .8);
    }
    /* 陡坡露岩：雪线以上不再覆岩，保住山顶的雪冠 */
    var sl = K.clamp((slope - .82) / 1.0, 0, 1) * (y > 4.4 ? 1 : 0)
      * (1 - K.clamp((y - 10.6) / 3.4, 0, 1));
    if (sl > 0) c = mix3(c, [128, 116, 96], sl * .85);
    /* 湿沙：浪花打湿的那圈沙滩颜色更深 */
    var ws = K.clamp((3.95 - y) / 1.15, 0, 1);
    if (y > 2.4) c = mix3(c, [148, 130, 98], ws * .5);
    /* 水下：吸收偏蓝 */
    if (y < SEA_Y) {
      var w = K.clamp((SEA_Y - y) / 4.2, 0, 1);
      w = w * w * (3 - 2 * w);
      c = [c[0] * (1 - w * .58) + 10 * w, c[1] * (1 - w * .30) + 42 * w, c[2] * (1 - w * .02) + 66 * w];
    }
    return c;
  }

  function buildBlockGeo() {
    /* 地形细分到 ~0.4 单位（原来是 0.88）：水面与它求交的水线才会细，
       岸线锯齿的根源是地形格子太粗，加水/调水面材质都救不了 */
    var NX = TERRAIN_NX, NZ = TERRAIN_NZ, i, j;
    var pos = [], col = [], nrm = [];
    var grid = [], GN = [];
    for (j = 0; j <= NZ; j++) {
      grid[j] = [];
      for (i = 0; i <= NX; i++) {
        var gx = X0 + (X1 - X0) * i / NX;
        var gz = Z0 + (Z1 - Z0) * j / NZ;
        grid[j][i] = [gx, hAt(gx, gz), gz];
      }
    }
    /* 顶面法线按高度场解析算（中心差分）：
       以前顶点是逐三角形新建的，computeVertexNormals 只能得到"每片一个法线"，
       细分到 0.2 之后整个山坡就是一层织物状的明暗格子。 */
    var DX = (X1 - X0) / NX, DZ = (Z1 - Z0) / NZ;
    for (j = 0; j <= NZ; j++) {
      GN[j] = [];
      for (i = 0; i <= NX; i++) {
        var hl = grid[j][Math.max(0, i - 1)][1], hr = grid[j][Math.min(NX, i + 1)][1];
        var hu = grid[Math.max(0, j - 1)][i][1], hd = grid[Math.min(NZ, j + 1)][i][1];
        var nx1 = -(hr - hl) / (2 * DX), nz1 = -(hd - hu) / (2 * DZ);
        var L1 = Math.sqrt(nx1 * nx1 + 1 + nz1 * nz1);
        GN[j][i] = [nx1 / L1, 1 / L1, nz1 / L1];
      }
    }
    function pushV(p, c, n) {
      pos.push(p[0], p[1], p[2]);
      /* 顶点色必须存线性值：直接写 0~1 的 sRGB 数值会被输出编码二次提亮 */
      col.push(Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2));
      nrm.push(n[0], n[1], n[2]);
    }
    function faceN(a, b, c) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx2 = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
      var L2 = Math.sqrt(nx2 * nx2 + ny2 * ny2 + nz2 * nz2) || 1;
      return [nx2 / L2, ny2 / L2, nz2 / L2];
    }
    function tri(a, b, c, cl) {
      var n = faceN(a, b, c);
      pushV(a, cl, n); pushV(b, cl, n); pushV(c, cl, n);
    }
    function triC(a, ca, b, cb, c, cc) {
      var n = faceN(a, b, c);
      pushV(a, ca, n); pushV(b, cb, n); pushV(c, cc, n);
    }
    function varTriN(a, na, b, nb, c, nc, ca, cb, cc) {
      pushV(a, ca, na); pushV(b, cb, nb); pushV(c, cc, nc);
    }
    /* 顶面 */
    for (j = 0; j < NZ; j++) {
      for (i = 0; i < NX; i++) {
        var a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
        var cy = (a[1] + b[1] + c[1] + d[1]) / 4;
        var slope = Math.max(Math.abs(a[1] - c[1]), Math.abs(b[1] - d[1]));
        var n = 0;
        /* 颜色按【顶点】算：原来按格子算，相邻格子各给一个色，陡坡上就是一条条竖纹 */
        var mx0 = (a[0] + c[0]) / 2, mz0 = (a[2] + c[2]) / 2;
        var rdT = riverDist(mx0, mz0);
        var wetMix = 0;
        if (rdT < 7.5) wetMix = Math.pow(1 - K.clamp(rdT / 7.5, 0, 1), 1.25) * .42;
        function vcol(v) {
          var cv = terrainColor(v[1], slope, v[0], v[2]);
          if (wetMix > 0) cv = mix3(cv, [132, 120, 96], wetMix);
          return [K.clamp(cv[0] + n, 0, 255), K.clamp(cv[1] + n, 0, 255), K.clamp(cv[2] + n, 0, 255)];
        }
        var cA = vcol(a), cB = vcol(b), cC = vcol(c), cD = vcol(d);
        var cc = cA, cb = cB, cd = cC;
        var NA = GN[j][i], NB = GN[j][i + 1], NC = GN[j + 1][i + 1], ND = GN[j + 1][i];
        /* 顶点顺序 (a,c,b) / (a,d,c)：传法线时按同样顺序配对 */
        varTriN(a, NA, c, NC, b, NB, cc, cb, cd);
        varTriN(a, NA, d, ND, c, NC, cc, cd, cb);
      }
    }
    /* 四面剖切墙：按绝对高程分层着色，形成水平地层带。
       海岸处的水线是「海面 → 滩面」的一条斜边：水楔单独画，沉积层从滩面往下画。 */
    function wall(edgePts) {
      var k, m, yTop, yStep = .85, y1, y2, ay, by, cy, dy, mid;
      /* 全列共用一组竖直分带。若每列各自按顶面高度分带，相邻列在共享边上的
         顶点就会错位，光栅化后留下一条条细竖缝（剖面像贴了竖纹壁纸）。 */
      var YHI = -1e9, ei;
      for (ei = 0; ei < edgePts.length; ei++) if (edgePts[ei][1] > YHI) YHI = edgePts[ei][1];
      var NL = Math.max(2, Math.ceil((YHI + DEPTH) / yStep));
      var LVS = [];
      for (ei = 0; ei <= NL; ei++) LVS.push(YHI - (YHI + DEPTH) * ei / NL);
      for (k = 0; k < edgePts.length - 1; k++) {
        var p = edgePts[k], q = edgePts[k + 1];
        var cx = (p[0] + q[0]) / 2, cz = (p[2] + q[2]) / 2;
        var nn = 0;   /* 每列随机色会在剖面上形成竖条纹 */
        var bP = Math.min(p[1], SEA_Y), bQ = Math.min(q[1], SEA_Y);   /* 滩面/海床，不高于海面 */
        /* 只要有一条棱在水面以下就有水楔——不要按列中点判 wet：
           岸线那几列的 wet 会来回跳，水线就变成一级级台阶 */
        var wet = (SEA_Y - Math.min(bP, bQ)) > .04;

        /* 剖开的海水：上边贴海面，下边沿岸坡，颜色按各自深度 —— 不再被切片高度量化成阶梯 */
        if (wet) {
          var wcol = function (yy) {
            var d2 = K.clamp((SEA_Y - yy) / 7.6, 0, 1);
            return [96 - 76 * d2 + nn, 178 - 90 * d2 + nn, 208 - 72 * d2 + nn];
          };
          var wP = [p[0], SEA_Y, p[2]], wQ = [q[0], SEA_Y, q[2]];
          var sP = [p[0], bP, p[2]], sQ = [q[0], bQ, q[2]];
          triC(wP, wcol(SEA_Y), wQ, wcol(SEA_Y), sQ, wcol(bQ));
          triC(wP, wcol(SEA_Y), sQ, wcol(bQ), sP, wcol(bP));
        }

        yTop = wet ? Math.max(bP, bQ) : Math.max(p[1], q[1]);
        /* yTop 落在哪一段；顶部残段补到本列真实顶面，往下全部走全局高程 */
        var mi = 0;
        while (mi < LVS.length - 1 && LVS[mi + 1] > yTop + 1e-4) mi++;
        var segs = [];
        if (mi < LVS.length - 1) {
          segs.push([yTop, LVS[mi + 1]]);
          for (m = mi + 1; m < LVS.length - 1; m++) segs.push([LVS[m], LVS[m + 1]]);
        }
        for (var si = 0; si < segs.length; si++) {
          y1 = segs[si][0]; y2 = segs[si][1];
          ay = Math.min(y1, p[1]); by = Math.min(y1, q[1]);
          cy = Math.min(y2, q[1]); dy = Math.min(y2, p[1]);
          if (ay <= dy + .01 && by <= cy + .01) continue;
          var P1 = [p[0], ay, p[2]], Q1 = [q[0], by, q[2]];
          var Q2 = [q[0], cy, q[2]], P2 = [p[0], dy, p[2]];
          /* 按顶点自身坐标取色：相邻两列在共享边上算出同一个颜色，
             否则每条列缝都是一道细竖纹（剖面像贴了竖条壁纸） */
          function sc(yy, ghv, vx, vz) {
            var cc2 = strataColor(yy, vx, vz);
            if (wet) {
              /* 海床面往下 1.6 内是海相砂/淤泥（河水冲积、海浪淘洗），
                 不要把陆相的腐殖土直接露在水下 */
              var mw = 1 - K.clamp((ghv - yy) / 1.6, 0, 1);
              cc2 = mix3(cc2, [147, 152, 139], mw * .78);
            }
            return [cc2[0] + nn, cc2[1] + nn, cc2[2] + nn];
          }
          var d1 = sc(ay, p[1], p[0], p[2]), d2 = sc(by, q[1], q[0], q[2]);
          var d3 = sc(cy, q[1], q[0], q[2]), d4 = sc(dy, p[1], p[0], p[2]);
          triC(P1, d1, Q1, d2, Q2, d3);
          triC(P1, d1, Q2, d3, P2, d4);
        }
      }
    }
    var e;
    e = []; for (i = 0; i <= NX; i++) e.push(grid[NZ][i]); wall(e);            /* 前 z=Z1 */
    e = []; for (i = 0; i <= NX; i++) e.push(grid[0][i]); wall(e);             /* 后 */
    e = []; for (j = 0; j <= NZ; j++) e.push(grid[j][NX]); wall(e);            /* 右 */
    e = []; for (j = 0; j <= NZ; j++) e.push(grid[j][0]); wall(e);             /* 左 */

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    return g;
  }

  /* ---------------- 场景 ---------------- */
  var PUFF_WHITE, PUFF_SOFT, PUFF_GLOW, NORM_TEX, SKY_TEX, FLAKE_TEX;

  function hideLabBackdrop() {
    var sc = K.scene();
    sc.children.forEach(function (o) {
      if (o.isLight || o.isGroup) return;
      if (o.isMesh) o.visible = false;
    });
    sc.background = SKY_TEX;
    sc.fog = new T.Fog(0xd9eaf6, 280, 640);
  }

  function relight() {
    var sc = K.scene();
    sc.children.forEach(function (o) {
      if (o.isHemisphereLight) {
        o.intensity = .42; o.color.setHex(0xd6ecff); o.groundColor.setHex(0x86996d);
      } else if (o.isDirectionalLight) {
        if (o.castShadow) {
          o.position.set(46, 108, -74);
          o.intensity = 1.62;
          o.color.setHex(0xfff3dd);
          o.shadow.camera.left = -96; o.shadow.camera.right = 96;
          o.shadow.camera.top = 96; o.shadow.camera.bottom = -96;
          o.shadow.camera.near = 10; o.shadow.camera.far = 320;
          o.shadow.camera.updateProjectionMatrix();
          /* 山体很陡，阴影贴图（2048 铺 192 单位）在坡面上会自遮挡，
             出现一片放射状的"贝壳纹"——加 normalBias 才干净 */
          o.shadow.bias = -0.0004;
          o.shadow.normalBias = .16;
        } else {
          o.position.set(-52, 34, 96);
          o.intensity = .44;
          o.color.setHex(0xdcebfa);
        }
      }
    });
  }

  function buildSky() {
    var g = new T.SphereGeometry(400, 32, 20);
    var m = new T.MeshBasicMaterial({ map: SKY_TEX, side: T.BackSide, depthWrite: false, fog: false });
    var dome = new T.Mesh(g, m);
    dome.renderOrder = -10;
    K.scene().add(dome);
  }

  function buildSun() {
    var grp = new T.Group();
    var cc0 = new T.Color().setRGB(1.25, 1.22, 1.14);
    var core = new T.Mesh(new T.SphereGeometry(7.2, 20, 14),
      new T.MeshBasicMaterial({ color: cc0, fog: false, toneMapped: false }));
    grp.add(core);
    var hc = new T.Color().setRGB(1.02, .80, .52);
    var halo = new T.Sprite(new T.SpriteMaterial({
      map: PUFF_GLOW, color: hc, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, opacity: .22, fog: false, toneMapped: false
    }));
    halo.scale.set(24, 24, 1);
    grp.add(halo);
    /* 外圈再加一层很淡的大光晕，日面边缘才不会像贴了一张圆片 */
    var glow = new T.Sprite(new T.SpriteMaterial({
      map: PUFF_GLOW, color: new T.Color().setRGB(.92, .84, .70), transparent: true,
      depthWrite: false, blending: T.AdditiveBlending, opacity: .09,
      fog: false, toneMapped: false
    }));
    glow.scale.set(72, 72, 1);
    grp.add(glow);
    grp.position.set(-112, 50, -128);
    K.scene().add(grp);
    O.sun = grp; O.sunHalo = halo; O.sunGlow = glow;
  }

  function buildGround() {
    /* 地形没有 uv 属性，normalMap 采样的是无效 uv —— 只会在坡面上刷出一层竖向条纹，
       直接去掉；颗粒感交给顶点色和光照。 */
    var mat = new T.MeshStandardMaterial({
      vertexColors: true, roughness: .94, metalness: 0,
      envMapIntensity: .35, side: T.DoubleSide
    });
    var mesh = new T.Mesh(buildBlockGeo(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    K.scene().add(mesh);
    O.ground = mesh;

    /* 悬浮沙盘的落地软影：椭圆径向渐变，边缘化开，不要露出板边 */
    var sh = new T.Mesh(new T.PlaneGeometry(126, 86),
      new T.MeshBasicMaterial({
        map: softShadowTex(), color: 0xffffff,
        transparent: true, opacity: .55, depthWrite: false
      }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(2, -DEPTH - 2.3, 0);
    K.scene().add(sh);
  }

  /* 海面的水色：按该点真实水深插值（岸线浅青 → 深海沉蓝），返回线性值 */
  function seaCol(x, z) {
    var dep = K.clamp((SEA_Y - hAt(x, z)) / 4.4, 0, 1);
    /* 浅滩偏青绿、深海沉蓝，层次拉开一点，水面不会糊成一片粉蓝 */
    var c = mix3([52, 158, 178], [24, 122, 168], sstep(0, .32, dep));
    c = mix3(c, [9, 72, 126], sstep(.50, 1, dep));
    /* 离岸越远再压暗一档，整片海不会一个亮度 */
    var far = K.clamp((x - coastAt(z)) / 34, 0, 1);
    c = mix3(c, [14, 86, 138], far * .36);
    return [Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)];
  }

  /* 河水的水色：按该点实际水深插值（浅处发亮、深槽沉蓝），返回线性值 */
  function wcol(wl, px, pz) {
    var d = K.clamp((Math.max(wl - hAt(px, pz), .5)) / 2.0, 0, 1);
    var c = mix3([48, 138, 172], [18, 82, 118], d);
    return [Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)];
  }

  /* 统一水面：河与海是同一张面。
     水位由位置决定（河道走廊内=沿程水位，其余=海平面），只在"地形低于水位"处铺三角形。
     河、海不是两张面相交，所以接缝在构造上就不存在。 */
  function buildWater() {
    var STEP = .30, i, j;
    var XA = X0 + .2, ZA = Z0;
    var NX = Math.ceil((X1 - .4 - XA) / STEP), NZ = Math.ceil((Z1 - ZA) / STEP);

    /* 沿程水位表 */
    var N = 200, pts = [], bed = [], p = new T.Vector3();
    for (i = 0; i <= N; i++) {
      p.copy(riverCurve.getPoint(i / N));
      pts.push([p.x, p.z]);
      bed.push(hAt(p.x, p.z));
    }
    var wTop = bed[0] + .9;
    function halfW(uu) {
      var w0 = (.9 + 1.9 * Math.pow(uu, 1.35)) * (1 - .18 * sstep(.88, 1, uu));
      return w0 * (1 + .20 * Math.sin(uu * 17.0) + .08 * Math.sin(uu * 41.0));
    }

    var NP = (NX + 1) * (NZ + 1);
    var H = new Float32Array(NP), WL = new Float32Array(NP), CR = new Float32Array(NP);
    var PX = new Float32Array(NP), PZ = new Float32Array(NP);
    for (j = 0; j <= NZ; j++) {
      for (i = 0; i <= NX; i++) {
        var id = j * (NX + 1) + i;
        var x = XA + i * STEP, z = ZA + j * STEP;
        PX[id] = x; PZ[id] = z;
        H[id] = hAt(x, z);
        var rd = riverDist(x, z);
        var uf = K.clamp(RIVER_T, 0, 1);
        var inR = (rd < halfW(uf) + 2.0) ? 1 : 0;
        var lvl = SEA_Y;
        if (inR) {
          var bi = K.clamp(uf * N, 0, N), b0 = Math.floor(bi), b1 = Math.min(N, b0 + 1);
          var bedU = bed[b0] + (bed[b1] - bed[b0]) * (bi - b0);
          var ramp = wTop + (SEA_Y - wTop) * Math.pow(uf, .92);
          lvl = Math.max(ramp, bedU + .38);
          /* 河口段压到海平面：与海面同高，天然接上 */
          var mg = sstep(.90, .995, uf);
          lvl = lvl * (1 - mg) + SEA_Y * mg;
        }
        /* 水位整体抬 6cm：让水的（平滑）轮廓盖住地形 0.2 网格留下的锯齿边 */
        WL[id] = lvl + .06; CR[id] = inR;
      }
    }

    var pos = [], col = [], uv = [], idx = [];
    function waterCol(id) {
      var x = PX[id], z = PZ[id], lvl = WL[id];
      var c;
      if (CR[id] > .5) {
        riverDist(x, z);
        var uf = K.clamp(RIVER_T, 0, 1);
        c = wcol(lvl, x, z);
        var cm = sstep(.72, .96, uf);
        if (cm > 0) c = mix3(c, seaCol(x, z), cm);
      } else {
        c = seaCol(x, z);
      }
      return c;
    }
    /* 等值线裁剪：每个格子按"地形 = 水位"这条线切开，
       岸线落在等值线上（沿地形 0.2 的精度），不再沿 0.3 的格子走成台阶。 */
    var CW = new Float32Array(NP * 3);
    for (i = 0; i < NP; i++) {
      var c0 = waterCol(i);
      CW[i * 3] = c0[0]; CW[i * 3 + 1] = c0[1]; CW[i * 3 + 2] = c0[2];
    }
    function emit(vx, vy, vz, cr, cg, cb) {
      pos.push(vx, vy, vz);
      uv.push(vx * .42, vz * .42);
      col.push(cr, cg, cb, 1);
      return pos.length / 3 - 1;
    }
    function cell(ia, ic, idd, ib) {   /* 逆时针：a → c → d → b */
      var ring = [ia, ic, idd, ib], k, n = 4;
      var f = [
        WL[ia] - H[ia], WL[ic] - H[ic], WL[idd] - H[idd], WL[ib] - H[ib]
      ];
      var allIn = true, allOut = true;
      for (k = 0; k < n; k++) { if (f[k] < 0) allIn = false; else allOut = false; }
      if (allOut) return;
      if (allIn) {
        var v0 = emit(PX[ia], WL[ia], PZ[ia], CW[ia * 3], CW[ia * 3 + 1], CW[ia * 3 + 2]);
        var v1 = emit(PX[ic], WL[ic], PZ[ic], CW[ic * 3], CW[ic * 3 + 1], CW[ic * 3 + 2]);
        var v2 = emit(PX[idd], WL[idd], PZ[idd], CW[idd * 3], CW[idd * 3 + 1], CW[idd * 3 + 2]);
        var v3 = emit(PX[ib], WL[ib], PZ[ib], CW[ib * 3], CW[ib * 3 + 1], CW[ib * 3 + 2]);
        idx.push(v0, v1, v2, v0, v2, v3);
        return;
      }
      /* 部分在水下：沿着 f=0 收多边形 */
      var poly = [];
      for (k = 0; k < n; k++) {
        var va = ring[k], vb = ring[(k + 1) % n];
        var fa = f[k], fb = f[(k + 1) % n];
        if (fa >= 0) poly.push({ a: va, b: -1, t: 0 });
        if ((fa >= 0) !== (fb >= 0)) {
          var t = (fa === fb) ? .5 : fa / (fa - fb);
          poly.push({ a: va, b: vb, t: t });
        }
      }
      if (poly.length < 3) return;
      var first = -1, prev = -1, k2;
      for (k2 = 0; k2 < poly.length; k2++) {
        var q2 = poly[k2], vx, vy, vz, cr, cg, cb;
        if (q2.b < 0) {
          vx = PX[q2.a]; vy = WL[q2.a]; vz = PZ[q2.a];
          cr = CW[q2.a * 3]; cg = CW[q2.a * 3 + 1]; cb = CW[q2.a * 3 + 2];
        } else {
          var A = q2.a, B = q2.b, t2 = q2.t;
          vx = PX[A] + (PX[B] - PX[A]) * t2;
          vz = PZ[A] + (PZ[B] - PZ[A]) * t2;
          vy = WL[A] + (WL[B] - WL[A]) * t2;
          cr = CW[A * 3] + (CW[B * 3] - CW[A * 3]) * t2;
          cg = CW[A * 3 + 1] + (CW[B * 3 + 1] - CW[A * 3 + 1]) * t2;
          cb = CW[A * 3 + 2] + (CW[B * 3 + 2] - CW[A * 3 + 2]) * t2;
        }
        var vi = emit(vx, vy, vz, cr, cg, cb);
        if (k2 === 0) first = vi;
        else idx.push(first, prev, vi);
        prev = vi;
      }
    }
    for (j = 0; j < NZ; j++) {
      for (i = 0; i < NX; i++) {
        var a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        cell(a, c, d, b);
      }
    }

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 4));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    var nrm = [];
    for (i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));

    var wNorm = waveNormalTex(128);
    var wRough = waterRoughTex(128);
    wNorm.repeat.set(9, 9);
    wRough.repeat.set(8, 8);
    var sm = new T.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true,
      roughness: .44, metalness: 0, specularIntensity: .14, clearcoat: .06,
      clearcoatRoughness: .35,
      transparent: true, opacity: .95, depthWrite: false,
      normalMap: wNorm, normalScale: new T.Vector2(.44, .44),
      roughnessMap: wRough, envMapIntensity: .45
    });
    var mesh = new T.Mesh(g, sm);
    mesh.renderOrder = 2;
    K.scene().add(mesh);
    O.seaMat = sm; O.seaSurf = mesh; O.riverNorm = null; O.rainRender = 5;

    /* 海面碎光：一片贴着水面的小亮点，加法混合。
       让远看的大片蓝不至于是一块死色，近看有粼粼的细碎高光。 */
    var gp = [], gc = [], tries = 0, gx, gz, gb;
    while (gp.length < 640 * 3 && tries < 6000) {
      tries++;
      gx = K.rnd(9, 45); gz = K.rnd(-33, 33);
      if (hAt(gx, gz) > SEA_Y - .45) continue;
      if (gx < coastAt(gz) + .8) continue;
      gp.push(gx, SEA_Y + .13, gz);
      gb = .45 + Math.random() * .55;
      gc.push(gb * .82, gb * .95, gb);
    }
    var gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new T.Float32BufferAttribute(gc, 3));
    var gm = new T.PointsMaterial({
      map: PUFF_WHITE, size: .46, sizeAttenuation: true, transparent: true,
      opacity: .38, depthWrite: false, vertexColors: true,
      blending: T.AdditiveBlending, alphaTest: .01
    });
    var glint = new T.Points(gg, gm);
    glint.frustumCulled = false;
    glint.renderOrder = 3;
    K.scene().add(glint);
    O.glint = glint; O.glintMat = gm;
  }

  /* 海岸浪花：贴岸的一条窄白沫带。
     内缘贴着水线，外缘逐渐化开；纹理里有疏有密，并缓慢沿岸漂移。 */
  function buildSurf() {
    var i, N = 120, pos = [], idx = [], uv = [];
    for (i = 0; i <= N; i++) {
      var z = Z0 + (Z1 - Z0) * i / N;
      var cx = coastAt(z);
      /* 岸线碎浪：两条边错开相位，白沫带宽窄不一 */
      var wob = Math.sin(z * .31) * .9 + Math.cos(z * .17 + 1) * 1.4;
      var mouth = Math.exp(-Math.pow((z - 23.5) / 5.2, 2));   /* 河口附近浪花更盛 */
      pos.push(cx - .55 + wob * .12, SEA_Y + .055, z);
      pos.push(cx + 2.35 + mouth * 2.2 + wob * .42, SEA_Y + .035, z);
      uv.push(0, i / N * 9, 1, i / N * 9);
    }
    for (i = 0; i < N; i++) {
      var a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    var c = document.createElement('canvas'); c.width = c.height = 192;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 192, 192);
    var gr = x.createLinearGradient(0, 0, 192, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(.08, 'rgba(255,255,255,.95)');
    gr.addColorStop(.20, 'rgba(255,255,255,.62)');
    gr.addColorStop(.42, 'rgba(255,255,255,.22)');
    gr.addColorStop(.70, 'rgba(255,255,255,.05)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 192, 192);
    /* 泡沫团块：沿岸方向有疏有密 */
    for (i = 0; i < 170; i++) {
      var bx = 6 + Math.pow(Math.random(), .7) * 70;
      x.fillStyle = 'rgba(255,255,255,' + (.16 + Math.random() * .38) + ')';
      x.beginPath();
      x.ellipse(bx, Math.random() * 192, Math.random() * 3 + .5, Math.random() * 1.4 + .4, 0, 0, 6.283);
      x.fill();
    }
    /* 沿岸方向的波纹（断续的细线），浪花不会是一条均匀的带 */
    for (i = 0; i < 26; i++) {
      var yy = Math.random() * 192, ww = 20 + Math.random() * 70;
      x.strokeStyle = 'rgba(255,255,255,' + (.10 + Math.random() * .22) + ')';
      x.lineWidth = 1 + Math.random() * 2;
      x.beginPath(); x.moveTo(3, yy); x.lineTo(3 + ww, yy); x.stroke();
    }
    var tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.encoding = T.sRGBEncoding;
    var m = new T.MeshBasicMaterial({
      map: tex, transparent: true, opacity: .42, depthWrite: false, side: T.DoubleSide
    });
    var mesh = new T.Mesh(g, m);
    mesh.renderOrder = 4;
    K.scene().add(mesh);
    O.surf = mesh; O.surfMat = m; O.surfTex = tex;
  }

  /* 植被：三种树形 + InstancedMesh。
     原来 130 棵树 × 4 个 Mesh = 520 个 draw call；现在只要 4 个。
     每棵树仍有大小、朝向、颜色差异，不会看出一片复制品。 */
  var TREE_KINDS = [
    [[1.00, 1.50, .90], [.72, 1.14, 1.46], [.42, .88, 1.98]],   /* 细高塔形 */
    [[.88, 1.32, .86], [.98, 1.42, 1.40], [.55, .94, 1.90]],    /* 宽冠 */
    [[1.12, 1.26, .96], [.70, 1.00, 1.46], [.38, .72, 1.90]]    /* 矮壮 */
  ];

  /* 把三层圆锥合并成一份几何：局部 y=0 是地面 */
  function treeGeo(kind) {
    var base = new T.ConeGeometry(1, 1, 7).toNonIndexed();
    var bp = base.attributes.position.array, bn = base.attributes.normal.array;
    var pos = [], nrm = [], i, t, tt, p;
    for (t = 0; t < kind.length; t++) {
      tt = kind[t];
      for (i = 0; i < bp.length; i += 3) {
        pos.push(bp[i] * tt[0], bp[i + 1] * tt[1] + .85 + tt[2], bp[i + 2] * tt[0]);
        /* 非等比缩放下法线按 1/s 修正 */
        var nx = bn[i] / tt[0], ny = bn[i + 1] / tt[1], nz = bn[i + 2] / tt[0];
        var L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nrm.push(nx / L, ny / L, nz / L);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    return g;
  }

  function buildTrees() {
    var n = 0, tries = 0, placed = [], trees = [];
    while (n < 120 && tries < 2600) {
      tries++;
      var x = K.rnd(-44, 2), z = K.rnd(-33, 33);
      var h = hAt(x, z);
      if (h < 4.9 || h > 11.4) continue;
      if (riverDist(x, z) < 3.3) continue;
      var ok = true, q;
      for (q = 0; q < placed.length; q++) {
        if (Math.abs(placed[q][0] - x) < 1.9 && Math.abs(placed[q][1] - z) < 1.9) { ok = false; break; }
      }
      if (!ok) continue;
      /* 山脊与河谷边留出空档，树才不会像撒芝麻一样均匀 */
      var clump = Math.sin(x * .31 + 1.4) * Math.cos(z * .27 - .6)
        + .45 * Math.sin(x * .83 - z * .61);
      if (clump < -.28) continue;
      placed.push([x, z]);
      var sc = K.rnd(1.02, 1.78) * (1 - (h - 4.7) / 22);
      var kind = clump > .34 ? 1 : (Math.random() < .28 ? 2 : 0);
      /* 颜色用 sRGB 十六进制再偏移：直接写线性 RGB 会被输出编码提亮成薄荷绿。
         越高越偏冷绿/深绿，同一片林子也有明暗差 */
      var warm = K.clamp((h - 5) / 6, 0, 1);
      var palette = [0x2f5b33, 0x3b6a3a, 0x4a7741, 0x35604a];
      var col = new T.Color(palette[Math.floor(Math.random() * palette.length)]);
      col.offsetHSL(K.rnd(-.02, .02), K.rnd(-.06, .05), K.rnd(-.05, .05) - warm * .03);
      trees.push({
        x: x, z: z, h: h, sc: sc, kind: kind,
        rot: K.rnd(0, 6.283), sx: K.rnd(.88, 1.12), col: col
      });
      n++;
    }

    var leafMat = new T.MeshStandardMaterial({ color: 0x3d6b3c, roughness: .92, flatShading: true });
    var dummy = new T.Object3D();
    var counts = [0, 0, 0], t2;
    for (t2 = 0; t2 < trees.length; t2++) counts[trees[t2].kind]++;
    var meshes = [], ptr = [0, 0, 0];
    for (t2 = 0; t2 < 3; t2++) {
      var im = new T.InstancedMesh(treeGeo(TREE_KINDS[t2]), leafMat, Math.max(1, counts[t2]));
      im.castShadow = true;
      im.receiveShadow = false;
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      K.scene().add(im);
      meshes.push(im);
    }
    /* 实例色只做明暗/冷暖倍率（材质本身保持绿色），避免线性/伽马把树刷成薄荷色 */
    var grey = new T.Color();
    var trunk = new T.InstancedMesh(
      new T.CylinderGeometry(.11, .15, 1, 6),
      new T.MeshStandardMaterial({ color: 0x6a4a30, roughness: .9 }),
      Math.max(1, trees.length));
    trunk.castShadow = false;
    K.scene().add(trunk);
    for (t2 = 0; t2 < trees.length; t2++) {
      var tr = trees[t2], ki = tr.kind;
      dummy.position.set(tr.x, tr.h - .05, tr.z);
      dummy.rotation.set(0, tr.rot, 0);
      dummy.scale.set(tr.sc * tr.sx, tr.sc, tr.sc * tr.sx);
      dummy.updateMatrix();
      meshes[ki].setMatrixAt(ptr[ki], dummy.matrix);
      var mv = .90 + (tr.col.r - .18) * .6;   /* 用调色板里的偏移做轻微明暗差 */
      grey.setRGB(mv * K.rnd(.88, 1.02), mv * K.rnd(.96, 1.08), mv * K.rnd(.80, .98));
      meshes[ki].setColorAt(ptr[ki], grey);
      ptr[ki]++;
      dummy.position.set(tr.x, tr.h + tr.sc * .42, tr.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(tr.sc, tr.sc * .92, tr.sc);
      dummy.updateMatrix();
      trunk.setMatrixAt(t2, dummy.matrix);
    }
    for (t2 = 0; t2 < 3; t2++) {
      meshes[t2].count = counts[t2];
      meshes[t2].instanceMatrix.needsUpdate = true;
      if (meshes[t2].instanceColor) meshes[t2].instanceColor.needsUpdate = true;
    }
    trunk.instanceMatrix.needsUpdate = true;
  }

  /* 云团：一层压扁的底、一层蓬松的中部、一层小顶包，合并成一份几何。
     整团只有 1 个 draw call（原来是 24 个球 × 24 个材质），
     底部的暗部按顶点色烘进去，所以体积感不靠实时叠色。 */
  var CLOUD_GEO = null;
  function cloudGeometry(seed) {
    if (!CLOUD_GEO) CLOUD_GEO = new T.SphereGeometry(1, 12, 9).toNonIndexed();
    var bp = CLOUD_GEO.attributes.position.array, bn = CLOUD_GEO.attributes.normal.array;
    var pos = [], nrm = [], col = [];
    var i, v, L, ny, tint;
    function lump(lx, ly, lz, sx, sy, sz, ry) {
      var cs = Math.cos(ry), sn = Math.sin(ry), k;
      for (k = 0; k < bp.length; k += 3) {
        var px = bp[k] * sx, py = bp[k + 1] * sy, pz = bp[k + 2] * sz;
        var wx = lx + px * cs - pz * sn;
        var wz = lz + px * sn + pz * cs;
        var wy = ly + py;
        pos.push(wx, wy, wz);
        /* 非等比缩放：法线按 1/s 修正后归一 */
        var nx = bn[k] / sx, ny0 = bn[k + 1] / sy, nz = bn[k + 2] / sz;
        var rx = nx * cs - nz * sn, rz = nx * sn + nz * cs;
        L = Math.sqrt(rx * rx + ny0 * ny0 + rz * rz) || 1;
        nrm.push(rx / L, ny0 / L, rz / L);
        /* 云底暗、云顶亮；再叠一点冷灰，整团有体积 */
        ny = K.clamp((wy + 1.55) / 3.35, 0, 1);
        tint = .62 + .38 * Math.pow(ny, .82);
        col.push(tint * .995, tint * .998, tint * 1.0);
      }
    }
    /* 底排：压得扁、铺得开，云底是一条起伏的暗边；相邻球互相吃进对方一半，
       轮廓连成一条，而不是一排圆球 */
    var rb = [[0, -.48, 0, 3.15], [-2.25, -.40, .25, 2.55], [2.25, -.42, -.25, 2.6],
      [-.85, -.58, 1.05, 2.25], [1.05, -.60, 1.05, 2.2],
      [-3.5, -.28, -.4, 1.95], [3.45, -.30, .55, 1.9]];
    /* 中排：蓬松主体，略偏上，左右不对称 */
    var rm = [[-.5, .62, .1, 2.35, 1.35], [1.35, .55, -.35, 2.1, 1.2],
      [-1.85, .58, -.45, 2.05, 1.2], [.35, .78, 1.05, 1.85, 1.1],
      [2.35, .40, .45, 1.75, 1.02], [-3.0, .44, .6, 1.65, .98],
      [2.7, .68, -.8, 1.55, .95], [-1.25, .50, 1.45, 1.5, .95]];
    /* 顶排：小包，边缘更碎 */
    var rt = [[-.8, 1.55, -.1, 1.4, .92], [.8, 1.48, .4, 1.25, .85],
      [-2.0, 1.34, .3, 1.1, .76], [1.95, 1.3, -.3, 1.05, .74],
      [.1, 1.78, -.55, 1.0, .7]];
    function row(list, seedOff) {
      var j;
      for (j = 0; j < list.length; j++) {
        var a = list[j];
        var ry = (seed + seedOff + j * .83) % 6.283;
        lump(a[0], a[1], a[2], a[3], a[3] * (a[4] || .66), a[3] * .82, ry);
      }
    }
    row(rb, 0);
    row(rm, 1.7);
    row(rt, 3.1);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

  function makeCloud(x, y, z, s, seed, geo) {
    var mat = new T.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0,
      vertexColors: true, transparent: true, opacity: .92,
      depthWrite: true, emissive: 0xdce9f4, emissiveIntensity: .07
    });
    var m = new T.Mesh(geo, mat);
    var g = new T.Group();
    g.add(m);
    /* 两团柔光衬在云后：把球簇的硬边吃掉，远远看去是一整团云气 */
    var halos = [];
    var hz = [[0, .35, -1.6, 13.5, 7.0, .16], [0, 1.25, -1.2, 10.0, 5.6, .13]];
    for (var hi = 0; hi < hz.length; hi++) {
      var hh = hz[hi];
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: PUFF_SOFT, color: 0xf4f9fe, transparent: true, depthWrite: false,
        opacity: hh[5], fog: false
      }));
      sp.position.set(hh[0], hh[1], hh[2]);
      sp.scale.set(hh[3], hh[4], 1);
      g.add(sp);
      halos.push(sp);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    K.scene().add(g);
    return { g: g, mat: mat, halos: halos };
  }

  function buildClouds() {
    O.clouds = [];
    O.cloudBaseY = [];
    O.cloudS = [];
    O.cloudGeo = cloudGeometry(0);
    for (var i = 0; i < CLOUD_POS.length; i++) {
      var cp = CLOUD_POS[i];
      var s0 = [1.25, 1.05, 1.15, .95][i];
      O.clouds.push(makeCloud(cp[0], cp[1], cp[2], s0, i * 1.4, O.cloudGeo));
      O.cloudBaseY.push(cp[1]);
      O.cloudS.push(s0);
    }
  }

  /* 通用 sprite 池：必须排在海面之后渲染 */
  function spritePool(n, tex, color, size, opacity) {
    var arr = [], i;
    for (i = 0; i < n; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: tex, color: color, transparent: true, depthWrite: false,
        opacity: 0
      }));
      sp.scale.set(size, size, 1);
      sp.renderOrder = 6;
      K.scene().add(sp);
      arr.push(sp);
    }
    return arr;
  }

  function buildParticles() {
    var i;

    /* 蒸发：5 个固定蒸发点，各自冒出一股水汽柱 */
    O.evap = [];
    var VENT = [[13, -16], [21, 4], [31, 18], [16, 24], [35, -8]];
    O.seaSpot = function () {
      var v = VENT[Math.floor(Math.random() * VENT.length)];
      var sx = v[0], sz = v[1], tries = 0;
      do {
        sx = v[0] + K.rnd(-3.8, 3.8); sz = v[1] + K.rnd(-3.8, 3.8); tries++;
      } while (hAt(sx, sz) > SEA_Y - .6 && tries < 10);
      return [sx, sz];
    };
    var ep = spritePool(46, PUFF_SOFT, 0xdaeefb, 9.0, 0);
    for (i = 0; i < ep.length; i++) {
      ep[i].material.blending = T.AdditiveBlending;
      var sp0 = O.seaSpot();
      ep[i].position.set(sp0[0], K.rnd(SEA_Y, 18), sp0[1]);
      ep[i].scale.setScalar(9.0);
      O.evap.push({ sp: ep[i], x: sp0[0], z: sp0[1], y: K.rnd(SEA_Y, 18), v: K.rnd(1.4, 3.0), ph: Math.random() * 6.28 });
    }

    /* 水汽输送：海上空一路到云团 */
    var vpts = [
      new T.Vector3(38, 8, 20), new T.Vector3(28, 16, 12),
      new T.Vector3(14, 24, 4), new T.Vector3(-2, 28.5, -3),
      new T.Vector3(CLOUD_POS[0][0], CLOUD_POS[0][1], CLOUD_POS[0][2])
    ];
    O.vaporCurve = new T.CatmullRomCurve3(vpts, false, 'catmullrom', .5);
    /* 一束很淡的"空中通道"：把一颗颗水汽串成一条连续的带子。
       两端用顶点色渐隐，才不会突然断在半空。 */
    var vgeo = new T.TubeGeometry(O.vaporCurve, 48, 1.55, 6, false);
    var vuv = vgeo.attributes.uv, vcol = [], vi;
    for (vi = 0; vi < vuv.count; vi++) {
      var uu = vuv.getX(vi);
      var f = sstep(0, .16, uu) * (1 - sstep(.84, 1, uu));
      vcol.push(f, f, f);
    }
    vgeo.setAttribute('color', new T.Float32BufferAttribute(vcol, 3));
    var vtube = new T.Mesh(vgeo,
      new T.MeshBasicMaterial({
        color: 0xe6f6ff, vertexColors: true, transparent: true, opacity: .13,
        depthWrite: false, blending: T.AdditiveBlending
      }));
    vtube.renderOrder = 5;
    K.scene().add(vtube);
    O.vaporTube = vtube;
    O.vapor = [];
    var vp = spritePool(96, PUFF_SOFT, 0xe8f6ff, 3.0, 0);
    for (i = 0; i < vp.length; i++) {
      vp[i].material.blending = T.AdditiveBlending;
      O.vapor.push({ sp: vp[i], u: i / vp.length, sp0: K.rnd(.035, .06), ph: Math.random() * 6.28, off: K.rnd(-2.4, 2.4) });
    }

    /* 雨：落点绑定云中心，起点在云底。长短/疏密/斜度都留变化 */
    O.rainN = 360;
    O.rain = [];
    var rpos = new Float32Array(O.rainN * 6);
    O.dropReset = function (p, first) {
      var ci = p.ci;
      var r = Math.sqrt(Math.random()) * CLOUD_R;
      var a = Math.random() * 6.283;
      p.x = CLOUD_POS[ci][0] + Math.cos(a) * r;
      p.z = CLOUD_POS[ci][2] + Math.sin(a) * r * .8;
      p.gy = hAt(p.x, p.z);
      p.top = CLOUD_POS[ci][1] - 2.2;
      p.y = first ? K.rnd(p.gy + 2, p.top) : p.top - K.rnd(0, 1.6);
      /* 速度与长度一起变：远处细短、近处粗长，视线里才有层次 */
      p.v = K.rnd(22, 38);
      p.len = K.rnd(1.5, 5.4) * (p.v / 30);
      p.miss = Math.random() < .28;   /* 一部分雨丝落在林冠/远处，不溅水花 */
    };
    for (i = 0; i < O.rainN; i++) {
      var rp = { ci: i % CLOUD_POS.length };
      O.dropReset(rp, true);
      O.rain.push(rp);
    }
    var rg = new T.BufferGeometry();
    rg.setAttribute('position', new T.BufferAttribute(rpos, 3));
    O.rainGeo = rg;
    O.rainMat = new T.LineBasicMaterial({ color: 0x9ecfe8, transparent: true, opacity: 0, depthWrite: false });
    O.rainLines = new T.LineSegments(rg, O.rainMat);
    O.rainLines.frustumCulled = false;
    O.rainLines.renderOrder = 5;
    K.scene().add(O.rainLines);

    /* 雨滴落地/落水的涟漪：一圈压扁的环，加法混合，一个 draw call */
    O.ripN = 72;
    O.rips = [];
    var ripGeo = new T.RingGeometry(.55, 1, 14);
    ripGeo.rotateX(-Math.PI / 2);
    var ripMat = new T.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .55, depthWrite: false,
      blending: T.AdditiveBlending, side: T.DoubleSide
    });
    O.ripMesh = new T.InstancedMesh(ripGeo, ripMat, O.ripN);
    O.ripMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    O.ripMesh.frustumCulled = false;
    O.ripMesh.renderOrder = 4;
    var zeroM = new T.Matrix4().makeScale(0, 0, 0);
    for (i = 0; i < O.ripN; i++) {
      O.ripMesh.setMatrixAt(i, zeroM);
      O.ripMesh.setColorAt(i, new T.Color(0, 0, 0));
      O.rips.push({ x: 0, y: -9, z: 0, age: 9, life: 1, on: false });
    }
    K.scene().add(O.ripMesh);
    O.ripPtr = 0;
    O.zeroM = zeroM;
    O.ripBlack = new T.Color(0, 0, 0);
    O.ripTmp = new T.Color();
    O.ripDummy = new T.Object3D();
    O.spawnRipple = function (x, y, z) {
      var r = O.rips[O.ripPtr];
      O.ripPtr = (O.ripPtr + 1) % O.ripN;
      r.x = x; r.y = y + .05; r.z = z;
      r.age = 0; r.life = K.rnd(.42, .72); r.on = true;
    };

    /* 雪：两份 Points（细雪 + 大雪花），各 1 个 draw call。
       不用 70 个 Sprite，省下 68 次绘制，还能做出大小两层。 */
    function snowSys(count, size, area) {
      var p = new Float32Array(count * 3), c = new Float32Array(count * 3);
      var arr = [], k;
      for (k = 0; k < count; k++) {
        var sx = K.rnd(area[0], area[1]), sz = K.rnd(area[2], area[3]);
        var gy = hAt(sx, sz);
        var sy = K.rnd(gy + 1.5, Math.max(gy + 4, 24));
        p[k * 3] = sx; p[k * 3 + 1] = sy; p[k * 3 + 2] = sz;
        var br = .82 + Math.random() * .18;
        c[k * 3] = br; c[k * 3 + 1] = br; c[k * 3 + 2] = br;
        arr.push({
          x: sx, y: sy, z: sz, v: K.rnd(1.3, 2.9) * (size < 1 ? 1.12 : .88),
          ph: Math.random() * 6.28, amp: K.rnd(.5, 1.6), k: k
        });
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(p, 3));
      g.setAttribute('color', new T.BufferAttribute(c, 3));
      var m = new T.PointsMaterial({
        map: FLAKE_TEX, size: size, sizeAttenuation: true,
        color: 0xffffff, transparent: true, depthWrite: false, opacity: 0,
        vertexColors: true, alphaTest: .02
      });
      var pts = new T.Points(g, m);
      pts.frustumCulled = false;
      pts.renderOrder = 6;
      K.scene().add(pts);
      return { pts: pts, arr: arr, pos: p, mat: m };
    }
    O.snowSmall = snowSys(240, .58, SNOW_AREA);
    O.snowBig = snowSys(90, 1.18, SNOW_AREA);
    O.snow = [O.snowSmall, O.snowBig];

    /* 下渗：剖面上沿竖直方向下移 */
    O.seep = [];
    var ssp = spritePool(22, PUFF_SOFT, 0x8fdcff, 2.6, 0);
    for (i = 0; i < ssp.length; i++) {
      var sx2 = K.rnd(-25, -3);
      O.seep.push({ sp: ssp[i], x: sx2, y: hAt(sx2, Z1 - 4) - K.rnd(0, .5), ph: Math.random() * 6.28, v: K.rnd(1.4, 2.6) });
    }

    /* 地下径流：剖面含水层向海移动 */
    O.gw = [];
    var gsp = spritePool(30, PUFF_SOFT, 0x7fd0f5, 3.2, 0);
    for (i = 0; i < gsp.length; i++) {
      O.gw.push({ sp: gsp[i], x: K.rnd(-26, 43), v: K.rnd(1.6, 3.4), ph: Math.random() * 6.28, y: K.rnd(-6.9, -4.6) });
    }

    /* 河道里的流水亮点 */
    O.flow = [];
    var fsp = spritePool(16, PUFF_SOFT, 0xd8f2ff, 1.5, 0);
    for (i = 0; i < fsp.length; i++) {
      O.flow.push({ sp: fsp[i], u: i / 16, v: K.rnd(.10, .17) });
    }
  }

  /* 示意箭头：把"循环"讲清楚（蒸发↑ 输送→ 降水↓ 径流→ 地下→） */
  function makeArrow(kind, from, to, r) {
    var a = new T.Vector3().fromArray(from), b = new T.Vector3().fromArray(to);
    var d = new T.Vector3().subVectors(b, a);
    var len = d.length();
    var mat = new T.MeshStandardMaterial({
      color: 0xeef8ff, roughness: .45, metalness: 0,
      transparent: true, opacity: 0,
      emissive: 0x8fc8e8, emissiveIntensity: .45
    });
    var g = new T.Group();
    var headLen = Math.min(2.8, len * .38);
    var shaft = new T.Mesh(new T.CylinderGeometry(r, r, len - headLen, 8), mat);
    shaft.position.y = (len - headLen) / 2;
    var head = new T.Mesh(new T.ConeGeometry(r * 2.5, headLen, 10), mat);
    head.position.y = len - headLen / 2;
    g.add(shaft); g.add(head);
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
    g.visible = false;
    K.scene().add(g);
    return { g: g, mat: mat, kind: kind };
  }

  function buildArrows() {
    O.arrows = [];
    function add(kind, from, to, r) { O.arrows.push(makeArrow(kind, from, to, r || .42)); }
    /* 蒸发：海面向上 */
    add('evap', [11, 4.2, -14], [11, 13, -14], .40);
    add('evap', [18, 4.2, 7], [18, 14, 7], .40);
    add('evap', [26, 4.2, -8], [26, 12.5, -8], .40);
    /* 水汽输送：海上空 → 陆地上空 */
    add('vapor', [24, 13, 16], [18, 19, 11], .38);
    add('vapor', [15, 22, 5], [8, 25.5, 1], .38);
    add('vapor', [1, 28, 0], [-8, 29, -2], .38);
    /* 降水：云底向下 */
    add('rain', [-19, 21, 2], [-19, 12, 2], .36);
    add('rain', [1, 23, -12], [1, 15, -12], .36);
    add('rain', [8, 20, 14], [8, 12, 14], .36);
    /* 地表径流：沿河向海 */
    var p = new T.Vector3(), q = new T.Vector3();
    [.28, .55, .8].forEach(function (t) {
      p.copy(riverCurve.getPoint(t));
      q.copy(riverCurve.getPoint(Math.min(1, t + .07)));
      var yy = hAt(p.x, p.z) + 1.6;
      var dx = q.x - p.x, dz = q.z - p.z;
      var L = Math.sqrt(dx * dx + dz * dz) || 1;
      add('run', [p.x - dx / L * 2.6, yy, p.z - dz / L * 2.6],
        [p.x + dx / L * 4.2, yy, p.z + dz / L * 4.2], .40);
    });
    /* 地下径流：剖面含水层向海 */
    add('ground', [-16, -5.8, 34.6], [-4, -5.8, 34.6], .40);
    add('ground', [6, -5.8, 34.6], [18, -5.8, 34.6], .40);
    add('ground', [26, -5.8, 34.6], [36, -5.8, 34.6], .40);
    /* 下渗：地表向下穿入土层 */
    add('ground', [-14, 6.2, 34.6], [-14, -1.2, 34.6], .34);
    add('ground', [-4, 5.4, 34.6], [-4, -1.8, 34.6], .34);
  }

  /* ---------------- 微观三态模型 ---------------- */
  function waterMolecule(scale) {
    var g = new T.Group();
    var RO = 1.05 * scale, RH = .58 * scale, BOND = 1.55 * scale;
    var HALF = 104.5 / 2 * Math.PI / 180;
    var hy = -Math.cos(HALF) * BOND, hx = Math.sin(HALF) * BOND;
    var oMat = new T.MeshStandardMaterial({ color: 0xd8503f, roughness: .42, metalness: .05 });
    var hMat = new T.MeshStandardMaterial({ color: 0xf2f7fb, roughness: .5 });
    var bMat = new T.MeshStandardMaterial({ color: 0xdfe9f3, roughness: .55 });
    var o = new T.Mesh(new T.SphereGeometry(RO, 16, 12), oMat);
    o.position.y = RO * .5;
    g.add(o);
    var h1 = new T.Mesh(new T.SphereGeometry(RH, 12, 10), hMat);
    h1.position.set(-hx, RO * .5 + hy, 0); g.add(h1);
    var h2 = new T.Mesh(new T.SphereGeometry(RH, 12, 10), hMat);
    h2.position.set(hx, RO * .5 + hy, 0); g.add(h2);
    var b1 = K.rod([0, RO * .5, 0], [-hx, RO * .5 + hy, 0], RH * .38, { mat: bMat });
    var b2 = K.rod([0, RO * .5, 0], [hx, RO * .5 + hy, 0], RH * .38, { mat: bMat });
    g.add(b1); g.add(b2);
    return g;
  }

  function cardTex() {
    var w = 640, h = 300, c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    function rr(a, b, ww, hh, r) {
      x.beginPath();
      x.moveTo(a + r, b); x.lineTo(a + ww - r, b);
      x.quadraticCurveTo(a + ww, b, a + ww, b + r);
      x.lineTo(a + ww, b + hh - r);
      x.quadraticCurveTo(a + ww, b + hh, a + ww - r, b + hh);
      x.lineTo(a + r, b + hh);
      x.quadraticCurveTo(a, b + hh, a, b + hh - r);
      x.lineTo(a, b + r);
      x.quadraticCurveTo(a, b, a + r, b);
      x.closePath();
    }
    var g2 = x.createLinearGradient(0, 0, 0, h);
    g2.addColorStop(0, 'rgba(255,255,255,.97)');
    g2.addColorStop(1, 'rgba(232,242,250,.95)');
    rr(6, 6, w - 12, h - 12, 34);
    x.fillStyle = g2; x.fill();
    x.strokeStyle = 'rgba(120,164,200,.55)'; x.lineWidth = 4; x.stroke();
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function buildMicro() {
    var G = new T.Group();
    O.micro = G;
    O.mIce = []; O.mWater = []; O.mVapor = [];

    var card = new T.Mesh(new T.PlaneGeometry(45, 22),
      new T.MeshBasicMaterial({ map: cardTex(), transparent: true, depthWrite: false }));
    card.position.set(0, 0, -8);
    card.renderOrder = 3;
    G.add(card);

    function addMol(arr, x, y, z, s, uniform) {
      var m = waterMolecule(s);
      m.position.set(x, y, z);
      if (uniform) m.rotation.y = 0;
      else m.rotation.y = Math.random() * 6.28;
      G.add(m);
      arr.push({ o: m, bx: x, by: y, bz: z, ph: Math.random() * 6.28, vx: 0, vy: 0, vz: 0 });
    }

    /* 冰：3×3 规则点阵 */
    var i, j, k, n = 0;
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        addMol(O.mIce, -15.4 + (i - 1) * 3.8, (j - 1) * 3.6, 0, 1.05, true);
        n++;
      }
    }
    /* 水：松散堆积 */
    for (i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      addMol(O.mWater, K.rnd(-5.6, 5.6), K.rnd(-4.2, 4.2), K.rnd(-2, 2), 1.02, false);
    }
    /* 水蒸气：稀疏散开 */
    for (i = 0; i < 7; i++) {
      var a2 = i / 7 * Math.PI * 2 + .5;
      addMol(O.mVapor, 15 + K.rnd(-7.4, 7.4), K.rnd(-5.2, 5.2), K.rnd(-3.5, 3.5), .88, false);
    }

    /* 三块底光 */
    [-17, 0, 17].forEach(function (bx) {
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: PUFF_SOFT, color: 0x9fd0ee, transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, opacity: .38
      }));
      sp.scale.set(30, 22, 1);
      sp.position.set(bx * .88, -2.2, -1);
      G.add(sp);
    });

    K.scene().add(G);
    G.visible = false;
  }

  /* ---------------- 标注 ---------------- */
  function buildLabels() {
    O.labs = {};
    O.labs.sea = K.label([17, SEA_Y + .4, 14], '海洋：蒸发的大水库', 14, -16);
    O.labs.vapor = K.label([6, 26, 2], '水汽随气流输送', 14, -12);
    O.labs.cloud = K.label([-19, 29.5, 4], '云：小水滴与小冰晶', -34, 24);
    O.labs.rain = K.label([-12, 14, 10], '降水', 14, -8);
    O.labs.river = K.label([-10, 8, 3], '地表径流', -66, 6);
    O.labs.ground = K.label([3, -4.4, Z1 - .2], '下渗 · 地下径流', 12, -10);
    O.labs.snow = K.label([-30, 22, -8], '高山积雪 · 固体水库', 14, -16);
    O.labs.evap = K.label([18, 14, 7], '蒸发：水变成水蒸气', 18, -4);
    O.labs.mount = K.label([-33, 15, 4], '山地：河流的源头', 14, -14);
    O.labs.sun = K.label([42, 100, -150], '太阳：唯一的能量来源', 18, 6);
    O.labs.ice = K.label([-26, 40.8, 0], '冰 · 固态', 0, 2);
    O.labs.liquid = K.label([-6, 40.8, 0], '水 · 液态', 0, 2);
    O.labs.gas = K.label([9, 40.4, 0], '水蒸气 · 气态', 0, 2);
    Object.keys(O.labs).forEach(function (k) {
      O.labs[k].el.style.opacity = '0';
    });
  }

  /* 每一步点亮哪些标注 */
  var FOCUS = [
    ['sea', 'sun', 'river', 'mount'],
    ['sea', 'sun', 'evap'],
    ['vapor', 'evap'],
    ['cloud'],
    ['rain', 'snow', 'cloud'],
    ['river', 'ground'],
    ['ice', 'liquid', 'gas'],
    ['sea', 'vapor', 'cloud', 'rain', 'river', 'ground'],
    ['sea', 'river']
  ];

  var lastStage = -1;

  function syncLabels(s) {
    var si = Math.round(s.stage);
    if (si === lastStage) return;
    lastStage = si;
    var on = FOCUS[si] || [];
    Object.keys(O.labs).forEach(function (k) {
      var hit = on.indexOf(k) >= 0;
      var el = O.labs[k].el;
      el.style.opacity = hit ? '1' : '0';
      if (hit) el.classList.add('on'); else el.classList.remove('on');
    });
  }

  /* ---------------- 场景 ---------------- */
  var scene = {
    setup: function () {
      PUFF_WHITE = puffTex(.95, 255, 255, 255);
      PUFF_SOFT = puffTex(.55, 255, 255, 255);
      PUFF_GLOW = puffTex(1, 255, 236, 190);
      NORM_TEX = grainTex(128, .72, .3, 26);
      SKY_TEX = skyTex();
      FLAKE_TEX = flakeTex();

      buildRiver();
      hideLabBackdrop();
      relight();
      buildSky();
      buildSun();
      buildGround();
      buildWater();
      buildTrees();
      buildArrows();
      buildClouds();
      buildParticles();
      buildMicro();
      buildLabels();
    },

    update: function (dt, s) {
      s.t += dt;
      var t = s.t, i, p;
      var fm = s.fMicro;              /* 必须在云之前取值，否则云的 opacity 会算成 NaN */

      /* 水面纹理流动：海浪慢、河水快、浪花拍岸 */
      O.seaMat.normalMap.offset.x = t * .010;
      O.seaMat.normalMap.offset.y = t * .0052;
      if (O.seaMat.roughnessMap) {
        O.seaMat.roughnessMap.offset.x = -t * .0045;
        O.seaMat.roughnessMap.offset.y = t * .0032;
      }
      if (O.riverNorm) O.riverNorm.offset.x -= dt * .30;
      /* 岸边浪花沿岸漂移、一呼一吸 */
      if (O.surfTex) O.surfTex.offset.y = -t * .016;
      if (O.surfMat) O.surfMat.opacity = .40 + .10 * Math.sin(t * .75);
      if (O.glintMat) O.glintMat.opacity = .26 + .14 * Math.sin(t * 1.7) + .05 * Math.sin(t * 4.1);
      /* 分子尺度时收起太阳，别在卡片边缘露一个白斑 */
      if (O.sun) O.sun.visible = fm < .5;

      /* 太阳轻微呼吸 */
      var pu = 1 + Math.sin(t * .8) * .04;
      O.sunHalo.scale.set(24 * pu, 24 * pu, 1);
      if (O.sunGlow) O.sunGlow.scale.set(72 * pu, 72 * pu, 1);

      /* 蒸发 */
      var fe = s.fEvap;
      for (i = 0; i < O.evap.length; i++) {
        p = O.evap[i];
        /* 一路升到云底才消失：让"蒸发 → 上升 → 到高空凝结"连成一条 */
        p.y += p.v * dt;
        if (p.y > 27.5) {
          p.y = SEA_Y + K.rnd(0, .8);
          var nsp = O.seaSpot(); p.x = nsp[0]; p.z = nsp[1];
        }
        var k = (p.y - SEA_Y) / 24.3;
        /* 越到高空越冷，水汽由白转灰——这就是在凝结 */
        var cold = K.clamp((p.y - 17) / 8, 0, 1);
        p.sp.material.color.setRGB(1 - cold * .17, 1 - cold * .13, 1 - cold * .07);
        p.sp.position.set(
          p.x + Math.sin(t * .8 + p.ph) * 1.6 * k,
          p.y,
          p.z + Math.cos(t * .7 + p.ph) * 1.2 * k);
        /* 贴近水面是细密的水汽颗粒，升上去后散成大团雾 —— 读作"蒸发 → 上升" */
        var sz, al;
        if (k < .22) { sz = 2.0 + k * 5.4; al = .72 * Math.min(1, k * 9); }
        else { sz = 5.2 + k * 6.0; al = .30 * (1 - (k - .22) * .95); }
        p.sp.material.opacity = fe * K.clamp(al, 0, 1);
        p.sp.visible = fe > .02 && p.sp.material.opacity > .012;
        p.sp.scale.set(sz, sz, 1);
      }

      /* 水汽输送 */
      var fv = s.fVapor;
      if (O.vaporTube) {
        O.vaporTube.visible = fv > .05;
        O.vaporTube.material.opacity = fv * .13;
      }
      var tmp = new T.Vector3();
      for (i = 0; i < O.vapor.length; i++) {
        p = O.vapor[i];
        p.u += dt * p.sp0;
        if (p.u > 1) p.u -= 1;
        O.vaporCurve.getPoint(p.u, tmp);
        p.sp.position.set(
          tmp.x + Math.sin(t * .9 + p.ph) * 1.8,
          tmp.y + Math.cos(t * .8 + p.ph) * 1.2 + p.off * .4,
          tmp.z + Math.sin(t * .6 + p.ph) * 1.6);
        var fade = Math.min(1, p.u * 4) * Math.min(1, (1 - p.u) * 4);
        p.sp.material.opacity = fv * fade * .30;
        p.sp.visible = fv > .02 && p.sp.material.opacity > .012;
        var sz2 = 2.15 + Math.sin(t + p.ph) * .35;
        p.sp.scale.set(sz2 * 1.25, sz2 * .85, 1);
      }

      /* 雨 */
      var fr = s.fRain;
      O.rainMat.opacity = fr * .92;
      O.rainLines.visible = fr > .02;
      if (fr > .02) {
        var rp = O.rainGeo.attributes.position.array;
        for (i = 0; i < O.rainN; i++) {
          p = O.rain[i];
          p.y -= p.v * dt;
          if (p.y < p.gy + .15) {
            /* 落地溅起涟漪；林冠/远处那一部分不溅，画面才不吵 */
            if (!p.miss && Math.random() < .72) O.spawnRipple(p.x, p.gy, p.z);
            O.dropReset(p, false);
          }
          var o6 = i * 6;
          rp[o6] = p.x; rp[o6 + 1] = p.y; rp[o6 + 2] = p.z;
          /* 斜雨：雨丝随长度倾斜，近处长、远处短 */
          rp[o6 + 3] = p.x - p.len * .16;
          rp[o6 + 4] = p.y - p.len;
          rp[o6 + 5] = p.z - p.len * .045;
        }
        O.rainGeo.attributes.position.needsUpdate = true;
      }

      /* 落地涟漪：向外扩一圈、同时变暗（加法混合，暗=透明） */
      var ripMoved = false;
      for (i = 0; i < O.rips.length; i++) {
        var rq = O.rips[i];
        if (!rq.on) continue;
        rq.age += dt;
        if (rq.age >= rq.life) {
          rq.on = false;
          O.ripMesh.setMatrixAt(i, O.zeroM);
          O.ripMesh.setColorAt(i, O.ripBlack);
          ripMoved = true;
          continue;
        }
        var rk = rq.age / rq.life;
        var rsc = .28 + rk * 1.25;
        O.ripDummy.position.set(rq.x, rq.y, rq.z);
        O.ripDummy.rotation.set(0, 0, 0);
        O.ripDummy.scale.set(rsc, 1, rsc * .86);
        O.ripDummy.updateMatrix();
        O.ripMesh.setMatrixAt(i, O.ripDummy.matrix);
        var rb = (1 - rk) * (1 - rk) * .60 * fr;
        O.ripTmp.setRGB(rb, rb, rb);
        O.ripMesh.setColorAt(i, O.ripTmp);
        ripMoved = true;
      }
      if (ripMoved) {
        O.ripMesh.instanceMatrix.needsUpdate = true;
        if (O.ripMesh.instanceColor) O.ripMesh.instanceColor.needsUpdate = true;
      }
      O.ripMesh.visible = fr > .05;

      /* 雪：细雪 + 大雪片两层，各自飘落、轻微横向摆动 */
      var fs2 = s.snow;
      for (var si = 0; si < O.snow.length; si++) {
        var sys = O.snow[si];
        sys.pts.visible = fs2 > .02;
        sys.mat.opacity = fs2 * (si === 0 ? .82 : .96);
        if (fs2 <= .02) continue;
        var sy2 = sys.pos;
        for (i = 0; i < sys.arr.length; i++) {
          p = sys.arr[i];
          p.y -= p.v * dt;
          var gy2 = hAt(p.x, p.z);
          if (p.y < gy2 + .3) {
            p.y = K.rnd(20, 25);
            p.x = K.rnd(SNOW_AREA[0], SNOW_AREA[1]);
            p.z = K.rnd(SNOW_AREA[2], SNOW_AREA[3]);
          }
          sy2[p.k * 3] = p.x + Math.sin(t * .55 + p.ph) * p.amp;
          sy2[p.k * 3 + 1] = p.y;
          sy2[p.k * 3 + 2] = p.z + Math.cos(t * .42 + p.ph) * p.amp * .8;
        }
        sys.pts.geometry.attributes.position.needsUpdate = true;
      }

      /* 河道流水 */
      var frun = s.fRun;
      for (i = 0; i < O.flow.length; i++) {
        p = O.flow[i];
        p.u += dt * p.v;
        if (p.u > 1) p.u -= 1;
        riverCurve.getPoint(p.u, tmp);
        p.sp.position.set(tmp.x, hAt(tmp.x, tmp.z) + .8, tmp.z);
        p.sp.material.opacity = frun * .55 * Math.sin(p.u * Math.PI);
        p.sp.visible = frun > .03 && p.sp.material.opacity > .012;
        p.sp.scale.set(1.2, .7, 1);
      }

      /* 下渗 */
      var fg = s.fGround;
      for (i = 0; i < O.seep.length; i++) {
        p = O.seep[i];
        p.y -= p.v * dt;
        if (p.y < -7.4) p.y = hAt(p.x, Z1 - 4) - .2;
        p.sp.position.set(p.x + Math.sin(t + p.ph) * .3, p.y, Z1 + .25);
        p.sp.material.opacity = fg * .8;
        p.sp.visible = fg > .02;
        p.sp.scale.set(1.8, 3.6, 1);
      }

      /* 地下径流 */
      for (i = 0; i < O.gw.length; i++) {
        p = O.gw[i];
        p.x += p.v * dt * (0.6 + fg * 0.9);
        if (p.x > 44) p.x = -26;
        p.sp.position.set(p.x, p.y + Math.sin(t * 1.2 + p.ph) * .18, Z1 + .3);
        p.sp.material.opacity = fg * .8;
        p.sp.visible = fg > .02;
        p.sp.scale.set(4.4, 1.5, 1);
      }

      /* 循环箭头：跟着当前环节亮起来 */
      for (i = 0; i < O.arrows.length; i++) {
        var ar = O.arrows[i];
        var kk = ar.kind === 'evap' ? s.fEvap
          : ar.kind === 'vapor' ? s.fVapor
            : ar.kind === 'rain' ? s.fRain
              : ar.kind === 'run' ? s.fRun : s.fGround;
        ar.mat.opacity = K.clamp(kk, 0, 1) * .88;
        ar.g.visible = kk > .04 && fm < .45;
      }

      /* 云：水汽少时散成淡雾，凝结后聚拢变实；下雨时整团压暗成积雨云。
         每团云一份合并几何，底部暗部已烘进顶点色，这里只调整体颜色/透明度。 */
      var rcol = new T.Color(), rcw = new T.Color(0xb9c5d2);
      var rcd = K.clamp(s.fRain, 0, 1);
      if (O.cloudK === undefined) O.cloudK = 0;
      O.cloudK += (s.fCloud - O.cloudK) * Math.min(1, dt * .85);
      var ck = O.cloudK;
      var clop = (.04 + .96 * Math.pow(K.clamp(ck, 0, 1), 1.5)) * (1 - fm * .92);
      for (i = 0; i < O.clouds.length; i++) {
        var cl = O.clouds[i];
        cl.g.visible = clop > .055 && fm < .55;
        cl.g.position.x = CLOUD_POS[i][0] + Math.sin(t * .12 + i) * 2.4;
        cl.g.position.y = O.cloudBaseY[i] + Math.sin(t * .3 + i * 1.3) * .5;
        cl.g.scale.setScalar(O.cloudS[i] * (.74 + .36 * ck));
        rcol.setHex(0xffffff).lerp(rcw, rcd * .78);
        cl.mat.color.copy(rcol);
        cl.mat.opacity = clop * .97;
        cl.mat.emissiveIntensity = .05 + s.fCloud * .07 - rcd * .055;
        for (var hk = 0; hk < cl.halos.length; hk++) {
          cl.halos[hk].material.opacity = (hk === 0 ? .16 : .12) * clop * (1 - rcd * .35);
        }
      }

      /* 微观三态 */
      O.micro.visible = fm > .02;
      if (fm > .02) {
        O.micro.position.set(-6, 31 + Math.sin(t * .5) * .3, 0);
        var mv = .06 + .94 * fm;
        for (i = 0; i < O.mIce.length; i++) {
          p = O.mIce[i];
          p.o.position.set(
            p.bx + Math.sin(t * 2.6 + p.ph) * .12 * mv,
            p.by + Math.cos(t * 3.1 + p.ph) * .12 * mv,
            p.bz + Math.sin(t * 2.2 + p.ph) * .12 * mv);
        }
        for (i = 0; i < O.mWater.length; i++) {
          p = O.mWater[i];
          p.o.position.set(
            p.bx + Math.sin(t * .55 + p.ph) * 1.1 * mv,
            p.by + Math.cos(t * .48 + p.ph) * .9 * mv,
            p.bz + Math.sin(t * .6 + p.ph) * .8 * mv);
          p.o.rotation.y += dt * .25 * mv;
        }
        for (i = 0; i < O.mVapor.length; i++) {
          p = O.mVapor[i];
          if (!p.vx) { p.vx = K.rnd(-4, 4); p.vy = K.rnd(-2.6, 2.6); p.vz = K.rnd(-3, 3); }
          p.bx += p.vx * dt * mv; p.by += p.vy * dt * mv; p.bz += p.vz * dt * mv;
          if (Math.abs(p.bx - 17) > 9) { p.vx *= -1; p.bx = 17 + (p.bx - 17) * .92; }
          if (Math.abs(p.by) > 6.5) { p.vy *= -1; p.by *= .92; }
          if (Math.abs(p.bz) > 5) { p.vz *= -1; p.bz *= .92; }
          p.o.position.set(p.bx, p.by, p.bz);
          p.o.rotation.y += dt * .8 * mv;
        }
      }

      syncLabels(s);
    }
  };

  /* ---------------- 读数 ---------------- */
  var READ = [
    { t: '22 ℃', ph: '液态（海、河）', ch: '—' },
    { t: '26 ℃', ph: '液态 → 气态', ch: '汽化（蒸发）' },
    { t: '10 ℃', ph: '气态', ch: '—（随气流移动）' },
    { t: '-8 ℃', ph: '气态 → 液态', ch: '液化' },
    { t: '6 ℃', ph: '液态 + 固态', ch: '液化 / 凝华' },
    { t: '14 ℃', ph: '液态', ch: '—（汇流、下渗）' },
    { t: '—', ph: '固 / 液 / 气', ch: '熔化、汽化、凝华' },
    { t: '22 ℃', ph: '液态', ch: '—' },
    { t: '22 ℃', ph: '液态', ch: '—' }
  ];

  function stepState(s, stage) {
    s.fEvap = 0; s.fVapor = 0; s.fCloud = 1; s.fRain = 0;
    s.fRun = 0; s.fGround = 0; s.fMicro = 0; s.snow = 0;
    s.stage = stage;
  }

  K.boot({
    title: '水的天然循环',
    chip: '化学 · 鲁教版 · 九上 · 第三单元 探秘水世界 · 第一节 运动的水分子',
    hint: '拖空白处旋转视角 · 滚轮缩放 · ←/→ 切步骤',
    state: st,
    scene: scene,
    cam: { ty: 7, tx: 4, dist: 108, yaw: .62, pitch: .3 },

    reads: [['temp', '气温'], ['phase', '水的状态'], ['chg', '物态变化'], ['mol', '水分子']],
    values: function (s) {
      var i = Math.round(s.stageT !== undefined ? s.stageT : s.stage);
      var r = READ[K.clamp(i, 0, READ.length - 1)] || READ[0];
      return {
        temp: r.t,
        phase: r.ph,
        chg: r.ch,
        mol: 'H₂O（不变）'
      };
    },

    steps: [
      {
        name: '一圈水', title: '这块地上，水在不停地走',
        ask: '水从海里蒸发上天，又落回地面——转完这一整圈，水还是水吗？',
        body: '<p>现象层：画面是一块剖开的地块。东边是海，西边是山，山脚有河，河往海里流；侧面的剖口能看到表土、砂层和含水的砂砾层。此刻天上还<b>没有云</b>——云是水汽升到高空遇冷才凝出来的，接下来几步会看着它一点点长出来。</p>' +
          '<p>机制层：把它们串起来，就是<b>水的天然循环</b>：海面蒸发 → 水汽被气流带到陆地上空 → 遇冷凝结成云 → 降水落回地面 → 沿地表和地下流回海洋。太阳是这条循环唯一的动力来源。</p>' +
          '<p>易错层：很多同学能背出「蒸发、输送、凝结、降水、径流」五个词，却指不出哪个环节在哪个位置。这一节课件把每个环节都放在地块的一处，转一圈视角，你要能一一对上号。</p>' +
          '<p>考点层：化学要追问的不是「水怎么走」，而是「走完这一圈，水有没有变成别的东西」。这个问题，第 7 步用分子模型给出答案。</p>',
        apply: function (s) { stepState(s, 0); s.fCloud = 0; s.fEvap = 0; },
        cam: { tx: 0, ty: 6.5, tz: 1, dist: 112, yaw: .60, pitch: .30 }, camDur: 1.2
      },
      {
        name: '蒸发', title: '太阳把海水晒起来',
        ask: '海面看上去平静，水是怎么「跑」到天上的？',
        body: '<p>现象层：太阳晒着海面，贴着水面的地方雾蒙蒙的，越往上越淡，最后融进空气里看不见了。</p>' +
          '<p>机制层：太阳辐射把能量交给表层的水分子，它们运动加快，挣脱周围分子的吸引逸出液面，变成<b>水蒸气</b>进入空气，这个过程叫<b>蒸发</b>（汽化的一种）。温度越高、表面积越大、水面上方空气流动越快，蒸发越快——所以晒在院子里的湿衣服，比团在盆里的干得快。</p>' +
          '<p>易错层：水蒸气<b>无色无味，眼睛根本看不见</b>。你看到的「白气」「雾蒙蒙」都是水蒸气遇冷液化成的<b>小水滴</b>。烧开水时壶嘴附近那一小段「透明区」才是真正的水蒸气。</p>' +
          '<p>考点层：用分子观点解释蒸发——水分子本身没有变，变的只是分子之间的间隔变大、运动加快。蒸发要吸热，所以夏天在地上洒水会觉得凉快，游泳上岸被风一吹会打哆嗦。</p>',
        apply: function (s) { stepState(s, 1); s.fEvap = 1; s.fCloud = .22; },
        /* 海面近景：压低机位、贴着水看蒸发，同时把海岸线收进画面 */
        cam: { tx: 22, ty: 10, tz: 2, dist: 74, yaw: 1.02, pitch: .30 }, camDur: 1.2
      },
      {
        name: '输送', title: '水汽被风送上了陆地',
        ask: '海面上蒸发的水汽，为什么会出现在陆地上空？',
        body: '<p>现象层：水汽顺着上升气流升到高空，再被风一路推着，从海洋上空飘到陆地上空——画面里那条淡白色的带子就是它。</p>' +
          '<p>机制层：水蒸气随空气一起运动。大气环流把海洋上空的水汽持续不断地送到陆地上空，这条「空中通道」是陆地降水的水汽来源。海洋面积大、蒸发量大，是大气水汽最主要的供应者。</p>' +
          '<p>易错层：不是水蒸气「自己往陆地跑」，而是<b>空气（风）把它带过去</b>。水汽输送本身看不见，我们只能通过云和降水间接判断它发生了。</p>' +
          '<p>考点层：如果某地远离海洋、又缺乏水汽输送（比如深居内陆的沙漠），降水就少——这正是「海洋是大气水汽主要来源」的实际意义。</p>',
        apply: function (s) { stepState(s, 2); s.fEvap = .8; s.fVapor = 1; s.fCloud = .45; },
        /* 侧向长镜：从南面看整条水汽带由海面爬向云底 */
        cam: { tx: 7, ty: 16, tz: 3, dist: 88, yaw: .30, pitch: .10 }, camDur: 1.3
      },
      {
        name: '成云', title: '遇冷，水汽聚成了云',
        ask: '水汽为什么一到高空就变成看得见的云？',
        body: '<p>现象层：水汽一边上升一边降温，原本透明的地方慢慢浮出一团团白色，越聚越厚，成了云。</p>' +
          '<p>机制层：一定温度下，空气能容纳的水汽是有限的。上升过程中气温降低，能容纳的水汽变少，多出来的水蒸气就<b>液化</b>成小水滴；如果气温很低，还会直接<b>凝华</b>成小冰晶。大量小水滴、小冰晶聚集在一起，就是我们看到的云。</p>' +
          '<p>易错层：<b>云不是水蒸气！</b>云是大量小水滴和小冰晶的集合体，能看见；水蒸气看不见。同理，雾、露、冬天呼出的「白气」都是液化形成的小水滴，而霜、雪是水蒸气凝华形成的固体。</p>' +
          '<p>考点层：液化放热、汽化吸热，这一对是物态变化题的高频考点。云的形成是液化（放热），所以阴天往往比晴天暖和一些。</p>',
        apply: function (s) { stepState(s, 3); s.fEvap = .85; s.fVapor = .75; s.fCloud = 1; },
        /* 云层近景：低仰角，云底与天空分层看得清 */
        cam: { tx: -9, ty: 27, tz: 0, dist: 48, yaw: .24, pitch: .025 }, camDur: 1.2
      },
      {
        name: '降水', title: '落下来：雨，还有雪',
        ask: '云里的小水滴那么小，凭什么能落到地面？',
        body: '<p>现象层：云里的小水滴互相碰撞、合并，越长越大，重到空气托不住时就往下掉，落到地面就是雨；山顶气温低，落下来的是雪。</p>' +
          '<p>机制层：降水的形式取决于下落路径上的气温：一路都在 0 ℃ 以上是<b>雨</b>，途中遇到 0 ℃ 以下的气层就是<b>雪</b>或<b>冰雹</b>。所以同一片云，山下下雨、山上可能下雪。</p>' +
          '<p>易错层：降水不只是下雨。雪、冰雹、冻雨都算降水。另外，雪融化要吸热，春天融雪时气温回升得慢，就是因为热量被「拿去化雪」了。</p>' +
          '<p>考点层：降水是大气中的水回到地表的<b>唯一途径</b>。高山上的积雪像一座「固体水库」，夏天融化后慢慢补给河流——这也是河流在旱季不至于断流的原因之一。</p>',
        apply: function (s) { stepState(s, 4); s.fCloud = 1; s.fRain = 1; s.snow = 1; },
        /* 降水：把云底到雪线整段收进画面，雨丝与雪片同框 */
        cam: { tx: -11, ty: 19, tz: 5, dist: 66, yaw: .44, pitch: .14 }, camDur: 1.3
      },
      {
        name: '径流', title: '回海的两条路',
        ask: '落到地上的雨水，最后是怎么回到海里的？',
        body: '<p>现象层：雨水落地后分成两路。一路顺着地面汇成小溪、河流，往低处流，最后注入大海；另一路渗进土里，看不见了——剖面里那层浅蓝色的带子就是地下水，它也在慢慢往海洋方向流。</p>' +
          '<p>机制层：沿地面流动的叫<b>地表径流</b>，快；渗入土壤和岩石缝隙、在地下流动的叫<b>地下径流</b>，慢。下渗的水填满岩层缝隙形成含水层，含水层顺着岩层倾斜的方向流动，最终也排入海洋。</p>' +
          '<p>易错层：下渗的水<b>没有消失</b>，也没有变成别的水，它只是换了个地方待着。地下水是重要的淡水来源，但补给很慢，超量开采会造成地下水位下降、地面沉降。</p>' +
          '<p>考点层：「江河源源不断注入大海」靠的就是这两条回水路。地表径流和地下径流合起来，才把蒸发掉的海水补回去。</p>',
        apply: function (s) { stepState(s, 5); s.fRain = .3; s.fRun = 1; s.fGround = 1; s.fCloud = .8; },
        /* 径流：从河口逆着河往上游看，同时把剖面里的地下径流收进来 */
        cam: { tx: -3, ty: 8, tz: 8, dist: 76, yaw: .90, pitch: .34 }, camDur: 1.3
      },
      {
        name: '看分子', title: '换一把尺子：水分子一个也没变',
        ask: '冰、水、水蒸气，三种样子，还是同一种物质吗？',
        body: '<p>现象层：把镜头拉到分子尺度。冰里的水分子排得整整齐齐，只能在原地振动；水里的分子挨得比较近，可以互相滑动；水蒸气里的分子彼此离得很远，向四面八方自由运动。</p>' +
          '<p>机制层：三种状态里，水分子<b>都是 H₂O</b>，一个也没有变成别的分子。改变的只有两件事——<b>分子之间的间隔</b>和<b>分子的运动状态</b>。所以冰化成水、水结成冰、水变成水蒸气，通通是<b>物理变化</b>。</p>' +
          '<p>易错层：水蒸气分子并没有「变大」，只是间隔变大；冰里的分子也没有「静止」，它们一直在振动。三态变化不会改变水的化学性质——水蒸气、水、冰，化学性质完全相同。</p>' +
          '<p>考点层：判断物理变化还是化学变化，只看一条标准——<b>有没有新物质生成</b>。整个天然循环里，水分子始终是 H₂O，因此每一步都是物理变化。这一句是本节最硬的考点。</p>',
        apply: function (s) { stepState(s, 6); s.fMicro = 1; s.fEvap = .35; s.fVapor = .4; s.fCloud = .75; s.fRun = .5; s.fGround = .5; },
        /* 分子尺度：正对插图卡片，稍远留出三态标签的位置 */
        cam: { tx: 5, ty: 31.5, tz: 1, dist: 58, yaw: 0, pitch: .015 }, camDur: 1.3
      },
      {
        name: '意义', title: '这一圈，不只是搬水',
        ask: '如果水只是「搬来搬去」，为什么说天然循环对我们是生死攸关的？',
        body: '<p>现象层：海水又咸又苦，可落下来的雨是淡的；蒸发时，盐留在了海里。</p>' +
          '<p>机制层：蒸发—凝结这一对过程，相当于大自然做了一次<b>蒸馏</b>：水以水蒸气的形式离开，溶解的盐分被留下，凝结后落下的就是淡水。这就是水的天然循环的第一个意义——<b>实现水的自身净化</b>。同时，它把水从海洋搬到陆地，让陆地上的淡水资源不断<b>更新、重新分配</b>。</p>' +
          '<p>数据层：地球表面约 <b>71%</b> 被水覆盖，但淡水只占约 <b>2.53%</b>，其中大部分还锁在两极冰川和高山冰雪里，人类能方便利用的不足 1%。循环一直在运转，可用的淡水却始终有限。</p>' +
          '<p>考点层：天然循环的两条意义要背准——「实现水的自身净化」「使淡水资源不断更新」。这两句几乎每年都以简答题的形式出现，答成「让水变多了」是零分，因为总水量并没有增加。</p>',
        apply: function (s) { stepState(s, 7); s.fEvap = .8; s.fVapor = .8; s.fCloud = 1; s.fRain = .7; s.fRun = 1; s.fGround = 1; },
        /* 意义：回到全景，略高一点，整圈水都收进来 */
        cam: { tx: 0, ty: 6.5, tz: 1, dist: 104, yaw: .52, pitch: .30 }, camDur: 1.3
      },
      {
        name: '考核', title: '当一回判卷人',
        ask: '下面每题都考这一圈水。',
        quiz: true,
        apply: function (s) { stepState(s, 8); s.fEvap = .7; s.fVapor = .7; s.fCloud = 1; s.fRain = .8; s.fRun = 1; s.fGround = 1; },
        cam: { tx: 2, ty: 6.5, tz: 1, dist: 100, yaw: .58, pitch: .28 }, camDur: 1.2
      }
    ],

    quiz: function () {
      var Q = [
        {
          q: '水在天然循环的整个过程中，始终保持不变的是：',
          opts: ['水分子的种类', '水分子的间隔', '水分子的运动速率', '水所处的状态'],
          ans: '水分子的种类',
          why: '循环中发生的全是三态变化：间隔、运动速率、状态都在变，唯独水分子本身始终是 H₂O，没有生成新分子，所以整个过程是物理变化。'
        },
        {
          q: '海水蒸发变成水蒸气，用分子观点解释正确的是：',
          opts: ['水分子间隔变大、运动加快，分子本身没变', '水分子分解成了氢分子和氧分子', '水分子变成了另一种新分子', '水分子受热后体积变大了'],
          ans: '水分子间隔变大、运动加快，分子本身没变',
          why: '蒸发是汽化，属于物理变化。分子种类不变，变的只是间隔和运动状态；「分解成氢分子和氧分子」是电解水，属于化学变化。'
        },
        {
          q: '关于天上的云，下列说法正确的是：',
          opts: ['云是大量小水滴和小冰晶的集合体', '云就是水蒸气', '云是水蒸气液化后放热形成的，所以云本身在放热', '云里只有小冰晶'],
          ans: '云是大量小水滴和小冰晶的集合体',
          why: '水蒸气无色透明、看不见；云能看见，说明它是小水滴或小冰晶。液化过程放热，但放出的热已经传给周围空气，不能说「云本身在放热」。'
        },
        {
          q: '雨水落到地面后，一部分渗入地下成为地下水。这部分水：',
          opts: ['仍然在自然界中循环，最终也会流回海洋', '消失了，不再参与水循环', '变成了另一种物质', '立刻变成了水蒸气'],
          ans: '仍然在自然界中循环，最终也会流回海洋',
          why: '下渗只是换了个位置。地下水沿含水层缓慢流动，形成地下径流，最终排入海洋，是回到海洋的两条路径之一。'
        },
        {
          q: '水的天然循环对人类社会最重要的意义是：',
          opts: ['实现水的自身净化，使淡水资源不断更新', '使地球上的水总量不断增多', '把海水变成了淡水，海水因此减少', '使水分子变成了新的物质'],
          ans: '实现水的自身净化，使淡水资源不断更新',
          why: '循环实现的是水的重新分配与净化，总水量并没有增加；海水也没有因为蒸发而减少，蒸发掉的水最终又以径流的形式回来。'
        }
      ];
      return Q[Math.floor(Math.random() * Q.length)];
    }
  });
})();
