import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import {
  attachCouncilProjectionMetadata,
  buildSupplenzeAggregate,
  createTeachingCouncilProjection,
  prepareCouncilAssignments,
  resolveCouncilForProjection
} from '../TeachingCouncilProjection';
import { getClasseEntity } from '../techEntities';

/**
 * Builds `focus.classe.consiglioDiClasse` — one docente-in-CDC view model per
 * teacher of the class council (09 §4, 02 §4.1) — delegating the VM assembly
 * (incl. articulated COMUNE/SEPARATO tagging and the SUPPLENZE/VARIAZIONI_
 * CATTEDRA/CLASSI resolution) to the shared teaching-assignment port and GLF
 * collection projection.
 */
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
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classe = getClasseEntity(cdu);
    const assignments = resolveCouncilForProjection(
      this.teachingAssignments,
      classe,
      new Date(cdu.meta.date.oggi.iso),
      options.gestioneSupplenti
    );
    focusClasse.consiglioDiClasse = prepareCouncilAssignments(assignments) as never;
    focusClasse.supplenze = buildSupplenzeAggregate(assignments, this.materie, classe);
    this.projection.intercept('consiglio', cdu, cdu, options);
    attachCouncilProjectionMetadata(cdu, assignments);

    if (this.classi.isArticolata(classe)) {
      const consiglio: DocenteCdcVM[] = focusClasse.consiglioDiClasse ?? [];
      const comune = consiglio.filter((docente) => docente.tipoArticolazione === 'COMUNE');
      const separato = consiglio.filter(
        (docente) =>
          docente.tipoArticolazione === 'SEPARATO_PRIMO' ||
          docente.tipoArticolazione === 'SEPARATO_SECONDO'
      );

      const config = this.classi.getArticolazione(classe);
      if (config !== null && !config.isParent()) {
        const partners = this.classi.orderedPartners(classe);
        const ownBranch = partners[0]?.id === classe.id ? 'SEPARATO_PRIMO' : 'SEPARATO_SECONDO';
        const ownSeparato = separato.filter((docente) => docente.tipoArticolazione === ownBranch);
        focusClasse.consiglioDiClasseSeparato = ownSeparato;
        focusClasse.consiglioDiClasse = [...comune, ...ownSeparato] as never;
      } else {
        focusClasse.consiglioDiClasseSeparato = separato;
      }
      focusClasse.consiglioDiClasseComune = comune;
    }
  }
}
