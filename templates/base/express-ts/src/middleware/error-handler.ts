import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';
import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
};

/**
 * Terminal error handler.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so a controller can `throw` without any wrapper. Keep this middleware last.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    // The response already started streaming, so the only correct move is to
    // hand the error back to Express and let it destroy the connection.
    next(err);
    return;
  }

  const apiError = err instanceof ApiError ? err : undefined;
  const statusCode = apiError?.statusCode ?? 500;
  const code = apiError?.code ?? 'INTERNAL_SERVER_ERROR';
  const message = apiError?.message ?? 'Something went wrong while handling the request';
  const stack = err instanceof Error ? err.stack : undefined;
  const isUnexpected = apiError === undefined;

  // The request logger already records a line for every response, so logging an
  // expected 4xx here as well would double it. A 5xx earns an extra line because
  // it is the one case where the stack is the actual diagnostic.
  if (statusCode >= 500) {
    logger.error(message, {
      statusCode,
      requestId: res.locals.requestId as string | undefined,
      ...(stack === undefined ? {} : { stack }),
    });
  }

  // An expected failure carries no stack worth sending, and in production a
  // stack would leak internals, so it is only included for a genuine bug in dev.
  const exposeStack = isUnexpected && !isProduction && stack !== undefined;
  const body: ErrorResponseBody = {
    error: {
      code,
      message,
      ...(apiError?.details === undefined ? {} : { details: apiError.details }),
      ...(exposeStack ? { stack } : {}),
    },
  };

  res.status(statusCode).json(body);
};
