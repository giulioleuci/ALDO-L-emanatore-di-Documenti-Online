jest.mock('../../src/config/Bootstrap', () => ({
  initAldo: jest.fn(),
  creaJobRunner: jest.fn(() => ({})),
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  avviaImportazioneDataDriven: jest.fn(),
  riprendiJobSospeso: jest.fn()
}));
jest.mock('../../src/presentation/Menu', () => ({
  costruisciMenu: jest.fn(),
  menuGenerazioneDocumenti: jest.fn(),
  menuComunicazioniEmail: jest.fn(),
  menuImportazioni: jest.fn()
}));
jest.mock('../../src/infrastructure/facades/UiFacade', () => ({ GasUiFacade: jest.fn() }));
import { aldoPing, resumeJob } from '../../src/index';
import { initAldo, riprendiJobSospeso } from '../../src/config/Bootstrap';

test('aldoPing returns readiness string', () => {
  expect(aldoPing()).toBe('ALDO OK');
});

test('does not expose runArticolazioneScenarios as a GAS global entry point', () => {
  const gasGlobal = globalThis as typeof globalThis & { runArticolazioneScenarios?: () => void };

  expect(gasGlobal.runArticolazioneScenarios).toBeUndefined();
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
