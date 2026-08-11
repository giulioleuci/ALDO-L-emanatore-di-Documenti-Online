import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../report/OnlineTestReport';
import type { SampleDatabase } from '../SampleDatabaseBuilder';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailNotificationService } from '../../application/services/EmailNotificationService';
import type { EmailTarget } from '../../application/email/saluto';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  CLASSE_BASE,
  CONF_DOC_ID,
  CONF_MAIL_ID,
  ALUNNO_PARTNER_EMAIL
} from '../SampleDatabaseBuilder';

/**
 * Registers document/email pipeline checks (design spec §2 step 2.4) against
 * the seeded `CONF_DOC`/`CONF_MAIL` rows, calling the real single-item entry
 * points — `DocumentGenerationService.generateForClasse` and
 * `EmailNotificationService.sendToTarget` — the same services `Bootstrap.ts`'s
 * `avviaGenerazioneDataDriven`/`avviaInvioNotificheDataDriven` call into, minus
 * the JobRunnerLib batch/generator wrapping (15 §4) that would make a single
 * online-test run take multiple minutes.
 *
 * `testRecipientEmail` is the running user's own address
 * (`Session.getActiveUser().getEmail()`), obtained by the caller through
 * `GoogleApiWrapper` — this module never touches native GAS globals itself.
 * `EmailNotificationService.enableTestMode` (11 §15) redirects the seeded
 * CONF_MAIL send there instead of the seeded alunno's address, matching the
 * design spec's "sending to the running user's own email only" requirement.
 */
export function registerPipelineChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SampleDatabase,
  testRecipientEmail: string
): void {
  runner.add(
    'DocumentGenerationService.generateForClasse produces a Drive file for the seeded CONF_DOC',
    sample.sampleFolderUrl,
    () => {
      const service = container.get<DocumentGenerationService>('documentGenerationService');
      const result = service.generateForClasse(ClasseId.of(CLASSE_BASE), CONF_DOC_ID);
      if (result.fileId === null) {
        throw new ValidationError(
          `Atteso un fileId generato per CONF_DOC ${CONF_DOC_ID}, ricevuto null (status ${result.status})`
        );
      }
    }
  );

  runner.add(
    'EmailNotificationService.sendToTarget sends the seeded CONF_MAIL, subject-prefixed [ALDO ONLINE TEST]',
    sample.sampleSpreadsheetUrl,
    () => {
      const service = container.get<EmailNotificationService>('emailNotificationService');
      const conf = service.getConfigurazione(CONF_MAIL_ID);
      if (!conf.oggetto.startsWith('[ALDO ONLINE TEST]')) {
        throw new ValidationError(
          `Atteso CONF_MAIL.OGGETTO con prefisso "[ALDO ONLINE TEST]", ricevuto "${conf.oggetto}"`
        );
      }
      service.enableTestMode(testRecipientEmail);
      const target: EmailTarget = {
        tipo: 'alunno',
        tipoTarget: 'alunno',
        target: ALUNNO_PARTNER_EMAIL,
        emails: [ALUNNO_PARTNER_EMAIL],
        classiCompetenza: []
      };
      const outcome = service.sendToTarget(CONF_MAIL_ID, target);
      if (outcome.skipped) {
        throw new ValidationError(
          `Invio CONF_MAIL ${CONF_MAIL_ID} saltato (CONDIZIONE non soddisfatta?)`
        );
      }
      if (outcome.sent < 1) {
        throw new ValidationError(
          `Atteso almeno 1 invio per CONF_MAIL ${CONF_MAIL_ID}, ricevuto ${outcome.sent} (errori: ${outcome.errors.join(', ')})`
        );
      }
    }
  );
}
