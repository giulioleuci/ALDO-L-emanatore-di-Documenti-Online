// Ambient declarations for GasLibraryFactory globals (vendored bundle).
// Authored from GasLibraryFactory/DOCS_LIBS/*_docs.md. Extend as needed.
export {};

declare global {
  // --- CoreUtilsLib (L0) ---
  class LoggerService {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  }

  // --- SheetDBLib (L2): minimal read/write surface used by the slice ---
  type SheetRow = Record<string, string | number | boolean | null>;
  interface SheetTable {
    findAll(): SheetRow[];
    find(predicate: (row: SheetRow) => boolean): SheetRow | null;
    insert(row: SheetRow): void;
  }
  class SheetDatabase {
    table(name: string): SheetTable;
    save(): void;
  }
}
