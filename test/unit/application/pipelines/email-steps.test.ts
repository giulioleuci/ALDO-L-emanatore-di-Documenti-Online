import {
  BuildCDUStep,
  ValutaCondizioniInvioStep,
  CheckAlreadySentStep,
  RenderBoxesStep,
  ComposeEmailStep,
  ResolveRecipientsStep,
  SendEmailStep,
  LogEmailStep,
  PostProcessEmailStep
} from '../../../../src/application/pipelines/emailSteps';
import { ConfigurazioneEmail } from '../../../../src/domain/entities/ConfigurazioneEmail';
import { Docente } from '../../../../src/domain/entities/Docente';
import { Alunno } from '../../../../src/domain/entities/Alunno';
import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import type { StoricoDatabaseProvider } from '../../../../src/application/storico/StoricoDatabaseProvider';
import type { EmailTarget } from '../../../../src/application/email/saluto';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ExpressionEngineFacade } from '../../../../src/infrastructure/facades/ExpressionEngineFacade';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';

import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { LogEmailRepository } from '../../../../src/infrastructure/repositories/LogEmailRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../../test/fakes/FakeDriveFacade';
import type { Row } from '../../../../src/infrastructure/db/Database';
import { AggregatoreDati } from '../../../../src/application/services/AggregatoreDati';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../../../src/application/ports/ITeachingAssignmentResolver';
import { MateriaId } from '../../../../src/domain/value-objects/MateriaId';
import { ClasseId } from '../../../../src/domain/value-objects/ClasseId';
import { emailTargetId } from '../../../../src/application/email/saluto';
import type { Classe } from '../../../../src/domain/entities/Classe';
import { AmbiguousVariazioneCattedraError } from '../../../../src/domain/errors/DomainError';

const logger = new LoggerService();
const NOW = new Date('2025-11-15T09:00:00Z'); // inside the rossi→bianchi supplenza window

const PATTERN_ROW: Row = {
  ID: 'TEST_PATTERN',
  OGGETTO: 'Carenze di {{focus.alunno.anagrafica.nomeCompleto}}',
  PROCESSO: 'PER_GENITORI_ALUNNO',
  BOX_CFG: '[{"TIPO_BOX":"carenze","TITOLO":"Carenze"},{"TIPO_BOX":"assenze","ORDINE":5}]',
  TESTO_START: '<p>Si comunica quanto segue per la classe {{focus.alunno.classe.nome}}.</p>',
  SUPPLENTI: 'SOLO_TITOLARI',
  NOREPLY: true,
  COLORE_HEADER: '',
  CONDIZIONE: null,
  POST_PROCESSO: null
};

function genitoriTarget(): EmailTarget {
  return {
    tipo: 'genitori',
    tipoTarget: 'alunno',
    target: 'a1@school.it',
    emails: ['genitore1@x.it'],
    classiCompetenza: [],
    carenzaProgressivo: 1
  };
}

function docenteTarget(): EmailTarget {
  return {
    tipo: 'docente',
    tipoTarget: 'classe',
    target: '5A',
    docenteEmail: 'rossi@school.it',
    emails: ['rossi@school.it'],
    classiCompetenza: [],
    teachingAssignmentTarget: true
  };
}

// 5A/MATE's effective titolare is bianchi (VARIAZIONI_CATTEDRA, decorsa since
// 2025-10-01, well before NOW), so the rossi->bianchi SUPPLENZE row (keyed to
// TITOLARE=rossi) can no longer reach 5A/MATE (see swap-supplenti.test.ts). The
// same SUPPLENZE row also covers class 4B, untouched by any VARIAZIONI_CATTEDRA
// — a local '4B' class (added only here) keeps rossi as MATE's nominal holder
// so the supplenza chain is still reachable.
function tablesWith4B(): Record<string, Row[]> {
  const t = fixtureTables();
  (t['CLASSI'] as Row[]).push({
    ID: '4B',
    ANNO: 4,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it'
  });
  return t;
}

function docente4BTarget(): EmailTarget {
  return {
    tipo: 'docente',
    tipoTarget: 'classe',
    target: '4B',
    docenteEmail: 'rossi@school.it',
    emails: ['rossi@school.it'],
    classiCompetenza: [],
    teachingAssignmentTarget: true
  };
}

interface Wiring {
  db: FakeDatabase;
  ctx: PipelineContext;
  templates: FakeTemplateEngine;
  docenti: DocenteRepository;
  alunni: AlunnoRepository;
}

function wire(
  patternOverrides: Partial<Record<string, unknown>> = {},
  target: EmailTarget = genitoriTarget(),
  tables: Record<string, Row[]> = fixtureTables()
): Wiring {
  const db = new FakeDatabase(tables);
  const row = { ...PATTERN_ROW, ...patternOverrides } as Row;
  const ctx = new PipelineContext();
  ctx.set('config', row);
  ctx.set('confMail', ConfigurazioneEmail.fromData(row));
  ctx.set('emailTarget', target);
  ctx.set('now', NOW);
  const docenti = new DocenteRepository(db);
  return {
    db,
    ctx,
    templates: new FakeTemplateEngine(),
    docenti,
    alunni: new AlunnoRepository(db)
  };
}

// No offline unit test in this file can construct a real historical-year
// DatabaseService — this harness has no Advanced Sheets API stand-in (see
// test/setup/load-gaslibs.cjs's CacheService comment). BuildCDUStep decides
// includiStorico itself from BOX_CFG (e.g. arricchisciConStorico:true), so any
// test here can end up exercising it even without asking for it explicitly;
// buildStep() below backs its composeContextBuilder call with a no-op
// StoricoDatabaseProvider for that reason. The other composeContextBuilder
// call sites in this file use the real provider instead and stay harmless
// only because the shared fixture's MASTER table lists no historical years,
// so anniStorici() never actually needs to open anything.
function noHistoryStoricoDb(): StoricoDatabaseProvider {
  return { anniStorici: () => [] };
}

function buildStep(w: Wiring): BuildCDUStep {
  return new BuildCDUStep(
    logger,
    composeContextBuilder(w.db, undefined, undefined, noHistoryStoricoDb()),
    w.docenti,
    w.alunni,
    new ClasseRepository(w.db),
    new MateriaRepository(w.db),
    new AldoTeachingAssignmentResolver(w.db)
  );
}

function runThroughRender(w: Wiring): string[] {
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  return w.ctx.get<string[]>('boxHtmlOrdered')!;
}

function runThroughCompose(w: Wiring, drive = new FakeDriveFacade()): FakeDriveFacade {
  runThroughRender(w);
  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    drive
  ).execute(w.ctx);
  return drive;
}

function logDetails(result: StepExecutionResult): unknown {
  return result.logDetails;
}

describe('email pipeline operational log details', () => {
  test('publishes the built CDU target and the send-condition decision', () => {
    const w = wire({ CONDIZIONE: '{{focus.alunno.didattica.carenze.numero}} > 99' });

    const built = buildStep(w).execute(w.ctx);
    const decision = new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(
      w.ctx
    );

    expect(logDetails(built)).toEqual({
      Target: 'a1@school.it',
      TargetType: 'alunno',
      Recipe: 'FAMIGLIA_COMPLETO',
      Context: 'Built'
    });
    expect(logDetails(decision)).toEqual({ Send: false, Reason: 'Condition not met' });
  });

  test('publishes the exact true send decision when the configured condition passes', () => {
    const w = wire({ CONDIZIONE: 'true' });
    buildStep(w).execute(w.ctx);

    const decision = new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(
      w.ctx
    );

    expect(logDetails(decision)).toEqual({ Send: true, Reason: 'Condition met' });
  });

  test('publishes the rendered-box count, including zero', () => {
    const w = wire({ BOX_CFG: '[]' });
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);

    const rendered = new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(
      w.ctx
    );

    expect(logDetails(rendered)).toEqual({
      Boxes: 0,
      PianiCdu: 0,
      PianiDaNotificare: 0,
      PianiNotificati: 0
    });
  });

  test('publishes every rendered box in the operational count', () => {
    const w = wire({
      BOX_CFG: JSON.stringify([
        { TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Uno</p>' },
        { TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Due</p>' },
        { TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Tre</p>' }
      ])
    });
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);

    const rendered = new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(
      w.ctx
    );

    expect(logDetails(rendered)).toEqual({
      Boxes: 3,
      PianiCdu: 0,
      PianiDaNotificare: 0,
      PianiNotificati: 0
    });
  });

  test('publishes CDU personalized-plan counts split by notification state', () => {
    const tables = fixtureTables();
    (tables['LOG_DOCS'] as Row[]).push(
      {
        ID: 'piano-nuovo',
        ID_GEN: 'PIANI_PERSONALIZZATI',
        TIPO: 'PIANO_PERS',
        SOTTOTIPO: 'PDP_DSA',
        NOME: 'PDP da notificare',
        STATO: 'GENERATO',
        NOTIFICATO: '',
        CLASSI: '5A',
        UTENTI: 'a1@school.it'
      },
      {
        ID: 'piano-notificato',
        ID_GEN: 'PIANI_PERSONALIZZATI',
        TIPO: 'PIANO_PERS',
        SOTTOTIPO: 'PEI',
        NOME: 'PEI notificato',
        STATO: 'GENERATO',
        NOTIFICATO: '2025-11-14T09:00:00.000Z',
        CLASSI: '5A',
        UTENTI: 'a1@school.it'
      }
    );
    const w = wire(
      {
        PROCESSO: 'PER_COORDINATORE',
        BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare', arricchisciConStorico: false }])
      },
      docenteTarget(),
      tables
    );
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);

    const rendered = new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(
      w.ctx
    );

    expect(logDetails(rendered)).toEqual({
      Boxes: 1,
      PianiCdu: 2,
      PianiDaNotificare: 1,
      PianiNotificati: 1
    });
  });

  test('publishes the subject and attachment count without the composed HTML body', () => {
    const w = wire({ OGGETTO: 'Convocazione consiglio', ALLEGATI: '["file-1","file-2"]' });
    runThroughRender(w);

    const composed = new ComposeEmailStep(
      logger,
      w.templates,
      new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
      new FakeDriveFacade()
    ).execute(w.ctx);

    expect(logDetails(composed)).toEqual({ Subject: 'Convocazione consiglio', Attachments: 2 });
    expect(JSON.stringify(logDetails(composed))).not.toContain('<!DOCTYPE html>');
  });

  test('publishes the resolved To and Cc operational addresses', () => {
    const w = wire(
      {},
      {
        tipo: 'genitori',
        tipoTarget: 'alunno',
        target: 'a1@school.it',
        emails: ['docente@example.edu'],
        cc: ['segreteria@example.edu'],
        classiCompetenza: []
      }
    );
    w.ctx.set('shouldSend', true);

    const recipients = new ResolveRecipientsStep(
      logger,
      w.docenti,
      new ClasseRepository(w.db),
      new AldoTeachingAssignmentResolver(w.db)
    ).execute(w.ctx);

    expect(logDetails(recipients)).toEqual({
      To: ['docente@example.edu'],
      Cc: ['segreteria@example.edu']
    });
  });

  test('publishes sent operational recipients and no log-email payload', () => {
    const w = wire({ OGGETTO: 'Convocazione consiglio' });
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [{ emails: ['docente@example.edu'] }]);
    const noSupervisore = {
      findConfigAnnoCorrente: () => ({ hasSupervisore: () => false, supervisoreEmail: null })
    } as unknown as MasterSheetRepository;

    const sent = new SendEmailStep(logger, new FakeGmailFacade(), noSupervisore).execute(w.ctx);
    const logged = new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);

    expect(logDetails(sent)).toEqual({ Sent: 1, Recipients: ['docente@example.edu'] });
    expect(logDetails(logged)).toBeNull();
  });

  test('publishes Bcc/test routing and send errors without rendering the email body', () => {
    const w = wire({ OGGETTO: 'Convocazione consiglio' });
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [
      { emails: ['broken@example.edu'], cc: ['segreteria@example.edu'] }
    ]);
    const gmail = new FakeGmailFacade();
    gmail.failFor.add('tester@example.edu');
    w.ctx.set('testEmail', 'tester@example.edu');

    const result = new SendEmailStep(logger, gmail, new MasterSheetRepository(w.db)).execute(w.ctx);

    expect(logDetails(result)).toEqual({
      Sent: 0,
      Recipients: ['tester@example.edu'],
      Errors: ['simulated failure for tester@example.edu'],
      Cc: [],
      Bcc: []
    });
    expect(JSON.stringify(logDetails(result))).not.toContain('<!DOCTYPE html>');
  });

  test('publishes normal-mode Cc and supervisor Bcc addresses separately', () => {
    const w = wire({ OGGETTO: 'Convocazione consiglio' });
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [
      { emails: ['docente@example.edu'], cc: ['segreteria@example.edu'] }
    ]);

    const result = new SendEmailStep(
      logger,
      new FakeGmailFacade(),
      new MasterSheetRepository(w.db)
    ).execute(w.ctx);

    expect(logDetails(result)).toEqual({
      Sent: 1,
      Recipients: ['docente@example.edu'],
      Cc: ['segreteria@example.edu'],
      Bcc: ['super@school.it']
    });
  });

  test('publishes post-process action names and affected row count', () => {
    const post = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'CARENZE',
        col: 'NOTIFICATO',
        criteri: {
          STUDENTE: '{{focus.carenza.studente}}',
          PROGRESSIVO: '{{focus.carenza.progressivo}}'
        }
      }
    ]);
    const w = wire({ PROCESSO: 'PER_CARENZA_GENITORI', POST_PROCESSO: post });
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
    send(w, new FakeGmailFacade());

    const postProcessed = new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);

    expect(logDetails(postProcessed)).toEqual({ Actions: ['INSERISCI_TIMESTAMP'], Updated: 1 });
  });
});

// --- Step 1: BuildCDUStep ---

test('BuildCDUStep PER_GENITORI_ALUNNO builds FAMIGLIA_COMPLETO CDU and enriches destinatario (11 §3)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.focus.alunno?.anagrafica.email).toBe('a1@school.it');
  expect(cdu.focus.alunno?.didattica.documenti).toBeDefined(); // FAMIGLIA_COMPLETO includes documenti
  expect(cdu.destinatario?.comunicazione.salutoIniziale).toBe('Gentili Genitori');
  expect(cdu.destinatario?.anagrafica.email).toBe('genitore1@x.it');
});

test('BuildCDUStep PER_DOCENTE builds DOCENTE_COMPLETO CDU with docente anagrafica (11 §3)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.focus.classe?.anagrafica.nome).toBe('5A');
  expect(cdu.focus.classe?.consiglioDiClasse).toBeDefined();
  const d = cdu.destinatario!;
  // PersonVM.nomeCompleto is "Nome Cognome" (02 §8.1), the reverse order of
  // Docente.getNomeCompleto()'s "${cognome} ${nome}" — the latter still drives
  // comunicazione.salutoIniziale below via salutoPerTarget/Docente directly.
  expect(d.anagrafica.nomeCompleto).toBe('MARIO ROSSI');
  expect(d.anagrafica.appellativo).toBe('Prof.');
  expect(d.comunicazione.salutoIniziale).toBe('Gentile Prof. ROSSI MARIO');
});

test('BuildCDUStep destinatario.anagrafica is a full PersonVM (Task 9)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const d = cdu.destinatario!;
  expect(d.anagrafica.appellativoCompleto).toBe('Prof. MARIO ROSSI');
  expect(d.anagrafica.appellativoCognome).toBe('Prof. ROSSI');
});

test('BuildCDUStep destinatario.contesto.sostituisce stays null when there is no supplenza context (Task 9)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.destinatario?.contesto.sostituisce).toBeNull();
});

test('BuildCDUStep destinatario matches the resolved supplente and records sostituisce when the target was split off a titolare (titolare/supplente content-mismatch fix)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_SUPPLENTI' },
    { ...docente4BTarget(), docenteEmail: 'bianchi@school.it', titolareEmail: 'rossi@school.it' },
    tablesWith4B()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const d = cdu.destinatario!;
  // The physical recipient is bianchi (the supplente) — content/greeting must
  // address bianchi, not rossi (the nominal titolare this target was split from).
  expect(d.anagrafica.email).toBe('bianchi@school.it');
  expect(d.comunicazione.salutoIniziale).toContain('BIANCHI');
  expect(d.contesto.sostituisce?.email).toBe('rossi@school.it');
});

test('BuildCDUStep forwards CONF_MAIL.SUPPLENTI as gestioneSupplenti (regression: was silently dropped when includiStorico wiring was added)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_SUPPLENTI' },
    docente4BTarget(),
    tablesWith4B()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const rossiSlot = cdu.focus.classe!.consiglioDiClasse!.find((d) =>
    d.materie.some((m) => m.sigla === 'MATE')
  )!;
  // NOW (2025-11-15) is inside the rossi->bianchi->verdi supplenza chain window (see swap-supplenti.test.ts).
  // SOLO_SUPPLENTI must swap the titolare VM for the chain-resolved supplente.
  expect(rossiSlot.anagrafica.email).toBe('bianchi@school.it');
  expect(rossiSlot.stato.isSupplente).toBe(true);
});

test('BuildCDUStep PER_CARENZA_GENITORI uses CARENZA_COMPLETO and sets carenza focus (11 §3, 02 §4.3)', () => {
  const w = wire({ PROCESSO: 'PER_CARENZA_GENITORI' });
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.focus.carenza?.progressivo).toBe(1);
  expect(cdu.focus.carenza?.hasAssenze).toBe(true);
});

test('BuildCDUStep copies EmailTarget.classiCompetenza into BuildParams', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A', '1F']
    }
  );
  const real = composeContextBuilder(w.db);
  let capturedParams: BuildParams | undefined;
  const spyBuilder = {
    build: (params: BuildParams, r: Recipe) => {
      capturedParams = params;
      return real.build(params, r);
    }
  } as ContextBuilder;
  new BuildCDUStep(
    logger,
    spyBuilder,
    w.docenti,
    w.alunni,
    new ClasseRepository(w.db),
    new MateriaRepository(w.db),
    new AldoTeachingAssignmentResolver(w.db)
  ).execute(w.ctx);
  expect(capturedParams?.classiCompetenza).toEqual(['5A', '1F']);
});

test('BuildCDUStep computes cattedre + materieCompetenza across multiple classes for a docente target, collapsing an articolazione parent+partner pair into one row (design 2026-08-22, updated 2026-08-22 articolata dedupe)', () => {
  // NOTE (deviation from task-1-brief.md): the brief's original fixture pair
  // was ['5A', '1F'], but the fixture's own VARIAZIONI_CATTEDRA row
  // (TITOLARE rossi -> NUOVO_TITOLARE bianchi, DAL 2025-10-01, CLASSI '5A',
  // MATERIE 'MATE', see test/fixtures/tables.ts) permanently reassigns
  // 5A/MATE to bianchi as of NOW (2025-11-15) -- rossi is no longer the
  // docenteEffettivo there, so 5A is correctly excluded from rossi's
  // cattedre by design (a stale/reassigned class must not appear). '1F' and
  // '1F-LSO' are used instead: both nominally and effectively hold
  // rossi/MATE at NOW with no active SUPPLENZE/VARIAZIONI_CATTEDRA override,
  // preserving the test's intent (multi-class cattedre computation + MATE
  // dedup on the flat list) without relying on stale-assignment exclusion,
  // which is covered separately by the "excludes a class..." test below.
  //
  // '1F' is the articolazione parent and '1F-LSO' one of its partners (see
  // test/fixtures/tables.ts): rossi teaches the COMUNE subject MATE across
  // the whole group, so these two classes now collapse into ONE cattedra
  // row keyed by the parent '1F' (design 2026-08-22 articolata dedupe),
  // instead of one row per sibling class.
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '1F',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['1F', '1F-LSO']
    }
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  expect(contesto.cattedre.map((c) => c.classeId)).toEqual(['1F']);
  expect(contesto.cattedre[0]!.materie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(contesto.cattedre[0]!.anno).toBe(1);
  expect(contesto.cattedre[0]!.sezione).toBe('F');
  // rossi teaches MATE in both 1F and 1F-LSO: flat list dedupes to one entry.
  expect(contesto.materieCompetenza.map((m) => m.sigla)).toEqual(['MATE']);
});

test('BuildCDUStep collapses all three classes of an articolazione group (parent + both partners) into a single cattedra row (design 2026-08-22 articolata dedupe)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '1F',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['1F', '1F-LSO', '1F-LSS']
    }
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  // Three classes in classiCompetenza, all in the same articolazione group,
  // all resolving MATE for rossi (COMUNE subject) -> a single row, not three.
  expect(contesto.cattedre).toHaveLength(1);
  expect(contesto.cattedre.map((c) => c.classeId)).toEqual(['1F']);
  expect(contesto.cattedre[0]!.materie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(contesto.cattedre[0]!.anno).toBe(1);
  expect(contesto.cattedre[0]!.sezione).toBe('F');
  expect(contesto.materieCompetenza.map((m) => m.sigla)).toEqual(['MATE']);
});

test('BuildCDUStep excludes a class from cattedre when the docente has no effective materia there, email still buildable (design 2026-08-22)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'verdi@school.it',
      emails: ['verdi@school.it'],
      classiCompetenza: ['5A']
    }
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  expect(contesto.cattedre).toEqual([]);
  expect(contesto.materieCompetenza).toEqual([]);
  expect(cdu.destinatario!.anagrafica.email).toBe('verdi@school.it');
});

test('BuildCDUStep only computes cattedre for docente-type targets, not genitori/alunno (design 2026-08-22)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.destinatario!.contesto.cattedre).toEqual([]);
  expect(cdu.destinatario!.contesto.materieCompetenza).toEqual([]);
});

test('BuildCDUStep dedupes MAIN over ITP on the flat materieCompetenza list (legacy precedence, design 2026-08-22)', () => {
  const tables = fixtureTables();
  (tables['CLASSI'] as Row[]).push({
    ID: '2C',
    ANNO: 2,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it',
    'MATE.itp': 'rossi@school.it'
  });
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '2C',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['2C']
    },
    tables
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  const materie = cdu.destinatario!.contesto.cattedre[0]!.materie;
  expect(materie).toHaveLength(1);
  expect(materie[0]!.sigla).toBe('MATE');
  expect(materie[0]!.isITP).toBe(false);
});

test('BuildCDUStep supplenza ENTRAMBI: the resolved supplente sees the covered materia, the titolare does not (design 2026-08-22)', () => {
  const supplenteTarget: EmailTarget = {
    ...docente4BTarget(),
    docenteEmail: 'bianchi@school.it',
    titolareEmail: 'rossi@school.it'
  };
  const wSupplente = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    supplenteTarget,
    tablesWith4B()
  );
  buildStep(wSupplente).execute(wSupplente.ctx);
  const supplenteCdu = wSupplente.ctx.get<Cdu>('cdu')!;
  expect(supplenteCdu.destinatario!.contesto.materieCompetenza.map((m) => m.sigla)).toContain('MATE');

  const wTitolare = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    docente4BTarget(),
    tablesWith4B()
  );
  buildStep(wTitolare).execute(wTitolare.ctx);
  const titolareCdu = wTitolare.ctx.get<Cdu>('cdu')!;
  expect(titolareCdu.destinatario!.contesto.cattedre).toEqual([]);
});

/**
 * Delegates to a real resolver for every class except one, where it throws —
 * simulating a malformed VARIAZIONI_CATTEDRA row surfacing as
 * AmbiguousVariazioneCattedraError for that single class only.
 */
class ThrowingForOneClassResolver implements ITeachingAssignmentResolver {
  constructor(
    private readonly real: ITeachingAssignmentResolver,
    private readonly throwingClasseId: string
  ) {}

  resolveMateria(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    routingPolicy?: RoutingPolicyValue
  ): TeachingAssignment[] {
    return this.real.resolveMateria(classe, materia, data, routingPolicy);
  }

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options?: { includeReligioneAlt?: boolean; routingPolicy?: RoutingPolicyValue }
  ): TeachingAssignment[] {
    if (classe.id === this.throwingClasseId) {
      throw new AmbiguousVariazioneCattedraError(`VARIAZIONI_CATTEDRA malformata per ${classe.id}`);
    }
    return this.real.resolveConsiglio(classe, data, options);
  }
}

/** Delegates to a real resolver while recording every `resolveConsiglio` call's classeId (design 2026-08-22 review fix 4). */
class CountingResolver implements ITeachingAssignmentResolver {
  public readonly resolveConsiglioCalls: string[] = [];
  constructor(private readonly real: ITeachingAssignmentResolver) {}

  resolveMateria(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    routingPolicy?: RoutingPolicyValue
  ): TeachingAssignment[] {
    return this.real.resolveMateria(classe, materia, data, routingPolicy);
  }

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options?: { includeReligioneAlt?: boolean; routingPolicy?: RoutingPolicyValue }
  ): TeachingAssignment[] {
    this.resolveConsiglioCalls.push(classe.id ?? '');
    return this.real.resolveConsiglio(classe, data, options);
  }
}

test('BuildCDUStep tolerates a resolver error on one competenza class: that class is excluded, others still build, warning logged (design 2026-08-22 review fix 4)', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '1F',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['1F', '1F-LSO']
    }
  );
  const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  const step = new BuildCDUStep(
    logger,
    composeContextBuilder(w.db),
    w.docenti,
    w.alunni,
    new ClasseRepository(w.db),
    new MateriaRepository(w.db),
    new ThrowingForOneClassResolver(new AldoTeachingAssignmentResolver(w.db), '1F')
  );

  expect(() => step.execute(w.ctx)).not.toThrow();

  const cdu = w.ctx.get<Cdu>('cdu')!;
  const contesto = cdu.destinatario!.contesto;
  // '1F' throws (excluded); '1F-LSO' succeeds and groups under its
  // articolazione parent '1F' (design 2026-08-22 articolata dedupe), so the
  // single surviving cattedra row is keyed by the parent's classeId, not by
  // '1F-LSO' itself.
  expect(contesto.cattedre.map((c) => c.classeId)).toEqual(['1F']);
  expect(contesto.materieCompetenza.map((m) => m.sigla)).toEqual(['MATE']);
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('rossi@school.it')
  );
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1F'));
  warnSpy.mockRestore();
});

test('BuildCDUStep memoizes resolveConsiglio per (classe, when) across docente targets on the same step instance (design 2026-08-22 review fix 4)', () => {
  // '1F-LSO' holds rossi/MATE and bianchi/FISI (see test/fixtures/tables.ts):
  // both docenti's cattedre computation needs a resolveConsiglio call for the
  // SAME (classe, when) pair — this is exactly the redundant-call shape
  // EmailNotificationService's batch reuse of one BuildCDUStep hits in
  // production (a class of N docenti each getting a PER_DOCENTE email).
  const tables = fixtureTables();
  const db = new FakeDatabase(tables);
  const counting = new CountingResolver(new AldoTeachingAssignmentResolver(db));
  const step = new BuildCDUStep(
    logger,
    composeContextBuilder(db),
    new DocenteRepository(db),
    new AlunnoRepository(db),
    new ClasseRepository(db),
    new MateriaRepository(db),
    counting
  );
  const row = { ...PATTERN_ROW, PROCESSO: 'PER_DOCENTE' } as Row;
  const baseTarget: EmailTarget = {
    tipo: 'docente',
    tipoTarget: 'classe',
    target: '1F-LSO',
    docenteEmail: 'rossi@school.it',
    emails: ['rossi@school.it'],
    classiCompetenza: ['1F-LSO']
  };

  const ctxRossi = new PipelineContext();
  ctxRossi.set('config', row);
  ctxRossi.set('confMail', ConfigurazioneEmail.fromData(row));
  ctxRossi.set('emailTarget', baseTarget);
  ctxRossi.set('now', NOW);
  step.execute(ctxRossi);

  const ctxBianchi = new PipelineContext();
  ctxBianchi.set('config', row);
  ctxBianchi.set('confMail', ConfigurazioneEmail.fromData(row));
  ctxBianchi.set('emailTarget', {
    ...baseTarget,
    docenteEmail: 'bianchi@school.it',
    emails: ['bianchi@school.it']
  });
  ctxBianchi.set('now', NOW);
  step.execute(ctxBianchi);

  // The underlying resolver was hit only once for '1F-LSO' despite two docente targets.
  expect(counting.resolveConsiglioCalls.filter((id) => id === '1F-LSO')).toHaveLength(1);

  // The cache must not corrupt per-docente results: each still sees only their own materia.
  const rossiCdu = ctxRossi.get<Cdu>('cdu')!;
  const bianchiCdu = ctxBianchi.get<Cdu>('cdu')!;
  expect(rossiCdu.destinatario!.contesto.cattedre[0]!.materie.map((m) => m.sigla)).toEqual(['MATE']);
  expect(bianchiCdu.destinatario!.contesto.cattedre[0]!.materie.map((m) => m.sigla)).toEqual(['FISI']);
});

test('BuildCDUStep enables includiStorico when BOX_CFG has an explicit arricchisciConStorico:true documenti box', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([{ TIPO_BOX: 'documenti', arricchisciConStorico: true }])
  }); // default PROCESSO PER_GENITORI_ALUNNO, default target genitoriTarget()
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(true);
});

test('BuildCDUStep enables includiStorico by default for piani_pers_da_inviare even with no explicit key', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare' }])
    },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(true);
});

test('BuildCDUStep leaves includiStorico false when no box wants historical data', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>hi</p>' }])
    },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(false);
});

test('BuildCDUStep respects an explicit arricchisciConStorico:false override on piani_pers_da_inviare', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare', arricchisciConStorico: false }])
    },
    docenteTarget()
  );
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.meta.parametriInput.opzioni.includiStorico).toBe(false);
});

// --- Step 2: ValutaCondizioniInvioStep ---

test('empty CONDIZIONE ⇒ shouldSend true (11 §4)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  expect(w.ctx.get('shouldSend')).toBe(true);
});

test('CONDIZIONE evaluated on the recipient CDU; false ⇒ silent skip (11 §4)', () => {
  const w = wire({ CONDIZIONE: '{{focus.alunno.didattica.carenze.numero}} > 99' });
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  expect(w.ctx.get('shouldSend')).toBe(false);
});

// --- Steps 3-4: RenderBoxesStep + ComposeEmailStep ---

test('RenderBoxesStep writes cdu.render.boxes and resolves OGGETTO (11 §5)', () => {
  const w = wire();
  runThroughCompose(w);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(w.ctx.get('oggettoRisolto')).toBe('Carenze di VERDI ANNA');
  expect(cdu.render?.boxes['carenze']?.visibile).toBe(true);
  expect(cdu.render?.boxes['carenze']?.html).toContain('Voto 4.5');
});

test('RenderBoxesStep: one visible non-empty document box keeps delivery eligible', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([
        {
          TIPO_BOX: 'documenti',
          DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'VERBALE' } }
        }
      ])
    },
    docenteTarget()
  );
  w.db.table('LOG_DOCS').insert({
    ID: 'doc_verbale_5a',
    ID_GEN: 'VERBALE_CDC',
    TIPO: 'VERBALE',
    NOME: 'Verbale 5A novembre',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/verbale-5a',
    CLASSI: '5A',
    UTENTI: '',
    DATA_CREAZ: '2025-11-10'
  });

  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(
    logger,
    new MateriaRepository(w.db),
    w.templates,
    new AggregatoreDati(w.db)
  ).execute(w.ctx);
  const ordered = w.ctx.get<string[]>('boxHtmlOrdered')!;

  expect(ordered).toHaveLength(1);
  expect(ordered[0]).toContain('Verbale 5A novembre');
  expect(w.ctx.get('shouldSend')).toBe(true);
});

test('RenderBoxesStep: one visible non-empty carenze text box without links keeps delivery eligible', () => {
  const w = wire({ BOX_CFG: JSON.stringify([{ TIPO_BOX: 'carenze' }]) });

  const ordered = runThroughRender(w);

  expect(ordered).toHaveLength(1);
  expect(ordered[0]).toContain('Matematica');
  expect(ordered[0]).not.toContain('href=');
  expect(w.ctx.get('shouldSend')).toBe(true);
});

test('RenderBoxesStep: all rendered boxes empty or invisible suppress delivery', () => {
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'piani_pers_da_inviare' }])
    },
    docenteTarget()
  );

  const ordered = runThroughRender(w);

  expect(ordered).toEqual([]);
  expect(w.ctx.get('shouldSend')).toBe(false);
});

test('RenderBoxesStep resolves real LOG_FOLD folders and sets cartelleFolderIds when BOX_CFG opts in (docente/classe target)', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Row[]) = [
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    }
  ];
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: '[{"TIPO_BOX":"cartelle","DATI_SORGENTE":{"metodo":"cartellePerClasse"}}]'
    },
    docenteTarget(),
    tables
  );
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(
    logger,
    new MateriaRepository(w.db),
    w.templates,
    new AggregatoreDati(w.db)
  ).execute(w.ctx);

  expect(w.ctx.get<string[]>('cartelleFolderIds')).toEqual(['folder1']);
});

test('RenderBoxesStep includes cartellePerClasse folders for every competent target class', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Row[]) = [
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    },
    {
      ID: 'folder2',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 3B',
      PATH: '_ALDO_E2E_OUTPUT/3B',
      LINK: 'https://drive.google.com/drive/folders/folder2',
      CLASSI: '3B',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    }
  ];
  const w = wire(
    {
      PROCESSO: 'PER_COORDINATORE',
      BOX_CFG: '[{"TIPO_BOX":"cartelle","DATI_SORGENTE":{"metodo":"cartellePerClasse"}}]'
    },
    { ...docenteTarget(), classiCompetenza: ['5A', '3B'] },
    tables
  );
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(
    logger,
    new MateriaRepository(w.db),
    w.templates,
    new AggregatoreDati(w.db)
  ).execute(w.ctx);

  expect(w.ctx.get<string[]>('cartelleFolderIds')!.sort()).toEqual(['folder1', 'folder2']);
  expect(w.ctx.get<string[]>('boxHtmlOrdered')!.join('')).toContain('Verbali 5A');
  expect(w.ctx.get<string[]>('boxHtmlOrdered')!.join('')).toContain('Verbali 3B');
});

test('RenderBoxesStep sets cartelleFolderIds to [] when no cartellePerClasse opt-in is configured', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);

  expect(w.ctx.get<string[]>('cartelleFolderIds')).toEqual([]);
});

test('ComposeEmailStep assembles header/saluto/testo/boxes/footer (11 §6)', () => {
  const w = wire();
  runThroughCompose(w);
  const html = w.ctx.get<string>('corpoHtml')!;
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('background-color:#007bff'); // default header colour
  expect(html).toContain('Gentili Genitori');
  expect(html).toContain('per la classe 5A.'); // TESTO with placeholders resolved
  expect(html.indexOf('Carenze')).toBeGreaterThan(-1);
  expect(html).toContain('comunicazione automatica');
  expect(html).toContain('non sarà monitorata'); // NOREPLY warning block
  expect(w.ctx.get('allegati')).toEqual([]);
});

test('ComposeEmailStep appends TESTO_END after the boxes and before the footer', () => {
  const w = wire({ TESTO_END: '<p>Cordiali saluti, la segreteria.</p>' });
  runThroughCompose(w);
  const html = w.ctx.get<string>('corpoHtml')!;
  const boxesIdx = html.indexOf('Carenze');
  const endIdx = html.indexOf('Cordiali saluti, la segreteria.');
  const footerIdx = html.indexOf('comunicazione automatica');
  expect(boxesIdx).toBeGreaterThan(-1);
  expect(endIdx).toBeGreaterThan(boxesIdx);
  expect(footerIdx).toBeGreaterThan(endIdx);
});

test('ComposeEmailStep HTML-escapes raw CDU values interpolated via CONF_MAIL.TESTO_END', () => {
  const w = wire({
    OGGETTO: 'Oggetto statico',
    TESTO_END: '<p>Alunno: {{focus.alunno.anagrafica.nomeCompleto}}</p>'
  });
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  cdu.focus.alunno!.anagrafica.nomeCompleto = '<script>alert(1)</script>';
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    new FakeDriveFacade()
  ).execute(w.ctx);
  const html = w.ctx.get<string>('corpoHtml')!;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('ComposeEmailStep resolves RISPONDI_A to a valid address and SendEmailStep sets it as replyTo', () => {
  const w = wire(
    {
      PROCESSO: 'PER_DOCENTE',
      // PATTERN_ROW's default carenze/assenze boxes render nothing for a classe
      // target (no per-alunno carenza data), which would leave shouldSend false
      // and skip ComposeEmailStep entirely — a static box guarantees content.
      BOX_CFG: JSON.stringify([{ TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Avviso.</p>' }]),
      RISPONDI_A: '{{focus.classe.coordinatori.elenco.0.email}}'
    },
    docenteTarget()
  );
  runThroughCompose(w);
  expect(w.ctx.get<string>('replyTo')).toBe('rossi@school.it'); // 5A's COORD fixture value

  w.ctx.set('destinatariFinali', [{ emails: ['bianchi@school.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBe('rossi@school.it');
});

test('ComposeEmailStep leaves replyTo unset when RISPONDI_A is blank', () => {
  const w = wire();
  runThroughCompose(w);
  expect(w.ctx.get('replyTo')).toBeNull(); // PipelineContext.get default when the key was never set

  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBeUndefined();
});

test('ComposeEmailStep warns and omits replyTo when RISPONDI_A resolves to an invalid address, send still proceeds', () => {
  const w = wire({ RISPONDI_A: '{{focus.alunno.anagrafica.nomeCompleto}}' }); // resolves to a name, not an email
  runThroughRender(w);
  const warnMock = jest.fn();
  const mockLogger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: warnMock,
    error: jest.fn()
  } as unknown as LoggerService;
  new ComposeEmailStep(
    mockLogger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    new FakeDriveFacade()
  ).execute(w.ctx);

  expect(w.ctx.get('replyTo')).toBeNull(); // PipelineContext.get default when the key was never set
  expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('RISPONDI_A'));

  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.replyTo).toBeUndefined();
  expect(gmail.sent).toHaveLength(1);
});

test('ComposeEmailStep HTML-escapes raw CDU values interpolated via CONF_MAIL.TESTO (REVIEW_ALDO.md #2)', () => {
  const w = wire({
    OGGETTO: 'Oggetto statico',
    TESTO_START: '<p>Alunno: {{focus.alunno.anagrafica.nomeCompleto}}</p>'
  });
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  cdu.focus.alunno!.anagrafica.nomeCompleto = '<script>alert(1)</script>';
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    new FakeDriveFacade()
  ).execute(w.ctx);
  const html = w.ctx.get<string>('corpoHtml')!;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('ComposeEmailStep resolves no attachments when no box opts in via DATI_SORGENTE (11 §13 — attachment is opt-in, never silently generates PDFs)', () => {
  const w = wire();
  w.db.table('LOG_DOCS').insert({
    ID: 'doc1',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc2',
    ID_GEN: 'CD1',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  runThroughCompose(w);
  expect(w.ctx.get('allegati')).toEqual([]);
});

test('ComposeEmailStep resolves a static CONF_MAIL.ALLEGATI file without a box or focus class', () => {
  const w = wire({ ALLEGATI: JSON.stringify(['static id/1?']), BOX_CFG: '[]' });
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  delete (w.ctx.get<Cdu>('cdu')!.focus as unknown as Record<string, unknown>)['classe'];
  w.ctx.set('shouldSend', true); // isolate ComposeEmailStep from the empty-body send gate
  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob');

  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
    drive
  ).execute(w.ctx);

  expect(w.ctx.get('allegatiIds')).toEqual(['static id/1?']);
  expect(w.ctx.get('allegati')).toEqual(['blob:static id/1?']);
  expect(w.ctx.get('allegatiLinks')).toEqual([
    'https://drive.google.com/open?id=static%20id%2F1%3F'
  ]);
  expect(getFileBlob).toHaveBeenCalledTimes(1);
  expect(getFileBlob).toHaveBeenCalledWith('static id/1?');
});

test('ComposeEmailStep leaves attachments empty for an empty CONF_MAIL.ALLEGATI cell', () => {
  const w = wire({ ALLEGATI: '' });
  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob');

  runThroughCompose(w, drive);

  expect(w.ctx.get('allegatiIds')).toEqual([]);
  expect(w.ctx.get('allegati')).toEqual([]);
  expect(w.ctx.get('allegatiLinks')).toEqual([]);
  expect(getFileBlob).not.toHaveBeenCalled();
});

test('ComposeEmailStep never attaches documents from DATI_SORGENTE unless BOX_CFG.ALLEGA is explicitly true', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Documenti collegati.</p>',
        DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'VERBALE' } }
      }
    ])
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc1',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });

  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob');
  runThroughCompose(w, drive);

  expect(w.ctx.get('allegati')).toEqual([]);
  expect(w.ctx.get('allegatiIds')).toEqual([]);
  expect(w.ctx.get('allegatiLinks')).toEqual([]);
  expect(getFileBlob).not.toHaveBeenCalled();
});

test('ComposeEmailStep keeps static IDs first and deduplicates them with opted-in class documents', () => {
  const w = wire({
    ALLEGATI: JSON.stringify(['static one', 'shared-id', 'static-two']),
    BOX_CFG: JSON.stringify([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Documenti allegati.</p>',
        ALLEGA: true,
        DATI_SORGENTE: { metodo: 'documentiPerClasse' }
      }
    ])
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'shared-id',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/shared',
    CLASSI: '5A',
    UTENTI: ''
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'dynamic-id',
    ID_GEN: 'CD2',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    LINK: 'https://drive.example/dynamic',
    CLASSI: '5A',
    UTENTI: ''
  });
  const drive = new FakeDriveFacade();
  const getFileBlob = jest.spyOn(drive, 'getFileBlob');

  runThroughCompose(w, drive);

  expect(w.ctx.get('allegatiIds')).toEqual(['static one', 'shared-id', 'static-two', 'dynamic-id']);
  expect(w.ctx.get('allegati')).toEqual([
    'blob:static one',
    'blob:shared-id',
    'blob:static-two',
    'blob:dynamic-id'
  ]);
  expect(w.ctx.get('allegatiLinks')).toEqual([
    'https://drive.google.com/open?id=static%20one',
    'https://drive.google.com/open?id=shared-id',
    'https://drive.google.com/open?id=static-two',
    'https://drive.example/dynamic'
  ]);
  expect(getFileBlob.mock.calls).toEqual([
    ['static one'],
    ['shared-id'],
    ['static-two'],
    ['dynamic-id']
  ]);
});

test('ComposeEmailStep resolves class-attached documents as blobs once a box opts in via DATI_SORGENTE with no narrowing filtri (11 §13)', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Allegati disponibili.</p>',
        ALLEGA: true,
        DATI_SORGENTE: { metodo: 'documentiPerClasse' }
      }
    ])
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc1',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc2',
    ID_GEN: 'CD1',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  runThroughCompose(w);
  expect(w.ctx.get('allegati')).toEqual(['blob:doc1', 'blob:doc2']);
});

test('ComposeEmailStep filters attachments by the documentiPerClasse BOX_CFG entry (11 §13, 14 §2)', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Allegati disponibili.</p>',
        ALLEGA: true,
        DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'PDP' } }
      }
    ])
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc1',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc2',
    ID_GEN: 'CD1',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: ''
  });
  runThroughCompose(w);
  expect(w.ctx.get('allegati')).toEqual(['blob:doc2']);
});

test('ComposeEmailStep honours CONF_MAIL.COLORE_HEADER and omits noReply block when false', () => {
  const w = wire({ COLORE_HEADER: '#112233', NOREPLY: false });
  runThroughCompose(w);
  const html = w.ctx.get<string>('corpoHtml')!;
  expect(html).toContain('background-color:#112233');
  expect(html).not.toContain('non sarà monitorata');
});

// --- Step 5: ResolveRecipientsStep ---

function resolve(w: Wiring): Array<{ emails: string[]; cc?: string[] }> {
  new ResolveRecipientsStep(
    logger,
    w.docenti,
    new ClasseRepository(w.db),
    new AldoTeachingAssignmentResolver(w.db)
  ).execute(w.ctx);
  return w.ctx.get<Array<{ emails: string[]; cc?: string[] }>>('destinatariFinali')!;
}

test('SOLO_TITOLARI keeps the titolare (11 §7)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_TITOLARI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }]);
});

test('SOLO_SUPPLENTI keeps a raw docente target that no longer owns a resolved chair', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_SUPPLENTI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  // Chain on NOW without materia filter: rossi → bianchi (5A,'*') → verdi (5A, ITA matches wildcard query).
  expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }]);
});

test('ENTRAMBI keeps a raw docente target that no longer owns a resolved chair', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }]);
});

test('PER_COORDINATORE stays on its declared recipient and never assignment-routes', () => {
  const w = wire(
    { PROCESSO: 'PER_COORDINATORE', SUPPLENTI: 'SOLO_SUPPLENTI' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'rossi@school.it',
      emails: ['rossi@school.it'],
      classiCompetenza: ['5A']
    }
  );
  w.ctx.set('shouldSend', true);
  const resolveConsiglio = jest.fn();
  const teachingAssignments = {
    resolveMateria: jest.fn(),
    resolveConsiglio
  } as unknown as ITeachingAssignmentResolver;

  new ResolveRecipientsStep(
    logger,
    w.docenti,
    new ClasseRepository(w.db),
    teachingAssignments
  ).execute(w.ctx);

  expect(w.ctx.get('destinatariFinali')).toEqual([{ emails: ['rossi@school.it'] }]);
  expect(resolveConsiglio).not.toHaveBeenCalled();
});

// Titolare/supplente content-mismatch fix: a single content build must never
// fan out to multiple distinct final actors — each actor now gets its own
// EmailTarget (split at enumeration, EmailNotificationService.expandDocenteActors),
// and ResolveRecipientsStep freshness-rechecks only the one actor that target's
// content was built for. These two tests replace the old
// 'PER_DOCENTE routes only assignments owned by its principal logical target',
// which asserted the pre-fix behaviour of one shared content sent to both actors.
test('PER_DOCENTE routes a target to its own actor only, even when the titolare it was split from currently has several active actors', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'bianchi@school.it',
      titolareEmail: 'bianchi@school.it',
      emails: ['bianchi@school.it'],
      classiCompetenza: ['5A'],
      teachingAssignmentTarget: true
    }
  );
  w.ctx.set('shouldSend', true);
  const rossi = Docente.fromData({ EMAIL: 'rossi@school.it', COGNOME: 'ROSSI' });
  const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it', COGNOME: 'BIANCHI' });
  const verdi = Docente.fromData({ EMAIL: 'verdi@school.it', COGNOME: 'VERDI' });
  const assignment = (
    titolare: Docente,
    effettivo: Docente,
    primary: Docente[]
  ): TeachingAssignment => ({
    slot: { materia: MateriaId.of('MATE'), kind: 'MAIN', specifica: null },
    classeId: ClasseId.of('5A'),
    titolareNominale: titolare,
    titolare,
    docenteEffettivo: effettivo,
    delegationChain: [],
    routing: { primary, cc: [], bcc: [] },
    trace: []
  });
  const teachingAssignments = {
    resolveMateria: jest.fn(),
    resolveConsiglio: jest.fn(() => [
      assignment(rossi, bianchi, [rossi, bianchi]),
      assignment(bianchi, verdi, [bianchi, verdi])
    ])
  } as unknown as ITeachingAssignmentResolver;

  new ResolveRecipientsStep(
    logger,
    w.docenti,
    new ClasseRepository(w.db),
    teachingAssignments
  ).execute(w.ctx);

  // Only bianchi — the actor this specific target's content was built for —
  // not verdi, who belongs to a sibling split target of its own.
  expect(w.ctx.get('destinatariFinali')).toEqual([{ emails: ['bianchi@school.it'] }]);
});

test('PER_DOCENTE routes a split sibling target to its own (different) actor when both remain active', () => {
  const w = wire(
    { PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' },
    {
      tipo: 'docente',
      tipoTarget: 'classe',
      target: '5A',
      docenteEmail: 'verdi@school.it',
      titolareEmail: 'bianchi@school.it',
      emails: ['verdi@school.it'],
      classiCompetenza: ['5A'],
      teachingAssignmentTarget: true
    }
  );
  w.ctx.set('shouldSend', true);
  const rossi = Docente.fromData({ EMAIL: 'rossi@school.it', COGNOME: 'ROSSI' });
  const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it', COGNOME: 'BIANCHI' });
  const verdi = Docente.fromData({ EMAIL: 'verdi@school.it', COGNOME: 'VERDI' });
  const assignment = (
    titolare: Docente,
    effettivo: Docente,
    primary: Docente[]
  ): TeachingAssignment => ({
    slot: { materia: MateriaId.of('MATE'), kind: 'MAIN', specifica: null },
    classeId: ClasseId.of('5A'),
    titolareNominale: titolare,
    titolare,
    docenteEffettivo: effettivo,
    delegationChain: [],
    routing: { primary, cc: [], bcc: [] },
    trace: []
  });
  const teachingAssignments = {
    resolveMateria: jest.fn(),
    resolveConsiglio: jest.fn(() => [
      assignment(rossi, bianchi, [rossi, bianchi]),
      assignment(bianchi, verdi, [bianchi, verdi])
    ])
  } as unknown as ITeachingAssignmentResolver;

  new ResolveRecipientsStep(
    logger,
    w.docenti,
    new ClasseRepository(w.db),
    teachingAssignments
  ).execute(w.ctx);

  expect(w.ctx.get('destinatariFinali')).toEqual([{ emails: ['verdi@school.it'] }]);
});

test('genitori/cdc targets are single multi-TO destinations not subject to SUPPLENTI (11 §7/§12)', () => {
  const w = wire({ SUPPLENTI: 'SOLO_SUPPLENTI' });
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['genitore1@x.it'] }]);
});

test('ResolveRecipientsStep passes EmailTarget.cc through for non-docente targets', () => {
  const w = wire(
    {},
    {
      tipo: 'genitori',
      tipoTarget: 'alunno',
      target: 'a1@school.it',
      emails: ['genitore1@x.it'],
      cc: ['coord@x.it'],
      classiCompetenza: []
    }
  );
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
});

// --- Step 6: SendEmailStep ---

function send(w: Wiring, gmail: FakeGmailFacade): void {
  new SendEmailStep(logger, gmail, new MasterSheetRepository(w.db)).execute(w.ctx);
}

test('SendEmailStep sends with supervisore BCC and noReply (11 §6/§8)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent).toHaveLength(1);
  expect(gmail.sent[0]!.to).toEqual(['genitore1@x.it']);
  expect(gmail.sent[0]!.bcc).toEqual(['super@school.it']);
  expect(gmail.sent[0]!.noReply).toBe(true);
  expect(w.ctx.get('sentCount')).toBe(1);
  expect(w.ctx.get('sendErrors')).toEqual([]);
});

test('SendEmailStep forwards Destinazione.cc to the Gmail facade', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.cc).toEqual(['coord@x.it']);
});

test('missing SUPERVISORE_EMAIL ⇒ WARN, send proceeds without BCC (11 §6 nota)', () => {
  const tables = fixtureTables();
  (tables['MASTER']![0] as Row)['SUPERVISORE_EMAIL'] = '';
  const db = new FakeDatabase(tables);
  const ctx = new PipelineContext();
  ctx.set('config', PATTERN_ROW);
  ctx.set('confMail', ConfigurazioneEmail.fromData(PATTERN_ROW));
  ctx.set('emailTarget', genitoriTarget());
  ctx.set('now', NOW);
  ctx.set('shouldSend', true);
  ctx.set('oggettoRisolto', 'S');
  ctx.set('corpoHtml', '<p>x</p>');
  ctx.set('allegati', []);
  ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  new SendEmailStep(logger, gmail, new MasterSheetRepository(db)).execute(ctx);
  expect(gmail.sent[0]!.bcc).toBeUndefined();
  expect(ctx.get('sentCount')).toBe(1);
});

test('test mode redirects every send to the test address (11 §15)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('testEmail', 'tester@x.it');
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }, { emails: ['altro@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent.map((s) => s.to)).toEqual([['tester@x.it'], ['tester@x.it']]);
});

test('test mode suppresses cc so a real coordinatore is never leaked during a preview send (11 §15)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('testEmail', 'tester@x.it');
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.to).toEqual(['tester@x.it']);
  expect(gmail.sent[0]!.cc).toBeUndefined();
});

test('test mode suppresses supervisore BCC too, matching the cc treatment (11 §15)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('testEmail', 'tester@x.it');
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.to).toEqual(['tester@x.it']);
  expect(gmail.sent[0]!.bcc).toBeUndefined();
});

test('normal mode still attaches both supervisore BCC and cc together (11 §6/§15)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'], cc: ['coord@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  expect(gmail.sent[0]!.bcc).toEqual(['super@school.it']);
  expect(gmail.sent[0]!.cc).toEqual(['coord@x.it']);
});

test('send failure is collected, does not break the pipeline (11 §8)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['broken@x.it'] }, { emails: ['ok@x.it'] }]);
  const gmail = new FakeGmailFacade();
  gmail.failFor.add('broken@x.it');
  send(w, gmail);
  expect(w.ctx.get<string[]>('sendErrors')).toHaveLength(1);
  expect(w.ctx.get('sentCount')).toBe(1);
  expect(gmail.sent).toHaveLength(1);
});

test('send failure keeps the operational recipient email in the error log (11 §8)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['broken@x.it'] }]);
  const gmail = new FakeGmailFacade();
  gmail.failFor.add('broken@x.it');
  const errorMock = jest.fn();
  const mockLogger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: errorMock
  } as unknown as LoggerService;
  new SendEmailStep(mockLogger, gmail, new MasterSheetRepository(w.db)).execute(w.ctx);
  expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('broken@x.it'));
  const errorCalls = errorMock.mock.calls.map((args: unknown[]) => args[0] as string);
  expect(errorCalls.some((msg) => msg.includes('[EMAIL_REDACTED]'))).toBe(false);
});

// --- Steps 7-8: LogEmailStep + PostProcessEmailStep ---

test('LogEmailStep records SUCCESS in LOG_MAIL (11 §9)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  const gmail = new FakeGmailFacade();
  send(w, gmail);
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const rows = w.db.tables['LOG_MAIL']!.getAllRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]!['PATTERN']).toBe('TEST_PATTERN');
  expect(rows[0]!['DESTINATARI']).toBe('genitore1@x.it');
  expect(rows[0]!['STATO']).toBe('SUCCESS');
});

test('LogEmailStep records LOG_MAIL.TESTO as HTML-stripped plain text of the composed body (item 5)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  send(w, new FakeGmailFacade());
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const testo = String(row['TESTO']);
  expect(testo).toContain('Si comunica quanto segue per la classe');
  expect(testo).not.toContain('<');
  expect(testo).not.toContain('>');
});

test('LogEmailStep records links to files actually sent as attachments in LOG_MAIL.ALLEGATI.attach (11 §9)', () => {
  const w = wire({
    BOX_CFG: JSON.stringify([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Allegati disponibili.</p>',
        ALLEGA: true,
        DATI_SORGENTE: { metodo: 'documentiPerClasse' }
      }
    ])
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc1',
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: '',
    LINK: 'https://drive/doc1'
  });
  w.db.table('LOG_DOCS').insert({
    ID: 'doc2',
    ID_GEN: 'CD1',
    TIPO: 'PDP',
    STATO: 'GENERATO',
    CLASSI: '5A',
    UTENTI: '',
    LINK: 'https://drive/doc2'
  });
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  send(w, new FakeGmailFacade());
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI'])) as {
    docs: string[];
    attach: string[];
  };
  expect(allegati.docs).toEqual([]);
  expect(allegati.attach).toEqual(['https://drive/doc1', 'https://drive/doc2']);
});

test('LogEmailStep records cartelleFolderIds in LOG_MAIL.ALLEGATI.folders (11 §9)', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  w.ctx.set('sentTo', ['genitore1@x.it']);
  w.ctx.set('sendErrors', []);
  w.ctx.set('corpoHtml', '<p>x</p>');
  w.ctx.set('cartelleFolderIds', ['folder1', 'folder2']);
  const logMail = new LogEmailRepository(w.db);
  new LogEmailStep(logger, logMail).execute(w.ctx);

  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI'])) as { folders?: string[] };
  expect(allegati.folders).toEqual(['folder1', 'folder2']);
});

test('LogEmailStep keeps rendered docs/folders separate from every static attachment link', () => {
  const w = wire();
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  w.ctx.set('sentTo', ['genitore1@x.it']);
  w.ctx.set('sendErrors', []);
  w.ctx.set('corpoHtml', '<p>x</p>');
  w.ctx.set('documentIds', ['body-doc-1']);
  w.ctx.set('cartelleFolderIds', ['body-folder-1']);
  w.ctx.set('allegatiLinks', [
    'https://drive.google.com/open?id=static-doc-1',
    'https://drive.google.com/open?id=static-doc-2'
  ]);
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);

  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI'])) as {
    docs?: string[];
    folders?: string[];
    attach?: string[];
  };
  expect(allegati).toEqual({
    docs: ['body-doc-1'],
    folders: ['body-folder-1'],
    attach: [
      'https://drive.google.com/open?id=static-doc-1',
      'https://drive.google.com/open?id=static-doc-2'
    ],
    logicalTargetId: 'genitori:a1@school.it:1'
  });
});

test('LogEmailStep records ERROR with message when a send failed (11 §9)', () => {
  const w = wire();
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['broken@x.it'] }]);
  const gmail = new FakeGmailFacade();
  gmail.failFor.add('broken@x.it');
  send(w, gmail);
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  expect(row['STATO']).toBe('ERROR');
  expect(String(row['ERRORE'])).toContain('broken@x.it');
});

test('LogEmailStep stores a stable logical target id beside post-routing recipients', () => {
  const w = wire();
  w.ctx.set('shouldSend', true);
  w.ctx.set('sentTo', ['physical-recipient@x.it']);
  w.ctx.set('sendErrors', ['quota']);
  w.ctx.set('corpoHtml', '<p>x</p>');

  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);

  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI'])) as {
    logicalTargetId?: string;
  };
  expect(allegati.logicalTargetId).toBe('genitori:a1@school.it:1');
});

test('logs logicalTargetId for a test-mode delivery', () => {
  const w = wire(
    {},
    {
      ...docenteTarget(),
      docenteEmail: 'docente@school.it',
      emails: ['docente@school.it']
    }
  );
  const registraInvio = jest.fn();
  const logMail = { registraInvio } as unknown as LogEmailRepository;
  w.ctx.set('shouldSend', true);
  w.ctx.set('sentTo', ['tester@school.it']);
  w.ctx.set('sendErrors', []);
  w.ctx.set('corpoHtml', '<p>x</p>');
  w.ctx.set('testEmail', 'tester@school.it');

  new LogEmailStep(logger, logMail).execute(w.ctx);

  expect(registraInvio).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    expect.anything(),
    expect.any(String),
    expect.objectContaining({ logicalTargetId: 'docente:docente@school.it', testMode: true }),
    undefined
  );
});

test('PostProcessEmailStep stamps CARENZE.NOTIFICATO only after a successful send (11 §10)', () => {
  const post = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: {
        STUDENTE: '{{focus.carenza.studente}}',
        PROGRESSIVO: '{{focus.carenza.progressivo}}'
      }
    }
  ]);
  const w = wire({ PROCESSO: 'PER_CARENZA_GENITORI', POST_PROCESSO: post });
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  send(w, new FakeGmailFacade());
  const savedBefore = w.db.saved;
  new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);
  const hit = w.db.tables['CARENZE']!.getAllRows().find(
    (r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1
  )!;
  expect(String(hit['NOTIFICATO'])).toBe(NOW.toISOString());
  expect(w.db.saved).toBe(savedBefore + 1); // explicit save (11 §10)
});

test('PostProcessEmailStep is skipped when nothing was sent (11 §10)', () => {
  const post = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: '{{focus.carenza.studente}}' }
    }
  ]);
  const w = wire({ PROCESSO: 'PER_CARENZA_GENITORI', POST_PROCESSO: post });
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['broken@x.it'] }]);
  const gmail = new FakeGmailFacade();
  gmail.failFor.add('broken@x.it');
  send(w, gmail);
  new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);
  const carenza = w.db.tables['CARENZE']!.getAllRows().find(
    (r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1
  )!;
  expect(carenza['NOTIFICATO']).toBe(''); // untouched
});

// --- A18: remaining uncovered branches ---

describe('emailSteps — remaining uncovered branches (A18)', () => {
  // --- Step 1: BuildCDUStep ---

  test('BuildCDUStep omits idConfigurazione when the CONF_MAIL row has no ID', () => {
    const w = wire({ ID: null });
    const builder = composeContextBuilder(w.db);
    const buildSpy = jest.spyOn(builder, 'build');
    new BuildCDUStep(
      logger,
      builder,
      w.docenti,
      w.alunni,
      new ClasseRepository(w.db),
      new MateriaRepository(w.db),
      new AldoTeachingAssignmentResolver(w.db)
    ).execute(w.ctx);
    const params = buildSpy.mock.calls[0]![0] as { idConfigurazione?: string };
    expect(params.idConfigurazione).toBeUndefined();
  });

  test('BuildCDUStep falls back to "" for docente.id when the injected docente lookup returns a Docente with no id', () => {
    const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
    const docentiStub = { findById: () => Docente.fromData({}) } as unknown as DocenteRepository;
    new BuildCDUStep(
      logger,
      composeContextBuilder(w.db),
      docentiStub,
      w.alunni,
      new ClasseRepository(w.db),
      new MateriaRepository(w.db),
      new AldoTeachingAssignmentResolver(w.db)
    ).execute(w.ctx);
    const cdu = w.ctx.get<Cdu>('cdu')!;
    expect(cdu.destinatario?.anagrafica.email).toBe('');
  });

  test('BuildCDUStep falls back to "" for alunno.id when tipo is alunno and the alunno lookup returns one with no id', () => {
    const w = wire(
      { PROCESSO: 'PER_ALUNNO' },
      {
        tipo: 'alunno',
        tipoTarget: 'alunno',
        target: 'a1@school.it',
        emails: ['a1@school.it'],
        classiCompetenza: []
      }
    );
    const alunniStub = {
      findById: () => Alunno.fromData({ ATTIVO: true })
    } as unknown as AlunnoRepository;
    new BuildCDUStep(
      logger,
      composeContextBuilder(w.db),
      w.docenti,
      alunniStub,
      new ClasseRepository(w.db),
      new MateriaRepository(w.db),
      new AldoTeachingAssignmentResolver(w.db)
    ).execute(w.ctx);
    const cdu = w.ctx.get<Cdu>('cdu')!;
    expect(cdu.destinatario?.anagrafica.email).toBe('');
  });

  test('BuildCDUStep uses the real alunno id when tipo is alunno and the alunno is found', () => {
    const w = wire(
      { PROCESSO: 'PER_ALUNNO' },
      {
        tipo: 'alunno',
        tipoTarget: 'alunno',
        target: 'a1@school.it',
        emails: ['a1@school.it'],
        classiCompetenza: []
      }
    );
    buildStep(w).execute(w.ctx);
    const cdu = w.ctx.get<Cdu>('cdu')!;
    expect(cdu.destinatario?.anagrafica.email).toBe('a1@school.it');
  });

  test('BuildCDUStep falls back to "" for destinatario email when the target has no emails at all', () => {
    const w = wire(
      { PROCESSO: 'PER_GENITORI_ALUNNO' },
      {
        tipo: 'genitori',
        tipoTarget: 'alunno',
        target: 'a1@school.it',
        emails: [],
        classiCompetenza: []
      }
    );
    buildStep(w).execute(w.ctx);
    const cdu = w.ctx.get<Cdu>('cdu')!;
    expect(cdu.destinatario?.anagrafica.email).toBe('');
  });

  // --- Steps 3-4: RenderBoxesStep + ComposeEmailStep ---

  test('RenderBoxesStep leaves the CDU untouched when destinatario is undefined', () => {
    const w = wire();
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
    const built = w.ctx.get<Cdu>('cdu')!;
    delete (built as unknown as Record<string, unknown>)['destinatario'];
    new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
    expect(w.ctx.get('oggettoRisolto')).toBe('Carenze di VERDI ANNA');
    expect((built as unknown as Record<string, unknown>)['destinatario']).toBeUndefined();
  });

  test('ComposeEmailStep skips writing render.body / destinatario.testoContenutoPuro when those CDU fields are undefined, and defaults saluto', () => {
    const w = wire();
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
    new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
    const built = w.ctx.get<Cdu>('cdu')! as unknown as Record<string, unknown>;
    delete built['render'];
    delete built['destinatario'];
    new ComposeEmailStep(
      logger,
      w.templates,
      new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
      new FakeDriveFacade()
    ).execute(w.ctx);
    const html = w.ctx.get<string>('corpoHtml')!;
    expect(html).toContain('Gentile Utente'); // default saluto (line 227)
    expect(built['render']).toBeUndefined();
    expect(built['destinatario']).toBeUndefined();
  });

  test('ComposeEmailStep resolves no attachments when the CDU has no classe in focus', () => {
    const w = wire();
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
    new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
    const built = w.ctx.get<Cdu>('cdu')!;
    delete (built.focus as unknown as Record<string, unknown>)['classe'];
    new ComposeEmailStep(
      logger,
      w.templates,
      new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
      new FakeDriveFacade()
    ).execute(w.ctx);
    expect(w.ctx.get('allegati')).toEqual([]);
  });

  test('ComposeEmailStep ignores a class document with no Drive file ID', () => {
    const w = wire({
      BOX_CFG: JSON.stringify([
        {
          TIPO_BOX: 'testo_dinamico',
          CONTENUTO: '<p>Allegati disponibili.</p>',
          ALLEGA: true,
          DATI_SORGENTE: { metodo: 'documentiPerClasse' }
        }
      ])
    });
    w.db
      .table('LOG_DOCS')
      .insert({ ID_GEN: 'CD1', TIPO: 'VERBALE', STATO: 'GENERATO', CLASSI: '5A', UTENTI: '' }); // no ID
    const drive = new FakeDriveFacade();
    const getFileBlob = jest.spyOn(drive, 'getFileBlob');

    runThroughCompose(w, drive);

    expect(w.ctx.get('allegatiIds')).toEqual([]);
    expect(w.ctx.get('allegati')).toEqual([]);
    expect(w.ctx.get('allegatiLinks')).toEqual([]);
    expect(getFileBlob).not.toHaveBeenCalled();
  });

  test('ComposeEmailStep filters attachments by BOX_CFG stato as well as tipo (11 §13, 14 §2)', () => {
    const w = wire({
      BOX_CFG: JSON.stringify([
        {
          TIPO_BOX: 'testo_dinamico',
          CONTENUTO: '<p>Allegati disponibili.</p>',
          ALLEGA: true,
          DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { stato: 'NOTIFICATO' } }
        }
      ])
    });
    w.db.table('LOG_DOCS').insert({
      ID: 'doc1',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      CLASSI: '5A',
      UTENTI: ''
    });
    w.db.table('LOG_DOCS').insert({
      ID: 'doc2',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      STATO: 'NOTIFICATO',
      CLASSI: '5A',
      UTENTI: ''
    });
    runThroughCompose(w);
    expect(w.ctx.get('allegati')).toEqual(['blob:doc2']);
  });

  test('ComposeEmailStep defaults the header title to "" when oggettoRisolto was set but left undefined', () => {
    const w = wire();
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
    w.ctx.set('oggettoRisolto', undefined);
    new ComposeEmailStep(
      logger,
      w.templates,
      new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
      new FakeDriveFacade()
    ).execute(w.ctx);
    const html = w.ctx.get<string>('corpoHtml')!;
    expect(html).not.toContain('undefined');
    expect(html).toContain('font-weight:bold;"></div>'); // empty header title
  });

  test('ComposeEmailStep defaults to no boxes when boxHtmlOrdered was never set', () => {
    const w = wire();
    buildStep(w).execute(w.ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
    w.ctx.set('oggettoRisolto', 'S'); // normally set by RenderBoxesStep, which we deliberately skip here
    new ComposeEmailStep(
      logger,
      w.templates,
      new LogDocumentoRepository(w.db, new LazyRef(() => new ClasseRepository(w.db))),
      new FakeDriveFacade()
    ).execute(w.ctx);
    const html = w.ctx.get<string>('corpoHtml')!;
    expect(html).toContain('per la classe 5A.'); // TESTO still rendered; no box HTML appended
  });

  // --- Step 5: ResolveRecipientsStep ---

  test('ResolveRecipientsStep falls back to the raw target emails when the docente target has no docenteEmail', () => {
    const w = wire(
      { PROCESSO: 'PER_DOCENTE' },
      {
        tipo: 'docente',
        tipoTarget: 'classe',
        target: '5A',
        teachingAssignmentTarget: true,
        emails: ['ghost@school.it'],
        classiCompetenza: []
      }
    );
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    expect(resolve(w)).toEqual([{ emails: ['ghost@school.it'] }]);
  });

  test("ResolveRecipientsStep falls back to the raw target emails when its actor no longer exists in DocenteRepository (titolare/supplente content-mismatch fix: routing now matches on the target's own docenteEmail/titolareEmail rather than a re-looked-up id)", () => {
    const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_TITOLARI' }, docenteTarget());
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    const docentiStub = { findById: () => null } as unknown as DocenteRepository;
    new ResolveRecipientsStep(
      logger,
      docentiStub,
      new ClasseRepository(w.db),
      new AldoTeachingAssignmentResolver(w.db)
    ).execute(w.ctx);
    expect(w.ctx.get('destinatariFinali')).toEqual([{ emails: ['rossi@school.it'] }]);
  });

  test('ENTRAMBI does not assignment-route a coordinator with multiple competence classes', () => {
    const w = wire(
      { PROCESSO: 'PER_COORDINATORE', SUPPLENTI: 'ENTRAMBI' },
      {
        tipo: 'docente',
        tipoTarget: 'classe',
        target: '5A',
        docenteEmail: 'rossi@school.it',
        emails: ['rossi@school.it'],
        classiCompetenza: ['5A', '9Z']
      }
    );
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }]);
  });

  test('SOLO_SUPPLENTI also keeps a coordinator on the declared recipient', () => {
    const w = wire(
      { PROCESSO: 'PER_COORDINATORE', SUPPLENTI: 'SOLO_SUPPLENTI' },
      {
        tipo: 'docente',
        tipoTarget: 'classe',
        target: '5A',
        docenteEmail: 'rossi@school.it',
        emails: ['rossi@school.it'],
        classiCompetenza: ['5A', '9Z']
      }
    );
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    expect(
      resolve(w)
        .map((r) => r.emails[0])
        .sort()
    ).toEqual(['rossi@school.it']);
  });

  // --- Step 6: SendEmailStep ---

  test('SendEmailStep defaults to no attachments when "allegati" was never set', () => {
    const w = wire();
    w.ctx.set('shouldSend', true);
    w.ctx.set('oggettoRisolto', 'S');
    w.ctx.set('corpoHtml', '<p>x</p>');
    w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
    const gmail = new FakeGmailFacade();
    send(w, gmail);
    expect(gmail.sent[0]!.attachments).toEqual([]);
  });

  test('SendEmailStep defaults subject/body to "" when they were set but left undefined', () => {
    const w = wire();
    w.ctx.set('shouldSend', true);
    w.ctx.set('oggettoRisolto', undefined);
    w.ctx.set('corpoHtml', undefined);
    w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
    const gmail = new FakeGmailFacade();
    send(w, gmail);
    expect(gmail.sent[0]!.subject).toBe('');
    expect(gmail.sent[0]!.htmlBody).toBe('');
  });

  test('SendEmailStep uses the default error message when the gmail facade omits result.error', () => {
    const w = wire();
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [{ emails: ['x@y.it'] }]);
    const gmail = { sendEmail: () => ({ success: false }) } as unknown as FakeGmailFacade;
    send(w, gmail);
    expect(w.ctx.get<string[]>('sendErrors')).toEqual(['errore di invio sconosciuto']);
  });

  // --- Step 7: LogEmailStep ---

  test('LogEmailStep defaults errors/allegatiIds to [] when they were never set', () => {
    const w = wire();
    w.ctx.set('shouldSend', true);
    w.ctx.set('sentTo', ['x@y.it']);
    new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
    const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
    expect(row['STATO']).toBe('SUCCESS');
    const allegati = JSON.parse(String(row['ALLEGATI'])) as { docs: string[]; folders: string[] };
    expect(allegati.docs).toEqual([]);
  });

  test('LogEmailStep defaults destinatari to [] when "sentTo" was set but left undefined', () => {
    const w = wire();
    w.ctx.set('shouldSend', true);
    w.ctx.set('sentTo', undefined);
    new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
    const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
    expect(row['DESTINATARI']).toBe('');
  });

  // --- Step 8: PostProcessEmailStep ---

  test('PostProcessEmailStep is skipped when POST_PROCESSO is not configured, even after a successful send (11 §10)', () => {
    const w = wire(); // default fixture: POST_PROCESSO null
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
    send(w, new FakeGmailFacade());
    const savedBefore = w.db.saved;
    new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);
    expect(w.db.saved).toBe(savedBefore); // no explicit save — step was gated off
  });

  test("PostProcessEmailStep is skipped when POST_PROCESSO is an empty string (regression: blank Sheets cells round-trip as '', not null)", () => {
    const w = wire({ POST_PROCESSO: '' });
    runThroughCompose(w);
    w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
    send(w, new FakeGmailFacade());
    const savedBefore = w.db.saved;
    expect(() => new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx)).not.toThrow();
    expect(w.db.saved).toBe(savedBefore);
  });

  test('PostProcessEmailStep condition defaults sentCount to 0 when it was never set (SendEmailStep skipped)', () => {
    const post = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'CARENZE',
        col: 'NOTIFICATO',
        criteri: { STUDENTE: '{{focus.carenza.studente}}' }
      }
    ]);
    const w = wire({ PROCESSO: 'PER_CARENZA_GENITORI', POST_PROCESSO: post });
    runThroughCompose(w);
    w.ctx.set('shouldSend', true); // SendEmailStep deliberately never run: sentCount stays unset
    const savedBefore = w.db.saved;
    new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);
    expect(w.db.saved).toBe(savedBefore); // gated off: (undefined ?? 0) > 0 is false
  });
});

describe('CheckAlreadySentStep', () => {
  // docenteTarget() (declared earlier in this file) needs PROCESSO: 'PER_DOCENTE' —
  // see the existing usages at email-steps.test.ts:357/372/381 for the same pairing.
  function ctxAfterCondizioni(
    overrides: Partial<Record<string, unknown>> = {},
    target: EmailTarget = docenteTarget()
  ) {
    const { db, ctx, docenti, alunni } = wire({ PROCESSO: 'PER_DOCENTE', ...overrides }, target);
    new BuildCDUStep(
      logger,
      composeContextBuilder(
        db,
        new MasterSheetRepository(db),
        new AldoTeachingAssignmentResolver(db)
      ),
      docenti,
      alunni,
      new ClasseRepository(db),
      new MateriaRepository(db),
      new AldoTeachingAssignmentResolver(db)
    ).execute(ctx);
    new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(ctx);
    return { db, ctx };
  }

  test('an empty successful-identity set leaves shouldSend true', () => {
    const { ctx } = ctxAfterCondizioni();
    ctx.set('successfulLogicalTargetIds', new Set<string>());

    const result = new CheckAlreadySentStep(logger).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
    expect(logDetails(result)).toBe('Not already sent');
  });

  test('a matching successful logical target id blocks the resend', () => {
    const target = docenteTarget();
    const { ctx } = ctxAfterCondizioni({}, target);
    ctx.set('successfulLogicalTargetIds', new Set([emailTargetId(target)]));

    const result = new CheckAlreadySentStep(logger).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(false);
    expect(ctx.get('skipReason')).toContain('TEST_PATTERN');
    expect(logDetails(result)).toBe(ctx.get('skipReason'));
  });

  test('a different successful logical target id does not block the resend', () => {
    const { ctx } = ctxAfterCondizioni();
    ctx.set('successfulLogicalTargetIds', new Set(['docente:someone.else@school.it']));

    new CheckAlreadySentStep(logger).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
  });

  test('DUPLICAZIONE PERMESSA bypasses a matching successful identity', () => {
    const target = docenteTarget();
    const { ctx } = ctxAfterCondizioni({ DUPLICAZIONE: 'PERMESSA' }, target);
    ctx.set('successfulLogicalTargetIds', new Set([emailTargetId(target)]));

    const result = new CheckAlreadySentStep(logger).execute(ctx);

    expect(ctx.get('shouldSend')).toBe(true);
    expect(logDetails(result)).toBe('Duplicates allowed');
  });
});
