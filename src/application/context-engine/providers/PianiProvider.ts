import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { getAlunnoEntity, withFocusAlunno } from '../techEntities';
import { tipoPianoLabel } from '../mappers/labels';

/**
 * Fills `focus.alunno.didattica.piani` from PIANI (09 §4, 02 §4.2) and updates
 * the `focus.alunno.status.isBes` placeholder set by AlunnoProvider: it becomes
 * true when the student has at least one BES plan (09 §4 note — implicit order
 * dependency: `student` before `piani`).
 */
export class PianiProvider implements ContextProvider {
  constructor(private readonly alunni: IAlunnoRepository) {}

  provide(cdu: Cdu): void {
    withFocusAlunno(cdu, (focusAlunno) => {
      const items = this.alunni.getPiani(getAlunnoEntity(cdu)).map((p) => ({
        tipo: p.tipo,
        tipoLabel: tipoPianoLabel(p.tipo),
        isBes: p.isBES(),
        link: '',
        parametriGenerazione: p.getParametri()
      }));
      const hasBes = items.some((i) => i.isBes);
      focusAlunno.didattica.piani = { items, hasPiani: items.length > 0, hasBes };
      focusAlunno.status.isBes = hasBes;
    });
  }
}
