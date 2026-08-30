import type { Alunno } from '../../../domain/entities/Alunno';
import type { Carenza } from '../../../domain/entities/Carenza';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import type { CurriculumVM, ElencoCarenzeVM } from '../Cdu';
import { elencoVm } from './elencoVm';

function capitalizza(value: string): string {
  return value === '' ? '' : value[0]!.toLocaleUpperCase('it-IT') + value.slice(1);
}

export function buildElencoCarenzeVm(
  carenze: Carenza[],
  sigle: string[],
  materie: IMateriaRepository
): ElencoCarenzeVM {
  const elenco = carenze
    .flatMap((carenza) =>
      sigle.flatMap((sigla) => {
        const cella = carenza.getCella(sigla);
        if (
          typeof cella !== 'string' &&
          typeof cella !== 'number' &&
          typeof cella !== 'boolean'
        ) {
          return [];
        }
        const voto = String(cella).trim();
        if (voto === '') return [];
        const materia = materie.findByIdCached(MateriaId.of(sigla));
        const materiaNome = materia?.nome ?? sigla;
        return [{
          materiaSigla: sigla,
          materiaNome,
          materiaNomeSintetico: materia?.sintesi ?? materiaNome,
          voto,
          descrizione: `${materiaNome}: ${voto}`
        }];
      })
    )
    .sort((a, b) =>
      a.materiaNome.localeCompare(b.materiaNome) || a.materiaSigla.localeCompare(b.materiaSigla)
    );
  return { ...elencoVm(elenco), elencoDescrizione: elenco.map((item) => item.descrizione).join(', ') };
}

export function curriculumArray(
  alunno: Alunno,
  materie: IMateriaRepository
): CurriculumVM[] {
  return Array.from(alunno.getCurriculum())
    .map(([materiaId, specifiche]) => {
      const materia = materie.findByIdCached(materiaId);
      const materiaNome = materia?.nome ?? materiaId.value;
      return {
        materiaId: materiaId.value,
        materiaSigla: materia?.id ?? materiaId.value,
        materiaNome,
        materiaNomeSintetico: materia?.sintesi ?? materiaNome,
        specifiche: specifiche
          .map((nome) => ({ nome, nomeCapitalizzato: capitalizza(nome) }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
        hasSpecifiche: specifiche.length > 0,
        specificheDescrizione: [...specifiche].sort((a, b) => a.localeCompare(b)).join(', ')
      };
    })
    .sort((a, b) => a.materiaNome.localeCompare(b.materiaNome));
}
