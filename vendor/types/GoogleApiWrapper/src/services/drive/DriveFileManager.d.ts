import type { DriveFacade, DriveOptions, DriveFile, DriveBatchResult, CopyRequest, MoveRequest, RenameRequest } from './types.js';
/**
 * @file GoogleApiWrapper/src/services/DriveFileManager.js
 * @description Encapsulates file-level operations for DriveService.
 */
export declare class DriveFileManager {
    facade: Pick<DriveFacade, '_logger' | '_cache' | '_utils' | '_exceptionService' | '_cachePrefix' | '_cacheExpirationTime' | '_isDryRun' | '_generateDryRunId' | '_generateCacheKey'>;
    _logger: DriveFacade['_logger'];
    _cache: DriveFacade['_cache'];
    _utils: DriveFacade['_utils'];
    _exceptionService: DriveFacade['_exceptionService'];
    _cachePrefix: DriveFacade['_cachePrefix'];
    _cacheExpirationTime: DriveFacade['_cacheExpirationTime'];
    _isDryRun: DriveFacade['_isDryRun'];
    _generateDryRunId: DriveFacade['_generateDryRunId'];
    _generateCacheKey: DriveFacade['_generateCacheKey'];
    constructor(facade: Pick<DriveFacade, '_logger' | '_cache' | '_utils' | '_exceptionService' | '_cachePrefix' | '_cacheExpirationTime' | '_isDryRun' | '_generateDryRunId' | '_generateCacheKey'>);
    /**
     * @description Deletes or trashes files/folders. Supports single ID or batch array. Automates per-item retry and cache invalidation.
     * @param {string|string[]} fileIds Resource ID(s) to process.
     * @param {Object} [options={}] Operation settings.
     * @param {boolean} [options.permanently=false] Skip trash (irreversible).
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On invalid input.
     */
    deleteFiles(fileIds: string | string[], options?: DriveOptions & {
        permanently?: boolean;
    }): DriveBatchResult<null>;
    /**
     * @description Restores files/folders from trash. Supports single ID or batch array. Automates per-item retry and cache invalidation.
     * @param {string|string[]} fileIds Resource ID(s) to restore.
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     */
    restoreFiles(fileIds: string | string[], options?: DriveOptions): DriveBatchResult<null>;
    /**
     * @description Copies files via Advanced Drive API. Supports single request or batch array. Note: Does not support folder copying.
     * @param {Object|Object[]} copyRequests Collection of {fileId, name, destinationFolder}.
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On invalid request format.
     */
    copyFiles(copyRequests: CopyRequest | CopyRequest[], options?: DriveOptions): DriveBatchResult<DriveFile>;
    /**
     * @description Moves files/folders to new parents. Implements N+1 optimization by batching parent metadata lookups.
     * @param {Object|Object[]} moveRequests Collection of {fileId, newParent, removeFromOtherParents}.
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On invalid request format.
     */
    moveFiles(moveRequests: MoveRequest | MoveRequest[], options?: DriveOptions): DriveBatchResult<DriveFile>;
    /**
     * @description Renames files/folders via Advanced Drive API. Supports single request or batch array.
     * @param {Object|Object[]} renameRequests Collection of {fileId, newName}.
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On missing names or invalid format.
     */
    renameFiles(renameRequests: RenameRequest | RenameRequest[], options?: DriveOptions): DriveBatchResult<DriveFile>;
    /**
     * @description Accesses file/folder via native DriveApp (standard API). Auto-detects resource type.
     * @param {string} fileId Target resource identifier.
     * @returns {GoogleAppsScript.Drive.File|GoogleAppsScript.Drive.Folder} Native GAS Drive object.
     * @throws {Error} If resource is missing.
     * @throws {Error} If access is denied.
     */
    getFileByIdStandard(fileId: string): GoogleAppsScript.Drive.File | GoogleAppsScript.Drive.Folder;
}
