import {
  ImportService,
  JOB_TYPE_IMPORT_CHUNKED
} from '../../../src/application/services/ImportService';
import { ConfigurazioneImportRepository } from '../../../src/infrastructure/repositories/ConfigurazioneImportRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../../src/domain/repositories/ILogJobRepository';
import { StatoJob } from '../../../src/domain/value-objects/enums';

/** Collects every LOG_JOB row appended during a test, in order. */
function fakeLogJob(): { logJob: ILogJobRepository; entries: LogJobEntryInput[] } {
  const entries: LogJobEntryInput[] = [];
  const logJob: ILogJobRepository = {
    append: (entry) => {
      entries.push(entry);
      return entry as unknown as ReturnType<ILogJobRepository['append']>;
    },
    listByType: () => [],
    getById: () => [],
    getFailuresSince: () => []
  };
  return { logJob, entries };
}

/** Engine double for the chunked import path: two chunks (EXTRACT -> LOAD -> DONE), one row inserted. */
function fakeChunkedEngine(): ImportEngine {
  return {
    startImport: (recipe: ImportRecipe) => ({
      recipeName: recipe.name,
      stage: 'EXTRACT',
      sourceCursor: null,
      rowOffset: 0,
      loadOffset: 0,
      counters: { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
      buffer: null,
      done: false
    }),
    runImportChunk: (_recipe: ImportRecipe, checkpoint: ImportCheckpoint) =>
      checkpoint.stage === 'EXTRACT'
        ? { checkpoint: { ...checkpoint, stage: 'LOAD' }, done: false }
        : {
            checkpoint: {
              ...checkpoint,
              stage: 'DONE',
              done: true,
              counters: { ...checkpoint.counters, inserted: 1 }
            },
            done: true
          }
  } as unknown as ImportEngine;
}

/**
 * A minimal ImportEngine double implementing the public `runImport(recipe, options)`
 * facade — mirroring `ImportPipelineExecutor._executePipeline`'s extract ->
 * transform -> postTransform-hook -> load sequencing — so these tests exercise
 * ImportService's orchestration (ghost filtering via the hook, counting,
 * sequencing) the same way the real library does, without needing
 * SpreadsheetApp/DriveApp.
 */
function fakeEngine(
  sourceRows: Record<string, unknown>[],
  loader: (data: Record<string, unknown>[], targetTable: string) => ImportLoadResult
) {
  const calls: string[] = [];
  return {
    calls,
    engine: {
      runImport: (
        recipe: ImportRecipe,
        options: {
          postTransform?: (
            data: Record<string, unknown>[],
            config: ImportConfiguration
          ) => Record<string, unknown>[];
        } = {}
      ) => {
        calls.push('extract');
        const extracted = sourceRows;
        calls.push('transform');
        // Mirrors the library's mapping: A->EMAIL, B->COGNOMENOME, source col C passthrough as NOTE.
        let mapped: Record<string, unknown>[] = extracted.map((r) => ({
          EMAIL: r['A'],
          COGNOMENOME: r['B'],
          NOTE: r['C'] ?? null
        }));
        const configuration = { getLoad: () => recipe.load } as unknown as ImportConfiguration;
        if (options.postTransform) mapped = options.postTransform(mapped, configuration);
        calls.push('load');
        const loadResult = loader(mapped, recipe.load.targetTable);
        return {
          success: true,
          importName: recipe.name,
          durationMs: 0,
          extract: { rowsExtracted: extracted.length, rowCount: extracted.length },
          transform: { rowsTransformed: mapped.length, recordsProcessed: mapped.length },
          load: { ...loadResult, recordsProcessed: loadResult.total, failed: 0 }
        };
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
    ID: 'IMPORT_ALUNNI',
    TARGET: 'ALUNNI',
    ATTIVO: true,
    CONFIG: JSON.stringify({
      searchStrategy: 'FILE_SINGOLO',
      fileId: 'sheet1',
      map: { A: 'EMAIL', B: 'COGNOMENOME', C: 'NOTE' },
      key: 'EMAIL',
      conflictResolution: 'IGNORE'
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
    (data) => ({
      success: true,
      inserted: data.length,
      updated: 0,
      skipped: 0,
      deleted: 0,
      total: data.length
    })
  );
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  const result = service.executeImport('IMPORT_ALUNNI');

  expect(calls).toEqual(['extract', 'transform', 'load']);
  expect(result).toEqual({ inseriti: 1, aggiornati: 0, saltati: 0, ghost: 1, errori: [] });
});

test('ghost rows never reach the loader', () => {
  const database = db([confImpRow()]);
  let loadedCount = -1;
  const { engine } = fakeEngine([{ A: 'a1@x.it', B: '', C: '' }], (data) => {
    loadedCount = data.length;
    return { success: true, inserted: 0, updated: 0, skipped: 0, deleted: 0, total: 0 };
  });
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const result = service.executeImport('IMPORT_ALUNNI');
  expect(loadedCount).toBe(0);
  expect(result.ghost).toBe(1);
});

test('skip immediately when ATTIVO is false (12 §3 step 2)', () => {
  const database = db([confImpRow({ ATTIVO: false })]);
  const { engine, calls } = fakeEngine([], () => {
    throw new Error('should not load');
  });
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const result = service.executeImport('IMPORT_ALUNNI');
  expect(calls).toEqual([]);
  expect(result).toEqual({
    inseriti: 0,
    aggiornati: 0,
    saltati: 0,
    ghost: 0,
    errori: ['skipped: ATTIVO=false']
  });
});

test('unknown CONF_IMP id throws', () => {
  const database = db([]);
  const { engine } = fakeEngine([], () => ({
    success: true,
    inserted: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    total: 0
  }));
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  expect(() => service.executeImport('NOPE')).toThrow();
});

test('rejects an invalid import configuration before the loader can write rows', () => {
  const database = new FakeDatabase({
    CONF_IMP: [
      confImpRow({
        CONFIG: JSON.stringify({
          searchStrategy: 'CERCA_DOCUMENTI',
          key: 'ID',
          conflictResolution: 'IGNORE'
        })
      })
    ],
    ALUNNI: []
  });
  const { engine } = fakeEngine([{ A: 'a1@x.it', B: 'ROSSI', C: '' }], (rows, targetTable) => {
    rows.forEach((row) => database.tables[targetTable].insert(row));
    return {
      success: true,
      inserted: rows.length,
      updated: 0,
      skipped: 0,
      deleted: 0,
      total: rows.length
    };
  });
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  expect(() => service.executeImport('IMPORT_ALUNNI')).toThrow('CERCA_DOCUMENTI');
  expect(database.table('ALUNNI').findAll()).toEqual([]);
});

test('executeImport passes a stable imp_<configId> jobId to runImport (15 §9)', () => {
  const database = db([confImpRow()]);
  let capturedOptions: { jobId?: string } | undefined;
  const engine = {
    runImport: (recipe: ImportRecipe, options: { jobId?: string }) => {
      capturedOptions = options;
      return {
        success: true,
        importName: recipe.name,
        durationMs: 0,
        extract: { rowsExtracted: 0, rowCount: 0 },
        transform: { rowsTransformed: 0, recordsProcessed: 0 },
        load: {
          inserted: 0,
          updated: 0,
          skipped: 0,
          deleted: 0,
          total: 0,
          recordsProcessed: 0,
          failed: 0
        }
      };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  service.executeImport('IMPORT_ALUNNI');

  expect(capturedOptions?.jobId).toBe('imp_IMPORT_ALUNNI');
});

test('executeAllActiveImports emits one lifecycle with structured import items', () => {
  const database = db([
    confImpRow({ ID: 'IMPORT_ALUNNI' }),
    confImpRow({ ID: 'IMPORT_DOCENTI', TARGET: 'DOCENTI' })
  ]);
  const { engine } = fakeEngine([], (data) => ({
    success: true,
    inserted: data.length,
    updated: 0,
    skipped: 0,
    deleted: 0,
    total: data.length
  }));
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const service = new ImportService(
    engine,
    new ConfigurazioneImportRepository(database),
    new LoggerService()
  );

  const result = service.executeAllActiveImports();

  expect(result).toHaveLength(2);
  const output = lines.join('\n');
  expect(output).toContain('🚀 [INIT] AVVIO JOB: import_all (Tipo: IMPORT_BATCH)');
  expect(output).toContain('📥 [IMPORT 1/2]');
  expect(output).toContain('📥 [IMPORT 2/2]');
  expect(output.match(/AVVIO JOB:/g)).toHaveLength(1);
  expect(output).toContain("🏁 [COMPLETED] Job 'import_all' completed successfully");
});

test('executeImportChunked yields one checkpoint per stage transition and resolves ImportResult', () => {
  const database = db([confImpRow()]);
  let calls = 0;
  const engine = {
    startImport: (recipe: ImportRecipe) => ({
      recipeName: recipe.name,
      stage: 'EXTRACT',
      sourceCursor: null,
      rowOffset: 0,
      loadOffset: 0,
      counters: { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
      buffer: null,
      done: false
    }),
    runImportChunk: (_recipe: ImportRecipe, checkpoint: ImportCheckpoint) => {
      calls++;
      if (checkpoint.stage === 'EXTRACT')
        return {
          checkpoint: { ...checkpoint, stage: 'TRANSFORM', buffer: [{ EMAIL: 'a@x.it' }] },
          done: false
        };
      if (checkpoint.stage === 'TRANSFORM')
        return { checkpoint: { ...checkpoint, stage: 'LOAD' }, done: false };
      return {
        checkpoint: {
          ...checkpoint,
          stage: 'DONE',
          done: true,
          counters: { ...checkpoint.counters, inserted: 1 }
        },
        done: true
      };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  const gen = service.executeImportChunked('IMPORT_ALUNNI');
  const checkpoints: ImportCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }

  expect(checkpoints.map((c) => c.stage)).toEqual(['TRANSFORM', 'LOAD']);
  expect(step.value.inseriti).toBe(1);
  expect(calls).toBe(3);
});

test('executeImportChunked skips immediately when ATTIVO is false, same as executeImport (12 §3 step 2)', () => {
  const database = db([confImpRow({ ATTIVO: false })]);
  const engine = {
    startImport: () => {
      throw new Error('should not start');
    },
    runImportChunk: () => {
      throw new Error('should not run a chunk');
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));

  const gen = service.executeImportChunked('IMPORT_ALUNNI');
  const checkpoints: ImportCheckpoint[] = [];
  let step = gen.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = gen.next();
  }

  expect(checkpoints).toEqual([]);
  expect(step.value).toEqual({
    inseriti: 0,
    aggiornati: 0,
    saltati: 0,
    ghost: 0,
    errori: ['skipped: ATTIVO=false']
  });
});

test('registered import handler resumes a raw wrapper checkpoint without top-level configId or duplicate chunks', () => {
  const database = db([confImpRow()]);
  const checkpoints: ImportCheckpoint[] = [];
  const engine = {
    startImport: (recipe: ImportRecipe) => ({
      recipeName: recipe.name,
      stage: 'EXTRACT',
      sourceCursor: null,
      rowOffset: 0,
      loadOffset: 0,
      counters: { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
      buffer: null,
      done: false
    }),
    runImportChunk: (_recipe: ImportRecipe, checkpoint: ImportCheckpoint) => {
      checkpoints.push(checkpoint);
      return checkpoint.stage === 'EXTRACT'
        ? { checkpoint: { ...checkpoint, stage: 'LOAD' }, done: false }
        : {
            checkpoint: {
              ...checkpoint,
              stage: 'DONE',
              done: true,
              counters: { ...checkpoint.counters, inserted: 1 }
            },
            done: true
          };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => registered.set(type, handler)
  });
  const handler = registered.get(JOB_TYPE_IMPORT_CHUNKED) as (params: {
    configId?: string;
    resumeState?: unknown;
  }) => Generator<unknown, ImportResult, void>;

  const firstGenerator = handler({ configId: 'IMPORT_ALUNNI' });
  const first = firstGenerator.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({
    configId: 'IMPORT_ALUNNI',
    importCheckpoint: { stage: 'LOAD' }
  });

  const resumedGenerator = handler({ resumeState: first.value });
  let resumed = resumedGenerator.next();
  while (!resumed.done) resumed = resumedGenerator.next();

  expect(checkpoints.map((checkpoint) => checkpoint.stage)).toEqual(['EXTRACT', 'LOAD']);
  expect(resumed.value).toMatchObject({ inseriti: 1 });
});

test('LOG_JOB (NEW_TABLE_LOG_JOB.md): a completed chunked import appends one ESECUZIONE=0 row', () => {
  const database = db([confImpRow()]);
  const { logJob, entries } = fakeLogJob();
  const service = new ImportService(
    fakeChunkedEngine(),
    new ConfigurazioneImportRepository(database),
    new LoggerService(),
    logJob
  );

  const gen = service.importJobHandler({ configId: 'IMPORT_ALUNNI', jobId: 'imp_1' });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    idJob: 'imp_1',
    esecuzione: 0,
    tipo: JOB_TYPE_IMPORT_CHUNKED,
    idConfig: 'IMPORT_ALUNNI',
    stato: StatoJob.COMPLETATO,
    totaleTask: 1,
    completatiOk: 1,
    falliti: 0
  });
});

test('LOG_JOB: a resumed chunked import backfills a SOSPESO_TEMPO row for the execution JobRunnerLib cut off', () => {
  const database = db([confImpRow()]);
  const { logJob, entries } = fakeLogJob();
  const service = new ImportService(
    fakeChunkedEngine(),
    new ConfigurazioneImportRepository(database),
    new LoggerService(),
    logJob
  );

  const gen = service.importJobHandler({
    jobId: 'imp_1',
    resumeState: {
      configId: 'IMPORT_ALUNNI',
      importCheckpoint: {
        recipeName: 'IMPORT_ALUNNI',
        stage: 'LOAD',
        sourceCursor: null,
        rowOffset: 0,
        loadOffset: 0,
        counters: { extracted: 1, transformed: 1, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
        buffer: null,
        done: false
      },
      runCount: 1,
      totalDurationMs: 4000,
      eseguitoDa: 'prof@school.it',
      esecuzioneIniziata: '2026-01-01T00:00:00.000Z'
    }
  });
  let step = gen.next();
  while (!step.done) step = gen.next();

  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({
    esecuzione: 0,
    stato: StatoJob.SOSPESO_TEMPO,
    inizio: '2026-01-01T00:00:00.000Z',
    eseguitoDa: 'prof@school.it'
  });
  expect(entries[1]).toMatchObject({ esecuzione: 1, stato: StatoJob.COMPLETATO });
});

test('registered import handler rejects a resume wrapper without configId before it can write a chunk', () => {
  const database = db([confImpRow()]);
  const writes: string[] = [];
  const engine = {
    startImport: () => {
      writes.push('start');
      throw new Error('unexpected start');
    },
    runImportChunk: () => {
      writes.push('chunk');
      throw new Error('unexpected chunk');
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const registered = new Map<string, unknown>();
  service.registerJobHandlers({
    registerJobHandler: (type, handler) => registered.set(type, handler)
  });
  const handler = registered.get(JOB_TYPE_IMPORT_CHUNKED) as (params: {
    configId?: string;
    resumeState?: unknown;
  }) => Generator<unknown, ImportResult, void>;

  expect(() =>
    handler({
      resumeState: { importCheckpoint: { stage: 'EXTRACT' } }
    }).next()
  ).toThrow('Stato di ripresa import privo di configId');
  expect(writes).toEqual([]);
});

test('top-level import configId overrides a conflicting resume configId', () => {
  const database = db([confImpRow()]);
  let recipeName = '';
  const engine = {
    runImportChunk: (recipe: ImportRecipe, checkpoint: ImportCheckpoint) => {
      recipeName = recipe.name;
      return {
        checkpoint: {
          ...checkpoint,
          done: true,
          counters: { ...checkpoint.counters, inserted: 1 }
        },
        done: true
      };
    }
  } as unknown as ImportEngine;
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const checkpoint = {
    recipeName: 'IMPORT_ALUNNI',
    stage: 'LOAD',
    sourceCursor: null,
    rowOffset: 0,
    loadOffset: 0,
    counters: { extracted: 0, transformed: 0, inserted: 0, updated: 0, skipped: 0, deleted: 0 },
    buffer: null,
    done: false
  } as ImportCheckpoint;

  const result = service
    .importJobHandler({
      configId: 'IMPORT_ALUNNI',
      resumeState: { configId: 'IMPORT_FROM_RESUME', importCheckpoint: checkpoint }
    })
    .next();

  expect(recipeName).toBe('IMPORT_ALUNNI');
  expect(result.value).toMatchObject({ inseriti: 1 });
});

test('executeAllActiveImports runs each active job independently; one failure does not abort the batch', () => {
  const database = db([
    confImpRow({ ID: 'OK', TARGET: 'ALUNNI' }),
    confImpRow({
      ID: 'BAD',
      TARGET: 'ALUNNI',
      CONFIG: JSON.stringify({
        searchStrategy: 'CERCA_DOCUMENTI',
        key: 'ID',
        conflictResolution: 'IGNORE'
      })
    }),
    confImpRow({ ID: 'INACTIVE', ATTIVO: false })
  ]);
  const { engine } = fakeEngine([{ A: 'a1@x.it', B: 'ROSSI', C: '' }], (data) => ({
    success: true,
    inserted: data.length,
    updated: 0,
    skipped: 0,
    deleted: 0,
    total: data.length
  }));
  const service = new ImportService(engine, new ConfigurazioneImportRepository(database));
  const results = service.executeAllActiveImports();

  expect(results.map((r) => r.configId)).toEqual(['OK', 'BAD']); // only ATTIVO=true jobs
  expect(results[0]!.result.inseriti).toBe(1);
  expect(results[1]!.result.errori[0]).toContain('CERCA_DOCUMENTI');
});

test('executeImport prints an end-of-job report with jobType IMPORTAZIONE DATI and no failures', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const database = db([confImpRow()]);
  const { engine } = fakeEngine([{ A: 'a1@x.it', B: 'ROSSI ANNA', C: 'nota' }], (data) => ({
    success: true,
    inserted: data.length,
    updated: 0,
    skipped: 0,
    deleted: 0,
    total: data.length
  }));
  const service = new ImportService(
    engine,
    new ConfigurazioneImportRepository(database),
    new LoggerService()
  );

  service.executeImport('IMPORT_ALUNNI');

  const output = lines.join('\n');
  expect(output).toContain('📊✅ [RIEPILOGO JOB] IMPORTAZIONE DATI');
  expect(output).toContain('  Esecuzioni (run): 1');
  expect(output).toContain('  Falliti: 0');
});

test('executeAllActiveImports prints an end-of-job report totalling every active CONF_IMP with failure detail', () => {
  const lines: string[] = [];
  jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
  const database = db([
    confImpRow({ ID: 'OK', TARGET: 'ALUNNI' }),
    confImpRow({
      ID: 'BAD',
      TARGET: 'ALUNNI',
      CONFIG: JSON.stringify({
        searchStrategy: 'CERCA_DOCUMENTI',
        key: 'ID',
        conflictResolution: 'IGNORE'
      })
    })
  ]);
  const { engine } = fakeEngine([{ A: 'a1@x.it', B: 'ROSSI', C: '' }], (data) => ({
    success: true,
    inserted: data.length,
    updated: 0,
    skipped: 0,
    deleted: 0,
    total: data.length
  }));
  const service = new ImportService(
    engine,
    new ConfigurazioneImportRepository(database),
    new LoggerService()
  );

  service.executeAllActiveImports();

  const output = lines.join('\n');
  expect(output).toContain('📊❌ [RIEPILOGO JOB] IMPORTAZIONE DATI');
  expect(output).toContain('  Task totali: 2');
  expect(output).toContain('  Falliti: 1');
  expect(output).toContain('    - BAD: ');
  expect(output).toContain('CERCA_DOCUMENTI');
});
