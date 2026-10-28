import type jsep from 'jsep';
type ExpressionPolicy = typeof defaultPolicy;
/**
 * The exact node types and operators implemented by ExpressionEvaluatorService's
 * node-evaluation and operator methods. Call expressions are deliberately
 * limited to registered built-ins, whose callee must be a plain identifier.
 */
export declare const defaultPolicy: Readonly<{
    allowedNodeTypes: Set<string>;
    binaryOperators: Set<string>;
    unaryOperators: Set<string>;
    callNames: Set<string>;
}>;
/**
 * Ensures an AST can be evaluated by ExpressionEvaluatorService without
 * granting JavaScript object traversal or arbitrary function invocation.
 *
 * @param {Object} ast JSEP AST returned by ExpressionParserService.
 * @param {Object} [policy=defaultPolicy] Explicit AST allow-list.
 * @throws {Error} When a node, operator, member, or call is not allowed.
 */
export declare function assertAllowedExpressionAst(ast: jsep.Expression, policy?: ExpressionPolicy): void;
export {};
