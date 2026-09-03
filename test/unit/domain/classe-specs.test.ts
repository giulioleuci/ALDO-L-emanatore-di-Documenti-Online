import {
  ClassiAttiveSpec,
  ClassiPerAnnoSpec,
  ClassiPerIndirizzoSpec,
  ClassiArticolateSpec
} from '../../../src/domain/specifications/ClasseSpecs';
import { Classe } from '../../../src/domain/entities/Classe';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';
import { COL_CLASSI } from '../../../src/config/schema';

function classe(): Classe {
  return new Classe({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO' });
}

describe('ClassiAttiveSpec', () => {
  test('is a GLF Specification instance (type alignment, no behavior change)', () => {
    const spec = new ClassiAttiveSpec();
    // Ambient GLF global (types/gaslibs/index.d.ts), loaded by test/setup/load-gaslibs.cjs.
    expect(spec).toBeInstanceOf(Specification);
  });

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

describe('specification composition (Task 8: and()/or()/not() via GLF Specification)', () => {
  test('and() composes two ALDO specs; isSatisfiedBy matches only entities satisfying both legs', () => {
    const composed = new ClassiAttiveSpec().and(new ClassiPerAnnoSpec(5));

    const attivaAnno5 = classe(); // anno 5 (helper default)
    attivaAnno5.setDynamicColumn(COL_CLASSI.ATTIVA, true);
    expect(composed.isSatisfiedBy(attivaAnno5)).toBe(true); // both legs satisfied

    const inattivaAnno5 = classe(); // ATTIVA left absent/false
    expect(composed.isSatisfiedBy(inattivaAnno5)).toBe(false); // fails the ATTIVA leg

    const attivaAnno1 = new Classe({ ID: '1A', ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    attivaAnno1.setDynamicColumn(COL_CLASSI.ATTIVA, true);
    expect(composed.isSatisfiedBy(attivaAnno1)).toBe(false); // fails the anno leg

    // The object and()/or()/not() return is GLF's own CompositeSpecification
    // (vendor/gaslibs.Code.js), NOT an instance of ALDO's local `Specification`
    // base class — it has no `toQueryObject` of its own (only isSatisfiedBy /
    // toQuery / canBeTranslatedToQuery). DomainRepositoryLib's
    // `Repository.find()` only takes the query-pushdown path when
    // `QueryTranslator._hasQueryObjectCriteria()` is true (a live, non-null
    // `toQueryObject()`) or `canBeTranslatedToQuery()` is true.
    // `CompositeSpecification.canBeTranslatedToQuery()` in turn requires every
    // composed child's own `canBeTranslatedToQuery()` to be true — and ALDO's
    // concrete specs never implement `toQuery`/`canBeTranslatedToQuery` (they
    // only implement `toQueryObject`, ALDO's own pushdown hook), so both
    // checks come back false/undefined for a composed spec. `validate()`
    // therefore reports invalid and `Repository.find()` falls back to
    // hydrating every row and filtering in-memory with
    // `specification.isSatisfiedBy(entity)` — exactly the path exercised
    // above. This is intentional, not a bug: composed specs "just work"
    // against `Repository.find()` precisely because they fail pushdown and
    // CompositeSpecification inherits the base null fast path and therefore
    // falls back to its existing query-builder translation contract.
    expect(composed.toQueryObject()).toBeNull();
  });
});
