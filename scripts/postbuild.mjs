import { chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, 'dist', 'index.js');

if (!existsSync(entry)) {
  console.error(`postbuild: expected bundle at ${entry}`);
  process.exit(1);
}

// No-op on Windows, required so `npx create-rohit-app` can exec the shebang on POSIX.
chmodSync(entry, 0o755);
console.log(`postbuild: chmod 755 ${entry}`);
