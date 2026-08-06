import { ContextBuilder } from './ContextBuilder';
import { SchoolProvider } from './providers/SchoolProvider';
import { ClasseProvider } from './providers/ClasseProvider';
import { StudentiProvider } from './providers/StudentiProvider';
import { AlunnoProvider } from './providers/AlunnoProvider';
import { TutorProvider } from './providers/TutorProvider';
import { ConsiglioClasseProvider } from './providers/ConsiglioClasseProvider';
import { CarenzeProvider } from './providers/CarenzeProvider';
import { PianiProvider } from './providers/PianiProvider';
import { PianoFocusProvider } from './providers/PianoFocusProvider';
import { DocumentiProvider } from './providers/DocumentiProvider';
import { CarenzaFocusProvider } from './providers/CarenzaFocusProvider';
import { RappresentantiProvider } from './providers/RappresentantiProvider';
import { StatisticheProvider } from './providers/StatisticheProvider';
import { StoricoProvider } from './providers/StoricoProvider';
import { DocumentiStoricoProvider } from './providers/DocumentiStoricoProvider';
import { PianiPersAlunnoProvider } from './providers/PianiPersAlunnoProvider';
import { PianiPersAlunnoStoricoProvider } from './providers/PianiPersAlunnoStoricoProvider';
import { PianiPersClasseProvider } from './providers/PianiPersClasseProvider';
import { PianiPersClasseStoricoProvider } from './providers/PianiPersClasseStoricoProvider';
import { DocumentiClasseProvider } from './providers/DocumentiClasseProvider';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import { MasterStoricoDatabaseProvider } from '../storico/StoricoDatabaseProvider';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { IRuoloSpecialeRepository } from '../../domain/repositories/IRuoloSpecialeRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { IOreASLRepository } from '../../domain/repositories/IOreASLRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';

export interface ContextEngineDependencies {
  master: IMasterSheetRepository;
  teachingAssignments: ITeachingAssignmentResolver;
  ruoli: IRuoloSpecialeRepository;
  docenti: IDocenteRepository;
  classi: IClasseRepository;
  alunni: IAlunnoRepository;
  materie: IMateriaRepository;
  oreAsl: IOreASLRepository;
  logDocs: ILogDocumentoRepository;
}

/**
 * Wires a ContextBuilder with every provider registered under its recipe token
 * (09 §4). All repositories and the teaching resolver are supplied by the
 * composition root, so every provider observes the same dependency graph.
 */
export class ContextEngineFactory {
  static create({
    master,
    teachingAssignments,
    ruoli,
    docenti,
    classi,
    alunni,
    materie,
    oreAsl,
    logDocs
  }: ContextEngineDependencies): ContextBuilder {
    const storicoDb = new MasterStoricoDatabaseProvider(master, new LoggerService());

    return new ContextBuilder()
      .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
      .registerProvider('class', new ClasseProvider(classi, alunni, materie))
      .registerProvider('students', new StudentiProvider(classi, alunni, materie))
      .registerProvider(
        'student',
        new AlunnoProvider(alunni, classi, oreAsl, materie, teachingAssignments)
      )
      .registerProvider('tutor', new TutorProvider(classi))
      .registerProvider(
        'consiglio',
        new ConsiglioClasseProvider(classi, materie, teachingAssignments)
      )
      .registerProvider('carenze', new CarenzeProvider(alunni, materie))
      .registerProvider('piani', new PianiProvider(alunni))
      .registerProvider('pianoFocus', new PianoFocusProvider())
      .registerProvider('documenti', new DocumentiProvider(logDocs))
      .registerProvider('carenzaFocus', new CarenzaFocusProvider(alunni))
      .registerProvider('rappresentanti', new RappresentantiProvider(classi))
      .registerProvider('statistiche', new StatisticheProvider(classi, docenti, alunni))
      .registerProvider('storico', new StoricoProvider(storicoDb))
      .registerProvider('documentiStorico', new DocumentiStoricoProvider(storicoDb))
      .registerProvider('pianiPersAlunno', new PianiPersAlunnoProvider(logDocs))
      .registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(storicoDb))
      .registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni))
      .registerProvider('pianiPersClasseStorico', new PianiPersClasseStoricoProvider(storicoDb))
      .registerProvider('documentiClasse', new DocumentiClasseProvider(classi, logDocs));
  }
}
