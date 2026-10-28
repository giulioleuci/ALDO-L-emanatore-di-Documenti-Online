/**
 * @file GoogleApiWrapper/src/services/DriveService.js
 * @description BATCH-FIRST Drive Service with Advanced Drive API
 * Version 3.0 - GAW-HIGH-001 Implementation
 *
 * BREAKING CHANGES:
 * - All methods use Advanced Drive API exclusively (no DriveApp fallback)
 * - All mutation methods accept single items OR arrays for batch operations
 * - Methods return detailed per-item results for batch operations
 * - Requires Drive Advanced Service to be enabled in appsscript.json
 *
 * @version 3.0 - Batch operations with Advanced Drive API
 */
import { GoogleService } from '../internal/core/GoogleService.js';
import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
import type { DriveOptions } from './drive/types.js';
import { DriveFileManager } from './drive/DriveFileManager.js';
import { DriveFolderManager } from './drive/DriveFolderManager.js';
import { DriveShortcutHandler } from './drive/DriveShortcutHandler.js';
import { DriveMetadataService } from './drive/DriveMetadataService.js';
export interface DriveService extends Pick<DriveFileManager, 'deleteFiles' | 'restoreFiles' | 'copyFiles' | 'moveFiles' | 'renameFiles' | 'getFileByIdStandard'>, Pick<DriveFolderManager, 'createFolder' | 'getFolderByIdStandard'>, Pick<DriveShortcutHandler, 'createShortcut' | 'getTargetId' | 'isShortcut'>, Pick<DriveMetadataService, 'updateMetadata' | 'getFiles' | 'getPermissions' | 'searchFiles' | 'getFileOwnerEmail'> {
}
/**
 * @class DriveService
 * @extends GoogleService
 * @description Batch-first Google Drive facade. Orchestrates file, folder, shortcut, and metadata operations using Advanced Drive API v2. Supports dry-run simulations and automated retry logic.
 *
 * @property {DriveFileManager} fileManager Logic for file mutations.
 * @property {DriveFolderManager} folderManager Logic for folder mutations.
 * @property {DriveShortcutHandler} shortcutHandler Logic for shortcut processing.
 * @property {DriveMetadataService} metadataService Logic for metadata and search.
 */
export declare class DriveService extends GoogleService<{
    generateUuid(): string;
}> {
    _cachePrefix: string;
    _cacheExpirationTime: number;
    _dryRun: boolean;
    fileManager: DriveFileManager;
    folderManager: DriveFolderManager;
    shortcutHandler: DriveShortcutHandler;
    metadataService: DriveMetadataService;
    /**
     * Prefix for simulated file IDs in dry-run mode.
     * @type {string}
     */
    static get DRY_RUN_ID_PREFIX(): string;
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: {
        generateUuid(): string;
    }, exceptionService: GoogleRetryExecutor, options?: DriveOptions);
    /**
     * @private
     * @description Resolves dry-run status for current operation.
     * @param {Object} [options={}] Operation-level dryRun override.
     * @returns {boolean}
     */
    _isDryRun(options?: DriveOptions): boolean;
    /**
     * @private
     * @description Creates a collision-resistant simulated ID for dry-run mutations.
     * @returns {string}
     */
    _generateDryRunId(): string;
    /**
     * @description Returns the global DriveApp object for enum and static access.
     * @returns {GoogleAppsScript.Drive.DriveApp}
     */
    getStandardApp(): GoogleAppsScript.Drive.DriveApp;
}
