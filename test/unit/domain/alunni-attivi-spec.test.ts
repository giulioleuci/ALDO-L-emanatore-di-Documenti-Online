import { AlunniAttiviSpec } from '../../../src/domain/specifications/AlunniAttiviSpec';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { COL_ALUNNI } from '../../../src/config/schema';

test('isSatisfiedBy true only for active entities (repository fallback)', () => {
  const spec = new AlunniAttiviSpec();
  expect(spec.isSatisfiedBy(Alunno.fromData({ [COL_ALUNNI.ATTIVO]: true }))).toBe(true);
  expect(spec.isSatisfiedBy(Alunno.fromData({ [COL_ALUNNI.ATTIVO]: false }))).toBe(false);
});

test('toQueryObject pushes filter to DB layer (07)', () => {
  expect(new AlunniAttiviSpec().toQueryObject()).toEqual({ ATTIVO: true });
});
