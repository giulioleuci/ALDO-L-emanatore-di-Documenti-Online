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
  } as BuildParams;
  const recipe: Recipe = {
    providers: ['school', 'class', 'tutor', 'rappresentanti'],
    options: makeOptions()
  };
  return b.build(params, recipe);
}

test('ClasseProvider: flat identity + flags for a standard terminal class (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.nome).toBe('5A');
  expect(c.anno).toBe(5);
  expect(c.sezione).toBe('A');
  expect(c.indirizzo).toEqual({
    nome: 'Liceo scientifico',
    nomeSintetico: 'Scientifico',
    sigla: 'SCIENTIFICO',
    tipo: 'LICEO',
    tipoLabel: 'Liceo'
  });
  expect(c.isClassePrima).toBe(false);
  expect(c.isTriennio).toBe(true);
  expect(c.isPrimoBiennio).toBe(false);
  expect(c.isTerminale).toBe(true);
  expect(c.isArticolata).toBe(false);
  expect(c.articolazione).toBeUndefined();
});

test('ClasseProvider: coordinatori as a PersonaVM elenco with aggregate declension in collettivo (02 §4.1, §8.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.coordinatori?.collettivo).toEqual(
    expect.objectContaining({ appellativo: 'Prof.', articolo: 'Il', coordinamento: 'Coordinatore' })
  );
  expect(c.coordinatori?.elenco).toEqual([
    expect.objectContaining({ nomeCompleto: 'ROSSI MARIO', email: 'rossi@school.it', appellativo: 'Prof.' })
  ]);
  expect(c.coordinatori).toMatchObject({
    elencoDescrizioneElenco: 'Prof. ROSSI MARIO',
    descrizioneRuolo: 'Coordinatore prof. ROSSI MARIO',
    descrizioneRuoloEstesa: 'Il coordinatore prof. ROSSI MARIO'
  });
});

test('ClasseProvider: coordinatori.elenco is empty when there is no coordinator', () => {
  const tables = fixtureTables();
  (tables.CLASSI!.find((r) => r.ID === '5A')!).COORD = '';
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, undefined, materie));
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') } as BuildParams;
  const recipe: Recipe = { providers: ['class'], options: makeOptions() };
  const c = b.build(params, recipe).focus.classe!;
  expect(c.coordinatori?.elenco).toEqual([]);
  expect(c.coordinatori?.hasElenco).toBe(false);
});

test('TutorProvider: focus.classe.tutor from CLASSI.RUOLI as PersonaVM, with aggregate declension (02 §4.1, §8.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.tutor?.collettivo.appellativo).toBe('Prof.');
  expect(c.tutor?.collettivo.articolo).toBe('I');
  expect(c.tutor?.collettivo.sostantivo).toBe('Tutor');
  expect(c.tutor?.asl.map((t) => t.email)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  expect(c.tutor?.asl.map((t) => t.nomeCompleto)).toEqual(['BIANCHI LUCIA', 'ROSSI MARIO']);
  expect(c.tutor?.orientamento).toEqual([]);
});

test('RappresentantiProvider: student reps with email, no parent reps in fixtures (02 §4.1)', () => {
  const c = build('5A').focus.classe!;
  expect(c.rappresentanti?.studenti.elenco).toEqual([
    { studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, indirizzo: null, hasIndirizzo: false }
  ]);
  expect(c.rappresentanti?.genitori.elenco).toEqual([]);
});

test('RappresentantiProvider: attaches studente.nomeCompleto to each genitore for ordinary classes', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]) = [
    {
      EMAIL: 'marco@school.it',
      COGNOMENOME: 'Marco Neri',
      CLASSE: '5A',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      RAPPR_GEN: 'Giuseppe Neri',
      CURRICULUM: null
    }
  ];
  const c = build('5A', tables).focus.classe!;
  expect(c.rappresentanti?.studenti.elenco).toEqual([]);
  expect(c.rappresentanti?.genitori.elenco).toEqual([
    {
      nomeCompleto: 'Giuseppe Neri',
      studente: { nomeCompleto: 'Marco Neri', email: 'marco@school.it' },
      indirizzo: null,
      hasIndirizzo: false,
      descrizione: 'Giuseppe Neri (Marco Neri)'
    }
  ]);
});

test('ClasseProvider: articulated parent flags + materie split (02 §4.1, 09 §9)', () => {
  const c = build('1F').focus.classe!;
  expect(c.anno).toBe(1);
  expect(c.isArticolata).toBe(true);
  expect(c.isParent).toBe(true);
  expect(c.isClassePrima).toBe(true);
  expect(c.articolazione?.classeSorella).toBeNull();
  expect(c.articolazione?.sottoClassi).toEqual([{ nome: '1F-LSO' }, { nome: '1F-LSS' }]);
  expect(c.articolazione?.parent).toBeNull();
  expect(c.articolazione?.materieComuni).toHaveLength(1);
  expect(c.articolazione?.materieComuni[0]).toMatchObject({ sigla: 'MATE', nome: 'Matematica' });
  expect(c.articolazione?.materieSeparatePrimo).toHaveLength(1);
  expect(c.articolazione?.materieSeparatePrimo[0]).toMatchObject({ sigla: 'FISI', nome: 'Fisica' });
  expect(c.articolazione?.materieSeparateSecondo).toHaveLength(1);
  expect(c.articolazione?.materieSeparateSecondo[0]).toMatchObject({ sigla: 'FISI', nome: 'Fisica' });
});

test('ClasseProvider: articulated partner points to descriptive parent + counterpart (02 §4.1, 09 §9)', () => {
  const c = build('1F-LSO').focus.classe!;
  expect(c.isParent).toBe(false);
  expect(c.isSottoClasse).toBe(true);
  expect(c.articolazione?.parent).toEqual({
    nome: '1F',
    anno: 1,
    indirizzi: [
      { sigla: 'SCIENTIFICO', nome: 'Liceo scientifico', nomeSintetico: 'Scientifico', tipo: 'LICEO', tipoLabel: 'Liceo' },
      {
        sigla: 'LSSA',
        nome: 'Liceo scientifico scienze applicate',
        nomeSintetico: 'Scienze applicate',
        tipo: 'LICEO',
        tipoLabel: 'Liceo'
      }
    ],
    hasIndirizzi: true,
    indirizziDescrizione: 'Liceo scientifico, Liceo scientifico scienze applicate'
  });
  expect(c.articolazione?.classeSorella).toEqual({ nome: '1F-LSS' });
  expect(c.articolazione?.sottoClassi).toEqual([]);
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
  expect(c.rappresentanti?.studenti.elenco).toEqual([
    {
      studente: { nomeCompleto: 'DUE REP', email: 'r2@school.it' },
      indirizzo: expect.objectContaining({ nome: 'Liceo scientifico scienze applicate', tipoLabel: 'Liceo' }),
      hasIndirizzo: true
    },
    {
      studente: { nomeCompleto: 'UNO REP', email: 'r1@school.it' },
      indirizzo: expect.objectContaining({ nome: 'Liceo scientifico', tipoLabel: 'Liceo' }),
      hasIndirizzo: true
    }
  ]);
  expect(c.rappresentanti?.genitori.elenco).toEqual([
    {
      nomeCompleto: 'Tre Genitore',
      studente: { nomeCompleto: 'DUE REP', email: 'r2@school.it' },
      indirizzo: expect.objectContaining({ nome: 'Liceo scientifico scienze applicate' }),
      hasIndirizzo: true,
      descrizione: 'Tre Genitore (DUE REP)'
    }
  ]);
});

test('ClasseProvider: articulated parent merges coordinatori across partners into one PersonaVM elenco (09 §10)', () => {
  const tables = fixtureTables();
  const classi = tables['CLASSI'] as Row[];
  const parent = classi.find((r) => r['ID'] === '1F')!;
  const lss = classi.find((r) => r['ID'] === '1F-LSS')!;
  parent['COORD'] = '';
  lss['COORD'] = 'bianchi@school.it';

  const c = build('1F', tables).focus.classe!;
  expect(c.coordinatori?.collettivo).toEqual(
    expect.objectContaining({ appellativo: 'Prof.', articolo: 'I', coordinamento: 'Coordinatori' })
  );
  expect(c.coordinatori).toMatchObject({
    elencoDescrizioneElenco: 'Prof.ssa BIANCHI LUCIA, prof. ROSSI MARIO',
    descrizioneRuolo: 'Coordinatori prof.ssa BIANCHI LUCIA e prof. ROSSI MARIO',
    descrizioneRuoloEstesa: 'I coordinatori prof.ssa BIANCHI LUCIA e prof. ROSSI MARIO'
  });
});
