// Custom-menu entry points. This file remains readable in production as
// EntryPoints_Menu.gs.

declare function initAldo(now?: Date, props?: unknown): unknown;
declare function creaJobRunner(): JobRunnerService;
declare function costruisciMenu(ui: unknown): void;
declare function menuGenerazioneDocumenti(ui: unknown, avvia: (configId: string) => void): void;
declare function menuComunicazioniEmail(ui: unknown, avvia: (patternId: string) => void): void;
declare function menuImportazioni(ui: unknown, avvia: (configId: string) => void): void;
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
declare function avviaImportazioneDataDriven(container: unknown, configId: string): unknown;
declare function menuValidazioneDatabase(ui: unknown, esegui: () => string): void;
declare function avviaValidazioneDatabase(container: unknown): {
  violazioni: unknown[];
  spreadsheetId: string;
  nome: string;
};
declare const GasUiFacade: new () => unknown;

/** Builds the MASTER spreadsheet's custom menu; no container is initialized here. */
function onOpen(): void {
  costruisciMenu(new GasUiFacade());
}

/** Prompts for a CONF_DOC.ID, then starts batch document generation. */
function menu_avvioGenerazioneDocumenti(): void {
  menuGenerazioneDocumenti(new GasUiFacade(), (configId) =>
    avviaGenerazioneDataDriven(
      initAldo(),
      configId,
      creaJobRunner(),
      (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
    )
  );
}

/** Prompts for a CONF_MAIL.ID, then starts a mass email send. */
function menu_avvioComunicazioniEmail(): void {
  menuComunicazioniEmail(new GasUiFacade(), (patternId) =>
    avviaInvioNotificheDataDriven(
      initAldo(),
      patternId,
      creaJobRunner(),
      (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
    )
  );
}

/** Prompts for a CONF_IMP.ID, then runs its synchronous import. */
function menu_avvioImportazioni(): void {
  menuImportazioni(new GasUiFacade(), (configId) =>
    avviaImportazioneDataDriven(initAldo(), configId)
  );
}

/** Validates the current year's database and writes the report sheet (Feature 2). */
function menu_validazioneDatabase(): void {
  menuValidazioneDatabase(new GasUiFacade(), () => {
    const esito = avviaValidazioneDatabase(initAldo());
    return esito.violazioni.length === 0
      ? `Nessun errore rilevato. Report: ${esito.nome}`
      : `${esito.violazioni.length} violazioni. Report: ${esito.nome}`;
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).onOpen = onOpen;
(globalThis as any).menu_avvioGenerazioneDocumenti = menu_avvioGenerazioneDocumenti;
(globalThis as any).menu_avvioComunicazioniEmail = menu_avvioComunicazioniEmail;
(globalThis as any).menu_avvioImportazioni = menu_avvioImportazioni;
(globalThis as any).menu_validazioneDatabase = menu_validazioneDatabase;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
