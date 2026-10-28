import type { SourceFactoryAdapter, ImportTransformer } from './types.js';
import type { ImporterLogger, ImportDatabase, ImporterExpression, SourceConstructor, ImportMonitor, RetryExecutor } from './types.js';
import type { ImportPipelineExecutor as PipelineMethods } from './pipeline/ImportPipelineExecutor.js';
import { Loader } from './internal/load/Loader.js';
import { ImportPipelineExecutor } from './pipeline/ImportPipelineExecutor.js';
/**
 * Primary facade for the ETL pipeline, orchestrating extraction, transformation, and database persistence with built-in resilience and dry-run support.
 * @class
 */
interface ImportEngine extends Pick<PipelineMethods, 'runImport' | '_executePipeline' | '_executeExtract' | '_executeTransform' | '_executeLoad' | '_generateDryRunLoadResult' | 'startImport' | 'runImportChunk'> {
}
declare class ImportEngine {
    logger: ImporterLogger;
    _exceptionService: RetryExecutor | null;
    _monitor: ImportMonitor | null;
    _sourceFactory: SourceFactoryAdapter;
    _transformer: ImportTransformer;
    _loader: Loader;
    _pipelineExecutor: ImportPipelineExecutor;
    /**
     * Initializes the ETL engine with required service dependencies and optional feature extensions.
     * @param {Object} logger Diagnostic output interface (LoggerService).
     * @param {Object} driveService GoogleApiWrapper facade for file operations.
     * @param {Object} spreadsheetService GoogleApiWrapper facade for sheet data.
     * @param {Object} databaseService SheetDBLib persistence interface.
     * @param {Object|null} [expressionEngine=null] Optional engine for calculated fields.
     * @param {Object|null} [exceptionService=null] Optional resilience engine for automatic retries.
     * @param {Object|null} [monitor=null] Optional service for real-time process visualization.
     */
    constructor(logger: ImporterLogger, driveService: object, spreadsheetService: object, databaseService: ImportDatabase, expressionEngine?: ImporterExpression | null, exceptionService?: RetryExecutor | null, monitor?: ImportMonitor | null);
    /**
     * Registers a custom source-extraction strategy and whitelists its type for recipe validation.
     * @param {string} name Source type identifier.
     * @param {Function} strategyClass Strategy class implementing the source-extraction contract.
     */
    registerCustomSource(name: string, strategyClass: SourceConstructor): void;
    /**
     * @returns {Array<string>} Registered source-strategy type identifiers.
     */
    getAvailableSourceTypes(): string[];
    /**
     * @returns {Object} Summary of the engine's configured capabilities.
     */
    getConfigSummary(): {
        sourceStrategies: string[];
        hasExpressionEngine: boolean;
        hasExceptionService: boolean;
        hasMonitor: boolean;
    };
    /**
     * Validates an import recipe without executing it.
     * @param {Object} recipe Import configuration (see ImportConfiguration).
     * @returns {{valid: boolean, summary: Object, message: string}|{valid: boolean, error: string, code: string}}
     */
    validateRecipe(recipe: unknown): {
        valid: boolean;
        summary: {
            name: string;
            sourceType: string;
            targetTable: string;
            conflictResolution: "INSERT_ONLY" | "UPDATE_ONLY" | "UPSERT" | "OVERWRITE";
            hasMapping: boolean;
            hasCalculated: boolean;
            hasNormalization: boolean;
        };
        message: string;
        error?: undefined;
        code?: undefined;
    } | {
        valid: boolean;
        error: string;
        code: string;
        summary?: undefined;
        message?: undefined;
    };
}
export { ImportEngine };
