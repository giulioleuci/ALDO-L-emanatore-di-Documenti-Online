import { registerE2eScenarioChecks } from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import {
  CONF_IMP_ASL,
  CONF_MAIL_CARENZA,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_PIANI,
  CONF_MAIL_VERBALE
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import type { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import type {
  EmailDb,
  EmailNotificationService,
  SendPatternResult
} from '../../../src/application/services/EmailNotificationService';
import type { ImportService, ImportResult } from '../../../src/application/services/ImportService';
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import type { IDriveFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';
import { COL_LOG_DOCS } from '../../../src/config/schema';

const sample: E2eSampleDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'm',
  sampleSpreadsheetId: 's',
  sampleSpreadsheetUrl: 'https://example.test/s',
  sampleFolderUrl: 'https://example.test/f',
  masterTestMode: true,
  testMode: true
};

function recordingHarness(
  resultForPattern: (patternId: string) => SendPatternResult = (patternId) => ({
    targets: patternId === CONF_MAIL_CARENZA ? 2 : 1,
    sent: 1,
    skipped: 0,
    errors: []
  })
): {
  container: ServiceContainer;
  events: string[];
  emailPatterns: string[];
  emailResolutions: () => number;
} {
  const events: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const emailPatterns: string[] = [];
  let emailResolutions = 0;
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      events.push('generate-document');
      rows.push({
        [COL_LOG_DOCS.ID_GEN]: configId,
        [COL_LOG_DOCS.CLASSI]: classe.value,
        [COL_LOG_DOCS.LINK]: `https://example.test/${configId}/${classe.value}`
      });
      return { fileId: `${configId}-${classe.value}`, status: 'CREATED' };
    },
    generateForAlunno(studente: string) {
      events.push('generate-document');
      return { fileId: studente, status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const email = {
    sendPattern(patternId: string) {
      emailPatterns.push(patternId);
      return resultForPattern(patternId);
    }
  } as EmailNotificationService;
  const aslRows: Array<Record<string, unknown>> = [
    { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
    { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
    { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 },
    { STUDENTE: 'e2ealunno52@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 35 }
  ];
  const importService = {
    executeImport(configId: string) {
      if (configId === CONF_IMP_ASL) {
        return { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
      }
      throw new Error(`Unexpected configId: ${configId}`);
    }
  } as ImportService;
  const db = {
    table: (name: string) => ({ findAll: () => (name === 'ASL' ? aslRows : rows) })
  } as unknown as EmailDb;
  const drive = {
    getFileText: () => 'Report Complesso — nessun placeholder residuo'
  } as unknown as IDriveFacade;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'importService') return importService as T;
      if (key === 'drive') return drive as unknown as T;
      if (key === 'emailNotificationService') {
        emailResolutions += 1;
        events.push('resolve-email');
        return email as T;
      }
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;
  return { container, events, emailPatterns, emailResolutions: () => emailResolutions };
}

function harnessWithImport(
  importResult: ImportResult,
  aslRows: Array<Record<string, unknown>>
): { container: ServiceContainer } {
  const base = recordingHarness();
  const importService = {
    executeImport(configId: string) {
      expect(configId).toBe(CONF_IMP_ASL);
      return importResult;
    }
  } as ImportService;
  const db = {
    table: (name: string) =>
      name === 'ASL' ? { findAll: () => aslRows } : { findAll: () => [] }
  } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'importService') return importService as T;
      if (key === 'db') return db as T;
      return base.container.get<T>(key);
    }
  } as ServiceContainer;
  return { container };
}

test('scenario 9: imports ASL rows and verifies them in the ASL table', () => {
  const { container } = harnessWithImport(
    { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 },
      { STUDENTE: 'e2ealunno52@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 35 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9).toMatchObject({ status: 'pass' });
});

test('scenario 9: fails when an expected ASL row is missing', () => {
  const { container } = harnessWithImport(
    { inseriti: 3, aggiornati: 0, saltati: 0, ghost: 1, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9?.status).toBe('fail');
});

test('refuses to register any check and reports a single failure when the sample is not TEST_MODE', () => {
  const runner = new TestRunner();
  const container = {} as ServiceContainer;

  registerE2eScenarioChecks(runner, container, { ...sample, masterTestMode: false, testMode: false });

  const report = runner.report();
  expect(report.failed).toBe(1);
  expect(report.results[0]!.message).toMatch(/TEST_MODE/);
});

test('resolves the email service once after document generation and reuses it for scenarios 4-7', () => {
  const harness = recordingHarness();

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, harness.container, sample);

  expect(harness.events.indexOf('resolve-email')).toBeGreaterThan(
    harness.events.lastIndexOf('generate-document')
  );
  expect(harness.emailResolutions()).toBe(1);
  expect(harness.emailPatterns).toEqual([
    CONF_MAIL_VERBALE,
    CONF_MAIL_CONDOTTA,
    CONF_MAIL_CARENZA,
    CONF_MAIL_PIANI
  ]);
  expect(runner.report().failed).toBe(0);
});

test('reports strict actionable diagnostics for verbale and condotta email failures', () => {
  const harness = recordingHarness((patternId) => {
    if (patternId === CONF_MAIL_VERBALE) {
      return { targets: 3, sent: 3, skipped: 1, errors: ['verbale error'] };
    }
    if (patternId === CONF_MAIL_CONDOTTA) {
      return { targets: 4, sent: 4, skipped: 1, errors: ['condotta error'] };
    }
    return { targets: patternId === CONF_MAIL_CARENZA ? 2 : 1, sent: 1, skipped: 0, errors: [] };
  });
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const report = runner.report();
  const verbale = report.results.find((result) => result.name.includes('scenario 4'));
  const condotta = report.results.find((result) => result.name.includes('scenario 5'));
  expect(verbale).toMatchObject({
    status: 'fail',
    message: 'Invio verbale fallito: targets=3, sent=3, skipped=1, errors=verbale error'
  });
  expect(condotta).toMatchObject({
    status: 'fail',
    message: 'Invio condotta fallito: targets=4, sent=4, skipped=1, errors=condotta error'
  });
});

test('scenario 10: generates the complex doc for every class and checks for leftover placeholders', () => {
  const harness = recordingHarness();
  const driveTexts: Record<string, string> = {};
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        const drive = {
          getFileText: (fileId: string) =>
            driveTexts[fileId] ?? 'Report Complesso — 1A, no placeholders left'
        } as unknown as IDriveFacade;
        return drive as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10).toMatchObject({ status: 'pass' });
});

test('scenario 10: fails when the generated doc still has an unresolved {{...}} placeholder', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        const drive = {
          getFileText: () => 'Report Complesso — {{focus.classe.anagrafica.nome}}'
        } as unknown as IDriveFacade;
        return drive as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10?.status).toBe('fail');
});
