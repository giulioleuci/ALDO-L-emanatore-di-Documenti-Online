import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class DocenteClasseMateriaFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const docente = cdu.focus.classe?.consiglio?.elenco.find(
      (item) => item.email === params.docenteCorrente
    );
    const materia = docente?.materie.find((item) => item.sigla === params.materiaCorrente);
    if (docente === undefined || materia === undefined)
      throw new PipelineError('Cattedra docente/materia non trovata');
    cdu.focus.docente = docente;
    cdu.focus.materia = materia;
  }
}
