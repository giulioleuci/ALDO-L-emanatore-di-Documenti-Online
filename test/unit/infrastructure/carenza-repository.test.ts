import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { Classe } from '../../../src/domain/entities/Classe';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { AnnoScolastico } from '../../../src/domain/value-objects/AnnoScolastico';

function repo(): CarenzaRepository {
  return new CarenzaRepository(new FakeDatabase(fixtureTables()));
}
const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });
const classe5A = Classe.fromData({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO' });

test('findByAlunno sorts DATA DESC; annoScolastico filter keeps in-range rows', () => {
  expect(
    repo()
      .findByAlunno(a1)
      .map((c) => c.progressivo)
  ).toEqual([2, 1]);
  const inAnno = repo().findByAlunno(a1, { annoScolastico: AnnoScolastico.of('2025-2026') });
  expect(inAnno.map((c) => c.progressivo)).toEqual([2, 1]);
  const otherAnno = repo().findByAlunno(a1, { annoScolastico: AnnoScolastico.of('2023-2024') });
  expect(otherAnno).toEqual([]);
});

test('findByClasse with and without exact-date filter', () => {
  expect(repo().findByClasse(classe5A).length).toBe(3);
  const onDate = repo().findByClasse(classe5A, new Date('2026-02-15'));
  expect(onDate.map((c) => c.studente)).toEqual(['a1@school.it']);
});

test('findNonNotificate returns rows with empty NOTIFICATO', () => {
  const ids = repo()
    .findNonNotificate()
    .map((c) => c.id)
    .sort();
  expect(ids).toEqual(['a1@school.it::1', 'a2@school.it::1']);
});
