import { ContextBuilder } from './ContextBuilder';
import { SchoolProvider } from './providers/SchoolProvider';
import { ClasseProvider } from './providers/ClasseProvider';
import { StudentiProvider } from './providers/StudentiProvider';
import { AlunnoProvider } from './providers/AlunnoProvider';
import { TutorProvider } from './providers/TutorProvider';
import { ConsiglioClasseProvider } from './providers/ConsiglioClasseProvider';
import { CarenzeProvider } from './providers/CarenzeProvider';
import { PianiProvider } from './providers/PianiProvider';
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
import { MasterStoricoDatabaseProvider } from '../storico/StoricoDatabaseProvider';
import { createSupplentiSubstitutionLookup } from './interceptors/SupplentiSubstitutionLookup';
import { CdcAssembler } from './CdcAssembler';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import { MasterSheetRepository } from '../../infrastructure/repositories/MasterSheetRepository';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import { RuoloSpecialeRepository } from '../../infrastructure/repositories/RuoloSpecialeRepository';
import type { IRuoloSpecialeRepository } from '../../domain/repositories/IRuoloSpecialeRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import { OreASLRepository } from '../../infrastructure/repositories/OreASLRepository';
import type { IOreASLRepository } from '../../domain/repositories/IOreASLRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';

/**
 * Wires a ContextBuilder with every provider registered under its recipe token
 * (09 §4). The providers share repositories built over the one database, so the
 * CDU is assembled from a single consistent data source. Consumers combine this
 * with a Recipe (see Recipe.ts / RECIPES) and BuildParams to assemble a CDU.
 */
export class ContextEngineFactory {
  /**
   * `master` defaults to a repository built over `database` — correct for tests
   * where MASTER lives in the same fake db as everything else, WRONG for the
   * real composition root (`Bootstrap.ts`): MASTER lives on a separate
   * spreadsheet, and `Repository`'s base constructor binds its table eagerly,
   * so building it over the year db throws immediately (`setPrimaryKey` on an
   * undefined table, ref `Bootstrap.ts` `BootstrapDeps.master` doc comment).
   * `Bootstrap.ts` always passes its already-opened `deps.master` explicitly.
   */
  static create(
    database: RepositoryDatabase,
    master: IMasterSheetRepository = new MasterSheetRepository(database)
  ): ContextBuilder {
    const ruoli: IRuoloSpecialeRepository = new RuoloSpecialeRepository(database);
    const docenti: IDocenteRepository = new DocenteRepository(database);
    const classi: IClasseRepository = new ClasseRepository(database);
    const alunni: IAlunnoRepository = new AlunnoRepository(database);
    const materie: IMateriaRepository = new MateriaRepository(database);
    const oreAsl: IOreASLRepository = new OreASLRepository(database);
    const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(database);
    const supplenze: ISupplenzaRepository = new SupplenzaRepository(database);
    const cdc = new CdcAssembler(classi, materie);
    const storicoDb = new MasterStoricoDatabaseProvider(master, new LoggerService());

    return new ContextBuilder()
      .registerInterceptor(
        new SwapAndEnrichInterceptor(
          new LoggerService(),
          createSupplentiSubstitutionLookup(docenti, supplenze),
          {
            // 09 §5: SwapAndEnrichInterceptor runs after `consiglio`/`student` (the two
            // providers that (re)write cdu.focus.classe.consiglioDiClasse /
            // cdu.focus.alunno.consiglioDiClasseFiltrato). `targetPaths` puts the
            // library's generalized per-item `_forEachAt` walk to use instead of its
            // single-atomic-payload swap; the 3-way GestioneSupplenti decision lives
            // entirely in the substitutionLookup callback (see
            // SupplentiSubstitutionLookup.ts), so the library's own boolean
            // optionFlag gate is intentionally not relied on here.
            targetProviders: ['consiglio', 'student'],
            targetPaths: [
              'focus.classe.consiglioDiClasse',
              'focus.alunno.consiglioDiClasseFiltrato'
            ]
          }
        )
      )
      .registerProvider('school', new SchoolProvider(master, ruoli, docenti))
      .registerProvider('class', new ClasseProvider(classi, alunni))
      .registerProvider('students', new StudentiProvider(classi, alunni, materie))
      .registerProvider('student', new AlunnoProvider(alunni, classi, oreAsl, cdc))
      .registerProvider('tutor', new TutorProvider(classi))
      .registerProvider('consiglio', new ConsiglioClasseProvider(classi, materie))
      .registerProvider('carenze', new CarenzeProvider(alunni, materie))
      .registerProvider('piani', new PianiProvider(alunni))
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
