import { SessionActiveUserFacade } from '../../../src/infrastructure/facades/ActiveUserFacade';

describe('SessionActiveUserFacade', () => {
  test('getEmail delegates to ServiceFactory.getUserService().getActiveUserEmail()', () => {
    const getActiveUserEmail = jest.fn(() => 'preside@scuola.it');
    (global as unknown as { ServiceFactory: unknown }).ServiceFactory = {
      getUserService: () => ({ getActiveUserEmail })
    };
    const facade = new SessionActiveUserFacade();
    expect(facade.getEmail()).toBe('preside@scuola.it');
    expect(getActiveUserEmail).toHaveBeenCalled();
  });
});
