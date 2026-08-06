import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import type { PersonVM } from '../mappers/personVmMapper';

type Prova = 'PRIMA_PROVA' | 'SECONDA_PROVA';
type MateriaEsameVM = SubjectVM & { prova: Prova };
type DocenteEsameVM = PersonVM & { prova: Prova; materie: SubjectVM[] };

/**
 * Builds `focus.classe.esame` (02 §2.9, §4.1) — pre-split prima/seconda prova
 * partitions so templates never write `| where:'prova','PRIMA_PROVA'`. Runs
 * AFTER `materie` (Recipe.ts token order): reads `isMateriaPrimaProva`/
 * `isMateriaSecondaProva`, already resolved per the class's indirizzo by
 * MaterieClasseProvider/TeachingCouncilProjection.
 */
export class EsameProvider implements ContextProvider {
  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const catalogo = focusClasse.materie ?? [];

    const materiePrimaProva = catalogo.filter((m) => m.isMateriaPrimaProva);
    const materieSecondaProva = catalogo.filter((m) => m.isMateriaSecondaProva);
    const materie: MateriaEsameVM[] = [
      ...materiePrimaProva.map((m) => ({ ...m, prova: 'PRIMA_PROVA' as const })),
      ...materieSecondaProva.map((m) => ({ ...m, prova: 'SECONDA_PROVA' as const }))
    ];

    focusClasse.esame = {
      hasEsame: materie.length > 0,
      materie,
      docenti: this.buildDocenti(materiePrimaProva, 'PRIMA_PROVA').concat(
        this.buildDocenti(materieSecondaProva, 'SECONDA_PROVA')
      ),
      materiePrimaProva,
      materieSecondaProva,
      docentiPrimaProva: this.dedupeDocenti(materiePrimaProva),
      docentiSecondaProva: this.dedupeDocenti(materieSecondaProva)
    };
  }

  private dedupeDocenti(materie: SubjectVM[]): PersonVM[] {
    const seen = new Map<string, PersonVM>();
    for (const materia of materie) {
      for (const docente of materia.docenti ?? []) {
        if (docente.email !== null) seen.set(docente.email, docente);
      }
    }
    return Array.from(seen.values());
  }

  private buildDocenti(materie: SubjectVM[], prova: Prova): DocenteEsameVM[] {
    const byEmail = new Map<string, DocenteEsameVM>();
    for (const materia of materie) {
      for (const docente of materia.docenti ?? []) {
        const key = docente.email ?? docente.nomeCompleto;
        const existing = byEmail.get(key);
        byEmail.set(key, { ...docente, prova, materie: [...(existing?.materie ?? []), materia] });
      }
    }
    return Array.from(byEmail.values());
  }
}
