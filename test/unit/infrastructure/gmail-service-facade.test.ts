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

test('GmailServiceFacade.searchBounceMessages queries mailer-daemon, keeps only NDR senders and maps plainBody to body', () => {
  const msg = (id: string, from: string) => ({
    id,
    threadId: 't',
    subject: 's',
    from,
    date: new Date(0),
    plainBody: 'b'
  });
  const searchMessages = jest.fn(() => [
    msg('m', 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>'),
    msg('orig', 'Segreteria <segreteria@scuola.it>')
  ]);
  const facade = new GmailServiceFacade({ searchMessages } as unknown as MailService);
  expect(facade.searchBounceMessages(1.2)).toEqual([
    { id: 'm', date: new Date(0), subject: 's', body: 'b' }
  ]);
  expect(searchMessages).toHaveBeenCalledWith('from:mailer-daemon newer_than:2d', 100);
});
