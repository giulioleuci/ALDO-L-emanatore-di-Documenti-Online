import type { ImportRow, ImportOptions, ImportBudget } from '../types.js';
import type { ImportEngine } from '../ImportEngine.js';
import { ImportConfiguration } from '../ImportConfiguration.js';
import { ImportCheckpoint } from '../ImportCheckpoint.js';
export declare class ImportPipelineExecutor {
    facade: ImportEngine;
    constructor(facade: ImportEngine);
    /**
     * Creates the initial checkpoint for a resumable/checkpointed import run,
     * without executing any pipeline phase yet. Pair with `runImportChunk` in
     * a loop (persisting the checkpoint to `PropertiesService` between GAS
     * execution windows via `JobRunnerLib`) to drive the recipe to completion
     * across multiple bounded chunks instead of one synchronous `runImport`.
     * @param {Object} recipe Import configuration (see ImportConfiguration).
     * @param {Object} [_options={}] Reserved for future use.
     * @returns {ImportCheckpoint} Initial checkpoint at the EXTRACT stage.
     * @throws {ConfigurationError} If the recipe fails validation.
     */
    startImport(recipe: unknown, _options?: ImportOptions): ImportCheckpoint<ImportRow>;
    /**
     * Advances a checkpoint by one bounded unit of work. The recipe must be
     * re-passed on every call — it is intentionally not part of the
     * serializable checkpoint, to keep checkpoints small (`PropertiesService`
     * has per-key size limits) and because the recipe is normally already
     * available to the caller (e.g. `JobHandlerParams` in ALDO's `JobRunnerLib`
     * integration).
     *
     * Unlike the original design (extract everything into the buffer, then
     * transform the whole buffer, then load the whole buffer), each call now
     * does bounded work and `checkpoint.buffer` never holds more than roughly
     * one `maxRows`-sized batch at rest between calls (for the cursor-aware
     * case) — otherwise `checkpoint.buffer` could grow to the size of the
     * entire dataset, which won't fit in `PropertiesService` (~9KB per key,
     * ~500KB total), and TRANSFORM/LOAD would each still run unbounded in one
     * call, defeating the point of chunking:
     *
     * - **`EXTRACT`** (entered when `checkpoint.buffer` is empty and
     *   extraction isn't exhausted): pulls one bounded window of rows (see
     *   "Cursor-aware extraction" below), immediately transforms *that chunk*
     *   (`Transformer.transform` is a pure per-row mapping, so transforming a
     *   bounded slice is safe), and stores the transformed, load-ready rows as
     *   `checkpoint.buffer`. Moves to `LOAD`. Whether the source is now fully
     *   consumed is remembered in `checkpoint.rowOffset` (repurposed as a 0/1
     *   "extraction exhausted" flag — the field was previously reserved and
     *   unused) so the `LOAD` branch below can decide, without re-extracting,
     *   whether there is more to pull after this buffer is loaded.
     * - **`LOAD`** (entered when `checkpoint.buffer` has pending rows): loads
     *   the buffer via `Loader.loadChunk` (already handles arbitrary-size
     *   input, since it's already one bounded chunk) and clears the buffer.
     *   `isFirstChunk` is true only on the very first `LOAD` call of the
     *   entire run that actually carries a non-empty buffer
     *   (`checkpoint.loadOffset === 0`); `loadOffset` only increments when the
     *   chunk being loaded is non-empty — an empty chunk (e.g. a leading block
     *   of rows that were all rejected by transform validation, or a genuinely
     *   empty extracted window) does NOT consume the "first chunk" slot,
     *   because `Loader.loadChunk` short-circuits on `data.length === 0`
     *   before OVERWRITE's purge-then-insert logic ever runs — if `loadOffset`
     *   advanced anyway, the table would never get purged for a run whose
     *   first real data happened to arrive after an empty chunk. If
     *   extraction was already exhausted, moves to `DONE`; otherwise moves
     *   back to `EXTRACT` to pull the next bounded chunk.
     *
     * There is no standalone `TRANSFORM` stage: an earlier design produced one
     * (transforming the whole accumulated buffer in its own step), but that
     * design was replaced before ever shipping — transform now happens inline
     * during `EXTRACT`, on the bounded chunk — so no checkpoint constructed by
     * this pipeline (`startImport`, or any transition below) ever carries
     * `stage: 'TRANSFORM'`. A checkpoint whose `stage` isn't `EXTRACT`, `LOAD`,
     * or `DONE` is therefore foreign/corrupt and `runImportChunk` throws
     * rather than silently treating it as complete.
     *
     * Extract-phase behavior depends on `SourceStrategy.supportsCursor()`:
     * cursor-aware strategies (currently only `SheetByIdStrategy`) extract one
     * bounded window per call via `extractChunk`, so the streaming/
     * bounded-buffer guarantee above holds for them. Strategies that don't
     * support cursors fall back to a compatibility path: the entire source is
     * extracted (and, in this call, transformed) in a single call, reported as
     * immediately exhausted — so the bounded-buffer guarantee does NOT hold
     * for non-cursor sources; only `SheetById` truly streams.
     * @param {Object} recipe Import configuration — must match `checkpoint.recipeName`.
     * @param {ImportCheckpoint} checkpoint Checkpoint to resume from.
     * @param {Object} [budget={}] Per-call work limits.
     * @param {number} [budget.maxRows=500] Maximum rows to extract in this call.
     * @returns {{checkpoint: ImportCheckpoint, done: boolean}} Advanced checkpoint and completion flag.
     * @throws {ConfigurationError} If the recipe fails validation.
     * @throws {Error} If `checkpoint.recipeName` doesn't match the recipe being resumed.
     * @throws {ImportError} `UNRECOGNIZED_CHECKPOINT_STAGE` if `checkpoint.stage` isn't
     *   one of `EXTRACT`, `LOAD`, or `DONE` (a foreign/corrupt checkpoint).
     */
    runImportChunk(recipe: unknown, checkpoint: ImportCheckpoint, budget?: ImportBudget): {
        checkpoint: ImportCheckpoint<ImportRow>;
        done: boolean;
    };
    runImport(recipe: unknown, options?: ImportOptions): {
        extract: {
            rowsExtracted: number;
            rowCount: number;
        };
        transform: {
            rowsTransformed: number;
            recordsProcessed: number;
        };
        load: {
            recordsProcessed: number;
            failed: number;
            success: boolean;
            inserted: number;
            updated: number;
            skipped: number;
            deleted: number;
            total: number;
            dryRun?: boolean;
        };
        success: boolean;
        importName: string;
        durationMs: number;
    };
    _executePipeline(config: ImportConfiguration, dryRun: boolean, jobId?: string | null, postTransform?: ImportOptions['postTransform']): {
        extract: {
            rowsExtracted: number;
            rowCount: number;
        };
        transform: {
            rowsTransformed: number;
            recordsProcessed: number;
        };
        load: {
            recordsProcessed: number;
            failed: number;
            success: boolean;
            inserted: number;
            updated: number;
            skipped: number;
            deleted: number;
            total: number;
            dryRun?: boolean;
        };
    };
    _executeExtract(config: ImportConfiguration): ImportRow[];
    _executeTransform(data: ImportRow[], config: ImportConfiguration): ImportRow[];
    _executeLoad(data: ImportRow[], config: ImportConfiguration): import("../types.js").LoadResult;
    _generateDryRunLoadResult(data: ImportRow[]): {
        success: boolean;
        inserted: number;
        updated: number;
        skipped: number;
        deleted: number;
        total: number;
        dryRun: boolean;
    };
}
