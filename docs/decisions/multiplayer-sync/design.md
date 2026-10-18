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
Track B (Decisions 17-24) adds simulated neighbour dogs ("Nachbarhunde", bots) as a second milestone; they are NOT other real households and add no real cross-household data flow.

**Owner decisions of 2026-10-18 that supersede earlier text in this change** (also in the Decisions log): iOS install path deferred and owner-owned; phones do NOT use Tailscale, the API is public through Tailscale Funnel on the project's own sidecar node (Decision 16, which replaces the former "no Funnel" stance in Decision 14); personal stats and achievements stay local per player in v1.

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

- Households are created by an **operator CLI on the server** (`server/ops/create-household`, run via `docker compose exec api` over ssh), which creates the household and its first invite code. There is NO network endpoint and NO admin token on any HTTP surface (changed by Decision 16: with a public endpoint, a remotely reachable admin secret is pure risk). The owner's phone joins with that first invite like everyone else and, as the household's first member, may run the one-time founding import.
- `POST /v1/join {code, playerName, deviceLabel}` consumes a single-use invite (8 chars from an unambiguous alphabet, expires after 24 h) and returns a new player + device token. Household size limit from env `HOUSEHOLD_MAX_PLAYERS` (default 4).
- Tokens: 32 random bytes, base64url; only a SHA-256 hash is stored (`devices.token_hash`). Revocable per device (`revoked_at`). Sent as `Authorization: Bearer`.
- Seam: a single `Authenticator` interface (`request -> {householdId, playerId, deviceId} | null`) is the only thing routes call. A later identity provider (OIDC/Sign in with Apple) replaces the implementation and adds an `identities` table; routes, commands and tables do not change. Do not add email/password tables now.
- Invite codes, rate limits, ban list and all other exposure hardening: see Decision 16.

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

## Decision 11 — `GET /v1/nearby`: empty in M1, simulated neighbour dogs in Track B

`GET /v1/nearby?radiusM=` is authenticated. Item shape (fixed in M1 so Track B adds no breaking change): `{ id (opaque), kind: 'bot', dogName, appearance, traitKey, areaLabel (coarse), lastActiveBucket, metCount, rangeCells? }`. `kind` is always `'bot'` in this change: the endpoint NEVER returns a real household and the contract has no field that could carry real coordinates (`rangeCells` exists only for synthetic Ranges). In M1 the list is always `[]` and the app calls nothing and renders nothing (no empty state). In Track B (Decision 17+) it returns the household's own six generated neighbour dogs (those already introduced), with `rangeCells` when `include=cells` is passed. `households.discoverable` still defaults to false and nothing sets it. Real neighbours remain a future OpenSpec change; the 100 m start fuzz, coarse-area rounding and claim/defend language rules from `game-backlog` apply to it (Decision 12).

## Decision 12 — Privacy and GDPR (2-person test)

- Inside a household, members see each other's full routes (they live together; the product is shared by design). The join screen states plainly what is shared, once, and requires a tap (consent record: `players.consented_at`).
- Anything that will ever cross a household boundary (nearby, events to neighbours) must be derived from data with the 100 m start-point fuzz applied: drop the first-cell neighbourhood within 100 m of the walk start, no raw coordinates, areas rounded coarsely. v1 exposes none of it, and a spec requirement forbids adding a cross-household field without that fuzz.
- Data minimisation: no email, no phone number, no advertising ids; display name and device label only. Server logs never contain coordinates or tokens (pino redaction list). Access logs DO contain client IPs (Decision 16) with about 14 days retention; the privacy note must say so. Track B sends a coarse, grid-aligned map-tile request to a public OSM Overpass server (Decision 18), which reveals the household's approximate area to that third party; also to be named in the privacy note.
- Erasure: `DELETE /v1/me` (player leaves, their device tokens revoked, display name anonymised, walks kept for the household unless they also ask for deletion) and `DELETE /v1/household` (hard delete of all rows). Both are covered by tests and by a `server/README.md` section.
- Hosting at home (Germany) keeps data in the EU. Before ANY non-test user: privacy policy, processor agreements with the chosen cloud host, a short DPIA (continuous location data), and a legal check. This design is engineering guidance, not legal advice.

## Decision 13 — Cloud portability (12-factor)

- Config only through env: `DATABASE_URL`, `PORT`, `READY_PORT` (internal readiness listener), `LOG_LEVEL`, `HOUSEHOLD_MAX_PLAYERS`, `NODE_ENV`, `TRUST_PROXY_CIDR`, plus Track B: `NEIGHBOURS_ENABLED`, `OVERPASS_URL`. No file paths, no host names in code.
- Stateless API (no in-memory sessions; long-poll waiters are per request); Postgres is the only state. No object storage needed (routes are JSON in Postgres; a 1 h walk is roughly 150 KB).
- One OCI image (`node:22-alpine`, non-root, `--max-old-space-size=256`), no vendor SDKs. The same image runs on Fly.io, Render, Hetzner (compose or Coolify) with a managed or sidecar Postgres. Moving = restore a `pg_dump` into the new database, set `DATABASE_URL`, change the server URL in the app (a Settings value, so no app rebuild; the household join flow re-pairs devices if tokens must change).
- `GET /healthz` (process up, no DB) and `GET /readyz` (DB ping) for container and platform health checks. Structured JSON logs to stdout; the platform collects them.
- Home-specific parts are isolated in `server/deploy/home/` (compose, serve config, backup script) and not referenced by code.

## Decision 14 — Home server deployment (binding rules from `heimserver-SERVER.md`)

Folder `~/dog-territory/`, compose project name `dog-territory` (`name:` in the compose file), no `sudo` anywhere (the owner is in the `docker` group).

| Service | Image | Host binding | mem_limit | Notes |
|---|---|---|---|---|
| `api` | built from `server/Dockerfile` | `127.0.0.1:7000 -> 3000` | 384m (512m if the Track B street-graph job needs it; still inside the 2 GiB budget) | `restart: unless-stopped`, healthcheck `/healthz`, `depends_on` db healthy |
| `db` | `postgres:16-alpine` | `127.0.0.1:7001 -> 5432` | 512m | named volume `dog-territory_pgdata`, `shared_buffers=128MB`, `max_connections=20`; host port only for the owner's `psql` via ssh tunnel |
| `tailscale` | `tailscale/tailscale` | none | 128m | `TS_HOSTNAME=dog-territory`, `TS_USERSPACE=true` (no `/dev/net/tun`, no extra capabilities, no sudo), `TS_STATE_DIR` on a named volume, `TS_AUTHKEY` from `.env`, `TS_SERVE_CONFIG` pointing at a mounted `serve.json` (with AllowFunnel) |

Total `mem_limit` = 1024 MiB (1152 MiB with the larger api limit), at most about half of the shared 2 GiB budget, leaving room for a one-off migration or restore job. The container network is the project's own default network (`dog-territory_default`); nothing joins `litellm-stack_default`.
`serve.json` serves HTTPS 443 of the sidecar node, proxies `/` to `http://api:3000` (using `${TS_CERT_DOMAIN}`) and **sets `AllowFunnel` for `${TS_CERT_DOMAIN}:443`** (Decision 16). Resulting public URL: `https://your-server.example.com`. This is a different Tailscale node than the host's (SERVER.md rule 3a), so the host node's 443/8443 serve and Funnel config (TGA) are never touched, and the forbidden host-node operations (reset, port 443/8443 changes) are never needed. The compose service additionally sets `cap_drop: [ALL]`, `read_only: true` (tmpfs for `/tmp`), `pids_limit`, and `cpus` for `api`, because the service is now reachable from the internet and shares the machine with TGA. The container healthcheck and the operator use the internal readiness listener (Decision 16), not the public proxy path.
Backups: `ops/backup.sh` runs `docker compose exec -T db pg_dump` piped to gzip into `~/dog-territory/backups/dtd-<timestamp>.sql.gz`, deletes files older than 14 days inside that folder only, and never touches `/srv/backups`. Cron line (appended, never replacing the crontab; 06:30 is outside the forbidden 02:00-06:00 window):
`30 6 * * * $HOME/dog-territory/ops/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory`
Secrets: `~/dog-territory/.env` mode 600 (`POSTGRES_PASSWORD`, `DATABASE_URL`, `TS_AUTHKEY`; no admin token exists, Decision 7/16); `.env.example` without values is in the repo; `.env` is already git-ignored.

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
| Dog Territory Defender (Multiplayer-Test) | `~/dog-territory` | `dog-territory` | 127.0.0.1:7000 (api), 127.0.0.1:7001 (db) | Tailscale-Sidecar `your-server.example.com:443`, **Funnel öffentlich** (nur dieser eigene Knoten; Host-Knoten und dessen 443 unberührt) | 06:30 pg_dump (`# dog-territory`) | `~/dog-territory/backups` (14 Tage) | 1 GiB (api 384m, db 512m, tailscale 128m) |
```
and in "Belegte Ports": `| 7000 | dog-territory API | Dog Territory |` and `| 7001 | dog-territory PostgreSQL | Dog Territory |`.
Deploy (on the Mac run the bundle script from task 7.1, which assembles `dist/dog-territory-bundle/` = deploy files + the Docker build context; then rsync it and continue on the server):
```
bash server/deploy/home/make-bundle.sh
rsync -av dist/dog-territory-bundle/ user@home-server:dog-territory/   # compose, serve.json, ops/, .env.example, server/ + allowlisted src/
ssh user@home-server
cd ~/dog-territory && cp .env.example .env && chmod 600 .env && nano .env      # fill secrets; TS_AUTHKEY from the Tailscale admin console (reusable off, tag optional; Funnel must be allowed for that node in the tailnet policy: HTTPS certificates enabled and the `funnel` node attribute)
docker compose up -d --build
docker compose ps && curl -s http://127.0.0.1:7000/healthz
docker compose logs tailscale | tail -n 20                 # node joined as dog-territory, Funnel on
docker compose exec api node dist/ops/create-household.js    # prints the first invite code (Decision 7)
chmod +x ops/backup.sh && ./ops/backup.sh && ls backups
(crontab -l; echo '30 6 * * * $HOME/dog-territory/ops/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory') | crontab -
curl -s https://your-server.example.com/healthz   # from anywhere, e.g. a phone on mobile data without Tailscale
```
The image is built on the server from the rsynced source copy. Heavy builds: not between 02:00 and 06:00. Update later: re-rsync, `docker compose up -d --build`, then `docker image prune -f`. Stop only this project: `docker compose down` inside `~/dog-territory`.

## Decision 15 — iPhone path (deferred, owner-owned)

Owner decision 2026-10-18: the iOS install path is deferred and handled by the owner later. The tasks stay in `tasks.md` marked "owner-owned"; no agent work depends on them and the backend, the app sync core and Track B are developed and verified on Android (plus a second Android install, an emulator, or GPX routes as the second client). The facts for when the owner picks it up: Android uses the existing `npm run apk` / EAS preview. iPhone needs either `eas.json` iOS `preview` profile (paid Apple account, UDID) or an Xcode build from the Mac (`npx expo run:ios --device`, free personal team, 7-day re-install); `app.json` iOS location usage strings and `UIBackgroundModes: ["location"]` are unreviewed and iOS background location is untested (walking with the screen on is the fallback). The Tailscale iOS app is NOT needed any more (Decision 16): iOS ATS is satisfied by the Funnel's real HTTPS certificate. No new native dependency is added by this change.

## Decision 16 — Public exposure via Tailscale Funnel, and the hardening that comes with it

Owner decision 2026-10-18: no Tailscale on the phones. The API is public through **Tailscale Funnel on the project's own sidecar node** (`your-server.example.com:443`, SERVER.md rule 3a). TLS terminates at the sidecar. This reverses the earlier "API never public" stance; everything below exists because of that reversal. A 2-person test is a small target, but the hostname is in certificate-transparency logs and will be scanned within hours, so the server must be safe to be found.

Rules (each is a spec scenario in `specs/multiplayer-sync/spec.md`, "Hardened public exposure"):

| Area | Rule |
|---|---|
| Unauthenticated surface | Exactly two routes: `GET /healthz` and `POST /v1/join`. A global `onRequest` hook answers **401 for everything else without a valid token, including unknown paths** (no route enumeration, no 404 oracle). No static files, no directory listing, no docs/swagger route in production. |
| Health | `/healthz` returns a fixed minimal body (`{"ok":true}`), no version, no dependency state. Readiness (`/readyz`, DB ping) is served on a **second internal listener** (not proxied by `serve.json`, no host port); the container healthcheck and the operator use that one. |
| Tokens | Device bearer tokens: 32 random bytes (base64url, optional `dtd_` prefix so secret scanners recognise leaks), only SHA-256 stored (`devices.token_hash`), constant uniform 401 body for missing/unknown/revoked. Rotation = revoke + re-join via the operator CLI. |
| Invite codes | Single-use, 24 h expiry, hashed at rest, 8 chars of an unambiguous alphabet. Join rate limit: **5/min per IP and 20/day per IP**, counting failures and successes; a global ceiling (100 join attempts/hour, env-tunable) caps distributed guessing. Refusals never reveal whether a code existed. |
| Global rate limit | Per token: 120 requests/min (one long-poll counts once); unauthenticated requests: 30/min per IP, applied BEFORE any DB lookup. 429 with `Retry-After`. |
| Repeated 401s | A `banned_ips(ip, until, reason, strikes)` table in Postgres (survives restarts, in-process cache in front): 10 failed auths in 10 min = 1 h ban, doubling per repeat up to 24 h. Not fail2ban (no OS-level changes, SERVER.md rule 9). The sidecar's own IP is never bannable (guards the case that the proxy does not forward the client IP). |
| Client IP | Fastify `trustProxy` is set only for the sidecar's container network. First deploy must verify that the sidecar forwards a usable `X-Forwarded-For` for Funnel traffic; if it does not, per-IP limits degrade to the global limits and this is recorded in the Decisions log. |
| Body and content | Default `bodyLimit` 64 KiB; explicit larger limits only for `walk.finish` and the founding import (order of 1-2 MiB and 5 MiB; a 1 h walk is about 150 KB). `Content-Type: application/json` only (415 otherwise; no form/text parsers registered). TypeBox validation on every route, unknown properties rejected, array/route-point maximums in the schemas. |
| Headers | `@fastify/helmet` (or an equivalent hook) with API settings: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, HSTS, `Content-Security-Policy: default-src 'none'`, no `X-Powered-By`/server banner. |
| CORS | Off. `@fastify/cors` is not installed; the only client is the native app, which does not enforce CORS. Browsers get no cross-origin access. |
| Logging | Structured access log on stdout with: time, IP, method, **route template** (never raw URL/query), status, latency, device id (never the token), request id. Redaction as in Decision 12 (tokens, invite codes, coordinates). Docker log driver `max-size`/`max-file` caps the log at about 14 days. An IP is personal data: retention and purpose go into the privacy note (Decision 12). |
| Write caps | Per household: at most 200 state-changing commands/day and 50 walks/day (schema/config values), so a stolen token cannot fill the disk. |
| Admin | No admin token on any HTTP surface (Decision 7). Household creation, device revocation and household erasure are operator CLI commands over ssh. |
| TLS | Terminated by the sidecar (Funnel certificate). The api listens plain HTTP on the private compose network only. |

**Residual risk for a 2-person public test, stated plainly.** (1) The service is internet-reachable: a framework or validation bug could be exploited before we notice. Mitigations: two unauthenticated routes, strict schemas, non-root read-only container, `cap_drop ALL`, memory/CPU/pids limits, tenant-isolation tests, dependency updates before each deploy. (2) A stolen device token (it is stored unencrypted on the phone, Decision 9) exposes that household's GPS history; mitigation: operator revokes the device, the owner re-invites; `expo-secure-store` before any wider release. (3) Denial of service could starve TGA on the shared 7 GiB host; mitigation: hard limits above, rate limits, and the **kill switch**: `docker compose stop api` or removing `AllowFunnel` from `serve.json` and restarting the sidecar (all inside this project; `tailscale funnel reset` is allowed only inside the sidecar container, never on the host). The app is offline-first, so switching the server off only delays sync. (4) Brute-forcing an invite code is bounded by the rate limits and 24 h life. (5) IP addresses in logs: 14-day retention. The "admin token only on the owner's Mac" intent is met more strongly by having none: admin power equals ssh access to the server. If a secret leaks (ssh key, `.env`): rotate `POSTGRES_PASSWORD` and `TS_AUTHKEY`, revoke all devices via CLI, re-invite.

## Track B: Nachbarhunde (simulated neighbour dogs)

Source of truth for the game rules is the binding `game-master` design of 2026-10-18 (six dogs, caps, copy, never-rules). This part records the engineering decisions and the numbers that tuning will touch. Player-facing requirements are in `specs/neighbour-dogs/spec.md`. Track B starts after M1 (walk ingestion and the event feed must work); gift opening needs the Den commands (section 5). It is behind the env switch `NEIGHBOURS_ENABLED` (default on in the home deployment; off = `nearby` returns `[]`, scheduler idle, app renders nothing).

## Decision 17 — Bots are ordinary households flagged `is_bot`, generated per real household

Reuse beats a parallel model: walks, `cells`, `cell_days` and `dogs` already key on `household_id`, and the Range merge, grid painting and soft-overlap code stay shared. So a bot is a `households` row with `is_bot = true`, one `dogs` row (name and `appearance` from our enums: coats, markings, ears, tails, sizes in `src/buddy/buddyAppearance.ts`), no `players`, no `devices` (nobody can authenticate as a bot household). The brief's "bot_dogs" is therefore just those `dogs` rows, not a new table.

New or extended tables (Drizzle migration in Track B; all keep the `household_id` tenant key):

| Table | Key columns / change |
|---|---|
| `households` | `+ is_bot bool default false` |
| `bot_profiles` | `bot_household_id` PK, `host_household_id` (the real household this neighbour belongs to), `archetype` (momo, pfote, bruno, keks, lotte, nebel), `seed`, `home_lat`, `home_lng` (synthetic home node), `introduced_at`, `met_count`, `exclusive_gift_sent_at`; unique `(host_household_id, archetype)` |
| `bot_schedules` | `id`, `bot_household_id`, `day` (host timezone date), `slot`, `planned_start`, `target_m`, `walk_id` null, `generator` (`osm`/`offset`), `status` (`planned`/`done`/`skipped`); unique `(bot_household_id, day, slot)` |
| `walks` | `+ generated bool default false`; `player_id` becomes nullable (bot walks have no player) |
| `cells` | `+ generated bool default false` (redundant with `households.is_bot` on purpose: every human-facing query adds `NOT generated` as a second guard, and a test pins that human snapshots never contain a generated row) |
| `street_tiles` | `tile_id` PK (coarse global grid), `fetched_at`, `graph bytea` (gzip, simplified), `status` |
| `neighbour_events` | `id`, `host_household_id`, `bot_household_id`, `kind`, `line_key`, `params jsonb`, `due_at`, `emitted_seq` null; the plan that the scheduler emits into `events` when due |
| `gifts` | `id`, `host_household_id`, `bot_household_id`, `cosmetic_id` null, `sprinkle_treats` int null, `created_at`, `opened_at`, `opened_by_player_id` |
| `coop_weeks` | `(host_household_id, week_start)` PK, `goal_km`, `bot_km`, `human_km`, `carried_km`, `completed_at`, `reward_id` |

Bots are created on the host household's **first accepted tracked walk** (not at join: a bot needs a Range edge and a home anchor), inside the same transaction family as that walk's ingestion hook, idempotently (unique key above). Seed = stable hash of `(host_household_id, archetype)`; the day plan seed adds the local date. Because generation happens once, on the server, both phones see the same neighbours; determinism additionally makes the generator testable. All six rows exist from the start; the 4-week escalation (Decision 19) only controls which are active.

Host household's "home anchor": the start point of its first walk, replaced by the median of walk start points after 5 walks (server-side only, never sent anywhere, never shown). Home block = nodes within `HOME_BLOCK_RADIUS_M` (150 m, config) of the anchor.

Bot appearance mapping to the enums (verified against `buddyAppearance.ts`): Momo cream/floppy/curly; Pfote golden/floppy/straight; Bruno ginger/folded/stubby (no "brindle" exists, ginger stands in); Keks white + `patch`/pointy/straight; Lotte chocolate/floppy/straight; Nebel grey/pointy/curly. **Gap found:** the design says Nebel has a "star marking" but `BUDDY_MARKINGS` is `none/patch/socks/mask`; use `mask` as placeholder, and treat a `star` marking as an optional Tier B art task (it touches the enum, art slots and the contract schema). Sizes are a free choice (suggested: Keks small, Lotte small, Bruno large, Pfote large, Momo and Nebel medium).

Archetype data (name, appearance, walk slots and lengths, quirk, intro week, line keys) lives in one file, `server/src/neighbours/archetypes.ts`; tunable numbers (caps, fractions, radii, coop sizes) live in `src/economy/neighbourConfig.ts`, a new pure file on the shared allowlist, because they are balance numbers (CLAUDE.md: tunables in `src/economy`) and the purity test then covers them.

## Decision 18 — Street graph and walk generation

**Routing engines rejected.** OSRM and Valhalla need a regional OSM extract (Germany is several GB), a multi-GB build step and a resident service, on a 7.1 GiB host where TGA already uses about 3 GiB and swap is in use. They also answer point-to-point routes, not plausible loops. Too heavy for the budget.

**Chosen: fetch OSM ways from Overpass, cache in Postgres, route ourselves.**
- Walkable ways only (`highway` = footway, path, pedestrian, living_street, residential, service, track, cycleway, steps excluded), no motorways/trunks.
- Fetch in **tiles on a coarse global grid** (about 2 km), not per exact bounding box, for three reasons: the request reveals only a coarse area to the third party (Decision 12), tiles overlap-share across households, and each response stays small. The Range's bounding box plus a 4.5 km margin (3 km farthest bot home plus loop reach) is covered by the needed tiles, fetched sequentially with a pause, `User-Agent` set, 429/504 backoff, a response-size cap per tile, `OVERPASS_URL` in env (so a mirror can be swapped in). Fetch is a background job never run between 02:00 and 06:00 (SERVER.md rule 5) and never concurrently with another fetch.
- Each tile is simplified (junction/endpoint nodes only, polylines simplified to about 5 m) and stored gzip-compressed in `street_tiles`. Hard caps: stored tile at most about 2 MB, parse happens one tile at a time so the 256 MiB old-space limit holds; if that proves too tight the api `mem_limit` goes to 512m (Decision 14).
- ODbL: the app map already shows OSM attribution; the cache is internal and is never exported.

**Generator** (pure function of `(graph, archetype, seed, constraints)`, in `server/src/neighbours/`):
- Remove graph nodes inside the home block before routing, so no route passes through it by construction. A bot home node is picked once, 0.5 to 3 km (archetype band) from the nearest Range cell, outside the home block; saved in `bot_profiles`.
- A slot is a loop from the bot's home: non-backtracking random walk with a penalty on already-used edges for about half the length budget, then shortest path back preferring unused edges; accepted when its length is within +-20 % of the slot target, otherwise retried a bounded number of times, otherwise the slot is `skipped` (a missing walk is invisible; a bad one is not). Keks: three short dashes; Nebel: sometimes a loop around one node; Lotte slow.
- Route is resampled to about 10 m spacing with timestamps from a per-archetype speed; start time = slot time +- 20 min jitter, weekends later (config), drawn from the day seed.
- Reaction walks (Decision 19) are the same generator with a required via-node near the new ground.
- The result is stored as an ordinary `walks` row (`generated = true`, `player_id` null, `reward` null) and painted with the **same shared grid/painting function** the human pipeline uses, into the bot household's `cells`/`cell_days`. It never goes through `walk.finish`: no treats, no Den, no Territories (bot cells have `territory_id` null).
- **Fallback when Overpass or the cache is unavailable:** "jittered offset copies of the household's own routes": take one of the host's last 10 walks, translate it by 300 to 1500 m with a seeded rotation and jitter, drop points inside the home block, require a minimum remaining length. Stored with `generator = 'offset'` so the quality is visible in tests and logs. It is a degraded mode, not a second feature; once tiles arrive, new walks use `osm` and old ones stay.
- Materialisation: the daily plan decides slots and events, but a walk is only written (route generated, cells painted) at its end time via a 15-minute tick, so a bot's Range never grows ahead of the clock.

## Decision 19 — Scheduler, events, caps and escalation

- **Scheduler:** Node-side, in the `api` process (`node-cron` or a plain `setInterval` with a Postgres advisory lock; implementer's choice, document it); no OS cron (SERVER.md rule 8 stays untouched). Jobs: daily planning at 06:15 per host timezone, 15-minute tick that materialises due walks and emits due `neighbour_events` into `events`, an hourly graph-fetch queue. All jobs are idempotent (unique keys above), take the advisory lock so a second instance cannot double-run, and on start catch up the last 2 days. One job at a time to respect the RAM limit.
- **Events are planned, then emitted:** `neighbour_events` rows carry `due_at`; at `due_at` the tick appends a `neighbour.event` (or `gift.available`, `coop.updated`) row to the existing `events` table, so clients get them through the normal cursor feed, with the cursor order equal to visibility order. The server sends `line_key` + params, never copy; the 12 lines live in the app's i18n (de/en), see Decision 22.
- **Caps** (checked at plan time against the host's emitted and planned rows, in `neighbourConfig.ts`): at most 2 neighbour events per local day (gift and invitation events count), 1 gift per day, 1 invitation per ISO week, at most 3 reactions per week, a given `line_key` not repeated within 10 days. Average target is about one event per day, not two. The Doorstep shows at most one neighbour line per launch and ranks it below the partner line and personal lines inside the existing 0-3 cap (game-master to confirm, task B0.1).
- **Escalation** by weeks since the bots' `introduced_at`: W1 Momo and Pfote; W2 Bruno and the first invitation; W3 Keks and Lotte and the first Viertel-Runde; W4 Nebel and the first weird event (Nebel's moon line; the sock line at most monthly); afterwards the pool rotates. Inactive bots exist but plan no walks, events or gifts.
- **Reactions:** on each accepted human walk with new ground, a deterministic hash of the walk id selects about 1 in 3 (config), subject to the weekly cap of 3; the planner schedules a reaction walk within 24 h that visits the new ground (not inside the home block) and leaves paw prints on those cells (list in the event params; the map shows small paw marks, presentation only). Line 6.
- **Invitations:** "Bruno goes at 18:00 along the canal" is a Doorstep line with `params.at`; no push exists in this change, so there is no ping and no reminder. Tapping "coming along" posts an accept command; if the household then finishes a walk starting within -30/+60 minutes of the time, a cosmetic photo moment (Walk Portrait sticker "with Bruno") is granted and the next morning shows line 10. No location check, no penalty, no consequence for not going.
- **Meeting count:** a "meeting" = a distinct day on which an event of that bot was emitted to the household (no client acknowledgement protocol). At 3 meetings the exclusive cosmetic (Pfote: stick, Lotte: bench cushion) is queued as that day's gift.

## Decision 20 — Gifts inside the anti-snowball rules

A gift is `{cosmetic?, sprinkle_treats?}` created together with its event line (lines 2 and 8); at most one gift per day per household. Cosmetics come from a finite catalog (collars, stick props, yard doodads); once a household owns everything, gifts degrade to sprinkle-only or none, so there is no flood. **Gap found:** the app has no cosmetic inventory today (no collar or cosmetic store exists in `src/`); owned cosmetics are derived from the household's opened gifts in the snapshot, with art through `artOr()` and a glyph fallback, so no new local repository is required beyond a cache.

Treat sprinkle: `SPRINKLE_FRACTION` = 5 % (config) of the household's average treats per walk over its last 14 non-deleted human walks (none yet = no sprinkle; at least 1 treat when the average allows it). It is credited at **open time** through an idempotent command (`gift.open`, first opener wins), directly into `den_state.treats` and NOT through the reward formulas: therefore no Beginner's Luck 2x, no building/Pack multipliers, no bloom. It is income proportional to the household's own walking (so it does not widen the veteran-newcomer ratio) and not a capped percentage bonus, so it sits outside the +30% power budget (new anti-snowball delta, `specs/anti-snowball/spec.md`). Gifts never expire, are opened by tap, and trigger no reminder. The 5 % is a new balance number: logged here (CLAUDE.md Tier A rule) and to be confirmed by game-master (task B0.1).

## Decision 21 — Viertel-Runde (weekly co-op goal)

Server-computed, per host household and ISO week in the household timezone, first one in W3. Progress = human km (sum of the household's non-deleted tracked walks of the week, haversine on the stored route; manual logs excluded) + bot km (km of materialised bot walks of the week). Goal `G = B + P`: `B` = planned bot km of the week (known at Monday planning, capped at 60 % of `G`), `P` = the human share needed = `max(COOP_MIN_PLAYER_KM, 0.6 x median of the household's last 4 weekly human km)`, capped at `COOP_MAX_PLAYER_KM` (placeholders 4 and 12 km, game-master to tune). So the goal is reachable solo at low effort, bots visibly contribute, and the household's walking decides by a margin of at least 40 % of the goal. There is no loss state: if the week ends short, the household's human km (up to 50 % of next week's `P`) carries over as a head start. Reward on completion: a yard decoration id (flower beds first, per line 7) recorded in `coop_weeks.reward_id`, returned as `yardDecorations` in the snapshot and shown by the Den yard; granted to the household only (bots receive nothing). The API exposes progress as a single ratio plus total km, deliberately no human-vs-bot split (no comparison numbers).

## Decision 22 — API, app and copy

Contract additions in `src/sync/apiContract.ts`: `GET /v1/nearby?radiusM&include=cells` (Decision 11 shape; radius default 5000, max 10000), `GET /v1/gifts`, `POST /v1/gifts/{id}/open` (carries `clientId`), `GET /v1/coop/week`, `POST /v1/invitations/{id}/accept` (carries `clientId`), plus event kinds `neighbour.event`, `gift.available`, `coop.updated`. `rangeCells` are synthetic cell indices only; bot routes are never sent. All routes are behind the Decision 16 auth rules.

App (Track A client, small slices): `src/neighbours/` holds the pure Doorstep-line resolver, the gift inbox model and the nearby cache; screens: Nachbarhunde list and profile card (dog drawn with the existing Buddy renderer from the bot's appearance; trait line; "met" progress as a plain state, no numbers compared; paw-robot badge and "simulated" wording on the card), a gift inbox entry on the Doorstep away strip (opened by tap, no counters that nag), and a co-op progress chip on the Den. Entry from the Doorstep neighbour line and from a row on the map overlay (implementer picks the existing navigation pattern). The paw-robot badge, collar/stick/cushion/doodad art and the flower-bed decoration come from Blender (`scripts/blender/`), Tier B.

i18n: the 12 lines get keys under `neighbours.line.*` in `src/i18n` (de + en, text exactly from the game-master design): `sniffCorner`, `stickLeft`, `mailboxLaps`, `benchRated`, `invitation`, `followedPath`, `coopDone`, `collarGift`, `wave`, `thanksCome`, `moonHello`, `sockLeft`; plus `neighbours.badge.*` (badge and "simulated" wording), `neighbours.dog.<archetype>.trait`, list/card/gift/co-op chip strings. Dog names are proper names, not translated.

## Decision 23 — Bot Ranges on the map, soft overlap

Bot Ranges draw as dotted pastel overlays through the existing Home Range renderer (`src/web/homeRangeRendererScript.ts`) using its muted-layer path, extended with a per-layer tint and a dotted outline. The renderer today has one flat muted tone (`HR_MUTED_HEX`); the extension is presentation (Tier B). Pastel tints must come from existing design tokens; if new colours are unavoidable, `visual-design/spec.md`'s token list is updated and the reason written here (CLAUDE.md tone rules). Overlap is soft by construction: the player's layer is drawn on top, bot cells are a separate dataset, and bot generation never writes to the host's `cells`; a test compares the host's cells before and after bot generation. Bots are never labelled on the map (the badge lives on the profile card); paw prints from reactions are small marks on the player's new ground.

## Decision 24 — Privacy and "never" rules for Track B

- Bot routes are synthetic and not tied to any person; only the cell indices of bot Ranges reach the client. Nothing about the real household is shown to bots, and no real household's data is shown to any other household (nothing cross-household exists in v1).
- Tile requests to Overpass are coarse and grid-aligned (Decision 18) and named in the privacy note.
- Never rules from the design, each a SHALL NOT in the neighbour-dogs spec: take or shrink territory, out-earn the player, appear on any human leaderboard, nag, repeat pings or say "you're behind", show comparison numbers, deceive about being bots. Bots also never create Territories and never touch `den_state`, except through an opened gift.
- Tone: claim/defend/protect vocabulary only; no battle words; Buddy anti-guilt rules apply to every line (no line ever refers to the player not walking).

## Risks / Trade-offs

- **Server RAM**: the host has 7.1 GiB, TGA uses about 3 GiB and swap is already in use. 1 GiB of hard limits is safe for us, but the host can still be slow; Postgres gets a small `shared_buffers`. Mitigation: limits in compose, Beszel shows the containers, and the app is offline-first so server slowness is invisible to gameplay.
- **Home server is a single point of failure** (power, router, Docker restart). Acceptable for a test; daily dump plus portability is the exit.
- **Reward divergence** between the local estimate and the server number (Decision 1). Mitigation: server number wins quietly; fixtures prove identical results for in-order single-device play.
- **Phone clocks**: handled by `serverTime`/offset and walk-time bounds; the day boundary comes from the household timezone on the server.
- **GPS privacy**: Decision 12.
- **Shared-code coupling** (server imports app files): contained by an allowlist and a purity test; the alternative (copy) would drift.
- **iOS background location is unverified** and the iPhone is a first-time platform: the largest schedule risk is the iOS build, not the backend. Deferred and owner-owned (Decision 15).
- **Public endpoint** (Decision 16): residual risk and kill switch are written down there.
- **Bots (Track B)**: Overpass availability and RAM for the street graph (Decision 18), and cosmetic/art dependencies (Decision 22). The feature is behind `NEIGHBOURS_ENABLED`, so it can be switched off without touching sync.
- **Token at rest unencrypted** on the phone: accepted for the test, revisit with `expo-secure-store` before public release.
- **Territory names** depend on the walking device's reverse geocode; if it fails the server uses the existing fallback ("Buddy's New Range").

## Decisions log

- 2026-10-18: v1 = household co-op, server-authoritative economy, append-only walks, day-set cell merge; Fastify + Drizzle + Postgres 16; long-poll; `server/` folder, contract in `src/sync/apiContract.ts`; Tailscale sidecar (initially planned without Funnel; superseded by the owner decision below).
- 2026-10-18 (owner): (a) iOS install path deferred, owner-owned; tasks kept and marked. (b) No Tailscale on phones; API public via Funnel on the project's own sidecar node `your-server.example.com:443`; hardening in Decision 16; households created by operator CLI, so no admin token over HTTP (a deliberate tightening of "admin token only on the owner's Mac"). Supersedes "Tailscale sidecar without Funnel" above. (c) Personal stats and achievements stay local per player in v1: confirmed.
- 2026-10-18: Track B "Nachbarhunde" (simulated neighbour dogs) added as a second milestone after M1; separate capability `neighbour-dogs`; guardrails from the binding game-master design. Decisions 17-24.
- 2026-10-18: M1 gap-closers. (1) `player.rename {name}` (1-24 chars, trimmed) updates the player and emits `member.updated`; Doorstep reads partner names from sync state, so a rename also fixes old walks. (2) Manual-log walks sync (`startSource: 'manual-log'`, no locations): same flat treats/XP via the shared formulas, nothing painted; the server enforces the household-wide quota (2 logs/day, 1 route refresh/day, `balanceConfig.freshGround`, counted by receive day, deleted logs still count; over quota = 422 `manual-log-quota`); an optional `refreshRouteWalkId` refreshes `lastRefreshed` of that tracked route's existing cells household-wide. (3) History delete enqueues `walk.delete`; the server soft-deletes and emits `walk.deleted`, the cells stay (the Range never shrinks). (4) `household.*` copy polished with game-master tone rules (no counts, no comparisons, no guilt).
