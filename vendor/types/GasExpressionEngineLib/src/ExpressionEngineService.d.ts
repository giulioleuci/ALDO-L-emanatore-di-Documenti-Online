import type jsep from 'jsep';
import type { ExpressionLogger, ExpressionOptions } from './types.js';
/**
 * @file GasExpressionEngineLib/src/ExpressionEngineService.js
 * @description High-level facade for the Expression Engine library.
 *              Provides a simple, unified API for parsing and evaluating
 *              dynamic logical expressions with placeholder resolution.
 * @version 1.0.0
 */
import { ExpressionParserService } from './ExpressionParserService.js';
import { ExpressionEvaluatorService } from './ExpressionEvaluatorService.js';
import { Mustache, PlaceholderService } from '@WorkspaceTemplateEngine';
/**
 * Unified facade for dynamic business logic evaluation, orchestrating parsing, placeholder resolution, and AST computation.
 * @class
 */
export declare class ExpressionEngineService {
    logger: ExpressionLogger;
    utils: unknown;
    cache: unknown;
    _astCache: Map<string, jsep.Expression>;
    _astCacheEnabled: boolean;
    parser: ExpressionParserService;
    mustache: Mustache;
    placeholderService: PlaceholderService;
    evaluator: ExpressionEvaluatorService;
    /**
     * Dependency injection configuration (for DI containers)
     * @returns {Object} DI configuration
     */
    static get di(): {
        name: string;
        dependencies: string[];
        isSingleton: boolean;
        factory: (logger: ExpressionLogger, utils: unknown, cache: unknown) => ExpressionEngineService;
    };
    /**
     * Initializes the expression engine with diagnostic and performance dependencies.
     * @param {Object} options Configuration metadata.
     * @param {Object} options.logger Diagnostic output interface.
     * @param {Object} [options.utils] Optional utility service for data processing.
     * @param {Object} [options.cache] Optional persistence for AST optimization.
     * @throws {Error} If mandatory logger dependency is missing.
     */
    constructor(options?: ExpressionOptions);
    /**
     * Configures internal dependency chain including parser, template engine, and evaluator.
     * @private
     */
    _initializeServices(): void;
    /**
     * Executes a string-based logical expression against a data context, returning a boolean outcome.
     * @param {string} expressionString Logic template with optional {{placeholders}}.
     * @param {Object} [context={}] Data context for attribute resolution.
     * @returns {boolean} Outcome of the logical evaluation.
     * @throws {Error} If expression syntax is invalid or evaluation fails.
     */
    evaluate(expressionString: string, context?: object | null): boolean;
    /**
     * Transforms an expression string into a structured Abstract Syntax Tree (AST) for deferred evaluation.
     * @param {string} expressionString Logic template.
     * @returns {Object} Structured AST representation.
     * @throws {Error} On syntax or tokenization failures.
     */
    parse(expressionString: string): jsep.Expression;
    /**
     * Clears the AST cache.
     */
    clearCache(): void;
}
