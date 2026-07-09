import type { IProcessMonitor } from '../../src/infrastructure/facades/ProcessMonitorFacade';

export class FakeProcessMonitor implements IProcessMonitor {
  public registered: string[] = [];
  public started: string[] = [];
  public progress: Array<{ jobId: string; percentage: number; message?: string }> = [];
  public completed: Array<{ jobId: string; message?: string }> = [];
  public errors: Array<{ jobId: string; error: unknown }> = [];

  registerJob(jobId: string): void {
    this.registered.push(jobId);
  }
  startJob(jobId: string): void {
    this.started.push(jobId);
  }
  updateProgress(jobId: string, percentage: number, message?: string): void {
    this.progress.push(message === undefined ? { jobId, percentage } : { jobId, percentage, message });
  }
  completeJob(jobId: string, message?: string): void {
    this.completed.push(message === undefined ? { jobId } : { jobId, message });
  }
  setError(jobId: string, error: unknown): void {
    this.errors.push({ jobId, error });
  }
}
