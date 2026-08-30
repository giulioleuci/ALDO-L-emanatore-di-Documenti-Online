import type { ConfigurazioneImport } from '../../domain/entities/ConfigurazioneImport';
import { ConfigurationError } from '../../domain/errors/DomainError';

/** ALDO's CONF_IMP.CONFIG vocabulary (01 §CONF_IMP, 12 §3). */
export interface AldoImportConfig {
  searchStrategy: 'FILE_SINGOLO' | 'CERCA_CARTELLE_CLASSE' | 'CERCA_DOCUMENTI';
  fileId?: string;
  /** CERCA_CARTELLE_CLASSE: LOG_FOLD.ID_GEN to scan for in each active class's folders. */
  folderTipo?: string;
  /** CERCA_DOCUMENTI: LOG_DOCS.ID_GEN to search for. */
  idGen?: string;
  /** CERCA_DOCUMENTI: optional LOG_DOCS.TIPO filter. */
  tipo?: string;
  /** CERCA_DOCUMENTI: optional LOG_DOCS.STATO filter. */
  stato?: string;
  /** CERCA_CARTELLE_CLASSE/CERCA_DOCUMENTI: optional sheet-tab/range/header overrides. */
  tabName?: string;
  range?: string;
  hasHeaders?: boolean;
  map?: Record<string, string>;
  key: string;
  conflictResolution: 'IGNORE' | 'OVERWRITE' | 'TIMESTAMP';
  timestampColumn?: string;
}

const CONFLICT_MAP: Record<
  AldoImportConfig['conflictResolution'],
  ImportLoadConfig['conflictResolution']
> = {
  IGNORE: 'INSERT_ONLY',
  OVERWRITE: 'OVERWRITE',
  TIMESTAMP: 'UPSERT'
};

function buildSource(
  conf: ConfigurazioneImport,
  cfg: Partial<AldoImportConfig>
): { type: string; config: Record<string, unknown> } {
  switch (cfg.searchStrategy) {
    case 'FILE_SINGOLO': {
      if (cfg.fileId === undefined || cfg.fileId.trim() === '') {
        throw new ConfigurationError(
          `CONF_IMP ${conf.id ?? '?'}: CONFIG.fileId obbligatorio per FILE_SINGOLO`
        );
      }
      return {
        type: 'SheetById',
        config: {
          sheetId: cfg.fileId,
          tabName: cfg.tabName,
          range: cfg.range,
          hasHeaders: cfg.hasHeaders
        }
      };
    }
    case 'CERCA_CARTELLE_CLASSE': {
      if (cfg.folderTipo === undefined || cfg.folderTipo.trim() === '') {
        throw new ConfigurationError(
          `CONF_IMP ${conf.id ?? '?'}: CONFIG.folderTipo obbligatorio per CERCA_CARTELLE_CLASSE`
        );
      }
      return {
        type: 'CERCA_CARTELLE_CLASSE',
        config: {
          folderTipo: cfg.folderTipo,
          tabName: cfg.tabName,
          range: cfg.range,
          hasHeaders: cfg.hasHeaders
        }
      };
    }
    case 'CERCA_DOCUMENTI': {
      if (cfg.idGen === undefined || cfg.idGen.trim() === '') {
        throw new ConfigurationError(
          `CONF_IMP ${conf.id ?? '?'}: CONFIG.idGen obbligatorio per CERCA_DOCUMENTI`
        );
      }
      return {
        type: 'CERCA_DOCUMENTI',
        config: {
          idGen: cfg.idGen,
          tipo: cfg.tipo,
          stato: cfg.stato,
          tabName: cfg.tabName,
          range: cfg.range,
          hasHeaders: cfg.hasHeaders
        }
      };
    }
    default:
      throw new ConfigurationError(
        `CONF_IMP ${conf.id ?? '?'}: strategia sorgente "${String(cfg.searchStrategy)}" sconosciuta (12 §3)`
      );
  }
}

/**
 * Translates a CONF_IMP row into the GasDataImporter recipe shape (ref 12 §3).
 * FILE_SINGOLO maps to the library's own `SheetById` source strategy;
 * `CERCA_CARTELLE_CLASSE` (scan per-class Drive folders) and
 * `CERCA_DOCUMENTI` (search `LOG_DOCS`) map to the custom `SourceStrategy`
 * subclasses in `CustomSourceStrategies.ts`, registered with the engine via
 * `ImportEngine.registerCustomSource` at composition-root time (Bootstrap.ts).
 */
export function toLibraryRecipe(conf: ConfigurazioneImport): ImportRecipe {
  const cfg = conf.getConfig() as Partial<AldoImportConfig>;
  if (cfg.key === undefined || cfg.key.trim() === '') {
    throw new ConfigurationError(`CONF_IMP ${conf.id ?? '?'}: CONFIG.key obbligatorio`);
  }
  const conflictResolution = cfg.conflictResolution;
  if (conflictResolution === undefined) {
    throw new ConfigurationError(
      `CONF_IMP ${conf.id ?? '?'}: CONFIG.conflictResolution obbligatorio`
    );
  }

  const load: ImportLoadConfig = {
    targetTable: conf.target,
    conflictResolution: CONFLICT_MAP[conflictResolution],
    conflictKey: cfg.key
  };
  if (conflictResolution === 'TIMESTAMP') {
    if (cfg.timestampColumn === undefined || cfg.timestampColumn.trim() === '') {
      throw new ConfigurationError(
        `CONF_IMP ${conf.id ?? '?'}: CONFIG.timestampColumn obbligatorio per conflictResolution TIMESTAMP`
      );
    }
    load.updateIfNewer = { enabled: true, timestampColumn: cfg.timestampColumn };
  }

  const recipe: ImportRecipe = {
    name: conf.id ?? 'import',
    source: buildSource(conf, cfg),
    load
  };
  if (cfg.map !== undefined) recipe.transform = { mapping: cfg.map };
  return recipe;
}

/**
 * Ghost Record Detection (ref 12 §3): a mapped row is a ghost — ignored,
 * counted separately, neither inserted nor updated — iff every field OTHER
 * than the conflict-key columns, the declared meta/timestamp columns, and the
 * user-reserved `_`-prefixed columns (01 §Colonne riservate all'utente) is
 * null or an empty string. Applied after mapping, before conflict handling.
 */
export function isGhostRecord(
  row: Record<string, unknown>,
  keyColumns: string[],
  metaColumns: string[]
): boolean {
  const excluded = new Set([...keyColumns, ...metaColumns]);
  return Object.entries(row)
    .filter(([col]) => !excluded.has(col) && !col.startsWith('_'))
    .every(([, value]) => value === null || value === undefined || value === '');
}
