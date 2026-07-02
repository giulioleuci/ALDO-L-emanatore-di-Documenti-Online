import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../../../test/fakes/FakeDocumentFacade';

test('FakeDriveFacade findOrCreate + copy records calls', () => {
  const drive = new FakeDriveFacade();
  expect(drive.findFolderByPath('Verbali/5')).toBeNull();
  const folderId = drive.createFolder('Verbali/5');
  expect(drive.findFolderByPath('Verbali/5')).toBe(folderId);
  const fileId = drive.copyFile('tmpl_verbale', 'Verbale_5A_01/07/2026', folderId);
  expect(drive.copies).toHaveLength(1);
  expect(fileId).toMatch(/^file_/);
});

test('FakeDocumentFacade stores last replacements', () => {
  const doc = new FakeDocumentFacade();
  doc.replaceText('file_1', { '{{focus.classe.anagrafica.nome}}': '5A' });
  expect(doc.replacementsFor('file_1')['{{focus.classe.anagrafica.nome}}']).toBe('5A');
});
