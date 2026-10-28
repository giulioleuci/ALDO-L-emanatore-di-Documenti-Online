import type { DriveService } from '../DriveService.js';
import type { DriveFacade, DriveOptions, DriveFile } from './types.js';
/**
 * @file GoogleApiWrapper/src/services/DriveFolderManager.js
 * @description Encapsulates folder-level operations for DriveService.
 */
export declare class DriveFolderManager {
    facade: Pick<DriveFacade, '_logger' | '_exceptionService' | '_isDryRun' | '_generateDryRunId'> & Pick<DriveService, 'searchFiles'>;
    _logger: DriveFacade['_logger'];
    _exceptionService: DriveFacade['_exceptionService'];
    _isDryRun: DriveFacade['_isDryRun'];
    _generateDryRunId: DriveFacade['_generateDryRunId'];
    searchFiles: DriveService['searchFiles'];
    constructor(facade: Pick<DriveFacade, '_logger' | '_exceptionService' | '_isDryRun' | '_generateDryRunId'> & Pick<DriveService, 'searchFiles'>);
    /**
     * @description Creates a Google Drive folder. Supports parent targeting and idempotency via deduplication.
     * @param {string} folderName Target folder name.
     * @param {string} [parentFolderId=null] Parent identifier (defaults to "My Drive").
     * @param {Object} [options={}] Operation settings.
     * @param {boolean} [options.returnExistingIfFound=false] Retrieve first match if name exists in parent.
     * @returns {Object} Folder metadata {id, name, mimeType, parents, webViewLink}.
     * @throws {Error} On auth/scope failure.
     * @throws {Error} If parent folder is missing.
     * @throws {Error} If storage limit reached.
     * @throws {ValidationError} On invalid input.
     */
    createFolder(folderName: string, parentFolderId?: string | null, options?: DriveOptions & {
        returnExistingIfFound?: boolean;
    }): DriveFile & {
        dryRun?: boolean;
    };
    /**
     * @description Accesses folder via native DriveApp (standard API). Enables use of folder-specific iterators and methods.
     * @param {string} folderId Target resource identifier.
     * @returns {GoogleAppsScript.Drive.Folder} Native GAS Drive Folder object.
     * @throws {Error} If folder is missing.
     * @throws {Error} If access is denied.
     */
    getFolderByIdStandard(folderId: string): GoogleAppsScript.Drive.Folder;
}
