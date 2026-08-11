import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../SampleDatabaseBuilder';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { E2eTemplateIds } from './SharedTestContracts';
import { HEADERS } from './SharedTestHeaders';
import type { IArtifactFactory, SheetValueUpdate } from '../E2eTemplateProvisioner';
import {
  ANNI_PRECEDENTI,
  CONF_DOC_JOBRUNNER,
  CONF_DOC_STORICO,
  CONF_DOC_TABELLE,
  CONF_IMP_ASL_CARTELLE,
  CONF_IMP_CERCA_DOCUMENTI,
  CONF_IMP_CHUNKED,
  CONF_MAIL_JOBRUNNER,
  CONF_MAIL_STORICO,
  EMAIL_TEST_SAFE
} from './fixtures';
import { e2eAlunnoEmail } from './fixtures';
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
const ASL_ELIGIBLE_CLASSES = ['3C', '3C-S', '3C-C', '5B', '5B-S', '5B-C'] as const;
const ASL_STUDENT_BY_CLASS: Record<(typeof ASL_ELIGIBLE_CLASSES)[number], string> = {
  '3C': e2eAlunnoEmail(138),
  '3C-S': e2eAlunnoEmail(43),
  '3C-C': e2eAlunnoEmail(51),
  '5B': e2eAlunnoEmail(127),
  '5B-S': e2eAlunnoEmail(139),
  '5B-C': e2eAlunnoEmail(161)
};
const CONF_DOC_CERCA_DOCUMENTI_SOURCE = 'E2E_DOC_SOURCE_IMPORT';

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
  for (const anno of ANNI_PRECEDENTI) {
    const prior = spreadsheets.createSpreadsheet(`_ALDO_E2E_PRIOR_${anno}`);
    for (const table of HISTORICAL_TABLES) {
      prior.addSheet(table, HEADERS[table]!);
    }
    seedStorico(prior, anno);
    master.appendRow(TABLE.MASTER, {
      [COL_MASTER.ANNO_SCOLASTICO]: anno,
      [COL_MASTER.ID_SPREADSHEET]: prior.id,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: rootFolderId,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: 'Dirigente E2E',
      [COL_MASTER.SUPERVISORE_EMAIL]: EMAIL_TEST_SAFE,
      [COL_MASTER.TEST_MODE]: true
    });
    seeded.push({ anno, id: prior.id, url: prior.getUrl(), spreadsheet: prior });
  }
  return seeded;
}

/** Seeds every table read by the historical CDU providers for one school year. */
export function seedStorico(prior: ISampleSpreadsheet, anno: string): void {
  const classe = anno === ANNI_PRECEDENTI[0] ? '2C' : '1C';
  const alunno = e2eAlunnoEmail(138);
  const ritirato = e2eAlunnoEmail(139);
  const docente = `docente.storico.${anno.replace('-', '.')}@onlinetest.aldo.local`;

  prior.appendRow(TABLE.CLASSI, {
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
    [COL_CLASSI.STORICO]: ''
  });
  prior.appendRow(TABLE.ALUNNI, {
    [COL_ALUNNI.EMAIL]: alunno,
    [COL_ALUNNI.COGNOMENOME]: `Alunno Promosso ${anno}`,
    [COL_ALUNNI.CLASSE]: classe,
    [COL_ALUNNI.RELIGIONE]: 'IRC',
    [COL_ALUNNI.CURRICULUM]: '',
    [COL_ALUNNI.ATTIVO]: true,
    [COL_ALUNNI.RIPETENTE]: false,
    [COL_ALUNNI.RAPPR_STUD]: false,
    [COL_ALUNNI.RAPPR_GEN]: '',
    [COL_ALUNNI.TUTOR_1]: EMAIL_TEST_SAFE,
    [COL_ALUNNI.TUTOR_2]: '',
    [COL_ALUNNI.NOTE]: 'promosso'
  });
  prior.appendRow(TABLE.ALUNNI, {
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
  });
  prior.appendRow(TABLE.DOCENTI, {
    [COL_DOCENTI.EMAIL]: docente,
    [COL_DOCENTI.COGNOME]: 'Storico',
    [COL_DOCENTI.NOME]: 'Docente',
    [COL_DOCENTI.GENERE]: 'F',
    [COL_DOCENTI.DIPART]: 'DIPART_STORICO',
    [COL_DOCENTI.ITP]: false
  });
  prior.appendRow(TABLE.MATERIE, {
    [COL_MATERIE.ID]: 'GST',
    [COL_MATERIE.NOME]: 'Geostoria',
    [COL_MATERIE.SINTESI]: 'GST',
    [COL_MATERIE.COLORE_1]: '#1565C0',
    [COL_MATERIE.COLORE_2]: '#90CAF9',
    [COL_MATERIE.SIMBOLO]: 'G',
    [COL_MATERIE.ESAME_CFG]: '',
    [COL_MATERIE.EVOLUZIONE]: 'STO',
    [COL_MATERIE.IS_RELIGIONE_ALT]: false,
    [COL_MATERIE.PRINCIPALE]: '',
    [COL_MATERIE.SPECIFICITA]: ''
  });
  prior.appendRow(TABLE.CARENZE, {
    [COL_CARENZE.STUDENTE]: alunno,
    [COL_CARENZE.PROGRESSIVO]: 1,
    [COL_CARENZE.CLASSE]: classe,
    [COL_CARENZE.DATA]: `${anno.slice(0, 4)}-06-10`,
    [COL_CARENZE.NOTIFICATO]: '',
    [COL_CARENZE.ASSENZE]: 2,
    [COL_CARENZE.NOTE]: 'Carenza storica',
    [COL_CARENZE.DATA_MODIFICA]: `${anno.slice(0, 4)}-06-11`
  });
  prior.appendRow(TABLE.PIANI, {
    [COL_PIANI.STUDENTE]: alunno,
    [COL_PIANI.TIPO]: 'PDP_BES',
    [COL_PIANI.PARAMETRI]: JSON.stringify({ anno, storico: true })
  });
  prior.appendRow(TABLE.MOV_ALUNNI, {
    [COL_MOV_ALUNNI.STUDENTE]: ritirato,
    [COL_MOV_ALUNNI.TIPO]: 'RITIRATO',
    [COL_MOV_ALUNNI.DATA]: `${anno.slice(0, 4)}-02-01`,
    [COL_MOV_ALUNNI.DA]: classe,
    [COL_MOV_ALUNNI.A]: ''
  });
  prior.appendRow(TABLE.PROGETTI, {
    [COL_PROGETTI.CLASSE]: classe,
    [COL_PROGETTI.TIPO]: 'ASL',
    [COL_PROGETTI.NOME]: `ASL storico ${anno}`,
    [COL_PROGETTI.REFERENTE]: docente,
    [COL_PROGETTI.ORE]: 30,
    [COL_PROGETTI.ORE_ASL]: 20
  });
  prior.appendRow(TABLE.PROGETTI, {
    [COL_PROGETTI.CLASSE]: classe,
    [COL_PROGETTI.TIPO]: 'ORIENTAMENTO',
    [COL_PROGETTI.NOME]: `Orientamento storico ${anno}`,
    [COL_PROGETTI.REFERENTE]: '',
    [COL_PROGETTI.ORE]: 8,
    [COL_PROGETTI.ORE_ASL]: 0
  });
  prior.appendRow(TABLE.LOG_DOCS, {
    [COL_LOG_DOCS.ID]: `LOG_STORICO_${anno}`,
    [COL_LOG_DOCS.ID_GEN]: CONF_DOC_STORICO,
    [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
    [COL_LOG_DOCS.SOTTOTIPO]: 'PDP_BES',
    [COL_LOG_DOCS.NOME]: `Piano storico ${anno}`,
    [COL_LOG_DOCS.STATO]: 'GENERATO',
    [COL_LOG_DOCS.NOTIFICATO]: '',
    [COL_LOG_DOCS.PATH]: `_ALDO_E2E_ROOT/STORICO/${anno}`,
    [COL_LOG_DOCS.LINK]: `https://drive.google.com/file/d/LOG_STORICO_${anno}/edit`,
    [COL_LOG_DOCS.CLASSI]: classe,
    [COL_LOG_DOCS.UTENTI]: alunno,
    [COL_LOG_DOCS.MATERIE]: 'GST',
    [COL_LOG_DOCS.DATA_CREAZ]: `${anno.slice(0, 4)}-06-15T09:00:00.000Z`,
    [COL_LOG_DOCS.ID_ORIG]: ''
  });
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
  for (let index = 0; index < ASL_ELIGIBLE_CLASSES.length; index += 1) {
    const classe = ASL_ELIGIBLE_CLASSES[index]!;
    const folderPath = `_ALDO_E2E_ROOT/ASL/${classe}`;
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
    sample.appendRow(TABLE.LOG_FOLD, {
      [COL_LOG_FOLD.ID]: folderId,
      [COL_LOG_FOLD.TIPO]: ASL_FOLDER_TYPE,
      [COL_LOG_FOLD.NOME]: `ASL ${classe}`,
      [COL_LOG_FOLD.PATH]: folderPath,
      [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${folderId}`,
      [COL_LOG_FOLD.CLASSI]: classe,
      [COL_LOG_FOLD.UTENTI]: '',
      [COL_LOG_FOLD.MATERIE]: ''
    });
    seeded.push({ classe, folderId, url: `https://drive.google.com/drive/folders/${folderId}` });
    sample.appendRow(TABLE.ASL, {
      [COL_ASL.STUDENTE]: knownStudent,
      [COL_ASL.ANNO]: '2026-2027',
      [COL_ASL.ORE]: ore
    });
  }

  const nonEligibleFolder = drive.createFolder('_ALDO_E2E_ROOT/ASL/2B_DECOY');
  const nonEligibleDecoy = artifacts.createSheet(
    'ASL_2B_NON_ELEGGIBILE_TRASHED',
    nonEligibleFolder,
    aslDataUpdates(e2eAlunnoEmail(21), 99)
  );
  drive.deleteFile(nonEligibleDecoy);
  sample.appendRow(TABLE.ASL, {
    [COL_ASL.STUDENTE]: 'sconosciuto@onlinetest.aldo.local',
    [COL_ASL.ANNO]: '2026-2027',
    [COL_ASL.ORE]: 99
  });
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
  return [
    ...aslHeaderUpdates(),
    { range: `A2:C${rows.length + 1}`, values: rows }
  ];
}

/** Adds document, import, and email configurations unique to the extended E2E dataset. */
export function seedConfDedicated(sample: ISampleSpreadsheet, templateIds: E2eTemplateIds): void {
  sample.appendRow(TABLE.CONF_DOC, {
    [COL_CONF_DOC.ID]: CONF_DOC_JOBRUNNER,
    [COL_CONF_DOC.TIPO]: 'PIANO_PERS',
    [COL_CONF_DOC.GENERATORE]: 'DOC_PERSONALIZZATO',
    [COL_CONF_DOC.CONDIZIONE]: '',
    [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.piani.PDP_BES }),
    [COL_CONF_DOC.FILE_NAME]: 'E2E_JobRunner_{{focus.alunno.anagrafica.nomeCompleto}}',
    [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_ROOT/OUTPUT/JOBRUNNER_DOC',
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
  });
  sample.appendRow(TABLE.CONF_DOC, {
    [COL_CONF_DOC.ID]: CONF_DOC_CERCA_DOCUMENTI_SOURCE,
    [COL_CONF_DOC.TIPO]: 'E2E_IMPORT_SOURCE',
    [COL_CONF_DOC.GENERATORE]: 'FOGLIO_GENERICO',
    [COL_CONF_DOC.CONDIZIONE]: '',
    [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.aslImportSheet }),
    [COL_CONF_DOC.FILE_NAME]: 'E2E_ImportSource_{{focus.classe.anagrafica.nome}}',
    [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_ROOT/OUTPUT/IMPORT_SOURCE',
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
  });
  sample.appendRow(TABLE.CONF_DOC, {
    [COL_CONF_DOC.ID]: CONF_DOC_TABELLE,
    [COL_CONF_DOC.TIPO]: 'E2E_TABELLE',
    [COL_CONF_DOC.GENERATORE]: 'DOCUMENTO_CON_TABELLE_IMPORTATE',
    [COL_CONF_DOC.CONDIZIONE]: '',
    [COL_CONF_DOC.MODELLI]: JSON.stringify({ templateId: templateIds.docComplesso }),
    [COL_CONF_DOC.FILE_NAME]: 'E2E_Tabelle_{{focus.classe.anagrafica.nome}}',
    [COL_CONF_DOC.PATH_OUT]: '_ALDO_E2E_ROOT/OUTPUT/TABELLE_IMPORTATE',
    [COL_CONF_DOC.DUPLICAZIONE]: 'NEGATA',
    [COL_CONF_DOC.PERMESSI]: '',
    [COL_CONF_DOC.POST_PROCESSO]: null,
    [COL_CONF_DOC.PARAMETRI]: '',
    [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
    [COL_CONF_DOC.REGISTRA_DOC]: JSON.stringify({
      classi: '{{focus.classe.anagrafica.nome}}',
      utenti: '',
      materie: ''
    }),
    [COL_CONF_DOC.REGISTRA_FOLD]: '{}'
  });

  sample.appendRow(TABLE.CONF_IMP, {
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
  });
  sample.appendRow(TABLE.CONF_IMP, {
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
  });
  sample.appendRow(TABLE.CONF_IMP, {
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
  });

  for (const [id, path, subject] of [
    [CONF_MAIL_JOBRUNNER, '_ALDO_E2E_ROOT/OUTPUT/MAIL_JOBRUNNER', 'JobRunner'],
    [CONF_MAIL_STORICO, '_ALDO_E2E_ROOT/OUTPUT/MAIL_STORICO', 'Storico']
  ] as const) {
    sample.appendRow(TABLE.CONF_MAIL, {
      [COL_CONF_MAIL.ID]: id,
      [COL_CONF_MAIL.OGGETTO]: `[E2E] ${subject}`,
      [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
      [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
        { TIPO_BOX: 'documenti', PATH_OUT: path, destinatari: [EMAIL_TEST_SAFE] }
      ]),
      [COL_CONF_MAIL.TESTO]: `<p>Scenario ${subject}: ${EMAIL_TEST_SAFE}</p>`,
      [COL_CONF_MAIL.SUPPLENTI]: false,
      [COL_CONF_MAIL.NOREPLY]: false,
      [COL_CONF_MAIL.COLORE_HEADER]: '#1565C0',
      [COL_CONF_MAIL.CONDIZIONE]: '',
      [COL_CONF_MAIL.POST_PROCESSO]: null,
      [COL_CONF_MAIL.DUPLICAZIONE]: 'NEGATA',
      [COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE]: 'COMPLETA',
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    });
  }
}
