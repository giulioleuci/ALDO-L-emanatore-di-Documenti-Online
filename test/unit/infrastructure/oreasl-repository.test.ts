import { OreASLRepository } from '../../../src/infrastructure/repositories/OreASLRepository';
import { OreASL } from '../../../src/domain/entities/OreASL';
import { OreASLPerAnnoSpec } from '../../../src/domain/specifications/OreASLSpecs';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { AnnoScolastico } from '../../../src/domain/value-objects/AnnoScolastico';

function repo(): OreASLRepository {
  return new OreASLRepository(new FakeDatabase(fixtureTables()));
}
const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });

test('OreASL: composite identity + getOre', () => {
  const o = OreASL.fromData({ STUDENTE: 'a1@school.it', ANNO: '2025-2026', ORE: 60 });
  expect(o.id).toBe('a1@school.it::2025-2026');
  expect(o.getOre()).toBe(60);
});

test('findByAlunno sorts by ANNO DESC; getTotaleOre sums all years', () => {
  expect(repo().findByAlunno(a1).map((o) => o.anno)).toEqual(['2025-2026', '2024-2025']);
  expect(repo().getTotaleOre(a1)).toBe(100);
});

test('findByAnno returns all students for the year', () => {
  const spec = new OreASLPerAnnoSpec(AnnoScolastico.of('2025-2026'));
  expect(spec.toQueryObject()).toEqual({ ANNO: '2025-2026' });
  expect(repo().findByAnno(AnnoScolastico.of('2025-2026')).map((o) => o.studente).sort())
    .toEqual(['a1@school.it', 'a2@school.it']);
});

test('getOrCreate returns existing, else a fresh zero-hours record', () => {
  expect(repo().getOrCreate(a1, AnnoScolastico.of('2025-2026')).getOre()).toBe(60);
  const created = repo().getOrCreate(a1, AnnoScolastico.of('2023-2024'));
  expect(created.getOre()).toBe(0);
  expect(created.anno).toBe('2023-2024');
});
