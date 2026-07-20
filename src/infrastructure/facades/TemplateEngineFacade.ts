/**
 * Port + adapter for WorkspaceTemplateEngine (L2). SGSA never resolves
 * `{{...}}` placeholders itself: FILE_NAME / PATH_OUT strings and document
 * bodies are all rendered by the library's PlaceholderService with the CDU as
 * the nested context (ref 10 §5/§6, 14 §6 — filters like `| date`,
 * `| uppercase` come from the library's Mustache pipe-filter engine). The port
 * keeps callers agnostic of the library.
 */
export interface ITemplateEngine {
  /** Renders a `{{path | filter}}` string template against the CDU context. */
  processString(template: string, context: Record<string, unknown>): string;
  /**
   * Same as `processString`, but HTML-escapes every string leaf of `context`
   * first (CoreUtilsLib `HtmlSanitizer.escapeContextDeep`) before rendering —
   * use for any template whose output lands in an email HTML body, where raw
   * CDU values (names, free text) must not be interpolated unescaped.
   */
  processStringEscaped(template: string, context: Record<string, unknown>): string;
  /** In-place structural rendering of a Google Doc (loops, tables, placeholders). Throws on render failure. */
  processDocument(fileId: string, context: Record<string, unknown>): void;
  /**
   * Batch structural rendering of a Google Sheet (matrix/dynamic-column expansion,
   * placeholders). Throws on render failure. Returns the resolved
   * `{{dynamic_columns[...]}}` column layouts (flattened across every placeholder
   * found), so a caller can know which spreadsheet column each templated item
   * landed in — e.g. to apply an ACL the directive's own static `acl=` expression
   * can't express (role-resolution/supplenza-chain logic).
   */
  processSheet(
    sheetId: string,
    context: Record<string, unknown>,
    sheetName?: string
  ): SheetColumnLayout[];
}

export class TemplateEngineFacade implements ITemplateEngine {
  private readonly service: PlaceholderService;

  constructor(service?: PlaceholderService) {
    if (service !== undefined) {
      this.service = service;
    } else {
      const logger = new LoggerService();
      this.service = new PlaceholderService({ logger, mustache: new Mustache({ logger }) });
    }
  }

  processString(template: string, context: Record<string, unknown>): string {
    return this.service.processString(template, context);
  }

  processStringEscaped(template: string, context: Record<string, unknown>): string {
    return this.service.processString(template, HtmlSanitizer.escapeContextDeep(context));
  }

  processDocument(fileId: string, context: Record<string, unknown>): void {
    const success = this.service.processDocument(fileId, context);
    if (!success)
      throw new Error(
        `TemplateEngineFacade.processDocument(${fileId}): PlaceholderService.processDocument returned false`
      );
  }

  processSheet(
    sheetId: string,
    context: Record<string, unknown>,
    sheetName?: string
  ): SheetColumnLayout[] {
    const result = this.service.processSheet(sheetId, context, sheetName ?? undefined);
    if (!result.success)
      throw new Error(
        `TemplateEngineFacade.processSheet(${sheetId}): PlaceholderService.processSheet returned success:false`
      );
    return result.layouts.flatMap((l) => l.columns);
  }
}
