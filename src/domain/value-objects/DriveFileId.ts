import { ValidationError } from '../errors/DomainError';

export class DriveFileId {
  private constructor(public readonly value: string) {}
  static of(raw: string): DriveFileId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`DriveFileId vuoto`);
    }
    return new DriveFileId(raw.trim());
  }
  getUrl(): string {
    return `https://drive.google.com/file/d/${this.value}/view`;
  }
}

export class DriveFolderId {
  private constructor(public readonly value: string) {}
  static of(raw: string): DriveFolderId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`DriveFolderId vuoto`);
    }
    return new DriveFolderId(raw.trim());
  }
  getUrl(): string {
    return `https://drive.google.com/drive/folders/${this.value}`;
  }
}
