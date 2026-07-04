import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';

/**
 * Computes aggregate counts not sourced from a single table (09 §11).
 * CE1 populates `cdu.istituto.statistiche`; class-level statistics
 * (`focus.classe.statistiche`) are added when the students section exists.
 */
export class StatisticheProvider implements ContextProvider {
  constructor(
    private readonly classi: ClasseRepository,
    private readonly docenti: DocenteRepository,
    private readonly alunni: AlunnoRepository
  ) {}

  provide(cdu: Cdu): void {
    const istituto = cdu.istituto;
    if (istituto === undefined) return;
    istituto.statistiche = {
      totaleClassi: this.classi.findAttive().length,
      totaleDocenti: this.docenti.findAll().length,
      totaleAlunni: this.alunni.findAttivi().length
    };
  }
}
