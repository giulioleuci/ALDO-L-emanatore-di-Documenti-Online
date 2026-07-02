import { AlunniAttiviSpec } from '../../../src/domain/specifications/AlunniAttiviSpec';
import { COL_ALUNNI } from '../../../src/config/schema';

test('isSatisfiedBy true only for active rows', () => {
  const spec = new AlunniAttiviSpec();
  expect(spec.isSatisfiedBy({ [COL_ALUNNI.ATTIVO]: true })).toBe(true);
  expect(spec.isSatisfiedBy({ [COL_ALUNNI.ATTIVO]: false })).toBe(false);
});

test('toQueryObject pushes filter to DB layer (07)', () => {
  expect(new AlunniAttiviSpec().toQueryObject()).toEqual({ ATTIVO: true });
});
