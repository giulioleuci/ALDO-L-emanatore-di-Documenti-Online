import type { Alunno } from '../../../domain/entities/Alunno';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { TipoPiano } from '../../../domain/value-objects/enums';

export interface StatisticheAlunniVM {
  totale: number;
  conPianiDidattici: number;
  conBes: number;
  conDsa: number;
  ripetenti: number;
  rappresentanti: number;
}

/** Shared aggregate-count formula (02 §4.1/§8.6) — used for both the current year (StatisticheProvider) and each historical year (StoricoClasseProvider). */
export function computeStatisticheAlunni(attivi: Alunno[], alunni: IAlunnoRepository): StatisticheAlunniVM {
  let conPianiDidattici = 0,
    conBes = 0,
    conDsa = 0,
    ripetenti = 0,
    rappresentanti = 0;
  for (const a of attivi) {
    const piani = alunni.getPiani(a);
    if (piani.length > 0) conPianiDidattici++;
    if (piani.some((p) => p.isBES())) conBes++;
    if (piani.some((p) => p.tipo === TipoPiano.PDP_DSA)) conDsa++;
    if (a.isRipetente()) ripetenti++;
    if (a.isRappresentante()) rappresentanti++;
  }
  return { totale: attivi.length, conPianiDidattici, conBes, conDsa, ripetenti, rappresentanti };
}
