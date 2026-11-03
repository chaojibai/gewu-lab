# 可独立运行的构建脚本：把 three.min.js + postfx + GLTFLoader + 9 个 .glb(base64)
# 内联进 robot-arm-glb.src.html，产出单文件离线 HTML（robot-arm-glb.html）。
#
# 依赖：python3（仅标准库）。无需 node / 无需联网。
# 用法：cd robot-glb-sim/demo && python build_robot_glb.py
import base64, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
SRC  = HERE / "robot-arm-glb.src.html"
OUT  = HERE / "robot-arm-glb.html"
THREE = HERE / "vendor" / "three.min.js"
GLTF  = HERE / "vendor" / "loaders" / "GLTFLoader.js"
GLB_DIR = HERE / "assets" / "glb"

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

GLB_FILES = [
    "base_link", "link1-2", "link2-3", "link3-4",
    "link4-5", "link5-6", "link6-7", "finger_left", "finger_right",
]

src = SRC.read_text(encoding="utf-8")
three = THREE.read_text(encoding="utf-8")
gltf = GLTF.read_text(encoding="utf-8")

for ph, name in [("/*THREEJS*/", "three"), ("/*GLTFLOADER*/", "gltf")]:
    if ph not in src:
        print(f"ERROR: placeholder {ph} not found"); sys.exit(1)

postfx = ""
for f in POSTFX_FILES:
    p = HERE / f
    if not p.exists():
        print("ERROR: missing postfx file", f); sys.exit(1)
    postfx += "\n" + p.read_text(encoding="utf-8")

parts = []
for n in GLB_FILES:
    p = GLB_DIR / f"{n}.glb"
    if not p.exists():
        print("ERROR: missing glb", p); sys.exit(1)
    b64 = base64.b64encode(p.read_bytes()).decode("ascii")
    parts.append(f'"{n}":"{b64}"')
glb_js = "window.__GLB = {\n  " + ",\n  ".join(parts) + "\n};"

out = src.replace("/*THREEJS*/", three)
out = out.replace("/*GLTFLOADER*/", gltf)
out = out.replace("/*POSTFX*/", postfx)
if "/*GLB_ASSETS*/" not in out:
    print("ERROR: placeholder /*GLB_ASSETS*/ not found"); sys.exit(1)
out = out.replace("/*GLB_ASSETS*/", glb_js)

OUT.write_text(out, encoding="utf-8")
print(f"built {OUT}  ({len(out)/1024:.0f} KB)")

# 语法自检（最后一个 <script> 块）
m = re.findall(r"<script>(.*?)</script>", src, re.S)
app = m[-1]
tmp = HERE / "_robot_glb_app_check.js"
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
    print("(node 未安装，跳过语法自检；运行时若报错请检查 app 脚本)")
