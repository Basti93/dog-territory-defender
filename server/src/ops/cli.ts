// Operator CLI. There is no admin endpoint on the HTTP API (design Decisions 7 and 16); admin power
// equals shell access to the container:
//   docker compose exec api node dist/ops/cli.js create-household --name "Muster" [--allow-import]
//   docker compose exec api node dist/ops/cli.js create-invite --household "Muster"
//   docker compose exec api node dist/ops/cli.js create-invite --for-player <player-id>   # restore invite: new device for an existing player
//   docker compose exec api node dist/ops/cli.js list
//   docker compose exec api node dist/ops/cli.js revoke-device --device <device-id>
//   docker compose exec api node dist/ops/cli.js logs --household Zuhause [--device <label>] [--since 2h] [--event WALK_%] [--limit 200]
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { connectPostgres } from '../db/client';
import { queryDeviceLogs } from '../services/deviceLogs';
import { formatLogLine, parseSince } from './logFormat';
import { createHousehold, createInvite, findHousehold, findPlayer, listHouseholds, revokeDevice } from '../services/households';

const USAGE = `usage:
  cli create-household --name <name> [--timezone Europe/Berlin] [--allow-import]
  cli create-invite --household <id|name>      (alias: invite)
  cli create-invite --for-player <player-id|name> [--household <id|name>]   restore invite: attaches a device to that player
  cli list
  cli revoke-device --device <device-id>
  cli logs --household <id|name> [--device <label|id>] [--since 2h] [--event WALK_%] [--limit 200]`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      timezone: { type: 'string' },
      'allow-import': { type: 'boolean' },
      household: { type: 'string' },
      'for-player': { type: 'string' },
      device: { type: 'string' },
      since: { type: 'string' },
      event: { type: 'string' },
      limit: { type: 'string' },
    },
  });
  const config = loadConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_URL });
  const conn = connectPostgres(config.databaseUrl);
  try {
    switch (command) {
      case 'create-household': {
        if (!values.name) throw new Error('--name is required');
        const h = await createHousehold(conn.db, values.name, values.timezone, Date.now(), values['allow-import'] === true);
        console.log(`household created: ${h.id} (${h.name}, ${h.timezone}, founding import ${values['allow-import'] ? 'allowed' : 'closed'})`);
        const invite = await createInvite(conn.db, h.id, config.inviteTtlMs);
        console.log(`first invite code (shown once, valid 24 h): ${invite.code}`);
        break;
      }
      case 'create-invite':
      case 'invite': {
        if (values['for-player']) {
          const household = values.household ? await findHousehold(conn.db, values.household) : undefined;
          const player = await findPlayer(conn.db, values['for-player'], household?.id);
          const invite = await createInvite(conn.db, player.householdId, config.inviteTtlMs, Date.now(), player.id);
          console.log(`restore invite for player ${player.displayName} ${player.id} (shown once, single-use, valid until ${invite.expiresAt.toISOString()}): ${invite.code}`);
          console.log('after the new phone has joined, revoke the old one: revoke-device --device <id> (see `list`)');
          break;
        }
        if (!values.household) throw new Error('--household is required');
        const h = await findHousehold(conn.db, values.household);
        const invite = await createInvite(conn.db, h.id, config.inviteTtlMs);
        console.log(`invite code for ${h.name} (shown once, valid until ${invite.expiresAt.toISOString()}): ${invite.code}`);
        break;
      }
      case 'list': {
        for (const row of await listHouseholds(conn.db)) {
          console.log(`${row.household.id}  ${row.household.name}  tz=${row.household.timezone}  open-invites=${row.openInvites}`);
          for (const p of row.players) {
            console.log(`  player ${p.id}  ${p.displayName}${p.leftAt ? '  (left)' : ''}`);
            for (const d of row.devices.filter((x) => x.playerId === p.id)) {
              console.log(`    device ${d.id}  ${d.label}${d.revokedAt ? '  (revoked)' : ''}  last-seen=${d.lastSeenAt?.toISOString() ?? 'never'}`);
            }
          }
        }
        break;
      }
      case 'revoke-device': {
        if (!values.device) throw new Error('--device is required');
        console.log((await revokeDevice(conn.db, values.device)) ? 'device revoked' : 'no active device with that id');
        break;
      }
      case 'logs': {
        if (!values.household) throw new Error('--household is required');
        const h = await findHousehold(conn.db, values.household);
        const limit = values.limit ? Number(values.limit) : 200;
        if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--limit must be 1..5000');
        const rows = await queryDeviceLogs(conn.db, {
          householdId: h.id,
          device: values.device,
          sinceMs: values.since ? parseSince(values.since, Date.now()) : undefined,
          event: values.event,
          limit,
        });
        for (const row of rows) console.log(formatLogLine(row));
        break;
      }
      default:
        console.error(USAGE);
        process.exitCode = 2;
    }
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
