import os
import pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "labs" / "robot-arm.src.html"
OUT = ROOT / "labs" / "robot-arm.html"
THREE = ROOT / "node_modules" / "three" / "build" / "three.min.js"

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

src = SRC.read_text(encoding="utf-8")
three = THREE.read_text(encoding="utf-8")

if "/*THREEJS*/" not in src:
    print("ERROR: placeholder /*THREEJS*/ not found in source"); sys.exit(1)

postfx = ""
for f in POSTFX_FILES:
    p = ROOT / f
    if not p.exists():
        print("ERROR: missing postfx file", f); sys.exit(1)
    postfx += "\n" + p.read_text(encoding="utf-8")

out = src.replace("/*THREEJS*/", three)
if "/*POSTFX*/" in src:
    out = out.replace("/*POSTFX*/", postfx)
OUT.write_text(out, encoding="utf-8")
print(f"built {OUT}  ({len(out)/1024:.0f} KB)")

# --- syntax check the app script (the last <script> block) ---
m = re.findall(r"<script>(.*?)</script>", src, re.S)
app = m[-1]
tmp = ROOT / "labs" / "_robot_app_check.js"
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
