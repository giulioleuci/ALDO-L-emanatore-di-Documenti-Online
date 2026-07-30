import {
  VariazioniPerClasseSpec,
  VariazioniPerMateriaSpec,
  VariazioniPerNuovoTitolareSpec,
  VariazioniPerTitolareSpec
} from '../../../src/domain/specifications/VariazioneCattedraSpecs';
import { VariazioneCattedra } from '../../../src/domain/entities/VariazioneCattedra';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Email } from '../../../src/domain/value-objects/Email';
import { COL_VARIAZIONI } from '../../../src/config/schema';

function variazione(overrides: Record<string, unknown> = {}): VariazioneCattedra {
  return new VariazioneCattedra({
    [COL_VARIAZIONI.TITOLARE]: 'old@school.it',
    [COL_VARIAZIONI.NUOVO_TITOLARE]: 'new@school.it',
    [COL_VARIAZIONI.DAL]: '2026-01-01',
    [COL_VARIAZIONI.CLASSI]: '5A,1F',
    [COL_VARIAZIONI.MATERIE]: 'MATE,FISI',
    ...overrides
  });
}

describe('VariazioniPerClasseSpec', () => {
  test('isSatisfiedBy true when CLASSI CSV contains the class', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('5A')).isSatisfiedBy(variazione())).toBe(true);
  });

  test('isSatisfiedBy false when the class is absent from the CSV', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('2B')).isSatisfiedBy(variazione())).toBe(false);
  });

  test('isSatisfiedBy true for any class when CLASSI is wildcard', () => {
    const v = variazione({ [COL_VARIAZIONI.CLASSI]: '*' });
    expect(new VariazioniPerClasseSpec(ClasseId.of('9Z')).isSatisfiedBy(v)).toBe(true);
  });

  test('toQueryObject is null: CSV containment, not pushdown-eligible', () => {
    expect(new VariazioniPerClasseSpec(ClasseId.of('5A')).toQueryObject()).toBeNull();
  });
});

describe('VariazioniPerMateriaSpec', () => {
  test('isSatisfiedBy true when MATERIE CSV contains the subject', () => {
    expect(new VariazioniPerMateriaSpec(MateriaId.of('MATE')).isSatisfiedBy(variazione())).toBe(
      true
    );
  });

  test('isSatisfiedBy false when the subject is absent from the CSV', () => {
    expect(new VariazioniPerMateriaSpec(MateriaId.of('STOR')).isSatisfiedBy(variazione())).toBe(
      false
    );
  });

  test('isSatisfiedBy true for any subject when MATERIE is wildcard', () => {
    const v = variazione({ [COL_VARIAZIONI.MATERIE]: '*' });
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

describe('VariazioniPerTitolareSpec', () => {
  test('isSatisfiedBy true when TITOLARE matches', () => {
    expect(
      new VariazioniPerTitolareSpec(Email.of('old@school.it')).isSatisfiedBy(variazione())
    ).toBe(true);
  });

  test('isSatisfiedBy false for a different titolare', () => {
    expect(
      new VariazioniPerTitolareSpec(Email.of('other@school.it')).isSatisfiedBy(variazione())
    ).toBe(false);
  });

  test('toQueryObject pushes down TITOLARE filter (plain equality)', () => {
    expect(new VariazioniPerTitolareSpec(Email.of('old@school.it')).toQueryObject()).toEqual({
      [COL_VARIAZIONI.TITOLARE]: 'old@school.it'
    });
  });
});
