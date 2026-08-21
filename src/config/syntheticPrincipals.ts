/**
 * Identifies the synthetic `@onlinetest.aldo.local` principals seeded by the online-test
 * fixtures. Lives here (rather than in `src/onlinetests`) so production code — which must
 * never depend on the online-test-only webpack entry — can recognise them too: Sheets
 * rejects every `addProtectedRange` call naming one, and paying for the resulting
 * retry/backoff cycle on every online run is pure waste (2026-08-21 batch 3).
 */
export const SYNTHETIC_DOMAIN = '@onlinetest.aldo.local';

export function isSyntheticPrincipal(email: string): boolean {
  return email.toLowerCase().endsWith(SYNTHETIC_DOMAIN);
}
