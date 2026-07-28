import { COL_CONF_MAIL } from '../../../src/config/schema';
import { ConfigurazioneEmail } from '../../../src/domain/entities/ConfigurazioneEmail';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

function config(overrides: Record<string, unknown> = {}): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    [COL_CONF_MAIL.ID]: 'PATTERN_X',
    ...overrides
  });
}

describe('ConfigurazioneEmail.getAllegati', () => {
  test.each([
    ['empty Sheets cell', ''],
    ['null cell', null],
    ['empty JSON array', JSON.stringify([])]
  ])('returns no attachments for an %s', (_description, raw) => {
    expect(config({ [COL_CONF_MAIL.ALLEGATI]: raw }).getAllegati()).toEqual([]);
  });

  test('parses attachment IDs in their configured order, retaining the first duplicate', () => {
    const raw = JSON.stringify(['doc-2', 'doc-1', 'doc-2', 'doc-3', 'doc-1']);

    const email = config({ [COL_CONF_MAIL.ALLEGATI]: raw });

    expect(email.getAllegati()).toEqual(['doc-2', 'doc-1', 'doc-3']);
    expect(email.toData()[COL_CONF_MAIL.ALLEGATI]).toBe(raw);
  });

  test.each([
    ['invalid JSON', 'not JSON'],
    ['a non-array JSON value', JSON.stringify({ id: 'doc-1' })],
    ['an empty attachment ID', JSON.stringify(['doc-1', ''])],
    ['a non-string attachment ID', JSON.stringify(['doc-1', 2])],
    ['a non-string cell value', 42]
  ])('throws ConfigurationError for %s', (_description, raw) => {
    expect(() => config({ [COL_CONF_MAIL.ALLEGATI]: raw }).getAllegati()).toThrow(
      ConfigurationError
    );
  });
});
