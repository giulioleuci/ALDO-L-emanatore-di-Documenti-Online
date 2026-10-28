/**
 * @file WorkspaceTemplateEngine/src/filters/AdvancedFilters.js
 * @description Advanced filter implementations inspired by Handlebars and Liquid.
 *              Extends the Mustache template engine with "logic-light" features.
 * @version 2.1.0
 */
import { FilterStrategy } from '../../FilterStrategy.js';
/**
 * @description Liquid-style default filter. Returns defaultValue if value is null, undefined, or empty.
 * @class
 */
export declare class DefaultFilter extends FilterStrategy {
    _name: string;
    /**
     * @param {string} [name='default'] Registered filter name. Also registered
     *   as 'fallback' — same null/undefined/empty-string(/array) behavior.
     */
    constructor(name?: string);
    getName(): string;
    getDescription(): string;
    execute(value: unknown, defaultValue?: unknown): unknown;
}
/**
 * @description Boolean-to-string transformer. Format: "YesString,NoString".
 * @class
 */
export declare class YesNoFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, yesNoString?: string): string;
}
/**
 * @description String truncator with optional suffix. Defaults to 50 chars and "...".
 * @class
 */
export declare class TruncateFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, length?: string | number, suffix?: string): string;
}
/**
 * @description String-to-array splitter using a specified separator (default: ",").
 * @class
 */
export declare class SplitFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, separator?: string): string[];
}
/**
 * @description Global string replacer. Replaces all occurrences of searchValue with replaceValue.
 * @class
 */
export declare class ReplaceFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, searchValue?: string, replaceValue?: string): unknown;
}
/**
 * @description URI component encoder for URL-safe string generation.
 * @class
 */
export declare class UrlEncodeFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
}
/**
 * @description Array property mapper. Extracts a specific key from each object in an array. Includes prototype pollution protection.
 * @class
 */
export declare class MapFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    _isDangerousKey(key: string): key is "constructor" | "__proto__" | "prototype";
    execute<T, K extends keyof T>(array: T[], propertyName: K): T[K][];
    execute(array: unknown, propertyName?: string): unknown;
}
/**
 * @description Array slicer. Returns the first N items (default: 10).
 * @class
 */
export declare class LimitFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute<T>(array: T[], count?: string | number): T[];
    execute<T>(array: T, count?: string | number): T;
}
/**
 * @description Array offsetter. Skips the first N items.
 * @class
 */
export declare class SkipFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute<T>(array: T[], count?: string | number): T[];
    execute<T>(array: T, count?: string | number): T;
}
/**
 * @description Advanced array sorter. Supports property-based sorting and descending order ("desc"). Includes prototype pollution protection.
 * @class
 */
export declare class SortFilter extends FilterStrategy {
    _name: string;
    /**
     * @param {string} [name='sort'] Registered filter name. Also registered as
     *   'sortBy' (BuiltInFilters) for the single-property-ascending call shape.
     */
    constructor(name?: string);
    getName(): string;
    getDescription(): string;
    _isDangerousKey(key: string): key is "constructor" | "__proto__" | "prototype";
    execute<T>(array: T[], propertyOrDirection?: string, direction?: string): T[];
    execute<T>(array: T, propertyOrDirection?: string, direction?: string): T;
}
/**
 * @description Array order reverser. Creates a shallow copy before reversing.
 * @class
 */
export declare class ReverseFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute<T>(array: T[]): T[];
    execute<T>(array: T): T;
}
/**
 * @description Numeric addition filter. Adds addend to the value.
 * @class
 */
export declare class PlusFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, addend?: unknown): unknown;
}
/**
 * @description Numeric subtraction filter. Subtracts subtrahend from the value.
 * @class
 */
export declare class MinusFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, subtrahend?: unknown): unknown;
}
/**
 * @description JSON serializer with optional indentation support.
 * @class
 */
export declare class JsonFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, indent?: string | number): string;
}
/**
 * @description Factory function that instantiates and returns all advanced filter strategies.
 * @returns {FilterStrategy[]} Collection of advanced filter instances.
 */
export declare function createAdvancedFilters(): (DefaultFilter | YesNoFilter | TruncateFilter | SplitFilter | ReplaceFilter | UrlEncodeFilter | MapFilter | LimitFilter | SkipFilter | SortFilter | ReverseFilter | PlusFilter | MinusFilter | JsonFilter)[];
