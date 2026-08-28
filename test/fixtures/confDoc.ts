import { ConfigurazioneDocumento } from '../../src/domain/entities/ConfigurazioneDocumento';
import { COL_CONF_DOC } from '../../src/config/schema';

/** Minimal valid CONF_DOC row (CLASSE/GDOC), overridden per test. */
export function confDocFixture(overrides: Record<string, unknown>): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    [COL_CONF_DOC.ID]: 'X',
    [COL_CONF_DOC.TIPO]: 'T',
    [COL_CONF_DOC.GENERATORE]: 'CLASSE',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
    ...overrides
  });
}
