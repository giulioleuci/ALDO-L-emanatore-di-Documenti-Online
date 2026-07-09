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
  completeJob(jobId: string, message?: string): void;
  setError(jobId: string, error: unknown): void;
}

export class ProcessMonitorFacade implements IProcessMonitor {
  constructor(private readonly monitor: ProcessMonitorService) {}

  registerJob(jobId: string): void {
    this.monitor.registerJob(jobId);
  }
  startJob(jobId: string): void {
    this.monitor.startJob(jobId);
  }
  updateProgress(jobId: string, percentage: number, message?: string): void {
    this.monitor.updateProgress(jobId, percentage, message);
  }
  completeJob(jobId: string, message?: string): void {
    this.monitor.completeJob(jobId, message);
  }
  setError(jobId: string, error: unknown): void {
    this.monitor.setError(jobId, error);
  }
}
