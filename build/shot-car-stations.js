'use strict';
/* 总装线逐工位特写 + 下线段连拍。
   用法：node build/shot-car-stations.js [outdir]
   输出：shots/<outdir>/<name>.png（1600×1000，便于数细节） */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', process.argv[2] || 'car-stations');
fs.mkdirSync(OUT, { recursive: true });

/* 每个工位的机位（与 lesson 里的 CAMS 对齐）与采样时刻 */
const CAMS = [
  { tx: -10.0, tz: -1.5, ty: -9.0, dist: 52, yaw: .45, pitch: .48 },
  { tx: -34.8, tz: -0.3, ty: -13.5, dist: 14.0, yaw: -.55, pitch: .30 },
  { tx: -32.6, tz: -0.4, ty: -13.5, dist: 13.0, yaw: -.55, pitch: .30 },
  { tx: -19.6, tz: -0.4, ty: -13.4, dist: 12.5, yaw: -.55, pitch: .30 },
  { tx: -6.6, tz: -0.4, ty: -13.4, dist: 13.0, yaw: -.55, pitch: .30 },
  { tx: 6.5, tz: -0.1, ty: -14.3, dist: 9.5, yaw: .48, pitch: .20 },
  { tx: 20.6, tz: 0.3, ty: -13.9, dist: 10.8, yaw: -.52, pitch: .14 },
  { tx: 50.0, tz: 0.2, ty: -12.0, dist: 18.0, yaw: 1.00, pitch: .20 }
];

const SHOTS = [
  ['s1-strip', 1, 7.0, null],
  ['s2-ip', 2, 19.0, null],
  ['s3-seat', 3, 31.0, null],
  ['s4-marry', 4, 45.0, null],
  ['s5-tire', 5, 57.0, null],
  ['s6-dress', 6, 69.0, null],
  ['exit-a-79', 7, 79.0, null],
  ['exit-b-80.5', 7, 80.5, null],
  ['exit-c-82', 7, 82.0, null],
  ['exit-d-83.5', 7, 83.5, null],
  ['exit-e-85', 7, 85.0, null],
  ['exit-f-88', 7, 88.0, null],
  /* 侧视看车轮与坡道/地面的关系 */
  ['exit-side-81', 7, 81.0, { tx: 30, tz: 0, ty: -14.5, dist: 26, yaw: 0.0, pitch: .10 }],
  ['exit-side-83', 7, 83.0, { tx: 36, tz: 0, ty: -14.5, dist: 26, yaw: 0.0, pitch: .10 }],
  ['exit-side-85', 7, 85.0, { tx: 44, tz: 0, ty: -14.5, dist: 26, yaw: 0.0, pitch: .10 }],
  ['exit-top-84', 7, 84.0, { tx: 40, tz: 0, ty: -14.0, dist: 30, yaw: 0.0, pitch: .75 }]
];

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  await page.goto('file:///' + path.join(ROOT, 'labs', 'car-assembly.html').replace(/\\/g, '/'));
  await page.waitForTimeout(4000);

  let curStep = 0;
  for (const [name, step, t, cam] of SHOTS) {
    while (curStep < step) { await page.click('#next'); curStep++; await page.waitForTimeout(700); }
    await page.evaluate(a => {
      const s = window.__dfState; s.run = true; s.lit = 1; s.speed = 0; s._t = a; s.xray = 0; s.explode = 0;
    }, t);
    await page.waitForTimeout(1200);
    if (cam) {
      await page.evaluate(c => {
        const cm = window.__labDebug.cam, s = window.__dfState;
        s._fly = 0;
        Object.keys(c).forEach(k => { cm[k] = c[k]; });
      }, cam);
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('→', name);
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO-ERRORS');
  await browser.close();
})();
