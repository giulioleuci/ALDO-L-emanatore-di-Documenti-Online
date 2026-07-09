import { SheetMaterieGeneratorStrategy, columnIndexToLetters, type MateriaColumn } from './SheetMaterieGeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { RisolutoreRuoliService } from '../services/RisolutoreRuoliService';
import { GestioneSupplenti } from '../../domain/value-objects/enums';

/**
 * SHEET_CON_MATERIE_E_PERMESSI generator (10 §9): identical to
 * SheetMaterieGeneratorStrategy plus batch range protection — after the
 * subject columns are inserted, every subject-holding teacher (chain-resolved
 * through active supplenze, `GestioneSupplenti.ENTRAMBI` so both titolare and
 * supplente can write during a substitution) gets write access restricted to
 * their own column; the class coordinator is added to every column's editor
 * list for full access. Group-label pseudo-columns (`sigla === null`,
 * articulated classes) carry no ACL — they are structural headers, not
 * subject columns.
 *
 * Does NOT implement the separate MAT_NON_STANDARD.md
 * `{{focus.classe.elencoMaterieConPermessi}}` REL/ALT horizontal-expansion
 * placeholder — that needs new WorkspaceTemplateEngine (L2) structural-expansion
 * capability, out of scope here. `ElencoMaterieConPermessi.ts` and the
 * `DOCENTI_IRC_ALT` role already exist as forward-compatible groundwork for it.
 */
export class SheetMaterieConPermessiGeneratorStrategy extends SheetMaterieGeneratorStrategy {
  constructor(
    sheets: SpreadsheetService,
    materie: MateriaRepository,
    templates: ITemplateEngine,
    private readonly roles: RisolutoreRuoliService
  ) {
    super(sheets, materie, templates);
  }

  override render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void {
    const layout = this.insertColumns(fileId, cdu, config);
    this.protectColumns(fileId, cdu, layout);
    this.substitutePlaceholders(fileId, layout.sheetName, cdu);
  }

  private protectColumns(
    fileId: string,
    cdu: Cdu,
    layout: { sheetName: string; headerRow: number; startIndex: number; columns: MateriaColumn[] }
  ): void {
    const { sheetName, headerRow, startIndex, columns } = layout;
    if (!columns.some((c) => c.sigla !== null)) return;
    const coordinatori = this.roles.risolvi('COORDINATORI', cdu).map((e) => e.value);
    const info = this.sheets.getSheetInfo(fileId).find((s) => s.name === sheetName);
    const lastRow = info?.gridProperties.rowCount ?? headerRow + 1000;
    const requests = columns
      .map((column, i) => {
        if (column.sigla === null) return null;
        const docenti = this.resolveDocentiMateria(cdu, column.sigla);
        const col = columnIndexToLetters(startIndex + i);
        return {
          range: `${sheetName}!${col}${headerRow + 1}:${col}${lastRow}`,
          description: `Colonna materia ${column.sigla} (10 §9)`,
          editors: { users: [...new Set([...docenti, ...coordinatori])] }
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (requests.length > 0) this.sheets.protectRanges(fileId, requests);
  }

  /** DOCENTE_MATERIA resolution needs `meta.parametriInput.materiaCorrente` set per column — RisolutoreRuoliService reads it off the CDU it's given. */
  private resolveDocentiMateria(cdu: Cdu, sigla: string): string[] {
    const variant: Cdu = { ...cdu, meta: { ...cdu.meta, parametriInput: { ...cdu.meta.parametriInput, materiaCorrente: sigla } } };
    return this.roles.risolvi('DOCENTE_MATERIA', variant, { regolaSupplente: GestioneSupplenti.ENTRAMBI }).map((e) => e.value);
  }
}
