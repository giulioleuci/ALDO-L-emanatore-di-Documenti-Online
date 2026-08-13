import { buildStudentStoricoVm } from '../../../../../src/application/context-engine/mappers/storicoMapper';
import type { AnnoAlunnoStorico } from '../../../../../src/application/storico/StoricoAlunniService';

describe('buildStudentStoricoVm', () => {
  it('maps anni, splits piani into primo/secondo anno precedente with tipoLabel, and flags bocciature', () => {
    const anni: AnnoAlunnoStorico[] = [
      {
        anno: '2024-2025',
        classe: '4A-LC',
        esito: 'NON_PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '4' }],
        piani: ['PDP_DSA']
      },
      { anno: '2023-2024', classe: '4A-LC', esito: 'PROMOSSO', carenze: [], piani: [] }
    ];
    const vm = buildStudentStoricoVm(anni);
    expect(vm.anni).toEqual([
      {
        annoScolastico: '2024-2025',
        classe: '4A-LC',
        esito: 'NON_PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '4' }]
      },
      { annoScolastico: '2023-2024', classe: '4A-LC', esito: 'PROMOSSO', carenze: [] }
    ]);
    expect(vm.pianiPrimoAnnoPrecedente).toEqual([{ tipo: 'PDP_DSA', tipoLabel: 'PDP (DSA)' }]);
    expect(vm.pianiSecondoAnnoPrecedente).toEqual([]);
    expect(vm.bocciature).toEqual([{ annoScolastico: '2024-2025', classe: '4A-LC' }]);
    expect(vm.hasBocciature).toBe(true);
  });

  it('returns hasBocciature false and empty piani arrays for an empty history', () => {
    const vm = buildStudentStoricoVm([]);
    expect(vm).toEqual({
      anni: [],
      pianiPrimoAnnoPrecedente: [],
      pianiSecondoAnnoPrecedente: [],
      bocciature: [],
      hasBocciature: false
    });
  });
});
