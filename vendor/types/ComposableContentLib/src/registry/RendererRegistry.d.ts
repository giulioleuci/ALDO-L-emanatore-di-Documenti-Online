import type { ContentLogger, RendererLike } from '../types.js';
import { Registry } from '@CoreUtilsLib';
/**
 * Centralized registry for BlockRenderer instances mapped by output format (e.g., 'html', 'markdown').
 * @class
 */
export declare class RendererRegistry {
    _logger: ContentLogger;
    _renderers: Registry<string, RendererLike>;
    /**
     * Initializes a new RendererRegistry instance.
     * @param {Object} [options={}] Registry configuration.
     * @param {boolean} [options.registerDefaults=true] Whether to auto-register built-in renderers (HTML, Markdown, PlainText).
     * @param {Object} [options.logger=console] Logger implementation for diagnostic output.
     */
    constructor(options?: {
        logger?: ContentLogger;
        registerDefaults?: boolean;
    });
    /**
     * Instantiates and registers the built-in HTML, Markdown, and PlainText renderers.
     * @private
     */
    _registerDefaults(): void;
    /**
     * Adds a renderer instance to the registry.
     * @param {BlockRenderer} renderer Renderer instance to register.
     * @returns {RendererRegistry} Fluent interface for chaining.
     * @throws {Error} If renderer is null or lacks the required getFormat() method.
     */
    register(renderer: RendererLike): this;
    /**
     * Removes the renderer associated with the specified format.
     * @param {string} format Target output format ID.
     * @returns {boolean} True if the renderer was successfully removed.
     */
    unregister(format: string): boolean;
    /**
     * Retrieves a renderer by output format.
     * @param {string} format Target output format ID.
     * @returns {BlockRenderer} The associated renderer instance.
     * @throws {RendererNotFoundError} If no renderer is registered for the specified format.
     */
    get(format: string): RendererLike;
    /**
     * Retrieves a renderer or null if unregistered.
     * @param {string} format Target output format ID.
     * @returns {BlockRenderer|null} The renderer instance or null.
     */
    getOrNull(format: string): RendererLike | null;
    /**
     * Validates presence of a renderer for the specified format.
     * @param {string} format Target output format ID.
     * @returns {boolean} True if a renderer exists.
     */
    has(format: string): boolean;
    /**
     * Retrieves all registered output format identifiers.
     * @returns {string[]} Collection of format IDs.
     */
    getFormats(): string[];
    /**
     * Retrieves all registered renderer instances.
     * @returns {BlockRenderer[]} Collection of renderer instances.
     */
    getAllRenderers(): RendererLike[];
    /**
     * Returns current count of registered renderers.
     * @returns {number} Registration count.
     */
    size(): number;
    /**
     * Purges all renderer registrations.
     */
    clear(): void;
    /**
     * Returns diagnostic summary string including current registration count and supported formats.
     * @returns {string} Diagnostic summary.
     */
    toString(): string;
}
