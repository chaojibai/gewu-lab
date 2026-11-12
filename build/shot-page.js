'use strict';
/* 单页逐步截图（供各课件改造自检）
   用法：node build/shot-page.js <页面相对路径> <输出子目录> [等待毫秒]
   例：  node build/shot-page.js courses/peizhi-step.html work/peizhi 1800
   输出：shots/<输出子目录>/s0.png … sN.png，另打印每步耗时与报错。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const rel = process.argv[2];
const outName = process.argv[3] || path.basename(rel || 'page', '.html');
const wait = Number(process.argv[4] || 1700);
if (!rel) { console.error('usage: node build/shot-page.js <page> <outdir> [waitMs]'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', outName);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });
  await page.goto('file:///' + path.join(ROOT, rel).replace(/\\/g, '/'));
  await page.waitForTimeout(3200);
  const n = await page.evaluate(() => document.querySelectorAll('#dots .dot').length || 1);
  for (let s = 0; s < n; s++) {
    if (s > 0) await page.click('#next');
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, 's' + s + '.png') });
  }
  const info = await page.evaluate(() => {
    const d = window.__labDebug || {};
    const i = d.renderer && d.renderer.info;
    return { steps: document.querySelectorAll('#dots .dot').length,
             calls: i ? i.render.calls : null, tris: i ? i.render.triangles : null,
             geos: i ? i.memory.geometries : null, tex: i ? i.memory.textures : null,
             cam: d.cam ? { tx: +d.cam.tx.toFixed(1), ty: +d.cam.ty.toFixed(1), dist: +d.cam.dist.toFixed(1) } : null };
  });
  console.log(JSON.stringify(info));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO-ERRORS');
  await browser.close();
})();
