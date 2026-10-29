#!/usr/bin/env python3
"""把 three.js + 引擎 + 课件 JS 内联成单文件 HTML。

用法：
    python inline_build.py --template page.html --three three.min.js \
        --engine kit3d.js --lesson lessons/xxx.js --out courses/xxx.html \
        --title "制取氧气" --chip "化学 · 九年级 · 课题3"

模板里需要这些占位符：{{CSS}} {{THREE}} {{SIM}} {{KIT}} {{LESSON}} {{TITLE}} {{CHIP}}
（{{SIM}} 是模型层 sim.js，没有就传空）
"""
import argparse, pathlib, re

def read(p):
    return pathlib.Path(p).read_text(encoding='utf-8') if p and pathlib.Path(p).exists() else ''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--template', required=True)
    ap.add_argument('--three', required=True)
    ap.add_argument('--engine', required=True)
    ap.add_argument('--lesson', required=True)
    ap.add_argument('--sim', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', default='')
    ap.add_argument('--chip', default='')
    a = ap.parse_args()

    html = read(a.template)
    for key, val in {
        '{{THREE}}': read(a.three), '{{KIT}}': read(a.engine),
        '{{LESSON}}': read(a.lesson), '{{SIM}}': read(a.sim),
        '{{TITLE}}': a.title, '{{CHIP}}': a.chip,
    }.items():
        html = html.replace(key, val)

    # 兜底：没替换掉的占位符会留下 {{...}}，这里提示
    left = re.findall(r'\{\{[A-Z]+\}\}', html)
    if left:
        print('WARN 未替换的占位符:', set(left))

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'built {out}  {len(html.encode("utf-8"))/1024:.0f} KB')

if __name__ == '__main__':
    main()
