import type { IUiFacade, MenuVoce } from '../../src/infrastructure/facades/UiFacade';

/** Records UI interactions; `rispsoteInput` is consumed FIFO by chiediInput ('' = cancel). */
export class FakeUiFacade implements IUiFacade {
  public readonly menus: Array<{ titolo: string; voci: MenuVoce[] }> = [];
  public readonly messaggi: Array<{ titolo: string; messaggio: string }> = [];
  public readonly sidebars: Array<{ jobId: string; titolo: string }> = [];
  public readonly risposteInput: string[] = [];

  creaMenu(titolo: string, voci: MenuVoce[]): void {
    this.menus.push({ titolo, voci });
  }

  chiediInput(): string {
    return this.risposteInput.shift() ?? '';
  }

  mostraMessaggio(titolo: string, messaggio: string): void {
    this.messaggi.push({ titolo, messaggio });
  }

  mostraSidebarMonitoraggio(jobId: string, titolo: string): void {
    this.sidebars.push({ jobId, titolo });
  }
}
