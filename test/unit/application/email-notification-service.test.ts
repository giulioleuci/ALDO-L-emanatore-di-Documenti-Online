import { EmailNotificationService } from '../../../src/application/services/EmailNotificationService';
import { ConfigurazioneEmail } from '../../../src/domain/entities/ConfigurazioneEmail';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../../../test/fakes/FakeGmailFacade';
import type { Row } from '../../../src/infrastructure/db/Database';

const NOW = new Date('2026-07-01T09:00:00Z'); // outside every supplenza window

function wire(extraConfMail: Row[] = []) {
  const tables = fixtureTables();
  tables['CONF_MAIL'] = [...tables['CONF_MAIL']!, ...extraConfMail];
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const service = EmailNotificationService.create(db, gmail, new FakeTemplateEngine(), NOW);
  return { db, gmail, service };
}

function conf(processo: string, overrides: Record<string, unknown> = {}): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    ID: 'X', OGGETTO: 'S', PROCESSO: processo, BOX_CFG: null, TESTO: '', SUPPLENTI: 'SOLO_TITOLARI',
    NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: null, POST_PROCESSO: null, ...overrides
  });
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
