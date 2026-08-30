import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { ClasseFocusVM, DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

// SUPPLENZE fixtures: rossi replaced by bianchi on '5A,4B' (MATERIE '*') for Nov
// 2025. 5A/MATE is no longer usable as the test target here: since Task 9 wired
// VARIAZIONI_CATTEDRA end-to-end, 5A/MATE's effective titolare from 2025-10-01
// onward is already bianchi (per the shared fixture), so the SUPPLENZE row keyed
// to TITOLARE=rossi can no longer reach it. The same row also covers class 4B
// (untouched by any VARIAZIONI_CATTEDRA), so we test against a local '4B' class
// added only for this file, with rossi as its nominal MATE holder.
function tablesWith4B(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['CLASSI'] as Row[]).push({
    ID: '4B',
    ANNO: 4,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it'
  });
  return t;
}

const duringSupplenza = new Date('2025-11-15T09:00:00Z');

function focusClasse(gestione?: GestioneSupplenti, now = duringSupplenza): ClasseFocusVM {
  const overrides = gestione === undefined ? {} : { gestioneSupplenti: gestione };
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now } as never,
    recipe('CLASSE_COMPLETA', overrides)
  );
  return cdu.focus.classe!;
}
const rossiSlot = (list: DocenteCdcVM[]) =>
  list.find((d) => d.materie.some((m) => m.sigla === 'MATE'))!;

// gestioneSupplenti only steers email routing (EmailNotificationService) --
// consiglio.elenco/consiglio.titolari are always built from fixed policies
// (DELEGATE_OR_PRINCIPAL / PRINCIPAL_ONLY), independent of it.
const anyGestione = [undefined, GestioneSupplenti.SOLO_TITOLARI, GestioneSupplenti.SOLO_SUPPLENTI, GestioneSupplenti.ENTRAMBI];

test.each(anyGestione)(
  'consiglio.elenco always shows the effective actor, SUPPLENZE included (gestioneSupplenti=%s)',
  (gestione) => {
    const bianchi = rossiSlot(focusClasse(gestione).consiglio!.elenco);
    expect(bianchi).toMatchObject({
      nome: 'LUCIA',
      cognome: 'BIANCHI',
      email: 'bianchi@school.it',
      genere: 'F',
      appellativo: 'Prof.ssa'
    });
    expect(bianchi.isSupplente).toBe(true);
    expect(bianchi.sostituisce).toMatchObject({
      nomeCompleto: 'ROSSI MARIO',
      email: 'rossi@school.it'
    });
    expect(bianchi.materie.map((m) => m.sigla)).toEqual(['MATE']);
  }
);

test.each(anyGestione)(
  'consiglio.titolari stays on the titolare of record, SUPPLENZE excluded (gestioneSupplenti=%s)',
  (gestione) => {
    const rossi = rossiSlot(focusClasse(gestione).consiglio!.titolari);
    expect(rossi.email).toBe('rossi@school.it');
    expect(rossi.isSupplente).toBe(false);
    expect(rossi.sostituisce).toBeNull();
  }
);

test('outside the supplenza window: consiglio.elenco and consiglio.titolari both show rossi', () => {
  const fc = focusClasse(undefined, new Date('2026-07-01T09:00:00Z'));
  const effettivo = rossiSlot(fc.consiglio!.elenco);
  expect(effettivo.email).toBe('rossi@school.it');
  expect(effettivo.isSupplente).toBe(false);
  expect(rossiSlot(fc.consiglio!.titolari).email).toBe('rossi@school.it');
});

test('focus.classe.consiglio.supplenze aggregates active delegations even under the default SOLO_TITOLARI routing', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza } as never,
    recipe('CLASSE_COMPLETA')
  );
  const supplenze = cdu.focus.classe!.consiglio!.supplenze;
  expect(supplenze).toHaveLength(1);
  expect(supplenze[0]!.supplente).toMatchObject({
    nome: 'LUCIA',
    cognome: 'BIANCHI',
    email: 'bianchi@school.it',
    genere: 'F',
    nomeCompleto: 'BIANCHI LUCIA',
    appellativoCompleto: 'Prof.ssa BIANCHI LUCIA'
  });
  expect(supplenze[0]!.titolare).toMatchObject({
    nome: 'MARIO',
    cognome: 'ROSSI',
    email: 'rossi@school.it',
    nomeCompleto: 'ROSSI MARIO'
  });
  expect(supplenze[0]!.materie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(supplenze[0]!.materie[0]!.nomeSintetico).toBe('Matematica');
});

test('supplenze merges every covered slot into one (supplente, titolare) item with base MateriaVM entries', () => {
  const t = tablesWith4B();
  (t['CLASSI'] as Row[]).find((r) => r['ID'] === '4B')!['FISI'] = 'rossi@school.it';
  const cdu = composeContextBuilder(new FakeDatabase(t)).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza } as never,
    recipe('CLASSE_COMPLETA')
  );
  const item = cdu.focus.classe!.consiglio!.supplenze[0]!;
  expect(cdu.focus.classe!.consiglio!.supplenze).toHaveLength(1);
  expect(item.materie.map((m) => m.sigla).sort()).toEqual(['FISI', 'MATE']);
  expect(item.materie[0]!.docenti).toBeUndefined();
});

test('supplenze is [] when no delegation is active', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') } as never,
    recipe('CLASSE_COMPLETA')
  );
  expect(cdu.focus.classe!.consiglio!.supplenze).toEqual([]);
  expect(cdu.focus.classe!.consiglio!.hasSupplenze).toBe(false);
});

test('supplenze is populated in the DOCENTE_COMPLETO recipe too', () => {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWith4B())).build(
    { target: '4B', tipoTarget: 'classe', now: duringSupplenza } as never,
    recipe('DOCENTE_COMPLETO')
  );
  expect(cdu.focus.classe!.consiglio!.supplenze).toHaveLength(1);
});
