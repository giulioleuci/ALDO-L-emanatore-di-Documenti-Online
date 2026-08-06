import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { Docente } from '../../../domain/entities/Docente';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVmFromDocente, declinePersonGroup } from '../mappers/personVmMapper';
import { getClasseEntity } from '../techEntities';

/** RUOLI keys for the two tutor roles (02 §4.1). */
const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Populates `focus.classe.tutor` from CLASSI.RUOLI (09 §4), merged across an
 * articulated parent's partner classes via `getDocentiRuoloArticolato`, as
 * PersonVM lists plus the aggregate declension (appellativo/articolo/tutor)
 * computed over asl ∪ orientamento — omitted entirely when both lists are
 * empty (02 §8.1). The council projection (`TeachingCouncilProjection.
 * councilVmStrategy`) reads TUTOR_ASL/TUTOR_ORIENT from `ClasseRepository`
 * directly and does not depend on this provider's output (see `Recipe.ts`'s
 * recipe table note).
 */
export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const asl = this.tutorVm(classe, RUOLO_TUTOR_ASL);
    const orientamento = this.tutorVm(classe, RUOLO_TUTOR_ORIENT);
    const declension = declinePersonGroup([...asl, ...orientamento]);

    focusClasse.tutor = {
      ...(declension === undefined ? {} : { ...declension, tutor: 'tutor' }),
      asl,
      orientamento
    };
  }

  private tutorVm(classe: ReturnType<typeof getClasseEntity>, ruolo: string): PersonVM[] {
    return this.classi
      .getDocentiRuoloArticolato(classe, ruolo)
      .map((d: Docente) => buildPersonVmFromDocente(d));
  }
}
