import { Specification } from './Specification';
import type { MovimentoAlunno } from '../entities/MovimentoAlunno';
import type { Email } from '../value-objects/Email';
import type { TipoMovimento } from '../value-objects/enums';
import { COL_MOV_ALUNNI } from '../../config/schema';

/** Mobility records of a student (ref 06 §15). */
export class MovimentiPerAlunnoSpec extends Specification<MovimentoAlunno> {
  constructor(private readonly email: Email) {
    super();
  }
  isSatisfiedBy(m: MovimentoAlunno): boolean {
    return m.studente === this.email.value;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_MOV_ALUNNI.STUDENTE]: this.email.value };
  }
}

/** Mobility records of a given type (ref 06 §15). */
export class MovimentiPerTipoSpec extends Specification<MovimentoAlunno> {
  constructor(private readonly tipo: TipoMovimento) {
    super();
  }
  isSatisfiedBy(m: MovimentoAlunno): boolean {
    return m.tipo === this.tipo;
  }
  override toQueryObject(): Record<string, unknown> {
    return { [COL_MOV_ALUNNI.TIPO]: this.tipo };
  }
}
