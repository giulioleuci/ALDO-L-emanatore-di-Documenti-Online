import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ConfigurazioneEmailRepository } from '../../../src/infrastructure/repositories/ConfigurazioneEmailRepository';
import { ConfigurazioneImportRepository } from '../../../src/infrastructure/repositories/ConfigurazioneImportRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ProcessoInvio } from '../../../src/domain/value-objects/enums';

function db() { return new FakeDatabase(fixtureTables()); }

test('CONF_DOC: findByTipo + simple-form template id + condition/overwrite (06 §8)', () => {
  const r = new ConfigurazioneDocumentoRepository(db());
  const verbali = r.findByTipo('VERBALE');
  expect(verbali.map((c) => c.id)).toEqual(['CD1', 'CD_ESAME']);
  const cd1 = verbali.find((c) => c.id === 'CD1')!;
  expect(r.getTemplateId(cd1)).toBe('tmpl_verbale');
  expect(cd1.hasNoCondizione()).toBe(true);
  expect(cd1.isOverwrite()).toBe(false);
  expect(r.findByTipo('NOPE')).toEqual([]);
});

test('CONF_MAIL: findByProcesso + boxes + header default + noreply (06 §9)', () => {
  const r = new ConfigurazioneEmailRepository(db());
  const cdc = r.findByProcesso(ProcessoInvio.PER_CDC);
  expect(cdc.map((c) => c.id)).toEqual(['CDC_OTTOBRE']);
  expect(r.getBoxes(cdc[0]!)).toEqual([{ TIPO_BOX: 'carenze' }]);
  expect(cdc[0]!.getColoreHeader()).toBe('#007bff'); // default
  expect(cdc[0]!.isNoreply()).toBe(true);

  const fam = r.findByProcesso(ProcessoInvio.PER_GENITORI_ALUNNO)[0]!;
  expect(fam.getColoreHeader()).toBe('#ff0000');
  expect(fam.getBoxes()).toEqual([]); // null BOX_CFG
  expect(fam.getCondizione()).toBe('carenze > 0');
});

test('CONF_IMP: findAttivi + findByTarget + config parse (06 §10)', () => {
  const r = new ConfigurazioneImportRepository(db());
  expect(r.findAttivi().map((c) => c.id)).toEqual(['IMPORT_ALUNNI']);
  expect(r.findByTarget('ALUNNI')[0]!.getConfig()).toMatchObject({ searchStrategy: 'FILE_SINGOLO', fileId: 'sheet_alunni' });
  expect(r.findByTarget('DOCENTI')[0]!.getConfig()).toEqual({});
});

test('findById works after the list-cache is populated (regression: local cache field name must not shadow Repository.cache)', () => {
  // findAttivi() populates the repository's OWN list cache; findById() then goes
  // through the DomainRepositoryLib base class, which owns an unrelated `cache`
  // slot. If both used the field name `cache`, the local array would silently
  // overwrite the base's CacheService slot and findById would throw.
  const r = new ConfigurazioneImportRepository(db());
  r.findAttivi();
  expect(r.findById('IMPORT_ALUNNI')?.target).toBe('ALUNNI');
});
