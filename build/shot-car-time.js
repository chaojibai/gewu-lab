'use strict';
/* 按时刻直接取景（不点步骤，避免面板与时刻错位）：
   node build/shot-car-time.js <outdir> <t> <camIndex|x,y,z,dist,yaw,pitch> [t ...]
   简化用法：一次跑一组预设 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', process.argv[2] || 'car-time');
fs.mkdirSync(OUT, { recursive: true });

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

/* [输出名, 时刻, 机位覆盖或 null] */
const SHOTS = [
  ['strip-7', 7.0, 2], ['strip-9', 9.0, 2],
  ['ip-18', 18.0, 3], ['ip-20.5', 20.5, 3],
  ['seat-30', 30.0, 4], ['seat-32.5', 32.5, 4],
  ['marry-42', 42.0, 5], ['marry-45', 45.0, 5], ['marry-47.5', 47.5, 5],
  ['tire-56', 56.0, 6], ['tire-58.5', 58.5, 6],
  ['dress-67.5', 67.5, 2], ['dress-69.5', 69.5, 2],
  /* 特写：把机位拉近到机械臂 */
  ['arm-strip-close', 9.0, { tx: -32.6, tz: -2.0, ty: -13.2, dist: 7.5, yaw: -.35, pitch: .22 }],
  ['arm-ip-close', 20.5, { tx: -19.6, tz: -1.0, ty: -13.2, dist: 7.5, yaw: -.35, pitch: .22 }],
  ['arm-seat-close', 32.5, { tx: -6.6, tz: -1.0, ty: -13.2, dist: 7.5, yaw: -.35, pitch: .22 }],
  ['arm-dress-close', 69.5, { tx: 31.0, tz: -2.2, ty: -13.2, dist: 7.5, yaw: -.35, pitch: .22 }],
  /* 下线段侧视：看车轮与坡道/路面 */
  ['exit-side-81', 81.0, { tx: 52, tz: 0, ty: -14.6, dist: 20, yaw: 0.0, pitch: .12 }],
  ['exit-side-82.8', 82.8, { tx: 60, tz: 0, ty: -14.6, dist: 20, yaw: 0.0, pitch: .12 }],
  ['exit-side-84', 84.0, { tx: 66, tz: 0, ty: -14.6, dist: 20, yaw: 0.0, pitch: .12 }],
  /* 工位看板：看新位置是否还压着机械臂 */
  ['board-strip', 8.0, { tx: -32.6, tz: -1.0, ty: -12.4, dist: 9.5, yaw: -.30, pitch: .26 }],
  ['board-ip', 19.0, { tx: -19.6, tz: -1.0, ty: -12.4, dist: 9.5, yaw: -.30, pitch: .26 }]
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file:///' + path.join(ROOT, 'labs', 'car-assembly.html').replace(/\\/g, '/'));
  await page.waitForTimeout(4000);

  for (const [name, t, cam] of SHOTS) {
    await page.evaluate(a => {
      const s = window.__dfState; s.run = true; s.lit = 1; s.speed = 0; s._t = a; s.xray = 0; s.explode = 0;
    }, t);
    await page.waitForTimeout(900);
    const c = typeof cam === 'number' ? CAMS[cam] : cam;
    if (c) await page.evaluate(cc => {
      const cm = window.__labDebug.cam, s = window.__dfState;
      s._fly = 0; Object.keys(cc).forEach(k => { cm[k] = cc[k]; });
    }, c);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('→', name);
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO-ERRORS');
  await browser.close();
})();
