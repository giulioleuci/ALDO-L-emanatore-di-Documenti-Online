import type { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';

/**
 * True when the student has no IN/CAMBIO movement recorded within the year —
 * i.e. no mid-year entry, whether from another school or another internal
 * class (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §5.2). An OUT/RITIRATO exit
 * does not affect this: it answers "was there a gap at the start", not
 * "did the year end early".
 */
export function presenteTuttoAnno(movimenti: MovimentoAlunno[]): boolean {
  return !movimenti.some((m) => m.isIngresso() || m.isCambioClasse());
}
