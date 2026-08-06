import type { Carenza } from '../../../domain/entities/Carenza';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { MateriaId } from '../../../domain/value-objects/MateriaId';

/**
 * Flattens the CARENZE matrix rows into the simple `{ materia, voto }` list the
 * CDU exposes (02 §4.1/§4.2). For each subject column with a non-empty cell it
 * emits the sigla and the raw cell value as text (a numeric mark or free text).
 * The rich renderer form (colours/symbols) is the box-renderer's CarenzeMapper
 * (09 §6, 11) — not needed for the CDU access paths.
 */
export function carenzeDettaglioSemplice(
  carenze: Carenza[],
  sigle: string[],
  materie: IMateriaRepository
): Array<{ materia: string; materiaNome: string; voto: string }> {
  const out: Array<{ materia: string; materiaNome: string; voto: string }> = [];
  for (const carenza of carenze) {
    for (const sigla of sigle) {
      const cella = carenza.getCella(sigla);
      if (typeof cella !== 'string' && typeof cella !== 'number' && typeof cella !== 'boolean')
        continue;
      const voto = String(cella).trim();
      if (voto === '') continue;
      const materiaNome = materie.findByIdCached(MateriaId.of(sigla))?.nome ?? sigla;
      out.push({ materia: sigla, materiaNome, voto });
    }
  }
  return out;
}

export interface CurriculumVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  specifiche: Array<{ nome: string }>;
}

/** Student CURRICULUM as an array of CurriculumVM (02 §8.8) — replaces the dynamic-key map. */
export function curriculumArray(alunno: Alunno, materie: IMateriaRepository): CurriculumVM[] {
  const out: CurriculumVM[] = [];
  for (const [materiaId, specifiche] of alunno.getCurriculum()) {
    const materia = materie.findByIdCached(materiaId);
    out.push({
      materiaId: materiaId.value,
      materiaSigla: materia?.id ?? materiaId.value,
      materiaNome: materia?.nome ?? materiaId.value,
      specifiche: specifiche.map((nome) => ({ nome }))
    });
  }
  return out;
}
