import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import { registerPipelineChecks } from '../../../src/onlinetests/checks/pipelineChecks';
import type { SampleDatabase } from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  CLASSE_BASE,
  INDIRIZZO_1,
  DOCENTE_1,
  ALUNNO_PARTNER_EMAIL,
  CLASSE_PARTNER,
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
import { COL_CONF_DOC, COL_CONF_MAIL } from '../../../src/config/schema';

const NOW = new Date('2026-07-12T09:00:00Z');
const RECIPIENT_EMAIL = 'attivo@onlinetest.aldo.local';

function expectCompleteRows(rows: Record<string, unknown>[], columns: Record<string, string>): void {
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(Object.values(columns).sort());
  }
}

function sampleSeedTables(
  options: { includeConfDoc?: boolean; includeConfMail?: boolean; oggetto?: string } = {}
): Record<string, Row[]> {
  const includeConfDoc = options.includeConfDoc ?? true;
  const includeConfMail = options.includeConfMail ?? true;
  const oggetto = options.oggetto ?? '[ALDO ONLINE TEST] Notifica di prova';
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
        STORICO: false
      },
      {
        ID: CLASSE_PARTNER,
        ANNO: 4,
        INDIRIZZO: INDIRIZZO_1,
        ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_BASE, partners: null }),
        RUOLI: '',
        ATTIVA: true,
        COORD: DOCENTE_1,
        IRC: '',
        ALT: '',
        SEZ: 'A',
        TERMINALE: false,
        STORICO: false
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
    CONF_DOC: includeConfDoc
      ? [
          {
            ID: CONF_DOC_ID,
            TIPO: 'ONLINETEST',
            GENERATORE: 'DOCUMENTO_GENERICO',
            CONDIZIONE: '',
            MODELLI: '{"templateId":"TEMPLATE_ONLINETEST"}',
            FILE_NAME: `ONLINETEST_{{focus.classe.anagrafica.nome}}`,
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
        ]
      : [],
    CONF_MAIL: includeConfMail
      ? [
          {
            ID: CONF_MAIL_ID,
            OGGETTO: oggetto,
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
      : []
  };
}

function buildFakeContainer(options: Parameters<typeof sampleSeedTables>[0] = {}) {
  const db = new FakeDatabase(sampleSeedTables(options));
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

function sampleFixture(): SampleDatabase {
  return {
    masterSpreadsheetId: 'MASTER_ID',
    sampleSpreadsheetId: 'SAMPLE_ID',
    sampleSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SAMPLE_ID',
    sampleFolderUrl: 'https://drive.google.com/drive/folders/FOLDER_ID'
  };
}

describe('registerPipelineChecks', () => {
  it('keeps every fixture and pipeline seed CONF_DOC/CONF_MAIL row schema-complete', () => {
    const fixture = fixtureTables();
    const pipeline = sampleSeedTables();

    expectCompleteRows(fixture.CONF_DOC!, COL_CONF_DOC);
    expectCompleteRows(fixture.CONF_MAIL!, COL_CONF_MAIL);
    expectCompleteRows(pipeline.CONF_DOC!, COL_CONF_DOC);
    expectCompleteRows(pipeline.CONF_MAIL!, COL_CONF_MAIL);
  });

  it('registers a passing document-generation check that produces a file for the seeded CONF_DOC', () => {
    const runner = new TestRunner();
    registerPipelineChecks(runner, buildFakeContainer(), sampleFixture(), RECIPIENT_EMAIL);
    const result = runner
      .report()
      .results.find((r) => r.name.includes('DocumentGenerationService'));
    expect(result?.status).toBe('pass');
    expect(result?.artifactUrl).toBe('https://drive.google.com/drive/folders/FOLDER_ID');
  });

  it('registers a failing document-generation check with a descriptive message when CONF_DOC is missing', () => {
    const runner = new TestRunner();
    registerPipelineChecks(
      runner,
      buildFakeContainer({ includeConfDoc: false }),
      sampleFixture(),
      RECIPIENT_EMAIL
    );
    const result = runner
      .report()
      .results.find((r) => r.name.includes('DocumentGenerationService'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
  });

  it('routes the sent email to the injected testRecipientEmail via enableTestMode, not the seeded alunno address', () => {
    const runner = new TestRunner();
    const gmail = new FakeGmailFacade();
    const db = new FakeDatabase(sampleSeedTables());
    const container = buildAldoContainer({
      db,
      master: new MasterSheetRepository(db),
      drive: new FakeDriveFacade(),
      gmail,
      templates: new FakeTemplateEngine(),
      expressionEngine: new ExpressionEngineFacade(),
      now: NOW
    });
    registerPipelineChecks(runner, container, sampleFixture(), RECIPIENT_EMAIL);
    const result = runner.report().results.find((r) => r.name.includes('EmailNotificationService'));
    expect(result?.status).toBe('pass');
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.sent[0]!.to).toEqual([RECIPIENT_EMAIL]);
    expect(gmail.sent[0]!.subject).toContain('[ALDO ONLINE TEST]');
  });

  it('registers a failing email check with a descriptive message when CONF_MAIL is missing', () => {
    const runner = new TestRunner();
    registerPipelineChecks(
      runner,
      buildFakeContainer({ includeConfMail: false }),
      sampleFixture(),
      RECIPIENT_EMAIL
    );
    const result = runner.report().results.find((r) => r.name.includes('EmailNotificationService'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
  });

  it('registers a failing email check with a descriptive message when CONF_MAIL.OGGETTO lacks the [ALDO ONLINE TEST] prefix', () => {
    const runner = new TestRunner();
    registerPipelineChecks(
      runner,
      buildFakeContainer({ oggetto: 'Notifica senza prefisso' }),
      sampleFixture(),
      RECIPIENT_EMAIL
    );
    const result = runner.report().results.find((r) => r.name.includes('EmailNotificationService'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toContain('[ALDO ONLINE TEST]');
  });
});
