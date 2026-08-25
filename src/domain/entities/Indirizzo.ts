import { IndirizzoId } from '../value-objects/IndirizzoId';
import { TipoIstituto } from '../value-objects/enums';
import { COL_INDIRIZZI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export type IndirizzoData = {
  [COL_INDIRIZZI.ID]?: string;
  [COL_INDIRIZZI.NOME]?: string;
  [COL_INDIRIZZI.NOME_SINTETICO]?: string;
  [COL_INDIRIZZI.TIPO]?: string;
};

/** INDIRIZZI entity (PK = ID). Study-path lookup (ref 01, 04). */
export class Indirizzo extends AldoEntity {
  public readonly nome: string;
  public readonly nomeSintetico: string;
  public readonly tipo: TipoIstituto;

  constructor(data: IndirizzoData = {}) {
    super(data);
    this.id = data[COL_INDIRIZZI.ID] ?? null;
    this.nome = data[COL_INDIRIZZI.NOME] ?? '';
    this.nomeSintetico = data[COL_INDIRIZZI.NOME_SINTETICO] ?? '';
    this.tipo = (data[COL_INDIRIZZI.TIPO] as TipoIstituto) ?? TipoIstituto.LICEO;
  }

  get indirizzoId(): IndirizzoId {
    return IndirizzoId.of(this.id ?? '');
  }

  override toData(): EntityData {
    return {
      [COL_INDIRIZZI.ID]: this.id,
      [COL_INDIRIZZI.NOME]: this.nome,
      [COL_INDIRIZZI.NOME_SINTETICO]: this.nomeSintetico,
      [COL_INDIRIZZI.TIPO]: this.tipo
    };
  }

  static fromData(data: Record<string, unknown>): Indirizzo {
    return new Indirizzo(data);
  }
}
