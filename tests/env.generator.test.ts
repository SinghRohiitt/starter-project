import { describe, expect, it } from 'vitest';
import {
  buildEnvFiles,
  isSecretKey,
  parseEnvEntries,
  renderEnvSection,
  substituteEnvValues,
  uncommentEnvText,
} from '../src/generators/env.generator.js';
import type { ResolvedAddon } from '../src/types.js';

const BASE_EXAMPLE = `# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug

# Comma separated list of allowed origins, or * to allow any
CORS_ORIGIN=*
`;

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

describe('parseEnvEntries', () => {
  it('reads plain assignments', () => {
    expect([...parseEnvEntries('A=1\nB=two\n').entries()]).toEqual([
      ['A', '1'],
      ['B', 'two'],
    ]);
  });

  it('reads commented-out assignments, which is how optional keys are stored', () => {
    expect(parseEnvEntries('# A=1\n').get('A')).toBe('1');
  });

  it('strips surrounding quotes', () => {
    expect(parseEnvEntries('A="hello world"\nB=\'x\'\n').get('A')).toBe('hello world');
    expect(parseEnvEntries('B=\'x\'\n').get('B')).toBe('x');
  });

  it('ignores comments that are not assignments and blank lines', () => {
    expect(parseEnvEntries('# just a comment\n\nA=1\n').size).toBe(1);
  });

  it('keeps a value containing an equals sign intact', () => {
    expect(parseEnvEntries('URL=postgres://u:p@h/db?x=1\n').get('URL')).toBe('postgres://u:p@h/db?x=1');
  });
});

describe('uncommentEnvText', () => {
  it('activates commented assignments and leaves comments alone', () => {
    expect(uncommentEnvText('# A=1\n# a note\nB=2\n')).toBe('A=1\n# a note\nB=2\n');
  });

  it('is idempotent', () => {
    const once = uncommentEnvText('# A=1\n');
    expect(uncommentEnvText(once)).toBe(once);
  });

  it('does not uncomment a comment that merely contains an equals sign', () => {
    expect(uncommentEnvText('# note: a=b\n')).toBe('# note: a=b\n');
  });
});

describe('substituteEnvValues', () => {
  it('replaces the value of an active assignment', () => {
    expect(substituteEnvValues('A=1\n', () => ({ value: 'x' }))).toBe('A=x\n');
  });

  it('replaces the value of a commented assignment', () => {
    expect(substituteEnvValues('# A=1\n', () => ({ value: 'x' }))).toBe('# A=x\n');
  });

  it('keeps the line untouched when the resolver returns undefined', () => {
    expect(substituteEnvValues('A=1\n', () => undefined)).toBe('A=1\n');
  });

  it('receives the unquoted current value', () => {
    const seen: Array<[string, string]> = [];
    substituteEnvValues('A="hello world"\n', (key, current) => {
      seen.push([key, current]);
      return undefined;
    });
    expect(seen).toEqual([['A', 'hello world']]);
  });

  it('quotes a replacement that contains a space and appends the comment', () => {
    expect(substituteEnvValues('A=1\n', () => ({ value: 'a b', comment: 'why' }))).toBe('A="a b" # why\n');
  });

  it('quotes a replacement containing a hash so it is not read as a comment', () => {
    expect(substituteEnvValues('A=1\n', () => ({ value: 'abc # def' }))).toBe('A="abc # def"\n');
  });
});

describe('isSecretKey', () => {
  it.each(['JWT_SECRET', 'DB_PASSWORD', 'API_KEY', 'ACCESS_TOKEN', 'PRIVATE_KEY'])(
    'treats %s as a secret',
    (key) => {
      expect(isSecretKey(key)).toBe(true);
    },
  );

  it.each(['PORT', 'HOST', 'NODE_ENV', 'DATABASE_URL', 'MONGODB_URI', 'REDIS_URL'])(
    'treats %s as a plain value',
    (key) => {
      expect(isSecretKey(key)).toBe(false);
    },
  );

  it('never treats a public key as a secret, since it ships to the browser', () => {
    expect(isSecretKey('PUBLIC_API_KEY')).toBe(false);
  });
});

describe('renderEnvSection', () => {
  const section = { title: 'Prisma', values: { DATABASE_URL: 'postgres://localhost/app' }, optional: { POOL_SIZE: '5' } };

  it('comments everything out for the example file', () => {
    expect(renderEnvSection(section, { commented: true })).toBe(
      '# Prisma\n# DATABASE_URL=postgres://localhost/app\n# POOL_SIZE=5',
    );
  });

  it('activates required values but leaves optional ones commented', () => {
    expect(renderEnvSection(section, { commented: false })).toBe(
      '# Prisma\nDATABASE_URL=postgres://localhost/app\n# POOL_SIZE=5',
    );
  });
});

describe('buildEnvFiles', () => {
  it('keeps the base example as the authoritative key list', () => {
    const { envExample } = buildEnvFiles({ baseExample: BASE_EXAMPLE, addons: [] });
    expect(envExample).toContain('PORT=3000');
    expect(envExample).toContain('CORS_ORIGIN=*');
    expect(envExample).toContain('# Comma separated list of allowed origins');
  });

  it('appends each addon as a commented block in the example file', () => {
    const { envExample } = buildEnvFiles({
      baseExample: BASE_EXAMPLE,
      addons: [addon('prisma', { env: { DATABASE_URL: 'postgresql://CHANGE_ME' } })],
    });
    expect(envExample).toContain('# Prisma\n# DATABASE_URL=postgresql://CHANGE_ME');
  });

  it('activates the base keys in .env', () => {
    const { env } = buildEnvFiles({ baseExample: BASE_EXAMPLE, addons: [] });
    expect(env).toContain('PORT=3000');
    expect(env).toContain('CORS_ORIGIN=*');
  });

  it('activates addon keys as plain assignments in .env', () => {
    const { env } = buildEnvFiles({
      baseExample: BASE_EXAMPLE,
      addons: [addon('redis', { env: { REDIS_URL: 'redis://localhost:6379' } })],
    });
    expect(env).toContain('REDIS_URL=redis://localhost:6379');
    expect(env).not.toContain('# REDIS_URL');
  });

  it('generates a random secret for secret keys instead of shipping a placeholder', () => {
    const base = 'JWT_SECRET=CHANGE_ME_IN_PRODUCTION\nJWT_EXPIRES_IN=15m\n';
    const first = buildEnvFiles({ baseExample: base, addons: [] }).env;
    const second = buildEnvFiles({ baseExample: base, addons: [] }).env;

    expect(first).toMatch(/JWT_SECRET=\S+ # generated locally/);
    expect(first).not.toContain('CHANGE_ME_IN_PRODUCTION');
    expect(first).toContain('JWT_EXPIRES_IN=15m');
    // A fresh secret per generated project: two runs must not match.
    expect(secretOf(first)).not.toBe(secretOf(second));
  });

  it('keeps the placeholder in the example file', () => {
    const { envExample } = buildEnvFiles({ baseExample: 'JWT_SECRET=CHANGE_ME_IN_PRODUCTION\n', addons: [] });
    expect(envExample).toContain('JWT_SECRET=CHANGE_ME_IN_PRODUCTION');
    expect(envExample).not.toContain('generated locally');
  });

  it('documents that .env is local only', () => {
    const { env } = buildEnvFiles({ baseExample: BASE_EXAMPLE, addons: [] });
    expect(env).toContain('# Local development environment');
    expect(env).toContain('Rotate them before deploying');
  });

  it('applies overrides to a key owned by the base template', () => {
    const { env, envExample } = buildEnvFiles({
      baseExample: 'DATABASE_URL=postgresql://localhost:5432/app\n',
      addons: [],
      overrides: { DATABASE_URL: 'postgresql://db:5432/app' },
    });
    expect(env).toContain('DATABASE_URL=postgresql://db:5432/app');
    expect(envExample).toContain('DATABASE_URL=postgresql://db:5432/app');
  });

  it('places addon blocks after the base keys', () => {
    const { envExample } = buildEnvFiles({
      baseExample: BASE_EXAMPLE,
      addons: [addon('redis', { env: { REDIS_URL: 'redis://localhost:6379' } })],
    });
    expect(envExample.indexOf('CORS_ORIGIN=*')).toBeLessThan(envExample.indexOf('# Redis'));
  });

  it('leaves optional addon keys commented in .env so they can be enabled by hand', () => {
    const { env } = buildEnvFiles({
      baseExample: BASE_EXAMPLE,
      addons: [addon('redis', { env: {}, optionalEnv: { REDIS_KEY_PREFIX: 'app:' } })],
    });
    expect(env).toContain('# REDIS_KEY_PREFIX=app:');
  });

  it('appends extra sections supplied by a generator, such as Docker', () => {
    const { env, envExample } = buildEnvFiles({
      baseExample: BASE_EXAMPLE,
      addons: [],
      extraSections: [{ title: 'Docker', values: { COMPOSE_PROJECT_NAME: 'app' }, optional: {} }],
    });
    expect(env).toContain('COMPOSE_PROJECT_NAME=app');
    expect(envExample).toContain('# COMPOSE_PROJECT_NAME=app');
  });
});

function secretOf(envText: string): string {
  return /JWT_SECRET=(\S+)/.exec(envText)?.[1] ?? '';
}
