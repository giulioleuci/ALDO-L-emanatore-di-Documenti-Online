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
import { SwapAndEnrichInterceptor } from './interceptors/SwapAndEnrichInterceptor';
import { CdcAssembler } from './CdcAssembler';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { MasterSheetRepository } from '../../infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';

/**
 * Wires a ContextBuilder with every provider registered under its recipe token
 * (09 §4). The providers share repositories built over the one database, so the
 * CDU is assembled from a single consistent data source. Consumers combine this
 * with a Recipe (see Recipe.ts / RECIPES) and BuildParams to assemble a CDU.
 */
export class ContextEngineFactory {
  static create(database: RepositoryDatabase): ContextBuilder {
    const master = new MasterSheetRepository(database);
    const ruoli = new RuoloSpecialeRepository(database);
    const docenti = new DocenteRepository(database);
    const classi = new ClasseRepository(database);
    const alunni = new AlunnoRepository(database);
    const materie = new MateriaRepository(database);
    const oreAsl = new OreASLRepository(database);
    const logDocs = new LogDocumentoRepository(database);
    const supplenze = new SupplenzaRepository(database);
    const cdc = new CdcAssembler(classi, materie);

    return new ContextBuilder()
      .registerInterceptor(new SwapAndEnrichInterceptor(new LoggerService(), docenti, supplenze))
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
      .registerProvider('storico', new StoricoProvider());
  }
}
