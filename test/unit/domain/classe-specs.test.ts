import { ClassiAttiveSpec } from '../../../src/domain/specifications/ClasseSpecs';
import { Classe } from '../../../src/domain/entities/Classe';
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

describe('ClassiPerAnnoSpec', () => {});

describe('ClassiPerIndirizzoSpec', () => {});

describe('ClassiArticolateSpec', () => {});

describe('specification composition (Task 8: and()/or()/not() via GLF Specification)', () => {});
