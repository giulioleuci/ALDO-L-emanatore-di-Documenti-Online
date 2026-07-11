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

/**
 * Minimal AdvancedQueryBuilder-shaped adapter satisfying DomainRepositoryLib's
 * `Repository.find()` query-pushdown path (`database.select(['*']).from(table)`)
 * for the equality-only criteria ALDO's domain `Specification.toQueryObject()`
 * produces (ref REPORT_GLF.md B1). Only `.where(col, '=', val)` chains are ever
 * built by that path, so a fuller operator set is unnecessary here.
 */
export class EqualityQueryBuilder {
  private readonly wheres: Array<[string, unknown]> = [];

  constructor(private readonly getRows: () => Row[]) {}

  where(column: string, _operator: string, value: unknown): this {
    this.wheres.push([column, value]);
    return this;
  }

  execute(): Row[] {
    return this.getRows().filter((row) =>
      this.wheres.every(([column, value]) => row[column] === value));
  }
}

/** Builds the `{ from(tableName) }` shape DomainRepositoryLib's Repository.find() calls after `select()`. */
export function createSelect(
  getRowsForTable: (tableName: string) => Row[]
): (columns: string[]) => { from(tableName: string): EqualityQueryBuilder } {
  return () => ({
    from: (tableName: string) => new EqualityQueryBuilder(() => getRowsForTable(tableName))
  });
}
