import type { Request, Response } from 'express';
import { getHealthReport, type HealthReport } from '../services/health.service.js';

export function healthController(_req: Request, res: Response<HealthReport>): void {
  res.status(200).json(getHealthReport());
}
