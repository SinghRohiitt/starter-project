import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: true,
  // The shebang lives in src/index.ts and esbuild preserves it in the bundle.
  // scripts/postbuild.mjs marks the output executable so the `bin` entry works.
  // The templates/ directory is read from disk at runtime and never inlined.
});
