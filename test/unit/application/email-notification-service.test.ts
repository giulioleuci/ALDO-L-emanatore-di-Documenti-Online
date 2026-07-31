import {
  EmailNotificationService,
  type EmailNotificationDeps
} from '../../../src/application/services/EmailNotificationService';
import { ConfigurazioneEmail } from '../../../src/domain/entities/ConfigurazioneEmail';
import { Classe } from '../../../src/domain/entities/Classe';
import { Docente } from '../../../src/domain/entities/Docente';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { Carenza } from '../../../src/domain/entities/Carenza';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeProcessMonitor } from '../../../test/fakes/FakeProcessMonitor';
import type { Row } from '../../../src/infrastructure/db/Database';
import type { ContextBuilder } from '../../../src/application/context-engine/ContextBuilder';
import {
  composeContextBuilder,
  composeEmailNotificationService
} from '../../../src/config/ApplicationComposition';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { ConfigurazioneEmailRepository } from '../../../src/infrastructure/repositories/ConfigurazioneEmailRepository';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { PipelineError } from '../../../src/domain/errors/DomainError';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../../src/application/ports/ITeachingAssignmentResolver';

const NOW = new Date('2026-07-01T09:00:00Z'); // outside every supplenza window

function wire(extraConfMail: Row[] = [], drive = new FakeDriveFacade()) {
  const tables = fixtureTables();
  tables['CONF_MAIL'] = [...tables['CONF_MAIL']!, ...extraConfMail];
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const service = composeEmailNotificationService(
    db,
    gmail,
    new FakeTemplateEngine(),
    NOW,
    drive,
    new AldoTeachingAssignmentResolver(db)
  );
  return { db, drive, gmail, service };
}

function conf(processo: string, overrides: Record<string, unknown> = {}): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    ID: 'X',
    OGGETTO: 'S',
    PROCESSO: processo,
    BOX_CFG: null,
    TESTO: '',
    SUPPLENTI: 'SOLO_TITOLARI',
    NOREPLY: false,
    COLORE_HEADER: '',
    CONDIZIONE: null,
    POST_PROCESSO: null,
    ...overrides
  });
}

function mailRow(id: string, overrides: Record<string, unknown> = {}): Row {
  return {
    ID: id,
    OGGETTO: `Oggetto ${id}`,
    PROCESSO: 'PER_CDC',
    BOX_CFG: JSON.stringify([{ TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Contenuto.</p>' }]),
    TESTO: '',
    SUPPLENTI: 'SOLO_TITOLARI',
    NOREPLY: false,
    COLORE_HEADER: '',
    CONDIZIONE: null,
    POST_PROCESSO: null,
    ALLEGATI: '[]',
    ...overrides
  };
}

/** Full EmailNotificationDeps wiring over a real db, with per-test overrides (deps-injection seam for A17). */
function fullDeps(
  db: FakeDatabase,
  gmail: FakeGmailFacade,
  overrides: Partial<EmailNotificationDeps> = {}
): EmailNotificationDeps {
  const master = new MasterSheetRepository(db);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  return {
    db,
    gmail,
    drive: new FakeDriveFacade(),
    templates: new FakeTemplateEngine(),
    now: NOW,
    contextBuilder: composeContextBuilder(db, master, teachingAssignments),
    expressionEngine: new ExpressionEngineFacade(),
    docenti: new DocenteRepository(db),
    alunni: new AlunnoRepository(db),
    classi: new ClasseRepository(db),
    carenze: new CarenzaRepository(db),
    confMail: new ConfigurazioneEmailRepository(db),
    logMail: new LogEmailRepository(db),
    logDocs: new LogDocumentoRepository(db),
    master,
    materie: new MateriaRepository(db),
    teachingAssignments,
    aggregatoreDati: new AggregatoreDati(db),
    ...overrides
  };
}

function assignmentFor(titolare: Docente): TeachingAssignment {
  return {
    slot: {
      materia: MateriaId.of('MATE'),
      kind: 'MAIN',
      specifica: null
    },
    classeId: ClasseId.of('5A'),
    titolareNominale: titolare,
    titolare,
    docenteEffettivo: titolare,
    delegationChain: [],
    routing: {
      primary: [titolare],
      cc: [],
      bcc: []
    },
    trace: []
  };
}

function teachingResolverFor(
  assignments: TeachingAssignment[]
): ITeachingAssignmentResolver {
  return {
    resolveMateria: () => assignments,
    resolveConsiglio: () => assignments
  };
}

// --- Enumeration per PROCESSO (11 §3/§12) ---

test('PER_COORDINATORE: one target per coordinatore, partner classes excluded, multi-classe grouped', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_COORDINATORE'));
  expect(targets).toHaveLength(1); // rossi coordinates 5A and 1F (partners skipped)
  expect(targets[0]!.tipo).toBe('docente');
  expect(targets[0]!.docenteEmail).toBe('rossi@school.it');
  expect(targets[0]!.classiCompetenza.sort()).toEqual(['1F', '5A']);
});

test('PER_COORDINATORE routes a parent without coordinatore to its partners', () => {
  const { db, gmail } = wire();
  const parent = Classe.fromData({ ID: '3C', ANNO: 3, INDIRIZZO: 'LICEO' });
  const scientifico = Classe.fromData({ ID: '3C-S', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  const classico = Classe.fromData({ ID: '3C-C', ANNO: 3, INDIRIZZO: 'CLASSICO' });
  const classiStub = {
    findAttive: () => [parent],
    getArticolazione: () => ({ parent: null }),
    getGruppoArticolazione: () => [parent, scientifico, classico],
    getCoordinatori: (classe: Classe) => {
      if (classe.id === '3C-S') {
        return [Docente.fromData({ EMAIL: 'scientifico@school.it', DIPART: 'X' })];
      }
      if (classe.id === '3C-C') {
        return [Docente.fromData({ EMAIL: 'classico@school.it', DIPART: 'X' })];
      }
      return [];
    }
  } as unknown as ClasseRepository;
  const service = new EmailNotificationService(fullDeps(db, gmail, { classi: classiStub }));

  const targets = service.enumerateTargets(conf('PER_COORDINATORE'));
  const scientificoTarget = targets.find((target) => target.docenteEmail === 'scientifico@school.it')!;
  const classicoTarget = targets.find((target) => target.docenteEmail === 'classico@school.it')!;

  expect(scientificoTarget.classiCompetenza).toEqual(['3C-S']);
  expect(classicoTarget.classiCompetenza).toEqual(['3C-C']);
});

test('PER_DOCENTE: one target per docente with at least one active class (articulated group merged)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_DOCENTE'));
  const emails = targets.map((t) => t.docenteEmail).sort();
  expect(emails).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);
});

test('PER_DOCENTE enumerates titular targets once and defers ENTRAMBI routing to ResolveRecipientsStep', () => {
  const { db, gmail } = wire();
  const titolare = Docente.fromData({
    EMAIL: 'rossi@school.it',
    COGNOME: 'Rossi',
    DIPART: 'X'
  });
  const supplente = Docente.fromData({
    EMAIL: 'bianchi@school.it',
    COGNOME: 'Bianchi',
    DIPART: 'X'
  });
  const resolveConsiglio = jest.fn(
    (
      _classe: Classe,
      _date: Date,
      options?: { routingPolicy?: RoutingPolicyValue }
    ): TeachingAssignment[] => [
      {
        ...assignmentFor(titolare),
        docenteEffettivo: supplente,
        routing: {
          primary:
            options?.routingPolicy === RoutingPolicy.PRINCIPAL_ONLY
              ? [titolare]
              : [supplente, titolare],
          cc: [],
          bcc: []
        }
      }
    ]
  );
  const teachingAssignments: ITeachingAssignmentResolver = {
    resolveMateria: () => [],
    resolveConsiglio
  };
  const service = new EmailNotificationService(
    fullDeps(db, gmail, { teachingAssignments })
  );

  const targets = service.enumerateTargets(
    conf('PER_DOCENTE', { SUPPLENTI: 'ENTRAMBI' })
  );

  expect(targets.map((target) => target.docenteEmail)).toEqual([
    'rossi@school.it'
  ]);
  expect(resolveConsiglio).toHaveBeenCalledWith(
    expect.any(Classe),
    NOW,
    expect.objectContaining({
      includeReligioneAlt: true,
      routingPolicy: RoutingPolicy.PRINCIPAL_ONLY
    })
  );
});

test('PER_CDC: one multi-TO target per entry class (parent aggregates the articulated group, 05 §5)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CDC'));
  expect(targets.map((t) => t.target).sort()).toEqual(['1F', '5A']);
  const t5a = targets.find((t) => t.target === '5A')!;
  expect(t5a.tipo).toBe('cdc');
  // 5A: MATE effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since 2025-10-01);
  // FISI nominal holder is also bianchi -> one distinct effective teacher.
  expect(t5a.emails.sort()).toEqual(['bianchi@school.it']);
  const t1f = targets.find((t) => t.target === '1F')!;
  expect(t1f.emails.sort()).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);
});

test('PER_CDC applies CONF_MAIL.SUPPLENTI through the shared resolver', () => {
  const { db, gmail } = wire();
  const titolare = Docente.fromData({
    EMAIL: 'rossi@school.it',
    COGNOME: 'Rossi',
    DIPART: 'X'
  });
  const supplente = Docente.fromData({
    EMAIL: 'bianchi@school.it',
    COGNOME: 'Bianchi',
    DIPART: 'X'
  });
  const resolveConsiglio = jest.fn(
    (
      _classe: Classe,
      _date: Date,
      options?: { routingPolicy?: RoutingPolicyValue }
    ): TeachingAssignment[] => [
      {
        ...assignmentFor(titolare),
        docenteEffettivo: supplente,
        routing: {
          primary:
            options?.routingPolicy === RoutingPolicy.DELEGATE_OR_PRINCIPAL
              ? [supplente]
              : [titolare],
          cc: [],
          bcc: []
        }
      }
    ]
  );
  const service = new EmailNotificationService(
    fullDeps(db, gmail, {
      teachingAssignments: {
        resolveMateria: () => [],
        resolveConsiglio
      }
    })
  );

  const targets = service.enumerateTargets(
    conf('PER_CDC', { SUPPLENTI: 'SOLO_SUPPLENTI' })
  );

  expect(targets.every((target) => target.emails[0] === 'bianchi@school.it')).toBe(
    true
  );
  expect(resolveConsiglio).toHaveBeenCalledWith(
    expect.any(Classe),
    NOW,
    expect.objectContaining({
      includeReligioneAlt: true,
      routingPolicy: RoutingPolicy.DELEGATE_OR_PRINCIPAL
    })
  );
});

test('PER_CDC: cdcEmails is deterministically sorted by cognome (BIANCHI < ROSSI < VERDI), so emails[0] is stable regardless of resolveConsiglio materia/class iteration order (11 §14 fix)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CDC'));
  const t1f = targets.find((t) => t.target === '1F')!;
  // Unsorted read: emails[0] must be the alphabetically-first cognome (BIANCHI),
  // matching the pre-CattedraResolver getAllDocentiCDCArticolata behaviour --
  // NOT resolveConsiglio's raw materia/class iteration order (which yields rossi first).
  expect(t1f.emails).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);
  expect(t1f.emails[0]).toBe('bianchi@school.it');
});

test('PER_ALUNNO: one target per active student', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_ALUNNO'));
  expect(targets).toHaveLength(1);
  expect(targets[0]!).toMatchObject({
    tipo: 'alunno',
    tipoTarget: 'alunno',
    target: 'a1@school.it',
    emails: ['a1@school.it']
  });
});

test('PER_GENITORI_ALUNNO: one target per family (tutors multi-TO)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_GENITORI_ALUNNO'));
  expect(targets).toHaveLength(1);
  expect(targets[0]!).toMatchObject({
    tipo: 'genitori',
    target: 'a1@school.it',
    emails: ['genitore1@x.it']
  });
});

test('PER_CARENZA_GENITORI: one target per non-notified CARENZE row; tutors first, alunno fallback (11 §3)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI'));
  expect(targets).toHaveLength(2); // a1 prog 1 + a2 prog 1 (prog 2 already notified)
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.carenzaProgressivo).toBe(1);
  expect(a1.emails).toEqual(['genitore1@x.it']);
  const a2 = targets.find((t) => t.target === 'a2@school.it')!;
  expect(a2.emails.sort()).toEqual(['genitore2@x.it', 'genitore3@x.it']);
});

test('PER_CARENZA_GENITORI_E_ALUNNO: one shared target per non-notified CARENZE row, tutors + alunno', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_ALUNNO'));
  expect(targets).toHaveLength(2);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori_alunno');
  expect(a1.emails.sort()).toEqual(['a1@school.it', 'genitore1@x.it']);
  expect(a1.carenzaProgressivo).toBe(1);
});

test('PER_CARENZA_GENITORI_E_COORD: parents in To, class coordinatore in Cc', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_COORD'));
  expect(targets).toHaveLength(2);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori');
  expect(a1.emails).toEqual(['genitore1@x.it']);
  expect(a1.cc).toEqual(['rossi@school.it']); // 5A coordinatore (fixture)
});

// --- sendPattern end-to-end orchestration ---

test('sendPattern PER_CDC sends one email per class with supervisore BCC (11 §2)', () => {
  const { service, gmail, db } = wire();
  const result = service.sendPattern('CDC_OTTOBRE');
  expect(result.targets).toBe(2);
  expect(result.sent).toBe(2);
  expect(result.errors).toEqual([]);
  expect(gmail.sent).toHaveLength(2);
  for (const s of gmail.sent) expect(s.bcc).toEqual(['super@school.it']);
  expect(db.tables['LOG_MAIL']!.getAllRows()).toHaveLength(2);
});

test.each([
  ['VERBALE', 'Verbale scrutinio 5A e 1F'],
  ['CONDOTTA', 'Riepilogo condotta 5A e 1F']
])(
  'sendPattern renders real %s LOG_DOCS through DocumentiClasseProvider and sends every target',
  (tipo, documentName) => {
    const patternId = `DOCUMENTI_${tipo}`;
    const { service, gmail, db } = wire([
      {
        ID: patternId,
        OGGETTO: `Documenti ${tipo}`,
        PROCESSO: 'PER_CDC',
        BOX_CFG: JSON.stringify([{ TIPO_BOX: 'documenti', FILTRO_TIPO: tipo }]),
        TESTO: '',
        SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false,
        COLORE_HEADER: '',
        CONDIZIONE: null,
        POST_PROCESSO: null
      }
    ]);
    db.table('LOG_DOCS').insert({
      ID: `doc_${tipo.toLowerCase()}`,
      ID_GEN: patternId,
      TIPO: tipo,
      NOME: documentName,
      STATO: 'GENERATO',
      LINK: `https://drive.example/${tipo.toLowerCase()}`,
      CLASSI: '5A,1F',
      UTENTI: '',
      DATA_CREAZ: '2026-06-30'
    });

    const result = service.sendPattern(patternId);
    const sentBodies = gmail.sent.map((sent) => sent.htmlBody);

    expect(result.targets).toBeGreaterThan(0);
    expect(result.sent).toBe(result.targets);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(sentBodies.every((html) => html.trim().length > 0)).toBe(true);
    expect(sentBodies.every((html) => html.includes(documentName))).toBe(true);
  }
);

test('sendPattern delivers a configured static Word blob even when no box is configured', () => {
  const wordBlob = {
    name: 'circolare.doc',
    contentType: 'application/msword',
    bytes: 'fixture'
  };
  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob').mockReturnValue(wordBlob);
  const { service, gmail, db } = wire(
    [
      mailRow('STATIC_WORD', {
        BOX_CFG: '[]',
        TESTO: '<p>In allegato la circolare.</p>',
        ALLEGATI: JSON.stringify(['static-word-id'])
      })
    ],
    drive
  );

  const result = service.sendPattern('STATIC_WORD');

  expect(result).toEqual({ targets: 2, sent: 2, skipped: 0, errors: [] });
  expect(gmail.sent).toHaveLength(2);
  expect(gmail.sent.map((message) => message.attachments)).toEqual([[wordBlob], [wordBlob]]);
  expect(getFileBlob.mock.calls).toEqual([['static-word-id'], ['static-word-id']]);
  const auditRows = db
    .table('LOG_MAIL')
    .findAll()
    .filter((row) => row['PATTERN'] === 'STATIC_WORD');
  expect(auditRows).toHaveLength(2);
  for (const row of auditRows) {
    const allegati = JSON.parse(String(row['ALLEGATI'])) as Record<string, unknown>;
    expect(allegati).toMatchObject({
      docs: [],
      folders: [],
      attach: ['https://drive.google.com/open?id=static-word-id']
    });
    expect(allegati['logicalTargetId']).toMatch(/^cdc:/);
  }
});

test('sendToTarget sends no attachments when the static configuration is empty', () => {
  const { service, gmail } = wire([mailRow('STATIC_EMPTY', { ALLEGATI: '' })]);

  const result = service.sendToTarget('STATIC_EMPTY', {
    tipo: 'cdc',
    tipoTarget: 'classe',
    target: '5A',
    emails: ['rossi@school.it'],
    classiCompetenza: ['5A']
  });

  expect(result).toEqual({ sent: 1, errors: [], skipped: false });
  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.attachments).toEqual([]);
});

test('sendToTarget never assignment-routes a flagged target under PER_COORDINATORE', () => {
  const { db, gmail } = wire([
    mailRow('COORDINATORE_STALE_TARGET', {
      PROCESSO: 'PER_COORDINATORE',
      SUPPLENTI: 'SOLO_SUPPLENTI'
    })
  ]);
  const coordinatore = Docente.fromData({
    EMAIL: 'rossi@school.it',
    COGNOME: 'Rossi',
    DIPART: 'X'
  });
  const supplente = Docente.fromData({
    EMAIL: 'bianchi@school.it',
    COGNOME: 'Bianchi',
    DIPART: 'X'
  });
  const service = new EmailNotificationService(
    fullDeps(db, gmail, {
      teachingAssignments: teachingResolverFor([
        {
          ...assignmentFor(coordinatore),
          docenteEffettivo: supplente,
          routing: { primary: [supplente], cc: [], bcc: [] }
        }
      ])
    })
  );

  const result = service.sendToTarget('COORDINATORE_STALE_TARGET', {
    tipo: 'docente',
    tipoTarget: 'classe',
    target: '5A',
    docenteEmail: 'rossi@school.it',
    emails: ['rossi@school.it'],
    classiCompetenza: ['5A'],
    teachingAssignmentTarget: true
  });

  expect(result).toEqual({ sent: 1, errors: [], skipped: false });
  expect(gmail.sent[0]!.to).toEqual(['rossi@school.it']);
});

test('sendToTarget does not attach a class document unless its box explicitly sets ALLEGA true', () => {
  const { service, gmail, db } = wire([
    mailRow('DYNAMIC_NOT_OPTED_IN', {
      BOX_CFG: JSON.stringify([
        {
          TIPO_BOX: 'testo_dinamico',
          CONTENUTO: '<p>Documento collegato.</p>',
          DATI_SORGENTE: { metodo: 'documentiPerClasse' }
        }
      ])
    })
  ]);
  db.table('LOG_DOCS').insert({
    ID: 'generated-pdf-id',
    ID_GEN: 'DOC_CONFIG',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/generated-pdf',
    CLASSI: '5A',
    UTENTI: ''
  });

  service.sendToTarget('DYNAMIC_NOT_OPTED_IN', {
    tipo: 'cdc',
    tipoTarget: 'classe',
    target: '5A',
    emails: ['rossi@school.it'],
    classiCompetenza: ['5A']
  });

  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.attachments).toEqual([]);
});

test('sendToTarget sends static attachments first, then opted-in class documents, once each', () => {
  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob');
  const { service, gmail, db } = wire(
    [
      mailRow('STATIC_AND_DYNAMIC', {
        ALLEGATI: JSON.stringify(['static-id', 'shared-id']),
        BOX_CFG: JSON.stringify([
          {
            TIPO_BOX: 'testo_dinamico',
            CONTENUTO: '<p>Documenti allegati.</p>',
            ALLEGA: true,
            DATI_SORGENTE: { metodo: 'documentiPerClasse' }
          }
        ])
      })
    ],
    drive
  );
  db.table('LOG_DOCS').insert({
    ID: 'shared-id',
    ID_GEN: 'DOC_SHARED',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/shared',
    CLASSI: '5A',
    UTENTI: ''
  });
  db.table('LOG_DOCS').insert({
    ID: 'dynamic-id',
    ID_GEN: 'DOC_DYNAMIC',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/dynamic',
    CLASSI: '5A',
    UTENTI: ''
  });

  service.sendToTarget('STATIC_AND_DYNAMIC', {
    tipo: 'cdc',
    tipoTarget: 'classe',
    target: '5A',
    emails: ['rossi@school.it'],
    classiCompetenza: ['5A']
  });

  expect(gmail.sent[0]!.attachments).toEqual([
    'blob:static-id',
    'blob:shared-id',
    'blob:dynamic-id'
  ]);
  expect(getFileBlob.mock.calls).toEqual([['static-id'], ['shared-id'], ['dynamic-id']]);
});

test('malformed static attachment configuration aborts before Gmail with a diagnosable error', () => {
  const { service, gmail } = wire([
    mailRow('STATIC_MALFORMED', {
      ALLEGATI: JSON.stringify({ id: 'not-an-array' })
    })
  ]);

  expect(() => service.sendPattern('STATIC_MALFORMED')).toThrow(
    'CONF_MAIL STATIC_MALFORMED: ALLEGATI deve essere un array JSON di ID non vuoti'
  );
  expect(gmail.sent).toHaveLength(0);
});

test('sendPattern PER_CARENZA_GENITORI stamps NOTIFICATO so a second run sends nothing (11 §10)', () => {
  const { service, gmail, db } = wire();
  const first = service.sendPattern('CARENZE_NOTIFICA');
  expect(first.targets).toBe(2);
  expect(first.sent).toBe(2);
  const nonNotificate = db.tables['CARENZE']!.getAllRows().filter(
    (r) => String(r['NOTIFICATO'] ?? '') === ''
  );
  expect(nonNotificate).toHaveLength(0);
  const second = service.sendPattern('CARENZE_NOTIFICA');
  expect(second.targets).toBe(0);
  expect(gmail.sent).toHaveLength(2); // unchanged
});

test('test mode redirects all sends and disableTestMode restores (11 §15)', () => {
  const { service, gmail } = wire();
  service.enableTestMode('tester@x.it');
  service.sendPattern('CDC_OTTOBRE');
  expect(gmail.sent.every((s) => s.to.length === 1 && s.to[0] === 'tester@x.it')).toBe(true);
  service.disableTestMode();
  service.sendPattern('CDC_OTTOBRE');
  expect(gmail.sent.some((s) => s.to.includes('rossi@school.it'))).toBe(true);
});

test('onlyRecipients filters the enumerated targets (retry seam)', () => {
  const { service, gmail } = wire();
  const result = service.sendPattern('CARENZE_NOTIFICA', { onlyRecipients: ['genitore2@x.it'] });
  expect(result.targets).toBe(1);
  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.to.sort()).toEqual(['genitore2@x.it', 'genitore3@x.it']);
});

test('send failures are aggregated and logged as ERROR without stopping the batch (11 §8/§9)', () => {
  const { service, gmail, db } = wire();
  gmail.failFor.add('genitore1@x.it');
  const result = service.sendPattern('CARENZE_NOTIFICA');
  expect(result.targets).toBe(2);
  expect(result.sent).toBe(1);
  expect(result.errors).toHaveLength(1);
  const states = db.tables['LOG_MAIL']!.getAllRows()
    .map((r) => r['STATO'])
    .sort();
  expect(states).toEqual(['ERROR', 'SUCCESS']);
  // The failed carenza stays non-notified (post-process gated on success).
  const a1 = db.tables['CARENZE']!.getAllRows().find(
    (r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1
  )!;
  expect(a1['NOTIFICATO']).toBe('');
});

test('unknown pattern throws', () => {
  const { service } = wire();
  expect(() => service.sendPattern('NOPE')).toThrow();
});

// --- A17: remaining uncovered branches (defensive re-checks, id fallbacks,
// dedup/skip guards, monitor wiring) ---

describe('EmailNotificationService — remaining uncovered branches (A17)', () => {
  test('sendPattern throws via the confMail defensive re-check when findById cannot resolve an existing row', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository
      })
    );
    expect(() => service.sendPattern('CDC_OTTOBRE')).toThrow(PipelineError);
  });

  test('sendPattern skips (does not send) when CONDIZIONE evaluates false', () => {
    const { service, gmail } = wire([
      {
        ID: 'CDC_NEVER',
        OGGETTO: 'X',
        PROCESSO: 'PER_CDC',
        BOX_CFG: null,
        TESTO: '',
        SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false,
        COLORE_HEADER: '',
        CONDIZIONE: 'false',
        POST_PROCESSO: null
      }
    ]);
    const result = service.sendPattern('CDC_NEVER');
    expect(result.targets).toBe(2);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(2);
    expect(gmail.sent).toHaveLength(0);
  });

  test('sendPattern falls back to 0 sent / no errors when a target build fails before shouldSend is set', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        contextBuilder: {
          build: () => {
            throw new Error('boom');
          }
        } as unknown as ContextBuilder
      })
    );
    const result = service.sendPattern('CDC_OTTOBRE');
    expect(result.targets).toBe(2);
    expect(result.sent).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test('sendToTarget throws when the CONF_MAIL row does not exist', () => {
    const { service } = wire();
    expect(() =>
      service.sendToTarget('NOPE', {
        tipo: 'cdc',
        tipoTarget: 'classe',
        target: '5A',
        emails: ['x@y.it'],
        classiCompetenza: ['5A']
      })
    ).toThrow(PipelineError);
  });

  test('sendToTarget throws via the confMail defensive re-check when findById cannot resolve an existing row', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository
      })
    );
    expect(() =>
      service.sendToTarget('CDC_OTTOBRE', {
        tipo: 'cdc',
        tipoTarget: 'classe',
        target: '5A',
        emails: ['rossi@school.it'],
        classiCompetenza: ['5A']
      })
    ).toThrow(PipelineError);
  });

  test('sendToTarget returns skipped:true and no sent/errors when CONDIZIONE gates the send', () => {
    const { service } = wire([
      {
        ID: 'CDC_NEVER',
        OGGETTO: 'X',
        PROCESSO: 'PER_CDC',
        BOX_CFG: null,
        TESTO: '',
        SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false,
        COLORE_HEADER: '',
        CONDIZIONE: 'false',
        POST_PROCESSO: null
      }
    ]);
    const result = service.sendToTarget('CDC_NEVER', {
      tipo: 'cdc',
      tipoTarget: 'classe',
      target: '5A',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A']
    });
    expect(result).toEqual({ sent: 0, errors: [], skipped: true });
  });

  test('sendToTarget sends and returns sent/errors/skipped:false on a successful run', () => {
    const { service, gmail } = wire();
    const result = service.sendToTarget('CDC_OTTOBRE', {
      tipo: 'cdc',
      tipoTarget: 'classe',
      target: '5A',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A']
    });
    expect(result.skipped).toBe(false);
    expect(result.sent).toBe(1);
    expect(result.errors).toEqual([]);
    expect(gmail.sent).toHaveLength(1);
  });

  test('getConfigurazione throws via the confMail defensive re-check', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository
      })
    );
    expect(() => service.getConfigurazione('CDC_OTTOBRE')).toThrow(PipelineError);
  });

  test('static create wires an optional monitor, and buildPipeline reports per-step telemetry when a jobId is given', () => {
    const tables = fixtureTables();
    const db = new FakeDatabase(tables);
    const gmail = new FakeGmailFacade();
    const monitor = new FakeProcessMonitor();
    const service = composeEmailNotificationService(
      db,
      gmail,
      new FakeTemplateEngine(),
      NOW,
      new FakeDriveFacade(),
      new AldoTeachingAssignmentResolver(db),
      undefined,
      monitor
    );
    service.sendToTarget(
      'CDC_OTTOBRE',
      {
        tipo: 'cdc',
        tipoTarget: 'classe',
        target: '5A',
        emails: ['rossi@school.it'],
        classiCompetenza: ['5A']
      },
      'job-1'
    );
    expect(monitor.steps.length).toBeGreaterThan(0);
    expect(monitor.steps.some((s) => s.stepName === 'BuildCDU' && s.event === 'start')).toBe(true);
    expect(monitor.steps.some((s) => s.stepName === 'BuildCDU' && s.event === 'complete')).toBe(
      true
    );
  });

  test('composition wires the supplied teaching resolver into notification enumeration', () => {
    const db = new FakeDatabase(fixtureTables());
    const master = new MasterSheetRepository(db);
    const injected = Docente.fromData({
      EMAIL: 'injected@school.test',
      COGNOME: 'INJECTED',
      NOME: 'IRENE',
      GENERE: 'F'
    });
    const service = composeEmailNotificationService(
      db,
      new FakeGmailFacade(),
      new FakeTemplateEngine(),
      NOW,
      new FakeDriveFacade(),
      teachingResolverFor([assignmentFor(injected)]),
      undefined,
      undefined,
      master
    );

    const target = service
      .enumerateTargets(service.getConfigurazione('CDC_OTTOBRE'))
      .find((candidate) => candidate.target === '5A');
    expect(target?.emails).toEqual(['injected@school.test']);
  });

  test('PER_ALUNNO falls back to "" target/email when the alunno has no id', () => {
    const { db, gmail } = wire();
    const alunniStub = {
      findAttivi: () => [Alunno.fromData({ ATTIVO: true })]
    } as unknown as AlunnoRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { alunni: alunniStub }));
    const targets = service.enumerateTargets(conf('PER_ALUNNO'));
    expect(targets).toEqual([
      { tipo: 'alunno', tipoTarget: 'alunno', target: '', emails: [''], classiCompetenza: [] }
    ]);
  });

  test('targetsPerCoordinatore skips a coordinatore with no id and falls back to "" for a classe with no id', () => {
    const { db, gmail } = wire();
    const classeNoId = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    const classiStub = {
      findAttive: () => [classeNoId],
      getArticolazione: () => null,
      isArticolata: () => false,
      getCoordinatori: () => [
        Docente.fromData({}),
        Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' })
      ]
    } as unknown as ClasseRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { classi: classiStub }));
    const targets = service.enumerateTargets(conf('PER_COORDINATORE'));
    expect(targets).toHaveLength(1);
    expect(targets[0]!.docenteEmail).toBe('rossi@school.it');
    expect(targets[0]!.classiCompetenza).toEqual(['']);
  });

  test('targetsPerDocente filters a blank-id CDC docente and falls back to "" for a classe with no id', () => {
    const { db, gmail } = wire();
    const classeNoId = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    const classiStub = {
      findAttive: () => [classeNoId],
      getArticolazione: () => null,
      isArticolata: () => false,
      getGruppoArticolazione: () => [classeNoId]
    } as unknown as ClasseRepository;
    const teachingAssignments = teachingResolverFor([
      assignmentFor(Docente.fromData({})),
      assignmentFor(Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' }))
    ]);
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { classi: classiStub, teachingAssignments })
    );
    const targets = service.enumerateTargets(conf('PER_DOCENTE'));
    expect(targets).toHaveLength(1);
    expect(targets[0]!.docenteEmail).toBe('rossi@school.it');
    expect(targets[0]!.classiCompetenza).toEqual(['']);
  });

  test('targetsPerCdc falls back to "" for target and classiCompetenza when the classe has no id', () => {
    const { db, gmail } = wire();
    const classeNoId = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    const classiStub = {
      findAttive: () => [classeNoId],
      getArticolazione: () => null,
      isArticolata: () => false,
      getGruppoArticolazione: () => [classeNoId]
    } as unknown as ClasseRepository;
    const teachingAssignments = teachingResolverFor([
      assignmentFor(Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' }))
    ]);
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { classi: classiStub, teachingAssignments })
    );
    const targets = service.enumerateTargets(conf('PER_CDC'));
    expect(targets).toEqual([
      {
        tipo: 'cdc',
        tipoTarget: 'classe',
        target: '',
        emails: ['rossi@school.it'],
        classiCompetenza: ['']
      }
    ]);
  });

  test('targetsPerGenitori skips alunni without tutors, dedups repeated tutor sets, and falls back to "" when the alunno has no id', () => {
    const { db, gmail } = wire();
    const alunniStub = {
      findAttivi: () => [
        Alunno.fromData({ ATTIVO: true }), // no tutors -> skipped (line 306)
        Alunno.fromData({ ATTIVO: true, TUTOR_1: 'g@x.it' }), // no EMAIL -> id null (line 312 fallback)
        Alunno.fromData({ EMAIL: 'a9@school.it', ATTIVO: true, TUTOR_1: 'g@x.it' }) // same tutor set -> dedup (line 308 false branch)
      ]
    } as unknown as AlunnoRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { alunni: alunniStub }));
    const targets = service.enumerateTargets(conf('PER_GENITORI_ALUNNO'));
    expect(targets).toHaveLength(1);
    expect(targets[0]!.target).toBe('');
    expect(targets[0]!.emails).toEqual(['g@x.it']);
  });

  test('targetsPerCarenza skips a carenza whose alunno is missing, uses tutors when present, and falls back to [""] when absent', () => {
    const { db, gmail } = wire();
    const carenzeStub = {
      findNonNotificate: () => [
        Carenza.fromData({ STUDENTE: 'ghost@x.it', PROGRESSIVO: 1 }),
        Carenza.fromData({ STUDENTE: 'noid@x.it', PROGRESSIVO: 2 }),
        Carenza.fromData({ STUDENTE: 'withtutor@x.it', PROGRESSIVO: 1 }),
        Carenza.fromData({ STUDENTE: 'withid-notutor@x.it', PROGRESSIVO: 1 })
      ]
    } as unknown as CarenzaRepository;
    const alunniStub = {
      findById: (id: string) => {
        if (id === 'noid@x.it') return Alunno.fromData({ ATTIVO: true });
        if (id === 'withtutor@x.it')
          return Alunno.fromData({ EMAIL: 'withtutor@x.it', ATTIVO: true, TUTOR_1: 't@x.it' });
        if (id === 'withid-notutor@x.it')
          return Alunno.fromData({ EMAIL: 'withid-notutor@x.it', ATTIVO: true });
        return null;
      }
    } as unknown as AlunnoRepository;
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { carenze: carenzeStub, alunni: alunniStub })
    );
    const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI'));
    expect(targets).toHaveLength(3);
    const noId = targets.find((t) => t.target === 'noid@x.it')!;
    expect(noId.emails).toEqual(['']);
    const withTutor = targets.find((t) => t.target === 'withtutor@x.it')!;
    expect(withTutor.emails).toEqual(['t@x.it']);
    const withIdNoTutor = targets.find((t) => t.target === 'withid-notutor@x.it')!;
    expect(withIdNoTutor.emails).toEqual(['withid-notutor@x.it']);
  });

  test('targetsPerCarenza redacts the missing alunno email in the warn log', () => {
    const { db, gmail } = wire();
    const carenzeStub = {
      findNonNotificate: () => [Carenza.fromData({ STUDENTE: 'ghost@x.it', PROGRESSIVO: 1 })]
    } as unknown as CarenzaRepository;
    const alunniStub = {
      findById: () => null
    } as unknown as AlunnoRepository;
    const warnMock = jest.fn();
    const logger = { warn: warnMock, error: jest.fn() } as unknown as LoggerService;
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { carenze: carenzeStub, alunni: alunniStub, logger })
    );
    service.enumerateTargets(conf('PER_CARENZA_GENITORI'));
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('[EMAIL_REDACTED]'));
    const warnCalls = warnMock.mock.calls.map((args: unknown[]) => args[0] as string);
    expect(warnCalls.some((msg) => msg.includes('@'))).toBe(false);
  });

  test('sendToTarget falls back to 0 sent / no errors on the success path when the build fails before shouldSend is set', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        contextBuilder: {
          build: () => {
            throw new Error('boom');
          }
        } as unknown as ContextBuilder
      })
    );
    const result = service.sendToTarget('CDC_OTTOBRE', {
      tipo: 'cdc',
      tipoTarget: 'classe',
      target: '5A',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A']
    });
    expect(result.skipped).toBe(false);
    expect(result.sent).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
