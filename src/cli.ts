import { Command, CommanderError } from 'commander';
import { createProject, describe } from './commands/create.js';
import type { Logger } from './types.js';
import { CliError } from './types.js';
import { createLogger } from './utils/logger.js';
import { readOwnPackageJson } from './utils/filesystem.js';

export type CliDeps = {
  logger: Logger;
  cwd: string;
  /** Lets the entry point clean up a partially generated project on Ctrl+C. */
  registerCleanup?: (cleanup: () => void) => void;
};

export const DEFAULT_DEPENDENCIES: CliDeps = {
  logger: createLogger(),
  cwd: process.cwd(),
};

export function buildProgram(deps: CliDeps = DEFAULT_DEPENDENCIES): Command {
  const { version } = readOwnPackageJson();

  const program = new Command();
  program
    .name('create-rohit-app')
    .description('Scaffold a production-ready Node.js backend with Express and TypeScript.')
    .version(version, '-v, --version', 'print the version of create-rohit-app')
    .argument('<projectName>', 'name of the project to create, e.g. my-api')
    .allowExcessArguments(false)
    // Commander's own stderr output is suppressed so errors are reported once,
    // through the logger, with consistent formatting. Help and version still
    // reach stdout via writeOut.
    .configureOutput({ writeErr: () => {} })
    .action(async (projectName: string) => {
      await createProject(projectName, deps);
    });

  return program;
}

/**
 * Runs the CLI and resolves with the process exit code instead of exiting, so
 * the whole entry point stays testable and there is a single error boundary.
 */
export async function runCli(argv: string[], deps: CliDeps = DEFAULT_DEPENDENCIES): Promise<number> {
  const program = buildProgram(deps);
  // Take over exits so `--help` and `--version` resolve instead of calling
  // process.exit() inside commander.
  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: 'node' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return reportCommanderError(err, deps.logger);
    }
    if (err instanceof CliError) {
      deps.logger.error(err.message);
      if (err.hint && err.hint.length > 0) {
        deps.logger.blank();
        deps.logger.hint(err.hint);
      }
      return 1;
    }
    deps.logger.error(describe(err));
    return 1;
  }
}

function reportCommanderError(err: CommanderError, logger: Logger): number {
  // `--help` and `--version` already wrote their output to stdout.
  if (err.exitCode === 0) return 0;

  logger.error(err.message.replace(/^error:\s*/, ''));
  if (err.code === 'commander.missingArgument') {
    logger.blank();
    logger.hint(['Example: npx create-rohit-app my-api']);
  }
  return err.exitCode;
}
