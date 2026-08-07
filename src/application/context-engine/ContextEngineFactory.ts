import { ContextBuilder } from './ContextBuilder';
import { SchoolProvider } from './providers/SchoolProvider';
import { ClasseProvider } from './providers/ClasseProvider';
import { StudentiProvider } from './providers/StudentiProvider';
import { AlunnoProvider } from './providers/AlunnoProvider';
import { TutorProvider } from './providers/TutorProvider';
import { ConsiglioClasseProvider } from './providers/ConsiglioClasseProvider';
import { MaterieClasseProvider } from './providers/MaterieClasseProvider';
import { EsameProvider } from './providers/EsameProvider';
import { ProgettiProvider } from './providers/ProgettiProvider';
import { PartnerProjectionProvider } from './providers/PartnerProjectionProvider';
import { CarenzeProvider } from './providers/CarenzeProvider';
import { PianiProvider } from './providers/PianiProvider';
import { PianoFocusProvider } from './providers/PianoFocusProvider';
import { DocumentiProvider } from './providers/DocumentiProvider';
import { CarenzaFocusProvider } from './providers/CarenzaFocusProvider';
import { RappresentantiProvider } from './providers/RappresentantiProvider';
import { StatisticheProvider } from './providers/StatisticheProvider';
import { StoricoProvider } from './providers/StoricoProvider';
import { StoricoClasseProvider } from './providers/StoricoClasseProvider';
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
import type { ProgettoRepository } from '../../infrastructure/repositories/ProgettoRepository';

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
  progetti: ProgettoRepository;
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
    logDocs,
    progetti
  }: ContextEngineDependencies): ContextBuilder {
    const storicoDb = new MasterStoricoDatabaseProvider(master, new LoggerService());

    // Constructed once and reused both under their own recipe tokens and
    // inside PartnerProjectionProvider ('partner'), which reruns the exact
    // same four provider instances against a scratch per-partner CDU (Task
    // 21) — reusing AS-IS, never re-instantiated, so there is only one
    // ClasseProvider/StudentiProvider/TutorProvider/ConsiglioClasseProvider
    // per composition root.
    const classeProvider = new ClasseProvider(classi, alunni, materie);
    const studentiProvider = new StudentiProvider(classi, alunni, materie);
    const tutorProvider = new TutorProvider(classi);
    const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);

    return new ContextBuilder()
      .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
      .registerProvider('class', classeProvider)
      .registerProvider('students', studentiProvider)
      .registerProvider(
        'student',
        new AlunnoProvider(alunni, classi, oreAsl, materie, teachingAssignments)
      )
      .registerProvider('tutor', tutorProvider)
      .registerProvider('consiglio', consiglioProvider)
      .registerProvider('materie', new MaterieClasseProvider(materie, docenti, storicoDb, classi))
      .registerProvider('esame', new EsameProvider())
      .registerProvider('progetti', new ProgettiProvider(progetti, docenti))
      .registerProvider(
        'partner',
        new PartnerProjectionProvider(classeProvider, studentiProvider, tutorProvider, consiglioProvider)
      )
      .registerProvider('carenze', new CarenzeProvider(alunni, materie))
      .registerProvider('piani', new PianiProvider(alunni))
      .registerProvider('pianoFocus', new PianoFocusProvider())
      .registerProvider('documenti', new DocumentiProvider(logDocs))
      .registerProvider('carenzaFocus', new CarenzaFocusProvider(alunni))
      .registerProvider('rappresentanti', new RappresentantiProvider(classi))
      .registerProvider('statistiche', new StatisticheProvider(classi, docenti, alunni))
      .registerProvider('storicoClasse', new StoricoClasseProvider(storicoDb, classi))
      .registerProvider('storico', new StoricoProvider(storicoDb))
      .registerProvider('documentiStorico', new DocumentiStoricoProvider(storicoDb))
      .registerProvider('pianiPersAlunno', new PianiPersAlunnoProvider(logDocs))
      .registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(storicoDb))
      .registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni))
      .registerProvider('pianiPersClasseStorico', new PianiPersClasseStoricoProvider(storicoDb))
      .registerProvider('documentiClasse', new DocumentiClasseProvider(classi, logDocs));
  }
}
