import type { ITemplateEngine } from '../../src/infrastructure/facades/TemplateEngineFacade';
import { TemplateEngineFacade } from '../../src/infrastructure/facades/TemplateEngineFacade';
import type { MaterieGroups } from '../../src/application/strategies/SheetMaterieGeneratorStrategy';

/**
 * Test double for ITemplateEngine: string rendering goes through the REAL
 * vendored WorkspaceTemplateEngine (pure string processing, offline-safe);
 * document/sheet rendering — a Google-API operation — is recorded instead of
 * executed.
 *
 * `processSheet` additionally SIMULATES the real GLF `dynamic_columns`
 * numbered-suffix group resolution (`WorkspaceTemplateEngine/src/processors
 * /SheetProcessor.js`, `_bucketDynamicColumnGroups`/
 * `_prepareDynamicColumnRequests`) against the `materieColonne` convention
 * `SheetMaterieGeneratorStrategy` places on the context (see that class's
 * doc comment for the full placeholder syntax): group 1 = `materieColonne
 * .group1` (unlabeled), group 2/3 = `materieColonne.group2`/`group3`
 * (preceded by a non-ACL label column resolved once from `group2Label`/
 * `group3Label`), each omitted entirely when absent — mirroring
 * `SheetProcessor.js`'s "empty 2nd+ group renders nothing, no label either"
 * rule. Columns are placed sequentially starting at column 1 (a fixed,
 * fake-only stand-in for wherever a real Drive template's placeholder cell
 * would sit — no such template content exists in this repo, 10 §9).
 */
export class FakeTemplateEngine implements ITemplateEngine {
  public rendered: Array<{ fileId: string; context: Record<string, unknown> }> = [];
  public renderedSheets: Array<{ sheetId: string; context: Record<string, unknown>; sheetName: string | undefined }> = [];
  private readonly real = new TemplateEngineFacade();

  processString(template: string, context: Record<string, unknown>): string {
    return this.real.processString(template, context);
  }

  processDocument(fileId: string, context: Record<string, unknown>): void {
    this.rendered.push({ fileId, context });
  }

  processSheet(sheetId: string, context: Record<string, unknown>, sheetName?: string): SheetColumnLayout[] {
    this.renderedSheets.push({ sheetId, context, sheetName });
    return this.resolveDynamicColumns(context['materieColonne']);
  }

  contextFor(fileId: string): Record<string, unknown> | null {
    return this.rendered.find((r) => r.fileId === fileId)?.context ?? null;
  }

  sheetContextFor(sheetId: string): Record<string, unknown> | null {
    return this.renderedSheets.find((r) => r.sheetId === sheetId)?.context ?? null;
  }

  private resolveDynamicColumns(materieColonne: unknown): SheetColumnLayout[] {
    if (materieColonne === null || typeof materieColonne !== 'object') return [];
    const groups = materieColonne as MaterieGroups;
    const buckets: Array<{ items: { sigla: string; header: string }[]; label?: string }> = [{ items: groups.group1 }];
    if (groups.group2 !== undefined) buckets.push({ items: groups.group2, label: groups.group2Label });
    if (groups.group3 !== undefined) buckets.push({ items: groups.group3, label: groups.group3Label });

    const columns: SheetColumnLayout[] = [];
    let col = 1;
    buckets.forEach((bucket, i) => {
      if (i > 0 && bucket.items.length === 0) return;
      if (i > 0 && bucket.label !== undefined) {
        columns.push({ header: bucket.label, column: col, isLabel: true });
        col += 1;
      }
      bucket.items.forEach((item) => {
        columns.push({ header: item.header, column: col, isLabel: false });
        col += 1;
      });
    });
    return columns;
  }
}
