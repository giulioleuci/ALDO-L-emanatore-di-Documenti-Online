import type { ITemplateEngine } from '../facades/TemplateEngineFacade';
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

/**
 * Resolves rows matching `match` via the indexed lookup seam for single-column
 * criteria — building the index on first use for that (table, column) pair, so
 * repeated actions in the same POST_PROCESSO array against the same column
 * benefit from O(1) lookups on the second and later hits — falling back to a
 * full scan for multi-column criteria (ref REPORT_GLF.md A3).
 */
function findMatchingRows(
  table: RepositoryTable,
  keys: string[],
  match: Record<string, string>
): EntityData[] {
  if (keys.length === 1) {
    const column = keys[0]!;
    let hits = table.indexedLookup(column, match[column]);
    if (hits === null) {
      table.createIndex(column);
      hits = table.indexedLookup(column, match[column]);
    }
    if (hits !== null) return hits;
  }
  return table.getAllRows().filter((r) => keys.every((k) => String(r[k]) === match[k]));
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
