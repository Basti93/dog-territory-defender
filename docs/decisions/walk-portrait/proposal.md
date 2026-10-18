## Status

Drafted by `senior-app-architect`, scoping a concept already designed by a `game-master` subagent pass ("Walk Portrait") into buildable work. The fun/UX decisions in that concept are not re-litigated here — this proposal only scopes them technically, and flags several places (below, and in full in `design.md`) where the concept assumes something that doesn't exist yet in this codebase, or is under-specified, and needs a concrete answer before implementation.

This change depends on two already-coded-but-not-yet-archived changes, verified present in code this session: `home-dashboard` (`TerritoryPortrait.tsx`/`portraitHTML.ts`, the render-to-image Home Range portrait — reused directly for one specific state, see Decision 2 below and `design.md`'s make-or-break Decision 1 for the state it is deliberately **not** reused for) and `somewhere-wild` (`streetLookup.ts`'s reverse-geocoding, `HomeRangeRepository`'s New Ground event bookkeeping). Both are fully implemented and unit-tested per their own `tasks.md`; only their spec-delta `/opsx:apply` step and, for `home-dashboard`, the two bugfixes mentioned in this change's brief (1px map-container sizing, collect-tap animation) are outstanding — neither blocks this change starting.

## Why

`WalkHistoryScreen.tsx` today is a bare list — date, a "Rewarded"/"Too short" status word, and a point count. A row is not tappable to anything; there is no way to see what a specific walk actually looked like on the ground after the fact. The founder/game-master's brief: make a past walk feel like something worth looking back at — its exact route, redrawn once, inside the context of everywhere the dog has ever been — without turning walk history into a stats/comparison tool (see the brief's explicit "never build" list below) and without leaving manually-logged walks as a second-class, disabled-looking row.

## What Changes

Tapping a row in `WalkHistoryScreen.tsx` (the row itself is the tap target — Delete stays its own affordance, unchanged) opens a new full-screen **Walk Portrait**:

1. **A live, non-interactive map** (not a captured image — see the make-or-break call below) shows the aggregate Home Range, muted, behind that walk's own trail, auto-fit to the walk's own bounds. No pan/zoom/map controls in v1.
2. **The trail draws on, start to finish, once, over ~1.2s** when the screen opens. **This is confirmed feasible** — see `design.md` Decision 1 — but not via the render-to-image path the brief's own item 1 assumed; that path produces a single static data URL and cannot animate smoothly without ~30-70 discrete network-tile-fetching captures, which is a non-starter. The actual approach reuses `mapHTML.ts`'s existing *live* Leaflet+tile WebView pattern instead (a new dedicated host, fed a completed trail, animated in-WebView via a growing-polyline JS loop), which is materially simpler than the capture path and needed building either way.
3. Segments of that walk's trail that were New Ground discoveries at the time render in a brighter green than the rest. **This requires new persistence that does not exist today** — see Decision 4/"Data model" below; it is not recoverable from what's already stored.
4. A small paw marker at the start; nothing at the end (see `design.md`'s note on this default).
5. A metadata row below the map (date/place, distance, duration, treats earned) — **also requires two new persisted fields that don't exist today** (treats earned per walk, and — for a manual log — which route it refreshed, if any). See Decision 5/6.
6. Manual-log walks get the same visual treatment, keyed off whether that log has a linked/refreshed route (see den-economy's existing route-refresh mechanism) — with a distinct, equally-designed "no trail recorded, here's everywhere Buddy knows" state when there is no linked route, reusing `home-dashboard`'s `TerritoryPortrait` directly for that one state (see Decision 2).
7. `WalkHistoryScreen.tsx`'s "Too short" label changes to "Short stroll" (or another warm, direct substitute — flagged for a quick game-master copy check, not blocking).

## The one make-or-break technical call

**Resolved, feasible, not a static ship.** Full reasoning in `design.md` Decision 1. In short: don't reuse `TerritoryPortrait.tsx`/`portraitHTML.ts`'s data-URL export mechanism for the animated trail state — build a new, dedicated, live (never-captured) Leaflet WebView modeled on `mapHTML.ts`'s already-shipped tile+trail+Home-Range-overlay code, fed a completed walk instead of a live-updating one. The animation itself (growing a polyline's coordinate array over ~1.2s) is cheap, well inside a WebView's frame budget, and needs no per-frame network/export round-trip. `TerritoryPortrait`'s existing capture path is still reused, unmodified, for the one state where a static image is actually correct (a manual log with no linked route — see Decision 2).

## Real gaps the concept didn't anticipate (flagged, not silently resolved)

- **New Ground segments cannot be recovered from what's already stored, for any walk other than possibly the single most recent one.** `HomeRangeRepository`'s `NewGroundEvent` is a singleton row — overwritten by every new discovery, carries no walk id, and a `Cell` record has no "first painted at" timestamp to reconstruct history from. This needs new per-walk persistence going forward (a `newGroundCellIds` field, cheap to add since the data is already computed in memory at walk-close time and simply discarded today) — walks saved *before* this change ships will render with a uniform trail, which is graceful (the concept's own "zero New Ground → no highlight" rule already covers it) but is a real, permanent gap for existing history, not a bug to chase.
- **Treats earned per walk is not persisted anywhere today** — `awardWalkRewards` computes it into an ephemeral celebration object and never writes it back to the walk record. Needs a new optional field, written just after rewards resolve.
- **A manual log's route-refresh linkage is not persisted at all** — the picked route id is used transiently to paint cells and is then discarded; nothing on the `Walk`/`StoredWalk` record remembers which route (if any) was refreshed. Needs a new optional field, set at the point the refresh is applied.
- **A manual log with no linked route has no distance or duration of any kind**, structurally — its `locations` array is always empty. The brief's item 6 (date/distance/duration/treats row) and item 7's closing line (date/distance/treats, duration dropped) don't quite agree on this case. Resolved here as: show date + treats only when there's no linked route, and the full row (sourced from the linked route's own locations) when there is one — flagged for a quick game-master sanity check on that resolution, not blocking.
- **The concept's own wording is ambiguous about whether a walk *with* New Ground gets any additional copy** ("if a walk had zero New Ground, the trail renders uniformly with **no additional copy**" implies non-zero New Ground might get some copy, but none is specified anywhere in the brief). Resolved here as color-only, no text, consistent with this project's convention of never inventing game-master-owned copy — flagged for confirmation.

## Capabilities

### Modified Capabilities
- `walk-history` — adds the tap-to-open Walk Portrait, the manual-log-with-no-second-class-treatment requirement, and the warmer non-qualifying-walk label.
- `walk-storage` — adds three new optional per-walk fields (`newGroundCellIds`, `treatsEarned`, `refreshedRouteWalkId`) to the walk record, all additive/backward-compatible.
- `visual-design` — adds one new Design Token (a muted grey already informally used elsewhere in this codebase as ad hoc UI text color, now formalized for its new use as a map-overlay color — see `design.md` Decision 3).

### Not modified
- `den-economy` — the manual-log route-refresh *mechanic* (its cap, its fixed multiplier, its inability to extend the Range) is unchanged; this change only adds a new field so a different screen can *display* which route was picked, after the fact. No economy rule changes.
- `home-range`, `somewhere-wild`, `personal-stats` — nothing here changes how the Home Range, New Ground detection, or achievements are computed; this is a presentation layer over already-authorized data, same posture `home-dashboard` took.
- `game-backlog` — no backlog item is pulled or changed here; no new mechanic.

## Impact

- `src/types.ts`: three new optional fields on `Walk` (see Decisions 4/5/6 in `design.md`).
- `App.tsx`: `finishWalk` and `logMissedWalk` populate the new fields; a second `saveWalk` call after rewards resolve to record `treatsEarned`; a new `viewingWalk: StoredWalk | null` top-level state (mirrors the existing `celebration` nullable-object pattern, not a new boolean — see `design.md` Decision 8) plus a `homeRangeRepository` prop newly passed to `WalkHistoryScreen`.
- `src/components/WalkHistoryScreen.tsx`: row becomes the tap target (wrapped in a `TouchableOpacity`, Delete's own `TouchableOpacity` untouched inside it); "Too short" → "Short stroll"; new `onSelectWalk` prop.
- New files: `src/web/walkPortraitHTML.ts` (the new live, animated, non-interactive WebView host), `src/components/WalkPortraitScreen.tsx` (fetches the walk/linked route/fallback range, drives the WebView or reuses `TerritoryPortrait`, renders the metadata row).
- `src/web/homeRangeRendererScript.ts`: one new exported rendering function for the muted background context layer (Decision 2/3 in `design.md`) — a third sibling to `renderHomeRangeToMap`/`renderHomeRangePortrait`, same already-verified math, new flat-color, no-gradient, no-wild-contour variant.
- `src/utils/grid.ts`: one new pure function splitting an ordered trail into New-Ground/non-New-Ground contiguous runs, for the two-color polyline segments.
- `src/utils/manualWalkLog.ts`: one new pure function for the "Tuesday morning" time-of-day phrase (this file is now the de facto calendar-utilities module hosting a fourth such helper — flagged again, not fixed here, per `home-dashboard/design.md`'s own already-logged flag on this file).
- `src/utils/streetLookup.ts`: exports its existing private `resolveLabelForPoint` (or a one-line named wrapper around it — implementer's call) — no new geocoding logic.
- No new database tables; no new repository; no new dependency.

## Scope

Current slice: a presentation layer over data the app already computes and stores (walk history, Home Range, treats, New Ground); no backlog item (streaks, social, Pack) is touched.

## Explicit anti-scope (from the brief, restated so no implementer or future agent reopens these)

No pace/speed/per-segment-speed coloring anywhere. No "best walk"/personal-records/ranking/sorting-by-distance. No two-walk comparison view. No share/export/screenshot button. No "gaps in your coverage"/unwalked-area highlighting. Deferred, not built, noted only: pinch-zoom/pan, scrubbing the trail by time, historical wildness reconstruction (what the Bloom looked like *at the time* of the walk), thumbnail previews in the history list rows.

## Open Questions — RESOLVED, all four accepted as recommended, 2026-08-22

1. New Ground copy: color-only, no text.
2. Manual-log-with-no-linked-route metadata row: date+treats only, no distance/duration line.
3. "Short stroll" replaces "Too short" as-is.
4. End-of-trail marker: nothing.

All four low-stakes, accepted at recommended defaults rather than escalated further.

## Source

Concept: `game-master` subagent pass ("Walk Portrait"), provided verbatim to this scoping pass. Technical scoping, the gaps above, and the rendering/data-model decisions: `senior-app-architect`, grounded in this session's direct reads of `App.tsx`, `src/types.ts`, `src/storage/WalkRepository.ts`, `src/storage/HomeRangeRepository.ts`, `src/economy/walkRewards.ts`, `src/utils/manualWalkLog.ts`, `src/utils/streetLookup.ts`, `src/utils/grid.ts`, `src/web/mapHTML.ts`, `src/web/portraitHTML.ts`, `src/web/homeRangeRendererScript.ts`, `src/components/WalkHistoryScreen.tsx`, `src/components/LogMissedWalkScreen.tsx`, `src/components/TerritoryPortrait.tsx`, `docs/specs/den-economy.md`, `docs/specs/walk-history.md`, `docs/specs/walk-storage.md`, `docs/specs/visual-design.md`, `docs/specs/game-backlog.md`, and the unarchived `home-dashboard`/`somewhere-wild` changes' `design.md`s.
