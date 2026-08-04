// User-editable examples. This file remains readable in production as
// EntryPoints_User.gs.

declare function initAldo(now?: Date, props?: unknown): unknown;
declare function creaJobRunner(): JobRunnerService;
declare function avviaGenerazioneDataDriven(
  container: unknown,
  configId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function avviaInvioNotificheDataDriven(
  container: unknown,
  patternId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function menu_avvioImportazioneChunked(configId: string): void;

/** Example: launch document generation for CONF_DOC row "PAGELLE_1Q". */
function generaPagelle(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'PAGELLE_1Q',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "ASSENZE_SETTIMANALI". */
function inviaNotificaAssenze(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'ASSENZE_SETTIMANALI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: start resumable CONF_IMP recipe "IMPORT_ALUNNI". */
function importaAlunniChunked(): void {
  menu_avvioImportazioneChunked('IMPORT_ALUNNI');
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).generaPagelle = generaPagelle;
(globalThis as any).inviaNotificaAssenze = inviaNotificaAssenze;
(globalThis as any).importaAlunniChunked = importaAlunniChunked;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
