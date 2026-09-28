/**
 * Shared domain types. `ProjectConfig` is the single source of truth: prompts
 * build it, generators read it, and nothing else is allowed to invent options.
 */

export type AppType = 'backend' | 'fullstack' | 'frontend';
export type Framework = 'express' | 'nestjs';
export type Language = 'typescript' | 'javascript';
export type Database = 'postgresql' | 'mongodb' | 'none';
export type Orm = 'prisma' | 'mongoose' | 'none';
export type Auth = 'jwt' | 'none';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type ProjectConfig = {
  projectName: string;
  targetDir: string;
  appType: AppType;
  framework: Framework;
  language: Language;
  database: Database;
  orm: Orm;
  auth: Auth;
  redis: boolean;
  docker: boolean;
  git: boolean;
  packageManager: PackageManager;
};

/** Same shape as `ProjectConfig` minus the fields derived from the target directory. */
export type ProjectOptions = Omit<ProjectConfig, 'targetDir'>;

/**
 * Declarative contribution an addon template makes on top of a base template.
 * Addons ship real files *and* a manifest; the manifest is what lets the CLI
 * merge `package.json` and env vars programmatically, so we never need a full
 * template per option combination.
 */
export type AddonManifest = {
  /** Id of the addon, e.g. `prisma`. Must match the directory name. */
  name: string;
  /** One-line summary surfaced in the CLI output. */
  description: string;
  /** Base template ids this addon can be layered onto. */
  baseTemplates: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  /** `KEY=value` pairs written to both `.env` and `.env.example`. */
  env: Record<string, string>;
  /** `KEY=value` pairs written *only* to `.env.example`, commented out. */
  optionalEnv: Record<string, string>;
  /** Commands run inside the generated project after `install` (e.g. `prisma generate`). */
  postInstall: string[];
};

/** An addon that has been resolved to an on-disk directory plus its parsed manifest. */
export type ResolvedAddon = {
  name: string;
  dir: string;
  manifest: AddonManifest;
};

/** Ordered, ready-to-execute description of how a project will be produced. */
export type GenerationPlan = {
  baseTemplate: string;
  baseDir: string;
  addons: ResolvedAddon[];
};

export type Spinner = {
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
};

export type Logger = {
  /** True when stdout is a TTY, i.e. when it is safe to draw spinners. */
  interactive: boolean;
  banner(version: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Prints a bulleted list of actionable next steps under an error. */
  hint(lines: string[]): void;
  blank(): void;
  celebrate(message: string): void;
  nextSteps(lines: string[]): void;
  start(text: string): Spinner;
};

/** Thrown for problems that should be reported to the user without a stack trace. */
export class CliError extends Error {
  /** Actionable next steps printed as a bulleted list under the message. */
  readonly hint?: string[];
  constructor(message: string, hint?: string[]) {
    super(message);
    this.name = 'CliError';
    this.hint = hint;
  }
}
