import { execFile, spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';

/** The spawned server process: stdin is closed, stdout and stderr are piped. */
export type GeneratedServerProcess = ChildProcessByStdio<null, Readable, Readable>;

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cliEntry = join(repoRoot, 'dist', 'index.js');

const createdDirs: string[] = [];

/** A scratch directory outside the repo, removed by `cleanupTempDirs()`. */
export function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'create-rohit-app-'));
  createdDirs.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of createdDirs.splice(0)) {
    fse.removeSync(dir);
  }
}

export type CliResult = { exitCode: number; stdout: string; stderr: string };

/** Runs the built CLI in `cwd` and captures its output instead of inheriting it. */
export function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): CliResult {
  const child = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  return {
    exitCode: child.status ?? 1,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  };
}

/** Scaffolds a project and returns the directory it was created in. */
export function scaffold(cwd: string, projectName: string, args: string[] = []): string {
  const result = runCli(cwd, [projectName, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`create-rohit-app failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`);
  }
  return join(cwd, projectName);
}

export function readPackageJson(projectDir: string): {
  name: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return fse.readJsonSync(join(projectDir, 'package.json'));
}

export function readEnvFile(projectDir: string, fileName: string): string {
  return fse.readFileSync(join(projectDir, fileName), 'utf8');
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    execFile(
      command,
      args,
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        // On Windows the package manager is a `.cmd` shim, which cannot be exec'd directly.
        shell: process.platform === 'win32',
      },
      (error, stdout, stderr) => {
        const exitCode = error === null ? 0 : ((error as { code?: number }).code ?? 1);
        resolvePromise({ exitCode, stdout, stderr });
      },
    );
  });
}

export type RunningServer = {
  process: GeneratedServerProcess;
  output: () => string;
  stop: () => Promise<void>;
};

export type StartServerOptions = {
  projectDir: string;
  /** Defaults to `dist/server.js`, so build the project first. */
  entry?: string;
  port: number;
  env?: NodeJS.ProcessEnv;
};

/** Starts the generated server and waits until it answers on `port`. */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { projectDir, entry = join('dist', 'server.js'), port, env = {} } = options;

  const child = spawn(process.execPath, [entry], {
    cwd: projectDir,
    env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    output += chunk;
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Generated server exited early (code ${child.exitCode}):\n${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return {
          process: child,
          output: () => output,
          stop: () => stopServer(child),
        };
      }
    } catch {
      // Not listening yet.
    }
    await delay(250);
  }

  child.kill('SIGKILL');
  throw new Error(`Generated server did not become ready on port ${port}:\n${output}`);
}

export async function stopServer(child: GeneratedServerProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolvePromise) => child.once('exit', () => resolvePromise()));
  child.kill();
  const timedOut = await Promise.race([exited.then(() => false), delay(5000).then(() => true)]);
  if (timedOut) child.kill('SIGKILL');
  await exited;
}

export type HttpResult = { status: number; body: unknown; headers: Headers };

export async function requestJson(
  port: number,
  path: string,
  init: RequestInit = {},
): Promise<HttpResult> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    // Leave the raw text as the body so assertions show what actually came back.
  }
  return { status: response.status, body, headers: response.headers };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Files a base project is expected to contain, used across the integration suites. */
export const BASE_TEMPLATE_FILES = [
  'package.json',
  'tsconfig.json',
  'README.md',
  '.env',
  '.env.example',
  '.gitignore',
  'src/app.ts',
  'src/server.ts',
  'src/lifecycle.ts',
  'src/bootstrap/index.ts',
  'src/config/env.ts',
  'src/controllers/health.controller.ts',
  'src/middleware/error-handler.ts',
  'src/middleware/not-found.ts',
  'src/middleware/request-id.ts',
  'src/middleware/request-logger.ts',
  'src/routes/health.routes.ts',
  'src/routes/index.ts',
  'src/services/health.service.ts',
  'src/utils/api-error.ts',
  'src/utils/logger.ts',
];
