import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import { docentiDescrizione as joinDocenti } from '../mappers/subjectVmMapper';
import { buildMateriePerPrincipale } from '../mappers/materiePerPrincipaleMapper';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';

/**
 * Builds `focus.classe.materie[]` (02 §2.8, §4.1) — the flat, deduped subject
 * catalog of the class council — plus `materiePerPrincipale`. Runs AFTER
 * `consiglio` (Recipe.ts token order): it derives everything from
 * `focus.classe.consiglioDiClasse`, never re-queries teaching assignments.
 */
export class MaterieClasseProvider implements ContextProvider {
  constructor(private readonly materie?: IMateriaRepository) {}

  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const consiglio = focusClasse.consiglioDiClasse ?? [];
    const materie = this.buildCatalog(consiglio);
    focusClasse.materie = materie;
    if (this.materie !== undefined) {
      focusClasse.materiePerPrincipale = buildMateriePerPrincipale(materie, this.materie);
    }
  }

  private buildCatalog(consiglio: DocenteCdcVM[]): SubjectVM[] {
    const bySubject = new Map<string, SubjectVM>();
    for (const docente of consiglio) {
      for (const materia of docente.materie) {
        const key = `${materia.sigla}::${materia.specificita ?? ''}`;
        const existing = bySubject.get(key);
        const docenti = [...(existing?.docenti ?? []), docente.anagrafica];
        bySubject.set(key, {
          ...materia,
          docenti,
          docentiDescrizione: joinDocenti(docenti),
          hasItp: (existing?.hasItp ?? false) || materia.isITP
        });
      }
    }
    return Array.from(bySubject.values());
  }
}
