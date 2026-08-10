/** One {targetId, email, permesso} grant to apply in a batch (see {@link IDriveFacade.setPermissions}). */
export interface PermissionGrant {
  targetId: string;
  email: string;
  permesso: string;
}

export interface IDriveFacade {
  findFolderByPath(path: string): string | null;
  createFolder(path: string): string;
  copyFile(templateId: string, name: string, folderId: string): string;
  setPermission(fileId: string, email: string, permesso: string): void;
  /**
   * Batched grant application: one `shareWithUsers` call per distinct `permesso`
   * (Drive v3 role), covering every targetId/email pair requesting that role,
   * instead of one call per pair (10 §10 doc-generation pipeline perf).
   */
  setPermissions(grants: PermissionGrant[]): void;
  deleteFile(fileId: string): void;
  /** Native Drive Blob for the file, e.g. for email attachments (11 §13). */
  getFileBlob(fileId: string): unknown;
  /** Email of the Drive file's owner, or null if none is present (e.g. a Shared Drive file). */
  getFileOwnerEmail(fileId: string): string | null;
  /** Finds a non-trashed file by exact name directly under `folderId`, or null if none matches. */
  findFileByName(folderId: string, name: string): string | null;
  /** Full plain text of a Google Doc's body (e.g. no-leftover-placeholder checks, E2E scenario 10). */
  getFileText(fileId: string): string;
  /** Counts non-trashed files (excluding subfolders) directly inside `folderId`. */
  countFilesInFolder(folderId: string): number;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** ALDO PermessoACL -> Drive API v3 sharing role (14 §4). */
const ROLE_MAP: Record<string, string> = {
  SCRITTURA: 'writer',
  LETTURA: 'reader',
  COMMENTO: 'commenter'
};

/**
 * Real Drive facade (14 §4, 08 §3.4). Composes the vendored GoogleApiWrapper
 * `DriveService` (file/folder/metadata operations) and `PermissionService`
 * (sharing) into ALDO's higher-level IDriveFacade contract — there is no
 * findFolderByPath/copyFile/setPermission/trashFile/countFiles on the library
 * itself; those are `searchFiles`/`copyFiles`/`shareWithUsers`/`deleteFiles`
 * composed here, verified against the real bundle in harness/gaslibs.test.ts.
 * `rootFolderId` anchors every relative path (14 §4 folder-tree convention) —
 * normally `MasterConfig.idCartellaRoot` (`MASTER.ID_CARTELLA_GOOGLE`).
 */
export class DriveServiceFacade implements IDriveFacade {
  constructor(
    private readonly drive: DriveService,
    private readonly permissions: PermissionService,
    private readonly rootFolderId: string,
    /** Only needed for `getFileText` (10 §9 escape hatch) — undefined for callers that never read Doc text back. */
    private readonly documents?: DocumentService
  ) {}

  findFolderByPath(path: string): string | null {
    let parent = this.rootFolderId;
    for (const segment of segments(path)) {
      const query = `'${parent}' in parents and name = '${escapeQuery(segment)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
      const found = this.drive.searchFiles(query, { maxResults: 1 })[0];
      if (found === undefined) return null;
      parent = found.id;
    }
    return parent === this.rootFolderId ? null : parent;
  }

  findFileByName(folderId: string, name: string): string | null {
    const query = `'${folderId}' in parents and name = '${escapeQuery(name)}' and trashed=false`;
    const found = this.drive.searchFiles(query, { maxResults: 1 })[0];
    return found === undefined ? null : found.id;
  }

  countFilesInFolder(folderId: string): number {
    const query = `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed=false`;
    return this.drive.searchFiles(query).length;
  }

  /** Idempotent path creation: each segment is find-or-create (14 §4 — prevents duplicate folders). */
  createFolder(path: string): string {
    let parent = this.rootFolderId;
    for (const segment of segments(path)) {
      const folder = this.drive.createFolder(segment, parent, { returnExistingIfFound: true }) as {
        id: string;
      };
      parent = folder.id;
    }
    return parent;
  }

  copyFile(templateId: string, name: string, folderId: string): string {
    const result = this.drive.copyFiles(
      [{ fileId: templateId, name, destinationFolder: folderId }],
      {}
    );
    const copied = result.successful[0];
    if (copied === undefined) {
      const failure = result.failed[0];
      throw new Error(
        `Copia file ${templateId} fallita: ${failure?.error.message ?? 'errore sconosciuto'}`
      );
    }
    return copied.data.id;
  }

  setPermission(fileId: string, email: string, permesso: string): void {
    const role = ROLE_MAP[permesso] ?? 'reader';
    this.permissions.shareWithUsers([fileId], [{ type: 'user', role, email }], {});
  }

  setPermissions(grants: PermissionGrant[]): void {
    const byPermesso = new Map<string, { targetIds: Set<string>; emails: Set<string> }>();
    for (const { targetId, email, permesso } of grants) {
      const group = byPermesso.get(permesso) ?? { targetIds: new Set(), emails: new Set() };
      group.targetIds.add(targetId);
      group.emails.add(email);
      byPermesso.set(permesso, group);
    }
    for (const [permesso, { targetIds, emails }] of byPermesso) {
      const role = ROLE_MAP[permesso] ?? 'reader';
      this.permissions.shareWithUsers(
        [...targetIds],
        [...emails].map((email) => ({ type: 'user', role, email })),
        {}
      );
    }
  }

  deleteFile(fileId: string): void {
    this.drive.deleteFiles([fileId], { permanently: false });
  }

  getFileBlob(fileId: string): unknown {
    return this.drive.getFileByIdStandard(fileId).getBlob();
  }

  getFileOwnerEmail(fileId: string): string | null {
    return this.drive.getFileOwnerEmail(fileId);
  }

  /**
   * Full plain text of a Google Doc's body. `DriveService` has no text-extraction capability
   * (it only moves/copies/shares opaque files); this goes through `DocumentService.openStandard`
   * (GoogleApiWrapper_docs.md "escape hatch" pattern), the same kind of native-object handoff
   * `getFileBlob` already uses via `getFileByIdStandard(...).getBlob()`, then reads the body text
   * off the returned native `DocumentApp.Document` with the standard GAS API.
   */
  getFileText(fileId: string): string {
    if (this.documents === undefined) {
      throw new Error(
        `DriveServiceFacade.getFileText(${fileId}): nessun DocumentService configurato per questa istanza`
      );
    }
    return this.documents.openStandard(fileId).getBody().getText();
  }
}

function segments(path: string): string[] {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Escapes single quotes for Drive API v3 `q` string literals. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
