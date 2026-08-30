import { buildStoricoAlunnoVm } from '../../../../../src/application/context-engine/mappers/storicoMapper';
import type { AnnoAlunnoStorico } from '../../../../../src/application/storico/StoricoAlunniService';

test('maps history to canonical year, presence, plan, shortfall and failure envelopes', () => {
  const anni: AnnoAlunnoStorico[] = [{
    anno: '2024-2025', classe: '4A', esito: 'NON_PROMOSSO',
    carenze: [{ materiaSigla: 'STO', valore: '4' }], piani: ['PDP_DSA'],
    presenteAnnoPrecedente: true, presenteTuttoAnno: false
  }];
  const vm = buildStoricoAlunnoVm(anni);
  expect(vm).toMatchObject({ hasAnni: true, numeroAnni: 1 });
  expect(vm.anni[0]).toMatchObject({
    annoScolastico: '2024-2025', classe: { nome: '4A' }, esito: 'NON_PROMOSSO', esitoLabel: 'Non promosso',
    isPromosso: false, isNonPromosso: true, hasCarenze: true, carenzeDescrizione: 'STO: 4',
    piani: [{ tipo: 'PDP_DSA', tipoLabel: 'PDP (DSA)' }], hasPiani: true,
    presenza: { annoPrecedente: { isCalcolato: true, isPresente: true }, isPresenteTuttoAnno: false }
  });
  expect(vm.bocciature).toEqual({ elenco: [{ annoScolastico: '2024-2025', classe: { nome: '4A' } }], hasElenco: true, numero: 1, elencoDescrizione: '2024-2025 (4A)' });
});
