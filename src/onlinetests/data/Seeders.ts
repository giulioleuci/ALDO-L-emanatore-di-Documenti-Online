import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from '../SampleDatabaseBuilder';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { E2eTemplateIds } from './SharedTestContracts';
import { HEADERS } from './SharedTestHeaders';
import type { IArtifactFactory, SheetValueUpdate } from '../E2eTemplateProvisioner';
import {
  ANNI_PRECEDENTI,
  CONF_DOC_CERCA_DOCUMENTI_SOURCE,
  CONF_DOC_DUPLICAZIONE_PERMESSA,
  CONF_DOC_JOBRUNNER,
  CONF_DOC_DOTTED,
  CONF_DOC_STORICO,
  CONF_DOC_TABELLE,
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
  CONF_MAIL_JOBRUNNER,
  CONF_MAIL_STORICO,
  EMAIL_TEST_SAFE
} from './fixtures';
import { e2eAlunnoEmail, e2eDocenteEmail } from './fixtures';
import { buildMaterieRows } from './SharedTestDatabaseBuilder';
import {
  COL_ALUNNI,
  COL_ASL,
  COL_CARENZE,
  COL_CLASSI,
  COL_CONF_DOC,
  COL_CONF_IMP,
  COL_CONF_MAIL,
  COL_DOCENTI,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_MASTER,
  COL_MATERIE,
  COL_MOV_ALUNNI,
  COL_PIANI,
  COL_PROGETTI,
  TABLE
} from '../../config/schema';

const HISTORICAL_TABLES = [
  TABLE.CLASSI,
  TABLE.ALUNNI,
  TABLE.DOCENTI,
  TABLE.MATERIE,
  TABLE.CARENZE,
  TABLE.PIANI,
  TABLE.MOV_ALUNNI,
  TABLE.PROGETTI,
  TABLE.LOG_DOCS
] as const;

const ASL_FOLDER_TYPE = 'E2E_ASL_CARTELLE';
const FILTER_DECOY_FOLDER_TYPE = 'E2E_FILTER_DECOY';
const ASL_ELIGIBLE_CLASSES = ['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C'] as const;
const ASL_STUDENT_BY_CLASS: Record<(typeof ASL_ELIGIBLE_CLASSES)[number], string> = {
  '3C': e2eAlunnoEmail(138),
  '3C-S': e2eAlunnoEmail(43),
  '3C-C': e2eAlunnoEmail(51),
  '5B': e2eAlunnoEmail(127),
  '5B-S': e2eAlunnoEmail(139),
  '5B-C': e2eAlunnoEmail(161)
};
/**
 * Creates both prior-year databases through the existing spreadsheet factory.
 * A spreadsheet handle cannot create sibling spreadsheets, so the factory is
 * deliberately explicit rather than hidden behind an unsafe cast.
 */
export interface SeededPriorDatabase {
  anno: string;
  id: string;
  url: string;
  spreadsheet: ISampleSpreadsheet;
}

export function seedAnniPrecedenti(
  master: ISampleSpreadsheet,
  spreadsheets: ISampleSpreadsheetFactory,
  rootFolderId: string
): SeededPriorDatabase[] {
  const seeded: SeededPriorDatabase[] = [];
  const masterRows: Array<Record<string, unknown>> = [];
  for (const anno of ANNI_PRECEDENTI) {
    const prior = spreadsheets.createSpreadsheet(`_ALDO_E2E_PRIOR_${anno}`);
    for (const table of HISTORICAL_TABLES) {
      // GST is a storico-only subject: it existed in past years' catalogs before
      // evolving into STO (MATERIE.EVOLUZIONE), so prior CLASSI sheets carry a
      // GST cattedra column even though ASSIGNMENT_COLUMNS_E2E never declares
      // one. Without it, SampleSpreadsheetBuilder.appendRows silently drops the
      // GST value written by seedStorico (keys outside the declared header).
      prior.addSheet(table, table === TABLE.CLASSI ? [...HEADERS[table]!, 'GST'] : HEADERS[table]!);
    }
    seedStorico(prior, anno);
    masterRows.push({
      [COL_MASTER.ANNO_SCOLASTICO]: anno,
      [COL_MASTER.ID_SPREADSHEET]: prior.id,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: rootFolderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: EMAIL_TEST_SAFE,
      [COL_MASTER.TEST_MODE]: true
    });
    seeded.push({ anno, id: prior.id, url: prior.getUrl(), spreadsheet: prior });
  }
  master.appendRows(TABLE.MASTER, masterRows);
  return seeded;
}

/** Seeds every table read by the historical CDU providers for one school year. */
export function seedStorico(prior: ISampleSpreadsheet, anno: string): void {
  const classe = anno === ANNI_PRECEDENTI[0] ? '2C' : '1C';
  const dottedClasse = anno === ANNI_PRECEDENTI[0] ? '3A' : '2A';
  const dottedMain = anno === ANNI_PRECEDENTI[0] ? 5 : 12;
  const dottedItp = anno === ANNI_PRECEDENTI[0] ? 11 : 13;
  const alunno = e2eAlunnoEmail(138);
  const ritirato = e2eAlunnoEmail(139);
  const docente = `docente.storico.${anno.replace('-', '.')}@onlinetest.aldo.local`;

  prior.appendRows(TABLE.CLASSI, [
    {
      [COL_CLASSI.ID]: classe,
      [COL_CLASSI.ANNO]: Number(classe.charAt(0)),
      [COL_CLASSI.INDIRIZZO]: 'IND_SCIENTIFICO',
      [COL_CLASSI.ARTICOLAZIONE]: '',
      [COL_CLASSI.RUOLI]: '',
      [COL_CLASSI.ATTIVA]: true,
      [COL_CLASSI.COORD]: docente,
      [COL_CLASSI.IRC]: '',
      [COL_CLASSI.ALT]: '',
      [COL_CLASSI.SEZ]: 'C',
      [COL_CLASSI.TERMINALE]: false,
      [COL_CLASSI.STORICO]: '',
      MAT: e2eDocenteEmail(1),
      GST: e2eDocenteEmail(4),
      INF: e2eDocenteEmail(4),
      'INF.itp': anno === ANNI_PRECEDENTI[0] ? e2eDocenteEmail(11) : ''
    },
    {
      [COL_CLASSI.ID]: dottedClasse,
      [COL_CLASSI.ANNO]: Number(dottedClasse.charAt(0)),
      [COL_CLASSI.INDIRIZZO]: 'IND_CLASSICO',
      [COL_CLASSI.ARTICOLAZIONE]: '',
      [COL_CLASSI.RUOLI]: '',
      [COL_CLASSI.ATTIVA]: true,
      [COL_CLASSI.COORD]: e2eDocenteEmail(dottedMain),
      [COL_CLASSI.IRC]: '',
      [COL_CLASSI.ALT]: '',
      [COL_CLASSI.SEZ]: 'A',
      [COL_CLASSI.TERMINALE]: false,
      [COL_CLASSI.STORICO]: '',
      'INTERPRET.CHITARRA': e2eDocenteEmail(dottedMain),
      'INTERPRET.CHITARRA.itp': e2eDocenteEmail(dottedItp)
    }
  ]);
  prior.appendRows(TABLE.ALUNNI, [
    {
      [COL_ALUNNI.EMAIL]: alunno,
      [COL_ALUNNI.COGNOMENOME]: `Alunno Promosso ${anno}`,
      [COL_ALUNNI.CLASSE]: classe,
      [COL_ALUNNI.RELIGIONE]: 'IRC',
      [COL_ALUNNI.CURRICULUM]: '',
      [COL_ALUNNI.ATTIVO]: true,
      // RIPETENTE on the MORE RECENT prior year (ANNI_PRECEDENTI[0]) is what
      // StoricoAlunniService reads to derive the OLDER prior year's esito
      // (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2): true here makes the older
      // year resolve to NON_PROMOSSO, while this year's own esito is resolved
      // from the CURRENT year's ALUNNI.RIPETENTE (false — 138 is not in
      // SharedTestDatabaseBuilder's RIPETENTE_1A/RIPETENTE_3C list), so this
      // year itself still resolves to PROMOSSO. See storicoChecks.ts's
      // assertAlunnoStorico for the exact expected esito-per-anno signature.
      [COL_ALUNNI.RIPETENTE]: anno === ANNI_PRECEDENTI[0],
      [COL_ALUNNI.RAPPR_STUD]: false,
      [COL_ALUNNI.RAPPR_GEN]: '',
      [COL_ALUNNI.TUTOR_1]: EMAIL_TEST_SAFE,
      [COL_ALUNNI.TUTOR_2]: '',
      [COL_ALUNNI.NOTE]: 'promosso'
    },
    {
      [COL_ALUNNI.EMAIL]: ritirato,
      [COL_ALUNNI.COGNOMENOME]: `Alunno Ritirato ${anno}`,
      [COL_ALUNNI.CLASSE]: classe,
      [COL_ALUNNI.RELIGIONE]: 'IRC',
      [COL_ALUNNI.CURRICULUM]: '',
      [COL_ALUNNI.ATTIVO]: false,
      [COL_ALUNNI.RIPETENTE]: false,
      [COL_ALUNNI.RAPPR_STUD]: false,
      [COL_ALUNNI.RAPPR_GEN]: '',
      [COL_ALUNNI.TUTOR_1]: EMAIL_TEST_SAFE,
      [COL_ALUNNI.TUTOR_2]: '',
      [COL_ALUNNI.NOTE]: 'ritirato'
    }
  ]);
  const docenti: Array<Record<string, unknown>> = [
    {
      [COL_DOCENTI.EMAIL]: docente,
      [COL_DOCENTI.COGNOME]: 'Storico',
      [COL_DOCENTI.NOME]: 'Docente',
      [COL_DOCENTI.GENERE]: 'F',
      [COL_DOCENTI.DIPART]: 'DIPART_STORICO',
      [COL_DOCENTI.ITP]: false
    }
  ];
  const historicalTeachers = new Map<number, boolean>([
    [1, false],
    [4, false],
    [dottedMain, false],
    [dottedItp, true]
  ]);
  if (anno === ANNI_PRECEDENTI[0]) historicalTeachers.set(11, true);
  for (const [index, isItp] of historicalTeachers) {
    docenti.push({
      [COL_DOCENTI.EMAIL]: e2eDocenteEmail(index),
      [COL_DOCENTI.COGNOME]: `Continuita${index}`,
      [COL_DOCENTI.NOME]: 'Docente',
      [COL_DOCENTI.GENERE]: index % 2 === 0 ? 'F' : 'M',
      [COL_DOCENTI.DIPART]: 'DIPART_STORICO',
      [COL_DOCENTI.ITP]: isItp
    });
  }
  prior.appendRows(TABLE.DOCENTI, docenti);
  prior.appendRows(TABLE.MATERIE, [
    {
      [COL_MATERIE.ID]: 'GST',
      [COL_MATERIE.NOME]: 'Geostoria',
      [COL_MATERIE.SINTESI]: 'GST',
      [COL_MATERIE.COLORE_1]: '#1565C0',
      [COL_MATERIE.COLORE_2]: '#90CAF9',
      [COL_MATERIE.SIMBOLO]: 'G',
      [COL_MATERIE.ESAME_CFG]: '',
      [COL_MATERIE.EVOLUZIONE]: '',
      [COL_MATERIE.IS_RELIGIONE_ALT]: false,
      [COL_MATERIE.PRINCIPALE]: '',
      [COL_MATERIE.SPECIFICITA]: ''
    },
    // The prior-year CLASSI rows below carry the same header as the current-year sheet
    // (MAT, GST, INF, INF.itp, INTERPRET.CHITARRA[.itp]), and ClasseRepository builds its
    // cattedra-column map from MATERIE: a subject missing here makes its column invisible,
    // so the storico continuity providers silently lose the INF titolare/ITP
    // (2026-08-21 batch 3). Seed the full current-year catalog — buildMaterieRows already
    // carries STO's EVOLUZIONE mapping — and keep GST, which is storico-only.
    ...buildMaterieRows()
  ]);
  prior.appendRows(TABLE.CARENZE, [
    {
      [COL_CARENZE.STUDENTE]: alunno,
      [COL_CARENZE.PROGRESSIVO]: 1,
      [COL_CARENZE.CLASSE]: classe,
      [COL_CARENZE.DATA]: `${anno.slice(0, 4)}-06-10`,
      [COL_CARENZE.NOTIFICATO]: '',
      [COL_CARENZE.ASSENZE]: 2,
      [COL_CARENZE.NOTE]: 'Carenza storica',
      [COL_CARENZE.DATA_MODIFICA]: `${anno.slice(0, 4)}-06-11`,
      GST: anno === ANNI_PRECEDENTI[0] ? 4 : 5
    }
  ]);
  prior.appendRows(TABLE.PIANI, [
    {
      [COL_PIANI.STUDENTE]: alunno,
      [COL_PIANI.TIPO]: 'PDP_BES',
      [COL_PIANI.PARAMETRI]: JSON.stringify({ anno, storico: true })
    }
  ]);
  // TIPO=RITIRATO (not OUT): this student withdrew from studies entirely
  // (ATTIVO=false, NOTE='ritirato'), not transferred to another institute —
  // see 03_VALUE_OBJECTS_ED_ENUM.md's TipoMovimento split.
  prior.appendRows(TABLE.MOV_ALUNNI, [
    {
      [COL_MOV_ALUNNI.STUDENTE]: ritirato,
      [COL_MOV_ALUNNI.TIPO]: 'RITIRATO',
      [COL_MOV_ALUNNI.DATA]: `${anno.slice(0, 4)}-02-01`,
      [COL_MOV_ALUNNI.DA]: classe,
      [COL_MOV_ALUNNI.A]: ''
    },
    // Deliberately inert: CAMBIO never drives esito under the RIPETENTE-based
    // algorithm (it's an internal same-year section change, structurally
    // incapable of signalling promotion). Kept here as noise proving the
    // algorithm ignores it, same as the ALDO unit test fixtures.
    {
      [COL_MOV_ALUNNI.STUDENTE]: alunno,
      [COL_MOV_ALUNNI.TIPO]: 'CAMBIO',
      [COL_MOV_ALUNNI.DATA]: `${anno.slice(0, 4)}-06-30`,
      [COL_MOV_ALUNNI.DA]: classe,
      [COL_MOV_ALUNNI.A]: anno === ANNI_PRECEDENTI[0] ? '3C' : '1C'
    }
  ]);
  prior.appendRows(TABLE.PROGETTI, [
    {
      [COL_PROGETTI.CLASSE]: classe,
      [COL_PROGETTI.TIPO]: 'ASL',
      [COL_PROGETTI.NOME]: `ASL storico ${anno}`,
      [COL_PROGETTI.REFERENTE]: docente,
      [COL_PROGETTI.ORE]: 30,
      [COL_PROGETTI.ORE_ASL]: 20
    },
    {
      [COL_PROGETTI.CLASSE]: classe,
      [COL_PROGETTI.TIPO]: 'ORIENTAMENTO',
      [COL_PROGETTI.NOME]: `Orientamento storico ${anno}`,
      [COL_PROGETTI.REFERENTE]: `Esperto Esterno ${anno}`,
      [COL_PROGETTI.ORE]: 8,
      [COL_PROGETTI.ORE_ASL]: 0
    }
  ]);
  const logDocs: Array<Record<string, unknown>> = [
    {
      [COL_LOG_DOCS.ID]: `LOG_STORICO_${anno}`,
      [COL_LOG_DOCS.ID_GEN]: CONF_DOC_STORICO,
      [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
      [COL_LOG_DOCS.SOTTOTIPO]: 'PDP_BES',
      [COL_LOG_DOCS.NOME]: `Piano storico ${anno}`,
      [COL_LOG_DOCS.STATO]: 'GENERATO',
      [COL_LOG_DOCS.NOTIFICATO]: '',
      [COL_LOG_DOCS.PATH]: `_ALDO_E2E_OUTPUT/STORICO/${anno}`,
      [COL_LOG_DOCS.LINK]: `https://drive.google.com/file/d/LOG_STORICO_${anno}/edit`,
      [COL_LOG_DOCS.CLASSI]: classe,
      [COL_LOG_DOCS.UTENTI]: alunno,
      [COL_LOG_DOCS.MATERIE]: 'GST',
      [COL_LOG_DOCS.DATA_CREAZ]: `${anno.slice(0, 4)}-06-15T09:00:00.000Z`,
      [COL_LOG_DOCS.ID_ORIG]: ''
    }
  ];
  if (anno === ANNI_PRECEDENTI[1]) {
    for (const sottotipo of ['PEI', 'PDP_BES']) {
      logDocs.push({
        [COL_LOG_DOCS.ID]: `E2E_FAKE_LOGDOC_${sottotipo}_2024_2025`,
        [COL_LOG_DOCS.ID_GEN]: 'PIANI_PERSONALIZZATI',
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: sottotipo,
        [COL_LOG_DOCS.NOME]: `E2E Piano ${sottotipo} storico 2024-2025`,
        [COL_LOG_DOCS.STATO]: 'GENERATO',
        [COL_LOG_DOCS.NOTIFICATO]: '',
        [COL_LOG_DOCS.PATH]: '_ALDO_E2E_OUTPUT/STORICO/2024-2025',
        [COL_LOG_DOCS.LINK]: `https://drive.google.com/file/d/E2E_FAKE_${sottotipo}_2024_2025/edit`,
        [COL_LOG_DOCS.CLASSI]: '1B',
        [COL_LOG_DOCS.UTENTI]: e2eAlunnoEmail(25),
        [COL_LOG_DOCS.MATERIE]: '',
        [COL_LOG_DOCS.DATA_CREAZ]: '2024-11-10T09:00:00.000Z',
        [COL_LOG_DOCS.ID_ORIG]: ''
      });
    }
  }
  prior.appendRows(TABLE.LOG_DOCS, logDocs);
}

/**
 * Registers ASL source folders and their real spreadsheet artifacts. The drive
 * facade owns all Drive mutation; no native GAS globals are used here.
 */
export function seedLogFold(
  sample: ISampleSpreadsheet,
  drive: IDriveFacade,
  artifacts: IArtifactFactory
): SeededLogFold[] {
  const seeded: SeededLogFold[] = [];
  const logFoldRows: Array<Record<string, unknown>> = [];
  const aslRows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < ASL_ELIGIBLE_CLASSES.length; index += 1) {
    const classe = ASL_ELIGIBLE_CLASSES[index]!;
    const folderPath = `_ALDO_E2E_ASL/${classe}`;
    const folderId = drive.createFolder(folderPath);
    const ore = 12 + index * 7;
    const knownStudent = ASL_STUDENT_BY_CLASS[classe];
    artifacts.createSheet(
      `ASL_${classe}_${ore}_ORE_DATI`,
      folderId,
      aslDataUpdates(knownStudent, ore)
    );
    artifacts.createSheet(`ASL_${classe}_HEADER_ONLY`, folderId, aslHeaderUpdates());
    const decoy = artifacts.createSheet(`ASL_${classe}_TRASHED`, folderId, aslHeaderUpdates());
    drive.deleteFile(decoy);
    logFoldRows.push({
      [COL_LOG_FOLD.ID]: folderId,
      [COL_LOG_FOLD.ID_GEN]: ASL_FOLDER_TYPE,
      [COL_LOG_FOLD.NOME]: `ASL ${classe}`,
      [COL_LOG_FOLD.PATH]: folderPath,
      [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${folderId}`,
      [COL_LOG_FOLD.CLASSI]: classe,
      [COL_LOG_FOLD.UTENTI]: '',
      [COL_LOG_FOLD.MATERIE]: ''
    });
    seeded.push({ classe, folderId, url: `https://drive.google.com/drive/folders/${folderId}` });
    aslRows.push({
      [COL_ASL.STUDENTE]: knownStudent,
      [COL_ASL.ANNO]: '2026-2027',
      [COL_ASL.ORE]: ore
    });
  }

  const filterDecoyPath = '_ALDO_E2E_FILTER_DECOY/1A';
  const filterDecoyId = drive.createFolder(filterDecoyPath);
  logFoldRows.push({
    [COL_LOG_FOLD.ID]: filterDecoyId,
    [COL_LOG_FOLD.ID_GEN]: FILTER_DECOY_FOLDER_TYPE,
    [COL_LOG_FOLD.NOME]: 'E2E cartella esclusa dal filtro sorgente',
    [COL_LOG_FOLD.PATH]: filterDecoyPath,
    [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${filterDecoyId}`,
    [COL_LOG_FOLD.CLASSI]: '1A',
    [COL_LOG_FOLD.UTENTI]: '',
    [COL_LOG_FOLD.MATERIE]: ''
  });

  const nonEligibleFolder = drive.createFolder('_ALDO_E2E_ASL/2B_DECOY');
  const nonEligibleDecoy = artifacts.createSheet(
    'ASL_2B_NON_ELEGGIBILE_TRASHED',
    nonEligibleFolder,
    aslDataUpdates(e2eAlunnoEmail(21), 99)
  );
  drive.deleteFile(nonEligibleDecoy);
  aslRows.push({
    [COL_ASL.STUDENTE]: 'sconosciuto@onlinetest.aldo.local',
    [COL_ASL.ANNO]: '2026-2027',
    [COL_ASL.ORE]: 99
  });
  sample.appendRows(TABLE.LOG_FOLD, logFoldRows);
  sample.appendRows(TABLE.ASL, aslRows);
  return seeded;
}

export interface SeededLogFold {
  classe: string;
  folderId: string;
  url: string;
}

function aslHeaderUpdates(): SheetValueUpdate[] {
  return [{ range: 'A1:C1', values: [['STUDENTE', 'ANNO', 'ORE']] }];
}

function aslDataUpdates(knownStudent: string, ore: number): SheetValueUpdate[] {
  const rows: unknown[][] = [
    [knownStudent, '2026-2027', ore],
    [knownStudent, '2026-2027', ore + 1],
    ['sconosciuto@onlinetest.aldo.local', '2026-2027', ore + 2]
  ];
  return [...aslHeaderUpdates(), { range: `A2:C${rows.length + 1}`, values: rows }];
}

/** Adds document, import, and email configurations unique to the extended E2E dataset. */
export function seedConfDedicated(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
  sample.appendRows(TABLE.CONF_DOC, [
    {
      [COL_CONF_DOC.ID]: CONF_DOC_STORICO,
      [COL_CONF_DOC.TIPO]: 'E2E_STORICO',
      [COL_CONF_DOC.GENERATORE]: 'ALUNNO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.storico }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Storico_{{focus.alunno.anagrafica.nomeCompleto}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/STORICO',
      [COL_CONF_DOC.DUPLICAZIONE]: 'PERMESSA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({
        includiStorico: true,
        profonditaAnniStorico: 2,
        profonditaAnniDocumenti: 2
      }),
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: '{}',
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    },
    {
      [COL_CONF_DOC.ID]: CONF_DOC_DOTTED,
      [COL_CONF_DOC.TIPO]: 'E2E_DOTTED',
      [COL_CONF_DOC.GENERATORE]: 'CLASSE',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.dotted }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Dotted_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/DOTTED',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({
        includiStorico: true,
        profonditaAnniStorico: 2
      }),
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '',
        materie: '{{#focus.classe.materie}}{{sigla}},{{/focus.classe.materie}}'
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    },
    {
      [COL_CONF_DOC.ID]: CONF_DOC_DUPLICAZIONE_PERMESSA,
      [COL_CONF_DOC.TIPO]: 'PIANO_PERS',
      [COL_CONF_DOC.GENERATORE]: 'PIANO_PERSONALIZZATO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.piani.PDP_BES }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_DuplicazionePermessa_{{focus.alunno.anagrafica.nomeCompleto}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/DUPLICAZIONE_DOCUMENTI',
      [COL_CONF_DOC.DUPLICAZIONE]: 'PERMESSA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.alunno.anagrafica.email}}',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    },
    {
      [COL_CONF_DOC.ID]: CONF_DOC_JOBRUNNER,
      [COL_CONF_DOC.TIPO]: 'PIANO_PERS',
      [COL_CONF_DOC.GENERATORE]: 'PIANO_PERSONALIZZATO',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.piani.PDP_BES }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_JobRunner_{{focus.alunno.anagrafica.nomeCompleto}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/JOBRUNNER_DOC',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ classiTarget: ['3C', '5B'] }),
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '{{focus.alunno.anagrafica.email}}',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    },
    {
      [COL_CONF_DOC.ID]: CONF_DOC_CERCA_DOCUMENTI_SOURCE,
      [COL_CONF_DOC.TIPO]: 'E2E_IMPORT_SOURCE',
      [COL_CONF_DOC.GENERATORE]: 'CLASSE',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.aslImportSheet }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_ImportSource_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/IMPORT_SOURCE',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: '',
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    },
    {
      [COL_CONF_DOC.ID]: CONF_DOC_TABELLE,
      [COL_CONF_DOC.TIPO]: 'E2E_TABELLE',
      [COL_CONF_DOC.GENERATORE]: 'CLASSE',
      [COL_CONF_DOC.CONDIZIONE]: '',
      [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.tabelleImportate }),
      [COL_CONF_DOC.FILE_NAME]: 'E2E_Tabelle_{{focus.classe.anagrafica.nome}}',
      [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_OUTPUT/TABELLE_IMPORTATE',
      [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_DOC.PERMESSI]: '',
      [COL_CONF_DOC.POST_PROCESSO]: null,
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true }),
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
        classi: '{{focus.classe.anagrafica.nome}}',
        utenti: '',
        materie: ''
      }),
      [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
    }
  ]);

  const confImpRows: Array<Record<string, unknown>> = [
    {
      [COL_CONF_IMP.ID]: CONF_IMP_ASL_CARTELLE,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'CERCA_CARTELLE_CLASSE',
        folderTipo: ASL_FOLDER_TYPE,
        hasHeaders: true,
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    },
    {
      [COL_CONF_IMP.ID]: CONF_IMP_IGNORE,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.aslImportPolicySheet,
        hasHeaders: true,
        key: 'STUDENTE',
        conflictResolution: 'IGNORE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    },
    {
      [COL_CONF_IMP.ID]: CONF_IMP_TIMESTAMP,
      [COL_CONF_IMP.TARGET]: TABLE.CARENZE,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.carenzeImportTimestampSheet,
        hasHeaders: true,
        key: 'STUDENTE',
        conflictResolution: 'TIMESTAMP',
        timestampColumn: 'DATA_MODIFICA'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    },
    {
      [COL_CONF_IMP.ID]: CONF_IMP_TIMESTAMP_FALLBACK,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.aslImportPolicySheet,
        hasHeaders: true,
        key: 'STUDENTE',
        conflictResolution: 'TIMESTAMP',
        timestampColumn: 'DATA_MODIFICA'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    },
    {
      [COL_CONF_IMP.ID]: CONF_IMP_DISABLED,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: '',
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: false
    },
    {
      [COL_CONF_IMP.ID]: CONF_IMP_NOHEADER,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: templateIds.aslImportNoHeaderSheet,
        tabName: 'Sheet1',
        range: 'A1:C1',
        hasHeaders: false,
        map: { Col_0: 'STUDENTE', Col_1: 'ANNO', Col_2: 'ORE' },
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    }
  ];
  for (const [id, config] of [
    [CONF_IMP_MISSING_FILE, { searchStrategy: 'FILE_SINGOLO' }],
    [CONF_IMP_MISSING_FOLDER, { searchStrategy: 'CERCA_CARTELLE_CLASSE' }],
    [CONF_IMP_MISSING_IDGEN, { searchStrategy: 'CERCA_DOCUMENTI' }],
    [CONF_IMP_BAD_STRATEGY, { searchStrategy: 'BAD_STRATEGY' }]
  ] as const) {
    confImpRows.push({
      [COL_CONF_IMP.ID]: id,
      [COL_CONF_IMP.TARGET]: TABLE.ASL,
      [COL_CONF_IMP.CONFIG]: JSON.stringify({
        ...config,
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      }),
      [COL_CONF_IMP.ATTIVO]: true
    });
  }
  confImpRows.push(
    ...[
      {
        [COL_CONF_IMP.ID]: CONF_IMP_CERCA_DOCUMENTI,
        [COL_CONF_IMP.TARGET]: TABLE.ASL,
        [COL_CONF_IMP.CONFIG]: JSON.stringify({
          searchStrategy: 'CERCA_DOCUMENTI',
          idGen: CONF_DOC_CERCA_DOCUMENTI_SOURCE,
          tipo: 'E2E_IMPORT_SOURCE',
          hasHeaders: true,
          key: 'STUDENTE',
          conflictResolution: 'OVERWRITE'
        }),
        [COL_CONF_IMP.ATTIVO]: true
      },
      {
        [COL_CONF_IMP.ID]: CONF_IMP_CHUNKED,
        [COL_CONF_IMP.TARGET]: TABLE.ASL,
        [COL_CONF_IMP.CONFIG]: JSON.stringify({
          searchStrategy: 'FILE_SINGOLO',
          fileId: templateIds.aslImportSheet,
          hasHeaders: true,
          key: 'STUDENTE',
          conflictResolution: 'OVERWRITE'
        }),
        [COL_CONF_IMP.ATTIVO]: true
      }
    ]
  );
  sample.appendRows(TABLE.CONF_IMP, confImpRows);

  sample.appendRows(
    TABLE.CONF_MAIL,
    (
      [
        [CONF_MAIL_JOBRUNNER, '_ALDO_E2E_OUTPUT/MAIL_JOBRUNNER', 'JobRunner'],
        [CONF_MAIL_STORICO, '_ALDO_E2E_OUTPUT/MAIL_STORICO', 'Storico']
      ] as const
    ).map(([id, path, subject]) => ({
      [COL_CONF_MAIL.ID]: id,
      [COL_CONF_MAIL.OGGETTO]: `[E2E] ${subject}`,
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'documenti', PATH_OUT: path, destinatari: [EMAIL_TEST_SAFE] }
      ]),
      [COL_CONF_MAIL.TESTO_START]:
        id === CONF_MAIL_STORICO
          ? '<p>Storico {{focus.classe.anagrafica.nome}}</p><p>{{#focus.classe.storico.statistiche}}{{annoScolastico}} {{classe}} {{statistiche.totale}}; {{/focus.classe.storico.statistiche}}</p><p>{{#focus.alunno.storico.anni}}{{annoScolastico}} {{classe}} {{esito}}; {{/focus.alunno.storico.anni}}</p>'
          : `<p>Scenario ${subject}: ${EMAIL_TEST_SAFE}</p>`,
      [COL_CONF_MAIL.TESTO_END]: '',
      [COL_CONF_MAIL.RISPONDI_A]: '',
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI_STATICI]: '[]'
    }))
  );
}
