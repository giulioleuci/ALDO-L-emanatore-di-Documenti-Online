import type { ImportRow, SourceCursor, ImportCounters, CheckpointData } from './types.js';
/**
 * @fileoverview Serializable checkpoint contract for resumable imports.
 * @author GasLibraryFactory
 */
/** @typedef {'EXTRACT'|'LOAD'|'DONE'} ImportStage */
/**
 * Plain, JSON-serializable checkpoint describing progress through a single
 * recipe's ETL pipeline (EXTRACT -> LOAD -> DONE, transform runs inline
 * during EXTRACT on each bounded chunk). Designed to
 * be persisted via `PropertiesService`/`JobRunnerLib` between GAS execution
 * windows and resumed with `ImportEngine.runImportChunk`.
 * @class
 */
declare class ImportCheckpoint<Row extends object = ImportRow> {
    recipeName: string;
    stage: CheckpointData<Row>['stage'];
    sourceCursor: SourceCursor | null;
    rowOffset: number;
    loadOffset: number;
    counters: ImportCounters;
    buffer: Row[] | null;
    done: boolean;
    /**
     * @param {string} recipeName Name of the recipe this checkpoint belongs to.
     * @param {ImportStage} stage Current pipeline stage.
     * @param {*} sourceCursor Opaque cursor understood by the extract strategy
     *   (e.g. `{ rowOffset, headers }` for `SheetByIdStrategy`).
     * @param {number} rowOffset 0/1 flag set by `ImportPipelineExecutor.runImportChunk`'s
     *   `EXTRACT` stage: 1 once the source has reported itself exhausted (no more
     *   rows to pull), 0 while more remains. Consulted by the `LOAD` stage to
     *   decide whether the next call goes back to `EXTRACT` or on to `DONE`,
     *   without re-extracting to find out.
     * @param {number} loadOffset Number of *non-empty* load chunks already
     *   committed (an empty chunk — e.g. one that had zero load-ready rows
     *   after transform validation — does not increment this). Used by
     *   `ImportPipelineExecutor.runImportChunk`'s `LOAD` stage to derive
     *   `isFirstChunk` (`loadOffset === 0`), which gates OVERWRITE's one-time
     *   purge-then-insert.
     * @param {Object} counters Running totals across all pipeline phases.
     * @param {Array<Object>|null} buffer Rows carried between stages (extracted
     *   rows awaiting transform, or transformed rows awaiting load).
     * @param {boolean} done True once the pipeline has reached the DONE stage.
     */
    constructor(recipeName: string, stage: CheckpointData<Row>['stage'], sourceCursor: SourceCursor | null, rowOffset: number, loadOffset: number, counters: ImportCounters, buffer: Row[] | null, done: boolean);
    /**
     * Builds a fresh checkpoint at the EXTRACT stage with zeroed counters.
     * @param {string} recipeName Name of the recipe to import.
     * @returns {ImportCheckpoint} Initial checkpoint.
     */
    static initial<Row extends object = ImportRow>(recipeName: string): ImportCheckpoint<Row>;
    /**
     * Rehydrates a checkpoint from its plain-object JSON form (e.g. after
     * round-tripping through `PropertiesService`).
     * @param {Object} obj Plain object matching the `ImportCheckpoint` shape.
     * @returns {ImportCheckpoint} Rehydrated checkpoint instance.
     */
    static fromJSON<Row extends object = ImportRow>(obj: CheckpointData<Row>): ImportCheckpoint<Row>;
    /**
     * Guards against resuming a checkpoint with the wrong recipe.
     * @param {ImportCheckpoint} checkpoint Checkpoint being resumed.
     * @param {string} recipeName Name of the recipe the caller intends to resume.
     * @throws {Error} If the checkpoint's recipeName does not match.
     */
    static assertMatches(checkpoint: Pick<CheckpointData, 'recipeName'>, recipeName: string): void;
}
export { ImportCheckpoint };
