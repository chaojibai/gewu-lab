/* 360° 机位截图（真 GPU）：node views-gpu.js <course.html> <prefix> [step]
   输出 front/hero/side/top/back/detail 六张 PNG 到 shots/。
   launch 参数沿用 build/shot-page.js 的本机验证配置（d3d11 真渲染）。 */
'use strict';
const path = require('path');
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();

const VIEWS = [
  { name: 'front',  yaw: 0.0,  pitch: 0.12, dist: 62, ty: 12 },
  { name: 'hero',   yaw: 0.55, pitch: 0.18, dist: 58, ty: 12 },
  { name: 'side',   yaw: 1.35, pitch: 0.14, dist: 58, ty: 12 },
  { name: 'top',    yaw: 0.5,  pitch: 0.72, dist: 60, ty: 8 },
  { name: 'back',   yaw: 2.6,  pitch: 0.2,  dist: 60, ty: 12 },
  { name: 'detail', yaw: 0.9,  pitch: 0.05, dist: 15, ty: 18, tx: 0 },
  { name: 'rig',    yaw: 0.2,  pitch: 0.08, dist: 9,  ty: 4.0, tx: -11 },
  { name: 'jar',    yaw: 0.3,  pitch: 0.12, dist: 11, ty: 3,  tx: 10 }
];

(async () => {
  const rel = process.argv[2], prefix = process.argv[3] || 'view';
  const step = parseInt(process.argv[4] || '0', 10);
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await page.waitForTimeout(1800);
  for (let i = 0; i < step; i++) { await page.click('#next'); await page.waitForTimeout(400); }
  await page.waitForTimeout(600);
  for (const v of VIEWS) {
    await page.evaluate((v) => {
      const cam = window.__labDebug.cam;
      cam.yaw = v.yaw; cam.pitch = v.pitch; cam.dist = v.dist; cam.ty = v.ty;
      if (v.tx !== undefined) cam.tx = v.tx;
    }, v);
    await page.waitForTimeout(260);
    const out = path.join('shots', `${prefix}-${v.name}.png`);
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
  await browser.close();
})();
