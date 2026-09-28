import { config as loadEnvFile } from 'dotenv';
import { z } from 'zod';

// Loaded once, before anything reads `process.env`. `quiet` keeps dotenv from
// printing its own banner on top of the app's first log line.
loadEnvFile({ quiet: true });

/**
 * Only the settings every project needs are declared here. Optional features
 * (database, cache, auth) validate their own variables in their own config
 * module, so this schema stays stable no matter which addons are installed.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  /** Comma separated list of allowed origins, or `*` to allow any. */
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${details}`);
  console.error('\nCopy .env.example to .env and fill in the missing values.');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
