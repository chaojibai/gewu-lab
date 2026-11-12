'use strict';
/* 物理 21 门课件 360° 多机位审查（硬件 GPU，禁 SwiftShader）
   用法：node build/phys360.js [slug ...] [--step=1] [--out=phys360]
   输出：shots/<out>/<slug>-v<1..8>.png  +  shots/<out>/probe.json
   机位：正面 / 左45 / 右45 / 左90 / 右90 / 背面 / 俯视 / 细节特写
   探针：世界 AABB、NaN、出画器材、近白大平面、共享透明材质、WebGL 统计、报错。
*/
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const ALL = [
  'tianping-step', 'density-step', 'length-time-step', 'speed-step',
  'reflection-step', 'plane-mirror-step', 'convex-lens-step',
  'spring-step', 'friction-step', 'liquid-pressure-step', 'buoyancy-step', 'lever-step',
  'thermometer-step', 'ammeter-step', 'voltmeter-step', 'resistance-step', 'boiling-step',
  'series-parallel-step', 'ohm-step', 'solenoid-step', 'induction-step'
];

const args = process.argv.slice(2);
const stepArg = args.find(a => a.startsWith('--step='));
const outArg = args.find(a => a.startsWith('--out='));
const STEP = stepArg ? Number(stepArg.split('=')[1]) : 1;
const OUTNAME = outArg ? outArg.split('=')[1] : 'phys360';
const slugs = args.filter(a => !a.startsWith('--'));
const LIST = slugs.length ? slugs : ALL;
const OUT = path.join(ROOT, 'shots', OUTNAME);
fs.mkdirSync(OUT, { recursive: true });

/* 相对基准相机的偏移；pitch/dist 为 null 时沿用本步机位 */
const VIEWS = [
  { n: 'front',  dy: 0,     pitch: null, dist: 1 },
  { n: 'left45', dy: -0.65, pitch: null, dist: 1 },
  { n: 'right45',dy:  0.65, pitch: null, dist: 1 },
  { n: 'left90', dy: -1.55, pitch: null, dist: 1 },
  { n: 'right90',dy:  1.55, pitch: null, dist: 1 },
  { n: 'back',   dy:  3.14, pitch: null, dist: 1 },
  { n: 'top',    dy: 0,     pitch: 0.88, dist: 1.12 },
  { n: 'detail', dy: -0.22, pitch: null, dist: 0.74 }
];

function fileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
  });
  const results = [];
  for (const slug of LIST) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message || e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    const rel = path.join(ROOT, 'courses', 'physics-exp', slug + '.html');
    try {
      await page.goto(fileUrl(rel), { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2600);
      const nSteps = await page.evaluate(() => document.querySelectorAll('#dots .dot').length || 1);
      const target = Math.min(STEP, nSteps - 1);
      for (let i = 0; i < target; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(160); }
      await page.waitForTimeout(2100);           // 等步骤补间 + 相机飞位结束
      const base = await page.evaluate(() => {
        const c = window.__labDebug && window.__labDebug.cam;
        return c ? { yaw: c.yaw, pitch: c.pitch, dist: c.dist, tx: c.tx, ty: c.ty, tz: c.tz } : null;
      });
      if (!base) { errs.push('NO_CAM(__labDebug 缺失)'); }
      else {
        for (let i = 0; i < VIEWS.length; i++) {
          const v = VIEWS[i];
          await page.evaluate(({ b, v }) => {
            const c = window.__labDebug.cam;
            c.yaw = b.yaw + v.dy;
            c.pitch = v.pitch === null ? Math.min(.95, b.pitch + (v.n === 'detail' ? .10 : 0)) : v.pitch;
            c.dist = Math.max(8, b.dist * v.dist);
          }, { b: base, v });
          await page.waitForTimeout(420);
          await page.screenshot({ path: path.join(OUT, slug + '-v' + (i + 1) + '.png') });
        }
      }
      /* 几何 / 材质探针（在正面机位做一次） */
      const probe = await page.evaluate(() => {
        const d = window.__labDebug;
        if (!d || !d.scene) return { noScene: true };
        const T = window.THREE;
        const cam = d.camera || (d.renderer && d.renderer.camera);
        const box = new T.Box3(), v = new T.Vector3();
        let meshes = 0, nan = 0, offscreen = [], lowFloat = [], whitePlanes = [];
        const matUse = new Map();
        d.scene.updateMatrixWorld(true);
        d.scene.traverse(o => {
          if (!o.isMesh || !o.visible || !o.geometry) return;
          meshes++;
          const g = o.geometry;
          g.computeBoundingBox();
          if (!g.boundingBox) return;
          box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
          if ([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]
                .some(x => !isFinite(x))) { nan++; return; }
          /* 出画：AABB 八角全部落在 NDC 之外 */
          if (cam) {
            let inside = false;
            for (let a = 0; a < 8; a++) {
              v.set(a & 1 ? box.max.x : box.min.x, a & 2 ? box.max.y : box.min.y, a & 4 ? box.max.z : box.min.z).project(cam);
              if (v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15 && v.z > -1 && v.z < 1) { inside = true; break; }
            }
            if (!inside && box.max.x - box.min.x < 200) offscreen.push(o.name || o.geometry.type);
          }
          /* 明显悬空线索：整体底面高于台面 6 且体积不大（支架上的件会误报，仅作线索） */
          const size = box.getSize(new T.Vector3());
          if (box.min.y > 6 && size.y < 8 && size.x < 14 && size.z < 14) {
            lowFloat.push({ n: o.name || g.type, y: +box.min.y.toFixed(1) });
          }
          /* 近白大面积朝上平面 = 白板隐患 */
          const m = o.material;
          if (m && m.color && g.type === 'PlaneGeometry' && (g.parameters.width > 8 || g.parameters.height > 8)
              && m.color.r > .9 && m.color.g > .9 && m.color.b > .9) {
            whitePlanes.push({ n: o.name || g.type, w: g.parameters.width, h: g.parameters.height });
          }
          if (m && m.transparent) matUse.set(m.uuid, (matUse.get(m.uuid) || 0) + 1);
        });
        const sharedTransparent = [...matUse.values()].filter(n => n > 3).length;
        const ri = d.renderer && d.renderer.info;
        return {
          meshes, nan, offscreen: offscreen.slice(0, 14), offscreenN: offscreen.length,
          lowFloat: lowFloat.slice(0, 14), lowFloatN: lowFloat.length,
          whitePlanes: whitePlanes.slice(0, 8), sharedTransparent,
          calls: ri ? ri.render.calls : null, tris: ri ? ri.render.triangles : null,
          steps: document.querySelectorAll('#dots .dot').length,
          stepText: (document.getElementById('sIdx') || {}).textContent || ''
        };
      });
      results.push({ slug, base, probe, errs, steps: nSteps });
      console.log(`${slug.padEnd(20)} step=${target + 1}/${nSteps} meshes=${probe.meshes} tris=${probe.tris} err=${errs.length}`);
    } catch (e) {
      results.push({ slug, fatal: String(e.message || e).slice(0, 300), errs });
      console.log(`${slug.padEnd(20)} FATAL ${String(e.message || e).slice(0, 120)}`);
    }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2), 'utf-8');
  console.log('probe →', path.join(OUT, 'probe.json'));
  await browser.close();
})();
