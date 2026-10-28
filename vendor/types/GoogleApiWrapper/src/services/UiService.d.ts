import type { UiBackend } from '../builders/UiContracts.js';
import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
/**
 * @file GoogleApiWrapper/src/services/UiService.js
 * @description Unified UI service facade for Google Apps Script UI operations
 * @version 1.0 - Initial implementation
 */
import { GoogleService } from '../internal/core/GoogleService.js';
import { MenuBuilder } from '../builders/MenuBuilder.js';
import { SidebarBuilder } from '../builders/SidebarBuilder.js';
import { DialogBuilder } from '../builders/DialogBuilder.js';
/**
 * @class UiService
 * @extends GoogleService
 * @description Unified facade for Google Apps Script UI operations. Abstracts host-specific getUi() calls (Sheets, Docs, Forms, Slides) and provides fluent builders for menus, sidebars, and modal dialogs.
 *
 * @property {UiBackend} _ui Native GAS UI object.
 */
export declare class UiService extends GoogleService {
    _ui: UiBackend;
    /**
     * @description Initializes UiService with host auto-detection or explicit UI provider.
     * @param {LoggerService} logger Diagnostic logger.
     * @param {Cache} cache Persistence provider.
     * @param {UtilsService} utils Foundational utilities.
     * @param {ExceptionService} exceptionService Resiliency provider.
     * @param {Object} [uiObject=null] Explicit UI object for testing or overriding detection.
     * @throws {Error} If no UI context is detected.
     */
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: object, exceptionService: GoogleRetryExecutor, uiObject?: UiBackend | null);
    /**
     * @private
     * @description Probes global host applications (SpreadsheetApp, DocumentApp, FormApp, SlidesApp) to resolve the active UI object.
     * @returns {UiBackend|null} Detected UI object.
     */
    _detectUiObject(): GoogleAppsScript.Base.Ui | null;
    /**
     * @description Factory for fluent menu construction.
     * @param {string} caption Label displayed in the UI menu bar.
     * @returns {MenuBuilder} Chained builder instance.
     */
    createMenu(caption: string): MenuBuilder;
    /**
     * @description Synchronous execution of a standard alert dialog.
     * @param {string} title Dialog header.
     * @param {string} message Dialog body.
     * @param {GoogleAppsScript.Base.ButtonSet} [buttonSet] Configuration of buttons to display.
     * @returns {GoogleAppsScript.Base.Button} Button identifier clicked by the user.
     */
    alert(title: string, message: string, buttonSet?: unknown): unknown;
    /**
     * @description Synchronous execution of an input prompt dialog.
     * @param {string} title Dialog header.
     * @param {string} message Instruction text.
     * @param {GoogleAppsScript.Base.ButtonSet} [buttonSet] Configuration of buttons to display.
     * @returns {GoogleAppsScript.Base.PromptResponse} Object containing the selected button and input text.
     */
    prompt(title: string, message: string, buttonSet?: unknown): {
        getResponseText(): string;
        getSelectedButton(): unknown;
    };
    /**
     * @description Factory for fluent HTML sidebar construction.
     * @returns {SidebarBuilder} Chained builder instance.
     */
    createSidebar(): SidebarBuilder;
    /**
     * @description Factory for fluent modal HTML dialog construction.
     * @returns {DialogBuilder} Chained builder instance.
     */
    createDialog(): DialogBuilder;
    /**
     * @description Direct accessor for the underlying GAS UI object.
     * @returns {UiBackend}
     */
    getNativeUi(): UiBackend;
    /**
     * @description Map of native UI Button constants.
     * @returns {GoogleAppsScript.Base.Button}
     */
    get Button(): Partial<Record<"OK" | "CLOSE" | "CANCEL" | "YES" | "NO", unknown>>;
    /**
     * @description Map of native UI ButtonSet constants.
     * @returns {GoogleAppsScript.Base.ButtonSet}
     */
    get ButtonSet(): Partial<Record<"OK" | "OK_CANCEL" | "YES_NO" | "YES_NO_CANCEL", unknown>>;
}
