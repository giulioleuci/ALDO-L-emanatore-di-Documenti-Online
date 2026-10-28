import type { DriveService } from '../DriveService.js';
import type { DriveFacade, DriveFile } from './types.js';
/**
 * @file GoogleApiWrapper/src/services/DriveShortcutHandler.js
 * @description Encapsulates shortcut operations for DriveService.
 */
export declare class DriveShortcutHandler {
    facade: Pick<DriveFacade, '_logger' | '_exceptionService' | '_isDryRun' | '_generateDryRunId'> & Pick<DriveService, 'getFiles'>;
    _logger: DriveFacade['_logger'];
    _exceptionService: DriveFacade['_exceptionService'];
    _isDryRun: DriveFacade['_isDryRun'];
    _generateDryRunId: DriveFacade['_generateDryRunId'];
    getFiles: DriveService['getFiles'];
    constructor(facade: Pick<DriveFacade, '_logger' | '_exceptionService' | '_isDryRun' | '_generateDryRunId'> & Pick<DriveService, 'getFiles'>);
    /**
     * @description Creates a Google Drive Shortcut (pointer) to a target resource.
     * @param {string} targetId Target file/folder identifier.
     * @param {string} name Shortcut display name.
     * @param {string} [parentId=null] Destination folder ID.
     * @returns {Object} Shortcut metadata including shortcutDetails.
     */
    createShortcut(targetId: string, name: string, parentId?: string | null): DriveFile & {
        dryRun?: boolean;
    };
    /**
     * @description Resolves the target ID from a shortcut resource.
     * @param {string} shortcutId Shortcut resource identifier.
     * @returns {string|null} Target ID or null if resource is not a shortcut.
     */
    getTargetId(shortcutId: string): string | null | undefined;
    /**
     * @description Validates if a resource is a Google Drive Shortcut.
     * @param {string} fileId Resource identifier.
     * @returns {boolean}
     */
    isShortcut(fileId: string): boolean | null;
}
