import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_LOG_DOCS, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import { CONF_DOC_COMPLESSO, type SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import {
  registerE2eDocumentScenarioChecks,
  type E2eDocumentScenarioScope
} from './e2eScenarioChecks';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

export type DocumentiCheckScope = E2eDocumentScenarioScope;

/**
 * Registers document-only checks by replaying the proven legacy callbacks, then
 * adds the cross-template rendering assertion that needs a real Drive artifact.
 */
export function registerDocumentiChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean },
  scope: DocumentiCheckScope = 'standard'
): void {
  registerE2eDocumentScenarioChecks(runner, container, sample, scope);
  if (scope !== 'standard' || !sample.testMode) return;

  runner.add(
    groupName('documenti.standard', 'template interop unicode, liste, tabelle e link'),
    sample.sampleSpreadsheetUrl,
    () => {
      const documents = container.get<DocumentGenerationService>('documentGenerationService');
      const db = container.get<EmailDb>('db');
      const drive = container.get<IDriveFacade>('drive');
      const generated = documents.generateForClasse(ClasseId.of('1A'), CONF_DOC_COMPLESSO);
      const persisted = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .find(
          (row) =>
            row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_COMPLESSO && row[COL_LOG_DOCS.CLASSI] === '1A'
        );
      const fileId = generated.fileId ?? String(persisted?.[COL_LOG_DOCS.ID] ?? '').trim();
      if (fileId === '') {
        throw new ValidationError(
          'Template interop: la generazione non ha prodotto né riutilizzato un documento per 1A'
        );
      }
      if (String(persisted?.[COL_LOG_DOCS.LINK] ?? '').trim() === '') {
        throw new ValidationError('Template interop: LOG_DOCS.LINK non è stato persistito');
      }

      const text = drive.getFileText(fileId);
      const expectedFragments = [
        'Report Complesso — 1A',
        'Coordinatori, ordinati per nome',
        'Rappresentanti degli studenti',
        'Specificità per materia',
        'e2ealunno'
      ];
      if (
        expectedFragments.some((fragment) => !text.includes(fragment)) ||
        /\{\{[^}]*\}\}/.test(text)
      ) {
        throw new ValidationError(
          'Template interop: unicode, liste, tabelle, condizionali o link non sono stati resi dal documento complesso'
        );
      }
    }
  );
}
