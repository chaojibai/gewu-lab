# 渲染配方与代码片段

## 材质参数表（本项目实测值，可直接用）

```js
// 玻璃（壳层路线：不靠 transmission 造透明）
const glass = new MeshPhysicalMaterial({
  color: 0xf2f8fc, metalness: 0, roughness: .05,
  transparent: true, opacity: .3,
  side: DoubleSide, depthWrite: false,
  clearcoat: .7, clearcoatRoughness: .08,
  envMapIntensity: 1.8, specularIntensity: 1.2
});

// 磨砂玻璃（旋塞、磨口件）
const frosted = new MeshPhysicalMaterial({
  color: 0xeef5fa, metalness: 0, roughness: .32, ior: 1,
  transmission: .55, thickness: .3, transparent: true, opacity: .88,
  side: DoubleSide, depthWrite: false, envMapIntensity: 1.4
});

// 漆面金属（仪器外壳、支架）
const painted = new MeshStandardMaterial({ color: 0x39424c, roughness: .55, metalness: .05, clearcoat: .35, clearcoatRoughness: .06 });
// 亮面塑料/陶瓷（pH 计外壳、台面衬板）
const glossyPlastic = new MeshPhysicalMaterial({ color: 0xe7ecf2, roughness: .42, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 });
// 拉丝钢（夹子、卡环、旋钮）
const steel = new MeshStandardMaterial({ color: 0xaab2ba, roughness: .32, metalness: .9, envMapIntensity: 1.25 });
// 铸铁（铁架台）
const iron = new MeshStandardMaterial({ color: 0x5a636e, roughness: .45, metalness: .8, envMapIntensity: 1.0 });
// 环氧树脂台面（深色 + 清漆）
const bench = new MeshPhysicalMaterial({ color: 0x0c1114, roughness: .46, metalness: .12, envMapIntensity: .3, clearcoat: .55, clearcoatRoughness: .3, map: benchTexture() });
```

## 环境贴图（影棚）

```js
function makeEnvMap() {
  const pmrem = new PMREMGenerator(renderer);
  const env = new Scene();
  // 房间盒
  env.add(new Mesh(new BoxGeometry(26, 14, 26),
    new MeshStandardMaterial({ color: 0xf2f4f7, side: BackSide, roughness: .95 })));
  // 顶部主灯板（emissiveIntensity 是关键，太低玻璃没高光）
  const light = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 14 });
  const main = new Mesh(new PlaneGeometry(10, 10), light);
  main.position.set(0, 10.8, 0); main.rotation.x = Math.PI / 2;
  env.add(main);
  scene.environment = pmrem.fromScene(env, .04).texture;
  pmrem.dispose();
}
```

## 液体片元着色器（完整）

```js
function liquidMaterial(col, yBot, yTop, opts = {}) {
  const base = new Color(col);
  return new ShaderMaterial({
    uniforms: {
      uBot: { value: yBot }, uTop: { value: yTop },
      uDeep: { value: base.clone().multiplyScalar(opts.deepK ?? .62) },
      uShallow: { value: base.clone() },
      uLight: { value: new Vector3(.45, .82, .35).normalize() },
      uOpacity: { value: 1 }
    },
    vertexShader: `
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uBot, uTop, uOpacity;
      uniform vec3 uDeep, uShallow, uLight;
      varying vec3 vW; varying vec3 vN;
      void main(){
        float h = clamp((vW.y - uBot) / max(0.001, uTop - uBot), 0.0, 1.0);
        vec3 base = mix(uDeep, uShallow, smoothstep(0.0, 1.0, h));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(normalize(vN), V), 0.0), 3.0);
        base *= (1.0 - fres * 0.52);            // 贴壁加深
        base += uShallow * (1.0 - fres) * 0.10; // 内部略亮
        float up = smoothstep(0.75, 0.98, normalize(vN).y);
        if (up > 0.01) {
          vec3 hv = normalize(uLight + V);
          float spec = pow(max(dot(normalize(vN), hv), 0.0), 110.0);
          base = mix(base, uShallow * 1.02, up * 0.45) + vec3(spec * 0.42);
        }
        gl_FragColor = vec4(base, mix(uOpacity, uOpacity * 0.74, up));
      }`,
    transparent: true, depthWrite: true
  });
}
```

改颜色时**必须**同时更新附属层：

```js
function setLiquidColor(mesh, col, deepK = .55) {
  const m = mesh.material, c = new Color(col);
  m.uniforms.uShallow.value.copy(c);
  m.uniforms.uDeep.value.copy(c).multiplyScalar(deepK);
  const host = mesh.parent;
  host.getObjectByName('liquidShell')?.material.color.copy(c).multiplyScalar(.42);
  host.getObjectByName('liquidSurface')?.material.color.copy(c).multiplyScalar(.9);
}
```

## 器皿轮廓线

```js
function ringLine(parent, cx, cz, y, r, op) {
  const tone = lineTone(r, op);          // 小器皿更实更深
  const pts = [];
  for (let i = 0; i < 56; i++) {
    const a = i / 56 * Math.PI * 2;
    pts.push(new Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  parent.add(new LineLoop(new BufferGeometry().setFromPoints(pts),
    new LineBasicMaterial({ color: tone.color, transparent: true, opacity: tone.op })));
}
function lineTone(r, base) {
  const k = Math.max(.45, Math.min(1.6, 5.2 / Math.max(1.2, r)));
  return { op: Math.min(.92, base * k), color: r < 3 ? 0x6b8ca8 : 0x7f9fb8 };
}
```

## 缓动三件套

```js
// 1) 帧步长钳制（放在渲染循环最前）
let dt = Math.min(50, t - last) / 1000;
dt = Math.min(dt, .05);

// 2) 状态跳变补间（切步骤时自动生成）
const before = {}; Object.keys(s).forEach(k => { if (typeof s[k] === 'number') before[k] = s[k]; });
apply(s);
s.__ramps = [];
Object.keys(before).forEach(k => {
  const now = s[k], from = before[k];
  if (typeof now !== 'number') return;
  const d = Math.abs(now - from);
  if (d < 1e-6 || (d / Math.max(1e-6, Math.abs(from)) < .12 && d < .5)) return;
  s.__ramps.push({ k, from, to: now, t: 0, dur: .55 }); s[k] = from;
});

// 3) 整件器材淡入淡出
function fadeShow(obj, on, dt, speed = 6) {
  if (obj.userData.__a === undefined) obj.userData.__a = on ? 1 : 0;
  const target = on ? 1 : 0;
  let a = obj.userData.__a + (target - obj.userData.__a) * Math.min(1, dt * speed);
  if (Math.abs(target - a) < .01) a = target;
  obj.userData.__a = a; obj.visible = a > .01;
  obj.traverse(m => {
    if (!m.material) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
      if (mat.__baseOp === undefined) mat.__baseOp = mat.opacity ?? 1;
      if (!mat.transparent && a < .995) { mat.transparent = true; mat.needsUpdate = true; }
      mat.opacity = mat.__baseOp * a;
    });
  });
}
```

## 交互（拾取 + 聚焦 + 提示）

```js
const ray = new Raycaster();
function pickAt(ev) {
  const r = cv.getBoundingClientRect();
  ray.setFromCamera(new Vector2((ev.clientX-r.left)/r.width*2-1, -((ev.clientY-r.top)/r.height)*2+1), camera);
  for (const hit of ray.intersectObjects(world.children, true)) {
    let o = hit.object;
    while (o && o !== world) { if (o.userData.tag) return { tag: o.userData.tag, obj: o }; o = o.parent; }
  }
  return null;
}
// 悬停：pointermove（节流 55ms）→ 显示 .lab-tip 气泡；点击（位移 <6px 才算点击）→ 相机缓动推到包围盒
```

---

## 几何火焰（不要再用贴图光斑）

canvas 贴图做火焰只能得到"光斑"，剪影永远不对。最终形态是**三层嵌套的 Lathe 火舌**：

```js
function flameGeo(r, h) {          // 底宽顶尖、中段外鼓的火舌剖面
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const bulge = Math.sin(Math.PI * Math.pow(t, .72));
    pts.push(new THREE.Vector2(Math.max(.01, r * (1 - t) * (.22 + .78 * bulge)), t * h));
  }
  return new THREE.LatheGeometry(pts, 20);
}
// 外焰(橙, .78) → 内焰(白黄, .92) → 焰心(淡蓝, .85)，renderOrder 递增
```

- 摇曳/呼吸用 `rotation.z = sin(t*2.6)*.06` + `scale.set(k,…)`，**不要写自定义 shader**
- three r147 上自定义 ShaderMaterial 一旦编译失败（哪怕只是漏声明一个 uniform），
  会中断渲染循环 → 场景"半渲染 + 大面积黑"，且控制台不一定报错
- 4 维顶点色（RGBA color attribute）同理危险，用嵌套几何代替
- 火焰的 `PointLight` 强度务必 `isFinite` 兜底（见 detail-rules 第十四节）
