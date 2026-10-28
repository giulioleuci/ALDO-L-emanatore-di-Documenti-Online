import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
import { GoogleService } from '../internal/core/GoogleService.js';
import { SpreadsheetRangeManager } from '../internal/services-managers/SpreadsheetRangeManager.js';
import { SpreadsheetGridManager } from '../internal/services-managers/SpreadsheetGridManager.js';
import { SpreadsheetMetadataCache } from '../internal/services-managers/SpreadsheetMetadataCache.js';
import { SpreadsheetHybridManager } from '../internal/services-managers/SpreadsheetHybridManager.js';
/**
 * @class SpreadsheetService
 * @extends GoogleService
 * @description Orchestrator for Google Sheets operations. Implements Facade/Delegation pattern across Range, Grid, Metadata, and Hybrid managers. Optimizes performance via Advanced Sheets API batching and intelligent metadata caching.
 *
 * @property {SpreadsheetMetadataCache} _metadataCache Internal metadata registry.
 * @property {SpreadsheetRangeManager} _rangeManager Logic for cell value mutations.
 * @property {SpreadsheetGridManager} _gridManager Logic for sheet and grid mutations.
 * @property {SpreadsheetHybridManager} _hybridManager Standard API integration logic.
 */
export interface SpreadsheetService extends Pick<SpreadsheetMetadataCache, 'getSpreadsheetMetadata' | 'getSheetInfo' | '_getCachedSheetMetadata' | '_clearSheetMetadataCache' | '_parseRangeToGridRange' | '_parseCell' | '_columnToIndex'>, Pick<SpreadsheetRangeManager, 'updateRanges' | 'getRanges' | 'appendRows' | 'insertRow' | 'getLastError' | 'clearRanges'>, Pick<SpreadsheetGridManager, 'formatRanges' | 'setColumnWidths' | 'createSheets' | 'deleteSheets' | 'deleteRow' | 'deleteColumn' | 'deleteRows' | 'expandSheetGrid' | 'getProtectedRanges' | 'deleteProtectedRanges' | 'protectRanges'>, Pick<SpreadsheetHybridManager, 'createSpreadsheet' | 'openStandard' | 'getActiveStandard' | 'getStandardApp' | 'flushBatch' | '_verifyAdvancedSheets'> {
}
export declare class SpreadsheetService extends GoogleService {
    _cachePrefix: string;
    _cacheExpirationTime: number;
    _dryRun: boolean;
    _metadataCache: SpreadsheetMetadataCache;
    _rangeManager: SpreadsheetRangeManager;
    _gridManager: SpreadsheetGridManager;
    _hybridManager: SpreadsheetHybridManager;
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: object, exceptionService: GoogleRetryExecutor, options?: {
        dryRun?: boolean;
    });
    /**
     * @private
     * @description Resolves dry-run status for current operation.
     * @param {Object} [options={}] Operation-level dryRun override.
     * @returns {boolean}
     */
    _isDryRun(options?: {
        dryRun?: boolean;
    }): boolean;
}
