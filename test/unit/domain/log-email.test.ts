import { LogEmail } from '../../../src/domain/entities/LogEmail';
import { StatoEmail } from '../../../src/domain/value-objects/enums';
import { COL_LOG_MAIL } from '../../../src/config/schema';

function log(overrides: Record<string, unknown> = {}): LogEmail {
  return new LogEmail({
    [COL_LOG_MAIL.PATTERN]: 'PATTERN_X',
    [COL_LOG_MAIL.DESTINATARI]: 'a@school.it, b@school.it',
    [COL_LOG_MAIL.DATA]: '2026-01-15T10:00:00.000Z',
    ...overrides
  });
}

describe('LogEmail construction and composite id', () => {
  test('builds the composite id from PATTERN::DESTINATARI::DATA when all three present', () => {
    const l = log();
    expect(l.id).toBe('PATTERN_X::a@school.it, b@school.it::2026-01-15T10:00:00.000Z');
  });

  test('id is null when any of PATTERN/DESTINATARI/DATA is missing', () => {
    expect(log({ [COL_LOG_MAIL.PATTERN]: '' }).id).toBeNull();
    expect(log({ [COL_LOG_MAIL.DESTINATARI]: '' }).id).toBeNull();
    expect(log({ [COL_LOG_MAIL.DATA]: '' }).id).toBeNull();
  });

  test('defaults: stato PENDING, errore empty string, allegati null when absent', () => {
    const l = new LogEmail({});
    expect(l.stato).toBe(StatoEmail.PENDING);
    expect(l.errore).toBe('');
    expect(l.getAllegati()).toEqual({});
  });
});

describe('LogEmail.getDestinatari', () => {
  test('splits and trims the CSV, dropping empty entries', () => {
    expect(log({ [COL_LOG_MAIL.DESTINATARI]: 'a@school.it, ,b@school.it ,' }).getDestinatari()).toEqual([
      'a@school.it',
      'b@school.it'
    ]);
  });

  test('empty DESTINATARI yields an empty array', () => {
    expect(log({ [COL_LOG_MAIL.DESTINATARI]: '' }).getDestinatari()).toEqual([]);
  });
});

describe('LogEmail.getAllegati', () => {
  test('parses the ALLEGATI JSON cell when present', () => {
    const l = log({ [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ doc1: 'link1' }) });
    expect(l.getAllegati()).toEqual({ doc1: 'link1' });
  });

  test('returns {} when ALLEGATI is absent', () => {
    expect(log().getAllegati()).toEqual({});
  });
});

describe('LogEmail.toData / fromData', () => {
  test('toData serializes every known column', () => {
    const l = log({
      [COL_LOG_MAIL.STATO]: StatoEmail.SUCCESS,
      [COL_LOG_MAIL.ERRORE]: '',
      [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ x: 1 })
    });
    expect(l.toData()).toEqual({
      [COL_LOG_MAIL.PATTERN]: 'PATTERN_X',
      [COL_LOG_MAIL.DESTINATARI]: 'a@school.it, b@school.it',
      [COL_LOG_MAIL.DATA]: '2026-01-15T10:00:00.000Z',
      [COL_LOG_MAIL.STATO]: StatoEmail.SUCCESS,
      [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({ x: 1 }),
      [COL_LOG_MAIL.ERRORE]: ''
    });
  });

  test('fromData is equivalent to the constructor', () => {
    const l = LogEmail.fromData({
      [COL_LOG_MAIL.PATTERN]: 'P',
      [COL_LOG_MAIL.DESTINATARI]: 'a@school.it',
      [COL_LOG_MAIL.DATA]: '2026-01-01'
    });
    expect(l).toBeInstanceOf(LogEmail);
    expect(l.id).toBe('P::a@school.it::2026-01-01');
  });
});
