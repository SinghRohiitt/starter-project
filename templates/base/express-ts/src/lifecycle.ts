import { logger } from './utils/logger.js';

export type LifecycleHook = {
  /** Used in log lines so it is clear which hook is running or failed. */
  name: string;
  /** Runs before the HTTP server starts listening. Fail fast on boot errors. */
  startup?: () => Promise<void> | void;
  /** Runs after the HTTP server stops accepting connections. */
  shutdown?: () => Promise<void> | void;
};

const hooks: LifecycleHook[] = [];

/**
 * Registers a startup/shutdown pair for an optional feature (database, cache).
 *
 * This indirection is what keeps `app.ts` and `server.ts` identical whether or
 * not a feature is installed: features register themselves from a module in
 * `src/bootstrap/`, and the server only ever knows about hooks.
 */
export function registerLifecycleHook(hook: LifecycleHook): void {
  hooks.push(hook);
}

export async function runStartupHooks(): Promise<void> {
  for (const hook of hooks) {
    if (hook.startup === undefined) continue;
    await hook.startup();
    logger.debug('startup hook finished', { hook: hook.name });
  }
}

export async function runShutdownHooks(): Promise<void> {
  // Reverse order, so a hook can still rely on what a later hook started.
  for (const hook of [...hooks].reverse()) {
    if (hook.shutdown === undefined) continue;
    await hook.shutdown();
    logger.debug('shutdown hook finished', { hook: hook.name });
  }
}

/** Names of the registered hooks, reported in the startup log line. */
export function listLifecycleHooks(): string[] {
  return hooks.map((hook) => hook.name);
}
