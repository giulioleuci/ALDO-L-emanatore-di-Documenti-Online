import type { IDatabase, IReadableTable, Row } from '../../src/infrastructure/db/Database';

// Default primary-key column per table (ref 01_SCHEMA_DATABASE.md), used by the
// DomainRepositoryLib Repository seam's getByPK(id).
const DEFAULT_PK: Record<string, string> = {
  CLASSI: 'ID', DOCENTI: 'EMAIL', ALUNNI: 'EMAIL', MATERIE: 'ID', INDIRIZZI: 'ID',
  DIPART: 'ID', RUOLI: 'ID', CONF_DOC: 'ID', CONF_MAIL: 'ID', LOG_DOCS: 'ID', LOG_FOLD: 'ID',
  // Composite-PK tables: getByPK single-column is unused (repos use getAllRows+filter);
  // first key part is listed only so pkFor does not fall back to 'ID'.
  PIANI: 'STUDENTE', CARENZE: 'STUDENTE', PROGETTI: 'CLASSE', MOV_ALUNNI: 'STUDENTE', ASL: 'STUDENTE',
  SUPPLENZE: 'TITOLARE', VARIAZIONI_CATTEDRA: 'CLASSE_ID'
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
  // DomainRepositoryLib Repository seam:
  getAllRows(): Row[] { return this.rows.slice(); }
  getByPK(id: string): Row | null {
    return this.rows.find((r) => String(r[this.pkColumn]) === String(id)) ?? null;
  }
}

/**
 * Fake database serving both the pipeline's IDatabase port and lib-based
 * repositories' RepositoryDatabase seam over a single in-memory store.
 */
export class FakeDatabase implements IDatabase {
  public saved = 0;
  private readonly store = new Map<string, FakeTable>();
  private readonly pkOverrides: Record<string, string>;
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

  save(): void { this.saved += 1; }
}
