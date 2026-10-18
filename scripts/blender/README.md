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

## Weird-streak art (2026-10-18)

Building stages 4 and 5 (`doghouse|bakery|garden-4/5`, 512px, fill ~93%): treehouse observatory / orbital station, food-truck bakery / cosmic bone bakery, glowing greenhouse / floating garden. Same roof colours; stage 5 floats but keeps a grass tile base.
Wild Extras props (`prop-*`, 256px, transparent, camera `PROP`): ufo, beam (separate soft cone), comet-bone, duck-party, squirrel-raincoat, mailbox, sock, gnome, cloud-tea, moon-cheese, firefly, lightbulb, question.
New `assets.py` helpers: `glow()` emissive and `ghost()` translucent materials, `rod()`, `chain()` (smooth sphere tube), `star4()`; output sizes per asset live in `render_all.py:out_size`.

## Hof scene props + from-behind Buddy (2026-10-18, redesign "Unser Viertel")

`scene_props.py` (imported by `render_all.py`, registers into `assets.ASSETS` / `assets.TEXTURES`). Run e.g. `--only fence --only gate --only sign`.
- Fence family, camera (80,0), **256 px per world unit** (fence/gate/post share the scale): `fence-segment` 512x256 (4 pickets, rails run to both edges, copies butt seamlessly; edge-column difference ~2%), `fence-post-end` 128x256 (brown post, same as gate posts), `gate-closed` / `gate-open` 512x512 (coral leaves, open = 46 deg toward viewer; gate sits in the lower half of the canvas).
- `bench` / `bench-empty` 512x512 (postcards on seat), `bowl` / `bowl-empty` 256x256, `doormat` 512x256, `pennant` 128x256 (flag points right), `postcard-blank` 512x320 (faint photo frame, blank caption strip below).
- Signs, straight-on, blank face `#E9C98E`, rim `#B08D5E`, bottom edge `#7A5C3A`: `sign-small` 256x128, `sign-medium` 512x192, `sign-wide` 768x224. Outer margin 4 px, rim 12 px, bottom edge 6 px are identical in all three, so **one capInsets works: `{top: 20, left: 20, right: 20, bottom: 28}`** (px of the PNG; scale by display factor). Face is a flat rectangle inside; corner radius ~14 px.
- Flat assets (signs, postcard, pennant, fence family, doormat) render with `Standard` view transform and a little self-emission (`scene_props.lit`/`standard`, via `common.render` reading scene props `view_transform`/`exposure`) so colours match the design tokens instead of being desaturated by AgX.
- Textures (flat, opaque, 256x256, tile exactly, numpy + Blender image API, no scene): `patch-usual` `#9FD79A`+dots `#8CCB88`, `patch-fresh` `#4FBF6B`+dots `#45B261`, `patch-wild` `#DCE8BE`+blades `#C6D6A0`, `linen` `#EFE7D6` basket weave.
- Buddy from behind (`buddy.py`, `build_back`): per coat `pose-walk-back-a|b.png` (trot away, hind paws alternate, head glances sideways, curly tail) and `pose-sit-back.png` (back to us, head over the shoulder, eyes open). Same 512 canvas / groundY, nofit copies of the sitting parts. Manifest parts `poseWalkBack` (style a/b) and `poseSitBack`. `render_buddy.py -- --only-back` renders only these and merges into `manifest.json` (~12 s); the full run includes them. Contact sheet gets three extra rows.
