import {
  registerE2eLegacyScenarioChecks,
  registerE2eScenarioChecks,
  verifyProtectedRangeScenario
} from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { TestRunner } from '../../../src/onlinetests/report/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  CONF_IMP_ASL,
  CONF_MAIL_CARENZA,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_PIANI,
  CONF_MAIL_VERBALE,
  CONF_MAIL_LAVORO,
  CONF_MAIL_STATIC_ALLEGATO,
  CONF_DOC_PIANI,
  CONF_DOC_COMPLESSO,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_RIEPILOGO_FIRME_CDC,
  PIANO_DOPPIO_STUDENTE,
  PDP_BES_3C,
  ALL_CLASSI_E2E,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { ALL_CLASSI } from '../../../src/onlinetests/data/fixtures';
import type { DocumentGenerationService } from '../../../src/application/services/DocumentGenerationService';
import type {
  EmailDb,
  EmailNotificationService,
  SendPatternResult
} from '../../../src/application/services/EmailNotificationService';
import type { ImportService, ImportResult } from '../../../src/application/services/ImportService';
import type { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import type { IDriveFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';
import { TipoPiano } from '../../../src/domain/value-objects/enums';
import { COL_LOG_DOCS, COL_LOG_FOLD, COL_LOG_MAIL } from '../../../src/config/schema';
import { PipelineError } from '../../../src/domain/errors/DomainError';

const sample: SharedTestDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'm',
  sampleSpreadsheetId: 's',
  sampleSpreadsheetUrl: 'https://example.test/s',
  sampleFolderUrl: 'https://example.test/f',
  masterTestMode: true,
  staticAttachmentFileId: 'real_static_attachment_id',
  testMode: true
};

function recordingHarness(
  resultForPattern: (patternId: string) => SendPatternResult = (patternId) => ({
    targets: patternId === CONF_MAIL_CARENZA ? 2 : 1,
    sent: 1,
    skipped: 0,
    errors: []
  }),
  planEmailText:
    | string
    | Record<
        string,
        string
      > = "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
    "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026 " +
    'PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca',
  workPlanAttachmentLinks: string[] = [],
  staticAttachmentAudit: {
    docs: string[];
    folders: string[];
    attach: string[];
  } = {
    docs: [],
    folders: [],
    attach: ['https://drive.google.com/open?id=real_static_attachment_id']
  },
  unrequestedDynamicAttachmentPattern: string | null = null,
  planEmailRows: Array<{ logicalTargetId: unknown; text: string }> | null = null,
  articolataMailClasses = [CLASSE_C, CLASSE_C_PARTNER],
  unrelatedVerbaleFolderBeforeReal = false
): {
  container: ServiceContainer;
  events: string[];
  emailPatterns: string[];
  emailResolutions: () => number;
  generatedConfigIds: () => string[];
  classGenerationTargets: (configId: string) => string[];
  planRows: () => Array<Record<string, unknown>>;
  seedExistingPlan: (studente: string, tipo: TipoPiano, nome: string) => void;
} {
  const events: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const folders: Array<Record<string, unknown>> = [];
  const emailPatterns: string[] = [];
  const generatedConfigIds: string[] = [];
  const classGenerationTargets = new Map<string, string[]>();
  const planTexts: Record<string, string> = {};
  let emailResolutions = 0;
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      events.push('generate-document');
      generatedConfigIds.push(configId);
      const targets = classGenerationTargets.get(configId) ?? [];
      targets.push(classe.value);
      classGenerationTargets.set(configId, targets);
      if (configId === 'E2E_VERBALE') {
        for (const row of rows) {
          if (row[COL_LOG_DOCS.TIPO] === 'PIANO_PERS') {
            row[COL_LOG_DOCS.STATO] = 'VERBALIZZATO';
          }
        }
      }
      const fileId = `${configId}-${classe.value}`;
      const folderPath = `VERBALI/${classe.value}`;
      rows.push({
        [COL_LOG_DOCS.ID]: fileId,
        [COL_LOG_DOCS.ID_GEN]: configId,
        [COL_LOG_DOCS.TIPO]:
          configId === 'E2E_VERBALE'
            ? 'VERBALE'
            : configId === CONF_DOC_RIEPILOGO_FIRME_CDC
              ? 'RIEPILOGO_FIRME_CDC'
              : configId,
        [COL_LOG_DOCS.CLASSI]: classe.value,
        [COL_LOG_DOCS.MATERIE]: configId === 'E2E_VERBALE' ? 'ALT,MATE' : '',
        [COL_LOG_DOCS.PATH]: configId === 'E2E_VERBALE' ? `${folderPath}/${fileId}` : '',
        [COL_LOG_DOCS.NOME]: `${configId} ${classe.value}`,
        [COL_LOG_DOCS.LINK]: `https://example.test/${configId}/${classe.value}`
      });
      if (configId === 'E2E_VERBALE') {
        if (unrelatedVerbaleFolderBeforeReal && classe.value === CLASSE_C_PARENT) {
          folders.push({
            [COL_LOG_FOLD.TIPO]: 'ALTRO',
            [COL_LOG_FOLD.CLASSI]: classe.value,
            [COL_LOG_FOLD.MATERIE]: 'ALT'
          });
        }
        folders.push({
          [COL_LOG_FOLD.TIPO]: 'VERBALE',
          [COL_LOG_FOLD.PATH]: folderPath,
          [COL_LOG_FOLD.CLASSI]: `ARCHIVIO,${classe.value}`,
          [COL_LOG_FOLD.MATERIE]: 'ALT,MATE'
        });
      }
      if (configId === CONF_DOC_ARTICOLATA) {
        // Testo rappresentativo di quello REALMENTE reso dal template
        // DOC_ARTICOLATA_PARAGRAPHS sul fixture e2e (post CDU restructuring, 02 §2.6/§2.7/§8.1):
        // `anagrafica`/coordinatori items are PersonVM, printed via the precomposed
        // `appellativoCompleto` ("Prof./Prof.ssa ${nome} ${cognome}", nome-first — NOT
        // `Docente.getNomeCompleto()`'s cognome-first convention). `coordinatori.elenco` items
        // never carry an `indirizzo` field (ClasseProvider.buildCoordinatori), so no
        // parenthetical after the coordinatore name, unlike the rappresentanti/studenti loops.
        planTexts[fileId] = [
          'Documento Complesso Classe Articolata — 3C',
          'Docenti comuni a tutta la classe (materie tra parentesi):',
          'Prof. Marco Rossi (Matematica, Matematica)',
          'Elenco studenti (indirizzo tra parentesi):',
          'Ferrari Giulia (Liceo Scientifico (E2E))',
          'Coordinatori:',
          classe.value === CLASSE_C ? 'Prof. Alessandro Verdi' : 'Prof. Paolo Fontana'
        ].join(' ');
      }
      if (configId === CONF_DOC_RIEPILOGO_FIRME_CDC) {
        planTexts[fileId] = `Riepilogo firme del Consiglio di Classe ${classe.value} Matematica`;
      }
      if (configId === CONF_DOC_COMPLESSO && classe.value === '1A') {
        planTexts[fileId] = [
          'Report Complesso — 1A',
          'LAB: GRUPPO_A (Giulia Ferrari;)',
          'INTERPRET: CHITARRA (Giulia Ferrari;)'
        ].join(' ');
      }
      return { fileId, status: 'CREATED' };
    },
    generateForPiano(studente: string, tipo: TipoPiano, configId: string) {
      events.push('generate-document');
      generatedConfigIds.push(configId);
      const existing = rows.find(
        (row) =>
          row[COL_LOG_DOCS.ID_GEN] === configId &&
          row[COL_LOG_DOCS.SOTTOTIPO] === tipo &&
          row[COL_LOG_DOCS.UTENTI] === studente
      );
      if (existing !== undefined) {
        // Matches the real service: CheckDuplicates leaves `newFileId` unset, so
        // `resultFromContext` reports SKIPPED with a null fileId.
        return { fileId: null, status: 'SKIPPED' };
      }
      const fileId = `${studente}-${tipo}`;
      rows.push({
        [COL_LOG_DOCS.ID]: fileId,
        [COL_LOG_DOCS.ID_GEN]: configId,
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: tipo,
        [COL_LOG_DOCS.STATO]: 'GENERATO',
        [COL_LOG_DOCS.CLASSI]: studente === PIANO_DOPPIO_STUDENTE ? '2B' : '1A',
        [COL_LOG_DOCS.UTENTI]: studente,
        [COL_LOG_DOCS.NOME]:
          studente === PDP_BES_3C
            ? 'E2E_Piano_PDP (BES)_Ricci Luca'
            : `E2E_Piano_${tipo}_${studente}`,
        [COL_LOG_DOCS.LINK]: `https://example.test/${studente}/${tipo}`
      });
      planTexts[fileId] = [
        `Modello E2E ${tipo}`,
        `Tipo piano: ${tipo === TipoPiano.PDP_BES ? 'PDP (BES)' : tipo}`,
        `Note: Piano E2E ${tipo}`
      ].join('\n');
      return { fileId, status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const logMailRows: Array<Record<string, unknown>> = [];
  const email = {
    sendPattern(patternId: string) {
      emailPatterns.push(patternId);
      if (patternId === CONF_MAIL_LAVORO) {
        logMailRows.push({
          [COL_LOG_MAIL.PATTERN]: CONF_MAIL_LAVORO,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            docs: ['E2E_PIANO_LAVORO-1A'],
            folders: ['folder1'],
            attach: workPlanAttachmentLinks
          })
        });
      }
      if (patternId === CONF_MAIL_PIANI) {
        const emails =
          planEmailRows ??
          Object.entries(
            typeof planEmailText === 'string'
              ? { 'e2edocente3@onlinetest.aldo.local': planEmailText }
              : planEmailText
          ).map(([recipient, text]) => ({ logicalTargetId: `docente:${recipient}`, text }));
        for (const { logicalTargetId, text } of emails) {
          const deliveryRecipient =
            planEmailRows === null && typeof logicalTargetId === 'string'
              ? logicalTargetId.slice(8)
              : 'owner@onlinetest.aldo.local';
          logMailRows.push({
            [COL_LOG_MAIL.PATTERN]: CONF_MAIL_PIANI,
            [COL_LOG_MAIL.DESTINATARI]: deliveryRecipient,
            [COL_LOG_MAIL.TESTO]: text,
            [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ logicalTargetId })
          });
        }
        for (const row of rows) {
          if (row[COL_LOG_DOCS.TIPO] === 'PIANO_PERS') {
            row[COL_LOG_DOCS.NOTIFICATO] = '2026-07-28T09:00:00.000Z';
          }
        }
      }
      if (patternId === CONF_MAIL_STATIC_ALLEGATO) {
        logMailRows.push({
          [COL_LOG_MAIL.PATTERN]: CONF_MAIL_STATIC_ALLEGATO,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify(staticAttachmentAudit)
        });
      }
      if (patternId === CONF_MAIL_VERBALE || patternId === CONF_MAIL_CONDOTTA) {
        logMailRows.push({
          [COL_LOG_MAIL.PATTERN]: patternId,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            docs: [`body-link-${patternId}`],
            folders: [`body-folder-${patternId}`],
            attach:
              unrequestedDynamicAttachmentPattern === patternId
                ? [`https://drive.google.com/open?id=unexpected-${patternId}`]
                : []
          })
        });
      }
      return resultForPattern(patternId);
    },
    getConfigurazione(patternId: string) {
      return { id: patternId };
    },
    enumerateTargets(config: { id: string }) {
      return config.id === CONF_MAIL_VERBALE ? [{ classiCompetenza: articolataMailClasses }] : [];
    }
  } as EmailNotificationService;
  const aslRows: Array<Record<string, unknown>> = [
    { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
    { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
    { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 },
    { STUDENTE: 'e2ealunno52@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 35 }
  ];
  const importService = {
    executeImport(configId: string) {
      if (configId === CONF_IMP_ASL) {
        return { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] };
      }
      throw new Error(`Unexpected configId: ${configId}`);
    }
  } as ImportService;
  const db = {
    table: (name: string) => ({
      findAll: () =>
        name === 'ASL'
          ? aslRows
          : name === 'LOG_MAIL'
            ? logMailRows
            : name === 'LOG_FOLD'
              ? folders
              : rows
    })
  } as unknown as EmailDb;
  const drive = {
    getFileText: (fileId: string) =>
      planTexts[fileId] ?? 'Report Complesso — nessun placeholder residuo'
  } as unknown as IDriveFacade;
  const spreadsheets = {
    getRanges: () => [['MAT', 'ALT', 'Docente']],
    getProtectedRanges: () => [
      {
        id: 1,
        range: {},
        description: '',
        editors: { users: ['e2edocente1@onlinetest.aldo.local'] },
        sheetId: 0,
        sheetName: 'Sheet1',
        warningOnly: false
      }
    ]
  } as unknown as SpreadsheetService;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'importService') return importService as T;
      if (key === 'drive') return drive as unknown as T;
      if (key === 'spreadsheets') return spreadsheets as unknown as T;
      if (key === 'emailNotificationService') {
        emailResolutions += 1;
        events.push('resolve-email');
        return email as T;
      }
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;
  return {
    container,
    events,
    emailPatterns,
    emailResolutions: () => emailResolutions,
    generatedConfigIds: () => generatedConfigIds,
    classGenerationTargets: (configId) => classGenerationTargets.get(configId) ?? [],
    planRows: () => rows.filter((row) => row[COL_LOG_DOCS.TIPO] === 'PIANO_PERS'),
    seedExistingPlan: (studente, tipo, nome) => {
      const fileId = `${studente}-${tipo}`;
      rows.push({
        [COL_LOG_DOCS.ID]: fileId,
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_PIANI,
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: tipo,
        [COL_LOG_DOCS.STATO]: 'GENERATO',
        [COL_LOG_DOCS.CLASSI]: '1A',
        [COL_LOG_DOCS.UTENTI]: studente,
        [COL_LOG_DOCS.NOME]: nome,
        [COL_LOG_DOCS.LINK]: `https://example.test/${studente}/${tipo}`
      });
      planTexts[fileId] = [
        `Modello E2E ${tipo}`,
        `Tipo piano: ${tipo === TipoPiano.PDP_BES ? 'PDP (BES)' : tipo}`,
        `Note: Piano E2E ${tipo}`
      ].join('\n');
    }
  };
}

function harnessWithImport(
  importResult: ImportResult,
  aslRows: Array<Record<string, unknown>>
): { container: ServiceContainer } {
  const base = recordingHarness();
  const importService = {
    executeImport(configId: string) {
      expect(configId).toBe(CONF_IMP_ASL);
      return importResult;
    }
  } as ImportService;
  const db = {
    table: (name: string) => (name === 'ASL' ? { findAll: () => aslRows } : { findAll: () => [] })
  } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'importService') return importService as T;
      if (key === 'db') return db as T;
      return base.container.get<T>(key);
    }
  } as ServiceContainer;
  return { container };
}

test('scenario 9: imports ASL rows and verifies them in the ASL table', () => {
  const { container } = harnessWithImport(
    { inseriti: 4, aggiornati: 0, saltati: 0, ghost: 0, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 },
      { STUDENTE: 'e2ealunno52@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 35 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9).toMatchObject({ status: 'pass' });
});

test('scenario 9: fails when an expected ASL row is missing', () => {
  const { container } = harnessWithImport(
    { inseriti: 3, aggiornati: 0, saltati: 0, ghost: 1, errori: [] },
    [
      { STUDENTE: 'e2ealunno43@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 40 },
      { STUDENTE: 'e2ealunno44@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 55 },
      { STUDENTE: 'e2ealunno51@onlinetest.aldo.local', ANNO: '2026-2027', ORE: 60 }
    ]
  );
  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario9 = runner.report().results.find((r) => r.name.includes('scenario 9'));
  expect(scenario9?.status).toBe('fail');
});

test('refuses to register any check and reports a single failure when the sample is not TEST_MODE', () => {
  const runner = new TestRunner();
  const container = {} as ServiceContainer;

  registerE2eScenarioChecks(runner, container, {
    ...sample,
    masterTestMode: false,
    testMode: false
  });

  const report = runner.report();
  expect(report.failed).toBe(1);
  expect(report.results[0]!.message).toMatch(/TEST_MODE/);
});

test('protected range scenario does not swallow generation errors in test mode', () => {
  const rejection = new PipelineError(
    'RenderTemplate: Invalid requests[0].addProtectedRange: Utente non valido: "mock@onlinetest.aldo.local".'
  );
  const documents = {
    generateForClasse: () => {
      throw rejection;
    }
  } as unknown as DocumentGenerationService;
  const spreadsheets = {} as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, true)).toThrow(rejection);
});

test('protected range scenario: test mode reports SKIPPED when mock editors block every protection', () => {
  const protectionResult = {
    spreadsheetId: 'rendered-sheet',
    protectedCount: 0,
    protectedRangeIds: [],
    replies: [],
    failures: [
      {
        request: {
          range: 'Sheet1!A:A',
          editors: { users: ['mock@onlinetest.aldo.local'] }
        },
        message: 'Utente non valido: "mock@onlinetest.aldo.local".'
      }
    ]
  };
  const getProtectedRanges = jest.fn(() => []);
  const spreadsheets = {
    getRanges: () => [['MAT', 'ALT', 'Docente']],
    getProtectedRanges,
    protectRanges: () => protectionResult
  } as unknown as SpreadsheetService;
  const documents = {
    generateForClasse: () => {
      spreadsheets.protectRanges('rendered-sheet', [], { onError: 'continue' });
      return { fileId: 'rendered-sheet', status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;

  const outcome = verifyProtectedRangeScenario(documents, spreadsheets, true);
  expect(outcome?.status).toBe('skipped');
  expect(outcome?.message).toContain('Utente non valido');
  expect(protectionResult.failures).toHaveLength(1);
  expect(getProtectedRanges).toHaveBeenCalledTimes(ALL_CLASSI_E2E.length);
});

test('protected range scenario: test mode still verifies protections that the API did accept', () => {
  const documents = {
    generateForClasse: () => ({ fileId: 'protected-sheet', status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const spreadsheets = {
    getRanges: () => [['MAT', 'ALT', 'Docente']],
    getProtectedRanges: () => [
      {
        id: 1,
        range: {},
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: [] },
        sheetId: 0,
        sheetName: 'Sheet1',
        warningOnly: false
      }
    ]
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, true)).toThrow(
    /senza editors/
  );
});

test('protected range scenario fails mixed empty and persisted evidence instead of skipping', () => {
  const documents = {
    generateForClasse: (classe: ClasseId) => ({ fileId: `sheet-${classe.value}`, status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const getProtectedRanges = jest
    .fn()
    .mockReturnValueOnce([])
    .mockReturnValue([
      {
        id: 1,
        range: {},
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: ['teacher@onlinetest.aldo.local'] },
        sheetId: 0,
        sheetName: 'Sheet1',
        warningOnly: false
      }
    ]);
  const spreadsheets = {
    getRanges: () => [['MAT', 'ALT', 'Docente']],
    getProtectedRanges
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, true)).toThrow(
    /nessun range protetto/
  );
  expect(getProtectedRanges).toHaveBeenCalledTimes(ALL_CLASSI_E2E.length);
});

test('protected range scenario rejects warning-only persisted evidence instead of skipping', () => {
  const documents = {
    generateForClasse: () => ({ fileId: 'warning-only-sheet', status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const spreadsheets = {
    getRanges: () => [['MAT', 'ALT', 'Docente']],
    getProtectedRanges: () => [
      {
        id: 1,
        range: {},
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: ['teacher@onlinetest.aldo.local'] },
        sheetId: 0,
        sheetName: 'Sheet1',
        warningOnly: true
      }
    ]
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, true)).toThrow(/warningOnly/);
});

test('protected range scenario rejects residual header placeholders in test mode', () => {
  const documents = {
    generateForClasse: () => ({ fileId: 'unrendered-sheet', status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const spreadsheets = {
    getRanges: () => [['{{dynamic_columns[source=materie]}}']]
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, true)).toThrow(
    /placeholder residuo/
  );
});

test('protected range scenario rejects absent ranges in production mode', () => {
  const documents = {
    generateForClasse: () => ({ fileId: 'unprotected-sheet', status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const spreadsheets = {
    getProtectedRanges: () => []
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, false)).toThrow(
    /nessun range protetto/
  );
});

test('protected range scenario rejects editors missing from a range in production mode', () => {
  const documents = {
    generateForClasse: () => ({ fileId: 'editorless-sheet', status: 'CREATED' })
  } as unknown as DocumentGenerationService;
  const spreadsheets = {
    getProtectedRanges: () => [
      {
        id: 1,
        range: {},
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: [] },
        sheetId: 0,
        sheetName: 'Sheet1',
        warningOnly: false
      }
    ]
  } as unknown as SpreadsheetService;

  expect(() => verifyProtectedRangeScenario(documents, spreadsheets, false)).toThrow(
    /senza editors/
  );
});

test('resolves the memoized email service once across the plan scenario and later sends', () => {
  const harness = recordingHarness();

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, harness.container, sample);

  expect(harness.emailResolutions()).toBe(1);
  expect(harness.emailPatterns).toEqual([
    CONF_MAIL_PIANI,
    CONF_MAIL_LAVORO,
    CONF_MAIL_STATIC_ALLEGATO,
    CONF_MAIL_VERBALE,
    CONF_MAIL_CONDOTTA,
    CONF_MAIL_CARENZA
  ]);
  expect(runner.report().results.filter((result) => result.status === 'fail')).toEqual([]);
});

test('scenario 1 ignores an earlier non-verbale folder that mentions 3C', () => {
  const harness = recordingHarness(
    undefined,
    undefined,
    [],
    undefined,
    null,
    undefined,
    undefined,
    true
  );
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario1 = runner.report().results.find((result) =>
    result.name.startsWith('E2E scenario 1:')
  );
  expect(scenario1).toMatchObject({ status: 'pass' });
});

test('scenario 3 uses one config to render, deduplicate, send, and subtype-isolate PEI/PDP_BES history', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'pass' });
  expect(new Set(harness.generatedConfigIds().filter((id) => id === CONF_DOC_PIANI))).toEqual(
    new Set([CONF_DOC_PIANI])
  );
  const dualRows = harness
    .planRows()
    .filter((row) => row[COL_LOG_DOCS.UTENTI] === PIANO_DOPPIO_STUDENTE);
  expect(dualRows).toHaveLength(2);
  expect(dualRows.map((row) => row[COL_LOG_DOCS.SOTTOTIPO]).sort()).toEqual(['PDP_BES', 'PEI']);
  expect(dualRows.every((row) => row[COL_LOG_DOCS.NOTIFICATO] !== undefined)).toBe(true);
});

test('scenario 3 reuses a plan an earlier check already generated (CheckDuplicates SKIPPED)', () => {
  const harness = recordingHarness();
  // `documenti.duplicazione::NEGATA` is registered before the E2E scenarios and
  // owns the same dedupe identity, so this plan already exists when scenario 3 runs.
  harness.seedExistingPlan(PDP_BES_3C, TipoPiano.PDP_BES, 'E2E_Piano_PDP (BES)_Ricci Luca');
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'pass' });
  expect(
    harness.planRows().filter((row) => row[COL_LOG_DOCS.UTENTI] === PDP_BES_3C)
  ).toHaveLength(1);
});

test('scenario 3 accepts historical-plan lines separated by HTML-to-text newlines', () => {
  const harness = recordingHarness(
    undefined,
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina\nDisponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026\n" +
      "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina\nDisponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026\n" +
      'PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca'
  );
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'pass' });
});

test('scenario 3 rejects an email that omits the articulated-partner plan', () => {
  const harness = recordingHarness(
    undefined,
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
      "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026"
  );
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'fail' });
});

test('scenario 3 rejects the articulated-partner plan when it appears only in the classico coordinator email', () => {
  const baseEmail =
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
    "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026";
  const scientificoEmail = baseEmail;
  const classicoEmail = `${baseEmail} PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca`;
  expect(scientificoEmail).not.toContain('E2E_Piano_PDP (BES)_Ricci Luca');
  expect(classicoEmail).toContain('E2E_Piano_PDP (BES)_Ricci Luca');
  const harness = recordingHarness(undefined, {
    'e2edocente3@onlinetest.aldo.local': scientificoEmail,
    'e2edocente4@onlinetest.aldo.local': classicoEmail
  });
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'fail' });
});

test('scenario 3 accepts the articulated-partner plan only in the scientifico coordinator email', () => {
  const baseEmail =
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
    "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026";
  const scientificoEmail = `${baseEmail} PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca`;
  const classicoEmail = baseEmail;
  expect(scientificoEmail).toContain('E2E_Piano_PDP (BES)_Ricci Luca');
  expect(classicoEmail).not.toContain('E2E_Piano_PDP (BES)_Ricci Luca');
  const harness = recordingHarness(undefined, {
    'e2edocente3@onlinetest.aldo.local': scientificoEmail,
    'e2edocente4@onlinetest.aldo.local': classicoEmail
  });
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'pass' });
});

test('scenario 3 identifies articulated coordinators through logical targets when TEST_MODE redirects delivery', () => {
  const baseEmail =
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
    "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026";
  const scientificoEmail = `${baseEmail} PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca`;
  const classicoEmail = baseEmail;
  const harness = recordingHarness(undefined, undefined, undefined, undefined, null, [
    { logicalTargetId: 'docente:e2edocente3@onlinetest.aldo.local', text: scientificoEmail },
    { logicalTargetId: 'docente:e2edocente4@onlinetest.aldo.local', text: classicoEmail }
  ]);
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'pass' });
});

test('scenario 3 rejects a non-string logical target id', () => {
  const harness = recordingHarness(undefined, undefined, undefined, undefined, null, [
    { logicalTargetId: 3, text: 'PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca' }
  ]);
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3).toMatchObject({ status: 'fail' });
  expect(scenario3?.message).toMatch(/logicalTargetId mancante/);
});

test('scenario 3 fails when prior-year PEI and PDP_BES history is crossed between subtypes', () => {
  const harness = recordingHarness(
    undefined,
    "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026 " +
      "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026 " +
      'PDP (BES) — Ricci Luca: E2E_Piano_PDP (BES)_Ricci Luca'
  );
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario3 = runner.report().results.find((result) => result.name.includes('scenario 3'));
  expect(scenario3?.status).toBe('fail');
  expect(scenario3?.message).toMatch(/storico.*SOTTOTIPO|SOTTOTIPO.*storico/i);
});

test('scenario 12 sends the prepared work-plan email without regenerating verbali', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  expect(harness.generatedConfigIds().filter((id) => id === 'E2E_VERBALE')).toHaveLength(
    ALL_CLASSI_E2E.length
  );
});

test('scenario 10b generates the ARTICOLATA document for both partners, never the parent', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario10b = runner
    .report()
    .results.find((result) => result.name.includes('scenario 10b'));
  expect(scenario10b).toMatchObject({ status: 'pass' });
  expect(harness.classGenerationTargets(CONF_DOC_ARTICOLATA).sort()).toEqual(
    [CLASSE_C, CLASSE_C_PARTNER].sort()
  );
  expect(harness.classGenerationTargets(CONF_DOC_ARTICOLATA)).not.toContain(CLASSE_C_PARENT);
});

test('scenario 10c generates CDC signature summaries for the articulated class roster', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario10c = runner
    .report()
    .results.find((result) => result.name.includes('scenario 10c'));
  expect(scenario10c).toMatchObject({ status: 'pass' });
});

test('E2E phase persists CDC summaries for plain classes and articulated partners, never the parent', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  // ARTICOLATA scope now tracks the full class roster (ALL_CLASSI), not the
  // legacy 3-class ALL_CLASSI_E2E — every class except an articulation parent.
  expect(harness.classGenerationTargets(CONF_DOC_RIEPILOGO_FIRME_CDC).sort()).toEqual(
    ALL_CLASSI.filter((classe) => classe !== CLASSE_C_PARENT && classe !== '5B').sort()
  );
  expect(harness.classGenerationTargets(CONF_DOC_RIEPILOGO_FIRME_CDC)).not.toContain(
    CLASSE_C_PARENT
  );
});

test('scenario 12 fails when LOG_MAIL.ALLEGATI records an unrequested real file attachment', () => {
  const harness = recordingHarness(undefined, undefined, [
    'https://drive.google.com/open?id=E2E_PIANO_LAVORO-1A'
  ]);
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario12 = runner.report().results.find((result) => result.name.includes('scenario 12'));
  expect(scenario12?.status).toBe('fail');
  expect(scenario12?.message).toMatch(/attach|allegat/i);
});

test('scenario 13 proves the sent static attachment is audited outside rendered docs/folders', () => {
  const harness = recordingHarness();
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario13 = runner.report().results.find((result) => result.name.includes('scenario 13'));
  expect(scenario13).toMatchObject({ status: 'pass' });
  expect(harness.emailPatterns).toContain(CONF_MAIL_STATIC_ALLEGATO);
});

test('scenario 13 fails when the static attachment is missing from attach or leaks into body-link audit', () => {
  const harness = recordingHarness(undefined, undefined, [], {
    docs: ['real_static_attachment_id'],
    folders: [],
    attach: []
  });
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario13 = runner.report().results.find((result) => result.name.includes('scenario 13'));
  expect(scenario13?.status).toBe('fail');
  expect(scenario13?.message).toMatch(/attach|docs|folders|static/i);
});

test('scenario 4 fails if the minutes email gains an implicit PDF without ALLEGA true', () => {
  const harness = recordingHarness(undefined, undefined, [], undefined, CONF_MAIL_VERBALE);
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario4 = runner.report().results.find((result) => result.name.includes('scenario 4'));
  expect(scenario4?.status).toBe('fail');
  expect(scenario4?.message).toMatch(/attach|PDF|ALLEGA/i);
});

test('scenario 4 rejects partial verbale delivery when articulated targets are skipped', () => {
  const harness = recordingHarness((patternId) =>
    patternId === CONF_MAIL_VERBALE
      ? { targets: 3, sent: 1, skipped: 2, errors: [] }
      : { targets: patternId === CONF_MAIL_CARENZA ? 2 : 1, sent: 1, skipped: 0, errors: [] }
  );
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario4 = runner.report().results.find((result) => result.name.includes('scenario 4'));
  expect(scenario4).toMatchObject({ status: 'fail' });
  expect(scenario4?.message).toMatch(/targets=3, sent=1, skipped=2/);
});

test('scenario 4 rejects an ARTICOLATA mail target set that retains the parent class', () => {
  const harness = recordingHarness(undefined, undefined, undefined, undefined, null, null, [
    CLASSE_C,
    CLASSE_C_PARTNER,
    CLASSE_C_PARENT
  ]);
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const scenario4 = runner.report().results.find((result) => result.name.includes('scenario 4'));
  expect(scenario4?.status).toBe('fail');
  expect(scenario4?.message).toMatch(/ARTICOLATA.*parent|parent.*ARTICOLATA/i);
});

test('reports strict actionable diagnostics for verbale and condotta email failures', () => {
  const harness = recordingHarness((patternId) => {
    if (patternId === CONF_MAIL_VERBALE) {
      return { targets: 3, sent: 3, skipped: 1, errors: ['verbale error'] };
    }
    if (patternId === CONF_MAIL_CONDOTTA) {
      return { targets: 4, sent: 4, skipped: 1, errors: ['condotta error'] };
    }
    return { targets: patternId === CONF_MAIL_CARENZA ? 2 : 1, sent: 1, skipped: 0, errors: [] };
  });
  const runner = new TestRunner();

  registerE2eScenarioChecks(runner, harness.container, sample);

  const report = runner.report();
  const verbale = report.results.find((result) => result.name.includes('scenario 4'));
  const condotta = report.results.find((result) => result.name.includes('scenario 5'));
  expect(verbale).toMatchObject({
    status: 'fail',
    message: 'Invio verbale fallito: targets=3, sent=3, skipped=1, errors=verbale error'
  });
  expect(condotta).toMatchObject({
    status: 'fail',
    message: 'Invio condotta fallito: targets=4, sent=4, skipped=1, errors=condotta error'
  });
});

test('scenario 10: generates the complex doc for every class and checks for leftover placeholders', () => {
  const harness = recordingHarness();
  const driveTexts: Record<string, string> = {};
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        const drive = {
          getFileText: (fileId: string) =>
            driveTexts[fileId] ??
            'Report Complesso — 1A LAB: GRUPPO_A (Giulia Ferrari;) INTERPRET: CHITARRA (Giulia Ferrari;)'
        } as unknown as IDriveFacade;
        return drive as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10).toMatchObject({ status: 'pass' });
});

test('scenario 10: rejects the 1A complex document when rendered specificita are absent', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        return {
          getFileText: () => 'Report Complesso — 1A, no placeholders left'
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((result) => result.name.includes('scenario 10'));
  expect(scenario10).toMatchObject({ status: 'fail' });
  expect(scenario10?.message).toMatch(/specificita|LAB|INTERPRET/i);
});

test('scenario 10: rejects descriptive labels instead of the contractual specificita codes', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        return {
          getFileText: () =>
            'Report Complesso — 1A Laboratorio: GRUPPO_A (Giulia Ferrari;) Interpretazione ed esecuzione: Chitarra (Giulia Ferrari;)'
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((result) => result.name.includes('scenario 10'));
  expect(scenario10).toMatchObject({ status: 'fail' });
  expect(scenario10?.message).toMatch(/LAB|INTERPRET/);
});

test('scenario 10: fails when the generated doc still has an unresolved {{...}} placeholder', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') {
        const drive = {
          getFileText: () => 'Report Complesso — {{focus.classe.anagrafica.nome}}'
        } as unknown as IDriveFacade;
        return drive as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario10 = runner.report().results.find((r) => r.name.includes('scenario 10'));
  expect(scenario10?.status).toBe('fail');
});

test('scenario 11: passes when every generated sheet has protected ranges with non-empty editors', () => {
  const harness = recordingHarness();
  const getProtectedRanges = jest.fn(() => [
    {
      id: 'p1',
      range: {},
      description: '',
      editors: { users: ['e2edocente1@onlinetest.aldo.local'] },
      sheetId: 0,
      sheetName: 'Sheet1',
      warningOnly: false
    }
  ]);
  const container = {
    get<T>(key: string): T {
      if (key === 'spreadsheets') {
        return {
          getRanges: () => [['MAT', 'ALT', 'Docente']],
          getProtectedRanges
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario11 = runner.report().results.find((r) => r.name.includes('scenario 11'));
  expect(scenario11).toMatchObject({ status: 'pass' });
  expect(getProtectedRanges).toHaveBeenCalled();
});

test('scenario 11: reports SKIPPED (not pass) when TEST_MODE mock editors leave no protection', () => {
  const harness = recordingHarness();
  const container = {
    get<T>(key: string): T {
      if (key === 'spreadsheets') {
        return {
          getRanges: () => [['MAT', 'ALT', 'Docente']],
          getProtectedRanges: () => []
        } as unknown as T;
      }
      return harness.container.get<T>(key);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario11 = runner.report().results.find((r) => r.name.includes('scenario 11'));
  expect(scenario11?.status).toBe('skipped');
  expect(scenario11?.message).toMatch(/addProtectedRange/);
  expect(scenario11?.message).toMatch(/Utente non valido/);
  expect(scenario11?.message).toMatch(/@onlinetest\.aldo\.local/);
});

test('legacy email and import adapters retain their existing E2E callbacks without document duplication', () => {
  const harness = recordingHarness();
  const emailNames: string[] = [];
  const importNames: string[] = [];
  const emailRunner = { add: (name: string) => emailNames.push(name) };
  const importRunner = { add: (name: string) => importNames.push(name) };

  registerE2eLegacyScenarioChecks(emailRunner as never, harness.container, sample, 'email');
  registerE2eLegacyScenarioChecks(importRunner as never, harness.container, sample, 'import');

  expect(emailNames).toEqual([
    'E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)',
    'E2E scenario 13: invia allegato statico non rappresentato da box (TEST_MODE)',
    'E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)',
    'E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)',
    'E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)'
  ]);
  expect(importNames).toEqual(['E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)']);
});

test('scenario 12: sends, and asserts both docs and folders landed in LOG_MAIL.ALLEGATI', () => {
  const rows: Array<Record<string, unknown>> = [];
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      return { fileId: `${configId}-${classe.value}`, status: 'CREATED' };
    },
    generateForAlunno() {
      return { fileId: 'x', status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const email = {
    sendPattern(patternId: string): SendPatternResult {
      if (patternId === CONF_MAIL_LAVORO) {
        rows.push({
          [COL_LOG_MAIL.PATTERN]: CONF_MAIL_LAVORO,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            docs: ['E2E_PIANO_LAVORO-1A'],
            folders: ['folder1'],
            attach: []
          })
        });
      }
      return { targets: 1, sent: 1, skipped: 0, errors: [] };
    }
  } as EmailNotificationService;
  const db = { table: () => ({ findAll: () => rows }) } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'emailNotificationService') return email as T;
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario12 = runner.report().results.find((r) => r.name.includes('scenario 12'));
  expect(scenario12).toMatchObject({ status: 'pass' });
});

test('scenario 12: fails when LOG_MAIL.ALLEGATI.folders is empty', () => {
  const rows: Array<Record<string, unknown>> = [];
  const documents = {
    generateForClasse(classe: ClasseId, configId: string) {
      return { fileId: `${configId}-${classe.value}`, status: 'CREATED' };
    },
    generateForAlunno() {
      return { fileId: 'x', status: 'CREATED' };
    }
  } as unknown as DocumentGenerationService;
  const email = {
    sendPattern(patternId: string): SendPatternResult {
      if (patternId === CONF_MAIL_LAVORO) {
        rows.push({
          [COL_LOG_MAIL.PATTERN]: CONF_MAIL_LAVORO,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            docs: ['E2E_PIANO_LAVORO-1A'],
            folders: [],
            attach: []
          })
        });
      }
      return { targets: 1, sent: 1, skipped: 0, errors: [] };
    }
  } as EmailNotificationService;
  const db = { table: () => ({ findAll: () => rows }) } as unknown as EmailDb;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'db') return db as T;
      if (key === 'emailNotificationService') return email as T;
      throw new Error(`Unexpected service: ${key}`);
    }
  } as ServiceContainer;

  const runner = new TestRunner();
  registerE2eScenarioChecks(runner, container, sample);

  const scenario12 = runner.report().results.find((r) => r.name.includes('scenario 12'));
  expect(scenario12?.status).toBe('fail');
});
