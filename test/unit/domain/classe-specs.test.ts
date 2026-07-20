import {
  ClassiAttiveSpec,
  ClassiPerAnnoSpec,
  ClassiPerIndirizzoSpec,
  ClassiArticolateSpec
} from '../../../src/domain/specifications/ClasseSpecs';
import { Classe } from '../../../src/domain/entities/Classe';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';
import { COL_CLASSI } from '../../../src/config/schema';

function classe(): Classe {
  return Classe.create(ClasseId.of('5A'), AnnoCorso.of(5), 'SCIENTIFICO');
}

describe('ClassiAttiveSpec', () => {
  test('isSatisfiedBy true when ATTIVA dynamic column is true', () => {
    const c = classe();
    c.setDynamicColumn(COL_CLASSI.ATTIVA, true);
    expect(new ClassiAttiveSpec().isSatisfiedBy(c)).toBe(true);
  });

  test('isSatisfiedBy false when ATTIVA is false or absent', () => {
    const c = classe();
    expect(new ClassiAttiveSpec().isSatisfiedBy(c)).toBe(false);
    c.setDynamicColumn(COL_CLASSI.ATTIVA, false);
    expect(new ClassiAttiveSpec().isSatisfiedBy(c)).toBe(false);
  });

  test('toQueryObject pushes down ATTIVA:true', () => {
    expect(new ClassiAttiveSpec().toQueryObject()).toEqual({ [COL_CLASSI.ATTIVA]: true });
  });
});

describe('ClassiPerAnnoSpec', () => {
  test('isSatisfiedBy true for matching anno', () => {
    expect(new ClassiPerAnnoSpec(5).isSatisfiedBy(classe())).toBe(true);
  });

  test('isSatisfiedBy false for a different anno', () => {
    expect(new ClassiPerAnnoSpec(1).isSatisfiedBy(classe())).toBe(false);
  });

  test('toQueryObject is null: not pushdown-eligible (needs numeric coercion)', () => {
    expect(new ClassiPerAnnoSpec(5).toQueryObject()).toBeNull();
  });
});

describe('ClassiPerIndirizzoSpec', () => {
  test('isSatisfiedBy true when INDIRIZZO matches', () => {
    expect(new ClassiPerIndirizzoSpec(IndirizzoId.of('SCIENTIFICO')).isSatisfiedBy(classe())).toBe(
      true
    );
  });

  test('isSatisfiedBy false for a different indirizzo', () => {
    expect(new ClassiPerIndirizzoSpec(IndirizzoId.of('LICEO')).isSatisfiedBy(classe())).toBe(false);
  });

  test('toQueryObject pushes down INDIRIZZO filter', () => {
    expect(new ClassiPerIndirizzoSpec(IndirizzoId.of('SCIENTIFICO')).toQueryObject()).toEqual({
      [COL_CLASSI.INDIRIZZO]: 'SCIENTIFICO'
    });
  });
});

describe('ClassiArticolateSpec', () => {
  test('isSatisfiedBy true when ARTICOLAZIONE is a non-empty string', () => {
    const c = classe();
    c.setDynamicColumn(COL_CLASSI.ARTICOLAZIONE, '{"partners":["1F-LSO"]}');
    expect(new ClassiArticolateSpec().isSatisfiedBy(c)).toBe(true);
  });

  test('isSatisfiedBy false when ARTICOLAZIONE is absent, empty, or whitespace-only', () => {
    const c = classe();
    expect(new ClassiArticolateSpec().isSatisfiedBy(c)).toBe(false);
    c.setDynamicColumn(COL_CLASSI.ARTICOLAZIONE, '');
    expect(new ClassiArticolateSpec().isSatisfiedBy(c)).toBe(false);
    c.setDynamicColumn(COL_CLASSI.ARTICOLAZIONE, '   ');
    expect(new ClassiArticolateSpec().isSatisfiedBy(c)).toBe(false);
  });

  test('toQueryObject is null: non-equality predicate, not pushdown-eligible', () => {
    expect(new ClassiArticolateSpec().toQueryObject()).toBeNull();
  });
});
