import { toLibraryRecipe, isGhostRecord } from '../../../src/application/import/ImportRecipeMapper';
import { ConfigurazioneImport } from '../../../src/domain/entities/ConfigurazioneImport';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

function conf(config: Record<string, unknown>, target = 'ALUNNI'): ConfigurazioneImport {
  return ConfigurazioneImport.fromData({
    ID: 'IMPORT_ALUNNI',
    TARGET: target,
    CONFIG: JSON.stringify(config),
    ATTIVO: true
  });
}

describe('toLibraryRecipe (12 §3): ALDO CONF_IMP.CONFIG vocabulary -> GasDataImporter recipe', () => {
  test('FILE_SINGOLO + IGNORE maps to SheetById + INSERT_ONLY', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'FILE_SINGOLO',
        fileId: 'sheet123',
        map: { A: 'EMAIL', B: 'COGNOMENOME' },
        key: 'EMAIL',
        conflictResolution: 'IGNORE'
      })
    );
    expect(recipe).toEqual({
      name: 'IMPORT_ALUNNI',
      source: { type: 'SheetById', config: { sheetId: 'sheet123' } },
      transform: { mapping: { A: 'EMAIL', B: 'COGNOMENOME' } },
      load: { targetTable: 'ALUNNI', conflictResolution: 'INSERT_ONLY', conflictKey: 'EMAIL' }
    });
  });

  test('FILE_SINGOLO preserves explicit tab, range and no-header extraction options', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'FILE_SINGOLO',
        fileId: 'sheet123',
        tabName: 'Import senza intestazioni',
        range: 'A2:C10',
        hasHeaders: false,
        key: 'STUDENTE',
        conflictResolution: 'OVERWRITE'
      })
    );

    expect(recipe.source).toEqual({
      type: 'SheetById',
      config: {
        sheetId: 'sheet123',
        tabName: 'Import senza intestazioni',
        range: 'A2:C10',
        hasHeaders: false
      }
    });
  });

  test('OVERWRITE maps straight through', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'FILE_SINGOLO',
        fileId: 'x',
        key: 'EMAIL',
        conflictResolution: 'OVERWRITE'
      })
    );
    expect(recipe.load).toEqual({
      targetTable: 'ALUNNI',
      conflictResolution: 'OVERWRITE',
      conflictKey: 'EMAIL'
    });
  });

  test('TIMESTAMP maps to UPSERT with updateIfNewer over CONFIG.timestampColumn', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'FILE_SINGOLO',
        fileId: 'x',
        key: 'EMAIL',
        conflictResolution: 'TIMESTAMP',
        timestampColumn: 'DATA_MODIFICA'
      })
    );
    expect(recipe.load).toEqual({
      targetTable: 'ALUNNI',
      conflictResolution: 'UPSERT',
      conflictKey: 'EMAIL',
      updateIfNewer: { enabled: true, timestampColumn: 'DATA_MODIFICA' }
    });
  });

  test('TIMESTAMP without timestampColumn is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'FILE_SINGOLO',
          fileId: 'x',
          key: 'EMAIL',
          conflictResolution: 'TIMESTAMP'
        })
      )
    ).toThrow(ConfigurationError);
  });

  test('CERCA_CARTELLE_CLASSE maps to the custom source with folderTipo', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'CERCA_CARTELLE_CLASSE',
        folderTipo: 'GRIGLIE_VOTI',
        key: 'ID',
        conflictResolution: 'IGNORE'
      })
    );
    expect(recipe.source).toEqual({
      type: 'CERCA_CARTELLE_CLASSE',
      config: {
        folderTipo: 'GRIGLIE_VOTI',
        tabName: undefined,
        range: undefined,
        hasHeaders: undefined
      }
    });
  });

  test('CERCA_CARTELLE_CLASSE without folderTipo is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({ searchStrategy: 'CERCA_CARTELLE_CLASSE', key: 'ID', conflictResolution: 'IGNORE' })
      )
    ).toThrow(ConfigurationError);
  });

  test('CERCA_DOCUMENTI maps to the custom source with idGen/tipo/stato', () => {
    const recipe = toLibraryRecipe(
      conf({
        searchStrategy: 'CERCA_DOCUMENTI',
        idGen: 'CD_GRIGLIE',
        tipo: 'GRIGLIA',
        stato: 'GENERATO',
        key: 'ID',
        conflictResolution: 'IGNORE'
      })
    );
    expect(recipe.source).toEqual({
      type: 'CERCA_DOCUMENTI',
      config: {
        idGen: 'CD_GRIGLIE',
        tipo: 'GRIGLIA',
        stato: 'GENERATO',
        tabName: undefined,
        range: undefined,
        hasHeaders: undefined
      }
    });
  });

  test('CERCA_DOCUMENTI without idGen is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({ searchStrategy: 'CERCA_DOCUMENTI', key: 'ID', conflictResolution: 'IGNORE' })
      )
    ).toThrow(ConfigurationError);
  });

  test('missing fileId under FILE_SINGOLO is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({ searchStrategy: 'FILE_SINGOLO', key: 'EMAIL', conflictResolution: 'IGNORE' })
      )
    ).toThrow(ConfigurationError);
  });

  test('blank fileId under FILE_SINGOLO is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'FILE_SINGOLO',
          fileId: '   ',
          key: 'EMAIL',
          conflictResolution: 'IGNORE'
        })
      )
    ).toThrow(/CONFIG.fileId obbligatorio/);
  });

  test('blank folderTipo under CERCA_CARTELLE_CLASSE is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'CERCA_CARTELLE_CLASSE',
          folderTipo: '  ',
          key: 'ID',
          conflictResolution: 'IGNORE'
        })
      )
    ).toThrow(/CONFIG.folderTipo obbligatorio/);
  });

  test('blank idGen under CERCA_DOCUMENTI is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'CERCA_DOCUMENTI',
          idGen: '  ',
          key: 'ID',
          conflictResolution: 'IGNORE'
        })
      )
    ).toThrow(/CONFIG.idGen obbligatorio/);
  });

  test('an unknown searchStrategy is a configuration error (default case)', () => {
    expect(() =>
      toLibraryRecipe(
        conf({ searchStrategy: 'STRATEGIA_INESISTENTE', key: 'ID', conflictResolution: 'IGNORE' })
      )
    ).toThrow(/strategia sorgente "STRATEGIA_INESISTENTE" sconosciuta/);
  });

  test('missing CONFIG.key is a configuration error (validated before source strategy is dispatched)', () => {
    expect(() =>
      toLibraryRecipe(
        conf({ searchStrategy: 'FILE_SINGOLO', fileId: 'x', conflictResolution: 'IGNORE' })
      )
    ).toThrow(/CONFIG.key obbligatorio/);
  });

  test('blank CONFIG.key is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'FILE_SINGOLO',
          fileId: 'x',
          key: '   ',
          conflictResolution: 'IGNORE'
        })
      )
    ).toThrow(/CONFIG.key obbligatorio/);
  });

  test('missing CONFIG.conflictResolution is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(conf({ searchStrategy: 'FILE_SINGOLO', fileId: 'x', key: 'EMAIL' }))
    ).toThrow(/CONFIG.conflictResolution obbligatorio/);
  });

  test('TIMESTAMP with a blank timestampColumn is a configuration error', () => {
    expect(() =>
      toLibraryRecipe(
        conf({
          searchStrategy: 'FILE_SINGOLO',
          fileId: 'x',
          key: 'EMAIL',
          conflictResolution: 'TIMESTAMP',
          timestampColumn: '   '
        })
      )
    ).toThrow(/CONFIG.timestampColumn obbligatorio per conflictResolution TIMESTAMP/);
  });
});

describe('isGhostRecord (12 §3): after mapping, before conflict handling', () => {
  test('all non-key/non-meta fields empty -> ghost', () => {
    expect(isGhostRecord({ EMAIL: 'a@x.it', COGNOMENOME: '', CLASSE: null }, ['EMAIL'], [])).toBe(
      true
    );
  });

  test('at least one populated non-key field -> not ghost', () => {
    expect(
      isGhostRecord({ EMAIL: 'a@x.it', COGNOMENOME: 'ROSSI', CLASSE: null }, ['EMAIL'], [])
    ).toBe(false);
  });

  test('meta/timestamp columns are excluded from the emptiness check', () => {
    expect(
      isGhostRecord(
        { EMAIL: 'a@x.it', COGNOMENOME: '', DATA_MODIFICA: '2026-07-09' },
        ['EMAIL'],
        ['DATA_MODIFICA']
      )
    ).toBe(true);
  });

  test('composite key: every key column excluded, not just the first', () => {
    expect(
      isGhostRecord(
        { STUDENTE: 'a1', PROGRESSIVO: 1, NOTIFICATO: '', MATE: '' },
        ['STUDENTE', 'PROGRESSIVO'],
        []
      )
    ).toBe(true);
    expect(
      isGhostRecord(
        { STUDENTE: 'a1', PROGRESSIVO: 1, NOTIFICATO: '', MATE: '4' },
        ['STUDENTE', 'PROGRESSIVO'],
        []
      )
    ).toBe(false);
  });

  test('una colonna utente _ non salva una riga fantasma', () => {
    const row = { EMAIL: '', NOME: '', _NOTE_MIE: 'appunto' };
    expect(isGhostRecord(row, ['EMAIL'], [])).toBe(true);
  });
});
