import { PianiPersClasseProvider } from '../../../../src/application/context-engine/providers/PianiPersClasseProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { makeOptions, recipe } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../../src/application/storico/StoricoDatabaseProvider';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function tablesWithClassePiani(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(
    {
      ID: 'doc_pdp_a1',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/a1',
      CLASSI: '5A',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_pei_a2',
      ID_GEN: 'PEI_DOC',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PEI',
      NOME: 'PEI a2',
      STATO: 'GENERATO',
      NOTIFICATO: '2026-04-01T00:00:00.000Z',
      LINK: 'http://d/a2',
      CLASSI: '5A',
      UTENTI: 'a2@school.it',
      DATA_CREAZ: '2026-03-02'
    },
    {
      ID: 'doc_verbale',
      ID_GEN: 'VERBALE_CDC',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      NOME: 'Verbale',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/v',
      CLASSI: '5A',
      UTENTI: '',
      DATA_CREAZ: '2026-03-01'
    }
  );
  return t;
}

function build(
  databases: StoricoDatabaseProvider = { anniStorici: () => [] },
  classiCompetenza?: string[],
  options = makeOptions()
): Cdu {
  const db = new FakeDatabase(tablesWithClassePiani());
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('pianiPersClasse', new PianiPersClasseProvider(classi, logDocs, alunni, databases));
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z'),
    ...(classiCompetenza !== undefined ? { classiCompetenza } : {})
  };
  const recipe: Recipe = { providers: ['class', 'pianiPersClasse'], options };
  return b.build(params, recipe);
}

function buildPianiPers(rows: Row[]): Cdu {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push(...rows);
  const db = new FakeDatabase(t);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const logDocs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider(
    'pianiPersClasse',
    new PianiPersClasseProvider(classi, logDocs, alunni, { anniStorici: () => [] })
  );
  return b.build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    { providers: ['class', 'pianiPersClasse'], options: makeOptions() }
  );
}

test('PianiPersClasseProvider: aggregates PIANO_PERS docs across the class, tags each with its student', () => {
  const cdu = build();
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(2);
  const a1Item = elenco.find((i) => i.generatoreId === 'PDP_BES')!;
  expect(a1Item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(a1Item.hasStudente).toBe(true);
  expect(a1Item.isNotificato).toBe(false);
  expect(a1Item.isVerbalizzato).toBe(false);
  const a2Item = elenco.find((i) => i.generatoreId === 'PEI_DOC')!;
  expect(a2Item.studente).toEqual({ nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' });
  expect(a2Item.isNotificato).toBe(true);
});

test('PianiPersClasseProvider: falls back to params.target when classiCompetenza is absent', () => {
  const cdu = build(undefined, undefined);
  expect(cdu.focus.classe!.pianiPersonalizzati!.elenco).toHaveLength(2);
});

test('PianiPersClasseProvider: nonVerbalizzati excludes VERBALIZZATO and exposes the elenco subtree', () => {
  const cdu = buildPianiPers([
    {
      ID: 'doc_pdp_a1',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/a1',
      CLASSI: '5A',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_pdp_verb',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP verbalizzato',
      STATO: 'VERBALIZZATO',
      NOTIFICATO: '',
      LINK: 'http://d/vp',
      CLASSI: '5A',
      UTENTI: 'a2@school.it',
      DATA_CREAZ: '2026-03-02'
    }
  ]);
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(true);
  expect(nv.elenco).toHaveLength(1);
  expect(nv.elenco[0]!.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(nv.elenco[0]!.isVerbalizzato).toBe(false);
});

test('PianiPersClasseProvider: nonVerbalizzati.hasElenco is false when every item is VERBALIZZATO', () => {
  const cdu = buildPianiPers([
    {
      ID: 'doc_verb',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PEI',
      NOME: 'PEI verb',
      STATO: 'VERBALIZZATO',
      NOTIFICATO: '',
      LINK: 'http://d/v',
      CLASSI: '5A',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    }
  ]);
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(false);
  expect(nv.elenco).toEqual([]);
});

test('DOCENTE_COMPLETO recipe populates nonVerbalizzati alongside elenco', () => {
  const t = tablesWithClassePiani();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_verb_pdp',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI verb',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/vp',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-03'
  });
  const db = new FakeDatabase(t);
  const cdu = composeContextBuilder(db).build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('DOCENTE_COMPLETO')
  );
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(true);
  expect(nv.elenco).toHaveLength(2); // both GENERATO rows; the VERBALIZZATO one excluded
});

test('PianiPersClasseProvider: storico LazyRef resolves empty (no DB opened) when includiStorico is false', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(databases);
  expect(cdu.focus.classe!.pianiPersonalizzati!.storico.get()).toEqual([]);
  expect(opened).toBe(false);
});

test('PianiPersClasseProvider: storico resolves prior-year docs per distinct student in the current-year list', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'old_pdp_a1',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PDP_DSA',
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
  const cdu = build(databases, undefined, makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 }));
  const storico = cdu.focus.classe!.pianiPersonalizzati!.storico.get();
  expect(storico).toEqual([
    {
      annoScolastico: '2025-2026',
      documento: expect.objectContaining({ nome: 'PDP a1 anno scorso', link: 'http://d/old', tipo: 'PIANO_PERS' })
    }
  ]);
});
