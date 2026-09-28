import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Locates the `templates/` directory that ships alongside `dist/`.
 *
 * Resolved from disk at runtime rather than inlined at build time so it works in
 * all three situations: running from source during development, running the
 * bundle in `dist/`, and running an npx/global install where the package lives
 * under `node_modules/create-rohit-app/`.
 */
export function findTemplatesRoot(startDir: string = moduleDir): string {
  let current = resolve(startDir);
  // Bounded walk: a real installation is at most a handful of levels deep.
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, 'templates');
    if (fse.pathExistsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `Could not locate the "templates" directory starting from ${startDir}. ` +
      'This usually means the package was published without it — check the "files" field in package.json.',
  );
}

/** Reads this package's own package.json to power `--version`. */
export function readOwnPackageJson(): { name: string; version: string } {
  let current = resolve(moduleDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, 'package.json');
    if (fse.pathExistsSync(candidate)) {
      const parsed = fse.readJsonSync(candidate) as { name?: string; version?: string };
      if (parsed.name === 'create-rohit-app' && typeof parsed.version === 'string') {
        return { name: parsed.name, version: parsed.version };
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not locate the create-rohit-app package.json');
}

export const pathExists = fse.pathExistsSync;

export function ensureDir(target: string): void {
  fse.ensureDirSync(target);
}

export function isEmptyDirectory(target: string): boolean {
  if (!fse.pathExistsSync(target)) return true;
  return readdirSync(target).length === 0;
}

export function listEntries(target: string): string[] {
  if (!fse.pathExistsSync(target)) return [];
  return readdirSync(target).sort();
}

export function removeDir(target: string): void {
  fse.removeSync(target);
}

/**
 * Copies a template directory into the target.
 *
 * `overwrite` is false for the base template — a collision there means we are
 * about to clobber something that is not ours — and true when layering addons,
 * where an addon replacing a base file is exactly the point.
 */
export function copyTemplateDir(src: string, dest: string, overwrite: boolean): void {
  if (!fse.pathExistsSync(src)) {
    throw new Error(`Template directory not found: ${src}`);
  }
  if (!overwrite && fse.pathExistsSync(dest)) {
    throw new Error(`Refusing to overwrite existing directory: ${dest}`);
  }
  fse.ensureDirSync(dirname(dest));
  fse.copySync(src, dest, { overwrite, errorOnExist: !overwrite, dereference: true });
}

export function readTextFile(target: string): string {
  return fse.readFileSync(target, 'utf8');
}

export function writeTextFile(target: string, contents: string): void {
  fse.outputFileSync(target, contents, 'utf8');
}

export function readJsonFile<T>(target: string): T {
  return fse.readJsonSync(target) as T;
}

export function writeJsonFile(target: string, value: unknown): void {
  writeTextFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * npm's packlist silently drops these files from nested directories of a
 * published package (a nested `.gitignore` is treated as an ignore-rules file,
 * and `.env` / `.npmrc` are excluded outright). Templates therefore store them
 * under a sentinel name and the generator renames them on copy, so the files
 * still exist in this repository and in the published tarball.
 */
const SENTINEL_FILENAMES: Record<string, string> = {
  _gitignore: '.gitignore',
  _dockerignore: '.dockerignore',
  _npmrc: '.npmrc',
  _env: '.env',
};

/** Renames every sentinel file in a freshly copied template. Returns the paths written. */
export function restoreSentinelFiles(dir: string): string[] {
  const written: string[] = [];
  for (const relativePath of listFilesRecursive(dir)) {
    const segments = relativePath.split('/');
    const fileName = segments.pop();
    if (fileName === undefined) continue;
    const realName = SENTINEL_FILENAMES[fileName];
    if (realName === undefined) continue;

    const from = join(dir, ...segments, fileName);
    const to = join(dir, ...segments, realName);
    fse.moveSync(from, to, { overwrite: true });
    written.push(to);
  }
  return written;
}

/** Every file inside `dir`, as a path relative to `dir` using POSIX separators. */
export function listFilesRecursive(dir: string, base: string = dir): string[] {
  if (!fse.pathExistsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(full.slice(base.length).replace(/^[\\/]/, '').split('\\').join('/'));
    }
  }
  return out.sort();
}
