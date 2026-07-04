import { OreASLRepository } from '../../../src/infrastructure/repositories/OreASLRepository';
import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { AnnoScolastico } from '../../../src/domain/value-objects/AnnoScolastico';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValoreCarenza } from '../../../src/domain/value-objects/ValoreCarenza';

const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });

test('aggiungiOre updates the right (STUDENTE, ANNO) row, leaving other years intact (06 §16)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new OreASLRepository(db);
  // a1 fixture: 2024-2025 = 40, 2025-2026 = 60 (total 100).
  r.aggiungiOre(a1, AnnoScolastico.of('2025-2026'), 15);
  const reread = new OreASLRepository(db);
  expect(reread.findByAlunno(a1).find((o) => o.anno === '2025-2026')!.getOre()).toBe(75);
  expect(reread.findByAlunno(a1).find((o) => o.anno === '2024-2025')!.getOre()).toBe(40); // untouched
  expect(reread.getTotaleOre(a1)).toBe(115);
  expect(db.saved).toBeGreaterThan(0);
});

test('aggiungiOre appends a new year when none exists', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new OreASLRepository(db);
  r.aggiungiOre(a1, AnnoScolastico.of('2026-2027'), 20);
  const reread = new OreASLRepository(db);
  expect(reread.findByAlunno(a1).map((o) => o.anno)).toEqual(['2026-2027', '2025-2026', '2024-2025']);
  expect(reread.findByAlunno(a1).find((o) => o.anno === '2026-2027')!.getOre()).toBe(20);
});

test('setCarenzaMateria updates one subject cell of the right CARENZE row (06 §11)', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new CarenzaRepository(db);
  // a1 PROGRESSIVO 1 fixture: MATE=4.5 (VOTO), FISI="Studio scarso" (NOTA) → 2 carenze.
  const prog1 = r.findByAlunno(a1).find((c) => c.progressivo === 1)!;
  r.setCarenzaMateria(prog1, MateriaId.of('FISI'), null);        // clear FISI

  const reread = new CarenzaRepository(db);
  const rprog1 = reread.findByAlunno(a1).find((c) => c.progressivo === 1)!;
  const map = reread.getCarenzePerMateria(rprog1);
  expect([...map].map(([m]) => m.value)).toEqual(['MATE']);      // FISI removed
  // PROGRESSIVO 2 (MATE=5) untouched.
  expect(reread.getCarenzePerMateria(reread.findByAlunno(a1).find((c) => c.progressivo === 2)!).size).toBe(1);

  r.setCarenzaMateria(rprog1, MateriaId.of('FISI'), ValoreCarenza.voto(3));
  const map2 = new CarenzaRepository(db).getCarenzePerMateria(new CarenzaRepository(db).findByAlunno(a1).find((c) => c.progressivo === 1)!);
  expect(map2.size).toBe(2);
});
