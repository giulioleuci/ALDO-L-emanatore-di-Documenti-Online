import { Specification } from './Specification';
import type { Indirizzo } from '../entities/Indirizzo';

/** INDIRIZZI filtered by TIPO (ref 07 §5). In memory: an absent TIPO defaults to ''. */
export class IndirizziPerTipoSpec extends Specification<Indirizzo> {
  constructor(private readonly tipo: string) {
    super();
  }

  isSatisfiedBy(indirizzo: Indirizzo): boolean {
    return indirizzo.tipo === this.tipo;
  }
}
