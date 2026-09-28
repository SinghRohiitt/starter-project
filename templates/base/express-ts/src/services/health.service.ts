export type HealthReport = {
  status: 'ok';
  /** Seconds the process has been running, as reported by the OS. */
  uptimeSeconds: number;
  /** ISO timestamp of the moment the report was produced. */
  timestamp: string;
};

/**
 * Liveness/readiness payload.
 *
 * When a database or cache is added, this is the place to report their status
 * too: a report that only says `ok` while the database is unreachable would let
 * a broken instance stay in the load balancer.
 */
export function getHealthReport(): HealthReport {
  return {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
