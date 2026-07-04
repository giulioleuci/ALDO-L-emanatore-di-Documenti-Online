import { MateriaId } from '../value-objects/MateriaId';
import { EsameConfig } from '../value-objects/EsameConfig';
import { COL_MATERIE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface MateriaData {
  [COL_MATERIE.ID]?: string;
  [COL_MATERIE.NOME]?: string;
  [COL_MATERIE.SINTESI]?: string;
  [COL_MATERIE.ESAME_CFG]?: string | null;
  [key: string]: unknown;
}

/** MATERIE entity (PK = ID). Subject-catalogue lookup (ref 01, 04). */
export class Materia extends AldoEntity {
  public readonly nome: string;
  public readonly sintesi: string;
  private readonly esameCfgRaw: string | null;

  constructor(data: MateriaData = {}) {
    super(data);
    this.id = data[COL_MATERIE.ID] ?? null;
    this.nome = data[COL_MATERIE.NOME] ?? '';
    this.sintesi = data[COL_MATERIE.SINTESI] ?? '';
    const raw = data[COL_MATERIE.ESAME_CFG];
    this.esameCfgRaw = typeof raw === 'string' ? raw : null;
  }

  get materiaId(): MateriaId {
    return MateriaId.of(this.id ?? '');
  }

  get esameConfig(): EsameConfig | null {
    return EsameConfig.fromJson(this.esameCfgRaw);
  }

  override toData(): EntityData {
    return {
      [COL_MATERIE.ID]: this.id,
      [COL_MATERIE.NOME]: this.nome,
      [COL_MATERIE.SINTESI]: this.sintesi,
      [COL_MATERIE.ESAME_CFG]: this.esameCfgRaw
    };
  }

  static fromData(data: MateriaData): Materia {
    return new Materia(data);
  }
}
