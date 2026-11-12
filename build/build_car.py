# -*- coding: utf-8 -*-
"""组装黑灯工厂虚拟仿真：build/lessons3d/carline-step.js → labs/car-assembly.html

与 build_factory.py 的差别：本页需要 Bloom（黑灯场景里 LED/激光/火花必须起光晕），
所以额外把 r147 的 UMD postprocessing addons 注入页面；否则 kit3d.setupPostfx() 会静默跳过。
"""
import base64
import os
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path(r'D:\360MoveData\Users\Lenovo\Documents\默认项目\格物实验室')
BUILD = BASE / 'build'
OUT = BASE / 'labs' / 'car-assembly.html'
EX = BASE / 'node_modules' / 'three' / 'examples' / 'js'

POSTFX_FILES = [
    'utils/BufferGeometryUtils.js',
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

page = (BUILD / '_page.html').read_text(encoding='utf-8')
css = (BUILD / 'style.css').read_text(encoding='utf-8')
kit = (BUILD / 'kit3d.js').read_text(encoding='utf-8')
three = (BUILD / 'vendor' / 'three.min.js').read_text(encoding='utf-8')
gltf = (BUILD / 'vendor' / 'GLTFLoader.js').read_text(encoding='utf-8')
sim = (BUILD / 'sim.js').read_text(encoding='utf-8')
lesson = (BUILD / 'lessons3d' / 'carline-step.js').read_text(encoding='utf-8')

postfx = ''
for f in POSTFX_FILES:
    p = EX / f
    if not p.exists():
        print('ERROR: missing postfx file', f)
        sys.exit(1)
    postfx += '\n' + p.read_text(encoding='utf-8')


def _b64(name):
    f = BUILD / 'assets' / name
    if not f.exists():
        return ''
    return base64.b64encode(f.read_bytes()).decode('ascii')


# GLB 占位符在 lesson 内部，必须先替换 lesson 再插入页面
glb_robot = _b64('robot_arm.glb')
glb_agv = _b64('agv.glb')
lesson = lesson.replace('{{GLB_ROBOT_ARM}}', glb_robot).replace('{{GLB_AGV}}', glb_agv)

# 真实 CAD 六轴臂（TRLC-DK1 减面版）：9 个分连杆 glb 以 base64 表注入
DK1_DIR = BASE / 'labs' / 'robot_glb_lo'
_dk1 = []
for _n in ['base_link', 'link1-2', 'link2-3', 'link3-4', 'link4-5', 'link5-6', 'link6-7', 'finger_left', 'finger_right']:
    _f = DK1_DIR / (_n + '.glb')
    if _f.exists():
        _dk1.append('"%s":"%s"' % (_n, base64.b64encode(_f.read_bytes()).decode('ascii')))
lesson = lesson.replace('/*__GLB_DK1__*/',
                        'window.__GLB_DK1 = {' + ','.join(_dk1) + '};')

html = (page
        .replace('{{CSS}}', css)
        .replace('{{TITLE}}', '黑灯工厂 · 汽车总装线')
        .replace('{{CHIP}}', '虚拟仿真 · 智能制造 · 汽车总装')
        .replace('{{THREE}}', three)
        .replace('{{GLTF}}', gltf)
        .replace('<script>\n{{SIM}}\n</script>',
                 '<script>\n' + postfx + '\n</script>\n<script>\n{{SIM}}\n</script>')
        .replace('{{SIM}}', sim)
        .replace('{{KIT}}', kit)
        .replace('{{LESSON}}', lesson))

# 注入失败保护：占位符还在说明替换没生效
for ph in ('{{GLB_ROBOT_ARM}}', '{{GLB_AGV}}', '{{LESSON}}', '{{POSTFX}}'):
    if ph in html:
        print('WARNING: placeholder left:', ph)

OUT.write_text(html, encoding='utf-8')
print('built %s  %.0f KB  (glb: robot=%dKB agv=%dKB, postfx=%dKB)' % (
    OUT, len(html.encode('utf-8')) / 1024,
    len(glb_robot) * 3 // 4 // 1024, len(glb_agv) * 3 // 4 // 1024, len(postfx) / 1024))

# 语法自检（node 不一定在 PATH 里：找不到就跳过，不让构建失败）
tmp = BASE / 'labs' / '_dark_check.js'
tmp.write_text(lesson, encoding='utf-8')
NODE = os.environ.get('NODE') or shutil.which('node') or str(
    Path.home() / '.workbuddy/binaries/node/versions/22.22.2-6/node.exe')
if Path(NODE).exists():
    r = subprocess.run([NODE, '--check', str(tmp)], capture_output=True, text=True)
    tmp.unlink()
    if r.returncode != 0:
        print('LESSON SYNTAX ERROR:\n' + r.stderr)
        sys.exit(1)
    print('lesson syntax OK')
else:
    tmp.unlink()
    print('lesson syntax skipped (node not found)')
