import type { IDatabase, IReadableTable, Row } from '../../src/infrastructure/db/Database';
import { createSelect, type EqualityQueryBuilder } from '../../src/infrastructure/db/Database';

// Default primary-key column per table (ref 01_SCHEMA_DATABASE.md), used by the
// DomainRepositoryLib Repository seam's getByPK(id).
const DEFAULT_PK: Record<string, string> = {
  CLASSI: 'ID', DOCENTI: 'EMAIL', ALUNNI: 'EMAIL', MATERIE: 'ID', INDIRIZZI: 'ID',
  DIPART: 'ID', RUOLI: 'ID', CONF_DOC: 'ID', CONF_MAIL: 'ID', CONF_IMP: 'ID', LOG_DOCS: 'ID', LOG_FOLD: 'ID',
  // Composite-PK tables: getByPK single-column is unused (repos use getAllRows+filter);
  // first key part is listed only so pkFor does not fall back to 'ID'.
  PIANI: 'STUDENTE', CARENZE: 'STUDENTE', PROGETTI: 'CLASSE', MOV_ALUNNI: 'STUDENTE', ASL: 'STUDENTE',
  SUPPLENZE: 'TITOLARE', VARIAZIONI_CATTEDRA: 'CLASSE_ID', MASTER: 'ANNO_SCOLASTICO', LOG_MAIL: 'PATTERN'
};

/**
 * In-memory table implementing BOTH the ALDO IDatabase port (findAll/find/insert)
 * and the DomainRepositoryLib Repository seam (getByPK/getAllRows).
 */
class FakeTable implements IReadableTable {
  constructor(private rows: Row[], private readonly pkColumn: string) {}
  findAll(): Row[] { return this.rows.slice(); }
  find(predicate: (row: Row) => boolean): Row | null { return this.rows.find(predicate) ?? null; }
  insert(row: Row): void { this.rows.push(row); }
  // DomainRepositoryLib Repository.save() write seam:
  getAllRows(): Row[] { return this.rows.slice(); }
  insertRow(row: Row): Row { this.rows.push(row); return row; }
  updateRowById(id: string, row: Row): void {
    const i = this.rows.findIndex((r) => String(r[this.pkColumn]) === String(id));
    if (i === -1) this.rows.push(row);
    else this.rows[i] = row;
  }
  updateRowWhere(match: Row, row: Row): void {
    const keys = Object.keys(match);
    const i = this.rows.findIndex((r) => keys.every((k) => String(r[k]) === String(match[k])));
    if (i === -1) this.rows.push(row);
    else this.rows[i] = row;
  }
  getByPK(id: string): Row | null {
    return this.rows.find((r) => String(r[this.pkColumn]) === String(id)) ?? null;
  }
  // SheetDBLib-like transaction seam: snapshot/restore of the row cache.
  snapshotRows(): Row[] { return this.rows.map((r) => ({ ...r })); }
  restoreRows(rows: Row[]): void { this.rows = rows; }
}

/**
 * Fake database serving both the pipeline's IDatabase port and lib-based
 * repositories' RepositoryDatabase seam over a single in-memory store.
 * Transactions mirror SheetDBLib's DatabaseService semantics: row caches are
 * snapshotted at beginTransaction, save() throws while a transaction is open,
 * commit() flushes, rollback() restores the snapshot.
 */
export class FakeDatabase implements IDatabase {
  public saved = 0;
  public committed = 0;
  public rolledBack = 0;
  private readonly store = new Map<string, FakeTable>();
  private readonly pkOverrides: Record<string, string>;
  private transactionSnapshot: Map<string, Row[]> | null = null;
  /** DomainRepositoryLib Repository seam: `database.tables[name].getByPK/getAllRows`. */
  public readonly tables: Record<string, FakeTable>;

  constructor(seed: Record<string, Row[]>, pkOverrides: Record<string, string> = {}) {
    this.pkOverrides = pkOverrides;
    for (const [name, rows] of Object.entries(seed)) {
      this.store.set(name, new FakeTable(rows, this.pkFor(name)));
    }
    this.tables = new Proxy<Record<string, FakeTable>>({}, {
      get: (_target, name: string): FakeTable => this.getTable(name)
    });
  }

  private pkFor(name: string): string {
    return this.pkOverrides[name] ?? DEFAULT_PK[name] ?? 'ID';
  }

  private getTable(name: string): FakeTable {
    let tbl = this.store.get(name);
    if (!tbl) { tbl = new FakeTable([], this.pkFor(name)); this.store.set(name, tbl); }
    return tbl;
  }

  table(name: string): IReadableTable { return this.getTable(name); }

  /** Mirrors SheetDbAdapter.select() so tests exercise the same Repository.find() query-pushdown path. */
  select(columns: string[]): { from(tableName: string): EqualityQueryBuilder } {
    return createSelect((tableName) => this.getTable(tableName).getAllRows())(columns);
  }

  save(): void {
    if (this.transactionSnapshot !== null) {
      throw new Error('Cannot call save() during a transaction. Use commit() to apply changes.');
    }
    this.saved += 1;
  }

  beginTransaction(): void {
    if (this.transactionSnapshot !== null) {
      throw new Error('Transaction already in progress. Commit or rollback current transaction first.');
    }
    this.transactionSnapshot = new Map();
    for (const [name, tbl] of this.store) this.transactionSnapshot.set(name, tbl.snapshotRows());
  }

  commit(): void {
    if (this.transactionSnapshot === null) {
      throw new Error('No transaction in progress. Call beginTransaction() first.');
    }
    this.transactionSnapshot = null;
    this.saved += 1; // commit flushes pending writes, like save() outside a transaction
    this.committed += 1;
  }

  rollback(): void {
    if (this.transactionSnapshot === null) {
      throw new Error('No transaction in progress. Call beginTransaction() first.');
    }
    for (const [name, tbl] of this.store) {
      const snapshot = this.transactionSnapshot.get(name);
      tbl.restoreRows(snapshot ?? []); // tables created inside the transaction revert to empty
    }
    this.transactionSnapshot = null;
    this.rolledBack += 1;
  }
}
