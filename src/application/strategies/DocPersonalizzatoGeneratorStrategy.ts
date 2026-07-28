import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * DOC_PERSONALIZZATO generator (10 §9): renders the complete focused-plan CDU.
 * The selected plan is already at `focus.piano`; its generation parameters are
 * exposed only as the optional compatibility alias `piano`. Templates can use
 * both `{{focus.piano.tipo}}` and `{{piano.<campo>}}` without the generator
 * selecting from the student's complete plan list.
 */
export class DocPersonalizzatoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}

  render(fileId: string, cdu: Cdu): void {
    const piano = cdu.focus.piano?.parametriGenerazione;
    const context: Record<string, unknown> =
      piano === undefined
        ? (cdu as unknown as Record<string, unknown>)
        : { ...(cdu as unknown as Record<string, unknown>), piano };
    this.templates.processDocument(fileId, context);
  }
}
