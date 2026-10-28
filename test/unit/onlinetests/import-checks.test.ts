import {
  avviaImportazioneChunkedDataDriven,
  avviaImportazioneDataDriven,
  creaJobRunner,
  riprendiJobSospeso
} from '../../../src/config/Bootstrap';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  COL_ASL,
  COL_CARENZE,
  COL_CONF_IMP,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  TABLE
} from '../../../src/config/schema';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import {
  registerImportCartelleClasseChecks,
  registerImportCercaDocumentiChecks,
  registerImportChecks,
  registerImportChunkedChecks
} from '../../../src/onlinetests/checks/importChecks';
import { CONF_IMP_ASL } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_BAD_STRATEGY,
  CONF_IMP_CERCA_DOCUMENTI,
  CONF_IMP_CHUNKED,
  CONF_IMP_DISABLED,
  CONF_IMP_IGNORE,
  CONF_IMP_MISSING_FILE,
  CONF_IMP_MISSING_FOLDER,
  CONF_IMP_MISSING_IDGEN,
  CONF_IMP_NOHEADER,
  CONF_IMP_TIMESTAMP
} from '../../../src/onlinetests/data/fixtures';

jest.mock('../../../src/config/Bootstrap', () => ({
  avviaImportazioneDataDriven: jest.fn(),
  avviaImportazioneChunkedDataDriven: jest.fn(),
  creaJobRunner: jest.fn(),
  riprendiJobSospeso: jest.fn()
}));

class ImmediateRunner {
  readonly checks: Array<{ name: string; error?: Error }> = [];

  add(name: string, _artifactUrl: string | undefined, callback: () => void): void {
    try {
      callback();
      this.checks.push({ name });
    } catch (error) {
      this.checks.push({ name, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
}

test('runs FILE_SINGOLO policies through the synchronous launcher and verifies their visible effects', () => {
  const rows: Array<Record<string, unknown>> = [];
  const carenze = [
    {
      [COL_CARENZE.STUDENTE]: 'e2ealunno1@onlinetest.aldo.local',
      [COL_CARENZE.NOTE]: 'target precedente',
      [COL_CARENZE.DATA_MODIFICA]: '2026-07-01'
    },
    {
      [COL_CARENZE.STUDENTE]: 'e2ealunno21@onlinetest.aldo.local',
      [COL_CARENZE.NOTE]: 'Carenza E2E di prova',
      [COL_CARENZE.DATA_MODIFICA]: '2026-07-03'
    }
  ];
  const snapshot = () => JSON.stringify(rows);
  const get = jest.fn(() => ({
    table: (name: string) => ({ findAll: () => (name === TABLE.CARENZE ? carenze : rows) })
  }));
  const container = {
    get
  } as unknown as ServiceContainer;
  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_container, id) => {
    switch (id) {
      case CONF_IMP_ASL:
        rows.splice(0, rows.length, {
          [COL_ASL.STUDENTE]: 'e2ealunno43@onlinetest.aldo.local',
          [COL_ASL.ORE]: 40
        });
        return { inseriti: 1, aggiornati: 0, saltati: 0, ghost: 1, errori: [] };
      case CONF_IMP_IGNORE:
        return { inseriti: 0, aggiornati: 0, saltati: 1, ghost: 0, errori: [] };
      case CONF_IMP_TIMESTAMP:
        carenze[0]![COL_CARENZE.NOTE] = 'Sorgente timestamp più recente';
        carenze[0]![COL_CARENZE.DATA_MODIFICA] = '2026-07-02';
        return { inseriti: 0, aggiornati: 1, saltati: 1, ghost: 0, errori: [] };
      case 'E2E_IMP_TIMESTAMP_FALLBACK':
        // Runs before CONF_IMP_ASL now (Task 6), so it must not assume the ASL row
        // already exists — it seeds it itself, exactly as the fallback OVERWRITE
        // would against the pre-seeded fixture row.
        rows.splice(0, rows.length, {
          [COL_ASL.STUDENTE]: 'e2ealunno43@onlinetest.aldo.local',
          [COL_ASL.ORE]: 999
        });
        return { inseriti: 1, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
      case CONF_IMP_NOHEADER:
        rows.splice(0, rows.length, {
          [COL_ASL.STUDENTE]: 'e2ealunno52@onlinetest.aldo.local',
          [COL_ASL.ORE]: 77
        });
        return { inseriti: 1, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
      case CONF_IMP_DISABLED:
        return {
          inseriti: 0,
          aggiornati: 0,
          saltati: 0,
          ghost: 0,
          errori: ['skipped: ATTIVO=false']
        };
      case CONF_IMP_MISSING_FILE:
      case CONF_IMP_MISSING_FOLDER:
      case CONF_IMP_MISSING_IDGEN:
      case CONF_IMP_BAD_STRATEGY:
        expect(snapshot()).toBe(snapshot());
        throw new ConfigurationError(`bad config ${id}`);
      default:
        throw new Error(`Unexpected import ${id}`);
    }
  });

  const runner = new ImmediateRunner();
  registerImportChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(7);
  expect(runner.checks.every((check) => check.error === undefined)).toBe(true);
  expect(jest.mocked(avviaImportazioneDataDriven).mock.calls.map(([, id]) => id)).toEqual([
    'E2E_IMP_TIMESTAMP_FALLBACK',
    CONF_IMP_ASL,
    CONF_IMP_IGNORE,
    CONF_IMP_TIMESTAMP,
    CONF_IMP_NOHEADER,
    CONF_IMP_DISABLED,
    CONF_IMP_MISSING_FILE,
    CONF_IMP_MISSING_FOLDER,
    CONF_IMP_MISSING_IDGEN,
    CONF_IMP_BAD_STRATEGY
  ]);
  expect(rows).toEqual([
    { [COL_ASL.STUDENTE]: 'e2ealunno52@onlinetest.aldo.local', [COL_ASL.ORE]: 77 }
  ]);
  expect(get).toHaveBeenCalledWith('db');
  expect(TABLE.ASL).toBe('ASL');
});

test('registra il fallback TIMESTAMP prima degli import che scrivono DATA_MODIFICA su ASL', () => {
  const get = jest.fn(() => ({
    table: () => ({ findAll: () => [] })
  }));
  const container = { get } as unknown as ServiceContainer;
  jest.mocked(avviaImportazioneDataDriven).mockReturnValue({
    inseriti: 0,
    aggiornati: 0,
    saltati: 0,
    ghost: 0,
    errori: []
  });

  const runner = new ImmediateRunner();
  registerImportChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  const names = runner.checks.map((check) => check.name);
  expect(
    names.indexOf('import.policy::TIMESTAMP degrada a OVERWRITE senza colonna target')
  ).toBeLessThan(names.indexOf('import.fileSingolo::OVERWRITE, intestazioni e riga ghost'));
});

const CARTELLE_ELIGIBLE_CLASSES = ['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C'];
const CARTELLE_FOLDER_TIPO = 'E2E_ASL_CARTELLE';
const CARTELLE_STUDENTE_SCONOSCIUTO = 'sconosciuto@onlinetest.aldo.local';

/** Mirrors what `avviaImportazioneDataDriven(container, CONF_IMP_ASL_CARTELLE)` writes for real:
 * per eligible class, 2 rows for one known student (consecutive ORE) plus 1 `sconosciuto` row. */
function buildCartelleClasseRows(): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  CARTELLE_ELIGIBLE_CLASSES.forEach((classe, index) => {
    const ore = 12 + index * 7;
    const known = `noto-${classe}@onlinetest.aldo.local`;
    rows.push({ [COL_ASL.STUDENTE]: known, [COL_ASL.ORE]: ore, _CLASSE: classe });
    rows.push({ [COL_ASL.STUDENTE]: known, [COL_ASL.ORE]: ore + 1, _CLASSE: classe });
    rows.push({
      [COL_ASL.STUDENTE]: CARTELLE_STUDENTE_SCONOSCIUTO,
      [COL_ASL.ORE]: ore + 2,
      _CLASSE: classe
    });
  });
  return rows;
}

function cartelleClasseContainer(aslRows: Array<Record<string, unknown>>): {
  container: ServiceContainer;
  get: jest.Mock;
} {
  const logFoldRows = CARTELLE_ELIGIBLE_CLASSES.map((classe) => ({
    [COL_LOG_FOLD.ID_GEN]: CARTELLE_FOLDER_TIPO,
    [COL_LOG_FOLD.CLASSI]: classe
  }));
  const confImpRows = [
    {
      [COL_CONF_IMP.ID]: CONF_IMP_ASL_CARTELLE,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({ folderTipo: CARTELLE_FOLDER_TIPO })
    }
  ];
  const get = jest.fn(() => ({
    table: (name: string) => ({
      findAll: () => {
        if (name === TABLE.ASL) return aslRows;
        if (name === TABLE.LOG_FOLD) return logFoldRows;
        if (name === TABLE.CONF_IMP) return confImpRows;
        throw new Error(`unexpected table ${name}`);
      }
    })
  }));
  return { container: { get } as unknown as ServiceContainer, get };
}

test('registerImportCartelleClasseChecks verifies per-class shape, _CLASSE, counters and OVERWRITE idempotency', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const { container, get } = cartelleClasseContainer(aslRows);

  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_c, id) => {
    if (id !== CONF_IMP_ASL_CARTELLE) throw new Error(`unexpected import ${id}`);
    aslRows.splice(0, aslRows.length, ...buildCartelleClasseRows());
    return { inseriti: aslRows.length, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
  });

  const runner = new ImmediateRunner();
  registerImportCartelleClasseChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error).toBeUndefined();
  expect(jest.mocked(avviaImportazioneDataDriven).mock.calls.map(([, id]) => id)).toEqual([
    CONF_IMP_ASL_CARTELLE,
    CONF_IMP_ASL_CARTELLE
  ]);
  expect(aslRows).toHaveLength(CARTELLE_ELIGIBLE_CLASSES.length * 3);
  expect(get).toHaveBeenCalledWith('db');
});

test('registerImportCartelleClasseChecks fails when a stray row outside the eligible classes leaks in', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const { container } = cartelleClasseContainer(aslRows);

  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_c, id) => {
    if (id !== CONF_IMP_ASL_CARTELLE) throw new Error(`unexpected import ${id}`);
    // Same total row count as a real run (18), but the last legitimate row is swapped for a
    // decoy-shaped one (ORE=99, a class outside the eligible set) — proves the shape/leak
    // guards actually fire instead of only the (still-passing) row-count check.
    const built = buildCartelleClasseRows();
    built[built.length - 1] = {
      [COL_ASL.STUDENTE]: 'decoy@onlinetest.aldo.local',
      [COL_ASL.ORE]: 99,
      _CLASSE: '2B_DECOY'
    };
    aslRows.splice(0, aslRows.length, ...built);
    return { inseriti: aslRows.length, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
  });

  const runner = new ImmediateRunner();
  registerImportCartelleClasseChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error?.message).toMatch(/ORE=99/);
});

const CERCA_DOCUMENTI_STUDENTS: Array<[string, number]> = [
  ['e2ealunno43@onlinetest.aldo.local', 40],
  ['e2ealunno44@onlinetest.aldo.local', 55],
  ['e2ealunno51@onlinetest.aldo.local', 60],
  ['e2ealunno52@onlinetest.aldo.local', 35]
];

interface FakeLogDocsTable {
  findAll: () => Array<Record<string, unknown>>;
  find: (predicate: (row: Record<string, unknown>) => boolean) => Record<string, unknown> | null;
  insert: (row: Record<string, unknown>) => void;
}

function cercaDocumentiContainer(
  aslRows: Array<Record<string, unknown>>,
  logDocsRows: Array<Record<string, unknown>>
): { container: ServiceContainer; generateForClasse: jest.Mock } {
  const generateForClasse = jest.fn((classe: { value: string }, confDocId: string) => {
    const fileId = `file_${classe.value}`;
    logDocsRows.push({
      [COL_LOG_DOCS.ID]: fileId,
      [COL_LOG_DOCS.ID_GEN]: confDocId,
      [COL_LOG_DOCS.TIPO]: 'E2E_IMPORT_SOURCE',
      [COL_LOG_DOCS.CLASSI]: classe.value
    });
    return { fileId, status: 'GENERATO' };
  });
  const logDocsTable: FakeLogDocsTable = {
    findAll: () => logDocsRows,
    find: (predicate) => logDocsRows.find(predicate) ?? null,
    insert: (row) => {
      logDocsRows.push(row);
    }
  };
  const get = jest.fn((key: string) => {
    if (key === 'db') {
      return {
        table: (name: string) => {
          if (name === TABLE.ASL) return { findAll: () => aslRows };
          if (name === TABLE.LOG_DOCS) return logDocsTable;
          throw new Error(`unexpected table ${name}`);
        }
      };
    }
    if (key === 'documentGenerationService') return { generateForClasse };
    throw new Error(`unexpected container key ${key}`);
  });
  return { container: { get } as unknown as ServiceContainer, generateForClasse };
}

test('registerImportCercaDocumentiChecks generates 2 real sheets, appends the excluded-tipo row once, and verifies _CLASSE per record', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const logDocsRows: Array<Record<string, unknown>> = [];
  const { container, generateForClasse } = cercaDocumentiContainer(aslRows, logDocsRows);

  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_c, id) => {
    if (id !== CONF_IMP_CERCA_DOCUMENTI) throw new Error(`unexpected import ${id}`);
    aslRows.splice(
      0,
      aslRows.length,
      ...CERCA_DOCUMENTI_STUDENTS.map(([studente, ore]) => ({
        [COL_ASL.STUDENTE]: studente,
        [COL_ASL.ORE]: ore,
        _CLASSE: '2A'
      }))
    );
    return { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
  });

  const runner = new ImmediateRunner();
  registerImportCercaDocumentiChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    staticAttachmentFileId: 'attachment_doc_1',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error).toBeUndefined();
  expect(generateForClasse).toHaveBeenCalledTimes(2);
  expect(generateForClasse.mock.calls.map(([classe]: [{ value: string }]) => classe.value)).toEqual(
    ['1A', '2A']
  );
  const excludedRows = logDocsRows.filter(
    (row) => row[COL_LOG_DOCS.TIPO] === 'E2E_IMPORT_SOURCE_ALTRO_TIPO'
  );
  expect(excludedRows).toHaveLength(1);
  const nonSheetRows = logDocsRows.filter((row) => row[COL_LOG_DOCS.ID] === 'attachment_doc_1');
  expect(nonSheetRows).toHaveLength(1);
  expect(nonSheetRows[0]?.[COL_LOG_DOCS.TIPO]).toBe('E2E_IMPORT_SOURCE');
  expect(jest.mocked(avviaImportazioneDataDriven)).toHaveBeenCalledWith(
    container,
    CONF_IMP_CERCA_DOCUMENTI
  );

  // Rerun: DUPLICAZIONE=NEGATA reports SKIPPED (fileId=null); both manually-appended rows must
  // stay idempotent (no duplicates appended) since they are looked up by ID before inserting.
  generateForClasse.mockImplementation(() => ({ fileId: null, status: 'SKIPPED' }));
  const runner2 = new ImmediateRunner();
  registerImportCercaDocumentiChecks(runner2 as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    staticAttachmentFileId: 'attachment_doc_1',
    testMode: true
  } as never);
  expect(runner2.checks[0]?.error).toBeUndefined();
  expect(
    logDocsRows.filter((row) => row[COL_LOG_DOCS.TIPO] === 'E2E_IMPORT_SOURCE_ALTRO_TIPO')
  ).toHaveLength(1);
  expect(logDocsRows.filter((row) => row[COL_LOG_DOCS.ID] === 'attachment_doc_1')).toHaveLength(1);
});

test('registerImportCercaDocumentiChecks fails when the excluded-tipo document leaks into the imported rows', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const logDocsRows: Array<Record<string, unknown>> = [];
  const { container } = cercaDocumentiContainer(aslRows, logDocsRows);

  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_c, id) => {
    if (id !== CONF_IMP_CERCA_DOCUMENTI) throw new Error(`unexpected import ${id}`);
    aslRows.splice(
      0,
      aslRows.length,
      ...CERCA_DOCUMENTI_STUDENTS.map(([studente, ore]) => ({
        [COL_ASL.STUDENTE]: studente,
        [COL_ASL.ORE]: ore,
        _CLASSE: '2A'
      })),
      {
        [COL_ASL.STUDENTE]: 'leaked@onlinetest.aldo.local',
        [COL_ASL.ORE]: 1,
        _CLASSE: 'ZZ_ESCLUSA_TIPO'
      }
    );
    return { inseriti: 5, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
  });

  const runner = new ImmediateRunner();
  registerImportCercaDocumentiChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    staticAttachmentFileId: 'attachment_doc_1',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error?.message).toMatch(/escluso per TIPO/);
});

test('registerImportCercaDocumentiChecks fails when the non-sheet document leaks into the imported rows', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const logDocsRows: Array<Record<string, unknown>> = [];
  const { container } = cercaDocumentiContainer(aslRows, logDocsRows);

  jest.mocked(avviaImportazioneDataDriven).mockImplementation((_c, id) => {
    if (id !== CONF_IMP_CERCA_DOCUMENTI) throw new Error(`unexpected import ${id}`);
    aslRows.splice(
      0,
      aslRows.length,
      ...CERCA_DOCUMENTI_STUDENTS.map(([studente, ore]) => ({
        [COL_ASL.STUDENTE]: studente,
        [COL_ASL.ORE]: ore,
        _CLASSE: '2A'
      })),
      {
        [COL_ASL.STUDENTE]: 'leaked@onlinetest.aldo.local',
        [COL_ASL.ORE]: 1,
        _CLASSE: 'ZZ_NON_FOGLIO'
      }
    );
    return { inseriti: 5, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
  });

  const runner = new ImmediateRunner();
  registerImportCercaDocumentiChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    staticAttachmentFileId: 'attachment_doc_1',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error?.message).toMatch(/documento non-foglio/);
});

test('registerImportCercaDocumentiChecks rejects an empty non-sheet sentinel ID before inserting it', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const logDocsRows: Array<Record<string, unknown>> = [];
  const { container } = cercaDocumentiContainer(aslRows, logDocsRows);

  const runner = new ImmediateRunner();
  registerImportCercaDocumentiChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    staticAttachmentFileId: '',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(1);
  expect(runner.checks[0]?.error?.message).toMatch(/allegato statico.*mancante/i);
  expect(logDocsRows).toEqual([]);
  expect(avviaImportazioneDataDriven).not.toHaveBeenCalled();
});

function chunkedContainer(aslRows: Array<Record<string, unknown>>): {
  container: ServiceContainer;
  get: jest.Mock;
} {
  const get = jest.fn(() => ({
    table: (name: string) => {
      if (name === TABLE.ASL) return { findAll: () => aslRows };
      throw new Error(`unexpected table ${name}`);
    }
  }));
  return { container: { get } as unknown as ServiceContainer, get };
}

function fakeJobRunnerControl(initialState: string): {
  jobRunner: { getStatus: jest.Mock; resetJob: jest.Mock; cancelJob: jest.Mock };
  setState: (state: string) => void;
} {
  let state = initialState;
  const jobRunner = {
    getStatus: jest.fn(() => ({ state, completed: state === 'completed' })),
    resetJob: jest.fn(() => {
      state = 'not_started';
    }),
    cancelJob: jest.fn()
  };
  return { jobRunner, setState: (next) => (state = next) };
}

test('registerImportChunkedChecks suspends at to_resume, resumes without duplicates, and resets job state', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const { container } = chunkedContainer(aslRows);
  // registerImportChunkedChecks now resets job state before starting, so the
  // mock must model the same not_started -> to_resume transition the real
  // avviaImportazioneChunkedDataDriven produces (run then suspend).
  const { jobRunner, setState } = fakeJobRunnerControl('not_started');
  jest.mocked(creaJobRunner).mockReturnValue(jobRunner as never);
  jest.mocked(avviaImportazioneChunkedDataDriven).mockImplementation(() => {
    setState('to_resume');
    return null;
  });
  jest.mocked(riprendiJobSospeso).mockImplementation(() => {
    setState('completed');
    aslRows.splice(
      0,
      aslRows.length,
      ...CERCA_DOCUMENTI_STUDENTS.map(([studente, ore]) => ({
        [COL_ASL.STUDENTE]: studente,
        [COL_ASL.ORE]: ore
      }))
    );
    return {};
  });

  const runner = new ImmediateRunner();
  registerImportChunkedChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks).toHaveLength(3);
  expect(runner.checks.every((check) => check.error === undefined)).toBe(true);
  expect(jest.mocked(avviaImportazioneChunkedDataDriven)).toHaveBeenCalledWith(
    container,
    CONF_IMP_CHUNKED,
    jobRunner,
    50
  );
  expect(jest.mocked(riprendiJobSospeso)).toHaveBeenCalledWith(
    container,
    jobRunner,
    `imp_chunked_${CONF_IMP_CHUNKED}`,
    25 * 60 * 1000
  );
  expect(jobRunner.resetJob).toHaveBeenCalledWith(`imp_chunked_${CONF_IMP_CHUNKED}`);
  expect(jobRunner.cancelJob).not.toHaveBeenCalled();
});

test('registerImportChunkedChecks fails when the resume leaves duplicate STUDENTE rows', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const { container } = chunkedContainer(aslRows);
  // registerImportChunkedChecks now resets job state before starting, so the
  // mock must model the same not_started -> to_resume transition the real
  // avviaImportazioneChunkedDataDriven produces (run then suspend).
  const { jobRunner, setState } = fakeJobRunnerControl('not_started');
  jest.mocked(creaJobRunner).mockReturnValue(jobRunner as never);
  jest.mocked(avviaImportazioneChunkedDataDriven).mockImplementation(() => {
    setState('to_resume');
    return null;
  });
  jest.mocked(riprendiJobSospeso).mockImplementation(() => {
    setState('completed');
    aslRows.splice(
      0,
      aslRows.length,
      { [COL_ASL.STUDENTE]: 'e2ealunno43@onlinetest.aldo.local', [COL_ASL.ORE]: 40 },
      { [COL_ASL.STUDENTE]: 'e2ealunno43@onlinetest.aldo.local', [COL_ASL.ORE]: 40 }
    );
    return {};
  });

  const runner = new ImmediateRunner();
  registerImportChunkedChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks[1]?.error?.message).toMatch(/duplicat/);
  // The finally-block guard cancels a still-suspended job; here it's already completed.
  expect(jobRunner.cancelJob).not.toHaveBeenCalled();
});

test('registerImportChunkedChecks never reaching to_resume fails the first check and the finally-guard skips cancelJob', () => {
  const aslRows: Array<Record<string, unknown>> = [];
  const { container } = chunkedContainer(aslRows);
  const { jobRunner } = fakeJobRunnerControl('completed');
  jest.mocked(creaJobRunner).mockReturnValue(jobRunner as never);
  jest.mocked(avviaImportazioneChunkedDataDriven).mockImplementation(() => null);

  const runner = new ImmediateRunner();
  registerImportChunkedChecks(runner as never, container, {
    sampleSpreadsheetUrl: 'https://example.test/sample',
    testMode: true
  } as never);

  expect(runner.checks[0]?.error?.message).toMatch(/atteso stato to_resume/);
  expect(jobRunner.cancelJob).not.toHaveBeenCalled();
});
