import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../report/OnlineTestReport';
import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { recipe } from '../../application/context-engine/Recipe';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  type SharedTestDatabase,
  ASSIGNMENT_MATRIX_DATE_E2E,
  CLASSE_A,
  CLASSE_C,
  CLASSE_C_PARTNER,
  e2eAlunnoEmail,
  e2eDocenteEmail
} from '../data/SharedTestDatabaseBuilder';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../application/ports/ITeachingAssignmentResolver';
import { GestioneSupplenti, TipoPiano, TipoProgetto } from '../../domain/value-objects/enums';
import { composeRisolutoreRuoli } from '../../config/ApplicationComposition';
import { resolveEffectiveDocenti } from '../../application/context-engine/TeachingCouncilProjection';
import { ApplyPermissionsStep } from '../../application/pipelines/documentSteps';
import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import { getCduMateriaAssignmentIdentity } from '../../application/context-engine/CduInternalMetadata';

interface AssignmentMatrixSample {
  sampleSpreadsheetUrl: string;
}

/**
 * Focal identities for the two CDU access-path checks below. Both must exist in
 * the dataset `SharedTestDatabaseBuilder` actually seeds — the retired
 * `SampleDatabaseBuilder` constants (`4A`/`alunno5@…`) are NOT seeded any more,
 * exactly like `repositoryChecks`' own `ALUNNO_PARTNER_EMAIL`.
 * `e2ealunno49` is the first student of `3C-C` (fixtures.ts `CLASS_LAYOUTS`),
 * i.e. the articolata partner group — same role the retired constant played.
 */
const CDU_FOCUS_CLASSE = CLASSE_A;
const CDU_FOCUS_ALUNNO = e2eAlunnoEmail(49);

const EXPECTED_STUDENT_COUNCILS = [
  {
    student: e2eAlunnoEmail(1),
    actors: [
      // docente2 still appears in its own right for INF/ITP (ENTRAMBI shows both
      // titolare and supplente as separate rows, ref BOTH_EQUAL routing);
      // docente16 is ITA's own final holder (2-hop VARIAZIONI_CATTEDRA chain
      // 2 -> 15 -> 16), a fully-applied override with no dual-display.
      e2eDocenteEmail(2),
      e2eDocenteEmail(16),
      e2eDocenteEmail(3),
      e2eDocenteEmail(4),
      e2eDocenteEmail(10),
      e2eDocenteEmail(11)
    ]
  },
  {
    student: e2eAlunnoEmail(2),
    actors: [
      // docente2 still appears in its own right for INF/ITP (ENTRAMBI shows both
      // titolare and supplente as separate rows, ref BOTH_EQUAL routing);
      // docente16 is ITA's own final holder (2-hop VARIAZIONI_CATTEDRA chain
      // 2 -> 15 -> 16), a fully-applied override with no dual-display.
      e2eDocenteEmail(2),
      e2eDocenteEmail(16),
      e2eDocenteEmail(3),
      e2eDocenteEmail(4),
      e2eDocenteEmail(10),
      e2eDocenteEmail(11),
      e2eDocenteEmail(12)
    ]
  },
  {
    student: e2eAlunnoEmail(4),
    actors: [
      // docente2 still appears in its own right for INF/ITP (ENTRAMBI shows both
      // titolare and supplente as separate rows, ref BOTH_EQUAL routing);
      // docente16 is ITA's own final holder (2-hop VARIAZIONI_CATTEDRA chain
      // 2 -> 15 -> 16), a fully-applied override with no dual-display.
      e2eDocenteEmail(2),
      e2eDocenteEmail(16),
      e2eDocenteEmail(3),
      e2eDocenteEmail(4),
      e2eDocenteEmail(5),
      e2eDocenteEmail(7),
      e2eDocenteEmail(10),
      e2eDocenteEmail(11),
      e2eDocenteEmail(14)
    ]
  }
] as const;

/**
 * Fixed from the articulated E2E fixture, deliberately independent of rendered items.
 * MAT is a **condivisa** column (`classeId: null`, one column for the whole group):
 * `SharedTestDatabaseBuilder.seedClassi` pins 3C-C's MAT to 3C-S's own MAT holder
 * (e2edocente1), so `ClasseRepository.getMaterieArticolazione` classifies it as shared
 * and the generator emits a single ungrouped column for it — unlike ITA/ING/STO, which
 * have disjoint holders per partner and therefore get one column each per classe.
 */
const EXPECTED_ARTICULATED_COLUMNS = [
  { header: 'REL/ALT', classeId: null, subjects: ['IRC', 'ALT'] },
  { header: 'Matematica', classeId: null, subjects: ['MAT'] },
  { header: 'Italiano', classeId: CLASSE_C, subjects: ['ITA'] },
  { header: 'Inglese', classeId: CLASSE_C, subjects: ['ING'] },
  { header: 'Storia', classeId: CLASSE_C, subjects: ['STO'] },
  { header: 'Scienze', classeId: CLASSE_C, subjects: ['SCIENZE'] },
  { header: 'Fisica', classeId: CLASSE_C, subjects: ['FISICA'] },
  { header: 'Informatica', classeId: CLASSE_C, subjects: ['INF'] },
  { header: 'Italiano', classeId: CLASSE_C_PARTNER, subjects: ['ITA'] },
  { header: 'Inglese', classeId: CLASSE_C_PARTNER, subjects: ['ING'] },
  { header: 'Storia', classeId: CLASSE_C_PARTNER, subjects: ['STO'] },
  { header: 'Greco', classeId: CLASSE_C_PARTNER, subjects: ['GRECO'] },
  { header: 'Latino', classeId: CLASSE_C_PARTNER, subjects: ['LATINO'] },
  { header: 'Filosofia', classeId: CLASSE_C_PARTNER, subjects: ['FILOSOFIA'] }
] as const;

function emails(values: Iterable<string>): string[] {
  return [...values].sort();
}

interface MaterieColonneGroups {
  group1: Array<Record<string, unknown>>;
  group2?: Array<Record<string, unknown>>;
  group3?: Array<Record<string, unknown>>;
}

/**
 * `SheetMaterieConPermessiGeneratorStrategy` hands its `ITemplateEngine.processSheet` fake the
 * full CDU as an opaque `Record<string, unknown>`. There are two distinct `materieColonne`
 * shapes on that context: the printable `focus.classe.sheet.materieColonne` (02 §2.17/§4.1,
 * moved off the CDU root by Task 22) drops the ACL-only `classeId`/`specificita`/`kind` fields
 * (final-review fix wave, `SheetMaterieConPermessiGeneratorStrategy.buildGroups`), while the
 * root-context `materieColonne` key `renderColumns` also sets is the broader internal shape fed
 * to `dynamic_columns` template rendering and still carries `classeId` per column — this check
 * needs `classeId` to verify per-partner column ownership, so it reads the root key.
 */
function materieColonneOf(context: Record<string, unknown>): MaterieColonneGroups {
  return (context['materieColonne'] ?? { group1: [] }) as MaterieColonneGroups;
}

interface AssignmentTuple {
  classeId: string;
  materia: string;
  kind: string;
  specifica: string | null;
  actor: string;
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function tupleKey(tuple: AssignmentTuple): string {
  const catalogId =
    tuple.specifica === null ? tuple.materia : `${tuple.materia}.${tuple.specifica}`;
  return [tuple.classeId, catalogId, tuple.kind, tuple.specifica ?? 'null', tuple.actor].join('|');
}

function assignmentTuples(assignments: TeachingAssignment[]): AssignmentTuple[] {
  return assignments.flatMap((assignment) =>
    assignment.routing.primary.flatMap((docente) =>
      docente.id === null
        ? []
        : [
            {
              classeId: assignment.classeId.value,
              materia: assignment.slot.materia.value,
              kind: assignment.slot.kind,
              specifica: assignment.slot.specifica,
              actor: docente.id
            }
          ]
    )
  );
}

function assignmentRecipients(assignments: TeachingAssignment[]): string[] {
  return emails(unique(assignmentTuples(assignments).map((tuple) => tuple.actor)));
}

function councilTuple(
  docente: { anagrafica: { email: string | null } },
  materia: { sigla: string; specificita: string | null }
): string {
  const identity = getCduMateriaAssignmentIdentity(materia);
  const separator = materia.sigla.indexOf('.');
  const specifica =
    separator === -1 ? (materia.specificita ?? 'null') : materia.sigla.slice(separator + 1);
  return [
    identity?.classeId ?? 'missing',
    materia.sigla,
    identity?.kind ?? 'missing',
    specifica,
    docente.anagrafica.email
  ].join('|');
}

function councilTuples(cdu: ReturnType<ContextBuilder['build']>): string[] {
  return (cdu.focus.classe?.consiglioDiClasse ?? []).flatMap((docente) =>
    docente.materie.map((materia) => councilTuple(docente, materia))
  );
}

function councilRows(cdu: ReturnType<ContextBuilder['build']>): string[] {
  return (cdu.focus.classe?.consiglioDiClasse ?? []).map((docente) =>
    `${docente.anagrafica.email}:${docente.materie
      .map((materia) => councilTuple(docente, materia))
      .sort()
      .join(',')}`
  );
}

function assertCouncilTuples(
  consumer: string,
  assignments: TeachingAssignment[],
  cdu: ReturnType<ContextBuilder['build']>
): void {
  // Deduplicate expected tuples to match councilVmStrategy's dedupeMaterie behavior:
  // remove duplicate (actor, materia, specificita) combinations, keeping the first occurrence
  const allTuples = assignmentTuples(assignments).map(tupleKey);
  const seenDedupeKeys = new Set<string>();
  const dedupedTuples: string[] = [];
  const tuplesByActor = new Map<string, Set<string>>();

  for (const tupleStr of allTuples) {
    const parts = tupleStr.split('|');
    if (parts.length < 5 || parts[1] === undefined || parts[3] === undefined || parts[4] === undefined) {
      dedupedTuples.push(tupleStr);
      continue;
    }
    const actor = parts[4];
    const dedupeKey = `${actor}|${parts[1]}|${parts[3]}`; // actor|materia|specificita
    if (seenDedupeKeys.has(dedupeKey)) continue; // skip duplicate
    seenDedupeKeys.add(dedupeKey);
    dedupedTuples.push(tupleStr);

    // Track for rows
    if (!tuplesByActor.has(actor)) {
      tuplesByActor.set(actor, new Set());
    }
    tuplesByActor.get(actor)!.add(tupleStr);
  }

  const expected = dedupedTuples.sort();
  const actual = councilTuples(cdu).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new ValidationError(
      `${consumer}: expectedTuples=${JSON.stringify(expected)}, actualTuples=${JSON.stringify(actual)}`
    );
  }

  const expectedRows = [...tuplesByActor.entries()]
    .map(([actor, tuples]) => `${actor}:${[...tuples].sort().join(',')}`)
    .sort();
  const actualRows = councilRows(cdu).sort();
  if (expectedRows.length !== actualRows.length) {
    throw new ValidationError(
      `${consumer}: expectedCouncilLength=${expectedRows.length}, actualCouncilLength=${actualRows.length}`
    );
  }
  if (JSON.stringify(expectedRows) !== JSON.stringify(actualRows)) {
    throw new ValidationError(
      `${consumer}: expectedRows=${JSON.stringify(expectedRows)}, actualRows=${JSON.stringify(actualRows)}`
    );
  }
}

function consumerDiagnostic(
  consumer: string,
  expected: string[],
  actual: string[],
  assignments: TeachingAssignment[]
): string {
  const missing = expected.find((actor) => !actual.includes(actor));
  const extra = actual.find((actor) => !expected.includes(actor));
  const actor = missing ?? extra ?? 'unknown';
  const assignment = assignments.find((candidate) =>
    candidate.routing.primary.some((docente) => docente.id === actor)
  );
  return [
    `consumer=${consumer}`,
    `class=${assignment?.classeId.value ?? CLASSE_A}`,
    `subject=${assignment?.slot.materia.value ?? '*'}`,
    `slotKind=${assignment?.slot.kind ?? '*'}`,
    `specificity=${assignment?.slot.specifica ?? 'null'}`,
    `expectedActor=${missing ?? expected.join('|')}`,
    `actualActor=${missing === undefined ? (extra ?? actual.join('|')) : 'missing'}`,
    `glfTrace=${JSON.stringify(assignment?.trace ?? [])}`
  ].join(', ');
}

function assertSameRecipients(
  consumer: string,
  expected: string[],
  actual: string[],
  assignments: TeachingAssignment[]
): void {
  const normalized = emails(unique(actual));
  if (JSON.stringify(expected) !== JSON.stringify(normalized)) {
    throw new ValidationError(consumerDiagnostic(consumer, expected, normalized, assignments));
  }
}

/**
 * Runs the complete matrix through real application consumers while recording
 * only their external side effects. This is deliberately part of OnlineTests:
 * the same TypeScript is transpiled and executed by GAS V8.
 */
export function registerEffectiveAssignmentConsumerChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: AssignmentMatrixSample
): void {
  const db = container.get<RepositoryDatabase>('db');
  const contextBuilder = container.get<ContextBuilder>('contextBuilder');
  const resolver = container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver');
  const classi = new ClasseRepository(db);
  const classe = classi.findById(CLASSE_A);
  if (classe === null) {
    runner.add('Effective assignment consumers: fixture class', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        `consumer=fixture, class=${CLASSE_A}, subject=*, slotKind=*, specificity=null, expectedActor=fixture, actualActor=missing, glfTrace=[]`
      );
    });
    return;
  }
  const assignments = resolver.resolveConsiglio(classe, ASSIGNMENT_MATRIX_DATE_E2E, {
    includeReligioneAlt: true,
    routingPolicy: RoutingPolicy.BOTH_EQUAL
  });
  const expected = assignmentRecipients(assignments);
  const cdu = contextBuilder.build(
    { target: CLASSE_A, tipoTarget: 'classe', now: ASSIGNMENT_MATRIX_DATE_E2E },
    recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
  );
  const roles = composeRisolutoreRuoli(db, resolver);

  const renderedSheetHeaders = (sheetCdu: ReturnType<ContextBuilder['build']>): string[] => {
    const sheets = {
      getSheetInfo: (): SpreadsheetSheetInfo[] => [
        { name: 'Sheet1', sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount: 20, columnCount: 20 } }
      ],
      protectRanges: (): SpreadsheetProtectResult => ({
        spreadsheetId: 'header-sheet', protectedCount: 0, protectedRangeIds: [], replies: []
      })
    } as unknown as SpreadsheetService;
    const rendered: SheetColumnLayout[] = [];
    const templates = {
      processSheet: (_spreadsheetId: string, context: Record<string, unknown>): SheetColumnLayout[] => {
        const groups = materieColonneOf(context);
        const layout = [...groups.group1, ...(groups.group2 ?? []), ...(groups.group3 ?? [])].map(
          (item, index) => ({
            sheetName: 'Sheet1',
            column: index + 1,
            header: typeof item['header'] === 'string' ? item['header'] : '',
            isLabel: false,
            item
          })
        );
        rendered.push(...layout);
        return layout;
      }
    } as unknown as ITemplateEngine;
    const config = ConfigurazioneDocumento.fromData({
      ID: 'MATRIX_HEADERS', TIPO: 'MATRIX', GENERATORE: 'SHEET_CON_MATERIE_E_PERMESSI',
      CONDIZIONE: null, MODELLI: '{"templateId":"matrix"}', FILE_NAME: 'matrix', PATH_OUT: 'matrix',
      DUPLICAZIONE: 'NEGATA', PERMESSI: null, POST_PROCESSO: null, PARAMETRI: null,
      GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GSHEET'
    });
    new SheetMaterieConPermessiGeneratorStrategy(sheets, new MateriaRepository(db), templates, roles).render(
      'header-sheet', sheetCdu, config
    );
    return rendered.map((column) => String(column.header));
  };

  runner.add('Effective assignment consumers: rendered sheet header REL/ALT', sample.sampleSpreadsheetUrl, () => {
    const headers = renderedSheetHeaders(cdu);
    if (headers[0] !== 'REL/ALT') {
      throw new ValidationError(`expected rendered REL/ALT header, actual=${JSON.stringify(headers)}`);
    }
  });

  runner.add('Effective assignment consumers: rendered articulated sheet header REL/ALT', sample.sampleSpreadsheetUrl, () => {
    const noAltCdu = contextBuilder.build(
      { target: CLASSE_C, tipoTarget: 'classe', now: ASSIGNMENT_MATRIX_DATE_E2E },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    const headers = renderedSheetHeaders(noAltCdu);
    if (headers[0] !== 'REL/ALT') {
      throw new ValidationError(`expected rendered REL/ALT header, actual=${JSON.stringify(headers)}`);
    }
  });

  runner.add(
    'Effective assignment consumers: full CDU council',
    sample.sampleSpreadsheetUrl,
    () => {
      assertCouncilTuples('full CDU council', assignments, cdu);
    }
  );

  runner.add('Effective assignment consumers: role recipients', sample.sampleSpreadsheetUrl, () => {
    assertSameRecipients(
      'role recipients',
      expected,
      roles
        .risolvi('CDC', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
        .map((email) => email.value),
      assignments
    );
  });

  runner.add(
    'Effective assignment consumers: email recipients',
    sample.sampleSpreadsheetUrl,
    () => {
      // Titolare/supplente content-mismatch fix: PER_DOCENTE now splits a
      // titolare's cattedra into one EmailTarget per actor at enumeration time
      // (EmailNotificationService.expandDocenteActors) and ResolveRecipientsStep
      // freshness-rechecks only the single actor a target's content was built
      // for, rather than fanning a shared content build out to several
      // recipients. `resolveEffectiveDocenti` is the function both call sites
      // share, so it is what this consumer check must exercise to agree with
      // the CDC/role/document/sheet consumers below.
      const actual = new Set<string>();
      const principals = new Set(
        assignments.flatMap((assignment) =>
          assignment.titolare.id === null ? [] : [assignment.titolare.id]
        )
      );
      for (const principal of principals) {
        for (const actor of resolveEffectiveDocenti(
          resolver,
          [classe],
          principal,
          ASSIGNMENT_MATRIX_DATE_E2E,
          GestioneSupplenti.ENTRAMBI
        )) {
          actual.add(actor);
        }
      }
      assertSameRecipients('email recipients', expected, emails(actual), assignments);
    }
  );

  runner.add(
    'Effective assignment consumers: document ACL recipients',
    sample.sampleSpreadsheetUrl,
    () => {
      const permissions: string[] = [];
      const drive = {
        setPermission: (_fileId: string, email: string): void => {
          permissions.push(email);
        },
        setPermissions: (grants: Array<{ email: string }>): void => {
          permissions.push(...grants.map((g) => g.email));
        }
      } as unknown as IDriveFacade;
      const row = {
        ID: 'MATRIX_DOCUMENT',
        TIPO: 'MATRIX',
        GENERATORE: 'DOCUMENTO_GENERICO',
        CONDIZIONE: null,
        MODELLI: '{"templateId":"matrix"}',
        FILE_NAME: 'matrix',
        PATH_OUT: 'matrix',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: JSON.stringify({
          file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
          folder: [],
          regolaSupplente: { file: 'ENTRAMBI' }
        }),
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'COMPLETA',
        FORMATO: 'GDOC',
        REGISTRA_DOC: '{}',
        REGISTRA_FOLD: '{}'
      };
      const ctx = new PipelineContext();
      ctx.set('config', row);
      ctx.set('confDoc', ConfigurazioneDocumento.fromData(row));
      ctx.set('cdu', cdu);
      ctx.set('shouldGenerate', true);
      ctx.set('newFileId', 'matrix-document');
      new ApplyPermissionsStep(new LoggerService(), drive, roles).execute(ctx);
      assertSameRecipients('document ACL recipients', expected, permissions, assignments);
    }
  );

  runner.add(
    'Effective assignment consumers: spreadsheet column ACL recipients',
    sample.sampleSpreadsheetUrl,
    () => {
      const requests: SpreadsheetProtectRequest[] = [];
      const sheets = {
        getSheetInfo: (): SpreadsheetSheetInfo[] => [
          {
            name: 'Sheet1',
            sheetId: 0,
            index: 0,
            hidden: false,
            gridProperties: { rowCount: 20, columnCount: 20 }
          }
        ],
        protectRanges: (
          _spreadsheetId: string,
          input: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]
        ): SpreadsheetProtectResult => {
          requests.push(...(Array.isArray(input) ? input : [input]));
          return {
            spreadsheetId: 'matrix-sheet',
            protectedCount: requests.length,
            protectedRangeIds: requests.map((_, index) => index),
            replies: []
          };
        }
      } as unknown as SpreadsheetService;
      const templates = {
        processSheet: (
          _spreadsheetId: string,
          context: Record<string, unknown>
        ): SheetColumnLayout[] => {
          const groups = materieColonneOf(context);
          return [...groups.group1, ...(groups.group2 ?? []), ...(groups.group3 ?? [])].map(
            (item, index) => {
              const header =
                typeof item['header'] === 'string'
                  ? item['header']
                  : typeof item['sigla'] === 'string'
                    ? item['sigla']
                    : '';
              return {
                sheetName: 'Sheet1',
                column: index + 1,
                header,
                isLabel: false,
                item
              };
            }
          );
        }
      } as unknown as ITemplateEngine;
      const config = ConfigurazioneDocumento.fromData({
        ID: 'MATRIX_SHEET',
        TIPO: 'MATRIX',
        GENERATORE: 'SHEET_CON_MATERIE_E_PERMESSI',
        CONDIZIONE: null,
        MODELLI: '{"templateId":"matrix"}',
        FILE_NAME: 'matrix',
        PATH_OUT: 'matrix',
        DUPLICAZIONE: 'NEGATA',
        PERMESSI: null,
        POST_PROCESSO: null,
        PARAMETRI: null,
        GESTIONE_ARTICOLAZIONE: 'COMPLETA',
        FORMATO: 'GSHEET'
      });
      new SheetMaterieConPermessiGeneratorStrategy(
        sheets,
        new MateriaRepository(db),
        templates,
        roles
      ).render('matrix-sheet', cdu, config);
      const coordinatori = new Set(
        classi.getCoordinatori(classe).map((docente) => docente.id ?? '')
      );
      const actual = new Set(
        requests
          .flatMap((request) => request.editors?.users ?? [])
          .filter((email) => !coordinatori.has(email))
      );
      assertSameRecipients(
        'spreadsheet column ACL recipients',
        expected,
        emails(actual),
        assignments
      );
    }
  );

  runner.add(
    'Effective assignment consumers: REL/ALT combined recipients',
    sample.sampleSpreadsheetUrl,
    () => {
      const religionAssignments = assignments.filter((assignment) =>
        ['IRC', 'ALT'].includes(assignment.slot.materia.value)
      );
      assertSameRecipients(
        'REL/ALT combined recipients',
        assignmentRecipients(religionAssignments),
        roles
          .risolvi('DOCENTI_IRC_ALT', cdu, {
            regolaSupplente: GestioneSupplenti.ENTRAMBI
          })
          .map((email) => email.value),
        religionAssignments
      );
    }
  );

  for (const classeId of [CLASSE_C, CLASSE_C_PARTNER]) {
    runner.add(
      `Effective assignment consumers: full CDU council ${classeId}`,
      sample.sampleSpreadsheetUrl,
      () => {
        const partner = classi.findById(classeId);
        if (partner === null) {
          throw new ValidationError(`class=${classeId}, expectedActor=partner, actualActor=missing`);
        }
        const partnerAssignments = resolver.resolveConsiglio(partner, ASSIGNMENT_MATRIX_DATE_E2E, {
          includeReligioneAlt: true,
          routingPolicy: RoutingPolicy.BOTH_EQUAL
        });
        const ownAssignments = partnerAssignments.filter(
          (assignment) => assignment.classeId.value === classeId
        );
        if (ownAssignments.length === 0) {
          throw new ValidationError(
            `consumer=partner ownership, class=${classeId}, expectedActor=partner-assignment, actualActor=missing`
          );
        }
        const partnerCdu = contextBuilder.build(
          { target: classeId, tipoTarget: 'classe', now: ASSIGNMENT_MATRIX_DATE_E2E },
          recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
        );
        const materieComuni = new Set(
          (partnerCdu.focus.classe?.articolazione?.materieCondivise ?? []).map(
            (materia) => materia.sigla
          )
        );
        const cduScopedAssignments = partnerAssignments.filter((assignment) => {
          const catalogId =
            assignment.slot.specifica === null
              ? assignment.slot.materia.value
              : `${assignment.slot.materia.value}.${assignment.slot.specifica}`;
          return assignment.classeId.value === classeId || materieComuni.has(catalogId);
        });
        assertCouncilTuples(`full CDU council ${classeId}`, cduScopedAssignments, partnerCdu);
        assertSameRecipients(
          `role recipients ${classeId}`,
          assignmentRecipients(partnerAssignments),
          roles
            .risolvi('CDC', partnerCdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
            .map((email) => email.value),
          partnerAssignments
        );

        const expectedRecipients = assignmentRecipients(partnerAssignments);
        const emailRecipients: string[] = [];
        const principals = unique(
          partnerAssignments.flatMap((assignment) =>
            assignment.titolare.id === null ? [] : [assignment.titolare.id]
          )
        );
        // Titolare/supplente content-mismatch fix: see the sibling "email
        // recipients" check above — `resolveEffectiveDocenti` is the shared
        // resolution both EmailNotificationService.expandDocenteActors and
        // ResolveRecipientsStep now delegate to.
        for (const principal of principals) {
          emailRecipients.push(
            ...resolveEffectiveDocenti(
              resolver,
              [partner],
              principal,
              ASSIGNMENT_MATRIX_DATE_E2E,
              GestioneSupplenti.ENTRAMBI
            )
          );
        }
        assertSameRecipients(`email recipients ${classeId}`, expectedRecipients, emailRecipients, partnerAssignments);

        const permissions: string[] = [];
        const drive = {
          setPermission: (_fileId: string, email: string): void => {
            permissions.push(email);
          },
          setPermissions: (grants: Array<{ email: string }>): void => {
            permissions.push(...grants.map((g) => g.email));
          }
        } as unknown as IDriveFacade;
        const row = {
          ID: 'MATRIX_PARTNER_DOCUMENT', TIPO: 'MATRIX', GENERATORE: 'DOCUMENTO_GENERICO',
          CONDIZIONE: null, MODELLI: '{"templateId":"matrix"}', FILE_NAME: 'matrix', PATH_OUT: 'matrix',
          DUPLICAZIONE: 'NEGATA',
          PERMESSI: JSON.stringify({ file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }], folder: [], regolaSupplente: { file: 'ENTRAMBI' } }),
          POST_PROCESSO: null, PARAMETRI: null, GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GDOC',
          REGISTRA_DOC: '{}', REGISTRA_FOLD: '{}'
        };
        const documentCtx = new PipelineContext();
        documentCtx.set('config', row);
        documentCtx.set('confDoc', ConfigurazioneDocumento.fromData(row));
        documentCtx.set('cdu', partnerCdu);
        documentCtx.set('shouldGenerate', true);
        documentCtx.set('newFileId', `matrix-document-${classeId}`);
        new ApplyPermissionsStep(new LoggerService(), drive, roles).execute(documentCtx);
        assertSameRecipients(`document ACL recipients ${classeId}`, expectedRecipients, permissions, partnerAssignments);

        const requests: SpreadsheetProtectRequest[] = [];
        const columnItems: Array<Record<string, unknown>> = [];
        const sheets = {
          getSheetInfo: (): SpreadsheetSheetInfo[] => [{ name: 'Sheet1', sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount: 20, columnCount: 20 } }],
          protectRanges: (_spreadsheetId: string, input: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]): SpreadsheetProtectResult => {
            requests.push(...(Array.isArray(input) ? input : [input]));
            return { spreadsheetId: 'matrix-sheet', protectedCount: requests.length, protectedRangeIds: requests.map((_, index) => index), replies: [] };
          }
        } as unknown as SpreadsheetService;
        const templates = {
          processSheet: (_spreadsheetId: string, context: Record<string, unknown>): SheetColumnLayout[] => {
            const groups = materieColonneOf(context);
            const items = [...groups.group1, ...(groups.group2 ?? []), ...(groups.group3 ?? [])];
            columnItems.push(...items);
            return items.map((item, index) => ({
              sheetName: 'Sheet1', column: index + 1,
              header: typeof item['header'] === 'string' ? item['header'] : typeof item['sigla'] === 'string' ? item['sigla'] : '',
              isLabel: false, item
            }));
          }
        } as unknown as ITemplateEngine;
        const sheetConfig = ConfigurazioneDocumento.fromData({
          ID: 'MATRIX_PARTNER_SHEET', TIPO: 'MATRIX', GENERATORE: 'SHEET_CON_MATERIE_E_PERMESSI',
          CONDIZIONE: null, MODELLI: '{"templateId":"matrix"}', FILE_NAME: 'matrix', PATH_OUT: 'matrix',
          DUPLICAZIONE: 'NEGATA', PERMESSI: null, POST_PROCESSO: null, PARAMETRI: null,
          GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GSHEET'
        });
        new SheetMaterieConPermessiGeneratorStrategy(sheets, new MateriaRepository(db), templates, roles).render(
          `matrix-sheet-${classeId}`, partnerCdu, sheetConfig
        );
        const coordinators = classi.getCoordinatori(partner).flatMap((docente) => docente.id === null ? [] : [docente.id]);
        if (requests.length !== columnItems.length) {
          throw new ValidationError(`consumer=spreadsheet column ACL ${classeId}, expectedColumns=${columnItems.length}, actualColumns=${requests.length}`);
        }
        if (columnItems.length !== EXPECTED_ARTICULATED_COLUMNS.length) {
          throw new ValidationError(
            `consumer=spreadsheet column ACL ${classeId}, expectedFixtureColumns=${JSON.stringify(EXPECTED_ARTICULATED_COLUMNS)}, actualColumns=${JSON.stringify(columnItems)}`
          );
        }
        for (const [index, item] of columnItems.entries()) {
          const expectedColumn = EXPECTED_ARTICULATED_COLUMNS[index]!;
          const actualHeader =
            typeof item['header'] === 'string'
              ? item['header']
              : typeof item['sigla'] === 'string'
                ? item['sigla']
                : '';
          const actualOwner = typeof item['classeId'] === 'string' ? item['classeId'] : null;
          if (actualHeader !== expectedColumn.header || actualOwner !== expectedColumn.classeId) {
            throw new ValidationError(
              `consumer=spreadsheet column ACL ${classeId}, column=${index + 1}, expectedHeader=${expectedColumn.header}, actualHeader=${actualHeader}, expectedOwner=${expectedColumn.classeId ?? 'shared'}, actualOwner=${actualOwner ?? 'shared'}, actualColumns=${JSON.stringify(columnItems)}`
            );
          }
          const expectedSubjects: readonly string[] = expectedColumn.subjects;
          const expectedEditors = emails(unique([
            ...coordinators,
            ...assignmentTuples(partnerAssignments)
              .filter(
                (tuple) =>
                  expectedSubjects.includes(tuple.materia) &&
                  (expectedColumn.classeId === null || tuple.classeId === expectedColumn.classeId)
              )
              .map((tuple) => tuple.actor)
          ]));
          const actualEditors = emails(requests[index]?.editors?.users ?? []);
          if (JSON.stringify(expectedEditors) !== JSON.stringify(actualEditors)) {
            throw new ValidationError(
              `consumer=spreadsheet column ACL ${classeId}, column=${index + 1}, owner=${expectedColumn.classeId ?? 'shared'}, subjects=${expectedColumn.subjects.join('|')}, expected=${expectedEditors.join('|')}, actual=${actualEditors.join('|')}`
            );
          }
        }
      }
    );
  }

  for (const { student: studentEmail, actors } of EXPECTED_STUDENT_COUNCILS) {
    runner.add(
      `Effective assignment consumers: student-filtered CDU council ${studentEmail}`,
      sample.sampleSpreadsheetUrl,
      () => {
        const studentCdu = contextBuilder.build(
          { target: studentEmail, tipoTarget: 'alunno', now: ASSIGNMENT_MATRIX_DATE_E2E },
          recipe('ALUNNO_COMPLETO', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
        );
        const projected =
          studentCdu.focus.alunno?.consiglioDiClasseFiltrato
            ?.map((docente) => docente.anagrafica.email)
            .filter((email): email is string => email !== null) ?? [];
        const roleProjected = roles
          .risolvi('CDC_FILTER_ALUNNO', studentCdu, {
            regolaSupplente: GestioneSupplenti.ENTRAMBI
          })
          .map((email) => email.value);
        assertSameRecipients(
          `student-filtered CDU council ${studentEmail}`,
          emails(actors),
          projected,
          assignments
        );
        assertSameRecipients(
          `student-filtered role recipients ${studentEmail}`,
          emails(actors),
          roleProjected,
          assignments
        );
      }
    );
  }

  // Genuinely-new §9.2 CDU sections (PROMPT_MODIFY_CDU.md action item 5) exercised against this
  // function's real E2E database/container (unlike `registerContextEngineChecks` below, which
  // runs against the SMALL `SampleDatabaseBuilder` fixture that has neither CLASSE_A nor
  // e2eAlunnoEmail rows).

  runner.add(
    'ContextEngine CDU: focus.alunno.curriculum is an array, not a "[MateriaId]" map (02 §2.13/§8.8)',
    sample.sampleSpreadsheetUrl,
    () => {
      const studentCdu = contextBuilder.build(
        { target: e2eAlunnoEmail(1), tipoTarget: 'alunno', now: new Date() },
        recipe('ALUNNO_COMPLETO')
      );
      const curriculum = studentCdu.focus.alunno?.curriculum ?? [];
      const lab = curriculum.find((entry) => entry.materiaId === 'LAB');
      if (
        !Array.isArray(curriculum) ||
        lab === undefined ||
        !lab.specifiche.some((specifica) => specifica.nome === 'GRUPPO_A')
      ) {
        throw new ValidationError(
          `Atteso focus.alunno.curriculum array con voce LAB.GRUPPO_A per ${e2eAlunnoEmail(1)}, ricevuto ${JSON.stringify(curriculum)}`
        );
      }
    }
  );

  runner.add(
    'ContextEngine CDU: focus.classe.studenti.perSpecificita is a 3-level array (02 §2.14/§8.9)',
    sample.sampleSpreadsheetUrl,
    () => {
      const specificitaCdu = contextBuilder.build(
        { target: CLASSE_A, tipoTarget: 'classe', now: new Date() },
        recipe('CLASSE_COMPLETA')
      );
      const perSpecificita = specificitaCdu.focus.classe?.studenti?.perSpecificita ?? [];
      const lab = perSpecificita.find((entry) => entry.materiaId === 'LAB');
      const gruppoA = lab?.specifiche.find((specifica) => specifica.nome === 'GRUPPO_A');
      const seminario = lab?.specifiche.find(
        (specifica) => specifica.nome === 'SEMINARIO_POMERIDIANO'
      );
      if (
        lab === undefined ||
        gruppoA === undefined ||
        seminario === undefined ||
        !gruppoA.alunni.some((alunno) => alunno.email === e2eAlunnoEmail(1)) ||
        !seminario.alunni.some((alunno) => alunno.email === e2eAlunnoEmail(2))
      ) {
        throw new ValidationError(
          `Atteso focus.classe.studenti.perSpecificita con LAB -> GRUPPO_A/${e2eAlunnoEmail(1)} e SEMINARIO_POMERIDIANO/${e2eAlunnoEmail(2)}, ricevuto ${JSON.stringify(perSpecificita)}`
        );
      }
    }
  );

  runner.add(
    'ContextEngine CDU: focus.classe.esame prima/seconda prova partitions (02 §2.9/§4.1)',
    sample.sampleSpreadsheetUrl,
    () => {
      const esameCdu = contextBuilder.build(
        { target: CLASSE_A, tipoTarget: 'classe', now: new Date() },
        recipe('CLASSE_COMPLETA')
      );
      const esame = esameCdu.focus.classe?.esame;
      const prima = esame?.materiePrimaProva.find((materia) => materia.sigla === 'ITA');
      const seconda = esame?.materieSecondaProva.find((materia) => materia.sigla === 'MAT');
      if (
        esame?.hasEsame !== true ||
        prima === undefined ||
        (prima.docentiDescrizione ?? '').trim() === '' ||
        seconda === undefined ||
        (seconda.docentiDescrizione ?? '').trim() === ''
      ) {
        throw new ValidationError(
          `Atteso focus.classe.esame.hasEsame=true con ITA in materiePrimaProva e MAT in materieSecondaProva, docentiDescrizione valorizzata, ricevuto ${JSON.stringify(esame)}`
        );
      }
    }
  );

  runner.add(
    'ContextEngine CDU: focus.classe.coordinatori.elenco/progetti/religioneLabel/tipoLabel precomposed strings (02 §2.6/§2.10/§2.12/§8.1)',
    sample.sampleSpreadsheetUrl,
    () => {
      const classeCdu = contextBuilder.build(
        { target: CLASSE_A, tipoTarget: 'classe', now: new Date() },
        recipe('CLASSE_COMPLETA')
      );
      const focusClasse = classeCdu.focus.classe;
      const primoCoordinatore = focusClasse?.coordinatori?.elenco[0];
      const primoProgetto = focusClasse?.progetti?.find(
        (progetto) => progetto.tipo === TipoProgetto.ASL
      );
      const nonAvvale = focusClasse?.studenti?.listaCompleta.find(
        (studente) => studente.anagrafica.email === e2eAlunnoEmail(1)
      );
      const conPiano = focusClasse?.studenti?.listaCompleta.find(
        (studente) => studente.anagrafica.email === e2eAlunnoEmail(5)
      );
      // Cdu.ts's `StudentVM.didattica.piani.items[].tipo` is declared as a loose `string` (not
      // `TipoPiano`), unlike `ProgettoVM.tipo`'s strongly-typed `TipoProgetto` above — compare
      // against the enum's string value, not the enum member, to match.
      const pianoTipoLabel = conPiano?.didattica.piani.items.find(
        (item) => item.tipo === (TipoPiano.PDP_BES as string)
      )?.tipoLabel;
      if (
        primoCoordinatore === undefined ||
        primoCoordinatore.appellativoCompleto.trim() === '' ||
        focusClasse?.hasProgetti !== true ||
        primoProgetto === undefined ||
        primoProgetto.tipoLabel !== 'PCTO/ASL' ||
        primoProgetto.referente.appellativoCompleto.trim() === '' ||
        nonAvvale?.status.religioneLabel !== 'Non si avvale' ||
        pianoTipoLabel !== 'PDP (BES)'
      ) {
        throw new ValidationError(
          `Atteso coordinatori.elenco[0].appellativoCompleto, progetti[ASL].tipoLabel="PCTO/ASL", religioneLabel="Non si avvale" per ${e2eAlunnoEmail(1)} e piani tipoLabel="PDP (BES)" per ${e2eAlunnoEmail(5)}; ricevuto coordinatore=${JSON.stringify(primoCoordinatore)}, progetto=${JSON.stringify(primoProgetto)}, religioneLabel=${String(nonAvvale?.status.religioneLabel)}, pianoTipoLabel=${String(pianoTipoLabel)}`
        );
      }
    }
  );
}

/**
 * Registers context-engine CDU-assembly checks (design spec §2 step 2.3):
 * builds a real CDU via the `ContextBuilder` `buildAldoContainer` already
 * wired under `'contextBuilder'` (same instance `DocumentGenerationService`/
 * `EmailNotificationService` use — see `Bootstrap.ts`), for both a `classe`
 * focus and an `alunno` focus, and asserts a couple of `02_CDU_STRUTTURA.md`
 * access paths (§4.1/§4.2) resolve to the seeded values:
 * `focus.classe.anagrafica.nome` and `focus.alunno.anagrafica.email`.
 */
export function registerContextEngineChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: Pick<SharedTestDatabase, 'sampleSpreadsheetUrl'>
): void {
  const contextBuilder = container.get<ContextBuilder>('contextBuilder');

  runner.add(
    'ContextEngine CDU: focus.classe.anagrafica.nome resolves to the seeded classe',
    sample.sampleSpreadsheetUrl,
    () => {
      const cdu = contextBuilder.build(
        { target: CDU_FOCUS_CLASSE, tipoTarget: 'classe', now: new Date() },
        recipe('CLASSE_COMPLETA')
      );
      const nome = cdu.focus.classe?.anagrafica.nome;
      if (nome !== CDU_FOCUS_CLASSE) {
        throw new ValidationError(
          `Atteso focus.classe.anagrafica.nome === ${CDU_FOCUS_CLASSE}, ricevuto ${String(nome)}`
        );
      }
    }
  );

  runner.add(
    'ContextEngine CDU: focus.alunno.anagrafica.email resolves to the seeded alunno',
    sample.sampleSpreadsheetUrl,
    () => {
      const cdu = contextBuilder.build(
        { target: CDU_FOCUS_ALUNNO, tipoTarget: 'alunno', now: new Date() },
        recipe('ALUNNO_COMPLETO')
      );
      const email = cdu.focus.alunno?.anagrafica.email;
      if (email !== CDU_FOCUS_ALUNNO) {
        throw new ValidationError(
          `Atteso focus.alunno.anagrafica.email === ${CDU_FOCUS_ALUNNO}, ricevuto ${String(email)}`
        );
      }
    }
  );
}
