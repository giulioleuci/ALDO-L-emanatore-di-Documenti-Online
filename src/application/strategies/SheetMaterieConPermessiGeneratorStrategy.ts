import {
  SheetMaterieGeneratorStrategy,
  columnIndexToLetters
} from './SheetMaterieGeneratorStrategy';
import type {
  MateriaColumn,
  MaterieGroups
} from './SheetMaterieGeneratorStrategy';
import type { Cdu, CduClasse } from '../context-engine/Cdu';
import { buildElencoMaterieConPermessi } from '../context-engine/ElencoMaterieConPermessi';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
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
 * The MAT_NON_STANDARD REL/ALT display group is injected at the start of the
 * first dynamic group and also exposed at the canonical
 * `focus.classe.elencoMaterieConPermessi` path. Its editors are the separately
 * resolved IRC and ALT actors merged by the `DOCENTI_IRC_ALT` role.
 */
export class SheetMaterieConPermessiGeneratorStrategy extends SheetMaterieGeneratorStrategy {
  private readonly projector = new CollectionProjector({ logger: new LoggerService() });

  constructor(
    sheets: SpreadsheetService,
    materie: IMateriaRepository,
    templates: ITemplateEngine,
    private readonly roles: RisolutoreRuoliService
  ) {
    super(sheets, materie, templates);
  }

  override render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void {
    const { sheetName, layout } = this.renderColumns(fileId, cdu, config);
    this.protectColumns(fileId, cdu, sheetName, layout);
  }

  protected override buildGroups(classe: CduClasse): MaterieGroups {
    const consiglio = classe.consiglioDiClasse ?? [];
    if (consiglio.length === 0) {
      classe.elencoMaterieConPermessi = [];
      return super.buildGroups(classe);
    }
    const hasAlt = consiglio.some((docente) =>
      docente.materie.some((materia) => materia.sigla === 'ALT')
    );
    const elenco = buildElencoMaterieConPermessi(consiglio, hasAlt);
    classe.elencoMaterieConPermessi = elenco;
    const special = elenco.find((item) => item.isSpecial);
    const groups = super.buildGroups(classe);
    if (special === undefined) return groups;
    return {
      ...groups,
      group1: [
        {
          sigla: special.sigla,
          header: special.sigla,
          isSpecial: true,
          roles: special.roles
        },
        ...groups.group1
      ]
    };
  }

  /**
   * Maps each rendered column back to its subject via `column.item.sigla`
   * (ref REPORT_GLF.md B5) — `dynamic_columns` now carries the raw
   * `MateriaColumn` source item on every non-label column, replacing the
   * previous parallel `siglaOrder` array this class had to reconstruct by
   * hand from the same group-building logic `renderColumns` used.
   */
  private protectColumns(
    fileId: string,
    cdu: Cdu,
    sheetName: string,
    layout: SheetColumnLayout[]
  ): void {
    const hasDataColumn = layout.some((c) => !c.isLabel);
    if (!hasDataColumn) return;
    const coordinatori = this.roles.risolvi('COORDINATORI', cdu).map((e) => e.value);
    const requests = layout
      .map((column) => {
        if (column.isLabel) return null;
        const item = column.item as MateriaColumn | null;
        if (item === null) return null;
        const sigla = item.sigla;
        const docenti = item.isSpecial
          ? this.roles
              .risolvi('DOCENTI_IRC_ALT', cdu, {
                regolaSupplente: GestioneSupplenti.ENTRAMBI
              })
              .map((email) => email.value)
          : this.resolveDocentiMateria(cdu, sigla);
        const col = columnIndexToLetters(column.column - 1);
        const editors = this.projector.project(
          [...docenti, ...coordinatori].map((value) => ({ value })),
          [{ type: 'distinctBy', keys: ['value'] }]
        ).value as Array<{ value: string }>;
        return {
          range: `${sheetName}!${col}:${col}`,
          description: `Colonna materia ${sigla} (10 §9)`,
          editors: { users: editors.map((editor) => editor.value) }
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (requests.length > 0) this.sheets.protectRanges(fileId, requests);
  }

  /** DOCENTE_MATERIA resolution needs `meta.parametriInput.materiaCorrente` set per column — RisolutoreRuoliService reads it off the CDU it's given. */
  private resolveDocentiMateria(cdu: Cdu, sigla: string): string[] {
    const variant: Cdu = {
      ...cdu,
      meta: { ...cdu.meta, parametriInput: { ...cdu.meta.parametriInput, materiaCorrente: sigla } }
    };
    Object.defineProperty(variant, 'tech', {
      value: cdu.tech,
      enumerable: false,
      writable: true,
      configurable: true
    });
    return this.roles
      .risolvi('DOCENTE_MATERIA', variant, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
      .map((e) => e.value);
  }
}
