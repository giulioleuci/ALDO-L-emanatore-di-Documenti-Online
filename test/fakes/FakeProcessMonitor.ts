import type { IProcessMonitor } from '../../src/infrastructure/facades/ProcessMonitorFacade';

export class FakeProcessMonitor implements IProcessMonitor {
  public registered: string[] = [];
  public started: string[] = [];
  public progress: Array<{ jobId: string; percentage: number; message?: string }> = [];
  public completed: Array<{ jobId: string; message?: string }> = [];
  public errors: Array<{ jobId: string; error: unknown }> = [];
  public steps: Array<{
    jobId: string;
    stepName: string;
    event: 'start' | 'complete' | 'skipped';
    success?: boolean;
  }> = [];

  registerJob(jobId: string): void {
    this.registered.push(jobId);
  }
  startJob(jobId: string): void {
    this.started.push(jobId);
  }
  updateProgress(jobId: string, percentage: number, message?: string): void {
    this.progress.push(
      message === undefined ? { jobId, percentage } : { jobId, percentage, message }
    );
  }
  logStepStart(jobId: string, stepName: string): void {
    this.steps.push({ jobId, stepName, event: 'start' });
  }
  logStepComplete(jobId: string, stepName: string, success: boolean): void {
    this.steps.push({ jobId, stepName, event: 'complete', success });
  }
  logStepSkipped(jobId: string, stepName: string): void {
    this.steps.push({ jobId, stepName, event: 'skipped' });
  }
  completeJob(jobId: string, message?: string): void {
    this.completed.push(message === undefined ? { jobId } : { jobId, message });
  }
  setError(jobId: string, error: unknown): void {
    this.errors.push({ jobId, error });
  }
}
