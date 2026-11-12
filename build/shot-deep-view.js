'use strict';
/* 把深度审计里"最小间隙"的两个时刻截出来看：
   用法：node build/shot-deep-view.js [t1] [t2] ...
   输出：shots/work/deep/t<时刻>.png */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'work', 'deep');
fs.mkdirSync(OUT, { recursive: true });
const times = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
if (!times.length) times.push(7.5, 70.5);

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await p.goto('file:///' + path.join(ROOT, 'labs', 'car-assembly.html').replace(/\\/g, '/'));
  await p.waitForTimeout(3800);
  for (const t of times) {
    await p.evaluate(a => { const s = window.__dfState; s.run = true; s.lit = 1; s.speed = 0; s._t = a; s.xray = 0; s.explode = 0; }, t);
    await p.waitForTimeout(900);
    const f = path.join(OUT, 't' + String(t).replace('.', '_') + '.png');
    await p.screenshot({ path: f });
    console.log('→', f);
  }
  await b.close();
})();
