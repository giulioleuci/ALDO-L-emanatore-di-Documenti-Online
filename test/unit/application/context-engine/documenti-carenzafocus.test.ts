import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { DocumentiProvider } from '../../../../src/application/context-engine/providers/DocumentiProvider';
import { CarenzaFocusProvider } from '../../../../src/application/context-engine/providers/CarenzaFocusProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import type {
  AnnoStorico,
  StoricoDatabaseProvider
} from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(
  target: string,
  providers: string[],
  params: Partial<BuildParams>,
  tables = fixtureTables(),
  databases: StoricoDatabaseProvider = { anniStorici: () => [] },
  options = makeOptions()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  const noHistory: StoricoDatabaseProvider = { anniStorici: () => [] };
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'student',
    new AlunnoProvider(
      alunni,
      classi,
      new OreASLRepository(db),
      new MateriaRepository(db),
      noHistory,
      new AldoTeachingAssignmentResolver(db)
    )
  );
  b.registerProvider(
    'documenti',
    new DocumentiProvider(new LogDocumentoRepository(db, new LazyRef(() => classi)), databases)
  );
  b.registerProvider('carenzaFocus', new CarenzaFocusProvider(alunni));
  const full: BuildParams = {
    target,
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z'),
    ...params
  };
  const recipe: Recipe = { providers, options };
  return b.build(full, recipe);
}

function withDocs() {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc1',
      ID_GEN: 'g1',
      TIPO: 'PDP',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1',
      STATO: 'GENERATO',
      NOTIFICATO: '2026-03-05T10:00:00.000Z',
      LINK: 'http://d/1',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc2',
      ID_GEN: 'g2',
      TIPO: 'VERBALE',
      NOME: 'Verbale',
      STATO: 'GENERATO',
      UTENTI: 'a2@school.it',
      LINK: 'http://d/2',
      DATA_CREAZ: '2026-03-02'
    }
  );
  return t;
}

test('DocumentiProvider: items of the student from LOG_DOCS, unfiltered by tipo (02 §4.2)', () => {
  const d = build('a1@school.it', ['class', 'student', 'documenti'], {}, withDocs()).focus.alunno!
    .documenti!;
  expect(d.hasElenco).toBe(true);
  expect(d.numero).toBe(1);
  expect(d.elenco[0]).toMatchObject({
    id: 'doc1',
    hasId: true,
    nome: 'PDP a1',
    link: 'http://d/1',
    tipo: 'PDP',
    sottotipo: 'PDP_DSA',
    hasSottotipo: true,
    generatoreId: 'g1',
    stato: 'GENERATO',
    isNotificato: true,
    dataCreazione: '2026-03-01'
  });
});

test('DocumentiProvider: student with no documents', () => {
  const d = build('a3@school.it', ['class', 'student', 'documenti'], {}, withDocs()).focus.alunno!
    .documenti!;
  expect(d.hasElenco).toBe(false);
  expect(d.elenco).toEqual([]);
});

test('DocumentiProvider: storico LazyRef always attached but resolves empty (no DB opened) when includiStorico is false', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build('a1@school.it', ['class', 'student', 'documenti'], {}, withDocs(), databases);
  const storico = cdu.focus.alunno!.documenti!.storico;
  expect(opened).toBe(false);
  expect(storico.get()).toEqual([]);
  expect(opened).toBe(false);
});

test('DocumentiProvider: storico LazyRef resolves prior-year documents when includiStorico is true', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old1',
    ID_GEN: 'CD_PDP',
    TIPO: 'PDP',
    NOME: 'PDP a1 anno scorso',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/old',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2025-03-01'
  });
  const db = new FakeDatabase(t);
  const anno: AnnoStorico = {
    anno: '2025-2026',
    db,
    logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
  };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    'a1@school.it',
    ['class', 'student', 'documenti'],
    {},
    fixtureTables(),
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.documenti!.storico.get();
  expect(storico).toEqual([
    expect.objectContaining({
      anno: '2025-2026',
      nome: 'PDP a1 anno scorso',
      link: 'http://d/old',
      tipo: 'PDP'
    })
  ]);
});

test('CarenzaFocusProvider: most recent carenza by default (02 §4.3)', () => {
  const c = build('a1@school.it', ['class', 'student', 'carenzaFocus'], {}).focus.carenza!;
  expect(c).toMatchObject({
    studente: { email: 'a1@school.it' },
    progressivo: 2,
    data: '2026-05-20',
    classe: { nome: '5A' },
    hasAssenze: false,
    note: ''
  });
});

test('CarenzaFocusProvider: selected progressivo with assenze flag', () => {
  const c = build('a1@school.it', ['class', 'student', 'carenzaFocus'], { carenzaProgressivo: 1 })
    .focus.carenza!;
  expect(c).toMatchObject({
    studente: { email: 'a1@school.it' },
    progressivo: 1,
    data: '2026-02-15',
    classe: { nome: '5A' },
    hasAssenze: true,
    note: ''
  });
});
