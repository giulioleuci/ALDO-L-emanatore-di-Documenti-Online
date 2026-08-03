import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
import { StatoDocumento, ReligioneScelta } from '../domain/value-objects/enums';
import {
  TABLE,
  COL_ALUNNI,
  COL_DOCENTI,
  COL_CLASSI,
  COL_MATERIE,
  COL_INDIRIZZI,
  COL_DIPART,
  COL_RUOLI,
  COL_PIANI,
  COL_CARENZE,
  COL_PROGETTI,
  COL_MOV_ALUNNI,
  COL_ASL,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_CONF_IMP,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_LOG_MAIL,
  COL_MASTER
} from '../config/schema';

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
export const MATERIE_E2E = ['MAT', 'ITA', 'ING', 'STO'];
export const ASSIGNMENT_MATERIE_E2E = [
  ...MATERIE_E2E,
  'INF',
  'LAB',
  'INTERPRET',
  'IRC',
  'ALT'
] as const;
export const ASSIGNMENT_MATRIX_DATE_E2E = new Date('2026-07-15T09:00:00Z');
const ASSIGNMENT_COLUMNS_E2E = [
  ...MATERIE_E2E,
  'INF.itp',
  'LAB.GRUPPO_A',
  'LAB.SEMINARIO_POMERIDIANO',
  'INTERPRET.CHITARRA'
];
/**
 * Specifica catalog rows (design 2026-07-30-materie-specifica-catalog): every
 * dotted SPECIFICA column in ASSIGNMENT_COLUMNS_E2E needs its own MATERIE row.
 */
const SPECIFICA_MATERIE_E2E = ['LAB.GRUPPO_A', 'LAB.SEMINARIO_POMERIDIANO', 'INTERPRET.CHITARRA'];
export const INDIRIZZO_E2E = 'IND_E2E';
export const DIPART_E2E = 'DIPART_E2E';
export const DOCENTE_COUNT = 20;

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

export const TIPI_PIANO = ['PDP_DSA', 'PDP_BES', 'PDP_STRANIERI', 'PEI', 'PFP'] as const;

export const CONF_DOC_VERBALE = 'E2E_VERBALE';
export const CONF_DOC_CONDOTTA = 'E2E_CONDOTTA';
export const CONF_DOC_RIEPILOGO = 'E2E_RIEPILOGO';
export const CONF_DOC_COMPLESSO = 'E2E_DOC_COMPLESSO';
export const CONF_DOC_ARTICOLATA = 'E2E_DOC_ARTICOLATA';
export const CONF_DOC_SHEET_PERMESSI = 'E2E_SHEET_PERMESSI';
export const CONF_DOC_PIANI = 'PIANI_PERSONALIZZATI';
export const CONF_DOC_PIANO_LAVORO = 'E2E_PIANO_LAVORO';
export const CONF_MAIL_VERBALE = 'E2E_MAIL_VERBALE';
export const CONF_MAIL_CONDOTTA = 'E2E_MAIL_CONDOTTA';
export const CONF_MAIL_CARENZA = 'E2E_MAIL_CARENZA';
export const CONF_MAIL_PIANI = 'E2E_MAIL_PIANI';
export const CONF_MAIL_LAVORO = 'E2E_MAIL_LAVORO';
export const CONF_MAIL_STATIC_ALLEGATO = 'E2E_MAIL_STATIC_ALLEGATO';
export const CONF_IMP_ASL = 'E2E_IMPORT_ASL';

export function e2eDocenteEmail(i: number): string {
  return `e2edocente${i}@onlinetest.aldo.local`;
}
export function e2eAlunnoEmail(i: number): string {
  return `e2ealunno${i}@onlinetest.aldo.local`;
}
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

/** Additional 2026-2027 PDP_BES case for 3C. */
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

export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  docComplesso: string;
  docArticolata: string;
  sheetPermessi: string;
  pianoLavoro: string;
  staticAttachment: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}

export interface E2eSampleDatabase {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
  sampleFolderUrl: string;
  /** 2025-2026 database (CLASSI/ALUNNI/LOG_DOCS only) feeding the storico scenarios. */
  priorSampleSpreadsheetId: string;
  priorSampleSpreadsheetUrl: string;
  masterTestMode: boolean;
  staticAttachmentFileId: string;
}

/** anno-1 name for a promotable class (2B→1B, 3C-S→2C-S, 3C-C→2C-C); ids without a leading digit are unchanged. */
function classePrecedente(classeId: string): string {
  const m = /^(\d+)(.*)$/.exec(classeId);
  if (m === null) return classeId;
  return `${Number(m[1]) - 1}${m[2]}`;
}

const HEADERS: Record<string, string[]> = {
  [TABLE.ALUNNI]: Object.values(COL_ALUNNI),
  [TABLE.DOCENTI]: Object.values(COL_DOCENTI),
  [TABLE.CLASSI]: [...Object.values(COL_CLASSI), ...ASSIGNMENT_COLUMNS_E2E],
  [TABLE.MATERIE]: Object.values(COL_MATERIE),
  [TABLE.INDIRIZZI]: Object.values(COL_INDIRIZZI),
  [TABLE.DIPART]: Object.values(COL_DIPART),
  [TABLE.RUOLI]: Object.values(COL_RUOLI),
  [TABLE.PIANI]: Object.values(COL_PIANI),
  [TABLE.CARENZE]: [...Object.values(COL_CARENZE), ...MATERIE_E2E],
  [TABLE.PROGETTI]: Object.values(COL_PROGETTI),
  [TABLE.MOV_ALUNNI]: Object.values(COL_MOV_ALUNNI),
  [TABLE.ASL]: Object.values(COL_ASL),
  [TABLE.SUPPLENZE]: Object.values(COL_SUPPLENZE),
  [TABLE.VARIAZIONI_CATTEDRA]: Object.values(COL_VARIAZIONI_CATTEDRA),
  [TABLE.CONF_DOC]: Object.values(COL_CONF_DOC),
  [TABLE.CONF_MAIL]: Object.values(COL_CONF_MAIL),
  [TABLE.CONF_IMP]: Object.values(COL_CONF_IMP),
  [TABLE.LOG_DOCS]: Object.values(COL_LOG_DOCS),
  [TABLE.LOG_FOLD]: Object.values(COL_LOG_FOLD),
  [TABLE.LOG_MAIL]: Object.values(COL_LOG_MAIL)
};

/**
 * Class layout: id, alunni count, coordinatore index (1-based into e2eDocenteEmail),
 * articolazione JSON. 1A and 2B deliberately share coordIndex 1 so the
 * coordinatore-aggregated email scenarios (VERBALE/PIANI) exercise real
 * multi-class aggregation into a single email instead of one email per class.
 */
interface ClasseLayout {
  id: string;
  count: number;
  coordIndex: number;
  articolazione: string;
  /** First N students (0-indexed within the class) get RAPPR_STUD=true (item 3). */
  studentRepCount: number;
  /** Last N students (0-indexed within the class) get a free-text RAPPR_GEN name (item 3). */
  parentRepCount: number;
  /** 0-indexed-within-class overrides of the ReligioneScelta.SI default (item 3). */
  religionExceptions: Array<{ index: number; scelta: ReligioneScelta }>;
}

/**
 * Builds a persistent, larger sample SGSA database for the 7 e2e scenarios (design spec
 * `2026-07-21-testonline-mock-db-e2e-design.md`): 3 classi (~20 alunni each, one articolata
 * split 8+12), 20 docenti, exactly 2 CARENZE rows, MASTER.TEST_MODE=true, and CONF_DOC/CONF_MAIL
 * rows for all 7 scenarios. Deliberately separate from `SampleDatabaseBuilder` (which stays
 * small, for the existing smoke-test checks) — different fixed Drive artifact names so both
 * coexist without collision, same reuse-by-fixed-name idempotency.
 */
export class E2eSampleDatabaseBuilder {
  constructor(
    private readonly spreadsheets: ISampleSpreadsheetFactory,
    private readonly drive: IDriveFacade
  ) {}

  build(templateIds: E2eTemplateIds): E2eSampleDatabase {
    const baseName = '_ALDO_E2E';
    const folderId = this.drive.createFolder(baseName);
    const sampleFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    const sample = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE`);
    const master = this.spreadsheets.createSpreadsheet(`${baseName}_MASTER`);

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
    this.seedConfDoc(sample, templateIds);
    this.seedConfMail(sample, templateIds);
    this.seedConfImp(sample, templateIds);

    // Previous school year (2025-2026): CLASSI/ALUNNI/LOG_DOCS only — the only
    // tables StoricoClassiService/StoricoDocumentiService ever read from a
    // historical database (13 §4/§5), so CARENZE/SUPPLENZE/CONF_DOC/CONF_MAIL/
    // PIANI would be dead weight here.
    const prior = this.spreadsheets.createSpreadsheet(`${baseName}_SAMPLE_PRIOR`);
    for (const table of [TABLE.CLASSI, TABLE.ALUNNI, TABLE.LOG_DOCS]) {
      prior.addSheet(table, HEADERS[table]!);
    }
    this.seedClassiAnnoPrecedente(prior, layouts);
    this.seedAlunniAnnoPrecedente(prior, layouts);
    this.seedPianiPersStorico(prior);

    const masterTestMode = true;
    this.seedMaster(master, sample.id, folderId, masterTestMode, prior.id);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl(),
      sampleFolderUrl,
      priorSampleSpreadsheetId: prior.id,
      priorSampleSpreadsheetUrl: prior.getUrl(),
      masterTestMode,
      staticAttachmentFileId: templateIds.staticAttachment
    };
  }

  private classLayouts(): ClasseLayout[] {
    return [
      {
        id: CLASSE_A,
        count: 20,
        coordIndex: 1,
        articolazione: '',
        studentRepCount: 0,
        parentRepCount: 0,
        religionExceptions: [
          { index: 0, scelta: ReligioneScelta.NO },
          { index: 3, scelta: ReligioneScelta.ALT }
        ]
      },
      {
        id: CLASSE_B,
        count: 20,
        coordIndex: 1,
        articolazione: '',
        studentRepCount: 1,
        parentRepCount: 1,
        religionExceptions: [{ index: 0, scelta: ReligioneScelta.NO }]
      },
      {
        id: CLASSE_C,
        count: 8,
        coordIndex: 3,
        articolazione: JSON.stringify({
          parent: CLASSE_C_PARENT,
          partner: CLASSE_C_PARTNER,
          partners: null
        }),
        studentRepCount: 2,
        parentRepCount: 1,
        religionExceptions: [{ index: 2, scelta: ReligioneScelta.ALT }]
      },
      {
        id: CLASSE_C_PARTNER,
        count: 12,
        coordIndex: 4,
        articolazione: JSON.stringify({
          parent: CLASSE_C_PARENT,
          partner: CLASSE_C,
          partners: null
        }),
        studentRepCount: 1,
        parentRepCount: 2,
        religionExceptions: [
          { index: 0, scelta: ReligioneScelta.NO },
          { index: 1, scelta: ReligioneScelta.ALT }
        ]
      }
    ];
  }

  private seedIndirizzi(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.INDIRIZZI, {
      [COL_INDIRIZZI.ID]: INDIRIZZO_E2E,
      [COL_INDIRIZZI.NOME]: 'Liceo Scientifico (E2E)',
      [COL_INDIRIZZI.NOME_SINTETICO]: 'SCI',
      [COL_INDIRIZZI.TIPO]: 'Liceo'
    });
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
      LAB: 'Laboratorio',
      INTERPRET: 'Interpretazione musicale',
      IRC: 'Religione cattolica',
      ALT: 'Attività alternativa'
    };
    ASSIGNMENT_MATERIE_E2E.forEach((sigla) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: sigla,
        [COL_MATERIE.NOME]: nomi[sigla],
        [COL_MATERIE.SINTESI]: sigla,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: sigla.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: sigla === 'IRC' || sigla === 'ALT'
      });
    });
    SPECIFICA_MATERIE_E2E.forEach((id) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: id,
        [COL_MATERIE.NOME]: id,
        [COL_MATERIE.SINTESI]: id,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: id.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: '',
        [COL_MATERIE.IS_RELIGIONE_ALT]: false
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

  /**
   * 5 CLASSI rows (2 plain + 1 articulated parent + 2 populated partners).
   * Non-parent rows retain deterministic round-robin assignments over the
   * first 8 docenti; the parent resolves the union of its partners. Single
   * exception: 3C-C's MAT is pinned to 3C-S's own MAT holder so the articulated
   * group has one genuinely shared (COMUNE) cattedra — see the inline comment.
   */
  private seedClassi(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    layouts.forEach((layout, classIndex) => {
      if (layout.id === CLASSE_C) {
        sample.appendRow(TABLE.CLASSI, {
          [COL_CLASSI.ID]: CLASSE_C_PARENT,
          [COL_CLASSI.ANNO]: 3,
          [COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E,
          [COL_CLASSI.ARTICOLAZIONE]: JSON.stringify({
            parent: null,
            partner: null,
            partners: `${CLASSE_C},${CLASSE_C_PARTNER}`
          }),
          [COL_CLASSI.RUOLI]: '',
          [COL_CLASSI.ATTIVA]: true,
          [COL_CLASSI.COORD]: '',
          [COL_CLASSI.IRC]: '',
          [COL_CLASSI.ALT]: '',
          [COL_CLASSI.SEZ]: 'C',
          [COL_CLASSI.TERMINALE]: false,
          [COL_CLASSI.STORICO]: ''
        });
      }
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: layout.id,
        [COL_CLASSI.ANNO]: 3,
        [COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E,
        [COL_CLASSI.ARTICOLAZIONE]: layout.articolazione,
        [COL_CLASSI.RUOLI]: '',
        [COL_CLASSI.ATTIVA]: true,
        [COL_CLASSI.COORD]: e2eDocenteEmail(layout.coordIndex),
        [COL_CLASSI.IRC]: '',
        [COL_CLASSI.ALT]: '',
        [COL_CLASSI.SEZ]: layout.id.replace(/[0-9-]/g, '') || 'A',
        [COL_CLASSI.TERMINALE]: false,
        // Prior-year name (StoricoClassiService.perClasse, `01_SCHEMA_DATABASE.md`
        // CLASSI.STORICO) — 1A is an entry class with no 2025-2026 identity.
        [COL_CLASSI.STORICO]: layout.id === CLASSE_A ? '' : classePrecedente(layout.id)
      };
      MATERIE_E2E.forEach((sigla, materiaIndex) => {
        const docenteIndex = ((classIndex * MATERIE_E2E.length + materiaIndex) % 8) + 1;
        row[sigla] = e2eDocenteEmail(docenteIndex);
      });
      if (layout.id === CLASSE_C_PARTNER) {
        // Cattedra COMUNE al gruppo articolato 3C (override mirato del round-robin,
        // che altrimenti darebbe insiemi di docenti DISGIUNTI alle due partner —
        // docenti 1-4 a 3C-S, 5-8 a 3C-C — rendendo `tipoArticolazione` mai
        // `'COMUNE'` e `focus.classe.consiglioDiClasseComune` strutturalmente vuoto).
        // docente1 tiene già MAT in 3C-S (classIndex 2, materiaIndex 0): pinnando qui
        // la stessa materia allo stesso docente si ottiene un docente realmente
        // condiviso da tutto il gruppo, come in una vera classe articolata (alcune
        // cattedre comuni, le altre separate per indirizzo). Le restanti materie di
        // 3C-C restano sui docenti 6/7/8, quindi lo split SEPARATO_PRIMO/SECONDO
        // continua a essere esercitato. STO/3C-C NON va toccata: docente8 vi tiene
        // l'unica altra sua cattedra STO, su cui poggia il caso SUPPLENZE
        // "restriction-by-omission" (vedi `seedSupplenzeEVariazioni`).
        row[MATERIE_E2E[0]!] = e2eDocenteEmail(1);
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
      sample.appendRow(TABLE.CLASSI, row);
    });
  }

  /** Realistic Italian full names (item 5), deterministic per counter — cognome/nome pool sizes are coprime (17/13) so none of the 60 students repeat. */
  private seedAlunni(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    let counter = 1;
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
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
          [COL_ALUNNI.RELIGIONE]: eccezione?.scelta ?? ReligioneScelta.SI,
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
        counter += 1;
      }
    }
  }

  /**
   * Previous-year (2025-2026) CLASSI rows: each class becomes its anno-1 name
   * (2B→1B, 3C-S→2C-S, 3C-C→2C-C), reusing the same coordinatore/cattedra
   * assignment as the current year (same teachers, one year earlier). 1A and
   * 3C-S additionally get a same-name row for their repeater (item
   * "repeaters") — the only reason 1A (normally an entry class with no
   * prior-year identity) has any 2025-2026 presence at all.
   */
  private seedClassiAnnoPrecedente(prior: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    const classeCIndex = layouts.findIndex((l) => l.id === CLASSE_C);
    const rows = layouts.map((layout, classIndex) => ({
      id: layout.id === CLASSE_A ? CLASSE_A : classePrecedente(layout.id),
      layout,
      classIndex
    }));
    // The 3C-S repeater needs a same-name row, distinct from 2C-S (the promoted majority).
    rows.push({ id: CLASSE_C, layout: layouts[classeCIndex]!, classIndex: classeCIndex });

    for (const { id, layout, classIndex } of rows) {
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: id,
        [COL_CLASSI.ANNO]: 3,
        [COL_CLASSI.INDIRIZZO]: INDIRIZZO_E2E,
        // Not carried over: current-year articolazione partner names (3C-S/3C-C)
        // don't apply verbatim to the promoted prior-year pair, and neither
        // storico service reads it.
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
        const docenteIndex = ((classIndex * MATERIE_E2E.length + materiaIndex) % 8) + 1;
        row[sigla] = e2eDocenteEmail(docenteIndex);
      });
      prior.appendRow(TABLE.CLASSI, row);
    }
  }

  /**
   * Previous-year (2025-2026) ALUNNI rows: the promoted roster of each class
   * (same email/name, one class down) — 1A's genuine freshmen (this year's
   * newcomers) have no 2025-2026 row at all, only its repeater does, staying
   * in 1A both years (matching `seedClassiAnnoPrecedente`'s same-name rows).
   */
  private seedAlunniAnnoPrecedente(prior: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    let counter = 1;
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
        const email = e2eAlunnoEmail(counter);
        const isRipetente = email === RIPETENTE_1A || email === RIPETENTE_3C;
        if (layout.id === CLASSE_A && !isRipetente) {
          counter += 1;
          continue;
        }
        const cognome = ALUNNO_COGNOMI[(counter - 1) % ALUNNO_COGNOMI.length]!;
        const nome = ALUNNO_NOMI[(counter - 1) % ALUNNO_NOMI.length]!;
        prior.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: email,
          [COL_ALUNNI.COGNOMENOME]: `${cognome} ${nome}`,
          [COL_ALUNNI.CLASSE]: isRipetente ? layout.id : classePrecedente(layout.id),
          [COL_ALUNNI.RELIGIONE]: ReligioneScelta.SI,
          [COL_ALUNNI.CURRICULUM]: '',
          [COL_ALUNNI.ATTIVO]: true,
          // Not yet repeating in 2025-2026 — the repetition is what makes them one THIS year.
          [COL_ALUNNI.RIPETENTE]: false,
          [COL_ALUNNI.RAPPR_STUD]: false,
          [COL_ALUNNI.RAPPR_GEN]: '',
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
        counter += 1;
      }
    }
  }

  /**
   * Prior-year (2025-2026) rows use the stable personalized-plan generator ID.
   * The dual-plan student has both PEI and PDP_BES history so the email scenario
   * proves that SOTTOTIPO, not ID_GEN alone, isolates historical associations.
   */
  private seedPianiPersStorico(prior: ISampleSpreadsheet): void {
    const rows: Array<{ tipo: string; studente: string; classe: string }> = [
      {
        tipo: 'PEI',
        studente: PIANO_DOPPIO_STUDENTE,
        classe: classePrecedente(CLASSE_B)
      },
      {
        tipo: 'PDP_BES',
        studente: PIANO_DOPPIO_STUDENTE,
        classe: classePrecedente(CLASSE_B)
      }
    ];
    for (const { tipo, studente, classe } of rows) {
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
        [COL_LOG_DOCS.CLASSI]: classe,
        [COL_LOG_DOCS.UTENTI]: studente,
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
      [COL_CONF_DOC.REGISTRA_FOLD]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
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
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: classRegistration,
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
        utenti: '{{#focus.classe.coordinatori}}{{email}},{{/focus.classe.coordinatori}}',
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
        'E2E_Piano_{{focus.piano.tipo}}_{{focus.alunno.anagrafica.nomeCompleto}}',
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
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
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
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
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
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#C62828',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
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
              '<li><strong>{{corrente.sottotipo}}</strong> — {{corrente.studente.nomeCompleto}}: <a href="{{corrente.link}}" target="_blank">{{corrente.nome}}</a>{{#storico}}<br><span style="color:#666;">Disponibile anche il piano dell\'anno precedente: <a href="{{link}}" target="_blank">{{nome}}</a> ({{anno}})</span>{{/storico}}</li>'
          }
        },
        { TIPO_BOX: 'piani_pers_inviati' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>Piani personalizzati nuovi e già notificati.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
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
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_STATIC_ALLEGATO,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Allegato statico di prova',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>Messaggio con allegato statico di prova.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
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
    testMode: boolean,
    priorSampleSpreadsheetId: string
  ): void {
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2026-2027',
      [COL_MASTER.ID_SPREADSHEET]: sampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local',
      [COL_MASTER.TEST_MODE]: testMode
    });
    // Historical row (13 §1): MUST come after the current year's — the sheet
    // stays in descending-year order (MasterSheetRepository.ts: "first row is
    // always the current year, no computation").
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2025-2026',
      [COL_MASTER.ID_SPREADSHEET]: priorSampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local',
      [COL_MASTER.TEST_MODE]: testMode
    });
  }
}
