import {
  ANY,
  splitCsvList,
  groupMateriaEntriesBySlot,
  slotCompatible,
  pairsOverlap
} from '../../../src/infrastructure/role-resolution/RowScopeExpansion';
import type { ConcretePair } from '../../../src/infrastructure/role-resolution/RowScopeExpansion';

/**
 * Direct coverage for the four thin ambient-global wrappers in
 * `RowScopeExpansion.ts` (`splitCsvList`, `groupMateriaEntriesBySlot`,
 * `slotCompatible`, `pairsOverlap`), which call through to GLF's
 * `RoleResolutionLib` (ref DOCS_LIBS/RoleResolutionLib.md "Materia slot CSV
 * parsing"). Before this file, none of them had direct ALDO-side test
 * coverage: `pairsOverlap` was only exercised via GLF's own
 * `MateriaSlotParsing.test.js` and indirectly through
 * `SupplenzaRepository`'s integration tests. Since this exact class of bug
 * (an ambient-global wrapper that typechecks cleanly but breaks at runtime)
 * was caught and fixed earlier in this plan, these smoke tests prove each
 * wrapper actually executes through the vendored GLF bundle end-to-end, not
 * just via downstream consumers.
 */
describe('RowScopeExpansion ambient-global wrappers', () => {
  test('splitCsvList trims entries and drops ones left empty by whitespace/doubled commas', () => {
    expect(splitCsvList(' MAT1, MAT2 ,,MAT3 ')).toEqual(['MAT1', 'MAT2', 'MAT3']);
  });

  test('groupMateriaEntriesBySlot groups bare/ITP/SPECIFICA entries into separate groups', () => {
    const groups = groupMateriaEntriesBySlot('MAT1,MAT2.itp,MAT3.spec1');
    expect(groups).toEqual([
      { kind: ANY, specifica: ANY, materie: ['MAT1'] },
      { kind: 'ITP', specifica: ANY, materie: ['MAT2'] },
      { kind: 'SPECIFICA', specifica: 'spec1', materie: ['MAT3'] }
    ]);
  });

  test('slotCompatible treats ANY as a wildcard and requires a matching specifica otherwise', () => {
    expect(
      slotCompatible({ kind: ANY, specifica: ANY }, { kind: 'SPECIFICA', specifica: 'x' })
    ).toBe(true);
    expect(
      slotCompatible({ kind: 'ITP', specifica: ANY }, { kind: 'SPECIFICA', specifica: 'x' })
    ).toBe(false);
    expect(
      slotCompatible({ kind: 'SPECIFICA', specifica: 'x' }, { kind: 'SPECIFICA', specifica: 'x' })
    ).toBe(true);
    expect(
      slotCompatible({ kind: 'SPECIFICA', specifica: 'x' }, { kind: 'SPECIFICA', specifica: 'y' })
    ).toBe(false);
  });

  test('pairsOverlap finds a slot-compatible (classeId, materia) pair shared across two lists', () => {
    const a: ConcretePair[] = [{ classeId: '5A', materia: 'MAT1', kind: ANY, specifica: ANY }];
    const bOverlapping: ConcretePair[] = [
      { classeId: '5A', materia: 'MAT1', kind: 'SPECIFICA', specifica: 'x' }
    ];
    const bDisjoint: ConcretePair[] = [
      { classeId: '5B', materia: 'MAT1', kind: ANY, specifica: ANY }
    ];
    expect(pairsOverlap(a, bOverlapping)).toBe(true);
    expect(pairsOverlap(a, bDisjoint)).toBe(false);
  });

  /**
   * Deferred finding fix: `ANY = '*'` here is coupled to GLF RoleResolutionLib's
   * own independently inlined `'*'` sentinel (`MateriaSlotParsing.js`) only by
   * comments on both sides — nothing fails automatically if one side drifts
   * from the other. Pins both the literal itself and a real cross-boundary
   * behavior probe: a bare (unqualified) CSV entry only groups under ALDO's
   * `ANY` constant if GLF's internal sentinel is truly still `'*'` — if GLF's
   * side ever changed, `groups.find` below would find nothing and this test
   * would fail, unlike a same-file literal comparison.
   */
  test('ANY sentinel stays coupled to RoleResolutionLib\'s inlined "*" bare-slot sentinel', () => {
    expect(ANY).toBe('*');
    const groups = groupMateriaEntriesBySlot('MAT1,MAT2.spec1');
    const bare = groups.find((group) => group.kind === ANY);
    expect(bare).toEqual({ kind: ANY, specifica: ANY, materie: ['MAT1'] });
  });
});
