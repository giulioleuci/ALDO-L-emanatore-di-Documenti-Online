import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ConsiglioClasseProvider } from '../../../../src/application/context-engine/providers/ConsiglioClasseProvider';
import { TutorProvider } from '../../../../src/application/context-engine/providers/TutorProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { councilProjectionOperations } from '../../../../src/application/context-engine/TeachingCouncilProjection';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function cdc(
  target: string,
  now: Date = new Date('2026-07-01T09:00:00Z'),
  tables = fixtureTables(),
  gestioneSupplenti: GestioneSupplenti = GestioneSupplenti.SOLO_TITOLARI
): DocenteCdcVM[] {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const resolveConsiglio = jest.spyOn(teachingAssignments, 'resolveConsiglio');
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now
  };
  const recipe: Recipe = {
    providers: ['class', 'consiglio'],
    options: makeOptions({ gestioneSupplenti })
  };
  const result = b.build(params, recipe).focus.classe!.consiglioDiClasse!;
  expect(resolveConsiglio).toHaveBeenCalledWith(
    expect.objectContaining({ id: target }),
    new Date(now.toISOString().slice(0, 10)),
    expect.objectContaining({ includeReligioneAlt: true })
  );
  return result;
}
const byEmail = (list: DocenteCdcVM[], email: string) =>
  list.find((d) => d.anagrafica.email === email)!;

test('CDC of a standard class: one VM per subject teacher, sorted by surname (02 §4.1)', () => {
  const list = cdc('5A');
  // 5A: MATE's effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since
  // 2025-10-01, `now` here is 2026-07-01); FISI's nominal holder is also
  // bianchi -> rossi holds no subject in 5A and drops out of the council.
  expect(list.map((d) => d.anagrafica.email)).toEqual(['bianchi@school.it']);
  expect(list[0]!.flags.isNotLast).toBe(false);
});

test('CDC coordinatore VM: materie, roles and descrizione', () => {
  // Anchored before the 5A/MATE VARIAZIONI_CATTEDRA's 2025-10-01 decorrenza so
  // rossi (COORD/TUTOR_ASL of 5A) still holds MATE nominally — the point of this
  // test is the role-tagging on the VM, not the cattedra-resolution outcome.
  const rossi = byEmail(cdc('5A', new Date('2025-06-01T09:00:00Z')), 'rossi@school.it');
  expect(rossi.anagrafica).toEqual({
    nome: 'MARIO',
    cognome: 'ROSSI',
    email: 'rossi@school.it',
    genere: 'M',
    appellativo: 'Prof.'
  });
  expect(rossi.materie).toEqual([
    { sigla: 'MATE', nome: 'Matematica', colore: '', specificita: null }
  ]);
  expect(rossi.materieDescrizione).toBe('Matematica');
  expect(rossi.gruppoNome).toBeNull();
  expect(rossi.ruoli).toEqual({
    isCoordinatore: true,
    isTutorAsl: true,
    isTutorOrientamento: false,
    descrizione: ['Coordinatore', 'Tutor ASL', 'Docente']
  });
  expect(rossi.stato).toEqual({ isSupplente: false, sostituisce: null });
  expect(rossi.tipoArticolazione).toBeNull();
  expect(rossi.isITP).toBe(false);
});

test('CDC of an articulated parent: tipoArticolazione by partner membership (09 §9)', () => {
  const list = cdc('1F');
  expect(list.map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'rossi@school.it',
    'verdi@school.it'
  ]);
  expect(byEmail(list, 'rossi@school.it').tipoArticolazione).toBe('COMUNE'); // MATE in both partners
  expect(byEmail(list, 'bianchi@school.it').tipoArticolazione).toBe('SEPARATO_PRIMO'); // FISI in 1F-LSO only
  expect(byEmail(list, 'verdi@school.it').tipoArticolazione).toBe('SEPARATO_SECONDO'); // FISI in 1F-LSS only
  expect(byEmail(list, 'rossi@school.it').gruppoNome).toBeNull();
  expect(byEmail(list, 'bianchi@school.it').gruppoNome).toBe('Liceo scientifico');
  expect(byEmail(list, 'verdi@school.it').gruppoNome).toBe('Liceo scientifico scienze applicate');
  expect(byEmail(list, 'bianchi@school.it').materieDescrizione).toBe('Fisica');
  expect(byEmail(list, 'verdi@school.it').materieDescrizione).toBe('Fisica');
  expect(byEmail(list, 'rossi@school.it').materie).toEqual([
    { sigla: 'MATE', nome: 'Matematica', colore: '', specificita: null }
  ]);
  expect(byEmail(list, 'rossi@school.it').materieDescrizione).toBe('Matematica');
});

test('councilVmStrategy tutor flags stay consistent with focus.classe.tutor for an articulated parent when TUTOR_ASL is defined only on a partner row', () => {
  const tables = fixtureTables();
  const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
  lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('tutor', new TutorProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = { target: '1F', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = {
    providers: ['class', 'tutor', 'consiglio'],
    options: makeOptions({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  };
  const focusClasse = b.build(params, recipe).focus.classe!;

  // focus.classe.tutor is merged across partners (Task 3): bianchi shows up there.
  expect(focusClasse.tutor!.asl.map((t) => t.email)).toEqual(['bianchi@school.it']);

  // The CDU's own consiglioDiClasse entry for bianchi must agree -- not stay
  // internally contradictory by reading TUTOR_ASL unexpanded off the parent row alone.
  const bianchi = byEmail(focusClasse.consiglioDiClasse!, 'bianchi@school.it');
  expect(bianchi.ruoli.isTutorAsl).toBe(true);
  expect(bianchi.ruoli.descrizione).toContain('Tutor ASL');
});

test('tipoArticolazione follows resolved partner assignments for replacements and substitutes', () => {
  const tables = fixtureTables();
  tables.DOCENTI!.push(
    {
      EMAIL: 'replacement@school.test',
      COGNOME: 'REPLACEMENT',
      NOME: 'RITA',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'substitute@school.test',
      COGNOME: 'SUBSTITUTE',
      NOME: 'SARA',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    }
  );
  tables.VARIAZIONI_CATTEDRA!.push({
    TITOLARE: 'rossi@school.it',
    NUOVO_TITOLARE: 'replacement@school.test',
    DAL: '2026-01-01',
    CLASSI: '1F-LSS',
    MATERIE: 'MATE'
  });
  tables.SUPPLENZE!.push({
    TITOLARE: 'replacement@school.test',
    SUPPLENTE: 'substitute@school.test',
    DAL: '2026-02-01',
    AL: null,
    CLASSI: '1F-LSS',
    MATERIE: 'MATE'
  });

  const list = cdc(
    '1F',
    new Date('2026-02-15T09:00:00Z'),
    tables,
    GestioneSupplenti.ENTRAMBI
  );

  expect(byEmail(list, 'rossi@school.it').tipoArticolazione).toBe('SEPARATO_PRIMO');
  expect(byEmail(list, 'replacement@school.test').tipoArticolazione).toBe(
    'SEPARATO_SECONDO'
  );
  expect(byEmail(list, 'substitute@school.test').tipoArticolazione).toBe(
    'SEPARATO_SECONDO'
  );
});

test('ConsiglioClasseProvider: articulated parent splits consiglio into comune/separato (09 §10)', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = { target: '1F', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = {
    providers: ['class', 'consiglio'],
    options: makeOptions({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  };
  const focusClasse = b.build(params, recipe).focus.classe!;
  expect(focusClasse.consiglioDiClasseComune!.map((d) => d.anagrafica.email)).toEqual([
    'rossi@school.it'
  ]);
  expect(
    focusClasse.consiglioDiClasseSeparato!.map((d) => d.anagrafica.email).sort()
  ).toEqual(['bianchi@school.it', 'verdi@school.it']);
});

test('ConsiglioClasseProvider: non-articulated class has no comune/separato split', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), teachingAssignments)
  );
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers: ['class', 'consiglio'], options: makeOptions() };
  const focusClasse = b.build(params, recipe).focus.classe!;
  expect(focusClasse.consiglioDiClasseComune).toBeUndefined();
  expect(focusClasse.consiglioDiClasseSeparato).toBeUndefined();
});

test('the council projection delegates grouping and ordering to GLF configuration', () => {
  expect(councilProjectionOperations).toEqual([
    {
      type: 'flatMap',
      path: 'routing.primary',
      mergeParent: true
    },
    {
      type: 'groupBy',
      keys: ['id'],
      aggregates: { assignments: { type: 'collect', path: '$item' } }
    },
    {
      type: 'sortBy',
      keys: [{ path: 'assignments.0.metadata.cognome', direction: 'ASC' }]
    },
    { type: 'strategy', name: 'aldoTeachingCouncilVm' }
  ]);
});
