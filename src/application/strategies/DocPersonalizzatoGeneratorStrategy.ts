import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

/**
 * DOC_PERSONALIZZATO generator (10 §9): renders a personalized-plan document
 * (PDP/PEI/PFP). `CONF_DOC.PARAMETRI.tipoPiano` selects which of the student's
 * plans to use (default: the first one PianiProvider found, ref 09 §4); the
 * plan's `PIANI.PARAMETRI` fields (already surfaced on the CDU as
 * `focus.alunno.didattica.piani.items[].parametriGenerazione`, ref 02 §4.2)
 * are exposed to the template under `{{piano.<campo>}}`. A field absent from
 * the plan resolves to an empty string — the same missing-path behaviour
 * WorkspaceTemplateEngine already applies to every other CDU path, so no
 * special-casing is needed to satisfy the spec's "no error on missing field".
 */
export class DocPersonalizzatoGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly templates: ITemplateEngine) {}

  render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void {
    const tipoPiano = config.getParametri().tipoPiano;
    const items = cdu.focus.alunno?.didattica.piani.items ?? [];
    const piano = (typeof tipoPiano === 'string' ? items.find((i) => i.tipo === tipoPiano) : undefined) ?? items[0];
    const context = { ...(cdu as unknown as Record<string, unknown>), piano: piano?.parametriGenerazione ?? {} };
    this.templates.processDocument(fileId, context);
  }
}
