import type { IDriveFacade } from '../infrastructure/facades/DriveServiceFacade';
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
import { ReligioneScelta } from '../domain/value-objects/enums';

/** Minimal shape of a throwaway spreadsheet handle returned by {@link ISampleSpreadsheetFactory.createSpreadsheet}. */
export interface ISampleSpreadsheet {
  id: string;
  addSheet(name: string, headerRow: string[]): void;
  appendRow(sheetName: string, row: Record<string, unknown>): void;
  getUrl(): string;
}

/**
 * Port abstracting throwaway-spreadsheet creation so {@link SampleDatabaseBuilder} is fully
 * unit-testable offline. The real `SpreadsheetApp`-backed implementation lives in
 * `GoogleApiWrapper`-only code (a later task), never here.
 */
export interface ISampleSpreadsheetFactory {
  createSpreadsheet(name: string): ISampleSpreadsheet;
}

export interface SampleDatabase {
  masterSpreadsheetId: string;
  sampleSpreadsheetId: string;
  sampleSpreadsheetUrl: string;
  sampleFolderUrl: string;
}

export const CLASSE_BASE = '4A';
export const CLASSE_PARTNER = '4A-LC';
export const DOCENTE_1 = 'docente1@onlinetest.aldo.local';
export const DOCENTE_2 = 'docente2@onlinetest.aldo.local';
export const DOCENTE_3 = 'docente3@onlinetest.aldo.local';
// MateriaId.of only accepts [A-Z]{2,10} (domain/value-objects/MateriaId.ts) — no digits.
export const MATERIA_1 = 'MAT';
export const INDIRIZZO_1 = 'IND1';
export const DIPART_1 = 'DIPART1';
export const CONF_DOC_ID = 'DOC_ONLINETEST';
export const CONF_MAIL_ID = 'MAIL_ONLINETEST';

/** Email of the `i`-th seeded ALUNNI row (1-based), matching {@link SampleDatabaseBuilder.seedAlunni}. */
export function alunnoEmail(i: number): string {
  return `alunno${i}@onlinetest.aldo.local`;
}

/** The one ALUNNI row enrolled in {@link CLASSE_PARTNER} (05_AGGREGATI_E_CLASSI_ARTICOLATE.md). */
export const ALUNNO_PARTNER_EMAIL = alunnoEmail(5);

/** Header row (in stable column order) for every non-MASTER `TABLE.*` entry, keyed by table name. */
const HEADERS: Record<string, string[]> = {
  [TABLE.ALUNNI]: Object.values(COL_ALUNNI),
  [TABLE.DOCENTI]: Object.values(COL_DOCENTI),
  // MATERIA_1 is a dynamic per-subject cattedra column (ref 06 §3), not part of
  // the fixed COL_CLASSI set — appended here so seedClassi can write the
  // CLASSI (priority 3) nominal holder that the role-resolution priority
  // chain (SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI) falls back to.
  [TABLE.CLASSI]: [...Object.values(COL_CLASSI), MATERIA_1],
  [TABLE.MATERIE]: Object.values(COL_MATERIE),
  [TABLE.INDIRIZZI]: Object.values(COL_INDIRIZZI),
  [TABLE.DIPART]: Object.values(COL_DIPART),
  [TABLE.RUOLI]: Object.values(COL_RUOLI),
  [TABLE.PIANI]: Object.values(COL_PIANI),
  [TABLE.CARENZE]: Object.values(COL_CARENZE),
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
 * Builds a throwaway, self-explanatory sample SGSA database: one sheet per `TABLE.*` (01
 * SCHEMA_DATABASE.md) with a header row from that table's `COL_*` constants, plus fixture rows
 * exercising the SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI role-resolution priority chain and an
 * articolata class pair (05_AGGREGATI_E_CLASSI_ARTICOLATE.md). See
 * docs/superpowers/specs/2026-07-11-offline-online-test-expansion-design.md §2.
 *
 * Depends only on injectable ports (`ISampleSpreadsheetFactory`, `IDriveFacade`), so it is fully
 * testable offline; the real GAS-backed factory lives elsewhere, inside `GoogleApiWrapper`-only
 * code. Every artifact it builds uses a fixed (non-timestamped) name, so `IDriveFacade
 * .createFolder`'s idempotent find-or-create and `GasSampleSpreadsheetFactory`'s
 * testContext-backed reuse (ref ALDO_GLF_AUDIT_RESULTS.md K-1) both resolve the SAME Drive
 * artifacts across repeated online-test runs instead of minting new ones every time.
 */
export class SampleDatabaseBuilder {
  constructor(
    private readonly spreadsheets: ISampleSpreadsheetFactory,
    private readonly drive: IDriveFacade
  ) {}

  build(): SampleDatabase {
    const baseName = '_ALDO_ONLINETEST';

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
    this.seedClassi(sample);
    this.seedAlunni(sample);
    this.seedSupplenzeEVariazioni(sample);
    this.seedConfDoc(sample);
    this.seedConfMail(sample);
    this.seedMaster(master, sample.id, folderId);

    return {
      masterSpreadsheetId: master.id,
      sampleSpreadsheetId: sample.id,
      sampleSpreadsheetUrl: sample.getUrl(),
      sampleFolderUrl
    };
  }

  private seedIndirizzi(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.INDIRIZZI, {
      [COL_INDIRIZZI.ID]: INDIRIZZO_1,
      [COL_INDIRIZZI.NOME]: 'Informatica e Telecomunicazioni',
      [COL_INDIRIZZI.NOME_SINTETICO]: 'INF',
      [COL_INDIRIZZI.TIPO]: 'Tecnico'
    });
  }

  private seedDipart(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.DIPART, {
      [COL_DIPART.ID]: DIPART_1,
      [COL_DIPART.NOME]: 'Dipartimento di Matematica e Informatica',
      [COL_DIPART.CAPO]: DOCENTE_1,
      [COL_DIPART.MATERIE]: MATERIA_1
    });
  }

  private seedMaterie(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.MATERIE, {
      [COL_MATERIE.ID]: MATERIA_1,
      [COL_MATERIE.NOME]: 'Matematica',
      [COL_MATERIE.SINTESI]: 'MAT',
      [COL_MATERIE.COLORE_1]: '#1565C0',
      [COL_MATERIE.COLORE_2]: '#90CAF9',
      [COL_MATERIE.SIMBOLO]: 'M',
      [COL_MATERIE.ESAME_CFG]: '',
      [COL_MATERIE.EVOLUZIONE]: ''
    });
  }

  private seedDocenti(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.DOCENTI, {
      [COL_DOCENTI.EMAIL]: DOCENTE_1,
      [COL_DOCENTI.COGNOME]: 'Rossi',
      [COL_DOCENTI.NOME]: 'Mario',
      [COL_DOCENTI.GENERE]: 'M',
      [COL_DOCENTI.DIPART]: DIPART_1,
      [COL_DOCENTI.ITP]: false
    });
    sample.appendRow(TABLE.DOCENTI, {
      [COL_DOCENTI.EMAIL]: DOCENTE_2,
      [COL_DOCENTI.COGNOME]: 'Bianchi',
      [COL_DOCENTI.NOME]: 'Laura',
      [COL_DOCENTI.GENERE]: 'F',
      [COL_DOCENTI.DIPART]: DIPART_1,
      [COL_DOCENTI.ITP]: false
    });
    sample.appendRow(TABLE.DOCENTI, {
      [COL_DOCENTI.EMAIL]: DOCENTE_3,
      [COL_DOCENTI.COGNOME]: 'Verdi',
      [COL_DOCENTI.NOME]: 'Paolo',
      [COL_DOCENTI.GENERE]: 'M',
      [COL_DOCENTI.DIPART]: DIPART_1,
      [COL_DOCENTI.ITP]: false
    });
  }

  /** 2 CLASSI rows: a plain class and its articolata partner (05_AGGREGATI_E_CLASSI_ARTICOLATE.md). */
  private seedClassi(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.CLASSI, {
      [COL_CLASSI.ID]: CLASSE_BASE,
      [COL_CLASSI.ANNO]: 4,
      [COL_CLASSI.INDIRIZZO]: INDIRIZZO_1,
      // ArticolazioneConfig.fromJson (ref 05 §2) parses ARTICOLAZIONE as JSON, not
      // a bare class id — a symmetric partner-only pair (parent: null on both
      // sides) is one of its three valid shapes (see ArticolazioneConfig.ts doc).
      [COL_CLASSI.ARTICOLAZIONE]: JSON.stringify({
        parent: null,
        partner: CLASSE_PARTNER,
        partners: null
      }),
      [COL_CLASSI.RUOLI]: '',
      [COL_CLASSI.ATTIVA]: true,
      [COL_CLASSI.COORD]: DOCENTE_1,
      [COL_CLASSI.IRC]: '',
      [COL_CLASSI.ALT]: '',
      [COL_CLASSI.SEZ]: 'A',
      [COL_CLASSI.TERMINALE]: false,
      [COL_CLASSI.STORICO]: false,
      // Priority 3 (CLASSI) nominal cattedra holder for MATERIA_1 — the base
      // the SUPPLENZE/VARIAZIONI_CATTEDRA rows below override (see
      // seedSupplenzeEVariazioni). Written to a dynamic column keyed by
      // MATERIA_1's sigla (ref 06 §3), appended to HEADERS[TABLE.CLASSI] above.
      [MATERIA_1]: DOCENTE_1
    });
    sample.appendRow(TABLE.CLASSI, {
      [COL_CLASSI.ID]: CLASSE_PARTNER,
      [COL_CLASSI.ANNO]: 4,
      [COL_CLASSI.INDIRIZZO]: INDIRIZZO_1,
      [COL_CLASSI.ARTICOLAZIONE]: JSON.stringify({
        parent: null,
        partner: CLASSE_BASE,
        partners: null
      }),
      [COL_CLASSI.RUOLI]: '',
      [COL_CLASSI.ATTIVA]: true,
      [COL_CLASSI.COORD]: DOCENTE_2,
      [COL_CLASSI.IRC]: '',
      [COL_CLASSI.ALT]: '',
      [COL_CLASSI.SEZ]: 'A',
      [COL_CLASSI.TERMINALE]: false,
      [COL_CLASSI.STORICO]: false
    });
  }

  /** 5 ALUNNI rows, 4 in the base class and 1 enrolled in the articolata partner class. */
  private seedAlunni(sample: ISampleSpreadsheet): void {
    for (let i = 1; i <= 4; i++) {
      sample.appendRow(TABLE.ALUNNI, {
        [COL_ALUNNI.EMAIL]: alunnoEmail(i),
        [COL_ALUNNI.COGNOMENOME]: `Alunno${i} Test`,
        [COL_ALUNNI.CLASSE]: CLASSE_BASE,
        [COL_ALUNNI.RELIGIONE]: ReligioneScelta.SI,
        [COL_ALUNNI.CURRICULUM]: '',
        [COL_ALUNNI.ATTIVO]: true,
        [COL_ALUNNI.RIPETENTE]: false,
        [COL_ALUNNI.RAPPR_STUD]: false,
        [COL_ALUNNI.RAPPR_GEN]: '',
        [COL_ALUNNI.TUTOR_1]: '',
        [COL_ALUNNI.TUTOR_2]: '',
        [COL_ALUNNI.NOTE]: ''
      });
    }
    sample.appendRow(TABLE.ALUNNI, {
      [COL_ALUNNI.EMAIL]: ALUNNO_PARTNER_EMAIL,
      [COL_ALUNNI.COGNOMENOME]: 'Alunno5 Test',
      [COL_ALUNNI.CLASSE]: CLASSE_PARTNER,
      [COL_ALUNNI.RELIGIONE]: ReligioneScelta.SI,
      [COL_ALUNNI.CURRICULUM]: '',
      [COL_ALUNNI.ATTIVO]: true,
      [COL_ALUNNI.RIPETENTE]: false,
      [COL_ALUNNI.RAPPR_STUD]: false,
      [COL_ALUNNI.RAPPR_GEN]: '',
      [COL_ALUNNI.TUTOR_1]: '',
      [COL_ALUNNI.TUTOR_2]: '',
      [COL_ALUNNI.NOTE]: ''
    });
  }

  /**
   * 1 SUPPLENZE + 1 VARIAZIONI_CATTEDRA row on the same class/subject/date window as the CLASSI
   * nominal assignment (`DOCENTE_1`), so the SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI priority
   * chain has a real 3-way case to resolve. The two rows deliberately name DIFFERENT teachers
   * (`DOCENTE_2` for SUPPLENZE.SUPPLENTE, `DOCENTE_3` for VARIAZIONI_CATTEDRA.NUOVO_TITOLARE) so a
   * role-resolution test asserting "SUPPLENZE wins" is load-bearing: if priority-resolution logic
   * regressed to pick VARIAZIONI_CATTEDRA (or the CLASSI fallback) instead, the resolved teacher
   * would visibly differ from DOCENTE_2.
   */
  private seedSupplenzeEVariazioni(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.SUPPLENZE, {
      [COL_SUPPLENZE.TITOLARE]: DOCENTE_1,
      [COL_SUPPLENZE.SUPPLENTE]: DOCENTE_2,
      [COL_SUPPLENZE.DAL]: '2026-07-01',
      [COL_SUPPLENZE.AL]: '2026-07-10',
      [COL_SUPPLENZE.CLASSI]: CLASSE_BASE,
      [COL_SUPPLENZE.MATERIE]: MATERIA_1
    });
    sample.appendRow(TABLE.VARIAZIONI_CATTEDRA, {
      [COL_VARIAZIONI_CATTEDRA.CLASSE_ID]: CLASSE_BASE,
      [COL_VARIAZIONI_CATTEDRA.MATERIA_ID]: MATERIA_1,
      [COL_VARIAZIONI_CATTEDRA.VECCHIO_TITOLARE]: DOCENTE_1,
      [COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE]: DOCENTE_3,
      [COL_VARIAZIONI_CATTEDRA.DATA_DECORRENZA]: '2026-07-05'
    });
  }

  private seedConfDoc(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.CONF_DOC, {
      [COL_CONF_DOC.ID]: CONF_DOC_ID,
      [COL_CONF_DOC.TIPO]: 'ONLINETEST',
      // DOCUMENTO_GENERICO (10 §9): plain {{...}} substitution, registered in
      // buildAldoContainer's strategyRegistry with no extra deps (Bootstrap.ts)
      // — 'DOC' is not a GENERATORE the registry ever knows.
      [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_GENERICO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      // Simple-form MODELLI (ConfigurazioneDocumentoRepository.resolveTemplateId,
      // ref 06 §8): a bare templateId string throws "MODELLI privo di
      // templateId" — the {"templateId": "..."} object form is required.
      [COL_CONF_DOC.MODELLI]: '{"templateId":"TEMPLATE_ONLINETEST"}',
      [COL_CONF_DOC.FILE_NAME]: `ONLINETEST_{{focus.classe.anagrafica.nome}}`,
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_ONLINETEST_OUTPUT',
      [COL_CONF_DOC.PATH_OUT_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]: '',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null, // PostProcessStep gates on `!= null`, not truthiness
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: '',
      [COL_CONF_DOC.FORMATO]: 'PDF',
      [COL_CONF_DOC.REGISTRA_UTENTI]: ''
    });
  }

  private seedConfMail(sample: ISampleSpreadsheet): void {
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: CONF_MAIL_ID,
      [COL_CONF_MAIL.OGGETTO]: '[ALDO ONLINE TEST] Notifica di prova',
      // ProcessoInvio.PER_ALUNNO (enums.ts): EmailNotificationService.enumerateTargets
      // switches on this value and has no default — 'ONLINETEST' is not a member,
      // which silently falls through to `undefined` instead of an EmailTarget[].
      [COL_CONF_MAIL.PROCESSO]: 'PER_ALUNNO',
      // ConfigurazioneEmail.getBoxes() JSON.parse()s any non-null BOX_CFG raw
      // value unconditionally (ConfigurazioneEmail.ts) — an empty string throws
      // "Unexpected end of JSON input" instead of being treated as "no boxes"
      // the way CONDIZIONE's blank-string handling is. A valid empty-array
      // literal sidesteps that regardless of how the real Sheet round-trips a
      // blank cell (empty string vs null).
      [COL_CONF_MAIL.BOX_CFG]: '[]',
      [COL_CONF_MAIL.TESTO]: 'Messaggio di prova generato dalla suite di test online ALDO.',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null // PostProcessEmailStep gates on `!= null`, not truthiness
    });
  }

  private seedMaster(
    master: ISampleSpreadsheet,
    sampleSpreadsheetId: string,
    folderId: string
  ): void {
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: '2026-2027',
      [COL_MASTER.ID_SPREADSHEET]: sampleSpreadsheetId,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: folderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente OnlineTest',
      [COL_MASTER.SUPERVISORE_EMAIL]: 'supervisore@onlinetest.aldo.local'
    });
  }
}
