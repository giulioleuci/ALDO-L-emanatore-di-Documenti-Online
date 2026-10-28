import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import { TABLE, COL_LOG_DOCS } from '../../config/schema';

/**
 * Shared "azioni" grammar (10 §12, 11 §10, CONF_AZIONI design doc): one JSON
 * action vocabulary used in two places — inline, as the physical
 * CONF_DOC/CONF_MAIL `POST_PROCESSO` column (the column name is spec and does
 * NOT change), and standalone, as CONF_AZIONI.AZIONI orchestrated by
 * ActionBatchService. Criteria values are `{{path}}` templates resolved by
 * WorkspaceTemplateEngine against the CDU; matching rows are rewritten through
 * the RepositoryDatabase `updateRowWhere` seam (the full previous row is the
 * match key, so exactly that row is replaced and a missing match can never
 * append phantom rows). Persistence is the caller's concern: inside the
 * document pipeline the service transaction commits; the email pipeline calls
 * `save()` right after (11 §10); ActionBatchService saves per target.
 *
 * DB-only action types are built in here. Infrastructure action types (Drive
 * permissions, DB validation) arrive as `handlers`, supplied by the caller —
 * the document pipeline registers only AGGIORNA_PERMESSI_STORICI, while
 * ActionBatchService registers the full set (see azioniInfra.ts).
 */
export interface Azione {
  tipo: string;
  tab?: string;
  col?: string;
  valore?: unknown;
  stato?: string;
  criteri?: Record<string, string>;
  target?: string;
  ruolo?: string;
  permesso?: string;
  profondita?: number;
  /** Log table an infra action selects its targets from: 'LOG_DOCS' | 'LOG_FOLD'. */
  su?: string;
  /** Direct recipient addresses, alternative to `ruolo`. */
  emails?: string[];
  /** TRASFORMA_CAMPO: TRIM | UPPER | LOWER | CAPITALIZE | UNCAPITALIZE. */
  operazione?: string;
  /** RIALLINEA_PERMESSI_DA_CONF: also remove non-owner ACLs outside the CONF_DOC.PERMESSI set (default false). */
  revoca?: boolean;
  /** RIDUCI_PERMESSI: maximum permission left in place (default LETTURA). */
  soglia?: string;
  /** VALIDA_DB: subset of tables to validate (default: all). */
  tabelle?: string[];
  /** VERIFICA_EMAIL_INVIATE: "GG-MM-AAAA HH:MM:SS" bounds, relative lookback (default 2) and CONF_MAIL id filter. */
  daTimestamp?: string;
  aTimestamp?: string;
  lookbackGiorni?: number;
  pattern?: string | string[];
}

export type AzioneHandler = (azione: Azione, criteri: Record<string, string>) => number;

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
export function csvValues(raw: unknown): string[] {
  return typeof raw === 'string' ? splitCsvList(raw) : [];
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
  patch: Record<string, unknown>,
  onlyIf?: (row: EntityData) => boolean
): number {
  const table = db.tables[tab];
  if (table === undefined) return 0;
  const keys = Object.keys(match);
  const hits = findMatchingRows(table, keys, match).filter(
    (row) => onlyIf === undefined || onlyIf(row)
  );
  for (const row of hits) {
    table.updateRowWhere({ ...row }, { ...row, ...patch });
  }
  return hits.length;
}

/** Blank covers both an unset cell and the '' a live Sheets round-trip returns for it. */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === 'string' && value.trim() === '';
}

const TRASFORMAZIONI: Record<string, (value: string) => string> = {
  TRIM: (v) => v.trim(),
  UPPER: (v) => v.toUpperCase(),
  LOWER: (v) => v.toLowerCase(),
  CAPITALIZE: (v) => v.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  UNCAPITALIZE: (v) => v.charAt(0).toLowerCase() + v.slice(1)
};

/**
 * Applies `trasforma` to `tab.col` on every row matching `match`, writing only
 * the rows whose value actually changes (idempotent re-runs cost no writes).
 * Non-string cells are left alone: a coerced number/boolean written back as a
 * string would silently change the column's type.
 */
function transformMatching(
  db: PostProcessDb,
  tab: string,
  col: string,
  match: Record<string, string>,
  trasforma: (value: string) => string
): number {
  const table = db.tables[tab];
  if (table === undefined || col === '') return 0;
  let changed = 0;
  for (const row of findMatchingRows(table, Object.keys(match), match)) {
    const current = row[col];
    if (typeof current !== 'string') continue;
    const next = trasforma(current);
    if (next === current) continue;
    table.updateRowWhere({ ...row }, { ...row, [col]: next });
    changed += 1;
  }
  return changed;
}

export interface EseguiAzioniOptions {
  /** Raw JSON array: CONF_AZIONI.AZIONI or CONF_DOC/CONF_MAIL.POST_PROCESSO. */
  azioni: string;
  cdu: Record<string, unknown>;
  db: PostProcessDb;
  templates: ITemplateEngine;
  now: Date;
  logger: LoggerService;
  /** Infra action types the caller can service; an unregistered type is warned and skipped. */
  handlers?: Record<string, AzioneHandler>;
}

/** Runs every action in the JSON array; returns the number of updated rows/targets. */
export function eseguiAzioni(opts: EseguiAzioniOptions): number {
  const { cdu, db, templates, now, logger } = opts;
  const azioni = JSON.parse(opts.azioni) as Azione[];
  const handlers = opts.handlers ?? {};
  // Mixes two different units: rows updated by DB actions and files touched by
  // the infra handlers, summed into one counter — see documentSteps.ts's
  // `Updated` log-detail field.
  let updated = 0;
  for (const azione of azioni) {
    const criteri = resolveCriteri(azione.criteri ?? {}, cdu, templates);
    switch (azione.tipo) {
      case 'INSERISCI_TIMESTAMP': {
        // Insert, not overwrite: only the first send stamps the column (e.g.
        // LOG_DOCS.NOTIFICATO), so a later PIANI_PERSONALIZZATI email that
        // also re-matches already-notified rows leaves their original
        // timestamp untouched. AGGIORNA_CAMPO remains for unconditional writes.
        const col = azione.col ?? '';
        updated += updateMatching(
          db,
          azione.tab ?? '',
          criteri,
          { [col]: now.toISOString() },
          (row) => isBlank(row[col])
        );
        break;
      }
      case 'AGGIORNA_CAMPO':
        updated += updateMatching(db, azione.tab ?? '', criteri, {
          [azione.col ?? '']: templates.processString(
            typeof azione.valore === 'string' ? azione.valore : '',
            cdu
          )
        });
        break;
      case 'AGGIORNA_STATO_DOC':
        updated += updateMatching(db, azione.tab ?? TABLE.LOG_DOCS, criteri, {
          [COL_LOG_DOCS.STATO]: azione.stato ?? ''
        });
        break;
      case 'TRASFORMA_CAMPO': {
        const trasforma = TRASFORMAZIONI[azione.operazione ?? ''];
        if (trasforma === undefined) {
          logger.warn(`AZIONE TRASFORMA_CAMPO: operazione "${String(azione.operazione)}" sconosciuta — saltata`);
          break;
        }
        updated += transformMatching(db, azione.tab ?? '', azione.col ?? '', criteri, trasforma);
        break;
      }
      default: {
        const handler = handlers[azione.tipo];
        if (handler === undefined) {
          logger.warn(`AZIONE: tipo "${azione.tipo}" non disponibile — saltata`);
          break;
        }
        updated += handler(azione, criteri);
      }
    }
  }
  return updated;
}
