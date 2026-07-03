import { IndirizzoId } from '../value-objects/IndirizzoId';
import { TipoIstituto } from '../value-objects/enums';
import { COL_INDIRIZZI } from '../../config/schema';

export interface IndirizzoData {
  [COL_INDIRIZZI.ID]?: string;
  [COL_INDIRIZZI.NOME]?: string;
  [COL_INDIRIZZI.NOME_SINTETICO]?: string;
  [COL_INDIRIZZI.TIPO]?: string;
  [key: string]: unknown;
}

/** INDIRIZZI entity (PK = ID). Study-path lookup (ref 01, 04). */
export class Indirizzo extends Entity {
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

  static fromData(data: IndirizzoData): Indirizzo {
    return new Indirizzo(data);
  }
}
