import type {
  DrivePermission,
  IDriveFacade,
  PermissionGrant
} from '../../src/infrastructure/facades/DriveServiceFacade';

export class FakeDriveFacade implements IDriveFacade {
  public folders = new Map<string, string>();
  public files = new Map<string, string>(); // "folderId::name" -> fileId
  public copies: Array<{ templateId: string; name: string; folderId: string; fileId: string }> = [];
  public permissions: Array<{ fileId: string; email: string; permesso: string }> = [];
  public setPermissionsCallCount = 0;
  public deleted: string[] = [];
  public ownerEmail: string | null = 'owner@school.it';
  /** Folder ids a test has marked as trashed/deleted on Drive. */
  public trashedIds = new Set<string>();
  /** fileId -> permissions, seeded by tests. */
  public permissionsPerFile = new Map<string, DrivePermission[]>();
  /** fileIds that must throw when listPermissions is called (simulates a trashed/deleted/inaccessible Drive file). */
  public throwOnListPermissions = new Set<string>();
  public roleChanges: Array<{ fileId: string; permissionId: string; role: string }> = [];
  public removed: Array<{ fileId: string; permissionId: string }> = [];
  /** permissionIds that must fail on change/removal (error message as value). */
  public permissionFailures = new Map<string, string>();
  private seq = 0;

  findFolderByPath(path: string): string | null {
    return this.folders.get(path) ?? null;
  }
  createFolder(path: string): string {
    const id = `folder_${++this.seq}`;
    this.folders.set(path, id);
    return id;
  }
  findFileByName(folderId: string, name: string): string | null {
    return this.files.get(`${folderId}::${name}`) ?? null;
  }
  copyFile(templateId: string, name: string, folderId: string): string {
    const fileId = `file_${++this.seq}`;
    this.copies.push({ templateId, name, folderId, fileId });
    return fileId;
  }
  setPermissions(grants: PermissionGrant[]): void {
    this.setPermissionsCallCount++;
    for (const { targetId, email, permesso } of grants) {
      this.permissions.push({ fileId: targetId, email, permesso });
    }
  }
  deleteFile(fileId: string): void {
    this.deleted.push(fileId);
  }
  getFileBlob(fileId: string): unknown {
    return `blob:${fileId}`;
  }
  getFileOwnerEmail(): string | null {
    return this.ownerEmail;
  }
  isFolderTrashed(folderId: string): boolean {
    return this.trashedIds.has(folderId);
  }
  getFileText(fileId: string): string {
    return `text:${fileId}`;
  }
  countFilesInFolder(): number {
    return 0; // fake always returns 0, tests override as needed
  }

  listPermissions(fileId: string): DrivePermission[] {
    if (this.throwOnListPermissions.has(fileId)) {
      throw new Error(`Drive: file non accessibile (${fileId})`);
    }
    return this.permissionsPerFile.get(fileId) ?? [];
  }

  changePermissionRoles(
    fileId: string,
    changes: Array<{ permissionId: string; role: string }>
  ): Array<{ permissionId: string; errore: string }> {
    const failures: Array<{ permissionId: string; errore: string }> = [];
    for (const change of changes) {
      const errore = this.permissionFailures.get(change.permissionId);
      if (errore !== undefined) {
        failures.push({ permissionId: change.permissionId, errore });
        continue;
      }
      this.roleChanges.push({ fileId, permissionId: change.permissionId, role: change.role });
      const perms = this.permissionsPerFile.get(fileId) ?? [];
      const hit = perms.find((p) => p.id === change.permissionId);
      if (hit !== undefined) hit.role = change.role;
    }
    return failures;
  }

  removePermissions(
    fileId: string,
    permissionIds: string[]
  ): Array<{ permissionId: string; errore: string }> {
    const failures: Array<{ permissionId: string; errore: string }> = [];
    for (const permissionId of permissionIds) {
      const errore = this.permissionFailures.get(permissionId);
      if (errore !== undefined) {
        failures.push({ permissionId, errore });
        continue;
      }
      this.removed.push({ fileId, permissionId });
      const perms = this.permissionsPerFile.get(fileId);
      if (perms !== undefined) {
        const index = perms.findIndex((p) => p.id === permissionId);
        if (index !== -1) perms.splice(index, 1);
      }
    }
    return failures;
  }
}
