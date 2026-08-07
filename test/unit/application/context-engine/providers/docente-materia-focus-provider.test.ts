import { DocenteMateriaFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteMateriaFocusProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';

function cduWithConsiglio(): Cdu {
  return {
    meta: { parametriInput: {} } as never,
    focus: {
      classe: {
        consiglioDiClasse: [
          {
            anagrafica: { email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi' } as never,
            materie: [{ sigla: 'MAT', nome: 'Matematica' } as never]
          }
        ]
      } as never
    },
    tech: {} as never
  };
}

describe('DocenteMateriaFocusProvider', () => {
  it('sets focus.docente and focus.materia from the matching cattedra', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteMateriaFocusProvider();

    provider.provide(cdu, { docenteCorrente: 'rossi@scuola.it', materiaCorrente: 'MAT' } as never);

    expect(cdu.focus.docente).toEqual({ email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi' });
    expect(cdu.focus.materia).toEqual({ sigla: 'MAT', nome: 'Matematica' });
  });

  it('throws PipelineError when the docente/materia pair is not found', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteMateriaFocusProvider();

    expect(() =>
      provider.provide(cdu, { docenteCorrente: 'ignoto@scuola.it', materiaCorrente: 'MAT' } as never)
    ).toThrow(PipelineError);
  });
});
