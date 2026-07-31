import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
import type { SampleDatabase } from '../SampleDatabaseBuilder';
import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { recipe } from '../../application/context-engine/Recipe';
import { ValidationError } from '../../domain/errors/DomainError';
import { CLASSE_BASE, ALUNNO_PARTNER_EMAIL } from '../SampleDatabaseBuilder';
import {
  ASSIGNMENT_MATRIX_DATE_E2E,
  CLASSE_A,
  CLASSE_C,
  CLASSE_C_PARTNER,
  e2eAlunnoEmail,
  e2eDocenteEmail
} from '../E2eSampleDatabaseBuilder';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../application/ports/ITeachingAssignmentResolver';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { composeRisolutoreRuoli } from '../../config/ApplicationComposition';
import { ResolveRecipientsStep } from '../../application/pipelines/emailSteps';
import { ApplyPermissionsStep } from '../../application/pipelines/documentSteps';
import { ConfigurazioneEmail } from '../../domain/entities/ConfigurazioneEmail';
import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import { getCduMateriaAssignmentIdentity } from '../../application/context-engine/CduInternalMetadata';

interface AssignmentMatrixSample {
  sampleSpreadsheetUrl: string;
}

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
 * `E2eSampleDatabaseBuilder.seedClassi` pins 3C-C's MAT to 3C-S's own MAT holder
 * (e2edocente1), so `ClasseRepository.getMaterieArticolazione` classifies it as shared
 * and the generator emits a single ungrouped column for it — unlike ITA/ING/STO, which
 * have disjoint holders per partner and therefore get one column each per classe.
 */
const EXPECTED_ARTICULATED_COLUMNS = [
  { header: 'REL', classeId: null, subjects: ['IRC'] },
  { header: 'MAT', classeId: null, subjects: ['MAT'] },
  { header: 'ITA', classeId: CLASSE_C, subjects: ['ITA'] },
  { header: 'ING', classeId: CLASSE_C, subjects: ['ING'] },
  { header: 'STO', classeId: CLASSE_C, subjects: ['STO'] },
  { header: 'ITA', classeId: CLASSE_C_PARTNER, subjects: ['ITA'] },
  { header: 'ING', classeId: CLASSE_C_PARTNER, subjects: ['ING'] },
  { header: 'STO', classeId: CLASSE_C_PARTNER, subjects: ['STO'] }
] as const;

function emails(values: Iterable<string>): string[] {
  return [...values].sort();
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
  return [tuple.classeId, tuple.materia, tuple.kind, tuple.specifica ?? 'null', tuple.actor].join('|');
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
  docente: { anagrafica: { email: string } },
  materia: { sigla: string; specificita: string | null }
): string {
  const identity = getCduMateriaAssignmentIdentity(materia);
  return [
    identity?.classeId ?? 'missing',
    materia.sigla,
    identity?.kind ?? 'missing',
    materia.specificita ?? 'null',
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

function expectedCouncilRows(assignments: TeachingAssignment[]): string[] {
  const rows = new Map<string, string[]>();
  for (const tuple of assignmentTuples(assignments)) {
    const row = rows.get(tuple.actor) ?? [];
    row.push(tupleKey(tuple));
    rows.set(tuple.actor, row);
  }
  return [...rows.entries()].map(([actor, tuples]) => `${actor}:${tuples.sort().join(',')}`);
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
    if (parts.length < 5) {
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
  const normalized = emails(actual);
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
        spreadsheetId: 'header-sheet', protectedCount: 0, protectedRangeIds: []
      })
    } as unknown as SpreadsheetService;
    const rendered: SheetColumnLayout[] = [];
    const templates = {
      processSheet: (_spreadsheetId: string, context: Record<string, unknown>): SheetColumnLayout[] => {
        const groups = context['materieColonne'] as {
          group1: Array<Record<string, unknown>>;
          group2?: Array<Record<string, unknown>>;
          group3?: Array<Record<string, unknown>>;
        };
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

  runner.add('Effective assignment consumers: rendered sheet header REL without ALT', sample.sampleSpreadsheetUrl, () => {
    const noAltCdu = contextBuilder.build(
      { target: CLASSE_C, tipoTarget: 'classe', now: ASSIGNMENT_MATRIX_DATE_E2E },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    const headers = renderedSheetHeaders(noAltCdu);
    if (headers[0] !== 'REL') {
      throw new ValidationError(`expected rendered REL header, actual=${JSON.stringify(headers)}`);
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
      const confMail = ConfigurazioneEmail.fromData({
        ID: 'MATRIX_EMAIL',
        OGGETTO: 'Matrix',
        PROCESSO: 'PER_DOCENTE',
        BOX_CFG: null,
        TESTO: '',
        SUPPLENTI: 'ENTRAMBI',
        NOREPLY: false,
        COLORE_HEADER: '',
        CONDIZIONE: null,
        POST_PROCESSO: null,
        ALLEGATI: '[]'
      });
      const actual = new Set<string>();
      const principals = new Set(
        assignments.flatMap((assignment) =>
          assignment.titolare.id === null ? [] : [assignment.titolare.id]
        )
      );
      for (const principal of principals) {
        const ctx = new PipelineContext();
        ctx.set('shouldSend', true);
        ctx.set('now', ASSIGNMENT_MATRIX_DATE_E2E);
        ctx.set('confMail', confMail);
        ctx.set('emailTarget', {
          tipo: 'docente',
          tipoTarget: 'classe',
          target: CLASSE_A,
          docenteEmail: principal,
          emails: [principal],
          classiCompetenza: [CLASSE_A],
          teachingAssignmentTarget: true
        });
        new ResolveRecipientsStep(
          new LoggerService(),
          new DocenteRepository(db),
          classi,
          resolver
        ).execute(ctx);
        for (const destination of ctx.get<Array<{ emails: string[] }>>('destinatariFinali') ?? []) {
          for (const email of destination.emails) actual.add(email);
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
            protectedRangeIds: requests.map((_, index) => index)
          };
        }
      } as unknown as SpreadsheetService;
      const templates = {
        processSheet: (
          _spreadsheetId: string,
          context: Record<string, unknown>
        ): SheetColumnLayout[] => {
          const groups = context['materieColonne'] as {
            group1: Array<Record<string, unknown>>;
            group2?: Array<Record<string, unknown>>;
            group3?: Array<Record<string, unknown>>;
          };
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
        assertCouncilTuples(`full CDU council ${classeId}`, partnerAssignments, partnerCdu);
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
        const confMail = ConfigurazioneEmail.fromData({
          ID: 'MATRIX_PARTNER_EMAIL', OGGETTO: 'Matrix', PROCESSO: 'PER_DOCENTE', BOX_CFG: null,
          TESTO: '', SUPPLENTI: 'ENTRAMBI', NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: null,
          POST_PROCESSO: null, ALLEGATI: '[]'
        });
        for (const principal of principals) {
          const ctx = new PipelineContext();
          ctx.set('shouldSend', true);
          ctx.set('now', ASSIGNMENT_MATRIX_DATE_E2E);
          ctx.set('confMail', confMail);
          ctx.set('emailTarget', {
            tipo: 'docente', tipoTarget: 'classe', target: classeId, docenteEmail: principal,
            emails: [principal], classiCompetenza: [classeId], teachingAssignmentTarget: true
          });
          new ResolveRecipientsStep(new LoggerService(), new DocenteRepository(db), classi, resolver).execute(ctx);
          for (const destination of ctx.get<Array<{ emails: string[] }>>('destinatariFinali') ?? []) {
            emailRecipients.push(...destination.emails);
          }
        }
        assertSameRecipients(`email recipients ${classeId}`, expectedRecipients, emailRecipients, partnerAssignments);

        const permissions: string[] = [];
        const drive = {
          setPermission: (_fileId: string, email: string): void => {
            permissions.push(email);
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
            return { spreadsheetId: 'matrix-sheet', protectedCount: requests.length, protectedRangeIds: requests.map((_, index) => index) };
          }
        } as unknown as SpreadsheetService;
        const templates = {
          processSheet: (_spreadsheetId: string, context: Record<string, unknown>): SheetColumnLayout[] => {
            const groups = context['materieColonne'] as { group1: Array<Record<string, unknown>>; group2?: Array<Record<string, unknown>>; group3?: Array<Record<string, unknown>> };
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
          studentCdu.focus.alunno?.consiglioDiClasseFiltrato?.map(
            (docente) => docente.anagrafica.email
          ) ?? [];
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
  sample: SampleDatabase
): void {
  const contextBuilder = container.get<ContextBuilder>('contextBuilder');

  runner.add(
    'ContextEngine CDU: focus.classe.anagrafica.nome resolves to the seeded classe',
    sample.sampleSpreadsheetUrl,
    () => {
      const cdu = contextBuilder.build(
        { target: CLASSE_BASE, tipoTarget: 'classe', now: new Date() },
        recipe('CLASSE_COMPLETA')
      );
      const nome = cdu.focus.classe?.anagrafica.nome;
      if (nome !== CLASSE_BASE) {
        throw new ValidationError(
          `Atteso focus.classe.anagrafica.nome === ${CLASSE_BASE}, ricevuto ${String(nome)}`
        );
      }
    }
  );

  runner.add(
    'ContextEngine CDU: focus.alunno.anagrafica.email resolves to the seeded alunno',
    sample.sampleSpreadsheetUrl,
    () => {
      const cdu = contextBuilder.build(
        { target: ALUNNO_PARTNER_EMAIL, tipoTarget: 'alunno', now: new Date() },
        recipe('ALUNNO_COMPLETO')
      );
      const email = cdu.focus.alunno?.anagrafica.email;
      if (email !== ALUNNO_PARTNER_EMAIL) {
        throw new ValidationError(
          `Atteso focus.alunno.anagrafica.email === ${ALUNNO_PARTNER_EMAIL}, ricevuto ${String(email)}`
        );
      }
    }
  );
}
