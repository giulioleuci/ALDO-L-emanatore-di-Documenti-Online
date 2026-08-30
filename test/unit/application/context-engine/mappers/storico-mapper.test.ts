import { buildStoricoAlunnoVm } from '../../../../../src/application/context-engine/mappers/storicoMapper';
import type { AnnoAlunnoStorico } from '../../../../../src/application/storico/StoricoAlunniService';
import { MovimentoAlunno } from '../../../../../src/domain/entities/MovimentoAlunno';
import { COL_MOV_ALUNNI } from '../../../../../src/config/schema';

test('maps history to canonical year, presence, plan, shortfall and failure envelopes', () => {
  const anni: AnnoAlunnoStorico[] = [
    {
      anno: '2024-2025',
      classe: '4A',
      esito: 'NON_PROMOSSO',
      carenze: [{ materiaSigla: 'STO', valore: '4' }],
      piani: ['PDP_DSA'],
      presenteAnnoPrecedente: true,
      annoPrecedenteCalcolato: true,
      presenteTuttoAnno: false,
      movimenti: [
        MovimentoAlunno.fromData({
          [COL_MOV_ALUNNI.STUDENTE]: 'anna@scuola.it',
          [COL_MOV_ALUNNI.TIPO]: 'IN',
          [COL_MOV_ALUNNI.DATA]: '2024-09-01',
          [COL_MOV_ALUNNI.DA]: 'Liceo esterno',
          [COL_MOV_ALUNNI.A]: '4B'
        }),
        MovimentoAlunno.fromData({
          [COL_MOV_ALUNNI.STUDENTE]: 'anna@scuola.it',
          [COL_MOV_ALUNNI.TIPO]: 'CAMBIO',
          [COL_MOV_ALUNNI.DATA]: '2024-10-10',
          [COL_MOV_ALUNNI.DA]: '4B',
          [COL_MOV_ALUNNI.A]: '4A'
        })
      ],
      classiInterne: ['4A', '4B']
    }
  ];
  const vm = buildStoricoAlunnoVm(anni);
  expect(vm).toMatchObject({ hasAnni: true, numeroAnni: 1 });
  expect(vm.anni[0]).toMatchObject({
    annoScolastico: '2024-2025',
    classe: { nome: '4A' },
    esito: 'NON_PROMOSSO',
    esitoLabel: 'Non promosso',
    isPromosso: false,
    isNonPromosso: true,
    hasCarenze: true,
    carenzeDescrizione: 'STO: 4',
    piani: [{ tipo: 'PDP_DSA', tipoLabel: 'PDP (DSA)' }],
    hasPiani: true,
    presenza: {
      annoPrecedente: { isCalcolato: true, isPresente: true },
      isPresenteTuttoAnno: false
    },
    movimenti: {
      elenco: [
        expect.objectContaining({
          tipo: 'CAMBIO',
          data: '2024-10-10',
          provenienza: expect.objectContaining({ classe: { nome: '4B' } }),
          destinazione: expect.objectContaining({ classe: { nome: '4A' } })
        }),
        expect.objectContaining({
          tipo: 'IN',
          data: '2024-09-01',
          provenienza: expect.objectContaining({ scuolaEsterna: 'Liceo esterno' }),
          destinazione: expect.objectContaining({ classe: { nome: '4B' } })
        })
      ],
      hasElenco: true,
      numero: 2
    }
  });
  expect(vm.bocciature).toEqual({
    elenco: [{ annoScolastico: '2024-2025', classe: { nome: '4A' } }],
    hasElenco: true,
    numero: 1,
    elencoDescrizione: '2024-2025 (4A)'
  });
});

test('preserves unavailable previous-year consultation at the oldest historical boundary', () => {
  const vm = buildStoricoAlunnoVm([
    {
      anno: '2023-2024',
      classe: '3A',
      esito: 'SCONOSCIUTO',
      carenze: [],
      piani: [],
      presenteAnnoPrecedente: false,
      annoPrecedenteCalcolato: false,
      presenteTuttoAnno: true,
      movimenti: [],
      classiInterne: ['3A']
    }
  ]);

  expect(vm.anni[0]!.presenza.annoPrecedente).toEqual({
    isCalcolato: false,
    isPresente: false
  });
  expect(vm.anni[0]!.movimenti).toEqual({ elenco: [], hasElenco: false, numero: 0 });
});
