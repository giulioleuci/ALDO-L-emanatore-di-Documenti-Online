import type { ExpressionLogger } from './types.js';
/**
 * @file GasExpressionEngineLib/src/ExpressionParserService.js
 * @description Service for parsing dynamic logical expressions using JSEP.
 *              Transforms expression strings into Abstract Syntax Trees (AST)
 *              for data-driven evaluation of complex conditions.
 * @version 2.1.0 - Refactored with Facade/Delegation pattern
 */
import jsep from 'jsep';
/**
 * Syntactic analyzer for logical expressions, transforming string templates into structured Abstract Syntax Trees (AST) using JSEP.
 * @class
 */
export declare class ExpressionParserService {
    logger: Pick<ExpressionLogger, 'debug' | 'error'>;
    MAX_INPUT_LENGTH: number;
    /**
     * Dependency injection configuration (for DI containers)
     * @returns {Object} DI configuration
     */
    static get di(): {
        name: string;
        dependencies: string[];
        isSingleton: boolean;
        factory: (logger: ExpressionLogger) => ExpressionParserService;
    };
    /**
     * Initializes the parser with diagnostic logging and internal tokenization components.
     * @param {Object} logger Diagnostic output interface.
     * @throws {Error} If mandatory logger dependency is missing or malformed.
     */
    constructor(logger: Pick<ExpressionLogger, 'debug' | 'error'>);
    /**
     * Transforms an expression string into a structured JSEP AST, including placeholder preprocessing and security limit enforcement.
     * @param {string} expressionString raw logic template.
     * @returns {Object} Structured AST representation.
     * @throws {Error} If expression is empty, exceeds 10,000 characters, or contains syntax errors.
     */
    parse(expressionString: string): jsep.Expression;
    /**
     * Orchestrates the normalization of expression syntax, converting {{placeholders}}, numeric paths, and special operators into JSEP-compatible tokens.
     * @param {string} expressionString raw logic template.
     * @returns {string} preprocessed expression string.
     * @private
     */
    _preprocess(expressionString: string): string;
    /**
     * Transforms dot-notation numeric segments into bracketed array accessors (e.g., 'items.0' -> 'items[0]').
     * @private
     * @param {string} expression Logic template fragment.
     * @returns {string} Normalized fragment.
     */
    _convertNumericPathSegments(expression: string): string;
    /**
     * Strips Mustache-style {{ }} delimiters from identifiers, iteratively resolving nested occurrences.
     * @private
     * @param {string} expression Logic template fragment.
     * @returns {string} Delimiter-free identifiers.
     */
    _convertPlaceholders(expression: string): string;
    /**
     * Rewrites 'between' keyword syntax into functional call notation (e.g., 'x between y, z' -> 'between(x, y, z)').
     * @private
     * @param {string} expression Logic template fragment.
     * @returns {string} Normalized functional logic.
     */
    _convertBetweenOperator(expression: string): string;
    /**
     * Extends JSEP grammar with domain-specific binary operators (in, match).
     * @private
     */
    _configureJSEP(): void;
    /**
     * Generates a structured Abstract Syntax Tree from a normalized expression string using JSEP.
     * @param {string} preprocessedExpression Normalized logic template.
     * @returns {Object} Structured JSEP AST.
     * @throws {Error} If the expression violates JSEP grammar rules.
     * @private
     */
    _buildAst(preprocessedExpression: string): jsep.Expression;
}
