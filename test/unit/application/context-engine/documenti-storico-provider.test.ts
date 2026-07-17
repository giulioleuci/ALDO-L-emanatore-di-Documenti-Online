import { DocumentiProvider } from '../../../../src/application/context-engine/providers/DocumentiProvider';
import { DocumentiStoricoProvider } from '../../../../src/application/context-engine/providers/DocumentiStoricoProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type {
  AnnoStorico,
  StoricoDatabaseProvider
} from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithDocs(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc1',
    ID_GEN: 'CD_PDP',
    TIPO: 'PDP',
    NOME: 'PDP a1',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/1',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  return t;
}

function fakeStoricoProvider(anni: AnnoStorico[]): StoricoDatabaseProvider {
  return { anniStorici: () => anni };
}

function build(providers: string[], databases: StoricoDatabaseProvider, options = makeOptions()) {
  const db = new FakeDatabase(tablesWithDocs());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, new OreASLRepository(db)));
  b.registerProvider('documenti', new DocumentiProvider(new LogDocumentoRepository(db)));
  b.registerProvider('documentiStorico', new DocumentiStoricoProvider(databases));
  const params: BuildParams = {
    target: 'a1@school.it',
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('DocumentiStoricoProvider: includiStorico false ⇒ no storico key, no historical database opened (11 §11, 13 §4)', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(['class', 'student', 'documenti', 'documentiStorico'], databases);
  expect(cdu.focus.alunno!.didattica.documenti).toEqual({
    hasDocumenti: true,
    items: [
      {
        nome: 'PDP a1',
        link: 'http://d/1',
        tipo: 'PDP',
        idGen: 'CD_PDP',
        stato: 'GENERATO',
        dataCreazione: '2026-03-01'
      }
    ]
  });
  expect(opened).toBe(false);
});

test('DocumentiStoricoProvider: includiStorico true attaches an unresolved LazyRef (13 §2)', () => {
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(fixtureTables()) };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'student', 'documenti', 'documentiStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico!;
  expect(storico).toBeDefined();
  expect(storico.isResolved()).toBe(false);
});

test('DocumentiStoricoProvider: resolving the LazyRef returns documents tagged with idGen', () => {
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
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(t) };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'student', 'documenti', 'documentiStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico!.get();
  expect(storico).toEqual([
    { anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'CD_PDP' }
  ]);
});
