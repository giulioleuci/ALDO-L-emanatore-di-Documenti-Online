import { ContextEngineFactory } from '../../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

// SUPPLENZE fixtures: rossi replaced by bianchi on 5A (MATERIE '*') for Nov 2025.
const duringSupplenza = new Date('2025-11-15T09:00:00Z');

function cdc(gestione?: GestioneSupplenti, now = duringSupplenza): DocenteCdcVM[] {
  const overrides = gestione === undefined ? {} : { gestioneSupplenti: gestione };
  const cdu = ContextEngineFactory.create(new FakeDatabase(fixtureTables()))
    .build({ target: '5A', tipoTarget: 'classe', now }, recipe('CLASSE_COMPLETA', overrides));
  return cdu.focus.classe!.consiglioDiClasse!;
}
const rossiSlot = (list: DocenteCdcVM[]) => list.find((d) => d.materie.some((m) => m.sigla === 'MATE'))!;

test('SOLO_SUPPLENTI: the titolare VM becomes the chain-resolved supplente (09 §5)', () => {
  const rossi = rossiSlot(cdc(GestioneSupplenti.SOLO_SUPPLENTI));
  expect(rossi.anagrafica).toEqual({ nome: 'LUCIA', cognome: 'BIANCHI', email: 'bianchi@school.it', genere: 'F', appellativo: 'Prof.ssa' });
  expect(rossi.stato).toEqual({ isSupplente: true, sostituisce: { nome: 'ROSSI MARIO', email: 'rossi@school.it' } });
  expect(rossi.materie.map((m) => m.sigla)).toEqual(['MATE']); // subject covered by the supplente
});

test('ENTRAMBI: the titolare is kept, sostituisce records the supplente (09 §5)', () => {
  const rossi = rossiSlot(cdc(GestioneSupplenti.ENTRAMBI));
  expect(rossi.anagrafica.email).toBe('rossi@school.it');
  expect(rossi.stato).toEqual({ isSupplente: false, sostituisce: { nome: 'BIANCHI LUCIA', email: 'bianchi@school.it' } });
});

test('default rule (SOLO_TITOLARI): no swap even during an active supplenza', () => {
  const rossi = rossiSlot(cdc());
  expect(rossi.anagrafica.email).toBe('rossi@school.it');
  expect(rossi.stato).toEqual({ isSupplente: false, sostituisce: null });
});

test('SOLO_SUPPLENTI outside the supplenza window: no swap', () => {
  const rossi = rossiSlot(cdc(GestioneSupplenti.SOLO_SUPPLENTI, new Date('2026-07-01T09:00:00Z')));
  expect(rossi.anagrafica.email).toBe('rossi@school.it');
  expect(rossi.stato.isSupplente).toBe(false);
});
