import { buildAldoContainer } from '../../../src/config/Bootstrap';
import {
  executeArticolazioneScenarios,
  executeE2eScenarios,
  executeOnlineTests,
  dumpOnlineCoverage
} from '../../../src/onlinetests/index';
import { PROP_MASTER_SPREADSHEET_ID } from '../../../src/config/Bootstrap';
import { E2eSampleDatabaseBuilder } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import {
  CLASSE_BASE,
  CLASSE_PARTNER,
  DOCENTE_1,
  DOCENTE_2,
  DOCENTE_3,
  MATERIA_1,
  INDIRIZZO_1,
  DIPART_1,
  alunnoEmail,
  ALUNNO_PARTNER_EMAIL,
  CONF_DOC_ID,
  CONF_MAIL_ID
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { fixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';
import type { IPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_CONF_DOC, COL_CONF_MAIL } from '../../../src/config/schema';

const NOW = new Date('2026-07-12T09:00:00Z');
const RECIPIENT_EMAIL = 'attivo@onlinetest.aldo.local';

function expectCompleteRows(rows: Record<string, unknown>[], columns: Record<string, string>): void {
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(Object.values(columns).sort());
  }
}

/** Fixture tables covering everything all three check groups (repository, context-engine,
 * pipeline) touch, mirroring SampleDatabaseBuilder's real seed shape. */
function sampleSeedTables(): Record<string, Row[]> {
  return {
    ...fixtureTables(),
    CLASSI: [
      {
        ID: CLASSE_BASE,
        ANNO: 4,
        INDIRIZZO: INDIRIZZO_1,
        ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_PARTNER, partners: null }),
        RUOLI: '',
        ATTIVA: true,
        COORD: DOCENTE_1,
        IRC: '',
        ALT: '',
        SEZ: 'A',
        TERMINALE: false,
        STORICO: false,
        [MATERIA_1]: DOCENTE_1
      },
      {
        ID: CLASSE_PARTNER,
        ANNO: 4,
        INDIRIZZO: INDIRIZZO_1,
        ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_BASE, partners: null }),
        RUOLI: '',
        ATTIVA: true,
        COORD: DOCENTE_2,
        IRC: '',
        ALT: '',
        SEZ: 'A',
        TERMINALE: false,
        STORICO: false
      }
    ],
    DOCENTI: [
      {
        EMAIL: DOCENTE_1,
        COGNOME: 'Rossi',
        NOME: 'Mario',
        GENERE: 'M',
        DIPART: DIPART_1,
        ITP: false
      },
      {
        EMAIL: DOCENTE_2,
        COGNOME: 'Bianchi',
        NOME: 'Laura',
        GENERE: 'F',
        DIPART: DIPART_1,
        ITP: false
      },
      {
        EMAIL: DOCENTE_3,
        COGNOME: 'Verdi',
        NOME: 'Paolo',
        GENERE: 'M',
        DIPART: DIPART_1,
        ITP: false
      }
    ],
    MATERIE: [
      {
        ID: MATERIA_1,
        NOME: 'Matematica',
        SINTESI: 'MAT',
        COLORE_1: '#1565C0',
        COLORE_2: '#90CAF9',
        SIMBOLO: 'M',
        ESAME_CFG: null
      }
    ],
    INDIRIZZI: [
      {
        ID: INDIRIZZO_1,
        NOME: 'Informatica e Telecomunicazioni',
        NOME_SINTETICO: 'INF',
        TIPO: 'Tecnico'
      }
    ],
    ALUNNI: [
      ...[1, 2, 3, 4].map((i) => ({
        EMAIL: alunnoEmail(i),
        COGNOMENOME: `Alunno${i} Test`,
        CLASSE: CLASSE_BASE,
        RELIGIONE: 'SI',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      })),
      {
        EMAIL: ALUNNO_PARTNER_EMAIL,
        COGNOMENOME: 'Alunno5 Test',
        CLASSE: CLASSE_PARTNER,
        RELIGIONE: 'SI',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      }
    ],
    SUPPLENZE: [
      {
        TITOLARE: DOCENTE_1,
        SUPPLENTE: DOCENTE_2,
        DAL: '2026-07-01',
        AL: '2026-07-10',
        CLASSI: CLASSE_BASE,
        MATERIE: MATERIA_1
      }
    ],
    VARIAZIONI_CATTEDRA: [
      {
        TITOLARE: DOCENTE_1,
        NUOVO_TITOLARE: DOCENTE_3,
        DAL: '2026-07-05',
        CLASSI: CLASSE_BASE,
        MATERIE: MATERIA_1
      }
    ],
    CONF_DOC: [
      {
        ID: CONF_DOC_ID,
        TIPO: 'ONLINETEST',
        GENERATORE: 'DOCUMENTO_GENERICO',
        CONDIZIONE: '',
        MODELLI: '{"templateId":"TEMPLATE_ONLINETEST"}',
        FILE_NAME: 'ONLINETEST_{{focus.classe.anagrafica.nome}}',
        PATH_OUT: '_ALDO_ONLINETEST_OUTPUT',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: '',
        POST_PROCESSO: null,
        PARAMETRI: '',
        GESTIONE_ARTICOLAZIONE: '',
        FORMATO: 'PDF',
        REGISTRA_DOC: '{}',
        REGISTRA_FOLD: '{}'
      }
    ],
    CONF_MAIL: [
      {
        ID: CONF_MAIL_ID,
        OGGETTO: '[ALDO ONLINE TEST] Notifica di prova',
        PROCESSO: 'PER_ALUNNO',
        BOX_CFG: '[{"TIPO_BOX":"testo_dinamico","CONTENUTO":"<p>Contenuto email di prova.</p>"}]',
        TESTO: 'Messaggio di prova generato dalla suite di test online ALDO.',
        SUPPLENTI: false,
        NOREPLY: false,
        COLORE_HEADER: '#1565C0',
        CONDIZIONE: '',
        POST_PROCESSO: null,
        [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
        [COL_CONF_MAIL.ALLEGATI]: '[]'
      }
    ]
  };
}

function buildFakeContainer(): ServiceContainer {
  const db = new FakeDatabase(sampleSeedTables());
  return buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: NOW
  });
}

function fakeSpreadsheetFactory() {
  const sheets = new Map<string, { headers: string[]; rows: Record<string, unknown>[] }>();
  const createSpreadsheet = jest.fn((name: string) => ({
    id: `SS_${name}`,
    addSheet: (sheetName: string, headerRow: string[]) =>
      sheets.set(sheetName, { headers: headerRow, rows: [] }),
    appendRow: (sheetName: string, row: Record<string, unknown>) =>
      sheets.get(sheetName)!.rows.push(row),
    getUrl: () => `https://docs.google.com/spreadsheets/d/SS_${name}`
  }));
  const boundMaster = {
    id: 'bound-master-id',
    addSheet: (sheetName: string, headerRow: string[]) =>
      sheets.set(sheetName, { headers: headerRow, rows: [] }),
    appendRow: (sheetName: string, row: Record<string, unknown>) =>
      sheets.get(sheetName)!.rows.push(row),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/bound-master-id'
  };
  return {
    createSpreadsheet,
    openExistingSpreadsheet: jest.fn(() => boundMaster)
  };
}

function fakeProperties(initial: string | null | Record<string, string> = null): IPropertiesFacade {
  const values: Record<string, string> =
    typeof initial === 'object' && initial !== null
      ? { ...initial }
      : initial === null
        ? {}
        : { [PROP_MASTER_SPREADSHEET_ID]: initial };
  return {
    get: jest.fn((key: string) => values[key] ?? null),
    set: jest.fn((key: string, newValue: string) => {
      values[key] = newValue;
    })
  };
}

describe('executeOnlineTests', () => {
  it('keeps its CONF_DOC and CONF_MAIL pipeline seeds schema-complete', () => {
    const seed = sampleSeedTables();

    expectCompleteRows(seed.CONF_DOC!, COL_CONF_DOC);
    expectCompleteRows(seed.CONF_MAIL!, COL_CONF_MAIL);
  });

  it('builds a sample database, initializes ALDO against it, and returns a report combining every check group', () => {
    const container = buildFakeContainer();
    const report = executeOnlineTests({
      spreadsheetFactory: fakeSpreadsheetFactory(),
      drive: new FakeDriveFacade(),
      clock: () => NOW,
      properties: fakeProperties(),
      initAldo: () => container,
      activeUserEmail: () => RECIPIENT_EMAIL,
      log: jest.fn()
    });

    expect(report.suite).toBe('aldo-online-tests');
    const names = report.results.map((r) => r.name);
    expect(names.some((n) => n.includes('ClasseRepository'))).toBe(true);
    expect(names.some((n) => n.includes('focus.classe.anagrafica.nome'))).toBe(true);
    expect(names.some((n) => n.includes('DocumentGenerationService'))).toBe(true);
    expect(names.some((n) => n.includes('EmailNotificationService'))).toBe(true);
    for (const r of report.results) expect(r.status).toBe('pass');
  });

  it('logs the previous MASTER_SPREADSHEET_ID value when one was already set, and never overwrites it silently', () => {
    const log = jest.fn();
    const properties = fakeProperties('OLD_ID');
    const container = buildFakeContainer();

    executeOnlineTests({
      spreadsheetFactory: fakeSpreadsheetFactory(),
      drive: new FakeDriveFacade(),
      clock: () => NOW,
      properties,
      initAldo: () => container,
      activeUserEmail: () => RECIPIENT_EMAIL,
      log
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('OLD_ID'));
  });

  it('does not log anything when no previous MASTER_SPREADSHEET_ID was set', () => {
    const log = jest.fn();
    const properties = fakeProperties(null);
    const container = buildFakeContainer();

    executeOnlineTests({
      spreadsheetFactory: fakeSpreadsheetFactory(),
      drive: new FakeDriveFacade(),
      clock: () => NOW,
      properties,
      initAldo: () => container,
      activeUserEmail: () => RECIPIENT_EMAIL,
      log
    });

    expect(log).not.toHaveBeenCalled();
  });

  it('passes the injected testRecipientEmail through to the pipeline checks (not touching Session itself)', () => {
    const container = buildFakeContainer();
    const activeUserEmail = jest.fn(() => RECIPIENT_EMAIL);

    executeOnlineTests({
      spreadsheetFactory: fakeSpreadsheetFactory(),
      drive: new FakeDriveFacade(),
      clock: () => NOW,
      properties: fakeProperties(),
      initAldo: () => container,
      activeUserEmail,
      log: jest.fn()
    });

    expect(activeUserEmail).toHaveBeenCalled();
  });
});

describe('executeArticolazioneScenarios', () => {
  it('rejects a missing MASTER pointer before ALDO initialization or E2E provisioning', () => {
    const initAldo = jest.fn();
    const build = jest.spyOn(E2eSampleDatabaseBuilder.prototype, 'build');

    expect(() =>
      executeArticolazioneScenarios({
        properties: fakeProperties(null),
        initAldo,
        readMasterConfig: jest.fn(),
        clock: () => NOW,
        log: jest.fn()
      })
    ).toThrow(/MASTER_SPREADSHEET_ID.*mancante/i);

    expect(initAldo).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    build.mockRestore();
  });

  it('rejects a MASTER that is not a test database before ALDO initialization or E2E provisioning', () => {
    const initAldo = jest.fn();
    const build = jest.spyOn(E2eSampleDatabaseBuilder.prototype, 'build');

    expect(() =>
      executeArticolazioneScenarios({
        properties: fakeProperties('UNSAFE_MASTER'),
        initAldo,
        readMasterConfig: () => ({
          idSpreadsheet: 'PRODUCTION_DB',
          idCartellaRoot: 'PRODUCTION_ROOT',
          testMode: false
        }),
        clock: () => NOW,
        log: jest.fn()
      })
    ).toThrow(/TEST_MODE/i);

    expect(initAldo).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    build.mockRestore();
  });
});

describe('executeE2eScenarios', () => {
  it('uses its bound MASTER when no master property is registered yet', () => {
    const setMasterSpreadsheetId = jest.fn();
    const properties: IPropertiesFacade = {
      get: jest.fn(() => null),
      set: setMasterSpreadsheetId
    };
    const spreadsheetFactory = fakeSpreadsheetFactory();
    const getActiveStandard = jest.fn(() => ({ getId: () => 'bound-master-id' }));
    const spreadsheetService = jest
      .spyOn(ServiceFactory, 'getSpreadsheetService')
      .mockReturnValue({ getActiveStandard } as never);

    try {
      executeE2eScenarios({
        properties,
        spreadsheetFactory,
        drive: new FakeDriveFacade(),
        artifactFactory: {
          createDocument: jest.fn((name: string) => `doc_${name}`),
          createSheet: jest.fn((name: string) => `sheet_${name}`)
        },
        clock: () => NOW,
        initAldo: () => buildFakeContainer(),
        log: jest.fn()
      });
    } finally {
      spreadsheetService.mockRestore();
    }

    expect(spreadsheetFactory.openExistingSpreadsheet).toHaveBeenCalledWith('bound-master-id');
    expect(setMasterSpreadsheetId).toHaveBeenCalledWith(
      PROP_MASTER_SPREADSHEET_ID,
      'bound-master-id'
    );
  });

  it('opens the bound MASTER and creates only the sample and prior spreadsheets', () => {
    const setMasterSpreadsheetId = jest.fn();
    const properties: IPropertiesFacade = {
      get: jest.fn(() => 'bound-master-id'),
      set: setMasterSpreadsheetId
    };
    const spreadsheetFactory = fakeSpreadsheetFactory();

    executeE2eScenarios({
      properties,
      spreadsheetFactory,
      drive: new FakeDriveFacade(),
      artifactFactory: {
        createDocument: jest.fn((name: string) => `doc_${name}`),
        createSheet: jest.fn((name: string) => `sheet_${name}`)
      },
      clock: () => NOW,
      initAldo: () => buildFakeContainer(),
      log: jest.fn()
    });

    expect(spreadsheetFactory.openExistingSpreadsheet).toHaveBeenCalledWith('bound-master-id');
    expect(setMasterSpreadsheetId).toHaveBeenCalledWith(
      PROP_MASTER_SPREADSHEET_ID,
      'bound-master-id'
    );
    expect(spreadsheetFactory.createSpreadsheet.mock.calls.map(([name]) => name)).toEqual([
      '_ALDO_E2E_SAMPLE',
      '_ALDO_E2E_SAMPLE_PRIOR'
    ]);
  });
});

describe('dumpOnlineCoverage', () => {
  afterEach(() => {
    delete (globalThis as { __coverage__?: unknown }).__coverage__;
  });

  it('logs the istanbul coverage map when instrumentation populated globalThis.__coverage__', () => {
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => {});
    (globalThis as { __coverage__?: unknown }).__coverage__ = { 'src/foo.ts': { s: { '0': 1 } } };

    dumpOnlineCoverage();

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ 'src/foo.ts': { s: { '0': 1 } } }));
    logSpy.mockRestore();
  });

  it('logs an empty object when the bundle was not built with instrumentation', () => {
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => {});

    dumpOnlineCoverage();

    expect(logSpy).toHaveBeenCalledWith('{}');
    logSpy.mockRestore();
  });
});
