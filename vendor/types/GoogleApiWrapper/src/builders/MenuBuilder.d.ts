import type { GoogleLogger } from '../internal/core/GoogleService.js';
/**
 * @file GoogleApiWrapper/src/utils/MenuBuilder.js
 * @description Fluent builder for creating Google Apps Script menus
 * @version 1.0 - Initial implementation
 */
/**
 * @class MenuBuilder
 * @description Fluent builder for GAS UI menus. Wraps native Menu API to provide chainable addition of items, separators, and nested submenus. Decouples menu structure definition from native UI commitment.
 *
 * @property {GoogleAppsScript.Base.Ui} _ui Native GAS UI provider.
 * @property {GoogleAppsScript.Base.Menu} _menu Current native menu object.
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {string} _caption Menu header label.
 */
export declare class MenuBuilder {
    _ui: Pick<GoogleAppsScript.Base.Ui, 'createMenu'>;
    _logger: Pick<GoogleLogger, 'debug'>;
    _menu: GoogleAppsScript.Base.Menu;
    _caption: string;
    /**
     * @description Initializes MenuBuilder and provisions a native Menu instance.
     * @param {GoogleAppsScript.Base.Ui} ui Native GAS UI object.
     * @param {string} caption Menu header label.
     * @param {LoggerService} logger Diagnostic logger.
     * @throws {Error} If ui, caption, or logger is missing.
     */
    constructor(ui: Pick<GoogleAppsScript.Base.Ui, 'createMenu'>, caption: string, logger: Pick<GoogleLogger, 'debug'>);
    /**
     * @description Appends a command item to the menu. Requires a globally-scoped handler function.
     * @param {string} caption Item display label.
     * @param {string} functionName Name of the global function to execute.
     * @returns {MenuBuilder} Current instance for chaining.
     * @throws {Error} On invalid caption or functionName.
     */
    addItem(caption: string, functionName: string): this;
    /**
     * @description Appends a visual horizontal divider.
     * @returns {MenuBuilder} Current instance for chaining.
     */
    addSeparator(): this;
    /**
     * @description Nestles another menu hierarchy within the current menu.
     * @param {MenuBuilder} subMenuBuilder Pre-configured builder for the submenu.
     * @returns {MenuBuilder} Current instance for chaining.
     * @throws {Error} If subMenuBuilder is not a valid MenuBuilder.
     */
    addSubMenu(subMenuBuilder: MenuBuilder): this;
    /**
     * @description Commits the builder state to the host UI. Mandatory final operation.
     */
    addToUi(): void;
    /**
     * @description Returns the configured native GAS Menu object.
     * @returns {GoogleAppsScript.Base.Menu}
     */
    getNativeMenu(): GoogleAppsScript.Base.Menu;
}
