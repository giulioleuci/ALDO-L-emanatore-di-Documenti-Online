import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ValidationError } from '../../../src/domain/errors/DomainError';

const rossi = Docente.fromData({ EMAIL: 'rossi@school.it' });
const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it' });

test('creaSupplenza appends when valid and rejects overlapping context (04 §14)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new SupplenzaRepository(db);
  const before = r.findByTitolare(rossi).length;
  const created = r.creaSupplenza(
    rossi,
    bianchi,
    new Date('2026-03-01'),
    new Date('2026-03-31'),
    '5A',
    'MATE'
  );
  expect(created.supplente).toBe('bianchi@school.it');
  expect(r.findByTitolare(rossi).length).toBe(before + 1);

  // Overlapping period + same class+subject → rejected, no new row.
  expect(() =>
    r.creaSupplenza(rossi, bianchi, new Date('2026-03-15'), new Date('2026-04-10'), '5A', 'MATE')
  ).toThrow(ValidationError);
  expect(r.findByTitolare(rossi).length).toBe(before + 1);

  // Different subject → no overlap, allowed.
  r.creaSupplenza(rossi, bianchi, new Date('2026-03-15'), new Date('2026-04-10'), '5A', 'FISI');
  expect(r.findByTitolare(rossi)).toHaveLength(before + 2);
});
