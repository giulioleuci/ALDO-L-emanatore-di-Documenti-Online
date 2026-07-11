import type { IDatabase, IReadableTable, Row, IndexedLookup } from './Database';
import { createSelect, type EqualityQueryBuilder } from './Database';
import { TABLE, COL_CARENZE, COL_LOG_MAIL } from '../../config/schema';

/**
 * Adapter binding SheetDBLib's DatabaseService (L2) to ALDO's ports: the
 * IDatabase pipeline port (findAll/find/insert + transactions) and the
 * DomainRepositoryLib RepositoryDatabase seam (getByPK/getAllRows/insertRow/
 * updateRowById/updateRowWhere). Composite-PK tables (01: CARENZE, LOG_MAIL)
 * get a synthetic `__PK` virtual column (defineVirtualColumn + setPrimaryKey),
 * so `updateRowById` targets the exact row without any library extension —
 * the library applies virtual columns while resolving key lookups.
 */

const VIRTUAL_PK = '__PK';
const SEP = '::';

/** Composite business keys per 01_SCHEMA_DATABASE.md (write paths need exact row identity). */
const COMPOSITE_PK: Record<string, string[]> = {
  [TABLE.CARENZE]: [COL_CARENZE.STUDENTE, COL_CARENZE.PROGRESSIVO],
  [TABLE.LOG_MAIL]: [COL_LOG_MAIL.PATTERN, COL_LOG_MAIL.DESTINATARI, COL_LOG_MAIL.DATA]
};

/** Single-column PKs per 01 (tables not listed keep the library default). */
const SINGLE_PK: Record<string, string> = {
  [TABLE.CLASSI]: 'ID', [TABLE.DOCENTI]: 'EMAIL', [TABLE.ALUNNI]: 'EMAIL', [TABLE.MATERIE]: 'ID',
  [TABLE.INDIRIZZI]: 'ID', [TABLE.DIPART]: 'ID', [TABLE.RUOLI]: 'ID', [TABLE.CONF_DOC]: 'ID',
  [TABLE.CONF_MAIL]: 'ID', [TABLE.CONF_IMP]: 'ID', [TABLE.LOG_DOCS]: 'ID', [TABLE.LOG_FOLD]: 'ID',
  [TABLE.MASTER]: 'ANNO_SCOLASTICO'
};

/** Scalar cell → string key part; non-scalars never form a key. */
function cell(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

function stripVirtual(row: Record<string, unknown>): Row {
  const rest = { ...row };
  delete rest[VIRTUAL_PK];
  return rest as Row;
}

class SheetTableAdapter implements IReadableTable {
  private readonly composite: string[] | undefined;
  private readonly singlePk: string | undefined;

  constructor(
    private readonly table: SheetTableService,
    tableName: string
  ) {
    this.composite = COMPOSITE_PK[tableName];
    if (this.composite !== undefined) {
      const parts = this.composite;
      this.table.defineVirtualColumn(VIRTUAL_PK, (row) => parts.map((c) => cell(row[c])).join(SEP));
      this.table.setPrimaryKey(VIRTUAL_PK);
    } else {
      this.singlePk = SINGLE_PK[tableName];
      if (this.singlePk !== undefined) this.table.setPrimaryKey(this.singlePk);
    }
  }

  /** The library key value identifying `row` (composite synthetic or single column). */
  private keyOf(row: Record<string, unknown>): string {
    if (this.composite !== undefined) return this.composite.map((c) => cell(row[c])).join(SEP);
    return cell(row[this.singlePk ?? Object.keys(row)[0] ?? '']);
  }

  // --- IReadableTable (pipeline port) ---
  findAll(): Row[] {
    return this.table.getAllRows().map(stripVirtual);
  }
  find(predicate: (row: Row) => boolean): Row | null {
    return this.findAll().find(predicate) ?? null;
  }
  insert(row: Row): void {
    this.table.insertRow(row);
  }

  // --- RepositoryDatabase seam (DomainRepositoryLib) ---
  getAllRows(): Row[] {
    return this.findAll();
  }
  getByPK(id: string): Row | null {
    const row = this.table.getByPK(id);
    return row === null ? null : stripVirtual(row);
  }
  insertRow(row: Row): Row {
    return stripVirtual(this.table.insertRow(row));
  }
  updateRowById(id: string, row: Row): void {
    this.table.updateRowById(id, row);
  }
  /**
   * Composite-key write: replace the single row matching ALL `match` columns
   * (append if none). When `match` supplies exactly this table's declared
   * primary-key columns (the common case: repositories match on the same
   * composite/single key the adapter set up in the constructor), resolves the
   * row via `getByPK` in O(1) instead of a linear scan (ref REPORT_GLF.md A3).
   */
  updateRowWhere(match: Row, row: Row): void {
    const keys = Object.keys(match);
    const hit = this.isExactKeyMatch(keys)
      ? this.table.getByPK(this.keyOf(match)) ?? undefined
      : this.table.getAllRows().find((r) => keys.every((k) => String(r[k]) === String(match[k])));
    if (hit === undefined) {
      this.table.insertRow(row);
      return;
    }
    const key = this.composite !== undefined ? cell(hit[VIRTUAL_PK]) : this.keyOf(stripVirtual(hit));
    this.table.updateRowById(key, row);
  }

  /** True when `matchKeys` is exactly this table's declared PK column set. */
  private isExactKeyMatch(matchKeys: string[]): boolean {
    const declared = this.composite ?? (this.singlePk !== undefined ? [this.singlePk] : undefined);
    if (declared === undefined || matchKeys.length !== declared.length) return false;
    return declared.every((c) => matchKeys.includes(c));
  }

  /** O(1) hot-lookup index on a physical column (ref REPORT_GLF.md A2). */
  createIndex(columnName: string): void {
    this.table.createIndex(columnName);
  }

  /** Exact-match lookup via a previously built index; null if none exists for `columnName`. */
  indexedLookup(columnName: string, value: unknown): Row[] | null {
    const hits = this.table._indexedLookup(columnName, value);
    return hits === null ? null : hits.map(stripVirtual);
  }
}

export class SheetDbAdapter implements IDatabase {
  /** RepositoryDatabase seam: repositories read/write through the same adapters. */
  public readonly tables: Record<string, SheetTableAdapter>;
  private readonly cache = new Map<string, SheetTableAdapter>();

  constructor(private readonly service: DatabaseService) {
    this.tables = new Proxy<Record<string, SheetTableAdapter>>({}, {
      get: (_target, name: string): SheetTableAdapter => this.adapterFor(name)
    });
  }

  /**
   * The raw SheetDBLib `DatabaseService` this adapter wraps (ref REPORT_GLF.md
   * B9): `GasDataImporter`'s `Loader` writes through the library's own table
   * API (`insertRows`/`updateRowById`/`deleteRowById`), which `SheetTableAdapter`
   * doesn't implement — so `ImportEngine` needs the underlying service, not the
   * adapter. Exposing it lets callers share one `DatabaseService` per
   * spreadsheet per execution instead of opening a second one just for the
   * importer.
   */
  getDatabaseService(): DatabaseService {
    return this.service;
  }

  private adapterFor(name: string): SheetTableAdapter {
    let adapter = this.cache.get(name);
    if (adapter === undefined) {
      adapter = new SheetTableAdapter(this.service.tables[name]!, name);
      this.cache.set(name, adapter);
    }
    return adapter;
  }

  table(name: string): IReadableTable {
    return this.adapterFor(name);
  }

  /**
   * DomainRepositoryLib Repository.find() query-pushdown seam (ref REPORT_GLF.md
   * B1/A1), using a per-table index when one was built (ref A2) instead of a
   * full scan for single-equality-clause queries.
   */
  select(columns: string[]): { from(tableName: string): EqualityQueryBuilder } {
    const indexedLookupFor = (tableName: string): IndexedLookup =>
      (column, value) => this.adapterFor(tableName).indexedLookup(column, value);
    return createSelect(
      (tableName) => this.adapterFor(tableName).getAllRows(),
      indexedLookupFor
    )(columns);
  }

  save(): void {
    this.service.save();
  }
  beginTransaction(): void {
    this.service.beginTransaction();
  }
  commit(): void {
    this.service.commit();
  }
  rollback(): void {
    this.service.rollback();
  }
}
