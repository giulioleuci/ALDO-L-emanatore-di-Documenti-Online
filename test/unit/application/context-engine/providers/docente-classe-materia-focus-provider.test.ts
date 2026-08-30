import { DocenteClasseMateriaFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteClasseMateriaFocusProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';

function cduWithConsiglio(): Cdu {
  return {
    meta: {} as never,
    focus: {
      classe: {
        consiglio: {
          elenco: [
            {
              email: 'rossi@scuola.it',
              nomeCompleto: 'Mario Rossi',
              materie: [{ sigla: 'MAT', nome: 'Matematica' } as never]
            }
          ]
        }
      } as never
    },
    tech: {} as never
  };
}

describe('DocenteClasseMateriaFocusProvider', () => {
  it('sets focus.docente and focus.materia from the matching cattedra', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteClasseMateriaFocusProvider();

    provider.provide(cdu, { docenteCorrente: 'rossi@scuola.it', materiaCorrente: 'MAT' } as never);

    expect(cdu.focus.docente).toEqual({ email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi', materie: expect.any(Array) });
    expect(cdu.focus.materia).toEqual({ sigla: 'MAT', nome: 'Matematica' });
  });

  it('throws PipelineError when the docente is not on the consiglio at all', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteClasseMateriaFocusProvider();

    expect(() =>
      provider.provide(cdu, { docenteCorrente: 'ignoto@scuola.it', materiaCorrente: 'MAT' } as never)
    ).toThrow(PipelineError);
  });

  it('throws PipelineError when the docente is on the consiglio but does not teach the requested materia', () => {
    const cdu = cduWithConsiglio();
    const provider = new DocenteClasseMateriaFocusProvider();

    expect(() =>
      provider.provide(cdu, { docenteCorrente: 'rossi@scuola.it', materiaCorrente: 'ITA' } as never)
    ).toThrow(PipelineError);
  });
});
