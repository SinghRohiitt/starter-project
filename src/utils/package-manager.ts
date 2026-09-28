import { execa } from 'execa';
import type { PackageManager } from '../types.js';

export const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

export type RunSpec = {
  command: string;
  args: string[];
  /** Working directory for the child process. */
  cwd: string;
  /** Command as it should be shown to the user, e.g. `npx prisma generate`. */
  hint: string;
};

/**
 * Reads the package manager that invoked this process. `npm_config_user_agent`
 * is set by npm/pnpm/yarn/bun for child processes, e.g.
 * `pnpm/9.12.0 npm/? node/v22.0.0 win32 x64`.
 */
export function detectPackageManager(userAgent?: string): PackageManager {
  const ua = userAgent ?? process.env.npm_config_user_agent ?? process.env.npm_config_userAgent ?? '';
  if (/\bpnpm\//.test(ua)) return 'pnpm';
  if (/\byarn\//.test(ua)) return 'yarn';
  if (/\bbun\//.test(ua)) return 'bun';
  if (/\bnpm\//.test(ua)) return 'npm';
  return 'npm';
}

/** The command that installs dependencies in `cwd`. */
export function getInstallSpec(pm: PackageManager, cwd: string): RunSpec {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['install'], cwd, hint: 'pnpm install' };
    case 'yarn':
      return { command: 'yarn', args: ['install'], cwd, hint: 'yarn install' };
    case 'bun':
      return { command: 'bun', args: ['install'], cwd, hint: 'bun install' };
    case 'npm':
    default:
      return { command: 'npm', args: ['install'], cwd, hint: 'npm install' };
  }
}

/** The command that runs a package.json script. */
export function getRunSpec(pm: PackageManager, script: string, cwd: string): RunSpec {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['run', script], cwd, hint: `pnpm ${script}` };
    case 'yarn':
      return { command: 'yarn', args: [script], cwd, hint: `yarn ${script}` };
    case 'bun':
      return { command: 'bun', args: ['run', script], cwd, hint: `bun run ${script}` };
    case 'npm':
    default:
      return { command: 'npm', args: ['run', script], cwd, hint: `npm run ${script}` };
  }
}

/** The command that executes a locally installed binary, e.g. `npx prisma generate`. */
export function getExecSpec(pm: PackageManager, binary: string, args: string[], cwd: string): RunSpec {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['exec', binary, ...args], cwd, hint: `pnpm exec ${binary} ${args.join(' ')}`.trim() };
    case 'yarn':
      return { command: 'yarn', args: [binary, ...args], cwd, hint: `yarn ${binary} ${args.join(' ')}`.trim() };
    case 'bun':
      return { command: 'bunx', args: [binary, ...args], cwd, hint: `bunx ${binary} ${args.join(' ')}`.trim() };
    case 'npm':
    default:
      return { command: 'npx', args: ['--no-install', binary, ...args], cwd, hint: `npx ${binary} ${args.join(' ')}`.trim() };
  }
}

/**
 * Runs a command to completion.
 *
 * Output is captured rather than inherited: the CLI draws a spinner on stdout
 * and a child process writing to it would corrupt the frame. Stdin is closed so
 * a package manager that tries to prompt can never hang the CLI.
 */
export async function run(spec: RunSpec): Promise<void> {
  try {
    await execa(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(decorateFailure(spec, err));
  }
}

/** Turns an execa failure into a short message a user can act on. */
function decorateFailure(spec: RunSpec, err: unknown): string {
  const exitCode = typeof (err as { exitCode?: unknown })?.exitCode === 'number' ? (err as { exitCode: number }).exitCode : null;
  const stderr = String((err as { stderr?: unknown })?.stderr ?? '').trim();
  const tail = stderr.split('\n').slice(-6).join('\n');
  const base = exitCode === null ? `\`${spec.hint}\` failed` : `\`${spec.hint}\` exited with code ${exitCode}`;
  return tail.length > 0 ? `${base}\n${tail}` : base;
}

export async function isCommandAvailable(command: string, args: string[] = ['--version']): Promise<boolean> {
  const result = await execa(command, args, { reject: false });
  return result.exitCode === 0;
}
