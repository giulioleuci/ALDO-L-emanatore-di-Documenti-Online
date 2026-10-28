import type jsep from 'jsep';
import type { ExpressionLogger, ExpressionParser, ExpressionPlaceholders } from './types.js';
/**
 * Core engine for computing logical outcomes from expression ASTs, providing extensive built-in functions and strict relational comparisons.
 * @class
 */
export declare class ExpressionEvaluatorService {
    logger: ExpressionLogger;
    parser: ExpressionParser;
    placeholderService: ExpressionPlaceholders;
    /**
     * Dependency injection configuration (for DI containers)
     * @returns {Object} DI configuration
     */
    static get di(): {
        name: string;
        dependencies: string[];
        isSingleton: boolean;
        factory: (logger: ExpressionLogger, expressionParserService: ExpressionParser, placeholderService: ExpressionPlaceholders) => ExpressionEvaluatorService;
    };
    /**
     * Initializes the evaluator with required parsing and placeholder resolution services.
     * @param {Object} logger Diagnostic output interface.
     * @param {ExpressionParserService} parserService Logic parser for AST generation.
     * @param {Object} placeholderService Template engine for {{placeholder}} resolution.
     * @throws {Error} If mandatory dependencies are missing or malformed.
     */
    constructor(logger: ExpressionLogger, parserService: ExpressionParser, placeholderService: ExpressionPlaceholders);
    /** @description Evaluates an expression string against a context. */
    evaluate(expressionString: string, context?: object | null): boolean;
    /** @description Evaluates a pre-parsed AST against a context. */
    evaluateAst(ast: jsep.Expression, context?: object | null): boolean;
    /** @private */
    _evaluateNode(node: jsep.Expression | null, context: object | null): unknown;
    /** @private */
    _evaluateIdentifier(node: jsep.Identifier, context: object | null): unknown;
    /** @private */
    _evaluateMemberExpression(node: jsep.MemberExpression, context: object | null): unknown;
    /** @private */
    _buildPathFromMemberExpression(node: jsep.Expression): string;
    /** @private */
    _evaluateLiteral(node: Pick<jsep.Literal, 'value'> & Partial<Pick<jsep.Literal, 'type' | 'raw'>>, _context: object | null): jsep.Literal['value'];
    /** @private */
    _evaluateArrayExpression(node: jsep.ArrayExpression, context: object | null): unknown[];
    /** @private */
    _evaluateCallExpression(node: jsep.CallExpression, context: object | null): unknown;
    /**
     * Checks if both values are null or undefined.
     * @param {*} a - First value
     * @param {*} b - Second value
     * @returns {boolean} True if both values are null or undefined
     * @private
     */
    _areBothNullOrUndefined(a: unknown, b: unknown): boolean;
    /** @private */
    _hasCircularReference(obj: unknown, seen?: Set<object>): boolean;
    /** @private */
    _parseValue(value: unknown): unknown;
    /**
     * Built-in expression functions (string, numeric, array), assembled from
     * per-family modules under ./internal/builtins/ (GEL-HIGH-001).
     * @returns {Object<string, Function>} Map of function name to implementation.
     * @private
     */
    get _builtInFunctions(): {
        length: (arr: unknown) => number;
        contains: (arr: unknown, value: unknown) => boolean;
        indexOf: (arr: unknown, value: unknown) => number;
        first: (arr: unknown) => any;
        last: (arr: unknown) => any;
        abs: (num: unknown) => number;
        round: (num: unknown, decimals?: number) => number;
        ceil: (num: unknown) => number;
        floor: (num: unknown) => number;
        min: (...numbers: unknown[]) => number | null;
        max: (...numbers: unknown[]) => number | null;
        sqrt: (num: unknown) => number;
        pow: (base: unknown, exponent: unknown) => number;
        between: (value: unknown, min: unknown, max: unknown) => boolean;
        len: (str: unknown) => number;
        upper: (str: unknown) => string;
        lower: (str: unknown) => string;
        trim: (str: unknown) => string;
        substring: (str: unknown, start: number | undefined, end?: number) => string;
        replace: (str: unknown, search: unknown, replacement: unknown) => string;
        split: (str: unknown, delimiter: unknown) => string[];
    };
    /** @private */
    _evaluateBinaryExpression(node: jsep.BinaryExpression, context: object | null): unknown;
    /** @private */
    _evaluateUnaryExpression(node: jsep.UnaryExpression, context: object | null): boolean;
    /**
     * Compares two values with STRICT type checking.
     *
     * Returns: -1 if a < b, 0 if a == b, 1 if a > b
     *
     * STRICT MODE BEHAVIOR (enforced for reliability):
     * - Requires both operands to be of the same type
     * - Throws an error if types don't match (except null/undefined)
     * - No implicit type coercion or string conversion
     *
     * The comparison logic handles:
     * - null/undefined values
     * - Numeric comparisons (numbers only)
     * - String comparisons (strings only, case-sensitive)
     * - Boolean comparisons (booleans only)
     * - Date comparisons (dates only)
     *
     * @param {*} a - First value
     * @param {*} b - Second value
     * @returns {number} Comparison result
     * @throws {Error} If operand types don't match
     * @private
     */
    _compare(a: unknown, b: unknown): number;
    /** @private */
    _equals(a: unknown, b: unknown): boolean;
}
