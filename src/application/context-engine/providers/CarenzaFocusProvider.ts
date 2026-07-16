import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { getAlunnoEntity } from '../techEntities';

/**
 * Populates `focus.carenza` — the specific CARENZE record that started a
 * PER_CARENZA pipeline (09 §4, 02 §4.3). Active only in CARENZA_COMPLETO. The
 * target record is selected by `params.carenzaProgressivo`; absent that, the most
 * recent shortfall of the student is used. Does nothing if the student has none.
 */
export class CarenzaFocusProvider implements ContextProvider {
  constructor(private readonly alunni: AlunnoRepository) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const carenze = this.alunni.getCarenze(getAlunnoEntity(cdu)); // most recent first
    const target =
      params.carenzaProgressivo === undefined
        ? carenze[0]
        : carenze.find((c) => c.progressivo === params.carenzaProgressivo);
    if (target === undefined) return;
    cdu.focus.carenza = {
      studente: target.studente,
      progressivo: target.progressivo,
      data: target.data,
      classe: target.classe,
      hasAssenze: target.hasAssenzeElevate(),
      note: target.getNote()
    };
  }
}
