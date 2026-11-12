/* 按步骤截图，验证动画与读数：node build/shot-steps.js <html> <prefix> [步骤序号...] */
'use strict';
const path = require('path');
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();

(async () => {
  const rel = process.argv[2] || 'courses/chem-exp/luhe-eggshell-step.html';
  const prefix = process.argv[3] || 'STEP';
  const wants = (process.argv.slice(4).length ? process.argv.slice(4) : ['2', '3']).map(Number);
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await page.waitForTimeout(2200);
  let cur = 0;
  for (const want of wants.slice().sort((a, b) => a - b)) {
    while (cur < want) { await page.keyboard.press('ArrowRight'); cur++; }
    await page.waitForTimeout(2600);
    const out = `shots/${prefix}-s${want + 1}.png`;
    await page.screenshot({ path: out });
    const idx = await page.evaluate(() => {
      const e = document.getElementById('sIdx'); return e ? e.textContent : '?';
    });
    console.log('saved', out, 'step', idx);
  }
  await browser.close();
})();
