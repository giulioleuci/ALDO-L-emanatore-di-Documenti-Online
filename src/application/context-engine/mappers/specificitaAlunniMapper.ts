import type { AlunnoContestoVM } from '../Cdu';

interface PersonMinVM {
  nome: string | null;
  cognome: string | null;
  nomeCompleto: string;
  email: string;
}

export interface SpecificitaAlunniVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  specifiche: Array<{ nome: string; alunni: PersonMinVM[] }>;
}

/**
 * Groups every student's curriculum specifiche into a 3-level array
 * (materia → specifica → alunni), replacing the old double-map
 * `perSpecificita["[MateriaId]"]["[specifica]"]` (02 §2.14, §8.9).
 * `AlunnoContestoVM.anagrafica` only carries `nomeCompleto`/`email` (02 §8.7),
 * so `nome`/`cognome` on PersonMinVM are always null here.
 */
export function buildPerSpecificita(studenti: AlunnoContestoVM[]): SpecificitaAlunniVM[] {
  const byMateria = new Map<
    string,
    { materiaSigla: string; materiaNome: string; bySpecifica: Map<string, PersonMinVM[]> }
  >();

  for (const studente of studenti) {
    for (const curriculum of studente.curriculum) {
      let materiaEntry = byMateria.get(curriculum.materiaId);
      if (materiaEntry === undefined) {
        materiaEntry = {
          materiaSigla: curriculum.materiaSigla,
          materiaNome: curriculum.materiaNome,
          bySpecifica: new Map()
        };
        byMateria.set(curriculum.materiaId, materiaEntry);
      }
      for (const { nome } of curriculum.specifiche) {
        const alunni = materiaEntry.bySpecifica.get(nome) ?? [];
        alunni.push({
          nome: null,
          cognome: null,
          nomeCompleto: studente.anagrafica.nomeCompleto,
          email: studente.anagrafica.email
        });
        materiaEntry.bySpecifica.set(nome, alunni);
      }
    }
  }

  return Array.from(byMateria.entries()).map(([materiaId, entry]) => ({
    materiaId,
    materiaSigla: entry.materiaSigla,
    materiaNome: entry.materiaNome,
    specifiche: Array.from(entry.bySpecifica.entries()).map(([nome, alunni]) => ({ nome, alunni }))
  }));
}
