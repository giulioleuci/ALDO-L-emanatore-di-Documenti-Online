import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import {
  attachCouncilProjectionMetadata,
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
    classi: IClasseRepository,
    materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, materie).consiglio;
  }

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const assignments = resolveCouncilForProjection(
      this.teachingAssignments,
      getClasseEntity(cdu),
      new Date(cdu.meta.date.oggi.iso),
      options.gestioneSupplenti
    );
    focusClasse.consiglioDiClasse = prepareCouncilAssignments(assignments) as never;
    this.projection.intercept('consiglio', cdu, cdu, options);
    attachCouncilProjectionMetadata(cdu, assignments);
  }
}
