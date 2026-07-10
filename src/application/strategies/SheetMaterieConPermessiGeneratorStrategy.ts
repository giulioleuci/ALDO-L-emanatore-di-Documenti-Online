import { SheetMaterieGeneratorStrategy, columnIndexToLetters } from './SheetMaterieGeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { RisolutoreRuoliService } from '../services/RisolutoreRuoliService';
import { GestioneSupplenti } from '../../domain/value-objects/enums';

/**
 * SHEET_CON_MATERIE_E_PERMESSI generator (10 §9): identical to
 * SheetMaterieGeneratorStrategy plus batch range protection — after
 * `dynamic_columns` expands the subject columns, every subject-holding
 * teacher (chain-resolved through active supplenze,
 * `GestioneSupplenti.ENTRAMBI` so both titolare and supplente can write
 * during a substitution) gets write access to their own column (the whole
 * column, `scope=column` semantics — matching `dynamic_columns`' own default
 * ACL scope, since the resolved layout carries no header-row information to
 * exclude); the class coordinator is added to every column's editor list for
 * full access. Group-label pseudo-columns (`isLabel: true`, articulated
 * classes) carry no ACL — they are structural headers, not subject columns.
 *
 * Does NOT implement the separate MAT_NON_STANDARD.md
 * `{{focus.classe.elencoMaterieConPermessi}}` REL/ALT horizontal-expansion
 * placeholder. Re-verified against library source (2026-07-10): the claim
 * that WorkspaceTemplateEngine lacks this structural-expansion capability was
 * WRONG — `PlaceholderService.processSheet`'s `{{dynamic_columns[source=...,
 * value=...,acl=...,scope=column]}}` directive
 * (`WorkspaceTemplateEngine/src/processors/SheetProcessor.js#_prepareDynamicColumnRequests`)
 * already does exactly this: one column per source-array item, with a
 * per-item header path and an optional per-item ACL protecting the whole
 * column. This strategy still doesn't use the directive's own static `acl=`
 * for ITS OWN protection, because the editor list needs full
 * role-resolution/supplenza-chain logic (`RisolutoreRuoliService`) the
 * directive's static per-item expression can't express — that logic stays
 * here, in `protectColumns`, applied to the layout `dynamic_columns` already
 * resolved. Wiring `elencoMaterieConPermessi` itself onto `dynamic_columns` is
 * a genuine, separate scope decision (new CONF_DOC.PARAMETRI/template
 * contract for REL/ALT), left out of this task; `ElencoMaterieConPermessi.ts`
 * and the `DOCENTI_IRC_ALT` role remain forward-compatible groundwork for it.
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
    const { sheetName, layout, siglaOrder } = this.renderColumns(fileId, cdu, config);
    this.protectColumns(fileId, cdu, sheetName, layout, siglaOrder);
  }

  private protectColumns(
    fileId: string,
    cdu: Cdu,
    sheetName: string,
    layout: SheetColumnLayout[],
    siglaOrder: Array<string | null>
  ): void {
    const hasDataColumn = layout.some((c) => !c.isLabel);
    if (!hasDataColumn) return;
    const coordinatori = this.roles.risolvi('COORDINATORI', cdu).map((e) => e.value);
    const requests = layout
      .map((column, i) => {
        if (column.isLabel) return null;
        const sigla = siglaOrder[i];
        if (sigla === null || sigla === undefined) return null;
        const docenti = this.resolveDocentiMateria(cdu, sigla);
        const col = columnIndexToLetters(column.column - 1);
        return {
          range: `${sheetName}!${col}:${col}`,
          description: `Colonna materia ${sigla} (10 §9)`,
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
