import { registerE2eScenarioChecks } from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import {
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
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
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
  const db = {
    table: () => ({ findAll: () => rows })
  } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
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
