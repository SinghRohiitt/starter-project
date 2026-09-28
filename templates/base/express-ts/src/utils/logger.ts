import { env } from '../config/env.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/** Fields that are always shown next to a log line. */
const baseContext: Record<string, unknown> = {
  env: env.NODE_ENV,
};

const threshold = LEVEL_WEIGHT[env.LOG_LEVEL];

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] > threshold) return;

  const payload = { ...baseContext, ...context };
  const suffix = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Minimal leveled logger.
 *
 * Deliberately dependency free: it is enough for a service that logs a handful
 * of request and lifecycle events, and swapping in pino/winston later only
 * requires changing this file.
 */
export const logger = {
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
};

export type Logger = typeof logger;
