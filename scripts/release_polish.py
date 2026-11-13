#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""格物实验室 · 开源发布后处理脚本（release_polish）

在 build_chem.py / physics_index.py 生成课件之后运行：
  1) 给每个 3D 课件（*-step.html）注入悬浮「下载本课件」按钮。
     按钮下载当前页面自身（单文件离线可用，断网/双击均可）。
  2) 给两个目录页（index.html）注入固定「仅限教学·禁止商用」许可徽标，
     并为每张课程卡片追加「下载」按钮（指向对应 -step.html，带 download 属性）。

幂等：已含标记注释则跳过，可重复运行、可放在构建后。
"""
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSES = [ROOT / 'courses' / 'chem-exp', ROOT / 'courses' / 'physics-exp']

DL_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>')

# ── 1. 课件页：悬浮下载按钮 ──────────────────────────────
COURSE_MARK = '<!-- 格物实验室·下载按钮(release_polish) -->'
COURSE_SNIPPET = COURSE_MARK + '''
<style>
.gw-dl{position:fixed;right:16px;bottom:16px;z-index:99999;display:inline-flex;align-items:center;gap:7px;
  padding:10px 16px;border-radius:11px;border:1px solid rgba(255,255,255,.22);
  background:linear-gradient(135deg,#0e7490,#1b9c9c);color:#fff;
  font:600 13.5px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  box-shadow:0 10px 30px rgba(8,40,55,.35);text-decoration:none;cursor:pointer;transition:.18s}
.gw-dl:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(8,40,55,.45)}
.gw-dl svg{width:16px;height:16px}
@media(max-width:560px){.gw-dl{right:12px;bottom:12px;padding:9px 13px;font-size:12.5px}}
</style>
<a class="gw-dl" id="gwDl" download>
  ''' + DL_SVG + '''
  <span>下载本课件</span>
</a>
<script>
(function(){var a=document.getElementById('gwDl');if(a){a.href=location.href;a.download=(document.title||'courseware')+'.html';}})();
</script>'''

# ── 2. 目录页：许可徽标 + 卡片下载 ───────────────────────
INDEX_MARK = '<!-- 格物实验室·目录页增强(release_polish) -->'
INDEX_SNIPPET = INDEX_MARK + '''
<style>
.gw-lic{position:fixed;left:16px;bottom:16px;z-index:99998;display:inline-flex;align-items:center;gap:7px;
  padding:7px 13px;border-radius:999px;background:rgba(13,28,42,.82);color:#ffd9a8;
  font:600 12.5px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  border:1px solid rgba(255,180,120,.4);backdrop-filter:blur(6px);box-shadow:0 8px 24px rgba(0,0,0,.3);
  letter-spacing:.3px;pointer-events:none}
.gw-lic svg{width:14px;height:14px}
.gw-card-dl{display:inline-flex;align-items:center;gap:5px;margin-left:auto;
  padding:6px 12px;border-radius:9px;font-size:12px;font-weight:600;text-decoration:none;
  color:#0e7490;background:rgba(14,116,144,.1);border:1px solid rgba(14,116,144,.25);transition:.16s;white-space:nowrap}
.gw-card-dl:hover{background:rgba(14,116,144,.18)}
.gw-card-dl svg{width:13px;height:13px}
@media(max-width:560px){.gw-lic{font-size:11px;padding:6px 10px}}
</style>
<div class="gw-lic">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/></svg>
  仅限教学使用 · 禁止商用
</div>
<script>
(function(){
  var dlSvg=''' + repr(DL_SVG) + ''';
  function addDl(){
    document.querySelectorAll('.card').forEach(function(card){
      if(card.querySelector('.gw-card-dl')) return;
      var href=null, main=card.querySelector('.card-main');
      if(main&&main.getAttribute('href')) href=main.getAttribute('href');
      if(!href){ var ow=card.querySelector('[data-open]'); if(ow) href=ow.getAttribute('data-open'); }
      var slug=card.getAttribute('data-slug');
      if(!href&&slug) href='./'+slug+'-step.html';
      if(!href) return;
      var a=document.createElement('a');
      a.className='gw-card-dl'; a.href=href; a.setAttribute('download','');
      a.innerHTML=dlSvg+'<span>下载</span>';
      var foot=card.querySelector('.card-foot')||card.querySelector('.links');
      if(foot) foot.appendChild(a);
    });
  }
  if(typeof window.render==='function'){ var _r=window.render; window.render=function(){ _r.apply(window,arguments); addDl(); }; }
  addDl();
})();
</script>'''


def inject(path, marker, snippet):
    html = path.read_text(encoding='utf-8')
    if marker in html:
        return False
    if '</body>' not in html:
        return False
    html = html.replace('</body>', snippet + '\n</body>', 1)
    path.write_text(html, encoding='utf-8')
    return True


def main():
    n_course = 0
    for d in COURSES:
        for f in sorted(d.glob('*-step.html')):
            if f.name == 'index.html':
                continue
            if inject(f, COURSE_MARK, COURSE_SNIPPET):
                n_course += 1
    n_index = 0
    for d in COURSES:
        idx = d / 'index.html'
        if idx.exists() and inject(idx, INDEX_MARK, INDEX_SNIPPET):
            n_index += 1
    # 统一总入口（仓库根目录 index.html）
    site = ROOT / 'index.html'
    if site.exists() and inject(site, INDEX_MARK, INDEX_SNIPPET):
        n_index += 1
    print('注入完成：课件 %d 个，目录页 %d 个' % (n_course, n_index))


if __name__ == '__main__':
    main()
