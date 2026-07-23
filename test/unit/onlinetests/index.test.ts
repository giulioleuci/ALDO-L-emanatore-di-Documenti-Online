import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { executeOnlineTests } from '../../../src/onlinetests/index';
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

const NOW = new Date('2026-07-12T09:00:00Z');
const RECIPIENT_EMAIL = 'attivo@onlinetest.aldo.local';

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
        CLASSE_ID: CLASSE_BASE,
        MATERIA_ID: MATERIA_1,
        VECCHIO_TITOLARE: DOCENTE_1,
        NUOVO_TITOLARE: DOCENTE_3,
        DATA_DECORRENZA: '2026-07-05'
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
        PATH_OUT_SOTTOCARTELLE: '',
        SCHEMA_SOTTOCARTELLE: '',
        PERMESSI: '',
        POST_PROCESSO: null,
        PARAMETRI: '',
        GESTIONE_ARTICOLAZIONE: '',
        FORMATO: 'PDF'
      }
    ],
    CONF_MAIL: [
      {
        ID: CONF_MAIL_ID,
        OGGETTO: '[ALDO ONLINE TEST] Notifica di prova',
        PROCESSO: 'PER_ALUNNO',
        BOX_CFG: '[]',
        TESTO: 'Messaggio di prova generato dalla suite di test online ALDO.',
        SUPPLENTI: false,
        NOREPLY: false,
        COLORE_HEADER: '#1565C0',
        CONDIZIONE: '',
        POST_PROCESSO: null
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
  return {
    createSpreadsheet: jest.fn((name: string) => ({
      id: `SS_${name}`,
      addSheet: (sheetName: string, headerRow: string[]) =>
        sheets.set(sheetName, { headers: headerRow, rows: [] }),
      appendRow: (sheetName: string, row: Record<string, unknown>) =>
        sheets.get(sheetName)!.rows.push(row),
      getUrl: () => `https://docs.google.com/spreadsheets/d/SS_${name}`
    }))
  };
}

function fakeProperties(initial: string | null = null): IPropertiesFacade {
  let value = initial;
  return {
    get: jest.fn(() => value),
    set: jest.fn((_key: string, newValue: string) => {
      value = newValue;
    })
  };
}

describe('executeOnlineTests', () => {
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
