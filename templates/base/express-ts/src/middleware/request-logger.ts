import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

/** Logs the method, path, status and duration of every request once it finishes. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const context = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(2)),
      requestId: res.locals.requestId as string | undefined,
    };

    if (res.statusCode >= 500) logger.error('request failed', context);
    else if (res.statusCode >= 400) logger.warn('request rejected', context);
    else logger.info('request', context);
  });

  next();
};
