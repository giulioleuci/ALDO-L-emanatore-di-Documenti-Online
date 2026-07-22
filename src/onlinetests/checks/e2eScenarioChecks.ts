import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { EmailNotificationService } from '../../application/services/EmailNotificationService';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import {
  CLASSE_A,
  CLASSE_B,
  TIPI_PIANO,
  CONF_DOC_VERBALE,
  CONF_DOC_CONDOTTA,
  confDocPiano,
  CONF_MAIL_VERBALE,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_CARENZA,
  CONF_MAIL_PIANI,
  CARENZA_ALUNNO_1,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';

/**
 * Registers the 7 e2e scenario checks (design spec `2026-07-21-testonline-mock-db-e2e-design.md`).
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
  const email = container.get<EmailNotificationService>('emailNotificationService');

  runner.add('E2E scenario 1: genera verbale consiglio di classe', sample.sampleSpreadsheetUrl, () => {
    const { fileId, status } = documents.generateForClasse(ClasseId.of(CLASSE_A), CONF_DOC_VERBALE);
    if (fileId === null) {
      throw new ValidationError(`Generazione verbale non ha prodotto un fileId (status=${status})`);
    }
  });

  runner.add('E2E scenario 2: genera foglio valutazione condotta', sample.sampleSpreadsheetUrl, () => {
    const { fileId, status } = documents.generateForClasse(ClasseId.of(CLASSE_B), CONF_DOC_CONDOTTA);
    if (fileId === null) {
      throw new ValidationError(`Generazione foglio condotta non ha prodotto un fileId (status=${status})`);
    }
  });

  runner.add('E2E scenario 3: genera i 5 piani personalizzati', sample.sampleSpreadsheetUrl, () => {
    for (const tipo of TIPI_PIANO) {
      const { fileId, status } = documents.generateForAlunno(CARENZA_ALUNNO_1, confDocPiano(tipo));
      if (fileId === null) {
        throw new ValidationError(`Generazione piano ${tipo} non ha prodotto un fileId (status=${status})`);
      }
    }
  });

  runner.add('E2E scenario 4: invia verbale ai coordinatori (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_VERBALE);
    if (result.sent === 0) {
      throw new ValidationError(`Invio verbale: 0 email inviate (targets=${result.targets})`);
    }
    if (result.errors.length > 0) {
      throw new ValidationError(`Invio verbale: errori ${result.errors.join('; ')}`);
    }
  });

  runner.add('E2E scenario 5: invia scheda condotta a tutto il CdC (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_CONDOTTA);
    if (result.sent === 0) {
      throw new ValidationError(`Invio condotta: 0 email inviate (targets=${result.targets})`);
    }
  });

  runner.add('E2E scenario 6: invia comunicazione carenza alle famiglie (TEST_MODE, 2 studenti)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_CARENZA);
    if (result.targets !== 2) {
      throw new ValidationError(`Invio carenza: attesi 2 target, ricevuti ${result.targets}`);
    }
    if (result.sent === 0) {
      throw new ValidationError('Invio carenza: 0 email inviate');
    }
  });

  runner.add('E2E scenario 7: invia piani personalizzati nuovi e già notificati (TEST_MODE)', sample.sampleSpreadsheetUrl, () => {
    const result = email.sendPattern(CONF_MAIL_PIANI);
    if (result.sent === 0) {
      throw new ValidationError(`Invio piani: 0 email inviate (targets=${result.targets})`);
    }
  });
}
