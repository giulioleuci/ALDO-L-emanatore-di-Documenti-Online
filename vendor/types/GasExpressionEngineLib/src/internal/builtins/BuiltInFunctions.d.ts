import type { ExpressionEvaluatorService } from '../../ExpressionEvaluatorService.js';
/**
 * Builds the complete map of built-in expression functions (string, numeric,
 * array) exposed to expression call-expressions (e.g. `len(x)`, `between(...)`).
 *
 * @param {ExpressionEvaluatorService} evaluator - The evaluator instance, forwarded
 *   to families (e.g. array functions) that need access to sibling methods like `_equals`.
 * @returns {Object<string, Function>} Map of function name to implementation.
 */
export declare function createBuiltInFunctions(evaluator: Pick<ExpressionEvaluatorService, '_equals'>): {
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
