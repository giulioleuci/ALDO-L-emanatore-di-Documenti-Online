import { ClasseMateriaFocusProvider } from '../../../../../src/application/context-engine/providers/ClasseMateriaFocusProvider';
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
            materie: [{ sigla: 'MATE', nome: 'Matematica' } as never]
          },
          {
            anagrafica: { email: 'bianchi@scuola.it', nomeCompleto: 'Anna Bianchi' } as never,
            materie: [{ sigla: 'MATE', nome: 'Matematica' } as never]
          }
        ]
      } as never
    },
    tech: {} as never
  };
}

describe('ClasseMateriaFocusProvider', () => {
  it('sets the requested materia and all its council teachers', () => {
    const cdu = cduWithConsiglio();

    new ClasseMateriaFocusProvider().provide(cdu, { materiaCorrente: 'MATE' } as never);

    expect(cdu.focus.materia).toEqual({ sigla: 'MATE', nome: 'Matematica' });
    expect(cdu.focus.classiMateria?.docenti).toEqual([
      { email: 'rossi@scuola.it', nomeCompleto: 'Mario Rossi' },
      { email: 'bianchi@scuola.it', nomeCompleto: 'Anna Bianchi' }
    ]);
  });

  it('throws PipelineError when the materia is absent from the council', () => {
    expect(() =>
      new ClasseMateriaFocusProvider().provide(cduWithConsiglio(), {
        materiaCorrente: 'ITA'
      } as never)
    ).toThrow(PipelineError);
  });
});
