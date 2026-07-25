import { VariazioneCattedraRepository } from '../../../src/infrastructure/repositories/VariazioneCattedraRepository';
import { VariazioneCattedra } from '../../../src/domain/entities/VariazioneCattedra';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Email } from '../../../src/domain/value-objects/Email';

function repo(): VariazioneCattedraRepository {
  return new VariazioneCattedraRepository(new FakeDatabase(fixtureTables()));
}

test('VariazioneCattedra: composite identity + CSV containment (04 §15)', () => {
  const v = VariazioneCattedra.fromData({
    CLASSE_ID: '5A,3B',
    MATERIA_ID: 'MATE',
    NUOVO_TITOLARE: 'bianchi@school.it'
  });
  expect(v.id).toBe('5A,3B::MATE');
  expect(v.applicaAClasse(ClasseId.of('3B'))).toBe(true);
  expect(v.applicaAClasse(ClasseId.of('4B'))).toBe(false);
  expect(v.applicaAContesto(ClasseId.of('5A'), MateriaId.of('MATE'))).toBe(true);
});

test('findByClasse / findByMateria search by containment', () => {
  const r = repo();
  expect(r.findByClasse(ClasseId.of('5A')).map((v) => v.nuovoTitolare)).toEqual([
    'bianchi@school.it'
  ]);
  expect(r.findByClasse(ClasseId.of('1F')).map((v) => v.nuovoTitolare)).toEqual([
    'verdi@school.it'
  ]);
  expect(r.findByMateria(MateriaId.of('MATE')).length).toBe(1);
});

test('findByNuovoTitolare', () => {
  expect(
    repo()
      .findByNuovoTitolare(Email.of('verdi@school.it'))
      .map((v) => v.id)
  ).toEqual(['1F::FISI']);
});
