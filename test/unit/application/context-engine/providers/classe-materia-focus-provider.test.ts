import { ClasseMateriaFocusProvider } from '../../../../../src/application/context-engine/providers/ClasseMateriaFocusProvider';
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
              materie: [{ sigla: 'MATE', nome: 'Matematica' } as never]
            },
            {
              email: 'bianchi@scuola.it',
              nomeCompleto: 'Anna Bianchi',
              materie: [{ sigla: 'MATE', nome: 'Matematica' } as never]
            }
          ]
        }
      } as never
    },
    tech: {} as never
  };
}

describe('ClasseMateriaFocusProvider', () => {
  it('sets the requested materia (from the first council teacher carrying it)', () => {
    const cdu = cduWithConsiglio();

    new ClasseMateriaFocusProvider().provide(cdu, { materiaCorrente: 'MATE' } as never);

    expect(cdu.focus.materia).toEqual({ sigla: 'MATE', nome: 'Matematica' });
  });

  it('throws PipelineError when the materia is absent from the council', () => {
    expect(() =>
      new ClasseMateriaFocusProvider().provide(cduWithConsiglio(), {
        materiaCorrente: 'ITA'
      } as never)
    ).toThrow(PipelineError);
  });
});
