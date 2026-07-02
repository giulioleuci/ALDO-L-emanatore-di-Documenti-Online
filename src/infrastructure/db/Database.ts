export type Row = Record<string, string | number | boolean | null>;

export interface IReadableTable {
  findAll(): Row[];
  find(predicate: (row: Row) => boolean): Row | null;
  insert(row: Row): void;
}

export interface IDatabase {
  table(name: string): IReadableTable;
  save(): void;
}
