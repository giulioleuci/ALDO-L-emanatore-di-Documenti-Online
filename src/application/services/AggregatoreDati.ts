import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import { LogCartellaRepository } from '../../infrastructure/repositories/LogCartellaRepository';
import type { Carenza } from '../../domain/entities/Carenza';
import type { LogDocumento } from '../../domain/entities/LogDocumento';
import type { LogCartella } from '../../domain/entities/LogCartella';
import type { Email } from '../../domain/value-objects/Email';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { StatoDocumento } from '../../domain/value-objects/enums';

export interface DocumentoFiltri {
  tipo?: string;
  stato?: StatoDocumento;
  sottotipo?: string;
}

/**
 * AggregatoreDati (14 §2): the read-optimized query surface used by the email
 * box renderers and pipeline steps via `DATI_SORGENTE.metodo`. Its purpose is
 * N+1 prevention: each underlying table is loaded ONCE per instance and then
 * filtered in memory, so processing many recipients in one pipeline run does
 * not re-query per recipient. Keep one instance per pipeline execution (same
 * GAS session) and discard it afterwards.
 */
export class AggregatoreDati {
  private readonly classi: ClasseRepository;
  private readonly carenze: CarenzaRepository;
  private readonly logDocs: LogDocumentoRepository;
  private readonly logFold: LogCartellaRepository;

  private carenzeCache: Carenza[] | null = null;
  private documentiCache: LogDocumento[] | null = null;
  private cartelleCache: LogCartella[] | null = null;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.carenze = new CarenzaRepository(database);
    this.logDocs = new LogDocumentoRepository(database);
    this.logFold = new LogCartellaRepository(database);
  }

  /** CARENZE of one student, most recent first (14 §2). */
  getCarenzePerAlunno(alunnoEmail: string): Carenza[] {
    return this.allCarenze()
      .filter((c) => c.studente === alunnoEmail)
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  /** LOG_DOCS whose UTENTI contains the student, with optional tipo/stato/sottotipo filters (14 §2). */
  getDocumentiPerAlunno(alunnoEmail: string, filtri: DocumentoFiltri = {}): LogDocumento[] {
    return this.allDocumenti()
      .filter((d) => d.containsUtente(alunnoEmail))
      .filter((d) => this.matchesDoc(d, filtri));
  }

  /** LOG_DOCS whose CLASSI contains the class, with optional tipo/stato filters (14 §2). */
  getDocumentiPerClasse(classeId: string, filtri: DocumentoFiltri = {}): LogDocumento[] {
    return this.allDocumenti()
      .filter((d) => d.containsClasse(classeId))
      .filter((d) => this.matchesDoc(d, filtri));
  }

  /** LOG_FOLD whose CLASSI contains the class (14 §2). */
  getCartellePerClasse(classeId: string): LogCartella[] {
    return this.allCartelle().filter((f) => f.containsClasse(classeId));
  }

  /**
   * Nominal coordinator emails from CLASSI.COORD (14 §2). Supplenza-aware
   * coordinator resolution goes through RisolutoreRuoliService in the email
   * pipeline; this batch accessor returns the CLASSI.COORD holders directly.
   */
  getEmailCoordinatori(classeId: string): Email[] {
    const classe = this.classi.findById(ClasseId.of(classeId));
    if (classe === null) return [];
    return this.classi
      .getCoordinatori(classe)
      .map((d) => d.email)
      .filter((e): e is Email => e !== undefined);
  }

  /**
   * DATI_SORGENTE.metodo / PREREQUISITI[].metodo routing (14 §2): dispatches to
   * the matching accessor. An unrecognized method logs a warning and returns
   * null so the caller skips the box (same contract as an unknown TIPO_BOX,
   * 11 §5).
   */
  perMetodo(
    metodo: string,
    params: { alunnoEmail?: string; classeId?: string; filtri?: DocumentoFiltri },
    logger?: LoggerService
  ): unknown[] | null {
    switch (metodo) {
      case 'carenzePerAlunno':
        return this.getCarenzePerAlunno(params.alunnoEmail ?? '');
      case 'documentiPerAlunno':
        return this.getDocumentiPerAlunno(params.alunnoEmail ?? '', params.filtri ?? {});
      case 'documentiPerClasse':
        return this.getDocumentiPerClasse(params.classeId ?? '', params.filtri ?? {});
      case 'cartellePerClasse':
        return this.getCartellePerClasse(params.classeId ?? '');
      case 'emailCoordinatori':
        return this.getEmailCoordinatori(params.classeId ?? '');
      default:
        (logger ?? new LoggerService()).warn(`AggregatoreDati: metodo DATI_SORGENTE sconosciuto "${metodo}" — box saltato`);
        return null;
    }
  }

  private matchesDoc(d: LogDocumento, filtri: DocumentoFiltri): boolean {
    if (filtri.tipo !== undefined && d.tipo !== filtri.tipo) return false;
    if (filtri.stato !== undefined && d.getStato() !== filtri.stato) return false;
    if (filtri.sottotipo !== undefined && d.getSottotipo() !== filtri.sottotipo) return false;
    return true;
  }

  private allCarenze(): Carenza[] {
    if (this.carenzeCache === null) this.carenzeCache = this.carenze.findAll();
    return this.carenzeCache;
  }
  private allDocumenti(): LogDocumento[] {
    if (this.documentiCache === null) this.documentiCache = this.logDocs.findAll();
    return this.documentiCache;
  }
  private allCartelle(): LogCartella[] {
    if (this.cartelleCache === null) this.cartelleCache = this.logFold.findAll();
    return this.cartelleCache;
  }
}
