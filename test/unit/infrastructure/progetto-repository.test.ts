import { ProgettoRepository } from '../../../src/infrastructure/repositories/ProgettoRepository';
import { Progetto } from '../../../src/domain/entities/Progetto';
import { Classe } from '../../../src/domain/entities/Classe';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { TipoProgetto } from '../../../src/domain/value-objects/enums';

function repo(): ProgettoRepository {
  return new ProgettoRepository(new FakeDatabase(fixtureTables()));
}
const classe5A = Classe.fromData({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO' });

test('Progetto: composite identity + ASL helpers', () => {
  const p = Progetto.fromData({
    CLASSE: '5A',
    TIPO: 'ASL',
    NOME: 'Stage aziendale',
    ORE: 80,
    ORE_ASL: 70
  });
  expect(p.id).toBe('5A::ASL::Stage aziendale');
  expect(p.isASL()).toBe(true);
  expect(p.getOreASLEffettive()).toBe(70);
});

test('findByClasse returns all class projects', () => {
  expect(
    repo()
      .findByClasse(classe5A)
      .map((p) => p.nome)
      .sort()
  ).toEqual(['Open day', 'Stage aziendale']);
});

test('findByTipo filters by project type', () => {
  const asl = repo().findByTipo(TipoProgetto.ASL);
  expect(asl.map((p) => p.nome)).toEqual(['Stage aziendale']);
  expect(asl[0]!.isASL()).toBe(true);
});
