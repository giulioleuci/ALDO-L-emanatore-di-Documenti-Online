import { makeOptions, DEFAULT_OPTIONS } from '../../../../src/application/context-engine/Recipe';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';

test('DEFAULT_OPTIONS.gestioneSupplenti defaults to SOLO_TITOLARI', () => {
  expect(DEFAULT_OPTIONS.gestioneSupplenti).toBe(GestioneSupplenti.SOLO_TITOLARI);
});

test('makeOptions overrides gestioneSupplenti', () => {
  const opts = makeOptions({ gestioneSupplenti: GestioneSupplenti.ENTRAMBI });
  expect(opts.gestioneSupplenti).toBe(GestioneSupplenti.ENTRAMBI);
});
