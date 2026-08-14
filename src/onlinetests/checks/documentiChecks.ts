import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import { avviaGenerazioneDataDriven, creaJobRunner } from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_LOG_DOCS, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { TipoPiano } from '../../domain/value-objects/enums';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import {
  CONF_DOC_COMPLESSO,
  CONF_DOC_PIANI,
  PDP_BES_3C,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';
import { CONF_DOC_DUPLICAZIONE_PERMESSA, CONF_DOC_TABELLE } from '../data/fixtures';
import {
  registerE2eDocumentScenarioChecks,
  type E2eDocumentScenarioScope
} from './e2eScenarioChecks';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

export type DocumentiCheckScope =
  E2eDocumentScenarioScope | 'tabelle-importate' | 'duplicazione' | 'all';

const AMPLE_DOCUMENT_GENERATION_BUDGET_MS = 5 * 60 * 1000;

/** JobRunnerLib control surface used to clear leftover state before a fixed-name job run. */
interface JobRunnerControl extends JobRunnerService {
  resetJob(jobName: string): unknown;
}

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
  if (!sample.testMode) {
    runner.add('E2E scenarios: MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        'E2E scenario checks refuse to run: sample MASTER.TEST_MODE is not true (would risk sending real emails).'
      );
    });
    return;
  }

  if (scope === 'duplicazione' || scope === 'all') {
    registerDuplicazioneDocumentiChecks(runner, container, sample);
  }

  const scopes: E2eDocumentScenarioScope[] =
    scope === 'all'
      ? ['standard', 'articolati']
      : scope === 'tabelle-importate' || scope === 'duplicazione'
        ? []
        : [scope];
  for (const documentScope of scopes) {
    registerE2eDocumentScenarioChecks(runner, container, sample, documentScope);
  }
  if (scope === 'tabelle-importate' || scope === 'all') {
    registerTabelleImportateCheck(runner, container, sample);
  }
  if (!scopes.includes('standard')) return;

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
        'Alunno',
        'Email',
        'e2ealunno1@onlinetest.aldo.local',
        'https://www.example.com/aldo-e2e'
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

function registerTabelleImportateCheck(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean }
): void {
  runner.add(
    groupName('documenti.tabelleImportate', 'generazione e contenuto'),
    sample.sampleSpreadsheetUrl,
    () => {
      const db = container.get<EmailDb>('db');
      const drive = container.get<IDriveFacade>('drive');
      const rowsForClass = (): Record<string, unknown>[] =>
        db
          .table(TABLE.LOG_DOCS)
          .findAll()
          .filter(
            (row) =>
              row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_TABELLE && row[COL_LOG_DOCS.CLASSI] === '1A'
          );

      // Fixed job name reused across every online-test run: a run killed by the
      // GAS execution limit leaves `job` = RUNNING with a fresh `lock_timestamp`
      // in ScriptProperties, and JobStateManager.tryAcquireRunning then refuses
      // for a full hour — JobQueue.execute returns null (logged as SUSPENDED) and
      // nothing is generated. Same guard registerJobRunnerDocGenChecks uses.
      const jobRunner = creaJobRunner() as JobRunnerControl;
      jobRunner.resetJob(`gen_${CONF_DOC_TABELLE}`);

      avviaGenerazioneDataDriven(
        container,
        CONF_DOC_TABELLE,
        jobRunner,
        AMPLE_DOCUMENT_GENERATION_BUDGET_MS
      );

      const firstRunRows = rowsForClass();
      if (firstRunRows.length !== 1) {
        throw new ValidationError(
          `Tabelle importate: attesa una riga LOG_DOCS per 1A, ricevute ${firstRunRows.length}`
        );
      }
      const persisted = firstRunRows[0]!;
      const fileId = nonBlankString(persisted[COL_LOG_DOCS.ID]);
      const link = nonBlankString(persisted[COL_LOG_DOCS.LINK]);
      if (
        fileId === '' ||
        link === '' ||
        persisted[COL_LOG_DOCS.TIPO] !== 'E2E_TABELLE' ||
        persisted[COL_LOG_DOCS.CLASSI] !== '1A'
      ) {
        throw new ValidationError(
          'Tabelle importate: LOG_DOCS privo di ID, link, classe o tipo attesi'
        );
      }

      const text = drive.getFileText(fileId);
      const expectedFragments = [
        'Tabelle importate per la classe 1A',
        'Nome',
        'Valore',
        'Prima riga',
        'Seconda riga',
        'Testo dopo la tabella con dati',
        'Testo dopo la tabella vuota'
      ];
      const missingFragments = expectedFragments.filter((fragment) => !text.includes(fragment));
      if (missingFragments.length > 0) {
        new LoggerService().warn(
          `Tabelle importate: frammenti mancanti nel documento ${fileId}: ${missingFragments.join(', ')}`
        );
        throw new ValidationError(
          'Tabelle importate: contenuto CDU o righe della sorgente dati mancanti nel documento'
        );
      }
      if (
        /\{\{TABELLA:[^}]+\}\}/.test(text) ||
        /\{\{[^}]*\}\}/.test(text) ||
        countOccurrences(text, 'Nome') !== 1 ||
        countOccurrences(text, 'Valore') !== 1
      ) {
        throw new ValidationError(
          'Tabelle importate: marker irrisolto, Mustache residuo o tabella da sorgente solo-intestazione presente'
        );
      }

      // No reset here on purpose: the first run left the job COMPLETED, and this
      // second launch must prove DUPLICAZIONE=NEGATA dedupes, not restart state.
      avviaGenerazioneDataDriven(
        container,
        CONF_DOC_TABELLE,
        jobRunner,
        AMPLE_DOCUMENT_GENERATION_BUDGET_MS
      );
      if (rowsForClass().length !== firstRunRows.length) {
        throw new ValidationError(
          'Tabelle importate: DUPLICAZIONE=NEGATA ha creato una riga LOG_DOCS duplicata'
        );
      }
    }
  );
}

function registerDuplicazioneDocumentiChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase & { testMode: boolean }
): void {
  const documents = container.get<DocumentGenerationService>('documentGenerationService');
  const db = container.get<EmailDb>('db');
  const drive = container.get<IDriveFacade>('drive');
  const student = PDP_BES_3C;
  const piano = TipoPiano.PDP_BES;

  runner.add(
    groupName('documenti.duplicazione', 'NEGATA non duplica su Drive'),
    sample.sampleSpreadsheetUrl,
    () => {
      const path = '_ALDO_E2E_OUTPUT/DOCUMENTI PERS';
      const folderId = drive.createFolder(path);
      const filesBefore = drive.countFilesInFolder(folderId);
      const rowsBefore = logRowsFor(db, CONF_DOC_PIANI, student);
      const idsBefore = logIds(rowsBefore);

      const first = documents.generateForPiano(student, piano, CONF_DOC_PIANI);
      const filesAfterFirst = drive.countFilesInFolder(folderId);
      const rowsAfterFirst = logRowsFor(db, CONF_DOC_PIANI, student);
      const firstRunRows = rowsAddedAfter(rowsAfterFirst, idsBefore);
      const idsAfterFirst = logIds(rowsAfterFirst);

      const retry = documents.generateForPiano(student, piano, CONF_DOC_PIANI);
      const filesAfterRetry = drive.countFilesInFolder(folderId);
      const rowsAfterRetry = logRowsFor(db, CONF_DOC_PIANI, student);
      const retryRows = rowsAddedAfter(rowsAfterRetry, idsAfterFirst);
      const firstRunGenerated = first.fileId !== null;
      const expectedFirstRunDelta = firstRunGenerated ? 1 : 0;
      if (
        (firstRunGenerated &&
          (filesAfterFirst - filesBefore !== 1 ||
            firstRunRows.length !== 1 ||
            firstRunRows[0]?.[COL_LOG_DOCS.ID] !== first.fileId)) ||
        (!firstRunGenerated &&
          (first.status !== 'SKIPPED' ||
            filesAfterFirst !== filesBefore ||
            firstRunRows.length !== 0)) ||
        retry.status !== 'SKIPPED' ||
        retry.fileId !== null ||
        filesAfterRetry !== filesAfterFirst ||
        retryRows.length !== 0
      ) {
        throw new ValidationError(
          `DUPLICAZIONE=NEGATA: atteso delta ${expectedFirstRunDelta} al primo tentativo e retry SKIPPED senza nuovi file/LOG_DOCS; ricevuti file ${filesBefore}->${filesAfterFirst}->${filesAfterRetry}, righe nuove ${firstRunRows.length}->${retryRows.length}`
        );
      }
    }
  );

  runner.add(
    groupName('documenti.duplicazione', 'PERMESSA crea copie distinte'),
    sample.sampleSpreadsheetUrl,
    () => {
      const path = '_ALDO_E2E_OUTPUT/DUPLICAZIONE_DOCUMENTI';
      const folderId = drive.createFolder(path);
      const filesBefore = drive.countFilesInFolder(folderId);
      const rowsBefore = logRowsFor(db, CONF_DOC_DUPLICAZIONE_PERMESSA, student);
      const idsBefore = logIds(rowsBefore);

      const first = documents.generateForPiano(student, piano, CONF_DOC_DUPLICAZIONE_PERMESSA);
      const second = documents.generateForPiano(student, piano, CONF_DOC_DUPLICAZIONE_PERMESSA);
      const rowsAfter = logRowsFor(db, CONF_DOC_DUPLICAZIONE_PERMESSA, student);
      const runRows = rowsAddedAfter(rowsAfter, idsBefore);
      const ids = runRows.map((row) => nonBlankString(row[COL_LOG_DOCS.ID]));
      const rawNames = runRows.map((row) => row[COL_LOG_DOCS.NOME]);
      const filesAfter = drive.countFilesInFolder(folderId);

      if (
        first.fileId === null ||
        second.fileId === null ||
        filesAfter - filesBefore !== 2 ||
        runRows.length !== 2 ||
        new Set(ids).size !== 2 ||
        !ids.includes(first.fileId) ||
        !ids.includes(second.fileId) ||
        rawNames.some(
          (name) =>
            typeof name !== 'string' ||
            name.trim() === '' ||
            name !== name.trim() ||
            /\{\{[^}]*\}\}/.test(name)
        )
      ) {
        throw new ValidationError(
          `DUPLICAZIONE=PERMESSA: attesi 2 file distinti e 2 righe LOG_DOCS normalizzate nel run, ricevuti file ${filesBefore}->${filesAfter}, righe nuove=${runRows.length}`
        );
      }
    }
  );
}

function logRowsFor(db: EmailDb, idGen: string, student: string): Record<string, unknown>[] {
  return db
    .table(TABLE.LOG_DOCS)
    .findAll()
    .filter(
      (row) =>
        row[COL_LOG_DOCS.ID_GEN] === idGen && String(row[COL_LOG_DOCS.UTENTI] ?? '') === student
    );
}

function logIds(rows: Record<string, unknown>[]): Set<string> {
  return new Set(rows.map((row) => nonBlankString(row[COL_LOG_DOCS.ID])));
}

function rowsAddedAfter(
  rows: Record<string, unknown>[],
  idsBefore: Set<string>
): Record<string, unknown>[] {
  return rows.filter((row) => !idsBefore.has(nonBlankString(row[COL_LOG_DOCS.ID])));
}

function countOccurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
