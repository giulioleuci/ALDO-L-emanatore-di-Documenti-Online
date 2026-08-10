import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions, type BuildParams, type Recipe } from '../../../../src/application/context-engine/Recipe';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { PianiProvider } from '../../../../src/application/context-engine/providers/PianiProvider';
import { PianoFocusProvider } from '../../../../src/application/context-engine/providers/PianoFocusProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import { PipelineError } from '../../../../src/domain/errors/DomainError';
import { TipoPiano } from '../../../../src/domain/value-objects/enums';
import { tipoPianoLabel } from '../../../../src/application/context-engine/mappers/labels';

function build(pianoTipo: TipoPiano) {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const builder = new ContextBuilder()
    .registerProvider('class', new ClasseProvider(classi, alunni))
    .registerProvider(
      'student',
      new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db))
    )
    .registerProvider('piani', new PianiProvider(alunni))
    .registerProvider('pianoFocus', new PianoFocusProvider());
  const params: BuildParams = {
    target: 'a1@school.it',
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z'),
    pianoTipo
  };
  const recipe: Recipe = {
    providers: ['class', 'student', 'piani', 'pianoFocus'],
    options: makeOptions()
  };
  return builder.build(params, recipe);
}

test('exposes the selected student plan as serializable focus.piano data', () => {
  const cdu = build(TipoPiano.PEI);

  expect(cdu.focus.piano).toEqual({
    tipo: TipoPiano.PEI,
    tipoLabel: 'PEI',
    isBes: true,
    parametriGenerazione: { gravita: 'media' }
  });
  expect(JSON.stringify(cdu)).toContain('"piano"');
  expect(JSON.stringify(cdu)).not.toContain('"entita"');
});

test.each([
  [TipoPiano.PDP_DSA, 'PDP (DSA)'],
  [TipoPiano.PDP_BES, 'PDP (BES)'],
  [TipoPiano.PDP_STRANIERI, 'PDP (STRANIERI)'],
  [TipoPiano.PEI, 'PEI'],
  [TipoPiano.PFP, 'PFP']
])('returns the approved readable label for %s', (tipo, expectedLabel) => {
  expect(tipoPianoLabel(tipo)).toBe(expectedLabel);
});

test('throws PipelineError when the selected plan belongs to another student', () => {
  const cdu = build(TipoPiano.PEI);

  expect(() =>
    new PianoFocusProvider().provide(
      cdu,
      {
        target: 'a1@school.it',
        tipoTarget: 'alunno',
        now: new Date('2026-07-01T09:00:00Z'),
        pianoTipo: TipoPiano.PDP_DSA
      },
      makeOptions()
    )
  ).toThrow(PipelineError);
});
