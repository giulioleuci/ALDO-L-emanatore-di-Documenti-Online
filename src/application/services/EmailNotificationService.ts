import type { IDatabase } from '../../infrastructure/db/Database';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IProcessMonitor } from '../../infrastructure/facades/ProcessMonitorFacade';
import type { PostProcessDb } from '../pipelines/postProcessActions';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { EmailTarget } from '../email/saluto';
import type { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import type { Classe } from '../../domain/entities/Classe';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
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
import { ExpressionEngineFacade } from '../../infrastructure/facades/ExpressionEngineFacade';
import { ContextEngineFactory } from '../context-engine/ContextEngineFactory';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import { ConfigurazioneEmailRepository } from '../../infrastructure/repositories/ConfigurazioneEmailRepository';
import { LogEmailRepository } from '../../infrastructure/repositories/LogEmailRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import { MasterSheetRepository } from '../../infrastructure/repositories/MasterSheetRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import { TABLE, COL_CONF_MAIL } from '../../config/schema';
import { ProcessoInvio } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';

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
  classi: ClasseRepository;
  carenze: ICarenzaRepository;
  confMail: ConfigurazioneEmailRepository;
  logMail: LogEmailRepository;
  logDocs: LogDocumentoRepository;
  master: MasterSheetRepository;
  supplenze: ISupplenzaRepository;
  materie: IMateriaRepository;
  /** Injected clock — deterministic CDU dates and supplenza windows (09 §2). */
  now: Date;
  /** Optional GasProcessMonitorLib port — per-step telemetry (15 §9), no-op when absent. */
  monitor?: IProcessMonitor;
  logger?: LoggerService;
}

export interface SendPatternOptions {
  /** Restrict the run to targets whose candidate emails intersect this list (retry seam, 11 §16). */
  onlyRecipients?: string[];
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

  constructor(deps: EmailNotificationDeps) {
    const { logger, monitor, ...rest } = deps;
    this.deps = rest;
    this.monitor = monitor;
    this.logger = logger ?? new LoggerService();
  }

  /** Convenience wiring over one database (composition-root shortcut and tests). */
  static create(
    db: EmailDb,
    gmail: IGmailFacade,
    templates: ITemplateEngine,
    now: Date,
    drive: IDriveFacade,
    logger?: LoggerService,
    monitor?: IProcessMonitor
  ): EmailNotificationService {
    const base: EmailNotificationDeps = {
      db,
      gmail,
      drive,
      templates,
      now,
      contextBuilder: ContextEngineFactory.create(db),
      expressionEngine: new ExpressionEngineFacade(),
      docenti: new DocenteRepository(db),
      alunni: new AlunnoRepository(db),
      classi: new ClasseRepository(db),
      carenze: new CarenzaRepository(db),
      confMail: new ConfigurazioneEmailRepository(db),
      logMail: new LogEmailRepository(db),
      logDocs: new LogDocumentoRepository(db),
      master: new MasterSheetRepository(db),
      supplenze: new SupplenzaRepository(db),
      materie: new MateriaRepository(db)
    };
    if (logger !== undefined) base.logger = logger;
    if (monitor !== undefined) base.monitor = monitor;
    return new EmailNotificationService(base);
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

    let targets = this.enumerateTargets(conf);
    const only = options.onlyRecipients;
    if (only !== undefined) {
      targets = targets.filter((t) => t.emails.some((e) => only.includes(e)));
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
      stopOnError: false
    })
      .addStep(new BuildCDUStep(this.logger, d.contextBuilder, d.docenti, d.alunni))
      .addStep(new ValutaCondizioniInvioStep(this.logger, d.expressionEngine))
      .addStep(new RenderBoxesStep(this.logger, d.materie, d.templates))
      .addStep(new ComposeEmailStep(this.logger, d.templates, d.logDocs, d.drive))
      .addStep(new ResolveRecipientsStep(this.logger, d.docenti, d.supplenze))
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
        return this.targetsPerCoordinatore();
      case ProcessoInvio.PER_DOCENTE:
        return this.targetsPerDocente();
      case ProcessoInvio.PER_CDC:
        return this.targetsPerCdc();
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
      case ProcessoInvio.PER_CARENZA:
        return this.targetsPerCarenza();
    }
  }

  /**
   * Entry-point classes: every active class except articolazione partners —
   * the parent aggregates the whole articulated group (11 §12, 05 §5).
   */
  private classiEntryPoint(): Classe[] {
    return this.deps.classi.findAttive().filter((c) => {
      const config = this.deps.classi.getArticolazione(c);
      return config === null || config.parent === null;
    });
  }

  private cdcEmails(classe: Classe): string[] {
    const docenti = this.deps.classi.isArticolata(classe)
      ? this.deps.classi.getAllDocentiCDCArticolata(classe)
      : this.deps.classi.getAllDocentiCDC(classe);
    return docenti.map((d) => d.id ?? '').filter((e) => e !== '');
  }

  private targetsPerCoordinatore(): EmailTarget[] {
    const perCoordinatore = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint()) {
      for (const coord of this.deps.classi.getCoordinatori(classe)) {
        const email = coord.id ?? '';
        if (email === '') continue;
        const classi = perCoordinatore.get(email) ?? [];
        classi.push(classe.id ?? '');
        perCoordinatore.set(email, classi);
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

  private targetsPerDocente(): EmailTarget[] {
    const perDocente = new Map<string, string[]>();
    for (const classe of this.classiEntryPoint()) {
      for (const email of this.cdcEmails(classe)) {
        const classi = perDocente.get(email) ?? [];
        classi.push(classe.id ?? '');
        perDocente.set(email, classi);
      }
    }
    return [...perDocente.entries()].map(([email, classi]) => ({
      tipo: 'docente' as const,
      tipoTarget: 'classe' as const,
      target: classi[0]!,
      docenteEmail: email,
      emails: [email],
      classiCompetenza: classi
    }));
  }

  private targetsPerCdc(): EmailTarget[] {
    return this.classiEntryPoint().map((classe) => ({
      tipo: 'cdc' as const,
      tipoTarget: 'classe' as const,
      target: classe.id ?? '',
      emails: this.cdcEmails(classe),
      classiCompetenza: [classe.id ?? '']
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

  /** One email per non-notified CARENZE row; genitore priority, alunno fallback (11 §3). */
  private targetsPerCarenza(): EmailTarget[] {
    const targets: EmailTarget[] = [];
    for (const carenza of this.deps.carenze.findNonNotificate()) {
      const alunno = this.deps.alunni.findById(carenza.studente);
      if (alunno === null) {
        this.logger.warn(PiiRedactor.redact(`PER_CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`));
        continue;
      }
      const tutors = alunno.getTutors().map((t) => t.value);
      targets.push({
        tipo: 'genitori',
        tipoTarget: 'alunno',
        target: carenza.studente,
        emails: tutors.length > 0 ? tutors : [alunno.id ?? ''],
        classiCompetenza: [],
        carenzaProgressivo: carenza.progressivo
      });
    }
    return targets;
  }
}
