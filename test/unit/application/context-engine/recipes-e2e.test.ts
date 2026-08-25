import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../../src/application/context-engine/Recipe';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

// No offline unit test can construct a real historical-year DatabaseService —
// this harness has no Advanced Sheets API stand-in (see
// test/setup/load-gaslibs.cjs's CacheService comment). The two includiStorico:true
// tests below only assert their LazyRefs stay unresolved, so a no-op backing
// provider is behaviorally identical to the real one for every assertion here,
// and also keeps AlunnoProvider's gated presenteAnnoPrecedente lookup from ever
// touching it.
function noHistory(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function factory() {
  const db = new FakeDatabase(fixtureTables());
  return composeContextBuilder(db, undefined, undefined, noHistory());
}
const now = new Date('2026-07-01T09:00:00Z');

test('CLASSE_COMPLETA on 5A assembles every class section (09 §3)', () => {
  const params: BuildParams = { target: '5A', tipoTarget: 'classe', now };
  const cdu = factory().build(params, recipe('CLASSE_COMPLETA'));

  expect(cdu.istituto?.organizzazione.annoScolastico).toBe('2025-2026');
  expect(cdu.istituto?.statistiche).toEqual({ totaleClassi: 4, totaleDocenti: 3, totaleAlunni: 1 });
  const c = cdu.focus.classe!;
  expect(c.anagrafica.nome).toBe('5A');
  expect(c.tutor?.asl.map((t) => t.email)).toEqual(['rossi@school.it', 'bianchi@school.it']);
  // 5A: MATE's effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since
  // 2025-10-01, `now` here is 2026-07-01); FISI's nominal holder is also
  // bianchi -> one distinct effective teacher, rossi drops out of the council.
  expect(c.consiglioDiClasse?.map((d) => d.anagrafica.email)).toEqual(['bianchi@school.it']);
  expect(c.studenti?.listaCompleta).toHaveLength(1);
  expect(c.studenti?.statistiche?.totale).toBe(1);
  expect(c.rappresentanti?.studenti).toEqual([
    { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
  ]);
  expect(c.coordinatori?.elenco[0]?.email).toBe('rossi@school.it');
  // focus.alunno is not part of a class recipe
  expect(cdu.focus.alunno).toBeUndefined();
  // tech never serialized
  expect(JSON.stringify(cdu)).not.toContain('tech');
});

test('ALUNNO_DETTAGLIATO on a1 assembles the full student focus; storico is skipped (09 §3/§8)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(params, recipe('ALUNNO_DETTAGLIATO'));

  const a = cdu.focus.alunno!;
  expect(a.anagrafica.email).toBe('a1@school.it');
  expect(a.classe.nome).toBe('5A');
  expect(a.status.isBes).toBe(true);
  expect(a.didattica.asl).toEqual({ oreCumulate: 100, oreAnnoCorrente: 60 });
  expect(a.didattica.carenze.numero).toBe(3);
  expect(a.didattica.piani.items).toEqual([
    {
      tipo: 'PEI',
      tipoLabel: 'PEI',
      isBes: true,
      link: '',
      parametriGenerazione: { gravita: 'media' }
    }
  ]);
  expect(a.didattica.documenti).toEqual({ hasDocumenti: false, items: [] });
  // includiStorico defaults to false → StoricoProvider is a no-op, no LazyRef.
  expect(cdu.focus.classe?.anagrafica.nome).toBe('5A');
  expect(a.storico).toBeUndefined();
});

test('includiStorico:true with positive depth attaches a LazyRef without opening any historical database (09 §8, 13 §2)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(
    params,
    recipe('ALUNNO_DETTAGLIATO', { includiStorico: true, profonditaAnniStorico: 1 })
  );
  const storico = cdu.focus.alunno!.storico!;
  expect(storico.isResolved()).toBe(false); // nothing queried yet — lazy by construction
});

test('ALUNNO_DETTAGLIATO with includiStorico:true also attaches documenti.storico as an unresolved LazyRef (11 §11)', () => {
  const params: BuildParams = { target: 'a1@school.it', tipoTarget: 'alunno', now };
  const cdu = factory().build(
    params,
    recipe('ALUNNO_DETTAGLIATO', { includiStorico: true, profonditaAnniDocumenti: 1 })
  );
  const storico = cdu.focus.alunno!.didattica.documenti!.storico!;
  expect(storico.isResolved()).toBe(false);
});

test('recipe() rejects an unknown recipe name (09 §3)', () => {
  expect(() => recipe('NOPE')).toThrow();
});
