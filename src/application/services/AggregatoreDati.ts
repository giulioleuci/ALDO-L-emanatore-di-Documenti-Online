import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import { LogCartellaRepository } from '../../infrastructure/repositories/LogCartellaRepository';
import { DipartimentoRepository } from '../../infrastructure/repositories/DipartimentoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { ILogCartellaRepository } from '../../domain/repositories/ILogCartellaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { Carenza } from '../../domain/entities/Carenza';
import type { LogDocumento } from '../../domain/entities/LogDocumento';
import type { LogCartella } from '../../domain/entities/LogCartella';
import type { Email } from '../../domain/value-objects/Email';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { DipartimentoId } from '../../domain/value-objects/DipartimentoId';
import {
  parseFiltriSorgente,
  specCartelle,
  specDocumenti,
  type EntitaSorgente,
  type FiltriSorgente
} from '../../domain/specifications/FiltriSorgente';
import { MateriePerDipartimentoSpec } from '../../domain/specifications/MateriePerDipartimentoSpec';

/**
 * AggregatoreDati (14 §2): the read-optimized query surface used by the email
 * box renderers and pipeline steps via `DATI_SORGENTE.metodo`. Its purpose is
 * N+1 prevention: each underlying table is loaded ONCE per instance and then
 * filtered in memory, so processing many recipients in one pipeline run does
 * not re-query per recipient. Keep one instance per pipeline execution (same
 * GAS session) and discard it afterwards.
 */
export class AggregatoreDati {
  private readonly classi: IClasseRepository;
  private readonly carenze: ICarenzaRepository;
  private readonly logDocs: ILogDocumentoRepository;
  private readonly logFold: ILogCartellaRepository;
  private readonly dipartimenti: DipartimentoRepository;
  private readonly materie: IMateriaRepository;

  private carenzeCache: Carenza[] | null = null;
  private documentiCache: LogDocumento[] | null = null;
  private cartelleCache: LogCartella[] | null = null;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.carenze = new CarenzaRepository(database);
    this.logDocs = new LogDocumentoRepository(database, new LazyRef(() => this.classi));
    this.logFold = new LogCartellaRepository(database);
    this.dipartimenti = new DipartimentoRepository(database);
    this.materie = new MateriaRepository(database);
  }

  /** CARENZE of one student, most recent first (14 §2). */
  getCarenzePerAlunno(alunnoEmail: string): Carenza[] {
    return this.allCarenze()
      .filter((c) => c.studente === alunnoEmail)
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  /** LOG_DOCS whose UTENTI contains the requested user (14 §2). */
  getDocumentiPerUtente(utenteEmail: string, filtri?: FiltriSorgente): LogDocumento[] {
    return this.filterDocumenti(
      this.allDocumenti().filter((documento) => documento.containsUtente(utenteEmail)),
      filtri
    );
  }

  /** LOG_DOCS visible to the class, including parent-owned partner documents (14 §2). */
  getDocumentiPerClasse(classeId: string, filtri?: FiltriSorgente): LogDocumento[] {
    const classe = this.classi.findById(ClasseId.of(classeId));
    if (classe === null) return [];
    return this.filterDocumenti(this.logDocs.findByClasse(classe), filtri);
  }

  /** LOG_DOCS whose MATERIE intersects the department subject catalogue (14 §2). */
  getDocumentiPerDipartimento(dipartimentoId: string, filtri?: FiltriSorgente): LogDocumento[] {
    return this.filterDocumenti(
      this.scopedToDipartimento(this.allDocumenti(), dipartimentoId),
      filtri
    );
  }

  /** LOG_FOLD whose CLASSI contains the class (14 §2). */
  getCartellePerClasse(classeId: string, filtri?: FiltriSorgente): LogCartella[] {
    return this.filterCartelle(
      this.allCartelle().filter((cartella) => cartella.containsClasse(classeId)),
      filtri
    );
  }

  /** LOG_FOLD whose UTENTI contains the requested user (14 §2). */
  getCartellePerUtente(utenteEmail: string, filtri?: FiltriSorgente): LogCartella[] {
    return this.filterCartelle(
      this.allCartelle().filter((cartella) => cartella.containsUtente(utenteEmail)),
      filtri
    );
  }

  /** LOG_FOLD whose MATERIE intersects the department subject catalogue (14 §2). */
  getCartellePerDipartimento(dipartimentoId: string, filtri?: FiltriSorgente): LogCartella[] {
    return this.filterCartelle(
      this.scopedToDipartimento(this.allCartelle(), dipartimentoId),
      filtri
    );
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
    params: {
      alunnoEmail?: string;
      utenteEmail?: string;
      classeId?: string;
      dipartimentoId?: string;
      filtri?: unknown;
    },
    logger?: LoggerService
  ): unknown[] | null {
    const activeLogger = logger ?? new LoggerService();
    switch (metodo) {
      case 'carenzePerAlunno':
        return this.getCarenzePerAlunno(params.alunnoEmail ?? '');
      case 'documentiPerClasse':
        return this.documentiPerClasse(params, activeLogger);
      case 'documentiPerUtente':
        return this.documentiPerUtente(params, activeLogger);
      case 'documentiPerDipartimento':
        return this.documentiPerDipartimento(params, activeLogger);
      case 'cartellePerClasse':
        return this.cartellePerClasse(params, activeLogger);
      case 'cartellePerUtente':
        return this.cartellePerUtente(params, activeLogger);
      case 'cartellePerDipartimento':
        return this.cartellePerDipartimento(params, activeLogger);
      case 'emailCoordinatori':
        return this.getEmailCoordinatori(params.classeId ?? '');
      default:
        activeLogger.warn(
          `AggregatoreDati: metodo DATI_SORGENTE sconosciuto "${metodo}" — box saltato`
        );
        return null;
    }
  }

  private documentiPerClasse(
    params: { classeId?: string; filtri?: unknown },
    logger: LoggerService
  ): LogDocumento[] | null {
    const filtri = this.parseFiltri(params.filtri, 'documenti', 'documentiPerClasse', logger);
    if (filtri === null || !this.classeEsiste(params.classeId))
      return this.warnScope('documentiPerClasse', 'classeId mancante o non risolvibile', logger);
    return this.getDocumentiPerClasse(params.classeId!, filtri);
  }

  private documentiPerUtente(
    params: { utenteEmail?: string; filtri?: unknown },
    logger: LoggerService
  ): LogDocumento[] | null {
    const filtri = this.parseFiltri(params.filtri, 'documenti', 'documentiPerUtente', logger);
    if (filtri === null || !this.isNonEmpty(params.utenteEmail))
      return this.warnScope('documentiPerUtente', 'utenteEmail mancante', logger);
    return this.getDocumentiPerUtente(params.utenteEmail, filtri);
  }

  private documentiPerDipartimento(
    params: { dipartimentoId?: string; filtri?: unknown },
    logger: LoggerService
  ): LogDocumento[] | null {
    const filtri = this.parseFiltri(params.filtri, 'documenti', 'documentiPerDipartimento', logger);
    if (filtri === null || !this.dipartimentoEsiste(params.dipartimentoId))
      return this.warnScope(
        'documentiPerDipartimento',
        'dipartimentoId mancante o non risolvibile',
        logger
      );
    return this.getDocumentiPerDipartimento(params.dipartimentoId!, filtri);
  }

  private cartellePerClasse(
    params: { classeId?: string; filtri?: unknown },
    logger: LoggerService
  ): LogCartella[] | null {
    const filtri = this.parseFiltri(params.filtri, 'cartelle', 'cartellePerClasse', logger);
    if (filtri === null || !this.classeEsiste(params.classeId))
      return this.warnScope('cartellePerClasse', 'classeId mancante o non risolvibile', logger);
    return this.getCartellePerClasse(params.classeId!, filtri);
  }

  private cartellePerUtente(
    params: { utenteEmail?: string; filtri?: unknown },
    logger: LoggerService
  ): LogCartella[] | null {
    const filtri = this.parseFiltri(params.filtri, 'cartelle', 'cartellePerUtente', logger);
    if (filtri === null || !this.isNonEmpty(params.utenteEmail))
      return this.warnScope('cartellePerUtente', 'utenteEmail mancante', logger);
    return this.getCartellePerUtente(params.utenteEmail, filtri);
  }

  private cartellePerDipartimento(
    params: { dipartimentoId?: string; filtri?: unknown },
    logger: LoggerService
  ): LogCartella[] | null {
    const filtri = this.parseFiltri(params.filtri, 'cartelle', 'cartellePerDipartimento', logger);
    if (filtri === null || !this.dipartimentoEsiste(params.dipartimentoId))
      return this.warnScope(
        'cartellePerDipartimento',
        'dipartimentoId mancante o non risolvibile',
        logger
      );
    return this.getCartellePerDipartimento(params.dipartimentoId!, filtri);
  }

  private parseFiltri(
    raw: unknown,
    entita: EntitaSorgente,
    metodo: string,
    logger: LoggerService
  ): FiltriSorgente | undefined | null {
    const { filtri, errori } = parseFiltriSorgente(raw, entita);
    if (errori.length === 0) return filtri;
    logger.warn(`AggregatoreDati: filtri non validi per ${metodo}: ${errori.join('; ')}`);
    return null;
  }

  private warnScope(metodo: string, motivo: string, logger: LoggerService): null {
    logger.warn(`AggregatoreDati: ${metodo} — ${motivo}; box saltato`);
    return null;
  }

  private classeEsiste(classeId: string | undefined): boolean {
    if (!this.isNonEmpty(classeId)) return false;
    return this.classi.findById(ClasseId.of(classeId)) !== null;
  }

  private dipartimentoEsiste(dipartimentoId: string | undefined): boolean {
    if (!this.isNonEmpty(dipartimentoId)) return false;
    return this.dipartimenti.findByIdCached(DipartimentoId.of(dipartimentoId)) !== null;
  }

  private scopedToDipartimento<T extends { containsMateria(materiaId: string): boolean }>(
    source: T[],
    dipartimentoId: string
  ): T[] {
    const dipartimento = this.dipartimenti.findByIdCached(DipartimentoId.of(dipartimentoId));
    if (dipartimento === null) return [];
    const spec = new MateriePerDipartimentoSpec(dipartimento);
    const materie = this.materie
      .findAllCached()
      .filter((materia) => spec.isSatisfiedBy(materia))
      .map((materia) => materia.id)
      .filter((id): id is string => id !== null);
    return source.filter((item) => materie.some((materia) => item.containsMateria(materia)));
  }

  private filterDocumenti(documenti: LogDocumento[], filtri?: FiltriSorgente): LogDocumento[] {
    if (filtri === undefined) return documenti;
    const spec = specDocumenti(filtri);
    return documenti.filter((documento) => spec.isSatisfiedBy(documento));
  }

  private filterCartelle(cartelle: LogCartella[], filtri?: FiltriSorgente): LogCartella[] {
    if (filtri === undefined) return cartelle;
    const spec = specCartelle(filtri);
    return cartelle.filter((cartella) => spec.isSatisfiedBy(cartella));
  }

  private isNonEmpty(value: string | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
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
