import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import fse from 'fs-extra';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntry = join(repoRoot, 'dist', 'index.js');

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cra-phase1-'));
  tempDirs.push(dir);
  return dir;
}

type CliResult = { exitCode: number; stdout: string; stderr: string };

function runCli(cwd: string, args: string[]): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [cliEntry, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    const failure = err as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

afterAll(() => {
  for (const dir of tempDirs) {
    fse.removeSync(dir);
  }
});

describe('create-rohit-app CLI (built bundle)', () => {
  it('prints help and exits successfully', () => {
    const result = runCli(process.cwd(), ['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: create-rohit-app');
    expect(result.stdout).toContain('<projectName>');
  });

  it('prints the version from package.json', () => {
    const result = runCli(process.cwd(), ['--version']);
    const expected = fse.readJsonSync(join(repoRoot, 'package.json')).version as string;
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(expected);
  });

  it('fails without a project name and shows an example', () => {
    const result = runCli(process.cwd(), []);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required argument 'projectName'");
    expect(result.stderr).toContain('npx create-rohit-app my-api');
  });

  it('rejects an invalid project name and creates nothing', () => {
    const cwd = createTempDir();
    const result = runCli(cwd, ['My Bad_Name']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('is not a valid project name');
    expect(fse.readdirSync(cwd)).toEqual([]);
  });

  it('refuses to overwrite a non-empty directory', () => {
    const cwd = createTempDir();
    fse.ensureDirSync(join(cwd, 'taken'));
    fse.writeFileSync(join(cwd, 'taken', 'important.txt'), 'keep me');

    const result = runCli(cwd, ['taken']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already exists and is not empty');
    expect(fse.readFileSync(join(cwd, 'taken', 'important.txt'), 'utf8')).toBe('keep me');
  });

  it('scaffolds a project, installs dependencies, and it builds', () => {
    const cwd = createTempDir();
    const result = runCli(cwd, ['my-api']);
    expect(result.exitCode, result.stderr).toBe(0);

    const projectDir = join(cwd, 'my-api');
    for (const file of ['package.json', 'tsconfig.json', 'src/server.ts', '.env', '.env.example', '.gitignore', 'README.md']) {
      expect(fse.pathExistsSync(join(projectDir, file)), `expected ${file}`).toBe(true);
    }

    const pkg = fse.readJsonSync(join(projectDir, 'package.json')) as {
      name: string;
      type: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('my-api');
    expect(pkg.type).toBe('module');
    expect(pkg.scripts['dev']).toBeDefined();
    expect(pkg.dependencies['express']).toBeDefined();
    expect(fse.pathExistsSync(join(projectDir, 'node_modules'))).toBe(true);

    // Proves the generated project really compiles, not just that files exist.
    execFileSync('npm', ['run', 'build'], { cwd: projectDir, stdio: 'pipe', shell: true });
    expect(fse.pathExistsSync(join(projectDir, 'dist', 'server.js'))).toBe(true);
  });
});
