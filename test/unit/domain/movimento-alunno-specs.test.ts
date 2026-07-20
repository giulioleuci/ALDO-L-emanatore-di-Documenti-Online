import {
  MovimentiPerAlunnoSpec,
  MovimentiPerTipoSpec
} from '../../../src/domain/specifications/MovimentoAlunnoSpecs';
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { Email } from '../../../src/domain/value-objects/Email';
import { TipoMovimento } from '../../../src/domain/value-objects/enums';
import { COL_MOV_ALUNNI } from '../../../src/config/schema';

function movimento(overrides: Record<string, unknown> = {}): MovimentoAlunno {
  return new MovimentoAlunno({
    [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it',
    [COL_MOV_ALUNNI.TIPO]: TipoMovimento.IN,
    [COL_MOV_ALUNNI.DATA]: '2026-01-01',
    ...overrides
  });
}

describe('MovimentiPerAlunnoSpec', () => {
  test('isSatisfiedBy true when STUDENTE matches', () => {
    expect(new MovimentiPerAlunnoSpec(Email.of('a1@school.it')).isSatisfiedBy(movimento())).toBe(
      true
    );
  });

  test('isSatisfiedBy false for a different student', () => {
    const spec = new MovimentiPerAlunnoSpec(Email.of('a1@school.it'));
    expect(spec.isSatisfiedBy(movimento({ [COL_MOV_ALUNNI.STUDENTE]: 'a2@school.it' }))).toBe(
      false
    );
  });

  test('toQueryObject pushes down STUDENTE filter', () => {
    expect(new MovimentiPerAlunnoSpec(Email.of('a1@school.it')).toQueryObject()).toEqual({
      [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it'
    });
  });
});

describe('MovimentiPerTipoSpec', () => {
  test('isSatisfiedBy true when TIPO matches', () => {
    expect(new MovimentiPerTipoSpec(TipoMovimento.IN).isSatisfiedBy(movimento())).toBe(true);
  });

  test('isSatisfiedBy false for a different tipo', () => {
    const spec = new MovimentiPerTipoSpec(TipoMovimento.OUT);
    expect(spec.isSatisfiedBy(movimento())).toBe(false);
    expect(spec.isSatisfiedBy(movimento({ [COL_MOV_ALUNNI.TIPO]: TipoMovimento.CAMBIO }))).toBe(
      false
    );
    expect(spec.isSatisfiedBy(movimento({ [COL_MOV_ALUNNI.TIPO]: TipoMovimento.OUT }))).toBe(true);
  });

  test('toQueryObject pushes down TIPO filter', () => {
    expect(new MovimentiPerTipoSpec(TipoMovimento.CAMBIO).toQueryObject()).toEqual({
      [COL_MOV_ALUNNI.TIPO]: TipoMovimento.CAMBIO
    });
  });
});
