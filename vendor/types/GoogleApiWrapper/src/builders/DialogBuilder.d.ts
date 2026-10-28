import type { BuilderHtmlOutput, DialogUi } from './UiContracts.js';
import type { GoogleLogger } from '../internal/core/GoogleService.js';
/**
 * @file GoogleApiWrapper/src/utils/DialogBuilder.js
 * @description Fluent builder for creating modal HTML dialogs in Google Apps Script
 * @version 1.0 - Initial implementation
 */
/**
 * @class DialogBuilder
 * @description Fluent builder for GAS modal HTML dialogs. Wraps HtmlService to provision content, dimensions, and titles with chainable operations. Handles automatic conversion from strings or templates to HtmlOutput.
 *
 * @property {GoogleAppsScript.Base.Ui} _ui Native GAS UI provider.
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {GoogleAppsScript.HTML.HtmlOutput|null} _htmlOutput Pending output object.
 * @property {string} _title Dialog header.
 * @property {number|null} _width Width in pixels.
 * @property {number|null} _height Height in pixels.
 */
export declare class DialogBuilder {
    _ui: DialogUi;
    _logger: Pick<GoogleLogger, 'debug'>;
    _htmlOutput: BuilderHtmlOutput | null;
    _title: string;
    _width: number | null;
    _height: number | null;
    /**
     * @description Initializes DialogBuilder with native UI and logging context.
     * @param {GoogleAppsScript.Base.Ui} ui Native GAS UI object.
     * @param {LoggerService} logger Diagnostic logger.
     * @throws {Error} If ui or logger is missing.
     */
    constructor(ui: DialogUi, logger: Pick<GoogleLogger, 'debug'>);
    /**
     * @description Sets the window title.
     * @param {string} title Dialog header text.
     * @returns {DialogBuilder} Current instance for chaining.
     * @throws {Error} On invalid title string.
     */
    setTitle(title: string): this;
    /**
     * @description Maps raw HTML string to the builder's output state.
     * @param {string} html Valid HTML content.
     * @returns {DialogBuilder} Current instance for chaining.
     * @throws {Error} On invalid HTML input.
     */
    setContent(html: string): this;
    /**
     * @description Evaluates an HtmlTemplate and maps result to output state.
     * @param {GoogleAppsScript.HTML.HtmlTemplate} template Template object with scriptlets.
     * @returns {DialogBuilder} Current instance for chaining.
     * @throws {Error} If template is invalid or evaluation fails.
     */
    setContentFromTemplate(template: {
        evaluate(): BuilderHtmlOutput;
    }): this;
    /**
     * @description Overrides default dialog width.
     * @param {number} pixels Positive integer.
     * @returns {DialogBuilder} Current instance for chaining.
     */
    setWidth(pixels: number): this;
    /**
     * @description Overrides default dialog height.
     * @param {number} pixels Positive integer.
     * @returns {DialogBuilder} Current instance for chaining.
     */
    setHeight(pixels: number): this;
    /**
     * @description Renders the dialog in the host UI. Blocks script execution until closed.
     * @throws {Error} If no content was provided prior to call.
     */
    show(): void;
    /**
     * @description Returns the configured HtmlOutput object.
     * @returns {GoogleAppsScript.HTML.HtmlOutput|null}
     */
    getHtmlOutput(): BuilderHtmlOutput | null;
}
