## Status

Drafted by `senior-architect` on 2026-10-18 at the owner's request ("Haushalt-Multiplayer" on the home server). Tier A: new player-facing capability (shared Den/Range, async events), so `/opsx:propose` flow applies and a `game-master` pass on the event copy and co-op rules is still owed (task 0.2). Grounded in the code as of commit `113d7d4`: `WalkRepository` already carries `StoredWalk.syncedAt`, `src/storage/backup.ts` already serialises every repository into one JSON shape, and `openspec/config.yaml` already says "AWS sync planned later". This change replaces "AWS" with "home server first, any container host later". Updated 2026-10-18 with the owner's decisions (Funnel instead of Tailscale on phones, iOS deferred) and Track B (simulated neighbour dogs).

## Why

Everything is local to one phone today (`game-backlog` Known stubs: "No backend, no accounts, no social layer"). The owner and his girlfriend share one dog and want to test together: two phones (Android + iPhone), one Buddy, one Home Range, one Den. That is the smallest real multiplayer there is, and it forces every hard part (accounts, sync, conflict rules, hosting, privacy) to be solved once, on a trusted audience of two, before strangers are involved. The backlog's Social layer (other players' territories, async events, zip leaderboards) is intentionally NOT built here; v1 only lays the model it will need.

## What Changes

- New **household** concept: 1 dog, 1..N players (v1 limit 4, tested with 2), joined by a one-time invite code. Each phone is a **device** with its own bearer token.
- New backend in `server/` (same repo, own `package.json`): Node 22, Fastify, PostgreSQL 16, Drizzle. REST plus a long-poll change feed. Deployed with Docker Compose on the home server behind its own Tailscale sidecar node with **Funnel on** (public HTTPS, no Tailscale needed on the phones); the same image runs on any container host. Public exposure comes with a hardening set (design Decision 16).
- New `src/sync/` module in the app: outbox, pull, apply. SQLite stays the local source of truth; the app works fully offline and catches up later.
- **Server-authoritative economy** (treats, XP/level, building upgrades, manual-log quota, territory resolution) via idempotent commands; **append-only** walks; **order-independent merge** for Home Range cells.
- Settings gets a "Haushalt gründen / beitreten" flow and server URL; the Doorstep away-strip can show one partner line ("Lisa was out with Buddy this morning").
- A `GET /v1/nearby` endpoint whose shape is fixed in M1 and whose list is empty until Track B.
- **Track B, "Nachbarhunde" (second milestone, after M1):** six server-simulated neighbour dogs per household, openly labelled as bots, with generated walks on real paths, gentle Doorstep events, tiny gifts and a weekly cooperative Viertel-Runde. Rules in the new capability `neighbour-dogs`; engineering in design Decisions 17-24. This is the first slice of the backlog's Social layer that can be tested with two people, and it is NOT real other households.
- Existing Backup/Restore stays; the server becomes a second copy, not a replacement.
- Households are created by an operator CLI over ssh; no admin token or household-creation endpoint exists on the public API.

## Not changing

- No competitive mechanics, leaderboards, mentors, Beginner's Luck changes, or any number in `den-economy` / `anti-snowball`. Formulas are reused, not altered (see design Decision 4 for the one place household play interacts with a cap).
- No background sync, no push notifications from the server, no new native dependency (design Decision 9).
- Per-device things stay per-device: language, reminders, feedback prefs, onboarding flag, personal stats/achievements (open question 2).

## Capabilities

### New Capabilities
- `multiplayer-sync`: households and invites, device auth and hardened public exposure, offline-first sync, authoritative economy commands, merge rules for walks/cells/territories/Den, partner events, nearby endpoint contract, privacy rules for shared data, operability requirements (health, backups, portability).
- `neighbour-dogs` (own spec file so the game-master-owned rules can be reviewed, archived and switched off independently of sync plumbing): simulated neighbour dogs, caps, gifts, co-op goal, never-rules.

### Modified Capabilities
- `anti-snowball`: one ADDED requirement (neighbour sprinkle outside the power budget), see `specs/anti-snowball/spec.md`.
- Nothing else by delta in this change. At archive time `game-backlog` "Known stubs and debts" must be edited (its first bullet becomes "backend exists for a 2-person household test; no public accounts/social") via a MODIFIED delta, and `openspec/config.yaml` context line "AWS sync planned later" updated. Listed as tasks 8.1/8.2.

## Impact

- New: `server/` (API, migrations, Dockerfile, compose, ops scripts, README), `src/sync/`, Settings/Doorstep UI additions, i18n keys (de/en).
- Touched: `src/app/finishTrackedWalk.ts` (hands the finished walk to the outbox), `src/app/repositories.ts` (wires sync), `HomeRangeRepository`/`TerritoryRepository`/`WalkRepository` (additive merge/upsert methods + in-memory fakes + contract tests), `SettingsRepository` (sync identity), `README.md` (Architecture says "no backend yet"), `CLAUDE.md` folder list.
- Server: `~/dog-territory/` on the home server, 1 GiB total `mem_limit`, ports 127.0.0.1:7000/7001, one new row in `SERVER.md`.
- iPhone: needs a native iOS build; deferred and owner-owned. No Tailscale app needed on any phone.
- Public internet: the API is reachable by anyone, so design Decision 16 (hardening, residual risk, kill switch) is part of the change.
- Track B adds tables, a scheduler inside the api process, an Overpass dependency, a new pure config `src/economy/neighbourConfig.ts`, app screens/i18n, art (Blender) and renderer tint/dotted options.

## Owner decisions (answers to the former open questions, 2026-10-18)

1. **iOS install path: deferred.** The owner handles it later. Tasks stay, marked "owner-owned"; nothing else waits on them (design Decision 15).
2. **Personal stats/achievements stay local per player in v1.** Confirmed. A partner's walks count for the household Den, not for your badges.
3. **Access: no Tailscale on the phones.** The API goes public via Tailscale Funnel on the project's own sidecar node (`your-server.example.com:443`, SERVER.md rule 3a; the host node's 443 stays untouched). Consequence: strict auth and exposure hardening, documented with its residual risk in design Decision 16.

## Source

Owner request 2026-10-18; `/Users/user/Projects/heimserver-SERVER.md` (binding server rules); `openspec/specs/game-backlog/spec.md` (Social layer, cross-cutting constraints); `openspec/specs/anti-snowball/spec.md`; the binding game-master design for the Nachbarhunde bots (2026-10-18: six dogs, caps, copy, never-rules), summarised in design Decisions 17-24 and `specs/neighbour-dogs/spec.md`.
