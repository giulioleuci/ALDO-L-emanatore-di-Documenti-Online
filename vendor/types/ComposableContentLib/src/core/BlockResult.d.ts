import type { BlockResultInput } from '../types.js';
/**
 * @file ComposableContentLib/src/core/BlockResult.js
 * @description BlockResult representing the output of block evaluation.
 * @version 1.0.0
 */
import { Result } from '@CoreUtilsLib';
/**
 * @description Immutable data transfer object representing the outcome of a block rendering execution.
 * Extends the shared {@link Result} base for the success/error contract.
 * Encapsulates generated content, visibility state, errors, and profiling metrics.
 * @class
 * @example
 * const result = new BlockResult({
 *   instanceId: 'header-001',
 *   blockType: 'email_header',
 *   content: '<div class="header">...</div>',
 *   isVisible: true
 * });
 */
export declare class BlockResult extends Result {
    instanceId: string;
    blockType: string;
    isEmpty: boolean;
    isVisible: boolean;
    content: string;
    metadata: Readonly<Record<string, unknown>>;
    processingTime: number;
    /**
     * @description Freezes a new block execution result.
     * @param {Object} result Result payload.
     * @param {string} result.instanceId Target block instance ID.
     * @param {string} result.blockType Resolved block type ID.
     * @param {boolean} [result.isEmpty=false] True if the source data yielded no content.
     * @param {boolean} [result.isVisible=true] True if visibility conditions evaluated to true.
     * @param {string} [result.content=''] Final formatted string output.
     * @param {Object} [result.metadata={}] Block-specific runtime context (e.g., titles, icons).
     * @param {number} [result.processingTime=0] Execution duration in milliseconds.
     * @param {Error|null} [result.error=null] Caught runtime exception.
     * @throws {Error} If instanceId or blockType are missing.
     */
    constructor(result: BlockResultInput);
    /**
     * @description Assesses if the result contains renderable output.
     * @returns {boolean} True if the block is visible, not empty, and has a non-zero length content string.
     */
    hasDisplayableContent(): boolean;
    /**
     * @description Resolves a specific key from the result's metadata payload.
     * @param {string} key Target metadata key.
     * @param {*} [defaultValue=null] Fallback if key is missing.
     * @returns {*} Metadata value or default.
     */
    getMetadata(key: string, defaultValue?: unknown): unknown;
    /**
     * @description Serializes the result into a plain, deep-cloned object. Errors are mapped to their message strings.
     * @returns {Object} JSON-safe representation.
     */
    toJSON(): {
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
    };
    /**
     * @description Factory method generating a standardized hidden state result.
     * @param {string} instanceId Block instance ID.
     * @param {string} blockType Block type ID.
     * @param {string} [reason='hidden'] Description of why the block is suppressed.
     * @returns {BlockResult} Frozen instance marked invisible and empty.
     * @static
     */
    static hidden(instanceId: string, blockType: string, reason?: string): BlockResult;
    /**
     * @description Factory method generating a standardized error state result.
     * @param {string} instanceId Target instance ID.
     * @param {string} blockType Target block type ID.
     * @param {Error} error Caught exception.
     * @returns {BlockResult} Frozen instance encapsulating the failure state.
     * @static
     */
    static error(instanceId: string, blockType: string, error: Error): BlockResult;
    /**
     * @description Provides a brief diagnostic status string.
     * @returns {string} Summary string (e.g., "BlockResult[id] VISIBLE (5ms)").
     */
    toString(): string;
}
