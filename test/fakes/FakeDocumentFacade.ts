import type { IDocumentFacade } from '../../src/infrastructure/facades/DocumentServiceFacade';

export class FakeDocumentFacade implements IDocumentFacade {
  private store = new Map<string, Record<string, string>>();
  replaceText(fileId: string, replacements: Record<string, string>): void {
    this.store.set(fileId, { ...(this.store.get(fileId) ?? {}), ...replacements });
  }
  replacementsFor(fileId: string): Record<string, string> { return this.store.get(fileId) ?? {}; }
}
