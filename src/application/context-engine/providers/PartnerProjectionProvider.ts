import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduClasse, DocenteCdcVM, AlunnoContestoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { ClasseProvider } from './ClasseProvider';
import type { StudentiProvider } from './StudentiProvider';
import type { TutorProvider } from './TutorProvider';

export interface SingleClassProjection {
  anagrafica: CduClasse['anagrafica'];
  consiglioDiClasse: DocenteCdcVM[];
  studenti: { listaCompleta: AlunnoContestoVM[] };
  coordinatori: NonNullable<CduClasse['coordinatori']>;
}

/**
 * Builds `focus.classe.partner.{primo,secondo}` (02 §2.5) — a full
 * SingleClassProjection per articulation partner — by re-running
 * ClasseProvider/StudentiProvider/TutorProvider against a throwaway scratch
 * CDU per partner class for `anagrafica`/`studenti`/`coordinatori`. Zero
 * VM-building logic is duplicated for those fields: they come from the exact
 * same providers the main `focus.classe` uses.
 *
 * `consiglioDiClasse` is deliberately NOT rebuilt per partner:
 * `ConsiglioClasseProvider.resolveConsiglio` resolves teaching assignments
 * for the whole articulation group regardless of which partner classe id it
 * is queried with (a partner classe is itself `isArticolata`), so re-running
 * it per partner would yield the same full comune+separato roster both
 * times. Instead this provider reads the already-correct split the outer
 * cdu's `'consiglio'` token computed (`focusClasse.consiglioDiClasseComune`/
 * `consiglioDiClasseSeparato`, always run before `'partner'` — see
 * `Recipe.ts`'s `CLASSE_COMPLETA`) and partitions it by
 * `tipoArticolazione`/`focusClasse.articolazione.partners` ordering:
 * `partners[0]` ↔ `SEPARATO_PRIMO`, `partners[1]` ↔ `SEPARATO_SECONDO` (same
 * convention as `TeachingCouncilProjection.ts`'s `tipoArticolazione()`,
 * both ultimately ordered by `IClasseRepository.orderedPartners`).
 *
 * Gated by `isArticolata` AND `includiPartnerDettaglio` (02 §2.1) — a
 * deliberately opt-in projection since it re-runs three providers per
 * partner (expensive for recipes that don't need it).
 */
export class PartnerProjectionProvider implements ContextProvider {
  constructor(
    private readonly classeProvider: ClasseProvider,
    private readonly studentiProvider: StudentiProvider,
    private readonly tutorProvider: TutorProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined || !focusClasse.flags.isArticolata) return;
    if (options.includiPartnerDettaglio !== true) return;
    const partners = focusClasse.articolazione?.partners;
    if (partners === null || partners === undefined || partners.length !== 2) return;

    const comune = focusClasse.consiglioDiClasseComune ?? [];
    const separato = focusClasse.consiglioDiClasseSeparato ?? [];
    const consiglioPrimo = [
      ...comune,
      ...separato.filter((docente) => docente.tipoArticolazione === 'SEPARATO_PRIMO')
    ];
    const consiglioSecondo = [
      ...comune,
      ...separato.filter((docente) => docente.tipoArticolazione === 'SEPARATO_SECONDO')
    ];

    focusClasse.partner = {
      primo: this.buildProjection(partners[0]!, cdu, params, consiglioPrimo),
      secondo: this.buildProjection(partners[1]!, cdu, params, consiglioSecondo)
    };
  }

  private buildProjection(
    classeId: string,
    outerCdu: Cdu,
    params: BuildParams,
    consiglioDiClasse: DocenteCdcVM[]
  ): SingleClassProjection {
    const scratch: Cdu = {
      meta: outerCdu.meta,
      ...(outerCdu.istituto === undefined ? {} : { istituto: outerCdu.istituto }),
      focus: {},
      tech: { entita: {}, servizi: [], pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] } }
    };
    const scratchParams: BuildParams = { ...params, target: classeId, tipoTarget: 'classe' };
    this.classeProvider.provide(scratch, scratchParams);
    this.studentiProvider.provide(scratch);
    this.tutorProvider.provide(scratch);

    const classe = scratch.focus.classe!;
    return {
      anagrafica: classe.anagrafica,
      consiglioDiClasse,
      studenti: { listaCompleta: classe.studenti?.listaCompleta ?? [] },
      coordinatori: classe.coordinatori ?? { elenco: [] }
    };
  }
}
