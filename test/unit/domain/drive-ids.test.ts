import { DriveFileId, DriveFolderId } from '../../../src/domain/value-objects/DriveFileId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('DriveFileId non-empty + url (03)', () => {
  const f = DriveFileId.of('1abcXYZ');
  expect(f.value).toBe('1abcXYZ');
  expect(f.getUrl()).toBe('https://drive.google.com/file/d/1abcXYZ/view');
  expect(() => DriveFileId.of('')).toThrow(ValidationError);
});

test('DriveFolderId non-empty + url (03)', () => {
  const d = DriveFolderId.of('1folder');
  expect(d.getUrl()).toBe('https://drive.google.com/drive/folders/1folder');
});
