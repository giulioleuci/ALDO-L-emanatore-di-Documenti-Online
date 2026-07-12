import { TemplateEngineFacade } from '../../../src/infrastructure/facades/TemplateEngineFacade';

describe('TemplateEngineFacade — failure branches', () => {
  it('processDocument throws when PlaceholderService.processDocument returns false', () => {
    const service = { processDocument: jest.fn().mockReturnValue(false) };
    const facade = new TemplateEngineFacade(service as never);
    expect(() => facade.processDocument('FILE1', {})).toThrow(
      'TemplateEngineFacade.processDocument(FILE1): PlaceholderService.processDocument returned false'
    );
  });

  it('processSheet throws when result.success is false', () => {
    const service = { processSheet: jest.fn().mockReturnValue({ success: false, layouts: [] }) };
    const facade = new TemplateEngineFacade(service as never);
    expect(() => facade.processSheet('SHEET1', {})).toThrow(
      'TemplateEngineFacade.processSheet(SHEET1): PlaceholderService.processSheet returned success:false'
    );
  });

  it('processSheet flattens layouts.columns across every placeholder on success', () => {
    const service = {
      processSheet: jest.fn().mockReturnValue({
        success: true,
        layouts: [{ columns: ['A', 'B'] }, { columns: ['C'] }]
      })
    };
    const facade = new TemplateEngineFacade(service as never);
    expect(facade.processSheet('SHEET1', {}, 'Foglio1')).toEqual(['A', 'B', 'C']);
    expect(service.processSheet).toHaveBeenCalledWith('SHEET1', {}, 'Foglio1');
  });

  it('builds its own PlaceholderService/Mustache/LoggerService when none is injected', () => {
    expect(() => new TemplateEngineFacade()).not.toThrow();
  });
});
