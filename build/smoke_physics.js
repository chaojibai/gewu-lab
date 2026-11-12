// 无头冒烟测试：加载物理课件，捕获运行时错误，分步截图。
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const file = process.argv[2] || 'courses/physics-exp/boiling-step.html';
  const url = 'file://' + path.resolve(file);
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--ignore-gpu-blocklist', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__labDebug, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const bootOk = await page.evaluate(() => !!window.__labDebug);
  const canvasOk = await page.evaluate(() => { const c = document.getElementById('cv'); return c && c.width > 0; });

  const base = 'build/_smoke_' + path.basename(file).replace('.html', '');
  await page.screenshot({ path: base + '_s0.png' });           // 看装置

  // 跳到“点燃加热”（idx 2）：点击 next 2 次，停留 6s 让火焰/气泡/曲线实时生长
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const b = document.getElementById('next'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: base + '_s2.png' });            // 点燃加热（实时上升）

  // 再点 2 次到“沸腾”（idx 4），停留 2.5s
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const b = document.getElementById('next'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: base + '_s4.png' });            // 沸腾（预置曲线）

  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const b = document.getElementById('next'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);

  console.log('bootOk=', bootOk, '| canvasOk=', canvasOk);
  console.log('errors=', errors.length);
  errors.slice(0, 20).forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(errors.length === 0 && bootOk && canvasOk ? 0 : 1);
})();
