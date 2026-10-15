/** One {targetId, email, permesso} grant to apply in a batch (see {@link IDriveFacade.setPermissions}). */
export interface PermissionGrant {
  targetId: string;
  email: string;
  permesso: string;
}

/** One Drive permission as ALDO sees it (subset of the Drive v3 resource). */
export interface DrivePermission {
  id: string;
  /** null for link-wide grants (`tipo` 'anyone'/'domain'), which carry no address. */
  email: string | null;
  role: string;
  tipo: string;
}

export interface IDriveFacade {
  findFolderByPath(path: string): string | null;
  createFolder(path: string): string;
  copyFile(templateId: string, name: string, folderId: string): string;
  /**
   * Batched grant application: one `shareWithUsers` call per distinct
   * targetId/`permesso` (Drive v3 role) pair, covering every email requesting
   * that role on that target, instead of one call per email
   * (10 §10 doc-generation pipeline perf).
   */
  setPermissions(grants: PermissionGrant[]): void;
  deleteFile(fileId: string): void;
  /** Native Drive Blob for the file, e.g. for email attachments (11 §13). */
  getFileBlob(fileId: string): unknown;
  /** Email of the Drive file's owner, or null if none is present (e.g. a Shared Drive file). */
  getFileOwnerEmail(fileId: string): string | null;
  /** True for confirmed trash/missing state; unconfirmed lookup failures propagate. */
  isFolderTrashed(folderId: string): boolean;
  /** Finds a non-trashed file by exact name directly under `folderId`, or null if none matches. */
  findFileByName(folderId: string, name: string): string | null;
  /** Full plain text of a Google Doc's body (e.g. no-leftover-placeholder checks, E2E scenario 10). */
  getFileText(fileId: string): string;
  /** Counts non-trashed files (excluding subfolders) directly inside `folderId`. */
  countFilesInFolder(folderId: string): number;
  /** Every permission on the file (Feature 3 — includes link-wide grants). */
  listPermissions(fileId: string): DrivePermission[];
  /** Applies role changes by permission id; returns one entry per FAILED change. */
  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }>;
  /** Revokes the given permission ids on the file; returns one entry per FAILED removal. */
  removePermissions(
    fileId: string,
    permissionIds: string[]
  ): Array<{ permissionId: string; errore: string }>;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** ALDO PermessoACL -> Drive API v3 sharing role (14 §4). Exported so the azioni
 * handlers can compare an expected permesso against a live `DrivePermission.role`
 * without a second copy of the mapping. */
export const DRIVE_ROLE_BY_PERMESSO: Record<string, string> = {
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
    private readonly documents?: DocumentService,
    /**
     * Drive rejects a share to an address with no resolvable Google account
     * unless `sendNotificationEmail` is set, so the online-test environment
     * (synthetic `@onlinetest.aldo.local` principals) needs this on; real
     * school-domain accounts in production resolve fine, so it stays off
     * there (default) to avoid unsolicited sharing emails.
     */
    private readonly notifyOnShare: boolean = false
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

  setPermissions(grants: PermissionGrant[]): void {
    // Keyed by targetId+permesso (not permesso alone) — shareWithUsers does a
    // fileIds x permissions cross-product, so grouping across targetIds would
    // leak a file's grantees onto its folder and vice versa.
    const byTargetAndPermesso = new Map<string, { targetId: string; permesso: string; emails: Set<string> }>();
    for (const { targetId, email, permesso } of grants) {
      const key = `${targetId}:${permesso}`;
      const group = byTargetAndPermesso.get(key) ?? { targetId, permesso, emails: new Set() };
      group.emails.add(email);
      byTargetAndPermesso.set(key, group);
    }
    // shareWithUsers never throws on a Drive rejection: it returns it in `failed`.
    // Surface every rejection (after all groups ran, so one bad target never
    // blocks the others) instead of reporting a silent success.
    const failures: string[] = [];
    for (const { targetId, permesso, emails } of byTargetAndPermesso.values()) {
      const role = DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader';
      const result = this.permissions.shareWithUsers(
        [targetId],
        [...emails].map((email) => ({ type: 'user', role, email })),
        { sendNotificationEmail: this.notifyOnShare }
      );
      for (const { fileId, error } of result.failed) {
        failures.push(`${fileId} (${role}): ${error.message}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Assegnazione permessi Drive fallita — ${failures.join('; ')}`);
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

  isFolderTrashed(folderId: string): boolean {
    try {
      const metadata = this.drive.getFiles(folderId, { fields: 'id,trashed', strict: true }) as {
        trashed?: boolean;
      } | null;
      if (typeof metadata?.trashed !== 'boolean') {
        throw new Error(`Metadati Drive incompleti per la cartella ${folderId}`);
      }
      return metadata.trashed;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) {
        return true;
      }
      throw error;
    }
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

  listPermissions(fileId: string): DrivePermission[] {
    return this.permissions.getPermissions(fileId).map((p) => ({
      id: p.id,
      email: p.emailAddress ?? null,
      role: p.role,
      tipo: p.type
    }));
  }

  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }> {
    if (changes.length === 0) return [];
    const result = this.permissions.changeRolesByPermissionId(
      fileId,
      changes.map((c) => ({ permissionId: c.permissionId, newRole: c.role }))
    );
    return result.failed.map((f) => ({
      permissionId: f.permissionId,
      errore: f.error instanceof Error ? f.error.message : String(f.error)
    }));
  }

  removePermissions(
    fileId: string,
    permissionIds: string[]
  ): Array<{ permissionId: string; errore: string }> {
    if (permissionIds.length === 0) return [];
    const result = this.permissions.removeAccess(fileId, permissionIds);
    return result.failed.map((f) => ({
      permissionId: f.permissionId,
      errore: f.error instanceof Error ? f.error.message : String(f.error)
    }));
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
