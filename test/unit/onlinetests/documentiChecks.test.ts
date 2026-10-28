import {
  registerDocumentiChecks,
  type DocumentiCheckScope
} from '../../../src/onlinetests/checks/documentiChecks';
import { avviaGenerazioneDataDriven, creaJobRunner } from '../../../src/config/Bootstrap';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

jest.mock('../../../src/config/Bootstrap', () => ({
  avviaGenerazioneDataDriven: jest.fn(),
  creaJobRunner: jest.fn()
}));

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

test('registers only the imported-table document check in its dedicated suite', () => {
  const names = register('tabelle-importate').map((check) => check.name);

  expect(names).toEqual(['documenti.tabelleImportate::generazione e contenuto']);
});

test('registers Drive-backed duplicate-policy checks in their dedicated suite', () => {
  const names = register('duplicazione').map((check) => check.name);

  expect(names).toEqual([
    'documenti.duplicazione::NEGATA non duplica su Drive',
    'documenti.duplicazione::PERMESSA crea copie distinte'
  ]);
  expect(register('all').map((check) => check.name)).toEqual(expect.arrayContaining(names));
});

test('duplicate-policy checks assert real artifact counts alongside their LOG_DOCS rows', () => {
  const runner = new RecordingRunner();
  const rows: Record<string, unknown>[] = [];
  const fileCounts = new Map<string, number>();
  let nextFile = 1;
  const permittedId = 'E2E_DOC_DUPLICAZIONE_PERMESSA';
  const documents = {
    generateForPiano: (_student: string, _piano: string, idGen: string) => {
      const permitted = idGen === permittedId;
      if (!permitted && rows.some((row) => row.ID_GEN === idGen)) {
        return { fileId: null, status: 'SKIPPED' };
      }
      const path = permitted
        ? '_ALDO_E2E_OUTPUT/DUPLICAZIONE_DOCUMENTI'
        : '_ALDO_E2E_OUTPUT/DOCUMENTI PERS';
      const fileId = `file-${nextFile++}`;
      fileCounts.set(path, (fileCounts.get(path) ?? 0) + 1);
      rows.push({
        ID_GEN: idGen,
        UTENTI: 'e2ealunno42@onlinetest.aldo.local',
        ID: fileId,
        NOME: 'E2E_DuplicazionePermessa_Test'
      });
      return { fileId, status: 'GENERATO' };
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          createFolder: (path: string) => path,
          countFilesInFolder: (path: string) => fileCounts.get(path) ?? 0
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'duplicazione');

  runner.callbacks.get('documenti.duplicazione::NEGATA non duplica su Drive')!();
  runner.callbacks.get('documenti.duplicazione::PERMESSA crea copie distinte')!();
  runner.callbacks.get('documenti.duplicazione::NEGATA non duplica su Drive')!();
  runner.callbacks.get('documenti.duplicazione::PERMESSA crea copie distinte')!();

  expect(fileCounts.get('_ALDO_E2E_OUTPUT/DOCUMENTI PERS')).toBe(1);
  expect(fileCounts.get('_ALDO_E2E_OUTPUT/DUPLICAZIONE_DOCUMENTI')).toBe(4);
  expect(rows.filter((row) => row.ID_GEN === permittedId).map((row) => row.ID)).toEqual([
    'file-2',
    'file-3',
    'file-4',
    'file-5'
  ]);
});

test('duplicate-policy checks reject persisted filenames with leading or trailing whitespace', () => {
  const runner = new RecordingRunner();
  const rows: Record<string, unknown>[] = [];
  let nextFile = 1;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') {
        return {
          generateForPiano: (_student: string, _piano: string, idGen: string) => {
            const fileId = `file-${nextFile++}`;
            rows.push({
              ID_GEN: idGen,
              UTENTI: 'e2ealunno42@onlinetest.aldo.local',
              ID: fileId,
              NOME: ' E2E_DuplicazionePermessa_Test '
            });
            return { fileId, status: 'GENERATO' };
          }
        } as T;
      }
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          createFolder: (path: string) => path,
          countFilesInFolder: () => rows.length
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'duplicazione');

  expect(runner.callbacks.get('documenti.duplicazione::PERMESSA crea copie distinte')).toThrow(
    /normalizzate/
  );
});

test('imported-table check clears leftover job state before the first generation run', () => {
  const calls: string[] = [];
  const jobRunner = {
    resetJob: (jobName: string) => calls.push(`reset:${jobName}`)
  };
  jest.mocked(creaJobRunner).mockReturnValue(jobRunner as never);
  jest
    .mocked(avviaGenerazioneDataDriven)
    .mockImplementation((_container, configId) => calls.push(`start:${String(configId)}`));

  const runner = new RecordingRunner();
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => [] }) } as T;
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  // The leftover-state reset must precede the launch; the check itself still
  // fails afterwards because the stubbed run persists no LOG_DOCS row.
  expect(runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')).toThrow(
    /attesa una riga LOG_DOCS/
  );
  expect(calls).toEqual(['reset:gen_E2E_DOC_TABELLE', 'start:E2E_DOC_TABELLE']);
});

test('imported-table check reports only bounded heading diagnostics on content failure', () => {
  const runner = new RecordingRunner();
  jest.mocked(creaJobRunner).mockReturnValue({ resetJob: jest.fn() } as never);
  jest.mocked(avviaGenerazioneDataDriven).mockImplementation(() => undefined);
  const rows = [
    {
      ID_GEN: 'E2E_DOC_TABELLE',
      CLASSI: '1A',
      ID: 'generated-table-doc',
      LINK: 'https://drive.google.com/open?id=generated-table-doc',
      TIPO: 'E2E_TABELLE'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          getFileText: () => 'Nome Valore {{focus.classe.nome}} {{residuo}}'
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  expect(runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')).toThrow(
    /generated-table-doc.*heading atteso presente=false.*placeholder letterale residuo=true.*placeholder residui=2/
  );
});

test('imported-table check accepts the template static tables that also head a Valore column', () => {
  const runner = new RecordingRunner();
  jest.mocked(creaJobRunner).mockReturnValue({ resetJob: jest.fn() } as never);
  jest.mocked(avviaGenerazioneDataDriven).mockImplementation(() => undefined);
  const rows = [
    {
      ID_GEN: 'E2E_DOC_TABELLE',
      CLASSI: '1A',
      ID: 'generated-table-doc',
      LINK: 'https://drive.google.com/open?id=generated-table-doc',
      TIPO: 'E2E_TABELLE'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          getFileText: () =>
            'Tabelle importate per la classe 1A Nome Valore Prima riga 1 Seconda riga 2 ' +
            'Testo dopo la tabella con dati Testo dopo la tabella vuota ' +
            'Colonna Valore A Uno B Due Colonna Valore'
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')!();
});

test('imported-table check rejects a second insertion of the header-only source sheet', () => {
  const runner = new RecordingRunner();
  jest.mocked(creaJobRunner).mockReturnValue({ resetJob: jest.fn() } as never);
  jest.mocked(avviaGenerazioneDataDriven).mockImplementation(() => undefined);
  const rows = [
    {
      ID_GEN: 'E2E_DOC_TABELLE',
      CLASSI: '1A',
      ID: 'generated-table-doc',
      LINK: 'https://drive.google.com/open?id=generated-table-doc',
      TIPO: 'E2E_TABELLE'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      if (key === 'drive') {
        return {
          getFileText: () =>
            'Tabelle importate per la classe 1A Nome Valore Prima riga 1 Seconda riga 2 ' +
            'Testo dopo la tabella con dati Nome Valore Testo dopo la tabella vuota'
        } as T;
      }
      return {} as T;
    }
  } as ServiceContainer;

  registerDocumentiChecks(runner as never, container, sample, 'tabelle-importate');

  expect(runner.callbacks.get('documenti.tabelleImportate::generazione e contenuto')).toThrow(
    /occorrenze Nome=2/
  );
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
  expect(typeof callback).toBe('function');
  expect(callback).toThrow(/tabella|link/i);
});
