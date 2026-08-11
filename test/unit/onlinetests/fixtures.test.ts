import {
  ALL_CLASSI,
  ANNI_PRECEDENTI,
  ASSIGNMENT_DATE,
  CLASS_LAYOUTS,
  MATERIE_PER_INDIRIZZO,
  STUDENT_TOTALE,
  SUPPLENZA_FINE,
  SUPPLENZA_INIZIO,
} from '../../../src/onlinetests/data/fixtures';

describe('online-test shared fixture dataset', () => {
  it('contains the required classes and articulated sections', () => {
    expect(ALL_CLASSI.length).toBeGreaterThanOrEqual(10);
    expect(ALL_CLASSI.filter((classe) => classe.includes('-')).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(CLASS_LAYOUTS)).toHaveLength(ALL_CLASSI.length);
  });

  it('contains at least 200 students and eight subjects for every address', () => {
    expect(STUDENT_TOTALE).toBeGreaterThanOrEqual(200);
    expect(Object.values(MATERIE_PER_INDIRIZZO).every((materie) => materie.length >= 8)).toBe(true);
  });

  it('uses deterministic academic years and assignment dates', () => {
    expect(ANNI_PRECEDENTI).toEqual(['2025-2026', '2024-2025']);
    expect(ASSIGNMENT_DATE.toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(SUPPLENZA_INIZIO.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(SUPPLENZA_FINE.toISOString()).toBe('2026-10-15T23:59:59.000Z');
  });
});
