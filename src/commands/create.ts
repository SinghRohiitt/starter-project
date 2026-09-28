import { basename } from 'node:path';
import type { Logger, ProjectConfig } from '../types.js';
import { CliError } from '../types.js';
import { copyPlan, planProject, writeBootstrapIndex } from '../generators/project.generator.js';
import { writePackageJson } from '../generators/package.generator.js';
import { writeEnvFiles } from '../generators/env.generator.js';
import { isEmptyDirectory, listEntries, pathExists, readOwnPackageJson, removeDir } from '../utils/filesystem.js';
import { getInstallSpec, getRunSpec, run } from '../utils/package-manager.js';
import { buildProjectConfig } from '../utils/project-config.js';
import { validateProjectName } from '../utils/validators.js';

export type CreateDeps = {
  logger: Logger;
  cwd: string;
  /**
   * Receives a callback that removes the directory being generated, so the
   * entry point can clean up when the user presses Ctrl+C.
   */
  registerCleanup?: (cleanup: () => void) => void;
};

/**
 * Orchestrates the whole create flow.
 *
 * Each step reports a single success line through a spinner, and any failure
 * before the project is usable removes the directory we created so the user is
 * never left with a half-written project.
 */
export async function createProject(projectNameArg: string, deps: CreateDeps): Promise<void> {
  const { logger, cwd } = deps;

  logger.banner(readOwnPackageJson().version);

  const nameCheck = validateProjectName(projectNameArg);
  if (!nameCheck.valid) {
    throw new CliError(`"${projectNameArg.trim()}" is not a valid project name.`, nameCheck.errors);
  }
  for (const warning of nameCheck.warnings) {
    logger.warn(warning);
  }

  const config = buildProjectConfig({ projectName: nameCheck.packageName }, cwd);
  logger.success(`Project name: ${config.projectName}`);

  assertTargetDirectoryIsUsable(config, logger);

  const plan = planProject(config);
  const createdDirectory = !pathExists(config.targetDir);

  // Registered before the first write so an interrupt mid-copy also cleans up.
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp || !createdDirectory) return;
    cleanedUp = true;
    removeDir(config.targetDir);
  };
  deps.registerCleanup?.(cleanup);

  const structure = logger.start('Creating project...');
  try {
    copyPlan(config, plan);
    writeBootstrapIndex(config.targetDir, plan.addons);
    writePackageJson(config.targetDir, config, plan.addons);
    writeEnvFiles(config.targetDir, plan.addons);
  } catch (err) {
    structure.fail('Creating project');
    cleanup();
    throw err instanceof CliError ? err : new CliError(describe(err));
  }
  structure.succeed('Project structure created');

  const install = getInstallSpec(config.packageManager, config.targetDir);
  const dependencies = logger.start('Installing dependencies');
  try {
    await run(install);
  } catch (err) {
    dependencies.fail('Dependencies not installed');
    // The project files are complete, so deleting them here would be destructive.
    throw new CliError(
      `Dependency installation failed (${describe(err)}).`,
      [`The project was still created in "${basename(config.targetDir)}".`, `Run \`${install.hint}\` there to retry.`],
    );
  }
  dependencies.succeed('Dependencies installed');
  cleanedUp = true;

  logger.blank();
  logger.celebrate('Project created successfully!');
  logger.nextSteps([
    `cd ${basename(config.targetDir)}`,
    getRunSpec(config.packageManager, 'dev', config.targetDir).hint,
  ]);
}

/**
 * Refuses to write into an existing non-empty directory, which is the one case
 * where continuing could destroy work the user already has.
 */
export function assertTargetDirectoryIsUsable(config: ProjectConfig, logger: Logger): void {
  if (!pathExists(config.targetDir)) return;
  if (isEmptyDirectory(config.targetDir)) {
    logger.info(`Using the existing empty directory "${basename(config.targetDir)}"`);
    return;
  }

  const existing = listEntries(config.targetDir).slice(0, 5);

  throw new CliError(
    `Directory "${basename(config.targetDir)}" already exists and is not empty.`,
    [
      ...existing.map((entry) => `It already contains: ${entry}`),
      'Nothing was changed.',
      'Choose a different project name, or remove the directory and run the command again.',
    ],
  );
}

export function describe(err: unknown): string {
  if (err instanceof Error) return (err.message.split('\n')[0] ?? err.message).trim();
  return String(err);
}
