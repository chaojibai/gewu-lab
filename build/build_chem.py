# -*- coding: utf-8 -*-
"""把 build/lessons/*.js 组装成单文件课件，并重建目录页。"""
import json
import re
from pathlib import Path

BASE = Path(r'D:\360MoveData\Users\Lenovo\Documents\默认项目\格物实验室')
BUILD = BASE / 'build'
COURSES = BASE / 'courses'
LESSONS = BUILD / 'lessons3d'
THREE = (BUILD / 'vendor' / 'three.min.js').read_text(encoding='utf-8')
SIM = (BUILD / 'sim.js').read_text(encoding='utf-8')

# 后期处理（仅按需注入）：r147 的 UMD addons，挂在全局 THREE 上
_EX = BUILD.parent / 'node_modules' / 'three' / 'examples' / 'js'
_POSTFX_FILES = [
    'shaders/CopyShader.js',
    'shaders/LuminosityHighPassShader.js',
    'shaders/SSAOShader.js',
    'math/SimplexNoise.js',
    'postprocessing/Pass.js',
    'postprocessing/ShaderPass.js',
    'postprocessing/MaskPass.js',
    'postprocessing/EffectComposer.js',
    'postprocessing/RenderPass.js',
    'postprocessing/SSAOPass.js',
    'postprocessing/UnrealBloomPass.js',
]
try:
    POSTFX = '\n'.join((_EX / f).read_text(encoding='utf-8') for f in _POSTFX_FILES)
except Exception:
    POSTFX = ''

META = {
    'air-step': dict(
        title='空气里氧气含量的测定', chip='化学 · 九上 · 第二单元 我们周围的空气 · 课题1',
        steps=7,
        q='一个密闭的集气瓶、一点红磷、一瓶水，怎么称出空气里的氧气？',
        tb='人教版 九年级上册 · 第二单元 我们周围的空气 · 课题1 空气'),
    'o2-step': dict(
        title='实验室制取氧气', chip='化学 · 九上 · 第二单元 · 课题3',
        steps=8,
        q='为什么试管口要略向下倾斜？为什么先撤导管、再熄酒精灯？',
        tb='人教版 九年级上册 · 第二单元 · 课题3 制取氧气'),
    'molecule-step': dict(
        title='分子在不停地运动', chip='化学 · 九上 · 第三单元 物质构成的奥秘',
        steps=7,
        q='没人搅动，一滴红墨水怎么自己把整杯水染匀了？',
        tb='人教版 九年级上册 · 第三单元 · 课题1 分子和原子'),
    'water-step': dict(
        title='电解水：水由什么组成', chip='化学 · 九上 · 第四单元 自然界的水',
        steps=8,
        q='通上电，两支试管里冒出的气体为什么总是 2:1？',
        tb='人教版 九年级上册 · 第四单元 · 课题3 水的组成'),
    'mass-step': dict(
        title='质量守恒定律', chip='化学 · 九上 · 第五单元 化学反应的定量关系',
        steps=8,
        q='铁钉泡进蓝色溶液，颜色变了、钉子上长了铜，质量为什么一点没少？',
        tb='人教版 九年级上册 · 第五单元 · 课题1 质量守恒定律'),
    'co2make-step': dict(
        title='二氧化碳的制取与检验', chip='化学 · 九上 · 第六单元 碳和碳的氧化物',
        steps=8,
        q='为什么实验室制二氧化碳，偏要用大理石和稀盐酸？',
        tb='人教版 九年级上册 · 第六单元 · 课题3 二氧化碳的制取'),
    'co2prop-step': dict(
        title='二氧化碳的性质', chip='化学 · 九上 · 第六单元 · 课题3',
        steps=7,
        q='把一瓶二氧化碳倒进烧杯，为什么下面的蜡烛先灭？',
        tb='人教版 九年级上册 · 第六单元 · 课题3 二氧化碳和一氧化碳'),
    'burn-step': dict(
        title='燃烧的条件', chip='化学 · 九上 · 第七单元 能源的合理利用',
        steps=8,
        q='同样放在铜片上，白磷自己烧起来了，红磷却一动不动，差别在哪儿？',
        tb='人教版 九年级上册 · 第七单元 · 课题1 燃烧和灭火'),
    'metal-step': dict(
        title='金属活动性顺序', chip='化学 · 九下 · 第八单元 金属和金属材料',
        steps=7,
        q='铁钉放进硫酸铜溶液，为什么会「长」出一层红色的铜？',
        tb='人教版 九年级下册 · 第八单元 · 课题2 金属的化学性质'),
    'neutral-step': dict(
        title='酸碱中和与 pH', chip='化学 · 九下 · 第十单元 常见的酸和碱',
        steps=8,
        q='红色溶液里滴入盐酸，为什么会在某一滴突然变成无色？',
        tb='人教版 九年级下册 · 第十单元 · 课题2 酸和碱的中和反应'),
    'candle-step': dict(
        title='对蜡烛及其燃烧的探究', chip='化学 · 九上 · 第一单元 步入化学殿堂 · 课题2',
        steps=8,
        q='一根蜡烛烧完，除了光，还留下了什么看不见的东西？',
        tb='鲁教版 九年级上册 · 第一单元 · 课题2 化学研究些什么', postfx=True),
    'peizhi-step': dict(
        title='配制一定溶质质量分数的溶液', chip='化学 · 九上 · 第三单元 溶液 · 溶液组成的定量表示',
        steps=8,
        q='要配 100 g 6% 的氯化钠溶液，该称多少克盐、量多少毫升水？',
        tb='鲁教版 九年级上册 · 第三单元 溶液 · 溶液组成的定量表示', postfx=True),
    'goldfoil-step': dict(
        title='α 粒子轰击金箔实验', chip='化学 · 九上 · 第三单元 物质构成的奥秘 · 课题2 原子的结构',
        steps=8,
        q='绝大多数 α 粒子直穿而过，为什么极少数会被「弹」回来？',
        tb='人教版 九年级上册 · 第三单元 · 课题2 原子的结构', postfx=True),
    'watercycle-step': dict(
        title='水的天然循环', chip='化学 · 九上 · 第二单元 探秘水世界 · 水分子的运动',
        steps=9,
        q='水从海里蒸发上天，又落回地面——转完这一整圈，水还是水吗？',
        tb='鲁教版 九年级上册 · 第二单元 探秘水世界 · 水分子的运动'),
    'nacl-step': dict(
        title='氯化钠的形成', chip='化学 · 九上 · 第二单元 水和溶液 · 原子的结构',
        steps=10,
        q='钠原子「多一个」电子、氯原子「少一个」，为什么凑到一起就成了稳定的食盐？',
        tb='鲁教版 九年级上册 · 第二单元 水和溶液 · 第三节 原子的结构', postfx=True),
    'dissolved-step': dict(
        title='氯化钠溶于水的微观过程', chip='化学 · 九上 · 第三单元 溶液 · 溶液的形成',
        steps=8,
        q='一勺盐放进水里，为什么会「消失」，又凭什么让整杯水都变咸？',
        tb='鲁教版 九年级上册 · 第三单元 溶液 · 第一节 溶液的形成', postfx=True),
    'engine4-step': dict(
        title='直列四缸四冲程汽油机 · 组件示意', chip='职业教育 · 汽车发动机 · 曲柄连杆 + 配气机构',
        steps=6,
        q='四个气缸为什么按 1-3-4-2 顺序、每隔 180° 依次点火？',
        tb='职业教育 · 汽车运用与维修 · 发动机构造与原理', postfx=True, catalog=False),
}

ORDER = ['air-step', 'o2-step', 'molecule-step', 'goldfoil-step', 'water-step', 'mass-step',
         'co2make-step', 'co2prop-step', 'burn-step', 'metal-step', 'neutral-step',
         'peizhi-step', 'candle-step', 'watercycle-step', 'nacl-step', 'dissolved-step',
         'engine4-step']

ART = {
    'air-step': 'air', 'o2-step': 'o2', 'molecule-step': 'molecule', 'goldfoil-step': 'goldfoil',
    'water-step': 'water', 'mass-step': 'mass', 'co2make-step': 'co2make',
    'co2prop-step': 'co2prop', 'burn-step': 'burn', 'metal-step': 'metal',
    'neutral-step': 'neutral', 'peizhi-step': 'peizhi', 'candle-step': 'candle', 'lens-step': 'lens',
    'watercycle-step': 'watercycle', 'nacl-step': 'nacl', 'dissolved-step': 'dissolved',
    'engine4-step': 'engine',
}


def build_pages(only=None):
    page = (BUILD / '_page.html').read_text(encoding='utf-8')
    css = (BUILD / 'style.css').read_text(encoding='utf-8')
    kit = (BUILD / 'kit3d.js').read_text(encoding='utf-8')
    made = []
    for slug in ORDER:
        if only and slug not in only:
            continue
        js_path = LESSONS / (slug + '.js')
        if not js_path.exists():
            continue
        meta = META[slug]
        lesson_js = js_path.read_text(encoding='utf-8')
        if meta.get('postfx') and POSTFX:
            lesson_js = POSTFX + '\n' + lesson_js
        html = (page
                .replace('{{CSS}}', css)
                .replace('{{TITLE}}', meta['title'])
                .replace('{{CHIP}}', meta['chip'])
                .replace('{{THREE}}', THREE)
                .replace('{{GLTF}}', '')      # 化学课件不加载 GLB，占位符留空避免 ReferenceError
                .replace('{{SIM}}', SIM)
                .replace('{{KIT}}', kit)
                .replace('{{LESSON}}', lesson_js))
        out = COURSES / (slug + '.html')
        out.write_text(html, encoding='utf-8')
        made.append((slug, out.stat().st_size))
    return made


def build_catalog():
    path = BASE / '目录.html'
    doc = path.read_text(encoding='utf-8')

    courses = []
    for slug in ORDER:
        if not (COURSES / (slug + '.html')).exists():
            continue
        m = META[slug]
        if m.get('catalog') is False:
            continue
        courses.append({
            'subject': '化学', 'type': '探究实验', 'steps': m['steps'],
            'title': m['title'], 'question': m['q'], 'textbook': m['tb'],
            'href': 'courses/%s.html' % slug, 'art': ART[slug],
        })

    planned = [
        ['化学', '溶液的配制与溶质质量分数', '九下 · 第九单元 溶液'],
        ['化学', '粗盐中难溶性杂质的去除', '九下 · 第十一单元 盐 化肥'],
        ['化学', '一氧化碳的性质与还原反应', '九上 · 第六单元 · 课题3'],
        ['化学', '常见的酸：盐酸与硫酸', '九下 · 第十单元 · 课题1'],
        ['物理', '声音的产生与传播', '八上 · 第二章 声现象'],
    ]

    # 物理样课仍然保留在目录里
    if (COURSES / 'lens-step.html').exists():
        courses.append({
            'subject': '物理', 'type': '规律探究', 'steps': 9,
            'title': '凸透镜成像的规律',
            'question': '同一块凸透镜，为什么既能当照相机、又能当投影仪、还能当放大镜？',
            'textbook': '人教版 八年级上册 · 第五章 透镜及其应用 · 第三节',
            'href': 'courses/lens-step.html', 'art': 'lens',
        })

    doc = re.sub(r'const COURSES = \[[\s\S]*?\n\];',
                 'const COURSES = ' + json.dumps(courses, ensure_ascii=False, indent=2) + ';',
                 doc, count=1)
    doc = re.sub(r'const PLANNED = \[[\s\S]*?\n\];',
                 'const PLANNED = ' + json.dumps(planned, ensure_ascii=False, indent=2) + ';',
                 doc, count=1)
    path.write_text(doc, encoding='utf-8')
    return len(courses)


# 鲁教版合集页的课程顺序（按教材单元排序）
LU_ORDER = ['candle-step', 'watercycle-step', 'nacl-step', 'peizhi-step', 'dissolved-step']


def build_luhe():
    """生成《鲁教版化学实验.html》：目录卡片 + iframe 内嵌打开 5 门鲁教版课件。"""
    tpl = (BUILD / '_luhe.html').read_text(encoding='utf-8')
    courses = []
    for slug in LU_ORDER:
        if not (COURSES / (slug + '.html')).exists():
            continue
        m = META[slug]
        # 从 tb 里抠出"第 X 单元/第 X 节"当卡片角标
        mm = re.search(r'(第[一二三四五六七八九十]+单元[^·]*)', m['tb'])
        unit = mm.group(1).strip() if mm else '鲁教版 九年级化学'
        courses.append({
            'title': m['title'], 'question': m['q'], 'textbook': m['tb'],
            'unit': unit, 'steps': m['steps'], 'href': 'courses/%s.html' % slug,
        })
    doc = tpl.replace('{{COURSES}}', json.dumps(courses, ensure_ascii=False, indent=2))
    out = BASE / '鲁教版化学实验.html'
    out.write_text(doc, encoding='utf-8')
    return len(courses)


if __name__ == '__main__':
    import sys
    only = set(sys.argv[1:]) or None
    for slug, size in build_pages(only):
        print('built %-14s %8d bytes' % (slug, size))
    if not only:
        print('catalog courses:', build_catalog())
        print('luhe collection:', build_luhe())
