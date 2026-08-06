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

function build(
  target: string,
  tables = fixtureTables(),
  optionOverrides: Parameters<typeof makeOptions>[0] = {}
): Cdu {
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
    options: makeOptions(optionOverrides)
  };
  return b.build(params, recipe);
}

test('StudentiProvider: listaCompleta contains only active students (02 §4.1)', () => {
  const s = build('5A').focus.classe!.studenti!;
  expect(s.listaCompleta.map((a) => a.anagrafica.email)).toEqual(['a1@school.it']);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 'a2@school.it')).toBe(false);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 'a3@school.it')).toBe(false);
  expect(s).not.toHaveProperty('perIndirizzo');
  expect(s).not.toHaveProperty('indirizziPresenti');
});

test('StudentiProvider: every student carries self-contained classe/indirizzo/religioneLabel (02 §4.1/§8.7)', () => {
  const cdu = build('5A');
  const alunno = cdu.focus.classe!.studenti!.listaCompleta[0]!;
  expect(alunno.classe).toEqual({ nome: cdu.focus.classe!.anagrafica.nome });
  expect(alunno.indirizzo).toEqual({
    nome: cdu.focus.classe!.anagrafica.indirizzo.nome,
    nomeSintetico: cdu.focus.classe!.anagrafica.indirizzo.nomeSintetico
  });
  expect(alunno.status.religioneLabel).toBe('Religione cattolica');
});

test('StudentiProvider: full alunno-in-context VM (status/curriculum/didattica)', () => {
  const a1 = build('5A').focus.classe!.studenti!.listaCompleta.find(
    (a) => a.anagrafica.email === 'a1@school.it'
  )!;
  expect(a1).toEqual({
    anagrafica: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
    classe: { nome: '5A' },
    indirizzo: { nome: 'Liceo scientifico', nomeSintetico: 'Scientifico' },
    status: {
      isBes: true,
      isRipetente: false,
      isRappresentante: true,
      religione: 'IRC',
      religioneLabel: 'Religione cattolica'
    },
    curriculum: [
      {
        materiaId: 'INTERP',
        materiaSigla: 'INTERP',
        materiaNome: 'INTERP',
        specifiche: [{ nome: 'CHITARRA' }, { nome: 'PIANO' }]
      }
    ],
    didattica: {
      // getCarenze returns rows most-recent first: prog.2 (MATE 5) then prog.1 (MATE 4.5, FISI ...).
      carenze: {
        hasCarenze: true,
        numero: 3,
        dettaglio: [
          { materia: 'MATE', materiaNome: 'Matematica', voto: '5' },
          { materia: 'MATE', materiaNome: 'Matematica', voto: '4.5' },
          { materia: 'FISI', materiaNome: 'Fisica', voto: 'Studio scarso' }
        ]
      },
      piani: {
        hasPiani: true,
        hasBes: true,
        items: [{ tipo: 'PEI', tipoLabel: 'PEI', isBes: true }]
      },
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

test('StudentiProvider: articulated parent aggregates the roster across both partner classes, no perIndirizzo/indirizziPresenti (09 §10)', () => {
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
  expect(s.listaCompleta.map((a) => a.anagrafica.email)).toEqual(['s1@school.it', 's2@school.it']);
  expect(s.listaCompleta.some((a) => a.anagrafica.email === 's3@school.it')).toBe(false);
  expect(s).not.toHaveProperty('perIndirizzo');
  expect(s).not.toHaveProperty('indirizziPresenti');
});

test('StudentiProvider: every articulated-parent student is self-contained to the FOCUSED (parent) classe/indirizzo, not their own partner class (09 §10)', () => {
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
  const s1 = s.listaCompleta.find((a) => a.anagrafica.email === 's1@school.it')!;
  const s2 = s.listaCompleta.find((a) => a.anagrafica.email === 's2@school.it')!;
  const focusIndirizzo = {
    nome: cdu.focus.classe!.anagrafica.indirizzo.nome,
    nomeSintetico: cdu.focus.classe!.anagrafica.indirizzo.nomeSintetico
  };
  expect(s1.classe).toEqual({ nome: '1F' });
  expect(s2.classe).toEqual({ nome: '1F' });
  expect(s1.indirizzo).toEqual(focusIndirizzo);
  expect(s2.indirizzo).toEqual(focusIndirizzo);
});

test('has no perIndirizzo or indirizziPresenti on the studenti node, even for an articulated parent', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).push({
    EMAIL: 's1@school.it',
    COGNOMENOME: 'ALFA UNO',
    CLASSE: '1F-LSO',
    RELIGIONE: 'IRC',
    ATTIVO: true,
    RIPETENTE: false,
    RAPPR_STUD: false,
    CURRICULUM: null
  });
  const cdu = build('1F', tables);
  expect(cdu.focus.classe!.studenti).not.toHaveProperty('perIndirizzo');
  expect(cdu.focus.classe!.studenti).not.toHaveProperty('indirizziPresenti');
});

test('StudentiProvider: populates perSpecificita only when includiSpecificita is true (02 §2.14/§8.9)', () => {
  const cdu = build('5A', fixtureTables(), { includiSpecificita: true });
  expect(cdu.focus.classe!.studenti!.perSpecificita).toEqual([
    {
      materiaId: 'INTERP',
      materiaSigla: 'INTERP',
      materiaNome: 'INTERP',
      specifiche: [
        {
          nome: 'CHITARRA',
          alunni: [
            { nome: null, cognome: null, nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
          ]
        },
        {
          nome: 'PIANO',
          alunni: [
            { nome: null, cognome: null, nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
          ]
        }
      ]
    }
  ]);

  const cdu2 = build('5A', fixtureTables(), { includiSpecificita: false });
  expect(cdu2.focus.classe!.studenti!.perSpecificita).toBeUndefined();
});
