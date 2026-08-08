import type { IMasterSheetRepository } from '../domain/repositories/IMasterSheetRepository';
import type { IGmailFacade } from '../infrastructure/facades/GmailServiceFacade';
import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../infrastructure/facades/TemplateEngineFacade';
import type { IProcessMonitor } from '../infrastructure/facades/ProcessMonitorFacade';
import { ExpressionEngineFacade } from '../infrastructure/facades/ExpressionEngineFacade';
import { AlunnoRepository } from '../infrastructure/repositories/AlunnoRepository';
import { CarenzaRepository } from '../infrastructure/repositories/CarenzaRepository';
import { ClasseRepository } from '../infrastructure/repositories/ClasseRepository';
import { ConfigurazioneEmailRepository } from '../infrastructure/repositories/ConfigurazioneEmailRepository';
import { DipartimentoRepository } from '../infrastructure/repositories/DipartimentoRepository';
import { DocenteRepository } from '../infrastructure/repositories/DocenteRepository';
import { LogDocumentoRepository } from '../infrastructure/repositories/LogDocumentoRepository';
import { LogEmailRepository } from '../infrastructure/repositories/LogEmailRepository';
import { MasterSheetRepository } from '../infrastructure/repositories/MasterSheetRepository';
import { MateriaRepository } from '../infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../infrastructure/repositories/OreASLRepository';
import { ProgettoRepository } from '../infrastructure/repositories/ProgettoRepository';
import { RuoloSpecialeRepository } from '../infrastructure/repositories/RuoloSpecialeRepository';
import { AldoTeachingAssignmentResolver } from '../infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import {
  ContextEngineFactory,
  type ContextEngineDependencies
} from '../application/context-engine/ContextEngineFactory';
import type { ContextBuilder } from '../application/context-engine/ContextBuilder';
import {
  RisolutoreRuoliService,
  type RisolutoreRuoliDependencies
} from '../application/services/RisolutoreRuoliService';
import {
  EmailNotificationService,
  type EmailDb,
  type EmailNotificationDeps
} from '../application/services/EmailNotificationService';
import { AggregatoreDati } from '../application/services/AggregatoreDati';
import type { ITeachingAssignmentResolver } from '../application/ports/ITeachingAssignmentResolver';

function contextDependencies(
  db: RepositoryDatabase,
  master: IMasterSheetRepository,
  teachingAssignments: ITeachingAssignmentResolver
): ContextEngineDependencies {
  return {
    master,
    teachingAssignments,
    ruoli: new RuoloSpecialeRepository(db),
    docenti: new DocenteRepository(db),
    classi: new ClasseRepository(db),
    alunni: new AlunnoRepository(db),
    materie: new MateriaRepository(db),
    oreAsl: new OreASLRepository(db),
    logDocs: new LogDocumentoRepository(db),
    progetti: new ProgettoRepository(db),
    dipartimenti: new DipartimentoRepository(db)
  };
}

/**
 * Convenience composition for isolated tests and online checks. Runtime
 * production wiring uses Bootstrap's container-owned singleton graph.
 */
export function composeContextBuilder(
  db: RepositoryDatabase,
  master: IMasterSheetRepository = new MasterSheetRepository(db),
  teachingAssignments: ITeachingAssignmentResolver = new AldoTeachingAssignmentResolver(db)
): ContextBuilder {
  return ContextEngineFactory.create(contextDependencies(db, master, teachingAssignments));
}

export function composeRisolutoreRuoliDependencies(
  db: RepositoryDatabase,
  teachingAssignments: ITeachingAssignmentResolver = new AldoTeachingAssignmentResolver(db)
): RisolutoreRuoliDependencies {
  return {
    classi: new ClasseRepository(db),
    docenti: new DocenteRepository(db),
    alunni: new AlunnoRepository(db),
    dipartimenti: new DipartimentoRepository(db),
    materie: new MateriaRepository(db),
    ruoli: new RuoloSpecialeRepository(db),
    teachingAssignments
  };
}

export function composeRisolutoreRuoli(
  db: RepositoryDatabase,
  teachingAssignments: ITeachingAssignmentResolver = new AldoTeachingAssignmentResolver(db)
): RisolutoreRuoliService {
  return new RisolutoreRuoliService(
    composeRisolutoreRuoliDependencies(db, teachingAssignments)
  );
}

export function composeEmailNotificationService(
  db: EmailDb,
  gmail: IGmailFacade,
  templates: ITemplateEngine,
  now: Date,
  drive: IDriveFacade,
  teachingAssignments: ITeachingAssignmentResolver,
  logger?: LoggerService,
  monitor?: IProcessMonitor,
  master: IMasterSheetRepository = new MasterSheetRepository(db)
): EmailNotificationService {
  const base: EmailNotificationDeps = {
    db,
    gmail,
    drive,
    templates,
    now,
    contextBuilder: composeContextBuilder(db, master, teachingAssignments),
    expressionEngine: new ExpressionEngineFacade(),
    docenti: new DocenteRepository(db),
    alunni: new AlunnoRepository(db),
    dipartimenti: new DipartimentoRepository(db),
    classi: new ClasseRepository(db),
    carenze: new CarenzaRepository(db),
    confMail: new ConfigurazioneEmailRepository(db),
    logMail: new LogEmailRepository(db),
    logDocs: new LogDocumentoRepository(db),
    master,
    materie: new MateriaRepository(db),
    aggregatoreDati: new AggregatoreDati(db),
    teachingAssignments
  };
  if (logger !== undefined) base.logger = logger;
  if (monitor !== undefined) base.monitor = monitor;
  return new EmailNotificationService(base);
}
