import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import { getClasseEntity } from '../techEntities';

/**
 * Populates `focus.classe.rappresentanti` (09 §4): student reps carry name+email
 * (ALUNNI.RAPPR_STUD), parent reps only a free-text name (ALUNNI.RAPPR_GEN — no
 * email is available for that role, nor is one foreseen; 02 §4.1).
 */
export class RappresentantiProvider implements ContextProvider {
  constructor(private readonly classi: ClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const studenti = this.classi.getStudenti(classe);
    focusClasse.rappresentanti = {
      studenti: studenti
        .filter((a) => a.isRappresentante())
        .map((a) => ({ nomeCompleto: a.cognomeNome, email: a.email.value })),
      genitori: studenti
        .map((a) => a.getRappresentanteGenitore().trim())
        .filter((nome) => nome.length > 0)
        .map((nome) => ({ nomeCompleto: nome }))
    };
  }
}
