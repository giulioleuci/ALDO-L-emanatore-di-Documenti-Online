import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class DocenteClasseFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const docente = cdu.focus.classe?.consiglio?.elenco.find((item) => item.email === params.docenteCorrente);
    if (docente === undefined) throw new PipelineError(`Docente ${params.docenteCorrente ?? ''} non trovato`);
    cdu.focus.docente = docente;
  }
}
