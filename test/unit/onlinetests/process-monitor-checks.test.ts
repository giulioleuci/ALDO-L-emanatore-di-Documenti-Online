import { ValidationError } from '../../../src/domain/errors/DomainError';
import { registerProcessMonitorChecks } from '../../../src/onlinetests/checks/processMonitorChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { IProcessMonitor } from '../../../src/infrastructure/facades/ProcessMonitorFacade';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> =
    [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.checks.push({ name, artifactUrl, callback });
  }
}

function monitorWithState(state: unknown): jest.Mocked<IProcessMonitor> {
  return {
    registerJob: jest.fn(),
    startJob: jest.fn(),
    updateProgress: jest.fn(),
    logStepStart: jest.fn(),
    logStepComplete: jest.fn(),
    logStepSkipped: jest.fn(),
    getJobState: jest.fn(() => state),
    completeJob: jest.fn(),
    setError: jest.fn()
  };
}

function containerWithMonitor(monitor: IProcessMonitor): ServiceContainer {
  return { get: () => monitor } as unknown as ServiceContainer;
}

test('telemetry probe passes when ProbeStep survives the read after logStepStart', () => {
  const runner = new RecordingRunner();
  const monitor = monitorWithState({ steps: [{ name: 'ProbeStep' }] });

  registerProcessMonitorChecks(runner as never, containerWithMonitor(monitor), {
    sampleSpreadsheetUrl: 'https://example.test/sample'
  });

  runner.checks[0]!.callback();
  expect(monitor.logStepStart.mock.calls).toEqual([
    [expect.stringMatching(/^probe_\d+$/), 'ProbeStep']
  ]);
});

test('telemetry probe raises ValidationError when ProbeStep is missing after the read', () => {
  const runner = new RecordingRunner();
  const monitor = monitorWithState({ steps: [] });

  registerProcessMonitorChecks(runner as never, containerWithMonitor(monitor), {
    sampleSpreadsheetUrl: 'https://example.test/sample'
  });

  expect(() => runner.checks[0]!.callback()).toThrow(ValidationError);
  expect(() => runner.checks[0]!.callback()).toThrow(
    'Telemetria step persa: dopo logStepStart lo stato contiene []'
  );
});
