import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import {
  registerCacheIsolamentoChecks,
  type CacheIsolationDeps
} from '../../../src/onlinetests/checks/cacheIsolamentoChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> =
    [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.checks.push({ name, artifactUrl, callback });
  }
}

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master-shared',
  sampleSpreadsheetId: 'sample-shared',
  sampleSpreadsheetUrl: 'https://example.test/sample-shared',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-one',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-one',
  priorSampleSpreadsheetId2: 'prior-two',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-two',
  logFoldFolderUrl: 'https://example.test/log-fold',
  jobRunnerDocConfigId: 'jobrunner',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment'
};

function containerWithClass(classe: unknown): ServiceContainer {
  return {
    get: () => ({ findById: (id: ClasseId) => (id.value === '1A' ? classe : null) })
  } as unknown as ServiceContainer;
}

test('second fixture cannot read the 1A row warmed from the shared fixture cache', () => {
  const runner = new RecordingRunner();
  const calls: string[] = [];
  const first = containerWithClass({ id: '1A' });
  const second = containerWithClass(null);
  const deps: CacheIsolationDeps = {
    initAldo: (_now, _properties, masterId) => {
      calls.push(`init:${masterId}`);
      return masterId === sample.masterSpreadsheetId ? first : second;
    },
    resetAldo: () => calls.push('reset'),
    properties: { get: () => null, set: () => undefined },
    clock: () => new Date('2026-08-13T09:00:00Z'),
    secondMasterSpreadsheetId: 'master-isolated'
  };

  registerCacheIsolamentoChecks(runner as never, first, sample, deps);

  expect(runner.checks.map((check) => check.name)).toEqual([
    'cache.isolamento::secondo fixture non riusa righe cached'
  ]);
  runner.checks[0]!.callback();
  expect(calls).toEqual(['reset', 'init:master-isolated', 'reset', 'init:master-shared']);
});

test('fails when second container leaks shared 1A row', () => {
  const runner = new RecordingRunner();
  const first = containerWithClass({ id: '1A' });
  const deps: CacheIsolationDeps = {
    initAldo: () => containerWithClass({ id: '1A' }),
    resetAldo: () => undefined,
    properties: { get: () => null, set: () => undefined },
    clock: () => new Date('2026-08-13T09:00:00Z'),
    secondMasterSpreadsheetId: 'master-isolated'
  };

  registerCacheIsolamentoChecks(runner as never, first, sample, deps);

  expect(() => runner.checks[0]!.callback()).toThrow(/cache.*1A|1A.*cache/i);
});
