# Visual Prototype

Clickable HTML demo of **Dog Territory Defender**. No build step, no dependencies — just open in Chrome.

This folder contains a **design spec**, not production code. It uses React + Babel standalone so the entire app runs from a single HTML file without a bundler. When implementing the real app (React Native + Expo), match the visual output, not the internal structure.

---

## How to run

```bash
open "Dog Territory Defender.html"
```

Or drag the file into Chrome/Safari. The prototype initialises instantly.

A live-editing **Tweaks Panel** appears in the bottom-right. Use it to change the dog name, breed, primary color, map style, passive treat rate, starting treats, Den level, and celebration intensity.

---

## Files

| File | Purpose |
|---|---|
| `Dog Territory Defender.html` | Entry point. Owns design tokens, animations, map scene, post-walk celebration, tab bar, state, and composes the Den. Read this top-to-bottom first. |
| `ios-frame.jsx` | Reusable iOS 26 liquid-glass device frame: `IOSDevice`, `IOSStatusBar`, `IOSNavBar`, `IOSGlassPill`, `IOSList`, `IOSListRow`, `IOSKeyboard`. |
| `den-screen.jsx` | Phase 1 Den: SVG garden scene, 3 buildings (Doghouse, Treat Bakery, Sniff Garden), upgrade modals, tappable building cards. |
| `tweaks-panel.jsx` | Live-editing panel (`useTweaks`, `TweaksPanel`, form-control helpers — slider, radio, color, toggle, section). |

---

## What's implemented (Phase 1)

- iOS 26 liquid-glass device frame
- Map view: neighborhood streets, park (Görlitzer Park), territory polygon, walk trail, paw prints, collectibles (bone/hydrant/treat/star), rival territory, player dot with pulse
- Active walk flow: start → track → close perimeter → celebration
- Post-walk celebration: confetti, XP tick, +50 treats reward, next-upgrade tease
- **Den screen**: garden scene with 3 buildings, passive treat counter ticking up, tappable buildings with upgrade modals showing current vs next effect and cost
- 4-tab bottom nav: Map, Den, Dog, More
- Tweaks panel with 7 controls

## What's explicitly parked for later phases

See the `PARKED FOR LATER PHASES` comment block at the top of `Dog Territory Defender.html`. Do **not** add these yet:

- **Phase 2:** scent strength visualization, seasonal map variations (summer/autumn/winter), evening recap notifications
- **Phase 3:** local leaderboard (zip code), async multiplayer events, rolling 7-day scoring, soft territory conquest
- **Phase 4:** full Den (7 more buildings), Pack collection, Beginner's Luck badge, mentor system, seasonal cosmetic resets

---

## Extending the prototype

Use [`../docs/05-design-update-prompt.md`](../docs/05-design-update-prompt.md) — it's a Claude prompt that evolves this prototype one phase at a time. Don't hand-add features; follow the phase-gated flow.

---

## Implementing for real

This is a prototype, not the app. For the real build:

- **Target stack:** React Native + Expo + Supabase (PostGIS) + MapLibre (tentative, to be locked in when Phase 0 starts)
- **Don't copy structure:** the Babel-standalone approach is for fast iteration, not production
- **Do match:** visual tokens, screen intents, animations, tone, copy
- **Start at Phase 0:** even though the visual prototype is at Phase 1 UX, the real build starts with GPS walking skeleton

See [`../docs/01-prototype-plan-prompt.md`](../docs/01-prototype-plan-prompt.md) for the phased build plan.
