import { PianiPersAlunnoProvider } from '../../../../src/application/context-engine/providers/PianiPersAlunnoProvider';
import { PianiPersAlunnoStoricoProvider } from '../../../../src/application/context-engine/providers/PianiPersAlunnoStoricoProvider';
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
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithPiani(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc_pdp_1', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/1',
      UTENTI: 'a1@school.it', DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_verbale_1', ID_GEN: 'VERBALE_CDC', TIPO: 'VERBALE', SOTTOTIPO: '',
      NOME: 'Verbale', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/v',
      UTENTI: 'a1@school.it', DATA_CREAZ: '2026-03-01'
    }
  );
  return t;
}

function build(providers: string[], databases: StoricoDatabaseProvider, options = makeOptions()) {
  const db = new FakeDatabase(tablesWithPiani());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'student',
    new AlunnoProvider(alunni, classi, new OreASLRepository(db), new MateriaRepository(db))
  );
  b.registerProvider('pianiPersAlunno', new PianiPersAlunnoProvider(new LogDocumentoRepository(db)));
  b.registerProvider('pianiPersAlunnoStorico', new PianiPersAlunnoStoricoProvider(databases));
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('PianiPersAlunnoProvider: filters LOG_DOCS to TIPO=PIANO_PERS only, tags notificato', () => {
  const cdu = build(['class', 'student', 'pianiPersAlunno'], { anniStorici: () => [] });
  expect(cdu.focus.alunno!.didattica.pianiPersonalizzati!.items).toEqual([
    {
      id: 'doc_pdp_1',
      nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA',
      idGen: 'PDP_BES', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false
    }
  ]);
});

test('PianiPersAlunnoStoricoProvider: includiStorico false ⇒ no storico key', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = { anniStorici: () => { opened = true; return []; } };
  const cdu = build(['class', 'student', 'pianiPersAlunno', 'pianiPersAlunnoStorico'], databases);
  expect(cdu.focus.alunno!.didattica.pianiPersonalizzati!.storico).toBeUndefined();
  expect(opened).toBe(false);
});

test('PianiPersAlunnoStoricoProvider: includiStorico true attaches an unresolved LazyRef with separate family, subtype and generator fields', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old_pdp', ID_GEN: 'PDP_BES', TIPO: 'PIANO_PERS', SOTTOTIPO: 'PDP_DSA',
    NOME: 'PDP a1 anno scorso', STATO: 'GENERATO', NOTIFICATO: '', LINK: 'http://d/old',
    UTENTI: 'a1@school.it', DATA_CREAZ: '2025-03-01'
  });
  const anno: AnnoStorico = { anno: '2025-2026', db: new FakeDatabase(t) };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    ['class', 'student', 'pianiPersAlunno', 'pianiPersAlunnoStorico'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.pianiPersonalizzati!.storico!.get();
  expect(storico).toEqual([
    {
      anno: '2025-2026',
      nome: 'PDP a1 anno scorso',
      link: 'http://d/old',
      tipo: 'PIANO_PERS',
      sottotipo: 'PDP_DSA',
      idGen: 'PDP_BES'
    }
  ]);
});
