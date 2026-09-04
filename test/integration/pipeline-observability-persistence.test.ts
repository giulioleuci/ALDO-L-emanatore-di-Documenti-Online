import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { DocPersonalizzatoGeneratorStrategy } from '../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import type { DocumentStrategyFactory } from '../../src/application/factories/DocumentStrategyFactory';
import {
  composeContextBuilder,
  composeEmailNotificationService,
  composeRisolutoreRuoli
} from '../../src/config/ApplicationComposition';
import {
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_LOG_MAIL,
  TABLE
} from '../../src/config/schema';
import { TipoPiano } from '../../src/domain/value-objects/enums';
import { SheetDbAdapter } from '../../src/infrastructure/db/SheetDbAdapter';
import { ExpressionEngineFacade } from '../../src/infrastructure/facades/ExpressionEngineFacade';
import { ConfigurazioneDocumentoRepository } from '../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ClasseRepository } from '../../src/infrastructure/repositories/ClasseRepository';
import { AldoTeachingAssignmentResolver } from '../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../fakes/FakeTemplateEngine';
import { fixtureTables } from '../fixtures/tables';
import type { Row } from '../../src/infrastructure/db/Database';
import { StoricoDocumentiService } from '../../src/application/storico/StoricoDocumentiService';

type NativeSheets = {
  Spreadsheets: {
    get: jest.Mock;
    batchUpdate: jest.Mock;
    Values: {
      batchGet: jest.Mock;
      batchUpdate: jest.Mock;
    };
  };
};

const LOG_HEADERS: Record<string, string[]> = {
  [TABLE.LOG_DOCS]: Object.values(COL_LOG_DOCS),
  [TABLE.LOG_FOLD]: Object.values(COL_LOG_FOLD),
  [TABLE.LOG_MAIL]: Object.values(COL_LOG_MAIL)
};

function headersFor(tableName: string, rows: Row[]): string[] {
  if (rows.length === 0) return LOG_HEADERS[tableName] ?? [];
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function toGrid(tableName: string, rows: Row[]): unknown[][] {
  const headers = headersFor(tableName, rows);
  return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
}

function tableNameFromRange(range: string): string {
  const match = /^'((?:''|[^'])+)'!/.exec(range);
  if (match === null) throw new Error(`Unexpected Sheets range: ${range}`);
  return match[1]!.replace(/''/g, "'");
}

function installRealSheetDb(tables: Record<string, Row[]>, logger: LoggerService): {
  db: SheetDbAdapter;
  sheets: NativeSheets;
  flush: jest.Mock;
  sheetIds: Map<string, number>;
  restore: () => void;
} {
  const originalSheets = (globalThis as unknown as { Sheets?: unknown }).Sheets;
  const originalSpreadsheetApp = (globalThis as unknown as { SpreadsheetApp?: unknown })
    .SpreadsheetApp;
  const tableNames = Object.keys(tables);
  const sheetIds = new Map(tableNames.map((name, index) => [name, index + 1]));
  const grids = new Map(
    tableNames.map((name) => [name, toGrid(name, tables[name] ?? [])] as const)
  );

  const sheets: NativeSheets = {
    Spreadsheets: {
      get: jest.fn(() => ({
        spreadsheetId: 'integration-sheet',
        properties: { title: 'Integration Sheet' },
        sheets: tableNames.map((name, index) => ({
          properties: {
            title: name,
            sheetId: index + 1,
            index,
            sheetType: 'GRID',
            hidden: false,
            gridProperties: {
              rowCount: Math.max(2, (grids.get(name)?.length ?? 0) + 10),
              columnCount: Math.max(1, grids.get(name)?.[0]?.length ?? 0)
            }
          }
        }))
      })),
      batchUpdate: jest.fn(() => ({ spreadsheetId: 'integration-sheet', replies: [] })),
      Values: {
        batchGet: jest.fn((_spreadsheetId: string, params: { ranges?: string[] }) => ({
          spreadsheetId: 'integration-sheet',
          valueRanges: (params.ranges ?? []).map((range) => ({
            range,
            values: grids.get(tableNameFromRange(range)) ?? []
          }))
        })),
        batchUpdate: jest.fn(() => ({
          spreadsheetId: 'integration-sheet',
          totalUpdatedRows: 0,
          totalUpdatedColumns: 0,
          totalUpdatedCells: 0,
          responses: []
        }))
      }
    }
  };
  const flush = jest.fn();
  (globalThis as unknown as { Sheets: NativeSheets }).Sheets = sheets;
  (globalThis as unknown as { SpreadsheetApp: { flush: jest.Mock } }).SpreadsheetApp = { flush };

  const cache = { get: () => null, put: () => undefined, remove: () => undefined };
  const service = new DatabaseService(
    'integration-sheet',
    logger,
    new UtilsService(),
    cache
  );

  return {
    db: new SheetDbAdapter(service),
    sheets,
    flush,
    sheetIds,
    restore: () => {
      if (originalSheets === undefined) {
        delete (globalThis as unknown as { Sheets?: unknown }).Sheets;
      } else {
        (globalThis as unknown as { Sheets: unknown }).Sheets = originalSheets;
      }
      if (originalSpreadsheetApp === undefined) {
        delete (globalThis as unknown as { SpreadsheetApp?: unknown }).SpreadsheetApp;
      } else {
        (globalThis as unknown as { SpreadsheetApp: unknown }).SpreadsheetApp =
          originalSpreadsheetApp;
      }
    }
  };
}

test('pipeline observability survives real SheetDB commit and dynamic job execution', () => {
  const tables = fixtureTables();
  tables.ALUNNI![0]!.COGNOMENOME = 'ROSSI MARIO';
  tables.PIANI = [{ STUDENTE: 'a1@school.it', TIPO: 'PDP_DSA', PARAMETRI: '{}' }];
  tables.CLASSI![0]!.COORD = 'docente@example.edu';
  tables.CLASSI![0]!.MATE = 'docente@example.edu';
  tables.DOCENTI!.push({
    EMAIL: 'docente@example.edu',
    COGNOME: 'DOCENTE',
    NOME: 'TEST',
    GENERE: 'M',
    DIPART: 'SCIENTIFICO_DIP',
    ITP: false
  });
  tables.CONF_DOC = tables.CONF_DOC!.map((row) =>
    row.ID === 'PIANI_PERSONALIZZATI'
      ? {
          ...row,
          MODELLI: '{"templateId":"1TemplateId"}',
          FILE_NAME: '{{focus.piano.tipo}}_Rossi_Mario_2026',
          PATH_OUT: 'Piani/5A',
          PERMESSI: JSON.stringify({
            file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
            folder: [],
            regolaSupplente: { file: 'SOLO_TITOLARI', folder: 'SOLO_TITOLARI' }
          })
        }
      : row
  );

  const logLines: string[] = [];
  const loggerSpy = jest.spyOn(Logger, 'log').mockImplementation((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  });
  const logger = new LoggerService();
  const sheetDb = installRealSheetDb(tables, logger);

  try {
    const drive = new FakeDriveFacade();
    jest.spyOn(drive, 'createFolder').mockImplementation((path: string) => {
      drive.folders.set(path, '1FolderId');
      return '1FolderId';
    });
    jest.spyOn(drive, 'copyFile').mockReturnValue('1GeneratedFileId');
    const templates = new FakeTemplateEngine();
    const documentService = new DocumentGenerationService({
      db: sheetDb.db,
      drive,
      contextBuilder: composeContextBuilder(sheetDb.db),
      strategyFactory: {
        resolve: () => new DocPersonalizzatoGeneratorStrategy(templates)
      } as unknown as DocumentStrategyFactory,
      templates,
      expressionEngine: new ExpressionEngineFacade(),
      configs: new ConfigurazioneDocumentoRepository(sheetDb.db),
      roleResolver: composeRisolutoreRuoli(sheetDb.db),
      classi: new ClasseRepository(sheetDb.db),
      storicoDocumenti: new StoricoDocumentiService({ anniStorici: () => [] }),
      logger,
      now: new Date('2026-07-01T09:00:00Z')
    });
    expect(
      (documentService as unknown as { storicoDocumenti?: StoricoDocumentiService })
        .storicoDocumenti
    ).toBeInstanceOf(StoricoDocumentiService);
    const gmail = new FakeGmailFacade();
    const emailService = composeEmailNotificationService(
      sheetDb.db,
      gmail,
      templates,
      new Date('2026-07-01T09:00:00Z'),
      drive,
      new AldoTeachingAssignmentResolver(sheetDb.db),
      logger
    );

    logger.withPosition({ depth: 1, isLast: true, ancestorHasNext: [] }, () => {
      expect(
        documentService.generateForPiano(
          'a1@school.it',
          TipoPiano.PDP_DSA,
          'PIANI_PERSONALIZZATI',
          'gen_PIANI_CUSTOMIZZATI'
        )
      ).toMatchObject({
        fileId: '1GeneratedFileId',
        fileName: 'PDP_DSA_Rossi_Mario_2026',
        status: 'GENERATO'
      });

      sheetDb.db.beginTransaction();
      expect(
        emailService.sendToTarget(
          'CDC_OTTOBRE',
          {
            tipo: 'cdc',
            tipoTarget: 'classe',
            target: '5A',
            emails: ['docente@example.edu'],
            classiCompetenza: ['5A']
          },
          'mail_CDC_OTTOBRE'
        )
      ).toMatchObject({ sent: 1, errors: [], skipped: false });
      sheetDb.db.commit();

      const registry = new JobDefinitionRegistry(logger);
      const propertiesGlobal = (globalThis as unknown as { PropertiesService: unknown })
        .PropertiesService;
      const scriptProperties = {
        getProperty: jest.fn(() => null),
        setProperty: jest.fn(),
        deleteProperty: jest.fn(),
        getProperties: jest.fn(() => ({})),
        setProperties: jest.fn(),
        deleteAllProperties: jest.fn()
      };
      (globalThis as unknown as { PropertiesService: unknown }).PropertiesService = {
        getScriptProperties: () => scriptProperties,
        getUserProperties: () => scriptProperties,
        getDocumentProperties: () => scriptProperties
      };
      let runner: JobRunnerService;
      try {
        runner = new JobRunnerService(logger, new UtilsService(), registry);
      } finally {
        (globalThis as unknown as { PropertiesService: unknown }).PropertiesService =
          propertiesGlobal;
      }
      const queue = {
        setMaxDuration: jest.fn(),
        registerJobHandler: jest.fn(),
        execute: jest.fn(() => ({ complete: true })),
        getStatus: jest.fn(() => ({ state: 'completed' }))
      };
      (
        runner as unknown as {
          _createQueue: () => typeof queue;
        }
      )._createQueue = () => queue;

      expect(() =>
        runner.run('gen_PIANI_CUSTOMIZZATI', 'generate', {}, (jobQueue) => {
          jobQueue.registerJobHandler('generate', function* () {
            yield { started: true };
            return { complete: true };
          });
        })
      ).not.toThrow();
    });

    const output = logLines.join('\n');
    expect(output).toContain('[GenerateName] PDP_DSA_Rossi_Mario_2026 (EXECUTED in');
    expect(output).toContain('[SelectTemplate] 1TemplateId (EXECUTED in');
    expect(output).toContain('[CloneTemplate] 1GeneratedFileId (EXECUTED in');
    expect(output).toContain('[ApplyPermissions] Editors: docente@example.edu');
    expect(output).toContain('[RenderBoxes] Boxes:');
    expect(output).toContain('[ResolveRecipients] To: docente@example.edu');
    expect(output).not.toContain('JobDefinitionRegistry.getDefinition: Job definition not found');
    expect(output).toMatch(
      /Job 'gen_PIANI_CUSTOMIZZATI' completed successfully \(COMPLETED in \d+ms\)/
    );

    expect(sheetDb.db.table(TABLE.LOG_FOLD).findAll()).toHaveLength(1);
    expect(sheetDb.db.table(TABLE.LOG_DOCS).findAll()).toHaveLength(1);
    expect(sheetDb.db.table(TABLE.LOG_MAIL).findAll()).toHaveLength(1);
    expect(sheetDb.flush).toHaveBeenCalledTimes(2);

    const appendedSheetIds = sheetDb.sheets.Spreadsheets.batchUpdate.mock.calls.flatMap(
      ([resource]: [{ requests?: Array<{ appendCells?: { sheetId?: number } }> }]) =>
        (resource.requests ?? []).flatMap((request) =>
          request.appendCells?.sheetId === undefined ? [] : [request.appendCells.sheetId]
        )
    );
    expect(appendedSheetIds).toEqual(
      expect.arrayContaining([
        sheetDb.sheetIds.get(TABLE.LOG_FOLD),
        sheetDb.sheetIds.get(TABLE.LOG_DOCS),
        sheetDb.sheetIds.get(TABLE.LOG_MAIL)
      ])
    );

    const lowerLevelLines = logLines.filter((line) =>
      /Transaction|batch update|Updated \d+ cells/i.test(line)
    );
    expect(lowerLevelLines).not.toHaveLength(0);
    expect(lowerLevelLines.every((line) => /^\s*[│├└]/u.test(line))).toBe(true);
  } finally {
    sheetDb.restore();
    loggerSpy.mockRestore();
  }
});
