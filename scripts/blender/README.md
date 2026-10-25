# Blender sprite renders

Pre-rendered soft-clay 3D sprites for `assets/art/` (buildings, icons, backdrops, scene props) and the layered Buddy for `assets/buddy/`. Needs Blender 5.x (tested 5.2.2), EEVEE.

## Run
```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python scripts/blender/render_all.py                          # everything, 64 samples (sizes per asset in render_all.py)
$B -b --python scripts/blender/render_all.py -- --only doghouse       # name or prefix; repeat --only
$B -b --python scripts/blender/render_all.py -- --fast --out /tmp/x   # 16 samples, half size, custom dir
```
Output `assets/art/<name>.png` (names match `scripts/artManifest.mjs`), transparent RGBA except `doorstep-sky` (opaque). Full run ~1-2 min, also writes `assets/art/_contact-sheet.png` (`--sheet-only` rebuilds just it). Buildings (`doghouse|bakery|garden-1..5`, 512px) share ONE world scale (`common.BUILDING_SCALE` = 9.2 units across the canvas, no `fit()`; stage 1-2 models are scaled by `assets.GROW` 1.6 / 1.55 for a smooth growth curve); the footprint centre sits at pixel (256, row 353 of 512 = `BUILDING_BASE_Y` 0.69) for every sprite. No sod tile: `assets.base(r)` bakes a soft transparent contact shadow plus a few grass tufts.

## Layout and adding an asset
- `common.py` (scene reset, orthographic camera, three-point light, `clay()`, `bevel()`, primitives `box cyl sph cone torus prism`, `fit()`, `render()`), `assets.py` (one builder per asset + `ASSETS` registry), `contact_sheet.py`, `render_all.py` (CLI), `scene_props.py`, `buddy.py` + `render_buddy.py`.
- Add: write `def my_thing()` in `assets.py` (build around the origin, front facing -Y); register `ASSETS["my-thing"] = (my_thing, 1024, 1024, ISO, 0.82, False)` = (builder, w, h, camera `ISO`/`ICON`/`FRONT`, fill fraction, opaque); render with `--only my-thing --fast`, look, then render full. Use `common.HEX` palette keys.

## Buddy layers
`Blender -b --python scripts/blender/render_buddy.py -- [--fast] [--coats golden,cream] [--preview-only] [--variants] [--size 768] [--out dir] [--only-back]`. Writes `assets/buddy/<coat>/` and `common/`, `manifest.json` (part, coat, style, pivots 0..1) and `_preview-<coat>.png`. One fixed orthographic camera (75 deg tilt, dog yawed 32 deg toward camera, facing LEFT); each part is rendered with the others hidden so layers stack exactly. Full set (8 coats, 148 files, 512px/32 samples) ~2 min; medium size only; coat colours mirror `BUDDY_PALETTE` (keep in sync by hand). Last tuned 2026-10-18: blush forward, blunter snout.
- Extras per coat (`nofit`, canvas unchanged): `markings-{patch,socks,mask}` thin shells rendered with body/head/legs as Holdout; `pose-lying` re-poses head/tail on a sphinx body; `front-legs-walk-{a,b}` swing the near leg about the shoulder. Golden review composites `_preview-golden-*.png` (red line = groundY).
- From behind: `pose-walk-back-a|b` (trot away, hind paws alternate, head glances sideways, curly tail) and `pose-sit-back` (back to us, head over the shoulder, eyes open); manifest parts `poseWalkBack` (style a/b) and `poseSitBack`. `--only-back` renders only these and merges into `manifest.json` (~12 s).

- Fur zones (2026-10-24): `-- --zones [--fast] [--only head,body]` (`buddy_zones.py`) renders per-zone masks, shade overlay and details at 384 px into `assets/buddy/zones/` and extends `manifest.json`; `-- --zones-sheet out.png` makes a contact sheet of 4 sample dogs. Zone tags are `o["zone"]` set in `buddy.py`; zone-only shells carry `only="__zone"` and every new part is `nofit`, so the legacy framing is unchanged. Muzzle variants `head-short|long`, chest ruff `fluff-*`.

## Weird-streak art (2026-10-18)
Building stages 4-5 (`doghouse|bakery|garden-4/5`, 512px, fill ~93%): treehouse observatory / orbital station, food-truck bakery / cosmic bone bakery, glowing greenhouse / floating garden; same roof colours, stage 5 floats on a grass tile base. Wild Extras props (`prop-*`, 256px, camera `PROP`): ufo, beam (separate soft cone), comet-bone, duck-party, squirrel-raincoat, mailbox, sock, gnome, cloud-tea, moon-cheese, firefly, lightbulb, question. Helpers: `glow()` emissive, `ghost()` translucent, `rod()`, `chain()`, `star4()`; output sizes in `render_all.py:out_size`.

## Hof scene props ("Unser Viertel", 2026-10-18)
`scene_props.py` registers into `assets.ASSETS` / `assets.TEXTURES`; e.g. `--only fence --only gate --only sign`.
- Fence family, camera (80,0), **256 px per world unit**: `fence-segment` 512x256 (4 pickets, copies butt seamlessly), `fence-post-end` 128x256, `gate-closed` / `gate-open` 512x512 (coral leaves, open = 46 deg toward viewer; gate in the lower half).
- `bench` / `bench-empty` 512x512 (postcards on seat), `bowl` / `bowl-empty` 256x256, `doormat` 512x256, `pennant` 128x256 (flag points right), `postcard-blank` 512x320 (faint photo frame, blank caption strip).
- Fence badge rosettes (`rosette-walks|distance|treats|den`, one per family): `Blender -b --python scripts/blender/render_all.py -- --only rosette`.
- Signs straight-on, face `#E9C98E`, rim `#B08D5E`, bottom edge `#7A5C3A`: `sign-small` 256x128, `sign-medium` 512x192, `sign-wide` 768x224. Margin 4 px, rim 12 px, bottom edge 6 px in all three, so **one capInsets works: `{top: 20, left: 20, right: 20, bottom: 28}`** (PNG px; scale by display factor). Face is a flat rectangle, corner radius ~14 px.
- Flat assets (signs, postcard, pennant, fence family, doormat) render with `Standard` view transform and slight self-emission (`scene_props.lit`/`standard`, via `common.render` reading scene props `view_transform`/`exposure`) so colours match the tokens instead of being desaturated by AgX.
- Textures (flat, opaque, 256x256, tile exactly, no scene): `patch-usual` `#9FD79A`+dots `#8CCB88`, `patch-fresh` `#4FBF6B`+dots `#45B261`, `patch-wild` `#DCE8BE`+blades `#C6D6A0`, `linen` `#EFE7D6` basket weave.

## Stock-Regal sticks (2026-10-24)
`sticks.py` registers `stick-momo|pfote|bruno|keks|lotte|nebel` (256 px, camera `STICKCAM`, one chunky clay stick per neighbour dog: birch + bow, golden fork, stout log, mint-striped twig, choc stick with leaves, lilac driftwood with a star). `-- --only stick`. Read via `artOr('stick-<dog>')`.

## Neighbour portraits (2026-10-24)
`neighbour_portraits.py`: `-- --only momo,keks --fast --out dir --sheet sheet.png`. One cut-out per bot dog and pose (`dog-<dog>-sit|trot`, 384 px, feet on one line, scaled by the dog's size) from the Buddy rig with each archetype's legacy look (`LOOKS` mirrors `server/src/neighbours/archetypes.ts`). Read via `artOr('dog-<dog>-<pose>')`.

## Meadow props (2026-10-24)
`meadow_props.py`: `-- --only meadow` renders `meadow-bush` 384x256, `meadow-hedge` 768x256, `meadow-tree` 384x512, `meadow-flowers` / `meadow-tuft` 256x192, `meadow-stones` 256x160, `meadow-diary` 256x256 (notebook on a stump, the tappable diary prop; placed by `diarySpot`) (camera `MEADOWCAM`, baked contact shadow, no randomness). Placed by `src/components/world/meadowDecor.ts` (ground point per sprite in its `SPRITES` table; retune there if a sprite changes).
