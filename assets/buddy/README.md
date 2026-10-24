# Buddy PNG layers (painted skin)

Buddy is drawn by a swappable skin (`src/buddy/buddySkin.ts`). Default is the image skin from these layers (`createImageSkin`, `src/buddy/imageSkin.ts`); any missing part falls back to the vector part (mirrored to face left). Blender produces them per coat: `scripts/blender/README.md` (Buddy layers), listed in `manifest.json`.

## Canvas rules
- Every file 1024x1024 (Blender: 512), transparent PNG. ALL parts share the same canvas position, as if one finished dog were sliced into layers; stacked at (0,0) they line up exactly.
- Three-quarter view, dog facing LEFT, sitting, big head, chunky outline. Neutral coat colours only (palette in `docs/specs/visual-design.md`).

## Files, z-order back to front
1. `tail` (pivot: tail base) 2. `ear-right` (far ear; pivot: ear root) 3. `body` (torso, haunch, hind paw, far front leg) 4. `front-legs` (near leg(s)) 5. `head` (head, muzzle, nose, closed mouth; no eyes, no ears) 6. `eyes-open` 7. `eyes-closed` (over open eyes) 8. `mouth-happy` (open mouth with tongue; happy/excited) 9. `ear-left` (near ear, drawn last).

The head group rotates about the NECK. Pivots are fractions 0..1 of the canvas, passed as the second argument: `createImageSkin(sources, { tail, earLeft, earRight, head })` (default: mirrored vector pivots).

## Extra Blender layers per coat (same canvas, see `manifest.json`)
- `markings-patch|socks|mask`: overlay above `head` (and `front-legs`), below eyes/ears; darker tone on light coats, cream on dark; socks cream except cream/white/tricolour.
- `pose-lying`: full sprite (sphinx, eyes closed, floppy ears + curly tail baked in), same groundY; replaces all layers for the sleepy mood.
- `front-legs-walk-a|b`: swap-ins for `front-legs` (near leg forward/back).
- `pose-walk-back-a|b` (trotting away) and `pose-sit-back` (back to us, looking over the shoulder): full sprites, same canvas and groundY, replace all layers.

## Fur zones (free colours, `zones` block in `manifest.json`)
`zones/<unit>-mask-<zone>.png` (flat white + alpha, tinted in the app), `<unit>-shade.png` (black/white overlay), `<unit>-detail.png` (untinted nose/mouth/eyelid); 384 px, gray+alpha / RGBA PNG, same canvas and pivots. Units: body, front-legs(+walk-a/b), head (+ `-short`, `-long` muzzle), ear-left|right-<style>, tail-<style>, fluff-medium|fluffy (chest ruff), pose-lying. `common/mouth-happy-short|long.png` follow the muzzle. Regenerate: `render_buddy.py -- --zones`, then `node scripts/genBuddyZoneSources.mjs` (writes `src/buddy/zoneSources.ts`).

## Image-API recipe (if not using Blender)
Use the locked style sentence from `assets/art/README.md`, then per part: "ONLY the <part>, all other parts removed, same position and scale as the full dog on a 1024x1024 canvas". Generate the full dog first, then ask for each layer from that image. Check by stacking: no gaps at joins, no baked-in shadows.
