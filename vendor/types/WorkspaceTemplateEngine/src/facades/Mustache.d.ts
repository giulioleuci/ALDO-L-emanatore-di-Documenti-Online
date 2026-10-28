import type { TemplateLogger, TemplateUtils } from '../types.js';
export interface MustacheOptions {
    logger?: TemplateLogger | null;
    utils?: TemplateUtils;
    partials?: Record<string, unknown>;
    tags?: string[];
}
export type MustacheToken = [
    type: string,
    value: string,
    start?: number,
    end?: number,
    children?: MustacheToken[],
    index?: number
];
export interface RenderSegment {
    type: 'text' | 'value';
    raw: string;
    rendered: string;
    rawStart: number;
    rawEnd: number;
}
type RenderState = {
    depth: number;
    partialStack: string[];
};
type Partials = Record<string, unknown> | ((name: string) => unknown);
import { FilterRegistry, FilterStrategy } from '../FilterStrategy.js';
import { BaseError } from '@CoreUtilsLib';
/**
 * @class MustacheRenderError
 * @extends BaseError
 * @description Thrown when template rendering exceeds the maximum nesting depth or
 * detects a self-referencing partial cycle — surfaces a catchable, diagnosable error
 * instead of an opaque call-stack overflow when a data-driven CONF_DOC/CONF_MAIL
 * template is malformed (ref analysis_3_structural_errors.md Finding 3).
 */
declare class MustacheRenderError extends BaseError {
}
/**
 * @description Hierarchical context stack for Mustache variable resolution.
 * Supports parent context navigation ('../') and dot-notation property access.
 * @private
 * @class
 */
declare class _MustacheContext {
    view: unknown;
    cache: Record<string, unknown>;
    parent: _MustacheContext | undefined;
    constructor(view: unknown, parentContext?: _MustacheContext);
    /**
     * @description Creates a child context by pushing a new data view onto the stack.
     * @param {*} view The data object or primitive for the new context level.
     * @returns {_MustacheContext} A new context instance linked to the current one as parent.
     */
    push(view: unknown): _MustacheContext;
    /**
     * @description Resolves a value by key name across the current and parent contexts.
     * Supports Handlebars-style '../' navigation and deep property paths.
     * @param {string} name Identifier or path (e.g., 'user.name', '../title').
     * @returns {*} Resolved value or undefined.
     */
    lookup(name: string): unknown;
    /**
     * @description Security guard against prototype pollution during context lookups.
     * @param {string} key Property key to validate.
     * @returns {boolean} True if the key is restricted ('__proto__', 'constructor', 'prototype').
     * @private
     */
    _isDangerousKey(key: string): key is "constructor" | "__proto__" | "prototype";
}
/**
 * @description Advanced Mustache engine with Handlebars meta-variables (@index, @number, @first, @last, @odd, @even, @total, @key) and Liquid-style filters.
 * Implements template caching, prototype pollution protection, and Strategy-based filter registry.
 * @class
 * @version 2.1.0
 * @example
 * const mustache = new MyMustache({ logger: console });
 * const result = mustache.render('{{items | join:", "}}', { items: [1, 2, 3] });
 */
export declare class MyMustache {
    logger: TemplateLogger;
    utils: TemplateUtils | undefined;
    partials: Record<string, unknown>;
    tags: string[];
    templateCache: Record<string, MustacheToken[]>;
    filterRegistry: FilterRegistry;
    /**
     * @description Dependency injection manifest for the Mustache service.
     * @returns {Object} DI configuration object.
     * @static
     */
    static get di(): {
        name: string;
        dependencies: string[];
        isSingleton: boolean;
        factory: (logger: TemplateLogger) => MyMustache;
    };
    /**
     * @description Strict null/undefined check for template value resolution.
     * @param {*} value Value to evaluate.
     * @returns {boolean} True if value is null or undefined.
     * @static
     */
    static isNullOrUndefined(value: unknown): value is null | undefined;
    /** @description Token array index for type identifier. @static */
    static get TOKEN_TYPE(): 0;
    /** @description Token array index for raw string value. @static */
    static get TOKEN_VALUE(): 1;
    /** @description Token array index for start character position. @static */
    static get TOKEN_START(): 2;
    /** @description Token array index for end character position. @static */
    static get TOKEN_END(): 3;
    /** @description Token array index for child token collection. @static */
    static get TOKEN_CHILDREN(): 4;
    /** @description Token array index for closing tag position. @static */
    static get TOKEN_INDEX(): 5;
    /** @description Section start tag identifier (#). @static */
    static get TAG_SECTION(): string;
    /** @description Inverted section start tag identifier (^). @static */
    static get TAG_INVERTED(): string;
    /** @description Section end tag identifier (/). @static */
    static get TAG_SECTION_END(): string;
    /** @description Comment tag identifier (!). @static */
    static get TAG_COMMENT(): string;
    /** @description Partial inclusion tag identifier (>). @static */
    static get TAG_PARTIAL(): string;
    /** @description Unescaped variable tag identifier (&). @static */
    static get TAG_UNESCAPED(): string;
    /** @description Alternative unescaped variable tag identifier ({). @static */
    static get TAG_UNESCAPED_ALT(): string;
    /** @description Regular variable token type name. @static */
    static get TAG_VARIABLE(): string;
    /** @description Plain text token type name. @static */
    static get TAG_TEXT(): string;
    /** @description Maximum combined section/partial nesting depth before render() throws MustacheRenderError. @static */
    static get MAX_RENDER_DEPTH(): number;
    /**
     * @description Initializes the engine, configures dependencies, and auto-registers built-in filters.
     * @param {Object} [options={}] Configuration options.
     * @param {LoggerService} [options.logger=console] Diagnostic logger.
     * @param {UtilsService} [options.utils] Optional utility service for advanced date formatting.
     * @param {Object.<string, string>} [options.partials={}] Pre-defined partial templates.
     * @param {string[]} [options.tags=['{{', '}}']] Custom tag delimiters.
     */
    constructor(options?: MustacheOptions);
    /**
     * @description Security guard against prototype pollution during context lookups.
     * @param {string} key Property key to validate.
     * @returns {boolean} True if the key is restricted ('__proto__', 'constructor', 'prototype').
     * @private
     */
    _isDangerousKey(key: string): key is "constructor" | "__proto__" | "prototype";
    /**
     * @description Resolves a deep property value using dot-notation, with prototype pollution protection.
     * @param {string} key Dot-separated property path (e.g., 'user.profile.name').
     * @param {Object} data Source object for resolution.
     * @returns {*} Resolved value or undefined if path is invalid or blocked.
     */
    getValue(key: string | null | undefined, data: unknown): unknown;
    /**
     * @description Internal bootstrap for loading built-in and advanced filter strategies.
     * @private
     */
    _initBuiltInFilters(): void;
    /**
     * @description Registers a custom filter strategy.
     * @param {FilterStrategy|string} filterStrategyOrName FilterStrategy instance or name for backward compatibility.
     * @param {Function} [fn] Filter function (v1.x compatibility).
     * @throws {Error} If registration fails or invalid types provided.
     */
    registerFilter<Input = unknown, Output = unknown, Args extends unknown[] = unknown[]>(filterStrategyOrName: FilterStrategy<Input, Output, Args> | string, fn?: (value: Input, ...args: Args) => Output): void;
    /**
     * @description Executes template rendering with data substitution and partial resolution.
     * @param {string} template Mustache template string.
     * @param {Object} [data={}] View model data.
     * @param {Object} [additionalPartials={}] Render-specific partial overrides.
     * @returns {string} Rendered output or error diagnostic string.
     * @throws {TypeError} If input arguments are invalid.
     */
    render(template: string, data?: object | null, additionalPartials?: Record<string, unknown> | null): string;
    /**
     * @description Renders a template into an ordered list of segments, each carrying
     * its resolved text plus its raw start/end offset in the original template string.
     * Unlike render(), this does not collapse the output into one string — it exposes
     * segment boundaries so a caller can map a rendered span back to the original
     * template offset it came from (e.g. to re-apply the original run's formatting).
     * Only supports top-level tokens; a section/inverted/partial token is rendered as
     * one opaque 'value' segment via the existing render machinery, not sub-divided.
     * Comment ('!') and set-delimiter ('=') tokens produce no segment, matching the
     * fact that render() also produces no output for them.
     * @param {string} template Mustache template string.
     * @param {Object} [data={}] View model data.
     * @param {Object} [additionalPartials={}] Render-specific partial overrides.
     * @returns {Array<{type: 'text'|'value', raw: string, rendered: string, rawStart: number, rawEnd: number}>}
     */
    renderSegments(template: string, data?: object | null, additionalPartials?: Record<string, unknown> | null): RenderSegment[];
    /**
     * @description Escapes characters for use in a literal regular expression.
     * @param {string} string Input string.
     * @returns {string} Regex-safe escaped string.
     * @private
     */
    _escapeRegExp(string: string): string;
    /**
     * @description Robust HTML entity encoding for XSS prevention.
     * Encodes &, <, >, ", ', `, and = while preserving Unicode/international characters.
     * @param {string} string Raw input string.
     * @returns {string} HTML-encoded safe string.
     * @private
     */
    _escapeHtml(string: string): string;
    /**
     * @description Orchestrates template parsing with delimiter-aware caching.
     * @param {string} template Raw template string.
     * @param {string[]} [tags] Custom delimiters.
     * @returns {Array[]} Parsed token hierarchy.
     * @private
     */
    _parse(template: string, tags?: string[]): MustacheToken[];
    /**
     * @description Recursively renders a token collection into a final string.
     * @param {Array[]} tokens Array of parsed tokens.
     * @param {MustacheContext} context Data resolution context.
     * @param {Object} partials Map of partial templates.
     * @param {string} originalTemplate Source template for section extraction.
     * @param {Object} state Internal recursion-tracking state ({depth, partialStack}).
     * @returns {string} Partial rendered output.
     * @private
     */
    _renderTokens(tokens: MustacheToken[], context: _MustacheContext, partials: Partials, originalTemplate: string, state: RenderState): string;
    /**
     * @description Parses filter pipe syntax and executes the transformation chain.
     * @param {Array} token Target token containing key and filter string.
     * @param {MustacheContext} context Current data context.
     * @returns {*} Final resolved and transformed value.
     * @private
     */
    _lookupValue(token: Pick<MustacheToken, 0 | 1>, context: _MustacheContext): unknown;
    /**
     * @description Renders a value with default string conversion.
     * @param {Array} token Value token.
     * @param {MustacheContext} context Data context.
     * @returns {string|undefined} Stringified value.
     * @private
     */
    _escapedValue(token: MustacheToken, context: _MustacheContext): string | undefined;
    /**
     * @description Renders a raw value without escaping.
     * @param {Array} token Value token.
     * @param {MustacheContext} context Data context.
     * @returns {string|undefined} Stringified raw value.
     * @private
     */
    _unescapedValue(token: MustacheToken, context: _MustacheContext): string | undefined;
    /**
     * @description Decorates iteration items with Handlebars-style meta-variables (@index, @first, etc.).
     * @param {*} item Array element.
     * @param {number} index Current zero-based index.
     * @param {number} total Total element count.
     * @param {string} [key] Optional map key.
     * @returns {Object|*} Decorated item or original if primitive.
     * @private
     */
    _createLoopContext(item: unknown, index: number, total: number, key?: string): unknown;
    /**
     * @description Renders a conditional or iterative section with meta-variable support.
     * @param {Array} token Section token hierarchy.
     * @param {MustacheContext} context Parent context.
     * @param {Object} partials Map of partial templates.
     * @param {string} originalTemplate Source template.
     * @param {Object} state Internal recursion-tracking state ({depth, partialStack}).
     * @returns {string|undefined} Rendered section content.
     * @private
     */
    _renderSection(token: MustacheToken, context: _MustacheContext, partials: Partials, originalTemplate: string, state: RenderState): string | undefined;
    /**
     * @description Renders content if a key is falsy or an empty array.
     * @param {Array} token Inverted section token.
     * @param {MustacheContext} context Current context.
     * @param {Object} partials Partial definitions.
     * @param {string} originalTemplate Source template.
     * @param {Object} state Internal recursion-tracking state ({depth, partialStack}).
     * @returns {string|undefined} Rendered content.
     * @private
     */
    _renderInverted(token: MustacheToken, context: _MustacheContext, partials: Partials, originalTemplate: string, state: RenderState): string | undefined;
    /**
     * @description Resolves and renders a partial template inclusion.
     * @param {Array} token Partial token.
     * @param {MustacheContext} context Current context.
     * @param {Object|function} partials Partial source.
     * @param {Object} state Internal recursion-tracking state ({depth, partialStack}).
     * @returns {string|undefined} Rendered partial output.
     * @private
     */
    _renderPartial(token: MustacheToken, context: _MustacheContext, partials: Partials, state: RenderState): string | undefined;
    /**
     * @description Optimizes token stream by merging adjacent text fragments.
     * @param {Array[]} tokens Raw token sequence.
     * @returns {Array[]} Optimized token sequence.
     * @private
     */
    _squashTokens(tokens: MustacheToken[]): MustacheToken[];
    /**
     * @description Transforms flat token stream into a nested section hierarchy.
     * @param {Array[]} tokens Linear token sequence.
     * @returns {Array[]} Hierarchical token tree.
     * @private
     */
    _nestTokens(tokens: MustacheToken[]): MustacheToken[];
    /**
     * @description Lexical analyzer that converts a template string into tokens.
     * @param {string} template Raw template.
     * @param {string[]} tags Delimiters.
     * @returns {Array[]} Token tree.
     * @throws {Error} On unclosed tags or sections.
     * @private
     */
    _parseTemplate(template: string, tags: string[]): MustacheToken[];
}
export { MyMustache as Mustache, _MustacheContext as MustacheContext, MustacheRenderError };
