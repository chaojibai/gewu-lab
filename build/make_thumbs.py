# -*- coding: utf-8 -*-
"""把 shots/COVER-*.png 压成 courses/chem-exp/thumbs/*.jpg 卡片封面。

封面来自真实默认视角截图（node scripts/shot-default.js "courses/chem-exp/*.html" COVER 1440 900），
统一中心裁剪成 16:9、640×360、JPEG q84，保证三册卡片视觉一致且离线自带。
用法: python build/make_thumbs.py [截图前缀，默认 COVER]
"""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance

BASE = Path(__file__).resolve().parent.parent
SHOTS = BASE / 'shots'
DIR = BASE / 'courses' / 'chem-exp'
THUMBS = DIR / 'thumbs'
PREFIX = sys.argv[1] if len(sys.argv) > 1 else 'COVER'
W, H, RATIO = 640, 360, 640 / 360


def cover_crop(im):
    sw, sh = im.size
    if sw / sh > RATIO:
        nw = int(sh * RATIO)
        left = (sw - nw) // 2
        im = im.crop((left, 0, left + nw, sh))
    else:
        nh = int(sw / RATIO)
        top = (sh - nh) // 2
        im = im.crop((0, top, sw, top + nh))
    return im.resize((W, H), Image.Resampling.LANCZOS)


def main():
    THUMBS.mkdir(parents=True, exist_ok=True)
    htmls = [p for p in sorted(DIR.glob('*.html')) if p.name != 'index.html']
    made, missing = [], []
    for html in htmls:
        src = SHOTS / ('%s-%s.png' % (PREFIX, html.stem))
        if not src.exists():
            missing.append(html.stem)
            continue
        im = Image.open(src).convert('RGB')
        im = ImageEnhance.Sharpness(cover_crop(im)).enhance(1.12)
        im = ImageEnhance.Contrast(im).enhance(1.03)
        out = THUMBS / (html.stem + '.jpg')
        im.save(out, 'JPEG', quality=84, optimize=True)
        made.append((out.name, out.stat().st_size))
    for name, size in made:
        print('thumb %-34s %6.1f KB' % (name, size / 1024))
    print('thumbs: %d/%d' % (len(made), len(htmls)))
    if missing:
        print('WARN missing screenshots:', ', '.join(missing))


if __name__ == '__main__':
    main()
