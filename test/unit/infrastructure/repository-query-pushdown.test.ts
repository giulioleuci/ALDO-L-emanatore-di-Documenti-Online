import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

// REPORT_GLF.md B1/A1: verifies repositories actually take the DomainRepositoryLib
// query-pushdown path via `this.find(spec)` (select().from().where().execute()),
// not merely that results happen to be correct via the in-memory fallback.
test('CarenzaRepository.findByAlunno pushes the STUDENTE filter down through select()', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new CarenzaRepository(db);

  const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });
  const result = repo.findByAlunno(a1);

  expect(selectSpy).toHaveBeenCalled();
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((c) => c.studente === 'a1@school.it')).toBe(true);
});

test('DocenteRepository.findITP pushes the ITP=true filter down through select()', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new DocenteRepository(db);

  const result = repo.findITP();

  expect(selectSpy).toHaveBeenCalled();
  expect(result.every((d) => d.isITP())).toBe(true);
});

test('CarenzaRepository.findNonNotificate (toQueryObject() null) falls back to in-memory filtering', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new CarenzaRepository(db);

  repo.findNonNotificate();

  // No equality criteria available; QueryTranslator.validate() must reject this
  // spec so Repository.find() takes the getAllRows()+isSatisfiedBy() fallback.
  expect(selectSpy).not.toHaveBeenCalled();
});
