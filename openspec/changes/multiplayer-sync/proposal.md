## Status

Drafted by `senior-architect` on 2026-10-18 at the owner's request ("Haushalt-Multiplayer" on the home server). Tier A: new player-facing capability (shared Den/Range, async events), so `/opsx:propose` flow applies and a `game-master` pass on the event copy and co-op rules is still owed (task 0.2). Grounded in the code as of commit `113d7d4`: `WalkRepository` already carries `StoredWalk.syncedAt`, `src/storage/backup.ts` already serialises every repository into one JSON shape, and `openspec/config.yaml` already says "AWS sync planned later". This change replaces "AWS" with "home server first, any container host later".

## Why

Everything is local to one phone today (`game-backlog` Known stubs: "No backend, no accounts, no social layer"). The owner and his girlfriend share one dog and want to test together: two phones (Android + iPhone), one Buddy, one Home Range, one Den. That is the smallest real multiplayer there is, and it forces every hard part (accounts, sync, conflict rules, hosting, privacy) to be solved once, on a trusted audience of two, before strangers are involved. The backlog's Social layer (other players' territories, async events, zip leaderboards) is intentionally NOT built here; v1 only lays the model it will need.

## What Changes

- New **household** concept: 1 dog, 1..N players (v1 limit 4, tested with 2), joined by a one-time invite code. Each phone is a **device** with its own bearer token.
- New backend in `server/` (same repo, own `package.json`): Node 22, Fastify, PostgreSQL 16, Drizzle. REST plus a long-poll change feed. Deployed with Docker Compose on the home server behind a Tailscale sidecar; the same image runs on any container host.
- New `src/sync/` module in the app: outbox, pull, apply. SQLite stays the local source of truth; the app works fully offline and catches up later.
- **Server-authoritative economy** (treats, XP/level, building upgrades, manual-log quota, territory resolution) via idempotent commands; **append-only** walks; **order-independent merge** for Home Range cells.
- Settings gets a "Haushalt gründen / beitreten" flow and server URL; the Doorstep away-strip can show one partner line ("Lisa was out with Buddy this morning").
- A `GET /v1/nearby` stub with a final response shape and always-empty result, so the later neighbour feature has a contract.
- Existing Backup/Restore stays; the server becomes a second copy, not a replacement.

## Not changing

- No competitive mechanics, leaderboards, mentors, Beginner's Luck changes, or any number in `den-economy` / `anti-snowball`. Formulas are reused, not altered (see design Decision 4 for the one place household play interacts with a cap).
- No background sync, no push notifications from the server, no new native dependency (design Decision 9).
- Per-device things stay per-device: language, reminders, feedback prefs, onboarding flag, personal stats/achievements (open question 2).

## Capabilities

### New Capabilities
- `multiplayer-sync`: households and invites, device auth, offline-first sync, authoritative economy commands, merge rules for walks/cells/territories/Den, partner events, nearby stub, privacy rules for shared data, operability requirements (health, backups, portability).

### Modified Capabilities
- None by delta in this change. At archive time `game-backlog` "Known stubs and debts" must be edited (its first bullet becomes "backend exists for a 2-person household test; no public accounts/social") via a MODIFIED delta, and `openspec/config.yaml` context line "AWS sync planned later" updated. Listed as tasks 8.1/8.2.

## Impact

- New: `server/` (API, migrations, Dockerfile, compose, ops scripts, README), `src/sync/`, Settings/Doorstep UI additions, i18n keys (de/en).
- Touched: `src/app/finishTrackedWalk.ts` (hands the finished walk to the outbox), `src/app/repositories.ts` (wires sync), `HomeRangeRepository`/`TerritoryRepository`/`WalkRepository` (additive merge/upsert methods + in-memory fakes + contract tests), `SettingsRepository` (sync identity), `README.md` (Architecture says "no backend yet"), `CLAUDE.md` folder list.
- Server: `~/dog-territory/` on the home server, 1 GiB total `mem_limit`, ports 127.0.0.1:7000/7001, one new row in `SERVER.md`.
- iPhone: needs a native iOS build (open question 1) and the Tailscale app.

## Open Questions (for the owner)

1. **iOS install path.** EAS internal/ad-hoc iOS builds need a paid Apple Developer account (99 USD/yr) plus the iPhone's UDID. Free alternative: build from the owner's Mac with Xcode (`npx expo run:ios --device`, personal team), which expires every 7 days and needs the phone on a cable. Recommendation: Xcode free for the first test weekend, Apple account if the test continues. iOS background location (`UIBackgroundModes`, usage strings in `app.json`) is untested; walking with the screen on is the fallback.
2. **Personal stats/achievements** are per player and stay local in v1 (a partner's walks count for the household Den, not for your badges). Alternative is household-level stats. Default chosen: local.
3. **Girlfriend joins the Tailnet how?** Recommended: share only the `dog-territory` node to her own Tailscale account (she then sees nothing else on the owner's Tailnet). Fallback: invite her as a tailnet user. To be verified on her phone (task 7.3).

## Source

Owner request 2026-10-18; `/Users/user/Projects/heimserver-SERVER.md` (binding server rules); `openspec/specs/game-backlog/spec.md` (Social layer, cross-cutting constraints); `openspec/specs/anti-snowball/spec.md`.
