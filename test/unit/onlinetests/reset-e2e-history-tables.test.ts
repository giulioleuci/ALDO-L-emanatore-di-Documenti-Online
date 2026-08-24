import {
  migratePersistedE2eFixture,
  PROP_ONLINETEST_FIXTURE_VERSION,
  PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID,
  resetE2eHistoryTables
} from '../../../src/onlinetests';
import { SheetDbAdapter } from '../../../src/infrastructure/db/SheetDbAdapter';
import { ServiceContainer } from '../../../src/config/ServiceContainer';
import { buildMaterieRows } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { COL_CONF_MAIL, COL_MATERIE, TABLE } from '../../../src/config/schema';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { CONF_MAIL_STATIC_ALLEGATO } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
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

function recordingProperties(
  fixtureVersion: string | null = null,
  staticAttachmentFileId: string | null = 'static-attachment'
): IPropertiesFacade & { set: jest.Mock<void, [string, string]> } {
  const values = new Map<string, string>();
  if (fixtureVersion !== null) values.set(PROP_ONLINETEST_FIXTURE_VERSION, fixtureVersion);
  if (staticAttachmentFileId !== null) {
    values.set(PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID, staticAttachmentFileId);
  }
  return {
    get: (key: string) => values.get(key) ?? null,
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}

function containerFor(adapter: SheetDbAdapter): ServiceContainer {
  const container = new ServiceContainer();
  container.register('db', () => adapter);
  return container;
}

function materiaData(excludedIds: string[] = [], includeUnrelated = false): unknown[][] {
  const rows = buildMaterieRows().filter(
    (row) => !excludedIds.includes(String(row[COL_MATERIE.ID]))
  );
  if (includeUnrelated) {
    rows.push({
      [COL_MATERIE.ID]: 'CUSTOM.SUBJECT',
      [COL_MATERIE.NOME]: 'Custom subject'
    });
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))];
}

function baseSeed(
  excludedMaterie: string[] = [],
  includeUnrelated = false
): Record<string, unknown[][]> {
  return {
    LOG_MAIL: [
      ['PATTERN', 'DESTINATARI', 'DATA', 'STATO', 'ALLEGATI', 'ERRORE', 'TESTO'],
      ['E2E_MAIL_PIANI', 'stale@real.example.com', '2026-01-01T00:00:00Z', 'INVIATO', '', '', ''],
      [
        'E2E_MAIL_VERBALE',
        'sgsa-onlinetests@onlinetest.aldo.local',
        '2026-08-01T00:00:00Z',
        'INVIATO',
        '',
        '',
        ''
      ]
    ],
    LOG_DOCS: [
      [
        'ID',
        'ID_GEN',
        'TIPO',
        'SOTTOTIPO',
        'NOME',
        'STATO',
        'NOTIFICATO',
        'PATH',
        'LINK',
        'CLASSI',
        'UTENTI',
        'MATERIE',
        'DATA_CREAZ',
        'ID_ORIG'
      ],
      [
        'doc-1',
        'E2E_DOC_VERBALE',
        'VERBALE',
        '',
        'n1',
        'OK',
        '',
        'p1',
        'l1',
        '3C',
        '',
        '',
        '2026-01-01',
        ''
      ],
      [
        'doc-2',
        'E2E_DOC_VERBALE',
        'VERBALE',
        '',
        'n2',
        'OK',
        '',
        'p2',
        'l2',
        '3C',
        '',
        'MATE',
        '2026-08-01',
        ''
      ]
    ],
    MATERIE: materiaData(excludedMaterie, includeUnrelated),
    CONF_MAIL: [
      [COL_CONF_MAIL.ID, COL_CONF_MAIL.ALLEGATI_STATICI],
      [CONF_MAIL_STATIC_ALLEGATO, JSON.stringify(['configured-static-document'])]
    ],
    ASL: [['STUDENTE', 'ANNO', 'ORE']]
  };
}

function physicalSpreadsheet(initialHeader: unknown[]) {
  const header = initialHeader.slice();
  return {
    getRanges: jest.fn(() => [header.slice()]),
    deleteColumn: jest.fn((_spreadsheetId: string, _sheetName: string, columnIndex: number) => {
      header.splice(columnIndex - 1, 1);
    })
  };
}

function migrationOverrides(
  adapter: SheetDbAdapter,
  properties: IPropertiesFacade,
  spreadsheetService: ReturnType<typeof physicalSpreadsheet>
) {
  return {
    properties,
    readSample: () => sample(),
    resetAldo: jest.fn(),
    initAldo: jest.fn(() => containerFor(adapter)),
    spreadsheetService
  };
}

test('repairs an absent attachment property only from configured E2E_MAIL_STATIC_ALLEGATO with strict Drive metadata', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties(null, null);
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);
  const getFiles = jest.fn(() => ({
    id: 'configured-static-document',
    mimeType: 'application/vnd.google-apps.document'
  }));

  migratePersistedE2eFixture({
    ...migrationOverrides(adapter, properties, spreadsheetService),
    staticAttachmentDriveService: { getFiles }
  });

  expect(getFiles).toHaveBeenCalledWith('configured-static-document', {
    fields: 'id,mimeType',
    strict: true
  });
  expect(properties.set).toHaveBeenCalledWith(
    PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID,
    'configured-static-document'
  );
});

test('persists a valid v2 attachment repair once, then leaves the invariant-valid fixture untouched', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties('3', null);
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);
  const getFiles = jest.fn(() => ({
    id: 'configured-static-document',
    mimeType: 'application/vnd.google-apps.document'
  }));
  const overrides = {
    ...migrationOverrides(adapter, properties, spreadsheetService),
    staticAttachmentDriveService: { getFiles }
  };

  migratePersistedE2eFixture(overrides);

  expect(properties.set).toHaveBeenCalledTimes(1);
  expect(properties.set).toHaveBeenCalledWith(
    PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID,
    'configured-static-document'
  );

  properties.set.mockClear();
  migratePersistedE2eFixture(overrides);

  expect(properties.set).not.toHaveBeenCalled();
});

test.each([
  [
    'missing configured ID',
    '[]',
    () => ({ id: '', mimeType: 'application/vnd.google-apps.document' })
  ],
  [
    'inaccessible configured ID',
    JSON.stringify(['configured-static-document']),
    () => {
      throw new Error('404');
    }
  ],
  [
    'Google Sheets configured ID',
    JSON.stringify(['configured-static-document']),
    () => ({
      id: 'configured-static-document',
      mimeType: 'application/vnd.google-apps.spreadsheet'
    })
  ]
])('does not persist a bogus attachment ID when migration finds %s', (_label, allegati, lookup) => {
  const seed = baseSeed();
  seed['CONF_MAIL']![1]![1] = allegati;
  const adapter = new SheetDbAdapter(libDb(seed));
  const properties = recordingProperties(null, null);

  expect(() =>
    migratePersistedE2eFixture({
      ...migrationOverrides(adapter, properties, physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE'])),
      staticAttachmentDriveService: { getFiles: lookup }
    })
  ).toThrow(/creaDatiMockDrive\(true\)/);
  expect(properties.set).not.toHaveBeenCalled();
});

test('migrates a missing INTERPRET.FLAUTO row and exact trimmed ASL header without purging history', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed(['INTERPRET.FLAUTO'], true)));
  const save = jest.spyOn(adapter, 'save');
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE', ' DATA_MODIFICA ']);

  const result = migratePersistedE2eFixture(
    migrationOverrides(adapter, properties, spreadsheetService)
  );

  expect(result.insertedMaterie).toEqual(['INTERPRET.FLAUTO']);
  expect(result.deletedAslColumn).toBe(true);
  expect(spreadsheetService.deleteColumn).toHaveBeenCalledWith('sample', 'ASL', 4);
  expect(properties.set).toHaveBeenCalledWith(PROP_ONLINETEST_FIXTURE_VERSION, '3');
  expect(save).toHaveBeenCalledTimes(1);
  expect(adapter.table(TABLE.LOG_MAIL).findAll()).toHaveLength(2);
  expect(adapter.table(TABLE.LOG_DOCS).findAll()).toHaveLength(2);
  expect(
    adapter
      .table(TABLE.MATERIE)
      .findAll()
      .map((row) => row[COL_MATERIE.ID])
  ).toEqual(expect.arrayContaining(['INTERPRET.FLAUTO', 'CUSTOM.SUBJECT']));
});

test('a second verified migration run performs no persisted mutation', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed(['INTERPRET.FLAUTO'])));
  const save = jest.spyOn(adapter, 'save');
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']);
  const overrides = migrationOverrides(adapter, properties, spreadsheetService);

  migratePersistedE2eFixture(overrides);
  properties.set.mockClear();
  spreadsheetService.deleteColumn.mockClear();
  save.mockClear();
  const rowCount = adapter.table(TABLE.MATERIE).findAll().length;

  const result = migratePersistedE2eFixture(overrides);

  expect(result).toMatchObject({ insertedMaterie: [], deletedAslColumn: false, version: 3 });
  expect(adapter.table(TABLE.MATERIE).findAll()).toHaveLength(rowCount);
  expect(spreadsheetService.deleteColumn).not.toHaveBeenCalled();
  expect(properties.set).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test('reinserisce le MATERIE canoniche mancanti alla versione corrente', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed(['INTERPRET.FLAUTO'])));
  const properties = recordingProperties('3');
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);

  const result = migratePersistedE2eFixture(
    migrationOverrides(adapter, properties, spreadsheetService)
  );

  expect(result.insertedMaterie).toEqual(['INTERPRET.FLAUTO']);
  expect(
    adapter
      .table(TABLE.MATERIE)
      .findAll()
      .some((row) => row[COL_MATERIE.ID] === 'INTERPRET.FLAUTO')
  ).toBe(true);
});

test('ripara ASL.DATA_MODIFICA anche quando la versione fixture è già quella richiesta', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties('3');
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']);

  const result = migratePersistedE2eFixture(
    migrationOverrides(adapter, properties, spreadsheetService)
  );

  expect(result.deletedAslColumn).toBe(true);
  expect(spreadsheetService.deleteColumn).toHaveBeenCalledWith(expect.any(String), 'ASL', 4);
});

test('treats zero DATA_MODIFICA physical headers as already migrated', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);

  const result = migratePersistedE2eFixture(
    migrationOverrides(adapter, properties, spreadsheetService)
  );

  expect(result.deletedAslColumn).toBe(false);
  expect(spreadsheetService.deleteColumn).not.toHaveBeenCalled();
  expect(properties.set).toHaveBeenCalledWith(PROP_ONLINETEST_FIXTURE_VERSION, '3');
});

test('preserves an existing canonical MATERIE row instead of rewriting it', () => {
  const seed = baseSeed();
  const headers = seed['MATERIE']![0] as string[];
  const idIndex = headers.indexOf(COL_MATERIE.ID);
  const nameIndex = headers.indexOf(COL_MATERIE.NOME);
  const matRow = seed['MATERIE']!.slice(1).find((row) => row[idIndex] === 'MAT')!;
  matRow[nameIndex] = 'CUSTOM';
  const adapter = new SheetDbAdapter(libDb(seed));
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);

  migratePersistedE2eFixture(migrationOverrides(adapter, properties, spreadsheetService));

  expect(
    adapter.table(TABLE.MATERIE).find((row) => row[COL_MATERIE.ID] === 'MAT')?.[COL_MATERIE.NOME]
  ).toBe('CUSTOM');
});

test('refuses ambiguous duplicate DATA_MODIFICA headers without mutation', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet([
    'STUDENTE',
    'DATA_MODIFICA',
    'ORE',
    ' DATA_MODIFICA '
  ]);

  expect(() =>
    migratePersistedE2eFixture(migrationOverrides(adapter, properties, spreadsheetService))
  ).toThrow(/DATA_MODIFICA.*2/);
  expect(spreadsheetService.deleteColumn).not.toHaveBeenCalled();
  expect(properties.set).not.toHaveBeenCalled();
});

test('revalidates the ASL header immediately before deletion and rejects mutation drift', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet([]);
  spreadsheetService.getRanges
    .mockReturnValueOnce([['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']])
    .mockReturnValueOnce([['STUDENTE', 'ANNO', 'ORE', 'ALTRO', 'DATA_MODIFICA']]);

  expect(() =>
    migratePersistedE2eFixture(migrationOverrides(adapter, properties, spreadsheetService))
  ).toThrow(/cambiata/);
  expect(spreadsheetService.deleteColumn).not.toHaveBeenCalled();
  expect(properties.set).not.toHaveBeenCalled();
});

test('writes the fixture version only after the structural mutation succeeds', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed()));
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE', 'DATA_MODIFICA']);
  spreadsheetService.deleteColumn.mockImplementation(() => {
    throw new Error('delete failed');
  });

  expect(() =>
    migratePersistedE2eFixture(migrationOverrides(adapter, properties, spreadsheetService))
  ).toThrow('delete failed');
  expect(properties.set).not.toHaveBeenCalled();
});

test('the explicit reset migrates first and then purges only LOG_MAIL/LOG_DOCS', () => {
  const adapter = new SheetDbAdapter(libDb(baseSeed(['INTERPRET.FLAUTO'], true)));
  const save = jest.spyOn(adapter, 'save');
  const properties = recordingProperties();
  const spreadsheetService = physicalSpreadsheet(['STUDENTE', 'ANNO', 'ORE']);

  const result = resetE2eHistoryTables(migrationOverrides(adapter, properties, spreadsheetService));

  expect(result.purgedLogMail).toBe(2);
  expect(result.purgedLogDocs).toBe(2);
  expect(result.insertedMaterie).toEqual(['INTERPRET.FLAUTO']);
  expect(save).toHaveBeenCalledTimes(2);
  expect(adapter.table(TABLE.LOG_MAIL).findAll()).toHaveLength(0);
  expect(adapter.table(TABLE.LOG_DOCS).findAll()).toHaveLength(0);
  expect(
    adapter
      .table(TABLE.MATERIE)
      .findAll()
      .map((row) => row[COL_MATERIE.ID])
  ).toEqual(expect.arrayContaining(['INTERPRET.FLAUTO', 'CUSTOM.SUBJECT']));
});
