import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';
import { tipoPianoLabel } from '../mappers/labels';

/**
 * Selects the requested plan from the plans already loaded for the focused
 * student. The CDU projection deliberately retains data only, never the live
 * `Piano` entity held in `tech`.
 */
export class PianoFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const alunno = cdu.focus.alunno;
    const piano = alunno?.didattica.piani.items.find((item) => item.tipo === String(params.pianoTipo));
    if (piano === undefined) {
      throw new PipelineError(
        `Piano ${params.pianoTipo ?? ''} non trovato per l'alunno ${alunno?.anagrafica.email ?? params.target}`
      );
    }

    cdu.focus.piano = {
      tipo: piano.tipo as import('../../../domain/value-objects/enums').TipoPiano,
      tipoLabel: tipoPianoLabel(piano.tipo as import('../../../domain/value-objects/enums').TipoPiano),
      isBes: piano.isBes,
      parametriGenerazione: piano.parametriGenerazione
    };
  }
}
