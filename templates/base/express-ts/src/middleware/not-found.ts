import type { RequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

/** Turns an unmatched route into a 404 that flows through the error handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
};
