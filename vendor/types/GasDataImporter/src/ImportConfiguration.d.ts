import type { SourceConfiguration } from './types.js';
import type { ImporterLogger, ImportRecipe, LoadConfig, TransformConfig } from './types.js';
/**
 * Validator and value object for ETL import recipes, ensuring structural integrity and providing normalized access to source, transform, and load configurations.
 * @class
 */
declare class ImportConfiguration {
    _logger: ImporterLogger;
    _recipe: ImportRecipe;
    /**
     * Valid source strategy types
     *
     * @static
     * @type {string[]}
     */
    static VALID_SOURCE_TYPES: string[];
    /**
     * Registers an additional source type as valid for recipe validation. Consumers
     * that add a custom `SourceStrategy` via `ImportEngine.registerCustomSource()`
     * must also call this (or use `registerCustomSource`, which does it for them)
     * so recipes using the new type pass `_validateSource` instead of being
     * rejected as unknown before the custom strategy is ever reached. No-op if the
     * type is already valid.
     *
     * @static
     * @param {string} type Source strategy type name (matches the key passed to
     *   `SourceStrategyFactory.registerStrategy`).
     */
    static registerSourceType(type: string): void;
    /**
     * Valid conflict resolution strategies
     *
     * @static
     * @type {string[]}
     */
    static VALID_CONFLICT_STRATEGIES: string[];
    /**
     * Initializes and validates an import recipe against internal schema rules.
     * @param {Object} recipe ETL configuration JSON.
     * @param {string} recipe.name Identifiable name for the import process.
     * @param {Object} recipe.source Extraction source details.
     * @param {Object} [recipe.transform] Optional data transformation rules.
     * @param {Object} recipe.load persistence and conflict resolution strategy.
     * @param {Object} [logger=console] Diagnostic output interface.
     * @throws {ConfigurationError} If recipe structure is invalid or required fields are missing.
     */
    constructor(recipe: unknown, logger?: ImporterLogger);
    /**
     * Orchestrates full recipe validation across root, source, transform, and load segments.
     * @private
     * @param {Object} recipe target configuration to validate.
     * @throws {ConfigurationError} On first detected structural violation.
     */
    _validate(recipe: unknown): asserts recipe is ImportRecipe;
    /**
     * Enforces extraction source requirements based on strategy type (e.g., SheetById, Folder).
     * @private
     * @param {Object} source Source configuration segment.
     * @throws {ConfigurationError} If type is unknown or type-specific identifiers are missing.
     */
    _validateSource(source: unknown): void;
    /**
     * Validates optional transformation blocks including field mappings, calculations, and normalization rules.
     * @private
     * @param {Object} transform Transform configuration segment.
     * @throws {ConfigurationError} If sub-blocks are not objects or validation rules are malformed.
     */
    _validateTransform(transform: unknown): void;
    /**
     * Validates persistence parameters, conflict resolution strategies, and conditional update rules.
     * @private
     * @param {Object} load Load configuration segment.
     * @throws {ConfigurationError} If target table is missing or conflict resolution logic is incomplete.
     */
    _validateLoad(load: unknown): void;
    /**
     * Returns the identification name of the import process.
     * @returns {string} Import name.
     */
    getName(): string;
    /**
     * Retrieves the extraction source configuration.
     * @returns {Object} Source parameters.
     */
    getSource(): SourceConfiguration;
    /**
     * Retrieves data transformation rules or an empty object if none are defined.
     * @returns {Object} Transform parameters.
     */
    getTransform(): TransformConfig;
    /**
     * Retrieves persistence and conflict resolution configuration.
     * @returns {Object} Load parameters.
     */
    getLoad(): LoadConfig<import("./types.js").ImportRow>;
    /**
     * Returns the full original recipe configuration.
     * @returns {Object} Complete recipe object.
     */
    getRecipe(): ImportRecipe<import("./types.js").ImportRow>;
    /**
     * Generates a high-level overview of the configuration for diagnostic and logging purposes.
     * @returns {Object} Logic summary.
     */
    getSummary(): {
        name: string;
        sourceType: string;
        targetTable: string;
        conflictResolution: "INSERT_ONLY" | "UPDATE_ONLY" | "UPSERT" | "OVERWRITE";
        hasMapping: boolean;
        hasCalculated: boolean;
        hasNormalization: boolean;
    };
}
export { ImportConfiguration };
