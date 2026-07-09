import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * VERBALE_CDC generator. Rendering is fully delegated to WorkspaceTemplateEngine
 * (via ITemplateEngine): the Drive template carries the `{{focus...}}` tags and
 * the CDU is the rendering context, so no placeholder map is built in code
 * (ref 10 §9, 02 — templates read CDU paths directly). Articulated-class
 * section removal via CONF_DOC.PARAMETRI section tags (10 §9) is not yet
 * implemented — deferred alongside the Sheet-based generator strategies.
 */
export class VerbaleGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}
  render(fileId: string, cdu: Cdu): void {
    this.templates.processDocument(fileId, cdu as unknown as Record<string, unknown>);
  }
}
