// behavior_probe.js —— 行为回归通用模板：外观截图之外，用数值探针证明"算得对、动得对"
// 用法：node scripts/behavior_probe.js <html路径> [就绪超时ms]
// 依赖：npm i playwright；必须硬件 GPU（channel:'chrome' + --use-angle=d3d11，
//       SwiftShader 会误判材质与耗时，见 SKILL.md §6.0）
//
// 接入自己的页面只改两处：
//   1) READY：页面"加载完成"的信号（默认 #loadnote 隐藏）
//   2) PROBES：页面暴露的调试钩子清单（推荐 window.__xxx() 形式，逐项断言）
const { chromium } = require('playwright');
const path = require('path');

// ---- 1) 就绪信号（按页面改写） ----
const READY = () => {
  const n = document.getElementById('loadnote');
  return n && n.style.display === 'none';
};

// ---- 2) 探针清单（按页面改写；值为函数源码字符串，在页面内重建后求值） ----
const PROBES = {
  tip:   "() => window.__tip   ? window.__tip()   : null",   // 末端/焦点世界坐标
  held:  "() => window.__held  ? window.__held()  : null",   // 抓持/连接状态
  crate: "() => window.__crate ? window.__crate() : null",   // 被操作对象位置
  glbs:  "() => window.__GLB   ? Object.keys(window.__GLB).length : 0", // 资产件数
};
// ---- 3) 断言（探针就绪后的最低验收线，按需增删） ----
const ASSERT = s => {
  const bad = [];
  if (s.glbs !== undefined && (!s.glbs || s.glbs < 1)) bad.push('内嵌资产表为空（检查构建脚本注入）');
  if (s.tip && (!isFinite(s.tip.x) || !isFinite(s.tip.y) || !isFinite(s.tip.z))) bad.push('末端坐标出现 NaN（查运动链）');
  return bad;
};

(async () => {
  const file = path.resolve(process.argv[2] || 'dist/demo.html');
  const timeout = parseInt(process.argv[3] || '30000');
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
  let ready = false;
  try {
    await page.waitForFunction(READY, { timeout });
    ready = true;
  } catch (e) { /* 超时也继续采样，把现场截下来 */ }
  console.log('READY:', ready, 'ms:', Date.now() - t0);
  await page.waitForTimeout(800);

  const round = v => (v && typeof v === 'object')
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? +x.toFixed(2) : x]))
    : v;
  const state = await page.evaluate(probes => {
    const out = {};
    for (const [k, src] of Object.entries(probes)) {
      try { out[k] = eval('(' + src + ')')(); } catch (e) { out[k] = 'ERR:' + e.message.slice(0, 60); }
    }
    return out;
  }, PROBES);
  const s = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, round(v)]));
  console.log('STATE:', JSON.stringify(s, null, 2));

  const tag = path.basename(file, '.html');
  await page.screenshot({ path: `probe_${tag}.png` });

  const failed = ASSERT(s);
  console.log('--- errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  console.log('--- assert ---');
  console.log(failed.length ? failed.join('\n') : '(pass)');
  await browser.close();
  process.exit((ready && errors.length === 0 && failed.length === 0) ? 0 : 1);
})();
