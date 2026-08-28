import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

/**
 * Resolves `focus.docente`/`focus.materia` for a single (docente, materia)
 * cattedra of the class council, scoping a DOCUMENTO_DOCENTE_CLASSE_MATERIA
 * generation to exactly one teacher/subject pair (`params.docenteCorrente`/
 * `params.materiaCorrente`). Reads `focus.classe.consiglioDiClasse`, already
 * populated by the `'consiglio'` provider — must run after it in the recipe.
 */
export class DocenteClasseMateriaFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const cdc = cdu.focus.classe?.consiglioDiClasse ?? [];
    const docenteCdc = cdc.find((d) => d.anagrafica.email === params.docenteCorrente);
    if (docenteCdc === undefined) {
      throw new PipelineError(
        `DOCUMENTO_DOCENTE_CLASSE_MATERIA: docente ${params.docenteCorrente ?? ''} non trovato nel consiglio di classe`
      );
    }
    const materia = docenteCdc.materie.find((m) => m.sigla === params.materiaCorrente);
    if (materia === undefined) {
      throw new PipelineError(
        `DOCUMENTO_DOCENTE_CLASSE_MATERIA: materia ${params.materiaCorrente ?? ''} non trovata per il docente ${params.docenteCorrente ?? ''}`
      );
    }
    cdu.focus.docente = docenteCdc.anagrafica;
    cdu.focus.materia = materia;
  }
}
