import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
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
import { TABLE, COL_LOG_DOCS, COL_ASL, COL_LOG_MAIL } from '../../config/schema';
import {
  ALL_CLASSI_E2E,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_COMPLESSO,
  CONF_DOC_SHEET_PERMESSI,
  CONF_DOC_PIANO_LAVORO,
  confDocPiano,
  CONF_IMP_ASL,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  CONF_MAIL_LAVORO,
  PIANO_STUDENTE,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';

function emailDiagnostics(result: SendPatternResult): string {
  return [
    `targets=${result.targets}`,
    `sent=${result.sent}`,
    `skipped=${result.skipped}`,
    `errors=${result.errors.length > 0 ? result.errors.join(' | ') : 'none'}`
  ].join(', ');
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
  sample: E2eSampleDatabase & { testMode: boolean }
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

  // Every entry-point class needs both doc types (ALL_CLASSI_E2E doc comment):
  // each of the 3 coordinatori and each of the 4 CdC gets its own email
  // (scenari 4/5), so a class missing a doc gets an email with an empty box.
  runner.add('E2E scenario 1: genera verbale consiglio di classe (tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_VERBALE);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione verbale per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    assertPersistedLinks(CONF_DOC_VERBALE, 'Verbale');
  });

  runner.add('E2E scenario 2: genera foglio valutazione condotta (tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_CONDOTTA);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione foglio condotta per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    assertPersistedLinks(CONF_DOC_CONDOTTA, 'Condotta');
  });

  runner.add('E2E scenario 8: genera riepilogo classe (tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_RIEPILOGO);
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
  });

  runner.add('E2E scenario 9: importa ore ASL/PCTO da sheet (3rd-year only)', sample.sampleSpreadsheetUrl, () => {
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
  });

  runner.add('E2E scenario 10: genera documento complesso (placeholder loops/filtri, tutte le classi)', sample.sampleSpreadsheetUrl, () => {
    const drive = container.get<IDriveFacade>('drive');
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_COMPLESSO);
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
    }
    assertPersistedLinks(CONF_DOC_COMPLESSO, 'Documento complesso');
  });

  runner.add('E2E scenario 11: verifica protezione colonne materie (SHEET_CON_MATERIE_E_PERMESSI)', sample.sampleSpreadsheetUrl, () => {
    const spreadsheets = container.get<SpreadsheetService>('spreadsheets');
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_SHEET_PERMESSI);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione sheet permessi per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
      const protections = spreadsheets.getProtectedRanges(fileId);
      if (protections.length === 0) {
        throw new ValidationError(`Sheet permessi per ${classe}: nessun range protetto trovato`);
      }
      for (const p of protections) {
        if ((p.editors.users ?? []).length === 0) {
          throw new ValidationError(
            `Sheet permessi per ${classe}: range protetto "${p.description}" senza editors`
          );
        }
      }
    }
  });

  runner.add('E2E scenario 12: invia piano di lavoro (file) + cartella verbali (folder) ai coordinatori (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_PIANO_LAVORO);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione piano di lavoro per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    for (const classe of ALL_CLASSI_E2E) {
      const { fileId, status } = documents.generateForClasse(ClasseId.of(classe), CONF_DOC_VERBALE);
      if (fileId === null) {
        throw new ValidationError(
          `Generazione verbale (per la cartella verbali) per ${classe} non ha prodotto un fileId (status=${status})`
        );
      }
    }
    const result = getEmailService().sendPattern(CONF_MAIL_LAVORO);
    if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
      throw new ValidationError(`Invio piano di lavoro fallito: ${emailDiagnostics(result)}`);
    }
    const logRows = db.table(TABLE.LOG_MAIL).findAll();
    if (logRows.length === 0) {
      throw new ValidationError('Invio piano di lavoro: nessuna riga LOG_MAIL registrata');
    }
    for (const row of logRows) {
      const allegati = JSON.parse(String(row[COL_LOG_MAIL.ALLEGATI] ?? '{}')) as {
        docs?: string[];
        folders?: string[];
      };
      if ((allegati.docs ?? []).length === 0) {
        throw new ValidationError('LOG_MAIL.ALLEGATI.docs è vuoto: il piano di lavoro non è stato allegato');
      }
      if ((allegati.folders ?? []).length === 0) {
        throw new ValidationError('LOG_MAIL.ALLEGATI.folders è vuoto: la cartella verbali non è stata registrata');
      }
    }
  });

  runner.add('E2E scenario 3: genera i piani personalizzati (5 tipi, PDP_BES anche per 3C)', sample.sampleSpreadsheetUrl, () => {
    for (const tipo of TIPI_PIANO) {
      for (const studente of PIANO_STUDENTE[tipo]) {
        const { fileId, status } = documents.generateForAlunno(studente, confDocPiano(tipo));
        if (fileId === null) {
          throw new ValidationError(
            `Generazione piano ${tipo} per ${studente} non ha prodotto un fileId (status=${status})`
          );
        }
      }
    }
  });

  runner.add('E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = getEmailService().sendPattern(CONF_MAIL_VERBALE);
    if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
      throw new ValidationError(`Invio verbale fallito: ${emailDiagnostics(result)}`);
    }
  });

  runner.add('E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = getEmailService().sendPattern(CONF_MAIL_CONDOTTA);
    if (result.sent === 0 || result.skipped > 0 || result.errors.length > 0) {
      throw new ValidationError(`Invio condotta fallito: ${emailDiagnostics(result)}`);
    }
  });

  runner.add('E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)', sample.sampleSpreadsheetUrl, () => {
    const result = getEmailService().sendPattern(CONF_MAIL_CARENZA);
    if (result.targets !== 2) {
      throw new ValidationError(`Invio carenza: attesi 2 target, ricevuti ${result.targets}`);
    }
    if (result.sent === 0) {
      throw new ValidationError('Invio carenza: 0 email inviate');
    }
  });

  runner.add('E2E scenario 7: invia piani personalizzati nuovi e già notificati (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = getEmailService().sendPattern(CONF_MAIL_PIANI);
    if (result.sent === 0) {
      throw new ValidationError(`Invio piani: 0 email inviate (targets=${result.targets})`);
    }
  });
}
