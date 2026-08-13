import {
  makeOptions,
  DEFAULT_OPTIONS,
  recipe
} from '../../../../src/application/context-engine/Recipe';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';

test('DEFAULT_OPTIONS.gestioneSupplenti defaults to SOLO_TITOLARI', () => {
  expect(DEFAULT_OPTIONS.gestioneSupplenti).toBe(GestioneSupplenti.SOLO_TITOLARI);
});

test('makeOptions overrides gestioneSupplenti', () => {
  const opts = makeOptions({ gestioneSupplenti: GestioneSupplenti.ENTRAMBI });
  expect(opts.gestioneSupplenti).toBe(GestioneSupplenti.ENTRAMBI);
});

test('ALUNNO_COMPLETO wires the exact focus.alunno.storico provider after student data', () => {
  const providers = recipe('ALUNNO_COMPLETO', { includiStorico: true }).providers;

  expect(providers).toContain('storico');
  expect(providers.indexOf('storico')).toBeGreaterThan(providers.indexOf('student'));
});
