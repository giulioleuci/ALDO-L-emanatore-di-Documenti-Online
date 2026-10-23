/** Skipped-target tally per reason (e.g. "CONDIZIONE non soddisfatta" → 12), carried in batch checkpoints across resumes. */
export type Saltati = Record<string, number>;

export function totaleSaltati(saltati: Saltati | undefined): number {
  return Object.values(saltati ?? {}).reduce((a, b) => a + b, 0);
}

/** End-of-job report lines, one per reason: "CONDIZIONE non soddisfatta ×12". */
export function dettagliSaltati(saltati: Saltati): string[] {
  return Object.entries(saltati).map(([motivo, n]) => `${motivo} ×${n}`);
}
