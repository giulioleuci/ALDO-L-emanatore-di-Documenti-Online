import type { ConfigurazioneImportRepository } from '../../infrastructure/repositories/ConfigurazioneImportRepository';
import { toLibraryRecipe, isGhostRecord } from '../import/ImportRecipeMapper';
import { PipelineError } from '../../domain/errors/DomainError';

export interface ImportResult {
  inseriti: number;
  aggiornati: number;
  saltati: number;
  ghost: number;
  errori: string[];
}

/** Columns never subject to Ghost Record Detection besides the conflict key (ref 12 §3). */
const META_COLUMNS = ['DATA_MODIFICA'];

/**
 * Import application service (ref 12 §3): orchestrates GasDataImporter's
 * `ImportEngine` — extraction, transformation and load strategy resolution
 * are entirely the library's job (`toLibraryRecipe` only translates
 * vocabulary). The one piece of business logic ALDO adds is Ghost Record
 * Detection, applied between transform and load: a mapped row where every
 * non-key, non-metadata field is empty is dropped before it ever reaches the
 * library's conflict-resolution strategies, and counted separately.
 *
 * Runs through the library's public `ImportEngine.runImport(recipe, options)`
 * facade rather than calling the private `_executeExtract`/`_executeTransform`
 * /`_executeLoad` phase methods directly, via `runImport`'s `postTransform`
 * hook (`(transformedData, config) => filteredData`) — this keeps ghost
 * filtering entirely inside the library's own pipeline, so imports still get
 * `GasResilienceLib`-backed retry/backoff and `GasProcessMonitorLib` job
 * progress reporting, both of which the private-method bypass silently lost.
 */
export class ImportService {
  constructor(
    private readonly engine: ImportEngine,
    private readonly configs: ConfigurazioneImportRepository
  ) {}

  /** Runs one CONF_IMP job end to end (ref 12 §3, steps 1-8). */
  executeImport(configId: string): ImportResult {
    const conf = this.configs.findById(configId);
    if (conf === null) throw new PipelineError(`CONF_IMP ${configId} non trovato`);
    if (!conf.isAttivo()) {
      return { inseriti: 0, aggiornati: 0, saltati: 0, ghost: 0, errori: ['skipped: ATTIVO=false'] };
    }

    const recipe = toLibraryRecipe(conf);
    let ghostCount = 0;

    const result = this.engine.runImport(recipe, {
      postTransform: (mapped, configuration) => {
        const load = configuration.getLoad();
        const keyColumns = load.conflictKey === undefined ? [] : [load.conflictKey];
        const metaColumns = load.updateIfNewer?.timestampColumn !== undefined
          ? [...META_COLUMNS, load.updateIfNewer.timestampColumn]
          : META_COLUMNS;
        const toLoad = mapped.filter((row) => !isGhostRecord(row, keyColumns, metaColumns));
        ghostCount = mapped.length - toLoad.length;
        return toLoad;
      }
    });

    return {
      inseriti: result.load.inserted,
      aggiornati: result.load.updated,
      saltati: result.load.skipped,
      ghost: ghostCount,
      errori: []
    };
  }

  /** Runs every ATTIVO=true CONF_IMP job in sequence; one failure never aborts the others (ref 12 §3). */
  executeAllActiveImports(): Array<{ configId: string; result: ImportResult }> {
    const results: Array<{ configId: string; result: ImportResult }> = [];
    for (const conf of this.configs.findAttivi()) {
      const configId = conf.id ?? '';
      try {
        results.push({ configId, result: this.executeImport(configId) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ configId, result: { inseriti: 0, aggiornati: 0, saltati: 0, ghost: 0, errori: [msg] } });
      }
    }
    return results;
  }
}
