import type { VisibilityContext, VisibilityEngine } from '../types.js';
/**
 * @file ComposableContentLib/src/composition/VisibilityEvaluator.js
 * @description Evaluates visibility conditions for content blocks.
 * @version 1.0.0
 */
/**
 * @description Engine for resolving block visibility conditions against a data context.
 * Supports static rules ('always', 'never'), simple path truthiness, and complex expression evaluation.
 * @class
 * @example
 * const evaluator = new VisibilityEvaluator(expressionEngine);
 * const visible = evaluator.isVisible('{{user.isPremium}} == true', context);
 */
export declare class VisibilityEvaluator {
    _expressionEngine: VisibilityEngine | null;
    /**
     * @description Initializes the evaluator with an optional expression engine for complex logic.
     * @param {Object|null} [expressionEngine=null] External engine for parsing complex condition strings.
     */
    constructor(expressionEngine?: VisibilityEngine | null);
    /**
     * @description Determines block visibility based on a condition string and the current context.
     * Resolves static values first, then delegates to the expression engine or falls back to simple path evaluation.
     * @param {string} visibility Raw condition expression or keyword.
     * @param {BlockDataContext} context Data payload for evaluation.
     * @returns {boolean} True if the block should be rendered.
     */
    isVisible(visibility: unknown, context: VisibilityContext): boolean;
    /**
     * @description Delegates condition evaluation to the injected expression engine.
     * @param {string} expression Complex logic string.
     * @param {BlockDataContext} context Target data context.
     * @returns {boolean} Evaluated result, defaulting to false on error.
     * @private
     */
    _evaluateExpression(expression: string, context: VisibilityContext): boolean;
    /**
     * @description Evaluates simple property paths or negations (e.g., 'user.name', '!user.isGuest') using strict truthiness.
     * @param {string} condition Simple path condition.
     * @param {BlockDataContext} context Target data context.
     * @returns {boolean} Evaluated result.
     * @private
     */
    _evaluateSimpleCondition(condition: string, context: VisibilityContext): boolean;
    /**
     * @description Recursively resolves a dot-notation path against an object structure.
     * @param {Object} obj Source object.
     * @param {string} path Dot-separated property path.
     * @returns {*} Resolved value or undefined.
     * @private
     */
    _getByPath(obj: unknown, path: string): unknown;
    /**
     * @description Applies strict business-logic truthiness to a value.
     * Evaluates empty strings, arrays, and objects as falsy.
     * @param {*} value Value to evaluate.
     * @returns {boolean} Truthy state.
     * @private
     */
    _isTruthy(value: unknown): boolean;
    /**
     * @description Verifies if an external expression engine is bound to this evaluator.
     * @returns {boolean} True if available.
     */
    hasExpressionEngine(): boolean;
    /**
     * @description Returns a diagnostic summary including the active evaluation mode.
     * @returns {string} Debug string representation.
     */
    toString(): string;
}
