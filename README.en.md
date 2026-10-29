# threejs-lab-courseware

Turn invisible processes in textbooks into **hands-on, offline, physically-computed 3D lessons**.

A skill package for WorkBuddy / AI agents: how to build single-file, offline-capable,
model-driven three.js science simulations — glass & liquid rendering recipes, easing systems,
multi-angle verification workflow, and a checklist of "looks fake up close" fixes.

## Why

| Hard part | Our answer |
|---|---|
| Glass looks like plastic | Glass is **read from its outlines**, not from `transmission` |
| Liquid looks like a solid block | Fragment shader: height-based absorption + wall darkening + flat surface |
| Numbers are fake | Every readout is **computed**: pH exact solution, pV=nRT, m=ρV, mass fraction, scoring |
| Changes pop instantly | dt clamp + automatic state tweening + fade in/out + flame intensity easing |

## Install

```bash
npm i playwright three@0.147.0
cp -r threejs-lab-courseware ~/.workbuddy/skills/
```

`three@0.147.0` is required: only the UMD build can be inlined into a single HTML file (removed after r160).

## Scripts

```bash
node scripts/views.js courses/x.html v1 0     # six camera angles
node scripts/check.js courses/x.html          # pageerror / console.error scan
node scripts/pick.js courses/x.html "600,500" # read framebuffer pixels
python scripts/inline_build.py --template page.html --three three.min.js \
    --engine kit3d.js --lesson lessons/x.js --out courses/x.html
```

## Layout

```
SKILL.md                    # main: stack, glass/liquid, transitions, verification, pitfalls
references/render-recipes.md      # material table, env map, liquid shader, interaction code
references/detail-rules.md        # small-part readability, scale/liquid level, "amputated part" checks
references/github-references.md   # open-source references to study first
scripts/                          # views / check / pick / inline_build
examples/peizhi-step.js           # full example lesson (8 steps, model-driven readouts)
```

## License

MIT for this repository — see `LICENSE`. Third-party references are listed in `NOTICE.md`;
note that `tongjiang-lab` is **CC BY-NC 4.0 (non-commercial)**, referenced for ideas only.
