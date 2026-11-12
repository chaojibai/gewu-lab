# -*- coding: utf-8 -*-
"""把 phys360.js 的 8 机位截图拼成每门一张联系表。
用法：python build/phys360_sheet.py [out目录名] [slug ...]
输出：shots/<out>/sheet-<slug>.jpg（2 列 x 4 行，每格 720x450）
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
outname = args[0] if args and not args[0].endswith('.js') else 'phys360'
if args and not args[0].endswith('.js'):
    args = args[1:]
OUT = ROOT / 'shots' / outname
NAMES = ['front 正面', 'left45 左45°', 'right45 右45°', 'left90 左90°',
         'right90 右90°', 'back 背面', 'top 俯视', 'detail 细节特写']
CW, CH, PAD, BAR = 720, 450, 6, 26
slugs = args or sorted({p.name.split('-v')[0]
                        for p in OUT.glob('*-v*.png') if '-v' in p.name})
try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
except Exception:
    FONT = ImageFont.load_default()

for slug in slugs:
    files = [OUT / f'{slug}-v{i}.png' for i in range(1, 9)]
    if not all(f.exists() for f in files):
        print('skip', slug, '(缺机位)')
        continue
    W, H = CW * 2 + PAD * 3, (CH + BAR) * 4 + PAD * 5
    sheet = Image.new('RGB', (W, H), '#20242a')
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB').resize((CW, CH), Image.LANCZOS)
        x = PAD + (i % 2) * (CW + PAD)
        y = PAD + (i // 2) * (CH + BAR + PAD)
        d.rectangle([x, y, x + CW, y + BAR], fill='#313943')
        d.text((x + 8, y + 3), f'{slug}   v{i+1}  {NAMES[i]}', fill='#e8eef5', font=FONT)
        sheet.paste(im, (x, y + BAR))
    dest = OUT / f'sheet-{slug}.jpg'
    sheet.save(dest, quality=88)
    print('sheet →', dest)
