import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fse from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import {
  planProject,
  selectAddons,
  writeBootstrapIndex,
} from '../src/generators/project.generator.js';
import { buildProjectConfig } from '../src/utils/project-config.js';
import { findTemplatesRoot, restoreSentinelFiles } from '../src/utils/filesystem.js';
import { CliError, type ProjectOptions, type ResolvedAddon } from '../src/types.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fse.removeSync(dir);
});

function configFor(overrides: Partial<ProjectOptions> = {}) {
  return buildProjectConfig({ projectName: 'my-api', ...overrides }, '/tmp/workspace');
}

function fakeAddon(name: string, bootstrap: string[]): ResolvedAddon {
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
      bootstrap,
      postInstall: [],
    },
  };
}

describe('selectAddons', () => {
  it('selects nothing for a bare project', () => {
    expect(selectAddons(configFor())).toEqual([]);
  });

  it('selects the ORM addon implied by the database', () => {
    expect(selectAddons(configFor({ database: 'postgresql' }))).toEqual(['prisma']);
    expect(selectAddons(configFor({ database: 'mongodb' }))).toEqual(['mongoose']);
  });

  it('never selects a database addon when auth or cache is used without a database', () => {
    const config = buildProjectConfig(
      { projectName: 'my-api', database: 'postgresql', auth: 'jwt', redis: true, docker: true },
      '/tmp/workspace',
    );
    expect(selectAddons(config)).toEqual(['prisma', 'jwt', 'redis', 'docker']);
  });

  it('keeps the layering order stable: orm, auth, cache, docker', () => {
    const config = configFor({ database: 'postgresql', auth: 'jwt', redis: true, docker: true });
    expect(selectAddons(config)).toEqual(['prisma', 'jwt', 'redis', 'docker']);
  });

  it('selects no database addon when the database is none', () => {
    const config = configFor({ database: 'none', orm: 'prisma', auth: 'jwt' });
    expect(selectAddons(config)).toEqual(['jwt']);
  });
});

describe('planProject', () => {
  it('resolves the express + typescript base template from a bare config', () => {
    const plan = planProject(configFor(), findTemplatesRoot());
    expect(plan.baseTemplate).toBe('express-ts');
    expect(plan.addons).toEqual([]);
    expect(plan.baseDir.endsWith(join('templates', 'base', 'express-ts'))).toBe(true);
  });

  it('fails clearly when a requested combination has no template', () => {
    expect(() => planProject(configFor({ framework: 'nestjs' }), findTemplatesRoot())).toThrow(CliError);
  });

  it('resolves the same templates directory from a nested location', () => {
    const nested = mkdtempSync(join(findTemplatesRoot(), 'tmp-cra-test-'));
    tempDirs.push(nested);
    fse.ensureDirSync(join(nested, 'a', 'b', 'c'));
    // Start from a subdirectory that has no templates/ of its own.
    expect(findTemplatesRoot(join(nested, 'a', 'b', 'c'))).toBe(findTemplatesRoot());
  });
});

describe('writeBootstrapIndex', () => {
  function readIndex(addons: ResolvedAddon[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'cra-bootstrap-'));
    tempDirs.push(dir);
    fse.ensureDirSync(join(dir, 'src', 'bootstrap'));
    writeBootstrapIndex(dir, addons);
    return fse.readFileSync(join(dir, 'src', 'bootstrap', 'index.ts'), 'utf8');
  }

  /** Real import statements only, so the documented example in the header is ignored. */
  function importStatements(contents: string): string[] {
    return contents.split('\n').filter((line) => /^import '\.\//.test(line));
  }

  it('writes no imports when no feature registers a hook', () => {
    const contents = readIndex([]);
    expect(importStatements(contents)).toEqual([]);
    expect(contents).toContain('export {};');
  });

  it('writes one import per bootstrap module', () => {
    const contents = readIndex([fakeAddon('prisma', ['database']), fakeAddon('redis', ['redis'])]);
    expect(importStatements(contents)).toEqual(["import './database.js';", "import './redis.js';"]);
  });

  it('uses .js extensions so the emitted code runs under NodeNext', () => {
    const contents = readIndex([fakeAddon('mongoose', ['database'])]);
    expect(importStatements(contents)).toEqual(["import './database.js';"]);
  });

  it('preserves the documenting header', () => {
    const contents = readIndex([fakeAddon('prisma', ['database'])]);
    expect(contents).toContain('Optional features register their startup and shutdown hooks here.');
  });

  it('handles an addon that contributes several modules', () => {
    const contents = readIndex([fakeAddon('a', ['one', 'two'])]);
    expect(importStatements(contents)).toEqual(["import './one.js';", "import './two.js';"]);
  });
});

describe('restoreSentinelFiles', () => {
  it('renames the sentinels npm strips from a published package', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cra-sentinel-'));
    tempDirs.push(dir);
    fse.outputFileSync(join(dir, '_gitignore'), 'node_modules/\n');
    fse.outputFileSync(join(dir, 'src', '_env'), 'A=1\n');
    fse.outputFileSync(join(dir, 'keep.txt'), 'untouched\n');

    restoreSentinelFiles(dir);

    expect(fse.pathExistsSync(join(dir, '.gitignore'))).toBe(true);
    expect(fse.pathExistsSync(join(dir, 'src', '.env'))).toBe(true);
    expect(fse.pathExistsSync(join(dir, '_gitignore'))).toBe(false);
    expect(fse.readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('untouched\n');
  });
});
