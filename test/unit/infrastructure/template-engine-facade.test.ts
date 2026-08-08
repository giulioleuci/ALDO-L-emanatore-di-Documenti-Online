import { TemplateEngineFacade } from '../../../src/infrastructure/facades/TemplateEngineFacade';

describe('TemplateEngineFacade — failure branches', () => {
  it('processDocument throws when PlaceholderService.processDocument returns false', () => {
    const service = { processDocument: jest.fn().mockReturnValue(false) };
    const facade = new TemplateEngineFacade(service as never);
    expect(() => facade.processDocument('FILE1', {})).toThrow(
      'TemplateEngineFacade.processDocument(FILE1): PlaceholderService.processDocument returned false'
    );
  });

  it('processDocument passes the exact same context object reference through unescaped (booleans/conditionals must survive raw, unlike processStringEscaped)', () => {
    const context = { focus: { classe: { isArticolata: true } } };
    let capturedContext: Record<string, unknown> | undefined;
    const processDocument = jest.fn((_fileId: string, ctx: Record<string, unknown>) => {
      capturedContext = ctx;
      return true;
    });
    const service = { processDocument };
    const facade = new TemplateEngineFacade(service as never);
    facade.processDocument('FILE1', context);
    expect(processDocument).toHaveBeenCalledWith('FILE1', context);
    expect(capturedContext).toBe(context);
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

  it('processStringEscaped HTML-escapes string leaves before rendering (CoreUtilsLib HtmlSanitizer.escapeContextDeep)', () => {
    const facade = new TemplateEngineFacade();
    const context = { nome: '<script>alert(1)</script>', voto: 4, attivo: true, note: null };
    expect(facade.processStringEscaped('{{nome}} — {{voto}}', context)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; — 4'
    );
  });

  it('processStringEscaped does not mutate the passed-in context', () => {
    const facade = new TemplateEngineFacade();
    const context = { nome: '<b>x</b>' };
    facade.processStringEscaped('{{nome}}', context);
    expect(context.nome).toBe('<b>x</b>');
  });
});
