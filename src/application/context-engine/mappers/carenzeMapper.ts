import type { Carenza } from '../../../domain/entities/Carenza';
import type { Alunno } from '../../../domain/entities/Alunno';

/**
 * Flattens the CARENZE matrix rows into the simple `{ materia, voto }` list the
 * CDU exposes (02 §4.1/§4.2). For each subject column with a non-empty cell it
 * emits the sigla and the raw cell value as text (a numeric mark or free text).
 * The rich renderer form (colours/symbols) is the box-renderer's CarenzeMapper
 * (09 §6, 11) — not needed for the CDU access paths.
 */
export function carenzeDettaglioSemplice(
  carenze: Carenza[],
  sigle: string[]
): Array<{ materia: string; voto: string }> {
  const out: Array<{ materia: string; voto: string }> = [];
  for (const carenza of carenze) {
    for (const sigla of sigle) {
      const cella = carenza.getCella(sigla);
      if (typeof cella !== 'string' && typeof cella !== 'number' && typeof cella !== 'boolean')
        continue;
      const voto = String(cella).trim();
      if (voto === '') continue;
      out.push({ materia: sigla, voto });
    }
  }
  return out;
}

/** Student CURRICULUM as the CDU `{ "[MateriaId]": { specifiche } }` record (02 §4.2). */
export function curriculumRecord(alunno: Alunno): Record<string, { specifiche: string[] }> {
  const rec: Record<string, { specifiche: string[] }> = {};
  for (const [materia, specifiche] of alunno.getCurriculum()) {
    rec[materia.value] = { specifiche };
  }
  return rec;
}
