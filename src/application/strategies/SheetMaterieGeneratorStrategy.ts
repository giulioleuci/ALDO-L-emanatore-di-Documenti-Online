import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu, CduClasse } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ConfigurationError } from '../../domain/errors/DomainError';

/** 0-based column index -> A1 letters ("A", "Z", "AA", ...). Still needed by the
 * `_E_PERMESSI` subclass to turn a `SheetColumnLayout.column` (1-based) into an
 * A1 column letter for `protectRanges` requests. */
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
}

/** One resolved subject column: `sigla` identifies the DB row, `header` is the
 * already-resolved display text (`{{value}}`-side of the `dynamic_columns`
 * contract — see class doc comment). */
export interface MateriaColumn {
  sigla: string;
  header: string;
}

/**
 * The `materieColonne` groups object placed onto the rendering context (see
 * class doc comment for the full `dynamic_columns` placeholder convention).
 * `group2`/`group3` (and their labels) are omitted entirely when the
 * corresponding partner has no subject-specific columns — mirrors
 * `SheetProcessor.js`'s own "empty 2nd+ group renders nothing, no label
 * either" rule.
 */
export interface MaterieGroups {
  group1: MateriaColumn[];
  group2?: MateriaColumn[];
  group2Label?: string;
  group3?: MateriaColumn[];
  group3Label?: string;
}

function readParams(config: ConfigurazioneDocumento): SheetMaterieParams {
  const p = config.getParametri();
  return { sheetName: typeof p['sheetName'] === 'string' ? p['sheetName'] : undefined };
}

/**
 * SHEET_CON_MATERIE generator (10 §9): after the Sheet template is cloned,
 * expands one column per class subject via WorkspaceTemplateEngine's
 * `{{dynamic_columns[...]}}` directive — the Drive template itself, not
 * `CONF_DOC.PARAMETRI`, determines where the columns start (10 §9, revised).
 *
 * `CONF_DOC.PARAMETRI` now carries only `sheetName` (default: process every
 * sheet in the file, letting the placeholder's own sheet determine the
 * target).
 *
 * Placeholder contract (`materieColonne`, placed on the rendering context by
 * `renderColumns` below): the Drive template author writes one
 * `{{dynamic_columns[...]}}` placeholder using this numbered-suffix group
 * syntax (`WorkspaceTemplateEngine/src/processors/SheetProcessor.js`,
 * `_bucketDynamicColumnGroups`/`_prepareDynamicColumnRequests`):
 *
 *   {{dynamic_columns[
 *     source=materieColonne.group1,value=header,
 *     source2=materieColonne.group2,value2=header,label2=materieColonne.group2Label,
 *     source3=materieColonne.group3,value3=header,label3=materieColonne.group3Label
 *   ]}}
 *
 * Group 1 = shared subjects (articulated classes: `articolazione.materieCondivise`;
 * non-articulated: every subject across the CDC, deduped+sorted). Group 2/3 =
 * each partner's subject-specific columns (`materieSeparatePrimoGruppo` /
 * `materieSeparateSecondoGruppo`), each preceded by a label column carrying
 * the partner's class id (`articolazione.partners[i]`), omitted when that
 * partner has no subject-specific columns. Every subject item's display text
 * is resolved BEFORE being placed on the context (`columnsFor`,
 * `MateriaRepository.findByIdCached(...).sintesi`, falling back to the sigla
 * itself) so the template's `value=header` expression is a plain field read,
 * not a repository lookup.
 *
 * `processSheet` performs both the column expansion AND generic `{{...}}`
 * cell substitution in the same scan/batch (`SheetProcessor.js#process`), so
 * a single call is enough — there is no separate substitution step.
 */
export class SheetMaterieGeneratorStrategy implements GeneratorStrategy {
  constructor(
    protected readonly sheets: SpreadsheetService,
    protected readonly materie: MateriaRepository,
    protected readonly templates: ITemplateEngine
  ) {}

  render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void {
    this.renderColumns(fileId, cdu, config);
  }

  /**
   * Resolves the target CDU class, builds the `materieColonne` groups object,
   * and renders the sheet in one `processSheet` call. Each resolved
   * `SheetColumnLayout` entry carries its own source `MateriaColumn` (`item`,
   * ref REPORT_GLF.md B5), so the `_E_PERMESSI` subclass reads
   * `column.item.sigla` directly instead of a parallel positionally-tracked
   * array.
   */
  protected renderColumns(
    fileId: string,
    cdu: Cdu,
    config: ConfigurazioneDocumento
  ): { sheetName: string; layout: SheetColumnLayout[] } {
    const classe = cdu.focus.classe;
    if (classe === undefined) {
      throw new ConfigurationError(`CONF_DOC ${config.id ?? '?'}: SHEET_CON_MATERIE richiede focus.classe nel CDU`);
    }
    const params = readParams(config);
    const sheetInfo = this.sheets.getSheetInfo(fileId);
    if (params.sheetName !== undefined && !sheetInfo.some((s) => s.name === params.sheetName)) {
      throw new ConfigurationError(`CONF_DOC ${config.id ?? '?'}: foglio "${params.sheetName}" non trovato in ${fileId}`);
    }
    const resolvedSheetName = params.sheetName ?? sheetInfo[0]?.name ?? '';

    const groups = this.buildGroups(classe);
    const context: Record<string, unknown> = { ...(cdu as unknown as Record<string, unknown>), materieColonne: groups };
    const layout = this.templates.processSheet(fileId, context, params.sheetName);
    return { sheetName: resolvedSheetName, layout };
  }

  /** Ordered groups for the class's subjects (articulated: shared -> per-partner; non-articulated: one dedup+sorted group). */
  protected buildGroups(classe: CduClasse): MaterieGroups {
    if (classe.flags.isArticolata && classe.articolazione !== undefined) {
      const a = classe.articolazione;
      const partners = a.partners ?? [];
      const group1 = this.resolveMateriaColumns(a.materieCondivise);
      const group2 = this.resolveMateriaColumns(a.materieSeparatePrimoGruppo);
      const group3 = this.resolveMateriaColumns(a.materieSeparateSecondoGruppo);
      return {
        group1,
        ...(group2.length > 0 ? { group2, group2Label: partners[0] ?? 'Gruppo 1' } : {}),
        ...(group3.length > 0 ? { group3, group3Label: partners[1] ?? 'Gruppo 2' } : {})
      };
    }
    const sigle = new Set<string>();
    for (const d of classe.consiglioDiClasse ?? []) {
      for (const m of d.materie) sigle.add(m.sigla);
    }
    return { group1: this.resolveMateriaColumns([...sigle].sort((a, b) => a.localeCompare(b))) };
  }

  /** Resolves each sigla's display text (ports the pre-refactor `columnsFor`'s lookup logic: `MateriaRepository.findByIdCached(...).sintesi`, falling back to the sigla itself) BEFORE the item is placed on the context, so the template's `value=header` expression is a plain field read. */
  private resolveMateriaColumns(sigle: string[]): MateriaColumn[] {
    return sigle.map((sigla) => {
      const header = this.materie.findByIdCached(MateriaId.of(sigla))?.sintesi.trim();
      return { sigla, header: header !== undefined && header !== '' ? header : sigla };
    });
  }
}
