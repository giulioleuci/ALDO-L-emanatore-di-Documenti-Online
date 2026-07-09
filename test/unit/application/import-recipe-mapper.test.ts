import { toLibraryRecipe, isGhostRecord } from '../../../src/application/import/ImportRecipeMapper';
import { ConfigurazioneImport } from '../../../src/domain/entities/ConfigurazioneImport';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

function conf(config: Record<string, unknown>, target = 'ALUNNI'): ConfigurazioneImport {
  return ConfigurazioneImport.fromData({ ID: 'IMPORT_ALUNNI', TARGET: target, CONFIG: JSON.stringify(config), ATTIVO: true });
}

describe('toLibraryRecipe (12 §3): ALDO CONF_IMP.CONFIG vocabulary -> GasDataImporter recipe', () => {
  test('FILE_SINGOLO + IGNORE maps to SheetById + INSERT_ONLY', () => {
    const recipe = toLibraryRecipe(conf({
      searchStrategy: 'FILE_SINGOLO', fileId: 'sheet123', map: { A: 'EMAIL', B: 'COGNOMENOME' },
      key: 'EMAIL', conflictResolution: 'IGNORE'
    }));
    expect(recipe).toEqual({
      name: 'IMPORT_ALUNNI',
      source: { type: 'SheetById', config: { sheetId: 'sheet123' } },
      transform: { mapping: { A: 'EMAIL', B: 'COGNOMENOME' } },
      load: { targetTable: 'ALUNNI', conflictResolution: 'INSERT_ONLY', conflictKey: 'EMAIL' }
    });
  });

  test('OVERWRITE maps straight through', () => {
    const recipe = toLibraryRecipe(conf({ searchStrategy: 'FILE_SINGOLO', fileId: 'x', key: 'EMAIL', conflictResolution: 'OVERWRITE' }));
    expect(recipe.load).toEqual({ targetTable: 'ALUNNI', conflictResolution: 'OVERWRITE', conflictKey: 'EMAIL' });
  });

  test('TIMESTAMP maps to UPSERT with updateIfNewer over CONFIG.timestampColumn', () => {
    const recipe = toLibraryRecipe(conf({
      searchStrategy: 'FILE_SINGOLO', fileId: 'x', key: 'EMAIL',
      conflictResolution: 'TIMESTAMP', timestampColumn: 'DATA_MODIFICA'
    }));
    expect(recipe.load).toEqual({
      targetTable: 'ALUNNI', conflictResolution: 'UPSERT', conflictKey: 'EMAIL',
      updateIfNewer: { enabled: true, timestampColumn: 'DATA_MODIFICA' }
    });
  });

  test('TIMESTAMP without timestampColumn is a configuration error', () => {
    expect(() => toLibraryRecipe(conf({ searchStrategy: 'FILE_SINGOLO', fileId: 'x', key: 'EMAIL', conflictResolution: 'TIMESTAMP' })))
      .toThrow(ConfigurationError);
  });

  test('CERCA_CARTELLE_CLASSE / CERCA_DOCUMENTI are explicitly deferred (typed error, not silent misbehaviour)', () => {
    expect(() => toLibraryRecipe(conf({ searchStrategy: 'CERCA_CARTELLE_CLASSE', key: 'ID', conflictResolution: 'IGNORE' })))
      .toThrow(/CERCA_CARTELLE_CLASSE/);
    expect(() => toLibraryRecipe(conf({ searchStrategy: 'CERCA_DOCUMENTI', key: 'ID', conflictResolution: 'IGNORE' })))
      .toThrow(/CERCA_DOCUMENTI/);
  });

  test('missing fileId under FILE_SINGOLO is a configuration error', () => {
    expect(() => toLibraryRecipe(conf({ searchStrategy: 'FILE_SINGOLO', key: 'EMAIL', conflictResolution: 'IGNORE' })))
      .toThrow(ConfigurationError);
  });
});

describe('isGhostRecord (12 §3): after mapping, before conflict handling', () => {
  test('all non-key/non-meta fields empty -> ghost', () => {
    expect(isGhostRecord({ EMAIL: 'a@x.it', COGNOMENOME: '', CLASSE: null }, ['EMAIL'], [])).toBe(true);
  });

  test('at least one populated non-key field -> not ghost', () => {
    expect(isGhostRecord({ EMAIL: 'a@x.it', COGNOMENOME: 'ROSSI', CLASSE: null }, ['EMAIL'], [])).toBe(false);
  });

  test('meta/timestamp columns are excluded from the emptiness check', () => {
    expect(isGhostRecord({ EMAIL: 'a@x.it', COGNOMENOME: '', DATA_MODIFICA: '2026-07-09' }, ['EMAIL'], ['DATA_MODIFICA'])).toBe(true);
  });

  test('composite key: every key column excluded, not just the first', () => {
    expect(isGhostRecord({ STUDENTE: 'a1', PROGRESSIVO: 1, NOTIFICATO: '', MATE: '' }, ['STUDENTE', 'PROGRESSIVO'], [])).toBe(true);
    expect(isGhostRecord({ STUDENTE: 'a1', PROGRESSIVO: 1, NOTIFICATO: '', MATE: '4' }, ['STUDENTE', 'PROGRESSIVO'], [])).toBe(false);
  });
});
