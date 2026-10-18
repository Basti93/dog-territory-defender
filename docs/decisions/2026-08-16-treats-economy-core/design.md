## Context

`den-economy` and `anti-snowball` specs already describe the target behavior qualitatively (treats from walks + passively, exponential building costs, soft cap above level 50, storage capped by Doghouse). None of the exact numbers are spec'd — those are legitimately implementation defaults. The prototype (`prototype/den-screen.jsx`, `prototype/Dog Territory Defender.html`) has real numbers for treats-per-walk (50), starting treats (50), storage (`100 + doghouseLevel*100`), and per-building cost curves — but its passive rate (0.1 treats/sec per Bakery level) was tuned for a 30-second demo, not real walk pacing, and it never implemented the soft cap at all (only showed static L1/L3/L5 presets). See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- One config file holds every tunable number — no magic numbers scattered through logic.
- Pure, unit-tested formulas for cost, storage, passive rate, and soft cap.
- Persisted economy state survives restarts, following the same repository pattern as `WalkRepository`.
- Walk completion awards treats; passive treats accrue correctly whether or not the app was open the whole time.

**Non-Goals:**
- No Den screen UI, building visuals, upgrade buttons, or "next upgrade" tease (next change).
- No collectibles — Sniff Garden's `%collectibles` effect is stored and computed but has nothing to apply to yet (Phase 2).
- No defense-related soft-cap calibration against the full 10-building/Phase 4 "~30% total advantage at L100" figure — only Sniff Garden exists as a %-bonus building right now; that aggregate figure becomes checkable once more buildings ship.

## Decisions

**Config file: `src/economy/balanceConfig.ts`.**
```ts
export const BALANCE = {
  treatsPerWalk: 50,
  startingTreats: 50,
  storage: { base: 100, perDoghouseLevel: 100 },       // storageCap = base + doghouseLevel * perDoghouseLevel
  passive: { treatsPerHourPerBakeryLevel: 1 },          // NEW default — see rationale below
  buildings: {
    doghouse:    { costBase: 40, costMult: 1.5 },        // from prototype
    bakery:      { costBase: 60, costMult: 1.6 },        // from prototype
    sniffGarden: { costBase: 50, costMult: 1.45 },       // from prototype
  },
  softCap: { level: 50, maxBonusPercent: 50, curveRate: 25 }, // NEW — see rationale below
  maxBuildingLevel: 100,
} as const;
```
`treatsPerWalk`, `startingTreats`, and the three building cost curves come straight from the prototype (already-decided numbers). `passive.treatsPerHourPerBakeryLevel` and `softCap` are new — the prototype never specified real-time pacing or implemented the cap at all.

**Passive rate: 1 treat/hour per Bakery level.** Invented default, not empirically validated — loosely calibrated so a mid-level Bakery produces a "meaningful treats waiting" feeling over several hours away, matching the general shape of the original design narrative (dropped from specs as flavor text during the docs→specs conversion, but still useful as a calibration reference). Isolated in one config field — retuning after Phase 1 testing is a one-line change, no code restructuring.

**Soft cap: `bonusPercent(level) = maxBonusPercent × (1 − e^(−level / curveRate))`, applied only to %-bonus buildings.** With `maxBonusPercent=50, curveRate=25`, this reaches ~43% (86% of the cap) by level 50 and creeps toward 50% after — satisfies `anti-snowball`'s "+50% cap above level 50" without a hard step. This formula applies to Sniff Garden's `%collectibles` bonus — the only %-bonus-style building in Phase 1. Doghouse's storage capacity and Bakery's passive rate are **not** run through this cap: they're personal resource throughput, not a competitive advantage over other players (the anti-snowball concern `den-economy`/`anti-snowball` are protecting against is real once Watch Tower/defense-style buildings exist in Phase 3+ — not applicable yet to storage/passive-rate). Their own exponential cost curve is what throttles progression speed for now. Revisit this split when Phase 3/4 buildings land.

**Persisted as a single row, DynamoDB-shaped.** One `DenEconomyState` (treats, three building levels, `lastTickAt`), stored under a fixed key (`'singleton'`) — same single-item-table philosophy as `walk-storage`'s schema, just simpler since there's only ever one economy record (no multi-user accounts yet).
```sql
CREATE TABLE IF NOT EXISTS den_economy (
  id TEXT PRIMARY KEY,
  treats INTEGER NOT NULL,
  doghouseLevel INTEGER NOT NULL,
  bakeryLevel INTEGER NOT NULL,
  sniffGardenLevel INTEGER NOT NULL,
  lastTickAt INTEGER NOT NULL
);
```

**Passive accrual computed on read, not a running timer.** On app load (and any other time the state is read), compute elapsed real time since `lastTickAt`, add `passiveTreatsPerHour(bakeryLevel) × elapsedHours` capped at `storageCap(doghouseLevel)`, and advance `lastTickAt`. This is the standard idle-game pattern — no background timer to manage, and it's correct whether the app was closed for 5 minutes or 5 hours.

**Module layout:**
- `src/economy/balanceConfig.ts` — the config above.
- `src/economy/formulas.ts` — pure functions: `upgradeCost(building, level)`, `storageCap(doghouseLevel)`, `passiveTreatsPerHour(bakeryLevel)`, `softCapBonusPercent(level)`.
- `src/economy/denEconomy.ts` — state transitions built on the formulas: `applyPassiveAccrual(state, now)`, `awardWalkTreats(state)`, `upgradeBuilding(state, building)` (returns the new state, or `{ error: 'insufficient-treats' | 'max-level' }` — expected outcomes, not exceptions).
- `src/storage/DenEconomyRepository.ts` (+ `sqliteDenEconomyRepository.ts`, `inMemoryDenEconomyRepository.ts`), mirroring `WalkRepository`'s shape: `getState()` (creates the default row on first call), `saveState(state)`.

**`App.tsx` integration, minimal for this change.** On load: `getState()` → `applyPassiveAccrual(..., Date.now())` → `saveState(...)` → show the current treats balance somewhere simple (a header readout is enough — the real Den screen is the next change). On `stopWalk()`'s closing branch: `awardWalkTreats` then `saveState`, and fold the reward into the existing success alert (e.g. "Territory claimed! Area: X m². +50 treats!").

## Risks / Trade-offs

- [Passive rate default (1 treat/hr/Bakery-level) is a guess, not validated] → Isolated to one config field; Phase 1's 5-day test will surface if pacing feels off, and it's a one-line change to retune.
- [Soft-cap curve shape (`curveRate=25`) is a design choice, not derived from data] → Pure function, trivially adjustable; also not reachable within Phase 1's 5-day test window given the exponential cost curve, so it can't distort this phase's results either way.
- [On-read passive accrual can be gamed by advancing the device clock] → Not a concern for Phase 1 prototype testing (single local player, no competitive stakes yet); becomes a real server-authority concern once AWS sync exists — noted for that future work, not solved here.
