import { formatOggi } from '../../../../src/application/context-engine/dates';

test('formatOggi builds the canonical meta.oggi fields from a UTC date', () => {
  const d = new Date('2026-03-05T14:32:00Z');
  expect(formatOggi(d)).toEqual({
    breve: '05/03/2026',
    estesa: '05 marzo 2026',
    giorno: '05',
    mese: '03',
    meseNome: 'marzo',
    anno: '2026',
    ora: '14:32'
  });
});

test('formatOggi uses the Italian month name for every month (spot-check January and December)', () => {
  expect(formatOggi(new Date('2026-01-01T00:00:00Z')).estesa).toBe('01 gennaio 2026');
  expect(formatOggi(new Date('2026-12-31T23:59:00Z')).estesa).toBe('31 dicembre 2026');
});

test('formatOggi is timezone-independent: UTC components drive the output regardless of host TZ', () => {
  // 23:00 UTC on the 31st is still the 31st in the formatted output, never a
  // local-timezone-shifted next-day value.
  const d = new Date('2026-06-30T23:00:00Z');
  const out = formatOggi(d);
  expect(out.giorno).toBe('30');
  expect(out.breve).toBe('30/06/2026');
});
