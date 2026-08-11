import { avviaImportazioneDataDriven } from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_ASL, TABLE } from '../../config/schema';
import { ConfigurationError, ValidationError } from '../../domain/errors/DomainError';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import { CONF_IMP_ASL } from '../data/SharedTestDatabaseBuilder';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import {
  CONF_IMP_BAD_STRATEGY,
  CONF_IMP_DISABLED,
  CONF_IMP_IGNORE,
  CONF_IMP_MISSING_FILE,
  CONF_IMP_MISSING_FOLDER,
  CONF_IMP_MISSING_IDGEN,
  CONF_IMP_NOHEADER,
  CONF_IMP_TIMESTAMP
} from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

type ImportSample = SharedTestDatabase & { testMode: boolean };
type AslRow = Record<string, unknown>;
export type ImportCheckScope = 'all' | 'file-singolo' | 'policy';

function assertSuccessful(result: { errori: string[] }, label: string): void {
  if (result.errori.length > 0) {
    throw new ValidationError(`${label}: import fallito: ${result.errori.join('; ')}`);
  }
}

function findAslRow(rows: AslRow[], studente: string, label: string): AslRow {
  const row = rows.find((candidate) => candidate[COL_ASL.STUDENTE] === studente);
  if (row === undefined) throw new ValidationError(`${label}: riga ASL mancante per ${studente}`);
  return row;
}

function assertOre(row: AslRow, expected: number, label: string): void {
  if (Number(row[COL_ASL.ORE]) !== expected) {
    throw new ValidationError(
      `${label}: atteso ORE=${expected}, ricevuto ${String(row[COL_ASL.ORE])}`
    );
  }
}

/**
 * Live acceptance checks for the existing FILE_SINGOLO bridge. Every recipe keeps the
 * importer-supported single STUDENTE conflict key; no ALDO-specific composite key exists.
 */
export function registerImportChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample,
  scope: ImportCheckScope = 'all'
): void {
  const db = container.get<EmailDb>('db');
  const readAsl = (): AslRow[] => db.table(TABLE.ASL).findAll();

  if (scope !== 'policy')
    runner.add(
      groupName('import.fileSingolo', 'OVERWRITE, intestazioni e riga ghost'),
      sample.sampleSpreadsheetUrl,
      () => {
        const result = avviaImportazioneDataDriven(container, CONF_IMP_ASL);
        assertSuccessful(result, 'FILE_SINGOLO');
        if (result.inseriti + result.aggiornati === 0) {
          throw new ValidationError('FILE_SINGOLO: nessuna riga inserita o aggiornata');
        }
        if (result.ghost !== 1) {
          throw new ValidationError(
            `FILE_SINGOLO: attesa una riga ghost, ricevute ${result.ghost}`
          );
        }
        assertOre(
          findAslRow(readAsl(), 'e2ealunno43@onlinetest.aldo.local', 'FILE_SINGOLO'),
          40,
          'FILE_SINGOLO'
        );
      }
    );

  if (scope !== 'file-singolo')
    runner.add(
      groupName('import.policy', 'IGNORE conserva la riga in conflitto'),
      sample.sampleSpreadsheetUrl,
      () => {
        const before = findAslRow(readAsl(), 'e2ealunno43@onlinetest.aldo.local', 'IGNORE');
        assertOre(before, 40, 'IGNORE prima dell import');
        const result = avviaImportazioneDataDriven(container, CONF_IMP_IGNORE);
        assertSuccessful(result, 'IGNORE');
        if (result.saltati !== 1) {
          throw new ValidationError(`IGNORE: attesa una riga saltata, ricevute ${result.saltati}`);
        }
        assertOre(
          findAslRow(readAsl(), 'e2ealunno43@onlinetest.aldo.local', 'IGNORE'),
          40,
          'IGNORE conserva il target'
        );
      }
    );

  if (scope !== 'file-singolo')
    runner.add(
      groupName('import.policy', 'TIMESTAMP degrada a OVERWRITE senza colonna target'),
      sample.sampleSpreadsheetUrl,
      () => {
        if (readAsl().some((row) => Object.prototype.hasOwnProperty.call(row, 'DATA_MODIFICA'))) {
          throw new ValidationError(
            'TIMESTAMP: ASL non deve avere una colonna DATA_MODIFICA nel fixture'
          );
        }
        const result = avviaImportazioneDataDriven(container, CONF_IMP_TIMESTAMP);
        assertSuccessful(result, 'TIMESTAMP');
        if (result.inseriti + result.aggiornati !== 1) {
          throw new ValidationError(
            `TIMESTAMP: attesa una riga dal fallback OVERWRITE, ricevute inseriti=${result.inseriti}, aggiornati=${result.aggiornati}`
          );
        }
        assertOre(
          findAslRow(readAsl(), 'e2ealunno43@onlinetest.aldo.local', 'TIMESTAMP'),
          999,
          'TIMESTAMP fallback OVERWRITE'
        );
      }
    );

  if (scope !== 'policy')
    runner.add(
      groupName('import.fileSingolo', 'range, tab e mapping senza intestazioni'),
      sample.sampleSpreadsheetUrl,
      () => {
        const result = avviaImportazioneDataDriven(container, CONF_IMP_NOHEADER);
        assertSuccessful(result, 'FILE_SINGOLO senza intestazioni');
        assertOre(
          findAslRow(
            readAsl(),
            'e2ealunno52@onlinetest.aldo.local',
            'FILE_SINGOLO senza intestazioni'
          ),
          77,
          'FILE_SINGOLO senza intestazioni'
        );
      }
    );

  if (scope !== 'file-singolo')
    runner.add(
      groupName('import.policy', 'ATTIVO=false salta prima di leggere la sorgente'),
      sample.sampleSpreadsheetUrl,
      () => {
        const before = JSON.stringify(readAsl());
        const result = avviaImportazioneDataDriven(container, CONF_IMP_DISABLED);
        if (result.errori.join() !== 'skipped: ATTIVO=false') {
          throw new ValidationError(
            `ATTIVO=false: esito skipped atteso, ricevuto ${result.errori.join('; ') || 'nessun errore'}`
          );
        }
        if (JSON.stringify(readAsl()) !== before) {
          throw new ValidationError('ATTIVO=false: il target è stato mutato nonostante lo skip');
        }
      }
    );

  if (scope !== 'file-singolo')
    runner.add(
      groupName('import.policy', 'misconfig fallisce prima di mutare il target'),
      sample.sampleSpreadsheetUrl,
      () => {
        for (const configId of [
          CONF_IMP_MISSING_FILE,
          CONF_IMP_MISSING_FOLDER,
          CONF_IMP_MISSING_IDGEN,
          CONF_IMP_BAD_STRATEGY
        ]) {
          const before = JSON.stringify(readAsl());
          try {
            avviaImportazioneDataDriven(container, configId);
            throw new ValidationError(`${configId}: attesa ConfigurationError`);
          } catch (error) {
            if (!(error instanceof ConfigurationError)) throw error;
          }
          if (JSON.stringify(readAsl()) !== before) {
            throw new ValidationError(`${configId}: target mutato prima del ConfigurationError`);
          }
        }
      }
    );
}

export function registerImportFileSingoloChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample
): void {
  registerImportChecks(runner, container, sample, 'file-singolo');
}

export function registerImportPolicyChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample
): void {
  registerImportChecks(runner, container, sample, 'policy');
}
