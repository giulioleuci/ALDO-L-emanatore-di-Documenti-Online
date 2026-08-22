import { GmailServiceFacade } from '../../../src/infrastructure/facades/GmailServiceFacade';

class FakeMailService {
  public lastOpts: unknown;
  send(opts: unknown) {
    this.lastOpts = opts;
    return { success: true };
  }
}

test('GmailServiceFacade.sendEmail forwards cc to the underlying MailService', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({
    to: ['a@x.it'],
    cc: ['coord@x.it'],
    subject: 'S',
    htmlBody: '<p>B</p>'
  });
  expect((mail.lastOpts as { cc?: string[] }).cc).toEqual(['coord@x.it']);
});

test('GmailServiceFacade.sendEmail omits cc when not provided', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '<p>B</p>' });
  expect((mail.lastOpts as { cc?: string[] }).cc).toBeUndefined();
});

test('GmailServiceFacade.sendEmail forwards replyTo to the underlying MailService', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({
    to: ['a@x.it'],
    replyTo: 'coord@x.it',
    subject: 'S',
    htmlBody: '<p>B</p>'
  });
  expect((mail.lastOpts as { replyTo?: string }).replyTo).toBe('coord@x.it');
});

test('GmailServiceFacade.sendEmail omits replyTo when not provided', () => {
  const mail = new FakeMailService();
  const facade = new GmailServiceFacade(mail as unknown as MailService);
  facade.sendEmail({ to: ['a@x.it'], subject: 'S', htmlBody: '<p>B</p>' });
  expect((mail.lastOpts as { replyTo?: string }).replyTo).toBeUndefined();
});
