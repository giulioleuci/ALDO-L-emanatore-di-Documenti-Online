import { ScriptPropertiesFacade } from '../../../src/infrastructure/facades/PropertiesFacade';

describe('ScriptPropertiesFacade', () => {
  it('delegates get/set to the injected LibPropertiesService', () => {
    const props = { getProperty: jest.fn().mockReturnValue('v'), setProperty: jest.fn() };
    const facade = new ScriptPropertiesFacade(props as never);

    expect(facade.get('K')).toBe('v');
    expect(props.getProperty).toHaveBeenCalledWith('K');

    facade.set('K', 'v2');
    expect(props.setProperty).toHaveBeenCalledWith('K', 'v2');
  });

  it('falls back to ServiceFactory.getPropertiesService() when no props are injected', () => {
    const fake = { getProperty: jest.fn().mockReturnValue(null), setProperty: jest.fn() };
    const spy = jest.spyOn(ServiceFactory, 'getPropertiesService').mockReturnValue(fake as never);

    const facade = new ScriptPropertiesFacade();
    expect(facade.get('X')).toBeNull();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
