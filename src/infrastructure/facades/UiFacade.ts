/**
 * Presentation-layer UI port (15 §1-§4): menu construction, modal input and
 * alerts. The real facade goes through the GoogleApiWrapper UiService
 * (ServiceFactory) — never the native SpreadsheetApp/Browser globals.
 */
export interface MenuVoce {
  etichetta: string;
  funzione: string;
}

export interface IUiFacade {
  creaMenu(titolo: string, voci: MenuVoce[]): void;
  /** Modal input; returns the trimmed text, '' when cancelled or left empty (15 §4). */
  chiediInput(titolo: string, messaggio: string): string;
  mostraMessaggio(titolo: string, messaggio: string): void;
}

export class GasUiFacade implements IUiFacade {
  private readonly ui: LibUiService;
  private readonly logger: LoggerService;

  constructor(ui?: LibUiService, logger?: LoggerService) {
    this.ui = ui ?? ServiceFactory.getUiService();
    this.logger = logger ?? ServiceFactory.getLogger();
  }

  creaMenu(titolo: string, voci: MenuVoce[]): void {
    const menu = this.ui.createMenu(titolo);
    for (const voce of voci) menu.addItem(voce.etichetta, voce.funzione);
    menu.addToUi();
  }

  chiediInput(titolo: string, messaggio: string): string {
    return this.ui.prompt(titolo, messaggio).getResponseText().trim();
  }

  mostraMessaggio(titolo: string, messaggio: string): void {
    const normalized = messaggio.trim().toLowerCase();
    const safeMessage = PiiRedactor.redact(messaggio);
    if (normalized.startsWith('errore:')) {
      this.logger.error(safeMessage);
    } else if (normalized.includes('annullata')) {
      this.logger.warn(safeMessage);
    }
    this.ui.alert(titolo, messaggio);
  }
}
