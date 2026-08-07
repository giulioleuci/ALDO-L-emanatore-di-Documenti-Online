import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';

/**
 * Populates `focus.classe.rappresentanti` (09 §4): student reps carry name+email
 * (ALUNNI.RAPPR_STUD), parent reps only a free-text name (ALUNNI.RAPPR_GEN — no
 * email is available for that role, nor is one foreseen; 02 §4.1). For an
 * articulated parent class, students live under the partner classes, so reps
 * are aggregated across both partners and tagged with the owning partner's
 * indirizzo (09 §10).
 */
export class RappresentantiProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      const studenti: Array<{ nomeCompleto: string; email: string; indirizzo: { nome: string } }> =
        [];
      const genitori: Array<{ nomeCompleto: string; studente: { nomeCompleto: string }; indirizzo: { nome: string } }> = [];
      for (const partner of this.classi.getClassiPartner(classe)) {
        const indirizzo = { nome: this.classi.getIndirizzo(partner).nome };
        for (const alunno of this.classi.getStudenti(partner)) {
          if (alunno.isRappresentante()) {
            studenti.push({ nomeCompleto: alunno.cognomeNome, email: alunno.email.value, indirizzo });
          }
          const nomeGenitore = alunno.getRappresentanteGenitore().trim();
          if (nomeGenitore.length > 0) {
            genitori.push({ nomeCompleto: nomeGenitore, studente: { nomeCompleto: alunno.cognomeNome }, indirizzo });
          }
        }
      }
      focusClasse.rappresentanti = { studenti, genitori };
      return;
    }

    const studenti = this.classi.getStudenti(classe);
    focusClasse.rappresentanti = {
      studenti: studenti
        .filter((a) => a.isRappresentante())
        .map((a) => ({ nomeCompleto: a.cognomeNome, email: a.email.value })),
      genitori: studenti
        .filter((a) => a.getRappresentanteGenitore().trim().length > 0)
        .map((a) => ({
          nomeCompleto: a.getRappresentanteGenitore().trim(),
          studente: { nomeCompleto: a.cognomeNome }
        }))
    };
  }
}
