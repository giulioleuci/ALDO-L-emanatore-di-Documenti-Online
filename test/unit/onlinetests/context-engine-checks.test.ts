import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { TestRunner } from '../../../src/onlinetests/report/OnlineTestReport';
import { registerContextEngineChecks } from '../../../src/onlinetests/checks/contextEngineChecks';
import {
  CLASSE_A,
  CLASSE_C_PARTNER,
  INDIRIZZO_E2E,
  e2eAlunnoEmail,
  e2eDocenteEmail
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
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
            ID: CLASSE_A,
            ANNO: 1,
            INDIRIZZO: INDIRIZZO_E2E,
            ARTICOLAZIONE: JSON.stringify({
              parent: null,
              partner: null,
              partners: null
            }),
            RUOLI: '',
            ATTIVA: true,
            COORD: e2eDocenteEmail(1),
            IRC: '',
            ALT: '',
            SEZ: 'A',
            TERMINALE: false,
            STORICO: false
          },
          {
            ID: CLASSE_C_PARTNER,
            ANNO: 3,
            INDIRIZZO: INDIRIZZO_E2E,
            ARTICOLAZIONE: JSON.stringify({ parent: null, partner: null, partners: null }),
            RUOLI: '',
            ATTIVA: true,
            COORD: e2eDocenteEmail(7),
            IRC: '',
            ALT: '',
            SEZ: 'C',
            TERMINALE: false,
            STORICO: false
          }
        ]
      : [],
    INDIRIZZI: [
      {
        ID: INDIRIZZO_E2E,
        NOME: 'Informatica e Telecomunicazioni',
        NOME_SINTETICO: 'INF',
        TIPO: 'Tecnico'
      }
    ],
    ALUNNI: [
      {
        EMAIL: e2eAlunnoEmail(49),
        COGNOMENOME: 'Alunno49 Test',
        CLASSE: CLASSE_C_PARTNER,
        RELIGIONE: 'IRC',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: '',
        TUTOR_2: '',
        CURRICULUM: null
      }
    ]
  };
}

function buildFakeContainer(options: { includeClasse?: boolean } = {}) {
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

function sampleFixture(): { sampleSpreadsheetUrl: string } {
  return { sampleSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SAMPLE_ID' };
}

describe('registerContextEngineChecks', () => {
  it('registers a passing check when focus.classe.nome resolves to the seeded classe', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(runner, buildFakeContainer(), sampleFixture());
    const result = runner.report().results.find((r) => r.name.includes('focus.classe.nome'));
    expect(result?.status).toBe('pass');
  });

  it('registers a failing check with a descriptive message when the seeded classe is missing', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(
      runner,
      buildFakeContainer({ includeClasse: false }),
      sampleFixture()
    );
    const result = runner.report().results.find((r) => r.name.includes('focus.classe.nome'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/Classe 1A non trovata/);
  });

  it('registers a passing check when focus.alunno.email resolves to the seeded alunno', () => {
    const runner = new TestRunner();
    registerContextEngineChecks(runner, buildFakeContainer(), sampleFixture());
    const result = runner.report().results.find((r) => r.name.includes('focus.alunno.email'));
    expect(result?.status).toBe('pass');
  });

  it('carries the sample spreadsheet URL as every check artifactUrl', () => {
    const runner = new TestRunner();
    const sample = sampleFixture();
    registerContextEngineChecks(runner, buildFakeContainer(), sample);
    for (const r of runner.report().results)
      expect(r.artifactUrl).toBe(sample.sampleSpreadsheetUrl);
  });
});
