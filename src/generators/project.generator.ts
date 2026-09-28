import { join } from 'node:path';
import type { AddonManifest, GenerationPlan, ProjectConfig, ResolvedAddon } from '../types.js';
import { CliError } from '../types.js';
import {
  copyTemplateDir,
  findTemplatesRoot,
  readJsonFile,
  restoreSentinelFiles,
  writeTextFile,
} from '../utils/filesystem.js';

/** Base templates the CLI knows how to build, keyed by the id used in `addon.json`. */
export const BASE_TEMPLATES = {
  'express-ts': 'express-ts',
} as const;

export type BaseTemplateId = keyof typeof BASE_TEMPLATES;

export function resolveBaseTemplateId(config: ProjectConfig): BaseTemplateId {
  if (config.framework === 'express' && config.language === 'typescript') {
    return 'express-ts';
  }
  throw new CliError(`No template is available for ${config.framework} + ${config.language}.`);
}

/**
 * Decides which addons to layer on top of the base template.
 *
 * Order matters: later addons may replace files contributed by earlier ones, and
 * the `package.json` merge follows the same order. Keeping this a pure function
 * lets the composition rules be unit tested without touching the filesystem.
 */
export function selectAddons(config: ProjectConfig): string[] {
  const addons: string[] = [];
  if (config.orm === 'prisma') addons.push('prisma');
  if (config.orm === 'mongoose') addons.push('mongoose');
  if (config.auth === 'jwt') addons.push('jwt');
  if (config.redis) addons.push('redis');
  if (config.docker) addons.push('docker');
  return addons;
}

export function resolveAddons(templatesRoot: string, names: string[]): ResolvedAddon[] {
  return names.map((name) => {
    const dir = join(templatesRoot, 'addons', name);
    let manifest: AddonManifest;
    try {
      manifest = readJsonFile<AddonManifest>(join(dir, 'addon.json'));
    } catch (err) {
      throw new CliError(`The "${name}" addon is missing a readable addon.json.`, [
        err instanceof Error ? err.message : String(err),
        'This is a bug in create-rohit-app; please report it with the template name above.',
      ]);
    }
    if (manifest.name !== name) {
      throw new CliError(`The "${name}" addon declares the name "${manifest.name}" in its manifest.`);
    }
    return { name, dir, manifest };
  });
}

export function planProject(config: ProjectConfig, templatesRoot: string = findTemplatesRoot()): GenerationPlan {
  const baseTemplate = resolveBaseTemplateId(config);
  const addons = resolveAddons(templatesRoot, selectAddons(config));

  for (const addon of addons) {
    const supported = addon.manifest.baseTemplates;
    if (supported.length > 0 && !supported.includes(baseTemplate)) {
      throw new CliError(`The "${addon.name}" addon cannot be layered on the "${baseTemplate}" template.`, [
        `It supports: ${supported.join(', ')}`,
      ]);
    }
  }

  return { baseTemplate, baseDir: join(templatesRoot, 'base', baseTemplate), addons };
}

/**
 * Materialises the plan on disk: the base template first, then each addon on
 * top of it. Addon files intentionally overwrite base files, which is what makes
 * the composition model work.
 */
export function copyPlan(config: ProjectConfig, plan: GenerationPlan): void {
  copyTemplateDir(plan.baseDir, config.targetDir, false);
  for (const addon of plan.addons) {
    copyTemplateDir(addon.dir, config.targetDir, true);
  }
  restoreSentinelFiles(config.targetDir);
}

/**
 * Rewrites `src/bootstrap/index.ts` with one side-effect import per optional
 * feature.
 *
 * The imports are written out explicitly instead of being discovered at runtime:
 * a missing import then fails at compile time, and the generated project needs no
 * directory scanning or top-level await to boot.
 */
export function writeBootstrapIndex(targetDir: string, addons: ResolvedAddon[]): void {
  const modules = addons.flatMap((addon) => addon.manifest.bootstrap ?? []);

  const contents =
    modules.length === 0
      ? BOOTSTRAP_HEADER
      : [
          BOOTSTRAP_HEADER,
          '',
          '// Registered by create-rohit-app for the selected features:',
          ...modules.map((module) => `import './${module}.js';`),
          '',
        ].join('\n');

  writeTextFile(join(targetDir, 'src', 'bootstrap', 'index.ts'), contents);
}

const BOOTSTRAP_HEADER = [
  '/**',
  ' * Optional features register their startup and shutdown hooks here.',
  ' *',
  ' * create-rohit-app writes the import list below when it scaffolds a project with',
  ' * a database or cache. The empty version is what the base template ships with, so',
  ' * the template is a complete, runnable project on its own.',
  ' *',
  ' * To add one by hand, drop a module in this directory and import it below:',
  ' *',
  " *   import './my-feature.js';",
  ' */',
  'export {};',
].join('\n');

/** Labels for the CLI summary, e.g. `['Prisma', 'JWT', 'Redis']`. */
export function describeAddons(plan: GenerationPlan): string[] {
  return plan.addons.map((addon) => addon.manifest.description || addon.name);
}
