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
- Pure game code imported through the `@game/*` alias (= `../src/*`): `economy/formulas`, `balanceConfig`, `territoryEconomy`, `utils/grid`, `geometry`, `territoryCluster`, `storage/TerritoryRepository` and `HomeRangeRepository` (types and id helpers only), `types`.
- NOT importable (pull in i18n/storage): `denEconomy.ts`, `walkRewards.ts`, `milestones.ts`, `manualWalkLog.ts`. `src/economy/denTransitions.ts` re-expresses their transitions; `test/parity.test.ts` pins it against the app's own functions.

## Run

Docker image: build with the repo root as context.

```
docker build -f server/Dockerfile -t dog-territory-api .
```

Env (see `.env.example`): `DATABASE_URL`, `PORT` (7000), `READY_PORT` (7100, internal `/readyz`, never publish), `LOG_LEVEL`, `HOUSEHOLD_MAX_PLAYERS`, `TRUST_PROXY_CIDR` (default 172.16.0.0/12; the only network whose X-Forwarded-For is trusted), `LOG_FORWARDED_HEADERS` (debug: log req.ip + forwarded headers for the first 50 requests), `MIGRATE_ON_START`.

## Operator CLI (the only admin surface; no admin endpoint exists)

```
docker compose exec api node dist/ops/cli.js create-household --name "Muster" [--timezone Europe/Berlin] [--allow-import]   # import is closed unless --allow-import
docker compose exec api node dist/ops/cli.js create-invite --household "Muster"   # or the household id
docker compose exec api node dist/ops/cli.js list
docker compose exec api node dist/ops/cli.js revoke-device --device <id>
```

Invite codes are shown once (only a hash is stored), single-use, valid 24 h.

## API v1 (all JSON; details in the contract file)

Public: `GET /healthz`, `POST /v1/join`. Everything else needs `Authorization: Bearer <token>`; anything else, including unknown paths, answers the identical `401 {"error":"unauthorized"}`.

`GET /v1/snapshot`, `POST /v1/walks`, `GET /v1/walks/:id`, `POST /v1/commands`, `GET /v1/events?after=&wait=&limit=`, `GET /v1/nearby` (always `[]` in M1), `POST /v1/households/import` (founding seed, once).

## Behaviour worth knowing

- Walks are append-only and idempotent by client id; the server recomputes cells, territories and reward from the route. Cell timestamps come from the walk, never receive time, so merging is order-independent; `visits` = baseline + distinct household-days (`cell_days`).
- Den state is server-authoritative, changed only by walks and commands (`den.upgrade`, `den.claim`, `dog.update`, `walk.delete`); commands are idempotent by `clientId`. Passive accrual is applied lazily.
- Hardening: strict schemas (unknown properties rejected), 64 KiB body (1 MiB walks, 5 MiB import), helmet headers, no CORS, per-IP and per-device rate limits, IP bans in `banned_ips`, per-household daily write caps, redacted structured access log. Residual risk: design Decision 16.
