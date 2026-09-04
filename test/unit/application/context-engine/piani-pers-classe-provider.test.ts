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

function build(
  tables: Record<string, Row[]> = fixtureTables(),
  databases: StoricoDatabaseProvider = { anniStorici: () => [] },
  classiCompetenza?: string[],
  options = makeOptions()
): Cdu {
  const db = new FakeDatabase(tables);
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
  const rec: Recipe = { providers: ['class', 'pianiPersClasse'], options };
  return b.build(params, rec);
}

test('PianiPersClasseProvider: active student with a PIANI row but no matching LOG_DOCS surfaces as a placeholder', () => {
  const cdu = build();
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  const item = elenco[0]!;
  expect(item.hasId).toBe(false);
  expect(item.id).toBeNull();
  expect(item.link).toBe('');
  expect(item.sottotipo).toBe('PEI');
  expect(item.sottotipoLabel).toBe('PEI');
  expect(item.hasSottotipo).toBe(true);
  expect(item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(item.hasStudente).toBe(true);
  expect(item.isNotificato).toBe(false);
  expect(item.isVerbalizzato).toBe(false);
});

test('PianiPersClasseProvider: matches a piano to its LOG_DOCS document by student + sottotipo', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  const item = elenco[0]!;
  expect(item.hasId).toBe(true);
  expect(item.id).toBe('doc_pei_a1');
  expect(item.generatoreId).toBe('PEI_DOC');
  expect(item.studente).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
});

test('PianiPersClasseProvider: excludes an inactive (left-the-school) student even when a LOG_DOCS row still tags them to the class', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pdp_a2_stale',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PDP_DSA',
    NOME: 'PDP a2 (stale)',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a2',
    CLASSI: '5A',
    UTENTI: 'a2@school.it',
    DATA_CREAZ: '2026-02-01'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(1);
  expect(elenco[0]!.studente?.email).toBe('a1@school.it');
});

test('PianiPersClasseProvider: a currently-active student surfaces by roster membership, independent of the class tag stored on their LOG_DOCS row', () => {
  const t = fixtureTables();
  (t['ALUNNI'] as Row[]).push({
    EMAIL: 'a4@school.it',
    COGNOMENOME: 'GIALLI DINO',
    CLASSE: '5A',
    RELIGIONE: 'NO',
    ATTIVO: true,
    RIPETENTE: false,
    RAPPR_STUD: false,
    TUTOR_1: '',
    TUTOR_2: '',
    CURRICULUM: null
  });
  (t['PIANI'] as Row[]).push({ STUDENTE: 'a4@school.it', TIPO: 'PDP_BES', PARAMETRI: null });
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pdp_a4',
    ID_GEN: 'PDP_BES',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PDP_BES',
    NOME: 'PDP a4',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/a4',
    CLASSI: '3B',
    UTENTI: 'a4@school.it',
    DATA_CREAZ: '2026-01-15'
  });
  const cdu = build(t);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco).toHaveLength(2);
  const a4Item = elenco.find((i) => i.studente?.email === 'a4@school.it');
  expect(a4Item).toBeDefined();
  expect(a4Item!.id).toBe('doc_pdp_a4');
});

test('PianiPersClasseProvider: nonVerbalizzati excludes a VERBALIZZATO document', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1_verb',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 verbalizzato',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2026-03-01'
  });
  const cdu = build(t);
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(false);
  expect(nv.elenco).toEqual([]);
});

test('PianiPersClasseProvider: an ungenerated placeholder counts as non-verbalized', () => {
  const cdu = build();
  const nv = cdu.focus.classe!.pianiPersonalizzati!.nonVerbalizzati;
  expect(nv.hasElenco).toBe(true);
  expect(nv.elenco).toHaveLength(1);
  expect(nv.elenco[0]!.hasId).toBe(false);
});

test('PianiPersClasseProvider: aggregates active students across every class in classiCompetenza', () => {
  const t = fixtureTables();
  (t['ALUNNI'] as Row[]).push({
    EMAIL: 'b1@school.it',
    COGNOMENOME: 'ROSA TINA',
    CLASSE: '3B',
    RELIGIONE: 'NO',
    ATTIVO: true,
    RIPETENTE: false,
    RAPPR_STUD: false,
    TUTOR_1: '',
    TUTOR_2: '',
    CURRICULUM: null
  });
  (t['PIANI'] as Row[]).push({ STUDENTE: 'b1@school.it', TIPO: 'PFP', PARAMETRI: null });
  const cdu = build(t, { anniStorici: () => [] }, ['5A', '3B']);
  const elenco = cdu.focus.classe!.pianiPersonalizzati!.elenco;
  expect(elenco.map((i) => i.studente?.email).sort()).toEqual(['a1@school.it', 'b1@school.it']);
});

test('PianiPersClasseProvider: storico LazyRef resolves empty (no DB opened) when includiStorico is false', () => {
  let opened = false;
  const databases: StoricoDatabaseProvider = {
    anniStorici: () => {
      opened = true;
      return [];
    }
  };
  const cdu = build(fixtureTables(), databases);
  expect(cdu.focus.classe!.pianiPersonalizzati!.storico.get()).toEqual([]);
  expect(opened).toBe(false);
});

test('PianiPersClasseProvider: storico resolves prior-year docs for a student even when their current-year piano is a placeholder', () => {
  const oldTables = fixtureTables();
  (oldTables['LOG_DOCS'] as Row[]).push({
    ID: 'old_pei_a1',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 anno scorso',
    STATO: 'GENERATO',
    NOTIFICATO: '',
    LINK: 'http://d/old',
    CLASSI: '5A',
    UTENTI: 'a1@school.it',
    DATA_CREAZ: '2025-03-01'
  });
  const oldDb = new FakeDatabase(oldTables);
  const anno: AnnoStorico = {
    anno: '2025-2026',
    db: oldDb,
    logDocs: new LogDocumentoRepository(oldDb, new LazyRef(() => new ClasseRepository(oldDb)))
  };
  const databases: StoricoDatabaseProvider = { anniStorici: () => [anno] };
  const cdu = build(
    fixtureTables(),
    databases,
    undefined,
    makeOptions({ includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.classe!.pianiPersonalizzati!.storico.get();
  expect(storico).toEqual([
    {
      annoScolastico: '2025-2026',
      documento: expect.objectContaining({
        nome: 'PEI a1 anno scorso',
        link: 'http://d/old',
        tipo: 'PIANO_PERS'
      })
    }
  ]);
});

test('DOCENTE_COMPLETO recipe populates nonVerbalizzati alongside elenco', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as Row[]).push({
    ID: 'doc_pei_a1_verb',
    ID_GEN: 'PEI_DOC',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    NOME: 'PEI a1 verbalizzato',
    STATO: 'VERBALIZZATO',
    NOTIFICATO: '',
    LINK: 'http://d/a1',
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
  expect(nv.hasElenco).toBe(false);
  expect(nv.elenco).toEqual([]);
  expect(cdu.focus.classe!.pianiPersonalizzati!.elenco).toHaveLength(1);
});
