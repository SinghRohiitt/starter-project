import { createApp } from './app.js';
// Imported for its side effect: registers the startup/shutdown hooks of whatever
// optional features were scaffolded into src/bootstrap/.
import './bootstrap/index.js';
import { listLifecycleHooks, runShutdownHooks, runStartupHooks } from './lifecycle.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

// Optional features (database, cache) connect here and fail fast, before the
// process starts accepting traffic it cannot serve.
await runStartupHooks();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info('Server listening', {
    url: `http://${env.HOST}:${env.PORT}`,
    lifecycleHooks: listLifecycleHooks(),
  });
});

let shuttingDown = false;

/**
 * Stops accepting connections, lets the registered features close their pools,
 * and only then exits. A second signal exits immediately so an operator is never
 * stuck waiting on a hung connection.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.warn('Shutdown already in progress, exiting now', { signal });
    process.exit(1);
  }
  shuttingDown = true;
  logger.info('Shutting down', { signal });

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  try {
    await runShutdownHooks();
  } catch (err) {
    logger.error('A shutdown hook failed', { error: err instanceof Error ? err.message : String(err) });
  }

  clearTimeout(forceExit);
  logger.info('Shutdown complete');
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
