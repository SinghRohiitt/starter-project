import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { router } from './routes/index.js';

/**
 * Builds the Express application.
 *
 * Exported separately from `server.ts` so tests and scripts can mount the app
 * without opening a port.
 */
export function createApp(): Express {
  const app = express();

  // Do not advertise the framework; it only helps someone probe for known holes.
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestLogger);
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(router);

  // Order matters: unmatched routes become a 404, and every error funnels into
  // a single JSON error shape.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
