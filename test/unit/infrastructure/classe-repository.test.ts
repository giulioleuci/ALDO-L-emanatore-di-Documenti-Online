import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';

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
