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
import { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import { GestioneSupplenti, ReligioneScelta } from '../../domain/value-objects/enums';
import { getClasseEntity } from './techEntities';
import { attachCduMateriaAssignmentIdentity } from './CduInternalMetadata';
import { buildPersonVm, type PersonVM } from './mappers/personVmMapper';
import { buildSubjectVm, type SubjectVM } from './mappers/subjectVmMapper';
import type { CurriculumVM } from './mappers/carenzeMapper';

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
      '(slot.materia != "IRC" && slot.materia != "ALT") || (slot.materia == "IRC" && studentReligion == "IRC") || (slot.materia == "ALT" && studentReligion == "ALT")'
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
  curriculum: CurriculumVM[]
): ProjectionAssignment[] {
  return assignments.map((assignment) =>
    assignmentInput(
      assignment,
      String(religione),
      specificityPattern(curriculum, assignment.slot.materia.value)
    )
  );
}

function specificityPattern(curriculum: CurriculumVM[], materiaId: string): string {
  const entry = curriculum.find((c) => c.materiaId === materiaId);
  const specifiche = entry?.specifiche.map((s) => s.nome) ?? [];
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

function gruppoNome(
  classi: IClasseRepository,
  classe: Classe,
  tipo: DocenteCdcVM['tipoArticolazione']
): string | null {
  if (tipo !== 'SEPARATO_PRIMO' && tipo !== 'SEPARATO_SECONDO') return null;
  const partners = classi.orderedPartners(classe);
  const partner = tipo === 'SEPARATO_PRIMO' ? partners[0] : partners[1];
  return partner === undefined ? null : classi.getIndirizzo(partner).nome;
}

function dedupeMaterie<T extends { sigla: string; specificita: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${item.sigla} ${item.specificita ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function materiaVm(
  materie: IMateriaRepository,
  classe: Classe,
  assignment: FlattenedProjectionAssignment
): SubjectVM | null {
  const baseId = MateriaId.of(assignment.slot.materia);
  const specifica = assignment.slot.specifica;
  const materia =
    specifica === null
      ? materie.findByIdCached(baseId)
      : (materie.findSpecifiche(baseId).find((m) => m.id === `${baseId.value}.${specifica}`) ??
        null);
  if (materia === null) return null;
  return buildSubjectVm(materia, {
    indirizzo: IndirizzoId.of(classe.indirizzo),
    isITP: assignment.slot.kind === 'ITP',
    principale: materia.principale,
    specificita: materia.specificita
  });
}

function personVmOf(teacher: ProjectionTeacher): PersonVM {
  return buildPersonVm({
    nome: teacher.nome,
    cognome: teacher.cognome,
    email: teacher.id,
    genere: teacher.genere as 'M' | 'F'
  });
}

/** Every subject in `materie`, names comma-joined (09 §10) — distinct from `SubjectVM.docentiDescrizione`, which joins people, not subjects. */
function docentiDescrizioneMaterie(materie: SubjectVM[]): string {
  return materie.map((m) => m.nomeSintetico).join(', ');
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
      classi.getDocentiRuoloArticolato(classe, 'TUTOR_ASL').map((docente) => docente.id ?? '')
    );
    const tutorOrient = new Set(
      classi.getDocentiRuoloArticolato(classe, 'TUTOR_ORIENT').map((docente) => docente.id ?? '')
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
      const materieVm = dedupeMaterie(
        assignments
          .map((assignment) => materiaVm(materie, classe, assignment))
          .filter((vm): vm is SubjectVM => vm !== null)
      );
      const tipoArt = tipoArticolazione(classi, classe, assignments);
      return {
        anagrafica: personVmOf(rowDocente),
        materie: materieVm,
        materieDescrizione: docentiDescrizioneMaterie(materieVm),
        materieSigle: materieVm.map((m) => m.sigla).join(', '),
        ruoli: {
          isCoordinatore,
          isTutorAsl,
          isTutorOrientamento,
          descrizione: descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
        },
        stato: {
          isSupplente,
          sostituisce: sostituisce === null ? null : personVmOf(sostituisce)
        },
        tipoArticolazione: tipoArt,
        gruppoNome: gruppoNome(classi, classe, tipoArt),
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
    const candidates = [...(candidatesByActor.get(docente.anagrafica.email ?? '') ?? [])];
    for (const materia of docente.materie) {
      const index = candidates.findIndex(
        (assignment) => {
          const catalogId =
            assignment.slot.specifica === null
              ? assignment.slot.materia.value
              : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
          return catalogId === materia.sigla;
        }
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
