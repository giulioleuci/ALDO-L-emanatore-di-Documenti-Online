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
  const res = albero.findOrCreate('Verbali/5', {
    classi: '5A',
    tipo: 'CONF_VERBALE',
    nome: '5'
  });
  expect(res.created).toBe(true);
  expect(drive.folders.get('Verbali/5')).toBe(res.folderId);
  const row = db.table('LOG_FOLD').find((r) => r.ID === res.folderId);
  expect(row?.PATH).toBe('Verbali/5');
  expect(row?.TIPO).toBe('CONF_VERBALE');
  expect(row?.NOME).toBe('5');
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
  const res = albero.findOrCreate('Verbali/5', { classi: '5A' });
  expect(res).toEqual({ folderId: 'existing_fold', created: false });
  expect(drive.folders.size).toBe(0); // never created on Drive
});

test('reuses a folder that exists on Drive and records its audit metadata', () => {
  const { drive, db, albero } = wire();
  const existing = drive.createFolder('Verbali/5');
  const res = albero.findOrCreate('Verbali/5', { classi: '5A', tipo: 'CONF_VERBALE' });
  expect(res).toEqual({ folderId: existing, created: false });
  expect(db.table('LOG_FOLD').findAll()).toEqual([
    expect.objectContaining({
      ID: existing,
      TIPO: 'CONF_VERBALE',
      NOME: '5',
      PATH: 'Verbali/5',
      CLASSI: '5A'
    })
  ]);
});

test('repairs incomplete LOG_FOLD metadata and merges a newly associated class', () => {
  const { drive, db, albero } = wire();
  const folderId = drive.createFolder('Verbali/5');
  db.table('LOG_FOLD').insert({
    ID: folderId,
    TIPO: '',
    NOME: '',
    PATH: 'Verbali/5',
    LINK: '',
    CLASSI: '3B',
    UTENTI: ''
  });

  const res = albero.findOrCreate('Verbali/5', {
    classi: '5A',
    tipo: 'CONF_VERBALE',
    nome: '5'
  });

  expect(res).toEqual({ folderId, created: false });
  expect(db.table('LOG_FOLD').find((row) => row.ID === folderId)).toEqual(
    expect.objectContaining({
      TIPO: 'CONF_VERBALE',
      NOME: '5',
      PATH: 'Verbali/5',
      LINK: `https://drive.google.com/drive/folders/${folderId}`,
      CLASSI: '3B,5A'
    })
  );
});

test('reusing a folder merges configured classi utenti and materie', () => {
  const { db, albero } = wire();
  albero.findOrCreate('Output', { classi: '5A', utenti: 'a@school.it', materie: 'MATE' });
  albero.findOrCreate('Output', {
    classi: '5B',
    utenti: 'b@school.it,a@school.it',
    materie: 'FISI,MATE'
  });

  expect(db.table('LOG_FOLD').findAll()).toHaveLength(1);
  expect(db.table('LOG_FOLD').findAll()[0]).toMatchObject({
    CLASSI: '5A,5B',
    UTENTI: 'a@school.it,b@school.it',
    MATERIE: 'MATE,FISI'
  });
});

test('a LOG_FOLD row for the same path is reused and receives the additional class metadata', () => {
  const { db, albero } = wire();
  db.table('LOG_FOLD').insert({
    ID: 'other',
    PATH: 'Verbali/5',
    LINK: '',
    CLASSI: '3B',
    UTENTI: ''
  });
  const res = albero.findOrCreate('Verbali/5', { classi: '5A' });
  expect(res).toEqual({ folderId: 'other', created: false });
  expect(db.table('LOG_FOLD').findAll()[0]).toMatchObject({ CLASSI: '3B,5A' });
});

test('a trashed logged folder is replaced by a fresh one, updating the same LOG_FOLD row (14 §4 trash-aware reconciliation)', () => {
  const { drive, db, albero } = wire();
  const staleId = drive.createFolder('Verbali/5');
  db.table('LOG_FOLD').insert({
    ID: staleId,
    PATH: 'Verbali/5',
    LINK: `https://drive.google.com/drive/folders/${staleId}`,
    CLASSI: '5A',
    UTENTI: ''
  });
  drive.trashedIds.add(staleId);

  const res = albero.findOrCreate('Verbali/5', { classi: '5A', tipo: 'CONF_VERBALE' });

  expect(res.created).toBe(true);
  expect(res.folderId).not.toBe(staleId);
  const rows = db.table('LOG_FOLD').findAll();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    ID: res.folderId,
    PATH: 'Verbali/5',
    LINK: `https://drive.google.com/drive/folders/${res.folderId}`,
    TIPO: 'CONF_VERBALE',
    CLASSI: '5A'
  });
});
