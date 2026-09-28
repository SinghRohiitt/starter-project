import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/**
 * Root router. Feature routers are mounted here as they are added, which keeps
 * `app.ts` free of route knowledge.
 */
export const router: Router = Router();

router.use('/health', healthRouter);
