import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { DocumentiProvider } from '../../../../src/application/context-engine/providers/DocumentiProvider';
import { CarenzaFocusProvider } from '../../../../src/application/context-engine/providers/CarenzaFocusProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(
  target: string,
  providers: string[],
  params: Partial<BuildParams>,
  tables = fixtureTables()
): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  const storicoDb: StoricoDatabaseProvider = { anniStorici: () => [] };
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'student',
    new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db), storicoDb)
  );
  b.registerProvider(
    'documenti',
    new DocumentiProvider(new LogDocumentoRepository(db, new LazyRef(() => classi)))
  );
  b.registerProvider('carenzaFocus', new CarenzaFocusProvider(alunni));
  const full: BuildParams = {
    target,
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z'),
    ...params
  };
  const recipe: Recipe = { providers, options: makeOptions() };
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

test('DocumentiProvider: items of the student from LOG_DOCS (02 §4.2)', () => {
  const d = build('a1@school.it', ['class', 'student', 'documenti'], {}, withDocs()).focus.alunno!
    .didattica.documenti;
  expect(d).toEqual({
    hasDocumenti: true,
    items: [
      {
        id: 'doc1',
        nome: 'PDP a1',
        link: 'http://d/1',
        tipo: 'PDP',
        idGen: 'g1',
        sottotipo: 'PDP_DSA',
        stato: 'GENERATO',
        notificato: true,
        dataCreazione: '2026-03-01'
      }
    ]
  });
});

test('DocumentiProvider: student with no documents', () => {
  const d = build('a3@school.it', ['class', 'student', 'documenti'], {}, withDocs()).focus.alunno!
    .didattica.documenti;
  expect(d).toEqual({ hasDocumenti: false, items: [] });
});

test('CarenzaFocusProvider: most recent carenza by default (02 §4.3)', () => {
  const c = build('a1@school.it', ['class', 'student', 'carenzaFocus'], {}).focus.carenza;
  expect(c).toEqual({
    studente: 'a1@school.it',
    progressivo: 2,
    data: '2026-05-20',
    classe: '5A',
    hasAssenze: false,
    note: ''
  });
});

test('CarenzaFocusProvider: selected progressivo with assenze flag', () => {
  const c = build('a1@school.it', ['class', 'student', 'carenzaFocus'], { carenzaProgressivo: 1 })
    .focus.carenza;
  expect(c).toEqual({
    studente: 'a1@school.it',
    progressivo: 1,
    data: '2026-02-15',
    classe: '5A',
    hasAssenze: true,
    note: ''
  });
});
