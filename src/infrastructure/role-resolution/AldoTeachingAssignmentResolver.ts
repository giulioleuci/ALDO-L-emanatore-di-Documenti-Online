import type {
  ITeachingAssignmentResolver,
  TeachingAssignment,
  TeachingSlotKind
} from '../../application/ports/ITeachingAssignmentResolver';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { MateriaId as MateriaIdValue } from '../../domain/value-objects/MateriaId';
import { DocenteRepository } from '../repositories/DocenteRepository';
import { AldoTeachingResolutionConfig } from './AldoTeachingResolutionConfig';
import { AmbiguousVariazioneCattedraError } from '../../domain/errors/DomainError';

/**
 * `SUPPLENZE.DAL`/`AL` e `VARIAZIONI_CATTEDRA.DAL` sono date di calendario
 * (`YYYY-MM-DD`) che RoleResolutionLib parsa a mezzanotte UTC e confronta come
 * istanti (`asOf <= validTo`, `AssignmentCandidate.isValidAt`). Un `asOf` con
 * l'ora escluderebbe l'ultimo giorno della supplenza. Questo è l'unico punto di
 * normalizzazione: ogni risoluzione ALDO passa da `resolveMateria`.
 * ponytail: la giornata è quella UTC — un job lanciato fra mezzanotte e le 02:00
 * italiane ricade nel giorno UTC precedente. Se emerge, normalizzare qui su
 * Europe/Rome.
 */
function giornoDiCalendario(data: Date): Date {
  return new Date(`${data.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export class AldoTeachingAssignmentResolver implements ITeachingAssignmentResolver {
  private readonly config: AldoTeachingResolutionConfig;
  private readonly docenti: DocenteRepository;

  constructor(database: RepositoryDatabase) {
    this.config = new AldoTeachingResolutionConfig(database);
    this.docenti = new DocenteRepository(database);
  }

  resolveMateria(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    routingPolicy?: RoutingPolicyValue
  ): TeachingAssignment[] {
    const configuration = this.config.create(classe, materia);
    try {
      return configuration
        .resolve(giornoDiCalendario(data), routingPolicy ?? null)
        .map((result) => this.toTeachingAssignment(result));
    } catch (error) {
      // The library never leaks past ALDO's own facade (ref CLAUDE.md
      // "src/infrastructure/" — infra facades wrap library calls behind
      // ALDO-owned interfaces).
      if (error instanceof AmbiguousAssignmentOverrideError) {
        throw new AmbiguousVariazioneCattedraError(error.message);
      }
      throw error;
    }
  }

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options: {
      includeReligioneAlt?: boolean;
      routingPolicy?: RoutingPolicyValue;
    } = {}
  ): TeachingAssignment[] {
    const assignments: TeachingAssignment[] = [];
    for (const materia of this.config.getMaterie()) {
      if (materia.isReligioneAlt && options.includeReligioneAlt !== true) continue;
      assignments.push(
        ...this.resolveMateria(classe, materia.materia, data, options.routingPolicy)
      );
    }
    return assignments;
  }

  private toTeachingAssignment(result: EffectiveAssignmentResult): TeachingAssignment {
    const routing = result.routing;
    return {
      slot: {
        materia: MateriaIdValue.of(String(result.slot.get('materia'))),
        kind: String(result.slot.get('kind')) as TeachingSlotKind,
        specifica:
          result.slot.get('specifica') === null ? null : String(result.slot.get('specifica'))
      },
      classeId: ClasseId.of(String(result.slot.get('classe'))),
      titolareNominale: this.toDocente(result.baseActor),
      titolare: this.toDocente(result.permanentActor),
      docenteEffettivo: this.toDocente(result.effectiveActor),
      delegationChain: result.delegationChain
        .getAllActorIds()
        .map((actorId) => this.toDocenteId(actorId)),
      routing: {
        primary: (routing?.primary ?? []).map((actor) => this.toDocente(actor)),
        cc: (routing?.cc ?? []).map((actor) => this.toDocente(actor)),
        bcc: (routing?.bcc ?? []).map((actor) => this.toDocente(actor))
      },
      trace: result.trace.toJSON()
    };
  }

  private toDocente(actor: Actor | null): Docente {
    if (actor === null) throw new AssignmentActorNotFoundError('null');
    return this.toDocenteId(actor.id);
  }

  private toDocenteId(actorId: string): Docente {
    const docente = this.docenti.findById(actorId);
    if (docente === null) throw new AssignmentActorNotFoundError(actorId);
    return docente;
  }
}
