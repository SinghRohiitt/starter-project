import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildProjectConfig, directoryNameFrom, getUnsupportedReason } from '../src/utils/project-config.js';
import type { ProjectOptions } from '../src/types.js';

const cwd = '/tmp/workspace';

function build(overrides: Partial<ProjectOptions> = {}) {
  return buildProjectConfig({ projectName: 'my-api', ...overrides }, cwd);
}

describe('buildProjectConfig', () => {
  it('derives the target directory from the cwd and project name', () => {
    expect(build().targetDir).toBe(join(cwd, 'my-api'));
  });

  it('uses the unscoped directory name for a scoped package', () => {
    const config = build({ projectName: '@acme/my-api' });
    expect(config.projectName).toBe('@acme/my-api');
    expect(config.targetDir).toBe(join(cwd, 'my-api'));
  });

  it('falls back to sensible defaults for everything not supplied', () => {
    expect(build()).toEqual({
      projectName: 'my-api',
      targetDir: join(cwd, 'my-api'),
      appType: 'backend',
      framework: 'express',
      language: 'typescript',
      database: 'none',
      orm: 'none',
      auth: 'none',
      redis: false,
      docker: false,
      git: true,
      packageManager: 'npm',
    });
  });

  it('keeps the package manager that was passed through', () => {
    expect(build({ packageManager: 'pnpm' }).packageManager).toBe('pnpm');
  });

  it('ignores explicitly undefined values instead of overwriting defaults with them', () => {
    const config = build({ framework: undefined, database: undefined, git: undefined });
    expect(config.framework).toBe('express');
    expect(config.database).toBe('none');
    expect(config.git).toBe(true);
  });

  describe('consistency rules', () => {
    it('drops the ORM when no database is selected', () => {
      const config = build({ database: 'none', orm: 'prisma' });
      expect(config.orm).toBe('none');
    });

    it('defaults PostgreSQL to Prisma', () => {
      expect(build({ database: 'postgresql' }).orm).toBe('prisma');
      expect(build({ database: 'postgresql', orm: 'mongoose' }).orm).toBe('prisma');
    });

    it('defaults MongoDB to Mongoose', () => {
      expect(build({ database: 'mongodb' }).orm).toBe('mongoose');
      expect(build({ database: 'mongodb', orm: 'prisma' }).orm).toBe('mongoose');
    });
  });
});

describe('directoryNameFrom', () => {
  it('returns the name unchanged when it is not scoped', () => {
    expect(directoryNameFrom('my-api')).toBe('my-api');
  });

  it('strips the scope', () => {
    expect(directoryNameFrom('@acme/my-api')).toBe('my-api');
  });

  it('trims surrounding whitespace', () => {
    expect(directoryNameFrom('  my-api  ')).toBe('my-api');
  });
});

describe('getUnsupportedReason', () => {
  it('returns null for the combination that is implemented', () => {
    expect(getUnsupportedReason(build())).toBeNull();
  });

  it('explains that frontend and full stack templates do not exist yet', () => {
    expect(getUnsupportedReason(build({ appType: 'frontend' }))).toBe(
      'Frontend templates are not available yet.',
    );
    expect(getUnsupportedReason(build({ appType: 'fullstack' }))).toBe(
      'Full Stack templates are not available yet.',
    );
  });

  it('explains that NestJS does not exist yet', () => {
    expect(getUnsupportedReason(build({ framework: 'nestjs' }))).toBe(
      'The NestJS template is not available yet.',
    );
  });

  it('explains that JavaScript templates do not exist yet', () => {
    expect(getUnsupportedReason(build({ language: 'javascript' }))).toBe(
      'JavaScript templates are not available yet.',
    );
  });

  it('reports the first unavailable feature, not all of them', () => {
    const reason = getUnsupportedReason(build({ framework: 'nestjs', language: 'javascript' }));
    expect(reason).toBe('The NestJS template is not available yet.');
  });
});
