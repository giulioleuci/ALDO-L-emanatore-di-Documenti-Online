import type { ContentBlock } from '../core/ContentBlock.js';
import type { ContentLogger, BlockFactory, BlockRegistration } from '../types.js';
import { BlockDefinition } from '../core/BlockDefinition.js';
/**
 * Centralized registry for block type definitions and factory mappings for ContentBlock instantiation.
 * @class
 */
export declare class BlockRegistry<Block = ContentBlock> {
    _logger: ContentLogger;
    _definitions: Map<string, BlockDefinition>;
    _factories: Map<string, BlockFactory<Block>>;
    /**
     * Initializes a new BlockRegistry instance.
     * @param {Object} [options={}] Registry configuration.
     * @param {Object} [options.logger=console] Logger implementation for diagnostic output.
     */
    constructor(options?: {
        logger?: ContentLogger;
    });
    /**
     * Registers a block type definition and its associated factory function.
     * @param {Object} registration Registration payload.
     * @param {Object|BlockDefinition} registration.definition Block configuration or definition instance.
     * @param {Function} registration.factory Factory function with signature (definition, config) => ContentBlock.
     * @returns {BlockDefinition} The registered definition instance.
     * @throws {Error} If registration payload, definition, or factory function is missing/invalid.
     */
    register(registration: BlockRegistration<Block>): BlockDefinition;
    /**
     * Removes a block type and its factory from the registry.
     * @param {string} blockType Target block type ID.
     * @returns {boolean} True if the block type existed and was successfully removed.
     */
    unregister(blockType: string): boolean;
    /**
     * Retrieves a block definition by ID.
     * @param {string} blockType Target block type ID.
     * @returns {BlockDefinition} The associated definition instance.
     * @throws {BlockNotFoundError} If the block type is not registered.
     */
    getDefinition(blockType: string): BlockDefinition;
    /**
     * Retrieves a block definition or null if unregistered.
     * @param {string} blockType Target block type ID.
     * @returns {BlockDefinition|null} The definition instance or null.
     */
    getDefinitionOrNull(blockType: string): BlockDefinition | null;
    /**
     * Instantiates a block using its registered factory.
     * @param {string} blockType Target block type ID.
     * @param {Object} [config={}] Instance-specific configuration.
     * @returns {ContentBlock} The instantiated content block.
     * @throws {BlockNotFoundError} If the block type factory is not registered.
     */
    createBlock(blockType: string, config?: Record<string, unknown>): Block;
    /**
     * Validates presence of a block type in the registry.
     * @param {string} blockType Target block type ID.
     * @returns {boolean} True if registered.
     */
    has(blockType: string): boolean;
    /**
     * Retrieves all registered block type identifiers.
     * @returns {string[]} Collection of block IDs.
     */
    getBlockTypes(): string[];
    /**
     * Retrieves all registered block definitions.
     * @returns {BlockDefinition[]} Collection of definition instances.
     */
    getAllDefinitions(): BlockDefinition[];
    /**
     * Returns current count of registered block types.
     * @returns {number} Registration count.
     */
    size(): number;
    /**
     * Purges all block definitions and factories from the registry.
     */
    clear(): void;
    /**
     * Filters definitions by output format compatibility.
     * @param {string} format Target output format.
     * @returns {BlockDefinition[]} Subset of definitions supporting the format.
     */
    getBlocksForFormat(format: string): BlockDefinition[];
    /**
     * Returns diagnostic summary string including current registration count.
     * @returns {string} Diagnostic summary.
     */
    toString(): string;
}
