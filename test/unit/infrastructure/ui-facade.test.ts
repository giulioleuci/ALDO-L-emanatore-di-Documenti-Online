import { GasUiFacade } from '../../../src/infrastructure/facades/UiFacade';

function fakeUi() {
  const menu = { addItem: jest.fn(), addToUi: jest.fn() };
  return {
    createMenu: jest.fn().mockReturnValue(menu),
    prompt: jest.fn().mockReturnValue({ getResponseText: () => '  hi  ' }),
    alert: jest.fn(),
    __menu: menu
  };
}

describe('GasUiFacade', () => {
  it('creaMenu adds every voce and calls addToUi', () => {
    const ui = fakeUi();
    new GasUiFacade(ui as never, { info: jest.fn() } as never).creaMenu('Titolo', [
      { etichetta: 'A', funzione: 'fnA' },
      { etichetta: 'B', funzione: 'fnB' }
    ]);
    expect(ui.createMenu).toHaveBeenCalledWith('Titolo');
    expect(ui.__menu.addItem).toHaveBeenNthCalledWith(1, 'A', 'fnA');
    expect(ui.__menu.addItem).toHaveBeenNthCalledWith(2, 'B', 'fnB');
    expect(ui.__menu.addToUi).toHaveBeenCalled();
  });

  it('chiediInput trims the response text', () => {
    const ui = fakeUi();
    const result = new GasUiFacade(ui as never, { info: jest.fn() } as never).chiediInput('T', 'M');
    expect(result).toBe('hi');
    expect(ui.prompt).toHaveBeenCalledWith('T', 'M');
  });

  it('mostraMessaggio delegates to ui.alert', () => {
    const ui = fakeUi();
    new GasUiFacade(ui as never, { info: jest.fn() } as never).mostraMessaggio('T', 'M');
    expect(ui.alert).toHaveBeenCalledWith('T', 'M', undefined);
  });

  it('logs cancellation warnings and errors with default level formatting', () => {
    const lines: string[] = [];
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation((line) => {
      lines.push(String(line));
    });
    const facade = new GasUiFacade(fakeUi() as never, new LoggerService());

    facade.mostraMessaggio('Importazioni', 'Operazione annullata: nessun ID fornito.');
    facade.mostraMessaggio('Importazioni', 'Errore: configurazione non trovata.');

    expect(lines).toContain('[WARN] Operazione annullata: nessun ID fornito.');
    expect(lines).toContain('[ERROR] Errore: configurazione non trovata.');
    logSpy.mockRestore();
  });

  it('falls back to ServiceFactory.getUiService()/getLogger() when nothing is injected', () => {
    const ui = fakeUi();
    const uiSpy = jest.spyOn(ServiceFactory, 'getUiService').mockReturnValue(ui as never);
    const logSpy = jest
      .spyOn(ServiceFactory, 'getLogger')
      .mockReturnValue({ info: jest.fn() } as never);

    new GasUiFacade().mostraMessaggio('T', 'M');
    expect(uiSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();

    uiSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('uses the standard logger whose UI diagnostics carry WARN/ERROR levels', () => {
    const lines: string[] = [];
    jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
    const logger = new LoggerService();

    new GasUiFacade(fakeUi() as never, logger);
    logger.warn('UI warning');
    logger.error('UI error');

    expect(lines).toContain('[WARN] UI warning');
    expect(lines).toContain('[ERROR] UI error');
  });
});
