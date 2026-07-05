import type { ITemplateEngine } from '../../src/infrastructure/facades/TemplateEngineFacade';
import { TemplateEngineFacade } from '../../src/infrastructure/facades/TemplateEngineFacade';

/**
 * Test double for ITemplateEngine: string rendering goes through the REAL
 * vendored WorkspaceTemplateEngine (pure string processing, offline-safe);
 * document rendering — a Google-API operation — is recorded instead of executed.
 */
export class FakeTemplateEngine implements ITemplateEngine {
  public rendered: Array<{ fileId: string; context: Record<string, unknown> }> = [];
  private readonly real = new TemplateEngineFacade();

  processString(template: string, context: Record<string, unknown>): string {
    return this.real.processString(template, context);
  }

  processDocument(fileId: string, context: Record<string, unknown>): void {
    this.rendered.push({ fileId, context });
  }

  contextFor(fileId: string): Record<string, unknown> | null {
    return this.rendered.find((r) => r.fileId === fileId)?.context ?? null;
  }
}
