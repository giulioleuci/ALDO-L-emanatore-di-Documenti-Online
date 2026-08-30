import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../../src/application/context-engine/Recipe';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { TipoPiano } from '../../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

// No offline unit test can construct a real historical-year DatabaseService —
// this harness has no Advanced Sheets API stand-in (see
// test/setup/load-gaslibs.cjs's CacheService comment). Every includiStorico:true
// assertion below only checks that a LazyRef stays unresolved, so a no-op
// backing provider is behaviorally identical to the real one, and also keeps
// AlunnoProvider's gated presenteAnnoPrecedente lookup from ever touching it.
function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function factory(tables = fixtureTables()) {
  const db = new FakeDatabase(tables);
  return composeContextBuilder(db, undefined, undefined, noHistory());
}
const now = new Date('2026-07-01T09:00:00Z');

// Section 10 node-presence matrix: each recipe emits only its allowed
// root/focus nodes; provider-created containers always include empty arrays
// and companion booleans; disabled providers leave their node absent.

test('CLASSE_COMPLETA on an ordinary class (5A) assembles every class-axis node (09 §3)', () => {
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now };
  const cdu = factory().build(params, recipe('CLASSE_COMPLETA'));

  expect(cdu.istituto?.annoScolastico).toBe('2025-2026');
  expect(cdu.istituto?.statistiche).toEqual({ totaleClassi: 4, totaleDocenti: 3, totaleAlunni: 1 });
  const c = cdu.focus.classe!;
  expect(c.nome).toBe('5A');
  expect(c.sezione).toBe('A');
  expect(c.isArticolata).toBe(false);
  expect(c.articolazione).toBeUndefined();
  expect(c.partner).toBeUndefined();
  expect(c.tutor?.asl.map((t) => t.email)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  // 5A: MATE's effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since
  // 2025-10-01, `now` here is 2026-07-01); FISI's nominal holder is also
  // bianchi -> one distinct effective teacher, rossi drops out of the council.
  expect(c.consiglio?.elenco.map((d) => d.email)).toEqual(['bianchi@school.it']);
  expect(c.studenti?.elenco).toHaveLength(1);
  expect(c.studenti?.statistiche.totale).toBe(1);
  expect(c.rappresentanti?.studenti.elenco).toEqual([
    { studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, indirizzo: null, hasIndirizzo: false }
  ]);
  expect(c.coordinatori?.elenco[0]?.email).toBe('rossi@school.it');
  // provider-created containers stay present with empty arrays + companion
  // booleans when their source is empty, never absent, once their token runs:
  expect(c.esame).toBeDefined();
  expect(c.progetti?.hasElenco).toBe(true);
  expect(c.movimenti).toBeDefined();
  expect(c.pianiPersonalizzati?.elenco).toEqual([]);
  expect(c.pianiPersonalizzati?.hasElenco).toBe(false);
  // disabled providers (not in this recipe's token list) leave their node absent:
  expect(c.storico).toBeUndefined();
  expect(c.documenti).toBeUndefined();
  expect(cdu.focus.alunno).toBeUndefined();
  expect(cdu.focus.dipartimento).toBeUndefined();
  expect(cdu.focus.docente).toBeUndefined();
  // tech never serialized
  expect(JSON.stringify(cdu)).not.toContain('"tech"');
});

test('CLASSE_COMPLETA on an articulated parent (1F) with includiPartnerDettaglio populates partner.{primo,secondo}', () => {
  const params: BuildParams = { target: '1F', tipoTarget: 'classe', now };
  const cdu = factory().build(params, recipe('CLASSE_COMPLETA', { includiPartnerDettaglio: true }));

  const c = cdu.focus.classe!;
  expect(c.isArticolata).toBe(true);
  expect(c.isParent).toBe(true);
  expect(c.articolazione?.sottoClassi.map((s) => s.nome)).toEqual(['1F-LSO', '1F-LSS']);
  const partner = c.partner!;
  expect(partner.hasElenco).toBe(true);
  expect(partner.elenco).toHaveLength(2);
  expect(partner.primo.nome).toBe('1F-LSO');
  expect(partner.secondo.nome).toBe('1F-LSS');
  // each side is a full class projection, not just a docenti list:
  expect(partner.primo.consiglio).toBeDefined();
  expect(partner.primo.studenti).toBeDefined();
  expect(partner.primo.coordinatori).toBeDefined();
  expect(partner.primo.movimenti).toBeDefined();
  expect(partner.primo.indirizzo.sigla).toBe('SCIENTIFICO');
  expect(partner.secondo.indirizzo.sigla).toBe('LSSA');
});

test('CLASSE_COMPLETA without includiPartnerDettaglio leaves partner absent even for an articulated parent', () => {
  const params: BuildParams = { target: '1F', tipoTarget: 'classe', now };
  const cdu = factory().build(params, recipe('CLASSE_COMPLETA'));
  expect(cdu.focus.classe!.partner).toBeUndefined();
});

test('ALUNNO_DETTAGLIATO on a1 (student) assembles the flat student focus; storico is skipped (09 §3/§8)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(params, recipe('ALUNNO_DETTAGLIATO'));

  const a = cdu.focus.alunno!;
  expect(a.email).toBe('a1@school.it');
  expect(a.classe.nome).toBe('5A');
  expect(a.isBes).toBe(true);
  expect(a.asl).toEqual({ oreCumulate: 100, oreAnnoCorrente: 60 });
  expect(a.carenze.numero).toBe(3);
  expect(a.piani.elenco).toEqual([
    expect.objectContaining({ tipo: 'PEI', tipoLabel: 'PEI', isBes: true })
  ]);
  // documenti's provider ran (token present in this recipe) -> present, empty:
  expect(a.documenti?.hasElenco).toBe(false);
  expect(a.documenti?.elenco).toEqual([]);
  expect(cdu.focus.classe?.nome).toBe('5A');
  // includiStorico defaults to false -> StoricoProvider is a no-op, no LazyRef.
  expect(a.storico).toBeUndefined();
});

test('includiStorico:true with positive depth attaches focus.alunno.storico and documenti.storico as unresolved LazyRefs (09 §8, 13 §2, 11 §11)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(
    params,
    recipe('ALUNNO_DETTAGLIATO', { includiStorico: true, profonditaAnniStorico: 1, profonditaAnniDocumenti: 1 })
  );
  expect(cdu.focus.alunno!.storico!.isResolved()).toBe(false);
  expect(cdu.focus.alunno!.documenti!.storico.isResolved()).toBe(false);
});

test('PIANO_PERSONALIZZATO (plan) resolves focus.piano for the requested tipo', () => {
  const params: BuildParams = {
    target: 'a1@school.it',
    tipoTarget: 'alunno',
    now,
    pianoTipo: TipoPiano.PEI
  };
  const cdu = factory().build(params, recipe('PIANO_PERSONALIZZATO'));
  expect(cdu.focus.piano).toEqual({
    tipo: TipoPiano.PEI,
    tipoLabel: 'PEI',
    isBes: true,
    parametriGenerazione: { gravita: 'media' }
  });
  expect(cdu.focus.alunno).toBeDefined();
  expect(cdu.focus.classe).toBeDefined();
});

test('CARENZA_COMPLETO (carenza) resolves focus.carenza to the most recent shortfall', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(params, recipe('CARENZA_COMPLETO'));
  expect(cdu.focus.carenza).toMatchObject({ progressivo: 2, classe: { nome: '5A' } });
  expect(cdu.focus.piano).toBeUndefined();
});

test('CLASSE_DOCENTE (teacher) resolves focus.docente to the matching council member', () => {
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now,
    docenteCorrente: 'bianchi@school.it'
  };
  const cdu = factory().build(params, recipe('CLASSE_DOCENTE'));
  expect(cdu.focus.docente?.email).toBe('bianchi@school.it');
});

test('DOCENTE_AGGREGATO (teacher) resolves focus.docente and focus.cattedre across classiCompetenza', () => {
  const params: BuildParams = {
    target: 'bianchi@school.it',
    tipoTarget: 'docente',
    now,
    docenteCorrente: 'bianchi@school.it',
    classiCompetenza: ['5A']
  };
  const cdu = factory().build(params, recipe('DOCENTE_AGGREGATO'));
  expect(cdu.focus.docente?.email).toBe('bianchi@school.it');
  expect(cdu.focus.hasCattedre).toBe(true);
  expect(cdu.focus.cattedre).toHaveLength(1);
  expect(cdu.focus.cattedre![0]!.classe).toEqual({ nome: '5A', anno: 5, sezione: 'A' });
  expect(cdu.focus.classe).toBeUndefined();
});

test('CLASSE_MATERIA (subject/cattedra) resolves focus.materia only, no student/progetti/esame nodes', () => {
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now, materiaCorrente: 'MATE' };
  const cdu = factory().build(params, recipe('CLASSE_MATERIA'));
  expect(cdu.focus.materia?.sigla).toBe('MATE');
  expect(cdu.focus.classe!.studenti).toBeUndefined();
  expect(cdu.focus.classe!.esame).toBeUndefined();
  expect(cdu.focus.classe!.progetti).toBeUndefined();
});

test('CLASSE_DOCENTE_MATERIA (subject/cattedra) resolves focus.docente and focus.materia together', () => {
  const params: BuildParams = {
    target: '5A',
    tipoTarget: 'classe',
    now,
    docenteCorrente: 'bianchi@school.it',
    materiaCorrente: 'MATE'
  };
  const cdu = factory().build(params, recipe('CLASSE_DOCENTE_MATERIA'));
  expect(cdu.focus.docente?.email).toBe('bianchi@school.it');
  expect(cdu.focus.materia?.sigla).toBe('MATE');
});

test('DIPARTIMENTO_COMPLETO (department) resolves focus.dipartimento with no class dimension', () => {
  const params: BuildParams = { target: 'SCIENTIFICO_DIP', tipoTarget: 'dipartimento', now };
  const cdu = factory().build(params, recipe('DIPARTIMENTO_COMPLETO'));
  const d = cdu.focus.dipartimento!;
  expect(d.id).toBe('SCIENTIFICO_DIP');
  expect(d.capo?.email).toBe('rossi@school.it');
  expect(d.materieSigle).toBe('FISI, MATE');
  expect(d.hasDocenti).toBe(true);
  expect(d.documenti.hasElenco).toBe(false);
  expect(cdu.focus.classe).toBeUndefined();
});

test('DOCENTE_COMPLETO (document) populates classe-scoped document nodes without a student focus', () => {
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now };
  const cdu = factory().build(params, recipe('DOCENTE_COMPLETO'));
  const c = cdu.focus.classe!;
  expect(c.documenti).toBeDefined();
  expect(c.documenti!.hasElenco).toBe(false);
  expect(c.pianiPersonalizzati).toBeDefined();
  expect(c.pianiPersonalizzati!.hasElenco).toBe(false);
  expect(c.consiglio).toBeDefined();
  expect(c.studenti).toBeUndefined();
});

test('FAMIGLIA_COMPLETO (email) surfaces every LOG_DOCS entry for the student under one unfiltered documenti node', () => {
  const t = fixtureTables();
  (t['LOG_DOCS'] as { [key: string]: unknown }[]).push(
    {
      ID: 'doc_pdp',
      ID_GEN: 'PDP_BES',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_DSA',
      NOME: 'PDP a1',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/pdp',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    },
    {
      ID: 'doc_verbale',
      ID_GEN: 'VERBALE_CDC',
      TIPO: 'VERBALE',
      NOME: 'Verbale',
      STATO: 'GENERATO',
      NOTIFICATO: '',
      LINK: 'http://d/v',
      UTENTI: 'a1@school.it',
      DATA_CREAZ: '2026-03-01'
    }
  );
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory(t).build(params, recipe('FAMIGLIA_COMPLETO'));
  const documenti = cdu.focus.alunno!.documenti!;
  expect(documenti.elenco.map((d) => d.tipo).sort()).toEqual(['PIANO_PERS', 'VERBALE']);
});
