# -*- coding: utf-8 -*-
"""从已构建的单文件 HTML 里，提取最后一处 <script> 内的课件 IIFE，
   去掉 build 时前置的 POSTFX 代码，存回 build/lessons3d/luhe-*.js 以便改编。"""
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
CO = BASE / 'courses'
LESS = BASE / 'build' / 'lessons3d'

jobs = [
    ('water-step', 'luhe-water-step'),
    ('burn-step', 'luhe-burn-step'),
    ('metal-step', 'luhe-metal-step'),
    ('neutral-step', 'luhe-acidbase-step'),
    ('co2make-step', 'luhe-co2-step'),
]

for src, dst in jobs:
    html = (CO / (src + '.html')).read_text(encoding='utf-8')
    blocks = re.findall(r'<script>(.*?)</script>', html, re.S)
    if not blocks:
        print('NO SCRIPT', src); continue
    blk = blocks[-1]
    i = blk.rfind('/* 格物实验室')
    if i < 0:
        i = blk.rfind('(function')
    js = blk[i:].strip()
    (LESS / (dst + '.js')).write_text(js + '\n', encoding='utf-8')
    tail = js[-14:].replace('\n', ' ')
    print('%-22s %6d chars  end=%s' % (dst, len(js), tail))
