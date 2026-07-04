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
    this.values = new Set(
      this.wildcard ? [] : trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    );
  }

  static of(raw: unknown): CsvScope {
    return new CsvScope(typeof raw === 'string' ? raw : '');
  }

  isWildcard(): boolean { return this.wildcard; }

  /** True if `*` or the id is in the CSV. */
  applica(id: string): boolean { return this.wildcard || this.values.has(id); }

  /** True if the two scopes share at least one id (a wildcard overlaps anything). */
  overlaps(other: CsvScope): boolean {
    if (this.wildcard || other.wildcard) return true;
    for (const v of this.values) if (other.values.has(v)) return true;
    return false;
  }
}
