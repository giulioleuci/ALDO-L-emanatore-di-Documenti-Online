import type { ErrorClassification, ErrorPattern } from '../types.js';
/**
 * Diagnostic engine for categorizing errors using regex-based pattern matching against messages and stack traces, driving intelligent recovery decisions.
 * @class
 * @private
 */
export declare class ErrorClassifier {
    _classifiers: Record<string, ErrorPattern>;
    _classificationCache: Map<string, Omit<ErrorClassification, 'originalMessage'>>;
    _cacheMaxSize: number;
    /**
     * Initializes the classifier with matching rules from configuration.
     * @param {Object} config central settings (ResilienceConfiguration) providing getErrorPatterns().
     * @throws {Error} If config is missing or does not implement getErrorPatterns().
     */
    constructor(config: {
        getErrorPatterns(): Record<string, ErrorPattern>;
    });
    /**
     * Evaluates an error instance against the pattern registry to determine its category and recoverability.
     * @param {Error|Object} error target failure object.
     * @returns {Object} error classification state (type, category, recoverable, originalMessage).
     * @throws {Error} If error is not a valid object.
     */
    classify(error: {
        message?: unknown;
        stack?: unknown;
    }): ErrorClassification;
    /**
     * Purges all cached classification results to force re-evaluation of subsequent errors.
     */
    clearCache(): void;
}
