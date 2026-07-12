import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import { registerContextEngineChecks } from '../../../src/onlinetests/checks/contextEngineChecks';
import type { SampleDatabase } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { CLASSE_BASE, INDIRIZZO_1, DOCENTE_1, ALUNNO_PARTNER_EMAIL, CLASSE_PARTNER } from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { fixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

const NOW = new Date('2026-07-12T09:00:00Z');

function sampleSeedTables(options: { includeClasse?: boolean } = {}): Record<string, Row[]> {
  const includeClasse = options.includeClasse ?? true;
  return {
    ...fixtureTables(),
    CLASSI: includeClasse
      ? [
          {
            ID: CLASSE_BASE, ANNO: 4, INDIRIZZO: INDIRIZZO_1,
            ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_PARTNER, partners: null }),
            RUOLI: '', ATTIVA: true, COORD: DOCENTE_1, IRC: '', ALT: '', SEZ: 'A', TERMINALE: false, STORICO: false
          },
          {
            ID: CLASSE_PARTNER, ANNO: 4, INDIRIZZO: INDIRIZZO_1,
            ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_BASE, partners: null }),
            RUOLI: '', ATTIVA: true, COORD: DOCENTE_1, IRC: '', ALT: '', SEZ: 'A', TERMINALE: false, STORICO: false
          }
        ]
      : [],
    INDIRIZZI: [{ ID: INDIRIZZO_1, NOME: 'Informatica e Telecomunicazioni', NOME_SINTETICO: 'INF', TIPO: 'Tecnico' }],
    ALUNNI: [
      {
        EMAIL: ALUNNO_PARTNER_EMAIL, COGNOMENOME: 'Alunno5 Test', CLASSE: CLASSE_PARTNER, RELIGIONE: 'SI', ATTIVO: true,
        RIPETENTE: false, RAPPR_STUD: false, TUTOR_1: '', TUTOR_2: '', CURRICULUM: null
      }
    ]
  };
}

function buildFakeContainer(options: { includeClasse?: boolean } = {}) {
  return buildAldoContainer({
    db: new FakeDatabase(sampleSeedTables(options)),
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

describe('registerContextEngineChecks', () => {
  it('registers a passing check when focus.classe.anagrafica.nome resolves to the seeded classe', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(runner, buildFakeContainer(), sampleFixture());
    const result = runner.report().results.find((r) => r.name.includes('focus.classe.anagrafica.nome'));
    expect(result?.status).toBe('pass');
  });

  it('registers a failing check with a descriptive message when the seeded classe is missing', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(runner, buildFakeContainer({ includeClasse: false }), sampleFixture());
    const result = runner.report().results.find((r) => r.name.includes('focus.classe.anagrafica.nome'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
  });

  it('registers a passing check when focus.alunno.anagrafica.email resolves to the seeded alunno', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(runner, buildFakeContainer(), sampleFixture());
    const result = runner.report().results.find((r) => r.name.includes('focus.alunno.anagrafica.email'));
    expect(result?.status).toBe('pass');
  });

  it('carries the sample spreadsheet URL as every check artifactUrl', () => {
    const runner = new TestRunner();
    const sample = sampleFixture();
    registerContextEngineChecks(runner, buildFakeContainer(), sample);
    for (const r of runner.report().results) expect(r.artifactUrl).toBe(sample.sampleSpreadsheetUrl);
  });
});
