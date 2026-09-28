import { join } from 'node:path';
import type { ProjectConfig, ProjectOptions } from '../types.js';
import { detectPackageManager } from './package-manager.js';

/** What we fall back to when a prompt is skipped and no flag was supplied. */
export const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
  projectName: '',
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
};

/**
 * Normalises partial options into a complete, self-consistent `ProjectConfig`.
 *
 * This is the only place that turns user input into a config, which keeps the
 * generator layer free of option plumbing and makes the rules (e.g. "no database
 * implies no ORM") testable in isolation.
 */
export function buildProjectConfig(options: Partial<ProjectOptions>, cwd: string = process.cwd()): ProjectConfig {
  const merged: ProjectOptions = { ...DEFAULT_PROJECT_OPTIONS, ...stripUndefined(options) };

  // Keep the config internally consistent: a feature that needs a store cannot
  // be enabled without one.
  const database = merged.database;
  let orm = merged.orm;
  if (database === 'none') orm = 'none';
  if (database === 'postgresql' && orm !== 'prisma') orm = 'prisma';
  if (database === 'mongodb' && orm !== 'mongoose') orm = 'mongoose';

  const directoryName = directoryNameFrom(merged.projectName);

  return {
    projectName: merged.projectName,
    targetDir: join(cwd, directoryName),
    appType: merged.appType,
    framework: merged.framework,
    language: merged.language,
    database,
    orm,
    auth: merged.auth,
    redis: merged.redis,
    docker: merged.docker,
    git: merged.git,
    packageManager: merged.packageManager ?? detectPackageManager(),
  };
}

/** `@acme/my-api` lives in a directory called `my-api`. */
export function directoryNameFrom(projectName: string): string {
  const trimmed = projectName.trim();
  return trimmed.startsWith('@') ? (trimmed.split('/')[1] ?? trimmed) : trimmed;
}

function stripUndefined<T extends object>(input: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Returns a human-readable reason when the requested combination is not
 * implemented yet, or `null` when the CLI can actually build it.
 *
 * Kept separate from the generators so `create` can show "coming soon" details
 * and exit cleanly instead of crashing mid-generation.
 */
export function getUnsupportedReason(config: ProjectConfig): string | null {
  if (config.appType !== 'backend') {
    return `${labelAppType(config.appType)} templates are not available yet.`;
  }
  if (config.framework !== 'express') {
    return 'The NestJS template is not available yet.';
  }
  if (config.language !== 'typescript') {
    return 'JavaScript templates are not available yet.';
  }
  return null;
}

function labelAppType(appType: ProjectConfig['appType']): string {
  switch (appType) {
    case 'fullstack':
      return 'Full Stack';
    case 'frontend':
      return 'Frontend';
    case 'backend':
      return 'Backend';
  }
}
