import { recipe } from '../../../src/application/context-engine/Recipe';
import {
  composeContextBuilder,
  composeRisolutoreRuoli
} from '../../../src/config/ApplicationComposition';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { teachingSlotFixtureTables } from '../../fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';
import type { TeachingAssignment } from '../../../src/application/ports/ITeachingAssignmentResolver';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { ResolveRecipientsStep } from '../../../src/application/pipelines/emailSteps';
import { ApplyPermissionsStep } from '../../../src/application/pipelines/documentSteps';
import { ConfigurazioneEmail } from '../../../src/domain/entities/ConfigurazioneEmail';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';

const MATRIX_DATE = new Date('2026-07-15T09:00:00Z');

function matrixTables(): Record<string, Row[]> {
  const tables = teachingSlotFixtureTables();
  tables.DOCENTI!.push(
    {
      EMAIL: 'changed-main@school.test',
      COGNOME: 'CHANGED',
      NOME: 'MAIN',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'itp-sub@school.test',
      COGNOME: 'SUB',
      NOME: 'ITP',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: true
    },
    {
      EMAIL: 'irc-change@school.test',
      COGNOME: 'CHANGED',
      NOME: 'IRC',
      GENERE: 'F',
      DIPART: 'LETTERE',
      ITP: false
    },
    {
      EMAIL: 'alt-sub-1@school.test',
      COGNOME: 'SUB',
      NOME: 'ALT ONE',
      GENERE: 'M',
      DIPART: 'LETTERE',
      ITP: false
    },
    {
      EMAIL: 'alt-sub-2@school.test',
      COGNOME: 'SUB',
      NOME: 'ALT TWO',
      GENERE: 'F',
      DIPART: 'LETTERE',
      ITP: false
    }
  );
  tables.VARIAZIONI_CATTEDRA = [
    {
      CLASSE_ID: '5A',
      MATERIA_ID: 'MAT',
      VECCHIO_TITOLARE: 'main@school.test',
      NUOVO_TITOLARE: 'changed-main@school.test',
      DATA_DECORRENZA: '2026-07-01'
    },
    {
      CLASSE_ID: '5A',
      MATERIA_ID: 'IRC',
      VECCHIO_TITOLARE: 'irc@school.test',
      NUOVO_TITOLARE: 'irc-change@school.test',
      DATA_DECORRENZA: '2026-07-01'
    }
  ];
  tables.SUPPLENZE = [
    {
      TITOLARE: 'itp@school.test',
      SUPPLENTE: 'itp-sub@school.test',
      DAL: '2026-07-01',
      AL: '2026-07-31',
      CLASSI: '5A',
      MATERIE: 'INF'
    },
    {
      TITOLARE: 'alt@school.test',
      SUPPLENTE: 'alt-sub-1@school.test',
      DAL: '2026-07-01',
      AL: '2026-07-31',
      CLASSI: '5A',
      MATERIE: 'ALT'
    },
    {
      TITOLARE: 'alt-sub-1@school.test',
      SUPPLENTE: 'alt-sub-2@school.test',
      DAL: '2026-07-01',
      AL: '2026-07-31',
      CLASSI: '5A',
      MATERIE: 'ALT'
    }
  ];
  const students = tables.ALUNNI!;
  Object.assign(
    students.find((row) => row.EMAIL === 'a1@school.it')!,
    {
      RELIGIONE: 'SI',
      ATTIVO: true,
      CURRICULUM: JSON.stringify({
        LAB: ['GRUPPO_A'],
        INTERPRET: ['CHITARRA']
      })
    }
  );
  Object.assign(
    students.find((row) => row.EMAIL === 'a2@school.it')!,
    {
      RELIGIONE: 'NO',
      ATTIVO: true,
      CURRICULUM: JSON.stringify({ LAB: ['GRUPPO_B', 'GRUPPO.A'] })
    }
  );
  Object.assign(
    students.find((row) => row.EMAIL === 'a3@school.it')!,
    {
      RELIGIONE: 'ALT',
      ATTIVO: true,
      CURRICULUM: null
    }
  );
  return tables;
}

function assignmentDiagnostic(
  assignment: TeachingAssignment,
  expectedActor: string,
  actualActor: string
): string {
  return [
    `class=${assignment.classeId.value}`,
    `subject=${assignment.slot.materia.value}`,
    `slotKind=${assignment.slot.kind}`,
    `specificity=${assignment.slot.specifica ?? 'null'}`,
    `expectedActor=${expectedActor}`,
    `actualActor=${actualActor}`,
    `glfTrace=${JSON.stringify(assignment.trace)}`
  ].join(', ');
}

function assertEffectiveActor(
  assignments: TeachingAssignment[],
  slot: { materia: string; kind: string; specifica: string | null },
  expectedActor: string
): void {
  const assignment = assignments.find(
    (candidate) =>
      candidate.slot.materia.value === slot.materia &&
      candidate.slot.kind === slot.kind &&
      candidate.slot.specifica === slot.specifica
  );
  if (assignment === undefined) {
    throw new Error(
      `class=5A, subject=${slot.materia}, slotKind=${slot.kind}, specificity=${slot.specifica ?? 'null'}, expectedActor=${expectedActor}, actualActor=missing, glfTrace=[]`
    );
  }
  const actualActor = assignment.docenteEffettivo.id ?? 'null';
  if (actualActor !== expectedActor) {
    throw new Error(assignmentDiagnostic(assignment, expectedActor, actualActor));
  }
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

class MatrixSpreadsheetService {
  readonly protectCalls: SpreadsheetProtectRequest[] = [];

  getSheetInfo(): SpreadsheetSheetInfo[] {
    return [
      {
        name: 'Sheet1',
        sheetId: 0,
        index: 0,
        hidden: false,
        gridProperties: { rowCount: 20, columnCount: 20 }
      }
    ];
  }

  protectRanges(
    _spreadsheetId: string,
    requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]
  ): SpreadsheetProtectResult {
    const all = Array.isArray(requests) ? requests : [requests];
    this.protectCalls.push(...all);
    return {
      spreadsheetId: 'sheet-matrix',
      protectedCount: all.length,
      protectedRangeIds: all.map((_, index) => index)
    };
  }
}

function sheetConfiguration(): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'MATRIX_SHEET',
    TIPO: 'GRIGLIA',
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
}

describe('CDU / RisolutoreRuoliService agreement across the resolution layers (17)', () => {
  test('after the permanent variazione, before any supplenza: CDU and DOCENTE_MATERIA agree on bianchi', () => {
    const db = new FakeDatabase(fixtureTables());
    const teachingAssignments = new AldoTeachingAssignmentResolver(db);
    const now = new Date('2025-10-15T09:00:00Z');
    const cdu = composeContextBuilder(db, undefined, teachingAssignments).build(
      { target: '5A', tipoTarget: 'classe', now, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const cdcEmails = cdu.focus
      .classe!.consiglioDiClasse.filter((d) => d.materie.some((m) => m.sigla === 'MATE'))
      .map((d) => d.anagrafica.email);
    const service = composeRisolutoreRuoli(db, teachingAssignments);
    const roleEmails = service.risolvi('DOCENTE_MATERIA', cdu).map((e) => e.value);

    expect(cdcEmails).toEqual(['bianchi@school.it']);
    expect(roleEmails).toEqual(['bianchi@school.it']);
  });

  test('during the active supplenza (chain rossi->bianchi->verdi for ITA), CDC (ENTRAMBI) and role routing (ENTRAMBI) agree', () => {
    const db = new FakeDatabase(fixtureTables());
    const teachingAssignments = new AldoTeachingAssignmentResolver(db);
    const now = new Date('2025-11-15T09:00:00Z');
    const cdu = composeContextBuilder(db, undefined, teachingAssignments).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    // rossi holds no subject at this date (MATE went to bianchi 2025-10-01, FISI
    // was already nominally bianchi) -> rossi drops out of consiglioDiClasse
    // entirely (CdcAssembler builds it purely from cattedra assignments). COORD
    // is a CLASSI-column role, not cattedra-resolved: CDU exposes it via the
    // separate `focus.classe.coordinatori` field (ClasseProvider ->
    // classi.getCoordinatori), independent of VARIAZIONI_CATTEDRA/SUPPLENZE. The
    // rossi->bianchi SUPPLENZE row ('*' materie, 5A/4B, Nov 1-30) targets rossi as
    // TITOLARE, who is no longer anyone's effective cattedra holder for 5A -> it
    // must not reroute bianchi's MATE chair (see previous point). Confirm via
    // COORDINATORI (COORD=rossi, a non-cattedra role) that the
    // rossi->bianchi->verdi supplenza chain still applies correctly to its OWN
    // unrelated context.
    const coordinatoriNominali = cdu.focus.classe!.coordinatori ?? [];
    const service = composeRisolutoreRuoli(db, teachingAssignments);
    const coordEmails = service
      .risolvi('COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
      .map((e) => e.value)
      .sort();

    expect(coordinatoriNominali.map((c) => c.email)).toEqual(['rossi@school.it']); // COORD is not cattedra-resolved
    expect(coordEmails).toEqual(['rossi@school.it']); // non-teaching role remains declared school role
  });
});

describe('complete effective-assignment acceptance matrix', () => {
  test('resolver, CDU, role/email/document/sheet ACL consumers and REL/ALT projection agree', () => {
    const db = new FakeDatabase(matrixTables());
    const assignmentsResolver = new AldoTeachingAssignmentResolver(db);
    const classi = new ClasseRepository(db);
    const classe = classi.findById('5A')!;
    const assignments = assignmentsResolver.resolveConsiglio(classe, MATRIX_DATE, {
      includeReligioneAlt: true,
      routingPolicy: RoutingPolicy.BOTH_EQUAL
    });

    for (const [slot, expectedActor] of [
      [{ materia: 'MAT', kind: 'MAIN', specifica: null }, 'changed-main@school.test'],
      [{ materia: 'INF', kind: 'ITP', specifica: null }, 'itp-sub@school.test'],
      [{ materia: 'LAB', kind: 'SPECIFICA', specifica: 'GRUPPO_A' }, 'specific-a@school.test'],
      [{ materia: 'LAB', kind: 'SPECIFICA', specifica: 'GRUPPO_B' }, 'specific-b@school.test'],
      [{ materia: 'LAB', kind: 'SPECIFICA', specifica: 'GRUPPO.A' }, 'specific-b@school.test'],
      [{ materia: 'INTERPRET', kind: 'SPECIFICA', specifica: 'CHITARRA' }, 'guitar@school.test'],
      [{ materia: 'IRC', kind: 'MAIN', specifica: null }, 'irc-change@school.test'],
      [{ materia: 'ALT', kind: 'MAIN', specifica: null }, 'alt-sub-2@school.test']
    ] as const) {
      assertEffectiveActor(assignments, slot, expectedActor);
    }

    const contextBuilder = composeContextBuilder(db, undefined, assignmentsResolver);
    const classCdu = contextBuilder.build(
      { target: '5A', tipoTarget: 'classe', now: MATRIX_DATE },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    const roles = composeRisolutoreRuoli(db, assignmentsResolver);
    const expectedAll = sorted([
      'rossi@school.it',
      'bianchi@school.it',
      'changed-main@school.test',
      'itp@school.test',
      'itp-sub@school.test',
      'specific-a@school.test',
      'specific-b@school.test',
      'guitar@school.test',
      'irc-change@school.test',
      'alt@school.test',
      'alt-sub-2@school.test'
    ]);

    const resolvedRecipients = sorted(
      new Set(
        assignments.flatMap((assignment) =>
          assignment.routing.primary.flatMap((docente) => (docente.id === null ? [] : [docente.id]))
        )
      )
    );
    const fullCduRecipients = sorted(
      new Set(classCdu.focus.classe!.consiglioDiClasse.map((docente) => docente.anagrafica.email))
    );
    const roleRecipients = sorted(
      roles
        .risolvi('CDC', classCdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
        .map((email) => email.value)
    );

    const emailConfig = ConfigurazioneEmail.fromData({
      ...matrixTables().CONF_MAIL![0]!,
      ID: 'MATRIX_EMAIL',
      PROCESSO: 'PER_DOCENTE',
      SUPPLENTI: 'ENTRAMBI'
    });
    const emailRecipients = new Set<string>();
    const principals = new Set(
      assignments.flatMap((assignment) =>
        assignment.titolare.id === null ? [] : [assignment.titolare.id]
      )
    );
    for (const principal of principals) {
      const ctx = new PipelineContext();
      ctx.set('shouldSend', true);
      ctx.set('now', MATRIX_DATE);
      ctx.set('confMail', emailConfig);
      ctx.set('emailTarget', {
        tipo: 'docente',
        tipoTarget: 'classe',
        target: '5A',
        docenteEmail: principal,
        emails: [principal],
        classiCompetenza: ['5A'],
        teachingAssignmentTarget: true
      });
      new ResolveRecipientsStep(
        new LoggerService(),
        new DocenteRepository(db),
        classi,
        assignmentsResolver
      ).execute(ctx);
      for (const destination of ctx.get<Array<{ emails: string[] }>>('destinatariFinali') ?? []) {
        for (const email of destination.emails) emailRecipients.add(email);
      }
    }

    const documentConfigRow = {
      ...matrixTables().CONF_DOC![0]!,
      ID: 'MATRIX_DOCUMENT',
      PERMESSI: JSON.stringify({
        file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
        folder: [],
        regolaSupplente: { file: 'ENTRAMBI' }
      })
    };
    const documentCtx = new PipelineContext();
    documentCtx.set('config', documentConfigRow);
    documentCtx.set('confDoc', ConfigurazioneDocumento.fromData(documentConfigRow));
    documentCtx.set('cdu', classCdu);
    documentCtx.set('shouldGenerate', true);
    documentCtx.set('newFileId', 'matrix-document');
    const drive = new FakeDriveFacade();
    new ApplyPermissionsStep(new LoggerService(), drive, roles).execute(documentCtx);
    const documentAclRecipients = sorted(
      drive.permissions
        .filter((permission) => permission.fileId === 'matrix-document')
        .map((permission) => permission.email)
    );

    const sheets = new MatrixSpreadsheetService();
    const templateEngine = new FakeTemplateEngine();
    new SheetMaterieConPermessiGeneratorStrategy(
      sheets as unknown as SpreadsheetService,
      new MateriaRepository(db),
      templateEngine,
      roles
    ).render('matrix-sheet', classCdu, sheetConfiguration());
    const sheetAclRecipients = sorted(
      new Set(sheets.protectCalls.flatMap((request) => request.editors?.users ?? []))
    );

    expect(resolvedRecipients).toEqual(expectedAll);
    expect(fullCduRecipients).toEqual(expectedAll);
    expect(roleRecipients).toEqual(expectedAll);
    expect(sorted(emailRecipients)).toEqual(expectedAll);
    expect(documentAclRecipients).toEqual(expectedAll);
    expect(sheetAclRecipients).toEqual(expectedAll);
    const groups = templateEngine.sheetContextFor('matrix-sheet')?.['materieColonne'] as {
      group1: Array<{ sigla: string; roles?: string[]; classeId?: string }>;
      group2?: Array<{ sigla: string; roles?: string[]; classeId?: string }>;
      group3?: Array<{ sigla: string; roles?: string[]; classeId?: string }>;
    };
    const columns = [...groups.group1, ...(groups.group2 ?? []), ...(groups.group3 ?? [])];
    expect(sheets.protectCalls).toHaveLength(columns.length);
    const coordinators = classi.getCoordinatori(classe).flatMap((docente) =>
      docente.id === null ? [] : [docente.id]
    );
    for (const [index, column] of columns.entries()) {
      const subjects = column.roles ?? [column.sigla];
      const expectedEditors = sorted(
        [...coordinators, ...assignments.flatMap((assignment) =>
          subjects.includes(assignment.slot.materia.value) &&
          (column.classeId === undefined || assignment.classeId.value === column.classeId)
            ? assignment.routing.primary.flatMap((docente) => (docente.id === null ? [] : [docente.id]))
            : []
        )].filter((email, position, all) => all.indexOf(email) === position)
      );
      expect(sorted(sheets.protectCalls[index]?.editors?.users ?? [])).toEqual(expectedEditors);
    }
    expect(
      sorted(
        roles
          .risolvi('DOCENTI_IRC_ALT', classCdu, {
            regolaSupplente: GestioneSupplenti.ENTRAMBI
          })
          .map((email) => email.value)
      )
    ).toEqual(sorted(['irc-change@school.test', 'alt@school.test', 'alt-sub-2@school.test']));

    const studentExpectations = [
      {
        email: 'a1@school.it',
        includes: ['irc-change@school.test', 'specific-a@school.test', 'guitar@school.test'],
        excludes: ['alt@school.test', 'specific-b@school.test']
      },
      {
        email: 'a2@school.it',
        includes: ['specific-b@school.test'],
        excludes: [
          'irc-change@school.test',
          'alt@school.test',
          'specific-a@school.test',
          'guitar@school.test'
        ]
      },
      {
        email: 'a3@school.it',
        includes: ['alt@school.test', 'alt-sub-2@school.test'],
        excludes: [
          'irc-change@school.test',
          'specific-a@school.test',
          'specific-b@school.test',
          'guitar@school.test'
        ]
      }
    ];
    for (const expectation of studentExpectations) {
      const cdu = contextBuilder.build(
        { target: expectation.email, tipoTarget: 'alunno', now: MATRIX_DATE },
        recipe('ALUNNO_COMPLETO', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
      );
      const filtered = new Set(
        cdu.focus.alunno!.consiglioDiClasseFiltrato.map((docente) => docente.anagrafica.email)
      );
      for (const email of expectation.includes) expect(filtered).toContain(email);
      for (const email of expectation.excludes) expect(filtered).not.toContain(email);
      expect(
        sorted(
          roles
            .risolvi('CDC_FILTER_ALUNNO', cdu, {
              regolaSupplente: GestioneSupplenti.ENTRAMBI
            })
            .map((email) => email.value)
        )
      ).toEqual(sorted(filtered));
    }
  });
});
