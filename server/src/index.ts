import { loadConfig } from './config';
import { connectPostgres, runMigrations } from './db/client';
import { buildApp, buildReadyApp } from './http/app';
import { foldSmallTerritories } from './services/territoryFold';
import { startLogRetention } from './services/logRetention';
import { startNeighbourScheduler } from './neighbours/scheduler';

async function main() {
  const config = loadConfig();
  if (process.env.MIGRATE_ON_START === 'true') {
    await runMigrations(config.databaseUrl, process.env.MIGRATIONS_DIR ?? './drizzle');
  }
  const conn = connectPostgres(config.databaseUrl);
  const { app, bus } = await buildApp({ db: conn.db, config });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  // Idempotent data migration (see services/territoryFold.ts): after listen, never blocks or breaks startup.
  void foldSmallTerritories(conn.db, bus, (hid, err) => app.log.error({ hid, err: String(err) }, 'territory fold failed for household')).then(
    (n) => app.log.info({ folded: n }, 'territory fold'),
    (err) => app.log.error({ err: String(err) }, 'territory fold failed')
  );
  const ready = config.readyPort > 0 ? buildReadyApp(conn.db) : null;
  if (ready) await ready.listen({ port: config.readyPort, host: '0.0.0.0' });

  const stopScheduler = startNeighbourScheduler(conn.db, bus, config, (msg, extra) => app.log.info({ extra }, msg));

  const stopRetention = startLogRetention(conn.db, (msg, extra) => app.log.info({ extra }, msg));

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    stopScheduler();
    stopRetention();
    bus.shutdown(); // release long-pollers now so close() does not wait out their 25 s
    await ready?.close();
    await app.close();
    await conn.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
