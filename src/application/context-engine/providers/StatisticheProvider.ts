import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { getClasseEntity } from '../techEntities';
import { studentiDellaClasse } from '../studenti';
import { computeStatisticheAlunni } from '../mappers/statisticheAlunniMapper';

/**
 * Computes aggregate counts not sourced from a single table (09 §11):
 * `cdu.istituto.statistiche` always, and `cdu.focus.classe.studenti.statistiche`
 * over the class's active students when a class focus is present.
 */
export class StatisticheProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly docenti: IDocenteRepository,
    private readonly alunni: IAlunnoRepository
  ) {}

  provide(cdu: Cdu): void {
    if (cdu.istituto !== undefined) {
      cdu.istituto.statistiche = {
        totaleClassi: this.classi.findAttive().length,
        totaleDocenti: this.docenti.findAll().length,
        totaleAlunni: this.alunni.findAttivi().length
      };
    }
    this.classStats(cdu);
  }

  private classStats(cdu: Cdu): void {
    const studenti = cdu.focus.classe?.studenti;
    if (studenti === undefined) return;
    const attivi = studentiDellaClasse(this.classi, getClasseEntity(cdu), true);
    studenti.statistiche = computeStatisticheAlunni(attivi, this.alunni);
  }
}
