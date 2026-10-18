## How to read this

Four parallel tracks after section 1 freezes the contract: **S** = `server/`, **A** = `src/sync/` + repositories, **U** = UI, **D** = deploy. **Track B** (sections B0-B8, simulated neighbour dogs) starts after M1 and uses the same S/A/U/D letters inside its tasks. Gate for app work: `npm run check`; for server work: `npm test` inside `server/` plus `tsc --noEmit`. Each task names its track. Tasks in one section with no dependency note can run in parallel. Tasks marked **owner-owned** are not worked by agents. The owner runs every ssh/compose/Apple/Tailscale-admin step himself (section 7 prepares the files and the exact commands; agents do not touch the server).

**Milestone M1 "both phones see the same Home Range after one walk each"** = sections 0, 1, 2 (incl. 2.10 hardening), 3, 4 (walk part only), 7. Until the iPhone path exists (owner-owned, 6.1) the second client is a second Android install, an emulator or GPX routes. **M2 "Momo sniffed at our corner appears on both phones the morning after our first walk"** = Track B sections B0-B5. **M3** = Den and territories in sync (section 5). **M4** = partner line on the Doorstep + nearby contract (6.2, 6.4, 2.7). **M5** = docs and hardening follow-up (section 8). Track B follow-ups B6-B8 (gifts and invitations, Viertel-Runde, polish) are independently shippable after M2; B6 needs section 5 (Den commands).

Numbering note: sections 5 and 6 keep their numbers; their former milestone labels (M2, M3) are now M3, M4.

## 0. Pre-flight

- [ ] 0.1 (A, spike) Read `src/economy/denEconomy.ts`, `walkRewards.ts`, `milestones.ts`, `src/utils/territoryCluster.ts`, `manualWalkLog.ts`. Report exactly which functions the server needs (award walk, upgrade, passive tick, manual-log quota, territory resolve) and where `../i18n`/storage imports block reuse. Decide per design Decision 6: split message-producing code out of the transitions, or a server-side transition pinned by shared fixtures. Write the decision into `design.md` Decisions log.
- [ ] 0.2 (game-master pass) Bless the partner event copy (de/en), the "Lisa already upgraded the Bakery" rejection copy, the join consent text, and confirm the co-op invariants in Decision 4. Output goes into the Decisions log.
- [x] 0.3 (owner) Decided 2026-10-18 and recorded in `proposal.md` and the design Decisions log: iOS path deferred (owner-owned), personal stats local, no Tailscale on phones (Funnel on the project's own sidecar node).
- [ ] 0.4 (S) Confirm with `ss -tln` output from the owner that 7000/7001 are free (runbook pre-flight), before section 7 is used.

## 1. Contract first (blocks A and S)

- [ ] 1.1 (A+S) `src/sync/apiContract.ts`: TypeBox schemas and inferred types for every endpoint: join household, import, snapshot, events (cursor + wait), commands (`walk.finish`, `walk.manualLog`, `den.upgrade`, `walk.delete`, `dog.update`), nearby, `DELETE /v1/me`, `DELETE /v1/household`, health. Every response carries `serverTime`. No React Native imports.
- [ ] 1.2 (A+S) JSON fixtures for each request/response (`src/sync/__fixtures__/`) and one test each side that validates fixtures against the schemas.
- [ ] 1.3 (A) `src/sync/__tests__/sharedPurity.test.ts`: allowlist from design Decision 6; fails on forbidden imports. Adjust code per spike 0.1 until green.

## 2. Server (track S)

- [ ] 2.1 `server/` scaffold: `package.json` (Node 22, ESM, strict TS), Fastify app factory, env config module (the only reader of `process.env`), pino with redaction (tokens, invite codes, coordinates), `/healthz`, `/readyz`, Vitest, throwaway-Postgres test helper.
- [ ] 2.2 Drizzle schema for all tables in design Decision 8 + generated SQL migrations committed in `server/drizzle/` + `migrate` entrypoint (runs before server start). Test: migrations apply to an empty DB twice (idempotent).
- [ ] 2.3 Auth: `Authenticator` interface, token implementation (hash at rest, revoke), the operator CLI `server/ops/create-household` (no HTTP endpoint, no admin token; design Decisions 7 and 16), `POST /v1/join`, invite generation/expiry/single-use, device revocation CLI. Tests incl. tenant isolation.
- [ ] 2.4 Command pipeline: `command_log` idempotency wrapper, one transaction per command, `den_state` row lock, event append. Test: replay returns the stored result and writes nothing.
- [ ] 2.5 `walk.finish` / `walk.manualLog`: store walk, derive painted cells with shared `grid.ts`, `cell_days` insert-or-ignore, `visits` recompute, territory resolve with shared `territoryCluster`, reward via shared economy, Den update, events (`walk.added`, `cells.changed`, `territory.changed`, `den.updated`). Tests: the two street scenarios from the spec (same day = +1, different days offline = 2, any order), range never shrinks, time bounds (future/30-day).
- [ ] 2.6 `den.upgrade`, `walk.delete` (soft), `dog.update`, passive accrual on read, household-wide manual-log quota. Tests: two upgrades on one balance.
- [ ] 2.7 `GET /v1/snapshot`, `GET /v1/events?after&wait` (long-poll, 25 s cap, no busy loop; uses Postgres `LISTEN/NOTIFY` or a 1 s indexed poll; implementer's choice, document it), `GET /v1/nearby` (empty list in the final shape), `DELETE /v1/me`, `DELETE /v1/household`, `POST /v1/households/import` (once).
- [ ] 2.8 Parity test: a recorded sequence of walks run through the app's local pipeline and through the server yields identical treats/XP/level/cells (single device, in order).
- [ ] 2.10 (S) Public-exposure hardening, per design Decision 16 and the spec requirement "Hardened public exposure": global `onRequest` hook (everything except `/healthz` and `POST /v1/join` is 401 without a token, unknown paths included); minimal `/healthz`; `/readyz` only on the internal listener (`READY_PORT`, used by the compose healthcheck); join limits 5/min and 20/day per IP plus a global ceiling; per-token 120/min and unauthenticated 30/min per IP before any DB work; `banned_ips` table with escalating bans (sidecar IP never bannable); `trustProxy` limited to the sidecar network; body limits (64 KiB default, larger only for `walk.finish` and import) and JSON-only (415); `@fastify/helmet` API settings; no CORS plugin; access log with IP and route template, redaction for tokens/codes/coordinates; per-household write caps (200 commands/day, 50 walks/day); operator CLIs `create-household`, `revoke-device`, `erase-household`. Tests for every scenario in the spec requirement, including a test that an unknown path returns the same bytes as a missing token. Runs before any public deploy (blocks 7.2).
- [ ] 2.9 `server/Dockerfile` (multi-stage, node:22-alpine, non-root, `--max-old-space-size=256`, context = repo root, copies only `server/` + allowlisted `src/`), `server/README.md` (run locally, env table, allowlist, endpoints, hardening summary and kill switch, operator CLIs, cloud-move steps, erasure). Dockerfile/compose run the api non-root, read-only, `cap_drop: [ALL]`. This README is the one new `.md`, justified because `server/` is a new top-level area; README.md and CLAUDE.md link to it.

## 3. App sync core (track A; needs 1.x, parallel to 2.x using fixtures)

- [ ] 3.1 Additive repository methods, each with in-memory twin and contract tests: `HomeRangeRepository.mergeCells(cells)` (max semantics, server `territoryId`), `TerritoryRepository.upsertTerritories(list)`, `WalkRepository` accepts remote walks (optional `playerId` on `Walk`/`StoredWalk`, `markSynced(id, at)`), `DenEconomyRepository` unchanged (reuse `saveState`) plus a stored `rev` for the sync layer.
- [ ] 3.2 `src/sync/SyncRepository.ts` (interface + sqlite + in-memory): outbox table, cursor, identity (server URL, device token, ids, player name, household id), `lastSyncedAt`. Guarded `ALTER`/`CREATE IF NOT EXISTS`, same pattern as other sqlite repositories.
- [ ] 3.3 `src/sync/apiClient.ts`: typed `fetch` wrapper (15 s timeout, bearer header, clock offset from `serverTime`), no new dependencies.
- [ ] 3.4 `src/sync/applyEvents.ts`: pure event-to-repository mapping, idempotent; partner walks never trigger rewards. Tests with fixtures, duplicate delivery, out-of-order cursor.
- [ ] 3.5 `src/sync/syncEngine.ts`: push oldest-first, then pull, backoff 5 s to 5 min, foreground-only loop with long-poll, `syncNow()`, snapshot bootstrap and re-bootstrap when the cursor is rejected. Tests with a fake api client including lost-response retry.
- [ ] 3.6 Wire in `src/app/repositories.ts` and start/stop on app foreground/background; enqueue from `finishTrackedWalk.ts` (after the local save, never blocking it), `useManualWalkLog.ts`, and Den upgrade. No sync identity = engine inert and zero behaviour change (test).
- [ ] 3.7 Founding import builder reusing `exportBackup` data (`backup.ts`) minus settings/feedback/notification/personal stats; test that the Backup file and the import payload never contain the device token.

## 4. M1 vertical slice: walks and Range (A + U + S)

- [ ] 4.1 (U) Settings: "Haushalt" card (not joined: only "Beitreten" with invite code, there is no create/admin field because households are created by the operator CLI; the first member may run the founding import; joined: household/dog name, members, "Sync jetzt", last synced, "Einladungscode erzeugen", "Haushalt verlassen"). Server URL field with a "Test connection" button. All strings in `src/i18n` de + en. Tone per CLAUDE.md. Component tests with the in-memory repos.
- [ ] 4.2 (U) Join confirmation screens: consent text (from 0.2), "device has local data, replace?" with "Share backup first", founding import progress (no numbers, warm copy).
- [ ] 4.3 (A) Wire walks end to end: `walk.finish` outbox command carries the route, painted cell ids hint is NOT trusted (server derives), `territoryNameHints` from `resolveTerritoryName`; apply `cells.changed`/`walk.added`; idle map re-renders via `onRangeChanged`.
- [ ] 4.4 (A) Integration test with fake server: phone A and phone B each finish a walk; both converge to the same cells/visits/territories in either sync order.
- [ ] 4.5 (owner, on device) Check-on-device list for M1: operator CLI creates the household, join on Android with the invite, join a second client (second Android, emulator; the iPhone only once the owner-owned path exists), one walk each (or GPX routes), both maps show both trails; airplane mode walk then reconnect; the app syncs on mobile data without Tailscale.

## B. Track B "Nachbarhunde" (after M1; simulated neighbour dogs)

Rules: `specs/neighbour-dogs/spec.md`. Engineering: design Decisions 17-24. Everything is behind `NEIGHBOURS_ENABLED`. Each task is a small slice with its own tests; groups marked "parallel" have no dependency on each other.

### B0. Game rules and gaps (before B3)

- [ ] B0.1 (game-master pass) Confirm the copy keys and sources of the 12 lines, the numbers in Decisions 19-21 (caps, 5 % sprinkle, coop `P` and `B`, carry-over, 60 % cap), the Doorstep priority of neighbour lines (max one per launch, below partner/personal lines), the invitation "going" rule, and the anti-snowball delta for the sprinkle. Log results in the Decisions log. The sprinkle and co-op numbers go into `src/economy/neighbourConfig.ts` only after this.
- [ ] B0.2 (spike, A) Read `src/web/homeRangeRendererScript.ts` and `MapScreen.tsx`: can a second muted dataset with tint and dotted outline be added to the existing renderer? Check `visual-design/spec.md` tokens for six pastel tints; if new colours are needed, list them for the owner and update the token list in this change's design first. Also check `buddyAppearance.ts` is pure enough for the server allowlist.
- [ ] B0.3 (owner decision, small) Nebel's "star" marking does not exist in `BUDDY_MARKINGS` (placeholder `mask`); and the finite gift catalog (suggested v1: 2 collars, stick prop, bench cushion, 2 yard doodads, flower-bed decoration; the app has no cosmetic inventory today). Decide whether to commission art now or ship with glyph fallbacks.

### B1. Data model and pure config (parallel group; needs 2.2)

- [ ] B1.1 (A) `src/economy/neighbourConfig.ts` (pure, no RN/Expo/i18n; added to the shared allowlist and purity test) with caps, radii, sprinkle fraction, escalation weeks, coop numbers. Unit tests pin the values listed in the spec.
- [ ] B1.2 (S) Drizzle migration: `households.is_bot`, `bot_profiles`, `bot_schedules`, `walks.generated` + nullable `player_id`, `cells.generated`, `street_tiles`, `neighbour_events`, `gifts`, `coop_weeks`. Migration test applies twice; existing M1 tests stay green.
- [ ] B1.3 (S) `server/src/neighbours/archetypes.ts`: the six dogs (appearance from enums verified by a test against the `BUDDY_*` arrays, walk slots, intro weeks, line keys). Test: every archetype's appearance is valid and the six are distinct.
- [ ] B1.4 (S) Guard tests: human snapshot, events and `nearby` never leak `generated` rows except bot items in `nearby`; no `devices` can exist for `is_bot` households; a bot household id never passes the `Authenticator`.

### B2. Street graph (parallel with B1 after B0.2)

- [ ] B2.1 (S) Tile math on a coarse global grid, Overpass client (`OVERPASS_URL`, User-Agent, 429/504 backoff, response-size cap), tile simplification and gzip storage in `street_tiles`. Tests with recorded small Overpass JSON fixtures; no network in tests.
- [ ] B2.2 (S) Fetch queue job: sequential, one at a time, never between 02:00 and 06:00, whole tiles only (privacy rule). Test the time-window guard and the tile selection around a Range bounding box plus margin.
- [ ] B2.3 (S) Graph loader (merge tiles, remove home-block nodes) and a memory check with a large synthetic tile (stays within the 256 MiB old-space flag).

### B3. Generator and bots (needs B1, B2)

- [ ] B3.1 (S) Pure loop generator `(graph, archetype, seed, constraints) -> route`: length tolerance, no home block, bounded retries, `skipped` outcome. Property-style tests on a synthetic grid graph: always inside tolerance or skipped, never inside the home block, same seed same route.
- [ ] B3.2 (S) Offset fallback generator from the host's own routes (`generator = 'offset'`). Tests: respects the distance band, drops home-block points, deterministic.
- [ ] B3.3 (S) Bot creation hook on the first accepted tracked walk: six households, `dogs`, `bot_profiles`, home anchor, bot home node selection, idempotent. Test: twice = six; two real households get different seeds; same household same result after a restart.
- [ ] B3.4 (S) `paintGeneratedWalk()`: stores a generated walk and paints bot cells/`cell_days` through the shared grid function, no rewards, no Territories. Tests: human Range cells unchanged before/after; no `den_state` change; cells visible only after the walk end time.

### B4. Scheduler, events, reactions (needs B3)

- [ ] B4.1 (S) Scheduler skeleton in the api process: advisory lock, daily plan at 06:15 host timezone, 15-minute tick, catch-up of the last 2 days, one job at a time, `NEIGHBOURS_ENABLED` switch. Tests with a fake clock: restart mid-day creates nothing twice.
- [ ] B4.2 (S) Pure `planDay()`: escalation stages, daily/weekly caps, 10-day no-repeat, weekend lateness, line pool incl. weird lines. Tests per cap with adversarial inputs (many new-ground walks, repeated runs).
- [ ] B4.3 (S) Materialisation tick: generate and paint due walks, emit due `neighbour_events` into `events` (`neighbour.event`), update `met_count`. Test: cursor order equals visibility order; failed generation retries then skips quietly.
- [ ] B4.4 (S) Reaction planning from accepted human walks with new ground (hash of walk id, weekly cap, via-node near the new ground, 24 h window). Test the 1-in-3 and 3/week limits.

### B5. API and the M2 slice (needs B4; S and A/U parallel)

- [ ] B5.1 (A+S) Contract: `GET /v1/nearby?radiusM&include=cells` real items, event kinds `neighbour.event`, `gift.available`, `coop.updated`; fixtures validated on both sides. `rangeCells` is the only geometry; test that no route or real-household coordinate can appear in the schema.
- [ ] B5.2 (A) `src/neighbours/`: nearby cache applied from events, pure Doorstep neighbour-line resolver (max one per launch, below the partner line, keys + params to i18n, silence rules). Tests per rule.
- [ ] B5.3 (U) i18n: the 12 lines (de/en, text exactly from the game-master design) under `neighbours.line.*`, plus badge/card/list strings; test that both dictionaries have identical key sets.
- [ ] B5.4 (U) Doorstep: render the neighbour lines in the away strip; Nachbarhunde list and profile card with the paw-robot badge and "simulated" wording; the Buddy renderer draws the bot appearance.
- [ ] B5.5 (U) Map: bot Ranges as dotted pastel overlay beneath the player's layer via the renderer extension (B0.2), no labels; paw prints for reactions. Renderer script test for "player cells unchanged and drawn on top".
- [ ] B5.6 (owner, on device) **M2 check:** after the first walk of the household, the next morning both phones show "Momo had a good sniff at your corner today" on the Doorstep and Momo's dotted Range on the map; the card shows the badge; with `NEIGHBOURS_ENABLED=false` nothing neighbour-related shows; the overlap never changes the player's own colours.

### B6. Gifts and invitations (after M2; gift opening needs section 5)

- [ ] B6.1 (S) Gift planning (1/day, finite catalog, exclusive cosmetic at 3 meetings, sprinkle sizing from the last 14 walks), `GET /v1/gifts`, `POST /v1/gifts/{id}/open` through the command pipeline (idempotent, first opener wins, credited straight to `den_state`, `den.updated` event). Tests: no Beginner's Luck doubling, two openers one credit, all owned = sprinkle only.
- [ ] B6.2 (U) Gift inbox on the Doorstep away strip, open-by-tap, never expires, no nag counters; owned cosmetics derived from opened gifts (collar on Buddy, stick prop, yard doodads) through `artOr()` with glyph fallback.
- [ ] B6.3 (S+U) Invitation line (Bruno, 18:00), `POST /v1/invitations/{id}/accept`, photo-moment rule (-30/+60 min), thanks line 10 next morning. Tests: ignoring changes nothing, no repeat message.

### B7. Viertel-Runde (after M2; first active in week 3)

- [ ] B7.1 (S) Weekly coop computation (human km from stored routes, planned and materialised bot km, goal formula, 60 % cap, carry-over, completion reward id), `GET /v1/coop/week` with a combined ratio only. Tests: bots alone never complete it, a zero-walk week is not announced, carry-over cap, timezone week boundaries.
- [ ] B7.2 (U) Co-op chip on the Den, completion line 7, yard decoration in the Den yard (`yardDecorations` from the snapshot). No loss copy anywhere.

### B8. Polish and docs

- [ ] B8.1 (U, Tier B art) Paw-robot badge, collars, stick, bench cushion, yard doodads, flower beds via `scripts/blender/`; optional Nebel `star` marking (touches enum, art slots, contract).
- [ ] B8.2 (S) Four-week soak with a fake clock: caps, no-repeat and escalation hold; the generated walks of a simulated month stay inside the distance band and out of the home block.
- [ ] B8.3 (A) Docs: `server/README.md` Track B section (env `NEIGHBOURS_ENABLED`, `OVERPASS_URL`, scheduler, graph cache size, how to reset a household's neighbours), `README.md` Architecture/Status line, `CLAUDE.md` folder list, privacy note entries (IP logs, Overpass tile requests). Dog names stay untranslated; claim/defend language only.
- [ ] B8.4 Reviewer pass: `senior-architect` on B1.2, B3.4, B4.1 and B5.1; `game-master` on B0.1 and the B5.3 copy; general reviewer elsewhere.

## 5. M3: Den, level and territories in sync (A + S + U)

- [ ] 5.1 (A) `den.upgrade` through the outbox with optimistic local result; replace local Den state by server snapshot when `rev` is newer; passive accrual projection uses `clockOffsetMs`.
- [ ] 5.2 (U) Rejected-upgrade handling in `DenScreen.tsx`: gentle copy from 0.2, no error styling, Den shows the server state.
- [ ] 5.3 (A) Dog name/appearance last-writer-wins via `dog.update`; `useBuddyAppearance` picks up remote changes.
- [ ] 5.4 (A) Remote walks appear in Walk History with the player's name (Walk Portrait works on any household walk); personal stats stay local (open question 2).
- [ ] 5.5 (A) Household-wide manual-log quota: server result is shown, local counter replaced by server's.

## 6. M4: events, iOS (owner-owned), nearby (U + A + owner)

- [ ] 6.1 (U, **owner-owned, deferred**) iOS readiness review: `app.json` iOS usage strings and `UIBackgroundModes`, `eas.json` iOS `preview` profile if the owner takes the Apple account; otherwise document the Xcode path in `README.md` Setup. No new native dependencies (verify `package.json` diff).
- [ ] 6.2 (U) Doorstep away-strip candidate for partner walks and `member.joined`, per Decision 10 (48 h window, coarse day part, household timezone, within the 0-3 line cap, once per launch). Pure resolver with unit tests for each rule including silence.
- [ ] 6.3 (A) Event retention/cursor edge cases: snapshot rebootstrap on 410 from the server.
- [ ] 6.4 (A) `GET /v1/nearby` client method exists and is unit-tested but is called by no screen.

## 7. Deploy (track D, can start after 2.1; owner executes)

- [ ] 7.1 `server/deploy/home/`: `docker-compose.yml` (`name: dog-territory`; services api/db/tailscale exactly per design Decision 14: loopback ports 7000/7001, mem_limits 384m/512m/128m, `restart: unless-stopped`, healthchecks, named volumes, own default network), `serve.json` (443 HTTPS to `http://api:3000`, `AllowFunnel` on for this sidecar node only), `.env.example` (no values), `ops/backup.sh` (pg_dump gzip, 14-day rotation in its own folder only, logs), and `make-bundle.sh` assembling `dist/dog-territory-bundle/` (deploy files + build context). Lint with `docker compose config` on the owner's side as the first command.
- [ ] 7.2 (owner) After 2.10 is green: append the Belegungstabelle and port rows (text in design Decision 14, now "Funnel öffentlich") to the server's `SERVER.md` BEFORE first start; run the runbook; confirm `docker compose ps` healthy, `/healthz` on 127.0.0.1:7000 and on `https://your-server.example.com` from a phone on mobile data; run the operator CLI to create the household and the first invite.
- [ ] 7.3 (owner) Tailscale admin console: create the auth key for the `dog-territory` node, enable HTTPS certificates and allow Funnel for that node in the tailnet policy. Verify from a phone WITHOUT Tailscale that `/healthz` answers and that `/`, `/admin` and `/v1/nearby` answer 401 with identical bodies. Verify the client IP appears in the api access log (`X-Forwarded-For` check from design Decision 16; record the result in the Decisions log). Never touch the host node's serve/Funnel (SERVER.md rule 3). Rehearse the kill switch once (`docker compose stop api`, start again).
- [ ] 7.4 (owner) Backup drill: run `ops/backup.sh`, restore the dump into a scratch database with `psql` in a throwaway container, confirm rows. Add the cron line from the runbook.
- [ ] 7.5 (D) Memory and exposure check after one week (also review the access log for scanning noise and bans): `docker stats --no-stream` values recorded in the Decisions log; adjust limits only after telling the owner.

## 8. Docs and spec follow-up (A)

- [ ] 8.1 `README.md`: Architecture ("no backend yet" becomes the household sync paragraph), Folder overview (`server/`, `src/sync/`), Setup (iOS path, Tailscale), Project Status. `CLAUDE.md` Architecture folder list gets `server/`, `src/sync`, and for Track B `src/neighbours`. Setup says the API is public via Funnel (no Tailscale on phones) and links the Decision 16 residual-risk paragraph; iOS Setup stays a stub until the owner takes it. `prototype/README.md` unaffected.
- [ ] 8.2 At `/opsx:archive`: sync the `multiplayer-sync`, `neighbour-dogs` and `anti-snowball` deltas (the latter only adds one requirement); edit `game-backlog` "Known stubs and debts" first bullet and update `openspec/config.yaml` context ("AWS sync planned later" -> home-server-first, container-portable).
- [ ] 8.3 Reviewer pass before each commit (`senior-architect` for sections 1, 2.4-2.5 and 3.5, general reviewer elsewhere).

## 9. Manual verification (owner, on devices)

- [ ] 9.1 Happy path: both walk, both see the Range, treats and level equal on both after sync.
- [ ] 9.2 Offline: airplane mode on the second client (iPhone once available), walk, upgrade; reconnect; no error screens, balances converge.
- [ ] 9.3 Race: both press the same upgrade in quick succession; one succeeds, the other shows the gentle line.
- [ ] 9.4 Doorstep shows the partner line only for walks within 48 h and never mentions the viewer's own walks.
- [ ] 9.5 Leave household, restore a Backup, rejoin; kill the server container and confirm the app still plays.
- [ ] 9.6 Public exposure: from a phone on mobile data without Tailscale, 20 wrong join codes in a minute are throttled, a wrong token gets 401, and the real app still works afterwards.
