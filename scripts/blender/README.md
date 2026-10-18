# Blender sprite renders

Pre-rendered soft-clay 3D sprites for `assets/art/` (den buildings, icons, backdrops). Not the buddy dog parts.
Needs Blender 5.x (tested 5.2.2), EEVEE.
## Run

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python scripts/blender/render_all.py                       # everything, full quality (64 samples; per-asset sizes in render_all.py)
$B -b --python scripts/blender/render_all.py -- --only doghouse    # name or prefix; repeat --only for more
$B -b --python scripts/blender/render_all.py -- --fast --out /tmp/x  # 16 samples, half size, custom out dir
```

Output goes to `assets/art/<name>.png` (names match `scripts/artManifest.mjs`), transparent RGBA, except
`doorstep-sky` (opaque). A full run takes about 1-2 minutes and also writes `assets/art/_contact-sheet.png`
(review aid; `--sheet-only` rebuilds just the sheet). Building stage 1 fills ~50% of the frame, stage 2 ~72%, stage 3 ~92%.
## Layout

- `common.py`: scene reset, orthographic camera, three-point light, `clay()` material, `bevel()`, primitive
  helpers (`box`, `cyl`, `sph`, `cone`, `torus`, `prism`), `fit()` auto-framing, `render()`.
- `assets.py`: one builder per asset plus the `ASSETS` registry at the bottom.
- `contact_sheet.py`: tiles all PNGs on a checkerboard (Blender image API + numpy, no PIL).
- `render_all.py`: CLI.
## Add an asset

1. Write `def my_thing(): ...` in `assets.py` using the helpers. Build around the origin, front facing -Y.
2. Register it: `ASSETS["my-thing"] = (my_thing, 1024, 1024, ISO, 0.82, False)`
   (builder, width, height, camera `ISO`/`ICON`/`FRONT`, fill fraction, opaque).
3. Render with `--only my-thing --fast`, look at the PNG, then render full. Use `common.HEX` palette keys.

## Buddy layers

`buddy.py` (model + per-part render) and `render_buddy.py` (CLI) render the layered clay dog for the app's image skin
into `assets/buddy/<coat>/` and `assets/buddy/common/`, plus `manifest.json` (every file with part, coat, style and
pivots in 0..1 canvas coords) and `_preview-<coat>.png` (all parts stacked, for eyeballing). One scene, one fixed
orthographic camera (75 deg tilt, dog yawed 32 deg toward camera, facing LEFT); each part is rendered with the others
hidden so layers stack exactly. Run: `Blender -b --python scripts/blender/render_buddy.py -- [--fast] [--coats golden,cream]
[--preview-only] [--variants] [--size 768] [--out dir]`. Full set (8 coats, 148 files incl. markings, walk legs and lying pose at 512px/32 samples) takes ~2 min.
Medium size only; coat colours mirror `BUDDY_PALETTE` (keep in sync by hand).
Last tuned 2026-10-18: blush forward, blunter snout.
Extras (per coat): `markings-{patch,socks,mask}.png` are thin shells (blob intersected with an inflated copy of the surface) rendered with
body/head/legs as Holdout materials, so they are occluded correctly and stack exactly; `pose-lying.png` re-poses copies of the head/tail and
builds a sphinx body; `front-legs-walk-{a,b}.png` swing the near leg about the shoulder. These are `nofit` so the canvas is unchanged. Golden
review composites `_preview-golden-{markings-*,walk-a,walk-b,lying}.png` (alpha-stacked from the real PNGs, red line = groundY). Full run ~65 s.
