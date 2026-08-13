import {
  SheetMaterieGeneratorStrategy,
  columnIndexToLetters
} from './SheetMaterieGeneratorStrategy';
import type { MateriaColumn, MaterieGroups } from './SheetMaterieGeneratorStrategy';
import type { Cdu, CduClasse } from '../context-engine/Cdu';
import { buildElencoMaterieConPermessi } from '../context-engine/ElencoMaterieConPermessi';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { RisolutoreRuoliService } from '../services/RisolutoreRuoliService';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';

function protectionGestioneSupplenti(config: ConfigurazioneDocumento): GestioneSupplenti {
  const permissions = config.getPermessi();
  const routing = permissions.regolaSupplente;
  const raw =
    typeof routing === 'object' && routing !== null
      ? (routing as Record<string, unknown>).file
      : undefined;
  if (raw === undefined || raw === null || raw === '') return GestioneSupplenti.ENTRAMBI;
  if (
    raw === GestioneSupplenti.SOLO_TITOLARI ||
    raw === GestioneSupplenti.SOLO_SUPPLENTI ||
    raw === GestioneSupplenti.ENTRAMBI
  ) {
    return raw;
  }
  throw new ConfigurationError(
    `SHEET_CON_MATERIE_E_PERMESSI: PERMESSI.regolaSupplente.file non valido: ${JSON.stringify(raw)}`
  );
}

/**
 * Printable projection of one `MateriaColumn` for `classe.sheet.materieColonne`
 * (02 §4.1) — drops the ACL-only `classeId`/`specificita`/`kind` fields that
 * `resolveMateriaColumns` (`SheetMaterieGeneratorStrategy`) still carries as
 * ordinary enumerable properties (only `.kind` is hidden via
 * `Object.defineProperty`). A narrower TS type on `CduClasse['sheet']` alone
 * doesn't strip these at runtime/`JSON.stringify` — an object literal copy is
 * required. `buildGroups()`'s own return value (used for `dynamic_columns`
 * template rendering) is intentionally left untouched; only what's attached
 * to `classe.sheet` is narrowed.
 */
function toPrintableColumn(column: MateriaColumn): NonNullable<CduClasse['sheet']>['materieColonne']['group1'][number] {
  const printable: NonNullable<CduClasse['sheet']>['materieColonne']['group1'][number] = {
    sigla: column.sigla,
    header: column.header
  };
  if (column.isSpecial !== undefined) printable.isSpecial = column.isSpecial;
  if (column.roles !== undefined) printable.roles = column.roles;
  return printable;
}

function toPrintableGroups(groups: MaterieGroups): NonNullable<CduClasse['sheet']>['materieColonne'] {
  return {
    group1: groups.group1.map(toPrintableColumn),
    group2: groups.group2.map(toPrintableColumn),
    group3: groups.group3.map(toPrintableColumn),
    ...(groups.group2Label === undefined ? {} : { group2Label: groups.group2Label }),
    ...(groups.group3Label === undefined ? {} : { group3Label: groups.group3Label })
  };
}

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
  private readonly logger = new LoggerService();
  private readonly projector = new CollectionProjector({ logger: this.logger });

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
    this.protectColumns(
      fileId,
      cdu,
      sheetName,
      layout,
      protectionGestioneSupplenti(config)
    );
  }

  protected override buildGroups(classe: CduClasse): MaterieGroups {
    const consiglio = classe.consiglioDiClasse ?? [];
    if (consiglio.length === 0) {
      classe.elencoMaterieConPermessi = [];
      const groups = super.buildGroups(classe);
      classe.sheet = { materieColonne: toPrintableGroups(groups) };
      return groups;
    }
    const hasAlt = consiglio.some((docente) =>
      docente.materie.some((materia) => materia.sigla === 'ALT')
    );
    const elenco = buildElencoMaterieConPermessi(consiglio, hasAlt);
    classe.elencoMaterieConPermessi = elenco;
    const special = elenco.find((item) => item.isSpecial);
    const groups = super.buildGroups(classe);
    const finalGroups: MaterieGroups =
      special === undefined
        ? groups
        : {
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
    classe.sheet = { materieColonne: toPrintableGroups(finalGroups) };
    return finalGroups;
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
    layout: SheetColumnLayout[],
    gestioneSupplenti: GestioneSupplenti
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
                regolaSupplente: gestioneSupplenti
              })
              .map((email) => email.value)
          : this.resolveDocentiMateria(cdu, item, gestioneSupplenti);
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
    if (requests.length === 0) return;
    const result = this.sheets.protectRanges(fileId, requests, { onError: 'continue' });
    for (const failure of result.failures ?? []) {
      this.logger.warn(
        `SHEET_CON_MATERIE_E_PERMESSI: protezione ${failure.request.range} non applicata — ${failure.message}`
      );
    }
  }

  /** DOCENTE_MATERIA resolution needs `meta.parametriInput.materiaCorrente` set per column — RisolutoreRuoliService reads it off the CDU it's given. */
  private resolveDocentiMateria(
    cdu: Cdu,
    item: MateriaColumn,
    gestioneSupplenti: GestioneSupplenti
  ): string[] {
    const sigla = item.sigla;
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
      .risolvi('DOCENTE_MATERIA', variant, {
        regolaSupplente: gestioneSupplenti,
        ...(item.classeId === undefined ? {} : { classeId: item.classeId }),
        ...(item.specificita === undefined ? {} : { specifica: item.specificita }),
        ...(item.kind === undefined ? {} : { kind: item.kind })
      })
      .map((e) => e.value);
  }
}
