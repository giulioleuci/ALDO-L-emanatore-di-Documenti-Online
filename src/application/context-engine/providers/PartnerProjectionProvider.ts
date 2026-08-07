import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduClasse, DocenteCdcVM, AlunnoContestoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { ClasseProvider } from './ClasseProvider';
import type { StudentiProvider } from './StudentiProvider';
import type { TutorProvider } from './TutorProvider';
import type { ConsiglioClasseProvider } from './ConsiglioClasseProvider';

export interface SingleClassProjection {
  anagrafica: CduClasse['anagrafica'];
  consiglioDiClasse: DocenteCdcVM[];
  studenti: { listaCompleta: AlunnoContestoVM[] };
  coordinatori: NonNullable<CduClasse['coordinatori']>;
}

/**
 * Builds `focus.classe.partner.{primo,secondo}` (02 §2.5) — a full
 * SingleClassProjection per articulation partner — by re-running
 * ClasseProvider/StudentiProvider/TutorProvider/ConsiglioClasseProvider
 * against a throwaway scratch CDU per partner class. Zero VM-building logic
 * is duplicated: every field comes from the exact same providers the main
 * `focus.classe` uses. Gated by `isArticolata` AND `includiPartnerDettaglio`
 * (02 §2.1) — a deliberately opt-in projection since it re-runs four
 * providers per partner (expensive for recipes that don't need it).
 */
export class PartnerProjectionProvider implements ContextProvider {
  constructor(
    private readonly classeProvider: ClasseProvider,
    private readonly studentiProvider: StudentiProvider,
    private readonly tutorProvider: TutorProvider,
    private readonly consiglioProvider: ConsiglioClasseProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined || !focusClasse.flags.isArticolata) return;
    if (options.includiPartnerDettaglio !== true) return;
    const partners = focusClasse.articolazione?.partners;
    if (partners === null || partners === undefined || partners.length !== 2) return;

    focusClasse.partner = {
      primo: this.buildProjection(partners[0]!, cdu, params, options),
      secondo: this.buildProjection(partners[1]!, cdu, params, options)
    };
  }

  private buildProjection(
    classeId: string,
    outerCdu: Cdu,
    params: BuildParams,
    options: RecipeOptions
  ): SingleClassProjection {
    const scratch: Cdu = {
      meta: outerCdu.meta,
      focus: {},
      tech: { entita: {}, servizi: [], pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] } }
    };
    const scratchParams: BuildParams = { ...params, target: classeId, tipoTarget: 'classe' };
    this.classeProvider.provide(scratch, scratchParams);
    this.studentiProvider.provide(scratch, scratchParams, options);
    this.tutorProvider.provide(scratch);
    this.consiglioProvider.provide(scratch, scratchParams, options);

    const classe = scratch.focus.classe!;
    return {
      anagrafica: classe.anagrafica,
      consiglioDiClasse: classe.consiglioDiClasse ?? [],
      studenti: { listaCompleta: classe.studenti?.listaCompleta ?? [] },
      coordinatori: classe.coordinatori ?? { elenco: [] }
    };
  }
}
