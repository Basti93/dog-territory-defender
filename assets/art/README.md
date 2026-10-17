# Art checklist (pre-rendered 3D sprites)

Style decision: `openspec/changes/buddy-comes-alive/design.md`, Decision 12. Code only animates these PNGs. Dog parts: see `assets/buddy/README.md`.

## Locked style sentence (paste into EVERY prompt)

> Soft clay 3D render, Pixar-style, rounded chunky shapes, pastel spring colors, soft studio lighting, slight top-down three-quarter view, centered on a transparent background, no text.

Prompt = subject + the sentence above. Suffixes below are the subject part.

## Files

- Name exactly as listed, lowercase, `.png`, in `assets/art/`.
- Size 1024x1024, transparent PNG, subject fills about 80% (some margin, nothing cropped).
- Exceptions are marked below.

## Den buildings (3 growth stages: bigger and more decorated each level)

| File | Prompt suffix |
|---|---|
| `doghouse-1.png` | small cozy wooden dog house, simple roof |
| `doghouse-2.png` | bigger dog house, flower box, little flag |
| `doghouse-3.png` | grand dog house, garden lights, bunting, welcome mat |
| `bakery-1.png` | tiny treat stand with a few bone cookies |
| `bakery-2.png` | bigger treat bakery, striped awning, cookie shelf |
| `bakery-3.png` | grand dog bakery, chimney, cake display, bunting |
| `garden-1.png` | small garden patch, sprouts, one watering can |
| `garden-2.png` | bigger garden, flowers, little fence |
| `garden-3.png` | lush garden, blossoming tree, bench, butterflies |

## Ground and backdrops

| File | Size | Prompt suffix |
|---|---|---|
| `yard-ground.png` | 1536x1024 | wide soft grass patch with a few daisies, no buildings |
| `doorstep-sky.png` | 1024x1024 | soft spring sky, fluffy clouds, gentle light |
| `celebration-burst.png` | 1024x1024 | cheerful burst of confetti and sparkles, radial |

## Icons (single object, no background)

| File | Prompt suffix |
|---|---|
| `icon-treat.png` | bone-shaped dog biscuit |
| `icon-paw.png` | friendly paw print |
| `icon-pin.png` | round map pin |
| `icon-badge.png` | round award badge with ribbon |
| `icon-home.png` | cozy little house |
| `icon-settings.png` | chunky friendly gear |
| `icon-walks.png` | leash curled in a loop |
| `icon-den.png` | dog house with a tiny heart |

## Tips

- Keep one style-reference image and reuse it for every asset: Midjourney `--sref <image-url>`, or attach the same reference image in ChatGPT. This stops style drift.
- Generate the first asset, fix the look, then lock that image as the reference.
- Need a transparent background? Ask for it, or remove it afterwards (remove.bg, Photoshop "Remove background", or Preview "Remove Background" on macOS). Check edges on a dark and a light backdrop.
- Re-roll any asset whose lighting, angle or saturation differs from the set.
- Tone: spring-like, friendly, joyful. No dark or aggressive imagery.

## One-shot generator

`scripts/generateArt.mjs` generates everything in this list (plus the Buddy parts) via the OpenAI Images API: `OPENAI_API_KEY=sk-... node scripts/generateArt.mjs --dog-photo my-dog.jpg`. Add `--dry-run` to preview prompts. Prompts live in `scripts/artManifest.mjs`.

## After generating

Drop the PNGs here and tell the dev: each file gets added to `src/art/artAssets.ts` (task 7.4). Missing files are fine; screens show placeholders.
