import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class PianoFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const piano = cdu.focus.alunno?.piani.elenco.find((item) => item.tipo === params.pianoTipo);
    if (piano === undefined) throw new PipelineError(`Piano ${params.pianoTipo ?? ''} non trovato`);
    cdu.focus.piano = {
      tipo: piano.tipo,
      tipoLabel: piano.tipoLabel,
      isBes: piano.isBes,
      parametriGenerazione: piano.parametriGenerazione ?? {}
    };
  }
}
