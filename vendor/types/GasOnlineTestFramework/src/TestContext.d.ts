import { SampleSpreadsheetBuilder } from './SampleSpreadsheetBuilder.js';
interface FolderLookup<Folder> {
    getFoldersByName(name: string): {
        hasNext(): boolean;
        next(): Folder;
    };
    createFolder(name: string): Folder;
}
interface FolderFiles {
    getFilesByName(name: string): {
        hasNext(): boolean;
        next(): Pick<GoogleAppsScript.Drive.File, 'getId'> | null;
    };
}
interface Removable {
    remove(): unknown;
}
interface ResetSheet {
    setName(name: string): unknown;
    getProtections(type: GoogleAppsScript.Spreadsheet.ProtectionType): Removable[];
    clear(): ResetSheet;
    clearContents(): ResetSheet;
    clearFormats(): ResetSheet;
    clearNotes(): ResetSheet;
}
interface ResetSpreadsheet {
    getProtections(type: GoogleAppsScript.Spreadsheet.ProtectionType): Removable[];
    getNamedRanges(): Removable[];
    getSheets(): ResetSheet[];
    insertSheet?(name: string): unknown;
    deleteSheet(sheet: ResetSheet): unknown;
}
/**
 * Resource manager for online test execution, maintaining persistent Google Drive artifacts to optimize quota usage and execution speed.
 * @class
 */
export declare class TestContext {
    TEST_ROOT_NAME: string;
    TEST_SS_NAME: string;
    TEST_DOC_NAME: string;
    _rootFolder: GoogleAppsScript.Drive.Folder | null;
    _spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | null;
    _document: GoogleAppsScript.Document.Document | null;
    constructor();
    /**
     * Resolves or creates the dedicated Drive folder for test artifact storage.
     * @returns {GoogleAppsScript.Drive.Folder} Persistent test root.
     */
    getRootFolder(): GoogleAppsScript.Drive.Folder;
    /**
     * Resolves or creates a Drive folder by name, so repeated online-test runs reuse the same
     * artifact instead of minting a new one every run (ref ALDO_GLF_AUDIT_RESULTS.md K-1).
     * @param {string} name Folder name to look up or create.
     * @param {GoogleAppsScript.Drive.Folder|null} [parentFolder=null] Scope the lookup/creation to
     *   this folder; defaults to Drive root when omitted.
     * @returns {GoogleAppsScript.Drive.Folder} The existing or newly-created folder.
     */
    getOrCreateNamedFolder<Folder>(name: string, parentFolder: FolderLookup<Folder>): Folder;
    getOrCreateNamedFolder(name: string, parentFolder?: null): GoogleAppsScript.Drive.Folder;
    /**
     * Resolves or creates the primary Spreadsheet artifact for persistence testing.
     * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Persistent test spreadsheet.
     */
    getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet;
    /**
     * Resolves or creates a Spreadsheet by name, so repeated online-test runs reuse the same
     * artifact instead of minting (and never cleaning up) a new one every run — the capability
     * `SpreadsheetApp.create` alone doesn't provide (ref ALDO_GLF_AUDIT_RESULTS.md K-1).
     * @param {string} name Spreadsheet file name to look up or create.
     * @param {GoogleAppsScript.Drive.Folder|null} [parentFolder=null] Scope the lookup to this
     *   folder, and move a newly-created spreadsheet into it; when omitted the lookup scans all of
     *   Drive by name and a new spreadsheet is left wherever `SpreadsheetApp.create` places it.
     * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} The existing or newly-created spreadsheet.
     */
    getOrCreateNamedSpreadsheet(name: string, parentFolder?: FolderFiles | null): GoogleAppsScript.Spreadsheet.Spreadsheet;
    /**
     * Resolves or creates the primary Google Doc artifact for template testing.
     * @returns {GoogleAppsScript.Document.Document} Persistent test document.
     */
    getDocument(): GoogleAppsScript.Document.Document;
    /**
     * Restores a spreadsheet to a baseline state by purging protections, named ranges, and additional tabs.
     * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] target spreadsheet (defaults to persistent instance).
     */
    resetSpreadsheet(ss?: ResetSpreadsheet): void;
    /**
     * @description Gets-or-creates a named spreadsheet, resets it to a clean single-sheet
     * baseline, and wraps it in a {@link SampleSpreadsheetBuilder} for add-sheet/append-row
     * sample-data construction (ref ALDO_GLF_AUDIT_RESULTS.md K-1 reuse-by-name pattern).
     * @param {string} name Spreadsheet file name to look up or create.
     * @param {GoogleAppsScript.Drive.Folder|null} [parentFolder=null] Scope as in {@link getOrCreateNamedSpreadsheet}.
     * @returns {SampleSpreadsheetBuilder}
     */
    buildSampleSpreadsheet(name: string, parentFolder?: FolderFiles | null): SampleSpreadsheetBuilder<GoogleAppsScript.Spreadsheet.Spreadsheet>;
    /**
     * Opens an existing spreadsheet by ID, resets it to a clean single-sheet baseline,
     * and wraps it in a {@link SampleSpreadsheetBuilder} for sample-data construction.
     * @param {string} spreadsheetId Existing spreadsheet ID.
     * @returns {SampleSpreadsheetBuilder}
     */
    buildSampleSpreadsheetById(spreadsheetId: string): SampleSpreadsheetBuilder<GoogleAppsScript.Spreadsheet.Spreadsheet>;
    /**
     * Restores the test document to a baseline state by clearing all body content.
     */
    resetDocument(): void;
    /**
     * @description Body.clear() can throw "Can't remove the last paragraph in a
     * document section" when the body's last child isn't a plain Paragraph -
     * e.g. a ListItem left behind by a prior test's native list-loop expansion
     * (Paragraph.copy()/insertListItem() on this persistent, reused test doc).
     * Append a fresh empty paragraph first so clear() always has a real
     * Paragraph to collapse the body down to, then retry.
     * @param {GoogleAppsScript.Document.Body} body
     * @private
     */
    _clearBodySafely(body: GoogleAppsScript.Document.Body): void;
    /**
     * Orchestrates a full state reset across all persistent test artifacts.
     */
    resetAll(): void;
    /**
     * Routes diagnostic messages to the environment-appropriate output.
     * @private
     * @param {string} message Diagnostic content.
     */
    _log(message: string): void;
}
export declare const testContext: TestContext;
export {};
