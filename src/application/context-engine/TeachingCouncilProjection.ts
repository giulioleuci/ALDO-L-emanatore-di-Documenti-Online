import type { Cdu, DocenteCdcVM } from './Cdu';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../ports/ITeachingAssignmentResolver';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { GestioneSupplenti, ReligioneScelta } from '../../domain/value-objects/enums';
import { getClasseEntity } from './techEntities';
import { attachCduMateriaAssignmentIdentity } from './CduInternalMetadata';

export type CollectionProjectionOperation = ProjectionOperation;

export const councilProjectionOperations: CollectionProjectionOperation[] = [
  {
    type: 'flatMap',
    path: 'routing.primary',
    mergeParent: true
  },
  {
    type: 'groupBy',
    keys: ['id'],
    aggregates: {
      assignments: { type: 'collect', path: '$item' }
    }
  },
  {
    type: 'sortBy',
    keys: [{ path: 'assignments.0.metadata.cognome', direction: 'ASC' }]
  },
  { type: 'strategy', name: 'aldoTeachingCouncilVm' }
];

export const studentCouncilFilterOperations: CollectionProjectionOperation[] = [
  {
    type: 'filter',
    expression:
      '(slot.materia != "IRC" && slot.materia != "ALT") || (slot.materia == "IRC" && studentReligion == "SI") || (slot.materia == "ALT" && studentReligion == "ALT")'
  },
  {
    type: 'filter',
    expression: 'slot.hasSpecificity == false || slot.specifica match studentSpecificityPattern'
  }
];

export const routingPolicyByGestioneSupplenti: Record<GestioneSupplenti, RoutingPolicyValue> = {
  [GestioneSupplenti.SOLO_SUPPLENTI]: RoutingPolicy.DELEGATE_OR_PRINCIPAL,
  [GestioneSupplenti.ENTRAMBI]: RoutingPolicy.BOTH_EQUAL,
  [GestioneSupplenti.SOLO_TITOLARI]: RoutingPolicy.PRINCIPAL_ONLY
};

interface ProjectionTeacher {
  id: string;
  nome: string;
  cognome: string;
  genere: string;
  appellativo: string;
  nomeCompleto: string;
  metadata: { cognome: string };
}

interface ProjectionAssignment {
  slot: {
    materia: string;
    kind: string;
    specifica: string | null;
    hasSpecificity: boolean;
  };
  classeId: string;
  titolare: ProjectionTeacher;
  docenteEffettivo: ProjectionTeacher;
  routing: {
    primary: ProjectionTeacher[];
    cc: ProjectionTeacher[];
    bcc: ProjectionTeacher[];
  };
  studentReligion: string;
  studentSpecificityPattern: string;
}

type FlattenedProjectionAssignment = ProjectionAssignment & ProjectionTeacher;

interface ProjectionGroup {
  assignments: FlattenedProjectionAssignment[];
}

interface ProjectionRuntime {
  data?: unknown;
}

function teacher(docente: Docente): ProjectionTeacher {
  return {
    id: docente.id ?? '',
    nome: docente.nome,
    cognome: docente.cognome,
    genere: String(docente.genere),
    appellativo: docente.getAppellativo(),
    nomeCompleto: docente.getNomeCompleto(),
    metadata: { cognome: docente.cognome }
  };
}

function assignmentInput(
  assignment: TeachingAssignment,
  studentReligion: string,
  studentSpecificityPattern: string
): ProjectionAssignment {
  return {
    slot: {
      materia: assignment.slot.materia.value,
      kind: assignment.slot.kind,
      specifica: assignment.slot.specifica,
      hasSpecificity: assignment.slot.specifica !== null
    },
    classeId: assignment.classeId.value,
    titolare: teacher(assignment.titolare),
    docenteEffettivo: teacher(assignment.docenteEffettivo),
    routing: {
      primary: assignment.routing.primary.map(teacher),
      cc: assignment.routing.cc.map(teacher),
      bcc: assignment.routing.bcc.map(teacher)
    },
    studentReligion,
    studentSpecificityPattern
  };
}

export function prepareCouncilAssignments(
  assignments: TeachingAssignment[]
): ProjectionAssignment[] {
  return assignments.map((assignment) => assignmentInput(assignment, '', '(?!)'));
}

export function prepareStudentCouncilAssignments(
  assignments: TeachingAssignment[],
  religione: ReligioneScelta,
  curriculum: Record<string, { specifiche: string[] }>
): ProjectionAssignment[] {
  return assignments.map((assignment) =>
    assignmentInput(
      assignment,
      String(religione),
      specificityPattern(curriculum[assignment.slot.materia.value]?.specifiche ?? [])
    )
  );
}

function specificityPattern(specifiche: string[]): string {
  if (specifiche.length === 0) return '(?!)';
  return `^(?:${specifiche.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
}

function descrizione(
  isCoordinatore: boolean,
  isTutorAsl: boolean,
  isTutorOrientamento: boolean
): string[] {
  return [
    ...(isCoordinatore ? ['Coordinatore'] : []),
    ...(isTutorAsl ? ['Tutor ASL'] : []),
    ...(isTutorOrientamento ? ['Tutor Orientamento'] : []),
    'Docente'
  ];
}

function tipoArticolazione(
  classi: IClasseRepository,
  classe: Classe,
  assignments: FlattenedProjectionAssignment[]
): DocenteCdcVM['tipoArticolazione'] {
  if (!classi.isArticolata(classe)) return null;
  const partners = classi.orderedPartners(classe);
  if (partners.length < 2) return null;
  const classIds = new Set(assignments.map((assignment) => assignment.classeId));
  const inPrimo = classIds.has(partners[0]!.classeId.value);
  const inSecondo = classIds.has(partners[1]!.classeId.value);
  if (inPrimo && inSecondo) return 'COMUNE';
  if (inPrimo) return 'SEPARATO_PRIMO';
  if (inSecondo) return 'SEPARATO_SECONDO';
  return null;
}

function councilVmStrategy(
  classi: IClasseRepository,
  materie: IMateriaRepository
): ProjectionStrategy {
  return (value, _operation, runtime) => {
    const groups = value as ProjectionGroup[];
    const cdu = (runtime as ProjectionRuntime).data as Parameters<typeof getClasseEntity>[0];
    const classe = getClasseEntity(cdu);
    const coordinatori = new Set(classi.getCoordinatori(classe).map((docente) => docente.id ?? ''));
    const tutorAsl = new Set(
      classi.getDocentiRuolo(classe, 'TUTOR_ASL').map((docente) => docente.id ?? '')
    );
    const tutorOrient = new Set(
      classi.getDocentiRuolo(classe, 'TUTOR_ORIENT').map((docente) => docente.id ?? '')
    );

    return groups.map((group, index) => {
      const assignments = group.assignments;
      const first = assignments[0]!;
      const rowDocente = first;
      const hasDelegation = first.docenteEffettivo.id !== first.titolare.id;
      const displaysDelegation =
        hasDelegation &&
        (first.routing.primary.length > 1 || rowDocente.id === first.docenteEffettivo.id);
      const isSupplente = displaysDelegation && rowDocente.id === first.docenteEffettivo.id;
      const sostituisce = displaysDelegation
        ? isSupplente
          ? first.titolare
          : first.docenteEffettivo
        : null;
      const isCoordinatore = coordinatori.has(rowDocente.id);
      const isTutorAsl = tutorAsl.has(rowDocente.id);
      const isTutorOrientamento = tutorOrient.has(rowDocente.id);
      return {
        anagrafica: {
          nome: rowDocente.nome,
          cognome: rowDocente.cognome,
          email: rowDocente.id,
          genere: rowDocente.genere,
          appellativo: rowDocente.appellativo
        },
        materie: assignments.map((assignment) => ({
          sigla: assignment.slot.materia,
          nome:
            materie.findByIdCached(MateriaId.of(assignment.slot.materia))?.nome ??
            assignment.slot.materia,
          colore: '',
          specificita: assignment.slot.specifica
        })),
        ruoli: {
          isCoordinatore,
          isTutorAsl,
          isTutorOrientamento,
          descrizione: descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
        },
        stato: {
          isSupplente,
          sostituisce:
            sostituisce === null ? null : { nome: sostituisce.nomeCompleto, email: sostituisce.id }
        },
        tipoArticolazione: tipoArticolazione(classi, classe, assignments),
        isITP: assignments.some((assignment) => assignment.slot.kind === 'ITP'),
        flags: { isNotLast: index < groups.length - 1 }
      } satisfies DocenteCdcVM;
    });
  };
}

export function createTeachingCouncilProjection(
  classi: IClasseRepository,
  materie: IMateriaRepository
): {
  consiglio: CollectionProjectionInterceptor;
  alunno: CollectionProjectionInterceptor;
} {
  const registry = new ProjectionRegistry().register(
    'aldoTeachingCouncilVm',
    councilVmStrategy(classi, materie)
  );
  const expressionEngine = new ExpressionEngineService({ logger: new LoggerService() });
  const projector = new CollectionProjector({
    registry,
    expressionEngine,
    logger: new LoggerService()
  });
  return {
    consiglio: new CollectionProjectionInterceptor(new LoggerService(), projector, {
      targetProviders: ['consiglio'],
      targetPaths: ['focus.classe.consiglioDiClasse'],
      operations: councilProjectionOperations
    }),
    alunno: new CollectionProjectionInterceptor(new LoggerService(), projector, {
      targetProviders: ['student'],
      targetPaths: ['focus.alunno.consiglioDiClasseFiltrato'],
      operations: [...studentCouncilFilterOperations, ...councilProjectionOperations]
    })
  };
}

export function resolveCouncilForProjection(
  resolver: ITeachingAssignmentResolver,
  classe: Classe,
  date: Date,
  gestioneSupplenti: GestioneSupplenti
): TeachingAssignment[] {
  return resolver.resolveConsiglio(classe, date, {
    includeReligioneAlt: true,
    routingPolicy: routingPolicyByGestioneSupplenti[gestioneSupplenti]
  });
}

/**
 * The GLF projector materializes fresh VM objects, so assignment identity is
 * attached only after interception. This remains internal metadata: templates
 * and serialized CDU data retain the canonical four-field materia shape.
 */
export function attachCouncilProjectionMetadata(cdu: Cdu, assignments: TeachingAssignment[]): void {
  const candidatesByActor = new Map<string, TeachingAssignment[]>();
  for (const assignment of assignments) {
    for (const docente of assignment.routing.primary) {
      if (docente.id === null) continue;
      const candidates = candidatesByActor.get(docente.id) ?? [];
      candidates.push(assignment);
      candidatesByActor.set(docente.id, candidates);
    }
  }
  for (const docente of cdu.focus.classe?.consiglioDiClasse ?? []) {
    const candidates = [...(candidatesByActor.get(docente.anagrafica.email) ?? [])];
    for (const materia of docente.materie) {
      const index = candidates.findIndex(
        (assignment) =>
          assignment.slot.materia.value === materia.sigla &&
          assignment.slot.specifica === materia.specificita
      );
      const assignment = index === -1 ? undefined : candidates.splice(index, 1)[0];
      if (assignment !== undefined) {
        attachCduMateriaAssignmentIdentity(materia, {
          classeId: assignment.classeId.value,
          kind: assignment.slot.kind
        });
      }
    }
  }
}
