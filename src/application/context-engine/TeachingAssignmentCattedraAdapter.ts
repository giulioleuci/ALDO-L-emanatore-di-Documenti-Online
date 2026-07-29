import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { CattedraAssignment } from '../services/CattedraResolver';
import type { CattedraAssignmentsResolver } from './CdcAssembler';
import type { Classe } from '../../domain/entities/Classe';

/**
 * Transitional CDU seam: exposes first-class GLF teaching assignments through
 * the existing CdcAssembler input shape while consumers migrate independently.
 */
export class TeachingAssignmentCattedraAdapter implements CattedraAssignmentsResolver {
  constructor(private readonly assignments: ITeachingAssignmentResolver) {}

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options?: { includeReligioneAlt?: boolean }
  ): CattedraAssignment[] {
    return this.assignments.resolveConsiglio(classe, data, options).map((assignment) => ({
      materia: assignment.slot.materia,
      titolare: assignment.titolare,
      isItp: assignment.slot.kind === 'ITP',
      specifica: assignment.slot.specifica,
      supplente:
        assignment.docenteEffettivo.id === assignment.titolare.id
          ? null
          : assignment.docenteEffettivo,
      classeId: assignment.classeId
    }));
  }
}
