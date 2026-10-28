import type { Alunno } from '../entities/Alunno';
import type { ClasseId } from '../value-objects/ClasseId';
import { COL_ALUNNI } from '../../config/schema';

/** ALUNNI in a class (ref 07 §1). */
export class AlunniInClasseSpec extends EqualityFieldSpec<Alunno> {
  constructor(classeId: ClasseId) {
    super(COL_ALUNNI.CLASSE, (alunno) => alunno.classe, classeId.value);
  }
}
