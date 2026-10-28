import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu, ClasseFocusVM } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { TeachingSlotKind } from '../../domain/repositories/IClasseRepository';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ConfigurationError } from '../../domain/errors/DomainError';
import {
  getCduMateriaAssignmentIdentity
} from '../context-engine/CduInternalMetadata';

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
  specificita?: string;
  header: string;
  /** Partner class that owns this column when the subject is articulated. */
  classeId?: string;
  kind?: TeachingSlotKind;
  isSpecial?: boolean;
  roles?: string[];
}

/**
 * The `materieColonne` groups object placed onto the rendering context (see
 * class doc comment for the full `dynamic_columns` placeholder convention).
 * Every group is always an array so templates can safely reference all three
 * dynamic-column sources. Labels remain optional when the corresponding
 * partner has no subject-specific columns.
 */
export interface MaterieGroups {
  group1: MateriaColumn[];
  group2: MateriaColumn[];
  group2Label?: string;
  group3: MateriaColumn[];
  group3Label?: string;
}

/**
 * Printable copy for `classe.sheet.materieColonne` (02 §4.1): drops the ACL-only
 * `classeId`/`specificita`/`kind` fields of `MateriaColumn` — a narrower TS type
 * alone would not strip them at runtime/`JSON.stringify`.
 */
export function toPrintableGroups(groups: MaterieGroups) {
  const rows = [
    { label: '', colonne: groups.group1 },
    { label: groups.group2Label ?? '', colonne: groups.group2 },
    { label: groups.group3Label ?? '', colonne: groups.group3 }
  ];
  return {
    gruppi: rows.map(({ label, colonne }, index) => ({
      indice: index + 1,
      label,
      colonne: colonne.map(({ sigla, header, isSpecial, roles }) => ({
        sigla,
        header,
        isSpeciale: isSpecial === true,
        ruoli: roles ?? []
      })),
      hasColonne: colonne.length > 0,
      numero: colonne.length
    }))
  };
}

type MateriaColumnInput = Omit<MateriaColumn, 'header'>;

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
    protected readonly materie: IMateriaRepository,
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
  ): { sheetName: string; layout: SheetColumnLayout[]; groups: MaterieGroups } {
    const classe = cdu.focus.classe;
    if (classe === undefined) {
      throw new ConfigurationError(
        `CONF_DOC ${config.id ?? '?'}: SHEET_CON_MATERIE richiede focus.classe nel CDU`
      );
    }
    const params = readParams(config);
    const sheetInfo = this.sheets.getSheetInfo(fileId);
    if (params.sheetName !== undefined && !sheetInfo.some((s) => s.name === params.sheetName)) {
      throw new ConfigurationError(
        `CONF_DOC ${config.id ?? '?'}: foglio "${params.sheetName}" non trovato in ${fileId}`
      );
    }
    const resolvedSheetName = params.sheetName ?? sheetInfo[0]?.name ?? '';

    const groups = this.buildGroups(classe);
    classe.sheet = {
      materieConPermessi: classe.sheet?.materieConPermessi ?? {
        elenco: [],
        hasElenco: false,
        numero: 0
      },
      materieColonne: toPrintableGroups(groups)
    };
    const layout = this.templates.processSheet(fileId, cdu as unknown as Record<string, unknown>, params.sheetName);
    return { sheetName: resolvedSheetName, layout, groups };
  }

  /** Ordered groups for the class's subjects (articulated: shared -> per-partner; non-articulated: one dedup+sorted group). */
  protected buildGroups(classe: ClasseFocusVM): MaterieGroups {
    if (classe.isArticolata && classe.articolazione !== undefined) {
      const a = classe.articolazione;
      const partners = a.sottoClassi.map((partner) => partner.nome);
      const group1 = this.resolveMateriaColumns(a.materieComuni.map((m) => this.columnForId(m.sigla)));
      const group2 = this.resolveMateriaColumns(
        a.materieSeparatePrimo.map((m) => this.columnForId(m.sigla, partners[0]))
      );
      const group3 = this.resolveMateriaColumns(
        a.materieSeparateSecondo.map((m) => this.columnForId(m.sigla, partners[1]))
      );
      return {
        group1,
        group2,
        group3,
        ...(group2.length > 0 ? { group2Label: partners[0] ?? 'Gruppo 1' } : {}),
        ...(group3.length > 0 ? { group3Label: partners[1] ?? 'Gruppo 2' } : {})
      };
    }
    const columns = new Map<string, MateriaColumnInput>();
    for (const d of classe.consiglio?.elenco ?? []) {
      for (const m of d.materie) {
        const identity = getCduMateriaAssignmentIdentity(m);
        const column: MateriaColumnInput = {
          // SubjectVM now exposes a specifica catalog row through its composite
          // ID (e.g. LAB.GRUPPO_A); `specificita` is its display label, not the
          // technical CLASSI-column token. Split the catalog ID back into the
          // base MateriaId and token before querying findSpecifiche().
          ...this.columnForId(m.sigla),
          ...(identity?.kind === 'SPECIFICA' ? { kind: identity.kind } : {})
        };
        columns.set(`${column.sigla}.${column.specificita ?? ''}`, column);
      }
    }
    return {
      group1: this.resolveMateriaColumns(
        [...columns.values()].sort((a, b) => this.catalogId(a).localeCompare(this.catalogId(b)))
      ),
      group2: [],
      group3: []
    };
  }

  private columnForId(id: string, classeId?: string): MateriaColumnInput {
    const separator = id.indexOf('.');
    return {
      sigla: separator === -1 ? id : id.slice(0, separator),
      ...(separator === -1 ? {} : { specificita: id.slice(separator + 1), kind: 'SPECIFICA' }),
      ...(classeId === undefined ? {} : { classeId })
    };
  }

  private catalogId(column: Pick<MateriaColumnInput, 'sigla' | 'specificita'>): string {
    return column.specificita === undefined ? column.sigla : `${column.sigla}.${column.specificita}`;
  }

  /** Resolves each column's display text from MATERIE.SINTESI before template rendering. */
  private resolveMateriaColumns(columns: MateriaColumnInput[]): MateriaColumn[] {
    return columns
      .filter((column) => column.sigla !== 'IRC' && column.sigla !== 'ALT')
      .map((column) => {
        const catalogId = this.catalogId(column);
        const materia =
          column.specificita === undefined
            ? this.materie.findByIdCached(MateriaId.of(column.sigla))
            : (this.materie
                .findSpecifiche(MateriaId.of(column.sigla))
                .find((item) => item.id === catalogId) ?? null);
        const header = materia?.sintesi.trim();
        const { kind, ...rendered } = column;
        const result: MateriaColumn = {
          ...rendered,
          header: header !== undefined && header !== '' ? header : catalogId
        };
        if (kind !== undefined) {
          Object.defineProperty(result, 'kind', { value: kind, enumerable: false });
        }
        return result;
      });
  }
}
