# Home Range rewards: Fresh Ground, manual refresh, New Ground beats (2026-08-21, second half of the home-range split)
**Why:** `docs/decisions/2026-08-21-home-range.md` shipped a correct Range/Bloom that paid exactly what the polygon paid. The concept's payoff (wilder ground pays more, discovery celebrated, honest manual refresh) was only wired up here.
**Decisions:**
- Fresh Ground: `bloomMultiplier = 1 + 0.6*B` on treats only (never XP), floor 1.0 (never a penalty for leaving), suppressed below x1.25 so a routine walk shows no multiplier line. Math lives in the home-range doc.
- Manual-log route refresh: pick a previously GPS-tracked route, max 1 refresh/day, fixed x1.112 payout regardless of route (closes the route-picking farm: route-dependent bloom paid 152% of an honest day for zero walking).
- New Ground / Fresh Ground celebration beats at walk close plus the "Buddy knows N streets" stat; exact copy/placement is game-master's lane, not fixed here.
- Anti-snowball record: bloom spends 0 pp of the 30 pp Hard Power Gap budget (no level/building/treat-balance term); to be written as spec text per the virtual-dog-companion precedent ("no capped bonus reads Level or treat balance").
- Guardrails: no numbers on the Bloom fill (multiplier is a treats-screen line, not a map overlay); never a leaderboard metric.
- Open at proposal time: K = 0.6 needs game-master sign-off; copy; whether the route picker shows eligible routes.
**Links:** docs/specs/home-range.md; docs/specs/anti-snowball.md; docs/specs/den-economy.md; src/economy/walkRewards.ts (carries `bloomMultiplier`); src/economy/formulas.ts. Depends on docs/decisions/2026-08-21-home-range.md.
