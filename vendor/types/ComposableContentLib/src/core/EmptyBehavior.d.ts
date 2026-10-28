/**
 * @file ComposableContentLib/src/core/EmptyBehavior.js
 * @description Enums for block empty behavior and container types.
 * @version 1.0.0
 */
/**
 * EmptyBehavior - Defines what happens when a block is empty.
 *
 * @readonly
 * @enum {string}
 */
export declare const EmptyBehavior: Readonly<{
    /** Hide the block completely */
    HIDE: "HIDE";
    /** Show a placeholder message */
    SHOW_PLACEHOLDER: "SHOW_PLACEHOLDER";
    /** Show the block with empty content */
    SHOW_EMPTY: "SHOW_EMPTY";
}>;
/**
 * ContainerType - Defines the visual container for a block.
 *
 * @readonly
 * @enum {string}
 */
export declare const ContainerType: Readonly<{
    /** No container wrapper */
    NONE: "NONE";
    /** Simple box container */
    BOX: "BOX";
    /** Card-style container */
    CARD: "CARD";
    /** Section with header */
    SECTION: "SECTION";
}>;
/**
 * OutputFormat - Supported output formats.
 *
 * @readonly
 * @enum {string}
 */
export declare const OutputFormat: Readonly<{
    /** HTML output */
    HTML: "html";
    /** Markdown output */
    MARKDOWN: "markdown";
    /** Plain text output */
    TEXT: "text";
}>;
/**
 * @description Validates if a string strictly matches an EmptyBehavior enum value.
 * @param {string} value Value to evaluate.
 * @returns {boolean} True if present in EmptyBehavior.
 */
export declare function isValidEmptyBehavior(value: unknown): boolean;
/**
 * @description Validates and normalizes a string against ContainerType enum values.
 * @param {string} value Value to evaluate (case-insensitive).
 * @returns {boolean} True if matched.
 */
export declare function isValidContainerType(value: unknown): boolean;
/**
 * @description Validates if a string strictly matches an OutputFormat enum value.
 * @param {string} value Value to evaluate.
 * @returns {boolean} True if present in OutputFormat.
 */
export declare function isValidOutputFormat(value: unknown): boolean;
