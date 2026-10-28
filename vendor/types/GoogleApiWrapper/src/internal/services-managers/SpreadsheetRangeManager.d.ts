type RangeValues = {
    range: string;
    values?: unknown[][];
};
import type { SpreadsheetService } from '../../services/SpreadsheetService.js';
/**
 * @file GoogleApiWrapper/src/services/managers/SpreadsheetRangeManager.js
 * @description Manager for spreadsheet value and range operations.
 */
export declare class SpreadsheetRangeManager {
    facade: SpreadsheetService;
    _logger: SpreadsheetService['_logger'];
    _lastError: unknown;
    constructor(facade: SpreadsheetService);
    updateRanges(spreadsheetId: string, updates: RangeValues | RangeValues[], options?: {
        dryRun?: boolean;
        valueInputOption?: string;
        majorDimension?: string;
    }): {
        totalUpdatedCells: number;
        totalUpdatedRows: number;
        totalUpdatedColumns: number;
        totalUpdatedSheets: number;
        responses: {
            spreadsheetId: string;
            updatedRange: string;
        }[];
        dryRun: boolean;
    } | {
        totalUpdatedCells: number | undefined;
        totalUpdatedRows: number | undefined;
        totalUpdatedColumns: number | undefined;
        totalUpdatedSheets: number | undefined;
        responses: GoogleAppsScript.Sheets.Schema.UpdateValuesResponse[] | undefined;
        dryRun?: undefined;
    };
    getRanges(spreadsheetId: string, ranges: string, options?: {
        majorDimension?: string;
        valueRenderOption?: string;
        dateTimeRenderOption?: string;
    }): unknown[][];
    getRanges(spreadsheetId: string, ranges: string[], options?: {
        majorDimension?: string;
        valueRenderOption?: string;
        dateTimeRenderOption?: string;
    }): Record<string, unknown[][]>;
    appendRows(spreadsheetId: string, appends: RangeValues | RangeValues[], options?: {
        dryRun?: boolean;
        valueInputOption?: string;
        majorDimension?: string;
    }): {
        totalUpdatedCells: number;
        totalUpdatedRows: number;
        successful: {
            id: string;
            status: number;
            data: {
                updates: {
                    updatedCells: number;
                    updatedRows: number;
                };
            };
        }[];
        failed: never[];
        dryRun: boolean;
    } | {
        totalUpdatedCells: number;
        totalUpdatedRows: number;
        successful: {
            id: string;
            status: number;
            data: {
                updates: {
                    updatedCells: number;
                    updatedRows: number;
                    range: string;
                };
            };
        }[];
        failed: never[];
        dryRun?: undefined;
    };
    insertRow(spreadsheetId: string, sheetName: string, rowData: unknown[], options?: {
        dryRun?: boolean;
        valueInputOption?: string;
        majorDimension?: string;
    }): {
        totalUpdatedCells: number;
        totalUpdatedRows: number;
        successful: {
            id: string;
            status: number;
            data: {
                updates: {
                    updatedCells: number;
                    updatedRows: number;
                };
            };
        }[];
        failed: never[];
        dryRun: boolean;
    } | {
        totalUpdatedCells: number;
        totalUpdatedRows: number;
        successful: {
            id: string;
            status: number;
            data: {
                updates: {
                    updatedCells: number;
                    updatedRows: number;
                    range: string;
                };
            };
        }[];
        failed: never[];
        dryRun?: undefined;
    };
    getLastError(): {} | null;
    clearRanges(spreadsheetId: string, ranges: string | string[], options?: {
        dryRun?: boolean;
        valueInputOption?: string;
        majorDimension?: string;
    }): {
        clearedRanges: string[];
        dryRun: boolean;
    } | {
        clearedRanges: string[];
        dryRun?: undefined;
    };
}
export {};
