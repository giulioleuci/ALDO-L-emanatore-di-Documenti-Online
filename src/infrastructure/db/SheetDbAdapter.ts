import type { IDatabase, IReadableTable, Row } from './Database';
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

function stripVirtual(row: Record<string, unknown>): Row {
  const { [VIRTUAL_PK]: _omitted, ...rest } = row;
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
      this.table.defineVirtualColumn(VIRTUAL_PK, (row) => parts.map((c) => String(row[c] ?? '')).join(SEP));
      this.table.setPrimaryKey(VIRTUAL_PK);
    } else {
      this.singlePk = SINGLE_PK[tableName];
      if (this.singlePk !== undefined) this.table.setPrimaryKey(this.singlePk);
    }
  }

  /** The library key value identifying `row` (composite synthetic or single column). */
  private keyOf(row: Record<string, unknown>): string {
    if (this.composite !== undefined) return this.composite.map((c) => String(row[c] ?? '')).join(SEP);
    return String(row[this.singlePk ?? Object.keys(row)[0] ?? ''] ?? '');
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
  /** Composite-key write: replace the single row matching ALL `match` columns (append if none). */
  updateRowWhere(match: Row, row: Row): void {
    const keys = Object.keys(match);
    const hit = this.table.getAllRows().find((r) => keys.every((k) => String(r[k]) === String(match[k])));
    if (hit === undefined) {
      this.table.insertRow(row);
      return;
    }
    const key = this.composite !== undefined ? String(hit[VIRTUAL_PK] ?? this.keyOf(hit)) : this.keyOf(stripVirtual(hit));
    this.table.updateRowById(key, row);
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
