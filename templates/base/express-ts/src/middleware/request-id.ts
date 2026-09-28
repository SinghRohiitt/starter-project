import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Assigns every request an id, echoes it back in `X-Request-Id` and makes it
 * available to the request logger. An id supplied by an upstream proxy is
 * reused so a trace survives across services.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 200 ? incoming : randomUUID();

  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
