// Bundles src/index.ts, src/ops/cli.ts and src/ops/migrate.ts into dist/ (dist/index.js, dist/ops/cli.js, dist/ops/migrate.js). Bundling (rather than plain tsc)
// is what resolves the "@game/*" alias into ../src/economy etc.; npm packages stay external.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: ['src/index.ts', 'src/ops/cli.ts', 'src/ops/migrate.ts'],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  alias: { '@game': fileURLToPath(new URL('../../src', import.meta.url)) },
  sourcemap: true,
  logLevel: 'info',
});
