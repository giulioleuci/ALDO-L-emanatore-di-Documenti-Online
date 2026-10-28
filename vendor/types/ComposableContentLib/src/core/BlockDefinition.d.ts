import type { DefinitionInput } from '../types.js';
/**
 * @description Immutable blueprint for a reusable content block type.
 * Specifies rendering capabilities, structural containment, and fallback behaviors.
 * @class
 * @example
 * const headerBlock = new BlockDefinition({
 *   id: 'email_header',
 *   name: 'Email Header',
 *   supportedFormats: ['html', 'text'],
 *   emptyBehavior: EmptyBehavior.HIDE
 * });
 */
export declare class BlockDefinition {
    id: string;
    name: string;
    description: string;
    supportedFormats: readonly string[];
    emptyBehavior: string;
    containerType: string;
    /**
     * @description Validates and freezes a new block type definition.
     * @param {Object} definition Block configuration payload.
     * @param {string} definition.id Unique identifier (e.g., 'hero_banner').
     * @param {string} definition.name Display name for UI/logging.
     * @param {string} [definition.description=''] Purpose and usage details.
     * @param {string[]} [definition.supportedFormats=['html','markdown','text']] Compatible output modes.
     * @param {string} [definition.emptyBehavior=EmptyBehavior.HIDE] Action when resolved content is empty.
     * @param {string} [definition.containerType=ContainerType.NONE] HTML wrapper type (e.g., 'div', 'section').
     * @throws {Error} If ID, name, format, emptyBehavior, or containerType are invalid.
     */
    constructor(definition: DefinitionInput);
    /**
     * @description Validates if the block type can render to the requested output format.
     * @param {string} format Target format (e.g., 'html').
     * @returns {boolean} True if supported.
     */
    supportsFormat(format: string): boolean;
    /**
     * @description Evaluates if the block should be omitted from output when its resolved content is empty.
     * @returns {boolean} True if behavior is EmptyBehavior.HIDE.
     */
    hidesWhenEmpty(): boolean;
    /**
     * @description Serializes the definition into a plain, deep-cloned state object.
     * @returns {Object} JSON-safe representation.
     */
    toJSON(): {
        id: string;
        name: string;
        description: string;
        supportedFormats: string[];
        emptyBehavior: string;
        containerType: string;
    };
    /**
     * @description Rehydrates a BlockDefinition instance from a serialized state object.
     * @param {Object} obj Valid definition payload.
     * @returns {BlockDefinition} Restored definition model.
     * @static
     */
    static fromJSON(obj: DefinitionInput): BlockDefinition;
    /**
     * @description Returns a diagnostic summary string for logging and debugging.
     * @returns {string} String identifier.
     */
    toString(): string;
}
