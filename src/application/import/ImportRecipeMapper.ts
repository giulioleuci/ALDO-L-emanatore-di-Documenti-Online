import type { ConfigurazioneImport } from '../../domain/entities/ConfigurazioneImport';
import { ConfigurationError } from '../../domain/errors/DomainError';

/** ALDO's CONF_IMP.CONFIG vocabulary (01 §CONF_IMP, 12 §3). */
export interface AldoImportConfig {
  searchStrategy: 'FILE_SINGOLO' | 'CERCA_CARTELLE_CLASSE' | 'CERCA_DOCUMENTI';
  fileId?: string;
  map?: Record<string, string>;
  key: string;
  conflictResolution: 'IGNORE' | 'OVERWRITE' | 'TIMESTAMP';
  timestampColumn?: string;
}

const CONFLICT_MAP: Record<AldoImportConfig['conflictResolution'], ImportLoadConfig['conflictResolution']> = {
  IGNORE: 'INSERT_ONLY',
  OVERWRITE: 'OVERWRITE',
  TIMESTAMP: 'UPSERT'
};

/**
 * Translates a CONF_IMP row into the GasDataImporter recipe shape (ref 12 §3).
 * FILE_SINGOLO is the only search strategy implemented so far — the library's
 * `SheetById` source strategy covers it exactly. `CERCA_CARTELLE_CLASSE`
 * (scan per-class Drive folders) and `CERCA_DOCUMENTI` (search `LOG_DOCS`)
 * need custom `SourceStrategy` subclasses registered via
 * `ImportEngine.registerCustomSource`; deferred (typed error, not silent
 * misbehaviour) to a follow-up plan — see project memory.
 */
export function toLibraryRecipe(conf: ConfigurazioneImport): ImportRecipe {
  const cfg = conf.getConfig() as Partial<AldoImportConfig>;
  if (cfg.searchStrategy !== 'FILE_SINGOLO') {
    throw new ConfigurationError(
      `CONF_IMP ${conf.id ?? '?'}: strategia sorgente "${String(cfg.searchStrategy)}" non ancora implementata ` +
        '(solo FILE_SINGOLO è disponibile; CERCA_CARTELLE_CLASSE/CERCA_DOCUMENTI richiedono SourceStrategy custom).'
    );
  }
  if (cfg.fileId === undefined || cfg.fileId.trim() === '') {
    throw new ConfigurationError(`CONF_IMP ${conf.id ?? '?'}: CONFIG.fileId obbligatorio per FILE_SINGOLO`);
  }
  if (cfg.key === undefined || cfg.key.trim() === '') {
    throw new ConfigurationError(`CONF_IMP ${conf.id ?? '?'}: CONFIG.key obbligatorio`);
  }
  const conflictResolution = cfg.conflictResolution;
  if (conflictResolution === undefined) {
    throw new ConfigurationError(`CONF_IMP ${conf.id ?? '?'}: CONFIG.conflictResolution obbligatorio`);
  }

  const load: ImportLoadConfig = {
    targetTable: conf.target,
    conflictResolution: CONFLICT_MAP[conflictResolution],
    conflictKey: cfg.key
  };
  if (conflictResolution === 'TIMESTAMP') {
    if (cfg.timestampColumn === undefined || cfg.timestampColumn.trim() === '') {
      throw new ConfigurationError(`CONF_IMP ${conf.id ?? '?'}: CONFIG.timestampColumn obbligatorio per conflictResolution TIMESTAMP`);
    }
    load.updateIfNewer = { enabled: true, timestampColumn: cfg.timestampColumn };
  }

  const recipe: ImportRecipe = {
    name: conf.id ?? 'import',
    source: { type: 'SheetById', config: { sheetId: cfg.fileId } },
    load
  };
  if (cfg.map !== undefined) recipe.transform = { mapping: cfg.map };
  return recipe;
}

/**
 * Ghost Record Detection (ref 12 §3): a mapped row is a ghost — ignored,
 * counted separately, neither inserted nor updated — iff every field OTHER
 * than the conflict-key columns and the declared meta/timestamp columns is
 * null or an empty string. Applied after mapping, before conflict handling.
 */
export function isGhostRecord(row: Record<string, unknown>, keyColumns: string[], metaColumns: string[]): boolean {
  const excluded = new Set([...keyColumns, ...metaColumns]);
  return Object.entries(row)
    .filter(([col]) => !excluded.has(col))
    .every(([, value]) => value === null || value === undefined || value === '');
}
