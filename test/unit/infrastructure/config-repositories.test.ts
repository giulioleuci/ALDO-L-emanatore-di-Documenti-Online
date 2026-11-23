import { ConfigurazioneImportRepository } from '../../../src/infrastructure/repositories/ConfigurazioneImportRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { COL_CONF_MAIL } from '../../../src/config/schema';

function db() {
  return new FakeDatabase(fixtureTables());
}

test('CONF_MAIL repository fixtures explicitly store an empty ALLEGATI JSON array for every existing pattern', () => {
  const rows = fixtureTables().CONF_MAIL!;

  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(Object.values(COL_CONF_MAIL).sort());
    expect(row[COL_CONF_MAIL.ALLEGATI_STATICI]).toBe('[]');
  }
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
