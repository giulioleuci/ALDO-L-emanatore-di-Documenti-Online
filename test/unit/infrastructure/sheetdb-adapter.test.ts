import { SheetDbAdapter } from '../../../src/infrastructure/db/SheetDbAdapter';

const logger = new LoggerService();

/** Records writes; reads never happen because tables get preloadedData. */
function stubSpreadsheetService(): { calls: string[] } & Record<string, unknown> {
  const calls: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push(name);
    void args;
    return [];
  };
  return {
    calls,
    getRanges: record('getRanges'),
    updateRanges: record('updateRanges'),
    appendRows: record('appendRows'),
    deleteRows: record('deleteRows'),
    getSheetData: record('getSheetData'),
    writeSheetData: record('writeSheetData')
  };
}

/**
 * A DatabaseService-shaped object whose tables are REAL vendored TableService
 * instances hydrated via preloadedData (no SpreadsheetApp needed offline).
 */
function libDb(seed: Record<string, unknown[][]>) {
  const ss = stubSpreadsheetService();
  const tables: Record<string, TableService> = {};
  for (const [name, data] of Object.entries(seed)) {
    tables[name] = new TableService(name, 'fake-ss', ss, logger, new UtilsService(), data);
  }
  let inTransaction = false;
  const db = {
    tables,
    saved: 0,
    save(): void {
      if (inTransaction) throw new Error('Cannot call save() during a transaction. Use commit() to apply changes.');
      this.saved += 1;
    },
    beginTransaction(): void { inTransaction = true; },
    commit(): void { inTransaction = false; },
    rollback(): void { inTransaction = false; }
  };
  return { db, ss };
}

function seed() {
  return {
    CLASSI: [
      ['ID', 'ANNO', 'ATTIVA'],
      ['5A', 5, true],
      ['3B', 3, false]
    ],
    CARENZE: [
      ['STUDENTE', 'PROGRESSIVO', 'NOTIFICATO', 'MATE'],
      ['a1@school.it', 1, '', '4.5'],
      ['a1@school.it', 2, 'già', '5'],
      ['a2@school.it', 1, '', '3']
    ]
  };
}

test('IDatabase port: findAll/find/insert over real TableService rows', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db as unknown as DatabaseService);
  const rows = adapter.table('CLASSI').findAll();
  expect(rows).toHaveLength(2);
  expect(rows[0]!['ID']).toBe('5A');
  expect(adapter.table('CLASSI').find((r) => r['ID'] === '3B')?.['ANNO']).toBe(3);
  adapter.table('CLASSI').insert({ ID: '1F', ANNO: 1, ATTIVA: true });
  expect(adapter.table('CLASSI').findAll()).toHaveLength(3);
});

test('RepositoryDatabase seam: getByPK on single-PK table', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db as unknown as DatabaseService);
  expect(adapter.tables['CLASSI']!.getByPK('5A')?.['ANNO']).toBe(5);
  expect(adapter.tables['CLASSI']!.getByPK('9Z')).toBeNull();
});

test('composite-PK table: updateRowWhere targets the exact row via synthetic __PK (no library extension)', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db as unknown as DatabaseService);
  // Both a1 rows share STUDENTE — the virtual composite key disambiguates.
  adapter.tables['CARENZE']!.updateRowWhere(
    { STUDENTE: 'a1@school.it', PROGRESSIVO: 1 },
    { STUDENTE: 'a1@school.it', PROGRESSIVO: 1, NOTIFICATO: '2026-07-06T00:00:00.000Z', MATE: '4.5' }
  );
  const rows = adapter.table('CARENZE').findAll();
  expect(rows.find((r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1)!['NOTIFICATO'])
    .toBe('2026-07-06T00:00:00.000Z');
  expect(rows.find((r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 2)!['NOTIFICATO']).toBe('già');
});

test('rows returned by the adapter do not leak the synthetic __PK column', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db as unknown as DatabaseService);
  for (const row of adapter.table('CARENZE').findAll()) {
    expect(Object.keys(row)).not.toContain('__PK');
  }
  expect(Object.keys(adapter.tables['CARENZE']!.getAllRows()[0]!)).not.toContain('__PK');
});

test('transaction methods delegate to the library service (save forbidden inside transaction)', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db as unknown as DatabaseService);
  adapter.beginTransaction();
  expect(() => adapter.save()).toThrow(/transaction/);
  adapter.rollback();
  adapter.save();
  expect((db as unknown as { saved: number }).saved).toBe(1);
});
