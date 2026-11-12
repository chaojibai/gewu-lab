/* 俯视机位截图（复现用户拖出来的视角）：node build/shot-top.js <html> <prefix> [pitch] */
'use strict';
const path = require('path');
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();
(async () => {
  const rel = process.argv[2] || 'courses/chem-exp/luhe-cuyan-step.html';
  const prefix = process.argv[3] || 'TOP';
  const pitch = parseFloat(process.argv[4] || '.58');
  const browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await page.waitForTimeout(2200);
  await page.evaluate(p => {
    const c = window.__labDebug.cam;
    c.tx = 2; c.ty = 5.2; c.tz = 2; c.dist = 44; c.yaw = .22; c.pitch = p;
  }, pitch);
  await page.waitForTimeout(800);
  const out = `shots/${prefix}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out);
  await browser.close();
})();
