import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { TipoPiano } from '../../../domain/value-objects/enums';
import { getAlunnoEntity } from '../techEntities';
import { tipoPianoLabel } from '../mappers/labels';
import { elencoVm } from '../mappers/elencoVm';

export class PianiProvider implements ContextProvider {
  constructor(private readonly alunni: IAlunnoRepository) {}

  provide(cdu: Cdu): void {
    const focus = cdu.focus.alunno;
    if (focus === undefined) return;
    const elenco = this.alunni.getPiani(getAlunnoEntity(cdu))
      .map((piano) => ({
        tipo: piano.tipo,
        tipoLabel: tipoPianoLabel(piano.tipo),
        isBes: piano.isBES(),
        link: null,
        hasLink: false,
        parametriGenerazione: piano.getParametri(),
        hasParametriGenerazione: true
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo));
    focus.piani = {
      ...elencoVm(elenco),
      elencoDescrizione: elenco.map((piano) => piano.tipoLabel).join(', '),
      hasBes: elenco.some((piano) => piano.isBes)
    };
    focus.isBes = focus.piani.hasBes;
    focus.isDsa = elenco.some((piano) => piano.tipo === TipoPiano.PDP_DSA);
  }
}
