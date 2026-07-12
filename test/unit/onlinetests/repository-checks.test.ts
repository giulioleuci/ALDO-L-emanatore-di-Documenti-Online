import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import { registerRepositoryChecks } from '../../../src/onlinetests/checks/repositoryChecks';
import type { SampleDatabase } from '../../../src/onlinetests/SampleDatabaseBuilder';
import {
  CLASSE_BASE, CLASSE_PARTNER, DOCENTE_1, DOCENTE_2, DOCENTE_3, MATERIA_1, INDIRIZZO_1, DIPART_1,
  alunnoEmail, ALUNNO_PARTNER_EMAIL
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { fixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

const NOW = new Date('2026-07-12T09:00:00Z');

/** Table rows mirroring SampleDatabaseBuilder's real seed (see SampleDatabaseBuilder.ts), keyed by
 * the same exported constants so these checks exercise real ClasseRepository/AlunnoRepository/
 * CattedraResolver behavior against realistic fixture values — not invented ones. */
function sampleSeedTables(options: { includeClasse?: boolean } = {}): Record<string, Row[]> {
  const includeClasse = options.includeClasse ?? true;
  const classi: Row[] = includeClasse
    ? [
        {
          ID: CLASSE_BASE, ANNO: 4, INDIRIZZO: INDIRIZZO_1,
          ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_PARTNER, partners: null }),
          RUOLI: '', ATTIVA: true, COORD: DOCENTE_1, IRC: '', ALT: '', SEZ: 'A', TERMINALE: false, STORICO: false,
          [MATERIA_1]: DOCENTE_1
        },
        {
          ID: CLASSE_PARTNER, ANNO: 4, INDIRIZZO: INDIRIZZO_1,
          ARTICOLAZIONE: JSON.stringify({ parent: null, partner: CLASSE_BASE, partners: null }),
          RUOLI: '', ATTIVA: true, COORD: DOCENTE_2, IRC: '', ALT: '', SEZ: 'A', TERMINALE: false, STORICO: false
        }
      ]
    : [];
  return {
    ...fixtureTables(),
    CLASSI: classi,
    DOCENTI: [
      { EMAIL: DOCENTE_1, COGNOME: 'Rossi', NOME: 'Mario', GENERE: 'M', DIPART: DIPART_1, ITP: false },
      { EMAIL: DOCENTE_2, COGNOME: 'Bianchi', NOME: 'Laura', GENERE: 'F', DIPART: DIPART_1, ITP: false },
      { EMAIL: DOCENTE_3, COGNOME: 'Verdi', NOME: 'Paolo', GENERE: 'M', DIPART: DIPART_1, ITP: false }
    ],
    MATERIE: [
      { ID: MATERIA_1, NOME: 'Matematica', SINTESI: 'MAT', COLORE_1: '#1565C0', COLORE_2: '#90CAF9', SIMBOLO: 'M', ESAME_CFG: null }
    ],
    ALUNNI: [
      ...[1, 2, 3, 4].map((i) => ({
        EMAIL: alunnoEmail(i), COGNOMENOME: `Alunno${i} Test`, CLASSE: CLASSE_BASE, RELIGIONE: 'SI', ATTIVO: true,
        RIPETENTE: false, RAPPR_STUD: false, TUTOR_1: '', TUTOR_2: '', CURRICULUM: null
      })),
      {
        EMAIL: ALUNNO_PARTNER_EMAIL, COGNOMENOME: 'Alunno5 Test', CLASSE: CLASSE_PARTNER, RELIGIONE: 'SI', ATTIVO: true,
        RIPETENTE: false, RAPPR_STUD: false, TUTOR_1: '', TUTOR_2: '', CURRICULUM: null
      }
    ],
    SUPPLENZE: includeClasse
      ? [{ TITOLARE: DOCENTE_1, SUPPLENTE: DOCENTE_2, DAL: '2026-07-01', AL: '2026-07-10', CLASSI: CLASSE_BASE, MATERIE: MATERIA_1 }]
      : [],
    VARIAZIONI_CATTEDRA: includeClasse
      ? [{ CLASSE_ID: CLASSE_BASE, MATERIA_ID: MATERIA_1, VECCHIO_TITOLARE: DOCENTE_1, NUOVO_TITOLARE: DOCENTE_3, DATA_DECORRENZA: '2026-07-05' }]
      : []
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

describe('registerRepositoryChecks', () => {
  it('registers a passing ClasseRepository check when the seeded classe round-trips correctly', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('ClasseRepository'));
    expect(result?.status).toBe('pass');
  });

  it('registers a failing ClasseRepository check with a descriptive message when the seeded classe is missing', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer({ includeClasse: false }), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('ClasseRepository'));
    expect(result?.status).toBe('fail');
    expect(result?.message).toBeDefined();
    expect(result?.message).toContain(CLASSE_BASE);
  });

  it('registers a passing AlunnoRepository check for the articolata-partner-enrolled student', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const report = runner.report();
    const result = report.results.find((r) => r.name.includes('AlunnoRepository'));
    expect(result?.status).toBe('pass');
  });

  it('registers three role-resolution checks (SUPPLENZE wins, VARIAZIONI_CATTEDRA wins, CLASSI fallback), all passing on the real seed', () => {
    const runner = new TestRunner();
    registerRepositoryChecks(runner, buildFakeContainer(), sampleFixture());
    const results = runner.report().results;
    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('SUPPLENZE'))).toBe(true);
    expect(names.some((n) => n.includes('VARIAZIONI_CATTEDRA'))).toBe(true);
    expect(names.some((n) => n.includes('CLASSI') && n.includes('fallback'))).toBe(true);
    for (const r of results) expect(r.status).toBe('pass');
  });

  it('every check carries the sample spreadsheet URL as its artifactUrl', () => {
    const runner = new TestRunner();
    const sample = sampleFixture();
    registerRepositoryChecks(runner, buildFakeContainer(), sample);
    for (const r of runner.report().results) expect(r.artifactUrl).toBe(sample.sampleSpreadsheetUrl);
  });
});
