// User-editable examples — pipeline composte (genera + invia). Remains readable
// in production as EntryPoints_User_5_Pipeline.gs (see EntryPoints_User_1_Doc.ts
// for the filename-ordinal note). initAldo/creaJobRunner and MAX_JOB_EXECUTION_TIME_MS
// come from EntryPoints_Base (shared GAS global scope).

declare function avviaGeneraEInviaPianiDataDriven(
  container: unknown,
  runner: JobRunnerService,
  maxDurationMs: number
): unknown;

/**
 * Generates every pending PIANI document, then sends CONF_MAIL "DOC_PERSONALIZZATI_COORDINATORI"
 * only to the coordinators of the classes of the plans generated in this run. If generation
 * suspends (resume trigger), no email is sent: rerun this function once it has finished.
 */
function GeneraEInviaPianiPersonalizzati(): void {
  const esito = avviaGeneraEInviaPianiDataDriven(
    initAldo(),
    creaJobRunner(),
    MAX_JOB_EXECUTION_TIME_MS
  );
  if (esito === null) {
    Logger.log('Generazione piani non completata: rilanciare GeneraEInviaPianiPersonalizzati.');
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).GeneraEInviaPianiPersonalizzati = GeneraEInviaPianiPersonalizzati;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
