import { registerItpDottedChecks } from '../../../src/onlinetests/checks/itpDottedChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { CONF_DOC_DOCENTE_MATERIA, e2eDocenteEmail } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { COL_LOG_DOCS } from '../../../src/config/schema';

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

test('dotted document identity accepts a prior-class duplicate for the focal batch', () => {
  const runner = new RecordingRunner();
  const baseTeacher = e2eDocenteEmail(4);
  const rows = [
    {
      [COL_LOG_DOCS.ID_GEN]: CONF_DOC_DOCENTE_MATERIA,
      [COL_LOG_DOCS.CLASSI]: '3A',
      [COL_LOG_DOCS.SOTTOTIPO]: `GRECO::${baseTeacher}`
    },
    {
      [COL_LOG_DOCS.ID_GEN]: CONF_DOC_DOCENTE_MATERIA,
      [COL_LOG_DOCS.CLASSI]: '3A',
      [COL_LOG_DOCS.SOTTOTIPO]: `INTERPRET.CHITARRA::${e2eDocenteEmail(5)}`
    }
  ];
  const classi = {
    findById: () => ({ id: '4A' }),
    getTeachingSlots: () => [
      { column: 'GRECO', actorEmails: [baseTeacher] },
      {
        column: 'INTERPRET.CHITARRA',
        kind: 'SPECIFICA',
        specifica: 'CHITARRA',
        actorEmails: [e2eDocenteEmail(5)]
      },
      {
        column: 'INTERPRET.CHITARRA.itp',
        kind: 'ITP',
        specifica: 'CHITARRA',
        actorEmails: [e2eDocenteEmail(11)]
      }
    ]
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'classi') return classi as T;
      if (key === 'documentBatchService') {
        return { batchGenerateHandler: () => (function* () {})() } as T;
      }
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  registerItpDottedChecks(runner as never, container, sample);

  expect(() => runner.callbacks.get(CHECK_NAMES[1])!()).not.toThrow();
});
