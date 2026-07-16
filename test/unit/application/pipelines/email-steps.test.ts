import {
  BuildCDUStep,
  ValutaCondizioniInvioStep,
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
import { ContextEngineFactory } from '../../../../src/application/context-engine/ContextEngineFactory';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import type { EmailTarget } from '../../../../src/application/email/saluto';
import { ExpressionEngineFacade } from '../../../../src/infrastructure/facades/ExpressionEngineFacade';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';

import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { SupplenzaRepository } from '../../../../src/infrastructure/repositories/SupplenzaRepository';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { LogEmailRepository } from '../../../../src/infrastructure/repositories/LogEmailRepository';
import { LogDocumentoRepository } from '../../../../src/infrastructure/repositories/LogDocumentoRepository';
import { FakeDatabase } from '../../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../../test/fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../../../../test/fakes/FakeDriveFacade';
import type { Row } from '../../../../src/infrastructure/db/Database';

const logger = new LoggerService();
const NOW = new Date('2025-11-15T09:00:00Z'); // inside the rossi→bianchi supplenza window

const PATTERN_ROW: Row = {
  ID: 'TEST_PATTERN',
  OGGETTO: 'Carenze di {{focus.alunno.anagrafica.nomeCompleto}}',
  PROCESSO: 'PER_GENITORI_ALUNNO',
  BOX_CFG: '[{"TIPO_BOX":"carenze","TITOLO":"Carenze"},{"TIPO_BOX":"assenze","ORDINE":5}]',
  TESTO: '<p>Si comunica quanto segue per la classe {{focus.alunno.classe.nome}}.</p>',
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
    classiCompetenza: []
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
  target: EmailTarget = genitoriTarget()
): Wiring {
  const db = new FakeDatabase(fixtureTables());
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

function buildStep(w: Wiring): BuildCDUStep {
  return new BuildCDUStep(logger, ContextEngineFactory.create(w.db), w.docenti, w.alunni);
}

function runThroughCompose(w: Wiring): void {
  buildStep(w).execute(w.ctx);
  new ValutaCondizioniInvioStep(logger, new ExpressionEngineFacade()).execute(w.ctx);
  new RenderBoxesStep(logger, new MateriaRepository(w.db), w.templates).execute(w.ctx);
  new ComposeEmailStep(
    logger,
    w.templates,
    new LogDocumentoRepository(w.db),
    new FakeDriveFacade()
  ).execute(w.ctx);
}

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
  expect(d.anagrafica.nomeCompleto).toBe('ROSSI MARIO');
  expect(d.anagrafica.appellativo).toBe('Prof.');
  expect(d.comunicazione.salutoIniziale).toBe('Gentile Prof. ROSSI MARIO');
});

test('BuildCDUStep PER_CARENZA uses CARENZA_COMPLETO and sets carenza focus (11 §3, 02 §4.3)', () => {
  const w = wire({ PROCESSO: 'PER_CARENZA' });
  buildStep(w).execute(w.ctx);
  const cdu = w.ctx.get<Cdu>('cdu')!;
  expect(cdu.focus.carenza?.progressivo).toBe(1);
  expect(cdu.focus.carenza?.hasAssenze).toBe(true);
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

test('ComposeEmailStep resolves class-attached documents as blobs (11 §13)', () => {
  const w = wire();
  w.db
    .table('LOG_DOCS')
    .insert({
      ID: 'doc1',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      CLASSI: '5A',
      UTENTI: ''
    });
  w.db
    .table('LOG_DOCS')
    .insert({
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
        CONTENUTO: '',
        DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'PDP' } }
      }
    ])
  });
  w.db
    .table('LOG_DOCS')
    .insert({
      ID: 'doc1',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      CLASSI: '5A',
      UTENTI: ''
    });
  w.db
    .table('LOG_DOCS')
    .insert({
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

function resolve(w: Wiring): Array<{ emails: string[] }> {
  new ResolveRecipientsStep(logger, w.docenti, new SupplenzaRepository(w.db)).execute(w.ctx);
  return w.ctx.get<Array<{ emails: string[] }>>('destinatariFinali')!;
}

test('SOLO_TITOLARI keeps the titolare (11 §7)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_TITOLARI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }]);
});

test('SOLO_SUPPLENTI routes to the chain-resolved supplente (11 §7)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_SUPPLENTI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  // Chain on NOW without materia filter: rossi → bianchi (5A,'*') → verdi (5A, ITA matches wildcard query).
  expect(resolve(w)).toEqual([{ emails: ['verdi@school.it'] }]);
});

test('ENTRAMBI addresses titolare and supplente as separate sends (11 §7)', () => {
  const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'ENTRAMBI' }, docenteTarget());
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }, { emails: ['verdi@school.it'] }]);
});

test('genitori/cdc targets are single multi-TO destinations not subject to SUPPLENTI (11 §7/§12)', () => {
  const w = wire({ SUPPLENTI: 'SOLO_SUPPLENTI' });
  buildStep(w).execute(w.ctx);
  w.ctx.set('shouldSend', true);
  expect(resolve(w)).toEqual([{ emails: ['genitore1@x.it'] }]);
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

test('send failure redacts the recipient email in the error log (11 §8)', () => {
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
  expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('[EMAIL_REDACTED]'));
  const errorCalls = errorMock.mock.calls.map((args: unknown[]) => args[0] as string);
  expect(errorCalls.some((msg) => msg.includes('@'))).toBe(false);
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

test('LogEmailStep records the sent attachment doc IDs in LOG_MAIL.ALLEGATI (11 §9)', () => {
  const w = wire();
  w.db
    .table('LOG_DOCS')
    .insert({
      ID: 'doc1',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      CLASSI: '5A',
      UTENTI: ''
    });
  w.db
    .table('LOG_DOCS')
    .insert({
      ID: 'doc2',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      STATO: 'GENERATO',
      CLASSI: '5A',
      UTENTI: ''
    });
  runThroughCompose(w);
  w.ctx.set('destinatariFinali', [{ emails: ['genitore1@x.it'] }]);
  send(w, new FakeGmailFacade());
  new LogEmailStep(logger, new LogEmailRepository(w.db)).execute(w.ctx);
  const row = w.db.tables['LOG_MAIL']!.getAllRows()[0]!;
  const allegati = JSON.parse(String(row['ALLEGATI'])) as { docs: string[]; folders: string[] };
  expect(allegati.docs).toEqual(['doc1', 'doc2']);
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
  const w = wire({ PROCESSO: 'PER_CARENZA', POST_PROCESSO: post });
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
  const w = wire({ PROCESSO: 'PER_CARENZA', POST_PROCESSO: post });
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
    const builder = ContextEngineFactory.create(w.db);
    const buildSpy = jest.spyOn(builder, 'build');
    new BuildCDUStep(logger, builder, w.docenti, w.alunni).execute(w.ctx);
    const params = buildSpy.mock.calls[0]![0] as { idConfigurazione?: string };
    expect(params.idConfigurazione).toBeUndefined();
  });

  test('BuildCDUStep falls back to "" for docente.id when the injected docente lookup returns a Docente with no id', () => {
    const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
    const docentiStub = { findById: () => Docente.fromData({}) } as unknown as DocenteRepository;
    new BuildCDUStep(logger, ContextEngineFactory.create(w.db), docentiStub, w.alunni).execute(
      w.ctx
    );
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
    new BuildCDUStep(logger, ContextEngineFactory.create(w.db), w.docenti, alunniStub).execute(
      w.ctx
    );
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
      new LogDocumentoRepository(w.db),
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
      new LogDocumentoRepository(w.db),
      new FakeDriveFacade()
    ).execute(w.ctx);
    expect(w.ctx.get('allegati')).toEqual([]);
  });

  test('ComposeEmailStep falls back to "" for a document id and still requests its blob (11 §13)', () => {
    const w = wire();
    w.db
      .table('LOG_DOCS')
      .insert({ ID_GEN: 'CD1', TIPO: 'VERBALE', STATO: 'GENERATO', CLASSI: '5A', UTENTI: '' }); // no ID
    runThroughCompose(w);
    expect(w.ctx.get('allegati')).toEqual(['blob:']);
  });

  test('ComposeEmailStep filters attachments by BOX_CFG stato as well as tipo (11 §13, 14 §2)', () => {
    const w = wire({
      BOX_CFG: JSON.stringify([
        {
          TIPO_BOX: 'testo_dinamico',
          CONTENUTO: '',
          DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { stato: 'NOTIFICATO' } }
        }
      ])
    });
    w.db
      .table('LOG_DOCS')
      .insert({
        ID: 'doc1',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        STATO: 'GENERATO',
        CLASSI: '5A',
        UTENTI: ''
      });
    w.db
      .table('LOG_DOCS')
      .insert({
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
      new LogDocumentoRepository(w.db),
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
      new LogDocumentoRepository(w.db),
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
        emails: ['ghost@school.it'],
        classiCompetenza: []
      }
    );
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    expect(resolve(w)).toEqual([{ emails: ['ghost@school.it'] }]);
  });

  test('ResolveRecipientsStep falls back to "" for titolare.id when the docente lookup returns a Docente with no id', () => {
    const w = wire({ PROCESSO: 'PER_DOCENTE', SUPPLENTI: 'SOLO_TITOLARI' }, docenteTarget());
    buildStep(w).execute(w.ctx);
    w.ctx.set('shouldSend', true);
    const docentiStub = { findById: () => Docente.fromData({}) } as unknown as DocenteRepository;
    new ResolveRecipientsStep(logger, docentiStub, new SupplenzaRepository(w.db)).execute(w.ctx);
    expect(w.ctx.get('destinatariFinali')).toEqual([{ emails: [''] }]);
  });

  test('ENTRAMBI resolves per-competenza-classe, falling back to null for a class with no active supplenza (11 §7/§12)', () => {
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
    // 5A: rossi -> bianchi -> verdi (full delegation chain, as in the SOLO_SUPPLENTI test below);
    // 9Z: no supplenza row at all -> null, dropped from `supplenti`.
    expect(resolve(w)).toEqual([{ emails: ['rossi@school.it'] }, { emails: ['verdi@school.it'] }]);
  });

  test('SOLO_SUPPLENTI falls back to the titolare for a competenza class with no active supplenza (11 §7)', () => {
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
    // 5A chain resolves to verdi (as the existing SOLO_SUPPLENTI test shows); 9Z has none -> titolare.
    expect(
      resolve(w)
        .map((r) => r.emails[0])
        .sort()
    ).toEqual(['rossi@school.it', 'verdi@school.it']);
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

  test('PostProcessEmailStep condition defaults sentCount to 0 when it was never set (SendEmailStep skipped)', () => {
    const post = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'CARENZE',
        col: 'NOTIFICATO',
        criteri: { STUDENTE: '{{focus.carenza.studente}}' }
      }
    ]);
    const w = wire({ PROCESSO: 'PER_CARENZA', POST_PROCESSO: post });
    runThroughCompose(w);
    w.ctx.set('shouldSend', true); // SendEmailStep deliberately never run: sentCount stays unset
    const savedBefore = w.db.saved;
    new PostProcessEmailStep(logger, w.db, w.templates).execute(w.ctx);
    expect(w.db.saved).toBe(savedBefore); // gated off: (undefined ?? 0) > 0 is false
  });
});
