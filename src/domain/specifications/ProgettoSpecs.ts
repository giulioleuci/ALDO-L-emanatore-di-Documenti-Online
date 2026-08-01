import { Specification } from './Specification';
import type { Progetto } from '../entities/Progetto';
import type { ClasseId } from '../value-objects/ClasseId';
import type { TipoProgetto } from '../value-objects/enums';
import { COL_PROGETTI } from '../../config/schema';

/** Projects assigned to a class (ref 06 §13). */
export class ProgettiPerClasseSpec extends Specification<Progetto> {
  constructor(private readonly classeId: ClasseId) {
    super();
  }
  isSatisfiedBy(p: Progetto): boolean {
    return p.classe === this.classeId.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PROGETTI.CLASSE]: this.classeId.value };
  }
}

/** Projects of a given type (ref 06 §13). */
export class ProgettiPerTipoSpec extends Specification<Progetto> {
  constructor(private readonly tipo: TipoProgetto) {
    super();
  }
  isSatisfiedBy(p: Progetto): boolean {
    return p.tipo === this.tipo;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_PROGETTI.TIPO]: this.tipo };
  }
}
