import type { SubjectVM } from './subjectVmMapper';

export interface MateriaPerPrincipaleVM {
  idFittizio: string;
  nome: string;
  materie: SubjectVM[];
}

function baseSigla(sigla: string): string {
  const dot = sigla.indexOf('.');
  return dot === -1 ? sigla : sigla.slice(0, dot);
}

/**
 * Groups `focus.classe.materie[]` by base subject id (02 §2.8): a specificità
 * row's composite id `BASE.SPECIFICA` (MATERIE catalog convention, see
 * `IMateriaRepository.findSpecifiche`) collapses to its base group; a plain
 * subject stays a single-item group under its own id.
 */
export function buildMateriePerPrincipale(
  materie: SubjectVM[]
): MateriaPerPrincipaleVM[] {
  const byBase = new Map<string, SubjectVM[]>();
  for (const materia of materie) {
    const idFittizio = baseSigla(materia.sigla);
    const group = byBase.get(idFittizio) ?? [];
    group.push(materia);
    byBase.set(idFittizio, group);
  }
  return Array.from(byBase.entries()).map(([idFittizio, group]) => {
    const isComposite = group.length > 1 || group[0]!.sigla !== idFittizio;
    const nome = isComposite ? (group[0]!.principale ?? idFittizio) : group[0]!.nome;
    return { idFittizio, nome, materie: group };
  });
}
