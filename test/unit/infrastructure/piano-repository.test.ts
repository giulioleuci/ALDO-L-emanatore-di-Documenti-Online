import { PianoRepository } from '../../../src/infrastructure/repositories/PianoRepository';
import { Piano } from '../../../src/domain/entities/Piano';
import { AlunniBESSpec, PianiPerTipoSpec } from '../../../src/domain/specifications/PianoSpecs';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { Email } from '../../../src/domain/value-objects/Email';
import { TipoPiano } from '../../../src/domain/value-objects/enums';

function repo(): PianoRepository {
  return new PianoRepository(new FakeDatabase(fixtureTables()));
}

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

test('findByAlunno / findByTipo filter the composite-PK table', () => {
  expect(
    repo()
      .findByAlunno(Email.of('a1@school.it'))
      .map((p) => p.tipo)
  ).toEqual(['PEI']);
  expect(
    repo()
      .findByTipo(TipoPiano.PDP_DSA)
      .map((p) => p.studente)
  ).toEqual(['a2@school.it']);
});

test('getStudentiConBESEmails excludes PFP-only students', () => {
  const bes = repo().getStudentiConBESEmails();
  expect(bes.has('a1@school.it')).toBe(true); // PEI
  expect(bes.has('a2@school.it')).toBe(true); // PDP_DSA
  expect(bes.has('a3@school.it')).toBe(false); // PFP only
});

test('AlunniBESSpec (07 §1) driven by the BES email set', () => {
  const bes = repo().getStudentiConBESEmails();
  const spec = AlunniBESSpec.fromPiani(bes);
  expect(spec.isSatisfiedBy(Alunno.fromData({ EMAIL: 'a1@school.it' }))).toBe(true);
  expect(spec.isSatisfiedBy(Alunno.fromData({ EMAIL: 'a3@school.it' }))).toBe(false);
  expect(spec.toQueryObject()).toBeNull();
});

test('PianiPerTipoSpec toQueryObject', () => {
  expect(new PianiPerTipoSpec(TipoPiano.PEI).toQueryObject()).toEqual({ TIPO: 'PEI' });
});
