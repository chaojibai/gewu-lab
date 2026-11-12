# -*- coding: utf-8 -*-
"""把 build/lessons/*.js 组装成单文件课件，并重建目录页。"""
import base64
import json
import re
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BUILD = BASE / 'build'
ASSETS = BASE / 'assets'
COURSES = BASE / 'courses'
LESSONS = BUILD / 'lessons3d'


def asset(rel, alt=None):
    """读引擎/模板：优先 build/ 的工作副本，缺失时回落 assets/ 分发源，
    这样 clone 下来（build/ 里只有课件源码）也能直接构建。"""
    p = BUILD / rel
    if p.exists():
        return p.read_text(encoding='utf-8')
    return (ASSETS / (alt or rel)).read_text(encoding='utf-8')


THREE = asset('vendor/three.min.js')
SIM = asset('sim.js')

# GLTFLoader（r147 UMD）：仅当课件声明 glb 资产时注入 {{GLTF}}，其余课件保持空。
# 与 build_car.py 的做法一致：loader.parse(base64 → ArrayBuffer)，绝不用 loader.load("data:")，
# 否则内置预览的 CSP 会拦掉 fetch(data:)，模型静默消失。
def gltf_loader_src():
    p = BUILD / 'vendor' / 'GLTFLoader.js'
    return p.read_text(encoding='utf-8') if p.exists() else ''


def glb_table(names):
    """把 build/assets/<name>.glb 编成 window.__GLB 的 base64 表（一次注入，课件按名取）。"""
    parts = []
    for n in names:
        p = BUILD / 'assets' / (n + '.glb')
        if not p.exists():
            raise SystemExit('ERROR: missing glb asset: %s' % p)
        parts.append('"%s":"%s"' % (n, base64.b64encode(p.read_bytes()).decode('ascii')))
    return 'window.__GLB = {\n' + ',\n'.join(parts) + '\n};'

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
        title='对蜡烛及其燃烧的探究', chip='化学 · 鲁教版 · 九上 · 第一单元 步入化学殿堂 · 第二节',
        steps=8,
        q='一根蜡烛烧完，除了光，还留下了什么看不见的东西？',
        tb='鲁教版 九年级上册（2024 秋）· 第一单元 步入化学殿堂 · 第二节 体验化学探究', postfx=True),
    'peizhi-step': dict(
        title='配制一定溶质质量分数的溶液', chip='化学 · 鲁教版 · 九上 · 溶液组成的定量表示',
        steps=8,
        q='要配 100 g 6% 的氯化钠溶液，该称多少克盐、量多少毫升水？',
        tb='鲁教版 九年级上册（2024 秋）· 第三单元 探秘水世界 · 定量表示（学生实验3）', postfx=True),
    'goldfoil-step': dict(
        title='α 粒子轰击金箔实验', chip='化学 · 九上 · 第三单元 物质构成的奥秘 · 课题2 原子的结构',
        steps=8,
        q='绝大多数 α 粒子直穿而过，为什么极少数会被「弹」回来？',
        tb='人教版 九年级上册 · 第三单元 · 课题2 原子的结构', postfx=True),
    'watercycle-step': dict(
        title='水的天然循环', chip='化学 · 鲁教版 · 九上 · 第三单元 探秘水世界 · 运动的水分子',
        steps=9,
        q='水从海里蒸发上天，又落回地面——转完这一整圈，水还是水吗？',
        tb='鲁教版 九年级上册（2024 秋）· 第三单元 探秘水世界 · 第一节 运动的水分子'),
    'nacl-step': dict(
        title='氯化钠的形成', chip='化学 · 鲁教版 · 九上 · 第二单元 认识物质的构成 · 原子',
        steps=10,
        q='钠原子「多一个」电子、氯原子「少一个」，为什么凑到一起就成了稳定的食盐？',
        tb='鲁教版 九年级上册（2024 秋）· 第二单元 认识物质的构成 · 第一节 原子', postfx=True),
    'dissolved-step': dict(
        title='氯化钠溶于水的微观过程', chip='化学 · 鲁教版 · 九上 · 第三单元 探秘水世界 · 物质在水中的溶解',
        steps=8,
        q='一勺盐放进水里，为什么会「消失」，又凭什么让整杯水都变咸？',
        tb='鲁教版 九年级上册（2024 秋）· 第三单元 探秘水世界 · 第三节 物质在水中的溶解', postfx=True),
    'engine4-step': dict(
        title='直列四缸四冲程汽油机 · 组件示意', chip='职业教育 · 汽车发动机 · 曲柄连杆 + 配气机构',
        steps=6,
        q='四个气缸为什么按 1-3-4-2 顺序、每隔 180° 依次点火？',
        tb='职业教育 · 汽车运用与维修 · 发动机构造与原理', postfx=True, catalog=False),
    'turbofan-step': dict(
        title='高涵道比涡扇发动机 · 结构与气流', chip='职业教育 · 航空发动机 · 外观 GLB 精模 + 程序化核心机',
        steps=3,
        q='点火之后，推力到底从哪来？外涵冷流为什么贡献近八成？',
        tb='职业教育 · 航空发动机维修 · 涡扇发动机构造与原理',
        postfx=True, catalog=False, glb=['turbofan-shell']),
    'drone-step': dict(
        title='工业级四旋翼无人机 · 结构与装调',
        chip='职业教育 · 无人机装调检修 · 外观 GLB 精模 + 程序化内部件',
        steps=3,
        q='四个电机为什么要「两正两反」转？上壳揭开后飞控仓里是什么？',
        tb='职业教育 · 无人机操控与维护 · 多旋翼装调与检修',
        postfx=True, catalog=False, glb=['drone-shell']),
    'cncmill-step': dict(
        title='MX-4LW 炮塔铣床 · 结构剖视与实时操控',
        chip='职业教育 · 金属切削 · 炮塔式万能铣床 · 面板实时操控 + 走刀仿真',
        steps=6,
        q='摇一圈手轮，工作台到底走多少？剖开铣头，2.2 kW 电机怎么变成 75~4550 转？',
        tb='职业教育 · 数控技术应用 · 炮塔式万能铣床结构与操作',
        postfx=True, catalog=False, glb=['cncmill-shell']),

    # ── 鲁教版化学必做实验（3D 交互课件）── 专门输出到 courses/chem-exp/，不进主目录
    'luhe-cuyan-step': dict(
        title='粗盐中难溶性杂质的去除', chip='化学 · 鲁教版 · 粗盐提纯（溶解·过滤·蒸发）',
        steps=8, q='粗盐里的泥沙，怎么一步步被分离出去？',
        tb='鲁教版 九年级下册（2025 春）· 学生实验8 粗盐中难溶性杂质的去除', out='courses/chem-exp', postfx=True),
    'luhe-o2-step': dict(
        title='氧气的实验室制取与性质', chip='化学 · 鲁教版 · 学生实验3 · 制取与性质',
        steps=8, q='为什么试管口要略向下倾斜？带火星的木条为什么会复燃？',
        tb='鲁教版 八年级全一册 · 学生实验3 氧气的实验室制取与性质', out='courses/chem-exp', postfx=True),
    'luhe-co2-step': dict(
        title='二氧化碳的实验室制取与性质', chip='化学 · 鲁教版 · 学生实验4 · 制取与性质',
        steps=8, q='为什么用大理石和稀盐酸制二氧化碳？它能不能像氧气那样排水收集？',
        tb='鲁教版 八年级全一册 · 学生实验4 二氧化碳的实验室制取与性质', out='courses/chem-exp', postfx=True),
    'luhe-metal-step': dict(
        title='常见金属的物理性质和化学性质', chip='化学 · 鲁教版 · 学生实验9 · 金属',
        steps=7, q='镁、锌、铁、铜，谁更活泼？从哪几个现象能比出来？',
        tb='鲁教版 九年级下册 · 学生实验9 常见金属的物理性质和化学性质', out='courses/chem-exp', postfx=True),
    'luhe-acidbase-step': dict(
        title='常见酸、碱的化学性质', chip='化学 · 鲁教版 · 学生实验7 · 酸碱',
        steps=8, q='酸遇上指示剂、金属、碱，分别会发生什么？',
        tb='鲁教版 九年级下册 · 学生实验7 常见酸、碱的化学性质', out='courses/chem-exp', postfx=True),
    'luhe-peizhi-step': dict(
        title='配制一定溶质质量分数的氯化钠溶液', chip='化学 · 鲁教版 · 溶液组成的定量表示',
        steps=8, q='配 100 g 6% 的食盐水，该称多少盐、量多少水？',
        tb='鲁教版 九年级上册（2024 秋）· 学生实验3 一定溶质质量分数的氯化钠溶液的配制', out='courses/chem-exp', postfx=True),
    'luhe-water-step': dict(
        title='水的组成及变化的探究', chip='化学 · 鲁教版 · 学生实验2 · 电解水',
        steps=8, q='通上电，两支试管里的气体为什么总是 2:1？',
        tb='鲁教版 八年级全一册 · 学生实验2 水的组成及变化的探究', out='courses/chem-exp', postfx=True),
    'luhe-burn-step': dict(
        title='燃烧条件的探究', chip='化学 · 鲁教版 · 学生实验5 · 燃烧',
        steps=8, q='白磷和红磷都摆在铜片上，为什么只有白磷烧起来？',
        tb='鲁教版 八年级全一册 · 学生实验5 燃烧条件的探究', out='courses/chem-exp', postfx=True),
    'luhe-skill-step': dict(
        title='化学实验基本技能训练', chip='化学 · 鲁教版 · 学生实验1 · 技能入门',
        steps=6, q='药品怎么取、酒精灯怎么用、仪器怎么洗？',
        tb='鲁教版 八年级全一册 · 学生实验1 化学实验基本技能训练', out='courses/chem-exp'),
    'luhe-eggshell-step': dict(
        title='测定鸡蛋壳中碳酸钙的含量', chip='化学 · 鲁教版 · 学生实验10 · 拓展探究',
        steps=7, q='鸡蛋壳里的碳酸钙，能用酸把它「量」出来吗？',
        tb='鲁教版 九年级下册 · 学生实验10 测定鸡蛋壳中碳酸钙的含量', out='courses/chem-exp', postfx=True),
}

ORDER = ['air-step', 'o2-step', 'molecule-step', 'goldfoil-step', 'water-step', 'mass-step',
         'co2make-step', 'co2prop-step', 'burn-step', 'metal-step', 'neutral-step',
         'peizhi-step', 'candle-step', 'watercycle-step', 'nacl-step', 'dissolved-step',
         'engine4-step', 'turbofan-step', 'drone-step', 'cncmill-step',
         'luhe-cuyan-step', 'luhe-o2-step', 'luhe-co2-step', 'luhe-metal-step',
         'luhe-acidbase-step', 'luhe-peizhi-step', 'luhe-water-step', 'luhe-burn-step',
         'luhe-skill-step', 'luhe-eggshell-step']

ART = {
    'air-step': 'air', 'o2-step': 'o2', 'molecule-step': 'molecule', 'goldfoil-step': 'goldfoil',
    'water-step': 'water', 'mass-step': 'mass', 'co2make-step': 'co2make',
    'co2prop-step': 'co2prop', 'burn-step': 'burn', 'metal-step': 'metal',
    'neutral-step': 'neutral', 'peizhi-step': 'peizhi', 'candle-step': 'candle', 'lens-step': 'lens',
    'watercycle-step': 'watercycle', 'nacl-step': 'nacl', 'dissolved-step': 'dissolved',
    'engine4-step': 'engine', 'turbofan-step': 'engine', 'drone-step': 'engine', 'cncmill-step': 'engine',
}


# ── 黑板板书表：公式 / 定量式 / 操作要点的唯一真源 ──────────────────
# make=True  → 教室/台面场景：有 envRoom 黑板就换贴图，没有就补挂一块黑板；
# make=False → 微观 / 自然场景没有教室墙，改在右侧面板顶部插「本课题要式」公式条。
# 方程式一律按 2022 课标与鲁教版 2024 版教材的写法（含条件、气体/沉淀符号）。
BOARD = {
    'luhe-skill-step': dict(title='化学实验基本技能训练', make=True, lines=[
        '取用三不：不手摸 · 不凑闻 · 不品尝',
        '加热：用外焰 · 试管口不朝向自己或他人',
        '节约：液体 1~2 mL · 固体只需盖满管底',
        '洗涤干净：内壁水膜均匀，不成股流下',
        '本课为操作训练，不涉及化学反应式']),
    'luhe-water-step': dict(title='水的组成及变化的探究', make=True, lines=[
        '2H₂O  —通电→  2H₂↑ + O₂↑',
        'V(H₂) : V(O₂) = 2 : 1',
        '正氧负氢 · 氢二氧一',
        'Na₂SO₄ 只增强导电性，不改变产物',
        '结论：水由氢、氧两种元素组成']),
    'luhe-o2-step': dict(title='氧气的实验室制取与性质', make=True, lines=[
        '2KMnO₄  —△→  K₂MnO₄ + MnO₂ + O₂↑',
        'C + O₂  —点燃→  CO₂（木炭在氧气中燃烧）',
        '装置：固体加热型 · 管口略向下倾斜',
        '收集：排水法（O₂ 不易溶于水）',
        '检验：带火星木条伸入瓶内 → 复燃']),
    'luhe-co2-step': dict(title='二氧化碳的实验室制取与性质', make=True, lines=[
        'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑',
        'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
        '装置：固液常温型 · 长颈漏斗下端须液封',
        '收集：向上排空气法（CO₂ 能溶于水）',
        '验满：燃着木条放瓶口 → 熄灭']),
    'luhe-burn-step': dict(title='燃烧条件的探究', make=True, lines=[
        '4P + 5O₂  —点燃→  2P₂O₅',
        '燃烧三条件：可燃物 · 与 O₂ 接触 · 温度达着火点',
        '白磷着火点约 40 ℃，红磷约 240 ℃',
        '铜片上白磷燃烧，红磷不燃烧；水中白磷不燃烧',
        '灭火：破坏三个条件中的任意一个即可']),
    'candle-step': dict(title='对蜡烛及其燃烧的探究', make=True, lines=[
        '石蜡 + O₂  —点燃→  CO₂ + H₂O（文字表达式）',
        'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O',
        '火焰三层：外焰 / 内焰 / 焰心，外焰温度最高',
        '熄灭后的白烟是石蜡蒸气凝成的固体小颗粒',
        '既有物理变化（熔化），又有化学变化（燃烧）']),
    'watercycle-step': dict(title='水的天然循环', make=False, dom=True, lines=[
        'H₂O(s) ⇌ H₂O(l) ⇌ H₂O(g)',
        '三态变化是物理变化，水分子本身不变',
        '循环：蒸发 → 凝结 → 降水 → 径流']),
    'nacl-step': dict(title='氯化钠的形成', make=False, dom=True, lines=[
        'Na − e⁻ → Na⁺',
        'Cl + e⁻ → Cl⁻',
        'Na⁺ 与 Cl⁻ 按 1 : 1 结合成 NaCl 晶体',
        '离子键：阴、阳离子之间的静电作用']),
    'dissolved-step': dict(title='氯化钠溶于水的微观过程', make=False, dom=True, lines=[
        'NaCl  —H₂O→  Na⁺ + Cl⁻',
        '水分子定向包围离子并使其扩散（水合）',
        '溶解后溶液均一、稳定，是物理过程']),
    'peizhi-step': dict(title='配制一定溶质质量分数的溶液', make=True, lines=[
        'w = m(溶质) / m(溶液) × 100%',
        'm(NaCl) = 100 g × 6% = 6 g',
        'm(H₂O) = 100 g − 6 g = 94 g ≈ 94 mL',
        '步骤：计算 → 称量 → 量取 → 溶解 → 装瓶',
        '量筒读数：视线与凹液面最低处相平']),
    'luhe-peizhi-step': dict(title='一定溶质质量分数的氯化钠溶液的配制', make=True, lines=[
        'w = m(溶质) / m(溶液) × 100%',
        'm(NaCl) = 100 g × 6% = 6 g',
        'm(H₂O) = 100 g − 6 g = 94 g ≈ 94 mL',
        '步骤：计算 → 称量 → 量取 → 溶解 → 装瓶',
        '误差：砝码与药品放反 / 仰视量取 → 浓度偏小']),
    'luhe-cuyan-step': dict(title='粗盐中难溶性杂质的去除', make=True, lines=[
        '溶解 → 过滤 → 蒸发（均为物理变化）',
        '一贴：滤纸紧贴漏斗内壁',
        '二低：滤纸低于漏斗口 · 液面低于滤纸边缘',
        '三靠：杯靠棒 · 棒靠三层 · 颈靠杯壁',
        '蒸发：边加热边搅拌，出现较多固体即停止']),
    'luhe-acidbase-step': dict(title='常见酸、碱的化学性质', make=True, lines=[
        'Zn + 2HCl = ZnCl₂ + H₂↑',
        'HCl + NaOH = NaCl + H₂O（中和反应）',
        'Fe₂O₃ + 6HCl = 2FeCl₃ + 3H₂O',
        '指示剂：石蕊遇酸变红 · 酚酞遇碱变红',
        '通式：酸 + 碱 → 盐 + 水']),
    'luhe-metal-step': dict(title='常见金属的物理性质和化学性质', make=True, lines=[
        '金属活动性：Mg > Zn > Fe > (H) > Cu',
        'Mg + 2HCl = MgCl₂ + H₂↑',
        'Fe + CuSO₄ = FeSO₄ + Cu',
        '置换：活泼金属把不活泼金属从其盐溶液中换出',
        '物理性质：有金属光泽 · 导电 · 导热 · 有延展性']),
    'luhe-eggshell-step': dict(title='测定鸡蛋壳中碳酸钙的含量', make=True, lines=[
        'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑',
        'n(CaCO₃) = n(CO₂) = V(CO₂) / Vₘ',
        'm(CaCO₃) = n × 100.09 g·mol⁻¹',
        'w = m(CaCO₃) / m(蛋壳) × 100%',
        '误差：CO₂ 溶于水 → 测得含量偏低']),
}
BOARD_PATCH = (BUILD / '_board_patch.js').read_text(encoding='utf-8')


def build_pages(only=None):
    page = asset('_page.html', 'page.html')
    css = asset('style.css')
    kit = asset('kit3d.js')
    # 化学共用器材层：统一尺度契约 + 元数据表 + 参数化 createAsset + 场景陈设。
    # 与 GLB 生成器共用同一份源码，几何只维护一处；所有课件都能用 window.ChemKit。
    chemkit = asset('chem-kit.js')
    made = []
    for slug in ORDER:
        if only and slug not in only:
            continue
        js_path = LESSONS / (slug + '.js')
        if not js_path.exists():
            continue
        meta = META[slug]
        lesson_js = js_path.read_text(encoding='utf-8')

        # glb 资产：GLTFLoader 源码 + base64 表注入 {{GLTF}}；
        # 若课件里也写了 {{GLB_<NAME>}} 占位符，必须在插入页面之前先替换掉，
        # 否则残留的占位符会让课件静默回退到程序化模型（没有报错，最难查）。
        glb_names = meta.get('glb') or []
        if glb_names:
            glb_b64 = {n: base64.b64encode((BUILD / 'assets' / (n + '.glb')).read_bytes()).decode('ascii')
                       for n in glb_names}
            for n, b64 in glb_b64.items():
                lesson_js = lesson_js.replace('{{GLB_%s}}' % n.upper().replace('-', '_'), b64)
            gltf_code = gltf_loader_src() + '\n' + glb_table(glb_names)
        else:
            gltf_code = ''                # 化学课件不加载 GLB，占位符留空避免 ReferenceError

        if '{{GLB_' in lesson_js:
            raise SystemExit('ERROR: unresolved GLB placeholder in %s' % slug)

        if meta.get('postfx') and POSTFX:
            lesson_js = POSTFX + '\n' + lesson_js

        # 黑板板书补丁：K.boot 同步跑完 scene.setup()，放在课件之后即可覆盖/补建黑板。
        if slug in BOARD:
            lesson_js += '\n' + BOARD_PATCH.replace(
                '__BOARD_DATA__', json.dumps(BOARD[slug], ensure_ascii=False))

        html = (page
                .replace('{{CSS}}', css)
                .replace('{{TITLE}}', meta['title'])
                .replace('{{CHIP}}', meta['chip'])
                .replace('{{THREE}}', THREE)
                .replace('{{GLTF}}', gltf_code)
                .replace('{{SIM}}', SIM)
                .replace('{{KIT}}', kit + '\n' + chemkit)
                .replace('{{LESSON}}', lesson_js))
        outdir = BASE / meta['out'] if meta.get('out') else COURSES
        outdir.mkdir(parents=True, exist_ok=True)
        out = outdir / (slug + '.html')
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
        if m.get('out'):   # 鲁教版专用文件夹有独立目录页，不进主目录
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


# ── 鲁教版化学「三册合集」：一个文件夹 + 一个 index ──────────────────
# 物理上全部收在 courses/chem-exp/：10 门必做实验由 build_pages 直接输出，
# 下面 5 门九上单元探究课原先散在 courses/ 根目录，构建时复制进来。
LU_DIR = COURSES / 'chem-exp'
LU_UNIT_COPY = ['candle-step', 'watercycle-step', 'nacl-step',
                'dissolved-step', 'peizhi-step']

# 册次元数据是唯一需要手写维护的部分；标题 / 步骤数 / 探究问题一律取自 META。
LU_BOOKS = [
    dict(id='b8', num='01', name='八年级全一册', system='五四制 · 2024 秋',
         color='#0f766e', soft='#e5f4f0',
         desc='化学入门与学生必做实验的主阵地：从基本操作、水的组成，到氧气与二氧化碳的制取、燃烧条件，五个实验按教材顺序排开。',
         courses=[
             dict(slug='luhe-skill-step', chapter='学生实验 1 · 基本技能训练', tag='学生实验 1',
                  kind='必做实验', desc='药品取用 酒精灯加热 仪器洗涤'),
             dict(slug='luhe-water-step', chapter='学生实验 2 · 水的组成', tag='学生实验 2',
                  kind='必做实验', desc='电解水 氢气 氧气 体积比 2:1'),
             dict(slug='luhe-o2-step', chapter='学生实验 3 · 氧气', tag='学生实验 3',
                  kind='必做实验', desc='高锰酸钾制氧 排水集气 带火星木条复燃'),
             dict(slug='luhe-co2-step', chapter='学生实验 4 · 二氧化碳', tag='学生实验 4',
                  kind='必做实验', desc='大理石 稀盐酸 向上排空气 石灰水'),
             dict(slug='luhe-burn-step', chapter='学生实验 5 · 燃烧条件', tag='学生实验 5',
                  kind='必做实验', desc='白磷 红磷 燃烧三要素 灭火'),
         ]),
    dict(id='b9a', num='02', name='九年级上册', system='六三制 · 2024 秋',
         color='#3c5fbf', soft='#e9eefb',
         desc='按 2024 版六三制教材单元编排：步入化学殿堂、认识物质的构成、探秘水世界；另收录「学生实验3 配制氯化钠溶液」的必做实验版。五四制九年级对应的是全一册，单元顺序不同。',
         courses=[
             dict(slug='candle-step', chapter='第一单元 步入化学殿堂 · 第二节 体验化学探究', tag='第一单元',
                  kind='单元探究', desc='蜡烛火焰 焰心 产物检验 熄灭白烟'),
             dict(slug='nacl-step', chapter='第二单元 认识物质的构成 · 第一节 原子', tag='第二单元',
                  kind='单元探究', desc='钠原子 氯原子 电子转移 离子 氯化钠'),
             dict(slug='watercycle-step', chapter='第三单元 探秘水世界 · 第一节 运动的水分子', tag='第三单元',
                  kind='单元探究', desc='蒸发 降水 水的天然循环 三态变化'),
             dict(slug='dissolved-step', chapter='第三单元 探秘水世界 · 第三节 物质在水中的溶解', tag='第三单元',
                  kind='单元探究', desc='溶解 水合离子 扩散 微观过程'),
             dict(slug='peizhi-step', chapter='第三单元 探秘水世界 · 溶液组成的定量表示', tag='第三单元',
                  kind='单元探究', desc='溶质质量分数 称量 量取 溶解 装瓶'),
             dict(slug='luhe-peizhi-step', chapter='学生实验 3 · 一定溶质质量分数的氯化钠溶液的配制', tag='学生实验 3',
                  kind='必做实验', desc='100g 6% 氯化钠溶液 配制 必做实验版'),
         ]),
    dict(id='b9b', num='03', name='九年级下册', system='六三制 · 2025 春',
         color='#b2642a', soft='#fbeee2',
         desc='从混合物分离到金属、酸碱性质，再到一个完整的定量探究：四个实验覆盖课标必做的分离、性质与测定类任务。',
         courses=[
             dict(slug='luhe-cuyan-step', chapter='学生实验 8 · 粗盐中难溶性杂质的去除', tag='学生实验 8',
                  kind='必做实验', desc='粗盐 溶解 过滤 蒸发 难溶性杂质'),
             dict(slug='luhe-acidbase-step', chapter='学生实验 7 · 酸与碱', tag='学生实验 7',
                  kind='必做实验', desc='指示剂 酸与金属 酸碱中和 氧化物'),
             dict(slug='luhe-metal-step', chapter='学生实验 9 · 金属', tag='学生实验 9',
                  kind='必做实验', desc='金属活动性 物理性质 与酸反应 置换'),
             dict(slug='luhe-eggshell-step', chapter='学生实验 10 · 定量探究', tag='学生实验 10',
                  kind='必做实验', desc='鸡蛋壳 碳酸钙 盐酸 排水量气 质量分数'),
         ]),
]


def build_luhe_collection():
    """把三册 15 门鲁教版课件收进 courses/chem-exp/，并生成 index.html。

    界面模板是 build/_luhe_index.html；课程标题/步骤/探究问题全部从 META 取，
    册次、章节、实验编号从 LU_BOOKS 取，避免两份数据各自漂移。
    """
    LU_DIR.mkdir(parents=True, exist_ok=True)
    for slug in LU_UNIT_COPY:
        src, dst = COURSES / (slug + '.html'), LU_DIR / (slug + '.html')
        if src.exists():
            shutil.copy2(src, dst)
        elif not dst.exists():
            print('WARN: missing unit courseware:', src)

    books, missing = [], []
    for b in LU_BOOKS:
        rows = []
        for e in b['courses']:
            slug = e['slug']
            if not (LU_DIR / (slug + '.html')).exists():
                missing.append(slug)
                continue
            m = META[slug]
            rows.append(dict(e,
                             title=m['title'], steps=m['steps'], question=m['q'],
                             href='./%s.html' % slug, cover='./thumbs/%s.jpg' % slug,
                             bid=b['id'], book=b['name'],
                             color=b['color'], soft=b['soft']))
        meta = {k: b[k] for k in ('id', 'num', 'name', 'system', 'color', 'soft', 'desc')}
        meta['courses'] = rows
        books.append(meta)

    tpl = (BUILD / '_luhe_index.html').read_text(encoding='utf-8')
    html = tpl.replace('{{BOOKS}}', json.dumps(books, ensure_ascii=False, indent=2))
    (LU_DIR / 'index.html').write_text(html, encoding='utf-8')
    if missing:
        print('WARN: courseware not built yet: %s' % ', '.join(missing))
    return sum(len(b['courses']) for b in books)


if __name__ == '__main__':
    import sys
    only = set(sys.argv[1:]) or None
    for slug, size in build_pages(only):
        print('built %-16s %8d bytes' % (slug, size))
    if not only:
        try:
            print('catalog courses:', build_catalog())
        except FileNotFoundError as e:
            print('catalog courses: SKIPPED (缺少 目录.html: %s)' % e)
        try:
            print('luhe collection:', build_luhe())
        except FileNotFoundError as e:
            print('luhe collection: SKIPPED (缺少模板: %s)' % e)
        print('luhe 3-book index:', build_luhe_collection())
