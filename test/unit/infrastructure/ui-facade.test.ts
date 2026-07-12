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
  });

  it('mostraMessaggio delegates to ui.alert', () => {
    const ui = fakeUi();
    new GasUiFacade(ui as never, { info: jest.fn() } as never).mostraMessaggio('T', 'M');
    expect(ui.alert).toHaveBeenCalledWith('T', 'M', undefined);
  });

  it('falls back to ServiceFactory.getUiService()/getLogger() when nothing is injected', () => {
    const ui = fakeUi();
    const uiSpy = jest.spyOn(ServiceFactory, 'getUiService').mockReturnValue(ui as never);
    const logSpy = jest.spyOn(ServiceFactory, 'getLogger').mockReturnValue({ info: jest.fn() } as never);

    new GasUiFacade().mostraMessaggio('T', 'M');
    expect(uiSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();

    uiSpy.mockRestore();
    logSpy.mockRestore();
  });
});
