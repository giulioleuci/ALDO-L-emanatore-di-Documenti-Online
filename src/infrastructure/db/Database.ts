export type Row = Record<string, string | number | boolean | null>;

export interface IReadableTable {
  findAll(): Row[];
  find(predicate: (row: Row) => boolean): Row | null;
  insert(row: Row): void;
}

/**
 * Persistence port over SheetDBLib's DatabaseService (L2). Transaction
 * semantics mirror the library's: `save()` MUST NOT be called while a
 * transaction is open — mutations are buffered and applied atomically by
 * `commit()` (or reverted by `rollback()`).
 */
export interface IDatabase {
  table(name: string): IReadableTable;
  save(): void;
  beginTransaction(): void;
  commit(): void;
  rollback(): void;
}
