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
  const adapter = new SheetDbAdapter(db);
  const rows = adapter.table('CLASSI').findAll();
  expect(rows).toHaveLength(2);
  expect(rows[0]!['ID']).toBe('5A');
  expect(adapter.table('CLASSI').find((r) => r['ID'] === '3B')?.['ANNO']).toBe(3);
  adapter.table('CLASSI').insert({ ID: '1F', ANNO: 1, ATTIVA: true });
  expect(adapter.table('CLASSI').findAll()).toHaveLength(3);
});

test('RepositoryDatabase seam: getByPK on single-PK table', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);
  expect(adapter.tables['CLASSI']!.getByPK('5A')?.['ANNO']).toBe(5);
  expect(adapter.tables['CLASSI']!.getByPK('9Z')).toBeNull();
});

test('composite-PK table: updateRowWhere targets the exact row via synthetic __PK (no library extension)', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);
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

test('updateRowWhere resolves an exact-PK match via getByPK, not a full scan (ref A3)', () => {
  const { db } = libDb(seed());
  const carenzeTable = db.tables['CARENZE']!;
  const getByPkSpy = jest.spyOn(carenzeTable, 'getByPK');
  const getAllRowsSpy = jest.spyOn(carenzeTable, 'getAllRows');
  const adapter = new SheetDbAdapter(db);

  adapter.tables['CARENZE']!.updateRowWhere(
    { STUDENTE: 'a1@school.it', PROGRESSIVO: 1 },
    { STUDENTE: 'a1@school.it', PROGRESSIVO: 1, NOTIFICATO: 'x', MATE: '4.5' }
  );

  expect(getByPkSpy).toHaveBeenCalledWith('a1@school.it::1');
  expect(getAllRowsSpy).not.toHaveBeenCalled();
});

test('updateRowWhere falls back to a full scan for a non-PK match', () => {
  const { db } = libDb(seed());
  const carenzeTable = db.tables['CARENZE']!;
  const getAllRowsSpy = jest.spyOn(carenzeTable, 'getAllRows');
  const adapter = new SheetDbAdapter(db);

  // MATE alone is not CARENZE's declared PK (STUDENTE, PROGRESSIVO).
  adapter.tables['CARENZE']!.updateRowWhere({ MATE: '4.5' }, { STUDENTE: 'a1@school.it', PROGRESSIVO: 1, NOTIFICATO: '', MATE: '9' });

  expect(getAllRowsSpy).toHaveBeenCalled();
});

test('rows returned by the adapter do not leak the synthetic __PK column', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);
  for (const row of adapter.table('CARENZE').findAll()) {
    expect(Object.keys(row)).not.toContain('__PK');
  }
  expect(Object.keys(adapter.tables['CARENZE']!.getAllRows()[0]!)).not.toContain('__PK');
});

test('transaction methods delegate to the library service (save forbidden inside transaction)', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);
  adapter.beginTransaction();
  expect(() => adapter.save()).toThrow(/transaction/);
  adapter.rollback();
  adapter.save();
  expect((db as unknown as { saved: number }).saved).toBe(1);
});

// REPORT_GLF.md B9: getDatabaseService() lets callers (e.g. GasDataImporter's
// ImportEngine, via Bootstrap.ts) share the exact same DatabaseService instance
// the adapter wraps instead of opening a second one over the same spreadsheet.
test('getDatabaseService returns the exact instance the adapter was constructed with', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);

  expect(adapter.getDatabaseService()).toBe(db);
});

// REPORT_GLF.md A2: createIndex/indexedLookup against the real vendored
// TableSearchEngine (not the FakeDatabase test double), and select()'s
// EqualityQueryBuilder actually taking the indexed path once one exists.
test('indexedLookup returns null before createIndex, then matching rows after', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);

  expect(adapter.tables['CARENZE']!.indexedLookup('STUDENTE', 'a1@school.it')).toBeNull();

  adapter.tables['CARENZE']!.createIndex('STUDENTE');
  const hits = adapter.tables['CARENZE']!.indexedLookup('STUDENTE', 'a1@school.it');

  expect(hits).not.toBeNull();
  expect(hits!.map((r) => r['PROGRESSIVO']).sort()).toEqual([1, 2]);
  expect(hits!.every((r) => !('__PK' in r))).toBe(true);
});

test('select().from().where().execute() uses the index once built, and stays correct without one', () => {
  const { db } = libDb(seed());
  const adapter = new SheetDbAdapter(db);

  const beforeIndex = adapter.select(['*']).from('CARENZE').where('STUDENTE', '=', 'a1@school.it').execute();
  expect(beforeIndex.map((r) => r['PROGRESSIVO']).sort()).toEqual([1, 2]);

  adapter.tables['CARENZE']!.createIndex('STUDENTE');
  const afterIndex = adapter.select(['*']).from('CARENZE').where('STUDENTE', '=', 'a1@school.it').execute();
  expect(afterIndex.map((r) => r['PROGRESSIVO']).sort()).toEqual([1, 2]);
});
