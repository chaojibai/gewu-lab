'use strict';
/* 深度动态审计：
   ① 全周期每 1.5s 的设备互穿（body 与滑板部件拆开互查，不再族内白名单）
   ② 每台机械臂作业窗口内 TCP + 基座连线的 8 点采样，报告伸进车身实体的点
   车身实体判定：局部 (x,y) 在侧视轮廓内（实心挤出体，无洞）。

   输出改为可证伪的统计：每个时刻报"探针点数 / 最小间隙"，
   并在开头跑一次自检（车身中心必须判实心、车顶上方必须判空），
   否则"0 命中"也可能只是判定函数一直返回 false。 */
const path = require('path');
const { chromium } = require('playwright');

const TIMES = [5.5, 6.5, 7.5, 8.5, 9.5, 18.5, 19.5, 20.5, 21.5, 22.5,
  29.5, 30.5, 31.5, 32.5, 33.5, 34.5, 67.5, 68.5, 69.5, 70.5, 71.3];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
  await page.goto('file:///' + path.join(__dirname, '..', 'labs', 'car-assembly.html').replace(/\\/g, '/'));
  await page.waitForTimeout(3800);

  /* 在页面里装一套判定函数，后续每次采样复用 */
  await page.evaluate(() => {
    const T = window.THREE;
    const body = window.__dfP.body;
    const r = .44, front = 1.50, rear = -1.45;
    const OUTER = [[-2.34, .34], [rear - r, .34]];
    for (let k = 1; k <= 16; k++) { const a = Math.PI * (1 - k / 16); OUTER.push([rear + r * Math.cos(a), .34 + r * Math.sin(a)]); }
    OUTER.push([front - r, .34]);
    for (let k = 1; k <= 16; k++) { const a = Math.PI * (1 - k / 16); OUTER.push([front + r * Math.cos(a), .34 + r * Math.sin(a)]); }
    OUTER.push([2.34, .34], [2.40, .58], [2.34, .84], [1.96, .93], [1.42, 1.00],
      [.86, 1.42], [.30, 1.47], [-1.16, 1.44], [-1.58, 1.04], [-2.06, 1.00], [-2.30, .90], [-2.40, .56]);
    const pip = (x, y) => { let q = false; for (let i = 0, j = OUTER.length - 1; i < OUTER.length; j = i++) { const xi = OUTER[i][0], yi = OUTER[i][1], xj = OUTER[j][0], yj = OUTER[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) q = !q; } return q; };
    const segD = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    const edgeD = (x, y) => {
      let d = 1e9;
      for (let i = 0, j = OUTER.length - 1; i < OUTER.length; j = i++)
        d = Math.min(d, segD(x, y, OUTER[j][0], OUTER[j][1], OUTER[i][0], OUTER[i][1]));
      return d;
    };
    /* 局部点 → 带符号距离：负 = 在车身实体内部（穿透深度），正 = 间隙 */
    window.__sd = (x, y, z) => {
      const d2 = edgeD(x, y);
      const inside = pip(x, y) && y < 1.72 && y > .30 && Math.abs(z) < .90;
      if (inside) return -d2;
      return Math.max(d2, y - 1.72, .30 - y, Math.abs(z) - .90);
    };
    window.__selfTest = () => [
      ['车身中心(0,0.80,0)', window.__sd(0, .80, 0)],
      ['车顶上方(0,3.00,0)', window.__sd(0, 3.00, 0)],
      ['车身侧外(2.90,0.80,0)', window.__sd(2.90, .80, 0)],
    ];
    window.__bodyInv = () => { body.updateWorldMatrix(true, true); return new T.Matrix4().copy(body.matrixWorld).invert(); };
  });

  console.log('=== 机械臂 vs 车身实体（车身局部坐标 · 侧视轮廓 PIP）===');
  const st = await page.evaluate(() => window.__selfTest());
  const ok = st[0][1] < 0 && st[1][1] > 0 && st[2][1] > 0;
  console.log('判定自检  ' + st.map(s => `${s[0]}=${s[1] < 0 ? '实心' : '空'}(${s[1].toFixed(2)})`).join('  ') + '  ' + (ok ? '✓ 判定函数有效' : '✗ 判定失效'));

  let probes = 0, hits = 0, minClear = Infinity, maxPen = 0;
  const hitLines = [];

  for (const t of TIMES) {
    await page.evaluate(a => { const s = window.__dfState; s.run = true; s.lit = 1; s.speed = 0; s._t = a; s.xray = 0; s.explode = 0; }, t);
    await page.waitForTimeout(140);
    const r = await page.evaluate(() => {
      const T = window.THREE, O = window.__dfO;
      const inv = window.__bodyInv();
      const v = new T.Vector3();
      const out = { pts: 0, arms: 0, min: 1e9, pen: 0, hits: [] };
      const probeArm = (name, A) => {
        if (!A || !A.rob || !A.grip) return;
        out.arms++;
        const base = new T.Vector3(A.cx, A.sy, A.cz);
        A.grip.getWorldPosition(v);
        const tcp = v.clone();
        const pts = [];
        for (let k = 1; k < 8; k++) pts.push(base.clone().lerp(tcp, k / 8));
        pts.push(tcp);
        pts.forEach((p, idx) => {
          p.applyMatrix4(inv);
          const d = window.__sd(p.x, p.y, p.z);
          out.pts++;
          if (d < 0) { out.pen = Math.min(out.pen, d); out.hits.push(name + (idx === 7 ? ':TCP' : ':' + ((idx + 1) / 8).toFixed(2))); }
          else out.min = Math.min(out.min, d);
        });
      };
      probeArm('Rstrip', O.Rstrip);
      probeArm('Rip', O.Rip);
      probeArm('Rseat', O.Rseat);
      probeArm('Rdress', O.Rdress);
      if (window.__DK1 && window.__DK1.tcp && window.__DK1.root)
        probeArm('DK1', { cx: window.__DK1.root.position.x, sy: window.__DK1.root.position.y, cz: window.__DK1.root.position.z, rob: window.__DK1.root, grip: window.__DK1.tcp });
      return out;
    });
    probes += r.pts;
    if (r.hits.length) { hits += r.hits.length; hitLines.push('t=' + t + '  ' + r.hits.join(' ')); }
    if (r.min < 1e8) minClear = Math.min(minClear, r.min);
    maxPen = Math.min(maxPen, r.pen);
    const clearTxt = r.min < 1e8 ? r.min.toFixed(2) + ' m' : '—';
    console.log(`t=${String(t).padEnd(5)} 臂 ${r.arms} 台 · 探针 ${String(r.pts).padStart(2)} 点 · 最小间隙 ${clearTxt}`
      + (r.hits.length ? '  ✗ 侵入 ' + r.hits.join(' ') : ''));
  }

  console.log('');
  if (hitLines.length) { console.log('侵入明细：'); hitLines.forEach(s => console.log('  ' + s)); }
  console.log(`合计：${TIMES.length} 个时刻 · ${probes} 个探针点 · 侵入 ${hits} 点 · 最大穿透 ${maxPen < 0 ? (-maxPen).toFixed(2) + ' m' : '0'} · 全程最小间隙 ${minClear.toFixed(2)} m`);
  console.log('=== done ===');
  console.log(errs.length ? errs.slice(0, 5).join('\n') : 'NO-ERRORS');
  await browser.close();
})();
