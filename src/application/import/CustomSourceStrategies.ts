import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { LogCartellaRepository } from '../../infrastructure/repositories/LogCartellaRepository';
import type { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import { ConfigurationError } from '../../domain/errors/DomainError';

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * Reads every row of a Google Sheet's first (or named) tab by delegating to
 * the library's own `SheetByIdStrategy` (tab/range resolution, header split,
 * and value coercion all happen inside its `extract()`), so the two custom
 * strategies below behave identically to the library's own SheetById source
 * without ALDO re-deriving that logic by hand.
 */
function readSheetRows(
  logger: LoggerService,
  sheets: SpreadsheetService,
  sheetId: string,
  options: { tabName?: string | undefined; range?: string | undefined; hasHeaders?: boolean | undefined } = {}
): Record<string, unknown>[] {
  const strategy = new SheetByIdStrategy(logger, sheets);
  const config: { sheetId: string; tabName?: string; range?: string; hasHeaders?: boolean } = { sheetId };
  if (options.tabName !== undefined) config.tabName = options.tabName;
  if (options.range !== undefined) config.range = options.range;
  if (options.hasHeaders !== undefined) config.hasHeaders = options.hasHeaders;
  return strategy.extract(config);
}

/**
 * CERCA_CARTELLE_CLASSE (12 §3): for every active class, finds its LOG_FOLD
 * folders matching `config.folderTipo`, searches each for spreadsheet files
 * and reads every row from every one found — tagging each with `_CLASSE` so
 * downstream CONFIG.map/key can route rows to the right student/class. A
 * class with no matching folder simply contributes nothing (not an error —
 * not every class necessarily has this document type yet).
 */
export function createCercaCartelleClasseStrategy(
  classi: ClasseRepository,
  logFold: LogCartellaRepository,
  drive: DriveService,
  sheets: SpreadsheetService
): new (logger?: LoggerService) => SourceStrategy {
  return class CercaCartelleClasseStrategy extends SourceStrategy {
    protected _extractData(config: Record<string, unknown>): Record<string, unknown>[] {
      this._validateConfig(config, ['folderTipo']);
      const folderTipo = String(config['folderTipo']);
      const readOptions = {
        tabName: typeof config['tabName'] === 'string' ? config['tabName'] : undefined,
        range: typeof config['range'] === 'string' ? config['range'] : undefined,
        hasHeaders: config['hasHeaders'] !== false
      };
      const out: Record<string, unknown>[] = [];
      for (const classe of classi.findAttive()) {
        const cartelle = logFold.findByClasse(classe).filter((f) => f.tipo === folderTipo);
        for (const cartella of cartelle) {
          const files = drive.searchFiles(`'${cartella.id}' in parents and mimeType='${SPREADSHEET_MIME}' and trashed=false`);
          for (const file of files) {
            for (const row of readSheetRows(this.logger, sheets, file.id, readOptions)) {
              out.push({ ...row, _CLASSE: classe.nome });
            }
          }
        }
      }
      return out;
    }
  };
}

/**
 * CERCA_DOCUMENTI (12 §3): searches `LOG_DOCS` for records matching
 * `config.idGen` (required) and the optional `config.tipo`/`config.stato`
 * filters, reads every row from each matching document (assumed to be a
 * Google Sheet) and tags each with `_CLASSE` from the log record's CLASSI.
 */
export function createCercaDocumentiStrategy(
  logDocs: LogDocumentoRepository,
  sheets: SpreadsheetService
): new (logger?: LoggerService) => SourceStrategy {
  return class CercaDocumentiStrategy extends SourceStrategy {
    protected _extractData(config: Record<string, unknown>): Record<string, unknown>[] {
      this._validateConfig(config, ['idGen']);
      const idGen = String(config['idGen']);
      const tipo = typeof config['tipo'] === 'string' ? config['tipo'] : undefined;
      const stato = typeof config['stato'] === 'string' ? config['stato'] : undefined;
      const readOptions = {
        tabName: typeof config['tabName'] === 'string' ? config['tabName'] : undefined,
        range: typeof config['range'] === 'string' ? config['range'] : undefined,
        hasHeaders: config['hasHeaders'] !== false
      };
      const documenti = logDocs
        .findAll()
        .filter((d) => d.idGen === idGen && (tipo === undefined || d.tipo === tipo) && (stato === undefined || String(d.getStato()) === stato));
      const out: Record<string, unknown>[] = [];
      for (const doc of documenti) {
        const classe = doc.getClassi()[0] ?? '';
        for (const row of readSheetRows(this.logger, sheets, doc.id ?? '', readOptions)) {
          out.push({ ...row, _CLASSE: classe });
        }
      }
      return out;
    }
  };
}

/** Thrown when a CONF_IMP job references a custom source that was never registered. */
export function requireRegistered(searchStrategy: string): never {
  throw new ConfigurationError(`Source strategy "${searchStrategy}" richiede registrazione tramite registerCustomSource (12 §3)`);
}
