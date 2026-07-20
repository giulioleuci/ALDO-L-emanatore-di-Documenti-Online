export interface IDriveFacade {
  findFolderByPath(path: string): string | null;
  createFolder(path: string): string;
  copyFile(templateId: string, name: string, folderId: string): string;
  setPermission(fileId: string, email: string, permesso: string): void;
  deleteFile(fileId: string): void;
  /** Native Drive Blob for the file, e.g. for email attachments (11 §13). */
  getFileBlob(fileId: string): unknown;
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
    private readonly rootFolderId: string
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

  deleteFile(fileId: string): void {
    this.drive.deleteFiles([fileId], { permanently: false });
  }

  getFileBlob(fileId: string): unknown {
    return this.drive.getFileByIdStandard(fileId).getBlob();
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
