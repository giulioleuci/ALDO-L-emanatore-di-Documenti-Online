import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import { getClasseEntity } from '../techEntities';

/** RUOLI keys for the two tutor roles (02 §4.1). */
const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Populates `focus.classe.tutor` from CLASSI.RUOLI (09 §4). Must run before the
 * consiglio provider, which reads the tutor flags it exposes (09 §3 note).
 */
export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: ClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    focusClasse.tutor = {
      asl: this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL).map((d) => ({ nome: d.getNomeCompleto(), email: d.id ?? '' })),
      orientamento: this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ORIENT).map((d) => ({ nome: d.getNomeCompleto(), email: d.id ?? '' }))
    };
  }
}
