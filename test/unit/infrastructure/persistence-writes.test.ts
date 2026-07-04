import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

const rossi = Docente.fromData({ EMAIL: 'rossi@school.it' });
const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it' });

test('ClasseRepository.setCoordinatori persists COORD via the table seam (06 §3)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new ClasseRepository(db);
  const c5a = r.findById(ClasseId.of('5A'))!;
  r.setCoordinatori(c5a, [rossi, bianchi]);
  // Re-read through a fresh repository: the row was updated in place.
  const reread = new ClasseRepository(db);
  expect(reread.getCoordinatori(reread.findById(ClasseId.of('5A'))!).map((d) => d.id))
    .toEqual(['rossi@school.it', 'bianchi@school.it']);
  expect(db.saved).toBeGreaterThan(0);
});

test('setDocentiRuolo sets and removes RUOLI keys; getDocentiCDC unaffected', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new ClasseRepository(db);
  const c5a = r.findById(ClasseId.of('5A'))!;
  r.setDocentiRuolo(c5a, 'SEGRETARIO', [bianchi]);
  expect(r.getRuolo(r.findById(ClasseId.of('5A'))!, 'SEGRETARIO')!.id).toBe('bianchi@school.it');
  r.setDocentiRuolo(r.findById(ClasseId.of('5A'))!, 'SEGRETARIO', []);
  expect(r.getRuolo(r.findById(ClasseId.of('5A'))!, 'SEGRETARIO')).toBeNull();
  // Cattedra columns (dynamic) survive the RUOLI write (not dropped by the update).
  expect(r.getDocentiPerMateria(r.findById(ClasseId.of('5A'))!, MateriaId.of('MATE')).map((d) => d.id))
    .toEqual(['rossi@school.it']);
});

test('creaSupplenza appends when valid and rejects overlapping context (04 §14)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new SupplenzaRepository(db);
  const before = r.findByTitolare(rossi).length;
  const created = r.creaSupplenza(rossi, bianchi, new Date('2026-03-01'), new Date('2026-03-31'), '5A', 'MATE');
  expect(created.supplente).toBe('bianchi@school.it');
  expect(r.findByTitolare(rossi).length).toBe(before + 1);

  // Overlapping period + same class+subject → rejected, no new row.
  expect(() => r.creaSupplenza(rossi, bianchi, new Date('2026-03-15'), new Date('2026-04-10'), '5A', 'MATE'))
    .toThrow(ValidationError);
  expect(r.findByTitolare(rossi).length).toBe(before + 1);

  // Different subject → no overlap, allowed.
  expect(() => r.creaSupplenza(rossi, bianchi, new Date('2026-03-15'), new Date('2026-04-10'), '5A', 'FISI'))
    .not.toThrow();
});
