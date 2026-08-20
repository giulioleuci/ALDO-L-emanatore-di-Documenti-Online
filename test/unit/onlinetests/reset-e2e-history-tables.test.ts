import { resetE2eHistoryTables } from '../../../src/onlinetests';
import { SheetDbAdapter } from '../../../src/infrastructure/db/SheetDbAdapter';
import { ServiceContainer } from '../../../src/config/ServiceContainer';
import { buildMaterieRows } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { COL_MATERIE, TABLE } from '../../../src/config/schema';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';

const logger = new LoggerService();

/** Records writes; reads never happen because tables get preloadedData (mirrors sheetdb-adapter.test.ts). */
function stubSpreadsheetService(): Record<string, unknown> {
  const noop = () => [];
  return {
    getRanges: noop,
    updateRanges: noop,
    appendRows: noop,
    deleteRows: noop,
    getSheetData: noop,
    writeSheetData: noop
  };
}

/** A DatabaseService-shaped object whose tables are REAL vendored TableService instances (offline, preloadedData). */
function libDb(seed: Record<string, unknown[][]>) {
  const ss = stubSpreadsheetService();
  const tables: Record<string, TableService> = {};
  for (const [name, data] of Object.entries(seed)) {
    tables[name] = new TableService(name, 'fake-ss', ss, logger, new UtilsService(), data);
  }
  return {
    tables,
    save(): void {},
    beginTransaction(): void {},
    commit(): void {},
    rollback(): void {}
  };
}

function sample(): SharedTestDatabase {
  return {
    masterSpreadsheetId: 'master',
    sampleSpreadsheetId: 'sample',
    sampleSpreadsheetUrl: 'https://example.test/sample',
    sampleFolderUrl: 'https://example.test/folder',
    priorSampleSpreadsheetId: 'prior1',
    priorSampleSpreadsheetUrl: 'https://example.test/prior1',
    priorSampleSpreadsheetId2: 'prior2',
    priorSampleSpreadsheetUrl2: 'https://example.test/prior2',
    logFoldFolderUrl: 'https://example.test/logfold',
    jobRunnerDocConfigId: 'JOBRUNNER_DOC',
    masterTestMode: true,
    staticAttachmentFileId: 'static-attachment'
  };
}

function fakeProperties(): IPropertiesFacade {
  return {
    get: () => undefined,
    set: () => {},
    remove: () => {}
  } as unknown as IPropertiesFacade;
}

function containerFor(adapter: SheetDbAdapter): ServiceContainer {
  const container = new ServiceContainer();
  container.register('db', () => adapter);
  return container;
}

function baseSeed(): Record<string, unknown[][]> {
  return {
    LOG_MAIL: [
      ['PATTERN', 'DESTINATARI', 'DATA', 'STATO', 'ALLEGATI', 'ERRORE', 'TESTO'],
      ['E2E_MAIL_PIANI', 'stale@real.example.com', '2026-01-01T00:00:00Z', 'INVIATO', '', '', ''],
      ['E2E_MAIL_VERBALE', 'sgsa-onlinetests@onlinetest.aldo.local', '2026-08-01T00:00:00Z', 'INVIATO', '', '', '']
    ],
    LOG_DOCS: [
      ['ID', 'ID_GEN', 'TIPO', 'SOTTOTIPO', 'NOME', 'STATO', 'NOTIFICATO', 'PATH', 'LINK', 'CLASSI', 'UTENTI', 'MATERIE', 'DATA_CREAZ', 'ID_ORIG'],
      ['doc-1', 'E2E_DOC_VERBALE', 'VERBALE', '', 'n1', 'OK', '', 'p1', 'l1', '3C', '', '', '2026-01-01', ''],
      ['doc-2', 'E2E_DOC_VERBALE', 'VERBALE', '', 'n2', 'OK', '', 'p2', 'l2', '3C', '', 'MATE', '2026-08-01', '']
    ],
    MATERIE: [
      [
        COL_MATERIE.ID,
        COL_MATERIE.NOME,
        COL_MATERIE.SINTESI,
        COL_MATERIE.COLORE_1,
        COL_MATERIE.COLORE_2,
        COL_MATERIE.SIMBOLO,
        COL_MATERIE.ESAME_CFG,
        COL_MATERIE.EVOLUZIONE,
        COL_MATERIE.IS_RELIGIONE_ALT
      ],
      // Deliberately non-canonical NOME to prove the top-up never touches this existing row.
      ['MAT', 'CUSTOM', 'CUSTOM', '#000', '#fff', 'M', '', '', false]
    ],
    ASL: [['STUDENTE', 'ANNO', 'ORE']]
  };
}

test('purges every LOG_MAIL/LOG_DOCS row, regardless of content', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const container = containerFor(adapter);

  const result = resetE2eHistoryTables({
    properties: fakeProperties(),
    readSample: () => sample(),
    resetAldo: () => {},
    initAldo: () => container
  });

  expect(result.purgedLogMail).toBe(2);
  expect(result.purgedLogDocs).toBe(2);
  expect(adapter.table(TABLE.LOG_MAIL).findAll()).toHaveLength(0);
  expect(adapter.table(TABLE.LOG_DOCS).findAll()).toHaveLength(0);
});

test('tops up MATERIE with only the missing rows, never touching an existing one', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const container = containerFor(adapter);
  const expectedFullSet = buildMaterieRows().map((row) => String(row[COL_MATERIE.ID]));

  const result = resetE2eHistoryTables({
    properties: fakeProperties(),
    readSample: () => sample(),
    resetAldo: () => {},
    initAldo: () => container
  });

  expect(result.insertedMaterie.sort()).toEqual(
    expectedFullSet.filter((id) => id !== 'MAT').sort()
  );
  const rows = adapter.table(TABLE.MATERIE).findAll();
  expect(rows.map((row) => String(row[COL_MATERIE.ID])).sort()).toEqual(expectedFullSet.sort());
  // The pre-existing MAT row's custom NOME survived — top-up is additive only.
  expect(rows.find((row) => row[COL_MATERIE.ID] === 'MAT')?.[COL_MATERIE.NOME]).toBe('CUSTOM');
});

test('warns about a stray ASL column instead of trying to fix it', () => {
  const seed = baseSeed();
  seed['ASL'] = [
    ['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA'],
    ['a1@school.it', 1, 10, '2026-01-01']
  ];
  const adapter = new SheetDbAdapter(libDb(seed));
  const container = containerFor(adapter);

  const result = resetE2eHistoryTables({
    properties: fakeProperties(),
    readSample: () => sample(),
    resetAldo: () => {},
    initAldo: () => container
  });

  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatch(/DATA_MODIFICA/);
});

test('no ASL warning when the sheet matches the canonical schema', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const container = containerFor(adapter);

  const result = resetE2eHistoryTables({
    properties: fakeProperties(),
    readSample: () => sample(),
    resetAldo: () => {},
    initAldo: () => container
  });

  expect(result.warnings).toHaveLength(0);
});
