import type { BlockResult } from './BlockResult.js';
import type { CompositionResultInput } from '../types.js';
/**
 * Immutable DTO for final content composition output, aggregating block results, rendered content, and orchestration metrics.
 * @class
 */
export declare class CompositionResult {
    recipeId: string;
    outputFormat: string;
    content: string;
    blocks: readonly BlockResult[];
    visibleBlocks: number;
    totalBlocks: number;
    isEmpty: boolean;
    processingTime: number;
    errors: readonly unknown[];
    metadata: Readonly<Record<string, unknown>>;
    /**
     * Initializes and freezes a composition result instance.
     * @param {Object} result Initialization payload.
     * @param {string} result.recipeId Source recipe identifier.
     * @param {string} result.outputFormat Target output format (e.g., 'html', 'markdown', 'plain_text').
     * @param {string} result.content Fully concatenated rendering output.
     * @param {BlockResult[]} [result.blocks=[]] Collection of executed block results.
     * @param {Error[]} [result.errors=[]] Top-level orchestration errors.
     * @param {number} [result.processingTime=0] Total orchestration duration in ms.
     * @param {Object} [result.metadata={}] Global orchestration metadata.
     * @throws {Error} If recipeId, outputFormat, or content is null/undefined.
     * @throws {Error} If result is not a valid object.
     */
    constructor(result: CompositionResultInput);
    /**
     * Verifies if composition completed without top-level or block-level errors.
     * @returns {boolean} True if errors array is empty and all blocks are success states.
     */
    isSuccess(): boolean;
    /**
     * Filters results for blocks evaluated as visible.
     * @returns {BlockResult[]} Visible block results.
     */
    getVisibleBlocks(): BlockResult[];
    /**
     * Filters results for blocks evaluated as hidden.
     * @returns {BlockResult[]} Hidden block results.
     */
    getHiddenBlocks(): BlockResult[];
    /**
     * Filters results for blocks that encountered rendering or evaluation errors.
     * @returns {BlockResult[]} Erroneous block results.
     */
    getErrorBlocks(): BlockResult[];
    /**
     * Checks for presence of top-level composition errors or block-level errors.
     * @returns {boolean} True if errors exist.
     */
    hasErrors(): boolean;
    /**
     * Resolves a block result by instance ID.
     * @param {string} instanceId Target instance identifier.
     * @returns {BlockResult|null} Matched block result or null.
     */
    getBlockById(instanceId: string): BlockResult | null;
    /**
     * Filters results by block type ID.
     * @param {string} blockType Target block type ID.
     * @returns {BlockResult[]} Matching block results.
     */
    getBlocksByType(blockType: string): BlockResult[];
    /**
     * Returns character count of final concatenated content.
     * @returns {number} Character length.
     */
    getContentLength(): number;
    /**
     * Computes mean execution time across all evaluated blocks.
     * @returns {number} Average duration in ms.
     */
    getAverageBlockTime(): number;
    /**
     * Serializes instance into a deep-cloned JSON-safe object.
     * @returns {Object} Serialized composition state.
     */
    toJSON(): {
        recipeId: string;
        outputFormat: string;
        content: string;
        blocks: {
            instanceId: string;
            blockType: string;
            isEmpty: boolean;
            isVisible: boolean;
            content: string;
            metadata: {
                [x: string]: unknown;
            };
            processingTime: number;
            error: string | null;
        }[];
        visibleBlocks: number;
        totalBlocks: number;
        isEmpty: boolean;
        processingTime: number;
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * Factory method for standardized empty composition results.
     * @param {string} recipeId Target recipe ID.
     * @param {string} outputFormat Target output format.
     * @param {string} [reason='empty'] Contextual reason for empty state.
     * @returns {CompositionResult} Frozen instance with empty content/blocks.
     * @static
     */
    static empty(recipeId: string, outputFormat: string, reason?: string): CompositionResult;
    /**
     * Returns diagnostic status string including recipe ID, block counts, and performance metrics.
     * @returns {string} Diagnostic summary.
     */
    toString(): string;
}
