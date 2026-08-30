import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class ClasseMateriaFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const sigla = params.materiaCorrente;
    if (sigla === null || sigla === undefined) throw new PipelineError('materiaCorrente mancante');
    const materia = cdu.focus.classe?.consiglio?.elenco
      .flatMap((docente) => docente.materie)
      .find((item) => item.sigla === sigla);
    if (materia === undefined) throw new PipelineError(`Materia ${sigla} non trovata nel consiglio`);
    cdu.focus.materia = materia;
  }
}
