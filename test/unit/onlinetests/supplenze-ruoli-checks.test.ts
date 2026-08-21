import {
  assertActorVisibility,
  registerSupplenzeRuoliChecks,
  visibilitySnapshot,
  type ConsumerVisibilitySnapshot
} from '../../../src/onlinetests/checks/supplenzeRuoliChecks';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  e2eDocenteEmail,
  type SharedTestDatabase
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { buildAldoContainer } from '../../../src/config/Bootstrap';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeGmailFacade } from '../../fakes/FakeGmailFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { fixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.checks.push({ name, artifactUrl, callback });
  }
}

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-one',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-one',
  priorSampleSpreadsheetId2: 'prior-two',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-two',
  logFoldFolderUrl: 'https://example.test/log-fold',
  jobRunnerDocConfigId: 'jobrunner',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment'
};

const CHECK_NAMES = [
  'supplenze.ruoli::confini inclusivi ed esclusivi',
  'supplenze.ruoli::isolamento classi sovrapposte',
  'supplenze.ruoli::variazione prima durante dopo sostituzione',
  'supplenze.ruoli::visibilita CDU destinatari ACL e protezioni',
  'supplenze.ruoli::dedupe titolare e supplente'
];

test('registers five supplenze/ruoli checks on the shared artifact', () => {
  const runner = new RecordingRunner();

  registerSupplenzeRuoliChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks.map(({ name, artifactUrl }) => ({ name, artifactUrl }))).toEqual(
    CHECK_NAMES.map((name) => ({ name, artifactUrl: sample.sampleSpreadsheetUrl }))
  );
});

test('registers only safety guard outside MASTER.TEST_MODE', () => {
  const runner = new RecordingRunner();

  registerSupplenzeRuoliChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    masterTestMode: false
  });

  expect(runner.checks.map((check) => check.name)).toEqual([
    'supplenze.ruoli::MASTER.TEST_MODE guard'
  ]);
});

function snapshot(values: string[]): ConsumerVisibilitySnapshot {
  return {
    cdu: values,
    recipients: values,
    documentAcl: values,
    folderAcl: values,
    protectedRangeEditors: values
  };
}

test.each([
  [GestioneSupplenti.SOLO_TITOLARI, ['titolare@example.test']],
  [GestioneSupplenti.SOLO_SUPPLENTI, ['supplente@example.test']],
  [GestioneSupplenti.ENTRAMBI, ['titolare@example.test', 'supplente@example.test']]
])('accepts exact actor visibility for %s across every consumer', (mode, actors) => {
  expect(() =>
    assertActorVisibility(
      String(mode),
      snapshot(actors),
      'titolare@example.test',
      'supplente@example.test',
      mode
    )
  ).not.toThrow();
});

test('rejects a protected-range consumer that leaks the principal in SOLO_SUPPLENTI', () => {
  const actual = snapshot(['supplente@example.test']);
  actual.protectedRangeEditors = ['titolare@example.test', 'supplente@example.test'];

  expect(() =>
    assertActorVisibility(
      'visibility',
      actual,
      'titolare@example.test',
      'supplente@example.test',
      GestioneSupplenti.SOLO_SUPPLENTI
    )
  ).toThrow(/protectedRangeEditors/);
});

test('rejects duplicate principal/substitute email in any consumer channel', () => {
  const actual = snapshot(['same@example.test', 'same@example.test']);

  expect(() =>
    assertActorVisibility(
      'dedupe',
      actual,
      'same@example.test',
      'same@example.test',
      GestioneSupplenti.ENTRAMBI
    )
  ).toThrow(/duplicat/);
});

// visibilitySnapshot() hard-codes classe '4A' (see classCdu in
// supplenzeRuoliChecks.ts) — this fixture seeds only that one class, with a
// nominal MAT cattedra held by the synthetic e2eDocenteEmail(19), so
// visibilitySnapshot's real ContextBuilder/RisolutoreRuoliService wiring
// resolves the same way the online check does.
const VISIBILITY_NOW = new Date('2026-07-12T09:00:00Z');
const VISIBILITY_INDIRIZZO = 'IND_VISIBILITY_SNAPSHOT';

function visibilitySeedTables(): Record<string, Row[]> {
  const base = fixtureTables();
  return {
    ...base,
    CLASSI: [
      {
        ID: '4A',
        ANNO: 4,
        INDIRIZZO: VISIBILITY_INDIRIZZO,
        ARTICOLAZIONE: JSON.stringify({ parent: null, partner: null, partners: null }),
        RUOLI: '',
        ATTIVA: true,
        COORD: '',
        IRC: '',
        ALT: '',
        SEZ: 'A',
        TERMINALE: false,
        STORICO: false,
        MAT: e2eDocenteEmail(19)
      }
    ],
    INDIRIZZI: [
      {
        ID: VISIBILITY_INDIRIZZO,
        NOME: 'Visibility Snapshot',
        NOME_SINTETICO: 'VIS',
        TIPO: 'Tecnico'
      }
    ],
    DOCENTI: [
      ...(base.DOCENTI ?? []),
      {
        EMAIL: e2eDocenteEmail(19),
        COGNOME: 'DOCENTE19',
        NOME: 'E2E',
        GENERE: 'M',
        DIPART: 'SCIENTIFICO_DIP',
        ITP: false
      }
    ],
    MATERIE: [
      ...(base.MATERIE ?? []),
      {
        ID: 'MAT',
        NOME: 'Matematica',
        SINTESI: 'MAT',
        ESAME_CFG: null
      }
    ],
    ALUNNI: []
  };
}

function buildVisibilitySnapshotContainer(): ServiceContainer {
  const db = new FakeDatabase(visibilitySeedTables());
  return buildAldoContainer({
    db,
    master: new MasterSheetRepository(db),
    drive: new FakeDriveFacade(),
    gmail: new FakeGmailFacade(),
    templates: new FakeTemplateEngine(),
    expressionEngine: new ExpressionEngineFacade(),
    now: VISIBILITY_NOW
  });
}

test('protectedRangeEditors survives the synthetic-principal skip in protectColumns', () => {
  const container = buildVisibilitySnapshotContainer();

  const result = visibilitySnapshot(container, VISIBILITY_NOW, GestioneSupplenti.SOLO_TITOLARI);

  expect(result.protectedRangeEditors).toContain(e2eDocenteEmail(19));
});
