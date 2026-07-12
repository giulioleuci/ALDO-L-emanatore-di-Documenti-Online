import { EmailNotificationService, type EmailNotificationDeps } from '../../../src/application/services/EmailNotificationService';
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
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { ConfigurazioneEmailRepository } from '../../../src/infrastructure/repositories/ConfigurazioneEmailRepository';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { PipelineError } from '../../../src/domain/errors/DomainError';

const NOW = new Date('2026-07-01T09:00:00Z'); // outside every supplenza window

function wire(extraConfMail: Row[] = []) {
  const tables = fixtureTables();
  tables['CONF_MAIL'] = [...tables['CONF_MAIL']!, ...extraConfMail];
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const service = EmailNotificationService.create(db, gmail, new FakeTemplateEngine(), NOW, new FakeDriveFacade());
  return { db, gmail, service };
}

function conf(processo: string, overrides: Record<string, unknown> = {}): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    ID: 'X', OGGETTO: 'S', PROCESSO: processo, BOX_CFG: null, TESTO: '', SUPPLENTI: 'SOLO_TITOLARI',
    NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: null, POST_PROCESSO: null, ...overrides
  });
}

/** Full EmailNotificationDeps wiring over a real db, with per-test overrides (deps-injection seam for A17). */
function fullDeps(db: FakeDatabase, gmail: FakeGmailFacade, overrides: Partial<EmailNotificationDeps> = {}): EmailNotificationDeps {
  return {
    db,
    gmail,
    drive: new FakeDriveFacade(),
    templates: new FakeTemplateEngine(),
    now: NOW,
    contextBuilder: ContextEngineFactory.create(db),
    expressionEngine: new ExpressionEngineFacade(),
    docenti: new DocenteRepository(db),
    alunni: new AlunnoRepository(db),
    classi: new ClasseRepository(db),
    carenze: new CarenzaRepository(db),
    confMail: new ConfigurazioneEmailRepository(db),
    logMail: new LogEmailRepository(db),
    logDocs: new LogDocumentoRepository(db),
    master: new MasterSheetRepository(db),
    supplenze: new SupplenzaRepository(db),
    materie: new MateriaRepository(db),
    ...overrides
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

test('PER_DOCENTE: one target per docente with at least one active class (articulated group merged)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_DOCENTE'));
  const emails = targets.map((t) => t.docenteEmail).sort();
  expect(emails).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);
});

test('PER_CDC: one multi-TO target per entry class (parent aggregates the articulated group, 05 §5)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CDC'));
  expect(targets.map((t) => t.target).sort()).toEqual(['1F', '5A']);
  const t5a = targets.find((t) => t.target === '5A')!;
  expect(t5a.tipo).toBe('cdc');
  expect(t5a.emails.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
  const t1f = targets.find((t) => t.target === '1F')!;
  expect(t1f.emails.sort()).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);
});

test('PER_ALUNNO: one target per active student', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_ALUNNO'));
  expect(targets).toHaveLength(1);
  expect(targets[0]!).toMatchObject({ tipo: 'alunno', tipoTarget: 'alunno', target: 'a1@school.it', emails: ['a1@school.it'] });
});

test('PER_GENITORI_ALUNNO: one target per family (tutors multi-TO)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_GENITORI_ALUNNO'));
  expect(targets).toHaveLength(1);
  expect(targets[0]!).toMatchObject({ tipo: 'genitori', target: 'a1@school.it', emails: ['genitore1@x.it'] });
});

test('PER_CARENZA: one target per non-notified CARENZE row; tutors first, alunno fallback (11 §3)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA'));
  expect(targets).toHaveLength(2); // a1 prog 1 + a2 prog 1 (prog 2 already notified)
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.carenzaProgressivo).toBe(1);
  expect(a1.emails).toEqual(['genitore1@x.it']);
  const a2 = targets.find((t) => t.target === 'a2@school.it')!;
  expect(a2.emails.sort()).toEqual(['genitore2@x.it', 'genitore3@x.it']);
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

test('sendPattern PER_CARENZA stamps NOTIFICATO so a second run sends nothing (11 §10)', () => {
  const { service, gmail, db } = wire();
  const first = service.sendPattern('CARENZE_NOTIFICA');
  expect(first.targets).toBe(2);
  expect(first.sent).toBe(2);
  const nonNotificate = db.tables['CARENZE']!.getAllRows().filter((r) => String(r['NOTIFICATO'] ?? '') === '');
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
  const states = db.tables['LOG_MAIL']!.getAllRows().map((r) => r['STATO']).sort();
  expect(states).toEqual(['ERROR', 'SUCCESS']);
  // The failed carenza stays non-notified (post-process gated on success).
  const a1 = db.tables['CARENZE']!.getAllRows().find((r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1)!;
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
      fullDeps(db, gmail, { confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository })
    );
    expect(() => service.sendPattern('CDC_OTTOBRE')).toThrow(PipelineError);
  });

  test('sendPattern skips (does not send) when CONDIZIONE evaluates false', () => {
    const { service, gmail } = wire([
      { ID: 'CDC_NEVER', OGGETTO: 'X', PROCESSO: 'PER_CDC', BOX_CFG: null, TESTO: '', SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: 'false', POST_PROCESSO: null }
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
        contextBuilder: { build: () => { throw new Error('boom'); } } as unknown as ContextBuilder
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
      service.sendToTarget('NOPE', { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['x@y.it'], classiCompetenza: ['5A'] })
    ).toThrow(PipelineError);
  });

  test('sendToTarget throws via the confMail defensive re-check when findById cannot resolve an existing row', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository })
    );
    expect(() =>
      service.sendToTarget('CDC_OTTOBRE', { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['rossi@school.it'], classiCompetenza: ['5A'] })
    ).toThrow(PipelineError);
  });

  test('sendToTarget returns skipped:true and no sent/errors when CONDIZIONE gates the send', () => {
    const { service } = wire([
      { ID: 'CDC_NEVER', OGGETTO: 'X', PROCESSO: 'PER_CDC', BOX_CFG: null, TESTO: '', SUPPLENTI: 'SOLO_TITOLARI',
        NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: 'false', POST_PROCESSO: null }
    ]);
    const result = service.sendToTarget('CDC_NEVER', { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['rossi@school.it'], classiCompetenza: ['5A'] });
    expect(result).toEqual({ sent: 0, errors: [], skipped: true });
  });

  test('sendToTarget sends and returns sent/errors/skipped:false on a successful run', () => {
    const { service, gmail } = wire();
    const result = service.sendToTarget('CDC_OTTOBRE', { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['rossi@school.it'], classiCompetenza: ['5A'] });
    expect(result.skipped).toBe(false);
    expect(result.sent).toBe(1);
    expect(result.errors).toEqual([]);
    expect(gmail.sent).toHaveLength(1);
  });

  test('getConfigurazione throws via the confMail defensive re-check', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, { confMail: { findById: () => null } as unknown as ConfigurazioneEmailRepository })
    );
    expect(() => service.getConfigurazione('CDC_OTTOBRE')).toThrow(PipelineError);
  });

  test('static create wires an optional monitor, and buildPipeline reports per-step telemetry when a jobId is given', () => {
    const tables = fixtureTables();
    const db = new FakeDatabase(tables);
    const gmail = new FakeGmailFacade();
    const monitor = new FakeProcessMonitor();
    const service = EmailNotificationService.create(db, gmail, new FakeTemplateEngine(), NOW, new FakeDriveFacade(), undefined, monitor);
    service.sendToTarget(
      'CDC_OTTOBRE',
      { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['rossi@school.it'], classiCompetenza: ['5A'] },
      'job-1'
    );
    expect(monitor.steps.length).toBeGreaterThan(0);
    expect(monitor.steps.some((s) => s.stepName === 'BuildCDU' && s.event === 'start')).toBe(true);
    expect(monitor.steps.some((s) => s.stepName === 'BuildCDU' && s.event === 'complete')).toBe(true);
  });

  test('PER_ALUNNO falls back to "" target/email when the alunno has no id', () => {
    const { db, gmail } = wire();
    const alunniStub = { findAttivi: () => [Alunno.fromData({ ATTIVO: true })] } as unknown as AlunnoRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { alunni: alunniStub }));
    const targets = service.enumerateTargets(conf('PER_ALUNNO'));
    expect(targets).toEqual([{ tipo: 'alunno', tipoTarget: 'alunno', target: '', emails: [''], classiCompetenza: [] }]);
  });

  test('targetsPerCoordinatore skips a coordinatore with no id and falls back to "" for a classe with no id', () => {
    const { db, gmail } = wire();
    const classeNoId = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    const classiStub = {
      findAttive: () => [classeNoId],
      getArticolazione: () => null,
      isArticolata: () => false,
      getCoordinatori: () => [Docente.fromData({}), Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' })]
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
      getAllDocentiCDC: () => [Docente.fromData({}), Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' })]
    } as unknown as ClasseRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { classi: classiStub }));
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
      getAllDocentiCDC: () => [Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' })]
    } as unknown as ClasseRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { classi: classiStub }));
    const targets = service.enumerateTargets(conf('PER_CDC'));
    expect(targets).toEqual([{ tipo: 'cdc', tipoTarget: 'classe', target: '', emails: ['rossi@school.it'], classiCompetenza: [''] }]);
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
        if (id === 'withtutor@x.it') return Alunno.fromData({ EMAIL: 'withtutor@x.it', ATTIVO: true, TUTOR_1: 't@x.it' });
        if (id === 'withid-notutor@x.it') return Alunno.fromData({ EMAIL: 'withid-notutor@x.it', ATTIVO: true });
        return null;
      }
    } as unknown as AlunnoRepository;
    const service = new EmailNotificationService(fullDeps(db, gmail, { carenze: carenzeStub, alunni: alunniStub }));
    const targets = service.enumerateTargets(conf('PER_CARENZA'));
    expect(targets).toHaveLength(3);
    const noId = targets.find((t) => t.target === 'noid@x.it')!;
    expect(noId.emails).toEqual(['']);
    const withTutor = targets.find((t) => t.target === 'withtutor@x.it')!;
    expect(withTutor.emails).toEqual(['t@x.it']);
    const withIdNoTutor = targets.find((t) => t.target === 'withid-notutor@x.it')!;
    expect(withIdNoTutor.emails).toEqual(['withid-notutor@x.it']);
  });

  test('sendToTarget falls back to 0 sent / no errors on the success path when the build fails before shouldSend is set', () => {
    const { db, gmail } = wire();
    const service = new EmailNotificationService(
      fullDeps(db, gmail, {
        contextBuilder: { build: () => { throw new Error('boom'); } } as unknown as ContextBuilder
      })
    );
    const result = service.sendToTarget('CDC_OTTOBRE', { tipo: 'cdc', tipoTarget: 'classe', target: '5A', emails: ['rossi@school.it'], classiCompetenza: ['5A'] });
    expect(result.skipped).toBe(false);
    expect(result.sent).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
