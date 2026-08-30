/**
 * Splits a CSV cell into trimmed, non-empty values (order-preserving, no
 * dedup). Domain-local — the equivalent GasLibraryFactory helper
 * (`RowScopeExpansion.splitCsvList`) lives in the infrastructure layer, out
 * of reach for domain code per this repo's "no GAS/library imports in
 * domain" rule (CLAUDE.md), so this is the one place domain entities needing
 * CSV-cell parsing (Dipartimento, RuoloSpeciale, LogDocumento, LogEmail,
 * LogCartella) should import from instead of re-splitting inline.
 */
export function splitCsvValues(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A CSV-or-wildcard scope (ref 04 §14). Backs both ClassiScope and MaterieScope
 * of a Supplenza: the raw cell is either `*` (all) or a comma-separated list of
 * ids. Textual, order-insensitive membership (ref 01 note on CSV PK columns).
 */
export class CsvScope {
  private readonly wildcard: boolean;
  private readonly values: Set<string>;

  private constructor(raw: string) {
    const trimmed = raw.trim();
    this.wildcard = trimmed === '*';
    this.values = new Set(this.wildcard ? [] : splitCsvValues(trimmed));
  }

  static of(raw: unknown): CsvScope {
    return new CsvScope(typeof raw === 'string' ? raw : '');
  }

  isWildcard(): boolean {
    return this.wildcard;
  }

  /** True if `*` or the id is in the CSV. */
  applica(id: string): boolean {
    return this.wildcard || this.values.has(id);
  }

  /** True if the two scopes share at least one id (a wildcard overlaps anything). */
  overlaps(other: CsvScope): boolean {
    if (this.wildcard || other.wildcard) return true;
    for (const v of this.values) if (other.values.has(v)) return true;
    return false;
  }
}
