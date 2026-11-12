'use strict';
/* 无人机外观件 GLB 落盘器：make_drone_glb.html → build/assets/drone-shell.glb
   用法：node build/make_drone_glb.js */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(__dirname, 'make_drone_glb.html');
const OUT = path.join(ROOT, 'build', 'assets', 'drone-shell.glb');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 500)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 500)); });

  await page.goto('file:///' + PAGE.replace(/\\/g, '/'));
  await page.waitForFunction(() => window.__GLB_DONE || window.__GLB_ERR, null, { timeout: 60000 });

  const r = await page.evaluate(() => ({
    done: window.__GLB_DONE, err: window.__GLB_ERR,
    bytes: window.__GLB_BYTES || 0, b64: window.__GLB_B64 || '',
    nodes: window.__GLB_NODES || [],
  }));

  if (!r.done) {
    console.error('EXPORT FAILED:', r.err || '(unknown)');
    if (errs.length) console.error(errs.join('\n'));
    await browser.close(); process.exit(1);
  }

  const buf = Buffer.from(r.b64, 'base64');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log('GLB written :', OUT);
  console.log('size        :', (buf.length / 1024).toFixed(1), 'KB');
  console.log('nodes       :', r.nodes.length);
  console.log(r.nodes.join(', '));
  console.log(errs.length ? 'BROWSER MESSAGES:\n' + errs.join('\n') : 'NO-ERRORS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
