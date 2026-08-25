import type { Alunno } from '../entities/Alunno';
import { COL_ALUNNI } from '../../config/schema';

/** Active students (ref 07 §1). */
export class AlunniAttiviSpec extends EqualityFieldSpec<Alunno> {
  constructor() {
    super(COL_ALUNNI.ATTIVO, (alunno) => alunno.isAttivo(), true);
  }
}
