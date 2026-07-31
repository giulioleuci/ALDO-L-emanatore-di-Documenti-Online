import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';

/** RUOLI keys for the two tutor roles (02 §4.1). */
const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Populates `focus.classe.tutor` from CLASSI.RUOLI (09 §4), merged across an
 * articulated parent's partner classes via `getDocentiRuoloArticolato`. The
 * council projection (`TeachingCouncilProjection.councilVmStrategy`) reads
 * TUTOR_ASL/TUTOR_ORIENT from `ClasseRepository` directly and does not depend
 * on this provider's output (see `Recipe.ts`'s recipe table note).
 */
export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    focusClasse.tutor = {
      asl: this.tutorVM(classe, RUOLO_TUTOR_ASL),
      orientamento: this.tutorVM(classe, RUOLO_TUTOR_ORIENT)
    };
  }

  private tutorVM(
    classe: ReturnType<typeof getClasseEntity>,
    ruolo: string
  ): Array<{ nome: string; email: string }> {
    return this.classi
      .getDocentiRuoloArticolato(classe, ruolo)
      .map((d) => ({ nome: d.getNomeCompleto(), email: d.id ?? '' }));
  }
}
