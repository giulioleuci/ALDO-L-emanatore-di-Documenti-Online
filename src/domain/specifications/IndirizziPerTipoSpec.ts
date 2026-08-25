import { Specification } from './Specification';
import type { Indirizzo } from '../entities/Indirizzo';
import { TipoIstituto } from '../value-objects/enums';
import { COL_INDIRIZZI } from '../../config/schema';

/** INDIRIZZI filtered by TIPO (ref 07 §5). Translatable to a DB query. */
export class IndirizziPerTipoSpec extends Specification<Indirizzo> {
  constructor(private readonly tipo: TipoIstituto) {
    super();
  }
  isSatisfiedBy(candidate: Indirizzo): boolean {
    return candidate.tipo === this.tipo;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_INDIRIZZI.TIPO]: this.tipo };
  }
}
