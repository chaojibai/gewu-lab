/* 安装自检：node scripts/selftest.js
   逐项检查 → 打印 OK / FAIL / WARN，并给出修法。最后可选跑一次真实构建+加载。
   退出码：0 = 可用；1 = 有阻断问题 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let fail = 0, warn = 0;

function ok(msg) { console.log('  OK   ' + msg); }
function bad(msg, fix) { fail++; console.log('  FAIL ' + msg + (fix ? '\n         → ' + fix : '')); }
function maybe(msg, fix) { warn++; console.log('  WARN ' + msg + (fix ? '\n         → ' + fix : '')); }
function read(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } }

console.log('\n[1/6] 资产完整性');
const assets = {
  'assets/kit3d.js': 60000,
  'assets/style.css': 5000,
  'assets/page.html': 2000,
  'assets/sim.js': 2000,
  'assets/vendor/three.min.js': 400000
};
for (const [f, minSize] of Object.entries(assets)) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) bad('缺少 ' + f, '从仓库重新克隆，或按 INSTALL.md 一起拷贝 assets/');
  else {
    const size = fs.statSync(p).size;
    if (size < minSize * 0.5) bad(f + ' 体积异常（' + size + ' B）', '文件可能被截断，重新克隆');
    else ok(f + '  (' + Math.round(size / 1024) + ' KB)');
  }
}

console.log('\n[2/6] three.js 是否为 UMD 版');
const three = read('assets/vendor/three.min.js') || '';
if (!three) bad('three.min.js 缺失', '见上');
else if (/^\s*\/\*\s*[\s\S]*?@license[\s\S]*?\*\/\s*!function\(/.test(three) || /!function\(t,e\)\{"object"==typeof exports/.test(three)) {
  ok('是 UMD 版（可内联进单文件）');
} else if (/^\s*(import|export)\s/m.test(three.slice(0, 400))) {
  bad('这是 ESM 版，无法内联', '换成仓库自带的 assets/vendor/three.min.js（r147 UMD），不要用 npm 的 three');
} else {
  maybe('版本类型无法判定', '若 inline_build 报错，换回仓库自带 three.min.js');
}

console.log('\n[3/6] 引擎 API 是否齐全');
const kit = read('assets/kit3d.js') || '';
const need = ['K.boot', 'K.bench', 'K.glassCyl', 'K.liquidCyl', 'K.flask', 'K.beaker',
  'K.spriteLabel', 'K.tag', 'K.fadeShow', 'K.setLiquidColor', 'K.setLiquidLevel', 'K.ez'];
if (!kit) bad('kit3d.js 缺失', '见第 1 项');
else {
  const missing = need.filter(k => !new RegExp(k.replace('.', '\\.') + '\\s*=').test(kit));
  if (missing.length) bad('引擎缺 API：' + missing.join(', '), '引擎版本过旧，用仓库自带的 assets/kit3d.js');
  else ok('全部 ' + need.length + ' 个 API 就位');
  if (!/__labDebug/.test(kit)) maybe('未暴露 window.__labDebug', 'views/pick 脚本会失效；用仓库自带引擎');
}

console.log('\n[4/6] 模板占位符');
const page = read('assets/page.html') || '';
if (!page) bad('page.html 缺失', '见第 1 项');
else {
  const needPh = ['{{THREE}}', '{{SIM}}', '{{KIT}}', '{{LESSON}}', '{{TITLE}}', '{{CHIP}}', '{{CSS}}'];
  const missPh = needPh.filter(p => page.indexOf(p) < 0);
  if (missPh.length) bad('模板缺占位符：' + missPh.join(' '), '用仓库自带 assets/page.html');
  else ok('7 个占位符齐全');
}

console.log('\n[5/6] 运行时依赖');
try {
  require.resolve('playwright', { paths: [process.cwd()] });
  ok('playwright 可用（可在当前目录跑截图/检查）');
} catch (e) {
  maybe('playwright 未安装', '在项目目录执行 npm i playwright（只影响截图/检查脚本，不影响生成课件）');
}
try {
  execFileSync('python', ['--version'], { stdio: 'ignore' });
  ok('python 可用');
} catch (e) {
  try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); ok('python3 可用'); }
  catch (e2) { maybe('python 不可用', 'inline_build.py 需要 Python 3；也可手写构建脚本'); }
}

console.log('\n[6/6] 端到端构建（assets + example → dist/selftest.html）');
const dist = path.join(ROOT, 'dist');
try {
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'selftest.html');
  execFileSync('python', [path.join(ROOT, 'scripts', 'inline_build.py'),
    '--template', path.join(ROOT, 'assets', 'page.html'),
    '--three', path.join(ROOT, 'assets', 'vendor', 'three.min.js'),
    '--engine', path.join(ROOT, 'assets', 'kit3d.js'),
    '--sim', path.join(ROOT, 'assets', 'sim.js'),
    '--lesson', path.join(ROOT, 'examples', 'peizhi-step.js'),
    '--out', out,
    '--title', '自检示例',
    '--chip', 'selftest'], { stdio: 'pipe' });
  const size = fs.statSync(out).size;
  if (size < 300000) bad('构建产物过小（' + size + ' B），可能占位符未替换', '检查 assets 是否完整');
  else ok('构建成功：dist/selftest.html（' + Math.round(size / 1024) + ' KB），双击可打开');
} catch (e) {
  bad('构建失败：' + (e.stdout ? e.stdout.toString().split('\n')[0] : e.message),
    '多半是 python 缺失或 assets 不全；也可手动按 INSTALL.md 第五节执行');
}

console.log('\n' + (fail === 0
  ? (warn === 0 ? '全部通过 ✔ 可以直接开始做课件了' : '可用（有 ' + warn + ' 条提醒，非阻断）')
  : '有 ' + fail + ' 个阻断问题，按上面的 → 修完再跑一次') + '\n');
process.exit(fail === 0 ? 0 : 1);
