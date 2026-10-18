# Visual prototype

Clickable HTML demo of the game: a **design spec**, not production code. React + Babel standalone in a single HTML file, no build step. Match its visuals, tokens, animations, tone and copy in React Native; never import its structure into `src/`.

Run: `open "Dog Territory Defender.html"` (any browser). A Tweaks Panel (bottom-right) edits dog name, breed, primary colour, map style, passive treat rate, starting treats, Den level and celebration intensity.

| File | Purpose |
|---|---|
| `Dog Territory Defender.html` | Entry point: design tokens (`T.green`, `T.blue`, ...), animations, map scene, celebration, tab bar, state. Read top-to-bottom first. |
| `ios-frame.jsx` | iOS 26 liquid-glass device frame (`IOSDevice`, `IOSStatusBar`, `IOSNavBar`, `IOSGlassPill`, `IOSList`, `IOSListRow`, `IOSKeyboard`). |
| `den-screen.jsx` | Den: SVG garden, 3 buildings (Doghouse, Treat Bakery, Sniff Garden), upgrade modals. |
| `tweaks-panel.jsx` | Live-editing panel (`useTweaks`, `TweaksPanel`, form controls). |

Implemented: device frame; map (streets, park, territory polygon, trail, paw prints, collectibles, rival territory, pulsing player dot); walk flow start, track, close perimeter, celebration (confetti, XP tick, +50 treats, next-upgrade tease); Den with passive treat counter and upgrade modals; 4-tab nav (Map, Den, Dog, More); 7 tweaks.

Deferred ideas live in the `BACKLOG IDEAS (not built yet)` block atop the HTML file and in `docs/specs/game-backlog.md`; pull them by owner feedback. Don't hand-add features to the prototype. The shipped app has since moved to the "Unser Viertel" scene (see `docs/decisions/LOG.md`).
