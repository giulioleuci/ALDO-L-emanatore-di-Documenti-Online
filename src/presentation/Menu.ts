import type { IUiFacade, MenuVoce } from '../infrastructure/facades/UiFacade';

/**
 * Presentation layer (15 §1-§4): NO business logic — collect input, validate
 * non-empty, open the monitoring sidebar, delegate to the data-driven
 * launcher. Menu wrappers never touch the database or the DI container
 * directly; the launcher closure does (built in index.ts over Bootstrap).
 */

export const MENU_TITOLO = 'AVVIA PROCESSI';

/** The three data-driven launchers (15 §3). */
export function vociMenu(): MenuVoce[] {
  return [
    { etichetta: 'GENERAZIONE DOCUMENTI', funzione: 'menu_avvioGenerazioneDocumenti' },
    { etichetta: 'COMUNICAZIONI EMAIL', funzione: 'menu_avvioComunicazioniEmail' },
    { etichetta: 'IMPORTAZIONI', funzione: 'menu_avvioImportazioni' }
  ];
}

/** onOpen body (15 §2): builds the menu only — no DB, no DI, no app logic. */
export function costruisciMenu(ui: IUiFacade): void {
  ui.creaMenu(MENU_TITOLO, vociMenu());
}

/**
 * The four-step wrapper scheme of 15 §4: input → validation → sidebar →
 * delegation. `avvia` receives the configuration id and must not be invoked
 * when the input is empty/cancelled.
 */
export function avvioPersonalizzato(
  ui: IUiFacade,
  titolo: string,
  promptId: string,
  jobPrefix: string,
  avvia: (configId: string) => void
): void {
  const configId = ui.chiediInput(titolo, promptId);
  if (configId === '') {
    ui.mostraMessaggio(titolo, 'Operazione annullata: nessun ID di configurazione fornito.');
    return;
  }
  ui.mostraSidebarMonitoraggio(`${jobPrefix}${configId}`, `Monitoraggio — ${titolo}`);
  try {
    avvia(configId);
  } catch (e) {
    ui.mostraMessaggio(titolo, `Errore: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function menuGenerazioneDocumenti(ui: IUiFacade, avvia: (configId: string) => void): void {
  avvioPersonalizzato(
    ui,
    'GENERAZIONE DOCUMENTI',
    "Inserisci l'ID di configurazione (CONF_DOC.ID):",
    'gen_',
    avvia
  );
}

export function menuComunicazioniEmail(ui: IUiFacade, avvia: (patternId: string) => void): void {
  avvioPersonalizzato(
    ui,
    'COMUNICAZIONI EMAIL',
    "Inserisci l'ID del pattern (CONF_MAIL.ID):",
    'mail_',
    avvia
  );
}

export function menuImportazioni(ui: IUiFacade, avvia: (configId: string) => void): void {
  avvioPersonalizzato(
    ui,
    'IMPORTAZIONI',
    "Inserisci l'ID di configurazione (CONF_IMP.ID):",
    'imp_',
    avvia
  );
}
