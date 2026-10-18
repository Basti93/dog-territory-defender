## Why

Phase 1's hypothesis — "claiming territory plus earning passive treats creates a 'want to walk again tomorrow' feeling" — needs a real treats economy to test at all. Right now nothing generates or stores treats; `docs/specs/den-economy.md` and `docs/specs/anti-snowball.md` already fully describe the target behavior (treats from walks, passive generation, exponential building costs, soft cap above level 50) from the earlier docs→specs conversion, but none of it is implemented. This change builds the underlying economy — treats balance, passive generation, building levels/costs, soft cap — as a tested, config-driven core, without the Den screen UI (that's the next change).

## What Changes

- New `src/economy/` module: a `balanceConfig.ts` holding every tunable number (treats per walk, starting treats, storage formula, passive rate, per-building cost curves, soft-cap shape) in one place, and `formulas.ts` — pure functions built on that config (`upgradeCost`, `storageCap`, `passiveTreatsPerHour`, `softCapBonusPercent`), unit tested.
- New persisted `DenEconomy` state (treats balance, per-building levels, last-tick timestamp) via a repository, following the same pattern as `WalkRepository` (interface + SQLite implementation + in-memory fake + contract tests).
- Walk completion (`stopWalk`'s closing branch) awards a flat treats reward.
- Passive treats accrue based on elapsed real time since the last check, capped at the Doghouse's storage capacity — computed on read, not via a background timer, so it works correctly whether or not the app was open.
- **No new capability specs.** `den-economy` and `anti-snowball` already specify this behavior qualitatively (exponential costs, soft cap above L50, capped storage, treats from walks/passively) — this change implements it without changing any spec text. The exact numbers (e.g. treats-per-walk = 50, ~1 treat/hour per Bakery level, the soft-cap curve shape) are config/implementation defaults, not spec-level requirements, and are documented with rationale in design.md instead.
- **Not in this change:** the Den screen UI, building visuals, upgrade buttons, "next upgrade" tease, spring theming/animations — that's the following change, built on top of this one.

## Capabilities

### New Capabilities
(none — see "No new capability specs" above; `skip_specs: true` set in `.openspec.yaml`)

### Modified Capabilities
(none)

## Impact

- New dependency: none (reuses `expo-sqlite`, already installed).
- New module: `src/economy/` (`balanceConfig.ts`, `formulas.ts`, tests).
- New module: `src/storage/DenEconomyRepository.ts` + SQLite/in-memory implementations + contract tests, mirroring `src/storage/WalkRepository.ts`'s pattern.
- `App.tsx`: `stopWalk()`'s closing branch awards treats via the new repository; no new UI beyond what's needed to confirm this works (a plain treats-balance readout is fine here — the real Den screen is the next change).
- `docs/specs/`: unchanged.
