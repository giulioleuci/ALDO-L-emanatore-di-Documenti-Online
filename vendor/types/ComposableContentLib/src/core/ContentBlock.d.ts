import type { BlockDefinition } from './BlockDefinition.js';
import type { RendererLike, SimpleBlockConfig } from '../types.js';
/**
 * @file ComposableContentLib/src/core/ContentBlock.js
 * @description ContentBlock base class for content blocks.
 * @version 1.0.0
 */
import { BlockResult } from './BlockResult.js';
/**
 * @description Abstract base class defining the execution contract for content blocks.
 * Subclasses implement data extraction and template resolution and may customize empty-state
 * evaluation.
 * @class
 * @abstract
 * @example
 * class HeaderBlock extends ContentBlock {
 *   getData(ctx) { return { title: ctx.get('title') }; }
 *   getTemplateId(format) { return `header_${format}`; }
 * }
 */
export declare class ContentBlock<Data = unknown, Context = unknown> {
    definition: BlockDefinition;
    config: Readonly<Record<string, unknown>>;
    /**
     * @description Initializes block with its definition blueprint and runtime configuration.
     * @param {BlockDefinition} definition Immutable type specification.
     * @param {Object} [config={}] Instance-specific configuration overrides.
     * @throws {Error} If definition is missing.
     */
    constructor(definition: BlockDefinition, config?: Record<string, unknown>);
    /**
     * @description Returns the unique identifier from the block definition.
     * @returns {string} Block type ID.
     */
    getTypeId(): string;
    /**
     * @description Returns the human-readable name from the block definition.
     * @returns {string} Block name.
     */
    getName(): string;
    /**
     * @description Extracts required rendering data from the global context.
     * @param {BlockDataContext} context Current state payload.
     * @returns {Object} Extracted data dictionary.
     * @abstract
     */
    getData(_context: Context): Data;
    /**
     * @description Evaluates whether extracted data is empty using the shared value semantics.
     * Subclasses may override this method for domain-specific payload shapes.
     * @param {*} data Output from getData().
     * @returns {boolean} True if empty.
     */
    isEmpty(data: unknown): boolean;
    /**
     * @description Resolves the format-specific template identifier for this block.
     * @param {string} format Target rendering format.
     * @returns {string} Template ID.
     * @abstract
     */
    getTemplateId(_format: string): string;
    /**
     * @description Orchestrates the block lifecycle: data extraction, empty state handling, and template rendering.
     * @param {string} instanceId Unique instance identifier.
     * @param {BlockDataContext} context Data payload.
     * @param {string} format Target output format.
     * @param {BlockRenderer} renderer Engine capable of processing the template.
     * @returns {BlockResult} Encapsulated execution outcome.
     */
    evaluate(instanceId: string, context: Context, format: string, renderer: Pick<RendererLike, 'render'>): BlockResult;
    /**
     * @description Delegates final string generation to the injected renderer.
     * @param {Object} data Extracted payload.
     * @param {string} format Output format.
     * @param {BlockRenderer} renderer Engine instance.
     * @param {string} templateId Resolved template identifier.
     * @returns {string} Rendered content string.
     * @throws {Error} If renderer is not provided.
     */
    render(data: Data, format: string, renderer: Pick<RendererLike, 'render'>, templateId: string): string;
    /**
     * @description Generates diagnostic metadata for the BlockResult.
     * @param {Object} data Extracted block data.
     * @returns {Object} Metadata dictionary.
     * @protected
     */
    _getMetadata(_data: Data): {
        blockType: string;
        blockName: string;
    };
    /**
     * @description Verifies format support against the block definition.
     * @param {string} format Target output format.
     * @returns {boolean} True if supported.
     */
    supportsFormat(format: string): boolean;
    /**
     * @description Returns a diagnostic string identifier for the block.
     * @returns {string} String representation.
     */
    toString(): string;
}
/**
 * @description Concrete implementation of ContentBlock using injected extractor functions instead of subclassing.
 * @class
 * @extends ContentBlock
 * @example
 * const block = new SimpleContentBlock(def, {
 *   dataExtractor: (ctx) => ({ name: ctx.get('name') }),
 *   templates: { html: 'tpl_html' }
 * });
 */
export declare class SimpleContentBlock<Data = unknown, Context = unknown> extends ContentBlock<Data, Context> {
    _dataExtractor: SimpleBlockConfig<Data, Context>['dataExtractor'];
    _emptyChecker: (data: Data) => boolean;
    _templates: Record<string, string>;
    /**
     * @description Initializes a simple block with functional callbacks for lifecycle methods.
     * @param {BlockDefinition} definition Immutable type specification.
     * @param {Object} config Configuration payload.
     * @param {Function} config.dataExtractor Strategy for `getData`.
     * @param {Function} [config.emptyChecker] Optional strategy for `isEmpty`.
     * @param {Object} config.templates Format-to-TemplateId mapping.
     * @throws {Error} If dataExtractor or templates are missing.
     */
    constructor(definition: BlockDefinition, config: SimpleBlockConfig<Data, Context>);
    /**
     * @description Executes the injected data extractor function.
     * @param {BlockDataContext} context Target data context.
     * @returns {Object} Extracted data.
     */
    getData(context: Context): Data;
    /**
     * @description Executes the configured empty checker function.
     * @param {*} data Extracted payload.
     * @returns {boolean} True if empty.
     */
    isEmpty(data: unknown): boolean;
    /**
     * @description Resolves the template ID from the injected format mapping.
     * @param {string} format Target format.
     * @returns {string} Mapped template ID.
     * @throws {Error} If no template is mapped for the format.
     */
    getTemplateId(format: string): string;
}
