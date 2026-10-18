## Context

Verified against the repo before writing:

- `Walk` has a client-generated `id`; `StoredWalk.syncedAt: number | null` already exists and is unused. `WalkRepository.replaceAll`, `HomeRangeRepository.replaceAll`, `TerritoryRepository.replaceAll` exist for Backup/Restore only ("never call from game logic").
- `finishTrackedWalk.ts` is the one place a walk becomes cells + territories + treats. It reads `rangeBefore` (for New Ground and the Fresh Ground bloom), resolves territories (`resolveTerritoryChanges`, reverse-geocode names), paints, then `awardWalkRewards` mutates `DenEconomyState` through `DenEconomyRepository.saveState`.
- `Cell` = `{ix, iy, lastRefreshed, lastTracked, visits, territoryId}`; `visits` is credited at most once per cell per local calendar day (`den-economy` territory requirements). So `visits` is really "number of distinct days this cell was walked".
- `src/economy/formulas.ts`, `balanceConfig.ts`, `territoryEconomy.ts` and `src/utils/grid.ts` import no React Native, Expo or i18n. `denEconomy.ts` and `milestones.ts` import `../i18n` (`t`), so they cannot run on the server unchanged.
- `backup.ts` already maps all repositories to one JSON (`BackupFile`), the natural payload for the founding device's first upload.
- `eas.json` has an Android-only preview profile; `app.json` already has `ios.bundleIdentifier = com.dogtd.mobile`.

## Goals / Non-Goals

Goals: two phones, one dog, one Range, one Den, in sync, offline-tolerant; runs on the home server within its rules; moves to a cloud host by changing config, not code.
Non-goals: other real households, leaderboards, public sign-up, email/password, push, background sync, object storage, websockets, horizontal scaling.

## Decision 1 — Authority model: server-authoritative economy, append-only walks, merge-only cells

Per table:

| Data | Rule | Why |
|---|---|---|
| Walks | Append-only. Client UUID is the key; re-upload is a no-op. Delete = soft delete (`deleted_at`), cells are never un-painted (Range is monotonic by spec). | Two phones can never write the same walk; nothing to conflict. |
| Cells | Server derives them from accepted walks; clients apply server cells with `max` per field. | See Decision 3. |
| Territories | Server-authoritative (runs `resolveTerritoryChanges` at walk ingest). Names are client hints. | Two phones offline must not birth two territories for the same street. |
| Den state (treats, XP, level, building levels, manual-log counters) | Server-authoritative, mutated only by commands. Client keeps an optimistic copy and replaces it with the server snapshot on every response. | Treats can be spent. "Last writer wins" on a spendable balance silently loses or duplicates money; with two players spending from one balance, that WILL happen. |
| Dog name / appearance | Last writer wins by server receive order. | Cosmetic, rare, harmless. |
| Settings, reminders, locale, feedback prefs, personal stats | Not synced. | Per device/player. |

Rejected: client-authoritative LWW for everything (simplest, but wrong for the balance, and territories would fork); full CRDTs (overkill for a 2-person household; the only genuinely mergeable structure is the cell set, handled by a day-set).

Commands (all carry a client-generated `clientId`, stored in `command_log` with the result; a replay returns the stored result, never re-executes):
`walk.finish` (tracked walk with its route; server derives cells, territories, reward), `walk.manualLog`, `den.upgrade`, `walk.delete`, `dog.update`. Passive treat accrual needs no command: the server applies it lazily from `lastTickAt` when it reads or mutates the Den, and the client projects the same formula locally for display.

Reward computation: the server recomputes the reward from the walk's route and its own cell state using the existing pure functions. The celebration screen still shows the local estimate immediately (offline-first); the server's number wins on reconcile. A tiny difference is possible when two offline walks arrive in a different order than they were walked (bloom depends on "cells before this walk"). Accepted: arrival order is the order of truth; the Den quietly shows the server balance; it never shows a deduction message. If an upgrade is rejected (`insufficient-treats`, e.g. the partner spent first), the client rolls back to the snapshot and shows a gentle "Lisa already upgraded the Bakery" style line, never an error tone (Buddy-anti-guilt rule).

## Decision 2 — One append-only `events` table is both change feed and Doorstep feed

Every accepted mutation appends a row `(seq bigserial, household_id, kind, actor_player_id, payload jsonb, created_at)`. Clients keep a `cursor` (last applied `seq`) and pull `GET /v1/events?after=<seq>&wait=<s>`. Kinds in v1: `walk.added`, `cells.changed`, `territory.changed`, `den.updated`, `dog.updated`, `member.joined`. Doorstep lines are derived from `walk.added` / `member.joined` of OTHER players; no separate notification table. Applying an event is idempotent (key = natural id or `seq`). `GET /v1/snapshot` returns the whole household state plus the current `seq` for bootstrap and for recovery when a client's cursor is older than retention (v1 retention: forever; tiny data).

Transport: **long-poll, not SSE or WebSockets.** React Native has no native `EventSource`, mobile OSes kill idle sockets in the background anyway, and the app syncs only in the foreground. Long-poll (`wait` up to 25 s) is plain `fetch`, works through Tailscale serve and any cloud proxy, and degrades to ordinary polling.

## Decision 3 — Home Range merge: derive on the server from a day-set, apply with `max` on the client

The brief's rule "cells = max(visits), max(lastTracked)" is correct for the client applying server data (monotone, order-independent, safe against replays) but is NOT correct as the server's merge: if both players walk the same street on the same day, `max` would count it once (right), but if they walk it on different days from two phones that have not seen each other yet, `max(1,1)=1` where the truth is 2 distinct days. Since `visits` means "distinct days", the server keeps `cell_days(household_id, ix, iy, day)` (unique), inserts the days a walk paints with `ON CONFLICT DO NOTHING`, and sets `cells.visits = baseline_visits + count(cell_days)`. Result: union of days, commutative and idempotent, and the existing once-per-day-per-cell cap automatically holds for the whole household (two walks on one day = one visit), so household play cannot inflate `territoryRate`. `lastTracked` and `lastRefreshed` are `max` of the walks' timestamps. The "day" is the household's IANA timezone (`households.timezone`, defaulted from the creator's device, Europe/Berlin fallback), because the server must agree with the phones on what "today" is.
`baseline_visits` exists only for the founding import (Decision 8): the owner's existing Range arrives with `visits` totals but no day history.

Client apply rule per cell: `visits = max(local, server)`, `lastTracked/lastRefreshed = max`, `territoryId = server`. This requires an additive `HomeRangeRepository.mergeCells(cells)` (not `replaceAll`, which is Backup-only) plus the in-memory twin and contract tests.

## Decision 4 — Cooperative household and the anti-snowball invariants

v1 is cooperative: both players' walks pay the household Den; the Doorstep never compares players ("Lisa walked more than you" is forbidden). Invariants that must keep holding (each is a spec scenario):
- Beginner's Luck and any account-age rule key off the **household** creation date, not the second player's join date (otherwise joining later would be a second 2x window).
- The once-per-cell-per-day visits cap is household-wide (Decision 3).
- The manual-log quota (2/day, 1 route refresh/day) is household-wide, kept in `den_state` on the server.
- Treat income from two walkers is simply twice the walks; walks are not a capped power bonus, so the +30% power cap is untouched. No percentage bonus is added for "more members".

## Decision 5 — Backend stack

- **Fastify** over Hono: Node-first (Hono's strength is multi-runtime edge, which we do not need), built-in JSON-schema validation and pino structured logs, mature plugin set, tiny memory. Written in strict TypeScript, ESM, Node 22.
- **TypeBox** schemas for the API contract: one definition gives the runtime validator (Fastify) and the static TS types (app).
- **Drizzle ORM + drizzle-kit** over Prisma: SQL-first schema in TS, plain generated `.sql` migration files committed to git, no Rust query-engine binary (Prisma's engine costs RAM that our 384 MiB `api` budget does not have, and complicates the alpine image). Driver: `postgres` (postgres.js) with a pool of at most 5.
- **Tests**: Vitest in `server/`, integration tests against a throwaway Postgres container (testcontainers or a compose test profile). The app's Jest stays as it is.
- Why Postgres (not SQLite on the server): the cloud target offers managed Postgres everywhere, the data is relational with concurrent writers (2 phones + later many), and we want real transactions for commands (`SELECT ... FOR UPDATE` on `den_state`). SQLite-on-server would be lighter on RAM (saves ~150 MiB) but gives up parity with any cloud and makes the later move a data-model migration. Cost accepted.

## Decision 6 — Where the shared contract and shared pure code live

Layout: `server/` with its own `package.json`, `tsconfig.json`, `Dockerfile`, `drizzle/` migrations; NOT a workspace/monorepo tool (Expo + Metro + npm workspaces needs `watchFolders` and hoisting care for no present benefit; the repo's `.npmrc` already needs `legacy-peer-deps`).

- **API contract**: `src/sync/apiContract.ts` (TypeBox schemas + inferred types, no React Native imports), imported by the server through a relative path (`../src/sync/apiContract`). One file, one source of truth, no copy that can drift. Fixtures of request/response JSON live next to it and are asserted by both the server tests and the app tests.
- **Shared pure game code**: the server imports `src/economy/formulas.ts`, `balanceConfig.ts`, `territoryEconomy.ts`, `src/utils/grid.ts`, `geometry.ts`, `territoryCluster.ts`, `manualWalkLog.ts` by relative path rather than duplicating them (duplicated economy numbers are exactly the "silent drift" CLAUDE.md forbids). The allowlist is written in `server/README.md`, and a Jest test in the app (`src/sync/__tests__/sharedPurity.test.ts`) fails if any allowlisted file imports `react-native`, `expo*`, `../i18n`, `../storage` or `../components`. Prerequisite spike (task 0.1): `denEconomy.ts` and `milestones.ts` import `t()`; the state transitions needed server-side (award, upgrade, tick) must be split from the message-producing code, or the server must use only the `formulas.ts` layer plus a small server-side state transition that is tested against `denEconomy.ts` with shared fixtures. Implementer decides which after reading the files; the requirement is "same numbers, one definition, a test that proves it".
- The Docker build context is the repo root and copies only `server/` + the allowlisted `src/` paths.

## Decision 7 — Auth v1: invite code + per-device bearer token, behind a swappable seam

- `POST /v1/households` (guarded by the server env `ADMIN_TOKEN`, which only the owner has) creates a household, its first player and device, returns a device token and a first invite code.
- `POST /v1/join {code, playerName, deviceLabel}` consumes a single-use invite (8 chars from an unambiguous alphabet, expires after 24 h) and returns a new player + device token. Household size limit from env `HOUSEHOLD_MAX_PLAYERS` (default 4).
- Tokens: 32 random bytes, base64url; only a SHA-256 hash is stored (`devices.token_hash`). Revocable per device (`revoked_at`). Sent as `Authorization: Bearer`.
- Seam: a single `Authenticator` interface (`request -> {householdId, playerId, deviceId} | null`) is the only thing routes call. A later identity provider (OIDC/Sign in with Apple) replaces the implementation and adds an `identities` table; routes, commands and tables do not change. Do not add email/password tables now.
- Invite codes are rate-limited (5 failed attempts/min/IP, `@fastify/rate-limit`).

## Decision 8 — Data model (Postgres 16)

All tables carry `household_id` and every query filters on it (tenant key from day one; cheap now, painful later). Ids are UUIDs generated by the client where the client creates the entity (walks, commands), otherwise by the server.

| Table | Key columns |
|---|---|
| `households` | `id`, `timezone`, `created_at`, `discoverable bool default false`, `founded_import_done bool` |
| `players` | `id`, `household_id`, `display_name`, `created_at`, `left_at` |
| `devices` | `id`, `player_id`, `label`, `token_hash unique`, `last_seen_at`, `revoked_at` |
| `invites` | `code_hash`, `household_id`, `expires_at`, `used_by_player_id` |
| `dogs` | `id`, `household_id`, `name`, `appearance jsonb`, `updated_at` (v1: exactly one per household; table exists so "one household, several dogs" later is an insert, not a migration of Den ownership) |
| `walks` | `id` (client UUID), `household_id`, `player_id`, `start_time`, `start_source`, `route jsonb`, `closed`, `new_ground_cell_ids jsonb`, `treats_earned`, `reward jsonb` (stored command result), `deleted_at`, `created_at` |
| `cells` | `(household_id, ix, iy)` PK, `last_refreshed`, `last_tracked`, `baseline_visits`, `visits`, `territory_id` |
| `cell_days` | `(household_id, ix, iy, day)` PK |
| `territories` | `id`, `household_id`, `name`, `created_at`, `walks_here`, `treats_earned_here` |
| `den_state` | `household_id` PK, the `DenEconomyState` fields, `rev` (incremented per mutation), `updated_at` |
| `events` | `seq bigserial` PK, `household_id`, `kind`, `actor_player_id`, `payload jsonb`, `created_at`; index `(household_id, seq)` |
| `command_log` | `(household_id, client_id)` PK, `kind`, `result jsonb`, `created_at` |

Migrations: drizzle-kit generated SQL files in `server/drizzle/`, committed; applied by a `migrate` entrypoint that runs before the server starts (single API instance in v1, so no migration race; if the API is ever scaled out, migrations move to a one-off job).
Territory ids keep the existing `t<15-digit-ms>-<rand>` format (cells reference them; `territoryIdCreatedAt` is used by merge logic).
The founding device uploads its existing data once with `POST /v1/households/import` in the shape of `BackupFile.data` (walks, cells, territories, Den state, dog). Imported walks are stored without recomputing rewards; cell visits go to `baseline_visits`; allowed once (`founded_import_done`). A second device joining an existing household downloads the snapshot; joining on a device that already has local data requires explicit confirmation and replaces it (the existing local Backup file is the safety net, so the join screen offers "Share backup first").

## Decision 9 — Offline-first client in `src/sync/`

- **Outbox**: a SQLite table `sync_outbox(id, kind, payload, createdAt, attempts, lastError)` owned by a new `SyncRepository` (interface + sqlite + in-memory, like every other repository). `finishTrackedWalk` and the upgrade/manual-log paths enqueue a command after their local write; local behaviour is unchanged and instant. `syncedAt` on `StoredWalk` is set when the server acks the walk command.
- **Loop** (`syncEngine.ts`): runs on app foreground, after enqueue, and every ~30 s while foregrounded with the long-poll; otherwise idle. Order: push outbox oldest-first (stop at first network failure), then pull events, apply, advance cursor. Backoff on failure (5 s doubling to 5 min). No background tasks and no NetInfo: both would be new native dependencies, which need the owner's go-ahead (CLAUDE.md). Plain `fetch` with a 15 s timeout.
- **Apply** (`applyEvents.ts`): pure mapping from events to repository calls. Partner walks are written to the local walk repository (with `playerId`) but NEVER re-run `finishTrackedWalk`/rewards locally; the server already did. Den state: replace local with the server snapshot when `rev` is newer. Territories: upsert. Cells: `mergeCells` (Decision 3).
- **Offline**: everything works; the only visible effect is that partner news and server-corrected balances appear later. The Doorstep never shows "offline" copy or sync counts. A small Settings row shows "Last synced" and a manual "Sync now".
- **Identity storage**: server URL, device token, ids, cursor in `SettingsRepository`/`SyncRepository` (SQLite). The token is therefore unencrypted at rest on the phone; accepted for a 2-person test (a leaked token only exposes that household). `expo-secure-store` would be a new native dependency; revisit before any public release. The token must never enter the Backup JSON (`backup.ts` maps an explicit field list, so sync fields stay out unless someone adds them; a test pins this).
- **Time**: every response includes `serverTime`; the engine keeps `clockOffsetMs` and uses it to project passive accrual and to stamp commands. The server rejects walks starting more than 5 minutes in the future and older than 30 days; clamps nothing silently (returns a reason).
- **Backup/Restore relation**: the file backup stays as the device-level escape hatch. The server is a replica of household state, so a lost phone is recovered by joining again (snapshot). Restore is disabled while a household is joined (explanation text: leave the household first, which keeps local data and clears sync identity), because restoring an old file over live synced state would fork history.

## Decision 10 — Events on the Doorstep (copy rules)

One new away-strip candidate: "<Name> was out with <Dog> <this morning | this afternoon | this evening | yesterday>", derived from `walk.added` by another player within 48 h, bucketed by the household timezone, never with distance, time-since or counts, never when the partner's walk is older than 48 h (silence is fine). Positive framing only; no line ever mentions that the viewing player has not walked. It competes inside the existing 0-3 line cap and resolves once per launch like the other lines. `member.joined` produces a one-off "<Name> joined <Dog>'s pack" line. Exact German/English wording is a task for the `game-master` pass (task 0.2); keys go in both dictionaries.

## Decision 11 — "Other households nearby" stub

`GET /v1/nearby` is authenticated, returns `{ "households": [] }` always in v1, and the contract fixes the item shape now: `{ id (opaque), dogName, areaLabel (coarse), lastActiveBucket }`; no coordinates, no cells. `households.discoverable` defaults to false and nothing sets it. The app calls nothing and renders nothing (no empty state). Purpose: a contract and a default-private flag exist before real data does. When real neighbours arrive, the 100 m start fuzz, coarse-area rounding and claim/defend language rules from `game-backlog` apply (see Decision 12), and a new OpenSpec change defines overlap rules.

## Decision 12 — Privacy and GDPR (2-person test)

- Inside a household, members see each other's full routes (they live together; the product is shared by design). The join screen states plainly what is shared, once, and requires a tap (consent record: `players.consented_at`).
- Anything that will ever cross a household boundary (nearby, events to neighbours) must be derived from data with the 100 m start-point fuzz applied: drop the first-cell neighbourhood within 100 m of the walk start, no raw coordinates, areas rounded coarsely. v1 exposes none of it, and a spec requirement forbids adding a cross-household field without that fuzz.
- Data minimisation: no email, no phone number, no advertising ids; display name and device label only. Server logs never contain coordinates or tokens (pino redaction list).
- Erasure: `DELETE /v1/me` (player leaves, their device tokens revoked, display name anonymised, walks kept for the household unless they also ask for deletion) and `DELETE /v1/household` (hard delete of all rows). Both are covered by tests and by a `server/README.md` section.
- Hosting at home (Germany) keeps data in the EU. Before ANY non-test user: privacy policy, processor agreements with the chosen cloud host, a short DPIA (continuous location data), and a legal check. This design is engineering guidance, not legal advice.

## Decision 13 — Cloud portability (12-factor)

- Config only through env: `DATABASE_URL`, `PORT`, `ADMIN_TOKEN`, `LOG_LEVEL`, `HOUSEHOLD_MAX_PLAYERS`, `NODE_ENV`. No file paths, no host names in code.
- Stateless API (no in-memory sessions; long-poll waiters are per request); Postgres is the only state. No object storage needed (routes are JSON in Postgres; a 1 h walk is roughly 150 KB).
- One OCI image (`node:22-alpine`, non-root, `--max-old-space-size=256`), no vendor SDKs. The same image runs on Fly.io, Render, Hetzner (compose or Coolify) with a managed or sidecar Postgres. Moving = restore a `pg_dump` into the new database, set `DATABASE_URL`, change the server URL in the app (a Settings value, so no app rebuild; the household join flow re-pairs devices if tokens must change).
- `GET /healthz` (process up, no DB) and `GET /readyz` (DB ping) for container and platform health checks. Structured JSON logs to stdout; the platform collects them.
- Home-specific parts are isolated in `server/deploy/home/` (compose, serve config, backup script) and not referenced by code.

## Decision 14 — Home server deployment (binding rules from `heimserver-SERVER.md`)

Folder `~/dog-territory/`, compose project name `dog-territory` (`name:` in the compose file), no `sudo` anywhere (the owner is in the `docker` group).

| Service | Image | Host binding | mem_limit | Notes |
|---|---|---|---|---|
| `api` | built from `server/Dockerfile` | `127.0.0.1:7000 -> 3000` | 384m | `restart: unless-stopped`, healthcheck `/healthz`, `depends_on` db healthy |
| `db` | `postgres:16-alpine` | `127.0.0.1:7001 -> 5432` | 512m | named volume `dog-territory_pgdata`, `shared_buffers=128MB`, `max_connections=20`; host port only for the owner's `psql` via ssh tunnel |
| `tailscale` | `tailscale/tailscale` | none | 128m | `TS_HOSTNAME=dog-territory`, `TS_USERSPACE=true` (no `/dev/net/tun`, no extra capabilities, no sudo), `TS_STATE_DIR` on a named volume, `TS_AUTHKEY` from `.env`, `TS_SERVE_CONFIG` pointing at a mounted `serve.json` |

Total `mem_limit` = 1024 MiB, half the shared 2 GiB budget, leaving room for a one-off migration or restore job. The container network is the project's own default network (`dog-territory_default`); nothing joins `litellm-stack_default`.
`serve.json` serves HTTPS 443 of the sidecar node and proxies `/` to `http://api:3000` (using `${TS_CERT_DOMAIN}`), with NO `AllowFunnel` entry. Resulting URL: `https://your-server.example.com`. This is a different Tailscale node than the host's, so the forbidden operations on the host node (reset, port 443/8443 changes) are never touched.
**No Funnel, API never public.** Both phones reach the node through the Tailscale app (Android: owner's tailnet; iPhone: the node shared to her account, open question 3). The ATS requirement on iOS is satisfied because serve terminates real HTTPS. The cost is that her iPhone needs the VPN toggle on to sync; the app is offline-first so a forgotten toggle only delays sync. Funnel is the documented fallback only if the Tailscale app on the iPhone proves unworkable, and it then requires the Authorization seam to be hardened first (rate limits are already in; add the `ADMIN_TOKEN`-gated household creation unchanged).
Backups: `ops/backup.sh` runs `docker compose exec -T db pg_dump` piped to gzip into `~/dog-territory/backups/dtd-<timestamp>.sql.gz`, deletes files older than 14 days inside that folder only, and never touches `/srv/backups`. Cron line (appended, never replacing the crontab; 06:30 is outside the forbidden 02:00-06:00 window):
`30 6 * * * $HOME/dog-territory/ops/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory`
Secrets: `~/dog-territory/.env` mode 600 (`POSTGRES_PASSWORD`, `DATABASE_URL`, `ADMIN_TOKEN`, `TS_AUTHKEY`); `.env.example` without values is in the repo; `.env` is already git-ignored.

### Owner runbook (the owner runs these; the agent only prepares the files)

Pre-flight (read-only, per SERVER.md):
```
ssh user@home-server
ss -tln | grep -E ':700[0-9]'          # must print nothing
docker ps --format '{{.Names}}\t{{.Ports}}'
free -h; df -h /
```
First SERVER.md entry (before starting anything), paste into the Belegungstabelle and the port table:
```
| Dog Territory Defender (Multiplayer-Test) | `~/dog-territory` | `dog-territory` | 127.0.0.1:7000 (api), 127.0.0.1:7001 (db) | Tailscale-Sidecar `your-server.example.com:443`, nur Tailnet (kein Funnel) | 06:30 pg_dump (`# dog-territory`) | `~/dog-territory/backups` (14 Tage) | 1 GiB (api 384m, db 512m, tailscale 128m) |
```
and in "Belegte Ports": `| 7000 | dog-territory API | Dog Territory |` and `| 7001 | dog-territory PostgreSQL | Dog Territory |`.
Deploy (on the Mac run the bundle script from task 7.1, which assembles `dist/dog-territory-bundle/` = deploy files + the Docker build context; then rsync it and continue on the server):
```
bash server/deploy/home/make-bundle.sh
rsync -av dist/dog-territory-bundle/ user@home-server:dog-territory/   # compose, serve.json, ops/, .env.example, server/ + allowlisted src/
ssh user@home-server
cd ~/dog-territory && cp .env.example .env && chmod 600 .env && nano .env      # fill secrets; TS_AUTHKEY from the Tailscale admin console (reusable off, tag optional)
docker compose up -d --build
docker compose ps && curl -s http://127.0.0.1:7000/healthz
docker compose logs tailscale | tail -n 20                 # node joined as dog-territory
chmod +x ops/backup.sh && ./ops/backup.sh && ls backups
(crontab -l; echo '30 6 * * * $HOME/dog-territory/ops/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory') | crontab -
curl -s https://your-server.example.com/healthz   # from a device in the tailnet
```
The image is built on the server from the rsynced source copy. Heavy builds: not between 02:00 and 06:00. Update later: re-rsync, `docker compose up -d --build`, then `docker image prune -f`. Stop only this project: `docker compose down` inside `~/dog-territory`.

## Decision 15 — iPhone path

Android: existing `npm run apk` / EAS preview. iPhone: add an `ios` preview profile to `eas.json` (internal distribution) only if the owner takes the paid Apple account; otherwise build from the Mac with Xcode (`npx expo run:ios --device`, free personal team, 7-day re-install). Both need `app.json` iOS location usage strings and `UIBackgroundModes: ["location"]` reviewed (task 6.2). The Tailscale iOS app must be installed and logged in before the first join. No new native dependency is added by this change, so no extra dev-client rebuild beyond the iOS build itself.

## Risks / Trade-offs

- **Server RAM**: the host has 7.1 GiB, TGA uses about 3 GiB and swap is already in use. 1 GiB of hard limits is safe for us, but the host can still be slow; Postgres gets a small `shared_buffers`. Mitigation: limits in compose, Beszel shows the containers, and the app is offline-first so server slowness is invisible to gameplay.
- **Home server is a single point of failure** (power, router, Docker restart). Acceptable for a test; daily dump plus portability is the exit.
- **Reward divergence** between the local estimate and the server number (Decision 1). Mitigation: server number wins quietly; fixtures prove identical results for in-order single-device play.
- **Phone clocks**: handled by `serverTime`/offset and walk-time bounds; the day boundary comes from the household timezone on the server.
- **GPS privacy**: Decision 12.
- **Shared-code coupling** (server imports app files): contained by an allowlist and a purity test; the alternative (copy) would drift.
- **iOS background location is unverified** and the iPhone is a first-time platform: the largest schedule risk is the iOS build, not the backend.
- **Token at rest unencrypted** on the phone: accepted for the test, revisit with `expo-secure-store` before public release.
- **Territory names** depend on the walking device's reverse geocode; if it fails the server uses the existing fallback ("Buddy's New Range").

## Decisions log

- 2026-10-18: v1 = household co-op, server-authoritative economy, append-only walks, day-set cell merge; Fastify + Drizzle + Postgres 16; long-poll; `server/` folder, contract in `src/sync/apiContract.ts`; Tailscale sidecar without Funnel.
