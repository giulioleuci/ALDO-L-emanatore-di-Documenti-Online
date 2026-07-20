import {
  CarenzePerAlunnoSpec,
  CarenzePerClasseSpec,
  CarenzeNonNotificateSpec
} from '../../../src/domain/specifications/CarenzaSpecs';
import { Carenza } from '../../../src/domain/entities/Carenza';
import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { COL_CARENZE } from '../../../src/config/schema';

function carenza(overrides: Record<string, unknown> = {}): Carenza {
  return new Carenza({
    [COL_CARENZE.STUDENTE]: 'a1@school.it',
    [COL_CARENZE.PROGRESSIVO]: 1,
    [COL_CARENZE.CLASSE]: '5A',
    ...overrides
  });
}

describe('CarenzePerAlunnoSpec', () => {
  test('isSatisfiedBy true when STUDENTE matches', () => {
    const spec = new CarenzePerAlunnoSpec(Email.of('a1@school.it'));
    expect(spec.isSatisfiedBy(carenza())).toBe(true);
  });

  test('isSatisfiedBy false for a different student', () => {
    const spec = new CarenzePerAlunnoSpec(Email.of('a1@school.it'));
    expect(spec.isSatisfiedBy(carenza({ [COL_CARENZE.STUDENTE]: 'a2@school.it' }))).toBe(false);
  });

  test('toQueryObject pushes down STUDENTE filter', () => {
    const spec = new CarenzePerAlunnoSpec(Email.of('a1@school.it'));
    expect(spec.toQueryObject()).toEqual({ [COL_CARENZE.STUDENTE]: 'a1@school.it' });
  });
});

describe('CarenzePerClasseSpec', () => {
  test('isSatisfiedBy true when CLASSE matches', () => {
    const spec = new CarenzePerClasseSpec(ClasseId.of('5A'));
    expect(spec.isSatisfiedBy(carenza())).toBe(true);
  });

  test('isSatisfiedBy false for a different class', () => {
    const spec = new CarenzePerClasseSpec(ClasseId.of('5A'));
    expect(spec.isSatisfiedBy(carenza({ [COL_CARENZE.CLASSE]: '1F' }))).toBe(false);
  });

  test('toQueryObject pushes down CLASSE filter', () => {
    const spec = new CarenzePerClasseSpec(ClasseId.of('5A'));
    expect(spec.toQueryObject()).toEqual({ [COL_CARENZE.CLASSE]: '5A' });
  });
});

describe('CarenzeNonNotificateSpec', () => {
  test('isSatisfiedBy true when NOTIFICATO is empty', () => {
    const spec = new CarenzeNonNotificateSpec();
    expect(spec.isSatisfiedBy(carenza({ [COL_CARENZE.NOTIFICATO]: '' }))).toBe(true);
  });

  test('isSatisfiedBy false once notified', () => {
    const spec = new CarenzeNonNotificateSpec();
    expect(
      spec.isSatisfiedBy(carenza({ [COL_CARENZE.NOTIFICATO]: '2026-01-01T00:00:00.000Z' }))
    ).toBe(false);
  });

  test('toQueryObject is null: in-memory only, not pushdown-eligible', () => {
    expect(new CarenzeNonNotificateSpec().toQueryObject()).toBeNull();
  });
});
