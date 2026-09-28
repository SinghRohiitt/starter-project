import { join } from 'node:path';
import fse from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE_FILES,
  cleanupTempDirs,
  createTempDir,
  delay,
  readEnvFile,
  readPackageJson,
  requestJson,
  runCli,
  runCommand,
  scaffold,
  startServer,
} from '../helpers/generated-project.js';

afterAll(cleanupTempDirs);

describe('CLI surface', () => {
  it('prints help and exits successfully', () => {
    const result = runCli(process.cwd(), ['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: create-rohit-app');
    expect(result.stdout).toContain('<projectName>');
  });

  it('prints the version from package.json', () => {
    const result = runCli(process.cwd(), ['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(fse.readJsonSync('package.json').version);
  });

  it('fails without a project name and shows an example', () => {
    const result = runCli(process.cwd(), []);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required argument 'projectName'");
    expect(result.stderr).toContain('npx create-rohit-app my-api');
  });

  it('rejects an unknown flag', () => {
    const result = runCli(process.cwd(), ['my-api', '--nope']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown option '--nope'");
  });
});

describe('input validation', () => {
  it('rejects an invalid project name and creates nothing', () => {
    const cwd = createTempDir();
    const result = runCli(cwd, ['My Bad_Name']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('is not a valid project name');
    expect(fse.readdirSync(cwd)).toEqual([]);
  });

  it('refuses to overwrite a non-empty directory and leaves it untouched', () => {
    const cwd = createTempDir();
    fse.ensureDirSync(join(cwd, 'taken'));
    fse.writeFileSync(join(cwd, 'taken', 'important.txt'), 'keep me');

    const result = runCli(cwd, ['taken']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already exists and is not empty');
    expect(fse.readFileSync(join(cwd, 'taken', 'important.txt'), 'utf8')).toBe('keep me');
  });

  it('uses an existing empty directory', () => {
    const cwd = createTempDir();
    fse.ensureDirSync(join(cwd, 'empty-one'));
    const result = runCli(cwd, ['empty-one']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(fse.pathExistsSync(join(cwd, 'empty-one', 'package.json'))).toBe(true);
  });
});

describe('base template (express + typescript)', () => {
  it('scaffolds every file the base template defines', () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');

    for (const file of BASE_TEMPLATE_FILES) {
      expect(fse.pathExistsSync(join(projectDir, file)), `expected ${file}`).toBe(true);
    }
  });

  it('renames the _gitignore sentinel that npm would otherwise drop from the tarball', () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');
    expect(fse.pathExistsSync(join(projectDir, '_gitignore'))).toBe(false);
    expect(fse.readFileSync(join(projectDir, '.gitignore'), 'utf8')).toContain('node_modules/');
  });

  it('sets the package metadata and only the dependencies the base needs', () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');
    const pkg = readPackageJson(projectDir);

    expect(pkg.name).toBe('my-api');
    expect(pkg.scripts['dev']).toBe('tsx watch src/server.ts');
    expect(pkg.scripts['build']).toBe('tsc -p tsconfig.json');
    expect(pkg.scripts['start']).toBe('node dist/server.js');

    expect(Object.keys(pkg.dependencies).sort()).toEqual(['cors', 'dotenv', 'express', 'zod']);
    // Nothing optional may leak in before the user asks for it.
    for (const optional of ['prisma', '@prisma/client', 'mongoose', 'jsonwebtoken', 'bcrypt', 'ioredis']) {
      expect(pkg.dependencies[optional], `${optional} must not be installed`).toBeUndefined();
      expect(pkg.devDependencies[optional], `${optional} must not be installed`).toBeUndefined();
    }
  });

  it('generates a .env that is active and a .env.example that documents the same keys', () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');
    const env = readEnvFile(projectDir, '.env');
    const example = readEnvFile(projectDir, '.env.example');

    expect(env).toContain('PORT=3000');
    expect(env).toContain('NODE_ENV=development');
    expect(env).toContain('# Local development environment');
    expect(example).toContain('PORT=3000');
    expect(example).toContain('CORS_ORIGIN=*');
  });

  it('leaves the bootstrap index empty when no optional feature is selected', () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');
    const bootstrap = fse.readFileSync(join(projectDir, 'src', 'bootstrap', 'index.ts'), 'utf8');
    // Real import statements only: the header documents the format in a comment.
    const imports = bootstrap.split('\n').filter((line) => /^import '\.\//.test(line));
    expect(imports).toEqual([]);
  });

  it('builds with the TypeScript compiler and runs, serving the health check', async () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');

    const build = await runCommand('npm', ['run', 'build'], projectDir);
    expect(build.exitCode, `tsc reported errors:\n${build.stdout}\n${build.stderr}`).toBe(0);
    expect(fse.pathExistsSync(join(projectDir, 'dist', 'server.js'))).toBe(true);

    const server = await startServer({ projectDir, port: 34_101 });
    try {
      const health = await requestJson(34_101, '/health');
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({ status: 'ok' });
      expect(typeof (health.body as { uptimeSeconds: number }).uptimeSeconds).toBe('number');

      // Every response carries a request id for cross-service tracing.
      expect(health.headers.get('x-request-id')).toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it('answers unmatched routes with a consistent JSON error', async () => {
    const cwd = createTempDir();
    const projectDir = scaffold(cwd, 'my-api');
    expect((await runCommand('npm', ['run', 'build'], projectDir)).exitCode).toBe(0);

    const server = await startServer({ projectDir, port: 34_102 });
    try {
      const missing = await requestJson(34_102, '/does-not-exist');
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Cannot GET /does-not-exist' } });
    } finally {
      await server.stop();
    }
  });
});

describe('error handling', () => {
  /**
   * A route that throws, used to check what a genuine bug looks like on the wire.
   * Routes added by the user land in a feature router, which is the same path a
   * database or auth failure from a later phase would take.
   */
  async function scaffoldWithThrowingRoute(cwd: string, name = 'my-api'): Promise<string> {
    const projectDir = scaffold(cwd, name);
    const routes = join(projectDir, 'src', 'routes', 'health.routes.ts');
    fse.appendFileSync(
      routes,
      "\nhealthRouter.get('/boom', () => {\n  throw new Error('intentional failure');\n});\n",
      'utf8',
    );
    const build = await runCommand('npm', ['run', 'build'], projectDir);
    expect(build.exitCode, `tsc reported errors:\n${build.stdout}\n${build.stderr}`).toBe(0);
    return projectDir;
  }

  it('never leaks a stack trace for an expected client error', async () => {
    const projectDir = await scaffoldWithThrowingRoute(createTempDir());
    const server = await startServer({ projectDir, port: 34_103 });
    try {
      const missing = await requestJson(34_103, '/does-not-exist');
      expect(missing.status).toBe(404);
      expect(JSON.stringify(missing.body)).not.toContain('stack');
    } finally {
      await server.stop();
    }
  });

  it('includes the stack for an unexpected error in development, so it is debuggable', async () => {
    const projectDir = await scaffoldWithThrowingRoute(createTempDir());
    const server = await startServer({ projectDir, port: 34_104 });
    try {
      const response = await requestJson(34_104, '/health/boom');
      expect(response.status).toBe(500);
      const body = response.body as { error: { code: string; message: string; stack?: string } };
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error.stack).toContain('intentional failure');
    } finally {
      await server.stop();
    }
  });

  it('hides both the message and the stack in production', async () => {
    const projectDir = await scaffoldWithThrowingRoute(createTempDir());
    const server = await startServer({ projectDir, port: 34_105, env: { NODE_ENV: 'production' } });
    try {
      const response = await requestJson(34_105, '/health/boom');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong while handling the request' },
      });
    } finally {
      await server.stop();
    }
  });

  it('logs a rejected request exactly once, and still logs the stack for a 500', async () => {
    const projectDir = await scaffoldWithThrowingRoute(createTempDir());
    const server = await startServer({ projectDir, port: 34_106 });
    try {
      await requestJson(34_106, '/does-not-exist');
      await delay(250);
      const rejectedLines = server.output().split('\n').filter((line) => line.includes('request rejected'));
      // One access log line only: the error handler must not log 4xx a second time.
      expect(rejectedLines).toHaveLength(1);

      await requestJson(34_106, '/health/boom');
      await delay(250);
      const serverErrorLines = server.output().split('\n').filter((line) => line.includes('ERROR'));
      // A 500 keeps the access line plus the diagnostic line carrying the stack.
      expect(serverErrorLines.length).toBeGreaterThanOrEqual(1);
      expect(server.output()).toContain('intentional failure');
    } finally {
      await server.stop();
    }
  });
});
