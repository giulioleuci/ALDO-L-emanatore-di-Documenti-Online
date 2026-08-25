import { ClasseId } from '../value-objects/ClasseId';
import { AnnoCorso } from '../value-objects/AnnoCorso';
import { ValidationError } from '../errors/DomainError';
import { COL_CLASSI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

/**
 * CLASSI row. Matrice di assegnazione cattedre: oltre alle colonne fisse sotto,
 * la tabella porta una colonna dinamica per ogni materia (`ITA`), per ogni ITP
 * (`INF.itp`) e per ogni specifica (`INTERPRET.CHITARRA`), più le colonne
 * riservate all'utente con prefisso `_`. Tipo volutamente aperto.
 *
 * Colonne fisse (01 §CLASSI): ID, ANNO, TERMINALE, SEZ, INDIRIZZO, COORD,
 * RUOLI, ATTIVA, ARTICOLAZIONE, STORICO.
 */
export type ClasseData = Record<string, unknown>;

/**
 * CLASSI entity (PK = ID). Hydrated from a flat row via {@link Classe.fromData}.
 * Fails loud on a malformed row (missing INDIRIZZO / invalid ANNO) rather than
 * coercing to "undefined"/NaN. `anno` is exposed as an AnnoCorso VO.
 */
export class Classe extends AldoEntity {
  public readonly nome: string;
  public readonly indirizzo: string;
  private readonly _anno: AnnoCorso;

  constructor(data: ClasseData = {}) {
    super(data);
    const id = data[COL_CLASSI.ID];
    this.id = typeof id === 'string' ? id : null;
    const indirizzo = data[COL_CLASSI.INDIRIZZO];
    if (typeof indirizzo !== 'string' || indirizzo.trim() === '') {
      throw new ValidationError(
        `Classe ${this.id ?? '?'}: colonna INDIRIZZO mancante o non valida`
      );
    }
    this.indirizzo = indirizzo;
    this.nome = this.id ?? '';
    this._anno = AnnoCorso.of(Number(data[COL_CLASSI.ANNO]));
  }

  get anno(): AnnoCorso {
    return this._anno;
  }

  /** Sezione portion of `nome` (the class name with its leading year digits stripped, e.g. "5A" -> "A"). */
  get sezione(): string {
    return this.nome.replace(/^\d+/, '');
  }

  get classeId(): ClasseId {
    return ClasseId.of(this.id ?? '');
  }

  override toData(): EntityData {
    return {
      [COL_CLASSI.ID]: this.id,
      [COL_CLASSI.ANNO]: this._anno.value,
      [COL_CLASSI.INDIRIZZO]: this.indirizzo
    };
  }

  static fromData(data: Record<string, unknown>): Classe {
    return new Classe(data);
  }

  /**
   * Opts CLASSI into the DomainRepositoryLib dynamic-column passthrough (ref
   * REPORT_GLF.md B2): every hydrated column outside this fixed set (COORD,
   * RUOLI, IRC, ALT, STORICO, ARTICOLAZIONE, ATTIVA, and the per-subject
   * cattedra matrix generated at runtime from MATERIE) is captured verbatim and
   * merged back unmodified by `Repository.save()`.
   */
  static getKnownColumns(): string[] {
    return [COL_CLASSI.ID, COL_CLASSI.ANNO, COL_CLASSI.INDIRIZZO];
  }

  /** Ergonomic constructor from domain values (tests, in-memory building). */
  static create(id: ClasseId, anno: AnnoCorso, indirizzo: string): Classe {
    return new Classe({
      [COL_CLASSI.ID]: id.value,
      [COL_CLASSI.ANNO]: anno.value,
      [COL_CLASSI.INDIRIZZO]: indirizzo
    });
  }
}
