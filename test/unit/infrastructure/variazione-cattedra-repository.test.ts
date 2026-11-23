import { VariazioneCattedraRepository } from '../../../src/infrastructure/repositories/VariazioneCattedraRepository';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { Email } from '../../../src/domain/value-objects/Email';
import {
  VariazioneCattedraTitolareNonTrovatoError,
  VariazioneCattedraInconsistenteError
} from '../../../src/domain/errors/DomainError';

function repo(): VariazioneCattedraRepository {
  return new VariazioneCattedraRepository(new FakeDatabase(fixtureTables()));
}

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
