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
