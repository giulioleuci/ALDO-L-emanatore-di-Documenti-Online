jest.mock('../../src/config/Bootstrap', () => ({
  initAldo: jest.fn(),
  creaJobRunner: jest.fn(() => ({})),
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  avviaImportazioneDataDriven: jest.fn(),
  avviaValidazioneDatabase: jest.fn(),
  riprendiJobSospeso: jest.fn()
}));
jest.mock('../../src/presentation/Menu', () => ({
  costruisciMenu: jest.fn(),
  menuGenerazioneDocumenti: jest.fn(),
  menuComunicazioniEmail: jest.fn(),
  menuImportazioni: jest.fn(),
  menuValidazioneDatabase: jest.fn()
}));
jest.mock('../../src/infrastructure/facades/UiFacade', () => ({ GasUiFacade: jest.fn() }));
import '../../src/index';
import '../../src/entrypoints/EntryPoints_Base';
import { initAldo, riprendiJobSospeso } from '../../src/config/Bootstrap';

const gasGlobal = globalThis as typeof globalThis & {
  aldoPing: () => string;
  resumeJob: () => void;
  runArticolazioneScenarios?: () => void;
};

test('aldoPing returns readiness string', () => {
  expect(gasGlobal.aldoPing()).toBe('ALDO OK');
});

test('does not expose runArticolazioneScenarios as a GAS global entry point', () => {
  expect(gasGlobal.runArticolazioneScenarios).toBeUndefined();
});

describe('resumeJob', () => {
  test('logs and does not throw when initAldo() fails', () => {
    (initAldo as jest.Mock).mockImplementation(() => {
      throw new Error('CONF_DOC row misconfigured');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    gasGlobal.resumeJob();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CONF_DOC row misconfigured'));
    errorSpy.mockRestore();
  });

  test('calls riprendiJobSospeso with the initialized container and runner on success', () => {
    const container = { get: jest.fn() };
    (initAldo as jest.Mock).mockReturnValue(container);
    gasGlobal.resumeJob();
    expect(riprendiJobSospeso).toHaveBeenCalledWith(
      container,
      expect.anything(),
      '',
      30 * 60 * 1000
    );
  });
});

test('menu_validazioneDatabase and its launcher are exposed as globals', () => {
  expect(typeof (globalThis as Record<string, unknown>)['menuValidazioneDatabase']).toBe(
    'function'
  );
  expect(typeof (globalThis as Record<string, unknown>)['avviaValidazioneDatabase']).toBe(
    'function'
  );
});
