import type { IConfigurazioneImportRepository } from '../../domain/repositories/IConfigurazioneImportRepository';
import { toLibraryRecipe, isGhostRecord } from '../import/ImportRecipeMapper';
import { PipelineError } from '../../domain/errors/DomainError';

export interface ImportResult {
  inseriti: number;
  aggiornati: number;
  saltati: number;
  ghost: number;
  errori: string[];
}

/** Columns never subject to Ghost Record Detection besides the conflict key (ref 12 §3). */
const META_COLUMNS = ['DATA_MODIFICA'];

/** Job type under which the chunked/resumable import handler is registered in JobRunnerLib. */
export const JOB_TYPE_IMPORT_CHUNKED = 'IMPORT_CHUNKED';

/**
 * Import application service (ref 12 §3): orchestrates GasDataImporter's
 * `ImportEngine` — extraction, transformation and load strategy resolution
 * are entirely the library's job (`toLibraryRecipe` only translates
 * vocabulary). The one piece of business logic ALDO adds is Ghost Record
 * Detection, applied between transform and load: a mapped row where every
 * non-key, non-metadata field is empty is dropped before it ever reaches the
 * library's conflict-resolution strategies, and counted separately.
 *
 * Runs through the library's public `ImportEngine.runImport(recipe, options)`
 * facade rather than calling the private `_executeExtract`/`_executeTransform`
 * /`_executeLoad` phase methods directly, via `runImport`'s `postTransform`
 * hook (`(transformedData, config) => filteredData`) — this keeps ghost
 * filtering entirely inside the library's own pipeline, so imports still get
 * `GasResilienceLib`-backed retry/backoff and `GasProcessMonitorLib` job
 * progress reporting, both of which the private-method bypass silently lost.
 *
 * `executeImportChunked` (below) drives the library's alternative
 * checkpoint-based `startImport`/`runImportChunk` pair (GasDataImporter.md
 * "Resumable/chunked imports") for recipes whose source data can exceed a
 * single GAS execution window. **Known gap, flagged not fixed:**
 * `runImportChunk` has no `postTransform` hook parameter, so Ghost Record
 * Detection does NOT run in this path today (`executeImportChunked` always
 * reports `ghost: 0`). Before wiring `menu_avvioImportazioneChunked` to any
 * live CONF_IMP recipe that relies on ghost filtering, either extend
 * `runImportChunk` with the same hook `runImport` supports, or filter ghost
 * rows client-side between the checkpoint yields. `menu_avvioImportazioni`
 * (the synchronous path) remains the default/primary launcher.
 */
export class ImportService {
  constructor(
    private readonly engine: ImportEngine,
    private readonly configs: IConfigurazioneImportRepository
  ) {}

  /** Runs one CONF_IMP job end to end (ref 12 §3, steps 1-8). */
  executeImport(configId: string): ImportResult {
    const conf = this.configs.findById(configId);
    if (conf === null) throw new PipelineError(`CONF_IMP ${configId} non trovato`);
    if (!conf.isAttivo()) {
      return {
        inseriti: 0,
        aggiornati: 0,
        saltati: 0,
        ghost: 0,
        errori: ['skipped: ATTIVO=false']
      };
    }

    const recipe = toLibraryRecipe(conf);
    let ghostCount = 0;

    const result = this.engine.runImport(recipe, {
      jobId: `imp_${configId}`,
      postTransform: (mapped, configuration) => {
        const load = configuration.getLoad();
        const keyColumns = load.conflictKey === undefined ? [] : [load.conflictKey];
        const metaColumns =
          load.updateIfNewer?.timestampColumn !== undefined
            ? [...META_COLUMNS, load.updateIfNewer.timestampColumn]
            : META_COLUMNS;
        const toLoad = mapped.filter((row) => !isGhostRecord(row, keyColumns, metaColumns));
        ghostCount = mapped.length - toLoad.length;
        return toLoad;
      }
    });

    return {
      inseriti: result.load.inserted,
      aggiornati: result.load.updated,
      saltati: result.load.skipped,
      ghost: ghostCount,
      errori: []
    };
  }

  /** Runs every ATTIVO=true CONF_IMP job in sequence; one failure never aborts the others (ref 12 §3). */
  executeAllActiveImports(): Array<{ configId: string; result: ImportResult }> {
    const results: Array<{ configId: string; result: ImportResult }> = [];
    for (const conf of this.configs.findAttivi()) {
      const configId = conf.id ?? '';
      try {
        results.push({ configId, result: this.executeImport(configId) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          configId,
          result: { inseriti: 0, aggiornati: 0, saltati: 0, ghost: 0, errori: [msg] }
        });
      }
    }
    return results;
  }

  /**
   * Resumable/chunked run of one CONF_IMP job (GasDataImporter.md
   * "Resumable/chunked imports"): drives `ImportEngine.startImport` /
   * `runImportChunk` in a loop, yielding the intermediate `ImportCheckpoint`
   * after every non-final chunk so a `JobRunnerLib` job can persist it to
   * `PropertiesService` and resume across GAS execution windows. `resumeState`
   * — when supplied (e.g. from `JobHandlerParams.resumeState` on resume) —
   * is used as-is instead of calling `startImport` again.
   *
   * ATTIVO is intentionally not checked here (unlike `executeImport`): the
   * chunked launcher is invoked explicitly for one recipe id, not iterated
   * over `findAttivi()`, so there is no batch to skip past.
   *
   * Ghost Record Detection is NOT applied in this path — see the class
   * docstring's "Known gap" note. `ghost` is always `0` in the returned
   * `ImportResult`.
   */
  *executeImportChunked(
    configId: string,
    resumeState?: ImportCheckpoint
  ): Generator<ImportCheckpoint, ImportResult, void> {
    const conf = this.configs.findById(configId);
    if (conf === null) throw new PipelineError(`CONF_IMP ${configId} non trovato`);
    const recipe = toLibraryRecipe(conf);

    let checkpoint = resumeState ?? this.engine.startImport(recipe);
    while (!checkpoint.done) {
      const step = this.engine.runImportChunk(recipe, checkpoint);
      checkpoint = step.checkpoint;
      if (!step.done) yield checkpoint;
    }

    return {
      inseriti: checkpoint.counters.inserted,
      aggiornati: checkpoint.counters.updated,
      saltati: checkpoint.counters.skipped,
      // Ghost-record detection (12 §3) is not yet applied in the chunked
      // path — see the class docstring's "Known gap" note.
      ghost: 0,
      errori: []
    };
  }

  /** JobRunnerLib registry callback (passed to run/resume) for the chunked import handler. */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_IMPORT_CHUNKED, (params) =>
      this.executeImportChunked(
        String((params as { configId?: string }).configId ?? ''),
        (params as { resumeState?: ImportCheckpoint }).resumeState
      )
    );
  }

  /** Starts the chunked import through JobRunnerLib (state + resume triggers managed by the library). */
  start(runner: JobRunnerService, jobName: string, configId: string, forceRestart = false): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_IMPORT_CHUNKED,
      { configId },
      (queue) => this.registerJobHandlers(queue),
      forceRestart
    );
  }
}
