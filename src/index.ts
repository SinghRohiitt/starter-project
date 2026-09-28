#!/usr/bin/env node
import { runCli, type CliDeps } from './cli.js';
import { createLogger } from './utils/logger.js';

// Ctrl+C during a long `npm install` should clean up the half-written project
// and must not print a stack trace, so interrupts are handled here where the
// in-flight cleanup callback is known.
let cleanup: (() => void) | undefined;

const onInterrupt = () => {
  process.stderr.write('\nAborted. Removing the partially created project…\n');
  try {
    cleanup?.();
  } catch (err) {
    process.stderr.write(`Could not clean up automatically: ${String(err)}\n`);
  }
  process.exit(130);
};

process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onInterrupt);

const deps: CliDeps = {
  logger: createLogger(),
  cwd: process.cwd(),
  registerCleanup: (fn) => {
    cleanup = fn;
  },
};

process.exitCode = await runCli(process.argv, deps);
