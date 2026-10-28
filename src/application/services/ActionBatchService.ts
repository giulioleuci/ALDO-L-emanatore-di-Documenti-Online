import type { IDatabase } from '../../infrastructure/db/Database';
import type { PostProcessDb } from '../pipelines/standaloneActions';
import { eseguiAzioni } from '../pipelines/standaloneActions';
import type { BounceFilters, BounceSummary } from '../email/BounceReconciliationService';
import { creaHandlersInfra, type ValidatoreDb } from '../pipelines/azioniInfra';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IRoleResolver } from '../pipelines/documentSteps';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { BuildParams } from '../context-engine/Recipe';
import { recipe } from '../context-engine/Recipe';
import type { Cdu } from '../context-engine/Cdu';
import type { StoricoDocumentiService } from '../storico/StoricoDocumentiService';
import { ConfigurazioneAzione } from '../../domain/entities/ConfigurazioneAzione';
import { TABLE, COL_CONF_AZIONI } from '../../config/schema';
import {
  ASSE_SINGOLA,
  GeneratoreAxis,
  GestioneArticolazione,
  StatoJob
} from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import {
  targetsAlunni,
  targetsClasse,
  targetsClasseDocente,
  targetsClasseDocenteMateria,
  targetsClasseMateria,
  targetsDipartimenti,
  targetsDocenti,
  targetsPiani
} from './axisTargets';

/** Job type under which the azioni batch is registered in JobRunnerLib. */
export const JOB_TYPE_ESECUZIONE_AZIONI = 'ESECUZIONE_AZIONI';
/** Human-readable job type shown in the end-of-job report. */
export const JOB_LABEL_ESECUZIONE_AZIONI = 'ESECUZIONE AZIONI';

/** One iteration target: its id (for logs) and the CDU build params it implies. */
interface AzioneTarget {
  id: string;
  params: Omit<BuildParams, 'now' | 'configurazioneId' | 'esecuzioneId' | 'tipoOperazione'>;
  recipe: string;
}

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface AzioniResumeState {
  azioneIds: string[];
  /** Index into `azioneIds` of the action currently running. */
  azioneIndex: number;
  jobId: string;
  /** Index of the next target of the current action. */
  nextIndex: number;
  /** Targets of the current action, frozen at its first run. */
  targets: AzioneTarget[];
  processed: string[];
  errori: string[];
  runCount?: number;
  totalDurationMs?: number;
  eseguitoDa?: string;
  /** ISO start of the execution that produced this checkpoint — backfills a SOSPESO_TEMPO row on the next resume. */
  esecuzioneIniziata?: string;
}

export interface AzioniCheckpoint extends AzioniResumeState {
  percentage: number;
}

export interface ActionBatchDeps {
  db: IDatabase & PostProcessDb;
  contextBuilder: ContextBuilder;
  expressionEngine: IExpressionEngine;
  templates: ITemplateEngine;
  drive: IDriveFacade;
  roles: IRoleResolver;
  classi: IClasseRepository;
  alunni: IAlunnoRepository;
  dipartimenti: IDipartimentoRepository;
  teachingAssignments: ITeachingAssignmentResolver;
  /** Injected clock — deterministic, never the system clock. */
  now: Date;
  storico?: StoricoDocumentiService;
  validator?: ValidatoreDb;
  bounces?: { riconcilia(f: BounceFilters): BounceSummary };
  logger?: LoggerService;
  logJob?: ILogJobRepository;
  activeUser?: IActiveUserFacade;
}

/**
 * Standalone azioni batch (CONF_AZIONI design doc): for each requested action
 * row it evaluates CONDIZIONE once against a base CDU, enumerates the targets
 * of its ASSE (same dictionary and the same enumeration functions as
 * CONF_DOC.GENERATORE, see axisTargets.ts), materialises one CDU per target and
 * runs the action array through the shared azioni grammar.
 *
 * GAS caps execution at 6/30 minutes, so this is a generator-function
 * JobRunnerLib (L3) handler: the library checks the clock at each `yield`,
 * persists the yielded checkpoint to ScriptProperties, schedules the resume
 * trigger and re-enters with `params.resumeState`.
 *
 * Error hierarchy (design doc §Gestione errori): broken configuration (unknown
 * ASSE, malformed AZIONI, missing id) throws before the run starts and logs a
 * FALLITO row; a single elementary action failing on a single target is
 * recorded in LISTA_FALLIMENTI and the run continues (COMPLETATO_CON_ERRORI).
 * There is no rollback — the permission actions are idempotent by construction,
 * so a re-run reconciles rather than duplicates.
 */
export class ActionBatchService {
  constructor(private readonly deps: ActionBatchDeps) {}

  private containerStartedAt = Date.now();
  private runCount = 1;
  private priorDurationMs = 0;
  private eseguitoDa = '';
  private esecuzioneIniziata = '';

  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  /**
   * Every CONF_AZIONI row, typed. A row that fails `ConfigurazioneAzione`'s own
   * validation (e.g. a half-configured ASSE while someone is still editing the
   * row) is logged and skipped rather than failing the whole table — one bad
   * row must never take down the menu list, `avviaTutteAzioni()`, or launching
   * every OTHER individually-valid action via `avviaAzione(id)`.
   */
  private tutte(): ConfigurazioneAzione[] {
    const righe: ConfigurazioneAzione[] = [];
    this.deps.db
      .table(TABLE.CONF_AZIONI)
      .findAll()
      .forEach((row, indice) => {
        try {
          righe.push(ConfigurazioneAzione.fromData(row));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const rawId =
            typeof row[COL_CONF_AZIONI.ID] === 'string'
              ? row[COL_CONF_AZIONI.ID]
              : `riga #${indice}`;
          this.deps.logger?.warn(`CONF_AZIONI ${String(rawId)} scartata: ${reason}`);
        }
      });
    return righe;
  }

  /** Enabled actions, for the menu dialog. */
  elencoAttive(): Array<{ id: string; tipo: string }> {
    return this.tutte()
      .filter((azione) => azione.isAttivo())
      .map((azione) => ({ id: azione.id ?? '', tipo: azione.tipo }));
  }

  findAzione(id: string): ConfigurazioneAzione | null {
    return this.tutte().find((azione) => azione.id === id) ?? null;
  }

  /** JobRunnerLib handler: one checkpoint per target, one LOG_JOB row per action. */
  *batchAzioniHandler(
    params: JobHandlerParams & { azioneIds?: string[]; jobId?: string; eseguitoDa?: string }
  ): Generator<AzioniCheckpoint, { success: boolean }, void> {
    const resume = (params.resumeState ?? null) as AzioniResumeState | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(
      params.eseguitoDa ?? resume?.eseguitoDa ?? this.deps.activeUser?.getEmail() ?? ''
    );
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    const azioneIds = params.azioneIds ?? resume?.azioneIds ?? [];
    const jobId = String(params.jobId ?? resume?.jobId ?? 'azioni');
    if (azioneIds.length === 0) {
      throw new ConfigurationError('Esecuzione azioni: nessuna azione richiesta');
    }

    let success = true;
    for (let a = resume?.azioneIndex ?? 0; a < azioneIds.length; a++) {
      const azioneId = azioneIds[a]!;
      const ripresa = a === (resume?.azioneIndex ?? -1) ? resume : null;
      const esito = yield* this.eseguiAzione(azioneId, azioneIds, a, jobId, ripresa);
      if (!esito) success = false;
    }
    return { success };
  }

  private *eseguiAzione(
    azioneId: string,
    azioneIds: string[],
    azioneIndex: number,
    jobId: string,
    resume: AzioniResumeState | null
  ): Generator<AzioniCheckpoint, boolean, void> {
    const logger = this.deps.logger;
    let config: ConfigurazioneAzione | null = null;
    try {
      config = this.findAzione(azioneId);
      if (config === null) throw new ConfigurationError(`CONF_AZIONI ${azioneId} non trovata`);
      const cduBase = this.cduBase(azioneId);
      // Whole-action gate: a false (or unevaluable) CONDIZIONE skips the action
      // entirely and, by design, writes no LOG_JOB row at all.
      if (
        config.condizione.trim() !== '' &&
        !this.deps.expressionEngine.evaluateBoolean(
          config.condizione,
          cduBase as unknown as Record<string, unknown>
        )
      ) {
        logger?.info(`Azione ${azioneId} saltata: CONDIZIONE falsa`);
        return true;
      }
      const azioniRaw = config.getAzioniRaw();
      if (azioniRaw === null) {
        logger?.info(`Azione ${azioneId}: nessuna azione elementare configurata`);
        return true;
      }
      // Broken-configuration check, same as the unknown-ASSE/missing-id cases
      // above: parse AZIONI once, before any target is touched, so a malformed
      // JSON cell fails fast with a single FALLITO row instead of throwing once
      // per target inside eseguiAzioni (which parses it again, per target, when
      // actually run). Keep the action names for the per-target log summary.
      let actions: Array<{ tipo?: unknown }>;
      try {
        actions = JSON.parse(azioniRaw) as Array<{ tipo?: unknown }>;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new ConfigurationError(
          `CONF_AZIONI ${azioneId}: AZIONI non è JSON valido: ${reason}`
        );
      }

      const targets = resume === null ? this.targetsPerAsse(config) : resume.targets;
      const processed = resume === null ? [] : resume.processed.slice();
      const errori = resume === null ? [] : resume.errori.slice();
      if (resume !== null && this.runCount >= 2) {
        this.backfillSospesoTempo(jobId, config, targets.length, resume);
      }
      logger?.logBatchStart(targets.length);

      for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
        const target = targets[i]!;
        logger?.logItemStart(i + 1, targets.length, 'Target', target.id, 'DOCUMENT');
        const itemStartedAt = Date.now();
        try {
          const cdu = this.deps.contextBuilder.build(
            {
              ...target.params,
              now: this.deps.now,
              configurazioneId: azioneId,
              esecuzioneId: jobId,
              tipoOperazione: 'ESECUZIONE_AZIONE'
            },
            recipe(target.recipe)
          );
          const updated = eseguiAzioni({
            azioni: azioniRaw,
            cdu: cdu as unknown as Record<string, unknown>,
            db: this.deps.db,
            templates: this.deps.templates,
            now: this.deps.now,
            logger: logger ?? new LoggerService(),
            handlers: creaHandlersInfra({
              db: this.deps.db,
              drive: this.deps.drive,
              roles: this.deps.roles,
              engine: this.deps.expressionEngine,
              cdu,
              logger: logger ?? new LoggerService(),
              // exactOptionalPropertyTypes: AzioniInfraDeps.storico/validator/bounces are
              // optional without `| undefined` — only include the key when set.
              ...(this.deps.storico !== undefined ? { storico: this.deps.storico } : {}),
              ...(this.deps.validator !== undefined ? { validator: this.deps.validator } : {}),
              ...(this.deps.bounces !== undefined ? { bounces: this.deps.bounces } : {})
            })
          });
          // Actions write through the same IDatabase seam the pipelines use;
          // outside a pipeline transaction nothing commits them, so persist per target.
          this.deps.db.save();
          logger?.logSummary(
            '✅ Actions completed',
            Math.max(0, Date.now() - itemStartedAt),
            {
              Actions: actions.flatMap((action) =>
                typeof action.tipo === 'string' ? [action.tipo] : []
              ),
              Updated: updated
            },
            { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
          );
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          errori.push(`${target.id}: ${reason}`);
          logger?.logSummary(
            '❌ Actions failed',
            Math.max(0, Date.now() - itemStartedAt),
            `Azione ${azioneId} — target ${target.id} fallito: ${reason}`,
            { depth: 1, isLast: true, ancestorHasNext: [i + 1 < targets.length] }
          );
        }
        processed.push(target.id);
        yield {
          azioneIds,
          azioneIndex,
          jobId,
          percentage: ((i + 1) / targets.length) * 100,
          nextIndex: i + 1,
          targets,
          processed: processed.slice(),
          errori: errori.slice(),
          runCount: this.runCount,
          totalDurationMs: this.elapsedTotalMs(),
          eseguitoDa: this.eseguitoDa,
          esecuzioneIniziata: this.esecuzioneIniziata
        };
      }

      const success = errori.length === 0;
      logger?.logJobReport({
        jobType: JOB_LABEL_ESECUZIONE_AZIONI,
        runCount: this.runCount,
        totalDurationMs: this.elapsedTotalMs(),
        totale: targets.length,
        falliti: errori.length,
        dettagliFalliti: errori
      });
      this.deps.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_ESECUZIONE_AZIONI,
        idConfig: azioneId,
        nomeConfig: config.tipo,
        stato: success ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
        totaleTask: targets.length,
        completatiOk: processed.length - errori.length,
        falliti: errori.length,
        listaFallimenti: errori,
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      return success;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_ESECUZIONE_AZIONI,
        idConfig: azioneId,
        nomeConfig: config?.tipo ?? '',
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

  /** Institute-level CDU used for the CONDIZIONE gate and for ASSE=SINGOLA. */
  private cduBase(azioneId: string): Cdu {
    return this.deps.contextBuilder.build(
      {
        target: '',
        tipoTarget: 'classe',
        now: this.deps.now,
        configurazioneId: azioneId,
        esecuzioneId: '',
        tipoOperazione: 'ESECUZIONE_AZIONE'
      },
      recipe('AZIONE_SINGOLA')
    );
  }

  /**
   * Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib cut off: the
   * generator never gets to log at the actual timeout, so this runs once, at the
   * start of the resume that picks the job back up.
   */
  private backfillSospesoTempo(
    jobId: string,
    config: ConfigurazioneAzione,
    totale: number,
    resume: AzioniResumeState
  ): void {
    if (resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    this.deps.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_ESECUZIONE_AZIONI,
      idConfig: config.id ?? '',
      nomeConfig: config.tipo,
      stato: StatoJob.SOSPESO_TEMPO,
      totaleTask: totale,
      completatiOk: Math.max(0, resume.processed.length - resume.errori.length),
      falliti: resume.errori.length,
      listaFallimenti: resume.errori,
      durataSec: Math.max(0, (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000),
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
  }

  /**
   * Targets of the action's ASSE. CONF_AZIONI carries no GESTIONE_ARTICOLAZIONE
   * column, so class enumeration always uses COMPLETA (every active class, the
   * parent of an articulated pair included).
   */
  private targetsPerAsse(config: ConfigurazioneAzione): AzioneTarget[] {
    const { classi, alunni, dipartimenti, teachingAssignments, now } = this.deps;
    const gestione = GestioneArticolazione.COMPLETA;
    // ConfigurazioneAzione.asse is `string` (ASSI_AZIONE = GeneratoreAxis values
    // + ASSE_SINGOLA, validated by the entity's own constructor, see Task 3) —
    // narrow the switch discriminant so each `case` compares against its own
    // literal/enum type instead of a bare `string` (no-unsafe-enum-comparison).
    switch (config.asse as GeneratoreAxis | typeof ASSE_SINGOLA) {
      case ASSE_SINGOLA:
        return [
          {
            id: config.id ?? 'SINGOLA',
            recipe: 'AZIONE_SINGOLA',
            params: { target: '', tipoTarget: 'classe' }
          }
        ];
      case GeneratoreAxis.CLASSE:
        return targetsClasse(classi, gestione).map((classe) => ({
          id: classe.id ?? '',
          recipe: 'CLASSE_COMPLETA',
          params: { target: classe.id ?? '', tipoTarget: 'classe' }
        }));
      case GeneratoreAxis.ALUNNO:
        return targetsAlunni(alunni).map((target) => ({
          id: target.email,
          recipe: 'ALUNNO_COMPLETO',
          params: { target: target.email, tipoTarget: 'alunno' }
        }));
      case GeneratoreAxis.PIANO_PERSONALIZZATO:
        return targetsPiani(alunni).map((target) => ({
          id: `${target.studente}:${target.tipo}`,
          recipe: 'PIANO_PERSONALIZZATO',
          params: { target: target.studente, tipoTarget: 'alunno', pianoTipo: target.tipo }
        }));
      case GeneratoreAxis.DIPARTIMENTO:
        return targetsDipartimenti(dipartimenti).map((id) => ({
          id,
          recipe: 'DIPARTIMENTO_COMPLETO',
          params: { target: id, tipoTarget: 'dipartimento' }
        }));
      case GeneratoreAxis.CLASSE_MATERIA:
        return targetsClasseMateria(classi, teachingAssignments, now, gestione).map((target) => ({
          id: `${target.classe}:${target.materiaId}`,
          recipe: 'CLASSE_MATERIA',
          params: { target: target.classe, tipoTarget: 'classe', materiaCorrente: target.materiaId }
        }));
      case GeneratoreAxis.CLASSE_DOCENTE:
        return targetsClasseDocente(classi, teachingAssignments, now, gestione).map((target) => ({
          id: `${target.classe}:${target.docenteEmail}`,
          recipe: 'CLASSE_DOCENTE',
          params: {
            target: target.classe,
            tipoTarget: 'classe',
            docenteCorrente: target.docenteEmail
          }
        }));
      case GeneratoreAxis.CLASSE_DOCENTE_MATERIA:
        return targetsClasseDocenteMateria(classi, teachingAssignments, now, gestione).map(
          (target) => ({
            id: `${target.classe}:${target.materiaId}:${target.docenteEmail}`,
            recipe: 'CLASSE_DOCENTE_MATERIA',
            params: {
              target: target.classe,
              tipoTarget: 'classe',
              docenteCorrente: target.docenteEmail,
              materiaCorrente: target.materiaId
            }
          })
        );
      case GeneratoreAxis.DOCENTE:
        return targetsDocenti(classi, teachingAssignments, now, gestione).map((target) => ({
          id: target.docenteEmail,
          recipe: 'DOCENTE_AGGREGATO',
          params: {
            target: target.docenteEmail,
            tipoTarget: 'docente',
            docenteCorrente: target.docenteEmail,
            classiCompetenza: target.classiCompetenza
          }
        }));
      default:
        // Unreachable via the entity (its constructor validates ASSE), kept so a
        // future axis added to the dictionary fails loudly here instead of running zero targets.
        throw new ConfigurationError(
          `CONF_AZIONI ${config.id ?? '?'}: ASSE non gestito: ${config.asse}`
        );
    }
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.setPurgeOnComplete?.(true);
    queue.registerJobHandler(JOB_TYPE_ESECUZIONE_AZIONI, (params) =>
      this.batchAzioniHandler(params)
    );
  }

  /** Starts the batch through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    azioneIds: string[],
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_ESECUZIONE_AZIONI,
      { azioneIds, jobId: jobName, eseguitoDa: this.deps.activeUser?.getEmail() ?? '' },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
