import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * FOGLIO_GENERICO generator (10 §9): plain `{{...}}` placeholder substitution over the CDU
 * via WorkspaceTemplateEngine's `processSheet`, with no additional structural logic — the
 * Sheet-output mirror of DOCUMENTO_GENERICO. Every structural need (e.g. a `{{dynamic_rows
 * [...]}}` student roster) is authored entirely in the Drive template itself; this strategy
 * never inspects `CONF_DOC.PARAMETRI` or the CDU beyond passing it through unchanged.
 */
export class FoglioGenericoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}
  render(fileId: string, cdu: Cdu): void {
    this.templates.processSheet(fileId, cdu as unknown as Record<string, unknown>);
  }
}
