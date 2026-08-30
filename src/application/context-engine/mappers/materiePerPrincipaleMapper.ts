import type { MateriaVM, MateriePerPrincipaleVM } from '../Cdu';
import { elencoVm } from './elencoVm';

function principaleId(sigla: string): string {
  const dot = sigla.indexOf('.');
  return dot === -1 ? sigla : sigla.slice(0, dot);
}

export function buildMateriePerPrincipale(materie: MateriaVM[]): MateriePerPrincipaleVM {
  const gruppi = new Map<string, MateriaVM[]>();
  for (const materia of materie) {
    const id = principaleId(materia.sigla);
    gruppi.set(id, [...(gruppi.get(id) ?? []), materia]);
  }
  const elenco = Array.from(gruppi.entries())
    .map(([id, gruppo]) => {
      const ordinate = [...gruppo].sort((a, b) => a.nome.localeCompare(b.nome));
      return {
        principaleId: id,
        nome: ordinate[0]!.principale ?? ordinate[0]!.nome,
        materie: ordinate,
        hasMaterie: true,
        numero: ordinate.length,
        materieDescrizione: ordinate.map((materia) => materia.nome).join(', ')
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return elencoVm(elenco);
}
