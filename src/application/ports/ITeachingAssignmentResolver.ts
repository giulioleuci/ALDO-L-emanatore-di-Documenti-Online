import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { TeachingSlotKind } from '../../domain/repositories/IClasseRepository';

export type { TeachingSlotKind } from '../../domain/repositories/IClasseRepository';

export interface TeachingSlot {
  materia: MateriaId;
  kind: TeachingSlotKind;
  specifica: string | null;
}

export interface TeachingAssignment {
  slot: TeachingSlot;
  classeId: ClasseId;
  titolareNominale: Docente;
  titolare: Docente;
  docenteEffettivo: Docente;
  delegationChain: Docente[];
  routing: {
    primary: Docente[];
    cc: Docente[];
    bcc: Docente[];
  };
  trace: readonly unknown[];
}

export interface ITeachingAssignmentResolver {
  resolveMateria(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    routingPolicy?: RoutingPolicyValue
  ): TeachingAssignment[];

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options?: {
      includeReligioneAlt?: boolean;
      routingPolicy?: RoutingPolicyValue;
    }
  ): TeachingAssignment[];
}
