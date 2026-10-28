import type { DriveFacade, DriveOptions, DriveFile, DrivePermission, DriveBatchResult, MetadataRequest, DriveMetadataOptions, DriveSearchOptions } from './types.js';
/**
 * @file GoogleApiWrapper/src/services/DriveMetadataService.js
 * @description Encapsulates metadata operations for DriveService.
 */
export declare class DriveMetadataService {
    facade: Pick<DriveFacade, '_logger' | '_cache' | '_exceptionService' | '_cachePrefix' | '_cacheExpirationTime' | '_isDryRun' | '_generateCacheKey'>;
    _logger: DriveFacade['_logger'];
    _cache: DriveFacade['_cache'];
    _exceptionService: DriveFacade['_exceptionService'];
    _cachePrefix: DriveFacade['_cachePrefix'];
    _cacheExpirationTime: DriveFacade['_cacheExpirationTime'];
    _isDryRun: DriveFacade['_isDryRun'];
    _generateCacheKey: DriveFacade['_generateCacheKey'];
    constructor(facade: Pick<DriveFacade, '_logger' | '_cache' | '_exceptionService' | '_cachePrefix' | '_cacheExpirationTime' | '_isDryRun' | '_generateCacheKey'>);
    /**
     * @description Batch updates file/folder metadata fields (name, description, starred, properties, etc.). Automates per-item retry and cache invalidation.
     * @param {Object|Object[]} updateRequests Collection of {fileId, metadata}.
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary {successful: Array<{id, status, data}>, failed: Array<{id, status, error}>}.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On invalid request format.
     */
    updateMetadata(updateRequests: MetadataRequest | MetadataRequest[], options?: DriveOptions): DriveBatchResult<DriveFile>;
    /**
     * @description Retrieves file/folder metadata with intelligent caching. Transparently merges cached metadata with batch API results.
     * @param {string|string[]} fileIds Resource ID(s) to fetch.
     * @param {Object} [options={}] Operation settings.
     * @param {string} [options.fields] Comma-separated fields to retrieve (defaults to comprehensive metadata set).
     * @param {boolean} [options.strict=false] Propagate metadata lookup failures instead of returning null for failed IDs.
     * @returns {Object|Object<string, Object>} Metadata object (single) or ID-to-Metadata map (batch).
     * @throws {Error} On execution failure.
     */
    getFiles(fileIds: string, options?: DriveMetadataOptions): DriveFile | null;
    getFiles(fileIds: string[], options?: DriveMetadataOptions): Record<string, DriveFile | null>;
    getFiles(fileIds: string | string[], options?: DriveMetadataOptions): DriveFile | null | Record<string, DriveFile | null>;
    /**
     * @description Reads current Drive permissions for one or more files/folders.
     * This uncached evidence API always hits Drive, preserves raw permission
     * records, follows pagination, and propagates auth/quota/network errors.
     * @param {string|string[]} fileIds Resource ID(s) whose permissions must be read back.
     * @returns {Object[]|Object<string, Object[]>} Permission records for one ID, or an ID map.
     * @throws {Error} On any Drive permission lookup failure.
     */
    getPermissions(fileIds: string): DrivePermission[];
    getPermissions(fileIds: string[]): Record<string, DrivePermission[]>;
    getPermissions(fileIds: string | string[]): DrivePermission[] | Record<string, DrivePermission[]>;
    /**
     * @description Returns the email address of a Drive file's owner, reusing `getFiles`'
     * caching/retry behaviour (the `owners` field is already part of its default field set).
     * @param {string} fileId Resource ID.
     * @returns {string|null} Owner email, or null when no owner is present (e.g. a Shared Drive file).
     * @throws {Error} On execution failure.
     */
    getFileOwnerEmail(fileId: string): string | null | undefined;
    /**
     * @description Performs paginated file search using Google Drive Query Language.
     * @param {string} query Search query string.
     * @param {Object} [options={}] Operation settings.
     * @param {number} [options.maxResults=Infinity] Upper bound for result count.
     * @param {string} [options.orderBy] Sorting criteria (e.g., 'modifiedTime desc').
     * @returns {Object[]} Collection of matching file metadata objects.
     * @throws {Error} On execution failure.
     * @throws {ValidationError} On invalid query syntax.
     */
    searchFiles(query: string, options?: DriveSearchOptions): DriveFile[];
}
