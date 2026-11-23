import type { Progetto } from '../entities/Progetto';
import type { ClasseId } from '../value-objects/ClasseId';
import { COL_PROGETTI } from '../../config/schema';

/** Projects assigned to a class (ref 06 §13). */
export class ProgettiPerClasseSpec extends EqualityFieldSpec<Progetto> {
  constructor(classeId: ClasseId) {
    super(COL_PROGETTI.CLASSE, (progetto) => progetto.classe, classeId.value);
  }
}
