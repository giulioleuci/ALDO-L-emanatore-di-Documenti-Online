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
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(target: string, tables = fixtureTables()): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider('students', new StudentiProvider(classi, alunni, materie));
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
    options: makeOptions()
  };
  return b.build(params, recipe);
}

test('StudentiProvider: listaCompleta contains only active students (02 §4.1)', () => {
  const s = build('5A').focus.classe!.studenti!;
  expect(s.listaCompleta.map((a) => a.anagrafica.email)).toEqual(['a1@school.it']);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 'a2@school.it')).toBe(false);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 'a3@school.it')).toBe(false);
  expect(s.perIndirizzo).toBeUndefined();
});

test('StudentiProvider: parent emails are exposed in the class CDU', () => {
  const cdu = build('5A');
  const studenti = cdu.focus.classe!.studenti!.listaCompleta;
  expect(studenti).toHaveLength(1);
  expect(studenti[0]!.anagrafica.email).toBe('a1@school.it');
  expect(studenti[0]!.genitori).toEqual([{ email: 'genitore1@x.it' }]);
});

test('StudentiProvider: full alunno-in-context VM (status/curriculum/didattica)', () => {
  const a1 = build('5A').focus.classe!.studenti!.listaCompleta.find(
    (a) => a.anagrafica.email === 'a1@school.it'
  )!;
  expect(a1).toEqual({
    anagrafica: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
    genitori: [{ email: 'genitore1@x.it' }],
    status: { isBes: true, isRipetente: false, isRappresentante: true, religione: 'IRC' },
    curriculum: [
      {
        materiaId: 'INTERP',
        materiaSigla: 'INTERP',
        materiaNome: 'INTERP',
        specifiche: [{ nome: 'CHITARRA' }, { nome: 'PIANO' }]
      }
    ],
    indirizzo: { sigla: 'SCIENTIFICO', nome: 'Liceo scientifico', nomeSintetico: 'Scientifico' },
    didattica: {
      // getCarenze returns rows most-recent first: prog.2 (MATE 5) then prog.1 (MATE 4.5, FISI ...).
      carenze: {
        hasCarenze: true,
        numero: 3,
        dettaglio: [
          { materia: 'MATE', voto: '5' },
          { materia: 'MATE', voto: '4.5' },
          { materia: 'FISI', voto: 'Studio scarso' }
        ]
      },
      piani: { hasPiani: true, hasBes: true, items: [{ tipo: 'PEI', isBes: true }] },
      pcto: { oreCumulate: 100 }
    }
  });
});

test('StatisticheProvider: class stats over active students (09 §11, 02 §4.1)', () => {
  const s = build('5A').focus.classe!.studenti!;
  expect(s.statistiche).toEqual({
    totale: 1,
    conPianiDidattici: 1,
    conBes: 1,
    conDsa: 0,
    ripetenti: 0,
    rappresentanti: 1
  });
});

test('StudentiProvider: articulated parent aggregates + groups by indirizzo (09 §10)', () => {
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
  const s = build('1F', tables).focus.classe!.studenti!;
  expect(s.listaCompleta.map((a) => a.anagrafica.email)).toEqual(['s1@school.it', 's2@school.it']);
  expect(s.indirizziPresenti).toEqual(['SCIENTIFICO', 'LSSA']);
  expect(Object.keys(s.perIndirizzo!)).toEqual(['SCIENTIFICO', 'LSSA']);
  expect(s.perIndirizzo!['SCIENTIFICO']!.map((a) => a.anagrafica.email)).toEqual(['s1@school.it']);
  expect(s.perIndirizzo!['LSSA']!.map((a) => a.anagrafica.email)).toEqual(['s2@school.it']);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 's3@school.it')).toBe(false);
});

test('StudentiProvider: each articulated-parent student is tagged with their OWN partner indirizzo (09 §10)', () => {
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
  const s = build('1F', tables).focus.classe!.studenti!;
  const s1 = s.listaCompleta.find((a) => a.anagrafica.email === 's1@school.it')!;
  const s2 = s.listaCompleta.find((a) => a.anagrafica.email === 's2@school.it')!;
  expect(s1.indirizzo).toEqual({
    sigla: 'SCIENTIFICO',
    nome: 'Liceo scientifico',
    nomeSintetico: 'Scientifico'
  });
  expect(s2.indirizzo).toEqual({
    sigla: 'LSSA',
    nome: 'Liceo scientifico scienze applicate',
    nomeSintetico: 'Scienze applicate'
  });
});
