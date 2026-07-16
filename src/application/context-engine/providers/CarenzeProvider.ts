import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import type { MateriaRepository } from '../../../infrastructure/repositories/MateriaRepository';
import { getAlunnoEntity } from '../techEntities';
import { carenzeDettaglioSemplice } from '../mappers/carenzeMapper';

/**
 * Fills `focus.alunno.didattica.carenze` from the student's CARENZE rows (09 §4,
 * 02 §4.2), flattened to the `{ materia, voto }` dettaglio form.
 */
export class CarenzeProvider implements ContextProvider {
  private sigleCache: string[] | null = null;

  constructor(
    private readonly alunni: AlunnoRepository,
    private readonly materie: MateriaRepository
  ) {}

  provide(cdu: Cdu): void {
    const focusAlunno = cdu.focus.alunno;
    if (focusAlunno === undefined) return;
    const dettaglio = carenzeDettaglioSemplice(
      this.alunni.getCarenze(getAlunnoEntity(cdu)),
      this.sigle()
    );
    focusAlunno.didattica.carenze = {
      dettaglio,
      numero: dettaglio.length,
      hasCarenze: dettaglio.length > 0
    };
  }

  private sigle(): string[] {
    if (this.sigleCache === null) {
      this.sigleCache = this.materie
        .findAllCached()
        .map((m) => m.id ?? '')
        .filter((s) => s !== '');
    }
    return this.sigleCache;
  }
}
