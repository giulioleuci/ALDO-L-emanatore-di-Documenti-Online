import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CattedraVM } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { PipelineError } from '../../../domain/errors/DomainError';
import { dedupeSubjectsMainOverItp, materiaVmFromSlot } from '../TeachingCouncilProjection';
import { buildPersonVmFromDocente } from '../mappers/personVmMapper';

/**
 * DOCENTE axis (spec §4.1.2): one aggregate document per teacher, scoped to
 * `focus.docente` with subjects grouped per class across every class they
 * teach in (`params.classiCompetenza`, supplied by
 * `DocumentGenerationService.generateForDocente` — this provider does not
 * enumerate the teacher's classes itself). Deliberately independent of
 * `focus.classe`/the `consiglio` token: unlike every other class-scoped
 * recipe, DOCENTE_AGGREGATO has no single class in focus, so cattedre are
 * resolved directly off `ITeachingAssignmentResolver.resolveConsiglio` per
 * listed class rather than reading a pre-built `consiglioDiClasse`.
 */
export class DocenteAggregatoFocusProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const docenteEmail = params.docenteCorrente;
    if (docenteEmail === null || docenteEmail === undefined || docenteEmail.trim() === '') {
      throw new PipelineError('DOCENTE: docenteCorrente mancante');
    }
    const classiCompetenza = params.classiCompetenza ?? [];
    const cattedre: CattedraVM[] = [];
    let anagrafica: Cdu['focus']['docente'] | undefined;

    for (const classeIdValue of classiCompetenza) {
      const classe = this.classi.findById(ClasseId.of(classeIdValue));
      if (classe === null) continue;
      const assignments = this.teachingAssignments
        .resolveConsiglio(classe, params.now, { includeReligioneAlt: true })
        .filter((a) => a.docenteEffettivo.id === docenteEmail);
      if (assignments.length === 0) continue;
      if (anagrafica === undefined) {
        anagrafica = buildPersonVmFromDocente(assignments[0]!.docenteEffettivo);
      }
      const materie = dedupeSubjectsMainOverItp(
        assignments
          .map((a) =>
            materiaVmFromSlot(this.materie, classe, {
              materia: a.slot.materia.value,
              kind: a.slot.kind,
              specifica: a.slot.specifica
            })
          )
          .filter((m): m is NonNullable<typeof m> => m !== null)
      );
      cattedre.push({ classeNome: classe.nome, anno: classe.anno.value, sezione: classe.sezione, materie });
    }

    if (anagrafica === undefined) {
      throw new PipelineError(`DOCENTE: nessuna cattedra trovata per ${docenteEmail}`);
    }
    cdu.focus.docente = { ...anagrafica, cattedre };
  }
}
