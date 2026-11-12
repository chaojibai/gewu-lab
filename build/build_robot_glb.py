import base64, os, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "labs" / "robot-arm-glb.src.html"
OUT = ROOT / "labs" / "robot-arm-glb.html"
THREE = ROOT / "node_modules" / "three" / "build" / "three.min.js"
GLTF = ROOT / "node_modules" / "three" / "examples" / "js" / "loaders" / "GLTFLoader.js"
GLB_DIR = ROOT / "labs" / "robot_glb_lo"

POSTFX_FILES = [
    "node_modules/three/examples/js/shaders/CopyShader.js",
    "node_modules/three/examples/js/shaders/LuminosityHighPassShader.js",
    "node_modules/three/examples/js/shaders/SSAOShader.js",
    "node_modules/three/examples/js/math/SimplexNoise.js",
    "node_modules/three/examples/js/postprocessing/EffectComposer.js",
    "node_modules/three/examples/js/postprocessing/RenderPass.js",
    "node_modules/three/examples/js/postprocessing/ShaderPass.js",
    "node_modules/three/examples/js/postprocessing/MaskPass.js",
    "node_modules/three/examples/js/postprocessing/SSAOPass.js",
    "node_modules/three/examples/js/postprocessing/UnrealBloomPass.js",
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
    p = ROOT / f
    if not p.exists():
        print("ERROR: missing postfx file", f); sys.exit(1)
    postfx += "\n" + p.read_text(encoding="utf-8")

# build base64 glb data-uri table
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

# syntax check the app script (last <script> block)
m = re.findall(r"<script>(.*?)</script>", src, re.S)
app = m[-1]
tmp = ROOT / "labs" / "_robot_glb_app_check.js"
tmp.write_text(app, encoding="utf-8")
NODE = os.environ.get("NODE") or shutil.which("node") or str(
    pathlib.Path.home() / ".workbuddy/binaries/node/versions/22.22.2-6/node.exe")
if pathlib.Path(NODE).exists():
    r = subprocess.run([NODE, "--check", str(tmp)], capture_output=True, text=True)
    tmp.unlink()
    if r.returncode == 0:
        print("app script syntax OK")
    else:
        print("SYNTAX ERROR:\n" + r.stderr)
        sys.exit(1)
else:
    tmp.unlink()
    print("app script syntax skipped (node not found)")
