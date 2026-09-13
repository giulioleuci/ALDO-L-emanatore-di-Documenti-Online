import type { IUiFacade, MenuVoce } from '../infrastructure/facades/UiFacade';

/**
 * Presentation layer (15 §1-§4): NO business logic — collect input, validate
 * non-empty, open the monitoring sidebar, delegate to the data-driven
 * launcher. Menu wrappers never touch the database or the DI container
 * directly; the launcher closure does (built in index.ts over Bootstrap).
 */

export const MENU_TITOLO = 'AVVIA PROCESSI';

/** The six data-driven launchers (15 §3). */
export function vociMenu(): MenuVoce[] {
  return [
    { etichetta: 'GENERAZIONE DOCUMENTI', funzione: 'menu_avvioGenerazioneDocumenti' },
    { etichetta: 'COMUNICAZIONI EMAIL', funzione: 'menu_avvioComunicazioniEmail' },
    { etichetta: 'IMPORTAZIONI', funzione: 'menu_avvioImportazioni' },
    { etichetta: 'VALIDAZIONE DATABASE', funzione: 'menu_validazioneDatabase' },
    { etichetta: 'BLOCCA DOCUMENTI', funzione: 'menu_bloccaDocumenti' },
    { etichetta: 'ESEGUI AZIONI', funzione: 'menu_esecuzioneAzioni' }
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

export const PAROLA_CONFERMA = 'CONFERMA';

/**
 * Wrapper scheme for launchers that take no configuration id but DO need an
 * explicit go-ahead (15 §4 variant): typed confirmation → delegation → outcome
 * message. Typed rather than a yes/no dialog because `IUiFacade` exposes no
 * button-set prompt and the native `SpreadsheetApp.getUi().ButtonSet` enum is
 * off-limits to ALDO code.
 */
export function avvioConConferma(
  ui: IUiFacade,
  titolo: string,
  domanda: string,
  esegui: () => string
): void {
  const risposta = ui.chiediInput(titolo, `${domanda}\n\nScrivi ${PAROLA_CONFERMA} per procedere.`);
  if (risposta.toUpperCase() !== PAROLA_CONFERMA) {
    ui.mostraMessaggio(titolo, 'Operazione annullata.');
    return;
  }
  try {
    ui.mostraMessaggio(titolo, esegui());
  } catch (e) {
    ui.mostraMessaggio(titolo, `Errore: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function menuValidazioneDatabase(ui: IUiFacade, esegui: () => string): void {
  avvioConConferma(
    ui,
    'VALIDAZIONE DATABASE',
    "Verificare l'integrità del database dell'anno corrente?",
    esegui
  );
}

export function menuBloccaDocumenti(ui: IUiFacade, esegui: () => string): void {
  avvioConConferma(
    ui,
    'BLOCCA DOCUMENTI',
    "Tutti i permessi di scrittura sui documenti dell'anno corrente saranno declassati a sola lettura. L'operazione NON è reversibile dal sistema. Se l'operazione supera il tempo massimo di esecuzione, è possibile rilanciarla: i documenti già elaborati verranno saltati automaticamente.",
    esegui
  );
}

export const PAROLA_TUTTE = 'TUTTE';

/**
 * Wrapper for the CONF_AZIONI launcher (15 §4 variant): the prompt lists the
 * enabled actions and accepts either one ID or TUTTE. Still logic-free — the
 * list and the launcher closure are both supplied by the caller.
 */
export function menuEsecuzioneAzioni(
  ui: IUiFacade,
  attive: Array<{ id: string; tipo: string }>,
  avvia: (azioneIds: string[]) => void
): void {
  const titolo = 'ESEGUI AZIONI';
  if (attive.length === 0) {
    ui.mostraMessaggio(titolo, 'Operazione annullata: nessuna azione attiva in CONF_AZIONI.');
    return;
  }
  const elenco = attive.map((a) => `• ${a.id} (${a.tipo})`).join('\n');
  const scelta = ui.chiediInput(
    titolo,
    `Azioni attive:\n${elenco}\n\nScrivi un ID, oppure ${PAROLA_TUTTE} per eseguirle tutte.`
  );
  if (scelta === '') {
    ui.mostraMessaggio(titolo, 'Operazione annullata: nessuna azione selezionata.');
    return;
  }
  const tutte = scelta.toUpperCase() === PAROLA_TUTTE;
  if (!tutte && !attive.some((a) => a.id === scelta)) {
    ui.mostraMessaggio(titolo, `Azione "${scelta}" non trovata tra quelle attive.`);
    return;
  }
  const ids = tutte ? attive.map((a) => a.id) : [scelta];
  ui.mostraSidebarMonitoraggio(`azioni_${tutte ? PAROLA_TUTTE : scelta}`, `Monitoraggio — ${titolo}`);
  try {
    avvia(ids);
  } catch (e) {
    ui.mostraMessaggio(titolo, `Errore: ${e instanceof Error ? e.message : String(e)}`);
  }
}
