import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import { getAlunnoEntity, withFocusAlunno } from '../techEntities';
import { carenzeDettaglioSemplice } from '../mappers/carenzeMapper';

/**
 * Fills `focus.alunno.didattica.carenze` from the student's CARENZE rows (09 §4,
 * 02 §4.2), flattened to the `{ materia, voto }` dettaglio form.
 */
export class CarenzeProvider implements ContextProvider {
  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository
  ) {}

  provide(cdu: Cdu): void {
    withFocusAlunno(cdu, (focusAlunno) => {
      const dettaglio = carenzeDettaglioSemplice(
        this.alunni.getCarenze(getAlunnoEntity(cdu)),
        this.materie.findAllSigle(),
        this.materie
      );
      focusAlunno.didattica.carenze = {
        dettaglio,
        numero: dettaglio.length,
        hasCarenze: dettaglio.length > 0
      };
    });
  }
}
