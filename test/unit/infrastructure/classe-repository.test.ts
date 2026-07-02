import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { EntityNotFoundError, ValidationError } from '../../../src/domain/errors/DomainError';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}

test('findById maps CLASSI row to Classe entity', () => {
  const c = repo().findById(ClasseId.of('5A'));
  expect(c?.nome).toBe('5A');
  expect(c?.anno.value).toBe(5);
  expect(c?.indirizzo).toBe('SCIENTIFICO');
});

test('getConsiglioDiClasse derives cattedre from teacher columns (05/06)', () => {
  const cdc = repo().getConsiglioDiClasse(ClasseId.of('5A'));
  const pairs = cdc.cattedre.map((k) => `${k.materia.value}:${k.docente.email.value}`).sort();
  expect(pairs).toEqual(['FISI:bianchi@school.it', 'MATE:rossi@school.it']);
});

test('getAlunniAttivi applies AlunniAttiviSpec', () => {
  const alunni = repo().getAlunniAttivi(ClasseId.of('5A'));
  expect(alunni.map((a) => a.EMAIL)).toEqual(['a1@school.it']);
});

test('findById returns null for unknown class', () => {
  expect(repo().findById(ClasseId.of('9Z'))).toBeNull();
});

test('findById throws on a malformed row missing INDIRIZZO (fail loud, no "undefined" coercion)', () => {
  const db = new FakeDatabase({ CLASSI: [{ ID: '2B', ANNO: 2 }] });
  expect(() => new ClasseRepository(db).findById(ClasseId.of('2B'))).toThrow(ValidationError);
});

test('getConsiglioDiClasse throws when a teacher column references an unknown docente', () => {
  const db = new FakeDatabase({
    CLASSI: [{ ID: '1A', ANNO: 1, INDIRIZZO: 'X', MATE: 'ghost@school.it' }],
    MATERIE: [{ ID: 'MATE', SINTESI: 'Mate' }],
    DOCENTI: [],
    ALUNNI: []
  });
  expect(() => new ClasseRepository(db).getConsiglioDiClasse(ClasseId.of('1A'))).toThrow(
    EntityNotFoundError
  );
});
