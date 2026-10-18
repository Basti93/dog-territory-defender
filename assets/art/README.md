# Art (pre-rendered 3D clay sprites)

Style decision: `docs/decisions/buddy-comes-alive.md`. Code only animates these PNGs; read them via `src/art/artAssets.ts` `artOr()` (missing file = drawn placeholder). Buddy parts: `assets/buddy/README.md`. Preferred source: Blender (`scripts/blender/README.md`, deterministic, full list of renders and sizes); fallback: image API.

## Locked style sentence (paste into EVERY image-API prompt)

> Soft clay 3D render, Pixar-style, rounded chunky shapes, pastel spring colors, soft studio lighting, slight top-down three-quarter view, centered on a transparent background, no text.

Prompt = subject + that sentence. Files: lowercase `.png` in `assets/art/`, 1024x1024 transparent, subject ~80% of frame, unless noted.

## Core set (subject part of the prompt)

- Den buildings, stages 1-3, each bigger and more decorated: `doghouse-N` (small wooden house / flower box + flag / grand, garden lights, bunting, welcome mat), `bakery-N` (treat stand / striped awning, cookie shelf / chimney, cake display, bunting), `garden-N` (patch, sprouts, watering can / flowers, fence / lush, blossoming tree, bench, butterflies). Stages 4-5 are Blender-only (see its README).
- Ground and backdrops: `yard-ground` 1536x1024 (grass patch, daisies, no buildings), `doorstep-sky` 1024 (spring sky, fluffy clouds), `celebration-burst` 1024 (confetti and sparkles, radial).
- Icons (single object, no background): `icon-treat` (bone biscuit), `icon-paw`, `icon-pin` (round map pin), `icon-badge` (award badge with ribbon), `icon-home` (cozy house), `icon-settings` (chunky gear), `icon-walks` (leash in a loop), `icon-den` (dog house with tiny heart).
- Scene props, fences, signs, textures, Wild Extras: Blender only, listed in `scripts/blender/README.md`.

## Tips

- Reuse one style-reference image for every asset (Midjourney `--sref`, or the same attachment in ChatGPT) to stop drift; fix the first asset's look, then lock it.
- Transparent background: ask for it or remove it afterwards; check edges on a light and a dark backdrop. Re-roll any asset whose lighting, angle or saturation differs.
- Tone: spring-like, friendly, joyful; no dark or aggressive imagery.

## One-shot generator

`OPENAI_API_KEY=sk-... node scripts/generateArt.mjs --dog-photo my-dog.jpg` generates the list above plus the Buddy parts (`--dry-run` previews prompts; prompts in `scripts/artManifest.mjs`). Register new PNGs in `src/art/artAssets.ts`.
