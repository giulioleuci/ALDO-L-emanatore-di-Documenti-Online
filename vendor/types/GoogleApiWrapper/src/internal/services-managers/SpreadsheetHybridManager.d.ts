import type { SpreadsheetService } from '../../services/SpreadsheetService.js';
/**
 * @file GoogleApiWrapper/src/services/managers/SpreadsheetHybridManager.js
 * @description Manager for hybrid operations and "escape hatch" methods (Standard API).
 */
export declare class SpreadsheetHybridManager {
    facade: SpreadsheetService;
    _logger: SpreadsheetService['_logger'];
    constructor(facade: SpreadsheetService);
    /**
     * @description Creates a new blank spreadsheet via Advanced Sheets API (no template copy required).
     * @param {string} title Spreadsheet title.
     * @param {Object} [options={}] Creation options.
     * @param {string} [options.destinationFolder] Target folder ID; moved there via Advanced Drive API after creation (Sheets API always creates in Drive root).
     * @returns {Object} Advanced Sheets API spreadsheet resource.
     */
    createSpreadsheet(title: string, options?: Pick<GoogleAppsScript.Sheets.Schema.SpreadsheetProperties, 'locale' | 'timeZone' | 'autoRecalc'> & {
        destinationFolder?: string;
        sheets?: GoogleAppsScript.Sheets.Schema.SheetProperties[];
    }): GoogleAppsScript.Sheets.Schema.Spreadsheet;
    openStandard(spreadsheetId: string): GoogleAppsScript.Spreadsheet.Spreadsheet;
    getActiveStandard(): GoogleAppsScript.Spreadsheet.Spreadsheet;
    getStandardApp(): GoogleAppsScript.Spreadsheet.SpreadsheetApp;
    flushBatch(): void;
    _verifyAdvancedSheets(): void;
}
