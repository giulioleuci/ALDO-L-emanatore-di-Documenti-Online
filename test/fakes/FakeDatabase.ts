import type { IDatabase, IReadableTable, Row } from '../../src/infrastructure/db/Database';

class FakeTable implements IReadableTable {
  constructor(private rows: Row[]) {}
  findAll(): Row[] { return this.rows.slice(); }
  find(predicate: (row: Row) => boolean): Row | null { return this.rows.find(predicate) ?? null; }
  insert(row: Row): void { this.rows.push(row); }
}

export class FakeDatabase implements IDatabase {
  public saved = 0;
  private tables = new Map<string, FakeTable>();
  constructor(seed: Record<string, Row[]>) {
    for (const [name, rows] of Object.entries(seed)) this.tables.set(name, new FakeTable(rows));
  }
  table(name: string): IReadableTable {
    const t = this.tables.get(name);
    if (!t) { const empty = new FakeTable([]); this.tables.set(name, empty); return empty; }
    return t;
  }
  save(): void { this.saved += 1; }
}
