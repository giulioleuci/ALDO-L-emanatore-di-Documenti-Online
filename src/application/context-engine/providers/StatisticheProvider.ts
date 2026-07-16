import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { TipoPiano } from '../../../domain/value-objects/enums';
import { getClasseEntity } from '../techEntities';
import { studentiDellaClasse } from '../studenti';

/**
 * Computes aggregate counts not sourced from a single table (09 §11):
 * `cdu.istituto.statistiche` always, and `cdu.focus.classe.studenti.statistiche`
 * over the class's active students when a class focus is present.
 */
export class StatisticheProvider implements ContextProvider {
  constructor(
    private readonly classi: ClasseRepository,
    private readonly docenti: IDocenteRepository,
    private readonly alunni: AlunnoRepository
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
    let conPianiDidattici = 0,
      conBes = 0,
      conDsa = 0,
      ripetenti = 0,
      rappresentanti = 0;
    for (const a of attivi) {
      const piani = this.alunni.getPiani(a);
      if (piani.length > 0) conPianiDidattici++;
      if (piani.some((p) => p.isBES())) conBes++;
      if (piani.some((p) => p.tipo === TipoPiano.PDP_DSA)) conDsa++;
      if (a.isRipetente()) ripetenti++;
      if (a.isRappresentante()) rappresentanti++;
    }
    studenti.statistiche = {
      totale: attivi.length,
      conPianiDidattici,
      conBes,
      conDsa,
      ripetenti,
      rappresentanti
    };
  }
}
