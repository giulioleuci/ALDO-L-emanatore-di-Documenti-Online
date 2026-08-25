import type { Indirizzo } from '../entities/Indirizzo';
import { TipoIstituto } from '../value-objects/enums';
import { COL_INDIRIZZI } from '../../config/schema';

/** INDIRIZZI filtered by TIPO (ref 07 §5). Translatable to a DB query. */
export class IndirizziPerTipoSpec extends EqualityFieldSpec<Indirizzo> {
  constructor(tipo: TipoIstituto) {
    super(COL_INDIRIZZI.TIPO, (indirizzo) => indirizzo.tipo, tipo);
  }
}
