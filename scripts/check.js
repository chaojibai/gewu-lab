/* 报错扫描：node check.js <a.html> [b.html] ...
   抓 pageerror 与 console.error/warning。任何 pageerror 都必须为 0 才算通过。
   用法：for f in courses/*.html; do node check.js "$f"; done */
'use strict';
const path = require('path');
// 从当前工作目录解析 playwright（脚本可能不在项目内）
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();

(async () => {
  const files = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  for (const rel of files) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let errs = 0;
    page.on('pageerror', e => { errs++; console.log(`[pageerror] ${rel} :: ${(e.stack || String(e)).split('\n')[0]}`); });
    page.on('console', m => {
      if (m.type() === 'error') { errs++; console.log(`[console.error] ${rel} :: ${m.text().slice(0, 160)}`); }
    });
    await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
    await page.waitForTimeout(1800);
    if (errs === 0) console.log(`OK ${rel}`);
    else bad++;
    await page.close();
  }
  await browser.close();
  console.log(bad === 0 ? 'ALL_CLEAN' : `${bad} file(s) with errors`);
  process.exit(bad === 0 ? 0 : 1);
})();
