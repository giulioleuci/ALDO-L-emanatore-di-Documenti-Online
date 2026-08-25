import type { Alunno } from '../entities/Alunno';
import type { ClasseId } from '../value-objects/ClasseId';
import type { ReligioneScelta } from '../value-objects/enums';
import { COL_ALUNNI } from '../../config/schema';

/** ALUNNI in a class (ref 07 §1). */
export class AlunniInClasseSpec extends EqualityFieldSpec<Alunno> {
  constructor(classeId: ClasseId) {
    super(COL_ALUNNI.CLASSE, (alunno) => alunno.classe, classeId.value);
  }
}

/** Repeating students (ref 07 §1). */
export class AlunniRipetentiSpec extends EqualityFieldSpec<Alunno> {
  constructor() {
    super(COL_ALUNNI.RIPETENTE, (alunno) => alunno.isRipetente(), true);
  }
}

/** Elected class representatives (ref 07 §1). */
export class AlunniRappresentantiSpec extends EqualityFieldSpec<Alunno> {
  constructor() {
    super(COL_ALUNNI.RAPPR_STUD, (alunno) => alunno.isRappresentante(), true);
  }
}

/** Students by IRC choice (ref 07 §1). */
export class AlunniPerReligioneSpec extends EqualityFieldSpec<Alunno> {
  constructor(religione: ReligioneScelta) {
    super(COL_ALUNNI.RELIGIONE, (alunno) => alunno.religione, religione);
  }
}
