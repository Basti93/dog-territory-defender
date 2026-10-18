// Applies drizzle/*.sql. Run before the API starts: `node dist/ops/migrate.js`.
// MIGRATIONS_DIR defaults to ./drizzle relative to the working directory (/app in the image).
import { runMigrations } from '../db/client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
runMigrations(url, process.env.MIGRATIONS_DIR ?? './drizzle')
  .then(() => console.log('migrations applied'))
  .catch((err) => {
    console.error('migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
