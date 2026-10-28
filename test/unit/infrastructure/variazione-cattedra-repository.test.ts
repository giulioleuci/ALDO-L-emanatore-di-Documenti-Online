import { VariazioneCattedraRepository } from '../../../src/infrastructure/repositories/VariazioneCattedraRepository';
import { VariazioneCattedra } from '../../../src/domain/entities/VariazioneCattedra';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Email } from '../../../src/domain/value-objects/Email';
import {
  VariazioneCattedraTitolareNonTrovatoError,
  VariazioneCattedraInconsistenteError
} from '../../../src/domain/errors/DomainError';

function repo(): VariazioneCattedraRepository {
  return new VariazioneCattedraRepository(new FakeDatabase(fixtureTables()));
}

test('VariazioneCattedra: composite identity + CSV containment (01 §4)', () => {
  const v = VariazioneCattedra.fromData({
    TITOLARE: 'rossi@school.it',
    NUOVO_TITOLARE: 'bianchi@school.it',
    DAL: '2025-10-01',
    CLASSI: '5A,3B',
    MATERIE: 'MATE'
  });
  expect(v.id).toBe('rossi@school.it::bianchi@school.it::2025-10-01::5A,3B::MATE');
  expect(v.applicaAClasse(ClasseId.of('3B'))).toBe(true);
  expect(v.applicaAClasse(ClasseId.of('4B'))).toBe(false);
  expect(v.applicaAContesto(ClasseId.of('5A'), MateriaId.of('MATE'))).toBe(true);
});

test('findByClasse / findByMateria search by containment', () => {
  const r = repo();
  expect(r.findByClasse(ClasseId.of('5A')).map((v) => v.nuovoTitolare)).toEqual([
    'bianchi@school.it'
  ]);
  // '1F' is not a CSV token of any VARIAZIONI_CATTEDRA row (the fixture's only
  // row targets '5A') — containment correctly yields no match, not a prefix
  // false-positive against e.g. a hypothetical '1F-LSO' row.
  expect(r.findByClasse(ClasseId.of('1F')).map((v) => v.nuovoTitolare)).toEqual([]);
  expect(r.findByMateria(MateriaId.of('MATE')).length).toBe(1);
});

test('findByNuovoTitolare', () => {
  expect(
    repo()
      .findByNuovoTitolare(Email.of('bianchi@school.it'))
      .map((v) => v.id)
  ).toEqual(['rossi@school.it::bianchi@school.it::2025-10-01::5A::MATE']);
});

test('findByTitolare', () => {
  expect(
    repo()
      .findByTitolare(Email.of('rossi@school.it'))
      .map((v) => v.id)
  ).toEqual(['rossi@school.it::bianchi@school.it::2025-10-01::5A::MATE']);
});

describe('validate', () => {
  test('does not throw when every TITOLARE is a known docente and no row is self-referential', () => {
    const db = new FakeDatabase(fixtureTables());
    expect(() =>
      new VariazioneCattedraRepository(db).validate(new DocenteRepository(db))
    ).not.toThrow();
  });

  test('throws VariazioneCattedraTitolareNonTrovatoError when TITOLARE matches no DOCENTI row', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      VARIAZIONI_CATTEDRA: [
        {
          TITOLARE: 'ghost@school.it',
          NUOVO_TITOLARE: 'bianchi@school.it',
          DAL: '2025-10-01',
          CLASSI: '5A',
          MATERIE: 'MATE'
        }
      ]
    });
    expect(() => new VariazioneCattedraRepository(db).validate(new DocenteRepository(db))).toThrow(
      VariazioneCattedraTitolareNonTrovatoError
    );
  });

  test('throws VariazioneCattedraInconsistenteError when TITOLARE equals NUOVO_TITOLARE', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      VARIAZIONI_CATTEDRA: [
        {
          TITOLARE: 'rossi@school.it',
          NUOVO_TITOLARE: 'rossi@school.it',
          DAL: '2025-10-01',
          CLASSI: '5A',
          MATERIE: 'MATE'
        }
      ]
    });
    expect(() => new VariazioneCattedraRepository(db).validate(new DocenteRepository(db))).toThrow(
      VariazioneCattedraInconsistenteError
    );
  });
});
