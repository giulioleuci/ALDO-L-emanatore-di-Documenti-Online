import { ImportService, JOB_TYPE_IMPORT_CHUNKED } from '../../../src/application/services/ImportService';
import { ConfigurazioneImportRepository } from '../../../src/infrastructure/repositories/ConfigurazioneImportRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

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
        load: { inserted: 0, updated: 0, skipped: 0, deleted: 0, total: 0, recordsProcessed: 0, failed: 0 }
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
  expect(first.value).toMatchObject({ configId: 'IMPORT_ALUNNI', importCheckpoint: { stage: 'LOAD' } });

  const resumedGenerator = handler({ resumeState: first.value });
  let resumed = resumedGenerator.next();
  while (!resumed.done) resumed = resumedGenerator.next();

  expect(checkpoints.map((checkpoint) => checkpoint.stage)).toEqual(['EXTRACT', 'LOAD']);
  expect(resumed.value).toMatchObject({ inseriti: 1 });
});

test('registered import handler rejects a resume wrapper without configId before engine invocation', () => {
  const database = db([confImpRow()]);
  const engine = {
    startImport: jest.fn(),
    runImportChunk: jest.fn()
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
  expect(engine.startImport).not.toHaveBeenCalled();
  expect(engine.runImportChunk).not.toHaveBeenCalled();
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
