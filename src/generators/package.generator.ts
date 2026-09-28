import { join } from 'node:path';
import type { ProjectConfig, ResolvedAddon } from '../types.js';
import { readJsonFile, writeJsonFile } from '../utils/filesystem.js';

export type PackageJson = {
  name: string;
  version: string;
  private: boolean;
  type?: string;
  description?: string;
  main?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: Record<string, string>;
  [key: string]: unknown;
};

/** Keys we merge from addons. Everything else in a template's package.json is kept as-is. */
const MERGEABLE_KEYS = ['dependencies', 'devDependencies', 'scripts'] as const;

/**
 * Merges addon contributions into the base template's `package.json`.
 *
 * This is what keeps the CLI free of per-combination templates: the base
 * template owns the baseline dependency set and each addon layers its own on
 * top, with later addons winning on conflicts.
 */
export function mergePackageJson(base: PackageJson, addons: ResolvedAddon[]): PackageJson {
  const merged: PackageJson = structuredClone(base);

  for (const key of MERGEABLE_KEYS) {
    const combined: Record<string, string> = { ...(merged[key] ?? {}) };
    for (const { manifest } of addons) {
      Object.assign(combined, manifest[key] ?? {});
    }
    merged[key] = sortKeys(combined);
  }

  return merged;
}

/** Reads the copied base manifest and writes the merged result back to disk. */
export function writePackageJson(targetDir: string, config: ProjectConfig, addons: ResolvedAddon[]): PackageJson {
  const packageJsonPath = join(targetDir, 'package.json');
  const base = readJsonFile<PackageJson>(packageJsonPath);
  const merged = mergePackageJson(base, addons);

  merged.name = config.projectName;
  merged.version = '1.0.0';
  merged.private = true;
  // The generated app is ESM; see templates/base/express-ts/tsconfig.json.
  merged.type = 'module';
  merged.engines = { ...(merged.engines ?? {}), node: '>=18.0.0' };

  // Keys npm cares about first reads: name, version, private, type, then the rest.
  const ordered: PackageJson = {
    name: merged.name,
    version: merged.version,
    private: merged.private,
    type: merged.type,
    description: merged.description,
    main: merged.main,
    scripts: merged.scripts,
    dependencies: merged.dependencies,
    devDependencies: merged.devDependencies,
    engines: merged.engines,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (!(key in ordered) && value !== undefined) ordered[key] = value;
  }

  writeJsonFile(packageJsonPath, ordered);
  return ordered;
}

function sortKeys(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}
