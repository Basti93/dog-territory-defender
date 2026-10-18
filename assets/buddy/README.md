# Buddy PNG layers (optional painted skin)

Buddy is drawn by a swappable skin (`src/buddy/buddySkin.ts`). The default is
vector art. To use painted art, supply these PNGs via `createImageSkin({...})`.
Any missing part falls back to the vector part (mirrored to face left).

## Canvas rules
- Every file: 1024x1024 px, transparent background, PNG.
- ALL parts are drawn on the SAME canvas position, as if one finished dog were
  sliced into layers. Stacked at (0,0) they must line up exactly.
- Three-quarter view, dog facing LEFT, sitting pose, big head, chunky outline.
- Neutral coat colours only (the app palette is in the visual-design spec).

## Files and z-order (back to front)
1. `tail.png` - tail only. Pivot: tail BASE (where it meets the rump).
2. `ear-right.png` - far ear. Pivot: ear ROOT (where it meets the head).
3. `body.png` - torso, haunch, hind paw, far front leg.
4. `front-legs.png` - near front leg(s), drawn over the body.
5. `head.png` - head, muzzle, nose, closed happy mouth, NO eyes, NO ears.
6. `eyes-open.png` - both open eyes only.
7. `eyes-closed.png` - both eyes shut/sleepy only (shown over the open eyes).
8. `mouth-happy.png` - open mouth with tongue only (shown on happy/excited).
9. `ear-left.png` - near ear, drawn last so it overlaps the head.

The head group rotates about the NECK; pass pivots (fractions 0..1 of the
canvas) as the second argument: `createImageSkin(sources, { tail, earLeft,
earRight, head })`. Without it, mirrored defaults of the vector pivots are used.

## Sample prompt recipe (keep identical across parts)
Style line, reuse verbatim: "Soft clay 3D render, Pixar-style, rounded chunky shapes, pastel spring colors, soft studio lighting, slight top-down three-quarter view, centered on a transparent background, no text.".
Then per part: "ONLY the <part>, all other parts removed, same position and
scale as the full dog on a 1024x1024 canvas". Generate the full dog first, then
ask for each layer from that image so proportions stay consistent. Check by
stacking all layers: no gaps at joins, no baked-in shadows.

## Extra Blender-rendered layers (per coat, same canvas, see manifest.json)
- `markings-patch|socks|mask.png`: overlay only, stack above `head` (and `front-legs`), below eyes/ears. Colour is coat-dependent (darker tone on light coats, cream on dark; socks cream except cream/white/tricolour).
- `pose-lying.png`: full single sprite (sphinx, head on paws, eyes closed, floppy ears + curly tail baked in), same groundY. Replaces all layers for the sleepy mood.
- `front-legs-walk-a.png` / `front-legs-walk-b.png`: swap-in for `front-legs` (near leg forward / back), same shoulder position.
