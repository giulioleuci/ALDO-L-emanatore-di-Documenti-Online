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

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    void callback;
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
