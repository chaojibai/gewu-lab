/* 像素取样：node pick.js <a.html> "x,y;x,y;..."
   直接读 WebGL 帧缓冲，不要靠肉眼判断颜色（"看起来发白"是主观的，rgb 值不是）。
   注意：坐标是 CSS 像素，脚本内部会乘 devicePixelRatio 并翻转 Y。 */
'use strict';
const path = require('path');
// 从当前工作目录解析 playwright（脚本可能不在项目内）
const { chromium } = (() => {
  try { return require('playwright'); }
  catch (e) { return require(require.resolve('playwright', { paths: [process.cwd()] })); }
})();

(async () => {
  const rel = process.argv[2];
  const pts = process.argv[3].split(';').map(s => s.split(',').map(Number));
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + path.resolve(rel).replace(/\\/g, '/'));
  await page.waitForTimeout(1500);
  const out = await page.evaluate((pts) => {
    const d = window.__labDebug;
    if (!d) return 'NO __labDebug（引擎里要挂 window.__labDebug = { scene, camera, renderer, cam, M }）';
    const gl = d.renderer.getContext();
    d.renderer.render(d.scene, d.camera);            // 同一帧内读取，否则缓冲已被清
    const dpr = window.devicePixelRatio || 1;
    return pts.map(([x, y]) => {
      const px = new Uint8Array(4);
      gl.readPixels(x * dpr, (window.innerHeight - y) * dpr, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return `(${x},${y}) rgb(${px[0]},${px[1]},${px[2]})`;
    });
  }, pts);
  console.log(Array.isArray(out) ? out.join('\n') : out);
  await browser.close();
})();
