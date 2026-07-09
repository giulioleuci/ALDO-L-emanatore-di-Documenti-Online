import type { IDriveFacade } from '../../src/infrastructure/facades/DriveServiceFacade';

export class FakeDriveFacade implements IDriveFacade {
  public folders = new Map<string, string>();
  public copies: Array<{ templateId: string; name: string; folderId: string; fileId: string }> = [];
  public permissions: Array<{ fileId: string; email: string; permesso: string }> = [];
  public deleted: string[] = [];
  private seq = 0;

  findFolderByPath(path: string): string | null { return this.folders.get(path) ?? null; }
  createFolder(path: string): string {
    const id = `folder_${++this.seq}`;
    this.folders.set(path, id);
    return id;
  }
  copyFile(templateId: string, name: string, folderId: string): string {
    const fileId = `file_${++this.seq}`;
    this.copies.push({ templateId, name, folderId, fileId });
    return fileId;
  }
  setPermission(fileId: string, email: string, permesso: string): void {
    this.permissions.push({ fileId, email, permesso });
  }
  deleteFile(fileId: string): void { this.deleted.push(fileId); }
  countFilesInFolder(folderId: string): number { return this.copies.filter((c) => c.folderId === folderId).length; }
  getFileBlob(fileId: string): unknown { return `blob:${fileId}`; }
}
