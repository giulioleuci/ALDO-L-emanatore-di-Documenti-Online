import { PianoRepository } from '../../../src/infrastructure/repositories/PianoRepository';
import { Piano } from '../../../src/domain/entities/Piano';
import {} from '../../../src/domain/specifications/PianoSpecs';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { Email } from '../../../src/domain/value-objects/Email';
import { TipoPiano } from '../../../src/domain/value-objects/enums';

test('Piano: composite identity, isBES (PFP excluded), parametri', () => {
  const pei = Piano.fromData({
    STUDENTE: 'a1@school.it',
    TIPO: 'PEI',
    PARAMETRI: '{"gravita":"media"}'
  });
  expect(pei.id).toBe('a1@school.it::PEI');
  expect(pei.isBES()).toBe(true);
  expect(pei.getParametri()).toEqual({ gravita: 'media' });
  expect(Piano.fromData({ STUDENTE: 'a3@school.it', TIPO: 'PFP' }).isBES()).toBe(false);
});

test('Piano.generato: true/false/absent round-trip through toData', () => {
  const base = { STUDENTE: 'a1@school.it', TIPO: 'PEI' };
  expect(Piano.fromData({ ...base, GENERATO: true }).generato).toBe(true);
  expect(Piano.fromData({ ...base, GENERATO: false }).generato).toBe(false);
  expect(Piano.fromData(base).generato).toBe(false);
  expect(Piano.fromData({ ...base, GENERATO: true }).toData()).toMatchObject({ GENERATO: true });
  expect(Piano.fromData(base).toData()).toMatchObject({ GENERATO: false });
});

test('markGenerato flips only the (STUDENTE, TIPO) row, joining an open transaction', () => {
  const db = new FakeDatabase(fixtureTables());
  const piani = new PianoRepository(db);
  db.beginTransaction();
  piani.markGenerato('a1@school.it', TipoPiano.PEI);
  db.rollback();
  expect(piani.findByAlunno(Email.of('a1@school.it'))[0]!.generato).toBe(false);

  db.beginTransaction();
  piani.markGenerato('a1@school.it', TipoPiano.PEI);
  db.commit();
  expect(piani.findByAlunno(Email.of('a1@school.it'))[0]!.generato).toBe(true);
  expect(piani.findByAlunno(Email.of('a2@school.it'))[0]!.generato).toBe(false);
  expect(() => piani.markGenerato('a1@school.it', TipoPiano.PFP)).toThrow('non trovato');
});
