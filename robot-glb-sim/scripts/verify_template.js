// Playwright 真 GPU 验证模板 —— 机械臂/3D 单文件页面的通用回归
// 用法：node verify_template.js <html路径> [超时ms]
// 依赖：项目内 npm i playwright；必须 channel:'chrome' + --use-angle=d3d11
//       （SwiftShader 软渲染会误判材质、夸大耗时）
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const file = path.resolve(process.argv[2] || 'dist/demo.html');
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 150)); });

  const t0 = Date.now();
  await page.goto('file://' + file);

  // ---- 1) 等就绪标记（把 #loadnote 换成你的就绪信号）----
  let ready = false;
  try {
    await page.waitForFunction(() => {
      const n = document.getElementById('loadnote');
      return n && n.style.display === 'none';
    }, { timeout: parseInt(process.argv[3] || '30000') });
    ready = true;
  } catch (e) { /* 超时后仍继续采样，把现场截下来 */ }
  console.log('READY:', ready, 'ms:', Date.now() - t0);
  await page.waitForTimeout(800);

  // ---- 2) 阶段截图 ----
  await page.screenshot({ path: 'shot_home.png' });

  // ---- 3) 探针：换成你页面暴露的调试钩子 ----
  // 推荐在页面里暴露：window.__tip/__ik/__held/__crate/__scene 等
  const state = await page.evaluate(() => ({
    tip: window.__tip ? (v => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }))(window.__tip()) : null,
    crate: window.__crate ? (v => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }))(window.__crate()) : null,
    readout: (document.getElementById('readout') || {}).innerHTML || ''
  }));
  console.log('STATE:', JSON.stringify(state, null, 2));

  // ---- 4) IK / 交互回归（按需改写）----
  // const ik = await page.evaluate(async () => {
  //   const c = window.__crate(); window.__setSpeed(3);
  //   const s = window.__ik(c.x, c.y + 0.1, c.z);
  //   await new Promise(r => setTimeout(r, 3500));
  //   const t = window.__tip();
  //   return { dist: +Math.hypot(t.x-c.x, t.y-(c.y+0.1), t.z-c.z).toFixed(2), err: s.err };
  // });
  // console.log('IK:', JSON.stringify(ik));
  // await page.screenshot({ path: 'shot_ik.png' });

  console.log('--- errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
