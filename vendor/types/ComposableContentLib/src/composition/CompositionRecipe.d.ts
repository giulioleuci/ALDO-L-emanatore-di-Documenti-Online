import type { NormalizedBlockInstance, RecipeInput } from '../types.js';
/**
 * BlockInstance - Configuration for a block instance within a recipe.
 *
 * @typedef {Object} BlockInstance
 * @property {string} instanceId - Unique instance identifier
 * @property {string} blockType - Block type ID from registry
 * @property {string} [visibility='always'] - Visibility expression
 * @property {number} [order=0] - Display order
 * @property {Object} [config={}] - Block-specific configuration
 */
/**
 * @description Immutable model for multi-block content composition.
 * Defines block selection, execution order, visibility logic, and serialization metadata.
 * @class
 * @example
 * const recipe = new CompositionRecipe({
 *   id: 'welcome_email',
 *   name: 'Welcome Email',
 *   outputFormat: 'html',
 *   blocks: [
 *     { instanceId: 'header', blockType: 'email_header', order: 1 },
 *     { instanceId: 'greeting', blockType: 'greeting_block', order: 2 }
 *   ]
 * });
 */
export declare class CompositionRecipe {
    id: string;
    name: string;
    description: string;
    outputFormat: string;
    blocks: readonly NormalizedBlockInstance[];
    separator: string;
    metadata: Readonly<Record<string, unknown>>;
    /**
     * @description Validates and initializes a new recipe with deep-frozen block configurations.
     * @param {Object} definition Recipe manifest.
     * @param {string} definition.id Unique recipe identifier.
     * @param {string} definition.name Human-readable label.
     * @param {string} [definition.description=''] Functional description.
     * @param {'html'|'markdown'|'text'} [definition.outputFormat='html'] Target rendering format.
     * @param {BlockInstance[]} definition.blocks Collection of block instances.
     * @param {string} [definition.separator=''] String inserted between rendered blocks.
     * @param {Object} [definition.metadata={}] Arbitrary key-value store for orchestration.
     * @throws {RecipeValidationError} If ID/Name is missing, format is invalid, or block IDs collide.
     */
    constructor(definition: RecipeInput);
    /**
     * @description Returns a collection of blocks sorted by their numeric execution order.
     * @returns {BlockInstance[]} Array of blocks in rendering sequence.
     */
    getOrderedBlocks(): Required<import("../types.js").BlockInstance>[];
    /**
     * @description Resolves a specific block configuration by its instance ID.
     * @param {string} instanceId Unique instance identifier.
     * @returns {BlockInstance|null} The resolved block or null if not found.
     */
    getBlock(instanceId: string): Required<import("../types.js").BlockInstance> | null;
    /**
     * @description Returns all instances of a specific block type registered in the recipe.
     * @param {string} blockType Registered block type identifier.
     * @returns {BlockInstance[]} Matching block configurations.
     */
    getBlocksByType(blockType: string): Required<import("../types.js").BlockInstance>[];
    /**
     * @description Extracts all unique block types utilized in this recipe.
     * @returns {string[]} Collection of unique block type IDs.
     */
    getUsedBlockTypes(): string[];
    /**
     * @description Returns the total number of blocks defined in the recipe.
     * @returns {number} Total block count.
     */
    getBlockCount(): number;
    /**
     * @description Checks if any instance of the specified block type exists in the recipe.
     * @param {string} blockType Registered block type identifier.
     * @returns {boolean} True if the type is utilized.
     */
    usesBlockType(blockType: string): boolean;
    /**
     * @description Serializes the recipe into a plain data object for storage or transmission.
     * @returns {Object} Deep-cloned plain object representation.
     */
    toJSON(): {
        id: string;
        name: string;
        description: string;
        outputFormat: string;
        blocks: {
            config: {
                [x: string]: unknown;
            };
            instanceId: string;
            blockType: string;
            visibility: string;
            order: number;
        }[];
        separator: string;
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * @description Hydrates a new CompositionRecipe from a plain data object.
     * @param {Object} obj Recipe definition data.
     * @returns {CompositionRecipe} Reconstituted immutable recipe instance.
     * @static
     */
    static fromJSON(obj: RecipeInput): CompositionRecipe;
    /**
     * @description Returns a technical summary string for diagnostics and logging.
     * @returns {string} Debug string representation.
     */
    toString(): string;
}
