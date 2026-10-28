/**
 * @file ComposableContentLib/index.js
 * @description ComposableContentLib - Layer 3 library for composing dynamic content from modular blocks.
 * @version 1.0.0
 *
 * **ComposableContentLib** provides a flexible framework for assembling
 * dynamic content from reusable, configurable content blocks.
 *
 * ## Key Features
 * - Define reusable content blocks (headers, paragraphs, tables, etc.)
 * - Compose content from blocks using JSON recipes
 * - Support multiple output formats (HTML, Markdown, plain text)
 * - Conditional block visibility based on data context
 * - Extensible renderer system
 * - Block registry for type management
 *
 * ## Architecture
 * **Layer 3** library depending on:
 * - CoreUtilsLib (utilities, logging)
 * - GoogleApiWrapper (optional, for document integration)
 * - GasExpressionEngineLib (optional, for complex visibility conditions)
 *
 * ## Core Concepts
 *
 * ### Content Blocks
 * Reusable content units with defined structure and rendering behavior.
 *
 * ### Composition Recipes
 * JSON definitions specifying which blocks to include and their configuration.
 *
 * ### Renderers
 * Format-specific rendering implementations (HTML, Markdown, text).
 *
 * @module ComposableContentLib
 *
 * @example
 * import {
 *   ContentComposer,
 *   BlockRegistry,
 *   RendererRegistry,
 *   CompositionRecipe,
 *   SimpleContentBlock,
 *   BlockDefinition,
 *   HtmlRenderer
 * } from '@ComposableContentLib';
 *
 * // Setup registries
 * const blockRegistry = new BlockRegistry();
 * const rendererRegistry = new RendererRegistry();
 *
 * // Register a block type
 * blockRegistry.register({
 *   definition: new BlockDefinition({
 *     id: 'greeting',
 *     name: 'Greeting Block',
 *     supportedFormats: ['html', 'text']
 *   }),
 *   factory: (def, config) => new SimpleContentBlock(def, {
 *     dataExtractor: (ctx) => ({ name: ctx.get('user.name') }),
 *     emptyChecker: (data) => !data.name,
 *     templates: { html: 'greeting_html', text: 'greeting_text' }
 *   })
 * });
 *
 * // Register renderer
 * rendererRegistry.registerRenderer('html', new HtmlRenderer(templateEngine));
 *
 * // Create composer
 * const composer = new ContentComposer({ blockRegistry, rendererRegistry });
 *
 * // Compose content
 * const recipe = new CompositionRecipe({
 *   id: 'welcome',
 *   name: 'Welcome Message',
 *   outputFormat: 'html',
 *   blocks: [
 *     { instanceId: 'greet', blockType: 'greeting' }
 *   ]
 * });
 *
 * const result = composer.compose(recipe, { user: { name: 'John' } });
 * console.log(result.content);
 */
export { EmptyBehavior, OutputFormat, ContainerType, isValidOutputFormat, isValidEmptyBehavior, isValidContainerType } from './src/core/EmptyBehavior.js';
export { BlockDefinition } from './src/core/BlockDefinition.js';
export { BlockResult } from './src/core/BlockResult.js';
export { ContentBlock, SimpleContentBlock } from './src/core/ContentBlock.js';
export { CompositionResult } from './src/core/CompositionResult.js';
export { CompositionRecipe } from './src/composition/CompositionRecipe.js';
export { VisibilityEvaluator } from './src/internal/VisibilityEvaluator.js';
export { ContentComposer } from './src/composition/ContentComposer.js';
export { BlockRegistry } from './src/registry/BlockRegistry.js';
export { RendererRegistry } from './src/registry/RendererRegistry.js';
export { BlockDataContext } from './src/data/BlockDataContext.js';
export { BlockRenderer, HtmlRenderer, MarkdownRenderer, PlainTextRenderer } from './src/internal/BlockRenderer.js';
export { ComposableContentError, BlockNotFoundError, RenderingError, RecipeValidationError, RendererNotFoundError } from './src/errors/ComposableContentError.js';
export * as testing from './src/testing/mocks.js';
export type { DefinitionInput, RenderOptions, Template, RendererOptions, RendererLike, SimpleBlockConfig, BlockResultInput, CompositionResultInput, BlockInstance, NormalizedBlockInstance, RecipeInput, BlockFactory, BlockRegistration, VisibilityContext, VisibilityEngine, ComposerOptions, ComposeOptions } from './src/types.js';
