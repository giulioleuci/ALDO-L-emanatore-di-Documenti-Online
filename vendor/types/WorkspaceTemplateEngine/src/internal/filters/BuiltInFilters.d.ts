import type { TemplateUtils } from '../../types.js';
/**
 * @file WorkspaceTemplateEngine/src/filters/BuiltInFilters.js
 * @description Built-in filter implementations using Strategy pattern.
 *              WTE-HIGH-001: Refactored from inline implementations in MyMustache.
 * @version 2.0.0
 */
import { FilterStrategy } from '../../FilterStrategy.js';
import { SortFilter } from './AdvancedFilters.js';
/**
 * @description String transformer. Converts all characters to uppercase.
 * @class
 */
export declare class UppercaseFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
}
/**
 * @description String transformer. Converts all characters to lowercase.
 * @class
 */
export declare class LowercaseFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
}
/**
 * @description String transformer. Converts only the first character to lowercase. Unicode-safe.
 * @class
 */
export declare class UncapitalizeFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
}
/**
 * @description String transformer. Capitalizes the first character and lowercases the rest. Unicode-safe.
 * @class
 */
export declare class CapitalizeFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
}
/**
 * @description Date formatter. Returns "dd/MM/yyyy" via UtilsService or US-locale string.
 * @class
 */
export declare class DateFilter extends FilterStrategy {
    utils: TemplateUtils | null | undefined;
    constructor(utils?: TemplateUtils | null);
    getName(): string;
    getDescription(): string;
    execute(value: unknown): string;
    /**
     * @description Formats a Date as dd/MM/yyyy using only arithmetic (no locale).
     * @param {Date} date Valid Date instance.
     * @returns {string} Zero-padded dd/MM/yyyy string.
     * @private
     */
    static _formatDDMMYYYY(date: Date): string;
}
/**
 * @description Number formatter. Applies locale-specific formatting with optional fixed decimals.
 * @class
 */
export declare class NumberFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(value: unknown, decimals?: string | number): string;
}
/**
 * @description Array aggregator. Joins elements with a separator, optionally extracting a specific key. Includes prototype pollution protection.
 * @class
 */
export declare class JoinFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    /**
     * @description Security guard against prototype pollution.
     * @param {string} key Property key.
     * @returns {boolean} True if restricted.
     * @private
     */
    _isDangerousKey(key: string | null | undefined): key is "constructor" | "__proto__" | "prototype";
    execute(array: unknown, key?: string | null, separator?: string): string;
}
/**
 * @description Conditional string selector. Returns singular or plural form based on a numeric count.
 * @class
 */
export declare class PluralizeFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    execute(number: unknown, singular: unknown, plural: unknown): unknown;
}
/**
 * @description Array filter. Returns elements where the specified property matches a value. Includes prototype pollution protection.
 * @class
 */
export declare class WhereFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    _isDangerousKey(key: string | null | undefined): key is "constructor" | "__proto__" | "prototype";
    execute<T>(array: T[], key: string, value?: unknown): T[];
    execute(array: unknown, key: string, value?: unknown): unknown[];
}
/**
 * @description Array filter. Returns elements where the specified property does not match a value. Includes prototype pollution protection.
 * @class
 */
export declare class ExcludeFilter extends FilterStrategy {
    getName(): string;
    getDescription(): string;
    _isDangerousKey(key: string | null | undefined): key is "constructor" | "__proto__" | "prototype";
    execute<T>(array: T[], key: string, value?: unknown): T[];
    execute(array: unknown, key: string, value?: unknown): unknown[];
}
/**
 * @description Factory function that instantiates and returns all core built-in filter strategies.
 * @param {UtilsService} [utils] Optional utility service for date formatting.
 * @returns {FilterStrategy[]} Collection of core filter instances.
 */
export declare function createBuiltInFilters(utils?: TemplateUtils): (SortFilter | UppercaseFilter | LowercaseFilter | UncapitalizeFilter | CapitalizeFilter | DateFilter | NumberFilter | JoinFilter | PluralizeFilter | WhereFilter | ExcludeFilter)[];
