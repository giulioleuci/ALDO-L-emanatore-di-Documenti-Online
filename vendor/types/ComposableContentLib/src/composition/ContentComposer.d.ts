import type { ContentLogger, RendererLike, NormalizedBlockInstance, RecipeInput, ComposerOptions, ComposeOptions } from '../types.js';
/**
 * @file ComposableContentLib/src/composition/ContentComposer.js
 * @description Main composition engine for assembling content from blocks.
 * @version 1.0.0
 */
import { CompositionRecipe } from './CompositionRecipe.js';
import { CompositionResult } from '../core/CompositionResult.js';
import { BlockResult } from '../core/BlockResult.js';
import { BlockDataContext } from '../data/BlockDataContext.js';
import { VisibilityEvaluator } from '../internal/VisibilityEvaluator.js';
/**
 * @description Central orchestration engine for content block resolution and rendering.
 * Coordinates block registry lookups, visibility evaluation, and sequential block execution to generate aggregate content.
 * @class
 * @example
 * const composer = new ContentComposer({ blockRegistry, rendererRegistry });
 * const result = composer.compose(recipe, { user: { name: 'Alice' } });
 */
export declare class ContentComposer {
    _blockRegistry: ComposerOptions['blockRegistry'];
    _rendererRegistry: ComposerOptions['rendererRegistry'];
    _logger: ContentLogger;
    _visibilityEvaluator: VisibilityEvaluator;
    /**
     * @description Initializes the composer with mandatory registries and optional evaluation engines.
     * @param {Object} options Configuration options.
     * @param {BlockRegistry} options.blockRegistry Repository of block definitions.
     * @param {RendererRegistry} options.rendererRegistry Repository of format-specific renderers.
     * @param {Object} [options.logger=console] Diagnostic logger.
     * @param {Object} [options.expressionEngine=null] Optional engine for advanced visibility logic.
     * @throws {Error} If registries are missing from options.
     */
    constructor(options: ComposerOptions);
    /**
     * @description Executes a composition recipe against a data context to generate a final result.
     * Processes blocks sequentially, handling errors based on the `continueOnError` flag, and aggregates visible content.
     * @param {CompositionRecipe|Object} recipe The recipe defining the composition structure.
     * @param {Object|BlockDataContext} context The data payload for block evaluation.
     * @param {Object} [options={}] Execution modifiers.
     * @param {string} [options.format] Output format override (defaults to recipe format).
     * @param {boolean} [options.continueOnError=true] If false, halts execution on first block failure.
     * @returns {CompositionResult} Detailed execution report including aggregated content and block-level metadata.
     */
    compose(recipe: CompositionRecipe | RecipeInput, context: object, options?: ComposeOptions): CompositionResult;
    /**
     * @description Convenience method for composition that returns only the aggregated string content.
     * @param {CompositionRecipe|Object} recipe Composition manifest.
     * @param {Object|BlockDataContext} context Data payload.
     * @param {Object} [options={}] Execution modifiers.
     * @returns {string} Fully rendered and joined content string.
     */
    composeToString(recipe: CompositionRecipe | RecipeInput, context: object, options?: ComposeOptions): string;
    /**
     * @description Internal evaluator for a single block instance.
     * Handles visibility checks, registry resolution, format validation, and block execution.
     * @param {Object} blockInstance Recipe block configuration.
     * @param {BlockDataContext} context Data context.
     * @param {string} format Target output format.
     * @param {BlockRenderer} renderer Format-specific renderer.
     * @returns {BlockResult} Execution outcome for the block.
     * @throws {BlockNotFoundError} If the requested block type is unregistered.
     * @private
     */
    _evaluateBlock(blockInstance: NormalizedBlockInstance, context: BlockDataContext, format: string, renderer: RendererLike): BlockResult;
    /**
     * @description Validates a recipe against current registry states to ensure all dependencies are met.
     * @param {CompositionRecipe|Object} recipe Recipe to validate.
     * @returns {Object} Validation summary containing `{ valid: boolean, errors: string[] }`.
     */
    validateRecipe(recipe: CompositionRecipe | RecipeInput): {
        valid: boolean;
        errors: string[];
    };
    /**
     * @description Returns the configured block registry instance.
     * @returns {BlockRegistry} Active block repository.
     */
    getBlockRegistry(): Pick<import("../registry/BlockRegistry.js").BlockRegistry<import("../core/ContentBlock.js").ContentBlock<unknown, unknown>>, "has" | "createBlock" | "size">;
    /**
     * @description Returns the configured renderer registry instance.
     * @returns {RendererRegistry} Active renderer repository.
     */
    getRendererRegistry(): Pick<import("../registry/RendererRegistry.js").RendererRegistry, "get" | "size"> & {
        hasRenderer?: (format: string) => boolean;
    };
    /**
     * @description Returns a technical summary of the composer's registry states.
     * @returns {string} Debug string representation.
     */
    toString(): string;
}
