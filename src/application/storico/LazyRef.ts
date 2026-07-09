/**
 * Lazy reference (13 §2): wraps a query that is executed only on first read and
 * then memoized. The StoricoProvider inserts LazyRef instances into the CDU so
 * that operations which never touch historical data pay nothing — the prior-year
 * query runs only if a template or box renderer actually reads the value.
 */
export class LazyRef<T> {
  private resolved = false;
  private value: T | undefined;

  constructor(private readonly loader: () => T) {}

  /** Resolves the query on first call; subsequent calls return the cached value. */
  get(): T {
    if (!this.resolved) {
      this.value = this.loader();
      this.resolved = true;
    }
    return this.value as T;
  }

  isResolved(): boolean {
    return this.resolved;
  }
}
