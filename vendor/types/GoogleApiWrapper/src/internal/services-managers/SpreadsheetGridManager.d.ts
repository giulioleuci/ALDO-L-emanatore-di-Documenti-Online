type ColumnWidth = {
    sheetName: string;
    startColumn: number;
    endColumn: number;
    width: number;
};
type RangeProtection = {
    range: string;
    description?: string;
    warningOnly?: boolean;
    editors?: GoogleAppsScript.Sheets.Schema.Editors;
};
import type { SpreadsheetService } from '../../services/SpreadsheetService.js';
/**
 * @file GoogleApiWrapper/src/services/managers/SpreadsheetGridManager.js
 * @description Manager for structural and formatting changes (sheets, widths, formats, protections).
 */
/**
 * Manages structural and formatting changes for Google Sheets grids.
 */
export declare class SpreadsheetGridManager {
    facade: SpreadsheetService;
    _logger: SpreadsheetService['_logger'];
    constructor(facade: SpreadsheetService);
    formatRanges(spreadsheetId: string, formatRequests: {
        range: string;
        format: GoogleAppsScript.Sheets.Schema.CellFormat;
    } | {
        range: string;
        format: GoogleAppsScript.Sheets.Schema.CellFormat;
    }[], options?: {
        dryRun?: boolean;
        globalEditors?: GoogleAppsScript.Sheets.Schema.Editors;
        onError?: string;
    }): {
        updatedSpreadsheet: string;
        replies: {}[];
        dryRun: boolean;
    } | {
        updatedSpreadsheet: string | undefined;
        replies: GoogleAppsScript.Sheets.Schema.Response[] | undefined;
        dryRun?: undefined;
    };
    setColumnWidths(spreadsheetId: string, widthRequests: ColumnWidth | ColumnWidth[], _options?: {
        dryRun?: boolean;
        globalEditors?: GoogleAppsScript.Sheets.Schema.Editors;
        onError?: string;
    }): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse;
    createSheets(spreadsheetId: string, sheetRequests: GoogleAppsScript.Sheets.Schema.SheetProperties | GoogleAppsScript.Sheets.Schema.SheetProperties[], options?: {
        dryRun?: boolean;
        globalEditors?: GoogleAppsScript.Sheets.Schema.Editors;
        onError?: string;
    }): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse | {
        spreadsheetId: string;
        replies: {
            addSheet: {
                properties: {
                    sheetId: string;
                    title: string | undefined;
                    index: number;
                };
            };
        }[];
        dryRun: boolean;
    };
    deleteSheets(spreadsheetId: string, sheetIds: number | string | (number | string)[], options?: {
        dryRun?: boolean;
        globalEditors?: GoogleAppsScript.Sheets.Schema.Editors;
        onError?: string;
    }): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse | {
        spreadsheetId: string;
        replies: {}[];
        dryRun: boolean;
    };
    deleteRow(spreadsheetId: string, sheetName: string, rowIndex: number): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse;
    /**
     * Deletes one column using a one-based column index.
     * @param {string} spreadsheetId Spreadsheet identifier.
     * @param {string} sheetName Target sheet title.
     * @param {number} columnIndex One-based column index to delete.
     * @returns {*} Sheets batch-update result.
     */
    deleteColumn(spreadsheetId: string, sheetName: string, columnIndex: number): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse;
    deleteRows(spreadsheetId: string, sheetName: string, rowIndices: number[] | null | undefined): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse | null;
    expandSheetGrid(spreadsheetId: string, sheetId: number, rowCount: number, columnCount: number): GoogleAppsScript.Sheets.Schema.BatchUpdateSpreadsheetResponse;
    getProtectedRanges(spreadsheetId: string, sheetName?: string | null): {
        id?: number;
        range?: GoogleAppsScript.Sheets.Schema.GridRange;
        description: string;
        editors: GoogleAppsScript.Sheets.Schema.Editors;
        sheetId?: number;
        sheetName?: string;
        warningOnly: boolean;
    }[];
    deleteProtectedRanges(spreadsheetId: string, protectedRangeIds: number | number[]): {
        spreadsheetId: string | undefined;
        deletedCount: number;
        replies: GoogleAppsScript.Sheets.Schema.Response[] | undefined;
    };
    protectRanges(spreadsheetId: string, protectionRequests: RangeProtection | RangeProtection[], options?: {
        dryRun?: boolean;
        globalEditors?: GoogleAppsScript.Sheets.Schema.Editors;
        onError?: string;
    }): {
        spreadsheetId: string;
        protectedCount: number;
        protectedRangeIds: (number | undefined)[];
        replies: GoogleAppsScript.Sheets.Schema.Response[];
        failures: {
            request: RangeProtection;
            message: string;
        }[];
    } | {
        spreadsheetId: string | undefined;
        protectedCount: number;
        protectedRangeIds: (number | undefined)[];
        replies: GoogleAppsScript.Sheets.Schema.Response[] | undefined;
        failures?: undefined;
    };
}
export {};
