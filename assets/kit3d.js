/* 格物实验室 · three.js 3D 课件引擎（替代 Canvas 2D 版） */
window.Lab = (function () {
'use strict';
var T = window.THREE;

var cv = document.getElementById('cv');
var renderer, scene, camera;
var W = 1, H = 1, DPR = 1;

var cam = { yaw: .6, pitch: .28, dist: 100, tx: 0, ty: 9, tz: 0, fov: 42 };
var CAM0 = Object.assign({}, cam);
var cfg = null, state = {}, stepIdx = 0, lastT = 0, NOW = 0;
var quizPick = null, quizData = null;
var world = null;            // K.group：课件对象根节点
var flames = [];             // 自动摇曳的火焰
var labels = [];             // HTML 标注
var labelWrap = null;


/* ---------------- 自绘贴图（全部程序生成，无外部素材） ---------------- */
function cvTex(size, draw, repX, repY) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  var t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(repX || 1, repY || 1);
  t.anisotropy = (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy)
    ? renderer.capabilities.getMaxAnisotropy() : 4;
  return t;
}
function benchTexture() {
  return cvTex(512, function (x, S) {
    x.fillStyle = '#f2f4f6';
    x.fillRect(0, 0, S, S);
    var i, a, b, r;
    /* 环氧树脂台面的细颗粒 */
    for (i = 0; i < 5200; i++) {
      a = Math.random() * S; b = Math.random() * S;
      r = Math.random() * 1.6 + .3;
      var v = 205 + Math.random() * 45;
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',' + (.25 + Math.random() * .35) + ')';
      x.beginPath(); x.arc(a, b, r, 0, 6.283); x.fill();
    }
    /* 极淡的流向纹理 */
    for (i = 0; i < 42; i++) {
      x.strokeStyle = 'rgba(190,200,210,' + (.05 + Math.random() * .06) + ')';
      x.lineWidth = 1 + Math.random() * 2.5;
      x.beginPath();
      var yy = Math.random() * S;
      x.moveTo(0, yy);
      x.bezierCurveTo(S * .3, yy + 12, S * .7, yy - 12, S, yy);
      x.stroke();
    }
  }, 5, 3);
}
function floorTexture() {
  return cvTex(512, function (x, S) {
    x.fillStyle = '#e9edf1';
    x.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 3000; i++) {
      var v = 225 + Math.random() * 25;
      x.fillStyle = 'rgba(' + v + ',' + (v + 2) + ',' + (v + 5) + ',.5)';
      x.beginPath();
      x.arc(Math.random() * S, Math.random() * S, Math.random() * 2 + .4, 0, 6.283);
      x.fill();
    }
    /* 600×600 地砖缝 */
    x.strokeStyle = 'rgba(178,188,198,.85)';
    x.lineWidth = 3;
    for (i = 0; i <= S; i += S / 2) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
    }
  }, 14, 14);
}
function metalTexture() {
  return cvTex(256, function (x, S) {
    x.fillStyle = '#f0f2f4';
    x.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 900; i++) {
      var v = 210 + Math.random() * 45;
      x.strokeStyle = 'rgba(' + v + ',' + v + ',' + (v + 2) + ',' + (.15 + Math.random() * .3) + ')';
      x.lineWidth = Math.random() * 1.4;
      var yy = Math.random() * S;
      x.beginPath(); x.moveTo(0, yy); x.lineTo(S, yy + (Math.random() - .5) * 2); x.stroke();
    }
  }, 2, 2);
}

/* ---------------- 材质库 ---------------- */
var M = null;

function buildMaterials() {
  M = {
    glass: new T.MeshPhysicalMaterial({
      color: 0xf2f8fc, metalness: 0, roughness: .05,
      transparent: true, opacity: .3,
      side: T.DoubleSide, depthWrite: false,
      clearcoat: .7, clearcoatRoughness: .08,
      envMapIntensity: 1.8, specularIntensity: 1.2
    }),
    rubber: new T.MeshStandardMaterial({ color: 0x38302a, roughness: .85, metalness: .05, envMapIntensity: .3 }),
    metal: new T.MeshStandardMaterial({
      color: 0x9aa3ad, roughness: .32, metalness: .88, envMapIntensity: 1.1,
      map: metalTexture()
    }),
    iron: new T.MeshStandardMaterial({ color: 0x5a636e, roughness: .45, metalness: .8, envMapIntensity: 1.0 }),
    copper: new T.MeshStandardMaterial({ color: 0xb87333, roughness: .35, metalness: .9 }),
    benchTop: new T.MeshStandardMaterial({
      color: 0x0c1114, roughness: .46, metalness: .12, envMapIntensity: .3,
      map: benchTexture(), roughnessMap: benchTexture()
    }),
    cabinet: new T.MeshStandardMaterial({ color: 0xc7ced6, roughness: .72, metalness: 0, envMapIntensity: .3 }),
    floor: new T.MeshStandardMaterial({
      color: 0xb9c0c8, roughness: .92, metalness: 0, envMapIntensity: .25,
      map: floorTexture()
    }),
    wood: new T.MeshStandardMaterial({ color: 0x8a6a48, roughness: .8, metalness: 0 })
  };
  return M;
}

function flameTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 84, 4, 64, 84, 62);
  g.addColorStop(0, 'rgba(255,252,230,1)');
  g.addColorStop(.25, 'rgba(255,205,110,.95)');
  g.addColorStop(.55, 'rgba(255,140,50,.55)');
  g.addColorStop(1, 'rgba(255,110,30,0)');
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(64, 74, 30, 54, 0, 0, Math.PI * 2);
  x.fill();
  var t = new T.CanvasTexture(c);
  return t;
}
var FLAME_TEX = null;

function blobTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(40,58,84,.4)');
  g.addColorStop(.65, 'rgba(40,58,84,.16)');
  g.addColorStop(1, 'rgba(40,58,84,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
var BLOB_TEX = null;

/* ---------------- 场景初始化 ---------------- */
function init3d() {
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  renderer = new T.WebGLRenderer({ canvas: cv, antialias: true });
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;

  scene = new T.Scene();
  var bgc = document.createElement('canvas');
  bgc.width = 4; bgc.height = 256;
  var bgx = bgc.getContext('2d');
  var bgg = bgx.createLinearGradient(0, 0, 0, 256);
  bgg.addColorStop(0, '#f6f8fa');
  bgg.addColorStop(.55, '#eceff3');
  bgg.addColorStop(.8, '#dde3e9');
  bgg.addColorStop(1, '#d3dae1');
  bgx.fillStyle = bgg;
  bgx.fillRect(0, 0, 4, 256);
  scene.background = new T.CanvasTexture(bgc);
  scene.fog = new T.Fog('#edf0f4', 220, 520);

  camera = new T.PerspectiveCamera(cam.fov, 1, .5, 800);

  /* 光：高调明亮实验室 */
  var hemi = new T.HemisphereLight(0xffffff, 0xd6dce3, .55);
  scene.add(hemi);
  var key = new T.DirectionalLight(0xfff2df, 1.55);
  key.position.set(35, 70, 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -70; key.shadow.camera.right = 70;
  key.shadow.camera.top = 70; key.shadow.camera.bottom = -70;
  key.shadow.camera.far = 240;
  key.shadow.bias = -.0005;
  scene.add(key);
  var fill = new T.DirectionalLight(0xdfe8ff, .45);
  fill.position.set(-45, 30, -35);
  scene.add(fill);
  /* 轮廓光：从后方打亮物体边缘（产品级渲染常用手法） */
  var rim = new T.DirectionalLight(0xeaf4ff, .85);
  rim.position.set(-20, 26, -55);
  scene.add(rim);

  /* 房间地面（低于台面 16） */
  var floor = new T.Mesh(new T.CircleGeometry(240, 48), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -16;
  floor.receiveShadow = true;
  scene.add(floor);

  /* 背景：实验室后墙 + 高窗 + 踢脚线（给玻璃提供可折射的内容，也填掉空白） */
  var bg = new T.Group();
  var wallMat = new T.MeshStandardMaterial({ color: 0xcfd5dd, roughness: .95, metalness: 0 });
  var wall = new T.Mesh(new T.PlaneGeometry(150, 60), wallMat);
  wall.position.set(0, 8, -21);
  scene.add(wall);
  /* 墙裙 */
  var skirt = new T.Mesh(new T.BoxGeometry(150, 1.6, .5),
    new T.MeshStandardMaterial({ color: 0xb7bfc8, roughness: .8 }));
  skirt.position.set(0, -15.2, -20.8);
  scene.add(skirt);
  /* 高窗（发光面，玻璃能"看到"它） */
  var winMat = new T.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xf2f8ff, emissiveIntensity: 1.15, roughness: 1
  });
  [[-14, 8], [13, 8]].forEach(function (pos) {
    var win = new T.Mesh(new T.PlaneGeometry(10, 18), winMat);
    win.position.set(pos[0], pos[1], -20.6);
    scene.add(win);
    /* 窗框 */
    var frameMat = new T.MeshStandardMaterial({ color: 0xc3cbd4, roughness: .55, metalness: .15 });
    [-1, 1].forEach(function (sgn) {
      var bar = new T.Mesh(new T.BoxGeometry(.45, 18, .8), frameMat);
      bar.position.set(pos[0] + sgn * 5, pos[1], -20.4);
      scene.add(bar);
    });
    var mid = new T.Mesh(new T.BoxGeometry(10.4, .45, .8), frameMat);
    mid.position.set(pos[0], pos[1], -20.4);
    scene.add(mid);
  });

  /* 墙面试剂架（两层）+ 试剂瓶 + 气阀，低对比，只为丰富景深 */
  var shelfMat = new T.MeshStandardMaterial({ color: 0xc8cfd7, roughness: .7, metalness: .12 });
  [14.6].forEach(function (sy) {
    var shelf = new T.Mesh(new T.BoxGeometry(15, .45, 2.8), shelfMat);
    shelf.position.set(19, sy, -19.2);
    scene.add(shelf);
    for (var bi = 0; bi < 4; bi++) {
      var bx = 13.6 + bi * 3.6;
      var bh = 2.4 + (bi % 3) * .8;
      var tint = [0xcbdde9, 0xe2d3b4, 0xcbdcca, 0xdcc9d4][bi % 4];
      var bottleMat = new T.MeshPhysicalMaterial({
        color: tint, roughness: .22, metalness: 0, ior: 1,
        transmission: .18, thickness: .3, transparent: true, opacity: .92,
        envMapIntensity: 1.0
      });
      var b = new T.Mesh(new T.CylinderGeometry(.85, .85, bh, 16), bottleMat);
      b.position.set(bx, sy + .25 + bh / 2, -19.4);
      scene.add(b);
      /* 瓶内液体（低饱和） */
      var lq = new T.Mesh(new T.CylinderGeometry(.74, .74, bh * .5, 14),
        new T.MeshBasicMaterial({ color: [0x7fa8c4, 0xc9a86a, 0x8fbfa4, 0xb994ad][bi % 4], transparent: true, opacity: .75 }));
      lq.position.set(bx, sy + .3 + bh * .28, -19.4);
      scene.add(lq);
      var cap = new T.Mesh(new T.CylinderGeometry(.5, .5, .5, 12),
        new T.MeshStandardMaterial({ color: 0x505860, roughness: .6 }));
      cap.position.set(bx, sy + .3 + bh + .2, -19.4);
      scene.add(cap);
    }
  });
  /* 墙上的气阀 + 管路（工业感） */
  var valve = new T.Mesh(new T.CylinderGeometry(.5, .5, 1.2, 14), shelfMat);
  valve.rotation.z = Math.PI / 2;
  valve.position.set(28, 11.5, -20.4);
  scene.add(valve);
  var pipe = new T.Mesh(new T.CylinderGeometry(.34, .34, 22, 12), shelfMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(28, 13.6, -20.4);
  scene.add(pipe);

  world = new T.Group();
  scene.add(world);

  makeEnvMap();

  FLAME_TEX = flameTexture();
  BLOB_TEX = blobTexture();
}

/* 环境贴图：仿 three 的 RoomEnvironment（房间盒 + 发光面板），PMREM 捕获 */
function makeEnvMap() {
  var pmrem = new T.PMREMGenerator(renderer);
  var env = new T.Scene();
  var room = new T.Mesh(
    new T.BoxGeometry(26, 14, 26),
    new T.MeshStandardMaterial({ color: 0xf2f4f7, side: T.BackSide, roughness: .95 }));
  room.position.y = 4;
  env.add(room);
  /* 顶部主灯板 */
  var panel = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 14 });
  var main = new T.Mesh(new T.PlaneGeometry(10, 10), panel);
  main.position.set(0, 10.8, 0);
  main.rotation.x = Math.PI / 2;
  env.add(main);
  var side1 = main.clone();
  side1.material = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 6 });
  side1.position.set(-9, 9.5, 4);
  side1.scale.set(.55, .55, 1);
  env.add(side1);
  var side2 = side1.clone();
  side2.position.set(9, 9.5, -5);
  side2.scale.set(.7, .7, 1);
  env.add(side2);
  var rt = pmrem.fromScene(env, .04);
  scene.environment = rt.texture;
  pmrem.dispose();
}

/* ---------------- 图元辅助 ---------------- */
function V(x, y, z) { return new T.Vector3(x, y, z); }

function mesh(geo, mat, cast, recv) {
  var m = new T.Mesh(geo, mat);
  m.castShadow = cast !== false;
  m.receiveShadow = recv !== false;
  world.add(m);
  return m;
}

var K = {};


/* 液体竖向渐变贴图：底部更深（纵深吸收） */
function liquidGradient(col, darkK) {
  var c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  var x = c.getContext('2d');
  var base = new T.Color(col);
  var top = base.clone().multiplyScalar(1.0);
  var bot = base.clone().multiplyScalar(darkK === undefined ? .55 : darkK);
  var g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#' + top.getHexString());      /* 顶部（v=1） */
  g.addColorStop(.55, '#' + base.clone().multiplyScalar(.8).getHexString());
  g.addColorStop(1, '#' + bot.getHexString());      /* 底部（v=0） */
  var t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
  return t;
}


/* 液体材质：单网格片元着色器 —— 高度吸收渐变（无接缝）+ 边缘暗化 + 液面高光 */
function liquidMaterial(col, yBot, yTop, opts) {
  opts = opts || {};
  var base = new T.Color(col);
  var deep = base.clone().multiplyScalar(opts.deepK === undefined ? .55 : opts.deepK);
  var shallow = base.clone().multiplyScalar(opts.topK === undefined ? 1.0 : opts.topK);
  return new T.ShaderMaterial({
    uniforms: {
      uBot: { value: yBot },
      uTop: { value: yTop },
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uLight: { value: new T.Vector3(.45, .82, .35).normalize() },
      uOpacity: { value: opts.opacity === undefined ? 1 : opts.opacity }
    },
    vertexShader:
      'varying vec3 vW; varying vec3 vN;' +
      'void main(){' +
      ' vec4 wp = modelMatrix * vec4(position,1.0);' +
      ' vW = wp.xyz;' +
      ' vN = normalize(mat3(modelMatrix) * normal);' +
      ' gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader:
      'uniform float uBot; uniform float uTop;' +
      'uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uLight; uniform float uOpacity;' +
      'varying vec3 vW; varying vec3 vN;' +
      'void main(){' +
      ' float h = clamp((vW.y - uBot) / max(0.001, uTop - uBot), 0.0, 1.0);' +
      ' vec3 base = mix(uDeep, uShallow, smoothstep(0.0, 1.0, h));' +
      ' vec3 V = normalize(cameraPosition - vW);' +
      ' float fres = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);' +
      ' base *= (1.0 - fres * 0.52);' +          /* 贴壁处显著加深 */
      ' base += uShallow * (1.0 - fres) * 0.10;' +      /* 内部略亮，形成"体积感" */
      ' base = mix(base, vec3(0.96), fres * fres * 0.22);' +  /* 极边缘的湿润光泽 */
      ' float up = smoothstep(0.75, 0.98, normalize(vN).y);' +
      ' if (up > 0.01) {' +                      /* 液面：略亮 + 紧致高光 */
      '   vec3 hv = normalize(uLight + V);' +
      '   float spec = pow(max(dot(normalize(vN), hv), 0.0), 110.0);' +
      '   base = mix(base, uShallow * 1.02, up * 0.45) + vec3(spec * 0.42);' +
      ' }' +
      ' float a = mix(uOpacity, uOpacity * 0.74, up);' +
      ' gl_FragColor = vec4(base, a);' +
      '}',
    transparent: true,
    depthWrite: true
  });
}


/* 轮廓线自适应：器皿越小，线越实（three 的 linewidth 在多数平台无效，只能靠颜色/透明度补偿） */
function lineTone(r, base) {
  var k = Math.max(.45, Math.min(1.6, 5.2 / Math.max(1.2, r)));
  return { op: Math.min(.92, (base || .5) * k), color: r < 3 ? 0x6b8ca8 : 0x7f9fb8 };
}

/* 玻璃口沿线：LineLoop 圆环 + 母线，保证任何背景上都锐利可读 */
var LINE_MAT = null;
function lineMat(op) {
  return new T.LineBasicMaterial({ color: 0x7d9db8, transparent: true, opacity: op === undefined ? .62 : op });
}
function ringLine(parent, cx, cz, y, r, op) {
  var tone = lineTone(r, op);
  op = tone.op;
  var pts = [], n = 64, i, a;
  for (i = 0; i <= n; i++) {
    a = i / n * Math.PI * 2;
    pts.push(new T.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  var l = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts.slice(0, n)),
    new T.LineBasicMaterial({ color: tone.color, transparent: true, opacity: op }));
  (parent || world).add(l);
  return l;
}
function sideLines(parent, cx, cz, y0, y1, r, op) {
  var tone = lineTone(r, op === undefined ? .45 : op);
  op = tone.op;
  var pts = [];
  pts.push(new T.Vector3(cx - r, y0, cz), new T.Vector3(cx - r, y1, cz));
  pts.push(new T.Vector3(cx + r, y0, cz), new T.Vector3(cx + r, y1, cz));
  var g = new T.BufferGeometry().setFromPoints(pts);
  var l = new T.LineSegments(g, lineMat(op === undefined ? .45 : op));
  (parent || world).add(l);
  return l;
}

/* 菲涅尔亮边壳：让玻璃轮廓在浅背景上可读 */
var fresMat = null, haloMat = null;
function fresnelMaterial() {
  if (fresMat) return fresMat;
  fresMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uColor: { value: new T.Color(0x5f8ab0) }, uK: { value: 1.05 } },
    vertexShader:
      'varying vec3 vN; varying vec3 vV;' +
      'void main(){ vN = normalize(normalMatrix * normal);' +
      ' vec4 mv = modelViewMatrix * vec4(position,1.);' +
      ' vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uK;' +
      'void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.4);' +
      ' gl_FragColor = vec4(uColor, f * uK); }'
  });
  return fresMat;
}
function addFresnel(mesh, scale, noHalo) {
  var sh = new T.Mesh(mesh.geometry, fresnelMaterial());
  sh.scale.setScalar(scale || 1.015);
  sh.castShadow = false; sh.receiveShadow = false;
  mesh.add(sh);
  /* BackSide 外扩光晕：玻璃轮廓在任何背景上都可读 */
  if (noHalo) return sh;
  if (!haloMat) haloMat = new T.MeshBasicMaterial({
    color: 0x6f9ec4, transparent: true, opacity: .32,
    side: T.BackSide, depthWrite: false
  });
  var halo = new T.Mesh(mesh.geometry, haloMat);
  halo.scale.setScalar((scale || 1.015) * 1.035);
  halo.castShadow = false; halo.receiveShadow = false;
  mesh.add(halo);
  return sh;
}

/* 玻璃圆筒（开口 + 口沿） */
K.glassCyl = function (o) {
  o = o || {};
  var r = o.r || 5, h = o.h || 10, x = o.x || 0, z = o.z || 0, y0 = o.y0 || 0;
  var g = new T.Group();
  var gmat = o.glassMat || M.glass;
  var wall = new T.Mesh(
    new T.CylinderGeometry(r, r, h, 48, 1, true), gmat);
  wall.position.set(x, y0 + h / 2, z);
  g.add(wall);
  var rim = new T.Mesh(new T.TorusGeometry(r, Math.max(.12, r * .028), 10, 48), M.glass);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y0 + h, z);
  g.add(rim);
  var bot = new T.Mesh(new T.TorusGeometry(r, Math.max(.1, r * .024), 10, 48), M.glass);
  bot.rotation.x = Math.PI / 2;
  bot.position.set(x, y0 + .06, z);
  g.add(bot);
  wall.renderOrder = 3;
  addFresnel(wall, 1.02);
  ringLine(g, x, z, y0 + h, r, .7);
  ringLine(g, x, z, y0 + .02, r, .5);
  sideLines(g, x, z, y0, y0 + h, r, .42);
  world.add(g);
  return g;
};

/* 圆柱液体（带顶面） */
K.liquidCyl = function (o) {
  o = o || {};
  var r = o.r || 4.8, h = o.h || 5, x = o.x || 0, z = o.z || 0, y0 = o.y0 || 0;
  var col = o.color || 0x2f7fb8;
  var op = o.opacity === undefined ? .88 : o.opacity;
  var mat = liquidMaterial(col, y0, y0 + h, { deepK: .6, opacity: op });
  var m = new T.Mesh(new T.CylinderGeometry(r, r, h, 40), mat);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = false;
  m.receiveShadow = false;
  world.add(m);
  return m;
};

/* 液体平面（升降液面） */
K.liquidTop = function (o) {
  o = o || {};
  var r = o.r || 4.8, x = o.x || 0, z = o.z || 0, y = o.y || 0;
  var col = o.color || 0x2f7fb8;
  var mat = new T.MeshStandardMaterial({
    color: col, roughness: .22, transparent: true, opacity: .92,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  var m = new T.Mesh(new T.CircleGeometry(r, 40), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + .015, z);   /* 抬高一点，避免与液体顶盖共面打架 */
  world.add(m);
  return m;
};

/* 锥形瓶：Lathe 轮廓 + 内部液体 */
K.flask = function (o) {
  o = o || {};
  var baseR = o.baseR || 5, bodyH = o.bodyH || 9, neckR = o.neckR || 1.6, neckH = o.neckH || 4;
  var x = o.x || 0, z = o.z || 0, y0 = o.y0 || 0;
  var liq = o.liquid === undefined ? .5 : o.liquid;
  var liqCol = o.liquidCol || 0x2f7fb8;
  var liqA = o.liquidA === undefined ? .92 : o.liquidA;
  var inset = o.liqInset === undefined ? .3 : o.liqInset;   /* 液体与瓶壁的间隙 */
  var g = new T.Group();

  var pts = [], N = 32, i;
  var shR = neckR * 1.55, shT = .78;          /* 肩部半径与起始位置 */
  function flaskR(t) {                        /* t: 0..1 沿瓶身 */
    if (t <= shT) return baseR + (shR - baseR) * (t / shT);
    var k = (t - shT) / (1 - shT);
    return shR + (neckR - shR) * (k * k * (3 - 2 * k));   /* smoothstep 肩部 */
  }
  for (i = 0; i <= N; i++) {
    var t = i / N, y = bodyH * t;
    pts.push([flaskR(t), y]);
  }
  var prof = [new T.Vector2(.05, 0)];
  for (i = 0; i < pts.length; i++) prof.push(new T.Vector2(pts[i][0], pts[i][1] + .5));
  var body = new T.Mesh(new T.LatheGeometry(prof, 48), o.glassMat || M.glass);
  body.castShadow = false;
  g.add(body);

  /* 内壁：略小的同一轮廓（法线朝内），与外壁一起构成真实玻璃厚度，
     液体夹在两壁之间，从正面看就是"玻璃罩着液体" */
  (function () {
    var inner = [], ii2, ip;
    for (ii2 = 0; ii2 < prof.length; ii2++) {
      ip = prof[ii2];
      var shrink = (ip.y < .8) ? .02 : .28;
      inner.push(new T.Vector2(Math.max(.03, ip.x - shrink), ip.y));
    }
    var wall = new T.Mesh(new T.LatheGeometry(inner, 44), new T.MeshPhysicalMaterial({
      color: 0xf4fafd, roughness: .05, metalness: 0,
      transparent: true, opacity: .2, side: T.BackSide,
      depthWrite: false, envMapIntensity: 1.6, clearcoat: .6, clearcoatRoughness: .1
    }));
    wall.renderOrder = 4;
    g.add(wall);
  })();
  body.renderOrder = 3;
  addFresnel(body, 1.015, true);
  var rim = new T.Mesh(new T.TorusGeometry(neckR * 1.1, .16, 10, 40), M.glass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = bodyH + .5 + neckH;
  g.add(rim);
  var neck = new T.Mesh(new T.CylinderGeometry(neckR, neckR, neckH, 40, 1, true), o.glassMat || M.glass);
  neck.position.y = bodyH + .5 + neckH / 2;
  neck.castShadow = false;
  g.add(neck);
  neck.renderOrder = 3;
  addFresnel(neck, 1.03, true);

  if (liq > .01) {
    var lv = [];
    var ly = .5 + bodyH * liq * .95;
    var lr = flaskR(Math.min(1, (ly - .5) / bodyH));
    lv.push(new T.Vector2(.05, .5));
    var j, m;
    for (j = 0; j <= 10; j++) {
      m = j / 10;
      var yy = .5 + (ly - .5) * m;
      var rr = baseR + (neckR - baseR) * Math.pow(m * liq * .95, .8) * (ly - .5 > 0 ? 1 : 0);
      rr = flaskR(Math.min(1, (yy - .5) / bodyH)) - .12;
      lv.push(new T.Vector2(Math.max(.05, rr - inset), yy));
    }
    lv.push(new T.Vector2(.05, ly));
    var lm = new T.Mesh(new T.LatheGeometry(lv, 40),
      liquidMaterial(liqCol, .5, ly, { deepK: .62, opacity: 1 }));
    lm.name = 'liquid';
    lm.renderOrder = 2;
    g.add(lm);

    /* 贴壁薄壳：紧贴瓶壁的一层更深液体，填掉液体与玻璃之间的缝，
       与主体叠在一起读成"有厚度的液体"（而不是实心色块） */
    var shellPts = [], sj;
    for (sj = 0; sj <= 14; sj++) {
      var st = sj / 14;
      var sy2 = .5 + (ly - .5) * st;
      var sr2 = flaskR(Math.min(1, (sy2 - .5) / bodyH)) - Math.max(.05, inset * .16);
      shellPts.push(new T.Vector2(Math.max(.04, sr2), sy2));
    }
    var shell = new T.Mesh(new T.LatheGeometry(shellPts, 44),
      new T.MeshBasicMaterial({
        color: new T.Color(liqCol).multiplyScalar(.42),
        transparent: true, opacity: .78,
        side: T.BackSide, depthWrite: false
      }));
    shell.name = 'liquidShell';
    shell.renderOrder = 1;
    g.add(shell);
    /* 液面高光圈（白亮环） */
    var men = [], mi, ma;
    var mr = Math.max(.1, flaskR(Math.min(1, (ly - .5) / bodyH)) - inset);
    for (mi = 0; mi <= 48; mi++) {
      ma = mi / 48 * Math.PI * 2;
      men.push(new T.Vector3(Math.cos(ma) * mr, ly + .012, Math.sin(ma) * mr));
    }
    var menLine = new T.LineLoop(new T.BufferGeometry().setFromPoints(men.slice(0, 48)),
      new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5 }));
    g.add(menLine);
    /* 液面与瓶壁的接触暗线（液体贴壁处的深色细环） */
    var menDark = [];
    for (mi = 0; mi < 48; mi++) {
      ma = mi / 48 * Math.PI * 2;
      menDark.push(new T.Vector3(Math.cos(ma) * (mr + .03), ly - .06, Math.sin(ma) * (mr + .03)));
    }
    g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(menDark),
      new T.LineBasicMaterial({ color: 0x6a2b3a, transparent: true, opacity: .3 })));
  }
  /* 瓶壁竖向高光：模拟窗户在玻璃上的镜面反射条（玻璃感的关键线索） */
  (function () {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    var x2 = c.getContext('2d');
    var g2 = x2.createLinearGradient(0, 0, 0, 256);
    g2.addColorStop(0, 'rgba(255,255,255,0)');
    g2.addColorStop(.18, 'rgba(255,255,255,.75)');
    g2.addColorStop(.55, 'rgba(255,255,255,.95)');
    g2.addColorStop(.9, 'rgba(255,255,255,.35)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    x2.fillStyle = g2;
    /* 中间亮、两侧渐隐的竖条 */
    var gx2 = x2.createLinearGradient(0, 0, 64, 0);
    gx2.addColorStop(0, 'rgba(255,255,255,0)');
    gx2.addColorStop(.45, 'rgba(255,255,255,1)');
    gx2.addColorStop(.55, 'rgba(255,255,255,1)');
    gx2.addColorStop(1, 'rgba(255,255,255,0)');
    x2.fillRect(0, 0, 64, 256);
    x2.globalCompositeOperation = 'destination-in';
    x2.fillStyle = gx2;
    x2.fillRect(0, 0, 64, 256);
    var tex = new T.CanvasTexture(c);
    var mat = new T.MeshBasicMaterial({
      map: tex, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false, opacity: .5
    });
    var hgt = (bodyH + neckH) * .92;
    var pl = new T.Mesh(new T.PlaneGeometry(baseR * .55, hgt), mat);
    pl.position.set(-baseR * .46, (bodyH + neckH) * .5, baseR * .72);
    g.add(pl);
  })();

  /* 玻璃轮廓线（引擎级）：底环 + 颈下环 + 两条母线 */
  (function () {
    var shR2 = neckR * 1.55, shT2 = .78;
    function ring(yy, rr, op) {
      var tone = lineTone(rr, op);
      op = tone.op;
      var pts = [], kk;
      for (kk = 0; kk <= 56; kk++) {
        var aa = kk / 56 * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(aa) * rr, yy, Math.sin(aa) * rr));
      }
      g.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts.slice(0, 56)),
        new T.LineBasicMaterial({ color: tone.color, transparent: true, opacity: op })));
    }
    ring(.5, baseR, .5);
    ring(bodyH + .5, neckR, .6);
    ring(bodyH * shT2 + .5, shR2, .34);
    ring(bodyH + .5 + neckH, neckR, .65);
    [-1, 1].forEach(function (sgn) {
      var vp = [new T.Vector3(sgn * baseR, .5, 0),
                new T.Vector3(sgn * neckR, bodyH + .5, 0)];
      g.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(vp),
        new T.LineBasicMaterial({ color: 0x7f9fb8, transparent: true, opacity: .42 })));
    });
  })();

  g.position.set(x, y0, z);
  if (o.name) K.tag(g, o.name, o.desc || '');
  world.add(g);
  return g;
};

/* 试管（圆底，任意方向） */
K.testTube = function (o) {
  o = o || {};
  var r = o.r || 1.2, h = o.h || 12;
  var pos = o.pos || [0, 0, 0], dir = o.dir || [0, 1, 0];
  var liq = o.liquid || 0, liqCol = o.liquidCol || 0x3a86c8;
  var pts = [new T.Vector2(.05, 0)];
  var i;
  for (i = 1; i <= 6; i++) {
    var a = (i / 6) * Math.PI / 2;
    pts.push(new T.Vector2(r * Math.sin(a), r * (1 - Math.cos(a))));
  }
  pts.push(new T.Vector2(r, h));
  var geo = new T.LatheGeometry(pts, 32);
  var m = new T.Mesh(geo, M.glass);
  m.castShadow = false;
  addFresnel(m, 1.02);
  var d = V(dir[0], dir[1], dir[2]).normalize();
  var q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  m.applyQuaternion(q);
  m.position.set(pos[0], pos[1], pos[2]);
  var g = new T.Group();
  g.add(m);
  if (liq > .02) {
    var lp = [new T.Vector2(.05, 0)];
    for (i = 1; i <= 6; i++) {
      var a2 = (i / 6) * Math.PI / 2;
      lp.push(new T.Vector2((r - .1) * Math.sin(a2), r * (1 - Math.cos(a2))));
    }
    lp.push(new T.Vector2(r - .1, h * liq * .95));
    lp.push(new T.Vector2(.05, h * liq * .95));
    var lm = new T.Mesh(new T.LatheGeometry(lp, 24),
      new T.MeshPhysicalMaterial({ color: liqCol, roughness: .25, transmission: .3, thickness: 1.5, transparent: true, opacity: .9 }));
    lm.applyQuaternion(q);
    lm.position.set(pos[0], pos[1], pos[2]);
    g.add(lm);
  }
  world.add(g);
  return g;
};

/* 烧杯 */
K.beaker = function (o) {
  o = o || {};
  var r = o.r || 5, h = o.h || 10, x = o.x || 0, z = o.z || 0;
  var g = K.glassCyl({ r: r, h: h, x: x, z: z, y0: o.y0 || 0 });
  var spout = new T.Mesh(new T.SphereGeometry(r * .12, 10, 8), M.glass);
  spout.scale.set(1.6, .7, 1);
  spout.position.set(x + r, (o.y0 || 0) + h - .3, z);
  g.add(spout);
  return g;
};

/* 软管/玻璃管：沿折线 */
K.tube = function (pts, r, o) {
  o = o || {};
  r = r || .35;
  var arr = [];
  for (var i = 0; i < pts.length; i++) arr.push(V(pts[i][0], pts[i][1], pts[i][2]));
  var curve = new T.CatmullRomCurve3(arr);
  var mat = o.rubber
    ? new T.MeshStandardMaterial({ color: o.color || 0x39414c, roughness: .8 })
    : new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .1, transmission: .85, thickness: .3, ior: 1.45, transparent: true, opacity: .5, side: T.DoubleSide });
  var m = new T.Mesh(new T.TubeGeometry(curve, Math.max(24, pts.length * 6), r, 10), mat);
  m.castShadow = !o.rubber;
  if (!o.rubber) addFresnel(m, 1.06);
  world.add(m);
  return m;
};

/* 金属杆（两点间） */
K.rod = function (p0, p1, r, o) {
  o = o || {};
  var a = V(p0[0], p0[1], p0[2]), b = V(p1[0], p1[1], p1[2]);
  var d = new T.Vector3().subVectors(b, a);
  var len = d.length();
  var m = new T.Mesh(new T.CylinderGeometry(r, r, len, 14), o.mat || M.iron);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  world.add(m);
  return m;
};

K.box = function (o) {
  o = o || {};
  var m = new T.Mesh(new T.BoxGeometry(o.sx, o.sy, o.sz), o.mat || new T.MeshStandardMaterial({ color: o.color || 0x8f98a2, roughness: .6 }));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  world.add(m);
  return m;
};

K.sphere = function (o) {
  o = o || {};
  var m = new T.Mesh(new T.SphereGeometry(o.r || 1, 20, 14), o.mat || new T.MeshStandardMaterial({ color: o.color || 0xcc4030, roughness: .5 }));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  world.add(m);
  return m;
};

K.cyl = function (o) {
  o = o || {};
  var m = new T.Mesh(new T.CylinderGeometry(o.rt || o.r || 1, o.rb || o.r || 1, o.h || 1, o.seg || 28), o.mat || M.metal);
  m.position.set(o.x || 0, (o.y0 || 0) + (o.h || 1) / 2, o.z || 0);
  world.add(m);
  return m;
};

/* 接触软阴影贴片 */
K.blob = function (o) {
  o = o || {};
  var m = new T.Mesh(new T.PlaneGeometry((o.r || 5) * 2.3, (o.r || 5) * 2.3),
    new T.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(o.x || 0, (o.y || 0) + .04, o.z || 0);
  world.add(m);
  return m;
};

/* 火焰（自动摇曳；obj.visible 控制明灭） */
K.flame = function (o) {
  o = o || {};
  var mat = new T.SpriteMaterial({ map: FLAME_TEX, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, color: o.color || 0xffffff });
  var sp = new T.Sprite(mat);
  var s = o.s || 2;
  sp.scale.set(s * 1.4, s * 2.6, 1);
  sp.position.set(o.x || 0, (o.y || 0) + s * .9, o.z || 0);
  world.add(sp);
  var light = new T.PointLight(0xffa050, o.light === undefined ? .9 : o.light, s * 14, 2);
  light.position.copy(sp.position);
  world.add(light);
  var rec = { sp: sp, light: light, base: s, phase: Math.random() * 9, lit: true };
  flames.push(rec);
  return rec;
};

/* 标注（HTML 覆盖层，随 3D 投影） */
K.label = function (anchor, text, dx, dy, cls) {
  var el = document.createElement('div');
  el.className = 'lab-label' + (cls ? ' ' + cls : '');
  el.textContent = text;
  labelWrap.appendChild(el);
  var rec = { el: el, p: V(anchor[0], anchor[1], anchor[2]), dx: dx || 14, dy: dy || -14 };
  labels.push(rec);
  return rec;
};


/* Sprite 标注：CanvasTexture 贴图，随距离缩放，始终朝向相机 */
K.spriteLabel = function (pos, text, o) {
  o = o || {};
  var fs = o.fs || 44;
  var wUnits = o.w || 6.4;
  var font = '600 ' + fs + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  var c = document.createElement('canvas');
  var m0 = c.getContext('2d');
  m0.font = font;
  var tw = m0.measureText(text).width;
  var padX = 18, h = fs + 26;
  c.width = Math.ceil(tw + padX * 2);
  c.height = h;
  var x = c.getContext('2d');
  x.font = font;
  var r = 10;
  x.beginPath();
  x.moveTo(r, 0); x.lineTo(c.width - r, 0);
  x.quadraticCurveTo(c.width, 0, c.width, r);
  x.lineTo(c.width, h - r); x.quadraticCurveTo(c.width, h, c.width - r, h);
  x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
  x.fillStyle = o.bg || 'rgba(255,255,255,.96)';
  x.fill();
  x.strokeStyle = 'rgba(58,92,126,.5)';
  x.lineWidth = 2;
  x.stroke();
  x.fillStyle = o.color || '#16324a';
  x.textBaseline = 'middle';
  x.fillText(text, padX, h / 2 + 1);

  var tex = new T.CanvasTexture(c);
  tex.minFilter = T.LinearFilter;
  var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  var sp = new T.Sprite(mat);
  var aspect = c.height / c.width;
  sp.scale.set(wUnits, wUnits * aspect, 1);
  spriteLabels.push({ sp: sp, w: wUnits, h: wUnits * aspect, ref: 38 });
  sp.position.set(pos[0], pos[1], pos[2]);
  if (o.parent) o.parent.add(sp); else world.add(sp);
  return {
    sprite: sp,
    set: function (t, color) {
      if (t === undefined) return;
      m0.font = font;
      var w2 = m0.measureText(t).width;
      c.width = Math.ceil(w2 + padX * 2);
      x.font = font;
      x.clearRect(0, 0, c.width, c.height);
      x.beginPath();
      x.moveTo(r, 0); x.lineTo(c.width - r, 0);
      x.quadraticCurveTo(c.width, 0, c.width, r);
      x.lineTo(c.width, h - r); x.quadraticCurveTo(c.width, h, c.width - r, h);
      x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r);
      x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
      x.closePath();
      x.fillStyle = o.bg || 'rgba(255,255,255,.96)';
      x.fill();
      x.strokeStyle = 'rgba(58,92,126,.5)';
      x.lineWidth = 2; x.stroke();
      x.fillStyle = color || o.color || '#2a4159';
      x.textBaseline = 'middle';
      x.fillText(t, padX, h / 2 + 1);
      tex.needsUpdate = true;
      sp.scale.set(wUnits, wUnits * (c.height / c.width), 1);
    }
  };
};


/* 玻璃旋塞（酸式滴定管）：横向磨口塞 + 侧向手柄 + 卡环 + 尖嘴 */
K.stopcock = function (o) {
  o = o || {};
  var x = o.x || 0, z = o.z || 0, y = o.y || 0;
  var g = new T.Group();
  var R = o.r || .78;
  /* 磨口玻璃：半透白，边界靠轮廓线读出来 */
  var frosted = new T.MeshPhysicalMaterial({
    color: 0xeef5fa, metalness: 0, roughness: .32, ior: 1,
    transmission: .55, thickness: .3, transparent: true, opacity: .88,
    side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.4
  });
  var wire = new T.MeshStandardMaterial({ color: 0xc3cad2, roughness: .28, metalness: .92, envMapIntensity: 1.4 });

  /* 横向塞壳 */
  var barrel = new T.Mesh(new T.CylinderGeometry(R, R, R * 2.1, 32), frosted);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);

  /* 塞壳两端端面（深色细环，界定塞壳范围） */
  [1, -1].forEach(function (sgn) {
    var cap = new T.Mesh(new T.TorusGeometry(R * .99, R * .045, 8, 32),
      new T.MeshBasicMaterial({ color: 0x8fa3b5, transparent: true, opacity: .75 }));
    cap.rotation.y = Math.PI / 2;
    cap.position.x = sgn * R * 1.25;
    g.add(cap);
  });

  /* 磨口塞（外端略细） */
  var plug = new T.Mesh(new T.CylinderGeometry(R * .74, R * .92, R * 2.7, 28), frosted);
  plug.rotation.z = Math.PI / 2;
  plug.position.x = R * .1;
  g.add(plug);

  /* 塞孔暗芯 */
  var bore = new T.Mesh(new T.CylinderGeometry(R * .2, R * .2, R * 2.7, 14),
    new T.MeshStandardMaterial({ color: 0x33506a, roughness: .5 }));
  g.add(bore);

  /* 左侧端盖（玻璃平头） */
  var capL = new T.Mesh(new T.CylinderGeometry(R * .96, R * .96, R * .22, 26), frosted);
  capL.rotation.z = Math.PI / 2;
  capL.position.x = -R * 1.36;
  g.add(capL);

  /* 右侧细弹簧卡子（只有放液一侧有） */
  var clip = new T.Mesh(new T.TorusGeometry(R * .98, R * .028, 8, 30), wire);
  clip.rotation.y = Math.PI / 2;
  clip.position.x = R * 1.36;
  g.add(clip);

  /* 侧向手柄（扁桨） + 圆头 */
  var handle = new T.Mesh(new T.BoxGeometry(R * 1.35, R * .3, R * .38), frosted);
  handle.position.set(R * 1.9, R * .06, 0);
  handle.rotation.y = .18;
  g.add(handle);
  var knob = new T.Mesh(new T.SphereGeometry(R * .26, 16, 12),
    new T.MeshPhysicalMaterial({ color: 0xf2f7fb, roughness: .35, ior: 1, transmission: .3, thickness: .3, transparent: true, opacity: .96 }));
  knob.position.set(R * 2.5, R * .08, R * .08);
  g.add(knob);

  /* 尖嘴（出口细锥） */
  var tip = new T.Mesh(new T.CylinderGeometry(R * .5, R * .12, R * 2.1, 20, 1, true), frosted);
  tip.position.y = -R * 1.9;
  g.add(tip);
  var tipRing = new T.Mesh(new T.TorusGeometry(R * .5, R * .028, 8, 24), frosted);
  tipRing.rotation.x = Math.PI / 2;
  tipRing.position.y = -R * .9;
  g.add(tipRing);

  g.position.set(x, y, z);
  world.add(g);
  return g;
};

/* 真实化学实验台：环氧台面（挡水槽）+ 前挡板 + 柜门/拉手 + 踢脚 + 侧板 */
K.bench = function (w, d) {
  w = w || 60; d = d || 34;
  var g = new T.Group();
  var TOP_H = 2.4, H = 13.2;

  var topMat = new T.MeshPhysicalMaterial({
    color: 0x171d21, roughness: .42, metalness: .06, envMapIntensity: .45,
    clearcoat: .55, clearcoatRoughness: .3, map: benchTexture()
  });
  var top = new T.Mesh(new T.BoxGeometry(w + 2, TOP_H, d + 2), topMat);
  top.position.y = -TOP_H / 2;
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);

  /* 挡水槽（四周一圈下凹细槽） */
  var gm = new T.MeshStandardMaterial({ color: 0x07090b, roughness: .85 });
  var gi = 2.4, gw = .36;
  function groove(px, pz, sx, sz) {
    var m = new T.Mesh(new T.BoxGeometry(sx, .2, sz), gm);
    m.position.set(px, .02, pz);
    g.add(m);
  }
  groove(0, d / 2 + 1 - gi, (w / 2 + 1 - gi) * 2, gw);
  groove(0, -d / 2 - 1 + gi, (w / 2 + 1 - gi) * 2, gw);
  groove(w / 2 + 1 - gi, 0, gw, (d / 2 + 1 - gi) * 2);
  groove(-w / 2 - 1 + gi, 0, gw, (d / 2 + 1 - gi) * 2);

  /* 台面前缘倒角 */
  var edge = new T.Mesh(new T.BoxGeometry(w + 2, .24, .22),
    new T.MeshStandardMaterial({ color: 0x59666f, roughness: .3, metalness: .45 }));
  edge.position.set(0, -.1, d / 2 + 1);
  g.add(edge);

  /* 前挡板 */
  var apron = new T.Mesh(new T.BoxGeometry(w - 1, 3.2, .7),
    new T.MeshStandardMaterial({ color: 0xcfd6de, roughness: .58, metalness: .05 }));
  apron.position.set(0, -TOP_H - 1.6, d / 2 - .5);
  apron.castShadow = true;
  g.add(apron);

  /* 柜体 */
  var cabMat = new T.MeshPhysicalMaterial({ color: 0xdfe4ea, roughness: .55, metalness: .04, envMapIntensity: .4, clearcoat: .25, clearcoatRoughness: .4 });
  var cab = new T.Mesh(new T.BoxGeometry(w - 2.5, H - TOP_H - 3.2, d - 2.5), cabMat);
  cab.position.y = -TOP_H - 3.2 - (H - TOP_H - 3.2) / 2;
  cab.receiveShadow = true;
  g.add(cab);

  /* 柜门 + 拉手 */
  var doorCount = 3, doorW = (w - 6) / doorCount;
  var doorMat = new T.MeshPhysicalMaterial({ color: 0xe9edf2, roughness: .5, metalness: .03, clearcoat: .3, clearcoatRoughness: .35 });
  var handleMat = new T.MeshStandardMaterial({ color: 0xa9b2bb, roughness: .28, metalness: .9, envMapIntensity: 1.2 });
  for (var i = 0; i < doorCount; i++) {
    var dx = -(w - 6) / 2 + doorW / 2 + i * doorW;
    var dh = H - TOP_H - 5.2;
    var door = new T.Mesh(new T.BoxGeometry(doorW - .5, dh, .5), doorMat);
    door.position.set(dx, -TOP_H - 4.3 - dh / 2, d / 2 - 1.2);
    door.castShadow = true;
    g.add(door);
    var handle = new T.Mesh(new T.BoxGeometry(Math.min(6, doorW * .5), .42, .42), handleMat);
    handle.position.set(dx, -TOP_H - 5.6, d / 2 - .86);
    g.add(handle);
  }

  /* 踢脚 */
  var kick = new T.Mesh(new T.BoxGeometry(w - 6, 3.2, d - 5),
    new T.MeshStandardMaterial({ color: 0x2b3238, roughness: .75 }));
  kick.position.y = -H + 1.6;
  g.add(kick);

  /* 侧板 */
  [-1, 1].forEach(function (sgn) {
    var side = new T.Mesh(new T.BoxGeometry(.8, H - TOP_H - 3.2, d - 2.5), cabMat);
    side.position.set(sgn * (w - 3) / 2, -TOP_H - 3.2 - (H - TOP_H - 3.2) / 2, 0);
    g.add(side);
  });

  world.add(g);
  return g;
};


/* ---------------- 拾取交互：悬停提示 + 点击聚焦 ---------------- */
var ray = null, tipEl = null, hoverObj = null, camTween = null;
var spriteLabels = [];

K.tag = function (obj, name, desc) {
  if (obj) obj.userData.tag = { name: name, desc: desc || '' };
  return obj;
};

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'lab-tip';
  document.body.appendChild(tipEl);
  return tipEl;
}

function ndcFromEvent(e) {
  var r = cv.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * 2 - 1,
    y: -((e.clientY - r.top) / r.height) * 2 + 1,
    px: e.clientX, py: e.clientY
  };
}

function pickAt(e) {
  if (!ray) ray = new T.Raycaster();
  var n = ndcFromEvent(e);
  ray.setFromCamera(new T.Vector2(n.x, n.y), camera);
  var hits = ray.intersectObjects(world.children, true);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object;
    while (o && o !== world) {
      if (o.userData && o.userData.tag) return { tag: o.userData.tag, obj: o, point: hits[i].point };
      o = o.parent;
    }
  }
  return null;
}

function focusOn(obj) {
  var box = new T.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  var c = box.getCenter(new T.Vector3());
  var r = box.getSize(new T.Vector3()).length() * .5;
  camTween = {
    t: 0, dur: .55,
    from: { tx: cam.tx, ty: cam.ty, tz: cam.tz, dist: cam.dist },
    to: { tx: c.x, ty: c.y, tz: c.z, dist: Math.max(16, r * 3.1) }
  };
}

function updateLabelScale() {
  for (var i = 0; i < spriteLabels.length; i++) {
    var L = spriteLabels[i];
    var d = L.sp.position.distanceTo(camera.position);
    var k = Math.max(.6, Math.min(2.4, d / L.ref));
    L.sp.scale.set(L.w * k, L.h * k, 1);
  }
}

function updateTween(dt) {
  if (!camTween) return;
  camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
  var k = camTween.t, e = k < .5 ? 2 * k * k : -1 + (4 - 2 * k) * k;
  cam.tx = K.lerp(camTween.from.tx, camTween.to.tx, e);
  cam.ty = K.lerp(camTween.from.ty, camTween.to.ty, e);
  cam.tz = K.lerp(camTween.from.tz, camTween.to.tz, e);
  cam.dist = K.lerp(camTween.from.dist, camTween.to.dist, e);
  if (camTween.t >= 1) camTween = null;
}

function bindPick() {
  var down = null;
  cv.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', function (e) {
    if (!down) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;                     /* 拖动旋转不算点击 */
    var hit = pickAt(e);
    if (hit) focusOn(hit.obj);
  });
  cv.addEventListener('pointermove', function (e) {
    if (drag) { hideTip(); return; }
    if (cv.__pt && Date.now() - cv.__pt < 55) return;
    cv.__pt = Date.now();
    var hit = pickAt(e);
    var tip = ensureTip();
    if (hit) {
      hoverObj = hit.obj;
      tip.textContent = hit.tag.name + (hit.tag.desc ? ' · ' + hit.tag.desc : '');
      tip.style.display = 'block';
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      cv.style.cursor = 'pointer';
    } else {
      hoverObj = null;
      hideTip();
      cv.style.cursor = 'grab';
    }
  });
}

function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}


/* ---------------- 键盘操作 + 学习进度 ---------------- */
function courseKey() {
  var f = location.pathname.split('/').pop() || 'course';
  return 'gw:progress:' + f.replace('.html', '');
}

function saveProgress(step, done) {
  try {
    var rec = { step: step, done: !!done, at: Date.now() };
    localStorage.setItem(courseKey(), JSON.stringify(rec));
    localStorage.setItem('gw:last', JSON.stringify({ file: location.pathname.split('/').pop(), at: Date.now() }));
  } catch (e) {}
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(courseKey()) || 'null');
  } catch (e) { return null; }
}

function bindKeyboard() {
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { goStep(stepIdx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { goStep(stepIdx - 1); }
    else if (e.key === 'r' || e.key === 'R') { Object.assign(cam, CAM0); camTween = null; }
    else if (e.key === 'Escape') { hideTip(); }
  });
}

/* 顶部“上次看到第 N 步”提示（可点继续） */
function showResumeHint(rec) {
  if (!rec || !rec.step) return;
  var el = document.createElement('button');
  el.className = 'resume-hint';
  el.textContent = '上次看到第 ' + (rec.step + 1) + ' 步 · 继续';
  el.onclick = function () { goStep(rec.step); el.remove(); };
  var top = document.querySelector('.top');
  if (top) top.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.remove(); }, 12000);
}
/* ---------------- UI（沿用原面板逻辑） ---------------- */
var ui = {};

function boot(c) {
  cfg = c;
  state = c.state || (c.state = {});
  if (c.cam) {
    Object.assign(cam, c.cam);
    CAM0 = Object.assign({}, cam);
  }
  buildMaterials();
  init3d();
  document.title = c.title + ' · 格物实验室';
  document.querySelector('.chip').textContent = c.chip;
  document.querySelector('.hint').textContent = c.hint || '拖空白处旋转视角 · 滚轮缩放';

  labelWrap = document.createElement('div');
  labelWrap.className = 'lab-labels';
  document.body.appendChild(labelWrap);

  ui.idx = document.getElementById('sIdx');
  ui.name = document.getElementById('sName');
  ui.title = document.getElementById('sTitle');
  ui.ask = document.getElementById('sAsk');
  ui.body = document.getElementById('sBody');
  ui.ctrls = document.getElementById('sCtrls');
  ui.ro = document.getElementById('ro');
  ui.dots = document.getElementById('dots');
  ui.prev = document.getElementById('prev');
  ui.next = document.getElementById('next');

  ui.ro.innerHTML = (c.reads || []).map(function (r) {
    return '<div><label>' + r[1] + '</label><b data-k="' + r[0] + '">—</b></div>';
  }).join('');

  ui.body.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-opt]');
    if (opt && quizPick === null) {
      quizPick = opt.getAttribute('data-opt');
      renderPanel();
      return;
    }
    if (e.target.id === 'again') { quizData = null; quizPick = null; state._quiz = null; renderPanel(); }
  });

  ui.prev.onclick = function () { goStep(stepIdx - 1); };
  ui.next.onclick = function () { goStep(stepIdx + 1); };
  document.getElementById('resetView').onclick = function () {
    Object.assign(cam, CAM0);
  };

  bindPointer();
  bindPick();
  bindKeyboard();
  resize();
  window.addEventListener('resize', resize);

  if (cfg.scene && cfg.scene.setup) cfg.scene.setup();
  window.__labDebug = { scene: scene, M: M, renderer: renderer, cam: cam, camera: camera };
  goStep(0);
  requestAnimationFrame(loop);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

function goStep(i) {
  stepIdx = Math.max(0, Math.min(i, cfg.steps.length - 1));
  quizPick = null;
  quizData = null;
  var s = cfg.steps[stepIdx];
  /* 记录切换前的数值，apply 后对突变项做补间（避免"一下多出来/一下少了"） */
  var before = {};
  Object.keys(state).forEach(function (k) {
    if (typeof state[k] === 'number') before[k] = state[k];
  });
  if (s.apply) s.apply(state);
  saveProgress(stepIdx, stepIdx === cfg.steps.length - 1);
  state.__ramps = [];
  Object.keys(before).forEach(function (k) {
    if (k.charAt(0) === '_') return;
    var now = state[k];
    if (typeof now !== 'number') return;
    var d = Math.abs(now - before[k]);
    if (d < 1e-6) return;
    /* 变化幅度超过 12% 且不是计数器类，才做补间 */
    var base = Math.max(1e-6, Math.abs(before[k]));
    if (d / base < .12 && d < .5) return;
    state.__ramps.push({ k: k, from: before[k], to: now, t: 0, dur: .55 });
    state[k + 'T'] = now;   /* 目标值快照：面板读数用它，避免显示补间中间值 */
    state[k] = before[k];
  });
  renderPanel();
}

/* 推进状态补间（缓入缓出） */
function updateRamps(dt) {
  var r = state.__ramps;
  if (!r || !r.length) return;
  for (var i = r.length - 1; i >= 0; i--) {
    var it = r[i];
    it.t = Math.min(1, it.t + dt / it.dur);
    var e = it.t < .5 ? 2 * it.t * it.t : -1 + (4 - 2 * it.t) * it.t;
    state[it.k] = it.from + (it.to - it.from) * e;
    if (it.t >= 1) r.splice(i, 1);
  }
}

function renderPanel() {
  var s = cfg.steps[stepIdx];
  var aside = document.querySelector('aside');
  if (s.quiz) aside.classList.add('quiz'); else aside.classList.remove('quiz');
  ui.idx.textContent = String(stepIdx + 1).padStart(2, '0') + ' / ' + String(cfg.steps.length).padStart(2, '0');
  ui.name.textContent = s.name;
  ui.title.textContent = s.title;
  ui.ask.textContent = s.ask || '';
  ui.prev.disabled = stepIdx === 0;
  ui.next.disabled = stepIdx === cfg.steps.length - 1;

  if (s.quiz) {
    if (!quizData) quizData = cfg.quiz(state);
    var d = quizData;
    var html = '<p>' + d.q + '</p><div>';
    d.opts.forEach(function (o) {
      var cls = 'qopt';
      if (quizPick !== null) {
        if (o === d.ans) cls += ' ok';
        else if (o === quizPick) cls += ' no';
      }
      html += '<button class="' + cls + '" data-opt="' + o + '">' + o + '</button>';
    });
    html += '</div>';
    if (quizPick !== null) {
      html += '<p class="fb ' + (quizPick === d.ans ? 'ok' : 'no') + '">' +
        (quizPick === d.ans ? '对了。' : '再想想。') + '正确答案：<b>' + d.ans + '</b>' + (d.why ? '。' + d.why : '') +
        '</p><button id="again">换一题</button>';
    }
    ui.body.innerHTML = html;
    ui.ctrls.innerHTML = '';
  } else {
    ui.body.innerHTML = s.body || '';
    renderControls(s);
  }

  ui.dots.innerHTML = '';
  cfg.steps.forEach(function (_, i) {
    var b = document.createElement('button');
    b.className = 'dot' + (i === stepIdx ? ' on' : '');
    b.title = cfg.steps[i].name;
    b.onclick = function () { goStep(i); };
    ui.dots.appendChild(b);
  });
}

function renderControls(s) {
  if (!s.controls || !s.controls.length) { ui.ctrls.innerHTML = ''; return; }
  var html = '';
  s.controls.forEach(function (c, i) {
    if (c.type === 'range') {
      html += '<div class="ctl"><div class="ctlhead"><span>' + c.label + '</span><b data-cv="' + i + '">' + state[c.key] + '</b></div>' +
        '<input type="range" data-ci="' + i + '" min="' + c.min + '" max="' + c.max + '" step="' + (c.step || 1) + '" value="' + state[c.key] + '"></div>';
    } else {
      html += '<button class="act" data-ci="' + i + '">' + c.label + '</button>';
    }
  });
  ui.ctrls.innerHTML = html;
  ui.ctrls.querySelectorAll('input[type=range]').forEach(function (el) {
    el.oninput = function () {
      var c = s.controls[+el.getAttribute('data-ci')];
      state[c.key] = parseFloat(el.value);
      var lab = ui.ctrls.querySelector('[data-cv="' + el.getAttribute('data-ci') + '"]');
      if (lab) lab.textContent = state[c.key];
      if (c.onChange) c.onChange(state);
    };
  });
  ui.ctrls.querySelectorAll('button.act').forEach(function (el) {
    el.onclick = function () {
      var c = s.controls[+el.getAttribute('data-ci')];
      if (c.onClick) c.onClick(state);
      renderPanel();
    };
  });
}

function updateReads() {
  if (!cfg.values) return;
  var v = cfg.values(state);
  ui.ro.querySelectorAll('b[data-k]').forEach(function (b) {
    var k = b.getAttribute('data-k');
    if (v[k] !== undefined) b.textContent = v[k];
  });
}

/* ---------------- 交互 ---------------- */
var drag = null;

function bindPointer() {
  cv.addEventListener('pointerdown', function (e) {
    var r = cv.getBoundingClientRect();
    drag = { x: e.clientX - r.left, y: e.clientY - r.top, yaw: cam.yaw, pitch: cam.pitch };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var r = cv.getBoundingClientRect();
    cam.yaw = drag.yaw + (e.clientX - r.left - drag.x) * .006;
    cam.pitch = Math.max(-.15, Math.min(.95, drag.pitch + (e.clientY - r.top - drag.y) * .004));
  });
  cv.addEventListener('pointerup', function () { drag = null; });
  cv.addEventListener('pointercancel', function () { drag = null; });
  cv.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.dist = Math.max(30, Math.min(260, cam.dist + e.deltaY * .12));
  }, { passive: false });
}

function updateCamera() {
  var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(
    cam.tx + cam.dist * cp * Math.sin(cam.yaw),
    cam.ty + cam.dist * sp,
    cam.tz + cam.dist * cp * Math.cos(cam.yaw));
  camera.lookAt(cam.tx, cam.ty, cam.tz);
}

function updateFlames(dt) {
  for (var i = 0; i < flames.length; i++) {
    var f = flames[i];
    var flick = 1 + Math.sin(NOW * 11 + f.phase) * .09 + Math.sin(NOW * 23 + f.phase * 2) * .05;
    var target = f.lit ? 1 : 0;
    f.lv = f.lv === undefined ? target : f.lv + (target - f.lv) * Math.min(1, dt * 4.5);
    if (Math.abs(target - f.lv) < .01) f.lv = target;
    var lv = f.lv;
    f.sp.scale.set(f.base * 1.4 * flick * (.35 + .65 * lv), f.base * 2.6 * (2 - flick) * (.35 + .65 * lv), 1);
    f.sp.material.opacity = lv * .95;
    f.light.intensity = lv * .85 * flick;
    f.sp.visible = lv > .005;
  }
}

var v3tmp = null;

function updateLabels() {
  if (!v3tmp) v3tmp = new T.Vector3();
  for (var i = 0; i < labels.length; i++) {
    var L = labels[i];
    v3tmp.copy(L.p).project(camera);
    var x = (v3tmp.x * .5 + .5) * W + L.dx;
    var y = (-v3tmp.y * .5 + .5) * H + L.dy;
    var vis = v3tmp.z < 1;
    L.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    L.el.style.display = vis ? 'block' : 'none';
  }
}

function loop(t) {
  var dt = Math.min(50, t - lastT) / 1000;
  dt = Math.min(dt, .05);   /* 单帧最多推进 50ms，避免缓动被一步吃掉 */
  lastT = t;
  NOW = t / 1000;
  updateTween(dt);
  if (cfg.scene && cfg.scene.update) cfg.scene.update(dt, state);
  updateRamps(dt);
  updateFlames(dt);
  updateLabelScale();
  updateCamera();
  renderer.render(scene, camera);
  updateLabels();
  updateReads();
  requestAnimationFrame(loop);
}


/* 统一改液体颜色：着色器（uShallow/uDeep）与普通材质都兼容 */
K.setLiquidColor = function (obj, col, deepK) {
  if (!obj) return;
  var m = obj.material || obj;
  if (!m) return;
  var c = new T.Color(col);
  if (m.uniforms && m.uniforms.uShallow) {
    m.uniforms.uShallow.value.copy(c);
    m.uniforms.uDeep.value.copy(c).multiplyScalar(deepK === undefined ? .55 : deepK);
  } else if (m.color) {
    m.color.copy(c);
  }
  /* 同一瓶内的附属层也要跟着变：贴壁薄壳、液面片
     （之前薄壳颜色写死在创建时，导致"溶液已无色、边缘还是红的"） */
  var host = obj.isMesh ? obj.parent : null;
  if (host) {
    var shell = host.getObjectByName('liquidShell');
    if (shell && shell.material && shell.material.color) {
      shell.material.color.copy(c).multiplyScalar(.42);
    }
    var surf = host.getObjectByName('liquidSurface');
    if (surf && surf.material && surf.material.color) {
      surf.material.color.copy(c).multiplyScalar(.9);
    }
  }
};


/* 缓动工具：把 state 值缓变成显示值（所有变化都走这里，避免突变） */
K.ez = function (state, key, dt, speed) {
  var tk = key + '$';
  if (state[tk] === undefined) {
    var v0 = state[key];
    state[tk] = (typeof v0 === 'number') ? v0 : 0;
  }
  var target = state[key];
  if (typeof target !== 'number') return state[tk];
  var k = Math.min(1, dt * (speed || 3));
  state[tk] += (target - state[tk]) * k;
  if (Math.abs(target - state[tk]) < 1e-4) state[tk] = target;
  return state[tk];
};

/* 火焰强度缓动（点燃/熄灭不是瞬间开合） */
K.flameLevel = function (rec, target, dt, speed) {
  if (!rec) return;
  rec.lv = rec.lv === undefined ? 0 : rec.lv;
  rec.lv += (target - rec.lv) * Math.min(1, dt * (speed || 2.5));
  rec.lit = rec.lv > .01;
  rec.sp.material.opacity = rec.lv * .95;
  rec.light.intensity = rec.lv * .85;
};


/* 整件物体的淡入淡出（避免"突然出现/突然消失"） */
K.fadeShow = function (obj, on, dt, speed) {
  if (!obj) return;
  if (obj.userData.__a === undefined) obj.userData.__a = on ? 1 : 0;
  var target = on ? 1 : 0;
  var a = obj.userData.__a + (target - obj.userData.__a) * Math.min(1, dt * (speed || 6));
  if (Math.abs(target - a) < .01) a = target;
  obj.userData.__a = a;
  obj.visible = a > .01;
  obj.traverse(function (m) {
    if (!m.material) return;
    var mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(function (mat) {
      if (mat.__baseOp === undefined) mat.__baseOp = (mat.opacity === undefined ? 1 : mat.opacity);
      if (!mat.transparent && a < .995) { mat.transparent = true; mat.needsUpdate = true; }
      mat.opacity = mat.__baseOp * a;
    });
  });
};

/* 设置液位：几何按基准高度 1 缩放，同时同步液体着色器的高度范围 */
K.setLiquidLevel = function (mesh, h, y0) {
  if (!mesh) return;
  mesh.scale.y = Math.max(.001, h);
  var m = mesh.material;
  if (m && m.uniforms && m.uniforms.uTop) {
    m.uniforms.uBot.value = y0;
    m.uniforms.uTop.value = y0 + h;
  }
};
K.boot = boot;
K.T = function () { return T; };
K.scene = function () { return scene; };
K.M = function () { return M; };
K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
K.lerp = function (a, b, t) { return a + (b - a) * t; };
K.rnd = function (a, b) { return a + Math.random() * (b - a); };
Object.defineProperty(K, 'now', { get: function () { return NOW; } });
Object.defineProperty(K, 'cam', { get: function () { return cam; } });

return K;
})();
