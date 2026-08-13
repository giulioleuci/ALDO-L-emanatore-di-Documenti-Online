import { COL_CONF_DOC } from '../../../src/config/schema';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';

function config(overrides: Record<string, unknown> = {}): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    [COL_CONF_DOC.ID]: 'CD_X',
    ...overrides
  });
}

describe('ConfigurazioneDocumento.gestioneArticolazione', () => {
  test.each([
    ['missing column', undefined],
    ['empty Sheets cell', ''],
    ['an unrecognized value', 'BOH']
  ])('defaults to COMPLETA for %s', (_description, raw) => {
    expect(config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: raw }).gestioneArticolazione).toBe(
      GestioneArticolazione.COMPLETA
    );
  });

  test('reads ARTICOLATA explicitly', () => {
    expect(
      config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA' }).gestioneArticolazione
    ).toBe(GestioneArticolazione.ARTICOLATA);
  });

  test('round-trips through toData()', () => {
    expect(
      config({ [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA' }).toData()[
        COL_CONF_DOC.GESTIONE_ARTICOLAZIONE
      ]
    ).toBe('ARTICOLATA');
  });
});

describe('ConfigurazioneDocumento.PERMESSI', () => {
  test('parses the declared permission configuration', () => {
    const permessi = {
      file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
      regolaSupplente: { file: 'SOLO_SUPPLENTI' }
    };

    expect(
      config({ [COL_CONF_DOC.PERMESSI]: JSON.stringify(permessi) }).getPermessi()
    ).toEqual(permessi);
  });

  test.each([null, ''])('returns an empty object for an unset Sheets value %p', (raw) => {
    expect(config({ [COL_CONF_DOC.PERMESSI]: raw }).getPermessi()).toEqual({});
  });
});
