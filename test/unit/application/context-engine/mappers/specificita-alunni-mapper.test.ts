import { buildPerSpecificita } from '../../../../../src/application/context-engine/mappers/specificitaAlunniMapper';
import type { AlunnoVM } from '../../../../../src/application/context-engine/Cdu';

const studente = (nomeCompleto: string, email: string): AlunnoVM => ({
  nomeCompleto, email,
  curriculum: [{ materiaId: 'INTERPRET', materiaSigla: 'INTERPRET', materiaNome: 'Esecuzione', materiaNomeSintetico: 'Esecuzione', specifiche: [{ nome: 'chitarra', nomeCapitalizzato: 'Chitarra' }], hasSpecifiche: true, specificheDescrizione: 'chitarra' }]
} as AlunnoVM);

test('groups and sorts students by canonical subject/specificity fields', () => {
  expect(buildPerSpecificita([studente('Neri Marco', 'm@x.it'), studente('Leone Anna', 'a@x.it')])).toEqual([{
    materiaId: 'INTERPRET', materiaSigla: 'INTERPRET', materiaNome: 'Esecuzione', materiaNomeSintetico: 'Esecuzione',
    specifiche: [{ nome: 'chitarra', nomeCapitalizzato: 'Chitarra', alunni: [{ nomeCompleto: 'Leone Anna', email: 'a@x.it' }, { nomeCompleto: 'Neri Marco', email: 'm@x.it' }], hasAlunni: true, numero: 2, alunniDescrizione: 'Leone Anna, Neri Marco' }],
    hasSpecifiche: true
  }]);
});

test('deduplicates people by email inside each specificity', () => {
  const anna = studente('Leone Anna', 'a@x.it');

  expect(buildPerSpecificita([anna, anna])[0]!.specifiche[0]!.alunni).toEqual([
    { nomeCompleto: 'Leone Anna', email: 'a@x.it' }
  ]);
});
