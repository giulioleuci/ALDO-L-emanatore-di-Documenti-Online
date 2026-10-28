import type { GoogleLogger, GoogleCache, GoogleRetryExecutor } from '../internal/core/GoogleService.js';
import type { DrivePermission } from './drive/types.js';
export type PermissionGrant = Pick<DrivePermission, 'role' | 'type'> & {
    email: string;
    sendEmail?: boolean;
};
export interface PermissionOptions {
    sendNotificationEmail?: boolean;
}
export interface PermissionFailure {
    fileId: string;
    error: unknown;
    statusCode: number | string;
    permissionId?: string;
    email?: string;
    newOwnerEmail?: string;
}
export interface PermissionBatchResult<T> {
    successful: T[];
    failed: PermissionFailure[];
}
/**
 * @file GoogleApiWrapper/src/services/MyPermissionService.js
 * @description BATCH-FIRST Permission Service with Advanced Drive API
 * Version 3.0 - GAW-HIGH-001 Implementation
 *
 * BREAKING CHANGES:
 * - All methods use Advanced Drive API exclusively (no DriveApp fallback)
 * - All methods accept single items OR arrays for batch operations
 * - Email notifications are DISABLED by default (sendNotificationEmail: false)
 * - Methods return detailed per-item results for batch operations
 * - Requires Drive Advanced Service to be enabled in appsscript.json
 *
 * @version 3.0 - Batch operations with NO email notifications
 */
import { GoogleService } from '../internal/core/GoogleService.js';
/**
 * @class PermissionService
 * @extends GoogleService
 * @description Batch-first Google Drive permission manager. Utilizes Advanced Drive API v3 for role assignment, revocation, and ownership transfer. Implements silent sharing by default (notifications disabled) and 5-minute permission caching.
 */
export declare class PermissionService extends GoogleService {
    _cachePrefix: string;
    _cacheExpirationTime: number;
    /**
     * @description Initializes PermissionService with standard GAS service dependencies.
     * @param {LoggerService} logger Diagnostic logger.
     * @param {Cache} cache Persistence provider for permission metadata.
     * @param {UtilsService} utils Foundational utilities.
     * @param {ExceptionService} exceptionService Resiliency provider.
     */
    constructor(logger: GoogleLogger, cache: GoogleCache, utils: object, exceptionService: GoogleRetryExecutor);
    /**
     * @description Grants access to user(s) for file(s) in batch. Supports 'user', 'group', and 'domain' types. Notifications disabled by default.
     * @param {string|string[]} fileIds Resource ID(s).
     * @param {Object|Object[]} permissions Access parameters {email, role, type, sendEmail}.
     * @param {Object} [options={}] Operation settings.
     * @param {boolean} [options.sendNotificationEmail=false] Global notification toggle.
     * @returns {Object} Result summary {successful: Array<{fileId, permission, statusCode}>, failed: Array<{fileId, error, statusCode}>}.
     * @throws {Error} If Drive API is disabled.
     */
    shareWithUsers(fileIds: string | string[], permissions: PermissionGrant | PermissionGrant[], options?: PermissionOptions): PermissionBatchResult<{
        fileId: string;
        permission: DrivePermission;
        statusCode: number;
    }>;
    /**
     * @description Revokes access for user(s) from file(s) in batch. Auto-resolves emails to permission IDs.
     * @param {string|string[]} fileIds Resource ID(s).
     * @param {string|string[]} emailsOrPermissionIds Identifiers for removal.
     * @returns {Object} Result summary.
     */
    removeAccess(fileIds: string | string[], emailsOrPermissionIds: string | string[], _options?: object): PermissionBatchResult<{
        fileId: string;
        permissionId: string | undefined;
        statusCode: number;
    }>;
    /**
     * Changes role(s) for existing permission(s) in batch.
     *
     * This method updates access levels for users who already have permissions on files.
     * It's more efficient than removing and re-adding permissions, as it preserves
     * the permission ID and other metadata.
     *
     * ## Behavior
     *
     * - **Existing Permissions Only**: Only updates users who currently have access
     * - **Email Resolution**: Automatically resolves emails to permission IDs via getPermissions()
     * - **Batch Processing**: Updates multiple roles in single batch request
     * - **Cache Invalidation**: Clears permission cache for all affected files
     * - **Graceful Failures**: Logs warning if email not found, continues with valid updates
     *
     * ## Common Use Cases
     *
     * - Promote user from reader to writer
     * - Demote user from writer to reader
     * - Grant commenter access to existing reader
     * - Bulk role updates after organizational changes
     *
     * ## Available Roles
     *
     * - **reader**: Can view and download
     * - **writer**: Can view, download, and edit
     * - **commenter**: Can view and add comments (Docs/Sheets only)
     * - **owner**: Full control (use transferOwnership() instead)
     *
     * @param {string|string[]} fileIds - Single file ID or array of file IDs
     * @param {Object|Object[]} roleChanges - Role change(s)
     *   Each object: `{ email: string, newRole: 'reader'|'writer'|'commenter' }`
     * @param {Object} [options={}] - Optional settings (reserved for future use)
     *
     * @returns {Object} Results object with categorized outcomes
     * @returns {Array<Object>} return.successful - Successfully updated permissions
     *   Each: `{ fileId, permissionId, oldRole, newRole, statusCode: 200 }`
     * @returns {Array<Object>} return.failed - Failed update operations
     *   Each: `{ fileId, email, error: {...}, statusCode: 4xx/5xx }`
     *
     * @throws {Error} If Drive Advanced API is not enabled
     *
     * @example
     * // Promote single user to writer
     * const result = permissions.changeRoles('fileId', {
     *   email: 'user@example.com',
     *   newRole: 'writer'
     * });
     * // User can now edit the file
     *
     * @example
     * // Change multiple user roles on single file
     * permissions.changeRoles('fileId', [
     *   { email: 'user1@example.com', newRole: 'writer' },   // Promote to editor
     *   { email: 'user2@example.com', newRole: 'reader' },   // Demote to viewer
     *   { email: 'user3@example.com', newRole: 'commenter' } // Grant commenting
     * ]);
     * // Result: 3 role updates in 1 batch request
     *
     * @example
     * // Change single user role across multiple files
     * permissions.changeRoles(
     *   ['file1', 'file2', 'file3'],
     *   { email: 'user@example.com', newRole: 'writer' }
     * );
     * // User becomes writer on all 3 files
     *
     * @example
     * // Bulk role changes across files and users
     * permissions.changeRoles(
     *   ['file1', 'file2'],
     *   [
     *     { email: 'user1@example.com', newRole: 'writer' },
     *     { email: 'user2@example.com', newRole: 'reader' }
     *   ]
     * );
     * // Result: 4 role updates (2 files × 2 users) in 1 batch request
     *
     * @example
     * // Demote all external users to readers (org restructure)
     * const fileIds = ['file1', 'file2', 'file3'];
     * const externalUsers = [
     *   { email: 'contractor1@external.com', newRole: 'reader' },
     *   { email: 'contractor2@external.com', newRole: 'reader' },
     *   { email: 'vendor@external.com', newRole: 'reader' }
     * ];
     *
     * permissions.changeRoles(fileIds, externalUsers);
     * // All external users demoted to read-only across all files
     *
     * @example
     * // Handle non-existent permission (graceful failure)
     * const result = permissions.changeRoles('fileId', {
     *   email: 'nonexistent@example.com',
     *   newRole: 'writer'
     * });
     * // Logs warning: "Permission not found for nonexistent@example.com on fileId"
     * // Returns: { successful: [], failed: [] } (no operations performed)
     *
     * @example
     * // Grant editing rights to team after review phase
     * const reportFiles = ['report1', 'report2', 'report3'];
     * const teamMembers = [
     *   { email: 'alice@example.com', newRole: 'writer' },
     *   { email: 'bob@example.com', newRole: 'writer' },
     *   { email: 'carol@example.com', newRole: 'writer' }
     * ];
     *
    /**
     * @description Updates access levels for existing permissions in batch. Auto-resolves emails to permission IDs.
     * @param {string|string[]} fileIds Resource ID(s).
     * @param {Object|Object[]} roleChanges Collection of {email, newRole}.
     * @returns {Object} Result summary.
     */
    changeRoles(fileIds: string | string[], roleChanges: {
        email: string;
        newRole: string;
    } | {
        email: string;
        newRole: string;
    }[], _options?: object): PermissionBatchResult<{
        fileId: string;
        permissionId: string | undefined;
        oldRole: string | undefined;
        newRole: string;
        statusCode: number;
    }>;
    /**
     * Changes roles addressed by PERMISSION ID rather than by email.
     *
     * `changeRoles` resolves each change through `emailAddress`, so grants that
     * have no email — `type: 'anyone'` (link sharing) and `type: 'domain'` —
     * are unreachable through it. Callers that enumerate permissions themselves
     * (e.g. "downgrade every writer on this file") use this method.
     *
     * @param {string|string[]} fileIds
     * @param {{permissionId: string, newRole: string}|Array<{permissionId: string, newRole: string}>} roleChanges
     * @param {Object} [_options]
     * @returns {{successful: Array<Object>, failed: Array<Object>}}
     */
    changeRolesByPermissionId(fileIds: string | string[], roleChanges: {
        permissionId: string;
        newRole: string;
    } | {
        permissionId: string;
        newRole: string;
    }[], _options?: object): PermissionBatchResult<{
        fileId: string;
        permissionId: string;
        newRole: string;
        statusCode: number;
    }>;
    /**
     * Transfers ownership of file(s) to user(s) in batch with NO email notifications.
     *
     * This method transfers file ownership to new owner(s). Ownership transfer is a special
     * permission operation that automatically:
     * - Grants 'owner' role to new owner
     * - Demotes current owner to 'writer' role (if applicable)
     * - Transfers all ownership responsibilities
     *
     * ## Behavior
     *
     * - **Batch Processing**: Transfer multiple files to one or more owners
     * - **Email Control**: NO emails sent by default (GAW-HIGH-001)
     * - **Cache Invalidation**: Clears permission cache for all affected files
     * - **Auto Role Change**: Previous owner becomes writer automatically
     * - **Domain Restrictions**: New owner must be in same domain (Google Workspace)
     *
     * ## Important Considerations
     *
     * **Ownership Requirements**:
     * - Only current owner can transfer ownership
     * - New owner must have Google account
     * - New owner must be in same domain (Workspace) or file must allow external sharing
     * - New owner automatically gets 'owner' role
     * - Previous owner typically becomes 'writer' (Google Drive behavior)
     *
     * **Irreversible Action**:
     * - Ownership transfer cannot be undone programmatically
     * - New owner must manually transfer back
     * - Be cautious with batch transfers
     *
     * ## When to Use
     *
     * - Employee departure (transfer their files to manager)
     * - Project handoff (transfer project files to new lead)
     * - Organizational restructuring
     * - Automated file ownership management
     *
     * @param {string|string[]} fileIds - Single file ID or array of file IDs
     * @param {string|string[]} newOwnerEmails - New owner email(s)
     *   Must be valid Google account email(s)
     * @param {Object} [options={}] - Optional settings
     * @param {boolean} [options.sendNotificationEmail=false] - Override to enable email
     *
     * @returns {Object} Results object with categorized outcomes
     * @returns {Array<Object>} return.successful - Successfully transferred ownership
     *   Each: `{ fileId, newOwnerEmail, statusCode: 200 }`
     * @returns {Array<Object>} return.failed - Failed transfer operations
     *   Each: `{ fileId, newOwnerEmail, error: {...}, statusCode: 4xx/5xx }`
     *
     * @throws {Error} If Drive Advanced API is not enabled
     * @throws {Error} If not current owner of the file
     * @throws {Error} If new owner is in different domain (Workspace)
     *
     * @example
     * // Transfer single file to new owner (no email notification)
     * const result = permissions.transferOwnership(
     *   'fileId123',
     *   'newowner@example.com'
     * );
     * // Result: newowner@example.com is now the owner
     *
     * @example
     * // Transfer multiple files to same new owner
     * permissions.transferOwnership(
     *   ['file1', 'file2', 'file3'],
     *   'newowner@example.com'
     * );
     * // All 3 files transferred to newowner@example.com in 1 batch
     *
     * @example
     * // Transfer with email notification
     * permissions.transferOwnership(
     *   'fileId',
     *   'newowner@example.com',
     *   { sendNotificationEmail: true }
     * );
     * // New owner receives email about ownership transfer
     *
     * @example
     * // Employee departure - transfer all their files to manager
     * const departingEmployee = 'john@example.com';
     * const manager = 'manager@example.com';
     *
     * // Find all files owned by departing employee
     * const ownedFiles = driveService.searchFiles(
     *   `'${departingEmployee}' in owners`
     * );
     * const fileIds = ownedFiles.map(f => f.id);
     *
     * // Transfer ownership to manager
     * const result = permissions.transferOwnership(fileIds, manager);
     *
     * console.log(`Transferred ${result.successful.length} files`);
     * console.log(`Failed: ${result.failed.length} files`);
     *
     * @example
     * // Project handoff - transfer project folder contents
     * const projectFolderId = 'folderId123';
     * const newProjectLead = 'newlead@example.com';
     *
     * // Get all files in project folder
     * const projectFiles = driveService.searchFiles(
     *   `'${projectFolderId}' in parents and trashed = false`
     * );
     * const fileIds = projectFiles.map(f => f.id);
     *
     * // Transfer ownership of all project files
     * permissions.transferOwnership(fileIds, newProjectLead, {
     *   sendNotificationEmail: true  // Notify new lead
     * });
     *
     * @example
     * // Handle transfer failures (domain restrictions)
     * const result = permissions.transferOwnership(
     *   'fileId',
     *   'external@differentdomain.com'  // Different domain
     * );
     *
    /**
     * @description Transfers resource ownership to new user(s). Previous owner becomes 'writer'.
     * @param {string|string[]} fileIds Resource ID(s).
     * @param {string|string[]} newOwnerEmails Target owner email(s).
     * @param {Object} [options={}] Operation settings.
     * @returns {Object} Result summary.
     */
    transferOwnership(fileIds: string | string[], newOwnerEmails: string | string[], options?: PermissionOptions): PermissionBatchResult<{
        fileId: string;
        newOwnerEmail: string;
        statusCode: number;
    }>;
    /**
     * Gets permissions for file(s) in batch with intelligent caching.
     *
     * This method retrieves permission lists for files, automatically leveraging cache
     * for recently-accessed files and batching API calls for uncached files.
     *
     * ## Behavior
     *
     * - **Cache-First**: Checks cache before making API calls
     * - **Batch Uncached**: Single batch request for all uncached files
     * - **5-Minute Cache**: Permission lists cached for 300 seconds
     * - **Automatic Parsing**: Returns parsed permission objects (not raw API response)
     * - **Flexible Return**: Single array for single file, map for multiple files
     *
     * ## Permission Object Structure
     *
     * Each permission in the returned array contains:
     * - **id**: Permission ID (use for direct deletion/updates)
     * - **emailAddress**: User's email (if user/group type)
     * - **role**: Access level - 'owner', 'writer', 'reader', 'commenter'
     * - **type**: Permission type - 'user', 'group', 'domain', 'anyone'
     * - **domain**: Domain name (if domain type)
     *
     * ## Cache Behavior
     *
     * - **Cache Hit**: Returns immediately (no API call)
     * - **Cache Miss**: Fetches from API, caches for 5 minutes
     * - **Cache Invalidation**: Automatic on share/remove/change/transfer operations
     *
     * ## Performance
     *
     * - 1 file (cached): ~1ms (cache lookup)
     * - 1 file (uncached): ~200ms (API call)
     * - 10 files (all uncached): ~300ms (1 batch request)
     * - 10 files (all cached): ~10ms (10 cache lookups)
     *
     * @param {string|string[]} fileIds - Single file ID or array of file IDs
     * @param {Object} [options={}] - Optional settings (reserved for future use)
     *
     * @returns {Array<Object>|Object<string, Array<Object>>} Permission list or file ID map
     *   - Single file ID input: Returns `Array<Permission>` directly
     *   - Multiple file IDs input: Returns `Object<fileId, Array<Permission>>`
     *
     * @example
     * // Get permissions for single file
     * const perms = permissions.getPermissions('fileId123');
     * // Returns: [
     * //   { id: 'perm1', emailAddress: 'user1@example.com', role: 'writer', type: 'user' },
     * //   { id: 'perm2', emailAddress: 'user2@example.com', role: 'reader', type: 'user' },
     * //   { id: 'anyoneWithLink', role: 'reader', type: 'anyone' }
     * // ]
     *
     * @example
     * // Get permissions for multiple files (returns map)
     * const permsMap = permissions.getPermissions(['fileId1', 'fileId2']);
     * // Returns: {
     * //   'fileId1': [{ id: '...', emailAddress: '...', role: '...', type: '...' }, ...],
     * //   'fileId2': [{ id: '...', emailAddress: '...', role: '...', type: '...' }, ...]
     * // }
     *
     * @example
     * // Find all users with writer access
     * const perms = permissions.getPermissions('fileId');
     * const writers = perms.filter(p => p.role === 'writer' && p.type === 'user');
     *
     * writers.forEach(writer => {
     *   console.log(`Writer: ${writer.emailAddress}`);
     * });
     *
     * @example
     * // Check if file is publicly accessible
     * const perms = permissions.getPermissions('fileId');
     * const isPublic = perms.some(p => p.type === 'anyone');
     *
     * if (isPublic) {
     *   console.log('File has public link sharing enabled');
     * }
     *
     * @example
     * // Audit permissions across multiple files
     * const fileIds = ['file1', 'file2', 'file3'];
     * const permsMap = permissions.getPermissions(fileIds);
     *
     * Object.entries(permsMap).forEach(([fileId, perms]) => {
     *   console.log(`\nFile: ${fileId}`);
     *   console.log(`  Total permissions: ${perms.length}`);
     *   console.log(`  Writers: ${perms.filter(p => p.role === 'writer').length}`);
     *   console.log(`  Readers: ${perms.filter(p => p.role === 'reader').length}`);
     * });
     *
     * @example
     * // Extract permission IDs for batch deletion
     * const perms = permissions.getPermissions('fileId');
     * const externalPermIds = perms
     *   .filter(p => p.emailAddress && !p.emailAddress.endsWith('@example.com'))
     *   .map(p => p.id);
     *
     * // Remove all external users
     * permissions.removeAccess('fileId', externalPermIds);
     *
     * @example
     * // Check domain-wide access
     * const perms = permissions.getPermissions('fileId');
     * const domainPerm = perms.find(p => p.type === 'domain');
     *
    /**
     * @description Retrieves permission metadata with 5-minute intelligent caching.
     * @param {string|string[]} fileIds Resource ID(s).
     * @returns {Object[]|Object<string, Object[]>} Collection of permissions (single) or ID-to-Permissions map (batch).
     */
    getPermissions(fileIds: string, _options?: object): DrivePermission[];
    getPermissions(fileIds: string[], _options?: object): Record<string, DrivePermission[]>;
    getPermissions(fileIds: string | string[], _options?: object): DrivePermission[] | Record<string, DrivePermission[]>;
    /**
     * Generates shareable "anyone with link" URLs for file(s) with NO email notifications.
     *
     * This method creates or updates the 'anyone' permission on files to enable link sharing,
     * then returns the shareable URLs. It's ideal for sharing files publicly or with large
     * groups without needing individual email addresses.
     *
     * ## Behavior
     *
     * - **Auto Permission**: Creates 'anyone' permission if not exists
     * - **Role Update**: Updates existing 'anyone' permission if role differs
     * - **Batch Processing**: Generates links for multiple files in one batch
     * - **Email Control**: NO emails sent when creating/updating 'anyone' permission
     * - **Link Types**: Supports view, edit, and comment links
     *
     * ## Access Types
     *
     * - **view**: Anyone with link can view and download (role: 'reader')
     * - **edit**: Anyone with link can edit (role: 'writer')
     * - **comment**: Anyone with link can comment (role: 'commenter', Docs/Sheets only)
     *
     * ## Two-Step Process
     *
     * 1. **Ensure Permission**: Creates/updates 'anyone' permission with correct role
     * 2. **Get Link**: Retrieves webViewLink from file metadata
     *
     * ## Security Considerations
     *
     * - Link sharing bypasses all email-based permissions
     * - Anyone with the URL can access (even without Google account)
     * - Consider using expiration or restricting to domain for sensitive files
     * - Links remain valid until permission is removed
     *
     * @param {string|string[]} fileIds - Single file ID or array of file IDs
     * @param {string} [accessType='view'] - Access type for the link
     *   Options: 'view', 'edit', 'comment'
     * @param {Object} [options={}] - Optional settings (reserved for future use)
     *
     * @returns {string|Object<string, string>} Shareable link or file ID map
     *   - Single file ID input: Returns URL string directly
     *   - Multiple file IDs input: Returns `Object<fileId, URL>`
     *
     * @example
     * // Get view link for single file
     * const link = permissions.getSharingLink('fileId123', 'view');
     * // Returns: 'https://drive.google.com/file/d/fileId123/view?usp=sharing'
     *
     * @example
     * // Get edit link for spreadsheet
     * const editLink = permissions.getSharingLink('spreadsheetId', 'edit');
     * // Anyone with link can now edit the spreadsheet
     *
     * @example
     * // Get comment link for document
     * const commentLink = permissions.getSharingLink('docId', 'comment');
     * // Anyone with link can add comments but not edit
     *
     * @example
     * // Get links for multiple files
     * const links = permissions.getSharingLink(['file1', 'file2', 'file3'], 'view');
     * // Returns: {
     * //   'file1': 'https://drive.google.com/file/d/file1/view?usp=sharing',
     * //   'file2': 'https://drive.google.com/file/d/file2/view?usp=sharing',
     * //   'file3': 'https://drive.google.com/file/d/file3/view?usp=sharing'
     * // }
     *
     * @example
     * // Share presentation for public viewing
     * const presentationId = 'abc123';
     * const link = permissions.getSharingLink(presentationId, 'view');
     *
     * // Distribute link via email, Slack, etc.
     * console.log(`View the presentation: ${link}`);
     *
     * @example
     * // Enable collaborative editing on multiple documents
     * const docIds = ['doc1', 'doc2', 'doc3'];
     * const editLinks = permissions.getSharingLink(docIds, 'edit');
     *
     * Object.entries(editLinks).forEach(([docId, link]) => {
     *   console.log(`Edit ${docId}: ${link}`);
     * });
     *
     * @example
     * // Change existing link from view-only to editable
     * const fileId = 'existingFile';
     *
     * // First, file had view link
     * const viewLink = permissions.getSharingLink(fileId, 'view');
     *
     * // Later, upgrade to edit link (updates 'anyone' permission role)
     * const editLink = permissions.getSharingLink(fileId, 'edit');
     *
     * // Same URL, but now grants edit access instead of view
     *
     * @example
     * // Disable link sharing (remove 'anyone' permission)
     * const fileId = 'publicFile';
     *
     * // First, get current permissions
     * const perms = permissions.getPermissions(fileId);
     * const anyonePerm = perms.find(p => p.type === 'anyone');
     *
     * if (anyonePerm) {
     *   // Remove 'anyone' permission to disable link sharing
     *   permissions.removeAccess(fileId, anyonePerm.id!);
     *   console.log('Link sharing disabled');
     * }
     *
     * @example
     * // Generate QR codes for file links
     * const fileIds = ['menu', 'flyer', 'brochure'];
     * const links = permissions.getSharingLink(fileIds, 'view');
     *
    /**
     * @description Generates "anyone with link" URLs. Creates/updates 'anyone' permissions as needed.
     * @param {string|string[]} fileIds Resource ID(s).
     * @param {string} [accessType='view'] Access level ('view', 'edit', 'comment').
     * @returns {string|Object<string, string>} URL (single) or ID-to-URL map (batch).
     */
    getSharingLink(fileIds: string, accessType?: string, _options?: object): string | null;
    getSharingLink(fileIds: string[], accessType?: string, _options?: object): Record<string, string | null>;
    getSharingLink(fileIds: string | string[], accessType?: string, _options?: object): string | null | Record<string, string | null>;
}
