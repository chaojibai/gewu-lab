#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成仓库根目录的统一总入口 index.html（化学 15 门 + 物理 21 门，共 36 门合一）。

实现方式：复用 courses/chem-exp/index.html 的成熟引擎（设计令牌 / 深浅色 / 搜索 / 筛选 /
沉浸预览），把物理作为第二个 subject 并入同一套 BOOKS 数据。物理卡片无封面图，
改用渐变封面 + 标题兜底；保留「文字初稿」链接。生成后由 release_polish.py 注入
许可徽标与卡片下载按钮。

幂等：每次依据 chem-exp / physics-exp 两个源目录重新生成，可直接重跑。
"""
import html as _html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHEM = ROOT / 'courses' / 'chem-exp' / 'index.html'
PHYS = ROOT / 'courses' / 'physics-exp' / 'index.html'
OUT = ROOT / 'index.html'

POLISH_MARK = '<!-- 格物实验室·目录页增强(release_polish) -->'


def strip_polish(s):
    if POLISH_MARK in s:
        return s.split(POLISH_MARK)[0]
    return s


# ── 1. 读取化学 BOOKS（本身就是合法 JSON：键已加引号）──────────────────
chem_html = strip_polish(CHEM.read_text(encoding='utf-8'))
# 剥离 release_polish 注入块时，会一并去掉其后的 </body></html>，这里补回
if '</body>' not in chem_html:
    chem_html = chem_html.rstrip()
    if not chem_html.endswith('</script>'):
        chem_html += '\n'
    chem_html += '\n</body>\n</html>\n'
i = chem_html.index('const BOOKS = [')
j = chem_html.index(';', i)  # 第一个分号即 BOOKS 语句结束
books_json = chem_html[i + len('const BOOKS = '):j]
chem_books = json.loads(books_json)
for b in chem_books:
    b['subject'] = 'chem'
    for c in b['courses']:
        c['subject'] = 'chem'
        if c.get('href', '').startswith('./'):
            c['href'] = './courses/chem-exp/' + c['href'][2:]
        if c.get('cover', '').startswith('./'):
            c['cover'] = './courses/chem-exp/' + c['cover'][2:]


# ── 2. 解析物理卡片 ─────────────────────────────────────────────────
phys_html = strip_polish(PHYS.read_text(encoding='utf-8'))
cards = re.findall(r'<div class="card">.*?</div>\s*</div>', phys_html, re.DOTALL)
assert len(cards) == 21, '物理卡片数量异常: %d' % len(cards)


def parse_card(block):
    step = re.search(r'class="card-main" href="([^"]+)"', block).group(1)
    idx = re.search(r'class="idx">(.*?)</div>', block, re.DOTALL).group(1).strip()
    title = re.search(r'<h3>(.*?)</h3>', block, re.DOTALL).group(1).strip()
    kind = '测量类' if 'pill measure' in block else ('探究类' if 'pill inquiry' in block else '')
    book = re.search(r'pill std">([^<]+)<', block).group(1).strip()
    chapter = re.search(r'<b>章节：</b>(.*?)</span>', block, re.DOTALL).group(1).strip()
    app = re.search(r'<b>器材：</b>(.*?)</span>', block, re.DOTALL).group(1).strip()
    d = re.search(r'<a href="([^"]+)">文字初稿</a>', block)
    draft = d.group(1) if d else None
    slug = step.replace('-step.html', '')
    return {
        'slug': slug,
        'chapter': _html.unescape(chapter),
        'tag': _html.unescape(idx),
        'kind': kind,
        'desc': '%s · %s · %s' % (kind, book, chapter),
        'title': _html.unescape(title),
        'steps': None,
        'question': '器材：' + _html.unescape(app),
        'href': './courses/physics-exp/' + step,
        'cover': None,
        'bid': None,            # 由 book 注入
        'book': book,
        'subject': 'phys',
        'draft': './courses/physics-exp/' + draft if draft else None,
        'color': None,
        'soft': None,
    }


courses_phys = [parse_card(b) for b in cards]

PHYS_BOOK_META = {
    '八上': {'id': 'p8', 'num': '04', 'color': '#1e6fb0', 'soft': '#e6f0f8',
             'desc': '鲁教版（五四制）初中物理 · 八年级上册：从质量、密度、长度与时间、速度的测量，到光的反射、平面镜、凸透镜成像的探究。'},
    '八下': {'id': 'p8x', 'num': '05', 'color': '#2a9d8f', 'soft': '#e3f4f1',
             'desc': '八年级下册：力与运动、压强、浮力、简单机械相关的测量与探究实验。'},
    '九上': {'id': 'p9', 'num': '06', 'color': '#6a5acd', 'soft': '#ece8f7',
             'desc': '九年级上册：温度、电流、电压、电阻的测量，以及沸腾、串并联电路、欧姆定律的探究。'},
    '九下': {'id': 'p9x', 'num': '07', 'color': '#c0568f', 'soft': '#f7e8f0',
             'desc': '九年级下册：电与磁相关的两个探究实验。'},
}
PHYS_ORDER = ['八上', '八下', '九上', '九下']

phys_books = []
for name in PHYS_ORDER:
    meta = PHYS_BOOK_META[name]
    cs = [c for c in courses_phys if c['book'] == name]
    for c in cs:
        c['bid'] = meta['id']
        c['color'] = meta['color']
        c['soft'] = meta['soft']
    phys_books.append({
        'id': meta['id'], 'num': meta['num'], 'name': name,
        'system': '五四制 · 初中物理', 'color': meta['color'], 'soft': meta['soft'],
        'subject': 'phys', 'desc': meta['desc'], 'courses': cs,
    })

combined = chem_books + phys_books
combined_json = json.dumps(combined, ensure_ascii=False, indent=2)


# ── 3. 在化学模板引擎基础上打补丁 ──────────────────────────────────
tpl = chem_html

# 3.1 替换 BOOKS 数据
tpl = tpl[:i] + 'const BOOKS = ' + combined_json + ';' + tpl[j + 1:]

# 3.2 标题 / 计数 / 顶栏导航
tpl = tpl.replace(
    '<title>鲁教版化学 · 三册 3D 交互课件 | 格物实验室</title>',
    '<title>鲁教版 · 初中化学 + 物理 · 3D 交互课件总入口 | 格物实验室</title>')
tpl = tpl.replace(
    '<span class="count-pill"><b id="totalNum">15</b> 门课件 · 断网可用</span>',
    '<span class="count-pill"><b id="totalNum">36</b> 门课件 · 断网可用</span>')
tpl = tpl.replace(
    '''    <nav class="navlinks">
      <a href="#book-b8">八年级全一册</a>
      <a href="#book-b9a">九年级上册</a>
      <a href="#book-b9b">九年级下册</a>
      <a href="#about">关于这套课件</a>
    </nav>''',
    '''    <nav class="navlinks">
      <a href="#subject-chem">化学</a>
      <a href="#subject-phys">物理</a>
      <a href="#about">关于</a>
    </nav>''')

# 3.3 Hero
OLD_HERO = '''<header class="hero" id="top">
  <span class="formula f1">H₂O &nbsp; 2 : 1</span>
  <span class="formula f2">O₂ ↑ &nbsp; CO₂ ↑</span>
  <span class="formula f3">NaCl &nbsp; CaCO₃</span>
  <span class="formula f4">KMnO₄ → K₂MnO₄ + MnO₂ + O₂</span>
  <svg class="hero-flask" viewBox="0 0 200 200" fill="none" stroke="#bfeaf0" stroke-width="2">
    <circle cx="100" cy="100" r="86"/><circle cx="100" cy="100" r="62"/>
    <path d="M100 14v172M14 100h172M39 39l122 122M161 39L39 161"/>
    <circle cx="100" cy="14" r="6" fill="#bfeaf0"/><circle cx="186" cy="100" r="6" fill="#bfeaf0"/>
    <circle cx="100" cy="186" r="6" fill="#bfeaf0"/><circle cx="14" cy="100" r="6" fill="#bfeaf0"/>
  </svg>
  <div class="wrap">
    <div>
      <div class="eyebrow"><i></i>鲁教版 · 初中化学 · 3D 交互课件</div>
      <h1>把三册化学，<br>搬进<em>可动手的实验室</em></h1>
      <p class="lede">八年级全一册、九年级上册、九年级下册 —— <b>15 门</b>单文件 three.js 课件，按教材册次与单元顺序编排。每一门都可旋转观察、分步演示、断网直接打开；读数由模型计算，操作都有对应的物体与运动。</p>
      <div class="hero-meta">
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>课标 8 个必做实验全覆盖</div>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M2 19h20M8 8h8M8 12h5"/></svg>教材单元探究同步收录</div>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a10 10 0 1 0 10 10M12 6v6l4 2"/></svg>单文件 · 离线可用</div>
      </div>
    </div>
    <div class="stats" id="stats"></div>
  </div>
</header>'''
NEW_HERO = '''<header class="hero" id="top">
  <span class="formula f1">H₂O &nbsp; 2 : 1</span>
  <span class="formula f2">O₂ ↑ &nbsp; CO₂ ↑</span>
  <span class="formula f3">F = m a</span>
  <span class="formula f4">U = I R</span>
  <svg class="hero-flask" viewBox="0 0 200 200" fill="none" stroke="#bfeaf0" stroke-width="2">
    <circle cx="100" cy="100" r="86"/><circle cx="100" cy="100" r="62"/>
    <path d="M100 14v172M14 100h172M39 39l122 122M161 39L39 161"/>
    <circle cx="100" cy="14" r="6" fill="#bfeaf0"/><circle cx="186" cy="100" r="6" fill="#bfeaf0"/>
    <circle cx="100" cy="186" r="6" fill="#bfeaf0"/><circle cx="14" cy="100" r="6" fill="#bfeaf0"/>
  </svg>
  <div class="wrap">
    <div>
      <div class="eyebrow"><i></i>鲁教版 · 初中化学 + 物理 · 3D 交互课件</div>
      <h1>把课本里的实验，<br>搬进<em>可动手的实验室</em></h1>
      <p class="lede">化学 15 门、物理 21 门 —— 共 <b>36 门</b>单文件 three.js 课件，按学科与教材册次编排。每一门都能旋转观察、分步演示、断网直接打开；读数由模型计算，操作都有对应的物体与运动。</p>
      <div class="hero-meta">
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>化学 15 门 · 三册全覆盖</div>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M2 19h20M8 8h8M8 12h5"/></svg>物理 21 门 · 学生必做实验</div>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a10 10 0 1 0 10 10M12 6v6l4 2"/></svg>单文件 · 离线可用</div>
      </div>
    </div>
    <div class="stats" id="stats"></div>
  </div>
</header>'''
assert OLD_HERO in tpl, 'hero 锚点未命中'
tpl = tpl.replace(OLD_HERO, NEW_HERO)

# 3.4 筛选 chips（学科 + 类型）
OLD_CHIPS = '''      <button class="chip on" data-f="all">全部</button>
      <button class="chip" data-f="b8">八年级全一册</button>
      <button class="chip" data-f="b9a">九年级上册</button>
      <button class="chip" data-f="b9b">九年级下册</button>
      <button class="chip" data-f="must">必做实验</button>
      <button class="chip" data-f="unit">单元探究</button>'''
NEW_CHIPS = '''      <button class="chip on" data-f="all">全部</button>
      <button class="chip" data-f="chem">化学</button>
      <button class="chip" data-f="phys">物理</button>
      <button class="chip" data-f="must">必做实验</button>
      <button class="chip" data-f="unit">单元探究</button>
      <button class="chip" data-f="measure">测量类</button>
      <button class="chip" data-f="inquiry">探究类</button>'''
assert OLD_CHIPS in tpl, 'chips 锚点未命中'
tpl = tpl.replace(OLD_CHIPS, NEW_CHIPS)

# 3.5 match() 增加学科 + 类型筛选
OLD_MATCH = '''  if(state.f === 'must' && c.kind !== '必做实验') return false;
  if(state.f === 'unit' && c.kind !== '单元探究') return false;
  if(['b8','b9a','b9b'].includes(state.f) && c.bid !== state.f) return false;'''
NEW_MATCH = '''  if(state.f === 'chem' && c.subject !== 'chem') return false;
  if(state.f === 'phys' && c.subject !== 'phys') return false;
  if(state.f === 'must' && c.kind !== '必做实验') return false;
  if(state.f === 'unit' && c.kind !== '单元探究') return false;
  if(state.f === 'measure' && c.kind !== '测量类') return false;
  if(state.f === 'inquiry' && c.kind !== '探究类') return false;'''
assert OLD_MATCH in tpl, 'match 锚点未命中'
tpl = tpl.replace(OLD_MATCH, NEW_MATCH)

# 3.6 render() 增加学科分隔条
tpl = tpl.replace(
    "  let n = 0, html = '';",
    "  let n = 0, html = '', lastSubj = '';")
tpl = tpl.replace(
    "    n += list.length;\n",
    "    n += list.length;\n"
    "    const subjDiv = b.subject !== lastSubj ? `<div class=\"subj-div\" id=\"subject-${b.subject}\"><span class=\"subj-dot\" style=\"background:${b.color}\"></span>${b.subject === 'chem' ? '化学 · 初中化学 3D 课件' : '物理 · 初中物理 3D 课件'}</div>` : '';\n"
    "    lastSubj = b.subject;\n")
tpl = tpl.replace(
    '    html += `<section class="book"',
    '    html += subjDiv + `<section class="book"')

# 3.7 cardHtml()：封面兜底（无图）+ 步骤数可选 + 文字初稿链接
OLD_CARD = '''function cardHtml(c,i){
  return `<article class="card" data-slug="${esc(c.slug)}" tabindex="0" style="--bc:${c.color};--bs:${c.soft}">
    <div class="cover">
      <img src="${esc(c.cover)}" alt="${esc(c.title)} 课件画面"
           onerror="this.style.opacity=0">
      <span class="cover-tag">${esc(c.tag)}</span>
      <span class="cover-steps">${c.steps} 步</span>
      <span class="kind">${esc(c.kind)}</span>
      <div class="cover-play"><span>${playSvg}</span></div>
    </div>
    <div class="card-body">
      <div class="chapter">${esc(c.chapter)}</div>
      <h3>${esc(c.title)}</h3>
      <p class="q">${esc(c.question)}</p>
      <div class="card-foot">
        <span class="go">进入课件 ${arrowSvg}</span>
        <button class="newwin" title="在新窗口打开" data-open="${esc(c.href)}">${winSvg}</button>
      </div>
    </div>
  </article>`;
}'''
NEW_CARD = '''function cardHtml(c,i){
  const cover = c.cover
    ? `<img src="${esc(c.cover)}" alt="${esc(c.title)} 课件画面" onerror="this.style.opacity=0">`
    : `<div class="cover-fallback"><div class="cf-title">${esc(c.title)}</div></div>`;
  const steps = (typeof c.steps === 'number') ? `<span class="cover-steps">${c.steps} 步</span>` : '';
  const draft = c.draft ? `<a class="draft-link" href="${esc(c.draft)}" target="_blank" rel="noopener" title="查看文字初稿">文字初稿</a>` : '';
  return `<article class="card" data-slug="${esc(c.slug)}" tabindex="0" style="--bc:${c.color};--bs:${c.soft}">
    <div class="cover">
      ${cover}
      <span class="cover-tag">${esc(c.tag)}</span>
      ${steps}
      <span class="kind">${esc(c.kind)}</span>
      <div class="cover-play"><span>${playSvg}</span></div>
    </div>
    <div class="card-body">
      <div class="chapter">${esc(c.chapter)}</div>
      <h3>${esc(c.title)}</h3>
      <p class="q">${esc(c.question)}</p>
      <div class="card-foot">
        <span class="go">进入课件 ${arrowSvg}</span>
        ${draft}
        <button class="newwin" title="在新窗口打开" data-open="${esc(c.href)}">${winSvg}</button>
      </div>
    </div>
  </article>`;
}'''
assert OLD_CARD in tpl, 'cardHtml 锚点未命中'
tpl = tpl.replace(OLD_CARD, NEW_CARD)

# 3.8 统计卡改为 4 个聚合指标
OLD_STATS = """$('#stats').innerHTML = BOOKS.map(b =>
  `<div class="stat"><span class="n">${String(b.courses.length).padStart(2,'0')}</span>
    <div><div class="t">${b.name}</div><div class="s">${b.system} · ${b.courses.length} 门课件</div></div>
    <span class="dot" style="background:${b.color};box-shadow:0 0 0 5px ${b.color}33"></span></div>`).join('');
$('#totalNum').textContent = ALL.length;"""
NEW_STATS = """const _statData = [
  ['36','课件总数','化学 15 · 物理 21'],
  ['15','化学实验','八全 / 九上 / 九下'],
  ['21','物理实验','八上 / 八下 / 九上 / 九下'],
  ['100%','单文件离线','three.js r147 · 断网可用']
];
$('#stats').innerHTML = _statData.map(s =>
  `<div class="stat"><span class="n">${s[0]}</span>
    <div><div class="t">${s[1]}</div><div class="s">${s[2]}</div></div>
    <span class="dot" style="background:#0e7490;box-shadow:0 0 0 5px #0e749033"></span></div>`).join('');
$('#totalNum').textContent = ALL.length;"""
assert OLD_STATS in tpl, 'stats 锚点未命中'
tpl = tpl.replace(OLD_STATS, NEW_STATS)

# 3.9 页脚
OLD_FOOT = '''<footer id="about">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="fbrand">格物实验室<span>GEWU LAB · 3D INTERACTIVE COURSEWARE</span></div>
        <p style="margin-top:14px">以真实器材、真实尺度与真实读数搭建的初中化学交互课件。所有页面均为单文件 HTML，不依赖网络、不依赖服务器，双击即可打开。</p>
      </div>
      <div>
        <h4>关于学制</h4>
        <p>「八年级全一册」属五四学制（2024 秋版）；「九年级上册 / 下册」属六三学制（2024 / 2025 版）。五四制九年级使用全一册，内容与六三制九上、九下对应，请按本校学制选用。</p>
        <p>同一课题在两套学制里编号不同：五四制九年级全一册为「学生实验 1」，六三制九年级上册为「学生实验 3」。本合集同时收录单元探究版与必做实验版，卡片上的编号一律用教材的学生实验编号。</p>
      </div>
      <div>
        <h4>使用提示</h4>
        <p>点击卡片在本页沉浸预览，也可用右上角按钮在新窗口打开。课件内可拖拽旋转、滚轮缩放，按「上一步 / 下一步」分步演示。</p>
        <p>推荐全屏浏览；若画面异常请强制刷新（Ctrl + F5）。界面主题会记住你的选择。</p>
      </div>
    </div>
    <div class="foot-bot">
      <span>依据《义务教育化学课程标准（2022 年版）》 · 对照鲁教版初中化学教材编排</span>
      <span>three.js r147 · 单文件离线课件 · 格物实验室</span>
    </div>
  </div>
</footer>'''
NEW_FOOT = '''<footer id="about">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="fbrand">格物实验室<span>GEWU LAB · 3D INTERACTIVE COURSEWARE</span></div>
        <p style="margin-top:14px">以真实器材、真实尺度与真实读数搭建的初中化学、物理交互课件。所有页面均为单文件 HTML，不依赖网络、不依赖服务器，双击即可打开。</p>
      </div>
      <div>
        <h4>化学 · 15 门</h4>
        <p>八年级全一册（五四制 2024 秋）、九年级上册 / 下册（六三制 2024 / 2025 版）。同一课题在两套学制里编号不同，卡片一律用教材的学生实验编号。</p>
        <p>涵盖课标 8 个必做实验与教材单元探究，读数由模型计算，操作都有对应物体与运动。</p>
      </div>
      <div>
        <h4>物理 · 21 门</h4>
        <p>鲁教版（五四制）初中物理学生必做实验：八上 7 个、八下 5 个、九上 7 个、九下 2 个，含测量类与探究类。</p>
        <p>点击卡片在本页沉浸预览，也可用右上角按钮在新窗口打开；课件内可拖拽旋转、滚轮缩放、分步演示。</p>
      </div>
    </div>
    <div class="foot-bot">
      <span>依据《义务教育化学 / 物理课程标准（2022 年版）》 · 对照鲁教版初中教材编排</span>
      <span>three.js r147 · 单文件离线课件 · 仅限教学 · 禁止商用</span>
    </div>
  </div>
</footer>'''
assert OLD_FOOT in tpl, 'footer 锚点未命中'
tpl = tpl.replace(OLD_FOOT, NEW_FOOT)

# 3.10 注入新增 CSS（封面兜底 / 文字初稿 / 学科分隔）
NEW_CSS = '''
.cover-fallback{position:absolute;inset:0;display:flex;align-items:flex-end;padding:16px 18px;pointer-events:none}
.cover-fallback .cf-title{color:#fff;font-size:16px;font-weight:700;line-height:1.4;text-shadow:0 2px 10px rgba(0,0,0,.45);max-width:92%}
.draft-link{font-size:12px;font-weight:600;color:var(--ink3);text-decoration:none;padding:4px 10px;border:1px solid var(--line);border-radius:8px;transition:.16s;white-space:nowrap}
.draft-link:hover{color:var(--brand);border-color:var(--brand);background:var(--brand-soft)}
.subj-div{display:flex;align-items:center;gap:12px;margin:46px 0 8px;font-size:21px;font-weight:750;letter-spacing:.5px;color:var(--ink)}
.subj-div:first-of-type{margin-top:4px}
.subj-dot{width:12px;height:12px;border-radius:50%;flex:none}
.subj-div::after{content:"";flex:1;height:1px;background:var(--line)}
'''
assert '</style>' in tpl, 'style 锚点未命中'
tpl = tpl.replace('</style>', NEW_CSS + '</style>', 1)

# ── 4. 写出 ────────────────────────────────────────────────────────
OUT.write_text(tpl, encoding='utf-8')

# 自检
n_cards = tpl.count('class="card"')
n_chem = sum(1 for c in courses_phys if False)  # placeholder
print('生成 %s' % OUT)
print('卡片总数(含分隔) class="card" 出现次数 =', n_cards)
print('物理课程解析 =', len(courses_phys), ' 化学课程 =', sum(len(b['courses']) for b in chem_books),
      ' 物理册次 =', [(b['name'], len(b['courses'])) for b in phys_books])
