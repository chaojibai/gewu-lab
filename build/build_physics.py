# -*- coding: utf-8 -*-
"""把 build/lessons3d/<slug>-step.js 组装成单文件物理课件 courses/physics-exp/<slug>-step.html。
复用化学的 _page.html 模板 + three/kit3d/chem-kit（借化学仪器），并注入物理专用 physics-kit.js。"""
import base64
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BUILD = BASE / 'build'
ASSETS = BASE / 'assets'
COURSES = BASE / 'courses'
LESSONS = BUILD / 'lessons3d'
OUT = COURSES / 'physics-exp'


def asset(rel, alt=None):
    p = BUILD / rel
    if p.exists():
        return p.read_text(encoding='utf-8')
    return (ASSETS / (alt or rel)).read_text(encoding='utf-8')


THREE = asset('vendor/three.min.js')
SIM = asset('sim.js')
KIT3D = asset('kit3d.js')
CHEMKIT = asset('chem-kit.js')

# 物理专用仪器库（缺省回退到 assets/；若有 build/ 工作副本优先）
PHYSKIT = asset('physics-kit.js') + '\n' + asset('physics-apparatus.js')

try:
    POSTFX_FILES = [
        'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'shaders/SSAOShader.js',
        'math/SimplexNoise.js', 'postprocessing/Pass.js', 'postprocessing/ShaderPass.js',
        'postprocessing/MaskPass.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
        'postprocessing/SSAOPass.js', 'postprocessing/UnrealBloomPass.js',
    ]
    _EX = BASE.parent / 'node_modules' / 'three' / 'examples' / 'js'
    POSTFX = '\n'.join((_EX / f).read_text(encoding='utf-8') for f in POSTFX_FILES)
except Exception:
    POSTFX = ''


# ── 鲁教版（五四制）初中物理 21 个学生必做实验 ──────────────────
# slug 带 -step 后缀，避免覆盖 courses/physics-exp/ 下已存在的文字初稿（.html）。
META = {
    'tianping-step': dict(
        title='用托盘天平测量物体的质量', chip='物理 · 鲁教版 · 八上 · 第四章 物质与材料 · 第一节 质量及其测量',
        steps=5, q='天平的哪一部分相当于等臂杠杆？', tb='鲁教版 八年级上册 · 第四章 物质与材料 · 第一节 质量及其测量'),
    'density-step': dict(
        title='测量固体和液体的密度', chip='物理 · 鲁教版 · 八上 · 第四章 物质与材料 · 第三节 测量物质的密度',
        steps=4, q='为什么测密度要先测质量后测体积？', tb='鲁教版 八年级上册 · 第四章 物质与材料 · 第三节 测量物质的密度'),
    'length-time-step': dict(
        title='用刻度尺测量长度，用表测量时间', chip='物理 · 鲁教版 · 八上 · 第一章 机械运动 / 走进实验室',
        steps=4, q='读数为什么必须估读到分度值下一位？', tb='鲁教版 八年级上册 · 第一章 机械运动 / 走进实验室'),
    'speed-step': dict(
        title='测量物体运动的速度', chip='物理 · 鲁教版 · 八上 · 第一章 机械运动 · 第三节 速度的测量',
        steps=4, q='平均速度等于瞬时速度吗？', tb='鲁教版 八年级上册 · 第一章 机械运动 · 第三节 速度的测量'),
    'reflection-step': dict(
        title='探究光的反射定律', chip='物理 · 鲁教版 · 八上 · 第三章 光现象 · 第二节 光的反射',
        steps=4, q='反射光线、入射光线与法线的位置关系？', tb='鲁教版 八年级上册 · 第三章 光现象 · 第二节 光的反射'),
    'plane-mirror-step': dict(
        title='探究平面镜成像的特点', chip='物理 · 鲁教版 · 八上 · 第三章 光现象 · 第三节 平面镜成像',
        steps=4, q='平面镜成的是实像还是虚像？', tb='鲁教版 八年级上册 · 第三章 光现象 · 第三节 平面镜成像'),
    'convex-lens-step': dict(
        title='探究凸透镜成像的规律', chip='物理 · 鲁教版 · 八上 · 第三章 光现象 · 第五节 凸透镜成像的规律',
        steps=5, q='一倍焦距、二倍焦距分别“分”什么？', tb='鲁教版 八年级上册 · 第三章 光现象 · 第五节 凸透镜成像的规律'),
    'spring-step': dict(
        title='用弹簧测力计测量力', chip='物理 · 鲁教版 · 八下 · 第六章 力与运动 · 第二节 弹力',
        steps=4, q='弹簧测力计能否测摩擦力？怎么测？', tb='鲁教版 八年级下册 · 第六章 力与运动 · 第二节 弹力'),
    'friction-step': dict(
        title='探究滑动摩擦力大小与哪些因素有关', chip='物理 · 鲁教版 · 八下 · 第六章 力与运动 · 第四节 摩擦力',
        steps=4, q='测量滑动摩擦力为什么要让物体匀速直线运动？', tb='鲁教版 八年级下册 · 第六章 力与运动 · 第四节 摩擦力'),
    'liquid-pressure-step': dict(
        title='探究液体压强与哪些因素有关', chip='物理 · 鲁教版 · 八下 · 第七章 压强 · 第二节 液体压强',
        steps=4, q='液体内部压强随深度怎样变化？', tb='鲁教版 八年级下册 · 第七章 压强 · 第二节 液体压强'),
    'buoyancy-step': dict(
        title='探究浮力大小与哪些因素有关', chip='物理 · 鲁教版 · 八下 · 第八章 浮力 · 第二节 阿基米德原理',
        steps=4, q='浮力大小等于什么？（阿基米德原理）', tb='鲁教版 八年级下册 · 第八章 浮力 · 第二节 阿基米德原理'),
    'lever-step': dict(
        title='探究杠杆的平衡条件', chip='物理 · 鲁教版 · 八下 · 第九章 简单机械 · 第一节 杠杆',
        steps=4, q='杠杆平衡时 F₁L₁ 与 F₂L₂ 有什么关系？', tb='鲁教版 八年级下册 · 第九章 简单机械 · 第一节 杠杆'),
    'thermometer-step': dict(
        title='用常见温度计测量温度', chip='物理 · 鲁教版 · 九上 · 第十一章 物态变化 · 第一节 温度及其测量',
        steps=4, q='体温计为什么可离开人体读数？', tb='鲁教版 九年级上册 · 第十一章 物态变化 · 第一节 温度及其测量'),
    'ammeter-step': dict(
        title='用电流表测量电流', chip='物理 · 鲁教版 · 九上 · 第十四章 电流 电压 电阻 · 第一节 电流',
        steps=4, q='电流表为什么必须串联在电路中？', tb='鲁教版 九年级上册 · 第十四章 电流 电压 电阻 · 第一节 电流'),
    'voltmeter-step': dict(
        title='用电压表测量电压', chip='物理 · 鲁教版 · 九上 · 第十四章 电流 电压 电阻 · 第三节 电压',
        steps=4, q='电压表为什么必须并联在用电器两端？', tb='鲁教版 九年级上册 · 第十四章 电流 电压 电阻 · 第三节 电压'),
    'resistance-step': dict(
        title='用电流表和电压表测量电阻（伏安法）', chip='物理 · 鲁教版 · 九上 · 第十五章 欧姆定律 · 第三节 电阻的测量',
        steps=4, q='伏安法测电阻依据什么公式？', tb='鲁教版 九年级上册 · 第十五章 欧姆定律 · 第三节 电阻的测量'),
    'boiling-step': dict(
        title='探究水在沸腾前后温度变化的特点', chip='物理 · 鲁教版 · 九上 · 第十一章 物态变化 · 第三节 汽化与液化',
        steps=7, q='水沸腾后继续加热，温度还会升吗？', tb='鲁教版 九年级上册 · 第十一章 物态变化 · 第三节 汽化与液化',
        postfx=True),
    'series-parallel-step': dict(
        title='探究串、并联电路中电流与电压的特点', chip='物理 · 鲁教版 · 九上 · 第十四章 · 第二/四节 串并联规律',
        steps=3, q='串联与并联的电流、电压规律有何不同？', tb='鲁教版 九年级上册 · 第十四章 · 第二节(电流)/第四节(电压)规律'),
    'ohm-step': dict(
        title='探究电流与电压、电阻的关系', chip='物理 · 鲁教版 · 九上 · 第十五章 欧姆定律 · 第一节',
        steps=4, q='综合两段结论得到什么定律？', tb='鲁教版 九年级上册 · 第十五章 欧姆定律 · 第一节 电流与电压、电阻的关系'),
    'solenoid-step': dict(
        title='探究通电螺线管外部磁场的方向', chip='物理 · 鲁教版 · 九下 · 第十八章 电与磁 · 第二节 电生磁',
        steps=5, q='右手螺旋定则中四指与拇指分别代表什么？', tb='鲁教版 九年级下册 · 第十八章 电与磁 · 第二节 电生磁'),
    'induction-step': dict(
        title='探究导体在磁场中运动时产生感应电流的条件', chip='物理 · 鲁教版 · 九下 · 第十八章 电与磁 · 第五节 磁生电',
        steps=5, q='产生感应电流必须满足什么条件？', tb='鲁教版 九年级下册 · 第十八章 电与磁 · 第五节 磁生电'),
}

ORDER = [
    'tianping-step', 'density-step', 'length-time-step', 'speed-step',
    'reflection-step', 'plane-mirror-step', 'convex-lens-step',
    'spring-step', 'friction-step', 'liquid-pressure-step', 'buoyancy-step', 'lever-step',
    'thermometer-step', 'ammeter-step', 'voltmeter-step', 'resistance-step', 'boiling-step',
    'series-parallel-step', 'ohm-step', 'solenoid-step', 'induction-step'
]

# 黑板板书表（物理公式/要点唯一真源）
BOARD = {
    'boiling-step': dict(title='水的沸腾', make=True, lines=[
        '沸腾：液体内部和表面同时发生的剧烈汽化',
        '沸点：标准大气压下 water 为 100 ℃',
        '沸腾条件：① 达到沸点 ② 继续吸热',
        '沸腾时：继续吸热，温度保持不变',
        '图像：沸腾前升温；沸腾后呈水平线']),
}


def build_pages(only=None):
    page = asset('_page.html')
    css = asset('style.css')
    kit = KIT3D + CHEMKIT + '\n' + PHYSKIT
    made = []
    for slug in ORDER:
        if only and slug not in only:
            continue
        js_path = LESSONS / (slug + '.js')
        if not js_path.exists():
            continue
        meta = META[slug]
        lesson_js = js_path.read_text(encoding='utf-8')
        # 物理页把顶部"← 目录"改指向本目录的文字初稿索引
        page2 = page.replace('../目录.html', 'index.html')
        if meta.get('postfx') and POSTFX:
            lesson_js = POSTFX + '\n' + lesson_js
        if slug in BOARD:
            patch = (BUILD / '_board_patch.js').read_text(encoding='utf-8')
            lesson_js += '\n' + patch.replace('__BOARD_DATA__', json.dumps(BOARD[slug], ensure_ascii=False))
        html = (page2
                .replace('{{CSS}}', css)
                .replace('{{TITLE}}', meta['title'])
                .replace('{{CHIP}}', meta['chip'])
                .replace('{{THREE}}', THREE)
                .replace('{{GLTF}}', '')
                .replace('{{SIM}}', SIM)
                .replace('{{KIT}}', kit)
                .replace('{{LESSON}}', lesson_js))
        OUT.mkdir(parents=True, exist_ok=True)
        out = OUT / (slug + '.html')
        out.write_text(html, encoding='utf-8')
        made.append((slug, out.stat().st_size))
    return made


if __name__ == '__main__':
    import sys
    only = set(sys.argv[1:]) or None
    for slug, size in build_pages(only):
        print('built %-16s %8d bytes' % (slug, size))
