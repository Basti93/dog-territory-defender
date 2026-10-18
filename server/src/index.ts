import { loadConfig } from './config';
import { connectPostgres, runMigrations } from './db/client';
import { buildApp, buildReadyApp } from './http/app';

async function main() {
  const config = loadConfig();
  if (process.env.MIGRATE_ON_START === 'true') {
    await runMigrations(config.databaseUrl, process.env.MIGRATIONS_DIR ?? './drizzle');
  }
  const conn = connectPostgres(config.databaseUrl);
  const { app, bus } = await buildApp({ db: conn.db, config });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  const ready = config.readyPort > 0 ? buildReadyApp(conn.db) : null;
  if (ready) await ready.listen({ port: config.readyPort, host: '0.0.0.0' });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
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
