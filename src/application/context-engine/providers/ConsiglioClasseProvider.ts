import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import {
  CdcAssembler,
  type CattedraAssignmentsResolver
} from '../CdcAssembler';
import { getClasseEntity } from '../techEntities';

/**
 * Builds `focus.classe.consiglioDiClasse` — one docente-in-CDC view model per
 * teacher of the class council (09 §4, 02 §4.1) — delegating the VM assembly
 * (incl. articulated COMUNE/SEPARATO tagging and the SUPPLENZE/VARIAZIONI_
 * CATTEDRA/CLASSI resolution) to the shared CdcAssembler/CattedraResolver.
 */
export class ConsiglioClasseProvider implements ContextProvider {
  private readonly cdc: CdcAssembler;

  constructor(
    classi: IClasseRepository,
    materie: IMateriaRepository,
    cattedraResolver: CattedraAssignmentsResolver
  ) {
    this.cdc = new CdcAssembler(classi, materie, cattedraResolver);
  }

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    focusClasse.consiglioDiClasse = this.cdc.assembleForClasse(
      getClasseEntity(cdu),
      new Date(cdu.meta.date.oggi.iso),
      options.gestioneSupplenti
    );
  }
}
