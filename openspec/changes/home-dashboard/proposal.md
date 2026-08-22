## Status

Drafted by `senior-app-architect`, scoping a concept already designed by a `game-master` subagent pass (codenamed "The Doorstep") into buildable work. The fun/UX decisions in that concept are not re-litigated here — this proposal only scopes them technically, and flags two places (below, and in full in `design.md`) where the concept assumes something that doesn't exist yet in this codebase and needs a concrete answer before implementation.

**Update, 2026-08-22 — persistent home screen, not a landing gate.** Sections 1-7 of `tasks.md` were implemented and this capability's own on-device manual-verification pass (task 8.1) surfaced that the original "shown once, never reappears" behavior described below reads as a bug: once a player left the Doorstep for the Den, History, Stats, or the map, there was no way back to it for the rest of the session. The founder, on-device: *"...that fixes the issue that you can't go back to the new homescreen once you are on the 'old' homescreen."* This reverses the "landing gate, not a hub" framing this proposal originally shipped with — reversed here, before this capability is archived, rather than shipped and patched after. The rest of this document is updated in place to describe the corrected behavior; see `design.md` Decisions 8-13 for the full navigation-model scoping this reversal required (the return-to-Doorstep wiring, the idle map screen losing its button list, the new burger menu, the Doorstep's new direct-access icon row, and a real repeat-firing bug in the away-strip that making the Doorstep remountable would otherwise have introduced).

Every capability this screen aggregates has already shipped and is verified present in code: `den-economy`/`virtual-dog-companion` (treats, Buddy's Level, `buddyTreatsPerWalk`, milestone titles), `home-range`/`home-range-rewards` (the Range/Bloom grid, `streetsKnown`), `somewhere-wild` (the wild-cluster/New-Ground card logic, directly reused, not reimplemented), `personal-stats` (achievements, including the idle-accrual-triggered ones), and `walk-start-notifications` (the overflow-notification bookkeeping this screen's away-strip shares a flag with). No upstream change is in flight or blocking.

## Why

The app currently opens straight onto the live map with no moment that says "here's what your dog has been up to." The founder/game-master's brief for this pass: give players a warm, low-pressure landing screen — Buddy, his territory, and what changed while they were away — before the map, without inventing any new guilt/streak mechanic and without duplicating data the app already computes elsewhere. The core design constraint carried through every state of this screen is **anti-guilt**: a player who's been away for three weeks gets the same warm, forward-looking flow as a player opening the app for the second time today — never a days-counter, never an apology framing, never a droopy dog.

## What Changes

A new screen, **The Doorstep**, becomes the very first thing shown after the existing first-launch dog-naming gate (still first) and before the map (still one tap away, still the primary screen per `visual-design/spec.md` once entered). It is shown at every app cold start, and is also the screen every other screen returns to when dismissed — the game's one persistent home/overview screen, not a one-time splash (see the 2026-08-22 update above and `design.md` Decisions 8-13). The one exception: while a walk is actively being tracked, the live map + Finish Walk/Cancel screen is shown and is never interrupted by or dismissible to the Doorstep.

Layout (all data reused from already-shipped capabilities, none newly computed as an economy/mechanic — this is a presentation aggregation, not a new mechanic):
1. **Dog row** — name, Buddy's Level, and (new, see `design.md` Decision 1) his *current* milestone title, plus the existing "brings home N treats a walk" line already shown in `DenScreen.tsx`.
2. **Territory portrait** — a still, non-interactive image of the player's Home Range (Range outline + Bloom fill only, no wild-cluster contour, no marker, no pins/numbers), tappable to open the map. See `design.md` Decision 2 for the rendering approach — the game-master brief flagged this as an open feasibility question; it's answered there.
3. **"While you were out" strip** — 0-3 short lines, reusing already-computed facts: `somewhere-wild`'s own card evaluation (verbatim, not reimplemented), an idle-accrued achievement, Den passive accrual since last open, or storage-at-cap — priority-ordered in `design.md` Decision 4, since the concept lists these sources but doesn't order them. Shown at most once per app launch, not once per Doorstep visit (`design.md` Decision 10).
4. **One Start Walk button** — still the screen's sole primary action.
5. **A small direct-access icon row** — View Past Walks and Stats & Badges, one tap each, visually subordinate to Start Walk (`design.md` Decision 12). The Den needs no icon here — it already has one, below.
6. **Den tease footer** — reuses `getUpgradeTease` and `storageCap`, the exact functions `DenScreen.tsx` already calls.
7. **A small burger-menu control** opening an overlay with Debug Log and Log a Walk We Missed (`design.md` Decision 13) — the idle map screen's former button list has no other home; these two are the "settings/options and debug... not so important stuff" the founder asked to be tucked away.

Three session states (first-open-of-day, same-day re-open, long-absence) are derived from data already sitting in `DenEconomyState` — see `design.md` Decision 3. No new "last opened" field is added to storage. The idle map screen (opened from the Doorstep's portrait tap) loses its own six-button stack entirely, keeping only the map, the existing Territories entry point (unchanged, `territories/design.md` Decision 8), the "Somewhere Wild" card, and a new control back to the Doorstep (`design.md` Decision 9).

## Two things the concept assumes that need a concrete answer (flagged, not silently resolved)

- **The concept's example title, "Neighborhood Regular," matches no authored milestone title** (`src/economy/milestones.ts`'s `MILESTONE_TITLES` has "Neighborhood Explorer" at level 11 and "Trail Regular" at level 16 — no "Neighborhood Regular" anywhere, and level 12 itself isn't a milestone level at all). More importantly, `titleForLevel()` as it exists today only ever returns non-null on an *exact* milestone level — it was built purely to drive the one-away cliffhanger ("One more walk and he's a…"), never to answer "what title does Buddy currently hold at any level." The Doorstep needs the latter, which doesn't exist yet. See `design.md` Decision 1 for the new `currentTitleForLevel()` this adds, and its behavior at level 1 (no title yet) and past the 8th authored title.
- **The "collect" tap's sound effect has no infrastructure to attach to.** No audio library (`expo-audio`/`expo-av`) and no sound assets exist anywhere in this codebase today, despite `game-phases/spec.md`'s cross-cutting "audio-first" constraint — this would be the first sound the app ever plays. See `design.md`'s "Collect-tap scoping" and this proposal's Open Questions — this needs a call before implementation, not a silent library add.

## Two existing requirements this concept sits in tension with

- `personal-stats/spec.md`'s "Achievement Unlock Presentation" requirement currently names the Den screen specifically as where an idle-accrued achievement surfaces ("SHALL surface as a lightweight in-Den notice"). This screen now also wants to surface that same fact, before the player has opened Den at all. Resolved via a `MODIFIED Requirement` below (broadens the location, doesn't add a new unlock mechanism) — see `design.md` Decision 5.
- `visual-design/spec.md`'s "Additional Exclusions" requirement already prohibits "gamey chrome (XP bars...)" everywhere — `DenScreen.tsx` already ships a literal XP progress bar today, which this proposal is not in a position to retroactively fix. Noted in `design.md` so a future reader isn't confused by the apparent contradiction; out of scope here.

## Capabilities

### New Capabilities
- `home-dashboard` — The Doorstep screen: layout, the three session states, and the away-strip's exact sourcing/priority rules.

### Modified Capabilities
- `den-economy` — adds a persistent "current title" readout (`currentTitleForLevel`), distinct from the existing cliffhanger-only `titleForLevel`.
- `personal-stats` — broadens "Achievement Unlock Presentation" to allow the Doorstep's away-strip as an equally valid lightweight surface for an idle-accrued achievement, alongside the Den screen.
- `visual-design` — adds The Doorstep as a sixth Key Screen Intent.

### Not modified
- `game-phases` — nothing here introduces a new mechanic or crosses a phase boundary; every fact this screen shows is data an already-Phase-1-authorized capability already computes. No change needed.

## Impact

- `App.tsx`: a new `showDoorstep` boolean (default `true`), inserted as the first screen after the existing `needsDogName` gate, now set back to `true` by every other screen's dismiss handler instead of only ever being set to `false` (`design.md` Decisions 8-9). Two of App.tsx's existing mount-time effects need re-sequencing (see `design.md` Decision 6) so the Doorstep's own overflow-line check and the existing earned-trigger push notification never both fire for the same unclaimed overflow in one session; that same merged effect also now resolves `resolveDoorstepSession`/`resolveAwayStripLines`/the greeting pick once per launch, passed down as props instead of computed inside `DoorstepScreen` (`design.md` Decision 10). The idle map screen's six-button stack is deleted in favor of a single "back to Doorstep" control (`design.md` Decision 9); the notification-tap handler gains a one-line fix (`design.md` Decision 11).
- New files: `src/components/DoorstepScreen.tsx`, `src/components/TerritoryPortrait.tsx`, `src/web/portraitHTML.ts`, and a new small burger-menu overlay component (`design.md` Decision 13, e.g. `DoorstepMenu.tsx`).
- `src/web/homeRangeRendererScript.ts`: one new exported rendering function reusing its already-verified blur/colour/contour math, targeting a plain canvas instead of a Leaflet map.
- `src/economy/milestones.ts`: one new pure function (`currentTitleForLevel`), no change to existing exports' behavior.
- No new database tables, no new persisted fields, no new repository, no new third-party dependency for the burger menu (RN's built-in `Modal`).
- Possible new dependency: an audio library, if the collect-tap sound ships now rather than as a fast-follow (see Open Questions).

## Phase

**Phase 1.** Confirmed against `openspec/specs/game-phases/spec.md`'s Phase 1 scope: treats, Buddy's Level, the Home Range, personal stats/achievements, and the earned-trigger notification are all already-authorized Phase 1 capabilities. This screen touches none of Phase 2's streaks/recap-notification scope, none of Phase 3's social/leaderboard scope, and none of Phase 4's Pack/full-Den scope — it is a presentation layer over what Phase 1 already built. No `game-phases` text needs updating (see "Not modified" above).

## Open Questions — resolved

- **Collect-tap sound — RESOLVED: visual-only.** Ships as RN `Animated` fly/bounce into the footer counter, no audio dependency added. Sound stays a fast-follow for whenever an audio library and a sourced "ding" asset get approved separately. User decision, 2026-08-22.
- **Territory portrait background — RESOLVED: OSM tiles behind the shape.** Overrides this proposal's own "no basemap" recommendation — user wants the portrait to read as a literal mini-map of the real neighborhood, not an abstract shape. User decision, 2026-08-22. **Scope consequence** (per `design.md`'s own flag on this): `portraitHTML.ts` cannot be the plain-canvas, tile-free host originally scoped in `tasks.md` 2.3 — it now needs a cut-down, non-interactive version of `mapHTML.ts`'s Leaflet+tile setup (tiles + the Range/Bloom overlay, no pan/zoom/markers/gestures), and the Doorstep's portrait render is now network-dependent (no tiles cached, no portrait — needs a plain fallback state, e.g. the dog + a neutral line, not an error). This is a real, if contained, scope increase over the original recommendation — flagged for the implementer, not silently absorbed.
- **Long-absence threshold** (`design.md` Decision 3): set at 2+ calendar days since last open, reusing the same "today/yesterday is recent" boundary already established by the manual-log window and New Ground's 48h card window elsewhere in this codebase. A first-pass number, logged as such, easy to retune.
- **"Occasional" anchor line cadence** (`design.md` Decision 4): proposed at a flat 25% chance on an otherwise-empty away-strip. Flavor text only, no mechanical consequence — flagged as adjustable, not escalated.

## Source

Concept: `game-master` subagent pass ("The Doorstep"), provided verbatim to this scoping pass. Technical scoping, the two assumption-gaps above, and the rendering/state-tracking decisions: `senior-app-architect`, grounded in `src/App.tsx`, `src/economy/denEconomy.ts`, `src/economy/milestones.ts`, `src/economy/formulas.ts`, `src/storage/HomeRangeRepository.ts`, `src/storage/NotificationRepository.ts`, `src/components/SomewhereWildCard.tsx`, `src/web/homeRangeRendererScript.ts`, `src/web/homeRangeRaster.ts`, and `src/web/mapHTML.ts`, plus the archived `virtual-dog-companion`, `home-range`, `home-range-rewards`, `somewhere-wild`, and `walk-start-notifications` changes' `design.md`s.

**The 2026-08-22 persistent-home-screen update** (Why's update note, What Changes items 5/7, Impact's `App.tsx`/new-file additions, `design.md` Decisions 8-13): the founder, on-device, verbatim quote in the Why section above. Technical scoping: `senior-app-architect`, additionally grounded in `src/components/DoorstepScreen.tsx` and `src/components/MapView.tsx` as actually implemented, `src/components/__tests__/DoorstepScreen.test.ts`, and the `territories` change's `design.md` Decision 8 / `tasks.md` 10.3.
