# server/ — household sync API

Why this folder exists: the app is offline-first on one phone; this API lets two phones share one dog, one Home Range and one Den (OpenSpec change `multiplayer-sync`, design in `docs/decisions/multiplayer-sync/`). Own `package.json`, not an npm workspace.

Stack: Node 22, TypeScript, Fastify 5, Postgres 16, Drizzle ORM (SQL migrations in `drizzle/`), pino, vitest (PGlite, no Docker needed for tests).

## Scripts (run inside `server/`)

| Script | What |
|---|---|
| `npm run dev` | tsx watch, needs `DATABASE_URL` |
| `npm run build` | typecheck + esbuild bundle to `dist/index.js`, `dist/ops/cli.js`, `dist/ops/migrate.js` |
| `npm test` | vitest (API, migrations, parity with the app's economy) |
| `npm run migrate` | apply `drizzle/*.sql` (prod: `node dist/ops/migrate.js`, or `MIGRATE_ON_START=true`) |
| `npm run db:generate` | after editing `src/db/schema.ts`; commit the generated SQL |
| `npm run cli -- <cmd>` | operator CLI |

Type gate from the repo root: `npx tsc -p server`.

## Shared code (no copies)

- Contract: `../src/sync/apiContract.ts` (pure TS types; the app imports it too). Request schemas in `src/http/schemas.ts` are compile-time checked against it.
- Pure game code imported through the `@game/*` alias (= `../src/*`): `economy/formulas`, `balanceConfig`, `territoryEconomy`, `neighbourConfig`, `utils/grid`, `geometry`, `territoryCluster`, `storage/TerritoryRepository` and `HomeRangeRepository` (types and id helpers only), `types`.
- NOT importable (pull in i18n/storage): `denEconomy.ts`, `walkRewards.ts`, `milestones.ts`, `manualWalkLog.ts`. `src/economy/denTransitions.ts` re-expresses their transitions; `test/parity.test.ts` pins it against the app's own functions.

## Run

Docker image: build with the repo root as context.

```
docker build -f server/Dockerfile -t dog-territory-api .
```

Env (see `.env.example`): `DATABASE_URL`, `PORT` (7000), `READY_PORT` (7100, internal `/readyz`, never publish), `LOG_LEVEL`, `HOUSEHOLD_MAX_PLAYERS`, `TRUST_PROXY_CIDR` (default 172.16.0.0/12; the only network whose X-Forwarded-For is trusted), `LOG_FORWARDED_HEADERS` (debug: log req.ip + forwarded headers for the first 50 requests), `MIGRATE_ON_START`, `MIN_CLIENT_API_LEVEL` (default 1), `NEIGHBOURS_ENABLED`, `OVERPASS_URL`, `OVERPASS_PAUSE_MS`.

## Operator CLI (the only admin surface; no admin endpoint exists)

```
docker compose exec api node dist/ops/cli.js create-household --name "Muster" [--timezone Europe/Berlin] [--allow-import]   # import is closed unless --allow-import
docker compose exec api node dist/ops/cli.js create-invite --household "Muster"   # or the household id
docker compose exec api node dist/ops/cli.js list
docker compose exec api node dist/ops/cli.js revoke-device --device <id>
docker compose exec api node dist/ops/cli.js logs --household Zuhause [--device <label>] [--since 2h] [--event WALK_%] [--limit 200]   # device logs, one line per entry; on the server: make device-logs ARGS="--household Zuhause --since 2h"
```

Invite codes are shown once (only a hash is stored), single-use, valid 24 h.

## API v1 (all JSON; details in the contract file)

Public: `GET /healthz` (`{ok, apiLevel}`), `POST /v1/join`.

**API level** (`API_LEVEL` in `src/sync/apiContract.ts`, currently 2): every response carries `X-Api-Level`; the app sends `X-Client-Api-Level` (missing/invalid = 1). Requests other than GET/HEAD/OPTIONS (join excepted, auth checked first) from a client below `MIN_CLIENT_API_LEVEL` get `426 {"error":"upgrade_required"}`; reads always work. Rules: additive fields only inside a level, roll the server out before the app, breaking changes go to `/v2`, raise the minimum only once every phone has the new app.

 Everything else needs `Authorization: Bearer <token>`; anything else, including unknown paths, answers the identical `401 {"error":"unauthorized"}`.

`GET /v1/snapshot`, `POST /v1/walks`, `GET /v1/walks/:id`, `POST /v1/commands`, `GET /v1/events?after=&wait=&limit=`, `GET /v1/nearby?radiusM&include=cells`, `GET /v1/gifts`, `POST /v1/gifts/:id/open`, `GET /v1/coop/week` (the last three and nearby are empty/inactive unless `NEIGHBOURS_ENABLED=true`), `POST /v1/households/import` (founding seed, once), `POST /v1/logs` (device log shipping, below), `POST /v1/presence` and `GET /v1/presence?after=&wait=` (live walk presence, below).

## Behaviour worth knowing

- Walks are append-only and idempotent by client id; the server recomputes cells, territories and reward from the route. Cell timestamps come from the walk, never receive time, so merging is order-independent; `visits` = baseline + distinct household-days (`cell_days`).
- Den state is server-authoritative, changed only by walks and commands (`den.upgrade`, `den.claim`, `dog.update`, `walk.delete`, `player.rename`, `gift.open`); commands are idempotent by `clientId`. Passive accrual is applied lazily.
- Hardening: strict schemas (unknown properties rejected), 64 KiB body (1 MiB walks, 5 MiB import), helmet headers, no CORS, per-IP and per-device rate limits, IP bans in `banned_ips`, per-household daily write caps, redacted structured access log. Residual risk: design Decision 16.

## Device log shipping

### Live presence (`/v1/presence`)

While a household member walks, their phone sends a heartbeat (`POST`, about every 30 s, only the new points) and the other members long-poll `GET /v1/presence?after=<rev>&wait=25` while their app is open. Ephemeral: table `walk_presence`, never in the `events` feed, one row per (player, walk) with the route simplified to at most 400 points, purged 6 h after the last beat by the hourly job in `services/logRetention.ts`, and closed when the finished walk is uploaded. Visible only to the other members of the same household (full route; no start fuzz inside a household). Limits: 1 request / 10 s per device on `POST` (the closing `ended` beat is exempt), 400 points and 32 KiB per beat, long-poll counted once and capped per household like the events long-poll (separate channel `presence:<household>`). Budget per phone while the app is in front: about 2-3 `GET`s a minute plus 2 `POST`s a minute while walking, well inside `RL_DEVICE_PER_MIN`. Coordinates are redacted from request logs (`*.points`). Additive inside API level 2, no env change, no operator action beyond running the migration (`0005_walk_presence`, applied by `MIGRATE_ON_START`).

The app copies its `log()` lines (redacted: no tokens, invite codes, backup data or raw lat/lon) to `POST /v1/logs` while joined and the Settings switch "Protokoll an den Server senden" is on. Batches are at most 64 KiB; `deviceSeq` numbers the first entry and the unique `(device_id, device_seq)` index makes resends idempotent. Limits: 30 requests / 10 min per device, 2000 rows / 24 h per device (429 `daily_cap`), entries over 2 KB skipped. Rows are deleted 14 days after receipt by an hourly in-process job (`services/logRetention.ts`, independent of `NEIGHBOURS_ENABLED`). There is no read endpoint: use the `logs` CLI command above. Redaction lives in the app (`src/utils/logShipper.ts`); the server stores what it gets.

## Nachbarhunde (Track B, behind `NEIGHBOURS_ENABLED`)

Design: `docs/decisions/multiplayer-sync/design.md` Decisions 17-24. Code: `src/neighbours/`.

**Enable it:** set `NEIGHBOURS_ENABLED=true` (compose passes it through from the host `.env`; it is `false` by default and should stay so until the app side with the Doorstep lines has shipped) and, for real streets, `OVERPASS_URL=https://overpass-api.de/api/interpreter` (empty = offset fallback only). Restart the api container (`docker compose up -d api`). Migrations apply with `MIGRATE_ON_START=true` or `node dist/ops/migrate.js`. Bots appear on each household's next accepted tracked walk; the first neighbour event shows up the next morning. Turn it off the same way: `nearby` returns `[]`, the scheduler idles, existing rows stay.

**How it runs:** one 15-minute `setInterval` tick inside the api process (no cron). Per host it plans the local day (from 06:15, idempotent through unique keys), writes bot walks only once they are over (through the same cell-merge code as human walks, into the bot household, flagged `generated`), updates the Viertel-Runde, and emits due events into the normal `events` feed. Each host runs in its own transaction behind `pg_try_advisory_xact_lock`. Street tiles (coarse ~2 km grid, `street_tiles`) are fetched sequentially, at most 3 per tick, never 02:00-06:00 local, failed tiles retried after 6 h.

**Tuning:** caps, sprinkle fraction, co-op sizes and geometry live in `src/economy/neighbourConfig.ts`; who the six dogs are and when they walk in `src/neighbours/archetypes.ts`.
