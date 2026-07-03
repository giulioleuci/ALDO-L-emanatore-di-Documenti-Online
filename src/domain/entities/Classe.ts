import { ClasseId } from '../value-objects/ClasseId';
import { AnnoCorso } from '../value-objects/AnnoCorso';
import { ValidationError } from '../errors/DomainError';
import { COL_CLASSI } from '../../config/schema';

export interface ClasseData {
  [COL_CLASSI.ID]?: string;
  [COL_CLASSI.ANNO]?: number | string;
  [COL_CLASSI.INDIRIZZO]?: string;
  [key: string]: unknown;
}

/**
 * CLASSI entity (PK = ID). Hydrated from a flat row via {@link Classe.fromData}.
 * Fails loud on a malformed row (missing INDIRIZZO / invalid ANNO) rather than
 * coercing to "undefined"/NaN. `anno` is exposed as an AnnoCorso VO.
 */
export class Classe extends Entity {
  public readonly nome: string;
  public readonly indirizzo: string;
  private readonly _anno: AnnoCorso;

  constructor(data: ClasseData = {}) {
    super(data);
    this.id = data[COL_CLASSI.ID] ?? null;
    const indirizzo = data[COL_CLASSI.INDIRIZZO];
    if (typeof indirizzo !== 'string' || indirizzo.trim() === '') {
      throw new ValidationError(`Classe ${this.id ?? '?'}: colonna INDIRIZZO mancante o non valida`);
    }
    this.indirizzo = indirizzo;
    this.nome = this.id ?? '';
    this._anno = AnnoCorso.of(Number(data[COL_CLASSI.ANNO]));
  }

  get anno(): AnnoCorso {
    return this._anno;
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

  static fromData(data: ClasseData): Classe {
    return new Classe(data);
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
