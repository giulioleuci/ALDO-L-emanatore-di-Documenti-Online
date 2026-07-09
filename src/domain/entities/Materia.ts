import { MateriaId } from '../value-objects/MateriaId';
import { EsameConfig } from '../value-objects/EsameConfig';
import { COL_MATERIE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface MateriaData {
  [COL_MATERIE.ID]?: string;
  [COL_MATERIE.NOME]?: string;
  [COL_MATERIE.SINTESI]?: string;
  [COL_MATERIE.COLORE_1]?: string;
  [COL_MATERIE.COLORE_2]?: string;
  [COL_MATERIE.SIMBOLO]?: string;
  [COL_MATERIE.ESAME_CFG]?: string | null;
  [COL_MATERIE.EVOLUZIONE]?: string | null;
  [key: string]: unknown;
}

/** Default border colour when a MATERIA has no COLORE_1 (ref 11 §11). */
const DEFAULT_COLORE_1 = '#ddd';

/** MATERIE entity (PK = ID). Subject-catalogue lookup (ref 01, 04). */
export class Materia extends AldoEntity {
  public readonly nome: string;
  public readonly sintesi: string;
  public readonly colore1: string;
  public readonly colore2: string;
  public readonly simbolo: string;
  private readonly esameCfgRaw: string | null;
  private readonly evoluzioneRaw: string | null;

  constructor(data: MateriaData = {}) {
    super(data);
    this.id = data[COL_MATERIE.ID] ?? null;
    this.nome = data[COL_MATERIE.NOME] ?? '';
    this.sintesi = data[COL_MATERIE.SINTESI] ?? '';
    const c1 = data[COL_MATERIE.COLORE_1];
    this.colore1 = typeof c1 === 'string' && c1.trim() !== '' ? c1 : DEFAULT_COLORE_1;
    const c2 = data[COL_MATERIE.COLORE_2];
    this.colore2 = typeof c2 === 'string' ? c2 : '';
    const sym = data[COL_MATERIE.SIMBOLO];
    this.simbolo = typeof sym === 'string' ? sym : '';
    const raw = data[COL_MATERIE.ESAME_CFG];
    this.esameCfgRaw = typeof raw === 'string' ? raw : null;
    const evo = data[COL_MATERIE.EVOLUZIONE];
    this.evoluzioneRaw = typeof evo === 'string' ? evo : null;
  }

  get materiaId(): MateriaId {
    return MateriaId.of(this.id ?? '');
  }

  get esameConfig(): EsameConfig | null {
    return EsameConfig.fromJson(this.esameCfgRaw);
  }

  /**
   * MATERIE.EVOLUZIONE (13 §8): `{ "<SIGLA>": number[] }` mapping each historical
   * sigla to the course years it applied to (e.g. `{"GST":[1,2],"STO":[3,4,5]}`).
   * Empty when absent. Used to reconcile shortfall sigle across school years.
   */
  getEvoluzione(): Record<string, number[]> {
    if (this.evoluzioneRaw === null || this.evoluzioneRaw.trim() === '') return {};
    const parsed = JSON.parse(this.evoluzioneRaw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [sigla, anni] of Object.entries(parsed)) {
      if (Array.isArray(anni)) out[sigla] = anni.filter((n): n is number => typeof n === 'number');
    }
    return out;
  }

  override toData(): EntityData {
    return {
      [COL_MATERIE.ID]: this.id,
      [COL_MATERIE.NOME]: this.nome,
      [COL_MATERIE.SINTESI]: this.sintesi,
      [COL_MATERIE.COLORE_1]: this.colore1,
      [COL_MATERIE.COLORE_2]: this.colore2,
      [COL_MATERIE.SIMBOLO]: this.simbolo,
      [COL_MATERIE.ESAME_CFG]: this.esameCfgRaw,
      [COL_MATERIE.EVOLUZIONE]: this.evoluzioneRaw
    };
  }

  static fromData(data: MateriaData): Materia {
    return new Materia(data);
  }
}
