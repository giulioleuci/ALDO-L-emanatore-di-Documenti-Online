import { buildElencoMaterieConPermessi } from '../../../src/application/context-engine/ElencoMaterieConPermessi';
import type { DocenteCdcVM } from '../../../src/application/context-engine/Cdu';

function docente(materie: Array<{ sigla: string; nome: string }>): DocenteCdcVM {
  return {
    anagrafica: { nome: '', cognome: '', email: '', genere: 'M', appellativo: '' },
    materie: materie.map((m) => ({ ...m, colore: '#fff', specificita: null })),
    ruoli: {
      isCoordinatore: false,
      isTutorAsl: false,
      isTutorOrientamento: false,
      descrizione: []
    },
    stato: { isSupplente: false, sostituisce: null },
    tipoArticolazione: null,
    isITP: false,
    flags: { isNotLast: true }
  };
}

describe('buildElencoMaterieConPermessi (MAT_NON_STANDARD §2.A)', () => {
  test('prepends REL/ALT and sorts the rest alphabetically by sigla', () => {
    const cdc = [
      docente([{ sigla: 'STO', nome: 'Storia' }]),
      docente([{ sigla: 'ITA', nome: 'Italiano' }])
    ];
    const out = buildElencoMaterieConPermessi(cdc, true);
    expect(out.map((c) => c.sigla)).toEqual(['REL/ALT', 'ITA', 'STO']);
    expect(out[0]).toEqual({
      sigla: 'REL/ALT',
      nome: 'Religione/Alternativa',
      isSpecial: true,
      roles: ['IRC', 'ALT'],
      colore: '#E0E0E0'
    });
  });

  test('degrades to REL/["IRC"] when the class has no ALT', () => {
    const out = buildElencoMaterieConPermessi([], false);
    expect(out).toEqual([
      { sigla: 'REL', nome: 'Religione', isSpecial: true, roles: ['IRC'], colore: '#E0E0E0' }
    ]);
  });

  test('dedupes a subject taught by multiple teachers and excludes IRC/ALT sigle defensively', () => {
    const cdc = [
      docente([
        { sigla: 'ITA', nome: 'Italiano' },
        { sigla: 'IRC', nome: 'Religione' }
      ]),
      docente([{ sigla: 'ITA', nome: 'Italiano' }])
    ];
    const out = buildElencoMaterieConPermessi(cdc, false);
    expect(out.map((c) => c.sigla)).toEqual(['REL', 'ITA']);
  });
});
