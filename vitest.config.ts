import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The integration suite spawns real `npm install` runs, which is slow but
    // intentional: it is the only way to prove a generated app actually builds.
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 15 * 60 * 1000,
    // Installs are I/O heavy; running files sequentially keeps the machine usable
    // and makes failures reproducible instead of flaky under parallel disk access.
    fileParallelism: false,
    reporters: ['default'],
  },
});
