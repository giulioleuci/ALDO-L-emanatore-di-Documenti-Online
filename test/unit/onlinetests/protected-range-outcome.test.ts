import { classifySyntheticProtectedRangeOutcome } from '../../../src/onlinetests/checks/protectedRangeOutcome';

describe('classifySyntheticProtectedRangeOutcome', () => {
  test.each([
    {
      label: 'skips only zero persisted ranges for synthetic fixture editors in test mode',
      testMode: true,
      ranges: [],
      expectedEditors: ['teacher@onlinetest.aldo.local', 'COORDINATOR@ONLINETEST.ALDO.LOCAL'],
      skipped: true
    },
    {
      label: 'does not skip when any expected editor is real',
      testMode: true,
      ranges: [],
      expectedEditors: ['teacher@onlinetest.aldo.local', 'teacher@example.test'],
      skipped: false
    },
    {
      label: 'does not skip warning-only created ranges',
      testMode: true,
      ranges: [{ warningOnly: true }],
      expectedEditors: ['teacher@onlinetest.aldo.local'],
      skipped: false
    },
    {
      label: 'does not skip partially created ranges',
      testMode: true,
      ranges: [{ editors: { users: ['teacher@onlinetest.aldo.local'] } }],
      expectedEditors: ['teacher@onlinetest.aldo.local'],
      skipped: false
    },
    {
      label: 'does not skip a range missing an expected editor',
      testMode: true,
      ranges: [{ editors: { users: ['teacher@onlinetest.aldo.local'] } }],
      expectedEditors: ['teacher@onlinetest.aldo.local', 'coordinator@onlinetest.aldo.local'],
      skipped: false
    },
    {
      label: 'does not skip zero ranges outside test mode',
      testMode: false,
      ranges: [],
      expectedEditors: ['teacher@onlinetest.aldo.local'],
      skipped: false
    },
    {
      label: 'does not skip mixed or unexplained empty evidence',
      testMode: true,
      ranges: [],
      expectedEditors: [],
      skipped: false
    }
  ])('$label', ({ testMode, ranges, expectedEditors, skipped }) => {
    const outcome = classifySyntheticProtectedRangeOutcome(testMode, ranges, expectedEditors);

    expect(outcome?.status === 'skipped').toBe(skipped);
  });

  test('explains the invalid synthetic-principal API limitation', () => {
    const outcome = classifySyntheticProtectedRangeOutcome(
      true,
      [],
      ['teacher@onlinetest.aldo.local']
    );

    expect(outcome?.message).toContain('addProtectedRange');
    expect(outcome?.message).toContain('Utente non valido');
    expect(outcome?.message).toContain('@onlinetest.aldo.local');
  });
});
