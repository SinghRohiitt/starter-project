import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { ResolvedAddon } from '../types.js';
import { readTextFile, writeTextFile } from '../utils/filesystem.js';

/** A block of env lines contributed by one addon. */
export type EnvSection = {
  /** Comment header written above the block, e.g. `Prisma`. */
  title: string;
  /** Written as active `KEY=value` lines. */
  values: Record<string, string>;
  /** Written as commented-out `# KEY=value` lines. */
  optional: Record<string, string>;
};

export type EnvFiles = {
  env: string;
  envExample: string;
};

export type EnvValueResolution = {
  value: string;
  /** Rendered as a trailing comment, used to flag generated secrets. */
  comment?: string;
};

export type EnvValueResolver = (key: string, currentValue: string) => EnvValueResolution | undefined;

const GENERATED_COMMENT = 'generated locally - change before deploying';

const ENV_HEADER = [
  '# Local development environment - created by create-rohit-app.',
  '# Values marked as generated were created for local development only.',
  '# Rotate them before deploying and keep this file out of version control.',
].join('\n');

/**
 * Keys that must never carry a hard-coded value.
 *
 * In `.env` they are replaced with a freshly generated random value so the
 * project runs immediately, while `.env.example` keeps an obvious placeholder.
 */
export function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (upper.startsWith('PUBLIC_')) return false;
  return /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|_KEY|TOKEN)$/.test(upper);
}

export function generateSecret(bytes: number = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Reads every `KEY=value` pair, including commented-out ones. */
export function parseEnvEntries(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match) {
      entries.set(match[1]!, unquote(match[2]!.trim()));
    }
  }
  return entries;
}

/** Turns `# KEY=value` lines into `KEY=value` so optional keys become active. */
export function uncommentEnvText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^(\s*)#\s*([A-Za-z_][A-Za-z0-9_]*\s*=)/, '$1$2'))
    .join('\n');
}

/**
 * Rewrites the value of every `KEY=value` line (commented or not). Returning
 * `undefined` from the resolver leaves the line untouched, which is what makes
 * partial overrides work.
 */
export function substituteEnvValues(text: string, resolve: EnvValueResolver): string {
  return text
    .split(/\r?\n/)
    .map((rawLine) => {
      const match = /^(\s*(?:#\s*)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(rawLine);
      if (!match) return rawLine;
      const [, prefix = '', key = '', rawValue = ''] = match;
      const resolution = resolve(key, unquote(rawValue.trim()));
      if (!resolution) return rawLine;
      const suffix = resolution.comment ? ` # ${resolution.comment}` : '';
      return `${prefix}${key}=${quoteValue(resolution.value)}${suffix}`;
    })
    .join('\n');
}

export function renderEnvSection(section: EnvSection, options: { commented: boolean }): string {
  const lines: string[] = [`# ${section.title}`];
  for (const [key, value] of Object.entries(section.values)) {
    lines.push(options.commented ? `# ${key}=${quoteValue(value)}` : `${key}=${quoteValue(value)}`);
  }
  for (const [key, value] of Object.entries(section.optional)) {
    lines.push(`# ${key}=${quoteValue(value)}`);
  }
  return lines.join('\n');
}

export function buildEnvSections(addons: ResolvedAddon[]): EnvSection[] {
  return addons.map(({ name, manifest }) => ({
    title: titleCase(name),
    values: manifest.env,
    optional: manifest.optionalEnv,
  }));
}

/**
 * Produces the `.env` and `.env.example` contents for a generated project.
 *
 * The base template ships a real `.env.example`; the generator only switches its
 * optional keys on and appends the addons' blocks. The base file is never
 * rewritten by hand, which keeps the template runnable on its own.
 */
export function buildEnvFiles(options: {
  baseExample: string;
  addons: ResolvedAddon[];
  /** Extra blocks appended after the addons (used by the Docker generator). */
  extraSections?: EnvSection[];
  /** Value replacements applied to keys owned by the base template. */
  overrides?: Record<string, string>;
}): EnvFiles {
  const sections = [...buildEnvSections(options.addons), ...(options.extraSections ?? [])];
  const overrides = options.overrides ?? {};

  const resolve: EnvValueResolver = (key) => {
    if (key in overrides) return { value: overrides[key]! };
    if (isSecretKey(key)) return { value: generateSecret(), comment: GENERATED_COMMENT };
    return undefined;
  };

  const exampleBlocks = sections.map((section) => renderEnvSection(section, { commented: true }));
  const activeBlocks = sections.map((section) => renderEnvSection(section, { commented: false }));

  const envExample = [trimBlankEdges(options.baseExample), '', exampleBlocks.join('\n\n')].join('\n');

  const env = [
    ENV_HEADER,
    '',
    trimBlankEdges(substituteEnvValues(uncommentEnvText(options.baseExample), resolve)),
    '',
    substituteEnvValues(activeBlocks.join('\n\n'), resolve),
    '',
  ].join('\n');

  return { env, envExample };
}

export function writeEnvFiles(
  targetDir: string,
  addons: ResolvedAddon[],
  extra: { extraSections?: EnvSection[]; overrides?: Record<string, string> } = {},
): EnvFiles {
  const examplePath = join(targetDir, '.env.example');
  const files = buildEnvFiles({ baseExample: readTextFile(examplePath), addons, ...extra });

  writeTextFile(examplePath, files.envExample);
  writeTextFile(join(targetDir, '.env'), files.env);
  return files;
}

function trimBlankEdges(text: string): string {
  return text.replace(/^\n+/, '').replace(/\s+$/, '');
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  return quoted && value.length >= 2 ? value.slice(1, -1) : value;
}

function quoteValue(value: string): string {
  // Quote when the value could be misread: empty, whitespace, or containing a
  // character that starts a comment in .env syntax.
  return value === '' || /[\s#"'`]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function titleCase(value: string): string {
  return value
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}
