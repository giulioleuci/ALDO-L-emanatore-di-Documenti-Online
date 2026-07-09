import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * DOCUMENTO_GENERICO generator (10 §9): plain `{{...}}` placeholder substitution
 * over the CDU via WorkspaceTemplateEngine, with no additional structural
 * logic — for letters, communications and any document needing no manipulation
 * beyond text substitution.
 */
export class DocumentoGenericoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}
  render(fileId: string, cdu: Cdu): void {
    this.templates.processDocument(fileId, cdu as unknown as Record<string, unknown>);
  }
}
