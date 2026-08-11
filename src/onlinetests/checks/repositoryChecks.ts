import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../report/OnlineTestReport';
import type { SampleDatabase } from '../SampleDatabaseBuilder';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import type { ITeachingAssignmentResolver } from '../../application/ports/ITeachingAssignmentResolver';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  CLASSE_BASE,
  CLASSE_PARTNER,
  DOCENTE_1,
  DOCENTE_2,
  DOCENTE_3,
  MATERIA_1,
  ALUNNO_PARTNER_EMAIL
} from '../SampleDatabaseBuilder';
import {
  ASSIGNMENT_MATRIX_DATE_E2E,
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER,
  e2eDocenteEmail
} from '../data/SharedTestDatabaseBuilder';

interface AssignmentMatrixSample {
  sampleSpreadsheetUrl: string;
}

interface ExpectedAssignment {
  materia: string;
  kind: 'MAIN' | 'ITP' | 'SPECIFICA';
  specifica: string | null;
  actor: string;
}

const EXPECTED_ASSIGNMENT_MATRIX: ExpectedAssignment[] = [
  { materia: 'MAT', kind: 'MAIN', specifica: null, actor: e2eDocenteEmail(10) },
  { materia: 'INF', kind: 'ITP', specifica: null, actor: e2eDocenteEmail(11) },
  {
    materia: 'LAB',
    kind: 'SPECIFICA',
    specifica: 'GRUPPO_A',
    actor: e2eDocenteEmail(3)
  },
  {
    materia: 'LAB',
    kind: 'SPECIFICA',
    specifica: 'SEMINARIO_POMERIDIANO',
    actor: e2eDocenteEmail(4)
  },
  {
    materia: 'INTERPRET',
    kind: 'SPECIFICA',
    specifica: 'CHITARRA',
    actor: e2eDocenteEmail(5)
  },
  { materia: 'IRC', kind: 'MAIN', specifica: null, actor: e2eDocenteEmail(12) },
  { materia: 'ALT', kind: 'MAIN', specifica: null, actor: e2eDocenteEmail(14) },
  // 2-hop VARIAZIONI_CATTEDRA override chain (docente2 -> docente15 -> docente16,
  // both hops decorse before ASSIGNMENT_MATRIX_DATE_E2E): must resolve to the
  // final holder, not the intermediate one (ref design
  // 2026-07-30-cattedra-chain-verification-design.md).
  { materia: 'ITA', kind: 'MAIN', specifica: null, actor: e2eDocenteEmail(16) }
];

function matrixDiagnostic(
  expected: ExpectedAssignment,
  assignment: ReturnType<ITeachingAssignmentResolver['resolveConsiglio']>[number] | undefined
): string {
  return [
    `class=${CLASSE_A}`,
    `subject=${expected.materia}`,
    `slotKind=${expected.kind}`,
    `specificity=${expected.specifica ?? 'null'}`,
    `expectedActor=${expected.actor}`,
    `actualActor=${assignment?.docenteEffettivo.id ?? 'missing'}`,
    `glfTrace=${JSON.stringify(assignment?.trace ?? [])}`
  ].join(', ');
}

/**
 * Complete live-GAS acceptance matrix. Every assertion uses the final ALDO port,
 * while the diagnostic preserves the complete GLF trace needed to debug a
 * cross-runtime mismatch.
 */
export function registerEffectiveAssignmentMatrixChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: AssignmentMatrixSample
): void {
  const db = container.get<RepositoryDatabase>('db');
  const classi = new ClasseRepository(db);
  const resolver = container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver');
  const classe = classi.findById(CLASSE_A);
  if (classe === null) {
    runner.add('Effective assignment matrix: fixture class', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        `class=${CLASSE_A}, subject=*, slotKind=*, specificity=null, expectedActor=fixture, actualActor=missing, glfTrace=[]`
      );
    });
    return;
  }
  const assignments = resolver.resolveConsiglio(classe, ASSIGNMENT_MATRIX_DATE_E2E, {
    includeReligioneAlt: true,
    routingPolicy: RoutingPolicy.DELEGATE_OR_PRINCIPAL
  });

  for (const expected of EXPECTED_ASSIGNMENT_MATRIX) {
    runner.add(
      `Effective assignment matrix: ${expected.kind} ${expected.materia}${expected.specifica === null ? '' : `.${expected.specifica}`}`,
      sample.sampleSpreadsheetUrl,
      () => {
        const assignment = assignments.find(
          (candidate) =>
            candidate.slot.materia.value === expected.materia &&
            candidate.slot.kind === expected.kind &&
            candidate.slot.specifica === expected.specifica
        );
        if (assignment?.docenteEffettivo.id !== expected.actor) {
          throw new ValidationError(matrixDiagnostic(expected, assignment));
        }
      }
    );
  }

  runner.add(
    'Effective assignment matrix: articulated parent retains assignments owned by both partners',
    sample.sampleSpreadsheetUrl,
    () => {
      const parent = classi.findById(CLASSE_C_PARENT);
      const parentAssignments =
        parent === null
          ? []
          : resolver.resolveConsiglio(parent, ASSIGNMENT_MATRIX_DATE_E2E, {
              includeReligioneAlt: true,
              routingPolicy: RoutingPolicy.DELEGATE_OR_PRINCIPAL
            });
      for (const classeId of [CLASSE_C, CLASSE_C_PARTNER]) {
        const assignment = parentAssignments.find(
          (candidate) => candidate.classeId.value === classeId
        );
        if (assignment === undefined) {
          throw new ValidationError(
            `class=${classeId}, subject=*, slotKind=*, specificity=null, expectedActor=partner-assignment, actualActor=missing, glfTrace=[]`
          );
        }
      }
    }
  );

  runner.add(
    'Effective assignment matrix: restriction-by-omission SUPPLENZE (empty CLASSI, valued MATERIE) resolves both of the anchor\'s own STO cattedre',
    sample.sampleSpreadsheetUrl,
    () => {
      const materiaSto = MateriaId.of('STO');
      for (const classeId of [CLASSE_B, CLASSE_C_PARTNER]) {
        const classe = classi.findById(classeId);
        if (classe === null) throw new ValidationError(`Classe seed ${classeId} non trovata`);
        // CLASSE_C_PARTNER is articulated: resolveMateria resolves BOTH partners'
        // slots (AldoTeachingResolutionConfig.resolutionClasses), so pick the
        // entry actually owned by this classeId rather than assuming index 0.
        const actor = resolver
          .resolveMateria(classe, materiaSto, ASSIGNMENT_MATRIX_DATE_E2E, RoutingPolicy.DELEGATE_OR_PRINCIPAL)
          .find((candidate) => candidate.classeId.value === classeId)?.docenteEffettivo.id;
        if (actor !== e2eDocenteEmail(17)) {
          throw new ValidationError(
            `class=${classeId}, subject=STO, slotKind=MAIN, specificity=null, expectedActor=${e2eDocenteEmail(17)}, actualActor=${actor ?? 'missing'}, glfTrace=[]`
          );
        }
      }
    }
  );

  runner.add(
    'Effective assignment matrix: .SPECIFICA-targeted MATERIE entry on a SUPPLENZE row overrides just that slot',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_A);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_A} non trovata`);
      const assignment = resolver
        .resolveMateria(
          classe,
          MateriaId.of('LAB'),
          new Date('2026-08-05T09:00:00Z'),
          RoutingPolicy.DELEGATE_OR_PRINCIPAL
        )
        .find(
          (candidate) =>
            candidate.slot.kind === 'SPECIFICA' && candidate.slot.specifica === 'SEMINARIO_POMERIDIANO'
        );
      if (assignment?.docenteEffettivo.id !== e2eDocenteEmail(18)) {
        throw new ValidationError(
          `class=${CLASSE_A}, subject=LAB, slotKind=SPECIFICA, specificity=SEMINARIO_POMERIDIANO, expectedActor=${e2eDocenteEmail(18)}, actualActor=${assignment?.docenteEffettivo.id ?? 'missing'}, glfTrace=${JSON.stringify(assignment?.trace ?? [])}`
        );
      }
    }
  );
}

/**
 * Registers repository round-trip and role-resolution priority-chain checks
 * (design spec §2 step 2.1/2.2) against the sample database built by
 * {@link SampleDatabaseBuilder}. Reads through the same `container.get('db')`
 * seam `Bootstrap.ts` wires. Repositories are built over the shared database;
 * effective assignments use the registered singleton application port.
 *
 * The 3-tier priority chain (SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI)
 * is exercised through `ITeachingAssignmentResolver`.
 */
export function registerRepositoryChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SampleDatabase
): void {
  const db = container.get<RepositoryDatabase>('db');
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const cattedre = container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver');
  const materia = MateriaId.of(MATERIA_1);

  runner.add(
    'ClasseRepository round-trip: seeded classe nome/materie',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) {
        throw new ValidationError(
          `Classe seed ${CLASSE_BASE} non trovata via ClasseRepository.findById`
        );
      }
      if (classe.nome !== CLASSE_BASE) {
        throw new ValidationError(`Atteso classe.nome === ${CLASSE_BASE}, ricevuto ${classe.nome}`);
      }
      const docentiMateria = classi.getDocentiPerMateria(classe, materia).map((d) => d.id);
      if (!docentiMateria.includes(DOCENTE_1)) {
        throw new ValidationError(
          `Attesa cattedra ${MATERIA_1} con titolare ${DOCENTE_1}, ricevuto [${docentiMateria.join(', ')}]`
        );
      }
    }
  );

  runner.add(
    'AlunnoRepository round-trip: articolata-partner-enrolled student',
    sample.sampleSpreadsheetUrl,
    () => {
      const alunno = alunni.findById(ALUNNO_PARTNER_EMAIL);
      if (alunno === null) {
        throw new ValidationError(
          `Alunno seed ${ALUNNO_PARTNER_EMAIL} non trovato via AlunnoRepository.findById`
        );
      }
      if (alunno.classe !== CLASSE_PARTNER) {
        throw new ValidationError(
          `Atteso alunno.classe === ${CLASSE_PARTNER} (articolata partner), ricevuto ${alunno.classe}`
        );
      }
    }
  );

  runner.add(
    'Teaching assignment priority chain — SUPPLENZE wins within its date window',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // Inside SUPPLENZE.DAL..AL (2026-07-01..2026-07-10) and BEFORE
      // VARIAZIONI_CATTEDRA.DAL (2026-07-05): GLF applies
      // SUPPLENZE routing to whichever holder priority 2/3 already produced.
      // Since SUPPLENZE.TITOLARE
      // is DOCENTE_1 (the CLASSI nominal holder, not the not-yet-decorsa
      // VARIAZIONI_CATTEDRA holder), this date must stay before DAL so
      // priority 2/3 still yields DOCENTE_1 for priority 1 to find and redirect.
      const docente = cattedre.resolveMateria(
        classe,
        materia,
        new Date('2026-07-03T00:00:00Z'),
        RoutingPolicy.DELEGATE_OR_PRINCIPAL
      )[0]?.routing.primary[0];
      if (docente?.id !== DOCENTE_2) {
        throw new ValidationError(
          `Atteso il supplente SUPPLENZE ${DOCENTE_2}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );

  runner.add(
    'Teaching assignment priority chain — VARIAZIONI_CATTEDRA wins outside the SUPPLENZE window',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // After SUPPLENZE.AL (2026-07-10) — SUPPLENZE no longer applies — and on/after
      // VARIAZIONI_CATTEDRA.DAL (2026-07-05), so priority 2 wins.
      const docente = cattedre.resolveMateria(
        classe,
        materia,
        new Date('2026-07-15T00:00:00Z'),
        RoutingPolicy.PRINCIPAL_ONLY
      )[0]?.routing.primary[0];
      if (docente?.id !== DOCENTE_3) {
        throw new ValidationError(
          `Atteso il nuovo titolare VARIAZIONI_CATTEDRA ${DOCENTE_3}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );

  runner.add(
    'Teaching assignment priority chain — CLASSI nominal fallback before both windows',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // Before SUPPLENZE.DAL (2026-07-01) and before VARIAZIONI_CATTEDRA.DAL
      // (2026-07-05) — neither source applies, so the CLASSI nominal holder (priority 3) wins.
      const docente = cattedre.resolveMateria(
        classe,
        materia,
        new Date('2026-06-01T00:00:00Z'),
        RoutingPolicy.PRINCIPAL_ONLY
      )[0]?.routing.primary[0];
      if (docente?.id !== DOCENTE_1) {
        throw new ValidationError(
          `Atteso il titolare nominale CLASSI ${DOCENTE_1}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );
}
