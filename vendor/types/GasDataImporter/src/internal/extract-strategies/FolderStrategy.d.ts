import type { FolderData } from '../../types.js';
import type { ImportRow, ImporterLogger, SourceOptions, ImporterSheets, ImporterDrive } from '../../types.js';
/**
 * @fileoverview Source strategy for extracting data from all Google Sheets in a folder
 * @author GasLibraryFactory
 */
import { SourceStrategy } from './SourceStrategy.js';
/**
 * Extraction strategy for bulk-processing all Google Sheets within a target Drive folder, supporting regex filtering and metadata tracking.
 * @class
 * @extends SourceStrategy
 */
declare class FolderStrategy extends SourceStrategy {
    extract: {
        (config: SourceOptions & {
            mergeData: false;
        }): FolderData[];
        (config: SourceOptions): ImportRow[];
    };
    _driveService: ImporterDrive;
    _spreadsheetService: ImporterSheets;
    /**
     * Initializes folder extraction strategy with Drive and Spreadsheet service facades.
     * @param {Object} logger Diagnostic output interface.
     * @param {Object} driveService GoogleApiWrapper DriveService for folder traversal.
     * @param {Object} spreadsheetService GoogleApiWrapper SpreadsheetService for data extraction.
     */
    constructor(logger: ImporterLogger, driveService: ImporterDrive, spreadsheetService: ImporterSheets);
    /**
     * Implements multi-file extraction logic, traversing the folder and aggregating rows from matching spreadsheets.
     * @protected
     * @param {Object} config Extraction parameters.
     * @param {string} config.folderId physical Drive folder identifier.
     * @param {string} [config.fileNamePattern] Regex for filtering file names.
     * @param {boolean} [config.mergeData=true] If true, flattens all rows into a single array.
     * @returns {Array<Object>|Array<{fileName:string, fileId:string, data:Object[]}>} Aggregated data collection.
     * @throws {SourceError} If folder is inaccessible or regex is malformed.
     */
    _extractData(config: SourceOptions): (ImportRow | {
        fileName: string;
        fileId: string;
        data: ImportRow[];
    })[];
    /**
     * Executes the extraction workflow for a single spreadsheet file within the folder.
     * @private
     * @param {string} fileId spreadsheet identifier.
     * @param {string} fileName Semantic file name for logging.
     * @param {string} range A1 notation or empty for full sheet.
     * @param {string} [tabName] Target tab identifier.
     * @param {boolean} hasHeaders If true, treats first row as property keys.
     * @param {boolean} includeSourceFile If true, injects file metadata into each row.
     * @returns {Array<Object>} Hydrated row objects from the file.
     * @throws {SourceError} If the file contains no sheets or target tab is missing.
     */
    _extractFromFile(fileId: string, fileName: string, range: string, tabName: string | undefined, hasHeaders: boolean, includeSourceFile: boolean): ImportRow[];
}
export { FolderStrategy };
