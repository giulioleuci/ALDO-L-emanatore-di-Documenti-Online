import {
  makeOptions,
  DEFAULT_OPTIONS,
  recipe,
  RECIPES
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

test('recipe() rejects an unknown recipe name (09 §3)', () => {
  expect(() => recipe('NOPE')).toThrow();
});

// The old two-token split (documenti + documentiStorico / pianiPersAlunno +
// pianiPersAlunnoStorico / pianiPersClasse + pianiPersClasseStorico) no
// longer exists: `storico` is a LazyRef always attached by the surviving
// single owner (ElencoDocumentiVM/PianiPersonalizzatiClasseVM.storico is
// non-optional), so no recipe should reference a now-deleted token.
test('no recipe references a merged-away storico token', () => {
  const deletedTokens = [
    'documentiStorico',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico',
    'pianiPersClasseStorico'
  ];
  for (const [name, providers] of Object.entries(RECIPES)) {
    for (const token of deletedTokens) {
      expect(providers).not.toContain(token);
    }
    void name;
  }
});

test('every recipe places class before consiglio, consiglio before materie, and materie before esame when present', () => {
  for (const providers of Object.values(RECIPES)) {
    const idx = (token: string) => providers.indexOf(token);
    if (idx('consiglio') !== -1 && idx('class') !== -1) {
      expect(idx('consiglio')).toBeGreaterThan(idx('class'));
    }
    if (idx('materie') !== -1 && idx('consiglio') !== -1) {
      expect(idx('materie')).toBeGreaterThan(idx('consiglio'));
    }
    if (idx('esame') !== -1 && idx('materie') !== -1) {
      expect(idx('esame')).toBeGreaterThan(idx('materie'));
    }
    if (idx('partner') !== -1) {
      expect(idx('partner')).toBeGreaterThan(idx('consiglio'));
      expect(idx('partner')).toBeGreaterThan(idx('class'));
    }
  }
});
