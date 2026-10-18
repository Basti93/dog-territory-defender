## How to read this

Four parallel tracks after section 1 freezes the contract: **S** = `server/`, **A** = `src/sync/` + repositories, **U** = UI, **D** = deploy. Gate for app work: `npm run check`; for server work: `npm test` inside `server/` plus `tsc --noEmit`. Each task names its track. Tasks in one section with no dependency note can run in parallel. The owner runs every ssh/compose/Apple/Tailscale step himself (section 7 prepares the files and the exact commands; agents do not touch the server).

**Milestone M1 "both phones see the same Home Range after one walk each"** = sections 0, 1, 2, 3, 4 (walk part only), 6.1, 7. **M2** = Den and territories in sync (section 5). **M3** = partner line on the Doorstep + nearby stub (6.2, 6.4, 2.7). **M4** = hardening and docs (section 8).

## 0. Pre-flight

- [ ] 0.1 (A, spike) Read `src/economy/denEconomy.ts`, `walkRewards.ts`, `milestones.ts`, `src/utils/territoryCluster.ts`, `manualWalkLog.ts`. Report exactly which functions the server needs (award walk, upgrade, passive tick, manual-log quota, territory resolve) and where `../i18n`/storage imports block reuse. Decide per design Decision 6: split message-producing code out of the transitions, or a server-side transition pinned by shared fixtures. Write the decision into `design.md` Decisions log.
- [ ] 0.2 (game-master pass) Bless the partner event copy (de/en), the "Lisa already upgraded the Bakery" rejection copy, the join consent text, and confirm the co-op invariants in Decision 4. Output goes into the Decisions log.
- [ ] 0.3 (owner) Answer open questions 1-3 in `proposal.md` (iOS path, personal stats, how she joins the Tailnet).
- [ ] 0.4 (S) Confirm with `ss -tln` output from the owner that 7000/7001 are free (runbook pre-flight), before section 7 is used.

## 1. Contract first (blocks A and S)

- [ ] 1.1 (A+S) `src/sync/apiContract.ts`: TypeBox schemas and inferred types for every endpoint: create/join household, import, snapshot, events (cursor + wait), commands (`walk.finish`, `walk.manualLog`, `den.upgrade`, `walk.delete`, `dog.update`), nearby, `DELETE /v1/me`, `DELETE /v1/household`, health. Every response carries `serverTime`. No React Native imports.
- [ ] 1.2 (A+S) JSON fixtures for each request/response (`src/sync/__fixtures__/`) and one test each side that validates fixtures against the schemas.
- [ ] 1.3 (A) `src/sync/__tests__/sharedPurity.test.ts`: allowlist from design Decision 6; fails on forbidden imports. Adjust code per spike 0.1 until green.

## 2. Server (track S)

- [ ] 2.1 `server/` scaffold: `package.json` (Node 22, ESM, strict TS), Fastify app factory, env config module (the only reader of `process.env`), pino with redaction (tokens, invite codes, coordinates), `/healthz`, `/readyz`, Vitest, throwaway-Postgres test helper.
- [ ] 2.2 Drizzle schema for all tables in design Decision 8 + generated SQL migrations committed in `server/drizzle/` + `migrate` entrypoint (runs before server start). Test: migrations apply to an empty DB twice (idempotent).
- [ ] 2.3 Auth: `Authenticator` interface, token implementation (hash at rest, revoke), `POST /v1/households` (admin token), `POST /v1/join`, invite generation/expiry/single-use, rate limit. Tests incl. tenant isolation.
- [ ] 2.4 Command pipeline: `command_log` idempotency wrapper, one transaction per command, `den_state` row lock, event append. Test: replay returns the stored result and writes nothing.
- [ ] 2.5 `walk.finish` / `walk.manualLog`: store walk, derive painted cells with shared `grid.ts`, `cell_days` insert-or-ignore, `visits` recompute, territory resolve with shared `territoryCluster`, reward via shared economy, Den update, events (`walk.added`, `cells.changed`, `territory.changed`, `den.updated`). Tests: the two street scenarios from the spec (same day = +1, different days offline = 2, any order), range never shrinks, time bounds (future/30-day).
- [ ] 2.6 `den.upgrade`, `walk.delete` (soft), `dog.update`, passive accrual on read, household-wide manual-log quota. Tests: two upgrades on one balance.
- [ ] 2.7 `GET /v1/snapshot`, `GET /v1/events?after&wait` (long-poll, 25 s cap, no busy loop; uses Postgres `LISTEN/NOTIFY` or a 1 s indexed poll; implementer's choice, document it), `GET /v1/nearby` (empty list in the final shape), `DELETE /v1/me`, `DELETE /v1/household`, `POST /v1/households/import` (once).
- [ ] 2.8 Parity test: a recorded sequence of walks run through the app's local pipeline and through the server yields identical treats/XP/level/cells (single device, in order).
- [ ] 2.9 `server/Dockerfile` (multi-stage, node:22-alpine, non-root, `--max-old-space-size=256`, context = repo root, copies only `server/` + allowlisted `src/`), `server/README.md` (run locally, env table, allowlist, endpoints, cloud-move steps, erasure). This README is the one new `.md`, justified because `server/` is a new top-level area; README.md and CLAUDE.md link to it.

## 3. App sync core (track A; needs 1.x, parallel to 2.x using fixtures)

- [ ] 3.1 Additive repository methods, each with in-memory twin and contract tests: `HomeRangeRepository.mergeCells(cells)` (max semantics, server `territoryId`), `TerritoryRepository.upsertTerritories(list)`, `WalkRepository` accepts remote walks (optional `playerId` on `Walk`/`StoredWalk`, `markSynced(id, at)`), `DenEconomyRepository` unchanged (reuse `saveState`) plus a stored `rev` for the sync layer.
- [ ] 3.2 `src/sync/SyncRepository.ts` (interface + sqlite + in-memory): outbox table, cursor, identity (server URL, device token, ids, player name, household id), `lastSyncedAt`. Guarded `ALTER`/`CREATE IF NOT EXISTS`, same pattern as other sqlite repositories.
- [ ] 3.3 `src/sync/apiClient.ts`: typed `fetch` wrapper (15 s timeout, bearer header, clock offset from `serverTime`), no new dependencies.
- [ ] 3.4 `src/sync/applyEvents.ts`: pure event-to-repository mapping, idempotent; partner walks never trigger rewards. Tests with fixtures, duplicate delivery, out-of-order cursor.
- [ ] 3.5 `src/sync/syncEngine.ts`: push oldest-first, then pull, backoff 5 s to 5 min, foreground-only loop with long-poll, `syncNow()`, snapshot bootstrap and re-bootstrap when the cursor is rejected. Tests with a fake api client including lost-response retry.
- [ ] 3.6 Wire in `src/app/repositories.ts` and start/stop on app foreground/background; enqueue from `finishTrackedWalk.ts` (after the local save, never blocking it), `useManualWalkLog.ts`, and Den upgrade. No sync identity = engine inert and zero behaviour change (test).
- [ ] 3.7 Founding import builder reusing `exportBackup` data (`backup.ts`) minus settings/feedback/notification/personal stats; test that the Backup file and the import payload never contain the device token.

## 4. M1 vertical slice: walks and Range (A + U + S)

- [ ] 4.1 (U) Settings: "Haushalt" card (not joined: "Haushalt gründen" with admin token field + "Beitreten" with invite code; joined: household/dog name, members, "Sync jetzt", last synced, "Einladungscode erzeugen", "Haushalt verlassen"). Server URL field with a "Test connection" button. All strings in `src/i18n` de + en. Tone per CLAUDE.md. Component tests with the in-memory repos.
- [ ] 4.2 (U) Join confirmation screens: consent text (from 0.2), "device has local data, replace?" with "Share backup first", founding import progress (no numbers, warm copy).
- [ ] 4.3 (A) Wire walks end to end: `walk.finish` outbox command carries the route, painted cell ids hint is NOT trusted (server derives), `territoryNameHints` from `resolveTerritoryName`; apply `cells.changed`/`walk.added`; idle map re-renders via `onRangeChanged`.
- [ ] 4.4 (A) Integration test with fake server: phone A and phone B each finish a walk; both converge to the same cells/visits/territories in either sync order.
- [ ] 4.5 (owner, on device) Check-on-device list for M1: found household on Android, join on iPhone, one walk each (or GPX routes), both maps show both trails; airplane mode walk then reconnect.

## 5. M2: Den, level and territories in sync (A + S + U)

- [ ] 5.1 (A) `den.upgrade` through the outbox with optimistic local result; replace local Den state by server snapshot when `rev` is newer; passive accrual projection uses `clockOffsetMs`.
- [ ] 5.2 (U) Rejected-upgrade handling in `DenScreen.tsx`: gentle copy from 0.2, no error styling, Den shows the server state.
- [ ] 5.3 (A) Dog name/appearance last-writer-wins via `dog.update`; `useBuddyAppearance` picks up remote changes.
- [ ] 5.4 (A) Remote walks appear in Walk History with the player's name (Walk Portrait works on any household walk); personal stats stay local (open question 2).
- [ ] 5.5 (A) Household-wide manual-log quota: server result is shown, local counter replaced by server's.

## 6. M3: events, iOS, nearby (U + A + owner)

- [ ] 6.1 (U) iOS readiness review: `app.json` iOS usage strings and `UIBackgroundModes`, `eas.json` iOS `preview` profile if the owner takes the Apple account; otherwise document the Xcode path in `README.md` Setup. No new native dependencies (verify `package.json` diff).
- [ ] 6.2 (U) Doorstep away-strip candidate for partner walks and `member.joined`, per Decision 10 (48 h window, coarse day part, household timezone, within the 0-3 line cap, once per launch). Pure resolver with unit tests for each rule including silence.
- [ ] 6.3 (A) Event retention/cursor edge cases: snapshot rebootstrap on 410 from the server.
- [ ] 6.4 (A) `GET /v1/nearby` client method exists and is unit-tested but is called by no screen.

## 7. Deploy (track D, can start after 2.1; owner executes)

- [ ] 7.1 `server/deploy/home/`: `docker-compose.yml` (`name: dog-territory`; services api/db/tailscale exactly per design Decision 14: loopback ports 7000/7001, mem_limits 384m/512m/128m, `restart: unless-stopped`, healthchecks, named volumes, own default network), `serve.json` (443 HTTPS to `http://api:3000`, no AllowFunnel), `.env.example` (no values), `ops/backup.sh` (pg_dump gzip, 14-day rotation in its own folder only, logs), and `make-bundle.sh` assembling `dist/dog-territory-bundle/` (deploy files + build context). Lint with `docker compose config` on the owner's side as the first command.
- [ ] 7.2 (owner) Append the Belegungstabelle and port rows (text in design Decision 14) to the server's `SERVER.md` BEFORE first start; run the runbook; confirm `docker compose ps` healthy, `/healthz` on 127.0.0.1:7000 and on `https://your-server.example.com`.
- [ ] 7.3 (owner) Tailscale: generate an auth key, install the Tailscale app on the iPhone, share the `dog-territory` node to her Tailscale account (fallback: invite her to the tailnet), open the HTTPS URL in her Safari. If this fails, stop and report before considering Funnel.
- [ ] 7.4 (owner) Backup drill: run `ops/backup.sh`, restore the dump into a scratch database with `psql` in a throwaway container, confirm rows. Add the cron line from the runbook.
- [ ] 7.5 (D) Memory check after one week: `docker stats --no-stream` values recorded in the Decisions log; adjust limits only after telling the owner.

## 8. Docs and spec follow-up (A)

- [ ] 8.1 `README.md`: Architecture ("no backend yet" becomes the household sync paragraph), Folder overview (`server/`, `src/sync/`), Setup (iOS path, Tailscale), Project Status. `CLAUDE.md` Architecture folder list gets `server/`, `src/sync`. `prototype/README.md` unaffected.
- [ ] 8.2 At `/opsx:archive`: sync the `multiplayer-sync` spec; edit `game-backlog` "Known stubs and debts" first bullet and update `openspec/config.yaml` context ("AWS sync planned later" -> home-server-first, container-portable).
- [ ] 8.3 Reviewer pass before each commit (`senior-architect` for sections 1, 2.4-2.5 and 3.5, general reviewer elsewhere).

## 9. Manual verification (owner, on devices)

- [ ] 9.1 Happy path: both walk, both see the Range, treats and level equal on both after sync.
- [ ] 9.2 Offline: airplane mode on the iPhone, walk, upgrade; reconnect; no error screens, balances converge.
- [ ] 9.3 Race: both press the same upgrade in quick succession; one succeeds, the other shows the gentle line.
- [ ] 9.4 Doorstep shows the partner line only for walks within 48 h and never mentions the viewer's own walks.
- [ ] 9.5 Leave household, restore a Backup, rejoin; kill the server container and confirm the app still plays.
