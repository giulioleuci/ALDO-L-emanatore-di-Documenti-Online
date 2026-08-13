import {
  avviaImportazioneChunkedDataDriven,
  avviaImportazioneDataDriven,
  creaJobRunner,
  riprendiJobSospeso
} from '../../config/Bootstrap';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_ASL, COL_CARENZE, COL_CONF_IMP, COL_LOG_DOCS, COL_LOG_FOLD, TABLE } from '../../config/schema';
import { ConfigurationError, ValidationError } from '../../domain/errors/DomainError';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { CONF_IMP_ASL } from '../data/SharedTestDatabaseBuilder';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import {
  CONF_DOC_CERCA_DOCUMENTI_SOURCE,
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_BAD_STRATEGY,
  CONF_IMP_CERCA_DOCUMENTI,
  CONF_IMP_CHUNKED,
  CONF_IMP_DISABLED,
  CONF_IMP_IGNORE,
  CONF_IMP_MISSING_FILE,
  CONF_IMP_MISSING_FOLDER,
  CONF_IMP_MISSING_IDGEN,
  CONF_IMP_NOHEADER,
  CONF_IMP_TIMESTAMP,
  CONF_IMP_TIMESTAMP_FALLBACK,
  e2eAlunnoEmail
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

/**
 * The two classes CERCA_DOCUMENTI generates its eligible source sheets for
 * (real `FOGLIO_GENERICO` documents via `CONF_DOC_CERCA_DOCUMENTI_SOURCE`,
 * whose Drive template — `Seeders.ts#aslImportUpdates` — has no `{{...}}`
 * markers, so both copies carry byte-identical STUDENTE/ORE content; only
 * their LOG_DOCS `CLASSI` tag differs).
 */
const CERCA_DOCUMENTI_CLASSE_A = '1A';
const CERCA_DOCUMENTI_CLASSE_B = '2A';
/** Sentinel `_CLASSE`/`TIPO` for the manually-appended, filter-excluded LOG_DOCS row below. */
const CERCA_DOCUMENTI_EXCLUDED_CLASSE = 'ZZ_ESCLUSA_TIPO';
const CERCA_DOCUMENTI_EXCLUDED_TIPO = 'E2E_IMPORT_SOURCE_ALTRO_TIPO';
const CERCA_DOCUMENTI_EXCLUDED_DOC_ID = 'E2E_CERCA_DOCUMENTI_ESCLUSO_TIPO';
/** Sentinel `_CLASSE` for the manually-appended, same-idGen/same-tipo LOG_DOCS row pointing at a real non-sheet file. */
const CERCA_DOCUMENTI_NON_SHEET_CLASSE = 'ZZ_NON_FOGLIO';
/** Static content of `Seeders.ts#aslImportUpdates` (ref ASL_IMPORT_ROWS), reused identically by both generated sheets. */
const ASL_IMPORT_SHEET_STUDENTS: Array<[string, number]> = [
  [e2eAlunnoEmail(43), 40],
  [e2eAlunnoEmail(44), 55],
  [e2eAlunnoEmail(51), 60],
  [e2eAlunnoEmail(52), 35]
];

/**
 * Live acceptance checks for CERCA_DOCUMENTI (12 §3): real generation of the
 * two eligible source sheets through `DocumentGenerationService.generateForClasse`
 * (the only path that produces genuine `LOG_DOCS` rows for
 * `CONF_DOC_CERCA_DOCUMENTI_SOURCE` — DUPLICAZIONE=NEGATA keeps a rerun
 * idempotent, no new file on a second launcher execution), then the real
 * `CONF_IMP_CERCA_DOCUMENTI` import against them.
 *
 * Two more LOG_DOCS rows are appended directly (not via real generation —
 * `Seeders.ts`-style direct `insert`, each matched against `find` first so a
 * rerun does not fight the table's `ID` primary key), exercising the two
 * distinct ways CERCA_DOCUMENTI excludes a document:
 * - a mismatched `TIPO` (same `idGen`) — excluded by the strategy's
 *   `idGen`+`tipo` filter (`CustomSourceStrategies.ts`
 *   `createCercaDocumentiStrategy`) before the document is ever read;
 * - a matching `idGen`/`TIPO` but pointing at a genuine non-spreadsheet
 *   Drive file (`sample.staticAttachmentFileId`, a real provisioned Doc
 *   template — no new Drive artifact needed) — this one *passes* the filter
 *   but is skipped by `createCercaDocumentiStrategy`'s strict Drive MIME
 *   preflight before any sheet read.
 *
 * Both sentinel `_CLASSE` values must never appear in the imported ASL rows,
 * and the import must still succeed with the two eligible sheets' rows
 * intact — proving both exclusion paths for real through the live
 * `avviaImportazioneDataDriven` path, not a mock.
 */
export function registerImportCercaDocumentiChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample
): void {
  const db = container.get<EmailDb>('db');
  const readAsl = (): AslRow[] => db.table(TABLE.ASL).findAll();

  runner.add(
    groupName(
      'import.cercaDocumenti',
      'filtro per idGen/tipo su 2 fogli generati e _CLASSE per record'
    ),
    sample.sampleSpreadsheetUrl,
    () => {
      const documents = container.get<DocumentGenerationService>('documentGenerationService');
      const logDocsForSource = (): AslRow[] =>
        db
          .table(TABLE.LOG_DOCS)
          .findAll()
          .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_CERCA_DOCUMENTI_SOURCE);

      const resolveSourceFileId = (classe: string): string => {
        const generated = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_CERCA_DOCUMENTI_SOURCE
        );
        if (generated.fileId !== null && generated.fileId !== '') return generated.fileId;
        // DUPLICAZIONE=NEGATA: a rerun reports SKIPPED with fileId=null; the real file/LOG_DOCS
        // row from a prior run still exists — resolve it instead of failing.
        const existing = logDocsForSource().find((row) => row[COL_LOG_DOCS.CLASSI] === classe);
        const existingId = existing === undefined ? '' : stringValue(existing[COL_LOG_DOCS.ID]);
        if (existingId === '') {
          throw new ValidationError(
            `CERCA_DOCUMENTI: nessun file sorgente generato o preesistente per la classe ${classe}`
          );
        }
        return existingId;
      };

      resolveSourceFileId(CERCA_DOCUMENTI_CLASSE_A);
      resolveSourceFileId(CERCA_DOCUMENTI_CLASSE_B);

      // Excluded by TIPO before ever being read as a sheet (12 §3 filter) — idempotent insert.
      if (
        db
          .table(TABLE.LOG_DOCS)
          .find((row) => row[COL_LOG_DOCS.ID] === CERCA_DOCUMENTI_EXCLUDED_DOC_ID) === null
      ) {
        db.table(TABLE.LOG_DOCS).insert({
          [COL_LOG_DOCS.ID]: CERCA_DOCUMENTI_EXCLUDED_DOC_ID,
          [COL_LOG_DOCS.ID_GEN]: CONF_DOC_CERCA_DOCUMENTI_SOURCE,
          [COL_LOG_DOCS.TIPO]: CERCA_DOCUMENTI_EXCLUDED_TIPO,
          [COL_LOG_DOCS.SOTTOTIPO]: '',
          [COL_LOG_DOCS.NOME]: 'E2E CERCA_DOCUMENTI escluso per tipo',
          [COL_LOG_DOCS.STATO]: 'GENERATO',
          [COL_LOG_DOCS.NOTIFICATO]: '',
          [COL_LOG_DOCS.PATH]: '',
          [COL_LOG_DOCS.LINK]: '',
          [COL_LOG_DOCS.CLASSI]: CERCA_DOCUMENTI_EXCLUDED_CLASSE,
          [COL_LOG_DOCS.UTENTI]: '',
          [COL_LOG_DOCS.MATERIE]: '',
          [COL_LOG_DOCS.DATA_CREAZ]: '2026-08-10T09:00:00.000Z',
          [COL_LOG_DOCS.ID_ORIG]: ''
        });
      }

      // Matches idGen+tipo (passes the filter) but points at a real non-sheet Drive file —
      // proves the per-document fail-soft skip, not just the tipo filter above.
      if (
        db
          .table(TABLE.LOG_DOCS)
          .find((row) => row[COL_LOG_DOCS.ID] === sample.staticAttachmentFileId) === null
      ) {
        db.table(TABLE.LOG_DOCS).insert({
          [COL_LOG_DOCS.ID]: sample.staticAttachmentFileId,
          [COL_LOG_DOCS.ID_GEN]: CONF_DOC_CERCA_DOCUMENTI_SOURCE,
          [COL_LOG_DOCS.TIPO]: 'E2E_IMPORT_SOURCE',
          [COL_LOG_DOCS.SOTTOTIPO]: '',
          [COL_LOG_DOCS.NOME]: 'E2E CERCA_DOCUMENTI escluso per file non-foglio',
          [COL_LOG_DOCS.STATO]: 'GENERATO',
          [COL_LOG_DOCS.NOTIFICATO]: '',
          [COL_LOG_DOCS.PATH]: '',
          [COL_LOG_DOCS.LINK]: '',
          [COL_LOG_DOCS.CLASSI]: CERCA_DOCUMENTI_NON_SHEET_CLASSE,
          [COL_LOG_DOCS.UTENTI]: '',
          [COL_LOG_DOCS.MATERIE]: '',
          [COL_LOG_DOCS.DATA_CREAZ]: '2026-08-10T09:00:00.000Z',
          [COL_LOG_DOCS.ID_ORIG]: ''
        });
      }

      const result = avviaImportazioneDataDriven(container, CONF_IMP_CERCA_DOCUMENTI);
      assertSuccessful(result, 'CERCA_DOCUMENTI');
      if (result.inseriti + result.aggiornati === 0) {
        throw new ValidationError('CERCA_DOCUMENTI: nessuna riga inserita o aggiornata');
      }

      const rows = readAsl();
      const eligibleClassi = new Set([CERCA_DOCUMENTI_CLASSE_A, CERCA_DOCUMENTI_CLASSE_B]);
      for (const [studente, ore] of ASL_IMPORT_SHEET_STUDENTS) {
        const row = findAslRow(rows, studente, 'CERCA_DOCUMENTI');
        assertOre(row, ore, 'CERCA_DOCUMENTI');
        const classe = stringValue(row['_CLASSE']);
        if (!eligibleClassi.has(classe)) {
          throw new ValidationError(
            `CERCA_DOCUMENTI: _CLASSE inattesa "${classe}" per ${studente} (attese ${[...eligibleClassi].join('/')})`
          );
        }
      }
      if (rows.some((row) => stringValue(row['_CLASSE']) === CERCA_DOCUMENTI_EXCLUDED_CLASSE)) {
        throw new ValidationError(
          'CERCA_DOCUMENTI: trovata una riga con _CLASSE del documento escluso per TIPO — il filtro idGen/tipo non lo ha escluso'
        );
      }
      if (rows.some((row) => stringValue(row['_CLASSE']) === CERCA_DOCUMENTI_NON_SHEET_CLASSE)) {
        throw new ValidationError(
          'CERCA_DOCUMENTI: trovata una riga dal documento non-foglio — lo skip per-documento non ha funzionato'
        );
      }
    }
  );
}

const MS_TINY = 50;
const MS_AMPIO = 25 * 60 * 1000;
const JOB_STATE_TO_RESUME = 'to_resume';
const JOB_STATE_COMPLETED = 'completed';
const JOB_STATE_NOT_STARTED = 'not_started';

interface ImportJobStatus {
  state: string;
  completed?: boolean;
}

interface JobRunnerControl extends JobRunnerService {
  getStatus(jobName: string): ImportJobStatus;
  resetJob(jobName: string): unknown;
  cancelJob(jobName: string): unknown;
}

/**
 * Live acceptance checks for the chunked/resumable import path (15 §4, essential #4):
 * `avviaImportazioneChunkedDataDriven` drives GasDataImporter's checkpointed
 * EXTRACT/LOAD state machine through JobRunnerLib. A tiny `MS_TINY` budget
 * forces suspension after the EXTRACT stage yields (before the buffered rows
 * are LOADed — see `ImportService.executeImportChunked`'s docstring on the
 * EXTRACT->LOAD->[EXTRACT|DONE] cycle), then `riprendiJobSospeso` resumes
 * and completes the LOAD against the same target as `CONF_IMP_ASL`
 * (`CONF_IMP_CHUNKED` reuses `templateIds.aslImportSheet`, ref Seeders.ts).
 */
export function registerImportChunkedChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: ImportSample
): void {
  const db = container.get<EmailDb>('db');
  const readAsl = (): AslRow[] => db.table(TABLE.ASL).findAll();
  const jobName = `imp_chunked_${CONF_IMP_CHUNKED}`;
  const jobRunner = creaJobRunner() as JobRunnerControl;

  try {
    runner.add(
      groupName('import.chunked', 'sospensione to_resume su budget minimo'),
      sample.sampleSpreadsheetUrl,
      () => {
        const result = avviaImportazioneChunkedDataDriven(
          container,
          CONF_IMP_CHUNKED,
          jobRunner,
          MS_TINY
        );
        if (result !== null) {
          throw new ValidationError('Import chunked: attesa sospensione con esito null');
        }
        const status = jobRunner.getStatus(jobName);
        if (status.state !== JOB_STATE_TO_RESUME || status.completed !== false) {
          throw new ValidationError(
            `Import chunked: atteso stato ${JOB_STATE_TO_RESUME}/completed=false, trovato ${status.state}/${String(status.completed)}`
          );
        }
      }
    );

    runner.add(
      groupName('import.chunked', 'resume completa senza duplicati'),
      sample.sampleSpreadsheetUrl,
      () => {
        riprendiJobSospeso(container, jobRunner, jobName, MS_AMPIO);
        const status = jobRunner.getStatus(jobName);
        if (status.state !== JOB_STATE_COMPLETED || status.completed !== true) {
          throw new ValidationError(
            `Import chunked: atteso stato ${JOB_STATE_COMPLETED}/completed=true dopo la ripresa, trovato ${status.state}/${String(status.completed)}`
          );
        }
        const rows = readAsl();
        const studenti = rows.map((row) => stringValue(row[COL_ASL.STUDENTE]));
        if (new Set(studenti).size !== studenti.length) {
          throw new ValidationError(
            'Import chunked: righe ASL con STUDENTE duplicato dopo la ripresa'
          );
        }
        for (const [studente, ore] of ASL_IMPORT_SHEET_STUDENTS) {
          assertOre(findAslRow(rows, studente, 'Import chunked'), ore, 'Import chunked');
        }
      }
    );

    runner.add(
      groupName('import.chunked', 'resetJob azzera lo stato del job'),
      sample.sampleSpreadsheetUrl,
      () => {
        jobRunner.resetJob(jobName);
        const status = jobRunner.getStatus(jobName);
        if (status.state !== JOB_STATE_NOT_STARTED) {
          throw new ValidationError(
            `Import chunked: resetJob non ha azzerato lo stato (${status.state})`
          );
        }
      }
    );
  } finally {
    if (jobRunner.getStatus(jobName).state === JOB_STATE_TO_RESUME) jobRunner.cancelJob(jobName);
  }
}
