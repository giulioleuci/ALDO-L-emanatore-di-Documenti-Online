import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';

/** RUOLI keys for the two tutor roles (02 §4.1). */
const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Populates `focus.classe.tutor` from CLASSI.RUOLI (09 §4). Must run before the
 * consiglio provider, which reads the tutor flags it exposes (09 §3 note).
 */
export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      focusClasse.tutor = {
        asl: this.tutorGruppo(classe, RUOLO_TUTOR_ASL),
        orientamento: this.tutorGruppo(classe, RUOLO_TUTOR_ORIENT)
      };
      return;
    }

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
      .getDocentiRuolo(classe, ruolo)
      .map((d) => ({ nome: d.getNomeCompleto(), email: d.id ?? '' }));
  }

  private tutorGruppo(
    classe: ReturnType<typeof getClasseEntity>,
    ruolo: string
  ): Array<{ nome: string; email: string }> {
    const byEmail = new Map<string, { nome: string; email: string }>();
    for (const gruppo of [classe, ...this.classi.getClassiPartner(classe)]) {
      for (const vm of this.tutorVM(gruppo, ruolo)) {
        if (vm.email !== '') byEmail.set(vm.email, vm);
      }
    }
    return [...byEmail.values()];
  }
}
