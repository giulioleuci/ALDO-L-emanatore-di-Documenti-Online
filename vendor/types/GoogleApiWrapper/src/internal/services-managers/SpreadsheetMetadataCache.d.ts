import type { SpreadsheetService } from '../../services/SpreadsheetService.js';
/**
 * @file GoogleApiWrapper/src/services/managers/SpreadsheetMetadataCache.js
 * @description Manager for spreadsheet metadata retrieval and in-memory caching.
 */
export declare class SpreadsheetMetadataCache {
    facade: SpreadsheetService;
    _logger: SpreadsheetService['_logger'];
    _sheetIdCache: Record<string, GoogleAppsScript.Sheets.Schema.Sheet[]>;
    constructor(facade: SpreadsheetService);
    getSpreadsheetMetadata(spreadsheetId: string, options?: {
        fields?: string;
    }): GoogleAppsScript.Sheets.Schema.Spreadsheet;
    getSheetInfo(spreadsheetId: string, options?: {
        includeHidden?: boolean;
    }): {
        name: string | undefined;
        sheetId: number | undefined;
        index: number | undefined;
        hidden: boolean;
        gridProperties: GoogleAppsScript.Sheets.Schema.GridProperties;
    }[];
    _getCachedSheetMetadata(spreadsheetId: string): GoogleAppsScript.Sheets.Schema.Sheet[];
    _clearSheetMetadataCache(spreadsheetId: string): void;
    _parseRangeToGridRange(rangeA1: string, sheets: GoogleAppsScript.Sheets.Schema.Sheet[]): GoogleAppsScript.Sheets.Schema.GridRange;
    _parseCell(cellRef: string): {
        row: number;
        col: number;
    };
    _columnToIndex(column: string): number;
}
