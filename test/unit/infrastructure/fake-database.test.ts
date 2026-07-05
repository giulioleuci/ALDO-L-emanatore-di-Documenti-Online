import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { TABLE, COL_CLASSI } from '../../../src/config/schema';

test('FakeDatabase reads seeded CLASSI rows', () => {
  const db = new FakeDatabase(fixtureTables());
  const rows = db.table(TABLE.CLASSI).findAll();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]![COL_CLASSI.ID]).toBe('5A');
});

test('insert + save accumulates', () => {
  const db = new FakeDatabase(fixtureTables());
  db.table(TABLE.LOG_DOCS).insert({ ID: 'x', STATO: 'GENERATO' });
  db.save();
  expect(db.table(TABLE.LOG_DOCS).find((r) => r.ID === 'x')).not.toBeNull();
});

// Transaction seam mirrors SheetDBLib's DatabaseService semantics.

test('rollback reverts mutations made inside the transaction', () => {
  const db = new FakeDatabase(fixtureTables());
  db.beginTransaction();
  db.table(TABLE.LOG_DOCS).insert({ ID: 'x', STATO: 'GENERATO' });
  db.rollback();
  expect(db.table(TABLE.LOG_DOCS).findAll()).toHaveLength(0);
});

test('commit keeps mutations and counts as a flush', () => {
  const db = new FakeDatabase(fixtureTables());
  db.beginTransaction();
  db.table(TABLE.LOG_DOCS).insert({ ID: 'x', STATO: 'GENERATO' });
  db.commit();
  expect(db.table(TABLE.LOG_DOCS).findAll()).toHaveLength(1);
  expect(db.saved).toBe(1);
});

test('save() during an open transaction throws, like SheetDBLib', () => {
  const db = new FakeDatabase(fixtureTables());
  db.beginTransaction();
  expect(() => db.save()).toThrow(/during a transaction/);
  db.rollback();
});
