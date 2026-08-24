import { DocumentiClasseProvider } from '../../../../src/application/context-engine/providers/DocumentiClasseProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithClasseDocs(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc_verbale_5a',
      ID_GEN: 'VERBALE_CDC',
      TIPO: 'VERBALE',
      SOTTOTIPO: 'ORDINARIO',
      NOME: 'Verbale 5A',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/verbale5a',
      CLASSI: '5A',
      UTENTI: '',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_condotta_5a',
      ID_GEN: 'CONDOTTA',
      TIPO: 'CONDOTTA',
      NOME: 'Condotta 5A',
      STATO: 'GENERATO',
      NOTIFICATO: '2026-03-05T08:00:00.000Z',
      LINK: 'http://d/condotta5a',
      CLASSI: '5A',
      UTENTI: '',
      DATA_CREAZ: '2026-03-02'
    },
    {
      ID: 'doc_verbale_3b',
      ID_GEN: 'VERBALE_CDC',
      TIPO: 'VERBALE',
      NOME: 'Verbale 3B',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/verbale3b',
      CLASSI: '3B',
      UTENTI: '',
      DATA_CREAZ: '2026-03-01'
    }
  );
  return t;
}

function build(classiCompetenza?: string[]) {
  const db = new FakeDatabase(tablesWithClasseDocs());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('documentiClasse', new DocumentiClasseProvider(classi, logDocs));
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z'),
    ...(classiCompetenza !== undefined ? { classiCompetenza } : {})
  };
  const recipe: Recipe = { providers: ['class', 'documentiClasse'], options: makeOptions() };
  return b.build(params, recipe);
}

test('DocumentiClasseProvider: aggregates LOG_DOCS for the single target class', () => {
  const cdu = build();
  const documenti = cdu.focus.classe!.didattica!.documenti!;
  expect(documenti.hasDocumenti).toBe(true);
  expect(documenti.items.map((i) => i.idGen).sort()).toEqual(['CONDOTTA', 'VERBALE_CDC']);
  const verbale = documenti.items.find((i) => i.idGen === 'VERBALE_CDC')!;
  expect(verbale.sottotipo).toBe('ORDINARIO');
  expect(verbale.notificato).toBe(false);
  const condotta = documenti.items.find((i) => i.idGen === 'CONDOTTA')!;
  expect(condotta.sottotipo).toBe('');
  expect(condotta.notificato).toBe(true);
});

test('DocumentiClasseProvider: aggregates across every class in classiCompetenza (coordinatore covering multiple classes)', () => {
  const cdu = build(['5A', '3B']);
  const documenti = cdu.focus.classe!.didattica!.documenti!;
  expect(documenti.items).toHaveLength(3);
  expect(documenti.items.map((i) => i.nome).sort()).toEqual([
    'Condotta 5A',
    'Verbale 3B',
    'Verbale 5A'
  ]);
});

test('DocumentiClasseProvider: no documents for the class yields hasDocumenti false', () => {
  const cdu = build(['1F']);
  expect(cdu.focus.classe!.didattica!.documenti).toEqual({ items: [], hasDocumenti: false });
});
