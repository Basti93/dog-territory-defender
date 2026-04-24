# Prompt — Update Visual Prototype to Match Phased Plan

Paste this into a fresh Claude Code session (with access to `/Users/user/Projects/dog-territory-defender/`) to evolve the existing visual prototype (`Dog Territory Defender.html` + `ios-frame.jsx` + `tweaks-panel.jsx`) so it matches the phased prototype plan and engagement mechanics.

This prompt is **phase-aware**. It only asks you to add what belongs in the *next* phase, not everything at once.

---

## PROMPT (copy from here)

You are a senior product designer and React engineer. Update the visual prototype of **Dog Territory Defender** to match the phased plan (`01-prototype-plan-prompt.md`) and engagement mechanics (`04-engagement-mechanics.md`). The prototype is HTML + React (Babel standalone) and runs as a clickable demo, not production code.

Read first, then code:

1. **`CLAUDE.md`** — collaboration rules for this project (phase gating, tone, decisions log)
2. **`00-README.md`** — current project status (which phase we're in / about to start)
3. **`03-design-brief.md`** — visual direction, design tokens, screen intents
4. **`04-engagement-mechanics.md`** — Den, Pack, anti-snowball specs
5. **`Dog Territory Defender.html`** — current prototype (read in full)
6. **`ios-frame.jsx`** — existing iOS 26 liquid-glass frame components (reuse, don't rebuild)
7. **`tweaks-panel.jsx`** — live-editing panel (extend with new tweaks for new mechanics)

---

### Scope: the NEXT phase only

Ask the user: "Which phase are we targeting with this update?" Default to **Phase 1 (Core Game Loop)** if no answer.

Only build what belongs in the target phase. If you're tempted to add Phase 2+ features, park them in a "next-phase backlog" comment in the HTML file and stop.

---

### Current state of the prototype (as of last read)

Already built (reuse these, don't duplicate):
- Design tokens: `T.green`, `T.blue`, `T.gold`, `T.brown`, `T.white`, `T.bg`, `T.rival`, `T.purple`, `T.text`, `T.muted`, `T.card`
- iOS 26 device frame (`IOSDevice`, `IOSStatusBar`, `IOSNavBar`, `IOSGlassPill`, `IOSList`, `IOSListRow`, `IOSKeyboard`)
- `NeighborhoodMap` component (SVG map with streets, park, territory polygon, walk trail, paw prints, collectibles, player position)
- `Confetti`, `DogAvatar`, `XPBar`, `Badge` components
- Animations: `confettiFall`, `tailWag`, `xpTick`, `pulseGreen`, `slideUp`, `popIn`, `floatUp`, `pawPrint`, `collectibleBounce`, `ripple`, `trailGrow`, `shimmer`, `badgePop`, `spin`
- Tweaks panel with: dogName, breed, primaryColor, mapStyle, showCollectibles, celebrationIntensity
- Cherry blossom dots on park when mapStyle === 'spring'
- Rival territory (red dashed) + attack indicator
- Spring/map style tint

What's missing from the phased plan:
- **The Den** — cookie-clicker building base (Phase 1: 3 buildings; Phase 4: all 10)
- **Passive treat generation UI** — a counter that ticks up while app is open or idle
- **Scent strength visualization** — territory deepening with repeat walks (Phase 2)
- **Evening recap / async events** — notification-style summary (Phase 2–3)
- **Local leaderboard** — zip-code scoped, rolling 7-day (Phase 3)
- **Beginner's Luck badge** — 2x bonuses visible in UI (Phase 4)
- **Seasonal layering beyond spring cherry blossoms** — summer heat, autumn leaves, winter cozy (Phase 4)
- **Mentor relationship UI** — veteran-to-newbie link (Phase 4)
- **Pack collection screen** — AI dog companions (Phase 4)

---

### Phase 1 (default) — What to add

Add these screens/components to `Dog Territory Defender.html`. Keep everything modular so future phases can extend.

#### 1. **The Den** (new screen, accessible from bottom tab bar)
- Isometric or top-down cute view of dog's home base
- SVG or CSS scene: grass patch, doghouse, 2 other buildable plots (start empty/dashed outline)
- Three unlocked buildings:
  - **Doghouse** — always visible, shows dog avatar inside, displays "Treat Storage: X / Cap"
  - **Treat Bakery** — visible building that generates treats/hour (ticks up visibly in the UI)
  - **Sniff Garden** — visible building that shows +X% collectibles bonus
- Each building is tappable → opens upgrade modal showing:
  - Current level (1–10 for Phase 1, scalable to 100 later)
  - Effect at current level vs next level
  - Treat cost for next upgrade
  - Upgrade button (animates building, shows treat count deducting)
- Treats counter in top-right of Den screen, ticking up passively (animate +1 every few seconds via interval)
- "Next upgrade available in X treats" tease at bottom

#### 2. **Passive treat generation** (global)
- Add a `treats` state with passive income tick (e.g., +1 every 3 seconds in demo mode — real rate would be ~1/hour)
- When tabs change, treat counter persists in app state
- Post-walk celebration screen adds a "one-time reward" of treats (e.g., +50 treats for closing a territory)

#### 3. **Post-walk summary update** (enhance existing celebration screen)
- In addition to XP and territory celebration, show:
  - "+X treats earned on this walk" (one-time)
  - "+Y treats/hour passive rate" (from Den)
  - Visible "Next upgrade: [Building] — needs Z more treats" tease — creates pull to keep playing

#### 4. **Bottom tab bar updates**
- Tabs (Phase 1): **Map** (existing), **Den** (new), **Dog** (existing profile), **More** (settings etc.)
- Use existing IOSGlassPill for tab styling
- Den tab badge shows "!" when enough treats to upgrade something

#### 5. **Tweaks panel additions**
Extend the tweaks panel with:
- **passiveTreatRate** (slider: 0.1 – 5 treats/sec, default 0.3)
- **startingTreats** (slider: 0 – 500, default 50)
- **denLevel** (radio: L1 / L3 / L5 — presets that change which buildings are upgraded)
- **showDenBadge** (toggle)

#### 6. **Out-of-phase features — DO NOT build yet**
These belong to later phases. Add a comment stub in the HTML file saying they're parked:

```js
// ─── PARKED FOR LATER PHASES ──────────────────────────────────────
// Phase 2: scent strength, seasonal variations, evening recap
// Phase 3: local leaderboard, async events, other players' territories
// Phase 4: Pack collection, Beginner's Luck, mentor system, 7 more Den buildings
```

---

### Constraints

- **Don't rebuild what exists.** Reuse `IOSDevice`, `NeighborhoodMap`, `DogAvatar`, `Confetti`, `XPBar`, `Badge`.
- **Reuse design tokens.** No new colors unless justified in `03-design-brief.md`.
- **Match existing animation style.** Prefer CSS keyframes over JS transitions.
- **Keep it hand-code SVG-friendly.** The Den scene should be SVG or simple CSS, not image assets.
- **Spring-like, joyful tone.** Den has sunshine, butterflies, friendly plants. No gloomy UI.
- **Phone stays in pocket during walks.** Den is a *between-walk* screen. Don't blend it with the map.
- **Hand-testable.** The demo must run by opening `Dog Territory Defender.html` in Chrome — no build step.

---

### Deliverables

1. Updated `Dog Territory Defender.html` with Den screen + bottom tab navigation to switch between Map and Den
2. Updated `tweaks-panel.jsx` or the tweaks section in the HTML with new controls
3. A comment block at the top of the HTML listing what was added in this update (for version-tracking)
4. Update `DECISIONS.md` with an entry for any non-trivial choice (e.g., "chose SVG-only for Den scene because...")
5. Update `00-README.md` "Project Status" if this update completes a phase milestone

---

### Test script (60 seconds)

After the update, demo must show:
1. Open the HTML in Chrome
2. Tap **Map** tab — see walk-in-progress view with existing territory
3. Start a walk (existing button) → complete → see celebration with "+50 treats" in summary
4. Tap **Den** tab → see cute Den scene with 3 buildings
5. Treats counter ticks up visibly
6. Tap Treat Bakery → see upgrade modal → upgrade → building animates, treats deduct, passive rate increases
7. Switch back to Map tab → treat counter persists

---

### Style

- Code should be as readable as the existing prototype (colocated components, inline styles where matching the existing pattern, CSS keyframes in the `<style>` block).
- No TypeScript, no build step, no npm — pure HTML + React + Babel standalone.
- Be opinionated on Den visual design, but ask the user before adding anything outside Phase 1 scope.
- End your response with a single **Next Action** line: what to build in the Phase 2 update (but don't build it yet).

Begin by reading the listed files, confirm which phase we're targeting, then update.
