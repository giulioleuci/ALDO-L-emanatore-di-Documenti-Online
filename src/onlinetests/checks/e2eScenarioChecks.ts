import type { ServiceContainer } from '../../config/ServiceContainer';
import {
  type OnlineTestSkippedOutcome,
  type TestRunner
} from '../report/OnlineTestReport';
import { classifySyntheticProtectedRangeOutcome } from './protectedRangeOutcome';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type {
  EmailNotificationService,
  SendPatternResult
} from '../../application/services/EmailNotificationService';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import type { ImportService } from '../../application/services/ImportService';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import { tipoPianoLabel } from '../../application/context-engine/mappers/labels';
import { TABLE, COL_LOG_DOCS, COL_LOG_FOLD, COL_ASL, COL_LOG_MAIL } from '../../config/schema';
import { TipoPiano } from '../../domain/value-objects/enums';
import {
  ALL_CLASSI_E2E,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_COMPLESSO,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_RIEPILOGO_FIRME_CDC,
  CONF_DOC_SHEET_PERMESSI,
  CONF_DOC_PIANO_LAVORO,
  CONF_DOC_PIANI,
  CONF_IMP_ASL,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  CONF_MAIL_LAVORO,
  CONF_MAIL_STATIC_ALLEGATO,
  PIANO_STUDENTE,
  PIANO_DOPPIO_STUDENTE,
  PDP_BES_3C,
  DOCENTE_COUNT,
  e2eDocenteEmail,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';
import { ALL_CLASSI } from '../data/fixtures';

function emailDiagnostics(result: SendPatternResult): string {
  return [
    `targets=${result.targets}`,
    `sent=${result.sent}`,
    `skipped=${result.skipped}`,
    `errors=${result.errors.length > 0 ? result.errors.join(' | ') : 'none'}`
  ].join(', ');
}

/**
 * Verifies SHEET_CON_MATERIE_E_PERMESSI end to end: the sheet is generated, its
 * dynamic headers are rendered, and each column is protected with its own editors.
 *
 * TEST_MODE caveat (see `docs/superpowers/plans/2026-08-03-best-effort-sheet-protections.md`):
 * the shared fixture addresses everybody with `@onlinetest.aldo.local`, which is not a
 * real Workspace domain, so the live Sheets API rejects every
 * `addProtectedRange` whose editors are fixture teachers with
 * `Invalid requests[0].addProtectedRange: Utente non valido: "…"`. `protectRanges`
 * runs best-effort (`onError: 'continue'`), so generation still succeeds and no
 * protection survives. That is an environment limit, not an ALDO defect: the check
 * reports SKIPPED rather than passing silently or failing on Google's rejection.
 * Outside TEST_MODE (real accounts) the assertions stay strict.
 */
export function verifyProtectedRangeScenario(
  documents: DocumentGenerationService,
  spreadsheets: SpreadsheetService,
  testMode: boolean
): void | OnlineTestSkippedOutcome {
  const expectedFixtureEditors = Array.from({ length: DOCENTE_COUNT }, (_, index) =>
    e2eDocenteEmail(index + 1)
  );
  const evidence: Array<{ classe: string; protections: ReturnType<SpreadsheetService['getProtectedRanges']> }> =
    [];
  for (const classe of ALL_CLASSI_E2E) {
    const { fileId, status } = documents.generateForClasse(
      ClasseId.of(classe),
      CONF_DOC_SHEET_PERMESSI
    );
    if (fileId === null) {
      throw new ValidationError(
        `Generazione sheet permessi per ${classe} non ha prodotto un fileId (status=${status})`
      );
    }
    if (testMode) {
      const headers = spreadsheets
        .getRanges(fileId, 'A1:ZZ1')
        .flat()
        .map((value) => String(value).trim())
        .filter(Boolean);
      if (headers.length === 0) {
        throw new ValidationError(`Sheet permessi per ${classe}: intestazioni non renderizzate`);
      }
      if (headers.some((header) => header.includes('{{') || header.includes('}}'))) {
        throw new ValidationError(
          `Sheet permessi per ${classe}: placeholder residuo nelle intestazioni`
        );
      }
    }
    const protections = spreadsheets.getProtectedRanges(fileId);
    evidence.push({ classe, protections });
  }
  const outcome = classifySyntheticProtectedRangeOutcome(
    testMode,
    evidence.flatMap(({ protections }) => protections),
    expectedFixtureEditors
  );
  if (outcome !== undefined) return outcome;
  for (const { classe, protections } of evidence) {
    if (protections.length === 0) {
      throw new ValidationError(`Sheet permessi per ${classe}: nessun range protetto trovato`);
    }
    for (const p of protections) {
      if (p.warningOnly === true) {
        throw new ValidationError(
          `Sheet permessi per ${classe}: range protetto "${p.description}" e solo warningOnly`
        );
      }
      if ((p.editors.users ?? []).length === 0) {
        throw new ValidationError(
          `Sheet permessi per ${classe}: range protetto "${p.description}" senza editors`
        );
      }
    }
  }
}

/**
 * Registers the 8 e2e scenario checks (design spec `2026-07-21-testonline-mock-db-e2e-design.md`,
 * scenario 8 added by `2026-07-23-email-links-boxes-riepilogo-logmail-design.md`).
 * Refuses to register any real check — and reports a single explicit failure instead — if the
 * sample's MASTER row isn't TEST_MODE, so a misconfigured fixture can never risk a real send
 * (design spec "Error handling").
 */
export function registerE2eScenarioChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean }
): void {
  if (!sample.testMode) {
    runner.add('E2E scenarios: MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        'E2E scenario checks refuse to run: sample MASTER.TEST_MODE is not true (would risk sending real emails).'
      );
    });
    return;
  }

  const documents = container.get<DocumentGenerationService>('documentGenerationService');
  const db = container.get<EmailDb>('db');
  let emailService: EmailNotificationService | null = null;
  const getEmailService = (): EmailNotificationService => {
    if (emailService === null) {
      emailService = container.get<EmailNotificationService>('emailNotificationService');
    }
    return emailService;
  };

  /**
   * `LOG_DOCS.ID` of an already-registered `CONF_DOC_PIANI` plan, or `null` when
   * none exists. Used when `CheckDuplicates` SKIPs a generation because an
   * earlier check in the same suite run already produced that exact plan.
   */
  const persistedPlanFileId = (studente: string, tipo: string): string | null => {
    const row = db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .find(
        (candidate) =>
          candidate[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI &&
          candidate[COL_LOG_DOCS.UTENTI] === studente &&
          candidate[COL_LOG_DOCS.SOTTOTIPO] === tipo
      );
    const fileId = String(row?.[COL_LOG_DOCS.ID] ?? '').trim();
    return fileId === '' ? null : fileId;
  };

  const assertNoAttachedFiles = (patternId: string, label: string): void => {
    const logRows = db
      .table(TABLE.LOG_MAIL)
      .findAll()
      .filter((row) => row[COL_LOG_MAIL.PATTERN] === patternId);
    if (logRows.length === 0) {
      throw new ValidationError(`${label}: nessuna riga LOG_MAIL registrata`);
    }
    for (const row of logRows) {
      const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
        attach?: string[];
      };
      if ((allegati.attach ?? []).length > 0) {
        throw new ValidationError(
          `${label}: LOG_MAIL.ALLEGATI.attach non è vuoto; nessun PDF/file era configurato con ALLEGA:true`
        );
      }
    }
  };

  const assertPersistedLinks = (configId: string, label: string): void => {
    const rows = db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.ID_GEN] === configId);
    for (const classe of ALL_CLASSI_E2E) {
      const row = rows.find((candidate) => candidate[COL_LOG_DOCS.CLASSI] === classe);
      if (row === undefined || String(row[COL_LOG_DOCS.LINK] ?? '').trim() === '') {
        throw new ValidationError(`${label} per ${classe} non ha un LOG_DOCS.LINK persistito`);
      }
    }
  };

  const assertArticolata3CResults = (label: string, classi: string[]): void => {
    const missingPartners = [CLASSE_C, CLASSE_C_PARTNER].filter(
      (classe) => !classi.includes(classe)
    );
    if (missingPartners.length > 0 || classi.includes(CLASSE_C_PARENT)) {
      throw new ValidationError(
        `${label}: GESTIONE_ARTICOLAZIONE=ARTICOLATA richiede le partner ${CLASSE_C}, ${CLASSE_C_PARTNER} ed esclude la parent ${CLASSE_C_PARENT}; ricevute ${classi.join(', ')}`
      );
    }
  };

  const assertPianiVerbalizzati = (): void => {
    const piani = db
      .table(TABLE.LOG_DOCS)
      .findAll()
      .filter((row) => row[COL_LOG_DOCS.TIPO] === 'PIANO_PERS');
    if (piani.length === 0) {
      throw new ValidationError('Verbale: nessun piano personalizzato generato da verbalizzare');
    }
    for (const piano of piani) {
      if (piano[COL_LOG_DOCS.STATO] !== 'VERBALIZZATO') {
        throw new ValidationError(
          `Verbale: piano ${String(piano[COL_LOG_DOCS.ID_GEN])} non verbalizzato`
        );
      }
    }
  };

  const assertVerbaleRegistrationMetadata = (): void => {
    const rowsForConfig = (table: string, configId: string): Array<Record<string, unknown>> =>
      db
        .table(table)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === configId);
    const verbaleDocs = rowsForConfig(TABLE.LOG_DOCS, CONF_DOC_VERBALE);
    const verbaleFolders = db
      .table(TABLE.LOG_FOLD)
      .findAll()
      .filter((row) => row[COL_LOG_FOLD.TIPO] === 'VERBALE');
    const hasMate = (value: unknown): boolean => csvContains(value, 'MATE');
    const parentPath = (path: unknown): string => {
      const value = typeof path === 'string' ? path : '';
      return value.slice(0, value.lastIndexOf('/'));
    };
    for (const classe of ALL_CLASSI_E2E) {
      const doc = verbaleDocs.find((row) => csvContains(row[COL_LOG_DOCS.CLASSI], classe));
      if (doc === undefined || !hasMate(doc[COL_LOG_DOCS.MATERIE])) {
        throw new ValidationError(`Verbale per ${classe} non ha metadata MATERIE configurati`);
      }
      const folder = verbaleFolders.find(
        (row) =>
          csvContains(row[COL_LOG_FOLD.CLASSI], classe) &&
          row[COL_LOG_FOLD.PATH] === parentPath(doc[COL_LOG_DOCS.PATH])
      );
      if (folder === undefined || !hasMate(folder[COL_LOG_FOLD.MATERIE])) {
        throw new ValidationError(`Cartella verbale per ${classe} non ha metadata MATERIE configurati`);
      }
    }
  };

  runner.add(
    'E2E scenario 3: piani personalizzati con modello condizionale, dedupe e storico per sottotipo',
    sample.sampleSpreadsheetUrl,
    () => {
      const drive = container.get<IDriveFacade>('drive');
      const expectedPlanCount = TIPI_PIANO.reduce(
        (total, tipo) => total + PIANO_STUDENTE[tipo].length,
        0
      );
      const generated = new Map<string, string>();

      for (const tipo of TIPI_PIANO) {
        for (const studente of PIANO_STUDENTE[tipo]) {
          const { fileId, status } = documents.generateForPiano(
            studente,
            tipo as TipoPiano,
            CONF_DOC_PIANI
          );
          // `documenti.duplicazione::NEGATA` owns the same dedupe identity
          // (PDP_BES_3C + PDP_BES + CONF_DOC_PIANI) and is registered earlier in
          // `registerDocumentiChecks`, so it legitimately generates that plan
          // first: CheckDuplicates then SKIPs this call. What this scenario
          // asserts is the persisted end state, not who created the file — so
          // reuse the already-registered document instead of failing.
          const persistedId = fileId ?? persistedPlanFileId(studente, tipo);
          if (persistedId === null) {
            throw new ValidationError(
              `Generazione piano ${tipo} per ${studente} non ha prodotto un fileId (status=${status})`
            );
          }
          generated.set(`${studente}::${tipo}`, persistedId);
        }
      }

      const rowsAfterFirstRun = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI);
      if (rowsAfterFirstRun.length !== expectedPlanCount) {
        throw new ValidationError(
          `Piani: attese ${expectedPlanCount} righe LOG_DOCS, ricevute ${rowsAfterFirstRun.length}`
        );
      }
      if (
        rowsAfterFirstRun.some(
          (row) =>
            row[COL_LOG_DOCS.TIPO] !== 'PIANO_PERS' ||
            !TIPI_PIANO.includes(row[COL_LOG_DOCS.SOTTOTIPO] as (typeof TIPI_PIANO)[number])
        )
      ) {
        throw new ValidationError(
          'Piani: LOG_DOCS deve usare ID_GEN unico, TIPO=PIANO_PERS e SOTTOTIPO da PIANI.TIPO'
        );
      }

      const dualRows = rowsAfterFirstRun.filter(
        (row) => row[COL_LOG_DOCS.UTENTI] === PIANO_DOPPIO_STUDENTE
      );
      const dualSubtypes = dualRows
        .map((row) => String(row[COL_LOG_DOCS.SOTTOTIPO]))
        .sort()
        .join(',');
      if (dualRows.length !== 2 || dualSubtypes !== 'PDP_BES,PEI') {
        throw new ValidationError(
          `Piani: ${PIANO_DOPPIO_STUDENTE} deve avere due LOG_DOCS distinti PDP_BES,PEI; ricevuti ${dualSubtypes}`
        );
      }

      for (const tipo of [TipoPiano.PEI, TipoPiano.PDP_BES]) {
        const fileId = generated.get(`${PIANO_DOPPIO_STUDENTE}::${tipo}`);
        if (fileId === undefined) {
          throw new ValidationError(`Piani: file ${tipo} mancante per ${PIANO_DOPPIO_STUDENTE}`);
        }
        const text = drive.getFileText(fileId);
        for (const expected of [
          `Modello E2E ${tipo}`,
          `Tipo piano: ${tipoPianoLabel(tipo)}`,
          `Note: Piano E2E ${tipo}`
        ]) {
          if (!text.includes(expected)) {
            throw new ValidationError(
              `Piani: il documento ${tipo} non contiene il testo renderizzato atteso "${expected}"`
            );
          }
        }
      }

      for (const tipo of TIPI_PIANO) {
        for (const studente of PIANO_STUDENTE[tipo]) {
          documents.generateForPiano(studente, tipo as TipoPiano, CONF_DOC_PIANI);
        }
      }
      const rowsAfterRetry = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI);
      if (rowsAfterRetry.length !== rowsAfterFirstRun.length) {
        throw new ValidationError(
          `Piani: il retry ha creato duplicati (${rowsAfterFirstRun.length} -> ${rowsAfterRetry.length})`
        );
      }

      const sendResult = getEmailService().sendPattern(CONF_MAIL_PIANI);
      if (sendResult.sent === 0 || sendResult.errors.length > 0) {
        throw new ValidationError(`Invio piani fallito: ${emailDiagnostics(sendResult)}`);
      }
      const planEmailsByLogicalTarget = new Map<string, string>();
      const planMailRows = db
        .table(TABLE.LOG_MAIL)
        .findAll()
        .filter((row) => row[COL_LOG_MAIL.PATTERN] === CONF_MAIL_PIANI);
      for (const row of planMailRows) {
        const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
          logicalTargetId?: unknown;
        };
        const logicalTargetId = allegati.logicalTargetId;
        if (typeof logicalTargetId !== 'string' || logicalTargetId.trim() === '') {
          throw new ValidationError('Invio piani: LOG_MAIL.ALLEGATI.logicalTargetId mancante');
        }
        const text = String(row[COL_LOG_MAIL.TESTO] ?? '');
        planEmailsByLogicalTarget.set(
          logicalTargetId,
          `${planEmailsByLogicalTarget.get(logicalTargetId) ?? ''}\n${text}`
        );
      }
      const emailText = Array.from(planEmailsByLogicalTarget.values())
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
      const partnerPlan = rowsAfterFirstRun.find(
        (row) =>
          row[COL_LOG_DOCS.UTENTI] === PDP_BES_3C &&
          row[COL_LOG_DOCS.SOTTOTIPO] === TipoPiano.PDP_BES
      );
      const partnerPlanName = String(partnerPlan?.[COL_LOG_DOCS.NOME] ?? '').trim();
      const scientificoEmail = planEmailsByLogicalTarget.get(`docente:${e2eDocenteEmail(3)}`) ?? '';
      const classicoEmail = planEmailsByLogicalTarget.get(`docente:${e2eDocenteEmail(4)}`) ?? '';
      if (partnerPlanName === '' || !scientificoEmail.includes(partnerPlanName)) {
        throw new ValidationError(
          "Invio piani: il piano PDP_BES della classe articolata 3C-S non è presente nell'email del coordinatore scientifico"
        );
      }
      if (classicoEmail.includes(partnerPlanName)) {
        throw new ValidationError(
          "Invio piani: il piano PDP_BES della classe articolata 3C-S è presente nell'email del coordinatore classico"
        );
      }
      const correctHistory = [
        "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026",
        "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026"
      ];
      const crossedHistory = [
        "PEI — Ricci Martina: E2E_Piano_PEI_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PDP_BES_2025_2026",
        "PDP (BES) — Ricci Martina: E2E_Piano_PDP (BES)_Ricci Martina Disponibile anche il piano dell'anno precedente: E2E_Piano_PEI_2025_2026"
      ];
      if (
        correctHistory.some((fragment) => !emailText.includes(fragment)) ||
        crossedHistory.some((fragment) => emailText.includes(fragment))
      ) {
        throw new ValidationError(
          'Invio piani: lo storico deve essere associato solo al SOTTOTIPO corrispondente'
        );
      }
      const notifiedDualRows = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter(
          (row) =>
            row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI &&
            row[COL_LOG_DOCS.UTENTI] === PIANO_DOPPIO_STUDENTE
        );
      if (
        notifiedDualRows.length !== 2 ||
        notifiedDualRows.some((row) => String(row[COL_LOG_DOCS.NOTIFICATO] ?? '').trim() === '')
      ) {
        throw new ValidationError(
          'Invio piani: entrambi i sottotipi del piano doppio devono risultare notificati'
        );
      }
    }
  );

  // Every entry-point class needs both doc types (ALL_CLASSI_E2E doc comment):
  // each of the 3 coordinatori and each of the 4 CdC gets its own email
  // (scenari 4/5), so a class missing a doc gets an email with an empty box.
  runner.add(
    'E2E scenario 1: genera verbale consiglio di classe (tutte le classi)',
    sample.sampleSpreadsheetUrl,
    () => {
      for (const classe of ALL_CLASSI_E2E) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_VERBALE
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione verbale per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
      }
      assertPersistedLinks(CONF_DOC_VERBALE, 'Verbale');
      assertVerbaleRegistrationMetadata();
      assertPianiVerbalizzati();
    }
  );

  runner.add(
    'E2E scenario 2: genera foglio valutazione condotta (tutte le classi)',
    sample.sampleSpreadsheetUrl,
    () => {
      for (const classe of ALL_CLASSI_E2E) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_CONDOTTA
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione foglio condotta per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
      }
      assertPersistedLinks(CONF_DOC_CONDOTTA, 'Condotta');
    }
  );

  runner.add(
    'E2E scenario 8: genera riepilogo classe (tutte le classi)',
    sample.sampleSpreadsheetUrl,
    () => {
      for (const classe of ALL_CLASSI_E2E) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_RIEPILOGO
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione riepilogo per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
      }
      const rows = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_RIEPILOGO);
      if (rows.length !== ALL_CLASSI_E2E.length) {
        throw new ValidationError(
          `Riepilogo: attese ${ALL_CLASSI_E2E.length} righe LOG_DOCS, ricevute ${rows.length}`
        );
      }
      assertPersistedLinks(CONF_DOC_RIEPILOGO, 'Riepilogo');
    }
  );

  runner.add(
    'E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)',
    sample.sampleSpreadsheetUrl,
    () => {
      const importService = container.get<ImportService>('importService');
      const result = importService.executeImport(CONF_IMP_ASL);
      if (result.errori.length > 0) {
        throw new ValidationError(`Import ASL fallito: ${result.errori.join('; ')}`);
      }
      if (result.inseriti + result.aggiornati === 0) {
        throw new ValidationError('Import ASL: nessuna riga inserita o aggiornata');
      }
      const expected: Record<string, number> = {
        'e2ealunno43@onlinetest.aldo.local': 40,
        'e2ealunno44@onlinetest.aldo.local': 55,
        'e2ealunno51@onlinetest.aldo.local': 60,
        'e2ealunno52@onlinetest.aldo.local': 35
      };
      const rows = db.table(TABLE.ASL).findAll();
      for (const [studente, ore] of Object.entries(expected)) {
        const row = rows.find((r) => r[COL_ASL.STUDENTE] === studente);
        if (row === undefined) {
          throw new ValidationError(`Import ASL: riga mancante per ${studente}`);
        }
        if (Number(row[COL_ASL.ORE]) !== ore) {
          throw new ValidationError(
            `Import ASL: ${studente} atteso ORE=${ore}, ricevuto ${String(row[COL_ASL.ORE])}`
          );
        }
      }
    }
  );

  runner.add(
    'E2E scenario 10: genera documento complesso (placeholder loops/filtri, tutte le classi)',
    sample.sampleSpreadsheetUrl,
    () => {
      const drive = container.get<IDriveFacade>('drive');
      for (const classe of ALL_CLASSI_E2E) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_COMPLESSO
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione documento complesso per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
        const text = drive.getFileText(fileId);
        if (/\{\{[^}]*\}\}/.test(text)) {
          throw new ValidationError(
            `Documento complesso per ${classe}: placeholder non risolto trovato nel testo generato`
          );
        }
        if (classe === '1A') {
          for (const expected of ['LAB: GRUPPO_A (', 'INTERPRET: CHITARRA (']) {
            if (!text.includes(expected)) {
              throw new ValidationError(
                `Documento complesso per 1A: specificita renderizzata mancante "${expected}"`
              );
            }
          }
          if (text.includes('{{#focus.classe.studenti.perSpecificita}}')) {
            throw new ValidationError(
              'Documento complesso per 1A: loop perSpecificita non risolto nel testo generato'
            );
          }
        }
      }
      assertPersistedLinks(CONF_DOC_COMPLESSO, 'Documento complesso');
    }
  );

  runner.add(
    'E2E scenario 10b: genera documento complesso classe articolata (3C)',
    sample.sampleSpreadsheetUrl,
    () => {
      const drive = container.get<IDriveFacade>('drive');
      // PersonVM.nomeCompleto/appellativoCompleto are nome-first ("${nome} ${cognome}", 02 §8.1)
      // — not the DOCENTI-cognome-first convention `Docente.getNomeCompleto()` uses elsewhere —
      // so the expected substrings below match `{{appellativoCompleto}}` in
      // E2eTemplateProvisioner's DOC_ARTICOLATA_PARAGRAPHS coordinatori bullet.
      for (const [gruppo, coordinatore] of [
        [CLASSE_C, 'Alessandro Verdi'],
        [CLASSE_C_PARTNER, 'Paolo Fontana']
      ] as const) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(gruppo),
          CONF_DOC_ARTICOLATA
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione documento complesso classe articolata per ${gruppo} non ha prodotto un fileId (status=${status})`
          );
        }
        const text = drive.getFileText(fileId);
        if (/\{\{[^}]*\}\}/.test(text)) {
          throw new ValidationError(
            `Documento complesso classe articolata per ${gruppo}: placeholder non risolto trovato nel testo generato`
          );
        }
        if (!text.includes(coordinatore)) {
          throw new ValidationError(
            `Documento complesso classe articolata: coordinatore di ${gruppo} (${coordinatore}) assente dal testo`
          );
        }
      }
      const logRows = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_ARTICOLATA);
      assertArticolata3CResults(
        'Documento complesso classe articolata',
        logRows.map((row) => String(row[COL_LOG_DOCS.CLASSI] ?? ''))
      );
      for (const gruppo of [CLASSE_C, CLASSE_C_PARTNER]) {
        const logRow = logRows.find((row) => row[COL_LOG_DOCS.CLASSI] === gruppo);
        if (logRow === undefined || String(logRow[COL_LOG_DOCS.LINK] ?? '').trim() === '') {
          throw new ValidationError(
            `Documento complesso classe articolata per ${gruppo} non ha un LOG_DOCS.LINK persistito`
          );
        }
      }
    }
  );

  runner.add(
    'E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA',
    sample.sampleSpreadsheetUrl,
    () => {
      const drive = container.get<IDriveFacade>('drive');
      // ARTICOLATA scope: every class except an articulation parent (whose
      // partners generate the document instead). Must track the full class
      // roster, not the legacy 3-class ALL_CLASSI_E2E, or LOG_DOCS ends up
      // short of the rows the dedicated articolazione check expects.
      const targets = ALL_CLASSI.filter((classe) => classe !== CLASSE_C_PARENT && classe !== '5B');
      for (const classe of targets) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_RIEPILOGO_FIRME_CDC
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione riepilogo firme CDC per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
        const text = drive.getFileText(fileId);
        if (
          !text.includes(`Riepilogo firme del Consiglio di Classe ${classe}`) ||
          !text.includes('Matematica') ||
          /\{\{[^}]*\}\}/.test(text)
        ) {
          throw new ValidationError(
            `Riepilogo firme CDC per ${classe} non contiene il consiglio renderizzato atteso`
          );
        }
      }

      const rows = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_RIEPILOGO_FIRME_CDC);
      const persistedTargets = rows.map((row) => String(row[COL_LOG_DOCS.CLASSI] ?? '')).sort();
      if (JSON.stringify(persistedTargets) !== JSON.stringify([...targets].sort())) {
        throw new ValidationError(
          `Riepilogo firme CDC: target LOG_DOCS attesi ${targets.join(', ')}, ricevuti ${persistedTargets.join(', ')}`
        );
      }
      for (const row of rows) {
        if (
          typeof row[COL_LOG_DOCS.ID] !== 'string' ||
          String(row[COL_LOG_DOCS.ID]).trim() === '' ||
          row[COL_LOG_DOCS.TIPO] !== 'RIEPILOGO_FIRME_CDC' ||
          String(row[COL_LOG_DOCS.NOME] ?? '').trim() === '' ||
          String(row[COL_LOG_DOCS.LINK] ?? '').trim() === ''
        ) {
          throw new ValidationError('Riepilogo firme CDC: metadata LOG_DOCS incompleti');
        }
      }
    }
  );

  runner.add(
    'E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)',
    sample.sampleSpreadsheetUrl,
    () => {
      const spreadsheets = container.get<SpreadsheetService>('spreadsheets');
      return verifyProtectedRangeScenario(documents, spreadsheets, sample.testMode);
    }
  );

  runner.add(
    'E2E prerequisite: genera piano di lavoro per gli invii ai coordinatori',
    sample.sampleSpreadsheetUrl,
    () => {
      for (const classe of ALL_CLASSI_E2E) {
        const { fileId, status } = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_PIANO_LAVORO
        );
        if (fileId === null) {
          throw new ValidationError(
            `Generazione piano di lavoro per ${classe} non ha prodotto un fileId (status=${status})`
          );
        }
      }
    }
  );

  runner.add(
    'E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)',
    sample.sampleSpreadsheetUrl,
    () => {
      const result = getEmailService().sendPattern(CONF_MAIL_LAVORO);
      if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
        throw new ValidationError(`Invio piano di lavoro fallito: ${emailDiagnostics(result)}`);
      }
      const logRows = db
        .table(TABLE.LOG_MAIL)
        .findAll()
        .filter((row) => row[COL_LOG_MAIL.PATTERN] === CONF_MAIL_LAVORO);
      if (logRows.length === 0) {
        throw new ValidationError('Invio piano di lavoro: nessuna riga LOG_MAIL registrata');
      }
      for (const row of logRows) {
        const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
          docs?: string[];
          folders?: string[];
          attach?: string[];
        };
        if ((allegati.docs ?? []).length === 0) {
          throw new ValidationError(
            'LOG_MAIL.ALLEGATI.docs è vuoto: il piano di lavoro non è stato allegato'
          );
        }
        if ((allegati.folders ?? []).length === 0) {
          throw new ValidationError(
            'LOG_MAIL.ALLEGATI.folders è vuoto: la cartella verbali non è stata registrata'
          );
        }
        if ((allegati.attach ?? []).length > 0) {
          throw new ValidationError(
            'LOG_MAIL.ALLEGATI.attach non è vuoto: il piano di lavoro deve essere collegato nel corpo, non inviato come allegato'
          );
        }
      }
    }
  );

  runner.add(
    'E2E scenario 13: invia allegato statico non rappresentato da box (TEST_MODE)',
    sample.sampleSpreadsheetUrl,
    () => {
      const result = getEmailService().sendPattern(CONF_MAIL_STATIC_ALLEGATO);
      if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
        throw new ValidationError(`Invio allegato statico fallito: ${emailDiagnostics(result)}`);
      }
      const logRows = db
        .table(TABLE.LOG_MAIL)
        .findAll()
        .filter((row) => row[COL_LOG_MAIL.PATTERN] === CONF_MAIL_STATIC_ALLEGATO);
      if (logRows.length === 0) {
        throw new ValidationError('Invio allegato statico: nessuna riga LOG_MAIL registrata');
      }
      const expectedUrl = `https://drive.google.com/open?id=${encodeURIComponent(
        sample.staticAttachmentFileId
      )}`;
      for (const row of logRows) {
        const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
          docs?: string[];
          folders?: string[];
          attach?: string[];
        };
        if ((allegati.docs ?? []).length > 0 || (allegati.folders ?? []).length > 0) {
          throw new ValidationError(
            'Invio allegato statico: docs/folders devono contenere soltanto link resi nel corpo'
          );
        }
        const attached = allegati.attach ?? [];
        if (attached.length !== 1 || attached[0] !== expectedUrl) {
          throw new ValidationError(
            `Invio allegato statico: LOG_MAIL.ALLEGATI.attach non contiene il link canonico ${expectedUrl}`
          );
        }
      }
    }
  );

  runner.add(
    'E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)',
    sample.sampleSpreadsheetUrl,
    () => {
      const emailService = getEmailService();
      const articolataClassi = emailService
        .enumerateTargets(emailService.getConfigurazione(CONF_MAIL_VERBALE))
        .flatMap((target) => target.classiCompetenza);
      assertArticolata3CResults('Invio verbale', articolataClassi);
      const result = emailService.sendPattern(CONF_MAIL_VERBALE);
      if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
        throw new ValidationError(`Invio verbale fallito: ${emailDiagnostics(result)}`);
      }
      assertNoAttachedFiles(CONF_MAIL_VERBALE, 'Invio verbale');
    }
  );

  runner.add(
    'E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)',
    sample.sampleSpreadsheetUrl,
    () => {
      const result = getEmailService().sendPattern(CONF_MAIL_CONDOTTA);
      if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
        throw new ValidationError(`Invio condotta fallito: ${emailDiagnostics(result)}`);
      }
      assertNoAttachedFiles(CONF_MAIL_CONDOTTA, 'Invio condotta');
    }
  );

  runner.add(
    'E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)',
    sample.sampleSpreadsheetUrl,
    () => {
      const result = getEmailService().sendPattern(CONF_MAIL_CARENZA);
      if (result.targets !== 2) {
        throw new ValidationError(`Invio carenza: attesi 2 target, ricevuti ${result.targets}`);
      }
      if (result.sent === 0) {
        throw new ValidationError('Invio carenza: 0 email inviate');
      }
    }
  );
}

export type E2eDocumentScenarioScope = 'standard' | 'articolati';
export type LegacyE2eScenarioScope = 'email' | 'import';

interface CapturedScenarioCheck {
  name: string;
  artifactUrl: string | undefined;
  callback: () => void | OnlineTestSkippedOutcome;
}

const STANDARD_DOCUMENT_SCENARIO_NAMES = new Set([
  'E2E scenario 3: piani personalizzati con modello condizionale, dedupe e storico per sottotipo',
  'E2E scenario 1: genera verbale consiglio di classe (tutte le classi)',
  'E2E scenario 2: genera foglio valutazione condotta (tutte le classi)',
  'E2E scenario 8: genera riepilogo classe (tutte le classi)',
  'E2E scenario 10: genera documento complesso (placeholder loops/filtri, tutte le classi)',
  'E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)',
  'E2E prerequisite: genera piano di lavoro per gli invii ai coordinatori'
]);

const ARTICOLATI_DOCUMENT_SCENARIO_NAMES = new Set([
  'E2E scenario 10b: genera documento complesso classe articolata (3C)',
  'E2E scenario 10c: genera riepiloghi firme CDC per classi ARTICOLATA'
]);

const EMAIL_SCENARIO_NAMES = new Set([
  'E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)',
  'E2E scenario 13: invia allegato statico non rappresentato da box (TEST_MODE)',
  'E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)',
  'E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)',
  'E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)'
]);

const IMPORT_SCENARIO_NAMES = new Set([
  'E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)'
]);

function captureExistingScenarioChecks(
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean }
): CapturedScenarioCheck[] {
  const captured: CapturedScenarioCheck[] = [];
  const captureRunner = {
    add(
      name: string,
      artifactUrl: string | undefined,
      callback: () => void | OnlineTestSkippedOutcome
    ): void {
      captured.push({ name, artifactUrl, callback });
    }
  };
  registerE2eScenarioChecks(captureRunner as TestRunner, container, sample);
  return captured;
}

function replayNamedChecks(
  runner: TestRunner,
  checks: CapturedScenarioCheck[],
  allowed: Set<string>
): void {
  for (const check of checks) {
    if (allowed.has(check.name)) runner.add(check.name, check.artifactUrl, check.callback);
  }
}

/**
 * Replays the existing green document callbacks under a narrower scenario boundary.
 * The legacy registrar remains the source of truth until its unrelated mail/import
 * scenarios are migrated to their dedicated groups.
 */
export function registerE2eDocumentScenarioChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  scope: E2eDocumentScenarioScope
): void {
  const allowed =
    scope === 'standard' ? STANDARD_DOCUMENT_SCENARIO_NAMES : ARTICOLATI_DOCUMENT_SCENARIO_NAMES;
  replayNamedChecks(runner, captureExistingScenarioChecks(container, sample), allowed);
}

/** Replays legacy E2E checks into their actual transitional aggregate group. */
export function registerE2eLegacyScenarioChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  scope: LegacyE2eScenarioScope
): void {
  const allowed = scope === 'email' ? EMAIL_SCENARIO_NAMES : IMPORT_SCENARIO_NAMES;
  replayNamedChecks(runner, captureExistingScenarioChecks(container, sample), allowed);
}

function csvContains(raw: unknown, value: string): boolean {
  return (
    typeof raw === 'string' &&
    raw
      .split(',')
      .map((part) => part.trim())
      .includes(value)
  );
}
