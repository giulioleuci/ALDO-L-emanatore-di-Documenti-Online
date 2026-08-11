import { avviaImportazioneDataDriven } from '../../../src/config/Bootstrap';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_ASL, TABLE } from '../../../src/config/schema';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import { registerImportChecks } from '../../../src/onlinetests/checks/importChecks';
import { CONF_IMP_ASL } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
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
  const snapshot = () => JSON.stringify(rows);
  const get = jest.fn(() => ({ table: () => ({ findAll: () => rows }) }));
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

  expect(runner.checks).toHaveLength(6);
  expect(runner.checks.every((check) => check.error === undefined)).toBe(true);
  expect(jest.mocked(avviaImportazioneDataDriven).mock.calls.map(([, id]) => id)).toEqual([
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
