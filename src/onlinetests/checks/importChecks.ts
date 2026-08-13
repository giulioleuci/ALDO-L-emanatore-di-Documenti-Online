import { avviaImportazioneDataDriven } from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_ASL, COL_CARENZE, COL_CONF_IMP, COL_LOG_FOLD, TABLE } from '../../config/schema';
import { ConfigurationError, ValidationError } from '../../domain/errors/DomainError';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import { CONF_IMP_ASL } from '../data/SharedTestDatabaseBuilder';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import {
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_BAD_STRATEGY,
  CONF_IMP_DISABLED,
  CONF_IMP_IGNORE,
  CONF_IMP_MISSING_FILE,
  CONF_IMP_MISSING_FOLDER,
  CONF_IMP_MISSING_IDGEN,
  CONF_IMP_NOHEADER,
  CONF_IMP_TIMESTAMP,
  CONF_IMP_TIMESTAMP_FALLBACK
} from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

/** Literal seeded by `Seeders.ts#aslDataUpdates` for the unknown-student filler row. */
const STUDENTE_SCONOSCIUTO_CARTELLE = 'sconosciuto@onlinetest.aldo.local';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

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
  const readCarenze = (): AslRow[] => db.table(TABLE.CARENZE).findAll();

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
      groupName('import.policy', 'TIMESTAMP aggiorna solo il conflitto con sorgente più recente'),
      sample.sampleSpreadsheetUrl,
      () => {
        const result = avviaImportazioneDataDriven(container, CONF_IMP_TIMESTAMP);
        assertSuccessful(result, 'TIMESTAMP');
        if (result.aggiornati !== 1 || result.saltati !== 1) {
          throw new ValidationError(
            `TIMESTAMP: attesi aggiornati=1 e saltati=1, ricevuti aggiornati=${result.aggiornati}, saltati=${result.saltati}`
          );
        }
        const recent = findAslRow(
          readCarenze(),
          'e2ealunno1@onlinetest.aldo.local',
          'TIMESTAMP recente'
        );
        const older = findAslRow(
          readCarenze(),
          'e2ealunno21@onlinetest.aldo.local',
          'TIMESTAMP vecchia'
        );
        if (recent[COL_CARENZE.NOTE] !== 'Sorgente timestamp più recente') {
          throw new ValidationError(
            'TIMESTAMP: il record con sorgente più recente non è stato aggiornato'
          );
        }
        if (older[COL_CARENZE.NOTE] !== 'Carenza E2E di prova') {
          throw new ValidationError(
            'TIMESTAMP: il record con sorgente più vecchia non doveva essere aggiornato'
          );
        }
      }
    );

  if (scope !== 'file-singolo')
    runner.add(
      groupName('import.policy', 'TIMESTAMP degrada a OVERWRITE senza colonna target'),
      sample.sampleSpreadsheetUrl,
      () => {
        if (readAsl().some((row) => Object.prototype.hasOwnProperty.call(row, 'DATA_MODIFICA'))) {
          throw new ValidationError(
            'TIMESTAMP fallback: ASL non deve avere una colonna DATA_MODIFICA nel fixture'
          );
        }
        const result = avviaImportazioneDataDriven(container, CONF_IMP_TIMESTAMP_FALLBACK);
        assertSuccessful(result, 'TIMESTAMP fallback');
        if (result.inseriti + result.aggiornati !== 1) {
          throw new ValidationError(
            `TIMESTAMP fallback: attesa una riga dal fallback OVERWRITE, ricevute inseriti=${result.inseriti}, aggiornati=${result.aggiornati}`
          );
        }
        assertOre(
          findAslRow(readAsl(), 'e2ealunno43@onlinetest.aldo.local', 'TIMESTAMP fallback'),
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

/** Reads `CONF_IMP.CONFIG.folderTipo` for a CERCA_CARTELLE_CLASSE recipe from the live CONF_IMP table. */
function readCartelleClasseFolderTipo(
  confImpRows: AslRow[],
  configId: string,
  label: string
): string {
  const conf = confImpRows.find((row) => row[COL_CONF_IMP.ID] === configId);
  if (conf === undefined) {
    throw new ValidationError(`${label}: CONF_IMP ${configId} non trovato`);
  }
  let parsed: { folderTipo?: unknown };
  try {
    parsed = JSON.parse(String(conf[COL_CONF_IMP.CONFIG])) as { folderTipo?: unknown };
  } catch {
    throw new ValidationError(`${label}: CONFIG di ${configId} non è JSON valido`);
  }
  const folderTipo = parsed.folderTipo;
  if (typeof folderTipo !== 'string' || folderTipo === '') {
    throw new ValidationError(`${label}: CONFIG.folderTipo mancante per ${configId}`);
  }
  return folderTipo;
}

/** Derives the eligible-class list from live LOG_FOLD rows instead of duplicating the seeder's class list. */
function readEligibleClasses(logFoldRows: AslRow[], folderTipo: string, label: string): string[] {
  const classes = new Set<string>();
  for (const row of logFoldRows) {
    if (row[COL_LOG_FOLD.TIPO] !== folderTipo) continue;
    const classe = stringValue(row[COL_LOG_FOLD.CLASSI]).trim();
    if (classe !== '') classes.add(classe);
  }
  if (classes.size === 0) {
    throw new ValidationError(
      `${label}: nessuna cartella LOG_FOLD eleggibile per tipo ${folderTipo}`
    );
  }
  return [...classes];
}

/**
 * Validates one class's 3 seeded rows (ref `Seeders.ts#aslDataUpdates`): exactly one known
 * student with 2 consecutive-ORE rows, plus 1 `sconosciuto` row whose ORE follows them.
 * Returns the known student's email so the caller can check cross-class distinctness.
 */
function assertClassRowShape(classe: string, rows: AslRow[], label: string): string {
  if (rows.length !== 3) {
    throw new ValidationError(
      `${label}: classe ${classe} attese 3 righe importate, ricevute ${rows.length}`
    );
  }
  const byStudente = new Map<string, AslRow[]>();
  for (const row of rows) {
    const studente = String(row[COL_ASL.STUDENTE]);
    const bucket = byStudente.get(studente) ?? [];
    bucket.push(row);
    byStudente.set(studente, bucket);
  }
  const sconosciuto = byStudente.get(STUDENTE_SCONOSCIUTO_CARTELLE) ?? [];
  if (sconosciuto.length !== 1) {
    throw new ValidationError(
      `${label}: classe ${classe} attesa 1 riga sconosciuto, ricevute ${sconosciuto.length}`
    );
  }
  const knownEntries = [...byStudente.entries()].filter(
    ([studente]) => studente !== STUDENTE_SCONOSCIUTO_CARTELLE
  );
  if (knownEntries.length !== 1 || knownEntries[0]![1].length !== 2) {
    throw new ValidationError(
      `${label}: classe ${classe} attesi esattamente 2 record per un unico studente noto`
    );
  }
  const [knownStudente, knownRows] = knownEntries[0]!;
  const oreNote = knownRows.map((row) => Number(row[COL_ASL.ORE])).sort((a, b) => a - b);
  if (oreNote[1] !== oreNote[0]! + 1) {
    throw new ValidationError(
      `${label}: classe ${classe} ORE studente noto non consecutive (${oreNote.join(',')})`
    );
  }
  const oreSconosciuto = Number(sconosciuto[0]![COL_ASL.ORE]);
  if (oreSconosciuto !== oreNote[1] + 1) {
    throw new ValidationError(
      `${label}: classe ${classe} ORE riga sconosciuto attesa ${oreNote[1] + 1}, ricevuta ${oreSconosciuto}`
    );
  }
  return knownStudente;
}

/** Deterministic content fingerprint for the ASL table, used to prove OVERWRITE idempotency. */
function snapshotAslRows(rows: AslRow[]): string {
  const normalized = rows
    .map((row) => ({
      classe: stringValue(row['_CLASSE']),
      studente: String(row[COL_ASL.STUDENTE]),
      ore: Number(row[COL_ASL.ORE])
    }))
    .sort(
      (a, b) =>
        a.classe.localeCompare(b.classe) ||
        a.studente.localeCompare(b.studente) ||
        a.ore - b.ore
    );
  return JSON.stringify(normalized);
}

/**
 * Full-shape assertion for one CERCA_CARTELLE_CLASSE run: row count matches exactly 3 rows per
 * eligible class (no more — a regression guard against the `2B_DECOY` folder or any trashed file
 * leaking in, since neither has a live LOG_FOLD row for the strategy to discover), every row's
 * `_CLASSE` is one of the eligible classes, no row carries the decoy/baseline ORE=99 sentinel, and
 * each eligible class has the exact per-class shape from `assertClassRowShape`.
 */
function assertCercaCartelleClasseRun(rows: AslRow[], eligibleClasses: string[], label: string): void {
  if (rows.length !== eligibleClasses.length * 3) {
    throw new ValidationError(
      `${label}: attese ${eligibleClasses.length * 3} righe (3 per classe eleggibile), ricevute ${rows.length}`
    );
  }
  if (rows.some((row) => Number(row[COL_ASL.ORE]) === 99)) {
    throw new ValidationError(
      `${label}: rilevata riga con ORE=99 (segnale del decoy 2B_DECOY o della riga baseline)`
    );
  }
  const eligibleSet = new Set(eligibleClasses);
  const grouped = new Map<string, AslRow[]>();
  for (const row of rows) {
    const classe = stringValue(row['_CLASSE']);
    if (!eligibleSet.has(classe)) {
      throw new ValidationError(`${label}: riga con _CLASSE inattesa "${classe}"`);
    }
    const bucket = grouped.get(classe) ?? [];
    bucket.push(row);
    grouped.set(classe, bucket);
  }
  if (grouped.size !== eligibleClasses.length) {
    throw new ValidationError(
      `${label}: attese righe per ${eligibleClasses.length} classi eleggibili, ricevute per ${grouped.size}`
    );
  }
  const knownStudents: string[] = [];
  for (const classe of eligibleClasses) {
    knownStudents.push(assertClassRowShape(classe, grouped.get(classe) ?? [], label));
  }
  if (new Set(knownStudents).size !== eligibleClasses.length) {
    throw new ValidationError(`${label}: studenti noti non distinti tra le classi eleggibili`);
  }
}

/**
 * Live acceptance checks for CERCA_CARTELLE_CLASSE (12 §3): reads only the eligible classes'
 * LOG_FOLD-registered folders (never the `2B_DECOY` folder, which has no LOG_FOLD row, or any
 * trashed decoy file), tags every row with `_CLASSE`, and OVERWRITEs the ASL target. Kept as its
 * own register function (rather than folded into `registerImportChecks`'s scope union) because it
 * targets a distinct CONF_IMP recipe with no overlap with the FILE_SINGOLO/policy scopes above;
 * `index.ts` composes it alongside `registerImportChecks` for the aggregate 'import' group.
 */
export function registerImportCartelleClasseChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample
): void {
  const db = container.get<EmailDb>('db');
  const readAsl = (): AslRow[] => db.table(TABLE.ASL).findAll();
  const readLogFold = (): AslRow[] => db.table(TABLE.LOG_FOLD).findAll();
  const readConfImp = (): AslRow[] => db.table(TABLE.CONF_IMP).findAll();

  runner.add(
    groupName(
      'import.cartelleClasse',
      'CERCA_CARTELLE_CLASSE: solo cartelle eleggibili, _CLASSE, contatori e idempotenza OVERWRITE'
    ),
    sample.sampleSpreadsheetUrl,
    () => {
      const folderTipo = readCartelleClasseFolderTipo(
        readConfImp(),
        CONF_IMP_ASL_CARTELLE,
        'CERCA_CARTELLE_CLASSE'
      );
      const eligibleClasses = readEligibleClasses(
        readLogFold(),
        folderTipo,
        'CERCA_CARTELLE_CLASSE'
      );
      const expectedRows = eligibleClasses.length * 3;

      const first = avviaImportazioneDataDriven(container, CONF_IMP_ASL_CARTELLE);
      assertSuccessful(first, 'CERCA_CARTELLE_CLASSE prima esecuzione');
      if (
        first.inseriti !== expectedRows ||
        first.aggiornati !== 0 ||
        first.saltati !== 0 ||
        first.ghost !== 0
      ) {
        throw new ValidationError(
          `CERCA_CARTELLE_CLASSE prima esecuzione: attesi inseriti=${expectedRows}, aggiornati=0, saltati=0, ghost=0; ricevuti inseriti=${first.inseriti}, aggiornati=${first.aggiornati}, saltati=${first.saltati}, ghost=${first.ghost}`
        );
      }
      const firstRows = readAsl();
      assertCercaCartelleClasseRun(
        firstRows,
        eligibleClasses,
        'CERCA_CARTELLE_CLASSE prima esecuzione'
      );
      const firstSnapshot = snapshotAslRows(firstRows);

      const second = avviaImportazioneDataDriven(container, CONF_IMP_ASL_CARTELLE);
      assertSuccessful(second, 'CERCA_CARTELLE_CLASSE seconda esecuzione (idempotenza OVERWRITE)');
      if (
        second.inseriti !== expectedRows ||
        second.aggiornati !== 0 ||
        second.saltati !== 0 ||
        second.ghost !== 0
      ) {
        throw new ValidationError(
          `CERCA_CARTELLE_CLASSE seconda esecuzione: attesi contatori invariati (inseriti=${expectedRows}, aggiornati=0, saltati=0, ghost=0); ricevuti inseriti=${second.inseriti}, aggiornati=${second.aggiornati}, saltati=${second.saltati}, ghost=${second.ghost}`
        );
      }
      const secondRows = readAsl();
      if (secondRows.length !== firstRows.length) {
        throw new ValidationError(
          `CERCA_CARTELLE_CLASSE idempotenza: righe cresciute da ${firstRows.length} a ${secondRows.length} dopo la seconda OVERWRITE`
        );
      }
      if (snapshotAslRows(secondRows) !== firstSnapshot) {
        throw new ValidationError(
          'CERCA_CARTELLE_CLASSE idempotenza: il contenuto ASL è cambiato tra due esecuzioni OVERWRITE consecutive'
        );
      }
    }
  );
}
