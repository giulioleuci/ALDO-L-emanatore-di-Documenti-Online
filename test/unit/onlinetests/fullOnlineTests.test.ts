import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  executeFullOnlineTests,
  type FullOnlineTestDeps,
  type FullOnlineTestSample
} from '../../../src/onlinetests';
import type { TestRunner } from '../../../src/onlinetests/report/OnlineTestReport';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';
import { EMAIL_TEST_SAFE } from '../../../src/onlinetests/data/fixtures';
import {
  registerEffectiveAssignmentMatrixChecks,
  registerRepositoryChecks
} from '../../../src/onlinetests/checks/repositoryChecks';
import {
  registerContextEngineChecks,
  registerEffectiveAssignmentConsumerChecks
} from '../../../src/onlinetests/checks/contextEngineChecks';
import { registerPipelineChecks } from '../../../src/onlinetests/checks/pipelineChecks';
import { registerE2eScenarioChecks } from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { registerArticolazioneChecks } from '../../../src/onlinetests/checks/articolazioneChecks';

jest.mock('../../../src/onlinetests/checks/repositoryChecks', () => ({
  registerRepositoryChecks: jest.fn(),
  registerEffectiveAssignmentMatrixChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/contextEngineChecks', () => ({
  registerContextEngineChecks: jest.fn(),
  registerEffectiveAssignmentConsumerChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/pipelineChecks', () => ({
  registerPipelineChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/e2eScenarioChecks', () => ({
  registerE2eScenarioChecks: jest.fn()
}));
jest.mock('../../../src/onlinetests/checks/articolazioneChecks', () => ({
  registerArticolazioneChecks: jest.fn()
}));

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-1',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-1',
  priorSampleSpreadsheetId2: 'prior-2',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-2',
  logFoldFolderUrl: 'https://example.test/log',
  jobRunnerDocConfigId: 'job-runner-doc',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment'
};

function properties(): IPropertiesFacade {
  return { get: () => null, set: () => undefined };
}

describe('executeFullOnlineTests', () => {
  it('forces a fresh provision before registering every scenario group in the documented order', () => {
    const calls: string[] = [];
    const registerInterceptor = jest.fn();
    const container = {
      get: jest.fn(() => ({ registerInterceptor }))
    } as unknown as ServiceContainer;
    const register = (name: string) => (runner: Pick<TestRunner, 'add'>): void => {
      calls.push(name);
      runner.add(name, sample.sampleSpreadsheetUrl, () => undefined);
    };
    const registrations = {
      documenti: register('documenti'),
      email: register('email'),
      jobRunner: register('jobrunner'),
      import: register('import'),
      storico: register('storico'),
      articolazione: register('articolazione'),
      itpDotted: register('itp'),
      supplenzeRuoli: register('supplenze'),
      aclReali: register('acl'),
      cacheIsolamento: register('cache'),
      permessi: register('permessi')
    };
    const deps: Partial<FullOnlineTestDeps> = {
      properties: properties(),
      clock: () => new Date('2026-08-11T09:00:00Z'),
      resetAldo: () => calls.push('reset'),
      initAldo: () => {
        calls.push('init');
        return container;
      },
      provision: (_overrides, force) => {
        calls.push(`provision:${String(force)}`);
        return sample;
      },
      registrations
    };

    const report = executeFullOnlineTests(deps);

    expect(calls).toEqual([
      'provision:true',
      'reset',
      'init',
      'documenti',
      'email',
      'jobrunner',
      'import',
      'storico',
      'articolazione',
      'itp',
      'supplenze',
      'acl',
      'cache',
      'permessi'
    ]);
    expect(registerInterceptor).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ passed: 11, failed: 0 });
  });

  it('uses the default transitional adapters to run existing checks instead of reporting 0/0', () => {
    const calls: string[] = [];
    const registerInterceptor = jest.fn(() => calls.push('interceptor'));
    const container = {
      get: jest.fn(() => ({ registerInterceptor }))
    } as unknown as ServiceContainer;
    const registerExisting = (name: string) =>
      jest.fn(
        (
          runner: Pick<TestRunner, 'add'>,
          _container: ServiceContainer,
          fixture: FullOnlineTestSample
        ) => {
          calls.push(name);
          runner.add(name, fixture.sampleSpreadsheetUrl, () => undefined);
        }
      );
    const repository = registerExisting('repository');
    const context = registerExisting('context');
    const e2e = registerExisting('documenti');
    const pipeline = registerExisting('email');
    const articolazione = registerExisting('articolazione');
    const assignmentMatrix = registerExisting('supplenze.matrix');
    const assignmentConsumer = registerExisting('supplenze.consumer');
    jest.mocked(registerRepositoryChecks).mockImplementation(repository);
    jest.mocked(registerContextEngineChecks).mockImplementation(context);
    jest.mocked(registerE2eScenarioChecks).mockImplementation(e2e);
    jest.mocked(registerPipelineChecks).mockImplementation(pipeline);
    jest.mocked(registerArticolazioneChecks).mockImplementation(articolazione);
    jest.mocked(registerEffectiveAssignmentMatrixChecks).mockImplementation(assignmentMatrix);
    jest.mocked(registerEffectiveAssignmentConsumerChecks).mockImplementation(assignmentConsumer);

    const report = executeFullOnlineTests({
      properties: properties(),
      clock: () => new Date('2026-08-11T09:00:00Z'),
      resetAldo: () => calls.push('reset'),
      initAldo: () => {
        calls.push('init');
        return container;
      },
      provision: (_overrides, force) => {
        calls.push(`provision:${String(force)}`);
        return sample;
      }
    });

    expect(calls).toEqual([
      'provision:true',
      'reset',
      'init',
      'interceptor',
      'repository',
      'context',
      'documenti',
      'email',
      'articolazione',
      'supplenze.matrix',
      'supplenze.consumer'
    ]);
    expect(registerPipelineChecks).toHaveBeenCalledWith(
      expect.anything(),
      container,
      expect.objectContaining({ testMode: true }),
      EMAIL_TEST_SAFE
    );
    expect(report.passed).toBeGreaterThan(0);
    expect(report.failed).toBeGreaterThan(0);
    expect(report.results.map((result) => result.name)).toEqual([
      'repository',
      'context',
      'documenti',
      'email',
      'Aggregate scenario pending migration: jobrunner',
      'Aggregate scenario pending migration: import',
      'Aggregate scenario pending migration: storico',
      'articolazione',
      'Aggregate scenario pending migration: itp-dotted',
      'supplenze.matrix',
      'supplenze.consumer',
      'Aggregate scenario pending migration: acl-reali',
      'Aggregate scenario pending migration: cache-isolamento',
      'Aggregate scenario pending migration: permessi'
    ]);
    expect(report.results.some((result) => result.name.includes('trigger reale'))).toBe(false);
  });
});
