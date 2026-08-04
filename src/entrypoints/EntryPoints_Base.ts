// Base entry points. This file remains readable in production as
// EntryPoints_Base.gs.

declare function initAldo(now?: Date, props?: unknown): unknown;
declare function creaJobRunner(): JobRunnerService;
declare function avviaRetryEmailDataDriven(
  container: unknown,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function avviaImportazioneChunkedDataDriven(
  container: unknown,
  configId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function riprendiJobSospeso(
  container: unknown,
  runner: JobRunnerService,
  jobName?: string,
  maxDurationMs?: number
): unknown;

/** Maximum duration of each JobRunnerLib execution: 30 minutes. */
const MAX_JOB_EXECUTION_TIME_MS = 30 * 60 * 1000;

/** Lightweight deployment smoke check. */
function aldoPing(): string {
  return 'ALDO OK';
}

/** JobRunnerLib trigger target: resumes the job associated with this trigger. */
function resumeJob(): void {
  try {
    riprendiJobSospeso(initAldo(), creaJobRunner(), '', MAX_JOB_EXECUTION_TIME_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`resumeJob: ripresa job fallita — ${message}`);
  }
}

/** Starts retry of failed email sends; intended for a time-driven trigger. */
function menu_avvioRetryEmail(): void {
  avviaRetryEmailDataDriven(initAldo(), creaJobRunner(), MAX_JOB_EXECUTION_TIME_MS);
}

/** Starts a configured resumable import. Use a zero-argument User wrapper for triggers. */
function menu_avvioImportazioneChunked(configId: string): void {
  avviaImportazioneChunkedDataDriven(
    initAldo(),
    configId,
    creaJobRunner(),
    MAX_JOB_EXECUTION_TIME_MS
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).MAX_JOB_EXECUTION_TIME_MS = MAX_JOB_EXECUTION_TIME_MS;
(globalThis as any).aldoPing = aldoPing;
(globalThis as any).resumeJob = resumeJob;
(globalThis as any).menu_avvioRetryEmail = menu_avvioRetryEmail;
(globalThis as any).menu_avvioImportazioneChunked = menu_avvioImportazioneChunked;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
