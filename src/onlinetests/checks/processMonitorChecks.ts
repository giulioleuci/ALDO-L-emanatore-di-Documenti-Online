import type { ServiceContainer } from '../../config/ServiceContainer';
import { ValidationError } from '../../domain/errors/DomainError';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

/**
 * Isolates the `[ProcessMonitorService] Step not found` flood seen in the
 * 2026-08-21 run: 2718 warnings, every one of them emitted by
 * `logStepComplete` after `logStepStart` had just pushed that same step into
 * the state. Either the ScriptCache write is not visible to the following
 * read, or the state read falls back to the ScriptProperties snapshot taken by
 * `startJob` (which has no steps). The probe separates the two.
 */
export function registerProcessMonitorChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: { sampleSpreadsheetUrl: string }
): void {
  runner.add(
    groupName('monitor.telemetria', 'lo step registrato sopravvive alla rilettura'),
    sample.sampleSpreadsheetUrl,
    () => {
      const monitor = container.get<IProcessMonitor>('monitor');
      const jobId = `probe_${Date.now()}`;
      monitor.registerJob(jobId);
      monitor.startJob(jobId);
      monitor.logStepStart(jobId, 'ProbeStep');
      const state = monitor.getJobState(jobId) as { steps?: Array<{ name: string }> } | null;
      const names = (state?.steps ?? []).map((step) => step.name);
      if (!names.includes('ProbeStep')) {
        throw new ValidationError(
          `Telemetria step persa: dopo logStepStart lo stato contiene [${names.join(', ')}]`
        );
      }
    }
  );
}
