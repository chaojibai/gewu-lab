/* 多机位验证：node views.js <course.html> <prefix> [step]
   一次输出 front / hero / side / top / back / detail 六张图。
   依赖：npm i playwright（用系统 Chrome） */
'use strict';
const path = require('path');
// 从当前工作目录解析 playwright（脚本可能不在项目内）
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
  { name: 'detail', yaw: 0.9,  pitch: 0.05, dist: 15, ty: 18, tx: 0 }
];

(async () => {
  const rel = process.argv[2], prefix = process.argv[3] || 'view';
  const step = parseInt(process.argv[4] || '0', 10);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await page.waitForTimeout(1500);
  for (let i = 0; i < step; i++) { await page.click('#next'); await page.waitForTimeout(250); }
  for (const v of VIEWS) {
    await page.evaluate((v) => {
      const cam = window.__labDebug.cam;
      cam.yaw = v.yaw; cam.pitch = v.pitch; cam.dist = v.dist; cam.ty = v.ty;
      if (v.tx !== undefined) cam.tx = v.tx;
    }, v);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${prefix}-${v.name}.png` });
    console.log('saved', `${prefix}-${v.name}.png`);
  }
  await browser.close();
})();
