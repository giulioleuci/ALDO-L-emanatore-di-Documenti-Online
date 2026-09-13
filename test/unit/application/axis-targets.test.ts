import {
  targetsClasse,
  targetsClasseDocente,
  targetsClasseMateria,
  targetsDocenti,
  targetsDipartimenti,
  targetsAlunni
} from '../../../src/application/services/axisTargets';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { DipartimentoRepository } from '../../../src/infrastructure/repositories/DipartimentoRepository';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';
import type { ITeachingAssignmentResolver } from '../../../src/application/ports/ITeachingAssignmentResolver';
import { Docente } from '../../../src/domain/entities/Docente';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';

const NOW = new Date('2026-07-01T09:00:00Z');

/** Every class gets the same two cattedre; one subject carries a specifica. */
function resolver(): ITeachingAssignmentResolver {
  const docente = new Docente({ EMAIL: 'd1@school.it', COGNOME: 'ROSSI', NOME: 'MARIO', ITP: false });
  return {
    resolveConsiglio: () => [
      { docenteEffettivo: docente, slot: { materia: MateriaId.of('MAT'), specifica: null } },
      { docenteEffettivo: docente, slot: { materia: MateriaId.of('LAB'), specifica: 'GRUPPO_A' } }
    ],
    resolveMateria: () => null
  } as unknown as ITeachingAssignmentResolver;
}

test('targetsClasse returns the active classes filtered by gestione articolazione', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasse(classi, GestioneArticolazione.COMPLETA);
  // Compared by id, not by toEqual(full entity): each findAttive() call
  // constructs fresh Classe instances whose GLF base-entity _updatedAt
  // defaults to `new Date()` at construction time (no updatedAt column in
  // fixtures), so two independently-fetched instances of the "same" row
  // legitimately differ by a millisecond and fail a deep-equality compare.
  const expectedIds = classi
    .filterPerGestioneArticolazione(classi.findAttive(), GestioneArticolazione.COMPLETA)
    .map((c) => c.id);
  expect(targets.map((c) => c.id)).toEqual(expectedIds);
  expect(targets.length).toBeGreaterThan(0);
});

test('targetsClasseMateria qualifies a specifica slot as BASE.SPECIFICA and dedups', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasseMateria(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  const perClasse = targets.filter((t) => t.classe === targets[0]!.classe).map((t) => t.materiaId);
  expect(perClasse).toEqual(['MAT', 'LAB.GRUPPO_A']);
});

test('targetsClasseDocente dedups the same teacher across two subjects of one class', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasseDocente(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  const perClasse = targets.filter((t) => t.classe === targets[0]!.classe);
  expect(perClasse).toHaveLength(1);
});

test('targetsDocenti aggregates every class a teacher is assigned to', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsDocenti(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  expect(targets).toHaveLength(1);
  expect(targets[0]!.docenteEmail).toBe('d1@school.it');
  expect(targets[0]!.classiCompetenza.length).toBe(
    classi.filterPerGestioneArticolazione(classi.findAttive(), GestioneArticolazione.COMPLETA).length
  );
});

test('targetsAlunni and targetsDipartimenti enumerate their whole tables', () => {
  const db = new FakeDatabase(fixtureTables());
  expect(targetsAlunni(new AlunnoRepository(db)).length).toBe(new AlunnoRepository(db).findAttivi().length);
  expect(targetsDipartimenti(new DipartimentoRepository(db)).length).toBe(
    new DipartimentoRepository(db).findAll().length
  );
});
