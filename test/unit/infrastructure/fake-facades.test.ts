import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';

test('FakeDriveFacade findOrCreate + copy records calls', () => {
  const drive = new FakeDriveFacade();
  expect(drive.findFolderByPath('Verbali/5')).toBeNull();
  const folderId = drive.createFolder('Verbali/5');
  expect(drive.findFolderByPath('Verbali/5')).toBe(folderId);
  const fileId = drive.copyFile('tmpl_verbale', 'Verbale_5A_01/07/2026', folderId);
  expect(drive.copies).toHaveLength(1);
  expect(fileId).toMatch(/^file_/);
});

test('FakeTemplateEngine renders strings via the real vendored engine and records document renders', () => {
  const templates = new FakeTemplateEngine();
  const cdu = { focus: { classe: { anagrafica: { nome: '5A' } } } };
  expect(templates.processString('Verbale_{{focus.classe.anagrafica.nome}}', cdu)).toBe('Verbale_5A');
  templates.processDocument('file_1', cdu);
  expect(templates.contextFor('file_1')).toBe(cdu);
});
