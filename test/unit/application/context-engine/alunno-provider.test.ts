import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { SchoolProvider } from '../../../../src/application/context-engine/providers/SchoolProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { CarenzeProvider } from '../../../../src/application/context-engine/providers/CarenzeProvider';
import { PianiProvider } from '../../../../src/application/context-engine/providers/PianiProvider';
import { MovimentiProvider } from '../../../../src/application/context-engine/providers/MovimentiProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { MovimentoAlunnoRepository } from '../../../../src/infrastructure/repositories/MovimentoAlunnoRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type { AnnoStorico, StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function build(
  target: string,
  tables = fixtureTables(),
  storicoDb: StoricoDatabaseProvider = noHistory(),
  options = makeOptions()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const oreAsl = new OreASLRepository(db);
  const b = new ContextBuilder();
  b.registerProvider(
    'school',
    new SchoolProvider(
      new MasterSheetRepository(db),
      new RuoloSpecialeRepository(db),
      new DocenteRepository(db)
    )
  );
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'student',
    new AlunnoProvider(
      alunni,
      classi,
      oreAsl,
      materie,
      storicoDb,
      new AldoTeachingAssignmentResolver(db)
    )
  );
  b.registerProvider('movimenti', new MovimentiProvider(new MovimentoAlunnoRepository(db), alunni, classi));
  b.registerProvider('carenze', new CarenzeProvider(alunni, materie));
  b.registerProvider('piani', new PianiProvider(alunni));
  const params: BuildParams = {
    target,
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z')
  } as BuildParams;
  const recipe: Recipe = {
    providers: ['school', 'class', 'student', 'movimenti', 'carenze', 'piani'],
    options
  };
  return b.build(params, recipe);
}

test('AlunnoProvider: flat identity/religione/curriculum/classe + ASL hours (02 §4.2)', () => {
  const a = build('a1@school.it').focus.alunno!;
  expect(a.nomeCompleto).toBe('VERDI ANNA');
  expect(a.email).toBe('a1@school.it');
  expect(a.religione).toBe('IRC');
  expect(a.religioneLabel).toBe('Religione cattolica');
  expect(a.isBes).toBe(true);
  expect(a.isRipetente).toBe(false);
  expect(a.isRappresentante).toBe(true);
  // includiStorico defaults to false — the lookup is gated off, storicoDb is never touched.
  expect(a.presenza.annoPrecedente).toEqual({ isCalcolato: false, isPresente: false });
  expect(a.presenza.isPresenteTuttoAnno).toBe(true); // a1@school.it has no MOV_ALUNNI row in fixtureTables()
  expect(a.curriculum).toEqual([
    expect.objectContaining({
      materiaId: 'INTERP',
      materiaSigla: 'INTERP',
      materiaNome: 'INTERP',
      specifiche: [{ nome: 'CHITARRA', nomeCapitalizzato: 'CHITARRA' }, { nome: 'PIANO', nomeCapitalizzato: 'PIANO' }]
    })
  ]);
  expect(a.classe).toEqual({
    nome: '5A',
    indirizzo: expect.objectContaining({ sigla: 'SCIENTIFICO', nome: 'Liceo scientifico' })
  });
  expect(a.asl).toEqual({ oreCumulate: 100, oreAnnoCorrente: 60 });
});

test('AlunnoProvider: exposes the student council subjects as an array', () => {
  expect(Array.isArray(build('a1@school.it').focus.alunno!.consiglio?.materie)).toBe(true);
});

test('AlunnoProvider: empty-string CURRICULUM cell (not null) does not crash JSON.parse (regression)', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).find((r) => r['EMAIL'] === 'a3@school.it')!['CURRICULUM'] = '';
  const a = build('a3@school.it', tables).focus.alunno!;
  expect(a.curriculum).toEqual([]);
});

test('CarenzeProvider: elenco flattened from CARENZE (02 §4.2)', () => {
  const c = build('a1@school.it').focus.alunno!.carenze;
  expect(c.numero).toBe(3);
  expect(c.hasElenco).toBe(true);
  expect(c.elenco.map((item) => `${item.materiaSigla}:${item.voto}`).sort()).toEqual([
    'FISI:Studio scarso',
    'MATE:4.5',
    'MATE:5'
  ]);
});

test('PianiProvider: elenco + isBes update of the placeholder AlunnoProvider set (09 §4 note)', () => {
  const a = build('a1@school.it').focus.alunno!;
  expect(a.piani.elenco).toEqual([
    {
      tipo: 'PEI',
      tipoLabel: 'PEI',
      isBes: true,
      link: null,
      hasLink: false,
      parametriGenerazione: { gravita: 'media' },
      hasParametriGenerazione: true
    }
  ]);
  expect(a.piani.hasBes).toBe(true);
  expect(a.isBes).toBe(true);
  expect(a).toMatchObject({ isPei: true, isPfp: false, isAltroBes: false });
});

test('a non-BES student (PFP): isBes stays false, class resolved for alunno target', () => {
  const a = build('a3@school.it').focus.alunno!;
  expect(a.isBes).toBe(false);
  expect(a).toMatchObject({ isPei: false, isPfp: true, isAltroBes: false });
  expect(a.piani.elenco).toEqual([
    { tipo: 'PFP', tipoLabel: 'PFP', isBes: false, link: null, hasLink: false, parametriGenerazione: {}, hasParametriGenerazione: true }
  ]);
  expect(a.classe.nome).toBe('5A');
});

test('a PDP_BES student: isAltroBes and isBes are true, isDsa/isPei/isPfp/isStranieri stay false', () => {
  const tables = fixtureTables();
  (tables['PIANI'] as Row[]).push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: null });
  const a = build('a1@school.it', tables).focus.alunno!;
  expect(a).toMatchObject({
    isBes: true,
    isAltroBes: true,
    isDsa: false,
    isPfp: false,
    isStranieri: false
  });
});

test('AlunnoProvider: presenza.annoPrecedente.isPresente is true when a previous-year ALUNNI record exists (ANALYSIS_HISTORIC_ENRICH_EXTENSION §4)', () => {
  const priorTables = fixtureTables();
  const priorDb = new FakeDatabase(priorTables);
  const storicoDb: StoricoDatabaseProvider = {
    anniStorici: (profondita: number): AnnoStorico[] =>
      profondita > 0
        ? [{ anno: '2025-2026', db: priorDb, logDocs: {} as never }]
        : []
  };
  // presenza.annoPrecedente is gated behind includiStorico (matches every other
  // historical-data provider in the recipe) — must opt in for this fake to be consulted.
  const a = build(
    'a1@school.it',
    fixtureTables(),
    storicoDb,
    makeOptions({ includiStorico: true })
  ).focus.alunno!;
  expect(a.presenza.annoPrecedente).toEqual({ isCalcolato: true, isPresente: true }); // a1@school.it exists in fixtureTables() ALUNNI both times
});

test('MovimentiProvider: presenza.isPresenteTuttoAnno is false when the student changed INTO their current class mid-year', () => {
  const tables = fixtureTables();
  (tables['MOV_ALUNNI'] as Row[]).push({
    STUDENTE: 'a1@school.it',
    TIPO: 'CAMBIO',
    DATA: '2026-02-01',
    DA: '4A',
    A: '5A'
  });
  const a = build('a1@school.it', tables).focus.alunno!;
  expect(a.presenza.isPresenteTuttoAnno).toBe(false);
});

test('MovimentiProvider: presenza.isPresenteTuttoAnno stays true for a transfer AWAY from the current class (not an interruption of it)', () => {
  const tables = fixtureTables();
  (tables['MOV_ALUNNI'] as Row[]).push({
    STUDENTE: 'a1@school.it',
    TIPO: 'CAMBIO',
    DATA: '2026-02-01',
    DA: '5A',
    A: '5B'
  });
  const a = build('a1@school.it', tables).focus.alunno!;
  expect(a.presenza.isPresenteTuttoAnno).toBe(true);
});
