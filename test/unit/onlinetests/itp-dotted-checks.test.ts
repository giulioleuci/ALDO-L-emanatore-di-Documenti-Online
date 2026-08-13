import { registerItpDottedChecks } from '../../../src/onlinetests/checks/itpDottedChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { e2eDocenteEmail } from '../../../src/onlinetests/data/fixtures';

interface RegisteredCheck {
  name: string;
  artifactUrl: string | undefined;
}

class RecordingRunner {
  readonly checks: RegisteredCheck[] = [];
  readonly callbacks = new Map<string, () => void>();

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    this.checks.push({ name, artifactUrl });
    this.callbacks.set(name, fn);
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
  'itpDotted::getITPPerMateria specifica',
  'itpDotted::identita assegnazioni, ruoli e ownership',
  'itpDotted::nomi sintetizzati ed espliciti',
  'itpDotted::CDU materia e tuple docenti',
  'itpDotted::isolamento sostituzione e variazione',
  'itpDotted::continuita titolare/ITP e campi assenti',
  'itpDotted::CONF_DOC_DOTTED renderizzato'
];

test('registers all seven ITP/dotted checks against the shared sample', () => {
  const runner = new RecordingRunner();

  registerItpDottedChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks).toEqual(
    CHECK_NAMES.map((name) => ({ name, artifactUrl: sample.sampleSpreadsheetUrl }))
  );
});

test('registers only the TEST_MODE guard for an unsafe sample', () => {
  const runner = new RecordingRunner();

  registerItpDottedChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    masterTestMode: false
  });

  expect(runner.checks.map((check) => check.name)).toEqual(['itpDotted::MASTER.TEST_MODE guard']);
});

test('specifica lookup rejects an arbitrary ITP from the base subject', () => {
  const runner = new RecordingRunner();
  const classi = {
    findById: () => ({ id: '4A' }),
    getITPPerMateria: () => [
      { id: e2eDocenteEmail(2), isITP: () => true },
      { id: e2eDocenteEmail(11), isITP: () => true }
    ]
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'classi') return classi as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;
  registerItpDottedChecks(runner as never, container, sample);

  expect(() => runner.callbacks.get(CHECK_NAMES[0])!()).toThrow(/INTERPRET\.CHITARRA/);
});

test('specifica lookup accepts exactly the dedicated dotted ITP', () => {
  const runner = new RecordingRunner();
  const classi = {
    findById: () => ({ id: '4A' }),
    getITPPerMateria: () => [{ id: e2eDocenteEmail(11), isITP: () => true }]
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'classi') return classi as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;
  registerItpDottedChecks(runner as never, container, sample);

  expect(() => runner.callbacks.get(CHECK_NAMES[0])!()).not.toThrow();
});
