import {
  registerDocumentiChecks,
  type DocumentiCheckScope
} from '../../../src/onlinetests/checks/documentiChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

interface RegisteredCheck {
  name: string;
  artifactUrl: string | undefined;
}

class RecordingRunner {
  readonly checks: RegisteredCheck[] = [];
  readonly callbacks = new Map<string, () => void>();

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.callbacks.set(name, callback);
    this.checks.push({ name, artifactUrl });
  }
}

const sample: SharedTestDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-sample',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-sample',
  masterTestMode: true,
  staticAttachmentFileId: 'static-attachment',
  testMode: true
};

function register(scope: DocumentiCheckScope): RegisteredCheck[] {
  const runner = new RecordingRunner();
  const container = {
    get: () => ({})
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, scope);

  return runner.checks;
}

test('registers the standard document scenarios without import or email scenarios', () => {
  const names = register('standard').map((check) => check.name);

  expect(names).toEqual(
    expect.arrayContaining([
      'E2E scenario 1: genera verbale consiglio di classe (tutte le classi)',
      'E2E scenario 2: genera foglio valutazione condotta (tutte le classi)',
      'E2E scenario 3: piani personalizzati con modello condizionale, dedupe e storico per sottotipo',
      'E2E scenario 8: genera riepilogo classe (tutte le classi)',
      'E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)',
      'documenti.standard::template interop unicode, liste, tabelle e link'
    ])
  );
  expect(names).not.toEqual(
    expect.arrayContaining([
      'E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)',
      'E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)',
      'E2E scenario 10b: genera documento complesso classe articolata (3C)'
    ])
  );
});

test('registers only the articulated document scenarios in the articulated suite', () => {
  const names = register('articolati').map((check) => check.name);

  expect(names).toEqual([
    'E2E scenario 10b: genera documento complesso classe articolata (3C)',
    'E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA'
  ]);
});

test('registers one TEST_MODE guard when the aggregate document scope is unsafe', () => {
  const runner = new RecordingRunner();
  const container = { get: () => ({}) } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, { ...sample, testMode: false }, 'all');

  expect(runner.checks).toEqual([
    {
      name: 'E2E scenarios: MASTER.TEST_MODE guard',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('rejects interop output without a rendered table cell and template link', () => {
  const runner = new RecordingRunner();
  const documentGenerationService = { generateForClasse: () => ({ fileId: 'complesso-1A' }) };
  const db = {
    table: () => ({
      findAll: () => [
        {
          ID_GEN: 'E2E_DOC_COMPLESSO',
          CLASSI: '1A',
          ID: 'complesso-1A',
          LINK: 'https://drive.google.com/open?id=complesso-1A'
        }
      ]
    })
  };
  const drive = {
    getFileText: () =>
      'Report Complesso — 1A Coordinatori, ordinati per nome Rappresentanti degli studenti Specificità per materia e2ealunno1@onlinetest.aldo.local'
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documentGenerationService as T;
      if (key === 'db') return db as T;
      if (key === 'drive') return drive as T;
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'standard');

  const callback = runner.callbacks.get(
    'documenti.standard::template interop unicode, liste, tabelle e link'
  );
  expect(callback).toBeDefined();
  expect(callback).toThrow(/tabella|link/i);
});
