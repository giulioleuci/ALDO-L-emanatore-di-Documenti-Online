import type { Classe } from '../entities/Classe';
import { COL_CLASSI } from '../../config/schema';

/** Active classes (ref 06 §3). */
export class ClassiAttiveSpec extends EqualityFieldSpec<Classe> {
  constructor() {
    super(COL_CLASSI.ATTIVA, (classe) => classe.getDynamicColumns()[COL_CLASSI.ATTIVA], true);
  }
}
