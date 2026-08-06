import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { SchoolProvider } from '../../../../src/application/context-engine/providers/SchoolProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { TutorProvider } from '../../../../src/application/context-engine/providers/TutorProvider';
import { RappresentantiProvider } from '../../../../src/application/context-engine/providers/RappresentantiProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Row } from '../../../../src/infrastructure/db/Database';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function build(target: string, tables = fixtureTables()) {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const b = new ContextBuilder();
  b.registerProvider(
    'school',
    new SchoolProvider(
      new MasterSheetRepository(db),
      new RuoloSpecialeRepository(db),
      new DocenteRepository(db)
    )
  );
  b.registerProvider('class', new ClasseProvider(classi, undefined, materie));
  b.registerProvider('tutor', new TutorProvider(classi));
  b.registerProvider('rappresentanti', new RappresentantiProvider(classi));
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['school', 'class', 'tutor', 'rappresentanti'],
    options: makeOptions()
  };
  return b.build(params, recipe);
}

test('ClasseProvider: anagrafica + flags for a standard terminal class (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.anagrafica).toEqual({
    nome: '5A',
    anno: 5,
    sezione: 'A',
    annoScolastico: '2025-2026',
    indirizzo: {
      nome: 'Liceo scientifico',
      nomeSintetico: 'Scientifico',
      sigla: 'SCIENTIFICO',
      tipo: 'LICEO'
    }
  });
  expect(c.flags).toEqual({
    isClassePrima: false,
    isTriennio: true,
    isPrimoBiennio: false,
    isTerminale: true,
    isArticolata: false
  });
  expect(c.articolazione).toBeUndefined();
});

test('ClasseProvider: coordinatori as a PersonVM elenco with aggregate declension and verbs (02 §4.1, §8.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.coordinatori).toEqual({
    appellativo: 'prof.',
    articolo: 'il',
    coordina: 'coordina',
    presiede: 'presiede',
    elenco: [
      expect.objectContaining({
        nomeCompleto: 'MARIO ROSSI',
        email: 'rossi@school.it',
        materia: 'MATE',
        appellativo: 'Prof.'
      })
    ]
  });
});

test('ClasseProvider: coordinatori omits aggregate fields entirely when there is no coordinator', () => {
  const tables = fixtureTables();
  (tables.CLASSI!.find((r) => r.ID === '5A')!).COORD = '';
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, undefined, materie));
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers: ['class'], options: makeOptions() };
  const c = b.build(params, recipe).focus.classe!;
  expect(c.coordinatori).toEqual({ elenco: [] });
});

test('TutorProvider: focus.classe.tutor from CLASSI.RUOLI as PersonVM, with aggregate declension (02 §4.1, §8.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.tutor?.appellativo).toBe('prof.');
  expect(c.tutor?.articolo).toBe('i');
  expect(c.tutor?.tutor).toBe('tutor');
  expect(c.tutor?.asl.map((t) => t.email)).toEqual(['rossi@school.it', 'bianchi@school.it']);
  expect(c.tutor?.asl.map((t) => t.nomeCompleto)).toEqual(['MARIO ROSSI', 'LUCIA BIANCHI']);
  expect(c.tutor?.orientamento).toEqual([]);
});

test('RappresentantiProvider: student reps with email, no parent reps in fixtures (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.rappresentanti).toEqual({
    studenti: [{ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }],
    genitori: []
  });
});

test('ClasseProvider: articulated parent flags + materie split (02 §4.1, 09 §9)', () => {
  const c = build('1F').focus.classe!;
  expect(c.anagrafica.anno).toBe(1);
  expect(c.anagrafica.annoScolastico).toBe('2025-2026');
  expect(c.flags.isArticolata).toBe(true);
  expect(c.flags.isClassePrima).toBe(true);
  expect(c.articolazione?.partner).toBeNull();
  expect(c.articolazione?.partners).toEqual(['1F-LSO', '1F-LSS']);
  expect(c.articolazione?.parent).toBeNull();
  expect(c.articolazione?.materieCondivise).toHaveLength(1);
  expect(c.articolazione?.materieCondivise[0]).toMatchObject({ sigla: 'MATE', nome: 'Matematica' });
  expect(c.articolazione?.materieSeparatePrimoGruppo).toHaveLength(1);
  expect(c.articolazione?.materieSeparatePrimoGruppo[0]).toMatchObject({
    sigla: 'FISI',
    nome: 'Fisica'
  });
  expect(c.articolazione?.materieSeparateSecondoGruppo).toHaveLength(1);
  expect(c.articolazione?.materieSeparateSecondoGruppo[0]).toMatchObject({
    sigla: 'FISI',
    nome: 'Fisica'
  });
});

test('ClasseProvider: articulated partner points to descriptive parent + counterpart (02 §4.1, 09 §9)', () => {
  const c = build('1F-LSO').focus.classe!;
  expect(c.articolazione?.parent).toEqual({
    id: '1F',
    anno: 1,
    indirizzi: [
      { sigla: 'SCIENTIFICO', nome: 'Liceo scientifico', nomeSintetico: 'Scientifico', tipo: 'LICEO' },
      {
        sigla: 'LSSA',
        nome: 'Liceo scientifico scienze applicate',
        nomeSintetico: 'Scienze applicate',
        tipo: 'LICEO'
      }
    ]
  });
  expect(c.articolazione?.partner).toBe('1F-LSS');
  expect(c.articolazione?.partners).toBeNull();
});

test('RappresentantiProvider: articulated parent merges reps across partners, tagged by indirizzo (09 §10)', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).push(
    {
      EMAIL: 'r1@school.it',
      COGNOMENOME: 'UNO REP',
      CLASSE: '1F-LSO',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: true,
      RAPPR_GEN: '',
      CURRICULUM: null
    },
    {
      EMAIL: 'r2@school.it',
      COGNOMENOME: 'DUE REP',
      CLASSE: '1F-LSS',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: true,
      RAPPR_GEN: 'Tre Genitore',
      CURRICULUM: null
    }
  );
  const c = build('1F', tables).focus.classe!;
  expect(c.rappresentanti).toEqual({
    studenti: [
      { nomeCompleto: 'UNO REP', email: 'r1@school.it', indirizzo: { nome: 'Liceo scientifico' } },
      {
        nomeCompleto: 'DUE REP',
        email: 'r2@school.it',
        indirizzo: { nome: 'Liceo scientifico scienze applicate' }
      }
    ],
    genitori: [
      { nomeCompleto: 'Tre Genitore', indirizzo: { nome: 'Liceo scientifico scienze applicate' } }
    ]
  });
});

test('ClasseProvider: articulated parent merges coordinatori across partners into one PersonVM elenco (09 §10)', () => {
  const tables = fixtureTables();
  const classi = tables['CLASSI'] as Row[];
  const parent = classi.find((r) => r['ID'] === '1F')!;
  const lss = classi.find((r) => r['ID'] === '1F-LSS')!;
  parent['COORD'] = '';
  lss['COORD'] = 'verdi@school.it';

  const c = build('1F', tables).focus.classe!;
  expect(c.coordinatori).toEqual({
    appellativo: 'prof.',
    articolo: 'i',
    coordina: 'coordinano',
    presiede: 'presiedono',
    elenco: [
      expect.objectContaining({
        nomeCompleto: 'MARIO ROSSI',
        email: 'rossi@school.it',
        materia: 'MATE',
        appellativo: 'Prof.'
      }),
      expect.objectContaining({
        nomeCompleto: 'GIO VERDI',
        email: 'verdi@school.it',
        materia: 'FISI',
        appellativo: 'Prof.'
      })
    ]
  });
});
