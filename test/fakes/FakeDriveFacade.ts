import type { IDriveFacade, PermissionGrant } from '../../src/infrastructure/facades/DriveServiceFacade';

export class FakeDriveFacade implements IDriveFacade {
  public folders = new Map<string, string>();
  public files = new Map<string, string>(); // "folderId::name" -> fileId
  public copies: Array<{ templateId: string; name: string; folderId: string; fileId: string }> = [];
  public permissions: Array<{ fileId: string; email: string; permesso: string }> = [];
  public setPermissionsCallCount = 0;
  public deleted: string[] = [];
  public ownerEmail: string | null = 'owner@school.it';
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
  setPermission(fileId: string, email: string, permesso: string): void {
    this.permissions.push({ fileId, email, permesso });
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
  getFileText(fileId: string): string {
    return `text:${fileId}`;
  }
  countFilesInFolder(): number {
    return 0; // fake always returns 0, tests override as needed
  }
}
