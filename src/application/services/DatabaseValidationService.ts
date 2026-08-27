import type { IDatabase } from '../../infrastructure/db/Database';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { ISpreadsheetReportFacade } from '../../infrastructure/facades/SpreadsheetReportFacade';
import { VALIDATION_TABLES, regoleValidazione, messaggioErrore } from '../../config/validationRules';

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

  esegui(): ValidationReport {
    const datasets = this.leggiTabelle();
    const { violations } = new DatasetValidator({ logger: this.logger }).validate(
      datasets,
      regoleValidazione()
    );
    const violazioni = violations
      .map((v) => ({
        tabella: v.table,
        // DatasetValidator row indexes are 0-based within the data array; the
        // sheet has a header row, so the physical row is index + 2.
        riga: v.rowIndex + 2,
        campo: v.column,
        valore: v.value,
        errore: messaggioErrore(v)
      }))
      .sort((a, b) => a.tabella.localeCompare(b.tabella) || a.riga - b.riga);

    const anno = this.deps.master.findConfigAnnoCorrente();
    const nome = `Validazione DB - ${anno.annoScolasticoRaw}`;
    const righe =
      violazioni.length === 0
        ? [HEADER, [NESSUN_ERRORE, '', '', '', '']]
        : [HEADER, ...violazioni.map((v) => [v.tabella, String(v.riga), v.campo, v.valore, v.errore])];

    const spreadsheetId = this.deps.report.creaReport(nome, anno.idCartellaRoot, righe);
    this.logger.info(`Validazione DB: ${violazioni.length} violazioni, report ${spreadsheetId}`);
    return { violazioni, spreadsheetId, nome };
  }

  private leggiTabelle(): Record<string, Array<Record<string, unknown>>> {
    const datasets: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of VALIDATION_TABLES) {
      datasets[table] = this.deps.db.table(table).findAll();
    }
    return datasets;
  }
}
