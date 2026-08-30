import type { AlunnoVM, PersonaRiferimentoVM, SpecificitaAlunniVM } from '../Cdu';

export function buildPerSpecificita(studenti: AlunnoVM[]): SpecificitaAlunniVM[] {
  const materie = new Map<
    string,
    {
      materiaSigla: string;
      materiaNome: string;
      materiaNomeSintetico: string;
      specifiche: Map<string, PersonaRiferimentoVM[]>;
    }
  >();
  for (const studente of studenti) {
    for (const curriculum of studente.curriculum) {
      const materia = materie.get(curriculum.materiaId) ?? {
        materiaSigla: curriculum.materiaSigla,
        materiaNome: curriculum.materiaNome,
        materiaNomeSintetico: curriculum.materiaNomeSintetico,
        specifiche: new Map<string, PersonaRiferimentoVM[]>()
      };
      for (const specifica of curriculum.specifiche) {
        materia.specifiche.set(specifica.nome, [
          ...(materia.specifiche.get(specifica.nome) ?? []),
          { nomeCompleto: studente.nomeCompleto, email: studente.email }
        ]);
      }
      materie.set(curriculum.materiaId, materia);
    }
  }
  return Array.from(materie.entries())
    .map(([materiaId, materia]) => ({
      materiaId,
      materiaSigla: materia.materiaSigla,
      materiaNome: materia.materiaNome,
      materiaNomeSintetico: materia.materiaNomeSintetico,
      specifiche: Array.from(materia.specifiche.entries())
        .map(([nome, alunni]) => {
          const ordinati = Array.from(
            new Map(
              alunni.map((alunno) => [
                alunno.email || alunno.nomeCompleto.trim().toLocaleLowerCase('it-IT'),
                alunno
              ])
            ).values()
          ).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
          return {
            nome,
            nomeCapitalizzato:
              nome === '' ? '' : nome[0]!.toLocaleUpperCase('it-IT') + nome.slice(1),
            alunni: ordinati,
            hasAlunni: ordinati.length > 0,
            numero: ordinati.length,
            alunniDescrizione: ordinati.map((alunno) => alunno.nomeCompleto).join(', ')
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      hasSpecifiche: materia.specifiche.size > 0
    }))
    .sort((a, b) => a.materiaNome.localeCompare(b.materiaNome));
}
