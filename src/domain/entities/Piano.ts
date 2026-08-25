import { TipoPiano } from '../value-objects/enums';
import { COL_PIANI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export type PianoData = {
  [COL_PIANI.STUDENTE]?: string;
  [COL_PIANI.TIPO]?: string;
  [COL_PIANI.PARAMETRI]?: string | null;
};

/**
 * PIANI entity — personalized plan (PDP/PEI/PFP). Composite PK (STUDENTE, TIPO);
 * there is no single-column id (ref 01). Every TipoPiano except PFP implies BES
 * (ref 03). Part of the Alunno aggregate.
 */
export class Piano extends AldoEntity {
  public readonly studente: string;
  public readonly tipo: TipoPiano;
  private readonly parametriRaw: string | null;

  constructor(data: PianoData = {}) {
    super(data);
    this.studente =
      typeof data[COL_PIANI.STUDENTE] === 'string' ? (data[COL_PIANI.STUDENTE] as string) : '';
    this.tipo = data[COL_PIANI.TIPO] as TipoPiano;
    this.parametriRaw =
      typeof data[COL_PIANI.PARAMETRI] === 'string' ? (data[COL_PIANI.PARAMETRI] as string) : null;
    // Synthetic composite id for identity-map purposes; not a persisted column.
    this.id = this.studente && this.tipo ? `${this.studente}::${this.tipo}` : null;
  }

  /** Every plan type except PFP implies a special educational need (ref 03). */
  isBES(): boolean {
    return this.tipo !== TipoPiano.PFP;
  }

  getParametri(): Record<string, unknown> {
    return this.parametriRaw === null
      ? {}
      : (JSON.parse(this.parametriRaw) as Record<string, unknown>);
  }

  override toData(): EntityData {
    return {
      [COL_PIANI.STUDENTE]: this.studente,
      [COL_PIANI.TIPO]: this.tipo,
      [COL_PIANI.PARAMETRI]: this.parametriRaw
    };
  }

  static fromData(data: Record<string, unknown>): Piano {
    return new Piano(data);
  }
}
