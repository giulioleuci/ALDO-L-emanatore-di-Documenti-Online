export interface IDocumentFacade {
  replaceText(fileId: string, replacements: Record<string, string>): void;
}

export class DocumentServiceFacade implements IDocumentFacade {
  constructor(private readonly engine: WorkspaceTemplateEngine) {}
  replaceText(fileId: string, replacements: Record<string, string>): void {
    this.engine.renderDoc(fileId, replacements);
  }
}
