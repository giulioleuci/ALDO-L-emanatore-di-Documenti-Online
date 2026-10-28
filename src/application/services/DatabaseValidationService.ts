import type { IDatabase } from '../../infrastructure/db/Database';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { ISpreadsheetReportFacade } from '../../infrastructure/facades/SpreadsheetReportFacade';
import {
  VALIDATION_TABLES,
  regoleValidazione,
  messaggioErrore
} from '../../config/validationRules';

/** One row of the report sheet (design doc Feature 2 §Output Format). */
export interface ValidationRow {
  tabella: string;
  riga: number;
  campo: string;
  valore: string;
  errore: string;
}

export interface ValidationReport {
  violazioni: ValidationRow[];
  spreadsheetId: string;
  nome: string;
}

const HEADER = ['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE'];
const NESSUN_ERRORE = 'TUTTO OK - Nessun errore rilevato';

export interface DatabaseValidationDeps {
  db: IDatabase;
  master: IMasterSheetRepository;
  report: ISpreadsheetReportFacade;
  logger?: LoggerService;
}

/**
 * Feature 2: validates the current year's database (FK integrity, JSON
 * validity, required fields, ENUM values, dynamic-column integrity, the ITP
 * invariant, MATERIE composite rows and curriculum coverage) and writes the
 * result as a spreadsheet in the year's Drive root.
 *
 * The rule ENGINE is GasSchemaValidatorLib's `DatasetValidator`; this service
 * owns only the SGSA rule table (src/config/validationRules.ts), the sheet-row
 * numbering and the Italian report layout. Read-only: it never mutates the DB.
 */
export class DatabaseValidationService {
  private readonly logger: LoggerService;

  constructor(private readonly deps: DatabaseValidationDeps) {
    this.logger = deps.logger ?? new LoggerService();
  }

  /**
   * Validates the current year's database. `tabelle` narrows only the REPORTED
   * tables: the whole DB is still read and validated, because foreign-key rules
   * resolve their targets across tables and a partial read would report false
   * violations. Used both by the menu (no argument) and by the VALIDA_DB action.
   */
  esegui(tabelle?: string[]): ValidationReport {
    const richieste =
      tabelle === undefined ? null : tabelle.filter((t) => VALIDATION_TABLES.includes(t));
    const datasets = this.leggiTabelle();
    const { violations } = new DatasetValidator({ logger: this.logger }).validate(
      datasets,
      regoleValidazione()
    );
    const violazioni = violations
      .filter((v) => richieste === null || richieste.includes(v.table))
      .map((v) => ({
        tabella: v.table,
        // The persisted snapshot retains blank-row positions; the header
        // offsets DatasetValidator's 0-based data index by two sheet rows.
        riga: v.rowIndex + 2,
        campo: v.column,
        valore: v.value,
        errore: messaggioErrore(v)
      }))
      .sort((a, b) => a.tabella.localeCompare(b.tabella) || a.riga - b.riga);

    const anno = this.deps.master.findConfigAnnoCorrente();
    const nome =
      richieste === null
        ? `Validazione DB - ${anno.annoScolasticoRaw}`
        : `Validazione DB - ${anno.annoScolasticoRaw} - ${richieste.join(', ')}`;
    const righe =
      violazioni.length === 0
        ? [HEADER, [NESSUN_ERRORE, '', '', '', '']]
        : [
            HEADER,
            ...violazioni.map((v) => [v.tabella, String(v.riga), v.campo, v.valore, v.errore])
          ];

    const spreadsheetId = this.deps.report.creaReport(nome, anno.idCartellaRoot, righe);
    this.logger.info(`Validazione DB: ${violazioni.length} violazioni, report ${spreadsheetId}`);
    return { violazioni, spreadsheetId, nome };
  }

  private leggiTabelle(): Record<string, Array<Record<string, unknown>>> {
    const datasets: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of VALIDATION_TABLES) {
      datasets[table] = this.deps.db.table(table).findAll({ preserveEmptyRows: true });
    }
    return datasets;
  }
}
