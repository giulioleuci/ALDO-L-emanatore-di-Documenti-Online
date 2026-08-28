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
import { DocenteClasseMateriaFocusProvider } from './providers/DocenteClasseMateriaFocusProvider';
import { ClasseMateriaFocusProvider } from './providers/ClasseMateriaFocusProvider';
import { DipartimentoProvider } from './providers/DipartimentoProvider';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { StoricoDatabaseProvider } from '../storico/StoricoDatabaseProvider';
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
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';

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
  dipartimenti: IDipartimentoRepository;
  /**
   * Override for the real `MasterStoricoDatabaseProvider` this factory builds
   * from `master` by default. Production callers (Bootstrap.ts) must never
   * pass this — it exists solely so offline tests that exercise
   * `includiStorico: true` through the real composition root
   * (`composeContextBuilder`/`ContextEngineFactory.create`, as opposed to a
   * provider constructed directly with a hand-rolled fake) can inject a no-op
   * `StoricoDatabaseProvider` instead of hitting the real
   * `MasterStoricoDatabaseProvider` → `DatabaseService` → Advanced Sheets API
   * chain, which this offline test harness has no ambient stand-in for (unlike
   * `Logger`/`CacheService`, see test/setup/load-gaslibs.cjs).
   */
  storicoDb?: StoricoDatabaseProvider;
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
    progetti,
    dipartimenti,
    storicoDb: storicoDbOverride
  }: ContextEngineDependencies): ContextBuilder {
    const storicoDb =
      storicoDbOverride ?? new MasterStoricoDatabaseProvider(master, new LoggerService());

    // Constructed once and reused both under their own recipe tokens and
    // inside PartnerProjectionProvider ('partner'), which reruns the same
    // three provider instances against a scratch per-partner CDU (Task 21,
    // fix round 1) — reusing AS-IS, never re-instantiated, so there is only
    // one ClasseProvider/StudentiProvider/TutorProvider per composition
    // root. ConsiglioClasseProvider is NOT reused per partner: it resolves
    // teaching assignments for the whole articulation group regardless of
    // which partner classe id it is queried with, so PartnerProjectionProvider
    // instead derives `consiglioDiClasse` from the outer cdu's already-split
    // `consiglioDiClasseComune`/`consiglioDiClasseSeparato` (written by the
    // 'consiglio' token, which always runs before 'partner').
    const classeProvider = new ClasseProvider(classi, alunni, materie);
    const studentiProvider = new StudentiProvider(classi, alunni, materie, storicoDb);
    const tutorProvider = new TutorProvider(classi);
    const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);

    return new ContextBuilder()
      .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
      .registerProvider('class', classeProvider)
      .registerProvider('students', studentiProvider)
      .registerProvider(
        'student',
        new AlunnoProvider(alunni, classi, oreAsl, materie, storicoDb, teachingAssignments)
      )
      .registerProvider('tutor', tutorProvider)
      .registerProvider('consiglio', consiglioProvider)
      .registerProvider('materie', new MaterieClasseProvider(materie, docenti, storicoDb, classi))
      .registerProvider('docenteClasseMateriaFocus', new DocenteClasseMateriaFocusProvider())
      .registerProvider('classeMateriaFocus', new ClasseMateriaFocusProvider())
      .registerProvider('esame', new EsameProvider())
      .registerProvider('progetti', new ProgettiProvider(progetti, docenti))
      .registerProvider(
        'partner',
        new PartnerProjectionProvider(classeProvider, studentiProvider, tutorProvider)
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
      .registerProvider('documentiClasse', new DocumentiClasseProvider(classi, logDocs))
      .registerProvider('dipartimentoFocus', new DipartimentoProvider(dipartimenti, docenti, logDocs));
  }
}
