import { PartnerProjectionProvider } from '../../../../../src/application/context-engine/providers/PartnerProjectionProvider';
import { ClasseProvider } from '../../../../../src/application/context-engine/providers/ClasseProvider';
import { StudentiProvider } from '../../../../../src/application/context-engine/providers/StudentiProvider';
import { TutorProvider } from '../../../../../src/application/context-engine/providers/TutorProvider';
import { ConsiglioClasseProvider } from '../../../../../src/application/context-engine/providers/ConsiglioClasseProvider';
import { ContextBuilder } from '../../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../../src/infrastructure/repositories/MateriaRepository';
import { AldoTeachingAssignmentResolver } from '../../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { FakeDatabase } from '../../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../../fixtures/tables';
import type { Row } from '../../../../../src/infrastructure/db/Database';

/** Real ALUNNI rows for both '1F' partner classes, so listaCompleta is non-empty. */
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

/** Wires the four reused sub-providers plus PartnerProjectionProvider against one FakeDatabase. */
function makeHarness(tables: Record<string, Row[]>) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const classeProvider = new ClasseProvider(classi, alunni, materie);
  const studentiProvider = new StudentiProvider(classi, alunni, materie);
  const tutorProvider = new TutorProvider(classi);
  const consiglioProvider = new ConsiglioClasseProvider(classi, materie, teachingAssignments);
  const provider = new PartnerProjectionProvider(
    classeProvider,
    studentiProvider,
    tutorProvider,
    consiglioProvider
  );
  return { classeProvider, studentiProvider, tutorProvider, consiglioProvider, provider };
}

/** Builds a real outer Cdu (via ContextBuilder + ClasseProvider only) focused on `target`. */
function buildOuterCdu(
  target: string,
  classeProvider: ClasseProvider,
  now: Date = new Date('2026-07-01T09:00:00Z')
): { cdu: Cdu; params: BuildParams } {
  const b = new ContextBuilder();
  b.registerProvider('class', classeProvider);
  const params: BuildParams = { target, tipoTarget: 'classe', now };
  const recipe: Recipe = { providers: ['class'], options: makeOptions() };
  return { cdu: b.build(params, recipe), params };
}

describe('PartnerProjectionProvider', () => {
  it('builds primo/secondo SingleClassProjection only when isArticolata and includiPartnerDettaglio are both true', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    const partner = cdu.focus.classe!.partner!;
    expect(partner.primo.anagrafica.nome).toBe('1F-LSO');
    expect(partner.secondo.anagrafica.nome).toBe('1F-LSS');
    expect(partner.primo.studenti.listaCompleta.length).toBeGreaterThan(0);
    expect(partner.primo.studenti.listaCompleta.map((a) => a.anagrafica.email)).toEqual([
      's1@school.it'
    ]);
    expect(partner.secondo.studenti.listaCompleta.map((a) => a.anagrafica.email)).toEqual([
      's2@school.it'
    ]);
    // Reused AS-IS from ConsiglioClasseProvider: since a partner classe is itself
    // isArticolata (its own ARTICOLAZIONE cell is set), resolveConsiglio resolves
    // at the whole-group level for both partners -- same full roster as the
    // parent's own consiglio (consiglio-provider.test.ts's cdc('1F') case), not
    // filtered down to that partner's own subjects. That is the real, observed
    // behavior of AS-IS reuse against a partner classe id, not something this
    // provider re-derives.
    expect(partner.primo.consiglioDiClasse.map((d) => d.anagrafica.email).sort()).toEqual([
      'bianchi@school.it',
      'rossi@school.it',
      'verdi@school.it'
    ]);
    expect(partner.secondo.consiglioDiClasse.map((d) => d.anagrafica.email).sort()).toEqual([
      'bianchi@school.it',
      'rossi@school.it',
      'verdi@school.it'
    ]);
    expect(partner.primo.coordinatori.elenco.map((c) => c.email)).toEqual(['rossi@school.it']);
    expect(partner.secondo.coordinatori.elenco.map((c) => c.email)).toEqual(['rossi@school.it']);
  });

  it('is omitted when includiPartnerDettaglio is false, even for an articulated class', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: false }));

    expect(cdu.focus.classe!.partner).toBeUndefined();
  });

  it('is omitted for a non-articulated class', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('5A', classeProvider);

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    expect(cdu.focus.classe!.partner).toBeUndefined();
  });

  it('does not mutate or leak the scratch per-partner Cdu into the real outer Cdu', () => {
    const tables = tablesWithPartnerStudents();
    const { classeProvider, provider } = makeHarness(tables);
    const { cdu, params } = buildOuterCdu('1F', classeProvider);

    const outerClasseEntityBefore = cdu.tech.entita.classe;
    const outerFocusClasseRef = cdu.focus.classe;
    const outerAnagraficaRef = cdu.focus.classe!.anagrafica;

    provider.provide(cdu, params, makeOptions({ includiPartnerDettaglio: true }));

    // The outer cdu's own tech entity and focus.classe object identity are untouched --
    // building the two scratch CDUs must not rebind the outer cdu's live entity/anagrafica.
    expect(cdu.tech.entita.classe).toBe(outerClasseEntityBefore);
    expect(cdu.focus.classe).toBe(outerFocusClasseRef);
    expect(cdu.focus.classe!.anagrafica).toBe(outerAnagraficaRef);
    expect(cdu.focus.classe!.anagrafica.nome).toBe('1F'); // still the parent, not overwritten by a partner run
    expect(cdu.focus.classe!.studenti).toBeUndefined(); // 'students' token never ran on the outer cdu

    // The two partner projections are independent objects from the outer classe and from each other.
    const partner = cdu.focus.classe!.partner!;
    expect(partner.primo).not.toBe(cdu.focus.classe);
    expect(partner.primo.anagrafica).not.toBe(cdu.focus.classe!.anagrafica);
    expect(partner.primo).not.toBe(partner.secondo);
    expect(partner.primo.studenti.listaCompleta).not.toBe(partner.secondo.studenti.listaCompleta);
  });
});
