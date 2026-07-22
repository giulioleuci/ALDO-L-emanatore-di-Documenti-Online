jest.mock('../../src/config/Bootstrap', () => ({
  initAldo: jest.fn(),
  creaJobRunner: jest.fn(() => ({})),
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  avviaImportazioneDataDriven: jest.fn(),
  riprendiJobSospeso: jest.fn(),
  PROP_MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID'
}));
jest.mock('../../src/presentation/Menu', () => ({
  costruisciMenu: jest.fn(),
  menuGenerazioneDocumenti: jest.fn(),
  menuComunicazioniEmail: jest.fn(),
  menuImportazioni: jest.fn()
}));
jest.mock('../../src/infrastructure/facades/UiFacade', () => ({ GasUiFacade: jest.fn() }));
jest.mock('../../src/infrastructure/facades/PropertiesFacade', () => ({
  ScriptPropertiesFacade: jest.fn().mockImplementation(() => ({
    set: jest.fn()
  }))
}));

import { aldoPing, resumeJob, impostaMasterSpreadsheetId } from '../../src/index';
import { initAldo, riprendiJobSospeso } from '../../src/config/Bootstrap';
import { ScriptPropertiesFacade } from '../../src/infrastructure/facades/PropertiesFacade';

test('aldoPing returns readiness string', () => {
  expect(aldoPing()).toBe('ALDO OK');
});

describe('resumeJob', () => {
  test('logs and does not throw when initAldo() fails', () => {
    (initAldo as jest.Mock).mockImplementation(() => {
      throw new Error('CONF_DOC row misconfigured');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => resumeJob()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CONF_DOC row misconfigured'));
    errorSpy.mockRestore();
  });

  test('calls riprendiJobSospeso with the initialized container and runner on success', () => {
    const container = { get: jest.fn() };
    (initAldo as jest.Mock).mockReturnValue(container);
    resumeJob();
    expect(riprendiJobSospeso).toHaveBeenCalledWith(container, expect.anything());
  });
});

describe('impostaMasterSpreadsheetId', () => {
  test('reads the bound spreadsheet id via SpreadsheetService.getActiveStandard and writes it to ScriptProperties', () => {
    const getActiveStandard = jest.fn().mockReturnValue({ getId: () => 'BOUND_SHEET_ID' });
    const spreadsheetServiceSpy = jest
      .spyOn(ServiceFactory, 'getSpreadsheetService')
      .mockReturnValue({ getActiveStandard } as never);
    const mockFacadeInstance = { set: jest.fn() };
    (ScriptPropertiesFacade as jest.Mock).mockReturnValue(mockFacadeInstance);

    impostaMasterSpreadsheetId();

    expect(getActiveStandard).toHaveBeenCalled();
    expect(mockFacadeInstance.set).toHaveBeenCalledWith('MASTER_SPREADSHEET_ID', 'BOUND_SHEET_ID');

    spreadsheetServiceSpy.mockRestore();
  });
});
