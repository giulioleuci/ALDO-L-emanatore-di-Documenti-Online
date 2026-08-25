/**
 * Job-progress port consumed by the batch services (15 §9). The real facade
 * routes through the vendored GasProcessMonitorLib `ProcessMonitorService`
 * (job state cached under `PROCESS_MONITOR_<jobId>`, read by the
 * GasProcessMonitorLib sidebar `DashboardUi` opened from the menu wrapper) —
 * ALDO never touches CacheService/PropertiesService directly for this.
 */
export interface IProcessMonitor {
  registerJob(jobId: string): void;
  startJob(jobId: string): void;
  updateProgress(jobId: string, percentage: number, message?: string): void;
  /** Per-step telemetry (15 §9) — surfaces individual pipeline-step status on the GasProcessMonitorLib dashboard. */
  logStepStart(jobId: string, stepName: string): void;
  logStepComplete(jobId: string, stepName: string, success: boolean): void;
  logStepSkipped(jobId: string, stepName: string): void;
  /** Reads the job state the library persists (cache first, ScriptProperties fallback) — used by the online telemetry probe. */
  getJobState(jobId: string): unknown;
  completeJob(jobId: string, message?: string): void;
  setError(jobId: string, error: unknown): void;
}
