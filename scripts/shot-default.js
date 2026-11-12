/* 真实默认视角截图（不覆盖课件相机）—— 这才是用户打开课件看到的画面。
   用法：node scripts/shot-default.js <html|glob> <prefix> [w] [h]
   与 views-gpu.js 的区别：views-gpu.js 会把 cam 改成固定 8 机位，
   评估"默认观感"时不能用它，否则看到的和用户不是一回事。 */
'use strict';
const path = require('path');
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();
const fs = require('fs');

(async () => {
  const arg = process.argv[2] || '';
  const prefix = process.argv[3] || 'default';
  const w = parseInt(process.argv[4] || '1440', 10);
  const h = parseInt(process.argv[5] || '900', 10);
  let files = [];
  if (arg.includes('*')) {
    const dir = path.dirname(arg);
    const re = new RegExp('^' + path.basename(arg).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && re.test(f) && f !== 'index.html')
      .map(f => path.join(dir, f));
  } else files = [arg];

  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  for (const rel of files) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    let errs = 0;
    page.on('pageerror', e => { errs++; console.log('[pageerror]', rel, String(e).slice(0, 120)); });
    await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
    await page.waitForTimeout(2200);
    const out = path.join('shots', `${prefix}-${path.basename(rel, '.html')}.png`);
    await page.screenshot({ path: out });
    console.log(errs ? `ERR ${out}` : `saved ${out}`);
    await page.close();
  }
  await browser.close();
})();
