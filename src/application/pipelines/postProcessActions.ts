import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import { TABLE, COL_LOG_DOCS } from '../../config/schema';

/**
 * Shared POST_PROCESSO action executor (10 §12, 11 §10): the same JSON action
 * grammar is used by CONF_DOC and CONF_MAIL. Criteria values are `{{path}}`
 * templates resolved by WorkspaceTemplateEngine against the CDU; matching rows
 * are rewritten through the RepositoryDatabase `updateRowWhere` seam (the full
 * previous row is the match key, so exactly that row is replaced and a missing
 * match can never append phantom rows). Persistence is the caller's concern:
 * inside the document pipeline the service transaction commits; the email
 * pipeline calls `save()` right after (11 §10).
 */
export interface PostProcessAction {
  tipo: string;
  tab?: string;
  col?: string;
  valore?: unknown;
  stato?: string;
  criteri?: Record<string, string>;
}

/** The slice of the database the executor needs (satisfied by FakeDatabase and the SheetDB adapter). */
export type PostProcessDb = Pick<RepositoryDatabase, 'tables'>;

/**
 * True when a CONF_DOC/CONF_MAIL JSON-shaped cell (POST_PROCESSO, PERMESSI) is
 * actually configured. A live Sheets round-trip never preserves an unset cell
 * as `null` — `CellValueCoercion` (GasLibraryFactory/CoreUtilsLib) returns
 * blank cells as `''` regardless of what was written — so a bare `!= null`
 * gate lets an empty string through into `JSON.parse('')`, which throws
 * "Unexpected end of JSON input". Callers must use this instead of `!= null`.
 */
export function hasJsonValue(raw: unknown): boolean {
  if (raw == null) return false;
  return typeof raw !== 'string' || raw.trim() !== '';
}

function resolveCriteri(
  criteri: Record<string, string>,
  cdu: Record<string, unknown>,
  templates: ITemplateEngine
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, tpl] of Object.entries(criteri)) {
    out[col] = templates.processString(tpl, cdu);
  }
  return out;
}

/** Splits a CSV cell/criterion value on commas, trimming and dropping empties (ref 01 CLASSI/UTENTI CONTAINS rule). */
function csvValues(raw: unknown): string[] {
  return typeof raw === 'string'
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
}

/**
 * True when `rowValue` matches `matchValue`. A single-valued `matchValue`
 * (no comma) is strict equality, unchanged from before. A multi-valued
 * `matchValue` (e.g. a `{{destinatario.contesto.classiCompetenza | join}}`
 * criterion covering several classes) matches on CSV containment — any one
 * of its values appearing in `rowValue`'s own CSV values — per 01
 * `SCHEMA_DATABASE`'s "CLASSI/UTENTI MUST use CONTAINS, never exact-match" rule.
 */
function matchesCriterio(rowValue: unknown, matchValue: string): boolean {
  const matchValues = csvValues(matchValue);
  if (matchValues.length <= 1) return String(rowValue) === matchValue;
  return csvValues(rowValue).some((v) => matchValues.includes(v));
}

/**
 * Resolves rows matching `match` via the indexed lookup seam for single-column,
 * single-valued criteria — building the index on first use for that (table,
 * column) pair, so repeated actions in the same POST_PROCESSO array against the
 * same column benefit from O(1) lookups on the second and later hits — falling
 * back to a full scan for multi-column or multi-valued criteria (ref
 * REPORT_GLF.md A3): the index is keyed on exact cell values and can't answer a
 * CSV-containment query.
 */
function findMatchingRows(
  table: RepositoryTable,
  keys: string[],
  match: Record<string, string>
): EntityData[] {
  const isMultiValued = keys.some((k) => csvValues(match[k]).length > 1);
  if (keys.length === 1 && !isMultiValued) {
    const column = keys[0]!;
    let hits = table.indexedLookup(column, match[column]);
    if (hits === null) {
      table.createIndex(column);
      hits = table.indexedLookup(column, match[column]);
    }
    if (hits !== null) return hits;
  }
  return table.getAllRows().filter((r) => keys.every((k) => matchesCriterio(r[k], match[k]!)));
}

function updateMatching(
  db: PostProcessDb,
  tab: string,
  match: Record<string, string>,
  patch: Record<string, unknown>
): number {
  const table = db.tables[tab];
  if (table === undefined) return 0;
  const keys = Object.keys(match);
  const hits = findMatchingRows(table, keys, match);
  for (const row of hits) {
    table.updateRowWhere({ ...row }, { ...row, ...patch });
  }
  return hits.length;
}

/** Runs every action in the POST_PROCESSO JSON array; returns the number of updated rows. */
export function executePostProcess(
  rawJson: string,
  cdu: Record<string, unknown>,
  db: PostProcessDb,
  templates: ITemplateEngine,
  now: Date,
  logger: LoggerService
): number {
  const actions = JSON.parse(rawJson) as PostProcessAction[];
  let updated = 0;
  for (const action of actions) {
    const criteri = resolveCriteri(action.criteri ?? {}, cdu, templates);
    switch (action.tipo) {
      case 'INSERISCI_TIMESTAMP':
        updated += updateMatching(db, action.tab ?? '', criteri, {
          [action.col ?? '']: now.toISOString()
        });
        break;
      case 'AGGIORNA_CAMPO':
        updated += updateMatching(db, action.tab ?? '', criteri, {
          [action.col ?? '']: templates.processString(
            typeof action.valore === 'string' ? action.valore : '',
            cdu
          )
        });
        break;
      case 'AGGIORNA_STATO_DOC':
        updated += updateMatching(db, action.tab ?? TABLE.LOG_DOCS, criteri, {
          [COL_LOG_DOCS.STATO]: action.stato ?? ''
        });
        break;
      default:
        logger.warn(`POST_PROCESSO: azione sconosciuta "${action.tipo}" — saltata`);
    }
  }
  return updated;
}
