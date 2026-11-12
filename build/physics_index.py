# -*- coding: utf-8 -*-
"""生成 courses/physics-exp/index.html：21 个物理实验的 3D 交互课件总入口。
每张卡片主链接到 <slug>-step.html（3D 交互），副链接保留文字初稿 <slug>.html。"""
import html
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / 'courses' / 'physics-exp'

# (实验号, slug, 标题, 册次, 类别, 课标, 章节, 器材)
E = [
    (1, 'tianping', '用托盘天平测量物体的质量', '八上', 'measure', '4.1.1', '第四章 物质与材料 · 第一节 质量及其测量', '托盘天平（含砝码）、小木块、烧杯、水'),
    (2, 'density', '测量固体和液体的密度', '八上', 'measure', '4.1.2', '第四章 物质与材料 · 第三节 测量物质的密度', '天平、量筒、小石块、盐水'),
    (4, 'length-time', '用刻度尺测量长度，用表测量时间', '八上', 'measure', '4.1.4', '第一章 机械运动 / 走进实验室 · 第四节', '刻度尺、停表'),
    (5, 'speed', '测量物体运动的速度', '八上', 'measure', '4.1.5', '第一章 机械运动 · 第三节 速度的测量', '刻度尺、秒表、小车、斜面'),
    (15, 'reflection', '探究光的反射定律', '八上', 'inquiry', '4.2.6', '第三章 光现象 · 第二节 光的反射', '激光笔、平面镜、量角器、白纸'),
    (16, 'plane-mirror', '探究平面镜成像的特点', '八上', 'inquiry', '4.2.7', '第三章 光现象 · 第三节 平面镜成像', '平板玻璃、两支蜡烛、刻度尺、方格纸'),
    (17, 'convex-lens', '探究凸透镜成像的规律', '八上', 'inquiry', '4.2.8', '第三章 光现象 · 第五节 凸透镜成像的规律', '凸透镜、光具座、蜡烛、光屏'),
    (6, 'spring', '用弹簧测力计测量力', '八下', 'measure', '4.1.6', '第六章 力与运动 · 第二节 弹力', '弹簧测力计、钩码'),
    (11, 'friction', '探究滑动摩擦力大小与哪些因素有关', '八下', 'inquiry', '4.2.2', '第六章 力与运动 · 第四节 摩擦力', '弹簧测力计、木块、木板、棉布、毛巾'),
    (12, 'liquid-pressure', '探究液体压强与哪些因素有关', '八下', 'inquiry', '4.2.3', '第七章 压强 · 第二节 液体压强', '压强计、水、盐水'),
    (13, 'buoyancy', '探究浮力大小与哪些因素有关', '八下', 'inquiry', '4.2.4', '第八章 浮力 · 第二节 阿基米德原理', '弹簧测力计、溢水杯、石块、水'),
    (14, 'lever', '探究杠杆的平衡条件', '八下', 'inquiry', '4.2.5', '第九章 简单机械 · 第一节 杠杆', '杠杆、支架、钩码、弹簧测力计'),
    (3, 'thermometer', '用常见温度计测量温度', '九上', 'measure', '4.1.3', '第十一章 物态变化 · 第一节 温度及其测量', '实验室温度计、体温计、水'),
    (7, 'ammeter', '用电流表测量电流', '九上', 'measure', '4.1.7', '第十四章 电流 电压 电阻 · 第一节 电流', '电流表、电源、灯泡、导线'),
    (8, 'voltmeter', '用电压表测量电压', '九上', 'measure', '4.1.8', '第十四章 电流 电压 电阻 · 第三节 电压', '电压表、电源、灯泡、导线'),
    (9, 'resistance', '用电流表和电压表测量电阻', '九上', 'measure', '4.1.9', '第十五章 欧姆定律 · 第三节 电阻的测量', '电流表、电压表、滑动变阻器、待测电阻'),
    (10, 'boiling', '探究水在沸腾前后温度变化的特点', '九上', 'inquiry', '4.2.1', '第十一章 物态变化 · 第三节 汽化与液化', '酒精灯、烧杯、温度计、水'),
    (20, 'series-parallel', '探究串联电路和并联电路中电流、电压的特点', '九上', 'inquiry', '4.2.11', '第十四章 · 第二节(电流)/第四节(电压)', '电流表、电压表、灯泡、导线'),
    (21, 'ohm', '探究电流与电压、电阻的关系', '九上', 'inquiry', '4.2.12', '第十五章 欧姆定律 · 第一节', '电流表、电压表、滑动变阻器、定值电阻'),
    (18, 'solenoid', '探究通电螺线管外部磁场的方向', '九下', 'inquiry', '4.2.9', '第十八章 电与磁 · 第二节 电生磁', '螺线管、电源、小磁针、铁屑'),
    (19, 'induction', '探究导体在磁场中运动时产生感应电流的条件', '九下', 'inquiry', '4.2.10', '第十八章 电与磁 · 第五节 磁生电', '蹄形磁铁、导体棒、灵敏电流计、导线'),
]

BOOKS = [('八上', 7), ('八下', 5), ('九上', 7), ('九下', 2)]

def card(e):
    n, slug, title, book, cat, std, chapter, app = e
    cat_cls = 'measure' if cat == 'measure' else 'inquiry'
    cat_txt = '测量类' if cat == 'measure' else '探究类'
    step = slug + '-step.html'
    draft = slug + '.html'
    return (
        '<div class="card">\n'
        '  <a class="card-main" href="%s">\n'
        '    <div class="idx">实验 %02d · 课标 %s</div>\n'
        '    <h3>%s</h3>\n'
        '    <div class="meta">\n'
        '      <span><span class="pill %s">%s</span><span class="pill std">%s</span></span>\n'
        '      <span><b>章节：</b>%s</span>\n'
        '      <span><b>器材：</b>%s</span>\n'
        '    </div>\n'
        '  </a>\n'
        '  <div class="links"><b>3D 交互 ▶</b> · <a href="%s">文字初稿</a></div>\n'
        '</div>' % (step, n, std, html.escape(title), cat_cls, cat_txt, book, html.escape(chapter), html.escape(app), draft)
    )

def book_block(book, count):
    items = [e for e in E if e[3] == book]
    cards = ''.join(card(e) for e in items)
    return (
        '<div class="book">\n'
        '  <div class="book-h"><span class="tag">%s</span><h2>%s 册必做实验</h2><span class="n">共 %d 个</span></div>\n'
        '  <div class="cards">%s</div>\n'
        '</div>' % (book, book, count, cards)
    )

body = ''.join(book_block(b, c) for b, c in BOOKS)

doc = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>鲁教版（五四制）初中物理 21 个学生必做实验 · 3D 交互课件 · 格物实验室</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="topbar"><div class="wrap">
  <div class="brand"><span class="mark">物</span><div>格物实验室<small>PHYSICS LAB · 3D</small></div></div>
  <div class="crumb">鲁教版（五四制）初中物理 · 21 个学生必做实验 · 3D 交互课件</div>
</div></div>
<div class="wrap">
  <div class="hero">
    <h1>鲁教版（五四制）初中物理 · 学生必做实验（3D 交互课件）</h1>
    <p>共 <b>21</b> 个学生必做实验，单文件 three.js 课件，<b>断网可开</b>。点击卡片进入 3D 交互页面：
    可旋转/缩放观察器材，按步骤操作、读数、作答，并参与随堂小测。每张卡片保留<b>文字初稿</b>链接。</p>
    <div class="stat-row">
      <div class="stat"><b>21</b><span>实验总数</span></div>
      <div class="stat"><b>9</b><span>测量类（4.1）</span></div>
      <div class="stat"><b>12</b><span>探究类（4.2）</span></div>
      <div class="stat"><b>4</b><span>教材册次</span></div>
    </div>
  </div>
  %s
</div>
<div class="footer">格物实验室 · 鲁教版（五四制）初中物理 21 个学生必做实验 · 3D 交互课件总入口 · 可离线浏览</div>
</body></html>
""" % body

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'index.html').write_text(doc, encoding='utf-8')
print('wrote', OUT / 'index.html', len(doc), 'bytes')
