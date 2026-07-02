import { TABLE, COL_CLASSI, COL_LOG_DOCS } from '../../../src/config/schema';

test('table names match 01_SCHEMA_DATABASE.md (UPPERCASE)', () => {
  expect(TABLE.CLASSI).toBe('CLASSI');
  expect(TABLE.LOG_DOCS).toBe('LOG_DOCS');
  expect(TABLE.CONF_DOC).toBe('CONF_DOC');
});

test('CLASSI/LOG_DOCS columns are exact', () => {
  expect(COL_CLASSI.ID).toBe('ID');
  expect(COL_LOG_DOCS.STATO).toBe('STATO');
  expect(COL_LOG_DOCS.ID_GEN).toBe('ID_GEN');
});
