import type { ContextProvider } from '../ContextProvider';
import type { Cdu, ConsiglioClasseVM, DocenteCdcVM, ProiezioneClasseVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { ClasseProvider } from './ClasseProvider';
import type { StudentiProvider } from './StudentiProvider';
import type { TutorProvider } from './TutorProvider';
import type { MovimentiProvider } from './MovimentiProvider';
import { buildConsiglioClasseVm, scopeByArticolazione } from '../TeachingCouncilProjection';
import { elencoVm } from '../mappers/elencoVm';

/**
 * Builds `focus.classe.partner.{primo,secondo}` (08 §8.16/§8.17) — a full
 * `ProiezioneClasseVM` per articulation partner — by re-running
 * ClasseProvider/StudentiProvider/TutorProvider/MovimentiProvider against a
 * throwaway scratch CDU per partner class for `nome/anno/sezione/indirizzo`,
 * `studenti`, `coordinatori` and `movimenti`. Zero VM-building logic is
 * duplicated for those fields: they come from the exact same providers the
 * main `focus.classe` uses.
 *
 * `consiglio` is deliberately NOT rebuilt by re-running ConsiglioClasseProvider
 * per partner: `ConsiglioClasseProvider.resolveConsiglio`-backed resolution
 * resolves teaching assignments for the whole articulation group regardless
 * of which partner classe id it is queried with, so a naive re-run would
 * duplicate work (still correctly self-scopes via its own `partizioni`, but
 * at the cost of re-resolving the group's assignments twice for no gain).
 * Instead this provider reads the outer cdu's already-computed
 * `focus.classe.consiglio` split (`comune`/`separatoPrimo`/`separatoSecondo`,
 * always run before `partner` — see `Recipe.ts`'s `CLASSE_COMPLETA`) and
 * partitions it by `tipoArticolazione`/`focusClasse.articolazione.sottoClassi`
 * ordering: `sottoClassi[0]` <-> `SEPARATO_PRIMO`, `sottoClassi[1]` <->
 * `SEPARATO_SECONDO` (same convention `TeachingCouncilProjection.ts`'s
 * `tipoArticolazione()` uses, both ultimately ordered by
 * `IClasseRepository.orderedPartners`), then rebuilds the full
 * `ConsiglioClasseVM` per side via the shared `buildConsiglioClasseVm`.
 *
 * Gated by `isArticolata` AND `includiPartnerDettaglio` — a deliberately
 * opt-in projection since it re-runs four providers per partner (expensive
 * for recipes that don't need it).
 */
export class PartnerProjectionProvider implements ContextProvider {
  constructor(
    private readonly classeProvider: ClasseProvider,
    private readonly studentiProvider: StudentiProvider,
    private readonly tutorProvider: TutorProvider,
    private readonly movimentiProvider: MovimentiProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined || !focusClasse.isArticolata) return;
    if (options.includiPartnerDettaglio !== true) return;
    const sottoClassi = focusClasse.articolazione?.sottoClassi;
    if (sottoClassi === undefined || sottoClassi.length !== 2) return;
    const consiglio = focusClasse.consiglio;
    if (consiglio === undefined) return;

    const consiglioPrimo = buildConsiglioClasseVm(
      [...consiglio.comune, ...consiglio.separatoPrimo],
      this.titolariScope(consiglio, 'SEPARATO_PRIMO'),
      this.supplenzeScope(consiglio, [...consiglio.comune, ...consiglio.separatoPrimo])
    );
    const consiglioSecondo = buildConsiglioClasseVm(
      [...consiglio.comune, ...consiglio.separatoSecondo],
      this.titolariScope(consiglio, 'SEPARATO_SECONDO'),
      this.supplenzeScope(consiglio, [...consiglio.comune, ...consiglio.separatoSecondo])
    );

    const primo = this.buildProjection(sottoClassi[0]!.nome, cdu, params, options, consiglioPrimo);
    const secondo = this.buildProjection(
      sottoClassi[1]!.nome,
      cdu,
      params,
      options,
      consiglioSecondo
    );
    focusClasse.partner = { ...elencoVm([primo, secondo]), primo, secondo };
  }

  private titolariScope(
    consiglio: ConsiglioClasseVM,
    tipo: 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO'
  ): DocenteCdcVM[] {
    return scopeByArticolazione(consiglio.titolari, tipo);
  }

  private supplenzeScope(
    consiglio: ConsiglioClasseVM,
    scopedElenco: DocenteCdcVM[]
  ): ConsiglioClasseVM['supplenze'] {
    const emails = new Set(scopedElenco.map((docente) => docente.email));
    return consiglio.supplenze.filter((supplenza) => emails.has(supplenza.titolare.email));
  }

  private buildProjection(
    classeId: string,
    outerCdu: Cdu,
    params: BuildParams,
    options: RecipeOptions,
    consiglio: ConsiglioClasseVM
  ): ProiezioneClasseVM {
    const scratch: Cdu = {
      meta: outerCdu.meta,
      ...(outerCdu.istituto === undefined ? {} : { istituto: outerCdu.istituto }),
      focus: {},
      tech: {
        entita: {
          classe: null,
          alunno: null,
          docente: null,
          patternEmail: null,
          documentoMetadato: null
        },
        servizi: [],
        pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] }
      }
    };
    const scratchParams: BuildParams = { ...params, target: classeId, tipoTarget: 'classe' };
    this.classeProvider.provide(scratch, scratchParams);
    this.studentiProvider.provide(scratch, scratchParams, options);
    this.tutorProvider.provide(scratch);
    this.movimentiProvider.provide(scratch);

    const classe = scratch.focus.classe!;
    return {
      nome: classe.nome,
      anno: classe.anno,
      sezione: classe.sezione,
      indirizzo: classe.indirizzo,
      consiglio,
      studenti: classe.studenti!,
      coordinatori: classe.coordinatori!,
      movimenti: classe.movimenti!
    };
  }
}
