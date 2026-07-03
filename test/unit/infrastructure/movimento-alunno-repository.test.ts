import { MovimentoAlunnoRepository } from '../../../src/infrastructure/repositories/MovimentoAlunnoRepository';
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { TipoMovimento } from '../../../src/domain/value-objects/enums';

function repo(): MovimentoAlunnoRepository {
  return new MovimentoAlunnoRepository(new FakeDatabase(fixtureTables()));
}

test('MovimentoAlunno: composite identity + type predicates', () => {
  const m = MovimentoAlunno.fromData({ STUDENTE: 'a2@school.it', TIPO: 'IN', DATA: '2025-09-15' });
  expect(m.id).toBe('a2@school.it::IN::2025-09-15');
  expect(m.isIngresso()).toBe(true);
  expect(m.isUscita()).toBe(false);
  expect(MovimentoAlunno.fromData({ STUDENTE: 'x', TIPO: 'CAMBIO', DATA: 'd' }).isCambioClasse()).toBe(true);
});

test('findByAlunno sorts by DATA DESC', () => {
  const a2 = Alunno.fromData({ EMAIL: 'a2@school.it' });
  expect(repo().findByAlunno(a2).map((m) => m.tipo)).toEqual(['CAMBIO', 'IN']);
});

test('findByTipo filters by movement type', () => {
  expect(repo().findByTipo(TipoMovimento.OUT).map((m) => m.studente)).toEqual(['a3@school.it']);
});
