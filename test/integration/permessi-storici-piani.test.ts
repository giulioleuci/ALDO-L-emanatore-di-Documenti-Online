import { buildAldoContainer } from '../../src/config/Bootstrap';
import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { TipoPiano } from '../../src/domain/value-objects/enums';
import { MasterSheetRepository } from '../../src/infrastructure/repositories/MasterSheetRepository';
import { ExpressionEngineFacade } from '../../src/infrastructure/facades/ExpressionEngineFacade';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../fakes/FakeTemplateEngine';
import { fixtureTables } from '../fixtures/tables';
import type { Row } from '../../src/infrastructure/db/Database';

const CURRENT_STUDENT = 'current@school.it';
const OTHER_STUDENT = 'other@school.it';

function current4dTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.CLASSI = [
    {
      ...tables.CLASSI[0]!,
      ID: '4D',
      ANNO: 4,
      COORD: 'coord4d@school.it',
      STORICO: '3D'
    }
  ];
  tables.DOCENTI.push({
    EMAIL: 'coord4d@school.it',
    COGNOME: 'COORD',
    NOME: 'QUARTA D',
    GENERE: 'F',
    DIPART: 'SCIENTIFICO_DIP',
    ITP: false
  });
  tables.ALUNNI = [
    { ...tables.ALUNNI[0]!, EMAIL: CURRENT_STUDENT, CLASSE: '4D' },
    { ...tables.ALUNNI[0]!, EMAIL: OTHER_STUDENT, COGNOMENOME: 'ALTRO STUDENTE', CLASSE: '4D' }
  ];
  tables.PIANI = [
    { STUDENTE: CURRENT_STUDENT, TIPO: 'PDP_BES', PARAMETRI: null },
    { STUDENTE: CURRENT_STUDENT, TIPO: 'PEI', PARAMETRI: null },
    { STUDENTE: OTHER_STUDENT, TIPO: 'PDP_BES', PARAMETRI: null }
  ];
  const config = tables.CONF_DOC.find((row) => row.ID === 'PIANI_PERSONALIZZATI')!;
  config.POST_PROCESSO = JSON.stringify([
    {
      tipo: 'AGGIORNA_PERMESSI_STORICI',
      target: 'PIANI_PERSONALIZZATI',
      ruolo: 'COORDINATORI',
      permesso: 'LETTURA',
      profondita: 1,
      criteri: {
        UTENTI: '{{focus.alunno.email}}',
        SOTTOTIPO: '{{focus.piano.tipo}}'
      }
    }
  ]);
  tables.MASTER = [
    {
      ANNO_SCOLASTICO: '2026-2027',
      ID_SPREADSHEET: 'current-4d',
      ID_CARTELLA_GOOGLE: 'current-folder',
      DIRIGENTE_SCOLASTICO: 'Dirigente',
      SUPERVISORE_EMAIL: ''
    },
    {
      ANNO_SCOLASTICO: '2025-2026',
      ID_SPREADSHEET: 'historical-3d',
      ID_CARTELLA_GOOGLE: 'historical-folder',
      DIRIGENTE_SCOLASTICO: 'Dirigente',
      SUPERVISORE_EMAIL: ''
    }
  ];
  tables.LOG_DOCS = [];
  tables.LOG_FOLD = [];
  return tables;
}

function historical3dTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.CLASSI = [{ ...tables.CLASSI[0]!, ID: '3D', ANNO: 3, STORICO: '2D' }];
  tables.ALUNNI = [
    { ...tables.ALUNNI[0]!, EMAIL: CURRENT_STUDENT, CLASSE: '3D' },
    { ...tables.ALUNNI[0]!, EMAIL: OTHER_STUDENT, COGNOMENOME: 'ALTRO STUDENTE', CLASSE: '3D' }
  ];
  tables.LOG_DOCS = [
    {
      ID: 'pdp-bes-3d',
      ID_GEN: 'PIANI_PERSONALIZZATI',
      NOME: 'PDP BES 3D',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_BES',
      STATO: 'GENERATO',
      UTENTI: CURRENT_STUDENT,
      CLASSI: '3D',
      MATERIE: ''
    },
    {
      ID: 'pei-3d',
      ID_GEN: 'PIANI_PERSONALIZZATI',
      NOME: 'PEI 3D',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PEI',
      STATO: 'GENERATO',
      UTENTI: CURRENT_STUDENT,
      CLASSI: '3D',
      MATERIE: ''
    },
    {
      ID: 'other-student-pdp',
      ID_GEN: 'PIANI_PERSONALIZZATI',
      NOME: 'PDP altro studente',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_BES',
      STATO: 'GENERATO',
      UTENTI: OTHER_STUDENT,
      CLASSI: '3D',
      MATERIE: ''
    }
  ];
  return tables;
}

function databaseServiceFor(tables: Record<string, Row[]>): object {
  const db = new FakeDatabase(tables);
  const sheetTables = new Proxy<Record<string, object>>(
    {},
    {
      get: (_target, name: string) => {
        const table = db.tables[name]!;
        return {
          getAllRows: () => table.getAllRows(),
          getByPK: (id: string) => table.getByPK(id),
          createIndex: (column: string) => table.createIndex(column),
          defineVirtualColumn: jest.fn(),
          setPrimaryKey: jest.fn(),
          _indexedLookup: () => null
        };
      }
    }
  );
  return {
    tables: sheetTables,
    save: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn()
  };
}

test('generating current 4D plans registers them and grants only matching historical 3D plans', () => {
  const originalDatabaseService = (global as unknown as { DatabaseService: unknown })
    .DatabaseService;
  const historicalService = databaseServiceFor(historical3dTables());
  (global as unknown as { DatabaseService: unknown }).DatabaseService = jest
    .fn()
    .mockImplementation((spreadsheetId: string) => {
      if (spreadsheetId !== 'historical-3d')
        throw new Error(`Unexpected database ${spreadsheetId}`);
      return historicalService;
    });
  const utilsSpy = jest.spyOn(ServiceFactory, 'getUtils').mockReturnValue({});
  const cacheSpy = jest.spyOn(ServiceFactory, 'getCacheService').mockReturnValue({
    getScriptCache: () => ({})
  });
  const exceptionSpy = jest
    .spyOn(ServiceFactory, 'getExceptionService')
    .mockReturnValue({ executeWithRetry: jest.fn() });

  try {
    const db = new FakeDatabase(current4dTables());
    const drive = new FakeDriveFacade();
    const container = buildAldoContainer({
      db,
      master: new MasterSheetRepository(db),
      drive,
      gmail: new FakeGmailFacade(),
      templates: new FakeTemplateEngine(),
      expressionEngine: new ExpressionEngineFacade(),
      now: new Date('2026-09-04T09:00:00Z')
    });
    const service = container.get<DocumentGenerationService>('documentGenerationService');

    service.generateForPiano(CURRENT_STUDENT, TipoPiano.PDP_BES, 'PIANI_PERSONALIZZATI');

    expect(db.table('LOG_DOCS').findAll()).toEqual([
      expect.objectContaining({
        ID_GEN: 'PIANI_PERSONALIZZATI',
        SOTTOTIPO: 'PDP_BES',
        UTENTI: CURRENT_STUDENT,
        CLASSI: '4D'
      })
    ]);
    expect(drive.permissions).toContainEqual({
      fileId: 'pdp-bes-3d',
      email: 'coord4d@school.it',
      permesso: 'LETTURA'
    });
    expect(drive.permissions).not.toContainEqual(expect.objectContaining({ fileId: 'pei-3d' }));
    expect(drive.permissions).not.toContainEqual(
      expect.objectContaining({ fileId: 'other-student-pdp' })
    );

    service.generateForPiano(CURRENT_STUDENT, TipoPiano.PEI, 'PIANI_PERSONALIZZATI');
    service.generateForPiano(OTHER_STUDENT, TipoPiano.PDP_BES, 'PIANI_PERSONALIZZATI');

    expect(db.table('LOG_DOCS').findAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ SOTTOTIPO: 'PEI', UTENTI: CURRENT_STUDENT }),
        expect.objectContaining({ SOTTOTIPO: 'PDP_BES', UTENTI: OTHER_STUDENT })
      ])
    );
    expect(drive.permissions).toEqual(
      expect.arrayContaining([
        { fileId: 'pei-3d', email: 'coord4d@school.it', permesso: 'LETTURA' },
        { fileId: 'other-student-pdp', email: 'coord4d@school.it', permesso: 'LETTURA' }
      ])
    );
    expect(drive.permissions).toHaveLength(3);
  } finally {
    exceptionSpy.mockRestore();
    cacheSpy.mockRestore();
    utilsSpy.mockRestore();
    (global as unknown as { DatabaseService: unknown }).DatabaseService = originalDatabaseService;
  }
});
