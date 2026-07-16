import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { CdcAssembler } from '../CdcAssembler';
import { getClasseEntity } from '../techEntities';

/**
 * Builds `focus.classe.consiglioDiClasse` — one docente-in-CDC view model per
 * teacher of the class council (09 §4, 02 §4.1) — delegating the VM assembly
 * (incl. articulated COMUNE/SEPARATO tagging) to the shared CdcAssembler. The
 * `stato.isSupplente`/`sostituisce` fields stay at the titolare default; the
 * SwapAndEnrichInterceptor overrides them when a supplenza is active (09 §5).
 */
export class ConsiglioClasseProvider implements ContextProvider {
  private readonly cdc: CdcAssembler;

  constructor(classi: IClasseRepository, materie: IMateriaRepository) {
    this.cdc = new CdcAssembler(classi, materie);
  }

  provide(cdu: Cdu): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    focusClasse.consiglioDiClasse = this.cdc.assembleForClasse(getClasseEntity(cdu));
  }
}
