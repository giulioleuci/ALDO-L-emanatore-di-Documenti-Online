import { avviaImportazioneDataDriven } from '../../../src/config/Bootstrap';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_ASL, COL_CARENZE, COL_CONF_IMP, COL_LOG_FOLD, TABLE } from '../../../src/config/schema';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import {
  registerImportCartelleClasseChecks,
  registerImportChecks
} from '../../../src/onlinetests/checks/importChecks';
import { CONF_IMP_ASL } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_BAD_STRATEGY,
  CONF_IMP_DISABLED,
  CONF_IMP_IGNORE,
  CONF_IMP_MISSING_FILE,
  CONF_IMP_MISSING_FOLDER,
  CONF_IMP_MISSING_IDGEN,
  CONF_IMP_NOHEADER,
  CONF_IMP_TIMESTAMP
} from '../../../src/onlinetests/data/fixtures';

jest.mock('../../../src/config/Bootstrap', () => ({
  avviaImportazioneDataDriven: jest.fn()
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
        rows[0]![COL_ASL.ORE] = 999;
        return { inseriti: 0, aggiornati: 1, saltati: 0, ghost: 0, errori: [] };
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
    CONF_IMP_ASL,
    CONF_IMP_IGNORE,
    CONF_IMP_TIMESTAMP,
    'E2E_IMP_TIMESTAMP_FALLBACK',
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
    [COL_LOG_FOLD.TIPO]: CARTELLE_FOLDER_TIPO,
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
