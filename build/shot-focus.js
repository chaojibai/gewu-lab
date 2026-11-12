'use strict';
/* 定点特写：node build/shot-focus.js <html> <prefix> <tx> <ty> <tz> <dist> <yaw> <pitch> [waitMs] */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const rel = process.argv[2], prefix = process.argv[3] || 'FOC';
  const n = process.argv.slice(4, 10).map(Number);
  const wait = Number(process.argv[10] || 1800);
  if (!rel || n.length < 6 || n.some(isNaN)) {
    console.error('usage: node build/shot-focus.js <html> <prefix> tx ty tz dist yaw pitch [waitMs]');
    process.exit(2);
  }
  const b = await chromium.launch({
    channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
  await p.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await p.waitForTimeout(2400);
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(1800);
  await p.evaluate(c => {
    Object.assign(window.__labDebug.cam, { tx: c[0], ty: c[1], tz: c[2], dist: c[3], yaw: c[4], pitch: c[5] });
  }, n);
  await p.waitForTimeout(wait);
  const out = `shots/${prefix}.png`;
  await p.screenshot({ path: out });
  console.log('saved', out);
  await b.close();
})();
