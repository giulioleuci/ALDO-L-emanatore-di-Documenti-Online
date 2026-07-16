import { ClasseId } from '../value-objects/ClasseId';
import { TipoProgetto } from '../value-objects/enums';
import { COL_PROGETTI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface ProgettoData {
  [key: string]: unknown;
}

/**
 * PROGETTI entity — extracurricular activity / PCTO path. Composite PK
 * (CLASSE, TIPO, NOME); no single-column id (ref 01/04 §13). Part of the Classe
 * aggregate.
 */
export class Progetto extends AldoEntity {
  public readonly classe: string;
  public readonly tipo: TipoProgetto;
  public readonly nome: string;
  public readonly referente: string;
  private readonly ore: number;
  private readonly oreAsl: number;

  constructor(data: ProgettoData = {}) {
    super(data);
    this.classe =
      typeof data[COL_PROGETTI.CLASSE] === 'string' ? (data[COL_PROGETTI.CLASSE] as string) : '';
    this.tipo = data[COL_PROGETTI.TIPO] as TipoProgetto;
    this.nome =
      typeof data[COL_PROGETTI.NOME] === 'string' ? (data[COL_PROGETTI.NOME] as string) : '';
    this.referente =
      typeof data[COL_PROGETTI.REFERENTE] === 'string'
        ? (data[COL_PROGETTI.REFERENTE] as string)
        : '';
    this.ore = typeof data[COL_PROGETTI.ORE] === 'number' ? (data[COL_PROGETTI.ORE] as number) : 0;
    this.oreAsl =
      typeof data[COL_PROGETTI.ORE_ASL] === 'number' ? (data[COL_PROGETTI.ORE_ASL] as number) : 0;
    this.id =
      this.classe && this.tipo && this.nome ? `${this.classe}::${this.tipo}::${this.nome}` : null;
  }

  get classeId(): ClasseId {
    return ClasseId.of(this.classe);
  }

  /** True for PCTO/ASL projects (ref 04 §13). */
  isASL(): boolean {
    return this.tipo === TipoProgetto.ASL;
  }

  /** ORE_ASL — hours counting toward the ASL total, a subset of ORE (ref 04 §13). */
  getOreASLEffettive(): number {
    return this.oreAsl;
  }

  override toData(): EntityData {
    return {
      [COL_PROGETTI.CLASSE]: this.classe,
      [COL_PROGETTI.TIPO]: this.tipo,
      [COL_PROGETTI.NOME]: this.nome,
      [COL_PROGETTI.REFERENTE]: this.referente,
      [COL_PROGETTI.ORE]: this.ore,
      [COL_PROGETTI.ORE_ASL]: this.oreAsl
    };
  }

  static fromData(data: ProgettoData): Progetto {
    return new Progetto(data);
  }
}
