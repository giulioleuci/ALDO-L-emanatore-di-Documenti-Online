import type { Indirizzo } from '../entities/Indirizzo';
import { TipoIstituto } from '../value-objects/enums';

/** INDIRIZZI filtered by TIPO (ref 07 §5). In memory: an absent TIPO defaults to LICEO. */
export class IndirizziPerTipoSpec extends Specification<Indirizzo> {
  constructor(private readonly tipo: TipoIstituto) {
    super();
  }

  isSatisfiedBy(indirizzo: Indirizzo): boolean {
    return indirizzo.tipo === this.tipo;
  }
}
