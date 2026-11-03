# 程序化（非 GLB）版本的构建脚本：仅内联 three.min.js + postfx。
# 该版本用代码几何拼机械臂，无需 .glb 资源，适合做"无模型"对照 / 轻量演示。
#
# 依赖：python3（仅标准库）。无需 node / 无需联网。
# 用法：cd robot-glb-sim/demo && python build_robot.py
import pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
SRC  = HERE / "robot-arm.src.html"
OUT  = HERE / "robot-arm.html"
THREE = HERE / "vendor" / "three.min.js"

POSTFX_FILES = [
    "vendor/postfx/CopyShader.js",
    "vendor/postfx/LuminosityHighPassShader.js",
    "vendor/postfx/SSAOShader.js",
    "vendor/postfx/SimplexNoise.js",
    "vendor/postfx/EffectComposer.js",
    "vendor/postfx/RenderPass.js",
    "vendor/postfx/ShaderPass.js",
    "vendor/postfx/MaskPass.js",
    "vendor/postfx/SSAOPass.js",
    "vendor/postfx/UnrealBloomPass.js",
]

src = SRC.read_text(encoding="utf-8")
three = THREE.read_text(encoding="utf-8")

if "/*THREEJS*/" not in src:
    print("ERROR: placeholder /*THREEJS*/ not found in source"); sys.exit(1)

postfx = ""
for f in POSTFX_FILES:
    p = HERE / f
    if not p.exists():
        print("ERROR: missing postfx file", f); sys.exit(1)
    postfx += "\n" + p.read_text(encoding="utf-8")

out = src.replace("/*THREEJS*/", three)
if "/*POSTFX*/" in src:
    out = out.replace("/*POSTFX*/", postfx)

OUT.write_text(out, encoding="utf-8")
print(f"built {OUT}  ({len(out)/1024:.0f} KB)")

m = re.findall(r"<script>(.*?)</script>", src, re.S)
app = m[-1]
tmp = HERE / "_robot_app_check.js"
tmp.write_text(app, encoding="utf-8")
try:
    r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
    tmp.unlink()
    if r.returncode == 0:
        print("app script syntax OK")
    else:
        print("SYNTAX ERROR:\n" + r.stderr); sys.exit(1)
except FileNotFoundError:
    tmp.unlink()
    print("(node 未安装，跳过语法自检)")
