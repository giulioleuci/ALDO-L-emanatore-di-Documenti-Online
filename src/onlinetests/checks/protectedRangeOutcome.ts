import { skippedOutcome, type OnlineTestSkippedOutcome } from '../report/OnlineTestReport';

const SYNTHETIC_DOMAIN = '@onlinetest.aldo.local';

/**
 * Classifies the sole non-applicable protected-range outcome: Google Sheets
 * rejects every synthetic fixture principal, leaving no persisted range to read
 * back. Any persisted range, real principal, or non-test execution remains
 * strict and is deliberately left to the caller's assertions.
 */
export function classifySyntheticProtectedRangeOutcome(
  testMode: boolean,
  ranges: readonly unknown[],
  expectedEditors: readonly string[]
): OnlineTestSkippedOutcome | undefined {
  if (
    testMode === true &&
    ranges.length === 0 &&
    expectedEditors.length > 0 &&
    expectedEditors.every((email) => email.toLowerCase().endsWith(SYNTHETIC_DOMAIN))
  ) {
    return skippedOutcome(
      `Google Sheets rifiuta addProtectedRange con gli editor sintetici ${SYNTHETIC_DOMAIN}: Utente non valido.`
    );
  }
  return undefined;
}
