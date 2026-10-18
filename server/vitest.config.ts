import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@game': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
