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
| `den-screen.jsx` | Den: SVG garden scene, 3 buildings (Doghouse, Treat Bakery, Sniff Garden), upgrade modals, tappable building cards. |
| `tweaks-panel.jsx` | Live-editing panel (`useTweaks`, `TweaksPanel`, form-control helpers — slider, radio, color, toggle, section). |

---

## What's implemented (core loop)

- iOS 26 liquid-glass device frame
- Map view: neighborhood streets, park (Görlitzer Park), territory polygon, walk trail, paw prints, collectibles (bone/hydrant/treat/star), rival territory, player dot with pulse
- Active walk flow: start → track → close perimeter → celebration
- Post-walk celebration: confetti, XP tick, +50 treats reward, next-upgrade tease
- **Den screen**: garden scene with 3 buildings, passive treat counter ticking up, tappable buildings with upgrade modals showing current vs next effect and cost
- 4-tab bottom nav: Map, Den, Dog, More
- Tweaks panel with 7 controls

## Backlog ideas (not built yet)

See the `BACKLOG IDEAS (not built yet)` comment block at the top of `Dog Territory Defender.html` and `openspec/specs/game-backlog/spec.md`. Pull them by owner feedback, not in a fixed order:

- **Repetition loop:** scent strength visualization, seasonal map variations (summer/autumn/winter), evening recap notifications
- **Social layer:** local leaderboard (zip code), async multiplayer events, rolling 7-day scoring, soft territory overlap
- **Long-term hooks:** full Den (7 more buildings), Pack collection, Beginner's Luck badge, mentor system, seasonal cosmetic resets

---

## Extending the prototype

Use [`../docs/05-design-update-prompt.md`](../docs/05-design-update-prompt.md) — it's a Claude prompt that evolves this prototype one backlog item at a time. Don't hand-add features.

---

## Implementing for real

This is a prototype, not the app. For the real build:

- **Target stack:** React Native + Expo + Supabase (PostGIS) + MapLibre (tentative, to be locked in when needed)
- **Don't copy structure:** the Babel-standalone approach is for fast iteration, not production
- **Do match:** visual tokens, screen intents, animations, tone, copy

See [`../docs/01-prototype-plan-prompt.md`](../docs/01-prototype-plan-prompt.md) for the original build plan prompt.
