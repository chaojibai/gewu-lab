'use strict';
/* 机床外壳 GLB 落盘器：make_cncmill_glb.html → build/assets/cncmill-shell.glb
   用法：node build/make_cncmill_glb.js */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(__dirname, 'make_cncmill_glb.html');
const OUT = path.join(ROOT, 'build', 'assets', 'cncmill-shell.glb');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });

  await page.goto('file:///' + PAGE.replace(/\\/g, '/'));
  await page.waitForFunction(() => window.__GLB_DONE || window.__GLB_ERR, null, { timeout: 60000 });

  const r = await page.evaluate(() => ({
    done: window.__GLB_DONE, err: window.__GLB_ERR,
    bytes: window.__GLB_BYTES || 0, b64: window.__GLB_B64 || '',
    nodes: window.__GLB_NODES || [],
  }));

  if (!r.done || !r.b64) {
    console.error('EXPORT FAILED:', r.err || '(empty)');
    if (errs.length) console.error(errs.join('\n'));
    await browser.close(); process.exit(1);
  }
  const buf = Buffer.from(r.b64, 'base64');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log('GLB  :', OUT);
  console.log('size :', (buf.length / 1024).toFixed(1), 'KB');
  console.log('nodes:', r.nodes.length, '→', r.nodes.filter(n => !/^MAT_/.test(n)).join(', '));
  console.log(errs.length ? 'MESSAGES:\n' + errs.join('\n') : 'NO-ERRORS');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
