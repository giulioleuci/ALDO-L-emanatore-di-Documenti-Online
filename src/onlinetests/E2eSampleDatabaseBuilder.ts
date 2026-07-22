import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';
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
export const CLASSE_C = '3C';
export const CLASSE_C_PARTNER = '3C-LC';
export const MATERIE_E2E = ['MAT', 'ITA', 'ING', 'STO'];
export const INDIRIZZO_E2E = 'IND_E2E';
export const DIPART_E2E = 'DIPART_E2E';
export const DOCENTE_COUNT = 20;

export const TIPI_PIANO = ['PDP_DSA', 'PDP_BES', 'PDP_STRANIERI', 'PEI', 'PFP'] as const;

export const CONF_DOC_VERBALE = 'E2E_VERBALE';
export const CONF_DOC_CONDOTTA = 'E2E_CONDOTTA';
export function confDocPiano(tipo: string): string {
  return `E2E_PIANO_${tipo}`;
}
export const CONF_MAIL_VERBALE = 'E2E_MAIL_VERBALE';
export const CONF_MAIL_CONDOTTA = 'E2E_MAIL_CONDOTTA';
export const CONF_MAIL_CARENZA = 'E2E_MAIL_CARENZA';
export const CONF_MAIL_PIANI = 'E2E_MAIL_PIANI';

export function e2eDocenteEmail(i: number): string {
  return `e2edocente${i}@onlinetest.aldo.local`;
}
export function e2eAlunnoEmail(i: number): string {
  return `e2ealunno${i}@onlinetest.aldo.local`;
}
export const CARENZA_ALUNNO_1 = e2eAlunnoEmail(1);
export const CARENZA_ALUNNO_2 = e2eAlunnoEmail(21);

export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}

export interface E2eSampleDatabase {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
  sampleFolderUrl: string;
  masterTestMode: boolean;
}

const HEADERS: Record<string, string[]> = {
  [TABLE.ALUNNI]: Object.values(COL_ALUNNI),
  [TABLE.DOCENTI]: Object.values(COL_DOCENTI),
  [TABLE.CLASSI]: [...Object.values(COL_CLASSI), ...MATERIE_E2E],
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

/** Class layout: id, alunni count, coordinatore index (1-based into e2eDocenteEmail), articolazione JSON. */
interface ClasseLayout {
  id: string;
  count: number;
  coordIndex: number;
  articolazione: string;
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
    this.seedConfMail(sample);
    const masterTestMode = true;
    this.seedMaster(master, sample.id, folderId, masterTestMode);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl(),
      sampleFolderUrl,
      masterTestMode
    };
  }

  private classLayouts(): ClasseLayout[] {
    return [
      { id: CLASSE_A, count: 20, coordIndex: 1, articolazione: '' },
      { id: CLASSE_B, count: 20, coordIndex: 2, articolazione: '' },
      {
        id: CLASSE_C,
        count: 8,
        coordIndex: 3,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C_PARTNER, partners: null })
      },
      {
        id: CLASSE_C_PARTNER,
        count: 12,
        coordIndex: 4,
        articolazione: JSON.stringify({ parent: null, partner: CLASSE_C, partners: null })
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
      STO: 'Storia'
    };
    MATERIE_E2E.forEach((sigla) => {
      sample.appendRow(TABLE.MATERIE, {
        [COL_MATERIE.ID]: sigla,
        [COL_MATERIE.NOME]: nomi[sigla],
        [COL_MATERIE.SINTESI]: sigla,
        [COL_MATERIE.COLORE_1]: '#1565C0',
        [COL_MATERIE.COLORE_2]: '#90CAF9',
        [COL_MATERIE.SIMBOLO]: sigla.charAt(0),
        [COL_MATERIE.ESAME_CFG]: '',
        [COL_MATERIE.EVOLUZIONE]: ''
      });
    });
  }

  /** 20 DOCENTI rows, alternating GENERE, all in the single E2E dipartimento. */
  private seedDocenti(sample: ISampleSpreadsheet): void {
    for (let i = 1; i <= DOCENTE_COUNT; i++) {
      sample.appendRow(TABLE.DOCENTI, {
        [COL_DOCENTI.EMAIL]: e2eDocenteEmail(i),
        [COL_DOCENTI.COGNOME]: `Docente${i}`,
        [COL_DOCENTI.NOME]: 'Test',
        [COL_DOCENTI.GENERE]: i % 2 === 0 ? 'F' : 'M',
        [COL_DOCENTI.DIPART]: DIPART_E2E,
        [COL_DOCENTI.ITP]: false
      });
    }
  }

  /**
   * 4 CLASSI rows (2 plain + 1 articolata pair). Cattedra assignment for each of the 4
   * MATERIE_E2E columns is a deterministic round-robin over the first 8 docenti
   * (`(classIndex * MATERIE_E2E.length + materiaIndex) % 8`, 1-based) — 4 classi x 4 materie
   * = 16 cattedra slots into 8 teachers guarantees realistic overlap (each of those 8 teaches
   * in >=1 other class besides their own), while docenti 9-20 exist in DOCENTI without a
   * CLASSI-priority cattedra (available for SUPPLENZE/VARIAZIONI_CATTEDRA and coordinatore
   * roles instead, see `seedSupplenzeEVariazioni`).
   */
  private seedClassi(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    layouts.forEach((layout, classIndex) => {
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
        [COL_CLASSI.STORICO]: false
      };
      MATERIE_E2E.forEach((sigla, materiaIndex) => {
        const docenteIndex = ((classIndex * MATERIE_E2E.length + materiaIndex) % 8) + 1;
        row[sigla] = e2eDocenteEmail(docenteIndex);
      });
      sample.appendRow(TABLE.CLASSI, row);
    });
  }

  private seedAlunni(sample: ISampleSpreadsheet, layouts: ClasseLayout[]): void {
    let counter = 1;
    for (const layout of layouts) {
      for (let n = 0; n < layout.count; n++) {
        sample.appendRow(TABLE.ALUNNI, {
          [COL_ALUNNI.EMAIL]: e2eAlunnoEmail(counter),
          [COL_ALUNNI.COGNOMENOME]: `Alunno${counter} E2E`,
          [COL_ALUNNI.CLASSE]: layout.id,
          [COL_ALUNNI.RELIGIONE]: true,
          [COL_ALUNNI.CURRICULUM]: '',
          [COL_ALUNNI.ATTIVO]: true,
          [COL_ALUNNI.RIPETENTE]: false,
          [COL_ALUNNI.RAPPR_STUD]: false,
          [COL_ALUNNI.RAPPR_GEN]: false,
          [COL_ALUNNI.TUTOR_1]: `tutor${counter}@onlinetest.aldo.local`,
          [COL_ALUNNI.TUTOR_2]: '',
          [COL_ALUNNI.NOTE]: ''
        });
        counter += 1;
      }
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
      [COL_VARIAZIONI_CATTEDRA.CLASSE_ID]: CLASSE_A,
      [COL_VARIAZIONI_CATTEDRA.MATERIA_ID]: MATERIE_E2E[0],
      [COL_VARIAZIONI_CATTEDRA.VECCHIO_TITOLARE]: e2eDocenteEmail(1),
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: e2eDocenteEmail(10),
      [COL_VARIAZIONI_CATTEDRA.DATA_DECORRENZA]: '2026-07-05'
    });
  }

  /** One PIANI row per TipoPiano (scenario 3), all for CARENZA_ALUNNO_1 (already BES-flagged by having a carenza, keeps the fixture small). */
  private seedPiani(sample: ISampleSpreadsheet): void {
    for (const tipo of TIPI_PIANO) {
      sample.appendRow(TABLE.PIANI, {
        [COL_PIANI.STUDENTE]: CARENZA_ALUNNO_1,
        [COL_PIANI.TIPO]: tipo,
        [COL_PIANI.PARAMETRI]: JSON.stringify({ note: `Piano E2E ${tipo}` })
      });
    }
  }

  private seedConfDoc(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_VERBALE,
      [COL_CONF_DOC.TIPO]: 'VERBALE',
      [COL_CONF_DOC.GENERATORE]: 'VERBALE_CDC',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.verbale }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Verbale_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GDOC'
    });
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_CONDOTTA,
      [COL_CONF_DOC.TIPO]: 'CONDOTTA',
      [COL_CONF_DOC.GENERATORE]: 'FOGLIO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.condotta }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Condotta_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'GSHEET'
    });
    for (const tipo of TIPI_PIANO) {
      sample.appendRow(TABLE.CONF_DOC, {
        [COL_CONF_DOC.ID]: confDocPiano(tipo),
        [COL_CONF_DOC.TIPO]: 'PIANO',
        [COL_CONF_DOC.GENERATORE]: 'DOC_PERSONALIZZATO',
        [COL_CONF_DOC.CONDIZIONE]: '',
        [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.piani[tipo] }),
        [COL_CONF_DOC.FILE_NAME]: `E2E_Piano_${tipo}_{{focus.alunno.anagrafica.nomeCompleto}}`,
        [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT',
        [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
        [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
        [COL_CONF_DOC.PERMESSI]: '',
        [COL_CONF_DOC.POST_PROCESSO]: null,
        [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tipoPiano: tipo }),
        [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
        [COL_CONF_DOC.FORMATO]: 'GDOC'
      });
    }
  }

  private seedConfMail(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_VERBALE,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Verbale {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>In allegato il verbale del consiglio di classe.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CONDOTTA,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Scheda condotta {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>In allegato la scheda di valutazione condotta.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_CARENZA,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Comunicazione carenza',
      [COL_CONF_MAIL.PROCESSO]: 'PER_CARENZA_GENITORI',
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: '<p>Comunichiamo una carenza rilevata per il/la vostro/a figlio/a.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#C62828',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_PIANI,
      [COL_CONF_MAIL.OGGETTO]: '[E2E] Piani personalizzati {{focus.classe.anagrafica.nome}}',
      [COL_CONF_MAIL.PROCESSO]: 'PER_COORDINATORE',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'piani_pers_da_inviare' },
        { TIPO_BOX: 'piani_pers_inviati' }
      ]),
      [COL_CONF_MAIL.TESTO]: '<p>Piani personalizzati nuovi e già notificati.</p>',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null
    });
  }

  private seedMaster(
    master: ISampleSpreadsheet,
    sampleSpreadsheetId: string,
    folderId: string,
    testMode: boolean
  ): void {
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2026/2027',
      [COL_MASTER.ID_SPREADSHEET]: sampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local',
      [COL_MASTER.TEST_MODE]: testMode
    });
  }
}
