import type { ContentLogger, RenderOptions, Template, RendererOptions } from '../types.js';
/**
 * Abstract base class for block rendering engines. Subclasses must implement format-specific logic.
 * @class
 * @abstract
 */
export declare class BlockRenderer<Data = Record<string, unknown>> {
    _logger: ContentLogger;
    _templates: Map<string, Template<Data>>;
    /**
     * Initializes a new BlockRenderer instance.
     * @param {Object} [options={}] Renderer configuration.
     * @param {Object} [options.logger=console] Logger implementation for diagnostic output.
     * @param {Object<string, string|Function>} [options.templates={}] Map of template identifiers to strings or functions.
     */
    constructor(options?: RendererOptions<Data>);
    /**
     * Retrieves the target output format identifier.
     * @returns {string} Format ID (e.g., 'html', 'markdown', 'text').
     * @abstract
     * @throws {Error} If called directly on base class.
     */
    getFormat(): string;
    /**
     * Executes template rendering with provided data and options.
     * @param {string} templateId Target template identifier.
     * @param {Object} data Source data for interpolation.
     * @param {Object} [options={}] Rendering configuration.
     * @param {string} [options.containerType] Optional container wrapping (ContainerType enum).
     * @param {string} [options.blockType] Block type ID for class name generation.
     * @returns {string} Fully rendered content string.
     * @throws {TemplateNotFoundError} If templateId is not registered.
     * @throws {RenderingError} If rendering logic or interpolation fails.
     */
    render(templateId: string, data: Data, options?: RenderOptions): string;
    /**
     * Processes template string via regex-based interpolation ({{path.to.value}}).
     * @param {string} template Source template string.
     * @param {Object} data Source data object.
     * @returns {string} Interpolated output.
     * @protected
     */
    _processTemplate(template: string, data: Data): string;
    /**
     * Resolves a value from a nested object using dot-notation.
     * @param {Object} obj Target object.
     * @param {string} path Dot-separated property path.
     * @returns {*} Resolved value or undefined if path does not exist.
     * @protected
     */
    _getValueByPath(obj: unknown, path: string): unknown;
    /**
     * Wraps rendered content in a format-specific container structure.
     * @param {string} content Rendered payload.
     * @param {string} containerType Target container type (ContainerType enum).
     * @param {Object} options Original rendering options.
     * @returns {string} Wrapped output.
     * @protected
     */
    _wrapInContainer(content: string, containerType: string, options: RenderOptions): string;
    /**
     * Registers a single template string or function.
     * @param {string} templateId Target template identifier.
     * @param {string|Function} template Template payload.
     * @returns {BlockRenderer} Fluent interface for chaining.
     */
    registerTemplate(templateId: string, template: Template<Data>): this;
    /**
     * Registers multiple templates from a KV map.
     * @param {Object<string, string|Function>} templates Map of template identifiers to payloads.
     * @returns {BlockRenderer} Fluent interface for chaining.
     */
    registerTemplates(templates: Record<string, Template<Data>>): this;
    /**
     * Validates presence of a template in the renderer registry.
     * @param {string} templateId Target template identifier.
     * @returns {boolean} True if registered.
     */
    hasTemplate(templateId: string): boolean;
    /**
     * Returns total number of registered templates.
     * @returns {number} Template count.
     */
    templateCount(): number;
    /**
     * Returns diagnostic summary string including format and template count.
     * @returns {string} Diagnostic summary.
     */
    toString(): string;
}
/**
 * Markdown-specialized renderer implementation.
 * @class
 * @extends BlockRenderer
 */
export declare class MarkdownRenderer<Data = Record<string, unknown>> extends BlockRenderer<Data> {
    /**
     * Returns 'markdown' format identifier.
     * @returns {string}
     */
    getFormat(): string;
    /**
     * Wraps content in Markdown block syntax (blockquote, horizontal rules).
     * @param {string} content Rendered payload.
     * @param {string} containerType Target container type.
     * @param {Object} options Rendering options.
     * @returns {string} Markdown wrapped content.
     * @protected
     */
    _wrapInContainer(content: string, containerType: string, options: RenderOptions): string;
}
/**
 * Plain text specialized renderer implementation.
 * @class
 * @extends BlockRenderer
 */
export declare class PlainTextRenderer<Data = Record<string, unknown>> extends BlockRenderer<Data> {
    /**
     * Returns 'text' format identifier.
     * @returns {string}
     */
    getFormat(): string;
    /**
     * Wraps content in basic text delimiters.
     * @param {string} content Rendered payload.
     * @param {string} containerType Target container type.
     * @param {Object} options Rendering options.
     * @returns {string} Text wrapped content.
     * @protected
     */
    _wrapInContainer(content: string, containerType: string, options: RenderOptions): string;
}
/**
 * HTML-specialized renderer implementation.
 * @class
 * @extends BlockRenderer
 */
export declare class HtmlRenderer<Data = Record<string, unknown>> extends BlockRenderer<Data> {
    /**
     * Returns 'html' format identifier.
     * @returns {string}
     */
    getFormat(): string;
    /**
     * Wraps content in HTML structural elements (div, section) based on ContainerType.
     * @param {string} content Rendered payload.
     * @param {string} containerType Target container type.
     * @param {Object} options Rendering options.
     * @returns {string} HTML wrapped content.
     * @protected
     */
    _wrapInContainer(content: string, containerType: string, options: RenderOptions): string;
}
