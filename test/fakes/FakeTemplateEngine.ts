import type { ITemplateEngine } from '../../src/infrastructure/facades/TemplateEngineFacade';
import { TemplateEngineFacade } from '../../src/infrastructure/facades/TemplateEngineFacade';

/**
 * Test double for ITemplateEngine: string rendering goes through the REAL
 * vendored WorkspaceTemplateEngine (pure string processing, offline-safe);
 * document/sheet rendering — a Google-API operation — is recorded instead of
 * executed.
 *
 * `processSheet` additionally simulates the canonical CDU group envelope
 * at `focus.classe.sheet.materieColonne.gruppi`. Columns are placed
 * sequentially starting at column 1 (a fixed,
 * fake-only stand-in for wherever a real Drive template's placeholder cell
 * would sit — no such template content exists in this repo, 10 §9).
 */
export class FakeTemplateEngine implements ITemplateEngine {
  public rendered: Array<{ fileId: string; context: Record<string, unknown> }> = [];
  public renderedSheets: Array<{
    sheetId: string;
    context: Record<string, unknown>;
    sheetName: string | undefined;
  }> = [];
  private readonly real = new TemplateEngineFacade();

  processString(template: string, context: Record<string, unknown>): string {
    return this.real.processString(template, context);
  }

  processStringEscaped(template: string, context: Record<string, unknown>): string {
    return this.real.processStringEscaped(template, context);
  }

  processDocument(fileId: string, context: Record<string, unknown>): void {
    this.rendered.push({ fileId, context });
  }

  processSheet(
    sheetId: string,
    context: Record<string, unknown>,
    sheetName?: string
  ): SheetColumnLayout[] {
    this.renderedSheets.push({ sheetId, context, sheetName });
    const focus = context['focus'] as
      { classe?: { sheet?: { materieColonne?: unknown } } } | undefined;
    return this.resolveDynamicColumns(focus?.classe?.sheet?.materieColonne);
  }

  contextFor(fileId: string): Record<string, unknown> | null {
    return this.rendered.find((r) => r.fileId === fileId)?.context ?? null;
  }

  sheetContextFor(sheetId: string): Record<string, unknown> | null {
    return this.renderedSheets.find((r) => r.sheetId === sheetId)?.context ?? null;
  }

  private resolveDynamicColumns(materieColonne: unknown): SheetColumnLayout[] {
    if (materieColonne === null || typeof materieColonne !== 'object') return [];
    const groups =
      (
        materieColonne as {
          gruppi?: Array<{ colonne: { sigla: string; header: string }[]; label: string }>;
        }
      ).gruppi ?? [];
    const buckets = groups.map((group) => ({ items: group.colonne, label: group.label }));

    const columns: SheetColumnLayout[] = [];
    let col = 1;
    buckets.forEach((bucket, i) => {
      if (i > 0 && bucket.items.length === 0) return;
      if (i > 0 && bucket.label !== undefined) {
        columns.push({ header: bucket.label, column: col, isLabel: true, item: null });
        col += 1;
      }
      bucket.items.forEach((item) => {
        columns.push({ header: item.header, column: col, isLabel: false, item });
        col += 1;
      });
    });
    return columns;
  }
}
