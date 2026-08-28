import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

export class ClasseMateriaFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const materiaId = params.materiaCorrente;
    if (materiaId == null) {
      throw new PipelineError('DOCUMENTO_CLASSE_MATERIA: materiaCorrente mancante');
    }
    const items = (cdu.focus.classe?.consiglioDiClasse ?? []).flatMap((docente) =>
      docente.materie
        .filter((materia) => materia.sigla === materiaId)
        .map((materia) => ({ docente, materia }))
    );
    if (items.length === 0) {
      throw new PipelineError(
        `DOCUMENTO_CLASSE_MATERIA: materia ${materiaId} non trovata nel consiglio di classe`
      );
    }
    cdu.focus.materia = items[0]!.materia;
    cdu.focus.classiMateria = { docenti: items.map(({ docente }) => docente.anagrafica) };
  }
}
