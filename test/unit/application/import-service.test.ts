import { ImportService } from '../../../src/application/services/ImportService';
import { ConfigurazioneImportRepository } from '../../../src/infrastructure/repositories/ConfigurazioneImportRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

/**
 * A minimal ImportEngine double implementing the exact bound-method contract
 * ImportService calls (_executeExtract/_executeTransform/_executeLoad), so
 * these tests exercise ImportService's orchestration (ghost filtering,
 * counting, sequencing) without needing SpreadsheetApp/DriveApp.
 */
function fakeEngine(sourceRows: Record<string, unknown>[], loader: (data: Record<string, unknown>[], targetTable: string) => ImportLoadResult) {
  const calls: string[] = [];
  return {
    calls,
    engine: {
      _executeExtract: () => {
        calls.push('extract');
        return sourceRows;
      },
      _executeTransform: (data: Record<string, unknown>[]) => {
        calls.push('transform');
        // Mirrors the library's mapping: A->EMAIL, B->COGNOMENOME, source col C passthrough as NOTE.
        return data.map((r) => ({ EMAIL: r['A'], COGNOMENOME: r['B'], NOTE: r['C'] ?? null }));
      },
      _executeLoad: (data: Record<string, unknown>[], config: ImportConfiguration) => {
        calls.push('load');
        return loader(data, config.getLoad().targetTable);
      }
    } as unknown as ImportEngine
  };
}

function db(confImpRows: Row[]) {
  const tables = fixtureTables();
  tables['CONF_IMP'] = confImpRows;
  return new FakeDatabase(tables);
}

function confImpRow(overrides: Partial<Row> = {}): Row {
  return {
    ID: 'IMPORT_ALUNNI', TARGET: 'ALUNNI', ATTIVO: true,
    CONFIG: JSON.stringify({
      searchStrategy: 'FILE_SINGOLO', fileId: 'sheet1', map: { A: 'EMAIL', B: 'COGNOMENOME', C: 'NOTE' },
      key: 'EMAIL', conflictResolution: 'IGNORE'
    }),
    ...overrides
  };
}

test('executeImport runs extract -> transform -> ghost-filter -> load and reports counts (12 §3)', () => {
  const database = db([confImpRow()]);
  const { engine, calls } = fakeEngine(
    [
      { A: 'a1@x.it', B: 'ROSSI ANNA', C: 'nota' },
      { A: 'a2@x.it', B: '', C: '' } // ghost: only the key is populated
    ],
    (data) => ({ success: true, inserted: data.length, updated: 0, skipped: 0, deleted: 0, total: data.length })
  );
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  const result = service.executeImport('IMPORT_ALUNNI');

  expect(calls).toEqual(['extract', 'transform', 'load']);
  expect(result).toEqual({ inseriti: 1, aggiornati: 0, saltati: 0, ghost: 1, errori: [] });
});

test('ghost rows never reach the loader', () => {
  const database = db([confImpRow()]);
  let loadedCount = -1;
  const { engine } = fakeEngine(
    [{ A: 'a1@x.it', B: '', C: '' }],
    (data) => { loadedCount = data.length; return { success: true, inserted: 0, updated: 0, skipped: 0, deleted: 0, total: 0 }; }
  );
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const result = service.executeImport('IMPORT_ALUNNI');
  expect(loadedCount).toBe(0);
  expect(result.ghost).toBe(1);
});

test('skip immediately when ATTIVO is false (12 §3 step 2)', () => {
  const database = db([confImpRow({ ATTIVO: false })]);
  const { engine, calls } = fakeEngine([], () => { throw new Error('should not load'); });
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const result = service.executeImport('IMPORT_ALUNNI');
  expect(calls).toEqual([]);
  expect(result).toEqual({ inseriti: 0, aggiornati: 0, saltati: 0, ghost: 0, errori: ['skipped: ATTIVO=false'] });
});

test('unknown CONF_IMP id throws', () => {
  const database = db([]);
  const { engine } = fakeEngine([], () => ({ success: true, inserted: 0, updated: 0, skipped: 0, deleted: 0, total: 0 }));
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  expect(() => service.executeImport('NOPE')).toThrow();
});

test('executeAllActiveImports runs each active job independently; one failure does not abort the batch', () => {
  const database = db([
    confImpRow({ ID: 'OK', TARGET: 'ALUNNI' }),
    confImpRow({
      ID: 'BAD', TARGET: 'ALUNNI',
      CONFIG: JSON.stringify({ searchStrategy: 'CERCA_DOCUMENTI', key: 'ID', conflictResolution: 'IGNORE' })
    }),
    confImpRow({ ID: 'INACTIVE', ATTIVO: false })
  ]);
  const { engine } = fakeEngine(
    [{ A: 'a1@x.it', B: 'ROSSI', C: '' }],
    (data) => ({ success: true, inserted: data.length, updated: 0, skipped: 0, deleted: 0, total: data.length })
  );
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const results = service.executeAllActiveImports();

  expect(results.map((r) => r.configId)).toEqual(['OK', 'BAD']); // only ATTIVO=true jobs
  expect(results[0]!.result.inseriti).toBe(1);
  expect(results[1]!.result.errori[0]).toContain('CERCA_DOCUMENTI');
});
