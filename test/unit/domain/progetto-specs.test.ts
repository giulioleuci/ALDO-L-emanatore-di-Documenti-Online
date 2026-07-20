import {
  ProgettiPerClasseSpec,
  ProgettiPerTipoSpec
} from '../../../src/domain/specifications/ProgettoSpecs';
import { Progetto } from '../../../src/domain/entities/Progetto';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { TipoProgetto } from '../../../src/domain/value-objects/enums';
import { COL_PROGETTI } from '../../../src/config/schema';

function progetto(overrides: Record<string, unknown> = {}): Progetto {
  return new Progetto({
    [COL_PROGETTI.CLASSE]: '5A',
    [COL_PROGETTI.TIPO]: TipoProgetto.ASL,
    [COL_PROGETTI.NOME]: 'Stage aziendale',
    ...overrides
  });
}

describe('ProgettiPerClasseSpec', () => {
  test('isSatisfiedBy true when CLASSE matches', () => {
    expect(new ProgettiPerClasseSpec(ClasseId.of('5A')).isSatisfiedBy(progetto())).toBe(true);
  });

  test('isSatisfiedBy false for a different class', () => {
    const spec = new ProgettiPerClasseSpec(ClasseId.of('5A'));
    expect(spec.isSatisfiedBy(progetto({ [COL_PROGETTI.CLASSE]: '1F' }))).toBe(false);
  });

  test('toQueryObject pushes down CLASSE filter', () => {
    expect(new ProgettiPerClasseSpec(ClasseId.of('5A')).toQueryObject()).toEqual({
      [COL_PROGETTI.CLASSE]: '5A'
    });
  });
});

describe('ProgettiPerTipoSpec', () => {
  test('isSatisfiedBy true when TIPO matches', () => {
    expect(new ProgettiPerTipoSpec(TipoProgetto.ASL).isSatisfiedBy(progetto())).toBe(true);
  });

  test('isSatisfiedBy false for a different tipo', () => {
    const spec = new ProgettiPerTipoSpec(TipoProgetto.ORIENTAMENTO);
    expect(spec.isSatisfiedBy(progetto())).toBe(false);
    expect(
      spec.isSatisfiedBy(progetto({ [COL_PROGETTI.TIPO]: TipoProgetto.ORIENTAMENTO }))
    ).toBe(true);
  });

  test('toQueryObject pushes down TIPO filter', () => {
    expect(new ProgettiPerTipoSpec(TipoProgetto.ALTRO).toQueryObject()).toEqual({
      [COL_PROGETTI.TIPO]: TipoProgetto.ALTRO
    });
  });
});
