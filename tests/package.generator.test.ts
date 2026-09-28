import { describe, expect, it } from 'vitest';
import { mergePackageJson, type PackageJson } from '../src/generators/package.generator.js';
import type { ResolvedAddon } from '../src/types.js';

const base: PackageJson = {
  name: 'express-ts-starter',
  version: '1.0.0',
  private: true,
  type: 'module',
  description: 'Express + TypeScript backend',
  main: 'dist/server.js',
  scripts: { dev: 'tsx watch src/server.ts', build: 'tsc -p tsconfig.json' },
  dependencies: { express: '^5.1.0', zod: '^4.1.13' },
  devDependencies: { typescript: '^5.7.3' },
};

function addon(name: string, manifest: Partial<ResolvedAddon['manifest']>): ResolvedAddon {
  return {
    name,
    dir: `/templates/addons/${name}`,
    manifest: {
      name,
      description: name,
      baseTemplates: ['express-ts'],
      dependencies: {},
      devDependencies: {},
      scripts: {},
      env: {},
      optionalEnv: {},
      bootstrap: [],
      postInstall: [],
      ...manifest,
    },
  };
}

describe('mergePackageJson', () => {
  it('returns the base untouched when there are no addons', () => {
    expect(mergePackageJson(base, [])).toEqual(base);
  });

  it('does not mutate the base manifest', () => {
    const snapshot = structuredClone(base);
    mergePackageJson(base, [addon('prisma', { dependencies: { '@prisma/client': '^6.0.0' } })]);
    expect(base).toEqual(snapshot);
  });

  it('adds the dependencies an addon contributes', () => {
    const merged = mergePackageJson(base, [
      addon('prisma', { dependencies: { '@prisma/client': '^6.0.0' } }),
    ]);
    expect(merged.dependencies).toEqual({ '@prisma/client': '^6.0.0', express: '^5.1.0', zod: '^4.1.13' });
  });

  it('merges several addons into one dependency set', () => {
    const merged = mergePackageJson(base, [
      addon('prisma', { dependencies: { '@prisma/client': '^6.0.0' } }),
      addon('mongoose', { dependencies: { mongoose: '^9.0.0' } }),
      addon('redis', { dependencies: { ioredis: '^5.4.1' } }),
    ]);
    expect(Object.keys(merged.dependencies).sort()).toEqual([
      '@prisma/client',
      'express',
      'ioredis',
      'mongoose',
      'zod',
    ]);
  });

  it('lets a later addon win when two addons declare the same dependency', () => {
    const merged = mergePackageJson(base, [
      addon('a', { dependencies: { shared: '^1.0.0' } }),
      addon('b', { dependencies: { shared: '^2.0.0' } }),
    ]);
    expect(merged.dependencies['shared']).toBe('^2.0.0');
  });

  it('lets an addon override a version declared by the base template', () => {
    const merged = mergePackageJson(base, [addon('a', { dependencies: { express: '^5.2.0' } })]);
    expect(merged.dependencies['express']).toBe('^5.2.0');
  });

  it('merges devDependencies separately from dependencies', () => {
    const merged = mergePackageJson(base, [
      addon('prisma', { devDependencies: { prisma: '^6.0.0' }, dependencies: { '@prisma/client': '^6.0.0' } }),
    ]);
    expect(merged.devDependencies).toEqual({ prisma: '^6.0.0', typescript: '^5.7.3' });
    expect(merged.dependencies['prisma']).toBeUndefined();
  });

  it('merges scripts, so an addon can add or replace one', () => {
    const merged = mergePackageJson(base, [
      addon('prisma', { scripts: { 'db:generate': 'prisma generate', build: 'prisma generate && tsc -p tsconfig.json' } }),
    ]);
    expect(merged.scripts).toEqual({
      dev: 'tsx watch src/server.ts',
      build: 'prisma generate && tsc -p tsconfig.json',
      'db:generate': 'prisma generate',
    });
  });

  it('sorts dependency and script keys for a stable, diff-friendly manifest', () => {
    const merged = mergePackageJson(base, [
      addon('a', { dependencies: { zebra: '^1.0.0', alpha: '^1.0.0' } }),
    ]);
    expect(Object.keys(merged.dependencies)).toEqual(['alpha', 'express', 'zebra', 'zod']);
    expect(Object.keys(merged.scripts)).toEqual(['build', 'dev']);
  });

  it('carries unrelated base fields through unchanged', () => {
    const merged = mergePackageJson(base, [addon('a', { dependencies: { a: '1' } })]);
    expect(merged.description).toBe(base.description);
    expect(merged.main).toBe(base.main);
    expect(merged.private).toBe(true);
  });
});
