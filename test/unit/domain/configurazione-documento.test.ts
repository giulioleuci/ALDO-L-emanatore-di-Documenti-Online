import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis } from '../../../src/domain/value-objects/enums';
import { COL_CONF_DOC } from '../../../src/config/schema';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';

function config(overrides: Record<string, unknown> = {}): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    [COL_CONF_DOC.ID]: 'CD_X',
    [COL_CONF_DOC.GENERATORE]: 'CLASSE',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
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

describe('ConfigurazioneDocumento — GENERATORE/FORMATO validation', () => {
  const validRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    [COL_CONF_DOC.ID]: 'X',
    [COL_CONF_DOC.TIPO]: 'VERBALE',
    [COL_CONF_DOC.GENERATORE]: 'CLASSE',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
    ...overrides
  });

  it('accepts every documented GeneratoreAxis value', () => {
    for (const axis of Object.values(GeneratoreAxis)) {
      expect(ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: axis })).generatore).toBe(
        axis
      );
    }
  });

  it('rejects an unknown GENERATORE', () => {
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: 'BOH' }))).toThrow(
      ConfigurationError
    );
  });

  it('rejects a missing GENERATORE', () => {
    expect(() =>
      ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: undefined }))
    ).toThrow(ConfigurationError);
  });

  it('accepts GDOC/GSHEET and rejects PDF/TEXT/unknown FORMATO', () => {
    expect(ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: 'GSHEET' })).formato).toBe(
      'GSHEET'
    );
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: 'PDF' }))).toThrow(
      ConfigurationError
    );
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: undefined }))).toThrow(
      ConfigurationError
    );
  });

  it('rejects tabelleImportate=true on GSHEET', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "L'importazione tabelle è supportata unicamente su formato GDOC"
    );
  });

  it('rejects aggiungiMaterie truthy on GDOC', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'Le colonne materie sono supportate unicamente su formato GSHEET'
    );
  });

  it('rejects aggiungiMaterieConPermessi truthy on GDOC', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'Le colonne materie sono supportate unicamente su formato GSHEET'
    );
  });

  it('rejects aggiungiMaterie and aggiungiMaterieConPermessi both truthy', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true, aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi'
    );
  });

  it('rejects aggiungiMaterie on the DIPARTIMENTO axis', () => {
    const row = validRow({
      [COL_CONF_DOC.GENERATORE]: 'DIPARTIMENTO',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)"
    );
  });

  it('rejects aggiungiMaterieConPermessi on the DIPARTIMENTO axis', () => {
    const row = validRow({
      [COL_CONF_DOC.GENERATORE]: 'DIPARTIMENTO',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)"
    );
  });
});
