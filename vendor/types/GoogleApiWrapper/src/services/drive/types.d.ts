import type { DriveService } from '../DriveService.js';
export type DriveFile = GoogleAppsScript.Drive_v3.Drive.V3.Schema.File;
export type DrivePermission = GoogleAppsScript.Drive_v3.Drive.V3.Schema.Permission;
export interface DriveOptions {
    dryRun?: boolean;
}
export interface DriveMetadataOptions {
    fields?: string;
    strict?: boolean;
}
export interface DriveSearchOptions {
    maxResults?: number;
    orderBy?: string;
}
export interface CopyRequest {
    fileId: string;
    name?: string;
    destinationFolder?: string;
}
export interface MoveRequest {
    fileId: string;
    newParent: string;
    removeFromOtherParents?: boolean;
}
export interface RenameRequest {
    fileId: string;
    newName: string;
}
export interface MetadataRequest {
    fileId: string;
    metadata: DriveFile;
}
export interface DriveBatchResult<T> {
    successful: {
        id: string;
        status: number;
        data: T;
        dryRun?: boolean;
    }[];
    failed: {
        id: string;
        status: number | string;
        error: unknown;
    }[];
    dryRun?: boolean;
}
export type DriveFacade = Pick<DriveService, '_logger' | '_cache' | '_utils' | '_exceptionService' | '_cachePrefix' | '_cacheExpirationTime' | '_isDryRun' | '_generateDryRunId' | '_generateCacheKey'>;
export type MetadataDriveFiles = NonNullable<GoogleAppsScript.Drive['Files']> & {
    create(resource: DriveFile, mediaData: null, options: Record<string, unknown>): DriveFile;
    update(resource: DriveFile, fileId: string, mediaData: null, options: Record<string, unknown>): DriveFile;
};
