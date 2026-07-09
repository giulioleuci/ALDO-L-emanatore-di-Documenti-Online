import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu, CduClasse } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ConfigurationError } from '../../domain/errors/DomainError';

/** 0-based column index -> A1 letters ("A", "Z", "AA", ...). */
export function columnIndexToLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

interface SheetMaterieParams {
  sheetName?: string | undefined;
  headerRow: number;
  /** 1-based column number; undefined -> first empty column after the existing header row. */
  startColumn?: number | undefined;
}

/** One inserted column: `sigla` is null for the group-label pseudo-columns (no ACL target). */
export interface MateriaColumn {
  sigla: string | null;
  header: string;
}

function readParams(config: ConfigurazioneDocumento): SheetMaterieParams {
  const p = config.getParametri();
  const headerRow = typeof p['headerRow'] === 'number' && p['headerRow'] > 0 ? p['headerRow'] : 1;
  const startColumn = typeof p['startColumn'] === 'number' && p['startColumn'] > 0 ? p['startColumn'] : undefined;
  return { sheetName: typeof p['sheetName'] === 'string' ? p['sheetName'] : undefined, headerRow, startColumn };
}

/**
 * SHEET_CON_MATERIE generator (10 §9): after the Sheet template is cloned,
 * inserts one column per class subject — header = `MATERIE.SINTESI` — then
 * runs WorkspaceTemplateEngine placeholder substitution over the sheet's
 * non-structural cells. For articulated classes, shared subjects come first,
 * then a group-label column, then each partner's subject-specific columns
 * (`articolazione.materieCondivise` / `materieSeparatePrimoGruppo` /
 * `materieSeparateSecondoGruppo`, 05 §…); the group label is the partner
 * class id (`articolazione.partners[i]`) since the CDU carries no separate
 * per-partner indirizzo name at this level.
 *
 * `CONF_DOC.PARAMETRI` (10 §9): `sheetName` (default: first sheet),
 * `headerRow` (default 1), `startColumn` (1-based; default: first empty
 * column after the existing header row).
 */
export class SheetMaterieGeneratorStrategy implements GeneratorStrategy {
  constructor(
    protected readonly sheets: SpreadsheetService,
    protected readonly materie: MateriaRepository,
    protected readonly templates: ITemplateEngine
  ) {}

  render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void {
    const layout = this.insertColumns(fileId, cdu, config);
    this.substitutePlaceholders(fileId, layout.sheetName, cdu);
  }

  /** Resolves the target sheet/params, builds the column list and writes the header row (10 §9). Shared with the _E_PERMESSI subclass, which adds protection after calling this. */
  protected insertColumns(
    fileId: string,
    cdu: Cdu,
    config: ConfigurazioneDocumento
  ): { sheetName: string; headerRow: number; startIndex: number; columns: MateriaColumn[] } {
    const classe = cdu.focus.classe;
    if (classe === undefined) {
      throw new ConfigurationError(`CONF_DOC ${config.id ?? '?'}: SHEET_CON_MATERIE richiede focus.classe nel CDU`);
    }
    const params = readParams(config);
    const sheetInfo = this.sheets.getSheetInfo(fileId);
    const sheet = params.sheetName !== undefined ? sheetInfo.find((s) => s.name === params.sheetName) : sheetInfo[0];
    if (sheet === undefined) {
      throw new ConfigurationError(`CONF_DOC ${config.id ?? '?'}: foglio "${params.sheetName ?? '(primo)'}" non trovato in ${fileId}`);
    }

    const columns = this.buildColumns(classe);
    const startIndex = params.startColumn !== undefined ? params.startColumn - 1 : this.firstEmptyColumn(fileId, sheet.name, params.headerRow);
    this.writeHeaders(fileId, sheet.name, params.headerRow, startIndex, columns);
    return { sheetName: sheet.name, headerRow: params.headerRow, startIndex, columns };
  }

  /** Ordered columns for the class's subjects (articulated: shared -> group label -> per-group). */
  protected buildColumns(classe: CduClasse): MateriaColumn[] {
    if (classe.flags.isArticolata && classe.articolazione !== undefined) {
      const a = classe.articolazione;
      const partners = a.partners ?? [];
      const out = [...this.columnsFor(a.materieCondivise)];
      const primo = this.columnsFor(a.materieSeparatePrimoGruppo);
      if (primo.length > 0) out.push({ sigla: null, header: partners[0] ?? 'Gruppo 1' }, ...primo);
      const secondo = this.columnsFor(a.materieSeparateSecondoGruppo);
      if (secondo.length > 0) out.push({ sigla: null, header: partners[1] ?? 'Gruppo 2' }, ...secondo);
      return out;
    }
    const sigle = new Set<string>();
    for (const d of classe.consiglioDiClasse ?? []) {
      for (const m of d.materie) sigle.add(m.sigla);
    }
    return this.columnsFor([...sigle].sort((a, b) => a.localeCompare(b)));
  }

  private columnsFor(sigle: string[]): MateriaColumn[] {
    return sigle.map((sigla) => {
      const header = this.materie.findByIdCached(MateriaId.of(sigla))?.sintesi.trim();
      return { sigla, header: header !== undefined && header !== '' ? header : sigla };
    });
  }

  private firstEmptyColumn(fileId: string, sheetName: string, headerRow: number): number {
    const row = this.sheets.getRanges(fileId, `${sheetName}!${headerRow}:${headerRow}`)[0] ?? [];
    let last = -1;
    row.forEach((cell, i) => {
      const isBlank = cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
      if (!isBlank) last = i;
    });
    return last + 1;
  }

  private writeHeaders(fileId: string, sheetName: string, headerRow: number, startIndex: number, columns: MateriaColumn[]): void {
    if (columns.length === 0) return;
    const from = columnIndexToLetters(startIndex);
    const to = columnIndexToLetters(startIndex + columns.length - 1);
    this.sheets.updateRanges(fileId, { range: `${sheetName}!${from}${headerRow}:${to}${headerRow}`, values: [columns.map((c) => c.header)] });
  }

  /** Substitutes only cells containing "{{" — avoids rewriting the whole (potentially large) sheet. */
  protected substitutePlaceholders(fileId: string, sheetName: string, cdu: Cdu): void {
    const info = this.sheets.getSheetInfo(fileId).find((s) => s.name === sheetName);
    const rowCount = info?.gridProperties.rowCount ?? 1000;
    const colCount = info?.gridProperties.columnCount ?? 26;
    const values = this.sheets.getRanges(fileId, `${sheetName}!A1:${columnIndexToLetters(colCount - 1)}${rowCount}`);
    const context = cdu as unknown as Record<string, unknown>;
    const updates: Array<{ range: string; values: unknown[][] }> = [];
    values.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (typeof cell === 'string' && cell.includes('{{')) {
          const rendered = this.templates.processString(cell, context);
          if (rendered !== cell) updates.push({ range: `${sheetName}!${columnIndexToLetters(c)}${r + 1}`, values: [[rendered]] });
        }
      });
    });
    if (updates.length > 0) this.sheets.updateRanges(fileId, updates);
  }
}
