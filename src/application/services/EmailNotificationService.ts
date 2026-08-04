import type { IDatabase } from '../../infrastructure/db/Database';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import type { PostProcessDb } from '../pipelines/postProcessActions';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import { emailTargetId, type EmailTarget } from '../email/saluto';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { Classe } from '../../domain/entities/Classe';
import type { Alunno } from '../../domain/entities/Alunno';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import {
  BuildCDUStep,
  ValutaCondizioniInvioStep,
  RenderBoxesStep,
  ComposeEmailStep,
  ResolveRecipientsStep,
  SendEmailStep,
  LogEmailStep,
  PostProcessEmailStep
} from '../pipelines/emailSteps';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IConfigurazioneEmailRepository } from '../../domain/repositories/IConfigurazioneEmailRepository';
import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import { TABLE, COL_CONF_MAIL } from '../../config/schema';
import {
  GestioneArticolazione,
  GestioneSupplenti,
  ProcessoInvio
} from '../../domain/value-objects/enums';
import { routingPolicyByGestioneSupplenti } from '../context-engine/TeachingCouncilProjection';
import { PipelineError } from '../../domain/errors/DomainError';
import type { AggregatoreDati } from './AggregatoreDati';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';

/** Everything the email subsystem needs from persistence: ALDO port + repository seam. */
export type EmailDb = IDatabase & PostProcessDb & RepositoryDatabase;

export interface EmailNotificationDeps {
  db: EmailDb;
  gmail: IGmailFacade;
  /** Attachment blob resolution (11 §13). */
  drive: IDriveFacade;
  contextBuilder: ContextBuilder;
  templates: ITemplateEngine;
  expressionEngine: IExpressionEngine;
  docenti: IDocenteRepository;
  alunni: IAlunnoRepository;
  classi: IClasseRepository;
  carenze: ICarenzaRepository;
  confMail: IConfigurazioneEmailRepository;
  logMail: ILogEmailRepository;
  logDocs: ILogDocumentoRepository;
  master: IMasterSheetRepository;
  materie: IMateriaRepository;
  aggregatoreDati: AggregatoreDati;
  /** Effective-teacher resolution (SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI, ref CLAUDE.md). */
  teachingAssignments: ITeachingAssignmentResolver;
  /** Injected clock — deterministic CDU dates and supplenza windows (09 §2). */
  now: Date;
  /** Optional GasProcessMonitorLib port — per-step telemetry (15 §9), no-op when absent. */
  monitor?: IProcessMonitor;
  logger?: LoggerService;
}

export interface SendPatternOptions {
  /** Restrict the run to targets whose candidate emails intersect this list (retry seam, 11 §16). */
  onlyRecipients?: string[];
  /** Restrict the run to stable pre-routing logical target ids (new retry seam). */
  onlyTargetIds?: string[];
}

export interface SendPatternResult {
  targets: number;
  sent: number;
  skipped: number;
  errors: string[];
}

/**
 * Email-notification application service (ref 11, 12): enumerates the logical
 * recipients dictated by CONF_MAIL.PROCESSO (11 §3/§12) and runs the 8-step
 * NotificaPipeline once per target. Entirely data-driven: behaviour comes from
 * the CONF_MAIL record, never from code branches per pattern.
 */
export class EmailNotificationService {
  private readonly deps: Required<Omit<EmailNotificationDeps, 'logger' | 'monitor'>>;
  private readonly monitor: IProcessMonitor | undefined;
  private readonly logger: LoggerService;
  private testEmail: string | null = null;
  private readonly projector = new CollectionProjector({ logger: new LoggerService() });

  constructor(deps: EmailNotificationDeps) {
    const { logger, monitor, ...rest } = deps;
    this.deps = rest;
    this.monitor = monitor;
    this.logger = logger ?? new LoggerService();
  }

  /** Exposes the Gmail port for batch-level quota checks (11 §14), without duplicating the dependency. */
  getGmailFacade(): IGmailFacade {
    return this.deps.gmail;
  }

  /** All emails go to `email` instead of the real recipients (11 §15). */
  enableTestMode(email: string): void {
    this.testEmail = email;
  }

  disableTestMode(): void {
    this.testEmail = null;
  }

  /** Runs the NotificaPipeline for every enumerated target of the pattern. */
  sendPattern(patternId: string, options: SendPatternOptions = {}): SendPatternResult {
    const row = this.deps.db.table(TABLE.CONF_MAIL).find((r) => r[COL_CONF_MAIL.ID] === patternId);
    if (row === null) throw new PipelineError(`CONF_MAIL ${patternId} non trovato`);
    const conf = this.deps.confMail.findById(patternId);
    if (conf === null) throw new PipelineError(`CONF_MAIL ${patternId} non trovato`);
    conf.getAllegati();

    let targets = this.enumerateTargets(conf);
    const onlyTargetIds = options.onlyTargetIds;
    if (onlyTargetIds !== undefined) {
      targets = targets.filter((target) => onlyTargetIds.includes(emailTargetId(target)));
    } else {
      const only = options.onlyRecipients;
      if (only !== undefined) {
        targets = targets.filter((t) => t.emails.some((e) => only.includes(e)));
      }
    }

    const result: SendPatternResult = { targets: targets.length, sent: 0, skipped: 0, errors: [] };
    for (const target of targets) {
      const ctx = this.buildPipeline().execute({
        config: row,
        confMail: conf,
        emailTarget: target,
        now: this.deps.now,
        testEmail: this.testEmail
      });
      if (ctx.get('shouldSend') === false) {
        result.skipped += 1; // silent skip (11 §4)
        continue;
      }
      result.sent += ctx.get<number>('sentCount') ?? 0;
      result.errors.push(...(ctx.get<string[]>('sendErrors') ?? []));
    }
    return result;
  }

  /**
   * Runs the pipeline for one already-enumerated target (batch seam, 11 §14).
   * Returns the per-target outcome; skipped = the CONDIZIONE gated the send.
   */
  sendToTarget(
    patternId: string,
    target: EmailTarget,
    jobId?: string
  ): { sent: number; errors: string[]; skipped: boolean } {
    const row = this.deps.db.table(TABLE.CONF_MAIL).find((r) => r[COL_CONF_MAIL.ID] === patternId);
    if (row === null) throw new PipelineError(`CONF_MAIL ${patternId} non trovato`);
    const conf = this.deps.confMail.findById(patternId);
    if (conf === null) throw new PipelineError(`CONF_MAIL ${patternId} non trovato`);
    conf.getAllegati();
    const ctx = this.buildPipeline(jobId).execute({
      config: row,
      confMail: conf,
      emailTarget: target,
      now: this.deps.now,
      testEmail: this.testEmail
    });
    if (ctx.get('shouldSend') === false) return { sent: 0, errors: [], skipped: true };
    return {
      sent: ctx.get<number>('sentCount') ?? 0,
      errors: ctx.get<string[]>('sendErrors') ?? [],
      skipped: false
    };
  }

  /** The pattern's configuration entity (batch seam). */
  getConfigurazione(patternId: string): ConfigurazioneEmail {
    const conf = this.deps.confMail.findById(patternId);
    if (conf === null) throw new PipelineError(`CONF_MAIL ${patternId} non trovato`);
    return conf;
  }

  /** The 8 steps of 11 §2 on the library orchestrator; failures are collected, never thrown. */
  private buildPipeline(jobId?: string): Pipeline {
    const d = this.deps;
    const pipeline = new Pipeline(this.logger, null, {
      name: 'NotificaPipeline',
      stopOnError: false,
      logPosition: { depth: 1, isLast: false, ancestorHasNext: [] }
    })
      .addStep(new BuildCDUStep(this.logger, d.contextBuilder, d.docenti, d.alunni))
      .addStep(new ValutaCondizioniInvioStep(this.logger, d.expressionEngine))
      .addStep(new RenderBoxesStep(this.logger, d.materie, d.templates, d.aggregatoreDati))
      .addStep(new ComposeEmailStep(this.logger, d.templates, d.logDocs, d.drive))
      .addStep(new ResolveRecipientsStep(this.logger, d.docenti, d.classi, d.teachingAssignments))
      .addStep(new SendEmailStep(this.logger, d.gmail, d.master))
      .addStep(new LogEmailStep(this.logger, d.logMail))
      .addStep(new PostProcessEmailStep(this.logger, d.db, d.templates));

    // Per-step telemetry (15 §9) for the batch monitoring dashboard — a no-op when
    // this pipeline runs outside a monitored batch (jobId undefined, e.g. sendPattern).
    if (this.monitor !== undefined && jobId !== undefined) {
      const monitor = this.monitor;
      pipeline.beforeStep((step) => monitor.logStepStart(jobId, step.getName()));
      pipeline.afterStep((step, _ctx, result) =>
        monitor.logStepComplete(jobId, step.getName(), result.success)
      );
    }

    return pipeline;
  }

  /** Logical recipients per CONF_MAIL.PROCESSO (11 §3, §12). */
  enumerateTargets(conf: ConfigurazioneEmail): EmailTarget[] {
    switch (conf.processo) {
      case ProcessoInvio.PER_COORDINATORE:
        return this.targetsPerCoordinatore(conf.gestioneArticolazione);
      case ProcessoInvio.PER_DOCENTE:
        return this.targetsPerDocente(conf.gestioneArticolazione);
      case ProcessoInvio.PER_CDC:
        return this.targetsPerCdc(conf.supplenti, conf.gestioneArticolazione);
      case ProcessoInvio.PER_ALUNNO:
        return this.deps.alunni.findAttivi().map((a) => ({
          tipo: 'alunno' as const,
          tipoTarget: 'alunno' as const,
          target: a.id ?? '',
          emails: [a.id ?? ''],
          classiCompetenza: []
        }));
      case ProcessoInvio.PER_GENITORI_ALUNNO:
        return this.targetsPerGenitori();
      case ProcessoInvio.PER_CARENZA_GENITORI:
        return this.targetsPerCarenza((alunno) => ({
          tipo: 'genitori' as const,
          emails: this.tutorEmailsOrFallback(alunno)
        }));
      case ProcessoInvio.PER_CARENZA_GENITORI_E_ALUNNO:
        return this.targetsPerCarenza((alunno) => ({
          tipo: 'genitori_alunno' as const,
          emails: [...alunno.getTutors().map((t) => t.value), alunno.id ?? '']
        }));
      case ProcessoInvio.PER_CARENZA_GENITORI_E_COORD:
        return this.targetsPerCarenza((alunno) => {
          const classe = this.deps.classi.findById(alunno.classeId);
          const cc =
            classe !== null
              ? this.deps.classi
                  .getCoordinatori(classe)
                  .map((d) => d.id ?? '')
                  .filter((e) => e !== '')
              : [];
          return {
            tipo: 'genitori' as const,
            emails: this.tutorEmailsOrFallback(alunno),
            ...(cc.length > 0 ? { cc } : {})
          };
        });
    }
  }

  private tutorEmailsOrFallback(alunno: Alunno): string[] {
    const tutors = alunno.getTutors().map((t) => t.value);
    return tutors.length > 0 ? tutors : [alunno.id ?? ''];
  }

  /**
   * Entry-point classes: `COMPLETA` (default) excludes articolazione
   * partners, `ARTICOLATA` excludes the parent — the excluded side's
   * classes are represented through the included side's `classiCompetenza`
   * expansion (11 §12, 05 §5). Delegates to the single shared filter
   * (`ClasseRepository.filterPerGestioneArticolazione`, same mechanism as
   * `DocumentBatchService.generateClassi`).
   */
  private classiEntryPoint(gestione: GestioneArticolazione): Classe[] {
    return this.deps.classi.filterPerGestioneArticolazione(this.deps.classi.findAttive(), gestione);
  }

  /**
   * An articulated parent is the email entry point under `COMPLETA`, but the
   * CDU must include documents owned by every partner class in its group.
   * Expansion is parent-only (never bidirectional via a partner). Under
   * `ARTICOLATA` a partner class is itself the entry point returned by
   * `classiEntryPoint()`, so it routinely reaches this method — but since a
   * partner is never `isParent()`, the narrowing still correctly yields
   * `[classe]` unexpanded for it. This keeps the method in step with
   * `DocumentGenerationService.generateForClasse` and avoids resurfacing the
   * partner-to-sibling data leak that fix addressed if a future call site
   * skips the entry-point filter entirely.
   */
  private classiCompetenza(classe: Classe): string[] {
    const config = this.deps.classi.getArticolazione(classe);
    const gruppo =
      config?.isParent() === true
        ? [classe, ...this.deps.classi.getClassiPartner(classe)]
        : [classe];
    return gruppo.map((membro) => membro.id ?? '');
  }

  /**
   * Effective council emails for an entry-point classe, deduped and sorted by
   * cognome (deterministic emails[0], ref 11 §14). The teaching-assignment port
   * partner-routes articulated classes internally, so one call is sufficient.
   */
  private cdcEmails(
    classe: Classe,
    gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
  ): string[] {
    const assignments = this.deps.teachingAssignments.resolveConsiglio(classe, this.deps.now, {
      includeReligioneAlt: true,
      routingPolicy: routingPolicyByGestioneSupplenti[gestioneSupplenti]
    });
    const routingRows = assignments.map((assignment) => ({
      routing: {
        primary: assignment.routing.primary.flatMap((docente) =>
          docente.id === null ? [] : [{ id: docente.id, cognome: docente.cognome }]
        )
      }
    }));
    const actors = this.projector.project(routingRows, [
      { type: 'flatMap', path: 'routing.primary' },
      { type: 'distinctBy', keys: ['id'] },
      { type: 'sortBy', keys: [{ path: 'cognome', direction: 'ASC' }] }
    ]).value as Array<{ id: string }>;
    return actors.map((docente) => docente.id);
  }

  private targetsPerCoordinatore(gestione: GestioneArticolazione): EmailTarget[] {
    const perCoordinatore = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint(gestione)) {
      const diretti = this.deps.classi.getCoordinatori(classe);
      const destinatari =
        diretti.length > 0
          ? diretti.flatMap((docente) =>
              docente.id === null ? [] : [{ email: docente.id, classi: [classe.id ?? ''] }]
            )
          : this.deps.classi
              .getClassiPartner(classe)
              .flatMap((partner) =>
                this.deps.classi
                  .getCoordinatori(partner)
                  .flatMap((docente) =>
                    docente.id === null || partner.id === null
                      ? []
                      : [{ email: docente.id, classi: [partner.id] }]
                  )
              );
      for (const destinatario of destinatari) {
        const classi = perCoordinatore.get(destinatario.email) ?? [];
        classi.push(...destinatario.classi);
        perCoordinatore.set(destinatario.email, classi);
      }
    }
    return [...perCoordinatore.entries()].map(([email, classi]) => ({
      tipo: 'docente' as const,
      tipoTarget: 'classe' as const,
      target: classi[0]!,
      docenteEmail: email,
      emails: [email],
      classiCompetenza: classi
    }));
  }

  private targetsPerDocente(gestione: GestioneArticolazione): EmailTarget[] {
    const perDocente = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint(gestione)) {
      for (const email of this.cdcEmails(classe)) {
        const classi = perDocente.get(email) ?? [];
        classi.push(...this.classiCompetenza(classe));
        perDocente.set(email, classi);
      }
    }
    return [...perDocente.entries()].map(([email, classi]) => ({
      tipo: 'docente' as const,
      tipoTarget: 'classe' as const,
      target: classi[0]!,
      docenteEmail: email,
      emails: [email],
      classiCompetenza: classi,
      teachingAssignmentTarget: true
    }));
  }

  private targetsPerCdc(
    gestioneSupplenti: GestioneSupplenti,
    gestioneArticolazione: GestioneArticolazione
  ): EmailTarget[] {
    return this.classiEntryPoint(gestioneArticolazione).map((classe) => ({
      tipo: 'cdc' as const,
      tipoTarget: 'classe' as const,
      target: classe.id ?? '',
      emails: this.cdcEmails(classe, gestioneSupplenti),
      classiCompetenza: this.classiCompetenza(classe)
    }));
  }

  /** One email per family: households with several children are deduped by tutor set (11 §12). */
  private targetsPerGenitori(): EmailTarget[] {
    const perFamiglia = new Map<string, EmailTarget>();
    for (const alunno of this.deps.alunni.findAttivi()) {
      const tutors = alunno.getTutors().map((t) => t.value);
      if (tutors.length === 0) continue;
      const chiave = [...tutors].sort().join('|');
      if (!perFamiglia.has(chiave)) {
        perFamiglia.set(chiave, {
          tipo: 'genitori',
          tipoTarget: 'alunno',
          target: alunno.id ?? '',
          emails: tutors,
          classiCompetenza: []
        });
      }
    }
    return [...perFamiglia.values()];
  }

  /**
   * One shared-shape email per non-notified CARENZE row (11 §3): shared across
   * all three PER_CARENZA_GENITORI* processes, which differ only in recipient
   * composition (`buildRecipients`, e.g. tipo/emails/cc).
   */
  private targetsPerCarenza(
    buildRecipients: (alunno: Alunno) => {
      tipo: EmailTarget['tipo'];
      emails: string[];
      cc?: string[];
    }
  ): EmailTarget[] {
    const targets: EmailTarget[] = [];
    for (const carenza of this.deps.carenze.findNonNotificate()) {
      const alunno = this.deps.alunni.findById(carenza.studente);
      if (alunno === null) {
        this.logger.warn(
          PiiRedactor.redact(`CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`)
        );
        continue;
      }
      const { tipo, emails, cc } = buildRecipients(alunno);
      targets.push({
        tipo,
        tipoTarget: 'alunno',
        target: carenza.studente,
        emails,
        classiCompetenza: [],
        carenzaProgressivo: carenza.progressivo,
        ...(cc !== undefined ? { cc } : {})
      });
    }
    return targets;
  }
}
