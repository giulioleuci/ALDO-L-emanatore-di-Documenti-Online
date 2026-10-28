export interface RegisteredTest {
    path: string;
    fn: () => unknown;
    skip: boolean;
}
export interface TestResults {
    passed: number;
    failed: number;
    skipped: number;
    errors: Array<{
        path: string;
        message: string;
        stack: string | undefined;
    }>;
}
/**
 * Registry-based test orchestrator for Google Apps Script, supporting namespaced test discovery and structured diagnostic logging.
 * @class
 */
export declare class EnhancedTestRunner {
    registry: RegisteredTest[];
    results: TestResults;
    constructor(legacyName?: string);
    /**
     * Appends a test case to the internal registry with execution constraints.
     * @param {string} path Hierarchical identifier (e.g., 'Library/Suite/Test').
     * @param {Function} fn Implementation logic for the test case.
     * @param {Object} [options={}] execution configuration.
     * @param {boolean} [options.skip=false] If true, bypasses test execution.
     * @returns {this} Chainable runner instance.
     */
    register(path: string, fn: () => unknown, options?: {
        skip?: boolean;
    }): this;
    /**
     * Orchestrates the execution of registered tests filtered by path or regular expression.
     * @param {string|RegExp|null} [filter=null] Selection criteria for test subset.
     * @returns {Object} Execution statistics and failure records.
     */
    run(filter?: string | RegExp | null): TestResults;
    /**
     * Executes a single test unit and records the outcome.
     * @private
     * @param {Object} test Internal registry record.
     */
    _runTest(test: RegisteredTest): void;
    /**
     * Routes diagnostic messages to the environment-appropriate output (GAS Logger or System Console).
     * @private
     * @param {string} message Diagnostic content.
     */
    _log(message: string): void;
    /**
     * Synthesizes and outputs the final execution report including total counts and failure details.
     * @private
     */
    _printSummary(): void;
}
export declare const runner: EnhancedTestRunner;
