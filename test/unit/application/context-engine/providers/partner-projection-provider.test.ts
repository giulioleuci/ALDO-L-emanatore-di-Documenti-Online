import { PartnerProjectionProvider } from '../../../../../src/application/context-engine/providers/PartnerProjectionProvider';
import { ClasseProvider } from '../../../../../src/application/context-engine/providers/ClasseProvider';
import { StudentiProvider } from '../../../../../src/application/context-engine/providers/StudentiProvider';
import { TutorProvider } from '../../../../../src/application/context-engine/providers/TutorProvider';
import { MovimentiProvider } from '../../../../../src/application/context-engine/providers/MovimentiProvider';
import { ConsiglioClasseProvider } from '../../../../../src/application/context-engine/providers/ConsiglioClasseProvider';
import { SchoolProvider } from '../../../../../src/application/context-engine/providers/SchoolProvider';
import { ContextBuilder } from '../../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../../src/infrastructure/repositories/OreASLRepository';
import { MovimentoAlunnoRepository } from '../../../../../src/infrastructure/repositories/MovimentoAlunnoRepository';
import { MasterSheetRepository } from '../../../../../src/infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../../../../src/infrastructure/repositories/DocenteRepository';
import { AldoTeachingAssignmentResolver } from '../../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { FakeDatabase } from '../../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../../fixtures/tables';
import type { Row } from '../../../../../src/infrastructure/db/Database';

/** Real ALUNNI rows for both '1F' partner classes, so studenti.elenco is non-empty. */
function tablesWithPartnerStudents(): Record<string, Row[]> {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).push(
    {
      EMAIL: 's1@school.it',
      COGNOMENOME: 'ALFA UNO',
      CLASSE: '1F-LSO',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      CURRICULUM: null
    },
    {
      EMAIL: 's2@school.it',
      COGNOMENOME: 'BETA DUE',
      CLASSE: '1F-LSS',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      CURRICULUM: null
    }
  );
  return tables;
}

/** Wires the reused sub-providers plus PartnerProjectionProvider against one FakeDatabase. */
function makeHarness(tables: Record<string, Row[]>) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const classeProvider = new ClasseProvider(classi, alunni, materie);
  const storicoDb = { anniStorici: () => [] };
  const studentiProvider = new StudentiProvider(classi, alunni, materie, new OreASLRepository(db), storicoDb);
  const tutorProvider = new TutorProvider(classi);
  const movimentiProvider = new MovimentiProvider(new MovimentoAlunnoRepository(db), alunni, classi);
  // Not reused by PartnerProjectionProvider (fix round 1) -- kept here only to
  // run the 'consiglio' token on the OUTER cdu, exactly like CLASSE_COMPLETA
  // does before 'partner', so focus.classe.consiglio.{comune,separatoPrimo,
  // separatoSecondo} are populated for PartnerProjectionProvider to read.
  const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);
  // Runs the 'school' token on the OUTER cdu, exactly like CLASSE_COMPLETA does
  // before 'class' (fix round 2) -- without it, cdu.istituto is never populated
  // on the outer cdu.
  const schoolProvider = new SchoolProvider(
    new MasterSheetRepository(db),
    new RuoloSpecialeRepository(db),
    new DocenteRepository(db)
  );
  const provider = new PartnerProjectionProvider(classeProvider, studentiProvider, tutorProvider, movimentiProvider);
  return { classeProvider, studentiProvider, tutorProvider, consiglioProvider, schoolProvider, provider };
}

/**
 * Builds a real outer Cdu (via ContextBuilder + SchoolProvider + ClasseProvider +
 * ConsiglioClasseProvider, mirroring CLASSE_COMPLETA's 'school' then 'class' then
 * 'consiglio' ordering) focused on `target`.
 */
function buildOuterCdu(
  target: string,
  classeProvider: ClasseProvider,
  consiglioProvider: ConsiglioClasseProvider,
  schoolProvider: SchoolProvider,
  now: Date = new Date('2026-07-01T09:00:00Z')
): { cdu: Cdu; params: BuildParams } {
  const b = new ContextBuilder();
  b.registerProvider('school', schoolProvider);
  b.registerProvider('class', classeProvider);
  b.registerProvider('consiglio', consiglioProvider);
  const params: BuildParams = { target, tipoTarget: 'classe', now };
  const recipe: Recipe = { providers: ['school', 'class', 'consiglio'], options: makeOptions() };
  return { cdu: b.build(params, recipe), params };
}

describe('PartnerProjectionProvider', () => {
  it('builds primo/secondo full ProiezioneClasseVM only when isArticolata and includiPartnerDettaglio are both true', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, consiglioProvider, schoolProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider, consiglioProvider, schoolProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    const partner = cdu.focus.classe!.partner!;
    expect(partner.hasElenco).toBe(true);
    expect(partner.primo.nome).toBe('1F-LSO');
    expect(partner.secondo.nome).toBe('1F-LSS');
    expect(partner.primo.studenti.elenco.map((a) => a.email)).toEqual(['s1@school.it']);
    expect(partner.secondo.studenti.elenco.map((a) => a.email)).toEqual(['s2@school.it']);
    // Fix round 1: derived from the outer cdu's focus.classe.consiglio.comune
    // (rossi, MATE shared by both partners) concatenated with the SEPARATO_PRIMO/
    // SEPARATO_SECONDO subset of consiglio.separatoPrimo/separatoSecondo (bianchi
    // on 1F-LSO/FISI, verdi on 1F-LSS/FISI -- same fixture as
    // consiglio-provider.test.ts's "CDC of an articulated parent" case). NOT
    // re-resolved per partner classe id (that would yield the same
    // comune+separato roster both times), so primo and secondo must now be
    // genuinely different.
    expect(partner.primo.consiglio.elenco.map((d) => d.email).sort()).toEqual([
      'bianchi@school.it',
      'rossi@school.it'
    ]);
    expect(partner.secondo.consiglio.elenco.map((d) => d.email).sort()).toEqual([
      'rossi@school.it',
      'verdi@school.it'
    ]);
    expect(partner.primo.consiglio.elenco.some((d) => d.email === 'verdi@school.it')).toBe(false);
    expect(partner.secondo.consiglio.elenco.some((d) => d.email === 'bianchi@school.it')).toBe(false);
    expect(partner.primo.coordinatori.elenco.map((c) => c.email)).toEqual(['rossi@school.it']);
    expect(partner.secondo.coordinatori.elenco.map((c) => c.email)).toEqual(['rossi@school.it']);
    // each side is a full class projection, including its own movimenti node:
    expect(partner.primo.movimenti).toBeDefined();
    expect(partner.secondo.movimenti).toBeDefined();
    expect(cdu.istituto?.annoScolastico).toBe('2025-2026');
  });

  it('is omitted when includiPartnerDettaglio is false, even for an articulated class', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, consiglioProvider, schoolProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider, consiglioProvider, schoolProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: false }));

    expect(cdu.focus.classe!.partner).toBeUndefined();
  });

  it('is omitted for a non-articulated class', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, consiglioProvider, schoolProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('5A', classeProvider, consiglioProvider, schoolProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    expect(cdu.focus.classe!.partner).toBeUndefined();
  });

  it('does not mutate or leak the scratch per-partner Cdu into the real outer Cdu', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, consiglioProvider, schoolProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider, consiglioProvider, schoolProvider);

    const outerClasseEntityBefore = cdu.tech.entita.classe;
    const outerFocusClasseRef = cdu.focus.classe;

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    // The outer cdu's own tech entity and focus.classe object identity are untouched --
    // building the two scratch CDUs must not rebind the outer cdu's live entity/focus.
    expect(cdu.tech.entita.classe).toBe(outerClasseEntityBefore);
    expect(cdu.focus.classe).toBe(outerFocusClasseRef);
    expect(cdu.focus.classe!.nome).toBe('1F'); // still the parent, not overwritten by a partner run
    expect(cdu.focus.classe!.studenti).toBeUndefined(); // 'students' token never ran on the outer cdu

    // The two partner projections are independent objects from the outer classe and from each other.
    const partner = cdu.focus.classe!.partner!;
    expect(partner.primo).not.toBe(cdu.focus.classe);
    expect(partner.primo).not.toBe(partner.secondo);
    expect(partner.primo.studenti.elenco).not.toBe(partner.secondo.studenti.elenco);
  });
});
