import { EmailNotificationService } from '../../src/application/services/EmailNotificationService';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { fixtureTables } from '../fixtures/tables';
import { FakeTemplateEngine } from '../fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../fakes/FakeGmailFacade';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';

const NOW = new Date('2025-11-15T09:00:00Z'); // inside the rossi→bianchi supplenza window

function wire() {
  const db = new FakeDatabase(fixtureTables());
  const gmail = new FakeGmailFacade();
  const service = EmailNotificationService.create(db, gmail, new FakeTemplateEngine(), NOW, new FakeDriveFacade());
  return { db, gmail, service };
}

test('PER_CARENZA end-to-end: boxes, genitori TO, BCC, LOG_MAIL, NOTIFICATO stamp, dedup on rerun (ref 11)', () => {
  const { db, gmail, service } = wire();

  const first = service.sendPattern('CARENZE_NOTIFICA');
  expect(first).toMatchObject({ targets: 2, sent: 2, skipped: 0, errors: [] });

  // a1's email: family TO, supervisore BCC, resolved subject, rendered boxes.
  const perA1 = gmail.sent.find((s) => s.to.includes('genitore1@x.it'))!;
  expect(perA1.subject).toBe('Carenze di VERDI ANNA');
  expect(perA1.bcc).toEqual(['super@school.it']);
  expect(perA1.noReply).toBe(true);
  const html = perA1.htmlBody;
  expect(html).toContain('Gentili Genitori');
  expect(html).toContain('per la classe 5A.'); // TESTO resolved on focus.carenza.classe
  expect(html).toContain('border-left:4px solid #c0392b'); // MATE colour from MATERIE
  expect(html).toContain('📐 Matematica');
  expect(html).toContain('Voto 4.5');
  expect(html).toContain('🔭 Fisica'); // free-text carenza cell
  expect(html).toContain('assenze'); // assenze box (ASSENZE=true on a1 prog 1)
  expect(html).toContain('non sarà monitorata'); // NOREPLY footer

  // a2's email goes to both tutors in one message.
  const perA2 = gmail.sent.find((s) => s.to.includes('genitore2@x.it'))!;
  expect(perA2.to.sort()).toEqual(['genitore2@x.it', 'genitore3@x.it']);

  // Audit: one LOG_MAIL SUCCESS row per send.
  const logRows = db.tables['LOG_MAIL']!.getAllRows();
  expect(logRows).toHaveLength(2);
  expect(logRows.every((r) => r['STATO'] === 'SUCCESS')).toBe(true);

  // POST_PROCESSO stamped both carenze → rerun enumerates nothing (11 §10).
  const second = service.sendPattern('CARENZE_NOTIFICA');
  expect(second.targets).toBe(0);
  expect(gmail.sent).toHaveLength(2);
});

test('PER_CDC end-to-end: one multi-TO email per entry class, articulated parent aggregated (ref 11 §12, 05 §5)', () => {
  const { db, gmail, service } = wire();
  const result = service.sendPattern('CDC_OTTOBRE');
  expect(result).toMatchObject({ targets: 2, sent: 2, errors: [] });

  const per5A = gmail.sent.find((s) => s.subject.includes('5A'))!;
  expect(per5A.to.sort()).toEqual(['bianchi@school.it', 'rossi@school.it']);
  expect(per5A.htmlBody).toContain('Gentili Docenti');
  expect(per5A.htmlBody).toContain('Gentili colleghi'); // TESTO
  const per1F = gmail.sent.find((s) => s.subject.includes('1F'))!;
  expect(per1F.to.sort()).toEqual(['bianchi@school.it', 'rossi@school.it', 'verdi@school.it']);

  expect(db.tables['LOG_MAIL']!.getAllRows()).toHaveLength(2);
});

test('send failure ⇒ LOG_MAIL ERROR, post-process skipped, batch continues (ref 11 §8-§10)', () => {
  const { db, gmail, service } = wire();
  gmail.failFor.add('genitore1@x.it');
  const result = service.sendPattern('CARENZE_NOTIFICA');
  expect(result.sent).toBe(1);
  expect(result.errors).toHaveLength(1);

  const states = db.tables['LOG_MAIL']!.getAllRows().map((r) => r['STATO']).sort();
  expect(states).toEqual(['ERROR', 'SUCCESS']);
  // a1's carenza still non-notified; a2's stamped.
  const carenze = db.tables['CARENZE']!.getAllRows();
  expect(carenze.find((r) => r['STUDENTE'] === 'a1@school.it' && r['PROGRESSIVO'] === 1)!['NOTIFICATO']).toBe('');
  expect(String(carenze.find((r) => r['STUDENTE'] === 'a2@school.it')!['NOTIFICATO'])).toBe(NOW.toISOString());
});
