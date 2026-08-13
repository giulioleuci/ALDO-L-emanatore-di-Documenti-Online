import {
  assertActorVisibility,
  registerSupplenzeRuoliChecks,
  type ConsumerVisibilitySnapshot
} from '../../../src/onlinetests/checks/supplenzeRuoliChecks';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.checks.push({ name, artifactUrl, callback });
  }
}

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
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

const CHECK_NAMES = [
  'supplenze.ruoli::confini inclusivi ed esclusivi',
  'supplenze.ruoli::isolamento classi sovrapposte',
  'supplenze.ruoli::variazione prima durante dopo sostituzione',
  'supplenze.ruoli::visibilita CDU destinatari ACL e protezioni',
  'supplenze.ruoli::dedupe titolare e supplente'
];

test('registers five supplenze/ruoli checks on the shared artifact', () => {
  const runner = new RecordingRunner();

  registerSupplenzeRuoliChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks.map(({ name, artifactUrl }) => ({ name, artifactUrl }))).toEqual(
    CHECK_NAMES.map((name) => ({ name, artifactUrl: sample.sampleSpreadsheetUrl }))
  );
});

test('registers only safety guard outside MASTER.TEST_MODE', () => {
  const runner = new RecordingRunner();

  registerSupplenzeRuoliChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    masterTestMode: false
  });

  expect(runner.checks.map((check) => check.name)).toEqual([
    'supplenze.ruoli::MASTER.TEST_MODE guard'
  ]);
});

function snapshot(values: string[]): ConsumerVisibilitySnapshot {
  return {
    cdu: values,
    recipients: values,
    documentAcl: values,
    folderAcl: values,
    protectedRangeEditors: values
  };
}

test.each([
  [GestioneSupplenti.SOLO_TITOLARI, ['titolare@example.test']],
  [GestioneSupplenti.SOLO_SUPPLENTI, ['supplente@example.test']],
  [GestioneSupplenti.ENTRAMBI, ['titolare@example.test', 'supplente@example.test']]
])('accepts exact actor visibility for %s across every consumer', (mode, actors) => {
  expect(() =>
    assertActorVisibility(
      String(mode),
      snapshot(actors),
      'titolare@example.test',
      'supplente@example.test',
      mode
    )
  ).not.toThrow();
});

test('rejects a protected-range consumer that leaks the principal in SOLO_SUPPLENTI', () => {
  const actual = snapshot(['supplente@example.test']);
  actual.protectedRangeEditors = ['titolare@example.test', 'supplente@example.test'];

  expect(() =>
    assertActorVisibility(
      'visibility',
      actual,
      'titolare@example.test',
      'supplente@example.test',
      GestioneSupplenti.SOLO_SUPPLENTI
    )
  ).toThrow(/protectedRangeEditors/);
});

test('rejects duplicate principal/substitute email in any consumer channel', () => {
  const actual = snapshot(['same@example.test', 'same@example.test']);

  expect(() =>
    assertActorVisibility(
      'dedupe',
      actual,
      'same@example.test',
      'same@example.test',
      GestioneSupplenti.ENTRAMBI
    )
  ).toThrow(/duplicat/);
});
