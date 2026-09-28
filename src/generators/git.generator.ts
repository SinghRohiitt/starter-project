import type { ProjectConfig, ResolvedAddon } from '../types.js';
import { getExecSpec, isCommandAvailable, run } from '../utils/package-manager.js';

export type GitInitResult = {
  initialized: boolean;
  committed: boolean;
  /** Set when git is unavailable or a step failed, so the CLI can warn. */
  reason?: string;
};

export type GitInitOptions = {
  targetDir: string;
  projectName: string;
  commit: boolean;
};

/**
 * Initialises a git repository and makes the first commit.
 *
 * Never throws: a missing git binary, no configured committer identity, or a
 * failing hook must not fail an otherwise complete scaffolding run.
 */
export async function initGitRepository(options: GitInitOptions): Promise<GitInitResult> {
  const { targetDir, projectName, commit } = options;

  if (!(await isCommandAvailable('git'))) {
    return { initialized: false, committed: false, reason: 'git is not installed or not on PATH' };
  }

  // `-b main` requires git >= 2.28; fall back to a bare init on older versions.
  const createdWithBranch = await runGit(['init', '-b', 'main'], targetDir);
  if (!createdWithBranch) {
    const created = await runGit(['init'], targetDir);
    if (!created) {
      return { initialized: false, committed: false, reason: '`git init` failed' };
    }
  }

  if (!commit) {
    return { initialized: true, committed: false };
  }

  if (!(await runGit(['add', '--all'], targetDir))) {
    return { initialized: true, committed: false, reason: '`git add` failed' };
  }

  const message = `chore: scaffold ${projectName} with create-rohit-app`;
  if (!(await runGit(['commit', '-m', message], targetDir))) {
    return {
      initialized: true,
      committed: false,
      reason: 'repository created, but the initial commit failed — check your git user.name and user.email',
    };
  }

  return { initialized: true, committed: true };
}

/**
 * Runs the post-install commands declared by addons (e.g. `prisma generate`).
 * Failures are returned instead of thrown: by this point the project files on
 * disk are already correct and the user can re-run the command themselves.
 */
export async function runAddonPostInstall(addons: ResolvedAddon[], config: ProjectConfig): Promise<string[]> {
  const failures: string[] = [];
  for (const addon of addons) {
    for (const command of addon.manifest.postInstall) {
      const [binary, ...args] = command.split(/\s+/);
      if (binary === undefined || binary === '') continue;
      try {
        await run(getExecSpec(config.packageManager, binary, args, config.targetDir));
      } catch (err) {
        failures.push(`\`${command}\` failed: ${describe(err)}`);
      }
    }
  }
  return failures;
}

/** Runs a git subcommand, returning false instead of throwing when it fails. */
async function runGit(args: string[], cwd: string): Promise<boolean> {
  try {
    await run({ command: 'git', args, cwd, hint: `git ${args.join(' ')}` });
    return true;
  } catch {
    return false;
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message.split('\n')[0] ?? err.message;
  return String(err);
}
