import { StoricoClasseProvider } from '../../../../../src/application/context-engine/providers/StoricoClasseProvider';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { LogDocumentoRepository } from '../../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { ClasseProvider } from '../../../../../src/application/context-engine/providers/ClasseProvider';
import { ContextBuilder } from '../../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../../src/application/context-engine/Recipe';
import type {
  AnnoStorico,
  StoricoDatabaseProvider
} from '../../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../../src/infrastructure/repositories/AlunnoRepository';
import { FakeDatabase } from '../../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../../fixtures/tables';
import type { Row } from '../../../../../src/infrastructure/db/Database';

function historicalTables(): Record<string, Row[]> {
  return {
    CLASSI: [{ ID: '4A', ANNO: 4, INDIRIZZO: 'SCIENTIFICO', ATTIVA: false, STORICO: '' }],
    ALUNNI: [
      {
        EMAIL: 'x1@school.it',
        COGNOMENOME: 'X1',
        CLASSE: '4A',
        RELIGIONE: 'NO',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false
      },
      {
        EMAIL: 'x2@school.it',
        COGNOMENOME: 'X2',
        CLASSE: '4A',
        RELIGIONE: 'NO',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false
      },
      {
        EMAIL: 'x3@school.it',
        COGNOMENOME: 'X3',
        CLASSE: '4A',
        RELIGIONE: 'NO',
        ATTIVO: false,
        RIPETENTE: false,
        RAPPR_STUD: false
      }
    ],
    PROGETTI: [
      {
        CLASSE: '4A',
        TIPO: 'ASL',
        NOME: 'Stage vecchio',
        REFERENTE: 'esterno@x.it',
        ORE: 40,
        ORE_ASL: 30
      }
    ]
  };
}

function fakeStoricoProvider(anni: AnnoStorico[]): StoricoDatabaseProvider {
  return { anniStorici: () => anni };
}

function build(providers: string[], databases: StoricoDatabaseProvider, options = makeOptions()) {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('storicoClasse', new StoricoClasseProvider(databases, classi));
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = { providers, options };
  return b.build(params, recipe);
}

test('includiStorico false: provider is a no-op, no historical database opened', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(['class', 'storicoClasse'], databases);
  expect(cdu.focus.classe!.storico).toBeUndefined();
  expect(opened).toBe(false);
});

test('includiStorico true: attaches an unresolved LazyRef (query not run yet)', () => {
  const db = new FakeDatabase(historicalTables());
  const anno: AnnoStorico = {
    anno: '2024-2025',
    db,
    logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
  };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'storicoClasse'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
  );
  const ref = cdu.focus.classe!.storico!;
  expect(ref).toBeInstanceOf(LazyRef);
  expect(ref.isResolved()).toBe(false);
});

test("builds ClasseStoricoVM.statistiche/progetti per historical year, using CLASSI.STORICO to resolve each year's class name", () => {
  const db = new FakeDatabase(historicalTables());
  const anno: AnnoStorico = {
    anno: '2024-2025',
    db,
    logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
  };
  const databases = fakeStoricoProvider([anno]);
  const cdu = build(
    ['class', 'storicoClasse'],
    databases,
    makeOptions({ includiStorico: true, profonditaAnniStorico: 1 })
  );
  const storico = cdu.focus.classe!.storico!.get();
  expect(storico.statistiche).toHaveLength(1);
  expect(storico.statistiche[0]!.annoScolastico).toBe('2024-2025');
  expect(storico.statistiche[0]!.classe).toBe('4A');
  expect(storico.statistiche[0]!.statistiche.totale).toBe(2);
  expect(storico.progetti).toHaveLength(1);
  expect(storico.progetti[0]!.annoScolastico).toBe('2024-2025');
  expect(storico.progetti[0]!.classe).toBe('4A');
  expect(storico.progetti[0]!.progetti).toHaveLength(1);
  expect(storico.progetti[0]!.progetti[0]!.nome).toBe('Stage vecchio');
});
