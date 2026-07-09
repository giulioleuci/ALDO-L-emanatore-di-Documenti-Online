import type { Materia } from '../../domain/entities/Materia';

/**
 * Translates a historical shortfall subject sigla into its current canonical
 * sigla via `MATERIE.EVOLUZIONE` (13 §3/§8): each current MATERIA record's
 * EVOLUZIONE JSON maps every sigla it has ever been known by to the course
 * years that sigla applied to (e.g. `{"GST":[1,2],"STO":[3,4,5]}` on the "STO"
 * record — the subject was called "GST" in years 1–2 and "STO" from year 3
 * on). Given a historical sigla and the course year the record belongs to,
 * the canonical id is the id of the MATERIA whose evoluzione entry for that
 * sigla contains that year. Returns the original sigla unchanged if no
 * MATERIA declares it (no reconciliation data available).
 */
export function reconcileSigla(siglaStorica: string, annoCorso: number, materie: Materia[]): string {
  for (const materia of materie) {
    const anni = materia.getEvoluzione()[siglaStorica];
    if (anni !== undefined && anni.includes(annoCorso)) {
      return materia.id ?? siglaStorica;
    }
  }
  return siglaStorica;
}
