#!/usr/bin/env python3
"""把 three.min.js + karst-scene.js 内联成单文件 HTML（断网可用、双击可开）

用法： python build/build_karst.py
产物： labs/karst-block.html
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "labs" / "karst-block.src.html"
APP = ROOT / "build" / "karst-scene.js"
THREE = ROOT / "node_modules" / "three" / "build" / "three.min.js"
OUT = ROOT / "labs" / "karst-block.html"


def main():
    src = SRC.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    three = THREE.read_text(encoding="utf-8")

    for token in ("/*THREEJS*/", "/*APP*/"):
        if token not in src:
            print("ERROR: placeholder %s not found" % token)
            sys.exit(1)

    # 语法检查（先查应用脚本，避免把坏代码打进 HTML）
    NODE = os.environ.get("NODE") or shutil.which("node") or str(
        pathlib.Path.home() / ".workbuddy/binaries/node/versions/22.22.2-6/node.exe")
    if pathlib.Path(NODE).exists():
        tmp = ROOT / "build" / "_karst_check.js"
        tmp.write_text(app, encoding="utf-8")
        r = subprocess.run([NODE, "--check", str(tmp)], capture_output=True, text=True)
        tmp.unlink()
        if r.returncode != 0:
            print("SYNTAX ERROR:\n" + r.stderr)
            sys.exit(1)
        print("app script syntax OK")
    else:
        print("syntax check skipped (node not found)")

    out = src.replace("/*THREEJS*/", three).replace("/*APP*/", app)
    left = re.findall(r"/\*[A-Z]+\*/", out)
    if left:
        print("WARN unreplaced:", set(left))
    OUT.write_text(out, encoding="utf-8")
    print("built %s  (%.0f KB)" % (OUT, len(out.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
