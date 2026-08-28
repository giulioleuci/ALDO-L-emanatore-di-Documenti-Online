import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

/**
 * Resolves `focus.docente` for the CLASSE_DOCENTE axis: the whole teacher, no
 * single-subject narrowing (unlike DocenteClasseMateriaFocusProvider) — the
 * axis is "one document per (classe, docente) pair", covering every subject
 * that teacher holds in this class council. Reads
 * `focus.classe.consiglioDiClasse`, already populated by the `'consiglio'`
 * provider — must run after it in the recipe.
 */
export class DocenteClasseFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const cdc = cdu.focus.classe?.consiglioDiClasse ?? [];
    const docenteCdc = cdc.find((d) => d.anagrafica.email === params.docenteCorrente);
    if (docenteCdc === undefined) {
      throw new PipelineError(
        `CLASSE_DOCENTE: docente ${params.docenteCorrente ?? ''} non trovato nel consiglio di classe`
      );
    }
    cdu.focus.docente = docenteCdc.anagrafica;
  }
}
