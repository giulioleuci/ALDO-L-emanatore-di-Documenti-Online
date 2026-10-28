import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { Docente } from '../../../src/domain/entities/Docente';
import { DocentiPerDipartimentoSpec } from '../../../src/domain/specifications/DocenteSpecs';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { DipartimentoId } from '../../../src/domain/value-objects/DipartimentoId';
import { Genere } from '../../../src/domain/value-objects/enums';
import { EntityNotFoundError } from '../../../src/domain/errors/DomainError';

function repo(): DocenteRepository {
  return new DocenteRepository(new FakeDatabase(fixtureTables()));
}

test('Docente: appellativo, nome completo, ITP, dipartimento (04 §2)', () => {
  const f = Docente.fromData({
    EMAIL: 'b@x.it',
    COGNOME: 'BIANCHI',
    NOME: 'GIULIA',
    GENERE: 'F',
    DIPART: 'LETTERE',
    ITP: true
  });
  expect(f.getAppellativo()).toBe('Prof.ssa');
  expect(f.getNomeCompleto()).toBe('BIANCHI GIULIA');
  expect(f.getNomeCompletoConAppellativo()).toBe('Prof.ssa BIANCHI GIULIA');
  expect(f.isITP()).toBe(true);
  expect(f.dipartimentoId.value).toBe('LETTERE');
  const m = new Docente({
    EMAIL: f.email.value,
    COGNOME: 'ROSSI',
    NOME: 'MARIO',
    GENERE: Genere.M
  });
  expect(m.getAppellativo()).toBe('Prof.');
  expect(m.isITP()).toBe(false);
});

test('findByDipartimento / findITP filter DOCENTI', () => {
  expect(
    repo()
      .findByDipartimento(DipartimentoId.of('SCIENTIFICO_DIP'))
      .map((d) => d.id)
      .sort()
  ).toEqual(['bianchi@school.it', 'rossi@school.it']);
  expect(
    repo()
      .findITP()
      .map((d) => d.id)
  ).toEqual(['verdi@school.it']);
  expect(new DocentiPerDipartimentoSpec(DipartimentoId.of('LETTERE')).toQueryObject()).toBeNull();
});

test('findCoordinatori reads CLASSI.COORD CSV, deduped', () => {
  expect(
    repo()
      .findCoordinatori()
      .map((d) => d.id)
  ).toEqual(['rossi@school.it']);
});

test('getDipartimento resolves the department, else throws', () => {
  const r = repo();
  const rossi = r.findById('rossi@school.it')!;
  expect(r.getDipartimento(rossi).id).toBe('SCIENTIFICO_DIP');
  const orphan = Docente.fromData({ EMAIL: 'x@x.it', DIPART: 'NOPE' });
  expect(() => r.getDipartimento(orphan)).toThrow(EntityNotFoundError);
});
