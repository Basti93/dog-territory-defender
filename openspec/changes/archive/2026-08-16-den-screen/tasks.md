## 1. Den screen component

- [x] 1.1 Create `src/components/DenScreen.tsx`: `BUILDING_DISPLAY` metadata map, fetches `DenEconomyState` via the repository on mount.
- [x] 1.2 Render 3 building cards (Doghouse, Treat Bakery, Sniff Garden): current level, effect text (per design.md's formatting), next-level effect, upgrade cost.
- [x] 1.3 Compute and visually highlight the "next upgrade" tease (cheapest affordable; cheapest overall if none affordable).
- [x] 1.4 Wire tap-to-upgrade: calls `upgradeBuilding`, handles `insufficient-treats`/`max-level` with an inline message, saves via the repository on success, updates local state.
- [x] 1.5 Add the storage-full notice (shown once per session if treats are at cap on load) and one idle SVG touch (e.g. dog resting near the Doghouse).

## 2. Wire into App.tsx

- [x] 2.1 Add `showDen` state + a "Den" button (same toggle pattern as `showHistory`/`WalkHistoryScreen`).
- [x] 2.2 Pass `denEconomyRepository` and a treats-update callback into `DenScreen` so the header total stays in sync after an upgrade.

## 3. Wrap-up

- [x] 3.1 Update `README.md`'s "What works" section (Den screen now built) and remove the now-stale "no Den screen UI yet" note.
- [x] 3.2 Log the token extension (3 new building colors) and the Den screen decision — captured in this change's own `proposal.md`/`design.md` (DECISIONS.md was retired; `openspec/changes/archive/` is now the decision log).
