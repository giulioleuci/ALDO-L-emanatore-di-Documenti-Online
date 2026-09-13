import {
  TABLE,
  COL_ALUNNI,
  COL_CLASSI,
  COL_DOCENTI,
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
  COL_CONF_AZIONI,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_LOG_MAIL
} from './schema';
import {
  ReligioneScelta,
  Genere,
  StatoDocumento,
  DuplicazioneDocumento,
  FormatoOutput,
  GestioneArticolazione,
  GestioneSupplenti,
  ProcessoInvio,
  StatoEmail,
  TipoPiano,
  TipoProgetto,
  TipoMovimento,
  ASSI_AZIONE
} from '../domain/value-objects/enums';

/** Tables the validator reads (every table except MASTER, which lives in another spreadsheet). */
export const VALIDATION_TABLES: string[] = Object.values(TABLE).filter((t) => t !== TABLE.MASTER);

/** Scalar cell value -> trimmed string; non-scalars (objects/arrays) never stringify meaningfully. */
function scalarString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function cell(row: Record<string, unknown>, column: string): string {
  return scalarString(row[column]).trim();
}

/** `INF.itp` -> `INF`; dotted MATERIE ids (`LAB.GRUPPO_A`) are ids, not suffixes. */
function baseMateria(columnName: string): string {
  return columnName.endsWith('.itp') ? columnName.slice(0, -4) : columnName;
}

function fk(
  id: string,
  table: string,
  column: string,
  targetTable: string,
  targetColumn: string,
  options: { csv?: boolean; allowWildcard?: boolean } = {}
): DatasetValidationRule {
  return { id, type: 'foreignKey', table, column, targetTable, targetColumn, ...options };
}

function json(table: string, column: string): DatasetValidationRule {
  return { id: `JSON_${table}_${column}`, type: 'json', table, column };
}

function required(table: string, columns: string[]): DatasetValidationRule {
  return { id: `REQ_${table}`, type: 'required', table, columns };
}

function enumRule(
  id: string,
  table: string,
  column: string,
  values: string[]
): DatasetValidationRule {
  return { id, type: 'enum', table, column, values };
}

/** The complete SGSA rule table (design doc Feature 2 §Checks). */
export function regoleValidazione(): DatasetValidationRule[] {
  return [
    // --- 1. Foreign keys ---
    fk('FK_ALUNNI_CLASSE', TABLE.ALUNNI, COL_ALUNNI.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_CLASSI_INDIRIZZO', TABLE.CLASSI, COL_CLASSI.INDIRIZZO, TABLE.INDIRIZZI, COL_INDIRIZZI.ID),
    fk('FK_CLASSI_COORD', TABLE.CLASSI, COL_CLASSI.COORD, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_CLASSI_IRC', TABLE.CLASSI, COL_CLASSI.IRC, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_CLASSI_ALT', TABLE.CLASSI, COL_CLASSI.ALT, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_DOCENTI_DIPART', TABLE.DOCENTI, COL_DOCENTI.DIPART, TABLE.DIPART, COL_DIPART.ID),
    fk('FK_DIPART_CAPO', TABLE.DIPART, COL_DIPART.CAPO, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_DIPART_MATERIE', TABLE.DIPART, COL_DIPART.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true }),
    fk('FK_RUOLI_DOCENTE', TABLE.RUOLI, COL_RUOLI.DOCENTE, TABLE.DOCENTI, COL_DOCENTI.EMAIL, { csv: true }),
    fk('FK_SUPPLENZE_TITOLARE', TABLE.SUPPLENZE, COL_SUPPLENZE.TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_SUPPLENZE_SUPPLENTE', TABLE.SUPPLENZE, COL_SUPPLENZE.SUPPLENTE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_SUPPLENZE_CLASSI', TABLE.SUPPLENZE, COL_SUPPLENZE.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true, allowWildcard: true }),
    fk('FK_SUPPLENZE_MATERIE', TABLE.SUPPLENZE, COL_SUPPLENZE.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true, allowWildcard: true }),
    fk('FK_VARIAZIONI_TITOLARE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_VARIAZIONI_NUOVO_TITOLARE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE, TABLE.DOCENTI, COL_DOCENTI.EMAIL),
    fk('FK_VARIAZIONI_CLASSI', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true, allowWildcard: true }),
    fk('FK_VARIAZIONI_MATERIE', TABLE.VARIAZIONI_CATTEDRA, COL_VARIAZIONI_CATTEDRA.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true, allowWildcard: true }),
    fk('FK_CARENZE_STUDENTE', TABLE.CARENZE, COL_CARENZE.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_CARENZE_CLASSE', TABLE.CARENZE, COL_CARENZE.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_PIANI_STUDENTE', TABLE.PIANI, COL_PIANI.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_PROGETTI_CLASSE', TABLE.PROGETTI, COL_PROGETTI.CLASSE, TABLE.CLASSI, COL_CLASSI.ID),
    fk('FK_MOV_ALUNNI_STUDENTE', TABLE.MOV_ALUNNI, COL_MOV_ALUNNI.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_ASL_STUDENTE', TABLE.ASL, COL_ASL.STUDENTE, TABLE.ALUNNI, COL_ALUNNI.EMAIL),
    fk('FK_LOG_DOCS_ID_GEN', TABLE.LOG_DOCS, COL_LOG_DOCS.ID_GEN, TABLE.CONF_DOC, COL_CONF_DOC.ID),
    fk('FK_LOG_DOCS_CLASSI', TABLE.LOG_DOCS, COL_LOG_DOCS.CLASSI, TABLE.CLASSI, COL_CLASSI.ID, { csv: true }),
    fk('FK_LOG_DOCS_MATERIE', TABLE.LOG_DOCS, COL_LOG_DOCS.MATERIE, TABLE.MATERIE, COL_MATERIE.ID, { csv: true }),
    fk('FK_LOG_FOLD_ID_GEN', TABLE.LOG_FOLD, COL_LOG_FOLD.ID_GEN, TABLE.CONF_DOC, COL_CONF_DOC.ID),
    fk('FK_LOG_MAIL_PATTERN', TABLE.LOG_MAIL, COL_LOG_MAIL.PATTERN, TABLE.CONF_MAIL, COL_CONF_MAIL.ID),

    // CLASSI's dynamic per-subject/specifica columns (e.g. MAT, INF.itp,
    // LAB.GRUPPO_A) hold a docente email or CSV of emails each — not covered
    // by the static fk() calls above since the column set is data-driven.
    {
      id: 'FK_CLASSI_CATTEDRE',
      type: 'rowPredicate',
      table: TABLE.CLASSI,
      check: (row, ctx) => {
        const docenti = ctx.index(TABLE.DOCENTI, COL_DOCENTI.EMAIL);
        const statiche = new Set<string>(Object.values(COL_CLASSI));
        for (const [column, value] of Object.entries(row)) {
          if (statiche.has(column)) continue; // COORD/IRC/ALT already have their own FK rules
          for (const email of splitCsvList(scalarString(value))) {
            if (!docenti.has(email)) return { column, value: email };
          }
        }
        return null;
      }
    },

    // --- 2. JSON fields ---
    json(TABLE.ALUNNI, COL_ALUNNI.CURRICULUM),
    json(TABLE.CLASSI, COL_CLASSI.RUOLI),
    json(TABLE.CLASSI, COL_CLASSI.ARTICOLAZIONE),
    json(TABLE.MATERIE, COL_MATERIE.ESAME_CFG),
    json(TABLE.MATERIE, COL_MATERIE.EVOLUZIONE),
    json(TABLE.CONF_DOC, COL_CONF_DOC.MODELLI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.PERMESSI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.PARAMETRI),
    json(TABLE.CONF_DOC, COL_CONF_DOC.POST_PROCESSO),
    json(TABLE.CONF_DOC, COL_CONF_DOC.REGISTRA_DOC),
    json(TABLE.CONF_DOC, COL_CONF_DOC.REGISTRA_FOLD),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.BOX_CFG),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.POST_PROCESSO),
    json(TABLE.CONF_MAIL, COL_CONF_MAIL.ALLEGATI_STATICI),
    json(TABLE.CONF_IMP, COL_CONF_IMP.CONFIG),
    json(TABLE.CONF_AZIONI, COL_CONF_AZIONI.AZIONI),
    json(TABLE.LOG_MAIL, COL_LOG_MAIL.ALLEGATI),

    // --- 3. Required fields ---
    required(TABLE.ALUNNI, [COL_ALUNNI.EMAIL]),
    required(TABLE.DOCENTI, [COL_DOCENTI.EMAIL, COL_DOCENTI.COGNOME, COL_DOCENTI.NOME]),
    required(TABLE.CLASSI, [COL_CLASSI.ID]),
    // NOME is not required blanket-wide: 01 §MATERIE allows an empty NOME
    // when PRINCIPALE+SPECIFICITA are both set (composite-specifica catalog
    // rows), reconstructed at read time as "PRINCIPALE (SPECIFICITA)" —
    // see Materia.nome. See MATERIE_NOME_MANCANTE below for the real rule.
    required(TABLE.MATERIE, [COL_MATERIE.ID]),
    required(TABLE.INDIRIZZI, [COL_INDIRIZZI.ID, COL_INDIRIZZI.NOME]),
    required(TABLE.DIPART, [COL_DIPART.ID, COL_DIPART.NOME]),
    required(TABLE.RUOLI, [COL_RUOLI.ID, COL_RUOLI.NOME]),
    required(TABLE.CONF_DOC, [COL_CONF_DOC.ID, COL_CONF_DOC.GENERATORE]),
    required(TABLE.CONF_MAIL, [COL_CONF_MAIL.ID, COL_CONF_MAIL.PROCESSO]),
    required(TABLE.CONF_IMP, [COL_CONF_IMP.ID, COL_CONF_IMP.TARGET]),
    required(TABLE.CONF_AZIONI, [COL_CONF_AZIONI.ID, COL_CONF_AZIONI.TIPO, COL_CONF_AZIONI.ASSE, COL_CONF_AZIONI.ATTIVO]),
    required(TABLE.LOG_DOCS, [COL_LOG_DOCS.ID]),

    // --- 4. ENUM values ---
    enumRule('ENUM_ALUNNI_RELIGIONE', TABLE.ALUNNI, COL_ALUNNI.RELIGIONE, Object.values(ReligioneScelta)),
    enumRule('ENUM_DOCENTI_GENERE', TABLE.DOCENTI, COL_DOCENTI.GENERE, Object.values(Genere)),
    enumRule('ENUM_LOG_DOCS_STATO', TABLE.LOG_DOCS, COL_LOG_DOCS.STATO, Object.values(StatoDocumento)),
    enumRule('ENUM_CONF_DOC_DUPLICAZIONE', TABLE.CONF_DOC, COL_CONF_DOC.DUPLICAZIONE, Object.values(DuplicazioneDocumento)),
    enumRule('ENUM_CONF_DOC_FORMATO', TABLE.CONF_DOC, COL_CONF_DOC.FORMATO, Object.values(FormatoOutput)),
    enumRule('ENUM_CONF_DOC_ARTICOLAZIONE', TABLE.CONF_DOC, COL_CONF_DOC.GESTIONE_ARTICOLAZIONE, Object.values(GestioneArticolazione)),
    enumRule('ENUM_CONF_MAIL_ARTICOLAZIONE', TABLE.CONF_MAIL, COL_CONF_MAIL.GESTIONE_ARTICOLAZIONE, Object.values(GestioneArticolazione)),
    enumRule('ENUM_CONF_MAIL_DUPLICAZIONE', TABLE.CONF_MAIL, COL_CONF_MAIL.DUPLICAZIONE, Object.values(DuplicazioneDocumento)),
    enumRule('ENUM_CONF_MAIL_SUPPLENTI', TABLE.CONF_MAIL, COL_CONF_MAIL.SUPPLENTI, Object.values(GestioneSupplenti)),
    enumRule('ENUM_CONF_MAIL_PROCESSO', TABLE.CONF_MAIL, COL_CONF_MAIL.PROCESSO, Object.values(ProcessoInvio)),
    enumRule('ENUM_LOG_MAIL_STATO', TABLE.LOG_MAIL, COL_LOG_MAIL.STATO, Object.values(StatoEmail)),
    enumRule('ENUM_PIANI_TIPO', TABLE.PIANI, COL_PIANI.TIPO, Object.values(TipoPiano)),
    enumRule('ENUM_PROGETTI_TIPO', TABLE.PROGETTI, COL_PROGETTI.TIPO, Object.values(TipoProgetto)),
    enumRule('ENUM_MOV_ALUNNI_TIPO', TABLE.MOV_ALUNNI, COL_MOV_ALUNNI.TIPO, Object.values(TipoMovimento)),
    enumRule('ENUM_CONF_AZIONI_ASSE', TABLE.CONF_AZIONI, COL_CONF_AZIONI.ASSE, ASSI_AZIONE),

    // --- 5. Dynamic column integrity ---
    {
      id: 'DYN_CLASSI',
      type: 'columnName',
      table: TABLE.CLASSI,
      knownColumns: Object.values(COL_CLASSI),
      targetTable: TABLE.MATERIE,
      targetColumn: COL_MATERIE.ID,
      normalize: baseMateria
    },
    {
      id: 'DYN_CARENZE',
      type: 'columnName',
      table: TABLE.CARENZE,
      knownColumns: Object.values(COL_CARENZE),
      targetTable: TABLE.MATERIE,
      targetColumn: COL_MATERIE.ID,
      normalize: baseMateria
    },

    // --- 6. ITP invariant ---
    {
      id: 'ITP_CLASSI',
      type: 'rowPredicate',
      table: TABLE.CLASSI,
      check: (row, ctx) => {
        const itpEmails = new Set<string>();
        for (const [column, value] of Object.entries(row)) {
          if (!column.endsWith('.itp')) continue;
          const raw = scalarString(value);
          for (const email of splitCsvList(raw)) {
            itpEmails.add(`${column}|${email}`);
          }
        }
        for (const entry of itpEmails) {
          const [column, email] = entry.split('|') as [string, string];
          const docente = (ctx.datasets[TABLE.DOCENTI] ?? []).find(
            (d) => cell(d, COL_DOCENTI.EMAIL) === email
          );
          if (!docente) continue; // unknown email: FK_CLASSI_CATTEDRE reports this, not ITP_CLASSI
          const isItp = docente[COL_DOCENTI.ITP];
          if (isItp === true || String(isItp).toUpperCase() === 'TRUE') continue;
          return { column, value: email };
        }
        return null;
      }
    },

    // --- 7. MATERIE composite rows ---
    {
      id: 'MATERIE_COMPOSITE_PRINCIPALE',
      type: 'rowPredicate',
      table: TABLE.MATERIE,
      check: (row) => {
        const id = cell(row, COL_MATERIE.ID);
        if (!id.includes('.')) return null;
        if (cell(row, COL_MATERIE.PRINCIPALE) !== '') return null;
        return { column: COL_MATERIE.PRINCIPALE, value: id };
      }
    },

    // NOME may be legitimately empty when both PRINCIPALE and SPECIFICITA
    // are set (01 §MATERIE: reconstructed in-read as "PRINCIPALE
    // (SPECIFICITA)" — see Materia.nome). Only flag an empty NOME that has
    // no such fallback.
    {
      id: 'MATERIE_NOME_MANCANTE',
      type: 'rowPredicate',
      table: TABLE.MATERIE,
      check: (row) => {
        if (cell(row, COL_MATERIE.NOME) !== '') return null;
        if (cell(row, COL_MATERIE.PRINCIPALE) !== '' && cell(row, COL_MATERIE.SPECIFICITA) !== '') {
          return null;
        }
        return { column: COL_MATERIE.NOME, value: cell(row, COL_MATERIE.ID) };
      }
    },

    // --- 8. Curriculum coverage (Feature 4) ---
    // Every subject the class's INDIRIZZO marks mandatory for the class's ANNO
    // must have a corresponding column in CLASSI. The reverse direction is
    // deliberately NOT checked (extra columns are legitimate).
    {
      id: 'CURRICULUM_COVERAGE',
      type: 'rowPredicate',
      table: TABLE.CLASSI,
      check: (row, ctx) => {
        const indirizzo = cell(row, COL_CLASSI.INDIRIZZO);
        const anno = cell(row, COL_CLASSI.ANNO);
        if (indirizzo === '' || anno === '') return null;
        const colonne = new Set(Object.keys(row).map(baseMateria));
        for (const materia of ctx.datasets[TABLE.MATERIE] ?? []) {
          const anniRaw = materia[indirizzo];
          if (anniRaw === undefined) continue; // address has no curriculum column yet
          const anni = scalarString(anniRaw)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== '');
          if (!anni.includes(anno)) continue;
          const materiaId = cell(materia, COL_MATERIE.ID);
          if (colonne.has(baseMateria(materiaId))) continue;
          return { column: materiaId, value: materiaId, details: { indirizzo, anno } };
        }
        return null;
      }
    }
  ];
}

/** Italian ERRORE text for the report sheet (design doc Feature 2 §Output Format). */
export function messaggioErrore(v: DatasetViolation): string {
  switch (v.type) {
    case 'foreignKey':
      return `FK violata: ${v.column} "${v.value}" non esiste in ${String(v.details['targetTable'])}.${String(v.details['targetColumn'])}`;
    case 'json':
      return `JSON non valido nel campo ${v.column}`;
    case 'required':
      return `Campo obbligatorio vuoto: ${v.column}`;
    case 'enum':
      return `Valore non ammesso per ${v.column}: "${v.value}" (ammessi: ${(v.details['values'] as string[]).join(', ')})`;
    case 'columnName':
      return `Colonna dinamica ${v.column} non corrisponde a nessun ${String(v.details['targetTable'])}.${String(v.details['targetColumn'])}`;
    default:
      break;
  }
  switch (v.ruleId) {
    case 'FK_CLASSI_CATTEDRE':
      return `FK violata: colonna dinamica ${v.column} "${v.value}" non esiste in DOCENTI.EMAIL`;
    case 'ITP_CLASSI':
      return `Colonna ITP ${v.column}: il docente "${v.value}" non ha DOCENTI.ITP = true`;
    case 'MATERIE_COMPOSITE_PRINCIPALE':
      return `Materia composita "${v.value}": PRINCIPALE è obbligatorio`;
    case 'MATERIE_NOME_MANCANTE':
      return `Campo obbligatorio vuoto: ${v.column}`;
    case 'CURRICULUM_COVERAGE':
      return `Materia "${v.value}" obbligatoria per l'indirizzo ${String(v.details['indirizzo'])} anno ${String(v.details['anno'])}: colonna assente in CLASSI`;
    default:
      return `Violazione ${v.ruleId} sul campo ${v.column}`;
  }
}
