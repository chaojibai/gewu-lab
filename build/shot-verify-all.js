'use strict';
/* 全量复核：重建后的 9 套课件逐步截图 + 联系表。
   用法：node build/shot-verify-all.js */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'verify');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['candle-step', 'courses/candle-step.html'],
  ['watercycle-step', 'courses/watercycle-step.html'],
  ['nacl-step', 'courses/nacl-step.html'],
  ['peizhi-step', 'courses/peizhi-step.html'],
  ['dissolved-step', 'courses/dissolved-step.html'],
  ['dark-factory', 'labs/dark-factory.html'],
  ['smart-factory', 'labs/smart-factory.html'],
  ['car-assembly', 'labs/car-assembly.html'],
  ['robot-arm-glb', 'labs/robot-arm-glb.html'],
  ['robot-arm', 'labs/robot-arm.html'],
];

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });

  const results = [];
  for (const [name, rel] of PAGES) {
    errs.length = 0;
    await page.goto('file:///' + path.join(ROOT, rel).replace(/\\/g, '/'));
    await page.waitForTimeout(3200);
    const n = await page.evaluate(() => document.querySelectorAll('#dots .dot').length || 1);
    for (let s = 0; s < n; s++) {
      if (s > 0) await page.click('#next');
      await page.waitForTimeout(2100);
      await page.screenshot({ path: path.join(OUT, `${name}-s${s}.png`) });
    }
    const info = await page.evaluate(() => {
      const d = window.__labDebug || {};
      const i = d.renderer && d.renderer.info;
      return { calls: i ? i.render.calls : null, tris: i ? i.render.triangles : null,
               geos: i ? i.memory.geometries : null, tex: i ? i.memory.textures : null };
    });
    results.push({ name, steps: n, ...info, errors: errs.slice(0, 5) });
    console.log(`${name.padEnd(16)} steps=${n} calls=${info.calls} tris=${info.tris} ${errs.length ? 'ERR' : 'ok'}`);
  }

  /* 联系表 */
  const groups = {};
  for (const f of fs.readdirSync(OUT).filter(f => /-s\d+\.png$/.test(f))) {
    const m = f.match(/^(.*)-s\d+\.png$/);
    (groups[m[1]] = groups[m[1]] || []).push(f);
  }
  for (const [name, files] of Object.entries(groups)) {
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#111;font:12px/1.3 system-ui;color:#ccc;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px}
      figure{margin:0;position:relative}img{width:100%;display:block;border-radius:2px}
      figcaption{position:absolute;left:6px;top:4px;background:#000a;padding:1px 6px;border-radius:3px}
    </style>` + files.map(f =>
      `<figure><img src="file:///${path.join(OUT, f).replace(/\\/g, '/')}"><figcaption>${f}</figcaption></figure>`
    ).join('');
    const hp = path.join(OUT, name + '.html');
    fs.writeFileSync(hp, html, 'utf-8');
    await page.setViewportSize({ width: 1260, height: Math.max(300, Math.ceil(files.length / 3) * 267 + 10) });
    await page.goto('file:///' + hp.replace(/\\/g, '/'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2), 'utf-8');
  console.log('report → shots/verify/report.json');
  await browser.close();
})();
