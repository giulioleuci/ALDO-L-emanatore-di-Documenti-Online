import { AlberoCartelle } from '../../../src/infrastructure/services/AlberoCartelle';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

function wire() {
  const drive = new FakeDriveFacade();
  const db = new FakeDatabase(fixtureTables());
  return { drive, db, albero: new AlberoCartelle(drive, db) };
}

test('creates a new folder and registers it in LOG_FOLD (14 §4)', () => {
  const { drive, db, albero } = wire();
  const res = albero.findOrCreate('Verbali/5', { classe: '5A' });
  expect(res.created).toBe(true);
  expect(drive.folders.get('Verbali/5')).toBe(res.folderId);
  const row = db.table('LOG_FOLD').find((r) => r.ID === res.folderId);
  expect(row?.PATH).toBe('Verbali/5');
  expect(row?.CLASSI).toBe('5A');
});

test('reuses a folder already recorded in LOG_FOLD without touching Drive (findOrCreate cache)', () => {
  const { drive, db, albero } = wire();
  db.table('LOG_FOLD').insert({
    ID: 'existing_fold',
    PATH: 'Verbali/5',
    LINK: '',
    CLASSI: '5A',
    UTENTI: ''
  });
  const res = albero.findOrCreate('Verbali/5', { classe: '5A' });
  expect(res).toEqual({ folderId: 'existing_fold', created: false });
  expect(drive.folders.size).toBe(0); // never created on Drive
});

test('reuses a folder that exists on Drive but is not in LOG_FOLD, without a duplicate row', () => {
  const { drive, db, albero } = wire();
  const existing = drive.createFolder('Verbali/5');
  const res = albero.findOrCreate('Verbali/5', { classe: '5A' });
  expect(res).toEqual({ folderId: existing, created: false });
  expect(db.table('LOG_FOLD').findAll()).toHaveLength(0);
});

test('a LOG_FOLD row for the same path but a different classe does not match (per-classe scoping)', () => {
  const { db, albero } = wire();
  db.table('LOG_FOLD').insert({
    ID: 'other',
    PATH: 'Verbali/5',
    LINK: '',
    CLASSI: '3B',
    UTENTI: ''
  });
  const res = albero.findOrCreate('Verbali/5', { classe: '5A' });
  expect(res.created).toBe(true);
  expect(res.folderId).not.toBe('other');
});
