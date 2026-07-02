export interface IDriveFacade {
  findFolderByPath(path: string): string | null;
  createFolder(path: string): string;
  copyFile(templateId: string, name: string, folderId: string): string;
  setPermission(fileId: string, email: string, permesso: string): void;
  deleteFile(fileId: string): void;
  countFilesInFolder(folderId: string): number;
}

// Real facade routes through the vendored GoogleApiWrapper DriveService global.
// Implemented against real GAS in a later plan; the vendored global is typed in types/gaslibs.
export class DriveServiceFacade implements IDriveFacade {
  constructor(private readonly drive: DriveService) {}
  findFolderByPath(path: string): string | null { return this.drive.findFolderByPath(path); }
  createFolder(path: string): string { return this.drive.createFolderPath(path); }
  copyFile(templateId: string, name: string, folderId: string): string { return this.drive.copyFile(templateId, name, folderId); }
  setPermission(fileId: string, email: string, permesso: string): void { this.drive.setPermission(fileId, email, permesso); }
  deleteFile(fileId: string): void { this.drive.trashFile(fileId); }
  countFilesInFolder(folderId: string): number { return this.drive.countFiles(folderId); }
}
