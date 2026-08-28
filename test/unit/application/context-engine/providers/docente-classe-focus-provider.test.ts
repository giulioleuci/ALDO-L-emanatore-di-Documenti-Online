import { DocenteClasseFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteClasseFocusProvider';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';

function cduWithConsiglio(consiglio: Array<{ email: string }>): Cdu {
  return {
    focus: {
      classe: {
        consiglioDiClasse: consiglio.map((d) => ({
          anagrafica: { email: d.email, nomeCompleto: d.email, genere: 'M' },
          materie: [],
          materieDescrizione: '',
          materieSigle: '',
          ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
          stato: { isSupplente: false, sostituisce: null },
          tipoArticolazione: null,
          gruppoNome: null,
          isITP: false,
          flags: { isNotLast: true }
        }))
      }
    }
  } as unknown as Cdu;
}

describe('DocenteClasseFocusProvider', () => {
  it('sets focus.docente to the matching council member', () => {
    const cdu = cduWithConsiglio([{ email: 'rossi@x.it' }, { email: 'bianchi@x.it' }]);
    new DocenteClasseFocusProvider().provide(cdu, { docenteCorrente: 'bianchi@x.it' } as BuildParams);
    expect(cdu.focus.docente?.email).toBe('bianchi@x.it');
  });

  it('throws PipelineError when the teacher is not on the council', () => {
    const cdu = cduWithConsiglio([{ email: 'rossi@x.it' }]);
    expect(() =>
      new DocenteClasseFocusProvider().provide(cdu, { docenteCorrente: 'assente@x.it' } as BuildParams)
    ).toThrow(PipelineError);
  });
});
