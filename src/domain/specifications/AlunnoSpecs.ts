import type { Specification } from './Specification';
import type { Alunno } from '../entities/Alunno';
import type { ClasseId } from '../value-objects/ClasseId';
import type { ReligioneScelta } from '../value-objects/enums';
import { COL_ALUNNI } from '../../config/schema';

/** ALUNNI in a class (ref 07 §1). */
export class AlunniInClasseSpec implements Specification<Alunno> {
  constructor(private readonly classeId: ClasseId) {}
  isSatisfiedBy(a: Alunno): boolean {
    return a.classe === this.classeId.value;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.CLASSE]: this.classeId.value };
  }
}

/** Repeating students (ref 07 §1). */
export class AlunniRipetentiSpec implements Specification<Alunno> {
  isSatisfiedBy(a: Alunno): boolean {
    return a.isRipetente();
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.RIPETENTE]: true };
  }
}

/** Elected class representatives (ref 07 §1). */
export class AlunniRappresentantiSpec implements Specification<Alunno> {
  isSatisfiedBy(a: Alunno): boolean {
    return a.isRappresentante();
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.RAPPR_STUD]: true };
  }
}

/** Students by IRC choice (ref 07 §1). */
export class AlunniPerReligioneSpec implements Specification<Alunno> {
  constructor(private readonly religione: ReligioneScelta) {}
  isSatisfiedBy(a: Alunno): boolean {
    return a.religione === this.religione;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.RELIGIONE]: this.religione };
  }
}
