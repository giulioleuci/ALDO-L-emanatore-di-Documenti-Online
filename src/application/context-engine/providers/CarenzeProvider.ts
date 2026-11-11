import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { getAlunnoEntity } from '../techEntities';
import { buildElencoCarenzeVm } from '../mappers/carenzeMapper';

export class CarenzeProvider implements ContextProvider {
  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    if (cdu.focus.alunno === undefined) return;
    cdu.focus.alunno.carenze = buildElencoCarenzeVm(
      this.alunni
        .getCarenze(getAlunnoEntity(cdu))
        .filter(
          (carenza) =>
            params.carenzaProgressivo === undefined ||
            carenza.progressivo === params.carenzaProgressivo
        ),
      this.materie.findAllSigle(),
      this.materie
    );
  }
}
