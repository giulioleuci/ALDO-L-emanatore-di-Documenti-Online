import type { SourceStrategy } from './SourceStrategy.js';
import type { ImporterLogger, SourceConstructor } from '../../types.js';
/**
 * Factory and registry for data extraction strategies, managing built-in Google services and runtime registration of custom source adapters.
 * @class
 */
declare class SourceStrategyFactory {
    logger: ImporterLogger;
    _driveService: object;
    _spreadsheetService: object;
    _strategies: Map<string, SourceConstructor>;
    /**
     * Initializes factory with service facades required for built-in strategies.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} driveService GoogleApiWrapper DriveService for folder traversal.
     * @param {Object} spreadsheetService GoogleApiWrapper SpreadsheetService for data access.
     */
    constructor(logger: ImporterLogger, driveService: object, spreadsheetService: object);
    /**
     * Populates the internal registry with SheetById and Folder extraction adapters.
     * @private
     */
    _registerBuiltInStrategies(): void;
    /**
     * Extends the factory with a custom extraction adapter at runtime.
     * @param {string} name Unique strategy identifier (used in recipe source.type).
     * @param {Function} strategyClass Constructor for the strategy class (must extend SourceStrategy).
     * @throws {SourceError} If name is invalid or class is not a constructor.
     */
    registerStrategy(name: string, strategyClass: SourceConstructor): void;
    /**
     * Instantiates the requested extraction strategy, automatically injecting required service facades.
     * @param {string} type Strategy identifier.
     * @param {Object} [dependencies={}] Optional dependencies for custom strategies.
     * @returns {Object} Initialized strategy instance.
     * @throws {SourceError} If type is unregistered or instantiation fails.
     */
    createStrategy(type: string, dependencies?: object): SourceStrategy;
    /**
     * Verifies if a specific strategy identifier is present in the factory registry.
     * @param {string} type Strategy identifier to verify.
     * @returns {boolean} True if the strategy is registered.
     */
    hasStrategy(type: string): boolean;
    /**
     * Retrieves a list of all registered extraction strategy identifiers.
     * @returns {Array<string>} Collection of available strategy names.
     */
    getAvailableStrategies(): string[];
}
export { SourceStrategyFactory };
