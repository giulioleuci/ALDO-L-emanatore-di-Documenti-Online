import {
  VariazioniPerClasseSpec,
  VariazioniPerMateriaSpec,
  VariazioniPerNuovoTitolareSpec
} from '../../../src/domain/specifications/VariazioneCattedraSpecs';
import { VariazioneCattedra } from '../../../src/domain/entities/VariazioneCattedra';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Email } from '../../../src/domain/value-objects/Email';
import { COL_VARIAZIONI } from '../../../src/config/schema';

function variazione(overrides: Record<string, unknown> = {}): VariazioneCattedra {
  return new VariazioneCattedra({
    [COL_VARIAZIONI.CLASSE_ID]: '5A,1F',
    [COL_VARIAZIONI.MATERIA_ID]: 'MATE,FISI',
    [COL_VARIAZIONI.VECCHIO_TITOLARE]: 'old@school.it',
    [COL_VARIAZIONI.NUOVO_TITOLARE]: 'new@school.it',
    [COL_VARIAZIONI.DATA_DECORRENZA]: '2026-01-01',
    ...overrides
  });
}

describe('VariazioniPerClasseSpec', () => {
  test('isSatisfiedBy true when CLASSE_ID CSV contains the class', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('5A')).isSatisfiedBy(variazione())).toBe(true);
  });

  test('isSatisfiedBy false when the class is absent from the CSV', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('2B')).isSatisfiedBy(variazione())).toBe(false);
  });

  test('isSatisfiedBy true for any class when CLASSE_ID is wildcard', () => {
    const v = variazione({ [COL_VARIAZIONI.CLASSE_ID]: '*' });
    expect(new VariazioniPerClasseSpec(ClasseId.of('9Z')).isSatisfiedBy(v)).toBe(true);
  });

  test('toQueryObject is null: CSV containment, not pushdown-eligible', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('5A')).toQueryObject()).toBeNull();
  });
});

describe('VariazioniPerMateriaSpec', () => {
  test('isSatisfiedBy true when MATERIA_ID CSV contains the subject', () => {
    expect(new VariazioniPerMateriaSpec(MateriaId.of('MATE')).isSatisfiedBy(variazione())).toBe(
      true
    );
  });

  test('isSatisfiedBy false when the subject is absent from the CSV', () => {
    expect(new VariazioniPerMateriaSpec(MateriaId.of('STOR')).isSatisfiedBy(variazione())).toBe(
      false
    );
  });

  test('isSatisfiedBy true for any subject when MATERIA_ID is wildcard', () => {
    const v = variazione({ [COL_VARIAZIONI.MATERIA_ID]: '*' });
    expect(new VariazioniPerMateriaSpec(MateriaId.of('STOR')).isSatisfiedBy(v)).toBe(true);
  });

  test('toQueryObject is null: CSV containment, not pushdown-eligible', () => {
    expect(new VariazioniPerMateriaSpec(MateriaId.of('MATE')).toQueryObject()).toBeNull();
  });
});

describe('VariazioniPerNuovoTitolareSpec', () => {
  test('isSatisfiedBy true when NUOVO_TITOLARE matches', () => {
    expect(
      new VariazioniPerNuovoTitolareSpec(Email.of('new@school.it')).isSatisfiedBy(variazione())
    ).toBe(true);
  });

  test('isSatisfiedBy false for a different titolare', () => {
    expect(
      new VariazioniPerNuovoTitolareSpec(Email.of('other@school.it')).isSatisfiedBy(variazione())
    ).toBe(false);
  });

  test('toQueryObject pushes down NUOVO_TITOLARE filter (plain equality)', () => {
    expect(new VariazioniPerNuovoTitolareSpec(Email.of('new@school.it')).toQueryObject()).toEqual({
      [COL_VARIAZIONI.NUOVO_TITOLARE]: 'new@school.it'
    });
  });
});
