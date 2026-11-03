#!/usr/bin/env python3
"""轻量状态门：课件制作进度的唯一权威（.courseware/state.json）。

对话上下文是易失的；本文件才是进度事实。每个完成步骤必须带证据；
修正有上限（步 3、全程 6），超限硬停（退出码 3）。纯标准库，无依赖。

用法：
  python3 scripts/state_gate.py init --title "酸碱中和滴定"
  python3 scripts/state_gate.py next
  python3 scripts/state_gate.py mark read-source --evidence shots/notes.md
  python3 scripts/state_gate.py mark skip deliver --reason "本轮不发目录页"
  python3 scripts/state_gate.py mark refine --reason "终点体积公式错了，回规格修"
"""
import argparse
import json
import sys
import time
from pathlib import Path

STEP_LIMIT, TOTAL_LIMIT = 3, 6
STATE_DIR = Path(".courseware")
STATE_FILE = STATE_DIR / "state.json"

STEPS = [
    ("read-source", "读材：物理清点/层次分解/操作动词/盲区标注"),
    ("contract",    "质量契约：数学线/视觉线/行为线/体积线"),
    ("build",       "构建（可多次 refine，对照契约）"),
    ("verify-views","外观回归：多机位 + detail 清单"),
    ("verify-probe","行为回归：behavior_probe.js 断言通过"),
    ("deliver",     "交付：体积/加载检查 + 单文件就位"),
]


def load():
    if not STATE_FILE.exists():
        sys.exit("state_gate: 未初始化，先执行 init")
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save(s):
    STATE_DIR.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


def refines(s, step_id):
    return s["steps"][step_id]["refines"]


def is_stopped(s):
    total = sum(st["refines"] for st in s["steps"].values())
    per = max((refines(s, i) for i, _ in STEPS), default=0)
    return per >= STEP_LIMIT or total >= TOTAL_LIMIT


def cmd_init(a):
    if STATE_FILE.exists() and not a.force:
        sys.exit("state_gate: 已存在 state.json（--force 覆盖）")
    s = {
        "title": a.title,
        "created": time.strftime("%Y-%m-%d %H:%M"),
        "status": "open",
        "steps": {sid: {"status": "pending", "refines": 0, "evidence": [], "notes": []}
                  for sid, _ in STEPS},
    }
    save(s)
    print(f"state_gate: 已初始化「{a.title}」，共 {len(STEPS)} 步")


def cmd_next(a):
    s = load()
    if is_stopped(s):
        s["status"] = "stopped"
        save(s)
        print("HARD STOP: 修正次数超限（步 3 / 全程 6）。换方案或请人输入，不许继续打磨。")
        sys.exit(3)
    pending = [sid for sid, _ in STEPS if s["steps"][sid]["status"] == "pending"]
    print(f"「{s['title']}」进度：")
    for sid, desc in STEPS:
        st = s["steps"][sid]
        flag = {"done": "√", "skip": "-", "pending": " "}[st["status"]]
        extra = f"（refines {st['refines']}）" if st["refines"] else ""
        print(f"  [{flag}] {sid:<12} {desc}{extra}")
    print(f"\n下一步：{pending[0] if pending else '（全部结束，可交付）'}")


def cmd_mark(a):
    s = load()
    if a.action == "refine":
        target = a.step or "build"
        if target not in s["steps"]:
            sys.exit(f"state_gate: 未知步骤 {target}")
        s["steps"][target]["refines"] += 1
        s["steps"][target]["notes"].append(f"[refine] {a.reason}")
        save(s)
        print(f"state_gate: refine 记入 {target}（该步 {refines(s, target)} 次）")
        if is_stopped(s):
            print("HARD STOP: 修正次数超限。")
        return
    target = a.step
    if target not in s["steps"]:
        sys.exit(f"state_gate: 未知步骤 {target}（可选：{', '.join(s['steps'])}，或 refine）")
    st = s["steps"][target]
    if a.action == "skip":
        if not a.reason:
            sys.exit("state_gate: skip 必须带 --reason，禁止静默跳过")
        st["status"] = "skip"
        st["notes"].append(f"[skip] {a.reason}")
    else:  # done
        if not a.evidence:
            sys.exit("state_gate: 完成必须带 --evidence（路径）")
        for ev in a.evidence:
            if not Path(ev).exists():
                sys.exit(f"state_gate: 证据不存在 {ev}")
        st["status"] = "done"
        st["evidence"].extend(a.evidence)
    save(s)
    print(f"state_gate: {target} → {st['status']}")


def main():
    p = argparse.ArgumentParser(description="课件制作状态门")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init")
    i.add_argument("--title", required=True)
    i.add_argument("--force", action="store_true")
    i.set_defaults(fn=cmd_init)
    n = sub.add_parser("next")
    n.set_defaults(fn=cmd_next)
    m = sub.add_parser("mark")
    m.add_argument("action", choices=["done", "skip", "refine"])
    m.add_argument("step", nargs="?", help="步骤 id（refine 可省略，默认 build）")
    m.add_argument("--evidence", nargs="*")
    m.add_argument("--reason")
    m.set_defaults(fn=cmd_mark)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
