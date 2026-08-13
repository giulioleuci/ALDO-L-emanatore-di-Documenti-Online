import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from '../SampleDatabaseBuilder';
import type { IArtifactFactory } from '../E2eTemplateProvisioner';
import {
  StatoDocumento,
  ReligioneScelta,
  TipoPiano,
  TipoProgetto
} from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import {
  TABLE,
  COL_ALUNNI,
  COL_DOCENTI,
  COL_CLASSI,
  COL_MATERIE,
  COL_INDIRIZZI,
  COL_DIPART,
  COL_PIANI,
  COL_CARENZE,
  COL_PROGETTI,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_CONF_IMP,
  COL_LOG_DOCS,
  COL_MASTER
} from '../../config/schema';
import {
  ALL_CLASSI,
  ANNI_PRECEDENTI,
  CLASS_ADDRESS_BY_CLASS,
  CLASS_LAYOUTS,
  INDIRIZZI,
  INDIRIZZO_CLASSICO,
  INDIRIZZO_SCIENTIFICO,
  INDIRIZZO_SCIENTIFICO_APPLICATE,
  MATERIE_PER_INDIRIZZO,
  MATERIE_PUNTATE,
  SUPPLENZA_FINE,
  SUPPLENZA_INIZIO,
  CONF_DOC_JOBRUNNER,
  e2eAlunnoEmail,
  e2eDocenteEmail,
  type FixtureClasseLayout
} from './fixtures';
import { seedAnniPrecedenti, seedConfDedicated, seedLogFold } from './Seeders';
import { TIPI_PIANO, type E2eTemplateIds } from './SharedTestContracts';
import { ASSIGNMENT_MATERIE_E2E, HEADERS, MATERIE_E2E } from './SharedTestHeaders';

export * from './fixtures';
export * from './SharedTestContracts';
export * from './SharedTestHeaders';

export const CLASSE_A = '1A';
export const CLASSE_B = '2B';
export const CLASSE_C_PARENT = '3C';
export const CLASSE_C = '3C-S';
export const CLASSE_C_PARTNER = '3C-C';
/**
 * Every entry-point class (05 §5 / EmailNotificationService.classiEntryPoint):
 * CLASSE_C_PARENT aggregates CLASSE_C/CLASSE_C_PARTNER, so both partner rows
 * are filtered and the parent receives the single PER_COORDINATORE/PER_CDC
 * target for the articulated group.
 */
export const ALL_CLASSI_E2E = [CLASSE_A, CLASSE_B, CLASSE_C_PARENT];
export const ASSIGNMENT_MATRIX_DATE_E2E = new Date('2026-07-15T09:00:00Z');

/** Minimal persisted fixture descriptor used only by the Script Cache isolation callback. */
export interface CacheIsolationFixture {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
}
/**
 * Specifica catalog rows (design 2026-07-30-materie-specifica-catalog): every
 * dotted SPECIFICA column in ASSIGNMENT_COLUMNS_E2E needs its own MATERIE row.
 * `INTERPRET.FLAUTO` has no ASSIGNMENT_COLUMNS_E2E/curriculum data of its own
 * (mirrors `test/fixtures/tables.ts`'s Task 15 composite-specificità rows) —
 * it exists purely so `focus.classe.studenti.perSpecificita`'s INTERPRET
 * entry has a second, empty `specifiche[]` branch to iterate (02 §8.9/§3.3
 * `{ "nome": "flauto", "alunni": [] }`), not just the populated CHITARRA one.
 */
const SPECIFICA_MATERIE_E2E = MATERIE_PUNTATE;
export const INDIRIZZO_E2E = INDIRIZZO_SCIENTIFICO;
export const INDIRIZZO_E2E_CLASSICO = INDIRIZZO_CLASSICO;
export const DIPART_E2E = 'DIPART_E2E';
export const DOCENTE_COUNT = 20;
/** MATERIE.ESAME_CFG for the scientific E2E indirizzo (02 §2.9/§8.2 `esame.materiePrimaProva`/`materieSecondaProva`). */
const ESAME_CFG_E2E: Record<string, string> = {
  ITA: JSON.stringify({ prima_prova: [INDIRIZZO_E2E, INDIRIZZO_E2E_CLASSICO] }),
  MAT: JSON.stringify({ seconda_prova: [INDIRIZZO_E2E, INDIRIZZO_E2E_CLASSICO] })
};

/** Name pools for realistic mock data (item 5) — plain constants, not a name generator. */
const ALUNNO_COGNOMI = [
  'Rossi',
  'Russo',
  'Ferrari',
  'Esposito',
  'Bianchi',
  'Romano',
  'Colombo',
  'Ricci',
  'Marino',
  'Greco',
  'Bruno',
  'Gallo',
  'Conti',
  'DeLuca',
  'Mancini',
  'Costa',
  'Giordano'
];
const ALUNNO_NOMI = [
  'Marco',
  'Giulia',
  'Luca',
  'Sara',
  'Andrea',
  'Elena',
  'Davide',
  'Chiara',
  'Matteo',
  'Francesca',
  'Alessandro',
  'Martina',
  'Simone'
];
const DOCENTE_COGNOMI = [
  'Rossi',
  'Bianchi',
  'Verdi',
  'Ferrari',
  'Romano',
  'Galli',
  'Fontana',
  'Santoro',
  'Mariani',
  'Villa'
];
const DOCENTE_NOMI_M = ['Marco', 'Paolo', 'Alessandro', 'Luca', 'Davide'];
const DOCENTE_NOMI_F = ['Laura', 'Anna', 'Chiara', 'Elena', 'Francesca'];

/** Parent-rep free-text name (item 3): offset from the pools used for the student's own
 * name (+3/+4) so a parent's name never echoes the row's own student name. */
function parentRepName(counter: number): string {
  const cognome = ALUNNO_COGNOMI[(counter - 1 + 3) % ALUNNO_COGNOMI.length]!;
  const nome = ALUNNO_NOMI[(counter - 1 + 4) % ALUNNO_NOMI.length]!;
  return `${cognome} ${nome}`;
}

export const CONF_DOC_VERBALE = 'E2E_VERBALE';
export const CONF_DOC_CONDOTTA = 'E2E_CONDOTTA';
export const CONF_DOC_RIEPILOGO = 'E2E_RIEPILOGO';
export const CONF_DOC_COMPLESSO = 'E2E_DOC_COMPLESSO';
export const CONF_DOC_ARTICOLATA = 'E2E_DOC_ARTICOLATA';
export const CONF_DOC_RIEPILOGO_FIRME_CDC = 'E2E_RIEPILOGO_FIRME_CDC';
export const CONF_DOC_DOCENTE_MATERIA = 'E2E_DOCENTE_MATERIA';
export const CONF_DOC_SHEET_PERMESSI = 'E2E_SHEET_PERMESSI';
export const CONF_DOC_ACL_REALI = 'E2E_ACL_REALI';
export const CONF_DOC_PIANI = 'PIANI_PERSONALIZZATI';
export const CONF_DOC_PIANO_LAVORO = 'E2E_PIANO_LAVORO';
export const CONF_MAIL_VERBALE = 'E2E_MAIL_VERBALE';
export const CONF_MAIL_CONDOTTA = 'E2E_MAIL_CONDOTTA';
export const CONF_MAIL_CARENZA = 'E2E_MAIL_CARENZA';
export const CONF_MAIL_PIANI = 'E2E_MAIL_PIANI';
export const CONF_MAIL_LAVORO = 'E2E_MAIL_LAVORO';
export const CONF_MAIL_STATIC_ALLEGATO = 'E2E_MAIL_STATIC_ALLEGATO';
export const CONF_IMP_ASL = 'E2E_IMPORT_ASL';

export const CARENZA_ALUNNO_1 = e2eAlunnoEmail(1);
export const CARENZA_ALUNNO_2 = e2eAlunnoEmail(21);

/**
 * Repeaters (RIPETENTE=true this year): stay in the SAME class both years
 * instead of being promoted — see `seedClassiAnnoPrecedente`/
 * `seedAlunniAnnoPrecedente`. 1A is normally an entry class with no
 * 2025-2026 identity at all (freshman year); its repeater is the sole
 * exception.
 */
export const RIPETENTE_1A = e2eAlunnoEmail(2);
export const RIPETENTE_3C = e2eAlunnoEmail(41);

/** Distinct 2026-2027 PDP_BES case for articulated 3C-S; not the repeater seam. */
export const PDP_BES_3C = e2eAlunnoEmail(42);
/** Same student deliberately owns two plan subtypes, exercising composite plan identity. */
export const PIANO_DOPPIO_STUDENTE = e2eAlunnoEmail(25);

/**
 * Which student(s) each TIPI_PIANO type is generated/seeded for (scenario 3, 5):
 * plans spread across distinct students — CARENZA_ALUNNO_1 has two
 * (PDP_DSA + PDP_STRANIERI, the design's "one student with both" case), and
 * PDP_BES has two (the original 1A case plus the new 3C case).
 */
export const PIANO_STUDENTE: Record<(typeof TIPI_PIANO)[number], string[]> = {
  PDP_DSA: [CARENZA_ALUNNO_1],
  PDP_STRANIERI: [CARENZA_ALUNNO_1],
  PDP_BES: [e2eAlunnoEmail(5), PDP_BES_3C, PIANO_DOPPIO_STUDENTE],
  PEI: [PIANO_DOPPIO_STUDENTE],
  PFP: [e2eAlunnoEmail(30)]
};

export interface SharedTestDatabase {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
  sampleFolderUrl: string;
  /** 2025-2026 database with all nine historical-provider tables and legacy focal rows. */
  priorSampleSpreadsheetId: string;
  priorSampleSpreadsheetUrl: string;
  priorSampleSpreadsheetId2: string;
  priorSampleSpreadsheetUrl2: string;
  logFoldFolderUrl: string;
  jobRunnerDocConfigId: string;
  masterTestMode: boolean;
  staticAttachmentFileId: string;
}

/** anno-1 name for a promotable class (2B→1B, 3C-S→2C-S, 3C-C→2C-C); ids without a leading digit are unchanged. */
function classePrecedente(classeId: string): string {
  const m = /^(\d+)(.*)$/.exec(classeId);
  if (m === null) return classeId;
  return `${Number(m[1]) - 1}${m[2]}`;
}

/**
 * Class layout: id, alunni count, coordinatore index (1-based into e2eDocenteEmail),
 * articolazione JSON. 1A and 2B deliberately share coordIndex 1 so the
 * coordinatore-aggregated email scenarios (VERBALE/PIANI) exercise real
 * multi-class aggregation into a single email instead of one email per class.
 */
type ClasseLayout = FixtureClasseLayout;

/**
 * Builds the persistent shared SGSA dataset: 13 classes, 220 students, two articulated
 * groups, 20 teachers, exactly two CARENZE rows, MASTER.TEST_MODE=true, and every online-test
 * configuration. It remains separate from the small smoke-test `SampleDatabaseBuilder` and
 * uses fixed Drive artifact names so repeated runs reuse the same external structure.
 */
export class SharedTestDatabaseBuilder {
  constructor(
    private readonly spreadsheets: ISampleSpreadsheetFactory,
    private readonly drive: IDriveFacade,
    private readonly artifacts: IArtifactFactory
  ) {}

  build(
    templateIds: E2eTemplateIds,
    master: ISampleSpreadsheet,
    options: { force?: boolean } = {}
  ): SharedTestDatabase {
    const baseName = options.force ? '_ALDO_E2E_FORCE_REBUILD' : '_ALDO_E2E';
    const folderId = this.drive.createFolder(baseName);
    const sampleFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    const sample = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE`);

    for (const [table, headerRow] of Object.entries(HEADERS)) {
      sample.addSheet(table, headerRow);
    }
    master.addSheet(TABLE.MASTER, Object.values(COL_MASTER));

    this.seedIndirizzi(sample);
    this.seedDipart(sample);
    this.seedMaterie(sample);
    this.seedDocenti(sample);
    const layouts = this.classLayouts();
    this.seedClassi(sample, layouts);
    this.seedAlunni(sample, layouts);
    this.seedCarenze(sample);
    this.seedSupplenzeEVariazioni(sample);
    this.seedPiani(sample);
    this.seedProgetti(sample);
    this.seedConfDoc(sample, templateIds);
    this.seedConfMail(sample, templateIds);
    this.seedConfImp(sample, templateIds);
    const masterTestMode = true;
    this.seedMaster(master, sample.id, folderId, masterTestMode);
    const logFolders = seedLogFold(sample, this.drive, this.artifacts);
    seedConfDedicated(sample, templateIds);
    const [prior, prior2] = seedAnniPrecedenti(master, this.spreadsheets, folderId);
    const logFold = logFolders[0];
    if (prior === undefined || prior2 === undefined || logFold === undefined) {
      throw new ConfigurationError(
        `Expected ${ANNI_PRECEDENTI.length} prior databases and at least one LOG_FOLD folder`
      );
    }
    this.seedLegacyFocalHistory(prior.spreadsheet, layouts);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl(),
      sampleFolderUrl,
      priorSampleSpreadsheetId: prior.id,
      priorSampleSpreadsheetUrl: prior.url,
      priorSampleSpreadsheetId2: prior2.id,
      priorSampleSpreadsheetUrl2: prior2.url,
      logFoldFolderUrl: logFold.url,
      jobRunnerDocConfigId: CONF_DOC_JOBRUNNER,
      masterTestMode,
      staticAttachmentFileId: templateIds.staticAttachment
    };
  }

  /**
   * Builds a second valid MASTER/current-year pair that intentionally has no class `1A`.
   * It shares the same GAS Script Cache as the normal fixture, so a row-key missing the
   * spreadsheet identifier becomes externally observable as a false hit.
   */
  buildCacheIsolationFixture(
    templateIds: E2eTemplateIds,
    master: ISampleSpreadsheet
  ): CacheIsolationFixture {
    const baseName = '_ALDO_E2E_CACHE_ISOLATED';
    const folderId = this.drive.createFolder(baseName);
    const sample = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE`);
    for (const [table, headerRow] of Object.entries(HEADERS)) {
      sample.addSheet(table, headerRow);
    }
    master.addSheet(TABLE.MASTER, Object.values(COL_MASTER));

    const layouts = this.classLayouts().filter((layout) => layout.id !== CLASSE_A);
    this.seedIndirizzi(sample);
    this.seedDipart(sample);
    this.seedMaterie(sample);
    this.seedDocenti(sample);
    this.seedClassi(sample, layouts);
    this.seedAlunni(sample, layouts);
    this.seedCarenze(sample);
    this.seedSupplenzeEVariazioni(sample);
    this.seedPiani(sample);
    this.seedProgetti(sample);
    this.seedConfDoc(sample, templateIds);
    this.seedConfMail(sample, templateIds);
    this.seedConfImp(sample, templateIds);
    this.seedMaster(master, sample.id, folderId, true);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl()
    };
  }

  private classLayouts(): ClasseLayout[] {
    return ALL_CLASSI.map((id) => {
      const layout = CLASS_LAYOUTS.find((candidate) => candidate.id === id);
      if (layout === undefined) {
        throw new ConfigurationError(`Missing shared class layout for ${id}`);
      }
      return layout;
    });
  }

  private seedIndirizzi(sample: ISampleSpreadsheet): void {
    const labels: Record<string, { nome: string; sintesi: string }> = {
      [INDIRIZZO_CLASSICO]: { nome: 'Liceo Classico (E2E)', sintesi: 'CLA' },
      [INDIRIZZO_SCIENTIFICO]: { nome: 'Liceo Scientifico (E2E)', sintesi: 'SCI' },
      [INDIRIZZO_SCIENTIFICO_APPLICATE]: {
        nome: 'Liceo Scienze Umane (E2E)',
        sintesi: 'SUM'
      }
    };
    for (const id of INDIRIZZI) {
      const label = labels[id]!;
      sample.appendRow(TABLE.INDIRIZZI, {
        [COL_INDIRIZZI.ID]: id,
        [COL_INDIRIZZI.NOME]: label.nome,
        [COL_INDIRIZZI.NOME_SINTETICO]: label.sintesi,
        [COL_INDIRIZZI.TIPO]: 'Liceo'
      });
    }
  }

  private seedDipart(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.DIPART, {
      [COL_DIPART.ID]: DIPART_E2E,
      [COL_DIPART.NOME]: 'Dipartimento E2E',
      [COL_DIPART.CAPO]: e2eDocenteEmail(1),
      [COL_DIPART.MATERIE]: MATERIE_E2E.join(',')
    });
  }

  private seedMaterie(sample: ISampleSpreadsheet): void {
    const nomi: Record<string, string> = {
      MAT: 'Matematica',
      ITA: 'Italiano',
      ING: 'Inglese',
      STO: 'Storia',
      INF: 'Informatica',
      IRC: 'Religione cattolica',
      ALT: 'Attività alternativa',
      GRECO: 'Greco',
      LATINO: 'Latino',
      FILOSOFIA: 'Filosofia',
      PSICOLOGIA: 'Psicologia',
      SCIUMANE: 'Scienze umane',
      DIRECON: 'Diritto ed economia',
      SCIENZE: 'Scienze',
      FISICA: 'Fisica'
    };
    ASSIGNMENT_MATERIE_E2E.forEach((sigla) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: sigla,
        [COL_MATERIE.NOME]: nomi[sigla],
        [COL_MATERIE.SINTESI]: nomi[sigla],
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: sigla.charAt(0),
        [COL_MATERIE.ESAME_CFG]: ESAME_CFG_E2E[sigla] ?? '',
        [COL_MATERIE.EVOLUZIONE]:
          sigla === 'STO' ? JSON.stringify({ GST: [1, 2], STO: [3, 4, 5] }) : '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: sigla === 'IRC' || sigla === 'ALT'
      });
    });
    const specifiche: Record<
      string,
      { principale: string; specificita: string; nome: string; sintesi: string }
    > = {
      'LAB.GRUPPO_A': {
        principale: 'Laboratorio',
        specificita: 'Gruppo A',
        nome: '',
        sintesi: 'Lab. Gruppo A'
      },
      'LAB.SEMINARIO_POMERIDIANO': {
        principale: 'Laboratorio',
        specificita: 'Seminario pomeridiano',
        nome: '',
        sintesi: 'Lab. Seminario'
      },
      'INTERPRET.CHITARRA': {
        principale: 'Interpretazione ed esecuzione',
        specificita: 'Chitarra',
        nome: '',
        sintesi: 'Interpretazione (Chitarra)'
      },
      'INTERPRET.FLAUTO': {
        principale: 'Interpretazione ed esecuzione',
        specificita: 'Flauto',
        nome: 'Interpretazione ed esecuzione — indirizzo flauto',
        sintesi: 'Interpretazione (Flauto)'
      }
    };
    SPECIFICA_MATERIE_E2E.forEach((id) => {
      const spec = specifiche[id]!;
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: id,
        [COL_MATERIE.NOME]: spec.nome,
        [COL_MATERIE.SINTESI]: spec.sintesi,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: id.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: false,
        [COL_MATERIE.PRINCIPALE]: spec.principale,
        [COL_MATERIE.SPECIFICITA]: spec.specificita
      });
    });
  }

  /** 20 DOCENTI rows, alternating GENERE, all in the single E2E dipartimento; realistic Italian names (item 5). */
  private seedDocenti(sample: ISampleSpreadsheet): void {
    for (let i = 1; i <= DOCENTE_COUNT; i++) {
      const genere = i % 2 === 0 ? 'F' : 'M';
      sample.appendRow(TABLE.DOCENTI, {
        [COL_DOCENTI.EMAIL]: e2eDocenteEmail(i),
        [COL_DOCENTI.COGNOME]: DOCENTE_COGNOMI[(i - 1) % DOCENTE_COGNOMI.length]!,
        [COL_DOCENTI.NOME]: (genere === 'F' ? DOCENTE_NOMI_F : DOCENTE_NOMI_M)[(i - 1) % 5]!,
        [COL_DOCENTI.GENERE]: genere,
        [COL_DOCENTI.DIPART]: DIPART_E2E,
        [COL_DOCENTI.ITP]: i === 2 || i === 11
      });
    }
  }

  /** All shared classes with the complete address-specific assignment matrix. */
  private seedClassi(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    layouts.forEach((layout, classIndex) => {
      const indirizzo = CLASS_ADDRESS_BY_CLASS[layout.id]!;
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: layout.id,
        [COL_CLASSI.ANNO]: Number(layout.id.charAt(0)),
        [COL_CLASSI.INDIRIZZO]: indirizzo,
        [COL_CLASSI.ARTICOLAZIONE]: this.articolazione(layout),
        [COL_CLASSI.RUOLI]: '',
        [COL_CLASSI.ATTIVA]: true,
        [COL_CLASSI.COORD]: e2eDocenteEmail(layout.coordIndex),
        [COL_CLASSI.IRC]: '',
        [COL_CLASSI.ALT]: '',
        [COL_CLASSI.SEZ]: layout.id.replace(/[0-9-]/g, '') || 'A',
        [COL_CLASSI.TERMINALE]: false,
        // Prior-year name (StoricoClassiService.perClasse, `01_SCHEMA_DATABASE.md`
        // CLASSI.STORICO) — 1A is an entry class with no 2025-2026 identity.
        [COL_CLASSI.STORICO]:
          layout.id === CLASSE_A
            ? ''
            : layout.id === CLASSE_C_PARENT
              ? '2C,1C'
              : classePrecedente(layout.id)
      };
      const materie = MATERIE_PER_INDIRIZZO[indirizzo as keyof typeof MATERIE_PER_INDIRIZZO];
      materie.forEach((sigla, materiaIndex) => {
        const docenteIndex = ((classIndex * materie.length + materiaIndex) % DOCENTE_COUNT) + 1;
        row[sigla] = e2eDocenteEmail(docenteIndex);
      });
      if (layout.id === CLASSE_A) {
        Object.assign(row, {
          MAT: e2eDocenteEmail(1),
          ITA: e2eDocenteEmail(2),
          ING: e2eDocenteEmail(3),
          STO: e2eDocenteEmail(4),
          GRECO: e2eDocenteEmail(3),
          LATINO: e2eDocenteEmail(2),
          FILOSOFIA: e2eDocenteEmail(3)
        });
      }
      if (layout.id === CLASSE_B) {
        Object.assign(row, {
          MAT: e2eDocenteEmail(5),
          ITA: e2eDocenteEmail(6),
          ING: e2eDocenteEmail(7),
          STO: e2eDocenteEmail(8),
          IRC: e2eDocenteEmail(5),
          ALT: e2eDocenteEmail(6),
          PSICOLOGIA: e2eDocenteEmail(5),
          SCIUMANE: e2eDocenteEmail(6),
          DIRECON: e2eDocenteEmail(7)
        });
      }
      if (layout.id === CLASSE_C) {
        Object.assign(row, {
          MAT: e2eDocenteEmail(1),
          ITA: e2eDocenteEmail(2),
          ING: e2eDocenteEmail(3),
          STO: e2eDocenteEmail(4),
          IRC: e2eDocenteEmail(2),
          ALT: e2eDocenteEmail(3),
          SCIENZE: e2eDocenteEmail(2),
          FISICA: e2eDocenteEmail(3),
          INF: e2eDocenteEmail(4),
          'INF.itp': e2eDocenteEmail(2)
        });
      }
      if (layout.id === CLASSE_C_PARENT) {
        Object.assign(row, {
          MAT: e2eDocenteEmail(1),
          STO: e2eDocenteEmail(4),
          INF: e2eDocenteEmail(4),
          'INF.itp': e2eDocenteEmail(2)
        });
      }
      if (layout.id === CLASSE_C_PARTNER) {
        Object.assign(row, {
          MAT: e2eDocenteEmail(1),
          ITA: e2eDocenteEmail(6),
          ING: e2eDocenteEmail(7),
          STO: e2eDocenteEmail(8),
          IRC: e2eDocenteEmail(6),
          ALT: e2eDocenteEmail(7),
          GRECO: e2eDocenteEmail(6),
          LATINO: e2eDocenteEmail(7),
          FILOSOFIA: e2eDocenteEmail(8)
        });
      }
      if ([CLASSE_C, CLASSE_C_PARTNER].includes(layout.id)) {
        row.MAT = e2eDocenteEmail(1);
      }
      if (layout.id === CLASSE_B || layout.id === CLASSE_C_PARTNER) {
        row.STO = e2eDocenteEmail(8);
      }
      if (layout.id === CLASSE_A) {
        Object.assign(row, {
          'INF.itp': e2eDocenteEmail(2),
          'LAB.GRUPPO_A': e2eDocenteEmail(3),
          'LAB.SEMINARIO_POMERIDIANO': e2eDocenteEmail(4),
          'INTERPRET.CHITARRA': e2eDocenteEmail(5),
          [COL_CLASSI.IRC]: e2eDocenteEmail(6),
          [COL_CLASSI.ALT]: e2eDocenteEmail(7)
        });
      }
      if (layout.id === '4A') {
        Object.assign(row, {
          'LAB.GRUPPO_A': e2eDocenteEmail(3),
          'LAB.SEMINARIO_POMERIDIANO': e2eDocenteEmail(4),
          'INTERPRET.CHITARRA': e2eDocenteEmail(5),
          'INTERPRET.CHITARRA.itp': e2eDocenteEmail(11),
          'INTERPRET.FLAUTO': e2eDocenteEmail(6)
        });
      }
      sample.appendRow(TABLE.CLASSI, row);
    });
  }

  private articolazione(layout: ClasseLayout): string {
    if (layout.id === '3C') {
      return JSON.stringify({ parent: null, partner: null, partners: '3C-S,3C-C' });
    }
    if (layout.id === '5B') {
      return JSON.stringify({ parent: null, partner: null, partners: '5B-S,5B-C' });
    }
    if (layout.articolazione === '{}') return '';
    const parsed = JSON.parse(layout.articolazione) as { parent: string; partner: string };
    return JSON.stringify({ ...parsed, partners: null });
  }

  /** 220 deterministic students; explicit layout starts preserve the legacy focal identities. */
  private seedAlunni(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
        const counter = layout.studentStart + n;
        const email = e2eAlunnoEmail(counter);
        const cognome = ALUNNO_COGNOMI[(counter - 1) % ALUNNO_COGNOMI.length]!;
        const nome = ALUNNO_NOMI[(counter - 1) % ALUNNO_NOMI.length]!;
        const eccezione = layout.religionExceptions.find((e) => e.index === n);
        const isRapprStud = n < layout.studentRepCount;
        const isRapprGen = n >= layout.count - layout.parentRepCount;
        sample.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: email,
          [COL_ALUNNI.COGNOMENOME]: `${cognome} ${nome}`,
          [COL_ALUNNI.CLASSE]: layout.id,
          [COL_ALUNNI.RELIGIONE]: eccezione?.scelta ?? ReligioneScelta.IRC,
          [COL_ALUNNI.CURRICULUM]:
            layout.id !== CLASSE_A
              ? ''
              : n === 0
                ? JSON.stringify({ LAB: ['GRUPPO_A'] })
                : n === 1
                  ? JSON.stringify({ LAB: ['SEMINARIO_POMERIDIANO'] })
                  : n === 3
                    ? JSON.stringify({ INTERPRET: ['CHITARRA'] })
                    : '',
          [COL_ALUNNI.ATTIVO]: true,
          // Repeaters (item "repeaters"): redoing this same class, see
          // `seedClassiAnnoPrecedente`/`seedAlunniAnnoPrecedente`.
          [COL_ALUNNI.RIPETENTE]: email === RIPETENTE_1A || email === RIPETENTE_3C,
          [COL_ALUNNI.RAPPR_STUD]: isRapprStud,
          [COL_ALUNNI.RAPPR_GEN]: isRapprGen ? parentRepName(counter) : '',
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
      }
    }
  }

  /** Adds the original focal 2025-2026 seams after Task 4's broader historical rows. */
  private seedLegacyFocalHistory(prior: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    const focal = [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map((id) => {
      const layout = layouts.find((candidate) => candidate.id === id);
      if (layout === undefined) throw new ConfigurationError(`Missing focal layout ${id}`);
      return layout;
    });
    this.seedLegacyFocalClasses(prior, focal);
    this.seedLegacyFocalStudents(prior, focal);
    this.seedLegacyFocalPlans(prior);
  }

  private seedLegacyFocalClasses(prior: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    const rows = layouts.map((layout, focalIndex) => ({
      id: layout.id === CLASSE_A ? CLASSE_A : classePrecedente(layout.id),
      layout,
      focalIndex
    }));
    const scientifico = layouts.find((layout) => layout.id === CLASSE_C);
    if (scientifico === undefined) throw new ConfigurationError(`Missing focal layout ${CLASSE_C}`);
    rows.push({ id: CLASSE_C, layout: scientifico, focalIndex: 2 });

    for (const { id, layout, focalIndex } of rows) {
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: id,
        [COL_CLASSI.ANNO]: Number(id.charAt(0)),
        [COL_CLASSI.INDIRIZZO]:
          layout.id === CLASSE_C_PARTNER ? INDIRIZZO_E2E_CLASSICO : INDIRIZZO_E2E,
        [COL_CLASSI.ARTICOLAZIONE]: '',
        [COL_CLASSI.RUOLI]: '',
        [COL_CLASSI.ATTIVA]: true,
        [COL_CLASSI.COORD]: e2eDocenteEmail(layout.coordIndex),
        [COL_CLASSI.IRC]: '',
        [COL_CLASSI.ALT]: '',
        [COL_CLASSI.SEZ]: id.replace(/[0-9-]/g, '') || 'A',
        [COL_CLASSI.TERMINALE]: false,
        [COL_CLASSI.STORICO]: ''
      };
      MATERIE_E2E.forEach((sigla, materiaIndex) => {
        row[sigla] = e2eDocenteEmail(((focalIndex * MATERIE_E2E.length + materiaIndex) % 8) + 1);
      });
      if (layout.id === CLASSE_C_PARTNER) row.MAT = e2eDocenteEmail(1);
      prior.appendRow(TABLE.CLASSI, row);
    }
  }

  private seedLegacyFocalStudents(prior: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    for (const layout of layouts) {
      for (let offset = 0; offset < layout.count; offset += 1) {
        const counter = layout.studentStart + offset;
        const email = e2eAlunnoEmail(counter);
        const isRipetente = email === RIPETENTE_1A || email === RIPETENTE_3C;
        if (layout.id === CLASSE_A && !isRipetente) continue;
        const cognome = ALUNNO_COGNOMI[(counter - 1) % ALUNNO_COGNOMI.length]!;
        const nome = ALUNNO_NOMI[(counter - 1) % ALUNNO_NOMI.length]!;
        prior.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: email,
          [COL_ALUNNI.COGNOMENOME]: `${cognome} ${nome}`,
          [COL_ALUNNI.CLASSE]: isRipetente ? layout.id : classePrecedente(layout.id),
          [COL_ALUNNI.RELIGIONE]: ReligioneScelta.IRC,
          [COL_ALUNNI.CURRICULUM]: '',
          [COL_ALUNNI.ATTIVO]: true,
          [COL_ALUNNI.RIPETENTE]: false,
          [COL_ALUNNI.RAPPR_STUD]: false,
          [COL_ALUNNI.RAPPR_GEN]: '',
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
      }
    }
  }

  private seedLegacyFocalPlans(prior: ISampleSpreadsheet): void {
    for (const tipo of [TipoPiano.PEI, TipoPiano.PDP_BES]) {
      prior.appendRow(TABLE.LOG_DOCS, {
        [COL_LOG_DOCS.ID]: `E2E_FAKE_LOGDOC_${tipo}_2025_2026`,
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_PIANI,
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: tipo,
        [COL_LOG_DOCS.NOME]: `E2E_Piano_${tipo}_2025_2026`,
        [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
        [COL_LOG_DOCS.NOTIFICATO]: '2025-11-15T09:00:00.000Z',
        [COL_LOG_DOCS.PATH]: '_ALDO_E2E_OUTPUT',
        [COL_LOG_DOCS.LINK]: `https://drive.google.com/file/d/E2E_FAKE_${tipo}_2025_2026/edit`,
        [COL_LOG_DOCS.CLASSI]: classePrecedente(CLASSE_B),
        [COL_LOG_DOCS.UTENTI]: PIANO_DOPPIO_STUDENTE,
        [COL_LOG_DOCS.MATERIE]: '',
        [COL_LOG_DOCS.DATA_CREAZ]: '2025-11-10T09:00:00.000Z',
        [COL_LOG_DOCS.ID_ORIG]: ''
      });
    }
  }

  /**
   * Exactly 2 CARENZE rows (scenario 6, design spec confirmed this count with the user).
   * CLASSE holds the student's class id (not a materia sigla) — CARENZA_ALUNNO_1 is in
   * CLASSE_A, CARENZA_ALUNNO_2 is in CLASSE_B (see `seedAlunni`/`classLayouts`). Each row
   * also carries a numeric shortfall value on the MATERIE_E2E[0] ('MAT') column, matching
   * CARENZE's per-subject matrix shape (see CARENZE header above) — otherwise
   * `getCarenzePerMateria` would resolve zero deficient subjects for every row.
   */
  private seedCarenze(sample: ISampleSpreadsheet): void {
    const materiaCarenza = MATERIE_E2E[0]!;
    const rows = [
      { studente: CARENZA_ALUNNO_1, classe: CLASSE_A },
      { studente: CARENZA_ALUNNO_2, classe: CLASSE_B }
    ];
    for (const { studente, classe } of rows) {
      sample.appendRow(TABLE.CARENZE, {
        [COL_CARENZE.STUDENTE]: studente,
        [COL_CARENZE.PROGRESSIVO]: 1,
        [COL_CARENZE.CLASSE]: classe,
        [COL_CARENZE.DATA]: '2026-07-01',
        [COL_CARENZE.NOTIFICATO]: false,
        [COL_CARENZE.ASSENZE]: false,
        [COL_CARENZE.NOTE]: 'Carenza E2E di prova',
        [COL_CARENZE.DATA_MODIFICA]: '2026-07-01',
        [materiaCarenza]: 4
      });
    }
  }

  /** Same SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI priority-chain case as SampleDatabaseBuilder, using docenti 9/10 (outside the cattedra round-robin pool). */
  private seedSupplenzeEVariazioni(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(1),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(9),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-10',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: MATERIE_E2E[0]
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIE]: MATERIE_E2E[0],
      [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(1),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(10),
      [COL_VARIAZIONI_CATTEDRA.DAL]: '2026-07-05'
    });
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(2),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(11),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-31',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: 'INF'
    });
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(7),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(13),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-31',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: 'ALT'
    });
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(13),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(14),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-31',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: 'ALT'
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'IRC',
      [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(6),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(12),
      [COL_VARIAZIONI_CATTEDRA.DAL]: '2026-07-05'
    });
    // 2-hop VARIAZIONI_CATTEDRA override chain on CLASSE_A/ITA (docente 2, the
    // round-robin nominal holder, genuinely untouched by any other row above):
    // docente2 -> docente15 -> docente16, both hops decorse before
    // ASSIGNMENT_MATRIX_DATE_E2E so the chain must be walked to its final
    // holder, not stop at the intermediate hop (ref design
    // 2026-07-30-cattedra-chain-verification-design.md, EXPECTED_ASSIGNMENT_MATRIX 'ITA').
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'ITA',
      [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(2),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(15),
      [COL_VARIAZIONI_CATTEDRA.DAL]: '2026-07-01'
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'ITA',
      [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(15),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(16),
      [COL_VARIAZIONI_CATTEDRA.DAL]: '2026-07-08'
    });
    // Restriction-by-omission SUPPLENZE (empty CLASSI, valued MATERIE): docente8
    // nominally holds STO in both CLASSE_B and CLASSE_C_PARTNER (only subject he
    // teaches). A CLASSI-omitted, MATERIE=STO-scoped supplenza must resolve
    // to BOTH his nominal STO cattedre from his own actual teaching slots, not
    // a naive cross-product with classes/subjects he doesn't teach (ref design
    // 2026-07-30-cattedra-resolution-wiring-design.md §2 worked example).
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(8),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(17),
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-31',
      [COL_SUPPLENZE.CLASSI]: '',
      [COL_SUPPLENZE.MATERIE]: 'STO'
    });
    // .SPECIFICA-targeted MATERIE entry on a SUPPLENZE row (not VARIAZIONI_
    // CATTEDRA, ref design §8 bullet 3): reuses the existing specifica-bearing
    // LAB.SEMINARIO_POMERIDIANO slot (sub-project 4 catalog) rather than adding
    // a new one. A fresh Aug window keeps this independent of the July
    // EXPECTED_ASSIGNMENT_MATRIX assertion for the same slot.
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(4),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(18),
      [COL_SUPPLENZE.DAL]: '2026-08-01',
      [COL_SUPPLENZE.AL]: '2026-08-10',
      [COL_SUPPLENZE.CLASSI]: CLASSE_A,
      [COL_SUPPLENZE.MATERIE]: 'LAB.SEMINARIO_POMERIDIANO'
    });
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(19),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(20),
      [COL_SUPPLENZE.DAL]: SUPPLENZA_INIZIO.toISOString().slice(0, 10),
      [COL_SUPPLENZE.AL]: SUPPLENZA_FINE.toISOString().slice(0, 10),
      [COL_SUPPLENZE.CLASSI]: '4A',
      [COL_SUPPLENZE.MATERIE]: 'MAT'
    });
    // Same holder and window, but a different real cattedra: resolving 4A/MAT
    // must never leak the overlapping 2B/ING substitution into the focus.
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(19),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(18),
      [COL_SUPPLENZE.DAL]: SUPPLENZA_INIZIO.toISOString().slice(0, 10),
      [COL_SUPPLENZE.AL]: SUPPLENZA_FINE.toISOString().slice(0, 10),
      [COL_SUPPLENZE.CLASSI]: CLASSE_B,
      [COL_SUPPLENZE.MATERIE]: 'ING'
    });
    // Degenerate substitution: same principal/substitute identity. Every
    // consumer must deduplicate the actor instead of emitting two recipients.
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: e2eDocenteEmail(19),
      [COL_SUPPLENZE.SUPPLENTE]: e2eDocenteEmail(19),
      [COL_SUPPLENZE.DAL]: '2026-11-01',
      [COL_SUPPLENZE.AL]: '2026-11-10',
      [COL_SUPPLENZE.CLASSI]: '4A',
      [COL_SUPPLENZE.MATERIE]: 'MAT'
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSI]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIE]: 'LAB.SEMINARIO_POMERIDIANO',
      [COL_VARIAZIONI_CATTEDRA.TITOLARE]: e2eDocenteEmail(4),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(20),
      [COL_VARIAZIONI_CATTEDRA.DAL]: '2026-10-16'
    });
  }

  /** One PIANI row per (TipoPiano, studente) pair (scenario 3), spread across PIANO_STUDENTE (item 5). */
  private seedPiani(sample: ISampleSpreadsheet): void {
    for (const tipo of TIPI_PIANO) {
      for (const studente of PIANO_STUDENTE[tipo]) {
        sample.appendRow(TABLE.PIANI, {
          [COL_PIANI.STUDENTE]: studente,
          [COL_PIANI.TIPO]: tipo,
          [COL_PIANI.PARAMETRI]: JSON.stringify({ note: `Piano E2E ${tipo}` })
        });
      }
    }
  }

  /**
   * PROGETTI rows for CLASSE_A (02 §2.10/§4.1/§8.5, "genuinely new" node) — gives
   * `focus.classe.hasProgetti`/`progetti[]` real content: one ASL project (docente referente,
   * exercises `ProgettoVM.isAsl`/`oreAsl`) and one ORIENTAMENTO project (exercises `tipoLabel`
   * without an ASL hour count).
   */
  private seedProgetti(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.PROGETTI, {
      [COL_PROGETTI.CLASSE]: CLASSE_A,
      [COL_PROGETTI.TIPO]: TipoProgetto.ASL,
      [COL_PROGETTI.NOME]: 'E2E Stage aziendale',
      [COL_PROGETTI.REFERENTE]: e2eDocenteEmail(1),
      [COL_PROGETTI.ORE]: 60,
      [COL_PROGETTI.ORE_ASL]: 60
    });
    sample.appendRow(TABLE.PROGETTI, {
      [COL_PROGETTI.CLASSE]: CLASSE_A,
      [COL_PROGETTI.TIPO]: TipoProgetto.ORIENTAMENTO,
      [COL_PROGETTI.NOME]: 'E2E Open day universita',
      [COL_PROGETTI.REFERENTE]: e2eDocenteEmail(2),
      [COL_PROGETTI.ORE]: 8,
      [COL_PROGETTI.ORE_ASL]: 0
    });
  }

  private seedConfDoc(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    const classRegistration = JSON.stringify({
      classi: '{{focus.classe.anagrafica.nome}}',
      utenti: '',
      materie: ''
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_VERBALE,
      [COL_CONF_DOC.TIPO]: 'VERBALE',
      [COL_CONF_DOC.GENERATORE]: 'VERBALE_CDC',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.verbale }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Verbale_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/VERBALI/{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: JSON.stringify([
        {
          tipo: 'AGGIORNA_STATO_DOC',
          stato: StatoDocumento.VERBALIZZATO,
          criteri: {
            [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
            [COL_LOG_DOCS.CLASSI]: '{{focus.classe.anagrafica.nome}}'
          }
        },
        {
          tipo: 'AGGIORNA_STATO_DOC',
          stato: StatoDocumento.VERBALIZZATO,
          criteri: {
            [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
            [COL_LOG_DOCS.CLASSI]: '{{focus.classe.articolazione.partners | join}}'
          }
        }
      ]),
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '',
        materie: 'MATE'
      }),
      // Come il REGISTRA_DOC del piano di lavoro sopra, la cartella del verbale
      // deve risultare raggiungibile anche quando interrogata con classiCompetenza
      // =[partner] (il box "cartelle" di CONF_MAIL_LAVORO instrada ogni
      // coordinatore di partner separatamente via cartellePerClasse); il join
      // gestisce con grazia il caso "non articolata" (log-registration.test.ts).
      [COL_CONF_DOC.REGISTRA_FOLD]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
        utenti: '',
        materie: 'MATE'
      })
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_CONDOTTA,
      [COL_CONF_DOC.TIPO]: 'CONDOTTA',
      [COL_CONF_DOC.GENERATORE]: 'FOGLIO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.condotta }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Condotta_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/CONDOTTA',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO,
      [COL_CONF_DOC.TIPO]: 'RIEPILOGO_CLASSE',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.riepilogo }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Riepilogo_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/RIEPILOGHI',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_COMPLESSO,
      [COL_CONF_DOC.TIPO]: 'REPORT_COMPLESSO',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.docComplesso }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Complesso_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/ESEMPI_COMPLESSI',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_ARTICOLATA,
      [COL_CONF_DOC.TIPO]: 'DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.docArticolata }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Articolata_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/ARTICOLATA',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO_FIRME_CDC,
      [COL_CONF_DOC.TIPO]: 'RIEPILOGO_FIRME_CDC',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.cdcRiepilogo }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_RiepilogoFirmeCdc_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/RIEPILOGHI_FIRME_CDC',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_DOCENTE_MATERIA,
      [COL_CONF_DOC.TIPO]: 'DOCUMENTO_DOCENTE_MATERIA',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.riepilogo }),
      [COL_CONF_DOC.FILE_NAME]:
        'E2E_DocenteMateria_{{focus.materia.sigla}}_{{focus.docente.email}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/DOCENTI_MATERIE',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.docente.email}}',
        materie: '{{focus.materia.sigla}}'
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_SHEET_PERMESSI,
      [COL_CONF_DOC.TIPO]: 'SHEET_PERMESSI',
      [COL_CONF_DOC.GENERATORE]: 'SHEET_CON_MATERIE_E_PERMESSI',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.sheetPermessi }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Permessi_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/PIANI_PERS',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.REGISTRA_DOC]: '{}',
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_ACL_REALI,
      [COL_CONF_DOC.TIPO]: 'ACL_REALI',
      [COL_CONF_DOC.GENERATORE]: 'SHEET_CON_MATERIE_E_PERMESSI',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.sheetPermessi }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_ACL_Reali_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/ACL_REALI',
      [COL_CONF_DOC.DUPLICAZIONE]: 'PERMESSA',
      [COL_CONF_DOC.PERMESSI]: JSON.stringify({
        file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
        folder: [{ ruolo: 'COORDINATORI', permesso: 'LETTURA' }],
        regolaSupplente: { file: 'ENTRAMBI', folder: 'ENTRAMBI' }
      }),
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.REGISTRA_DOC]: '{}',
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_PIANO_LAVORO,
      [COL_CONF_DOC.TIPO]: 'PIANO_LAVORO',
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.pianoLavoro }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_PianoLavoro_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/PIANI_LAVORO',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      // Il piano di lavoro è un documento UNICO per classe (mai per singolo
      // docente/materia): per una classe articolata parent, la registrazione
      // deve coprire l'intero gruppo (join di focus.classe.articolazione
      // .partners, gestisce con grazia anche il caso "non articolata" dove
      // .partners è assente — vedi log-registration.test.ts) così che il box
      // "documenti" trovi il documento anche quando interrogato con
      // classiCompetenza=[partner] (EmailNotificationService.
      // targetsPerCoordinatore instrada ogni coordinatore di partner
      // separatamente). I coordinatori (fusi tra le partner da
      // ClasseProvider.buildCoordinatori per il parent) vanno in UTENTI.
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}},{{focus.classe.articolazione.partners | join}}',
        // coordinatori is a { appellativo, articolo, coordina, presiede, elenco: PersonVM[] }
        // container, not a bare array (02 §2.6) — iterate .elenco.
        utenti:
          '{{#focus.classe.coordinatori.elenco}}{{email}},{{/focus.classe.coordinatori.elenco}}',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_PIANI,
      [COL_CONF_DOC.TIPO]: 'PIANO_PERS',
      [COL_CONF_DOC.GENERATORE]: 'DOC_PERSONALIZZATO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify(
        TIPI_PIANO.map((tipo) => ({
          condizione: `{{focus.piano.tipo}} == "${tipo}"`,
          templateId: templateIds.piani[tipo]
        }))
      ),
      [COL_CONF_DOC.FILE_NAME]:
        'E2E_Piano_{{focus.piano.tipoLabel}}_{{focus.alunno.anagrafica.nomeCompleto}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/DOCUMENTI PERS',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.alunno.anagrafica.email}}',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    });
  }

  private seedConfMail(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_VERBALE,
      // No class name (item 2): PER_COORDINATORE covers every class the
      // coordinatore is responsible for — 1A/2B share one coordinatore, so
      // naming just the (arbitrary) first class here would be misleading.
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Verbale del consiglio di classe',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        // FILTRO_TIPO (item 6): scope the rendered links to VERBALE docs only —
        // otherwise a class with CONDOTTA/PIANO_PERS docs too would list those
        // as well. No DATI_SORGENTE here, so ComposeEmailStep never attaches
        // anything (attachment is opt-in, item 3 — no PDFs from getBlob()).
        { TIPO_BOX: 'documenti', FILTRO_TIPO: 'VERBALE' },
        { TIPO_BOX: 'cartelle' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>In allegato il verbale del consiglio di classe.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_TITOLARI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CONDOTTA,
      // PER_CDC always targets exactly one class (targetsPerCdc) — no multi-class
      // ambiguity, so the class name stays (unlike VERBALE/PIANI, item 2).
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Scheda condotta {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'documenti', FILTRO_TIPO: 'CONDOTTA' },
        { TIPO_BOX: 'cartelle' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>In allegato la scheda di valutazione condotta.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_SUPPLENTI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CARENZA,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Comunicazione carenza',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CARENZA_GENITORI',
      // carenze/note/assenze boxes (item 1) — an empty BOX_CFG rendered no
      // deficiency list at all, despite CARENZA_COMPLETO populating the data.
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'carenze' },
        { TIPO_BOX: 'note' },
        { TIPO_BOX: 'assenze' }
      ]),
      [COL_CONF_MAIL.TESTO]:
        '<p>Comunichiamo una carenza rilevata per il/la vostro/a figlio/a.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_TITOLARI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#C62828',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_PIANI,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Piani personalizzati', // no class name (item 2, PER_COORDINATORE)
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        {
          TIPO_BOX: 'piani_pers_da_inviare',
          arricchisciConStorico: true,
          configArricchimento: {
            templateRiga:
              '<li><strong>{{corrente.tipoLabel}}</strong> — {{corrente.studente.nomeCompleto}}: <a href="{{corrente.link}}" target="_blank">{{corrente.nome}}</a>{{#storico}}<br><span style="color:#666;">Disponibile anche il piano dell\'anno precedente: <a href="{{link}}" target="_blank">{{nome}}</a> ({{anno}})</span>{{/storico}}</li>'
          }
        },
        { TIPO_BOX: 'piani_pers_inviati' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>Piani personalizzati nuovi e già notificati.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_TITOLARI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      // Marks every PIANO_PERS doc of every class the coordinatore covers as
      // notificato once the email actually sends (item 7) — without this,
      // piani_pers_inviati never gets any content and "already sent" plans
      // never exist in the mock DB. Must match on the FULL classiCompetenza
      // list (join filter), not just focus.classe (the arbitrary first
      // class): a 1A+2B coordinatore's email renders/sends both classes'
      // plans (PianiPersClasseProvider aggregates classiCompetenza), so a
      // single-class criterion would silently leave 2B's rows unmarked.
      [COL_CONF_MAIL.POST_PROCESSO]: JSON.stringify([
        {
          tipo: 'INSERISCI_TIMESTAMP',
          tab: TABLE.LOG_DOCS,
          col: COL_LOG_DOCS.NOTIFICATO,
          criteri: {
            [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
            [COL_LOG_DOCS.CLASSI]: '{{destinatario.contesto.classiCompetenza | join}}'
          }
        }
      ]),
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_LAVORO,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Piano di lavoro e verbali riunioni',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        {
          TIPO_BOX: 'documenti',
          FILTRO_TIPO: 'PIANO_LAVORO'
        },
        { TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }
      ]),
      [COL_CONF_MAIL.TESTO]:
        '<p>Il piano di lavoro e la cartella dei verbali delle riunioni sono collegati di seguito.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'SOLO_TITOLARI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_STATIC_ALLEGATO,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Allegato statico di prova',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>Messaggio con allegato statico di prova.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: 'ENTRAMBI',
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: JSON.stringify([templateIds.staticAttachment])
    });
  }

  private seedConfImp(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    sample.appendRow(TABLE.CONF_IMP, {
      [COL_CONF_IMP.ID]: CONF_IMP_ASL,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.aslImportSheet,
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    });
  }

  private seedMaster(
    master: ISampleSpreadsheet,
    sampleSpreadsheetId: string,
    folderId: string,
    testMode: boolean
  ): void {
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2026-2027',
      [COL_MASTER.ID_SPREADSHEET]: sampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local',
      [COL_MASTER.TEST_MODE]: testMode
    });
  }
}
