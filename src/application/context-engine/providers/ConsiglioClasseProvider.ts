import type { ContextProvider } from '../ContextProvider';
import type { Cdu, ConsiglioClasseVM, DocenteCdcVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import {
  attachCouncilProjectionMetadata,
  buildConsiglioClasseVm,
  buildSupplenzeAggregate,
  createTeachingCouncilProjection,
  prepareCouncilAssignments,
  resolveEffectiveCouncil,
  resolveTitolareCouncil
} from '../TeachingCouncilProjection';
import { getClasseEntity } from '../techEntities';

export class ConsiglioClasseProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, this.materie).consiglio;
  }

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focus = cdu.focus.classe;
    if (focus === undefined) return;
    const classe = getClasseEntity(cdu);
    const data = new Date(`${cdu.meta.timestamp.slice(0, 10)}T00:00:00.000Z`);
    const effettivi = resolveEffectiveCouncil(this.teachingAssignments, classe, data);
    const titolari = resolveTitolareCouncil(this.teachingAssignments, classe, data);
    focus.consiglio = this.emptyConsiglio(
      prepareCouncilAssignments(effettivi) as never,
      prepareCouncilAssignments(titolari) as never,
      buildSupplenzeAggregate(effettivi, this.materie, classe)
    );
    this.projection.intercept('consiglio', cdu, cdu, options);
    attachCouncilProjectionMetadata(cdu, effettivi, focus.consiglio.elenco);
    attachCouncilProjectionMetadata(cdu, titolari, focus.consiglio.titolari);
    this.partizioni(focus.consiglio, classe);
  }

  private emptyConsiglio(
    elenco: DocenteCdcVM[],
    titolari: DocenteCdcVM[],
    supplenze: ConsiglioClasseVM['supplenze']
  ): ConsiglioClasseVM {
    return {
      elenco,
      titolari,
      hasElenco: false,
      hasTitolari: false,
      numero: 0,
      elencoDescrizione: '',
      elencoDescrizioneEstesa: '',
      comune: [],
      separato: [],
      separatoPrimo: [],
      separatoSecondo: [],
      hasComune: false,
      hasSeparato: false,
      hasSeparatoPrimo: false,
      hasSeparatoSecondo: false,
      comuneDescrizione: '',
      separatoPrimoDescrizione: '',
      separatoSecondoDescrizione: '',
      supplenze,
      hasSupplenze: supplenze.length > 0
    };
  }

  /**
   * Scopes `elenco`/`titolari` to this class's own articulation half (when it
   * is itself a partner, not the parent) and rebuilds the full VM via the
   * shared `buildConsiglioClasseVm` — same partitioning logic
   * `PartnerProjectionProvider` reuses for per-partner-side projections.
   */
  private partizioni(
    consiglio: ConsiglioClasseVM,
    classe: ReturnType<typeof getClasseEntity>
  ): void {
    const config = this.classi.getArticolazione(classe);
    const partners = this.classi.orderedPartners(classe);
    const own =
      config !== null && !config.isParent()
        ? partners[0]?.id === classe.id
          ? 'SEPARATO_PRIMO'
          : 'SEPARATO_SECONDO'
        : null;
    const scope = (docenti: DocenteCdcVM[]) =>
      own === null
        ? docenti
        : docenti.filter(
            (docente) => docente.tipoArticolazione === 'COMUNE' || docente.tipoArticolazione === own
          );
    const scopedElenco = scope(consiglio.elenco);
    const scopedTitolari = scope(consiglio.titolari);
    Object.assign(
      consiglio,
      buildConsiglioClasseVm(scopedElenco, scopedTitolari, consiglio.supplenze)
    );
  }
}
