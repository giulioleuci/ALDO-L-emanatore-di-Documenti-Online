import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  executeFullOnlineTests,
  type FullOnlineTestDeps
} from '../../../src/onlinetests';
import type { TestRunner } from '../../../src/onlinetests/report/OnlineTestReport';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';

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
});
