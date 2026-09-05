import type { IConfigurazioneImportRepository } from '../../domain/repositories/IConfigurazioneImportRepository';
import { toLibraryRecipe, isGhostRecord } from '../import/ImportRecipeMapper';
import { PipelineError } from '../../domain/errors/DomainError';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import { StatoJob } from '../../domain/value-objects/enums';

export interface ImportResult {
  inseriti: number;
  aggiornati: number;
  saltati: number;
  ghost: number;
  errori: string[];
}

/** ALDO-owned JobRunner state; the nested checkpoint remains library-owned. */
export interface ImportJobCheckpoint {
  configId: string;
  importCheckpoint: ImportCheckpoint;
  jobId?: string;
  /** Number of container executions (1 = no trigger resume yet) this job launch has run across — see `importJobHandler` doc. */
  runCount?: number;
  /** Cumulative real (busy) execution time in ms across every run of this job launch — see `importJobHandler` doc. */
  totalDurationMs?: number;
  /** Email of the user who launched the job originally, propagated across every resume (LOG_JOB.ESEGUITO_DA, ref NEW_TABLE_LOG_JOB.md). */
  eseguitoDa?: string;
  /** ISO start timestamp of the execution that yielded this checkpoint — used to backfill a SOSPESO_TEMPO LOG_JOB row on the next resume (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  esecuzioneIniziata?: string;
}

/** Columns never subject to Ghost Record Detection besides the conflict key (ref 12 §3). */
const META_COLUMNS = ['DATA_MODIFICA'];

/** Job type under which the chunked/resumable import handler is registered in JobRunnerLib. */
export const JOB_TYPE_IMPORT_CHUNKED = 'IMPORT_CHUNKED';

/** Human-readable job type shown in the end-of-job report (see `logJobReport`). Both `executeImport` and `executeAllActiveImports` run synchronously in one container execution, so their report always has `runCount: 1`. */
export const JOB_LABEL_IMPORTAZIONE_DATI = 'IMPORTAZIONE DATI';

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
 * single GAS execution window. **Known gap #1, flagged not fixed:**
 * `runImportChunk` has no `postTransform` hook parameter, so Ghost Record
 * Detection does NOT run in this path today (`executeImportChunked` always
 * reports `ghost: 0`). Before wiring `menu_avvioImportazioneChunked` to any
 * live CONF_IMP recipe that relies on ghost filtering, either extend
 * `runImportChunk` with the same hook `runImport` supports, or filter ghost
 * rows client-side between the checkpoint yields. `menu_avvioImportazioni`
 * (the synchronous path) remains the default/primary launcher.
 *
 * **Known gap #2 — checkpoint-size budget:** `executeImportChunked` calls
 * `runImportChunk(recipe, checkpoint, { maxRows: 50 })` with an explicit,
 * conservative row budget rather than GLF's default (`maxRows: 500`). The
 * yielded `ImportCheckpoint.buffer` carries the chunk's transformed rows and
 * gets persisted by JobRunnerLib's own timeout-suspension path via a plain
 * `JSON.stringify` -> `setProperties`, with no size-based offload —
 * ScriptProperties caps a single value at ~9 KB. 500 rows of typical
 * ALUNNI-shaped data would badly exceed that and fail the checkpoint write
 * silently corrupting resumability; 50 keeps a serialized chunk comfortably
 * under the cap for the row shapes ALDO's CONF_IMP recipes use today. If a
 * future recipe has much wider rows, re-derive this budget from an estimate
 * of the serialized row size, don't just raise it back toward 500.
 *
 * **Known gap #3 — no progress visibility on the chunked path:** unlike the
 * synchronous path (`executeImport`, `jobId: imp_<configId>`, consumed by
 * `Menu.ts`'s monitoring sidebar via its `imp_` prefix match),
 * `executeImportChunked` gives no equivalent visibility. GLF's
 * `ImportEngine.runImportChunk` (out of scope to change here) makes no
 * `monitor.*` calls, `ImportService.start`'s `jobName` is
 * `imp_chunked_<configId>` — which would not match the sidebar's `imp_`
 * prefix scan anyway — and `ImportCheckpoint` has no `percentage` field for
 * JobRunnerLib's own progress tracking to read. This is a real gap but,
 * exactly like the Ghost Record Detection gap above, the chunked launcher is
 * not wired to any live CONF_IMP recipe yet, so this is flagged rather than
 * fixed here. Wiring real progress into this path would need a GLF-side
 * change to `runImportChunk` (to accept a monitor / emit percentage), out of
 * scope for ALDO-local changes.
 */
export class ImportService {
  constructor(
    private readonly engine: ImportEngine,
    private readonly configs: IConfigurazioneImportRepository,
    private readonly logger: LoggerService = new LoggerService(),
    private readonly logJob?: ILogJobRepository,
    private readonly activeUser?: IActiveUserFacade
  ) {}

  /** Container-execution start time for the run currently in progress (see `importJobHandler` doc). */
  private containerStartedAt = Date.now();
  /** Number of container executions (including this one) this job launch has run across. */
  private runCount = 1;
  /** Cumulative real (busy) execution time in ms from every prior run of this job launch. */
  private priorDurationMs = 0;
  /** LOG_JOB.ESEGUITO_DA for the run currently in progress — set once at generator entry. */
  private eseguitoDa = '';
  /** LOG_JOB.INIZIO for the run currently in progress (ISO) — set once at generator entry. */
  private esecuzioneIniziata = '';

  /** Prior runs' busy time plus elapsed time in the run currently in progress. */
  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  /** Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib just cut off — the app generator never gets a chance to log at the actual timeout (ref NEW_TABLE_LOG_JOB.md "Dove si scrive" §3). */
  private backfillSospesoTempo(jobId: string, configId: string, resume: ImportJobCheckpoint): void {
    if (resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    const durataSec = Math.max(
      0,
      (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000
    );
    const c = resume.importCheckpoint.counters;
    this.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_IMPORT_CHUNKED,
      idConfig: configId,
      nomeConfig: '',
      stato: StatoJob.SOSPESO_TEMPO,
      // Chunked import has no upfront total row count (streamed source) — best-effort like
      // the rest of this path's known gaps (class docstring "Known gap #2/#3").
      totaleTask: c.inserted + c.updated + c.skipped,
      completatiOk: c.inserted + c.updated + c.skipped,
      falliti: 0,
      listaFallimenti: [],
      durataSec,
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
  }

  /** Runs one CONF_IMP job end to end (ref 12 §3, steps 1-8). */
  executeImport(configId: string): ImportResult {
    const jobName = `import_${configId}`;
    const startedAt = Date.now();
    this.logger.logJobStart(jobName, 'IMPORT');
    try {
      const result = this.executeImportItem(configId);
      this.logger.logJobEnd(jobName, true, `${result.errori.length} errors`);
      this.logger.logJobReport({
        jobType: JOB_LABEL_IMPORTAZIONE_DATI,
        runCount: 1,
        totalDurationMs: Date.now() - startedAt,
        totale: 1,
        falliti: result.errori.length > 0 ? 1 : 0,
        dettagliFalliti: result.errori
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.logJobEnd(jobName, false, PiiRedactor.redact(reason));
      this.logger.logJobReport({
        jobType: JOB_LABEL_IMPORTAZIONE_DATI,
        runCount: 1,
        totalDurationMs: Date.now() - startedAt,
        totale: 1,
        falliti: 1,
        dettagliFalliti: [PiiRedactor.redact(reason)]
      });
      throw error;
    }
  }

  /** One import without lifecycle framing; used by both public wrappers. */
  private executeImportItem(configId: string): ImportResult {
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
    const startedAt = Date.now();
    const results: Array<{ configId: string; result: ImportResult }> = [];
    const active = this.configs.findAttivi();
    this.logger.logJobStart('import_all', 'IMPORT_BATCH');
    this.logger.logBatchStart(active.length);
    for (let index = 0; index < active.length; index++) {
      const conf = active[index]!;
      const configId = conf.id ?? '';
      this.logger.logItemStart(
        index + 1,
        active.length,
        'Configurazione',
        PiiRedactor.redact(configId),
        'IMPORT'
      );
      try {
        results.push({ configId, result: this.executeImportItem(configId) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          configId,
          result: { inseriti: 0, aggiornati: 0, saltati: 0, ghost: 0, errori: [msg] }
        });
      }
    }
    const failures = results.filter(({ result }) => result.errori.length > 0).length;
    this.logger.logJobEnd(
      'import_all',
      failures === 0,
      `${results.length} imports processed, ${failures} failed`
    );
    this.logger.logJobReport({
      jobType: JOB_LABEL_IMPORTAZIONE_DATI,
      runCount: 1,
      totalDurationMs: Date.now() - startedAt,
      totale: results.length,
      falliti: failures,
      dettagliFalliti: results
        .filter(({ result }) => result.errori.length > 0)
        .map(({ configId, result }) => `${configId}: ${result.errori.join('; ')}`)
    });
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
   * ATTIVO is checked here exactly as in `executeImport` (same guard,
   * checked unconditionally before the recipe is built): the chunked
   * launcher is an alternative path for the same operation as
   * `executeImport`/`menu_avvioImportazioni`, not a separate batch
   * mechanism, so a CONF_IMP recipe disabled via `ATTIVO=false` must be
   * blocked identically on both paths — including on resume, so a recipe
   * deactivated mid-run does not keep being driven to completion.
   *
   * Ghost Record Detection is NOT applied in this path — see the class
   * docstring's "Known gap #1" note. `ghost` is always `0` in the returned
   * `ImportResult`. Each chunk is bounded to `maxRows: 50` (class docstring's
   * "Known gap #2") to keep the yielded `ImportCheckpoint.buffer` well under
   * ScriptProperties' ~9 KB per-value cap when JobRunnerLib persists it on
   * timeout suspension.
   */
  *executeImportChunked(
    configId: string,
    resumeState?: ImportCheckpoint
  ): Generator<ImportCheckpoint, ImportResult, void> {
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

    let checkpoint = resumeState ?? this.engine.startImport(recipe);
    while (!checkpoint.done) {
      const step = this.engine.runImportChunk(recipe, checkpoint, { maxRows: 50 });
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

  /** JobRunner-facing wrapper which persists the CONF_IMP identity alongside the library state. */
  *importJobHandler(
    params: JobHandlerParams & { configId?: string; jobId?: string; eseguitoDa?: string }
  ): Generator<ImportJobCheckpoint, ImportResult, void> {
    const resume = (params.resumeState ?? null) as ImportJobCheckpoint | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(params.eseguitoDa ?? resume?.eseguitoDa ?? '');
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    const configId = String(params.configId ?? resume?.configId ?? '');
    const jobId = String(params.jobId ?? resume?.jobId ?? `imp_chunked_${configId}`);
    if (!configId) {
      throw new PipelineError('Stato di ripresa import privo di configId');
    }
    if (resume !== null && this.runCount >= 2) {
      this.backfillSospesoTempo(jobId, configId, resume);
    }

    try {
      const generator = this.executeImportChunked(configId, resume?.importCheckpoint);
      let step = generator.next();
      while (!step.done) {
        yield {
          configId,
          importCheckpoint: step.value,
          jobId,
          runCount: this.runCount,
          totalDurationMs: this.elapsedTotalMs(),
          eseguitoDa: this.eseguitoDa,
          esecuzioneIniziata: this.esecuzioneIniziata
        };
        step = generator.next();
      }
      const result = step.value;
      const totale = result.inseriti + result.aggiornati + result.saltati + result.ghost;
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_IMPORT_CHUNKED,
        idConfig: configId,
        nomeConfig: '',
        stato: result.errori.length === 0 ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
        totaleTask: totale,
        completatiOk: totale,
        falliti: result.errori.length,
        listaFallimenti: result.errori,
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_IMPORT_CHUNKED,
        idConfig: configId,
        nomeConfig: '',
        stato: StatoJob.FALLITO,
        totaleTask: 0,
        completatiOk: 0,
        falliti: 0,
        listaFallimenti: [reason],
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      throw error;
    }
  }

  /** JobRunnerLib registry callback (passed to run/resume) for the chunked import handler. */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_IMPORT_CHUNKED, (params) => this.importJobHandler(params));
  }

  /** Starts the chunked import through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    configId: string,
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_IMPORT_CHUNKED,
      { configId, jobId: jobName, eseguitoDa: this.activeUser?.getEmail() ?? '' },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
