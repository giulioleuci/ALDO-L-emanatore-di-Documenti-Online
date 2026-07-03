import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { Carenza } from '../../../src/domain/entities/Carenza';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { Classe } from '../../../src/domain/entities/Classe';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { AnnoScolastico } from '../../../src/domain/value-objects/AnnoScolastico';

function repo(): CarenzaRepository {
  return new CarenzaRepository(new FakeDatabase(fixtureTables()));
}
const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });
const classe5A = Classe.fromData({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO' });

test('Carenza: composite identity, notification flag, assenze', () => {
  const c = Carenza.fromData({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, DATA: '2026-02-15', ASSENZE: true });
  expect(c.id).toBe('a1@school.it::1');
  expect(c.isNotificato()).toBe(false);
  expect(c.getNotificato()).toBeNull();
  expect(c.hasAssenzeElevate()).toBe(true);
});

test('notifica() stamps NOTIFICATO and marks dirty', () => {
  const c = Carenza.fromData({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1 });
  c.notifica();
  expect(c.isNotificato()).toBe(true);
  expect(c.getNotificato()).toBeInstanceOf(Date);
  expect(c.isDirty('NOTIFICATO')).toBe(true);
});

test('findByAlunno sorts DATA DESC; annoScolastico filter keeps in-range rows', () => {
  expect(repo().findByAlunno(a1).map((c) => c.progressivo)).toEqual([2, 1]);
  const inAnno = repo().findByAlunno(a1, { annoScolastico: AnnoScolastico.of('2025-2026') });
  expect(inAnno.map((c) => c.progressivo)).toEqual([2, 1]);
  const otherAnno = repo().findByAlunno(a1, { annoScolastico: AnnoScolastico.of('2023-2024') });
  expect(otherAnno).toEqual([]);
});

test('findByClasse with and without exact-date filter', () => {
  expect(repo().findByClasse(classe5A).length).toBe(3);
  const onDate = repo().findByClasse(classe5A, new Date('2026-02-15'));
  expect(onDate.map((c) => c.studente)).toEqual(['a1@school.it']);
});

test('findNonNotificate returns rows with empty NOTIFICATO', () => {
  const ids = repo().findNonNotificate().map((c) => c.id).sort();
  expect(ids).toEqual(['a1@school.it::1', 'a2@school.it::1']);
});

test('getCarenzePerMateria builds VOTO/NOTA from dynamic subject columns', () => {
  const prog1 = repo().findByAlunno(a1).find((c) => c.progressivo === 1)!;
  const map = repo().getCarenzePerMateria(prog1);
  expect(prog1.getNumeroCarenze(map)).toBe(2);
  const byId = new Map([...map].map(([m, v]) => [m.value, v]));
  expect(byId.get('MATE')!.isVoto()).toBe(true);
  expect(byId.get('MATE')!.valore).toBe(4.5);
  expect(byId.get('FISI')!.isNota()).toBe(true);
  expect(prog1.hasCarenzaMateria(MateriaId.of('MATE'), map)).toBe(true);

  const prog2 = repo().findByAlunno(a1).find((c) => c.progressivo === 2)!;
  expect(repo().getCarenzePerMateria(prog2).size).toBe(1);
});
