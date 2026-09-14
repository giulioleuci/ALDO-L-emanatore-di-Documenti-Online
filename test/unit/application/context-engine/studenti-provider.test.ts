import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { StudentiProvider } from '../../../../src/application/context-engine/providers/StudentiProvider';
import { StatisticheProvider } from '../../../../src/application/context-engine/providers/StatisticheProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function build(
  target: string,
  tables = fixtureTables(),
  optionOverrides: Parameters<typeof makeOptions>[0] = {},
  storicoDb: StoricoDatabaseProvider = noHistory()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'students',
    new StudentiProvider(classi, alunni, materie, new OreASLRepository(db), storicoDb)
  );
  b.registerProvider(
    'statistiche',
    new StatisticheProvider(classi, new DocenteRepository(db), alunni)
  );
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['class', 'students', 'statistiche'],
    options: makeOptions(optionOverrides)
  };
  return b.build(params, recipe);
}

test('StudentiProvider: elenco contains only active students (02 §4.1)', () => {
  const s = build('5A').focus.classe!.studenti!;
  expect(s.elenco.map((a) => a.email)).toEqual(['a1@school.it']);
  expect(s.elenco.some((a) => a.email === 'a2@school.it')).toBe(false);
  expect(s.elenco.some((a) => a.email === 'a3@school.it')).toBe(false);
});

test('StudentiProvider: every student carries a self-contained classe/indirizzo/religioneLabel (02 §4.1/§8.7)', () => {
  const cdu = build('5A');
  const alunno = cdu.focus.classe!.studenti!.elenco[0]!;
  expect(alunno.classe.nome).toBe(cdu.focus.classe!.nome);
  expect(alunno.classe.indirizzo).toEqual(
    expect.objectContaining({
      nome: cdu.focus.classe!.indirizzo.nome,
      nomeSintetico: cdu.focus.classe!.indirizzo.nomeSintetico
    })
  );
  expect(alunno.religioneLabel).toBe('Religione cattolica');
});

test('StudentiProvider: full flat AlunnoVM (status/curriculum/carenze/piani/asl)', () => {
  const a1 = build('5A').focus.classe!.studenti!.elenco.find((a) => a.email === 'a1@school.it')!;
  expect(a1).toMatchObject({
    nomeCompleto: 'VERDI ANNA',
    email: 'a1@school.it',
    classe: { nome: '5A' },
    isBes: true,
    isPei: true,
    isPfp: false,
    isAltroBes: false,
    isRipetente: false,
    isRappresentante: true,
    religione: 'IRC',
    religioneLabel: 'Religione cattolica',
    // includiStorico defaults to false — the lookup is gated off, storicoDb is
    // never touched, so this is the placeholder value (MovimentiProvider is not
    // in this recipe, so presenza.isPresenteTuttoAnno also stays its placeholder true).
    presenza: { annoPrecedente: { isCalcolato: false, isPresente: false }, isPresenteTuttoAnno: true }
  });
  // getCarenze returns rows most-recent first: prog.2 (MATE 5) then prog.1 (MATE 4.5, FISI ...).
  expect(a1.carenze.numero).toBe(3);
  expect(a1.carenze.elenco.map((c) => `${c.materiaSigla}:${c.voto}`).sort()).toEqual([
    'FISI:Studio scarso',
    'MATE:4.5',
    'MATE:5'
  ]);
  expect(a1.piani.elenco).toEqual([
    { tipo: 'PEI', tipoLabel: 'PEI', isBes: true, link: null, hasLink: false, parametriGenerazione: null, hasParametriGenerazione: false }
  ]);
  expect(a1.piani.hasBes).toBe(true);
  expect(a1.curriculum).toEqual([
    expect.objectContaining({
      materiaId: 'INTERP',
      materiaSigla: 'INTERP',
      materiaNome: 'INTERP',
      specifiche: [{ nome: 'CHITARRA', nomeCapitalizzato: 'CHITARRA' }, { nome: 'PIANO', nomeCapitalizzato: 'PIANO' }]
    })
  ]);
  expect(a1.asl.oreCumulate).toBe(100);
});

test('StudentiProvider: perStato.altroBes tracks students with a PDP_BES plan', () => {
  const tables = fixtureTables();
  (tables['PIANI'] as Row[]).push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: null });
  const perStato = build('5A', tables).focus.classe!.studenti!.perStato;
  expect(perStato.altroBes.map((a) => a.email)).toEqual(['a1@school.it']);
  expect(perStato.hasAltroBes).toBe(true);
  expect(perStato.numeroAltroBes).toBe(1);
});

test('StatisticheProvider: class stats over active students (09 §11, 02 §4.1)', () => {
  const s = build('5A').focus.classe!.studenti!;
  expect(s.statistiche).toEqual({
    totale: 1,
    conPiani: 1,
    conBes: 1,
    conDsa: 0,
    ripetenti: 0,
    rappresentanti: 1
  });
});

test('StudentiProvider: articulated parent aggregates the roster across both partner classes (09 §10)', () => {
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
    },
    {
      EMAIL: 's3@school.it',
      COGNOMENOME: 'GAMMA TRE',
      CLASSE: '1F-LSS',
      RELIGIONE: 'IRC',
      ATTIVO: false,
      RIPETENTE: false,
      RAPPR_STUD: false,
      CURRICULUM: null
    }
  );
  const cdu = build('1F', tables);
  const s = cdu.focus.classe!.studenti!;
  expect(s.elenco.map((a) => a.email)).toEqual(['s1@school.it', 's2@school.it']);
  expect(s.elenco.some((a) => a.email === 's3@school.it')).toBe(false);
});

test('StudentiProvider: every articulated-parent student stays self-contained to the class it actually attends ("classe frequentata alla data di riferimento", 08 §8.7), not the focused parent (09 §10)', () => {
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
  const cdu = build('1F', tables);
  const s = cdu.focus.classe!.studenti!;
  const s1 = s.elenco.find((a) => a.email === 's1@school.it')!;
  const s2 = s.elenco.find((a) => a.email === 's2@school.it')!;
  expect(s1.classe.nome).toBe('1F-LSO');
  expect(s2.classe.nome).toBe('1F-LSS');
  expect(s1.classe.indirizzo.sigla).toBe('SCIENTIFICO');
  expect(s2.classe.indirizzo.sigla).toBe('LSSA');
});

test('StudentiProvider: always populates perSpecificita for a class CDU (02 §2.14/§8.9)', () => {
  const cdu = build('5A', fixtureTables());
  const perSpecificita = cdu.focus.classe!.studenti!.perSpecificita;
  expect(perSpecificita).toHaveLength(1);
  expect(perSpecificita[0]).toMatchObject({
    materiaId: 'INTERP',
    materiaSigla: 'INTERP',
    materiaNome: 'INTERP'
  });
  expect(perSpecificita[0]!.specifiche.map((s) => s.nome)).toEqual(['CHITARRA', 'PIANO']);
  for (const specifica of perSpecificita[0]!.specifiche) {
    expect(specifica.alunni).toEqual([{ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }]);
  }

  expect(build('1F').focus.classe!.studenti!.perSpecificita).toEqual([]);
});

test('StudentiProvider: presenza.annoPrecedente.isPresente is computed per roster student when includiStorico is true', () => {
  const priorDb = new FakeDatabase(fixtureTables());
  const storicoDb: StoricoDatabaseProvider = {
    anniStorici: (profondita: number) =>
      profondita > 0 ? [{ anno: '2025-2026', db: priorDb, logDocs: {} as never }] : []
  };
  const tables = fixtureTables();
  const cdu = build('5A', tables, { includiStorico: true }, storicoDb);
  const a1 = cdu.focus.classe!.studenti!.elenco.find((a) => a.email === 'a1@school.it')!;
  expect(a1.presenza.annoPrecedente).toEqual({ isCalcolato: true, isPresente: true }); // exists in priorDb's fixtureTables() too
});

test('StudentiProvider: presenza.annoPrecedente is gated behind includiStorico — storicoDb is never touched when false', () => {
  let opened = false;
  const storicoDb: StoricoDatabaseProvider = {
    anniStorici: (profondita: number) => {
      opened = true;
      return profondita > 0
        ? [{ anno: '2025-2026', db: new FakeDatabase(fixtureTables()), logDocs: {} as never }]
        : [];
    }
  };
  // includiStorico omitted -> defaults to false (makeOptions default).
  const cdu = build('5A', fixtureTables(), {}, storicoDb);
  const a1 = cdu.focus.classe!.studenti!.elenco.find((a) => a.email === 'a1@school.it')!;
  expect(a1.presenza.annoPrecedente).toEqual({ isCalcolato: false, isPresente: false });
  expect(opened).toBe(false); // gate must short-circuit before storicoDb.anniStorici() is ever called
});
